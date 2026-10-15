import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FIT_MODES, REJECTED_FIT_MODES } from './fit.js'

/**
 * `FIT_MODES`' registration test — **R-g's compile-error form**.
 *
 * ## Why this registry's test looks nothing like the other seven
 *
 * Every other registry in this phase is tested by registering a dummy entry at
 * run time and watching a reader answer with it. For `FIT_MODES` that is not
 * merely awkward, it is the **opposite** of what `site/scale.ts` deliberately
 * built. `planFit`'s `switch` ends in an `AssertNever` guard rather than a
 * fallback, and `scale.ts`'s own docblock states why in terms:
 *
 * > That is the mechanism design §11's "moving a fit mode costs one
 * > registration" turns on: adding a fourth member to `FitMode` makes this file
 * > a **compile error**, naming the exact place the new mode's arithmetic is
 * > missing, instead of silently letterboxing it.
 *
 * A dummy registered at run time therefore reaches `planFit` and **throws** —
 * `scale.test.ts` pins that too. So orchestrator ruling R-g amends the
 * criterion rather than weakening the guard, and the claim to be tested is:
 *
 * > **adding a member is a compile error naming one file, and once added there
 * > it is live everywhere.**
 *
 * ## What this file does NOT re-cover, because P2 already did
 *
 * This is not the whole of `FIT_MODES`' coverage, only the part nothing else
 * stood for. Measured against P2's shipped tests before anything here was
 * written, and each one verified rather than inherited:
 *
 * - **the runtime witness** — `scale.test.ts`'s *"handles every registered fit
 *   mode"* enumerates `Object.keys(FIT_MODES)` and drives `planFit` over every
 *   key, so a member added to the registry and left out of the arithmetic
 *   reddens the suite as well as the compiler;
 * - **the parser's half of propagation** — `fit.test.ts`'s *"parses every
 *   registered mode from its canonical spelling"* drives `parseFit` off the
 *   same enumeration, so a registered mode is reachable from a URL with no
 *   second edit;
 * - **the vacuity floor** — `fit.test.ts` pins `Object.keys(FIT_MODES).sort()`
 *   by **set equality**, which catches a member renamed at constant count;
 * - **the prototype chain** — `Object.hasOwn` at both lookups in `fit.ts`,
 *   pinned in `fit.test.ts` as inputs and observed behaviour.
 *
 * Those four are the registry's run-time story and they are complete. What had
 * no sensor at all is the **compile-time** half — the claim R-g actually makes
 * — and the reason it had none is structural: an `AssertNever` is enforced by
 * `npm run typecheck` alone, so it is invisible to `npm test` and therefore
 * invisible to the gate's test leg. **This file is what makes it visible**, by
 * spawning the project's own type gate and asserting on what it names.
 *
 * ## Why a copied tree rather than an edit in place
 *
 * The plant has to be applied to the real `site/fit.ts` and `site/scale.ts` for
 * the measurement to be about this repo rather than about a fixture. Editing
 * them in place for the ~8s a gate run takes would race every other test file:
 * vitest runs files in parallel workers, and a dozen of them import `fit.ts`.
 * So each plant gets its own throwaway tree whose `site/` is a **copy of the
 * live source** and whose `src/` and `node_modules` are symlinks to this one.
 * Nothing here is hand-written source: every plant is a substitution applied to
 * the text as it is on disk, and each substitution asserts it matched, so a
 * refactor that moves the target makes this file fail loudly rather than
 * measure nothing.
 *
 * ## The cost, stated rather than hidden
 *
 * Three gate runs at ~8s each. They are issued concurrently and awaited
 * together, which is why this file costs ~12s rather than ~24s. That is the
 * price of the only instrument that can see a compile error from `npm test`,
 * and `site/typecheck-gate.test.ts` already pays a comparable one for the
 * neighbouring property.
 *
 * ## The unasserted-measurement corpus, measured rather than assumed
 *
 * The suite prints 126 `[measured]` lines that assert nothing, so a claim of
 * the form "nothing moved" has to be checked against their **values** and not
 * only against pass/fail. Measured here, under a complete registration planted
 * into the working tree: all 126 byte-identical under `LC_ALL=C sort`.
 *
 * That is worth one more sentence than the usual "vacuous", because the reason
 * is **not** that `site/` cannot reach the corpus. Ten of the 126 are emitted
 * by `site/scale.test.ts`, which imports `report` from
 * `src/core/testing/metamorphic.ts` — the only emitter in the repo, and the
 * only `site/` file that calls it. They do not move because of what they
 * measure (stereogram agreement under scaling), not because of where they
 * live. For the registries whose tests emit nothing at all, the vacuity is
 * structural; for this one it is topical, and a change to the scaling
 * arithmetic *would* move it.
 */

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}

/**
 * The spelling planted as the added mode.
 *
 * Not free to choose, and the collision test below is why rather than a
 * precaution. The first attempt at this measurement used `fill`, which is a
 * fixture in `fit.test.ts`'s *"falls back rather than throwing on an unknown
 * value"* list — so a plant named `fill` turns an existing P2 test red for a
 * reason that has nothing to do with the registration, and the two failures
 * look exactly alike in a suite summary.
 */
const DUMMY = 'tile'

/** Where the gate's own config lives, relative to a tree root. */
const GATE_TSCONFIG = 'tsconfig.typecheck.json'

interface GateResult {
  /** Distinct files the checker named, as it spelled them. */
  readonly files: readonly string[]
  /** Every error message, so an assertion can say *which* error it wanted. */
  readonly messages: readonly string[]
  /** `COMPLETED <n> FILES` — the size of the surface the claim is over. */
  readonly filesChecked: number
  /** `COMPLETED … <n> ERRORS`, read from the checker rather than counted here. */
  readonly errorCount: number
  readonly raw: string
}

/**
 * The project's own `typecheck` command, as tokens.
 *
 * Derived from `package.json` for `typecheck-gate.test.ts`'s recorded reason: a
 * hand-written copy keeps passing on the day somebody changes the real one, and
 * the real one is what the phase gate reads `$?` from. Asserting it is a single
 * command is part of that — tokens are handed to the process directly, so a
 * script that grew a pipe or a redirect would be mangled rather than composed.
 */
function typecheckCommand(): readonly string[] {
  const script = PKG.scripts.typecheck
  expect(script, 'package.json has no "typecheck" script').toBeTypeOf('string')
  expect(script, 'typecheck must stay a single command — see comment')
    .not.toMatch(/[&|;><]/)
  const tokens = script!.trim().split(/\s+/)
  // The copied tree carries the same config under the same name, so the tokens
  // need no rewriting — but if the script stopped naming it, the copy would be
  // checking something this file never reasoned about.
  expect(
    tokens.some(t => t.endsWith(GATE_TSCONFIG)),
    `typecheck must name ${GATE_TSCONFIG}`,
  ).toBe(true)
  return tokens
}

/**
 * A throwaway tree that the gate can be pointed at.
 *
 * `site/` is copied because it is what gets planted. `src/` and `node_modules`
 * are symlinked: nothing here plants into either, and copying `src/` would make
 * this file slower for no added evidence. Every `tsconfig*.json` at the root is
 * copied rather than the two this file happens to know about, so a gate config
 * that grows a third layer does not quietly fall out of the copy.
 */
function makeTree(): string {
  const tree = mkdtempSync(join(tmpdir(), 'stst-fit-registration-'))
  symlinkSync(join(ROOT, 'node_modules'), join(tree, 'node_modules'))
  symlinkSync(join(ROOT, 'src'), join(tree, 'src'))
  cpSync(join(ROOT, 'package.json'), join(tree, 'package.json'))
  for (const name of readdirSync(ROOT)) {
    if (name.startsWith('tsconfig') && name.endsWith('.json')) {
      cpSync(join(ROOT, name), join(tree, name))
    }
  }
  cpSync(join(ROOT, 'site'), join(tree, 'site'), { recursive: true })

  // Soundness: the claim this file makes is "no OTHER file needed editing", and
  // that is only as wide as the surface the checker actually opened. If the
  // gate config grew an `include` the copy does not contain, the surface would
  // silently shrink and the claim would silently weaken.
  const gate = readFileSync(join(tree, GATE_TSCONFIG), 'utf8')
  for (const entry of JSON.parse(stripJsonComments(gate)).include as string[]) {
    expect(existsSync(join(tree, entry)), `gate includes "${entry}", copy has no such path`)
      .toBe(true)
  }
  return tree
}

/**
 * The gate's configs are commented JSON, which `JSON.parse` refuses.
 *
 * Deliberately crude and deliberately only used on files this repo wrote: it
 * strips `//` to end of line and does not understand a `//` inside a string.
 * Both gate configs are checked against `existsSync` immediately afterwards, so
 * a mis-strip produces a failed assertion rather than a quiet wrong answer.
 */
function stripJsonComments(text: string): string {
  return text.replace(/^\s*\/\/.*$/gm, '')
}

/**
 * Apply one substitution, and fail if it did not land.
 *
 * The whole file is a null measurement without this. A plant whose pattern
 * stopped matching produces an unplanted tree, the gate reports zero errors,
 * and the propagation test below goes **green for the wrong reason** — the
 * single most likely way this instrument could rot.
 */
function substitute(text: string, pattern: RegExp, replacement: string, what: string): string {
  const matches = text.match(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`))
  expect(matches?.length, `plant "${what}" matched ${matches?.length ?? 0} times, wanted 1`).toBe(1)
  return text.replace(pattern, replacement)
}

/** Add the new member to the union, and nothing else. */
function plantUnion(tree: string): void {
  const path = join(tree, 'site', 'fit.ts')
  const planted = substitute(
    readFileSync(path, 'utf8'),
    /^(export type FitMode = .*)$/m,
    `$1 | '${DUMMY}'`,
    'FitMode union member',
  )
  writeFileSync(path, planted)
}

/** Register the member in `FIT_MODES`, which is what the union's error asks for. */
function plantRegistration(tree: string): void {
  const path = join(tree, 'site', 'fit.ts')
  const planted = substitute(
    readFileSync(path, 'utf8'),
    // Deliberately blind to the ANNOTATION, and matched only on the opening of
    // the literal. Pinning `Record<FitMode, FitModeInfo>` here would make the
    // registry's totality a premise of the harness instead of something the
    // first test measures: a registry widened to `Record<string, …>` would
    // stop matching, and this file would refuse to run rather than report that
    // adding a union member had stopped being an error in `fit.ts`.
    /^(export const FIT_MODES:[^=]*= \{)$/m,
    `$1\n  ${DUMMY}: {\n    mode: '${DUMMY}',\n` +
      `    description: 'Planted by fitregistration.test.ts to measure a registration.',\n  },`,
    'FIT_MODES entry',
  )
  writeFileSync(path, planted)
}

/**
 * Write the new mode's arithmetic, which is what the remaining error asks for.
 *
 * Three substitutions, all in `scale.ts`, because a new mode of the
 * rescaling kind widens two narrower unions on the way to the `switch`:
 * `RescalePlan.mode` and the `rescale` helper's own parameter. They are part of
 * the registration's cost and are counted as such — **and all three are in the
 * one file the compile error named**, which is the point being measured.
 */
function plantArithmetic(tree: string): void {
  const path = join(tree, 'site', 'scale.ts')
  let text = readFileSync(path, 'utf8')
  text = substitute(
    text,
    /readonly mode: 'snap' \| 'contain'/,
    `readonly mode: 'snap' | 'contain' | '${DUMMY}'`,
    'RescalePlan.mode widening',
  )
  text = substitute(
    text,
    /named: 'snap' \| 'contain', fit: Fit/,
    `named: 'snap' | 'contain' | '${DUMMY}', fit: Fit`,
    'rescale() parameter widening',
  )
  text = substitute(
    text,
    /^([ \t]*)case 'snap':$/m,
    `$1case '${DUMMY}':\n$1case 'snap':`,
    'planFit switch arm',
  )
  writeFileSync(path, text)
}

/** Run the project's own type gate over a tree and read what it named. */
function runGate(tree: string): Promise<GateResult> {
  const [cmd, ...args] = typecheckCommand()
  return new Promise((resolve, reject) => {
    const child = spawn(cmd!, args, {
      cwd: tree,
      // `node_modules/.bin` on PATH is what `npm run` does; going through `npx`
      // risks a network fetch for a committed devDependency.
      env: { ...process.env, PATH: `${join(ROOT, 'node_modules', '.bin')}:${process.env.PATH}` },
    })
    let raw = ''
    child.stdout.on('data', (d: Buffer) => { raw += d.toString() })
    child.stderr.on('data', (d: Buffer) => { raw += d.toString() })
    child.on('error', reject)
    child.on('close', () => {
      // The checker's machine format wraps each message in quotes and
      // backslash-escapes the ones inside it, so the message is unescaped here
      // rather than at every assertion — a TypeScript error about a string
      // literal quotes that literal, which is exactly the interesting case.
      const errors = [...raw.matchAll(/^\d+ ERROR "([^"]+)" \d+:\d+ "((?:[^"\\]|\\.)*)"$/gm)]
        .map(m => ({ file: m[1]!, message: m[2]!.replace(/\\(.)/g, '$1') }))
      const completed = /^\d+ COMPLETED (\d+) FILES (\d+) ERRORS/m.exec(raw)
      // A format this file cannot read must not look like a clean run. Without
      // this, a checker that changed its output would report zero errors and
      // every assertion below would pass while measuring nothing.
      expect(completed, `could not read the checker's COMPLETED line from:\n${raw}`).not.toBe(null)
      resolve({
        files: [...new Set(errors.map(e => e.file))].sort(),
        messages: errors.map(e => e.message),
        filesChecked: Number(completed![1]),
        errorCount: Number(completed![2]),
        raw,
      })
    })
  })
}

/** The three states a registration passes through, measured in one pass. */
const PLANTS = {
  /** The union alone — an incomplete registration, and deliberately so. */
  unionOnly: [plantUnion],
  /** Union plus the registration the first error asked for. */
  registered: [plantUnion, plantRegistration],
  /** The whole registration, arithmetic included. */
  complete: [plantUnion, plantRegistration, plantArithmetic],
} as const

type PlantName = keyof typeof PLANTS

const trees: string[] = []
let gate: Record<PlantName, GateResult>

beforeAll(async () => {
  const names = Object.keys(PLANTS) as PlantName[]
  const results = await Promise.all(
    names.map(name => {
      const tree = makeTree()
      trees.push(tree)
      for (const plant of PLANTS[name]) plant(tree)
      return runGate(tree)
    }),
  )
  gate = Object.fromEntries(names.map((n, i) => [n, results[i]!])) as Record<PlantName, GateResult>
}, 300_000)

afterAll(() => {
  for (const tree of trees) rmSync(tree, { recursive: true, force: true })
})

describe('the dummy mode is a spelling nothing else in play already uses', () => {
  /**
   * C-13 paid four spuriously-red tests for the absence of this check, and the
   * first run of *this* measurement reproduced it exactly: `fill` is already a
   * fixture in `fit.test.ts`. Derived from the rosters and from the text of the
   * two test files a plant can disturb, rather than from a list typed here —
   * a typed list goes stale the day somebody adds a fixture.
   */
  it('collides with no registered mode, no rejected mode and no test fixture', () => {
    expect(Object.hasOwn(FIT_MODES, DUMMY)).toBe(false)
    expect(Object.hasOwn(REJECTED_FIT_MODES, DUMMY)).toBe(false)
    const quoted = new Set<string>()
    for (const file of ['fit.test.ts', 'scale.test.ts']) {
      const text = readFileSync(join(ROOT, 'site', file), 'utf8')
      for (const m of text.matchAll(/'([a-z][a-z0-9-]*)'/g)) quoted.add(m[1]!)
    }
    // Not vacuous: the set really does hold the spellings a collision would be
    // with, including the one that actually collided.
    expect(quoted.has('contain')).toBe(true)
    expect(quoted.has('fill')).toBe(true)
    expect(quoted.has(DUMMY), `"${DUMMY}" is already a fixture spelling`).toBe(false)
  })
})

describe('adding a fit mode is a compile error naming one file (R-g, first half)', () => {
  /**
   * The paired control for the test below, and it is not a formality: R-g's
   * wording is true only of the **completed** registration. The union alone is
   * an intermediate state in which *two* files are named, and the second of
   * them is the registration demanding to be written. A measurement that
   * planted only the union would read two files and conclude R-g is false.
   */
  it('names two files while the registration is still missing — fit.ts and scale.ts', () => {
    expect(gate.unionOnly.files, gate.unionOnly.raw).toEqual(['site/fit.ts', 'site/scale.ts'])
    expect(gate.unionOnly.errorCount).toBe(2)
    // ...and each error is the one this file reasoned about, not some other
    // breakage that happens to be in the same file.
    expect(gate.unionOnly.messages.join('\n')).toContain(`Property '${DUMMY}' is missing`)
    expect(gate.unionOnly.messages.join('\n')).toContain("does not satisfy the constraint 'never'")
  })

  it('names exactly one file once the entry is registered, and it is the arithmetic', () => {
    expect(gate.registered.files, gate.registered.raw).toEqual(['site/scale.ts'])
    expect(gate.registered.errorCount).toBe(1)
    // The `AssertNever` guard by its observable consequence rather than by its
    // spelling: `planFit`'s `default:` arm is the only thing in the tree that
    // turns an unhandled mode into a type error, so this message IS the
    // mechanism design §11 row 7's budget turns on.
    expect(gate.registered.messages[0]).toContain(`Type '"${DUMMY}"'`)
    expect(gate.registered.messages[0]).toContain("does not satisfy the constraint 'never'")
  })
})

describe('once added there it is live everywhere (R-g, second half)', () => {
  /**
   * The half that is easy to skip, because it is a claim about **propagation**
   * rather than about the compile error: having paid the one registration and
   * the one arithmetic the compiler asked for, *nothing else in the repository
   * needs to change*. Stated as a negative over the whole gate surface, which
   * is the only form in which "everywhere" means anything.
   *
   * The run-time half of the same claim is already sensored and is not
   * duplicated here: `parseFit` accepts whatever is in `FIT_MODES` and
   * `planFit` dispatches it, both driven off `Object.keys(FIT_MODES)` by P2's
   * own tests, so a member that reached the registry is reachable from a URL
   * and from the layout path with no further edit.
   */
  it('leaves the whole type-check surface clean, so no third file was needed', () => {
    expect(gate.complete.errorCount, gate.complete.raw).toBe(0)
    expect(gate.complete.files).toEqual([])
  })

  it('measured the same surface in all three states, so "everywhere" is one size', () => {
    // Guards the negative above: a run that silently checked fewer files would
    // make "no third file was needed" a smaller claim than it reads as.
    const sizes = new Set(Object.values(gate).map(r => r.filesChecked))
    expect(sizes.size, JSON.stringify([...sizes])).toBe(1)
    // ...and the surface is the whole project, not a corner of it. Derived
    // from the tree rather than pinned: the figure moves every time cluster C
    // adds a file, and a literal here would be stale by the next commit.
    const onDisk = readdirSync(join(ROOT, 'site')).filter(n => n.endsWith('.ts')).length
    expect([...sizes][0]!).toBeGreaterThan(onDisk)
  })
})
