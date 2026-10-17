import { existsSync } from 'node:fs'
import { isAbsolute, join, sep } from 'node:path'
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
 * {@link EXTERNALIZED_PHRASE} that cannot be **attributed** is an **error**,
 * never a pass-through. Loud and wrong beats silent and blind.
 *
 * **Attributable, not merely extractable — and the gap between those two words
 * was a live fail-open for the length of a review round.** The first version of
 * this paragraph said *"cannot be extracted"*, and the code matched the
 * paragraph: it threw when the regex missed, and forwarded otherwise. But a
 * reword can keep the clause and change the *path form* inside it, and an
 * importer that is read successfully and then cannot be placed is not a
 * dependency — it is an unknown, and it went down the dependency branch.
 * Measured: a first-party importer spelled relative to the project root threw
 * nothing and forwarded silently, where the absolute spelling of the same file
 * threw. **Extraction and attribution are two steps; only the first one used to
 * fail closed.** {@link Attribution} is the repair and its tri-state is the
 * point — see its docblock for why the undecided case cannot be folded into
 * either neighbour.
 *
 * **That repair then left the same error one branch over, and the second pass
 * is the one worth reading.** Naming the undecided case is not enough if a
 * branch can still *reach* `theirs` without evidence: `/@fs/…` — vite's own
 * spelling for a real file — is absolute, fails containment, and was forwarded
 * silently, which is a first-party source file going quiet through the branch
 * that had just been declared safe. The durable rule came out of fixing it and
 * is stated at {@link Attribution}: **`theirs` is the only answer that
 * forwards, so it is the only one that needs positive evidence.**
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
 * Whose file the importer is — **three answers, because the question has
 * three.**
 *
 * This returns a tri-state rather than a boolean, and that is the whole repair
 * rather than a stylistic preference. The predicate it replaced was
 * `isFirstParty(): boolean`, and a boolean has nowhere to put *"I cannot
 * tell"* — so `false` carried both *"this is a dependency, forward it"* and
 * *"I could not place this path"*, and the handler acted on the first reading
 * for both. **Measured: an importer spelled relative to the project root — the
 * one reword a path-carrying field is most likely to receive — went down the
 * forward-silently branch, which is the fail-open direction this entire file
 * exists to close.** A boolean cannot be made safe here by reordering its
 * tests; the third answer has to exist for the caller to be forced to handle
 * it.
 */
export type Attribution = 'ours' | 'theirs' | 'unplaceable'

/**
 * **`node_modules` is tested first, and the order is load-bearing.** It is the
 * only one of these tests that reads the same on every path form: a dependency
 * is `…/node_modules/@napi-rs/canvas/geometry.js` absolute and
 * `node_modules/@napi-rs/canvas/geometry.js` relative, and the component scan
 * answers `theirs` for both. So the reword that breaks placement **does not**
 * also convert every dependency's warning into a build failure.
 * `@napi-rs/canvas` is a direct dependency that emits this exact warning today
 * (header hazard 2), so that is not a hypothetical: a guard that failed closed
 * on everything it could not place *after* losing the ability to place
 * anything would redden the build on somebody else's `util` import.
 *
 * **Then absoluteness, because containment is only a decision procedure over
 * absolute paths.** `startsWith(join(root, dir) + sep)` asks *"does this path
 * begin at this directory"*, which is answerable for an absolute path and
 * meaningless for a relative one — a relative path's base is not in the
 * string. For a relative path there is no deduction in either direction, and
 * **the two mistakes are not symmetric** — guessing `ours` costs a false build
 * failure that someone sees and fixes within the minute, and guessing `theirs`
 * costs silence, which is the failure this project keeps finding a phase
 * later. So the undecided case is named, not folded into the cheaper-looking
 * neighbour.
 *
 * Containment rather than a substring test throughout, so that a dependency
 * with a `src/` directory of its own — most of them have one — cannot be read
 * as first-party.
 *
 * **And then the filesystem, because `theirs` is the only answer that forwards
 * and is therefore the only one that needs evidence.** That is the rule the
 * whole function is arranged around, and it is worth more than any individual
 * test here: **`ours` and `unplaceable` both throw, so being wrong about
 * either is loud and gets fixed the same afternoon. `theirs` goes quiet. A
 * branch that goes quiet must carry positive evidence for doing so, and the
 * other two need none.**
 *
 * The first version of this function did not, and the gap it left is the
 * *identical* reasoning error it was written to remove, one branch over:
 * `isAbsolute('/@fs/home/me/proj/site/main.ts')` is **true**, containment is
 * **false**, and it concluded `theirs` — **with no evidence that it was
 * theirs.** `/@fs/` + an absolute path is vite's own spelling for a real file,
 * so that was a first-party source file, spelled by vite, forwarded silently.
 * `/virtual:…` and any id a future vite invents read the same way.
 *
 * **The cure is not a list of virtual-id prefixes.** Enumerating `/@fs/`,
 * `/virtual:` and `\0` is the enumeration-complete repair this project has
 * recorded three times, each one defeated by one more form someone had not
 * thought of. The real question is *"is this string a file I can find"*, and
 * the filesystem answers it without an enumeration: **a genuine importer is a
 * file vite has just resolved and read, and no virtual id of any convention
 * exists on disk.** So the existence check is derived from the thing itself
 * rather than from anybody's list, and a vite that invents a new id syntax
 * tomorrow fails closed for free.
 *
 * It is asked **last**, and only on the branch that would forward, which keeps
 * it off the two paths where it would cost a wrong answer: a first-party file
 * carrying one of vite's query suffixes (`…/site/a.ts?worker`) is placed by
 * containment before anyone asks the disk whether that exact string exists.
 */
function attribute(root: string, importer: string): Attribution {
  if (importer.split(sep).includes('node_modules')) return 'theirs'
  if (!isAbsolute(importer)) return 'unplaceable'
  if (GUARDED_DIRS.some(dir => importer.startsWith(join(root, dir) + sep))) return 'ours'
  return existsSync(importer) ? 'theirs' : 'unplaceable'
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

    // CONDITION A, first half — fail closed on what cannot be READ. The shape
    // is here, so this IS an externalized module; we simply cannot say whose.
    // Passing it through would be a guard that has gone quiet, which reads
    // exactly like a clean build. The second half, below, is what cannot be
    // PLACED — the two are separate steps and both of them fail closed.
    if (!specifier || !importer) {
      throw new Error(
        `externalizedImportGuard: a module was externalized for browser compatibility, but the ` +
        `${!specifier ? 'module name' : 'importer'} could not be read out of vite's message — so ` +
        `this guard cannot tell whether it came from our source or from a dependency, and it ` +
        `refuses to guess. Vite's wording has probably changed; see site/buildguard.ts and the ` +
        `exact vite pin in package.json. The message was:\n${message}`,
      )
    }

    const whose = attribute(root, importer)

    // CONDITION A, second half — fail closed. We read the importer and still
    // cannot say whose file it is, which is a different failure from not
    // reading it and used to be silently indistinguishable from "a
    // dependency's". The route named below is the cheap one on purpose: the
    // satisfying action has to be teaching the guard the new spelling, because
    // the lazier alternative — widening the forward branch — is precisely the
    // hole this replaced.
    if (whose === 'unplaceable') {
      throw new Error(
        `externalizedImportGuard: vite says "${specifier}" was externalized for browser ` +
        `compatibility, imported by ${importer} — but that importer could not be placed inside ` +
        `or outside this project. It is either not an absolute path, in which case it carries no ` +
        `base to resolve it against, or it is absolute and names nothing on disk, which is what a ` +
        `virtual module id looks like. The guard cannot tell our source from a dependency here, ` +
        `and it refuses to guess: guessing "dependency" is silence, which is how every blind ` +
        `instrument on this project read. Vite has probably changed how it spells the importer. ` +
        `The fix is to make attribute() in site/buildguard.ts RESOLVE the new spelling to a real ` +
        `path — do NOT add the prefix to the forwarding branch and do NOT special-case it: a ` +
        `carve-out here is the exact defect this function was rewritten to remove. See the exact ` +
        `vite pin in package.json. The message was:\n${message}`,
      )
    }

    // A dependency's own node import. Real, measured, and not a regression —
    // hazard 2. Through the default handler, never swallowed.
    if (whose === 'theirs') {
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
