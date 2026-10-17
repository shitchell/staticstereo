import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import type { LoggingFunction, RollupLog } from 'rollup'

/**
 * The `build.rollupOptions.onwarn` guard both site builds install.
 *
 * ## The hole this closes, and why nothing that reads the output could
 *
 * A static `import os from 'node:os'` in `site/` or `src/` builds **clean**.
 * Vite replaces the module with `export default {}` and *inlines* it, so the
 * finished bundle contains no `node:os`, no `__vite-browser-external` stub
 * chunk, and no specifier of any kind — measured, both entries, exit 0 with the
 * value live in `dist-site/assets/index-*.js`. `site/dist.test.ts` says so
 * itself at length: an AST reader and a text grep are blind in exactly the same
 * place, because there is nothing left in the artifact to read. The runtime
 * consequence is worse than a crash — the import does not throw, the code gets
 * an empty object and carries on.
 *
 * `onwarn` sees it because **it fires at resolve time, strictly before the
 * inlining that erases the evidence**. The hole and the cure sit on opposite
 * sides of the same step. That is the entire reason this lives in the build
 * config and not in a test over `dist-site/`.
 *
 * ## Three measured hazards, each of which the obvious implementation walks into
 *
 * **1. Forwarding to `defaultHandler` is not politeness, it is the difference
 * between a fix and a net regression.** Vite's own code is
 *
 * ```js
 * const userOnWarn = config.build.rollupOptions?.onwarn
 * if (userOnWarn) { userOnWarn(warning, viteWarn) } else { viteWarn(warning) }
 * ```
 *
 * and **vite's warning filtering *and* its `UNRESOLVED_IMPORT` → throw both
 * live inside `viteWarn`** — the handler passed in here as `defaultHandler`. A
 * handler written the way anyone writes one first, `if (matches) throw; return`,
 * never calls it and silently deletes an existing build failure. Measured with
 * a nonexistent bare package planted in `site/main.ts`:
 *
 * | handler                      | `build:page` | result                                   |
 * |------------------------------|--------------|------------------------------------------|
 * | forwards to `defaultHandler` | **1**        | missing dependency caught (status quo)   |
 * | swallows                     | **0**        | nonexistent package shipped as an import |
 *
 * So the cheapest wrong action here is not deleting the guard — it is writing
 * the guard the way one would write it first. Every path out of this function
 * that is not a throw must call `defaultHandler`.
 *
 * **2. `node_modules` really does emit this warning, and it is not a
 * regression.** `@napi-rs/canvas` — already a direct dependency — warns for
 * `util` through `node_modules/@napi-rs/canvas/geometry.js` and builds to exit 0
 * with full output. The warning is identical in code, plugin and shape to a real
 * offender's; the *importer* is the only thing that distinguishes them, which is
 * why the scope below is keyed on the importer and on nothing else.
 *
 * **3. The specifiers are bare.** Those same `node_modules` warnings name `os`,
 * `path`, `util`, `fs`, `stream`, `url`, `https`, `http`, `child_process` —
 * **with no `node:` prefix** — and a first-party `import fs from 'fs'` is spelled
 * the same way. Anyone scoping this from the phrase "node: builtin" writes a
 * matcher that misses every one of them.
 *
 * This function therefore **does not look at the specifier at all.** There is no
 * builtin list here and no `node:` test, so there is no spelling for the check to
 * miss and no list to fall out of date: *any* module vite externalizes for
 * browser compatibility is wrong when a file we wrote is what imported it. That
 * is strictly what `build:site` means. The specifier is read only so the error
 * message can name it.
 *
 * ## Attribution is prose, which is the fragile part, and it fails closed
 *
 * For this warning `code` is `PLUGIN_WARNING` and `plugin` is `vite:resolve`,
 * and the structured fields that would carry the importer — `id`, `ids`,
 * `importer`, `exporter`, `loc`, `frame` — are **all `undefined`**. The importer
 * exists only as an absolute path inside the English sentence, so extracting it
 * with a regex is not laziness, it is the only channel there is.
 *
 * The failure mode that matters is therefore **not** a false positive. It is the
 * matcher quietly ceasing to match after a vite upgrade reworded the sentence —
 * and a guard that has gone quiet is indistinguishable from a clean build, which
 * is this project's defining defect. So: a warning carrying
 * {@link EXTERNALIZED_PHRASE} whose specifier or importer cannot be extracted is
 * an **error**, never a pass-through. Loud and wrong beats silent and blind.
 *
 * Two further things stand behind that, because fail-closed only helps if the
 * phrase still matches at all:
 *
 * - `package.json` pins vite **exactly**, with the reason on the line above it.
 *   The contract this file depends on is the prose of a dependency's warning
 *   message; a caret range lets that contract change under us on an unrelated
 *   install.
 * - `site/buildguard.test.ts` plants a real import into a real copy of this
 *   tree and runs a **real `vite build`**, asserting exit 1. A unit test against
 *   a hand-written warning object cannot do that job: it would agree with
 *   whatever we *believed* vite emits, which is the "two hand-written lists
 *   cross-checked against each other" defect already recorded on this phase.
 */

/**
 * The one sentence this whole guard is a contract with.
 *
 * Deliberately the **only** thing tested to recognise the warning — not
 * `code === 'PLUGIN_WARNING'` and not `plugin === 'vite:resolve'`, both of which
 * are also true today. Three conditions are three independent things that can
 * rot, and any one of them going stale produces silence rather than noise.
 * Keyed on one, that one is pinned by the exact vite version and exercised by a
 * real build in `site/buildguard.test.ts`.
 */
export const EXTERNALIZED_PHRASE = 'has been externalized for browser compatibility'

/** Reads the module name out of the sentence. Fails closed; see the header. */
const SPECIFIER = /Module "([^"]+)" has been externalized/

/** Reads the importer's absolute path out of the sentence. Fails closed. */
const IMPORTER = /imported by "([^"]+)"/

/**
 * The directories whose contents are *ours*. Hazard 2 in the header is the whole
 * reason this is a scope and not a blanket rule: a dependency importing `util`
 * is that dependency's business and builds fine, while the identical warning
 * from `site/main.ts` is a module that silently becomes `{}` in a browser.
 */
export const GUARDED_DIRS: readonly string[] = ['site', 'src']

/**
 * True when `importer` is a file in one of {@link GUARDED_DIRS} under `root`.
 *
 * Absolute containment rather than a substring test, so that a dependency that
 * happens to have a `src/` directory of its own — most of them do — cannot be
 * read as first-party. The explicit `node_modules` rejection is belt to that
 * brace: it is unreachable through the containment test today and is here so
 * that it stays unreachable if the containment test is ever loosened.
 */
function isFirstParty(root: string, importer: string): boolean {
  if (importer.split(sep).includes('node_modules')) return false
  return GUARDED_DIRS.some(dir => importer.startsWith(join(root, dir) + sep))
}

/**
 * Build the handler. `root` is the project root — the directory that contains
 * `site/` and `src/` — and each config passes its own location.
 *
 * @param root absolute path to the project root.
 */
export function externalizedImportGuard(
  root: string,
): (warning: RollupLog, defaultHandler: LoggingFunction) => void {
  return (warning, defaultHandler) => {
    const message = typeof warning.message === 'string' ? warning.message : ''

    // Not our warning. Hazard 1: this MUST reach vite's own handler, which is
    // where its filtering and its UNRESOLVED_IMPORT throw live.
    if (!message.includes(EXTERNALIZED_PHRASE)) {
      defaultHandler(warning)
      return
    }

    // A wrong `root` would make every importer look third-party and this guard
    // would pass everything through forever while reporting nothing — the exact
    // silent-blindness this file exists to prevent. Checked here, where the
    // scoping decision is actually made, rather than at construction time.
    const missing = GUARDED_DIRS.filter(dir => !existsSync(join(root, dir)))
    if (missing.length > 0) {
      throw new Error(
        `externalizedImportGuard: root ${root} contains no ${missing.join(' or ')} directory, so ` +
        `the importer scope is wrong and this guard would silently pass every warning through. ` +
        `Pass the project root — the directory holding site/ and src/ — from the vite config.`,
      )
    }

    const specifier = SPECIFIER.exec(message)?.[1]
    const importer = IMPORTER.exec(message)?.[1]

    // CONDITION A — fail closed. The shape is here, so this IS an externalized
    // module; we simply cannot say whose. Passing it through would be a guard
    // that has gone quiet, which reads exactly like a clean build.
    if (!specifier || !importer) {
      throw new Error(
        `externalizedImportGuard: a module was externalized for browser compatibility, but the ` +
        `${!specifier ? 'module name' : 'importer'} could not be read out of vite's message — so ` +
        `this guard cannot tell whether it came from our source or from a dependency, and it ` +
        `refuses to guess. Vite's wording has probably changed; see site/buildguard.ts and the ` +
        `exact vite pin in package.json. The message was:\n${message}`,
      )
    }

    // A dependency's own node import. Real, measured, and not a regression —
    // hazard 2. Through the default handler, never swallowed.
    if (!isFirstParty(root, importer)) {
      defaultHandler(warning)
      return
    }

    throw new Error(
      `externalizedImportGuard: ${importer} imports "${specifier}", which vite externalized for ` +
      `browser compatibility. In a browser that module is replaced by an empty object and the ` +
      `import does NOT throw — the code receives {} and carries on, so this is a silent runtime ` +
      `defect and not a crash. Nothing that reads dist-site/ can catch it either: vite inlines ` +
      `the empty module, leaving no specifier and no stub chunk in the output. Use a browser-safe ` +
      `API, or move the code into src/node/ where it belongs.`,
    )
  }
}
