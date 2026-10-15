/**
 * Nothing under `src/` may reach Svelte — not the package, not a subpath of
 * it, not a component file, and not a component file sitting there unimported.
 *
 * §2's invariant is written "Svelte exists only in `site/`", and until now
 * nothing in the repo could make that false. `src/core/purity.test.ts` reads
 * `<ROOT>/dist` and nothing else, so it is structurally incapable of seeing a
 * source tree; `src/web/index.test.ts` walks only the cone reachable from one
 * entry; and the toolchain tests under `site/` are about `site/`. The nearest
 * thing to a guard was `tsc` refusing to resolve `./X.svelte`, and that stopped
 * being true twice over: `npm run typecheck` is `svelte-check` since `62758f3`,
 * which resolves components on purpose, and `vitest.config.ts` registers
 * `svelte()` in the *shared* plugin list since `88f7e58`, so a `.svelte` import
 * from `src/` resolves and compiles under the test runner today. The hole this
 * closes is open, not hypothetical.
 *
 * ## **"Build 0" is not evidence of purity** — correcting this file's own commit
 *
 * `b6f10f9`, the commit that added this file, says of an unused `svelte` import
 * under `src/` that "only `src/core/purity.test.ts` catches it, only after a
 * build". **That is false in both halves, and the correction matters more than
 * the original claim did**, because what it actually means is that *nothing*
 * but this file stands here.
 *
 * `tsc` **elides an import whose bindings are never used**, so the dependency
 * sits in the source and never reaches the output. Re-measured here rather than
 * carried over as a rumour — `import { mount } from 'svelte'` prepended to
 * `src/core/index.ts`:
 *
 * - `npm run build` → **0**, and `grep -rl svelte dist/` matches **no file**;
 * - `npm run typecheck` → **0**, `0 ERRORS`;
 * - `src/core/purity.test.ts` → **8 passed**. It parses `dist/core`, and
 *   `dist/core` is clean, so it is not merely late — it is **blind**, and no
 *   amount of building makes it see this;
 * - this file → **red**, naming `src/core/index.ts imports svelte`.
 *
 * A green build over a source tree is a statement about what was *emitted*. The
 * question "what does `src/` depend on" is only answerable by reading `src/`,
 * which is why this sensor reads sources and why §9 records "do not weaken,
 * gate or relocate it" against it. The floors below are part of that: they are
 * what stops the read from silently becoming a read of almost nothing.
 *
 * ## Why a new file rather than four more lines in `purity.test.ts`
 *
 * Every assertion in that file's purity block sits behind
 * `describe.skipIf(!built)`. An ungated statement about *sources* placed inside
 * a gate about *output* is the silent-skip trap this phase has already lost a
 * suite to (`1130 passed | 20 skipped`), and nothing about this question needs
 * a build: the evidence is the source tree, which is always on disk.
 *
 * ## The population is a walk, and the walk has no extension filter
 *
 * Not a list, not `vitest.config.ts`'s glob, not tsc's input set — a walk is
 * the only derivation under which a file that does not exist yet is
 * automatically in scope. The alternatives also disagree about what `src/` even
 * contains: `tsc -p tsconfig.typecheck.json --listFilesOnly` reports more than
 * half as many repo files again as this walk does, because it answers a different
 * question — it reports what the two tsconfigs *pull in*, `site/` included,
 * and it reports no file that is not reachable TypeScript. (Stated as a ratio
 * on purpose. An earlier revision wrote the two counts out as `~121` against
 * `78`; both were already wrong by the end of the cluster that shipped them,
 * for the same reason the floors below are no longer literals.)
 *
 * There is deliberately **no `/\.ts$/` filter** either. That filter is the
 * defect `fda30d3` had just fixed one directory over — `site/query.test.ts`
 * swept `.ts` only and a fourth query parser lived in a `.svelte` file it never
 * opened — and an extension allow-list written today is wrong the day a `.tsx`,
 * a `.mts` or a `.svelte` lands. Everything is parsed, as TS. A file that is
 * not source parses to a tree with no import nodes in it, which is the right
 * answer rather than a lucky one: `src/core/anim/presets.golden.json` is in the
 * walk and contributes nothing.
 *
 * ## …which is exactly why the component clause is separate
 *
 * A TS parser pointed at a `.svelte` file is error-recovering over markup, so
 * what it reports about the `<script>` block inside is not evidence. The scan
 * cannot be trusted to see *into* a component, so the existence of one under
 * `src/` is asserted directly instead — and that clause is the stronger of the
 * two anyway, since it catches a component added before anything imports it.
 *
 * ## Parsing, not grepping
 *
 * `importSpecifiers` is reused rather than reimplemented, for the reason
 * `purity.test.ts`'s docblock records at length: comments and string literals
 * are not imports and only a parser knows the difference. It is imported from
 * `core/testing/imports.ts` and not from `purity.test.ts`, where it was
 * defined and still has its self-tests — importing a `.test.ts` registers that
 * file's `describe`s into this suite, and measured, it ran all eight of
 * `purity.test.ts`'s tests a second time here. The regex
 * sibling in `src/web/index.test.ts` is the one not to copy — its two patterns
 * are line-anchored `from '…'` forms, so `await import('./Panel.svelte')` and
 * `require('svelte')` walk straight through it. The control below plants both
 * forms for that reason.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as ts from 'typescript'
import { importSpecifiers } from './core/testing/imports.js'

/** Anchored to this file, not to cwd, so the test is invocation-independent. */
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const SRC = join(ROOT, 'src')
/**
 * The largest subtree of `SRC`, used as the **derived** floor below.
 *
 * Anchored to `ROOT` and deliberately **not** to `SRC` — `join(SRC, 'core')`
 * would follow `SRC` wherever it moved, and a mis-rooted walk would then be
 * compared against a mis-rooted baseline. Two independent anchors are what
 * make the comparison mean anything.
 */
const CORE = join(ROOT, 'src', 'core')
/** The positive control's tree. See `svelte-free-fixture/README.md`. */
const FIXTURE = join(ROOT, 'svelte-free-fixture')

function filesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...filesUnder(path))
    else out.push(path)
  }
  return out
}

/**
 * The three spellings that reach Svelte, and there is no fourth that resolves
 * in this repo.
 *
 * `svelte` and `svelte/store` are the package and its subpaths; `./X.svelte` is
 * a component by any relative path. What this does not see is a component
 * reached through a bundler alias — `vite.site.config.ts` and
 * `vite.player.config.ts` declare none today, and `site/transport.test.ts`
 * records the same limitation of its own ban for the same reason.
 */
function namesSvelte(specifier: string): boolean {
  return (
    specifier === 'svelte' ||
    specifier.startsWith('svelte/') ||
    specifier.endsWith('.svelte')
  )
}

interface Scan {
  /** Every file walked, repo-relative — the population a null is a null over. */
  readonly files: readonly string[]
  /** Every module specifier parsed out of them, lawful ones included. */
  readonly specifiers: number
  /** `<file> imports <specifier>`, one per offending specifier. */
  readonly reaches: readonly string[]
  /** Component files found in the tree itself, repo-relative. */
  readonly components: readonly string[]
}

function scan(dir: string): Scan {
  const files = filesUnder(dir)
  const reaches: string[] = []
  let specifiers = 0
  for (const file of files) {
    for (const spec of importSpecifiers(readFileSync(file, 'utf8'), ts.ScriptKind.TS)) {
      specifiers++
      if (namesSvelte(spec)) reaches.push(`${relative(ROOT, file)} imports ${spec}`)
    }
  }
  return {
    files: files.map(f => relative(ROOT, f)),
    specifiers,
    reaches: reaches.sort(),
    components: files.filter(f => f.endsWith('.svelte')).map(f => relative(ROOT, f)).sort(),
  }
}

describe('src/ is Svelte-free', () => {
  const src = scan(SRC)

  it('reaches neither the svelte package nor any component, by any import form', () => {
    expect(
      src.reaches,
      'Svelte belongs to site/ (§2). A component or the runtime reached from src/ puts it ' +
      'in the published package — `files: ["dist"]` — and in the player bundle.',
    ).toEqual([])
  })

  it('holds no component of its own, imported or not', () => {
    expect(
      src.components,
      'a .svelte file under src/ is already the violation, whether or not anything imports ' +
      'it yet — and the import scan above cannot be the one to find it, because a TS parser ' +
      'error-recovers over markup rather than reading the <script> block.',
    ).toEqual([])
  })

  it('looked at enough of the tree for those two nulls to mean anything', () => {
    // These were literals — `> 50` files and `> 160` specifiers, "set just
    // above the largest single subtree". §9: a numeric floor chosen from
    // today's count is not a check, it is a hand-written list in numeric form.
    // This one was overtaken *inside the cluster that wrote it*: two new
    // `src/core` test files took that subtree past 160 specifiers, so a walk
    // mis-rooted at `src/core` cleared the specifier floor and was caught by
    // the file floor alone. Every `src/core` file added pushed it further.
    //
    // So the floor is now the subtree itself, measured on the same run. `src/`
    // strictly contains `src/core`, which is a structural fact no amount of
    // growth can overtake, and comparing the two populations rather than their
    // sizes is what keeps this from being self-referential in the way a
    // count-against-its-own-count would be:
    //
    // - **mis-rooted at `src/core`** — the two scans return the same set, so
    //   the strict inequality fails. (Mis-rooted anywhere else, containment
    //   fails instead, or `CORE` does not exist and `readdirSync` throws.)
    // - **stopped recursing**, at any depth — `src`'s walk then returns files
    //   shallower than `core`'s does, and cannot contain them. This is the case
    //   a pair of counts handles worst and containment handles best: a broken
    //   recursion shrinks *both* counts, so a ratio can survive it, whereas the
    //   two file *sets* stop overlapping outright.
    // - **everything vanished** — containment holds vacuously, and `0 > 0` is
    //   what catches it.
    const core = scan(CORE)
    expect(
      src.files,
      'the walk never reached src/core, so it lost its root or stopped recursing — the two ' +
      'nulls above are over a tree this walk did not actually enter',
    ).toEqual(expect.arrayContaining([...core.files]))
    expect(
      src.files.length,
      'the walk found nothing in src/ beyond src/core itself, so SRC has collapsed onto a ' +
      'subtree and "no Svelte under src/" is a claim about that subtree only',
    ).toBeGreaterThan(core.files.length)
    expect(
      src.specifiers,
      'all of src/ parsed to no more imports than src/core alone, which is how a purity test ' +
      'rots: the parser, not the tree, is what changed',
    ).toBeGreaterThan(core.specifiers)
  })
})

/**
 * The paired control (§6.5a). Everything above is a null, and a null is
 * evidence only to the extent that the same instrument could have reported
 * something — so the same `scan()` is pointed at a tree that violates every
 * clause, and its output is pinned exactly rather than merely being non-empty.
 *
 * Exactly, because "found something" is satisfied by a predicate that has
 * rotted into matching everything: `clean.ts` is in the fixture to be the file
 * the scan must *not* name, and it mentions Svelte in a comment and in a string
 * literal so that a regression from parsing to grepping shows up here as a
 * fourth entry instead of as a green run.
 */
describe('the same scan, over a tree that does violate it', () => {
  const planted = scan(FIXTURE)

  it('names every planted import, and only those', () => {
    expect(planted.reaches).toEqual([
      'svelte-free-fixture/bare.ts imports svelte',
      'svelte-free-fixture/component.ts imports ./App.svelte',
      'svelte-free-fixture/dynamic.ts imports ./App.svelte',
      'svelte-free-fixture/required.ts imports svelte',
      'svelte-free-fixture/subpath.ts imports svelte/store',
    ])
  })

  it('names the component file as well, which is the clause the scan cannot see', () => {
    expect(planted.components).toEqual(['svelte-free-fixture/App.svelte'])
  })

  it('is a control and not a tautology: the lawful file is parsed and cleared', () => {
    // The floors' own control. If `scan` returned an empty population here the
    // two assertions above would be the ones to fail, but they would fail for
    // the wrong reason and the message would not say so.
    expect(planted.files).toContain('svelte-free-fixture/clean.ts')
    expect(planted.specifiers).toBeGreaterThan(5)
  })
})
