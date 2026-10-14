/**
 * `dist/core` must import nothing but its own relative files.
 *
 * That is the only thing keeping the browser bundle clean: core reaches the
 * platform through the injected `CanvasLike`, so a single non-relative
 * specifier in here means `@napi-rs/canvas` (or `node:fs`, or a test runner)
 * has been pulled into a bundle that cannot have it.
 *
 * **This test parses; it does not grep.** The plan originally said to grep
 * `dist/core` for `@napi-rs`, which was wrong in both directions and both were
 * verified by building: there are four `@napi-rs` occurrences in `dist/core`
 * and every one is a word in a docblock, so the grep fails on correct code;
 * and the one real leak was `vitest` (the build used to compile `*.test.ts`
 * into `dist`), which the grep would never have found. Comments and string
 * literals are not imports, and only a parser knows the difference — hence the
 * TypeScript compiler API below, and the self-test that pins both failure
 * modes without needing a build.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ts from 'typescript'
import { importSpecifiers } from './testing/imports.js'

/** Anchored to this file, not to cwd, so the test is invocation-independent. */
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')
const DIST = join(ROOT, 'dist')
const DIST_CORE = join(DIST, 'core')

/*
 * `importSpecifiers` was defined here and is now imported from
 * `./testing/imports.js`. Its two self-tests stay below, because they are
 * about the parse-not-grep property this file's docblock argues for.
 *
 * It moved because a second test file needs it and importing a `.test.ts`
 * registers that file's `describe`s into the importing suite: measured, every
 * test in this file ran a second time under `src/svelte-free.test.ts`'s name.
 * `site/transport.test.ts` records the same hazard from the other side.
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

describe('importSpecifiers', () => {
  it('ignores module names that are only mentioned in comments', () => {
    const text = [
      '/**',
      ' * Node injects an adapter over `@napi-rs/canvas`; the browser one over',
      ' * OffscreenCanvas. See node:fs for the loader.',
      ' */',
      "// import { x } from 'vitest'",
      "import { y } from './other.js'",
      'export const note = "requires @napi-rs/canvas at runtime"',
    ].join('\n')
    expect(importSpecifiers(text, ts.ScriptKind.TS)).toEqual(['./other.js'])
  })

  it('finds every form that creates a real dependency', () => {
    const text = [
      "import a from 'alpha'",
      "import 'beta'",
      "import type { C } from 'gamma'",
      "export { d } from 'delta'",
      "export * from 'epsilon'",
      "const z: import('zeta').Z = null as never",
      "await import('eta')",
      "require('theta')",
    ].join('\n')
    expect(importSpecifiers(text, ts.ScriptKind.TS).sort()).toEqual([
      'alpha', 'beta', 'delta', 'epsilon', 'eta', 'gamma', 'theta', 'zeta',
    ])
  })
})

const built = existsSync(DIST_CORE)

/* ===================================================================== */
/*  existing output is only evidence if it was built from these sources   */
/* ===================================================================== */

/**
 * `built` asks one question — does `dist/core` exist — and nothing here asks
 * whether it was built from the sources now on disk.
 *
 * So this file has been asserting over whatever the last `npm run build` left
 * behind. Add `import '@napi-rs/canvas'` to a `src/core/` module, run
 * `npm test` without rebuilding, and "imports nothing non-relative" passes:
 * it is a true statement about output that predates the import. That is the
 * same defect `site/dist.test.ts` guards with its mtime gate, in a worse form
 * — there the gate makes the block *skip* and the skip count moves, here there
 * is no gate at all and the four assertions below report a pass over stale
 * bytes. Measured on this branch: `touch site/main.ts` is enough to make
 * `site/dist.test.ts` skip 22 tests, and this file still reports **6 passed**
 * against a `dist/` nobody has rebuilt.
 *
 * ## Derived from `dist/`, so there is no list to keep up to date
 *
 * Every emitted `dist/X.js` names its own input, `src/X.ts`, under
 * `rootDir: "src"` / `outDir: "dist"`. Pairing that way means nothing here has
 * to transcribe `tsconfig.json`'s three `exclude` globs (`**​/*.test.ts`,
 * `src/core/testing/**`, `src/shared/testing/**`) and then silently go wrong
 * the day a fourth is added — a hand-written list of "the files that get
 * compiled" is not a check. A file the build excludes emits nothing, so it is
 * simply never paired.
 *
 * ## Per file, not newest-against-newest
 *
 * `site/dist.test.ts` compares the newest output against the newest source
 * because a bundle has no per-file correspondence. A `tsc` build does, and the
 * finer comparison is also the safer one: an incremental or partial build that
 * re-emits only what changed still reads as current, where newest-vs-newest
 * would call the whole tree stale for one untouched file.
 *
 * **What it cannot see**, stated because it is the gap and not a detail: a
 * *new* source file that has never been compiled has no counterpart in `dist/`
 * to be older than, so it is invisible here. The case this is for is the
 * common one — an edit to a file that was already built.
 */
const SRC = join(ROOT, 'src')

interface Emitted {
  /** The emitted file, repo-relative, which is what a failure has to name. */
  readonly out: string
  readonly sourceMs: number
  readonly outMs: number
}

function emittedPairs(): Emitted[] {
  if (!existsSync(DIST)) return []
  const pairs: Emitted[] = []
  for (const file of filesUnder(DIST)) {
    // `.js` only. A `.d.ts` is emitted from the same source in the same pass,
    // so pairing it as well would double every entry and say nothing new.
    if (!file.endsWith('.js')) continue
    const source = join(SRC, relative(DIST, file).replace(/\.js$/, '.ts'))
    // No source means the file outlived its input — a different defect, and
    // not one a freshness check should be the one to report.
    if (!existsSync(source)) continue
    pairs.push({
      out: relative(ROOT, file),
      sourceMs: statSync(source).mtimeMs,
      outMs: statSync(file).mtimeMs,
    })
  }
  return pairs
}

/** Which of those were emitted *before* their source was last edited. */
function staleEmits(pairs: readonly Emitted[]): string[] {
  // Strictly greater: `tsc` can emit inside the same millisecond as the edit
  // that triggered it, so equal timestamps are current rather than suspect.
  // `site/dist.test.ts`'s `newerThanSources` makes the same call, with `>=`
  // from the other side.
  return pairs.filter(p => p.sourceMs > p.outMs).map(p => p.out).sort()
}

describe('dist/ is either absent or current', () => {
  it('has no emitted file older than the source it was emitted from', () => {
    const pairs = emittedPairs()
    if (!existsSync(DIST)) {
      // The clean checkout, which must stay green — the policy the skip notice
      // at the bottom of this file keeps on purpose, and the only state in
      // which there is nothing on disk to be wrong about.
      expect(pairs, 'dist/ is absent, so nothing should have been paired').toEqual([])
      return
    }
    expect(
      pairs.length,
      'dist/ exists and no emitted .js was matched to a source under src/, so "nothing is ' +
      'stale" is only true of the empty set — the outDir, the rootDir, or the extension ' +
      'filter has moved',
    ).toBeGreaterThan(10)
    expect(
      staleEmits(pairs),
      'these files in dist/ were emitted before the sources they come from were last ' +
      'edited, so every assertion below is about the previous build rather than this tree. ' +
      'Run `npm run build`, then `npm test`.',
    ).toEqual([])
  })

  it('would say so — the same predicate over pairs made stale on purpose', () => {
    // The paired control. On any correctly built tree the test above never
    // reaches its failing branch, so without this nothing would notice the
    // predicate being gutted to `() => []`. Pure inputs, because what is being
    // controlled is the comparison and not the stat() calls.
    const current = { out: 'dist/core/sirds.js', sourceMs: 1_000, outMs: 2_000 }
    const stale = { out: 'dist/core/blur.js', sourceMs: 2_000, outMs: 1_000 }
    expect(staleEmits([current])).toEqual([])
    expect(staleEmits([current, stale])).toEqual(['dist/core/blur.js'])
    // The same-millisecond case the `>` above is chosen for: a build that
    // landed in the same tick as its edit is current, not stale.
    expect(staleEmits([{ out: 'dist/core/x.js', sourceMs: 5, outMs: 5 }])).toEqual([])
  })
})

describe.skipIf(!built)('dist/core purity', () => {
  it('imports nothing non-relative', () => {
    const files = filesUnder(DIST_CORE)
    const leaks: string[] = []
    let total = 0
    for (const file of files) {
      if (!/\.(js|mjs|cjs|d\.ts)$/.test(file)) continue
      for (const spec of importSpecifiers(readFileSync(file, 'utf8'), kindOf(file))) {
        total++
        if (!spec.startsWith('.')) leaks.push(`${relative(ROOT, file)} imports ${spec}`)
      }
    }
    // Guard against a vacuous pass: a parser that found nothing would also
    // report no leaks, and that is exactly how a purity test rots.
    expect(total).toBeGreaterThan(10)
    expect(leaks).toEqual([])
  })

  it('does not reach outside core even by relative path', () => {
    // "Every specifier is relative" is necessary but not sufficient, and the
    // gap is now reachable: `src/shared/` exists and `src/node/` imports from
    // it, so a future `../shared/frames.js` in core would satisfy the rule
    // above while pulling whatever `shared` depends on into the browser bundle.
    const escapes: string[] = []
    for (const file of filesUnder(DIST_CORE)) {
      if (!/\.(js|mjs|cjs|d\.ts)$/.test(file)) continue
      for (const spec of importSpecifiers(readFileSync(file, 'utf8'), kindOf(file))) {
        if (!spec.startsWith('.')) continue
        const target = resolve(dirname(file), spec)
        if (!target.startsWith(DIST_CORE + sep)) {
          escapes.push(`${relative(ROOT, file)} imports ${spec}`)
        }
      }
    }
    expect(escapes).toEqual([])
  })

  it('emits no test files into dist', () => {
    const tests = filesUnder(DIST)
      .filter(f => /\.test\.(js|d\.ts)$/.test(f))
      .map(f => relative(ROOT, f))
    // `files: ["dist"]` would publish these, and they import vitest.
    expect(tests).toEqual([])
  })

  it('emits no test-only helpers into dist', () => {
    // Matches ANY `testing/` directory, not just core's. src/shared/testing/
    // now exists too, and hardcoding `core/testing` would not have caught a
    // regression there — the build excludes both, and this is what keeps it
    // true.
    const helpers = filesUnder(DIST)
      .filter(f => f.split(sep).includes('testing'))
      .map(f => relative(ROOT, f))
    expect(helpers).toEqual([])
  })
})

if (!built) {
  it('skipped the dist/core purity checks because dist is absent', () => {
    // Deliberately not a failure: `npx vitest run` on a clean checkout must be
    // green. `npm run build` first to exercise the checks above.
    expect(built).toBe(false)
  })
}
