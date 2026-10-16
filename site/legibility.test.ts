import { describe, expect, it } from 'vitest'
import {
  INK_FRACTION,
  TIGHT_MULTIPLE,
  UNMEASURED_INK,
  describeLegibility,
  disparityBudget,
  legibilityOf,
  measureInk,
  soloLayerScene,
} from './legibility.js'
import { DEFAULT_STEREO } from '../src/core/index.js'
import type { Scene, StereoOpts } from '../src/core/types.js'

/**
 * The legibility warning's arithmetic.
 *
 * Every assertion here is over a hand-built depth map, because that is the
 * whole claim being made: the check is computable from the *depth map*, so it
 * needs no canvas, no font stack and no browser. What a real font actually
 * measures is a separate question and is not asserted here — see the file
 * comment in `legibility.ts` for why no number in this file is physical.
 */

/** A `width × height` depth map with `rows` painted by a per-pixel callback. */
function map(width: number, height: number, at: (x: number, y: number) => number): Float32Array {
  const out = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) out[y * width + x] = at(x, y)
  }
  return out
}

const STEREO: StereoOpts = { ...DEFAULT_STEREO }

describe('measureInk', () => {
  it('measures a single bar as its own width', () => {
    // One 6px run on each of 4 rows: every run is 6, so the median is 6 and it
    // rests on 4 of them.
    const depth = map(20, 4, x => (x >= 5 && x < 11 ? 1 : 0))
    const m = measureInk(depth, 20, 4)
    expect(m.measured).toBe(true)
    expect(m.medianRun).toBe(6)
    expect(m.runs).toBe(4)
    expect(m.peak).toBe(1)
  })

  it('counts each run on a row separately', () => {
    // Two 3px runs per row, 2 rows → 4 runs of 3.
    const depth = map(20, 2, x => ((x >= 2 && x < 5) || (x >= 10 && x < 13) ? 1 : 0))
    const m = measureInk(depth, 20, 2)
    expect(m.runs).toBe(4)
    expect(m.medianRun).toBe(3)
  })

  it('takes the median, so one wide crossbar does not hide narrow stems', () => {
    // Four rows of a 2px stem and one row of a 40px bar: the mean would be
    // 9.6 and read as comfortable, the median is 2 and reads as unfusable.
    // This is the whole reason the median is the statistic.
    const depth = map(40, 5, (x, y) => (y === 2 ? 1 : x >= 4 && x < 6 ? 1 : 0))
    const m = measureInk(depth, 40, 5)
    expect(m.runs).toBe(5)
    expect(m.medianRun).toBe(2)
  })

  it('averages the two central runs for an even count', () => {
    const depth = map(30, 2, (x, y) => (y === 0 ? x < 4 : x < 6) ? 1 : 0)
    const m = measureInk(depth, 30, 2)
    expect(m.runs).toBe(2)
    expect(m.medianRun).toBe(5)
  })

  it('thresholds at a fraction of the peak, so antialiasing is not counted as stroke', () => {
    // A 4px core at depth 1 with one 0.25 fringe pixel either side. Counting
    // the fringe would report 6px for a stroke that only carries full
    // disparity over 4, so the default fraction excludes it.
    //
    // This is the *whole* of what the threshold choice is worth, and the
    // comment used to overstate it by calling it the "two defensible
    // definitions" problem: on real glyphs the two thresholds differ by 0–20%
    // and never by the ~2× an earlier pair of figures implied (see
    // `legibility.ts`, and §9 of `docs/2026-10-09-testing-retrospective.md`
    // for what actually produced that pair). A hand-built fixture can make the
    // gap 50%; a rendered stem cannot.
    const depth = map(20, 1, x => (x === 5 || x === 10 ? 0.25 : x > 5 && x < 10 ? 1 : 0))
    expect(measureInk(depth, 20, 1).medianRun).toBe(4)
    // ...and a caller who wants the other definition gets 6, not a different
    // scale factor on 4 — which is precisely why the threshold is a parameter
    // and the comparison is calibrated rather than derived.
    expect(measureInk(depth, 20, 1, 0.01).medianRun).toBe(6)
  })

  it('scales the threshold to the layer, not to 1.0', () => {
    // A layer at depth 0.4 is still fully opaque ink; its stroke must measure
    // the same as one at depth 1. Thresholding at an absolute 0.5 would report
    // this map as empty.
    const depth = map(20, 2, x => (x >= 5 && x < 8 ? 0.4 : 0))
    const m = measureInk(depth, 20, 2)
    // Float32 cannot hold 0.4 exactly, hence toBeCloseTo rather than toBe.
    expect(m.peak).toBeCloseTo(0.4, 6)
    expect(m.threshold).toBeCloseTo(0.2, 6)
    expect(m.medianRun).toBe(3)
  })

  it('reports an empty depth map as unmeasured rather than as zero', () => {
    // 0 would read as a measurement — "a 0px stroke" — and would grade as the
    // worst possible legibility for a layer that simply is not there.
    const m = measureInk(new Float32Array(40), 20, 2)
    expect(m.measured).toBe(false)
    expect(m.runs).toBe(0)
    expect(Number.isNaN(m.medianRun)).toBe(true)
  })

  it('treats a layer pinned at depth 0 as unmeasured', () => {
    // `rasterDepth` returns depth, not coverage, so ink at depth 0 is
    // indistinguishable from no ink at all. That is not a loss: depth 0 is the
    // background plane, so such a layer encodes no disparity to fuse.
    const m = measureInk(map(20, 2, () => 0), 20, 2)
    expect(m.measured).toBe(false)
  })

  it('ignores non-finite samples instead of poisoning the peak', () => {
    const depth = map(20, 1, x => (x === 0 ? Number.NaN : x >= 5 && x < 9 ? 1 : 0))
    const m = measureInk(depth, 20, 1)
    expect(m.peak).toBe(1)
    expect(m.medianRun).toBe(4)
  })

  it('does not join runs across a row boundary', () => {
    // Every pixel of a 5px-wide map is ink: 3 runs of 5, never one of 15. A
    // row-major loop that forgot to reset at the row edge would say 15.
    const m = measureInk(map(5, 3, () => 1), 5, 3)
    expect(m.runs).toBe(3)
    expect(m.medianRun).toBe(5)
  })

  it('refuses a depth map whose length does not match its dimensions', () => {
    expect(() => measureInk(new Float32Array(10), 4, 4)).toThrowError(/4×4.*16.*10/)
    expect(() => measureInk(new Float32Array(0), 0, 4)).toThrowError(/positive/)
  })

  it('refuses a fraction outside (0, 1]', () => {
    const depth = map(8, 1, () => 1)
    expect(() => measureInk(depth, 8, 1, 0)).toThrowError(/fraction/)
    expect(() => measureInk(depth, 8, 1, 1.5)).toThrowError(/fraction/)
  })
})

describe('disparityBudget', () => {
  it('is the gap between the two separations, 18px at the defaults', () => {
    expect(disparityBudget(DEFAULT_STEREO)).toBe(18)
  })

  it('does not scale by noiseScale, because the depth map does not either', () => {
    // `rasterDepth` works at `scene.size`; `upscale` runs after the encoder.
    // Multiplying the budget here while the measurement stays in scene pixels
    // would make the warning wrong by exactly `noiseScale`.
    expect(disparityBudget({ ...DEFAULT_STEREO, noiseScale: 4 })).toBe(18)
  })

  it('shrinks as sepNear rises', () => {
    // The title used to end "— the trade the warning has to offer", and the
    // warning no longer offers it: P7 criterion 5. The arithmetic is still
    // worth pinning, because `fusionComfort` reads the same quantity and a
    // smaller budget is genuinely easier to *fuse* — it is only legibility
    // the budget does nothing for.
    expect(disparityBudget({ ...DEFAULT_STEREO, sepNear: 104 })).toBe(6)
  })
})

describe('legibilityOf', () => {
  const at = (medianRun: number) =>
    ({ medianRun, runs: 100, peak: 1, threshold: 0.5, measured: true })

  it('grades a stroke narrower than the budget as unfusable', () => {
    expect(legibilityOf(at(17), 18).grade).toBe('illegible')
    expect(legibilityOf(at(9), 18).grade).toBe('illegible')
  })

  it('grades exactly the budget as tight, not as unfusable', () => {
    // The rule is "narrower than the budget", so the boundary belongs to the
    // side that still has a shift to carry.
    expect(legibilityOf(at(18), 18).grade).toBe('tight')
  })

  it('needs TIGHT_MULTIPLE budgets to grade clear, and says where that is', () => {
    // **`clearAt` is read from the reading rather than recomputed here, and
    // that is the point of P7 criterion 2.** These three lines used to say
    // `at(18 * TIGHT_MULTIPLE - 1)`, which is a downstream copy of a
    // perceptual boundary's arithmetic — the shape criterion 6 forbids — and
    // it was the live witness that `legibilityOf` derived a quantity it did
    // not return. It returns it now.
    const boundary = legibilityOf(at(18), 18).clearAt
    expect(boundary).toBe(18 * TIGHT_MULTIPLE)
    expect(legibilityOf(at(boundary - 1), 18).grade).toBe('tight')
    expect(legibilityOf(at(boundary), 18).grade).toBe('clear')
  })

  it('reacts to the budget, not only to the stroke', () => {
    // Raising sepNear from 92 to 104 shrinks the budget to 6px, and the rule
    // as shipped then grades the same 9px stroke fusable. That is a property
    // of the *rule*, which is budget-relative, and it is why the warning
    // cannot be computed once at authoring time.
    //
    // It is **no longer offered to the author as a fix**, and the comment
    // here used to say it was ("the alternative the note offers to 'make the
    // text bigger'"). The 2026-10-12 findings measured the real threshold as
    // an absolute stroke width — 4/4 exact reads at a fixed 14px stroke
    // across a 3× budget sweep — so shrinking the budget moves the verdict
    // without moving what the viewer can see. The rule keeps its thresholds
    // (findings §5 declines to name a replacement); the advice went.
    expect(legibilityOf(at(9), 18).grade).toBe('illegible')
    expect(legibilityOf(at(9), 6).grade).toBe('tight')
    expect(legibilityOf(at(9), 4).grade).toBe('clear')
  })

  it('refuses to grade an unmeasured stroke or a non-positive budget', () => {
    expect(legibilityOf({ ...at(9), measured: false }, 18).grade).toBe('unmeasured')
    // sepNear >= sepFar is already a render error; there is no budget to
    // compare against, and 'clear' would be a lie told about an invalid scene.
    expect(legibilityOf(at(9), 0).grade).toBe('unmeasured')
    expect(legibilityOf(at(9), -4).grade).toBe('unmeasured')
  })

  it('reports the measurement and both boundaries beside the grade', () => {
    // P7 criterion 2: "a caller wanting numbers never reads the grade." The
    // illegible boundary is the budget itself and the clear boundary is
    // `clearAt`; between them a panel can draw the margin without importing
    // a single constant from the module.
    const r = legibilityOf(at(9), 18)
    expect(r).toEqual({
      medianRun: 9, budget: 18, clearAt: 18 * TIGHT_MULTIPLE, grade: 'illegible',
    })
  })
})

describe('describeLegibility', () => {
  const at = (medianRun: number, runs = 120) =>
    ({ medianRun, runs, peak: 1, threshold: 0.5, measured: true })

  it('reports the measurement and the budget, not only the verdict', () => {
    // Honesty requirement: the user must be able to see the margin rather
    // than trust a traffic light. Both numbers and the sample count appear.
    const text = describeLegibility(at(9), STEREO)
    expect(text).toContain('9 px')
    expect(text).toContain('18 px')
    expect(text).toContain('n=120')
  })

  it('shows how the budget was arrived at, so it is checkable', () => {
    expect(describeLegibility(at(9), STEREO)).toContain('110')
    expect(describeLegibility(at(9), STEREO)).toContain('92')
  })

  it('does not offer the budget as a second fix — the purchase does not exist', () => {
    // **This test asserted the opposite until 2026-10-15, and it was doing
    // its job: it is the sensor that caught P7 criterion 5's change, so it is
    // inverted with the reason recorded rather than deleted.** It read
    // "offers widening sepNear as well as enlarging the text", on the
    // rationale that "raising sepNear shrinks the budget at the cost of depth
    // range. A warning that only said 'bigger' would hide it."
    //
    // The 2026-10-12 findings supersede that. §1 round 2 held the stroke at
    // 14px and swept the budget over 10/18/24/30px — a 3× range — and read
    // 4/4 exact: **the legibility threshold is an absolute stroke width and
    // the budget is not a lever on it.** So the line was naming a real cost
    // (depth range *is* `sepFar − sepNear`) against no benefit, which the
    // findings call worse than silence. The rule's own thresholds are
    // untouched — findings §5 declines to replace them on one observer's
    // data — and only the advice went.
    //
    // Note what is deliberately *not* asserted: `/sepNear/`. The old test
    // used it as half its evidence and it could never have seen this change,
    // because the line prints `(sepFar 110 − sepNear 92)` to show how the
    // budget was arrived at. An instrument that cannot go red for the thing
    // it is checking is the failure mode this repo keeps paying for, so the
    // assertions below are on the *advice* words and the positive control
    // below them proves they can still see.
    const text = describeLegibility(at(9), STEREO)
    expect(text).not.toMatch(/depth range|shallower|less depth/i)
    expect(text).not.toMatch(/rais\w*\s+sepNear|sepNear\s+to\s+\w/i)
    expect(text).toContain('sepNear 92')
  })

  it('still tells the author the one thing that does help', () => {
    // The positive control for the assertion above: removing bad advice must
    // not quietly remove all of it. Stroke width is what the trials moved,
    // and type size is the author's lever on stroke width.
    expect(describeLegibility(at(9), STEREO)).toMatch(/enlarge the type/i)
    expect(describeLegibility(at(20), STEREO)).toMatch(/enlarge the type/i)
  })

  it('names the clear boundary in px as well as in budgets', () => {
    // `TIGHT_MULTIPLE` is interpolated into this one branch and nowhere else
    // a user can see, so the reword had to keep the grade boundary visible.
    // It is printed twice — the derived px figure first, because every other
    // number on the line is px, and the multiple after it.
    const tight = describeLegibility(at(20), STEREO)
    expect(tight).toContain(`${18 * TIGHT_MULTIPLE} px`)
    expect(tight).toContain(`${TIGHT_MULTIPLE}×`)
  })

  it('stops advising once the stroke clears the budget, but still shows the margin', () => {
    // The numbers stay — honesty requirement 2 applies to the good case too,
    // otherwise "fine" is the one grade the user cannot check. What goes away
    // is the instruction to change something.
    const clear = describeLegibility(at(60), STEREO)
    expect(clear).not.toMatch(/enlarge|raise|will not fuse|hard work/i)
    expect(clear).toContain('60 px')
    expect(clear).toContain('18 px')
  })

  it('never formats an unmeasured stroke as a quantity', () => {
    const text = describeLegibility({ ...at(9), measured: false, runs: 0 }, STEREO)
    expect(text).not.toMatch(/NaN/)
    expect(text).toContain(UNMEASURED_INK)
  })

  it('does not promise a heavier weight will help', () => {
    // What a heavier weight buys is the rasteriser's call: measured, Chromium
    // renders `900` byte-identically to `bold` on every family installed here
    // (all of which declare only 400 and 700), while `@napi-rs/canvas`
    // synthesises it at +13–25%. Neither is this code's business, so the advice
    // may say "bolder" only with that caveat, or not at all.
    const text = describeLegibility(at(9), STEREO)
    if (/bold|weight|900/i.test(text)) {
      expect(text).toMatch(/if|may|depend|font stack|not every|might/i)
    }
  })

  it('rounds the measurement rather than printing float noise', () => {
    expect(describeLegibility(at(9.5), STEREO)).toContain('10 px')
    expect(describeLegibility(at(9.5), STEREO)).not.toContain('9.5')
  })
})

describe('soloLayerScene', () => {
  const SCENE: Scene = {
    size: [640, 360],
    fps: 12,
    duration: 2,
    freezeNoise: true,
    stereo: { sepFar: 120 },
    layers: [
      { type: 'shape', shape: 'rect', w: 10, h: 10 },
      { type: 'text', text: 'HI', size: 90, anim: { kind: 'push' } },
    ],
  }

  it('isolates one layer so a neighbour cannot be measured as the text', () => {
    const solo = soloLayerScene(SCENE, 1)
    expect(solo.layers).toHaveLength(1)
    expect(solo.layers[0]).toBe(SCENE.layers[1])
  })

  it('keeps the frame grid, so the layer is sampled at the same phase', () => {
    // Dropping fps/duration would re-phase every track: the `push` above,
    // sampled at t=1.0 of a 2s scene, is half risen, where the same t of a 1s
    // default has it fully arrived — and the measured stroke width would be
    // of a frame nobody is looking at.
    const solo = soloLayerScene(SCENE, 1)
    expect(solo.size).toEqual(SCENE.size)
    expect(solo.fps).toBe(12)
    expect(solo.duration).toBe(2)
    expect(solo.freezeNoise).toBe(true)
    expect(solo.stereo).toEqual({ sepFar: 120 })
  })

  it('does not mutate the scene it was given', () => {
    const before = JSON.stringify(SCENE)
    soloLayerScene(SCENE, 0)
    expect(JSON.stringify(SCENE)).toBe(before)
  })

  it('refuses an index outside the scene', () => {
    expect(() => soloLayerScene(SCENE, 2)).toThrowError(/layer 2/)
    expect(() => soloLayerScene(SCENE, -1)).toThrowError(/layer -1/)
    expect(() => soloLayerScene(SCENE, 1.5)).toThrowError(/layer 1.5/)
  })
})

describe('the constants say what they are', () => {
  it('INK_FRACTION is a fraction of the layer peak', () => {
    expect(INK_FRACTION).toBeGreaterThan(0)
    expect(INK_FRACTION).toBeLessThanOrEqual(1)
  })

  it('TIGHT_MULTIPLE is more than one budget', () => {
    expect(TIGHT_MULTIPLE).toBeGreaterThan(1)
  })
})
