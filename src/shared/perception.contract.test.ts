import { describe, expect, it } from 'vitest'
import { DEFAULT_STEREO, STEREO_KEYS } from '../core/index.js'
import type { Scene } from '../core/types.js'
import * as perception from './perception.js'
import {
  PARAM_KINDS, PERCEPTION_FUNCTIONS, SIGNATURES, argumentFor,
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
