import { describe, expect, it } from 'vitest'
import * as perception from './perception.js'
import * as shim from '../../site/legibility.js'
import { DEFAULT_STEREO } from '../core/index.js'
import type { Scene } from '../core/types.js'
import type { InkMeasurement, Legibility } from './perception.js'
import type {
  InkMeasurement as ShimInkMeasurement,
  Legibility as ShimLegibility,
} from '../../site/legibility.js'

/**
 * The perception module **at its own path**, and the shim that keeps the old
 * one resolving.
 *
 * This file is deliberately not a second copy of `site/legibility.test.ts`.
 * That file is the behaviour-preservation proof for the move: it is unchanged,
 * it imports through `site/legibility.ts`, and every arithmetic claim about the
 * rule is already asserted there, so a move that altered a median, a boundary
 * or a verdict reddens it. What that file cannot say is anything about the new
 * path — it never names it — so this one exercises each export where the code
 * now lives, and pins the one relationship neither file could state alone:
 * **the shim's public surface and the module's are the same set, name for name
 * and binding for binding.**
 *
 * Why a set comparison rather than the three names `site/main.ts` imports: a
 * shim that silently drops an export is the failure mode here, and spot-checks
 * cannot see a name nobody checked. §9's row on hand-written lists applies to
 * the obvious alternative — enumerating the surface in this file would go stale
 * the day the module grows P7's other six functions, and it would go stale
 * *green*, which is the worse half.
 */

/** A `width × height` depth map painted by a per-pixel callback. */
function map(width: number, height: number, at: (x: number) => number): Float32Array {
  const out = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) out[y * width + x] = at(x)
  }
  return out
}

/** A measured ink reading of `medianRun`, for the grading tests. */
function inkOf(medianRun: number): InkMeasurement {
  return { medianRun, runs: 64, peak: 1, threshold: 0.5, measured: true }
}

describe('the shim and the module are one surface', () => {
  it('re-exports every name, with no name of its own', () => {
    // Set equality in both directions at once. A shim that dropped an export
    // and a shim that invented one are both failures of the same property —
    // "`site/legibility.ts` is this module and nothing else" — and that is
    // what keeps `site/legibility.test.ts` a proof about the moved code
    // rather than a proof about a wrapper.
    expect(Object.keys(shim).sort()).toEqual(Object.keys(perception).sort())
  })

  it('looked at a surface, so the equality above is not two empty sets', () => {
    // The vacuity floor for the comparison, and only that: it is not a count
    // of the surface, because a number chosen from today's surface is the
    // hand-written list again in numeric form (§9). What establishes the
    // population is `site/legibility.test.ts`, which imports eight names
    // through the shim and would fail to resolve if any were missing.
    expect(Object.keys(perception).length).toBeGreaterThan(0)
  })

  it('re-exports the bindings themselves, not copies of them', () => {
    // `export *` gives identity; a hand-written re-implementation, a default
    // re-wrap, or a transformed value would not. Identity is the structural
    // way to say "there is one rule here", which is the whole reason the
    // module exists: a second copy of a perceptual threshold is the defect
    // §2.6 exists to prevent, and a shim is exactly where one would appear.
    for (const name of Object.keys(perception) as (keyof typeof perception)[]) {
      expect(shim[name], `${name} is not the module's own binding`)
        .toBe(perception[name])
    }
  })

  it('carries the type surface through as the same types, not structural twins', () => {
    // Types are erased before `Object.keys` can see them, so the runtime
    // comparison above is blind to `InkMeasurement` and `Legibility`. These
    // four assignments are the typecheck-time half of the same claim and are
    // the reason the gate, not this assertion, is what enforces it — an
    // alias that stopped resolving through the shim is a `svelte-check`
    // error, which is why the body here needs nothing but a reachable
    // statement.
    const throughShim: ShimInkMeasurement = inkOf(9)
    const throughModule: InkMeasurement = throughShim
    const gradeThroughModule: Legibility = 'tight'
    const gradeThroughShim: ShimLegibility = gradeThroughModule
    expect(throughModule.measured).toBe(true)
    expect(gradeThroughShim).toBe('tight')
  })
})

describe('measureInk, at the new path', () => {
  it('measures horizontal runs rather than ink area', () => {
    // One run per row of a known width: the median is that width whatever the
    // row count, which is the guarantee — a implementation that summed
    // coverage, or that joined runs across the row boundary, cannot produce
    // it. The arithmetic itself is `site/legibility.test.ts`'s subject.
    const width = 6
    const m = perception.measureInk(map(20, 4, x => (x >= 5 && x < 5 + width ? 1 : 0)), 20, 4)
    expect(m.measured).toBe(true)
    expect(m.medianRun).toBe(width)
    expect(m.runs).toBe(4)
  })

  it('still refuses a depth map that does not match its dimensions', () => {
    // The argument guard is the needle `site/dist.test.ts` greps for to prove
    // the player bundle left the editor's legibility code out. Exercised here
    // so that a move which kept the function and lost the guard is red at the
    // module as well as in the bundle check.
    expect(() => perception.measureInk(new Float32Array(10), 4, 4)).toThrowError(/4×4/)
  })
})

describe('disparityBudget, at the new path', () => {
  it('is invariant under noiseScale, including at the real default', () => {
    // The docblock's standing warning, as a sensor. `rasterDepth` works at
    // `scene.size` and `upscale` runs after the encoder, so the budget and the
    // measurement are both in scene px and neither is scaled — design §10.6's
    // rule that every perception function takes and returns scene px.
    //
    // `DEFAULT_STEREO.noiseScale` is read rather than written: the clause this
    // test guards was stale precisely because it had a default written into
    // it, and it said 1 while the default had become 2. A literal here would
    // reproduce that defect in the test that is supposed to catch it.
    const budget = perception.disparityBudget(DEFAULT_STEREO)
    for (const noiseScale of [1, DEFAULT_STEREO.noiseScale, DEFAULT_STEREO.noiseScale * 2]) {
      expect(perception.disparityBudget({ ...DEFAULT_STEREO, noiseScale })).toBe(budget)
    }
  })
})

describe('legibilityOf, at the new path', () => {
  it('grades monotonically in the budget, with the boundaries derived from the module', () => {
    // Every budget here is computed from the stroke and from `TIGHT_MULTIPLE`,
    // so this test owns no perceptual number of its own and cannot contradict
    // the module when the calibration round finally moves one. What it pins is
    // the shape the three grades have to keep: shrinking the budget against a
    // fixed stroke can only improve the verdict, and the boundary at exactly
    // one budget falls on the `tight` side.
    const stroke = 9
    const ink = inkOf(stroke)
    expect(perception.legibilityOf(ink, stroke + 1)).toBe('illegible')
    expect(perception.legibilityOf(ink, stroke)).toBe('tight')
    expect(perception.legibilityOf(ink, stroke / perception.TIGHT_MULTIPLE)).toBe('clear')
  })

  it('refuses to grade what it cannot measure', () => {
    expect(perception.legibilityOf({ ...inkOf(9), measured: false }, 18)).toBe('unmeasured')
    expect(perception.legibilityOf(inkOf(9), 0)).toBe('unmeasured')
  })
})

describe('describeLegibility, at the new path', () => {
  it('leads with the quantities and puts the verdict after them', () => {
    // Design §10.3's contract, asserted as an ordering rather than as a
    // sentence: the reader must be able to see the margin before being told
    // what it means. Pinning the wording would pin the verdict text this
    // phase is explicitly not allowed to change.
    const line = perception.describeLegibility(inkOf(9), DEFAULT_STEREO)
    const verdict = line.indexOf('—')
    expect(verdict).toBeGreaterThan(0)
    expect(line.slice(0, verdict)).toMatch(/\d/)
  })

  it('never formats an unmeasured stroke as a quantity', () => {
    const line = perception.describeLegibility({ ...inkOf(9), measured: false, runs: 0 }, DEFAULT_STEREO)
    expect(line).not.toMatch(/NaN/)
    expect(line).toContain(perception.UNMEASURED_INK)
  })
})

describe('soloLayerScene, at the new path', () => {
  const SCENE: Scene = {
    size: [640, 360],
    fps: 12,
    duration: 2,
    freezeNoise: true,
    layers: [
      { type: 'shape', shape: 'rect', w: 10, h: 10 },
      { type: 'text', text: 'HI', size: 90 },
    ],
  }

  it('keeps the frame grid while isolating the layer, and mutates nothing', () => {
    // Dropping `fps`/`duration` would re-phase every animator and measure a
    // frame nobody is looking at; mutating the scene would make the panel's
    // measurement a side effect on the document being edited.
    const before = JSON.stringify(SCENE)
    const solo = perception.soloLayerScene(SCENE, 1)
    expect(solo.layers).toEqual([SCENE.layers[1]])
    expect({ size: solo.size, fps: solo.fps, duration: solo.duration })
      .toEqual({ size: SCENE.size, fps: SCENE.fps, duration: SCENE.duration })
    expect(JSON.stringify(SCENE)).toBe(before)
  })

  it('refuses an index the scene does not have', () => {
    expect(() => perception.soloLayerScene(SCENE, SCENE.layers.length)).toThrowError(/layer/)
  })
})

describe('the constants are what they claim to be', () => {
  it('INK_FRACTION is a fraction of the layer peak', () => {
    expect(perception.INK_FRACTION).toBeGreaterThan(0)
    expect(perception.INK_FRACTION).toBeLessThanOrEqual(1)
  })

  it('TIGHT_MULTIPLE is more than one budget', () => {
    expect(perception.TIGHT_MULTIPLE).toBeGreaterThan(1)
  })

  it('UNMEASURED_INK cannot be read as a measurement', () => {
    // It stands where a number would stand, so the one thing it must not be
    // is parseable as one — `—` beside "px" is a gap, `0` beside "px" is a
    // claim that the stroke is zero wide.
    expect(Number.isNaN(Number(perception.UNMEASURED_INK))).toBe(true)
  })
})
