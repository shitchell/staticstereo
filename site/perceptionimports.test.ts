import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ts from 'typescript'
import { parse as parseSvelte } from 'svelte/compiler'
import { importSpecifiers } from '../src/core/testing/imports.js'
import { THRESHOLD_NAMES } from '../src/shared/testing/perceptionRoster.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * **Criterion 25's import half.** Which files under `site/` may reach the
 * perception model at all, and which of its *thresholds* may cross the
 * boundary — both sides derived, the permission declared.
 *
 * > No perceptual threshold or judgement is computed outside the perception
 * > model module. A caller may call a model function and render what it
 * > returns; it may not compare against a perceptual constant, re-derive one,
 * > or grade a result itself.
 *
 * ## What this is NOT, stated first because it is the trap
 *
 * **This is not a perceptual-predicate detector**, and the survey that
 * commissioned it refused to build one in those words: *"it is the enumeration
 * trap with a new name."* Nothing here reads an expression, a comparison or a
 * branch, and nothing here decides whether a number somebody wrote is
 * perceptual. A detector of that kind has to enumerate the shapes a judgement
 * can take, and §9 records four successive enumerations on this phase, each
 * believed complete by its author and each defeated by one more form.
 *
 * What this file has instead is a **real external oracle, in two independent
 * parts, neither of which is anybody's opinion**:
 *
 *  - **The module resolver** answers *"where does this specifier go"*. It is
 *    TypeScript's own `resolveModuleName` under this repository's real
 *    `tsconfig.json`, so it answers the same question the compiler and the
 *    bundler answer, and it answers it for spellings nobody anticipated.
 *  - **The compiler** answers *"which of this module's exports is a
 *    threshold"*, through {@link THRESHOLD_NAMES} — whose completeness is
 *    ratcheted in `src/shared/testing/perceptionRoster.ts` by an `AssertNever`
 *    pair over `PerceptionThresholdName`, a mapped type over
 *    `typeof perception`. A threshold added to the model and not classified is
 *    a **typecheck** error, so this file's roster cannot go short in silence.
 *
 * The author answers only the third question — ***may* it** — and that is the
 * only hand-written input here.
 *
 * ## Why an edge guard catches anything at all
 *
 * Comparing against a perceptual constant you did not define requires
 * importing it. That is not a heuristic about how violations tend to look; it
 * is how modules work. So the import edge is a **necessary condition** for the
 * second of the criterion's three prohibited acts, and a necessary condition
 * with a mechanical oracle is worth more than a sufficient one with a
 * hand-written roster. {@link WHAT_THIS_CANNOT_SEE} states the other two.
 *
 * ## Why equality, and not containment
 *
 * Containment lets a new edge appear unnoticed, which is the entire failure
 * mode. `site/buildguard.test.ts` already made this ruling one level up, for
 * top-level directories, and the shape is copied from it deliberately: a
 * derived denominator, an equality against a declared roster, a recorded
 * **reason** per entry, and a flag whose warrant is re-established
 * mechanically on every run rather than inherited from the day it was typed.
 *
 * ## The two specifiers, which are the reason this resolves rather than greps
 *
 * `site/legibility.ts` is a bare `export * from '../src/shared/perception.js'`,
 * so **every perception symbol already has two valid specifiers today** and a
 * third the moment anyone adds a second shim. A check keyed on the string
 * `'../src/shared/perception.js'` would be blind to `'./legibility.js'`, and
 * blind in the quiet direction. {@link perceptionSurface} therefore derives
 * the re-export closure instead of naming it, and `site/main.ts` — which
 * reaches the model *only* through the shim — is in this file's denominator
 * because the resolver put it there.
 *
 * Measured on the tip this was written against: the surface is two modules,
 * the consumers are three, and `site/main.ts` imports three names, all of them
 * functions. The grep that would have been the obvious alternative finds
 * `TIGHT_MULTIPLE` and `INK_FRACTION` in `site/legibility.ts` — in its
 * docblock, where they are prose. Comments and string literals are not
 * imports, and only a parser knows the difference; that is the sentence
 * `src/core/testing/imports.ts` opens with, arriving one directory over.
 */

/**
 * **The boundaries of this guard**, written down because a sensor whose reach
 * is not recorded gets read as covering the whole criterion — and this one
 * covers a third of it.
 *
 * 1. **A threshold re-derived from literals is invisible here.** A view that
 *    writes `if (budget > 32)` imports nothing, so no edge exists to inspect.
 *    That is the criterion's *other* half and was split off deliberately: it
 *    has no external oracle, because deciding that a literal `32` was chosen
 *    to model human vision is the judgement no machine makes.
 * 2. **Grading a model result is invisible here.** A caller that receives a
 *    `LegibilityReading` and writes its own verdict over the numbers in it
 *    imports only functions, which this file permits by design — the criterion
 *    permits it too, right up to the word "grade".
 * 3. **A threshold's *value* arriving through a function is invisible here,
 *    and correctly so.** `disparityBudget(stereo)` returns a number computed
 *    from thresholds; calling it and rendering the answer is the prescribed
 *    shape, not an evasion.
 *
 * What is left is the one act with a mechanical witness, and it is the one the
 * canonical violation used.
 */

/** `.svelte` is here because this phase is adding components that call the model. */
const MODULE_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.svelte']

/** The model itself. The *surface* is derived from it; this is the only path typed. */
const PERCEPTION_MODULE = 'src/shared/perception.ts'

/* ───────────────────────────── the derivation ───────────────────────────── */

/**
 * Input 1, part one. Every module file git tracks, as git spells it.
 *
 * `git ls-files` rather than a directory walk, for `site/buildguard.test.ts`'s
 * reason: tracked-ness is the repository's own record of what we wrote, it is
 * maintained by everybody who commits and by nothing in this file, and it
 * excludes `node_modules/` and every `dist` tree without a list of them having
 * to be typed here.
 *
 * `-z` because the `git` wrapper on this machine writes identity banner lines
 * to **stdout** for some subcommands, which would arrive glued to the first
 * record and silently manufacture a path. Asserted below rather than trusted.
 */
function trackedModules(dir: string): readonly string[] {
  const r = spawnSync('git', ['-C', ROOT, 'ls-files', '-z', dir], { encoding: 'utf8' })
  expect(r.status, `git ls-files failed in ${ROOT}: ${r.stderr ?? ''}`).toBe(0)
  const files = (r.stdout ?? '').split('\0').filter(p => p !== '')
  expect(
    files.filter(p => p.includes('\n')),
    'a tracked path contains a newline, which is the git wrapper\'s stdout banner glued to the first record',
  ).toEqual([])
  return files.filter(p => MODULE_EXTENSIONS.includes(extname(p)))
}

/**
 * The TypeScript the file actually contains.
 *
 * For `.svelte`, the script blocks are located by **svelte's own parser** and
 * sliced by the offsets it reports — not by a regex over `<script>`. A regex
 * would be a second, worse implementation of a thing the toolchain already
 * does exactly, and it would disagree with the compiler on precisely the
 * malformed or unusual files where disagreement costs something. Both blocks
 * are taken: `module` carries imports as readily as `instance` does.
 */
function sourceText(file: string): string {
  const raw = readFileSync(join(ROOT, file), 'utf8')
  if (extname(file) !== '.svelte') return raw
  const ast = parseSvelte(raw, { modern: true })
  return [ast.module, ast.instance]
    .map(block => scriptSource(raw, block))
    .filter((t): t is string => t !== null)
    .join('\n')
}

/**
 * The text of one `<script>` block, or `null` if its offsets cannot be read.
 *
 * **Why a runtime check and not a cast.** Svelte types `Script.content` as an
 * ESTree `Program`, and ESTree declares no offsets — but svelte's parser is
 * acorn-based and every node it produces carries `start` and `end` at runtime.
 * The `Script` node itself *is* typed with offsets, and using those is the
 * wrong fix: they bracket the whole element including `<script lang="ts">` and
 * `</script>`, which TypeScript cannot parse, so the repair would be to strip
 * the tags with a regex — reintroducing by the back door the grep this file
 * exists to avoid.
 *
 * A cast would assert the offsets are there. This asks. The difference shows
 * up on the day svelte stops carrying them: a cast yields `undefined`,
 * `slice(undefined, undefined)` returns the **whole file** including markup,
 * and the TypeScript parser then reads a file of HTML as a module with no
 * imports — every `.svelte` file silently dropping out of the denominator
 * while the suite stays green. Returning `null` instead makes
 * `reads a real .svelte script block, so components are in the denominator`
 * fail closed and name it.
 */
function scriptSource(raw: string, block: unknown): string | null {
  if (typeof block !== 'object' || block === null) return null
  const content = (block as { content?: unknown }).content
  if (typeof content !== 'object' || content === null) return null
  const { start, end } = content as { start?: unknown; end?: unknown }
  if (typeof start !== 'number' || typeof end !== 'number') return null
  return raw.slice(start, end)
}

/**
 * Whether an edge carries a *readable* list of names, or everything.
 *
 * `null` means **wholesale** — the edge grants access to every export of its
 * target and this file cannot narrow it. `import * as m`, `export *`,
 * `import()`, `require()` and `import x = require()` are all in that case, and
 * every one of them is recorded as wholesale rather than as "no names", which
 * is the fail-closed direction. A dynamic `import('./legibility.js')` whose
 * result is destructured into `TIGHT_MULTIPLE` is not statically readable, so
 * calling it empty would be a guard going quiet on the one spelling somebody
 * reaching for an evasion would try.
 */
type Names = readonly string[] | null

interface Edge {
  readonly specifier: string
  readonly names: Names
  /**
   * Whether this edge *re-exports* its target, as opposed to importing from
   * it. Only re-export edges extend the perception surface — see
   * {@link perceptionSurface} for why an importer is not a shim.
   */
  readonly isReexport: boolean
}

/**
 * Input 1, part two. Every edge out of a source text, with the names on it.
 *
 * This parses the same node kinds {@link importSpecifiers} parses, and the row
 * `agrees with the shared parser about every specifier` asserts the two agree
 * as multisets on every file in the denominator. That cross-check is the point
 * of writing it this way: {@link importSpecifiers} is the repository's
 * established answer to *"what are this file's edges"*, so it is used as the
 * oracle for this function's completeness rather than as a thing to reimplement
 * and hope about. A form this function forgets reddens that row by name.
 *
 * It exists at all only because {@link importSpecifiers} returns bare strings,
 * which cannot answer the second question — *which names crossed* — and that
 * question is what separates calling a model function from importing a
 * threshold. That distinction is the criterion's own.
 */
function edgesOf(text: string): readonly Edge[] {
  const sf = ts.createSourceFile('x', text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  const out: Edge[] = []
  const push = (node: ts.Node | undefined, names: Names, isReexport = false): void => {
    if (node && ts.isStringLiteralLike(node)) out.push({ specifier: node.text, names, isReexport })
  }
  const walk = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause
      const bindings = clause?.namedBindings
      if (bindings && ts.isNamespaceImport(bindings)) push(node.moduleSpecifier, null)
      else if (bindings && ts.isNamedImports(bindings)) {
        // `propertyName` is the name as the *target* exports it; `name` is the
        // local alias. A threshold imported `as x` is still that threshold.
        push(node.moduleSpecifier, bindings.elements.map(e => (e.propertyName ?? e.name).text))
      } else push(node.moduleSpecifier, [])
    } else if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier === undefined) { /* a local export, not an edge */ }
      else if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        push(node.moduleSpecifier, node.exportClause.elements.map(e => (e.propertyName ?? e.name).text), true)
      } else push(node.moduleSpecifier, null, true)
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) push(node.moduleReference.expression, null)
    } else if (ts.isImportTypeNode(node)) {
      // Wholesale rather than empty: `typeof import('./legibility.js').TIGHT_MULTIPLE`
      // is a type position that names a threshold, and resolving which part of
      // the qualifier is the export is work the fail-closed answer makes
      // unnecessary.
      if (ts.isLiteralTypeNode(node.argument)) push(node.argument.literal, null)
    } else if (ts.isCallExpression(node)) {
      const dynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword
      const required = ts.isIdentifier(node.expression) && node.expression.text === 'require'
      if (dynamic || required) push(node.arguments[0], null)
    }
    ts.forEachChild(node, walk)
  }
  walk(sf)
  return out
}

/**
 * The resolver, configured from the repository's real `tsconfig.json`.
 *
 * Reading the real config rather than constructing options is deliberate:
 * `moduleResolution: node16` is what makes a `.js` specifier resolve to the
 * `.ts` file beside it, which is how every first-party import in this
 * repository is spelled. A hand-built option bag that drifted from the real one
 * would resolve nothing and this whole file would report an empty denominator —
 * green, and blind. The non-vacuity rows below are what make that loud.
 */
const parsedConfig = ts.parseJsonConfigFileContent(
  ts.readConfigFile(join(ROOT, 'tsconfig.json'), ts.sys.readFile).config,
  ts.sys,
  ROOT,
)
const resolutionHost = ts.createCompilerHost(parsedConfig.options)

/** The repo-relative file a specifier names, or `null` for a builtin/package/asset. */
function resolveFrom(file: string, specifier: string): string | null {
  const r = ts.resolveModuleName(specifier, join(ROOT, file), parsedConfig.options, resolutionHost)
  const resolved = r.resolvedModule?.resolvedFileName
  if (resolved === undefined) return null
  const rel = relative(ROOT, resolved)
  // A package resolved through `node_modules` is not a first-party module and
  // can never be the perception model; excluded here so the closure below
  // cannot wander into a dependency's own `export *`.
  return rel.startsWith('..') || rel.split('/').includes('node_modules') ? null : rel
}

/**
 * Input 2. Every module from which perception's exports can be imported by
 * name — the model plus the transitive closure of modules that re-export it.
 *
 * **Derived, because naming it is the defect.** The shim exists today; the
 * criterion was reworded on 2026-10-17 specifically to stop naming a file path,
 * *"derived the way `PerceptionFunctionName` already derives from the module's
 * own type"*. This is the same move for the module graph.
 *
 * Only `export`-from edges extend the closure. A module that merely *imports*
 * perception — `src/shared/testing/perceptionRoster.ts` does — does not make
 * its own importers able to name `TIGHT_MULTIPLE`, so folding it in would
 * widen the denominator to no purpose and redden on correct code. A wholesale
 * re-export (`export *`) and a named one are both edges, because a named
 * `export { INK_FRACTION } from` re-exports a threshold just as effectively.
 */
function perceptionSurface(): readonly string[] {
  const candidates = [...trackedModules('site'), ...trackedModules('src')]
  const reexports = new Map<string, readonly string[]>()
  for (const file of candidates) {
    const targets = edgesOf(sourceText(file))
      .filter(e => e.isReexport)
      .map(e => resolveFrom(file, e.specifier))
      .filter((t): t is string => t !== null)
    if (targets.length > 0) reexports.set(file, targets)
  }
  const surface = new Set<string>([PERCEPTION_MODULE])
  for (let grew = true; grew;) {
    grew = false
    for (const [file, targets] of reexports) {
      if (!surface.has(file) && targets.some(t => surface.has(t))) { surface.add(file); grew = true }
    }
  }
  return [...surface].sort()
}

/** Every threshold name a site module pulls across the boundary, by module. */
function derivedConsumers(surface: readonly string[]): Record<string, readonly string[]> {
  const out: Record<string, readonly string[]> = {}
  for (const file of trackedModules('site')) {
    const crossing = edgesOf(sourceText(file))
      .filter(e => {
        const target = resolveFrom(file, e.specifier)
        return target !== null && target !== file && surface.includes(target)
      })
    if (crossing.length === 0) continue
    const names = crossing.some(e => e.names === null)
      ? [...THRESHOLD_NAMES]
      : crossing.flatMap(e => e.names ?? []).filter(n => (THRESHOLD_NAMES as readonly string[]).includes(n))
    out[file] = [...new Set(names)].sort()
  }
  return out
}

/* ───────────────────────────── the permission ───────────────────────────── */

/** A module under `site/` that is allowed to reach the perception model. */
interface Consumer {
  /** Repo-relative path, exactly as git spells it. */
  readonly file: string
  /** **Why this file may reach the model.** Not what it contains. */
  readonly reason: string
  /** Who owns the decision, where a phase or role owns one. */
  readonly owner: string
  /**
   * Whether this module's edge is wholesale — `export *`, a namespace import,
   * or a dynamic one — so that it exposes **every** threshold and no narrower
   * list can be written for it.
   *
   * Like `holdsNoModule` in `site/buildguard.test.ts`, the warrant is
   * re-established mechanically on every run rather than inherited: the row
   * below checks the flag against what the parser actually found, in both
   * directions. So a shim that stops being a shim, or a named import that
   * becomes a namespace import, reddens here instead of quietly changing what
   * {@link thresholds} is compared against.
   */
  readonly wholesale: boolean
  /**
   * The thresholds this module may name. Ignored when {@link wholesale}, where
   * the expectation is {@link THRESHOLD_NAMES} itself — derived, so a threshold
   * added to the model does not need adding here.
   */
  readonly thresholds: readonly string[]
}

/**
 * **Every entry here was copied out of this file's own first failing run**,
 * not typed from a reading of the tree, and that ordering is the evidence:
 * with both rosters empty the derivation named these three files, their
 * thresholds and their edge kinds, and the declaration was written to match
 * what it reported. A roster assembled the other way round — by reading the
 * imports and then writing a check that agrees — is §9's *"two hand-written
 * lists cross-checked against each other"*.
 */
const CONSUMERS: readonly Consumer[] = [
  {
    file: 'site/legibility.test.ts',
    reason:
      'The rule\'s own test. It names INK_FRACTION and TIGHT_MULTIPLE to pin behaviour AT the ' +
      'boundaries those constants set, which is the one job that cannot be done by calling a ' +
      'function: a test that derived its expected boundary from the constant would agree with ' +
      'the constant at every value of it, and `site/legibility.ts`\'s own docblock records that ' +
      'exact blindness being measured — INK_FRACTION 0.5 → 0.9 and TIGHT_MULTIPLE 2 → 3 each ' +
      'left the suite green. Reading a threshold to pin it is not grading against it.',
    owner: 'P7 — criteria 2 and 5 both land in this file',
    wholesale: false,
    thresholds: ['INK_FRACTION', 'TIGHT_MULTIPLE'],
  },
  {
    file: 'site/legibility.ts',
    reason:
      'The re-export shim itself, and the only `site/` entry that is wholesale. It holds no rule ' +
      'of its own — the file is one `export *` line under a docblock — so it computes no ' +
      'threshold and grades nothing. It is in this list rather than exempt from it because its ' +
      '`export *` is precisely what gives every threshold a second specifier into site/, and ' +
      'that fact should cost a line somebody can see.',
    owner: 'P7 — the phase that moved the rule into src/shared/perception.ts and left this shim',
    wholesale: true,
    thresholds: [],
  },
  {
    file: 'site/main.ts',
    reason:
      'The prescribed call-and-render shape, and the acceptance test for this whole guard. It ' +
      'imports measureInk, soloLayerScene and describeLegibility — three functions, no ' +
      'threshold — calls them in updateLegibility and writes the string they return into the ' +
      'DOM. The criterion permits exactly this: "a caller may call a model function and render ' +
      'what it returns." If this entry ever needs a threshold added to it, the edit to argue ' +
      'for is moving the comparison into the model, not widening this line.',
    owner: 'P4 / PM-CANVAS — plan §P4.11 assigns R22\'s view half there; this call site predates it',
    wholesale: false,
    thresholds: [],
  },
]

/** A module from which perception's exports can be imported by name. */
interface SurfaceModule {
  readonly file: string
  readonly reason: string
}

const SURFACE: readonly SurfaceModule[] = [
  {
    file: 'site/legibility.ts',
    reason:
      'A bare `export * from \'../src/shared/perception.js\'`. P7 left it so that moving the rule ' +
      'did not require editing site/main.ts, which a later phase deletes and which P7 did not ' +
      'own. The cost is that every perception symbol has two valid specifiers, which is the ' +
      'reason this file resolves edges instead of matching specifier strings.',
  },
  {
    file: 'src/shared/perception.ts',
    reason:
      'The perception model itself — the one module the criterion permits to own a perceptual ' +
      'threshold, and the root this closure is grown from.',
  },
]

/* ────────────────────────────── the assertions ────────────────────────────── */

describe('the perception model\'s import surface is derived, not named', () => {
  it('agrees with the shared parser about every specifier, so no edge form is missed', () => {
    // The completeness oracle for `edgesOf`. `importSpecifiers` is the
    // repository's established answer and handles static, type, dynamic,
    // `require` and `export-from`; if this file's richer parse ever stops
    // seeing one of those, the multisets diverge here and name the file.
    const disagreements: Record<string, { shared: string[]; local: string[] }> = {}
    for (const file of trackedModules('site')) {
      const text = sourceText(file)
      const shared = [...importSpecifiers(text, ts.ScriptKind.TS)].sort()
      const local = edgesOf(text).map(e => e.specifier).sort()
      if (JSON.stringify(shared) !== JSON.stringify(local)) disagreements[file] = { shared, local }
    }
    expect(
      disagreements,
      'edgesOf() and importSpecifiers() disagree about a file\'s edges. The shared parser is the ' +
      'oracle: teach edgesOf the form it missed. Do NOT relax this comparison — a form edgesOf ' +
      'cannot see is a threshold import this file cannot see either.',
    ).toEqual({})
  })

  it('reads a real .svelte script block, so components are in the denominator', () => {
    /**
     * Armed against a known-answer file rather than against "some `.svelte`".
     * This phase is adding components that will call the model, so a
     * `.svelte` path that silently extracted nothing would be a hole opening
     * exactly where the work is going — and it would open **green**, because
     * a file with no readable imports contributes no edges and no row counts
     * the files it saw.
     *
     * Both directions are checked, because the failure mode that matters is
     * `slice(undefined, undefined)` returning the whole file: the script body
     * must be present AND the markup must be absent. A single `toContain`
     * would pass on the whole file and prove nothing.
     */
    const components = trackedModules('site').filter(f => extname(f) === '.svelte')
    expect(components, 'no .svelte file is tracked under site/, so this row asserts nothing')
      .toContain('site/SvelteSmoke.svelte')
    const text = sourceText('site/SvelteSmoke.svelte')
    expect(text, 'the script block was not extracted from the component').toContain('$props')
    expect(text, 'the extraction returned markup too, which is what reading absent offsets looks like')
      .not.toContain('<span>')
  })

  it('finds the model and at least one re-export of it, or the two-specifier case is unwatched', () => {
    // Armed, in the same invocation as the subject. A derivation that resolved
    // nothing would report an empty surface and an empty consumer set, and
    // every equality below would pass on a guard that had gone blind. The shim
    // is the specific thing that must be visible: it is what gives every
    // perception symbol a second specifier.
    const surface = perceptionSurface()
    expect(surface, 'the resolver cannot find the perception model itself').toContain(PERCEPTION_MODULE)
    expect(
      surface.filter(f => f !== PERCEPTION_MODULE).length,
      'no re-export of the model was derived, so this file is not exercising the closure that ' +
      'makes `site/main.ts` visible at all — it would now pass a direct-specifier check only',
    ).toBeGreaterThan(0)
    expect(THRESHOLD_NAMES.length, 'the threshold roster is empty, so the name check asserts nothing')
      .toBeGreaterThan(0)
    expect(
      THRESHOLD_NAMES as readonly string[],
      'the compiler-derived roster no longer carries the model\'s two oldest thresholds',
    ).toEqual(expect.arrayContaining(['INK_FRACTION', 'TIGHT_MULTIPLE']))
  })

  it('is exactly the declared surface', () => {
    expect(
      perceptionSurface(),
      'a module re-exports the perception model that SURFACE does not name, or SURFACE names one ' +
      'that no longer re-exports it. A new re-export gives every threshold a new specifier, which ' +
      'is why it is a decision and not a detail: add it with a reason, or remove the shim.',
    ).toEqual(SURFACE.map(s => s.file).sort())
  })

  it('is reached from exactly the declared files, with exactly the declared thresholds', () => {
    const surface = perceptionSurface()
    const derived = derivedConsumers(surface)
    const declared = Object.fromEntries(
      CONSUMERS.map(c => [c.file, (c.wholesale ? [...THRESHOLD_NAMES] : c.thresholds).slice().sort()]),
    )
    expect(
      derived,
      'criterion 25, import half. Either a file under site/ now reaches the perception model and ' +
      'CONSUMERS does not permit it, or a permitted file now names a threshold it was not ' +
      'permitted to name, or a declared entry is stale.\n\n' +
      'If the file CALLS a model function and renders what it returns, that is the prescribed ' +
      'shape — add it to CONSUMERS with `thresholds: []` and a reason saying what it renders.\n\n' +
      'If the file imports a THRESHOLD, stop and read the criterion: a caller "may not compare ' +
      'against a perceptual constant, re-derive one, or grade a result itself." The threshold ' +
      'belongs behind a function in the model, and the caller should be calling it. Adding the ' +
      'name here instead is the edit this guard exists to make somebody argue for.\n\n' +
      'Do NOT narrow the derivation to make this pass.',
    ).toEqual(declared)
  })

  it('re-establishes the wholesale flag from the parse rather than inheriting it', () => {
    const surface = perceptionSurface()
    const derived: Record<string, boolean> = {}
    for (const file of trackedModules('site')) {
      const crossing = edgesOf(sourceText(file)).filter(e => {
        const t = resolveFrom(file, e.specifier)
        return t !== null && t !== file && surface.includes(t)
      })
      if (crossing.length > 0) derived[file] = crossing.some(e => e.names === null)
    }
    expect(
      derived,
      'a consumer\'s edge changed kind. `wholesale` decides whether its thresholds are compared ' +
      'against the declared list or against the whole roster, so a stale flag silently changes ' +
      'what the row above asserts.',
    ).toEqual(Object.fromEntries(CONSUMERS.map(c => [c.file, c.wholesale])))
  })

  it('records a reason and an owner on every entry, because an unexplained edge is a hole with a name on it', () => {
    const thin = [...CONSUMERS, ...SURFACE].filter(e => e.reason.trim().length < 40)
    expect(thin.map(e => e.file), 'an entry carries no real reason').toEqual([])
    expect(CONSUMERS.filter(c => c.owner.trim() === '').map(c => c.file), 'an entry carries no owner')
      .toEqual([])
    // Both rosters must be non-empty, or the two equality rows above are
    // satisfied by a derivation that found nothing — green, and blind.
    expect(CONSUMERS.length, 'CONSUMERS is empty, so the consumer equality asserts nothing')
      .toBeGreaterThan(0)
    expect(SURFACE.length, 'SURFACE is empty, so the surface equality asserts nothing')
      .toBeGreaterThan(0)
  })
})
