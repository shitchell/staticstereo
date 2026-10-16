import { describe, expect, it } from 'vitest'
import { DEFAULT_STEREO, STEREO_KEYS } from '../core/index.js'
import type { Scene } from '../core/types.js'
import * as perception from './perception.js'
import {
  GRADED_FUNCTIONS, GRADING, PARAM_KINDS, PERCEPTION_FUNCTIONS, SIGNATURES,
  argumentFor, callWith,
} from './testing/perceptionRoster.js'

/**
 * **P7 criterion 8** (R22 obligation 4): no perception signature takes a
 * subjective parameter.
 *
 * The roster this drives — and the compile-time ratchet that keeps it honest —
 * is `src/shared/testing/perceptionRoster.ts`, which carries the reasoning.
 * It lives in a plain module rather than here because
 * `perception.throws.test.ts` drives the same roster, and a test file that
 * imports another test file re-registers its `describe` blocks in both runs.
 *
 * What is below is the **runtime witness**: `AssertNever` is enforced by
 * `npm run typecheck` alone, so without these assertions the ratchet is
 * invisible to `npm test`. That is the reason `perception.ts` gives for
 * exporting `LAYER_RELIEF_KEYS` at all, and it applies unchanged.
 */

/* ──────────────────────────── the sensors ──────────────────────────── */

describe('no perception signature takes a subjective parameter', () => {
  it('classifies exactly the module\'s exported functions, neither more nor fewer', () => {
    // The runtime witness for the `AssertNever` pair above. `perception.ts`
    // states the reason it exports `LAYER_RELIEF_KEYS` at all: "`AssertNever`
    // is enforced by `npm run typecheck` alone, so without a runtime witness
    // the ten lines below are invisible to `npm test`." Same here — and this
    // one also recovers the error message the mapped `ArityDrift` form costs,
    // by naming the export that drifted.
    const exported = Object.entries(perception)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => k)
      .sort()
    expect(exported).toEqual([...PERCEPTION_FUNCTIONS].sort())
  })

  it('looked at a surface, so that equality is not two empty sets', () => {
    // The vacuity floor, and only that: a count taken from today's roster
    // would be the hand-written list again in numeric form (§9).
    expect(PERCEPTION_FUNCTIONS.length).toBeGreaterThan(0)
    expect(PERCEPTION_FUNCTIONS.every(n => SIGNATURES[n].length > 0)).toBe(true)
  })

  it('declares no parameter the module has not justified as a scene fact', () => {
    // Criterion 8 proper, and the honest reading of it. What is checkable is
    // that every parameter is classified and every classification carries a
    // recorded reason naming where in the document the value is read from.
    // What is *not* checkable is whether a reason is true — see this file's
    // header. This assertion makes the set self-enumerating; the reviewer makes
    // it correct.
    for (const name of PERCEPTION_FUNCTIONS) {
      for (const kind of SIGNATURES[name]) {
        expect(PARAM_KINDS[kind], `${name}'s ${kind} parameter has no recorded reason`)
          .toBeTruthy()
      }
    }
  })

  it('has not grown a required parameter the roster does not describe', () => {
    // The runtime half of `ArityDrift`. `Function.length` counts the parameters
    // before the first optional one, so a *required* parameter added to any of
    // these is caught by `npm test` as well as by the gate — which matters
    // because the two run on different triggers.
    for (const name of PERCEPTION_FUNCTIONS) {
      const fn = perception[name] as (...a: unknown[]) => unknown
      expect(fn.length, `${name} takes more required parameters than the roster declares`)
        .toBeLessThanOrEqual(SIGNATURES[name].length)
    }
  })

  it('reads no subjective field bolted onto an input, with no list involved', () => {
    // The half that bites without the roster, and the half that would catch an
    // author who added `isEasyToRead` *and* classified it. Every object-valued
    // argument is handed an extra field; if any function reads it, the answer
    // moves and the deep equality fails.
    //
    // The planted key is checked against `STEREO_KEYS` first so that a field
    // which later becomes a real part of `StereoOpts` cannot turn this
    // assertion into a tautology about a key the module is entitled to read.
    const SUBJECTIVE = 'isEasyToRead'
    expect(STEREO_KEYS as readonly string[]).not.toContain(SUBJECTIVE)

    const plant = <T extends object>(o: T): T => ({ ...o, [SUBJECTIVE]: 0.9 })
    const stereo = DEFAULT_STEREO
    const planted = plant(stereo)

    // **Pass-through is not reading, and the distinction had to be made.**
    // `soloLayerScene` returns `{ ...scene, layers: [...] }`, so a field
    // planted on its input reappears in its output and a naive comparison
    // reddens on a function that never looked at it. Stripping the key from
    // both answers keeps the assertion pointed at *dependence*: a function
    // that used the value in a computation, or that returned the value itself
    // rather than the object carrying it, still differs.
    const strip = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(strip)
      if (typeof v === 'object' && v !== null && !ArrayBuffer.isView(v)) {
        return Object.fromEntries(
          Object.entries(v).filter(([k]) => k !== SUBJECTIVE).map(([k, x]) => [k, strip(x)]),
        )
      }
      return v
    }

    for (const name of PERCEPTION_FUNCTIONS) {
      const fn = perception[name] as (...a: unknown[]) => unknown
      const clean = SIGNATURES[name].map(kind => argumentFor(kind, stereo))
      const dirty = SIGNATURES[name].map(kind => {
        const arg = argumentFor(kind, planted)
        if (kind === 'scene') {
          const scene = arg as Scene
          return plant({ ...scene, layers: scene.layers.map(plant) })
        }
        return typeof arg === 'object' && arg !== null && !ArrayBuffer.isView(arg)
          ? plant(arg)
          : arg
      })
      expect(strip(fn(...dirty)), `${name} reads a subjective field it was handed`)
        .toEqual(strip(fn(...clean)))
    }
  })
})

/**
 * **P7 criterion 2** (design §10): a graded function returns quantities *and*
 * a grade, so a caller that wants numbers never reads the judgement.
 *
 * The roster and the reasoning are in `perceptionRoster.ts`'s `GRADING`. The
 * short version: this criterion had no sensor, and the ratchet one section up
 * structurally cannot be one, because `SIGNATURES` and `ArityDrift` both read
 * `Parameters<F>` and a return type moves no key. `legibilityOf` returned a
 * bare `Legibility` string until 2026-10-15 — a grade with no numbers beside
 * it, which is R22 obligation 4's subjective score in its quietest form — and
 * nothing in this file moved when it was widened into a reading.
 */
describe('a graded perception function returns quantities beside the grade', () => {
  it('classifies exactly the module\'s functions as graded or objective', () => {
    // The runtime witness for `GRADING`'s `AssertNever` pair, same as the
    // roster's above: `npm run typecheck` enforces the types, and without
    // this the declaration is invisible to `npm test`.
    expect(Object.keys(GRADING).sort()).toEqual([...PERCEPTION_FUNCTIONS].sort())
  })

  it('looked at some graded functions, so the sweep below is not empty', () => {
    // The vacuity floor. A table that classified everything `objective` would
    // satisfy the sweep by having nothing to sweep, which is this project's
    // most-recorded failure shape.
    expect(GRADED_FUNCTIONS.length).toBeGreaterThan(0)
  })

  it('answers every graded call with an object carrying a finite number', () => {
    // Criterion 2's checkable half. *Which* numbers are right is each
    // function's own test; what is checkable here, over a set that cannot go
    // short, is that a caller wanting numbers is never handed a bare verdict.
    //
    // `DEFAULT_STEREO` and not a sweep: this is a shape claim, and the
    // stereo sweep belongs to `perception.throws.test.ts`, which drives the
    // same roster.
    for (const name of GRADED_FUNCTIONS) {
      const answer = callWith(name, DEFAULT_STEREO)
      expect(typeof answer, `${name} answers a ${typeof answer}, not a reading`)
        .toBe('object')
      const numbers = Object.entries(answer as Record<string, unknown>)
        .filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
        .map(([k]) => k)
      expect(numbers, `${name} grades without returning a single quantity`)
        .not.toHaveLength(0)
    }
  })

  it('owns a grade field exactly where the roster says graded', () => {
    // **The assertion that makes `Grading`'s two values mean something.**
    // Until this existed the column was decorative: V-4 censused all thirteen
    // rows against the sensors above and measured `graded → objective` as
    // **0 of 13** detectable — demoting a row only removes it from the sweep —
    // and `objective → graded` as 9 of 13, blind wherever the function already
    // answers with an object carrying a number (`measureInk`). So the table
    // was a real ratchet on *membership*, proved by the `AssertNever` pair,
    // and **no sensor at all on the value in it**.
    //
    // **Written as a biconditional, which is what closes both directions.**
    // The one-line strengthening V-4 ruled on is `graded ⇒ owns a grade`, and
    // that alone reddens exactly one row of thirteen — `cardboarding`, which
    // `perception.ts` has always called "Objective and ungraded" while the
    // roster said otherwise. It leaves `graded → objective` as blind as it
    // was, because a demoted row is still a row nothing checks. Asserting the
    // converse too — an `objective` function must *not* own a grade — costs
    // the same line and makes a demotion of `fusionComfort` or `legibilityOf`
    // red as well. Measured both ways, row by row, with the census recorded
    // in this file's commit.
    //
    // `grade` by name rather than by shape, because the name is the contract:
    // `FusionReading` and `LegibilityReading` both spell it, every consumer
    // reads `.grade`, and a structural test ("some string field") would pass
    // on `name` in a `DepthStop`.
    for (const name of PERCEPTION_FUNCTIONS) {
      const answer = callWith(name, DEFAULT_STEREO)
      const owns = typeof answer === 'object' && answer !== null
        && Object.hasOwn(answer, 'grade')
      expect(owns, `${name} is declared ${GRADING[name][0]} but ${owns ? 'owns' : 'does not own'} a grade field`)
        .toBe(GRADING[name][0] === 'graded')
    }
  })

  it('records a reason for every classification, graded or not', () => {
    // The half a machine cannot check is *whether* a function should be
    // graded, so the table forces the author to write the reason a reviewer
    // reads. Identical in kind to `PARAM_KINDS` above, and identically
    // honest about its limits.
    //
    // **The 20 is arbitrary-but-safe, and that is the honest account of it
    // rather than a derivation** (invariant 3: a constant with no recorded
    // reason is a review failure, so this is the reason). It is a vacuity
    // floor and nothing more: its whole job is to reject the empty string and
    // the placeholder that stands in for a reason nobody wrote — `''`,
    // `'TBD'`, `'todo'`, `'objective'`, `'see above'` are 0 to 9 characters —
    // while admitting any sentence that actually names where the judgement
    // came from. There is no measurement behind the number; the length of a
    // real reason is not a quantity this project has sampled.
    //
    // **The margin, measured, because an undocumented floor is the defect and
    // a documented one still has to be shown to clear.** All 13 `GRADING`
    // reasons were counted: the shortest is `soloLayerScene`'s 27 characters
    // ("A Scene with one layer kept"), the longest `cardboarding`'s 310, and
    // the median around 70. So the floor clears the nearest row by **7
    // characters** — a 1.35× margin, and thin. A shorter-but-legitimate reason
    // on a future one-line helper would redden this falsely, and the fix then
    // is to lower the floor, not to pad the prose.
    //
    // Deliberately a different instrument from `PARAM_KINDS`' `toBeTruthy()`
    // above, which is a floor of 1. That asymmetry is not principled either;
    // both are vacuity floors and only this one has ever been argued about.
    for (const name of PERCEPTION_FUNCTIONS) {
      const [kind, why] = GRADING[name]
      expect(['graded', 'objective']).toContain(kind)
      expect(why.length, `${name}'s ${kind} classification has no recorded reason`)
        .toBeGreaterThan(20)
    }
  })
})
