/**
 * The preset golden corpus — a **temporary refactor instrument**, not a
 * permanent pin.
 *
 * `PRESETS` has been rewritten: `slide` became `move` and `emerge` became
 * `push`; `marquee`/`bounce`/`bob`/`slide-in` are deleted (design §4.2b).
 * The first two were specified as *renames*, and nothing else in the suite can
 * tell a rename from a rewrite — `presets.test.ts` asserts behaviour in the
 * shape of "ends up off the plate", "returns to its start height", which a
 * subtly different arithmetic would still satisfy. So this file captures the
 * exact compiled `Track` for every registered kind and deep-equals it against
 * a committed fixture.
 *
 * **This is the one sanctioned exception to "assert on structure, not on
 * values".** The renames have landed and this fixture is the evidence that
 * they were renames. The four deleted kinds' cases were removed in the commit
 * that deleted them — **that commit's diff is the record of what they
 * compiled to**, and it is the reference P6 rebuilds them from as UI
 * templates. Do not re-derive them from this file; they are not here.
 *
 * The corpus survives to the phase gate; retiring it after that is a separate
 * decision, not an automatic consequence of the rename.
 *
 * **It pins the compiled `Track` as JSON, not exactly.** `JSON.stringify(-0)`
 * is `"0"`, so a signed zero can neither be recorded here nor detected by the
 * comparison. That is reachable: `push` emits `from - ctx.layerDepth`, which
 * is `-0` when `from` equals `ctx.layerDepth`. Low impact — `-0 === 0` and the
 * two render identically — but it bounds what the corpus witnesses.
 *
 * Breadth is the point. Three cases per kind — bare, fully parameterised, and
 * fully parameterised plus all four `overrides()` fields — because a corpus of
 * bare invocations would pin the defaults and nothing else, and would let the
 * refactor change parameter handling undetected.
 *
 * **Scope stops at `PresetFn` output.** Nothing here reaches `raster.ts`:
 * preset compilation is pure arithmetic and bit-reproducible across machines,
 * whereas the rasteriser depends on `Math.cos` and on `@napi-rs/canvas` font
 * metrics. A fixture that crossed that line would be machine-dependent and
 * therefore worthless as a diff.
 *
 * Regenerate with:
 *   UPDATE_PRESET_GOLDEN=1 npx vitest run src/core/anim/presets.golden.test.ts
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { compilePreset, PRESETS } from './presets.js'
import { GOLDEN_CTX } from '../testing/ctx.fixture.js'
import type { Preset, Track } from '../types.js'

/** Anchored to this file, not to cwd, so the test is invocation-independent. */
const GOLDEN = fileURLToPath(new URL('./presets.golden.json', import.meta.url))

const REGEN =
  'UPDATE_PRESET_GOLDEN=1 npx vitest run src/core/anim/presets.golden.test.ts'

/**
 * Every parameter each kind actually reads, set to a **non-default** value, so
 * that a preset which stopped reading one of them produces a visibly different
 * track rather than silently falling back to the same default the bare case
 * already covers. Verified field by field against `presets.ts`, not copied
 * from a table.
 *
 * Keyed by kind and checked for exact agreement with `Object.keys(PRESETS)`
 * below: a kind added without a params entry must fail here rather than be
 * captured as a bare invocation only.
 */
const FULL: Record<string, Record<string, unknown>> = {
  flip: { axis: 'x' },                        // default 'y'
  move: { from: [-13, 7], to: [250, -40] },   // defaults [0,0], [0,0]
  push: { from: 0.2, to: 0.85 },              // defaults 0 and ctx.layerDepth
  rotate: { from: -30, to: 210, axis: 'x' },  // defaults 0, 0, 'z'
  scale: { from: 0.25, to: 3.5 },             // defaults 1 and 1
}

/**
 * Cases beyond the three every kind gets.
 *
 * `move`'s `speed` is here rather than in `FULL` on purpose. `FULL` feeds
 * `move/params` and `move/params+overrides`, whose outputs are the recorded
 * proof that renaming `slide` to `move` changed nothing; adding `speed` there
 * would give both a derived `duration` and destroy that evidence. It is also
 * mutually exclusive with the `duration` that `params+overrides` sets, so it
 * could not go there in any case.
 *
 * `[0,0] → [300,400]` at 25 px/sec is a 3-4-5 triangle scaled by 100: the
 * distance is exactly 500 and the duration exactly 20, both representable. An
 * implementation that measured one axis only would record 12 or 16 instead.
 *
 * `scale/bezier-ease` records that a `cubic-bezier(...)` survives compilation
 * into the `Track` as the string it was written as. It is an EXTRA rather
 * than a change to any `FULL` entry on purpose: widening what `ease` accepts
 * must not move a single recorded output, and editing a `FULL` entry would
 * have rewritten three existing tracks and destroyed that evidence. `scale`
 * because its own default is `linear`, so the override is visible, and
 * because its track is two keys of one channel — nothing else in the
 * recorded output can absorb a mistake.
 */
const EXTRA: Record<string, { label: string, params: Record<string, unknown> }[]> = {
  move: [{ label: 'speed', params: { from: [0, 0], to: [300, 400], speed: 25 } }],
  scale: [{ label: 'bezier-ease', params: { ease: 'cubic-bezier(.17,.67,.83,.67)' } }],
}

/**
 * `easeIn` is the one easing no preset defaults to (the five defaults are
 * `linear` four times and `easeOut` for `push`), so a single constant is
 * non-default for every kind.
 */
const OVERRIDE_EASE = 'easeIn'
/** Both default to *absent*, so any finite value is a non-default. */
const OVERRIDE_START = 2.5
const OVERRIDE_DURATION = 3.75

interface Case {
  kind: string
  label: string
  input: Preset
  output: Track
}

/**
 * Derived from the kind's own bare compile rather than hardcoded. All five
 * surviving verbs default to `once`, so a literal would do today — but that
 * was not true while `bounce` (`loop`) and `bob` (`pingpong`) were
 * registered, and a collision leaves the overrides case unable to prove
 * `overrides()` ran at all. Deriving it is what made the deletion safe, and
 * it is what will keep it safe when P6's templates come back.
 */
function overrideRepeat(kind: string): string {
  return compilePreset({ kind }, GOLDEN_CTX).repeat === 'pingpong' ? 'loop' : 'pingpong'
}

/**
 * The corpus, driven from `Object.keys(PRESETS)` rather than a literal list.
 * A hand-written list is exactly how `slide-in` went undocumented in the design
 * doc for six revisions; the registry is the only honest source.
 */
function buildCases(): Case[] {
  const out: Case[] = []
  for (const kind of Object.keys(PRESETS).sort()) {
    const full = FULL[kind]
    if (full === undefined) {
      throw new Error(
        `preset "${kind}" is registered but has no FULL params entry in ` +
        'presets.golden.test.ts — add one (every parameter it reads, at a ' +
        'non-default value) and regenerate the fixture.',
      )
    }
    const inputs: { label: string, input: Preset }[] = [
      { label: 'bare', input: { kind } },
      { label: 'params', input: { kind, ...full } },
      {
        label: 'params+overrides',
        input: {
          kind,
          ...full,
          ease: OVERRIDE_EASE,
          repeat: overrideRepeat(kind),
          start: OVERRIDE_START,
          duration: OVERRIDE_DURATION,
        },
      },
      ...(EXTRA[kind] ?? []).map(e => ({ label: e.label, input: { kind, ...e.params } })),
    ]
    for (const { label, input } of inputs) {
      out.push({ kind, label, input, output: compilePreset(input, GOLDEN_CTX) })
    }
  }
  return out
}

interface Golden {
  /** Recorded so that moving the ctx shows up as a fixture diff, not silently. */
  ctx: typeof GOLDEN_CTX
  cases: Case[]
}

const actual: Golden = { ctx: GOLDEN_CTX, cases: buildCases() }

if (process.env['UPDATE_PRESET_GOLDEN']) {
  // Generated, never hand-edited: a hand-maintained table holding several
  // tracks for every registered verb would drift from the code it is supposed
  // to witness.
  writeFileSync(GOLDEN, JSON.stringify(actual, null, 2) + '\n')
}

/**
 * Read eagerly but fail lazily. The verifier re-establishes RED by deleting
 * the fixture, and a missing file must produce a sentence that says what to do
 * rather than a `Cannot read properties of null` from somewhere downstream.
 */
function requireGolden(): Golden {
  if (!existsSync(GOLDEN)) {
    throw new Error(`golden fixture missing: ${GOLDEN}\nregenerate with: ${REGEN}`)
  }
  try {
    return JSON.parse(readFileSync(GOLDEN, 'utf8')) as Golden
  } catch (e) {
    throw new Error(`golden fixture is not valid JSON: ${GOLDEN}\nregenerate with: ${REGEN}\n${e}`)
  }
}

describe('preset golden corpus', () => {
  it('has a committed fixture', () => {
    expect(existsSync(GOLDEN), `missing ${GOLDEN} — regenerate with: ${REGEN}`).toBe(true)
  })

  it('has a params entry for every registered kind, and no stale ones', () => {
    // Catches a kind added or removed without the corpus being updated, from
    // the input side — before `buildCases()` throws or quietly shrinks.
    expect(Object.keys(FULL).sort()).toEqual(Object.keys(PRESETS).sort())
  })

  it('covers exactly the registered kinds', () => {
    const golden = requireGolden()
    expect([...new Set(golden.cases.map(c => c.kind))].sort())
      .toEqual(Object.keys(PRESETS).sort())
  })

  it('compiles against the recorded ctx', () => {
    expect(requireGolden().ctx).toEqual(GOLDEN_CTX)
  })

  it('compiles every case to its recorded track', () => {
    const golden = requireGolden()
    const key = (c: Case): string => `${c.kind}/${c.label}`
    expect(actual.cases.map(key)).toEqual(golden.cases.map(key))
    // Case by case rather than one deep-equal over the array. Editing any
    // single number in the fixture turns this red either way — that is the
    // acceptance criterion — but a whole-corpus diff prints every track in
    // the corpus and buries the one that moved, and reading this diff is the
    // entire job of the rename task downstream.
    for (const [i, c] of actual.cases.entries()) {
      const want = golden.cases[i]!
      expect(c.input, `recorded input drifted for ${key(c)}`).toEqual(want.input)
      expect(c.output, `${key(c)} no longer compiles to its recorded track`).toEqual(want.output)
    }
  })
})
