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
 * contains: `tsc -p tsconfig.typecheck.json --listFilesOnly` reports ~121 repo
 * `.ts` files against the 78 here, because it is answering a different
 * question.
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
    // Both floors are set just above the largest single subtree, so a walk that
    // lost its root or stopped recursing cannot meet them: `src/core` is 42 of
    // the 78 files and 154 of the 330 specifiers today. A floor derived that
    // way moves with the tree in the direction that matters and does not go red
    // when a file is deleted.
    expect(
      src.files.length,
      'the walk found almost nothing, so "no Svelte under src/" is only true of the empty ' +
      'set — SRC, or the recursion, has moved',
    ).toBeGreaterThan(50)
    expect(
      src.specifiers,
      'the walk found files but parsed almost no imports out of them, which is how a purity ' +
      'test rots: the parser, not the tree, is what changed',
    ).toBeGreaterThan(160)
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
