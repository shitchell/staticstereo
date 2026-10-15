/**
 * `src/shared/` must run unchanged in Node and in the browser.
 *
 * # The rule, stated before it is code
 *
 * `shared` is the one package with two runtimes. `core` is framework-free and
 * platform-free; `node/`, `web/`, `cli/` and `site/` each own exactly one
 * platform; `shared` is reached from both sides — design §3.1 puts the `.stst`
 * container, `perception.ts` and layer-id generation here precisely because
 * the CLI and the page both need them (R18, R22). A module here that only
 * works in one of the two runtimes is broken in the other and nothing else in
 * this repository notices, because each consumer only ever exercises its own
 * half.
 *
 * ## Which directions are allowed, and why
 *
 * - **`shared` → `shared`** — allowed. Its own files.
 * - **`shared` → `core`** — **allowed, and this is the asymmetry that matters.**
 *   `core` is the pure base: it reaches the platform only through the injected
 *   `CanvasLike`, so anything `shared` pulls from it is safe in both runtimes.
 *   The *opposite* direction is banned, and is already enforced elsewhere:
 *   `src/core/purity.test.ts`'s "does not reach outside core even by relative
 *   path" turns red on a `../shared/` specifier in `core`. A guard copied
 *   verbatim from that file would ban `../core/` here, which would be the same
 *   rule pointed the wrong way round.
 * - **`shared` → `node` / `web` / `cli` / `site`** — banned. Each is one
 *   platform; importing one here picks a runtime for a module that may not.
 * - **`shared` → a Node builtin** — banned, in both spellings. `src/shared/ids.ts`
 *   records the reasoning in its own docblock: it uses the Web Crypto global
 *   rather than `node:crypto` because `node:crypto` "would not survive the site
 *   bundle". That judgement should not have to be re-made by hand per module.
 * - **`shared` → a third-party package** — allowed only when the package is
 *   declared in this repo's `package.json` **`dependencies`** (a `devDependency`
 *   is not installed for a consumer of the published `dist`, and `vitest` is
 *   exactly the leak `src/core/purity.test.ts` was written after) **and** the
 *   installed package's own entry module reaches no Node builtin.
 *
 * ## Both `src/shared/` and `dist/shared/`, not just the emitted half
 *
 * `src/core/purity.test.ts` parses `dist/core`, because `files: ["dist"]` is
 * what ships. That is necessary here too — `src/cli/`, `src/node/` and
 * `src/web/` consume `dist/shared` — but it is **not sufficient**, for two
 * reasons. The first is that `tsc` *elides* an unused or type-only import,
 * so the source can name a dependency that never appears in `dist/` and both
 * `build` and `typecheck` exit 0. Measured on this tree while planting the
 * controls below: `import { createCanvas } from '@napi-rs/canvas'` in
 * `src/shared/pixels.ts` leaves `dist/shared/pixels.js` byte-identical. And
 * `site/` does not consume `dist/` at all — `site/fonts.ts:1` and
 * `site/legibility.ts:23` import `../src/shared/*.js`, i.e. the Vite bundle is
 * built from **these sources**. So the source walk is the one that covers the
 * browser, and the `dist` walk is the one that covers the published package.
 * Both run.
 *
 * The second reason is the one that made the first half of this file blind for
 * its whole life, and it is plan §7's amended P1 criterion 8. **A source walk
 * whose roster is derived from `dist/` is still a `dist/` walk.** Until
 * 2026-10-15 `guardedSources()` enumerated `dist/shared/*.js` and paired each
 * back to `src/shared/*.ts`, so a module that had never been compiled appeared
 * in neither instrument. Measured here, same file and same import, varying
 * only whether the build had run:
 *
 * ```
 * src/shared/zzzLeak.ts = import { readFileSync } from 'node:fs'
 *   src only, no dist/shared/zzzLeak.js   -> 13 passed (13)        [blind]
 *   after npm run build                   -> 2 failed | 11 passed  [sighted]
 * src/shared/zzzLeak.ts = export const leak = (): string => document.title
 *   src only, no dist/shared/zzzLeak.js   -> 13 passed (13)        [blind]
 *   after npm run build                   -> 1 failed | 12 passed  [sighted]
 * ```
 *
 * That is the class of file the rest of P1 and all of P5 add, and it is the
 * class most likely to carry a leak, being the one nobody has built yet. The
 * roster now comes from TypeScript's own answer to "what does this tsconfig
 * compile", which is upstream of the build rather than downstream of it.
 *
 * **And the site build is not the sensor you would hope.** `src/shared/pixels.ts`
 * is in the site's module graph — planting `import '../node/canvas.js'` there
 * does fail `npm run build:site`, exit 1, on a `.node` binary. But planting
 * `import 'node:fs'` in the same file leaves `build:site` at **exit 0**: Vite
 * prints "Module \"node:fs\" has been externalized for browser compatibility"
 * and builds a bundle that will throw in a browser. A warning on stdout with a
 * zero exit is the fail-open shape, so the build cannot stand in for this.
 *
 * ## What this file does not deliver
 *
 * **An import-parser guard cannot see platform APIs reached through globals**,
 * and `tsconfig.json`'s `"lib": ["ES2022","DOM"]` hides them from the compiler
 * too: `src/shared/ids.ts:59` calls `crypto.getRandomValues` today, and the
 * absence claim for DOM-only globals holds **because `crypto` is universal**,
 * not because the instrument looked and found nothing. That is why the second
 * half of this file exists — `ambient globals` below is a *different*
 * instrument, a checker-resolved identifier walk, and it is what makes the
 * absence claim measured rather than lucky. It has its own limits, stated at
 * its own docblock. Criterion 8 is not a claim that browser-reachability is
 * proven.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ts from 'typescript'
import { importSpecifiers } from '../core/testing/imports.js'

/** Anchored to this file, not to cwd, so the test is invocation-independent. */
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')
const SRC = join(ROOT, 'src')
const DIST = join(ROOT, 'dist')
const SRC_SHARED = join(SRC, 'shared')
const DIST_SHARED = join(DIST, 'shared')

/*
 * `filesUnder` and `kindOf` are copied from `src/core/purity.test.ts` rather
 * than shared with it. Importing a `.test.ts` registers that file's
 * `describe`s into the importing suite — measured there, 14 tests reported
 * where 6 were written — and lifting two four-line helpers into
 * `src/core/testing/` to avoid a copy would be a larger change to a file this
 * task is forbidden to touch. `site/transport.test.ts` makes the same call for
 * the same reason. `importSpecifiers` itself is *not* copied: it already lives
 * in a non-test module for exactly this reason, and a second copy of a parser
 * is a second thing to keep correct.
 */
function filesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...filesUnder(path))
    else out.push(path)
  }
  return out
}

const kindOf = (path: string): ts.ScriptKind =>
  path.endsWith('.d.ts') || path.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS

/* ===================================================================== */
/*  the rule, as a pure classifier                                        */
/* ===================================================================== */

/** `{ ok: true }`, or the sentence a failure should print. */
type Verdict = { readonly ok: true } | { readonly ok: false; readonly why: string }
const OK: Verdict = { ok: true }

/**
 * Node's builtins, from Node's own roster rather than a list typed here.
 *
 * §9: "a hand-written list of 'the places that do X' is a check" — it goes
 * stale the day the set grows. `builtinModules` grows with the runtime.
 * Both spellings must be tested: the array holds `fs`, not `node:fs`.
 */
const BUILTINS: ReadonlySet<string> = new Set(builtinModules)

const isNodeBuiltin = (spec: string): boolean =>
  spec.startsWith('node:') || BUILTINS.has(spec.split('/')[0] ?? spec)

/** `@scope/name/deep/path` → `@scope/name`; `name/deep` → `name`. */
function packageOf(spec: string): string {
  const parts = spec.split('/')
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? spec)
}

/**
 * Everything the bare-specifier rule needs from the filesystem, injected so
 * the classifier can be controlled on pure inputs (§6.5a) rather than only
 * against whatever happens to be installed.
 */
interface Installation {
  /** `package.json` `dependencies` — *not* `devDependencies`. */
  readonly runtimeDeps: ReadonlySet<string>
  /**
   * Node builtins reached by the package's own entry module, or `null` when
   * the package is not installed and the question cannot be answered.
   */
  reachedBuiltins(pkg: string): readonly string[] | null
}

/**
 * Is a non-relative specifier allowed in a module that must run in a browser?
 *
 * **Deriving this rather than listing it was the hard part**, and §9 rules out
 * both easy answers. Typing `['omggif', 'gifenc']` is "a hand-written list of
 * the places that do X" — it goes stale in silence the day a third package is
 * added, and it would have gone stale *during this phase*. Deriving the
 * allow-set from the specifiers actually present in `src/shared/` is "a guard
 * derived from the roster it guards": it proves only that the derivation ran
 * twice, and it would permit `node:fs` the moment someone imported it.
 *
 * The third option is to ask an authority that is neither of those two: the
 * package's **own installed entry module**, parsed with the same parser one
 * level further out. A package whose entry reaches `os` and `path` cannot be
 * bundled for a browser, whoever wrote the import. Measured here, with no
 * names typed into this file: `@napi-rs/canvas` → `['os','path']`, rejected
 * even though it is a declared `dependency`; `omggif`, `gifenc` and `yaml` →
 * `[]`, accepted.
 *
 * **What goes stale, and when.** The probe reads the entry module only; it is
 * not transitive. A pure-JS package that reaches `node:fs` two files deep, or
 * through a lazy `require` inside a function in a *different* file, passes
 * here. `@napi-rs/canvas` — the one Node-only dependency this repo has — fails
 * at depth zero, so the rule is exact for today's tree and approximate in
 * general. Closing it properly means resolving the package's whole module
 * graph, which is a bundler; the honest statement is that this catches the
 * shape of Node-only package that exists here and not every possible one.
 * A package that is pure JS and still browser-hostile (one that reads
 * `process.env` off the global, say) is outside it entirely.
 */
function bareVerdict(spec: string, inst: Installation): Verdict {
  if (isNodeBuiltin(spec)) {
    return { ok: false, why: `${spec} is a Node builtin and cannot survive the site bundle` }
  }
  const pkg = packageOf(spec)
  if (!inst.runtimeDeps.has(pkg)) {
    return {
      ok: false,
      why: `${spec} is not in package.json "dependencies" (a devDependency is absent for ` +
        `consumers of the published dist/)`,
    }
  }
  const reached = inst.reachedBuiltins(pkg)
  if (reached === null) {
    // Fail closed. "Not installed" is not "clean": an unanswerable question
    // must not read as a pass, which is the fail-open shape §9 keeps naming.
    return { ok: false, why: `${spec} is declared but not installed, so its reach is unmeasured` }
  }
  if (reached.length > 0) {
    return { ok: false, why: `${spec}'s entry module reaches Node builtins: ${reached.join(', ')}` }
  }
  return OK
}

/**
 * Is a relative specifier allowed?
 *
 * `pkgDir` is the shared directory the file lives in and `coreDir` its sibling
 * `core`, passed in rather than computed so the same function serves the `src`
 * and `dist` walks and can be controlled on pure inputs.
 */
function relativeVerdict(spec: string, fromDir: string, pkgDir: string, coreDir: string): Verdict {
  const target = resolve(fromDir, spec)
  if (target.startsWith(pkgDir + sep)) return OK
  if (target.startsWith(coreDir + sep)) return OK
  return {
    ok: false,
    why: `${spec} leaves shared/ for something that is not core/ — shared runs in both ` +
      `runtimes and may only depend on the one package that is platform-free`,
  }
}

/* ===================================================================== */
/*  the installation probe                                                */
/* ===================================================================== */

const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>
}
const NODE_MODULES = join(ROOT, 'node_modules')

const installation: Installation = {
  runtimeDeps: new Set(Object.keys(MANIFEST.dependencies ?? {})),
  reachedBuiltins(pkg) {
    const dir = join(NODE_MODULES, pkg)
    const manifestPath = join(dir, 'package.json')
    if (!existsSync(manifestPath)) return null
    const own = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      browser?: unknown
      module?: unknown
      main?: unknown
    }
    // In preference order: the browser build if the package names one as a
    // plain string, then the ESM entry, then the CommonJS entry, then the
    // default. The first that exists on disk is the one a bundler would reach
    // for, so it is the one to parse.
    const candidates = [own.browser, own.module, own.main, 'index.js']
      .filter((c): c is string => typeof c === 'string')
    for (const candidate of candidates) {
      const entry = join(dir, candidate)
      if (!existsSync(entry)) continue
      const specs = importSpecifiers(readFileSync(entry, 'utf8'), kindOf(entry))
      return [...new Set(specs.filter(isNodeBuiltin))].sort()
    }
    return null
  },
}

/* ===================================================================== */
/*  the roster                                                            */
/* ===================================================================== */

/**
 * Which sources are guarded, asked of the compiler rather than of the build.
 *
 * The roster has to be `include: ["src"]` minus `tsconfig.json`'s three
 * `exclude` globs, and there are three ways to get it. Transcribing the globs
 * here is §9's "a hand-written list of 'the places that do X' is a check" in
 * glob form — it goes wrong in silence the day a fourth is added. Pairing back
 * from `dist/shared/*.js` is what this file used to do: it needs no list, but
 * it makes the roster a function of the last build, which is the blindness the
 * docblock at the top of this file measures. The third option is to ask
 * TypeScript, which is the authority both of the others are approximating:
 * `parseJsonConfigFileContent` returns exactly the files `tsc -p tsconfig.json`
 * compiles. A fourth `exclude` glob needs no edit here *and* a never-built
 * module is in the roster the moment it is on disk.
 *
 * Measured against today's tree: 13 files, the same 13 the old pairing walk
 * produced, with `src/shared/testing/gifFixtures.ts` excluded — by
 * `"src/shared/testing/**"`, not by the accident of emitting nothing. That
 * file reaches `Buffer` at its line 100 and is Node-only test scaffolding by
 * design, so excluding it is the correct answer and not a gap: it is never in
 * the site bundle and never in `dist/`.
 */
function compiledFiles(): readonly string[] {
  const configPath = join(ROOT, 'tsconfig.json')
  const read = ts.readConfigFile(configPath, ts.sys.readFile)
  // Fail closed, both here and below. An unparseable or unresolvable config
  // must not read as "no files to guard" — a roster that is empty because the
  // question could not be answered is the fail-open shape §9 keeps naming,
  // and it would report a clean `src/shared` over every module in it.
  if (read.error) {
    throw new Error(
      `tsconfig.json did not parse: ${ts.flattenDiagnosticMessageText(read.error.messageText, ' ')}`,
    )
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, ROOT, undefined, configPath)
  if (parsed.errors.length > 0) {
    throw new Error(
      `tsconfig.json did not resolve to a file list: ` +
        parsed.errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; '),
    )
  }
  return parsed.fileNames.map(f => resolve(f))
}

function guardedSources(): string[] {
  return compiledFiles()
    .filter(f => f.startsWith(SRC_SHARED + sep))
    .sort()
}

const built = existsSync(DIST_SHARED)

/* ===================================================================== */
/*  controls — the classifier, on inputs that do not depend on the tree   */
/* ===================================================================== */

describe('the shared/ rule, as a predicate', () => {
  const stub = (deps: string[], reach: Record<string, string[] | null>): Installation => ({
    runtimeDeps: new Set(deps),
    reachedBuiltins: pkg => (pkg in reach ? reach[pkg]! : null),
  })

  it('rejects Node builtins in both spellings, and subpaths of them', () => {
    const inst = stub([], {})
    expect(bareVerdict('node:fs', inst).ok).toBe(false)
    expect(bareVerdict('fs', inst).ok).toBe(false)
    expect(bareVerdict('fs/promises', inst).ok).toBe(false)
    expect(bareVerdict('node:crypto', inst).ok).toBe(false)
  })

  it('rejects a devDependency even when it is installed and clean', () => {
    // The leak `src/core/purity.test.ts` was written after was `vitest`.
    const inst = stub(['gifenc'], { vitest: [], gifenc: [] })
    expect(bareVerdict('vitest', inst).ok).toBe(false)
    expect(bareVerdict('gifenc', inst)).toEqual(OK)
  })

  it('rejects a declared dependency whose own entry reaches a builtin', () => {
    // This is the case a "is it in dependencies?" check would wave through,
    // and it is the one that matters: @napi-rs/canvas is a dependency.
    const inst = stub(['@napi-rs/canvas'], { '@napi-rs/canvas': ['os', 'path'] })
    const v = bareVerdict('@napi-rs/canvas', inst)
    expect(v.ok).toBe(false)
    expect(v.ok ? '' : v.why).toContain('os, path')
  })

  it('fails closed when the package is not installed', () => {
    expect(bareVerdict('gifenc', stub(['gifenc'], {})).ok).toBe(false)
  })

  it('allows shared → shared and shared → core, and nothing else', () => {
    const pkg = '/r/src/shared'
    const core = '/r/src/core'
    expect(relativeVerdict('./zip.js', pkg, pkg, core)).toEqual(OK)
    expect(relativeVerdict('../core/index.js', pkg, pkg, core)).toEqual(OK)
    expect(relativeVerdict('../node/canvas.js', pkg, pkg, core).ok).toBe(false)
    expect(relativeVerdict('../web/canvas.js', pkg, pkg, core).ok).toBe(false)
    expect(relativeVerdict('../../site/main.js', pkg, pkg, core).ok).toBe(false)
    // Not a prefix match on the string: `core` must be the directory, not the
    // start of one. `coreutils/` next to `core/` would otherwise pass.
    expect(relativeVerdict('../coreutils/x.js', pkg, pkg, core).ok).toBe(false)
  })
})

/* ===================================================================== */
/*  the guard                                                             */
/* ===================================================================== */

/*
 * The source walk runs unconditionally; only the three `dist/` assertions are
 * gated on the build. The gate used to sit on the whole block, and its stated
 * reason — "the roster here is derived from the build, so there is nothing to
 * guard until `npm run build` has run" — expired with the roster change above.
 * Leaving it would have kept the same blindness in a different coordinate:
 * `rm -rf dist && npx vitest run` would report green over a `node:fs` sitting
 * in `src/shared/`. The clean-checkout policy the gate exists for is
 * unaffected, because the source walk needs no `dist/`.
 */
describe('src/shared and dist/shared import only what runs in both runtimes', () => {
  /** Every specifier in a set of files, with the file it came from. */
  function census(files: readonly string[]): { file: string; spec: string }[] {
    const out: { file: string; spec: string }[] = []
    for (const file of files) {
      for (const spec of importSpecifiers(readFileSync(file, 'utf8'), kindOf(file))) {
        out.push({ file, spec })
      }
    }
    return out
  }

  function violations(
    files: readonly string[],
    pkgDir: string,
    coreDir: string,
  ): { count: number; bad: string[] } {
    const all = census(files)
    const bad = all
      .map(({ file, spec }) => {
        const v = spec.startsWith('.')
          ? relativeVerdict(spec, dirname(file), pkgDir, coreDir)
          : bareVerdict(spec, installation)
        return v.ok ? null : `${relative(ROOT, file)}: ${v.why}`
      })
      .filter((s): s is string => s !== null)
    return { count: all.length, bad: bad.sort() }
  }

  it.skipIf(!built)('every emitted module pairs back to a guarded source, so neither walk can be silently empty', () => {
    // The vacuity floor, and deliberately **not** the incumbent's literal.
    //
    // `src/core/purity.test.ts:221` uses `expect(total).toBeGreaterThan(10)`,
    // which is the right idiom — a parser that found nothing would also report
    // no leaks. The literal is the part not to copy: §9 says "a numeric floor
    // chosen from today's count is a check ... a specifier floor of 160 was
    // overtaken inside its own cluster". This comment said `dist/shared` held
    // 14; it holds **22** as this is rewritten, which is the row firing in
    // miniature — and a floor of 10 would still have passed an empty `src`
    // walk the whole time, because the two walks share no number.
    //
    // A relation has neither problem. The two walks are now independent in a
    // stronger sense than before — one is TypeScript's answer to "what does
    // this tsconfig compile", the other is what `tsc` actually wrote to disk —
    // so requiring the second to be contained in the first fails loudly for a
    // mis-pathed root, a changed extension filter, an `outDir` that moved, an
    // `exclude` glob that grew to cover a module still being emitted, and an
    // orphan in `dist/` whose source is gone.
    //
    // **Containment, not equality**, and the direction is the whole point of
    // the roster change. The other direction — every guarded source has an
    // emitted counterpart — is false of exactly the file this criterion
    // exists for: a module written and not yet built. Asserting it would make
    // a new leaky module redden *here*, with a message about the build, and
    // its paired control (the same new module with the import removed) redden
    // identically — which is §9's "my control proves the diff works": it would
    // prove the instrument functions, not that it saw the import. Whether an
    // unbuilt source is itself a defect is a freshness question, and
    // `src/core/purity.test.ts`'s `dist/ is either absent or current` already
    // owns it over the whole of `dist/`, `dist/shared` included, with its own
    // paired control.
    const sources = new Set(guardedSources())
    const emitted = filesUnder(DIST_SHARED).filter(f => f.endsWith('.js'))
    expect(sources.size, 'tsconfig.json compiles nothing under src/shared, so the source walk guards nothing').toBeGreaterThan(0)
    expect(emitted.length, 'dist/shared holds no emitted .js, so the dist walk guards nothing').toBeGreaterThan(0)
    const unpaired = emitted
      .map(f => join(SRC, relative(DIST, f).replace(/\.js$/, '.ts')))
      .filter(s => !sources.has(s))
      .map(s => relative(ROOT, s))
      .sort()
    expect(unpaired, 'these modules were emitted into dist/shared but their sources are not in the set tsconfig.json compiles').toEqual([])
    // And the parser must have produced something from them, or "no leaks" is
    // a statement about the empty set.
    expect(census([...sources]).length, 'the parser found no specifier at all in src/shared').toBeGreaterThan(0)
  })

  it('src/shared — the sources site/ actually bundles', () => {
    const { count, bad } = violations(guardedSources(), SRC_SHARED, join(SRC, 'core'))
    expect(count).toBeGreaterThan(0)
    expect(bad).toEqual([])
  })

  it.skipIf(!built)('dist/shared — the sources the published package and the CLI load', () => {
    const files = filesUnder(DIST_SHARED).filter(f => /\.(js|mjs|cjs|d\.ts)$/.test(f))
    const { count, bad } = violations(files, DIST_SHARED, join(DIST, 'core'))
    expect(count).toBeGreaterThan(0)
    expect(bad).toEqual([])
  })

  it.skipIf(!built)('emits no test file and no testing/ helper into dist/shared', () => {
    // `src/core/purity.test.ts` already asserts this over the whole of `dist/`
    // and this is not a second copy of that: it is the one assertion here that
    // would notice `src/shared/testing/gifFixtures.ts` starting to emit, which
    // is the file that would carry a vitest import into the published package.
    const leaked = filesUnder(DIST_SHARED)
      .filter(f => /\.test\.(js|d\.ts)$/.test(f) || f.split(sep).includes('testing'))
      .map(f => relative(ROOT, f))
    expect(leaked).toEqual([])
  })
})

/* ===================================================================== */
/*  ambient globals — the instrument the import parser is not             */
/* ===================================================================== */

/**
 * A bare global is allowed only if it exists in **both** runtimes.
 *
 * An import parser is structurally blind here: `crypto.getRandomValues` in
 * `src/shared/ids.ts:59` creates no specifier to find, and `tsconfig.json`'s
 * `"lib": ["ES2022","DOM"]` means the compiler accepts `document` in a module
 * that will also run under Node. The hazard runs in both directions and this
 * package is the only one where both ends are live: `document` or
 * `OffscreenCanvas` breaks the CLI, `Buffer` or `process` breaks the site
 * bundle, and each is invisible to the half of the test suite that does not
 * run that way.
 *
 * ## The two authorities, neither of them a list typed here
 *
 * - **Browser side** — the identifier is declared in one of TypeScript's own
 *   `lib.*.d.ts` files. That covers `lib.dom.d.ts` and every `lib.esNNNN`, and
 *   it excludes anything whose only declaration comes from `@types/node`.
 *   `Buffer` and `process` are declared only there.
 * - **Node side** — the identifier is present on `globalThis` in the process
 *   running this test. `document`, `window`, `OffscreenCanvas`, `indexedDB`
 *   and `createImageBitmap` are not; `crypto`, `Blob`, `atob`, `btoa`,
 *   `TextEncoder`, `CompressionStream` and `DecompressionStream` are.
 *
 * `crypto` passes on both and so is allowed — which is the point. The absence
 * claim this file can make about DOM globals is now a measurement: **21**
 * ambient globals are reached from the **13** modules `tsconfig.json` compiles
 * under `src/shared/`, and all 21 clear both tests. (This read "20 ... from
 * the eleven modules"; both figures were stale, and the roster change of
 * 2026-10-15 is what made them worth re-measuring rather than what moved
 * them.)
 *
 * ## What it still cannot see
 *
 * Reach that is not a resolvable identifier: `globalThis['document']`, a
 * destructure of `globalThis`, `eval`, or a property plucked off an object
 * that happens to be a global. Reach inside a dependency — `omggif` and
 * `gifenc` are parsed for *imports* above, never for globals. And the Node
 * side is the Node running this suite, so a global added in a newer Node
 * starts passing here before it is safe to rely on; the browser side is
 * TypeScript's DOM lib, which is a superset of what any particular browser
 * ships. Both are stated rather than closed.
 */
function globalVerdict(
  name: string,
  declaredIn: readonly string[],
  libDir: string,
  presentInNode: (n: string) => boolean,
): Verdict {
  const inTsLib = declaredIn.some(p => dirname(p) === libDir)
  const inNode = presentInNode(name)
  if (inTsLib && inNode) return OK
  if (!inNode) {
    return { ok: false, why: `${name} is not a global in Node, so this module cannot run in the CLI` }
  }
  return {
    ok: false,
    why: `${name} is declared only outside TypeScript's standard libs (${declaredIn
      .map(p => basename(p))
      .join(', ')}), so it is a Node-only global and will not survive the site bundle`,
  }
}

describe('the ambient-global rule, as a predicate', () => {
  const LIB = '/n/typescript/lib'
  const present = (n: string): boolean => ['crypto', 'Math', 'Buffer', 'process'].includes(n)

  it('allows a global that both runtimes have', () => {
    // The live case: `crypto` is declared by lib.dom and exists in Node >= 18.
    expect(globalVerdict('crypto', [`${LIB}/lib.dom.d.ts`, '/n/@types/node/crypto.d.ts'], LIB, present))
      .toEqual(OK)
    expect(globalVerdict('Math', [`${LIB}/lib.es5.d.ts`], LIB, present)).toEqual(OK)
  })

  it('rejects a DOM-only global, which would break the CLI', () => {
    const v = globalVerdict('document', [`${LIB}/lib.dom.d.ts`], LIB, present)
    expect(v.ok).toBe(false)
    expect(v.ok ? '' : v.why).toContain('not a global in Node')
  })

  it('rejects a Node-only global, which would break the site bundle', () => {
    const v = globalVerdict('Buffer', ['/n/@types/node/buffer.d.ts'], LIB, present)
    expect(v.ok).toBe(false)
    expect(v.ok ? '' : v.why).toContain('will not survive the site bundle')
  })
})

describe('src/shared reaches no global that is missing from either runtime', () => {
  const sources = guardedSources()

  /**
   * Only identifiers in value position, resolved by the checker.
   *
   * A type-only reference erases, so `Record<string, X>` and `ArrayLike<T>`
   * must not be flagged for being absent from `globalThis` — they are absent
   * from every runtime, being types. The checker also resolves shadowing for
   * free: a local named `document` resolves to its own declaration and never
   * reaches the ambient branch.
   */
  function ambientGlobals(): { names: Map<string, string[]>; libDir: string; identifiers: number } {
    const program = ts.createProgram(sources, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.Node16,
      moduleResolution: ts.ModuleResolutionKind.Node16,
      // The same two libs `tsconfig.json` gives the build. Using a narrower
      // set here would make this file disagree with what the compiler allows,
      // which is the thing being audited.
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
      skipLibCheck: true,
      noEmit: true,
    })
    const checker = program.getTypeChecker()
    const anchor = program.getSourceFiles().find(s => basename(s.fileName) === 'lib.es5.d.ts')
    // Instrument check: without the lib directory every declaration looks
    // external and the rule would reject all 21 of today's globals — loudly,
    // not silently, but it would be the wrong failure and worth naming.
    expect(anchor, 'TypeScript standard libs did not load, so the rule cannot be evaluated').toBeDefined()
    const libDir = dirname(anchor!.fileName)

    const isMemberName = (n: ts.Identifier): boolean => {
      const p = n.parent
      if (ts.isPropertyAccessExpression(p)) return p.name === n
      if (ts.isQualifiedName(p)) return p.right === n
      if (ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) return p.name === n
      if (ts.isMethodDeclaration(p) || ts.isMethodSignature(p)) return p.name === n
      if (ts.isBindingElement(p)) return p.propertyName === n
      return ts.isImportSpecifier(p) || ts.isExportSpecifier(p)
    }
    const inTypePosition = (n: ts.Identifier): boolean => {
      let cur: ts.Node = n
      while (ts.isQualifiedName(cur.parent) || (ts.isTypeReferenceNode(cur.parent) && cur.parent.typeName === cur)) {
        cur = cur.parent
      }
      const p = cur.parent
      return ts.isTypeReferenceNode(p) || ts.isTypeQueryNode(p) || ts.isImportTypeNode(p)
        || ts.isTypePredicateNode(p) || ts.isExpressionWithTypeArguments(p)
    }

    const names = new Map<string, string[]>()
    let identifiers = 0
    for (const file of sources) {
      const sf = program.getSourceFile(file)
      expect(sf, `${relative(ROOT, file)} is not in the program`).toBeDefined()
      const walk = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && !isMemberName(node) && !inTypePosition(node)) {
          identifiers++
          const symbol = checker.getSymbolAtLocation(node)
          const decls = symbol?.declarations
          if (symbol && decls?.length && (symbol.flags & ts.SymbolFlags.Value) !== 0) {
            const paths = decls.map(d => d.getSourceFile().fileName)
            // Ambient means every declaration is outside our own sources —
            // in TypeScript's libs or in an installed package's types. An
            // import or a local binding has a declaration under `src/`.
            const ambient = paths.every(p => !p.startsWith(SRC + sep))
            if (ambient && !names.has(node.text)) names.set(node.text, [...new Set(paths)])
          }
        }
        ts.forEachChild(node, walk)
      }
      walk(sf!)
    }
    return { names, libDir, identifiers }
  }

  it('every ambient global it reaches exists in Node and in TypeScript\'s standard libs', () => {
    // The suite runs under vitest's default `node` environment (see
    // `vitest.config.ts`, which says so in prose). If that ever changes to
    // `jsdom`, `'document' in globalThis` becomes true and this instrument
    // goes fail-open without a single assertion moving — so assert it.
    expect(
      'document' in globalThis,
      'the test environment provides a DOM, which makes the Node half of this rule vacuous',
    ).toBe(false)

    const { names, libDir, identifiers } = ambientGlobals()
    expect(identifiers, 'no identifier was walked, so the program is empty or mis-pathed').toBeGreaterThan(0)
    expect(names.size, 'no ambient global was resolved at all — every module uses at least Math or Uint8Array')
      .toBeGreaterThan(0)

    const bad = [...names]
      .map(([name, decls]) => {
        const v = globalVerdict(name, decls, libDir, n => n in globalThis)
        return v.ok ? null : v.why
      })
      .filter((s): s is string => s !== null)
      .sort()
    expect(bad).toEqual([])
  })
})

if (!built) {
  it('skipped the dist/shared checks because dist/shared is absent', () => {
    // Same policy as `src/core/purity.test.ts`: `npx vitest run` on a clean
    // checkout must be green, and there is no published output to guard until
    // `npm run build` has run. **Only the `dist/` assertions skip** — the
    // source walk and the ambient-global walk roster themselves from
    // `tsconfig.json` and run on a tree that has never been built, which is
    // the half that covers the site bundle and the half an unbuilt tree is
    // most likely to be wrong about.
    expect(built).toBe(false)
  })
}
