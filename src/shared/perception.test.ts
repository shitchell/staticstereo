import { describe, expect, it } from 'vitest'
import * as perception from './perception.js'
import * as shim from '../../site/legibility.js'
import { DEFAULT_STEREO } from '../core/index.js'
import { THRESHOLDS, THRESHOLD_NAMES } from './testing/perceptionRoster.js'
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
 * That file was the behaviour-preservation proof for the move: it was
 * unchanged, it imports through `site/legibility.ts`, and every arithmetic
 * claim about the rule is asserted there, so a move that altered a median, a
 * boundary or a verdict reddened it. What that file cannot say is anything
 * about the new path — it never names it — so this one exercises each export
 * where the code now lives, and pins the one relationship neither file could
 * state alone: **the shim's public surface and the module's are the same set,
 * name for name and binding for binding.**
 *
 * **"Unchanged" is past tense as of 2026-10-15.** P7 criteria 2 and 5 changed
 * `legibilityOf`'s return shape and the verdict string on purpose, so that
 * file is modified and is no longer a witness that nothing moved.
 *
 * **The sentence that followed was false, and it named its own reason for
 * being false.** It read: *"The thresholds still have not moved; what
 * witnesses that is the boundary tests below, which derive every budget from
 * the module's own constants and so cannot be satisfied by a number someone
 * retyped."* The derivation is exactly why they witness nothing. Measured:
 * `INK_FRACTION` 0.5 → 0.9 and `TIGHT_MULTIPLE` 2 → 3 each leave **this file**
 * at 21 passed, because every budget below is computed from the constant under
 * test and moves with it. A derived assertion is blind to intentional change
 * *and* to accidental change alike; it is the right shape for a guarantee and
 * the wrong one for a threshold.
 *
 * It is amended rather than deleted because the claim it makes is still the
 * one this file owes, and only the mechanism was wrong. What witnesses it now
 * is `pins every threshold to a literal, over a set the compiler enumerates`
 * at the foot of this file. The derived boundary tests stay exactly as they
 * are — they pin the shape, which is theirs to pin — and nothing below should
 * be rewritten to use a literal instead.
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

  it('thresholds against the layer peak, which an absolute 0.5 is not', () => {
    // **Why `INK_FRACTION` is not importable into the places that pass `0.5`
    // to `runLengths`, even though the two numbers are equal today.**
    //
    // `measureInk` counts a sample as ink at `depth >= peak * INK_FRACTION`.
    // `src/core/testing/metamorphic.ts`'s `runLengths` counts it at
    // `depth > threshold`, with the threshold **absolute**. On a layer at
    // full depth the two agree; on this one, at 0.4, the module measures a
    // 6px stroke and the absolute definition measures an empty map. They are
    // different definitions that coincide at one value of one field, and
    // importing the constant into the absolute call sites would assert a
    // coupling that does not exist — a guard whose cheapest satisfying action
    // is wrong. `src/node/metamorphic.real.test.ts` carries the other half of
    // this pair, at the call sites, and deliberately does not import from
    // here.
    //
    // Note the comparison differs too, and not only the scale: `>=` here
    // against `>` there. A sample exactly at the threshold is ink to this
    // function and is not to that one. Nothing can observe it today — depth
    // comes from 8-bit alpha, so a sample is k/255 and never exactly 0.5 —
    // which is precisely why it is written down rather than relied on.
    const peak = 0.4
    const depth = map(20, 4, x => (x >= 5 && x < 11 ? peak : 0))
    const m = perception.measureInk(depth, 20, 4)
    expect(m.measured).toBe(true)
    expect(m.medianRun).toBe(6)
    expect(m.peak).toBeCloseTo(peak, 6)
    expect(m.threshold).toBeCloseTo(peak * perception.INK_FRACTION, 6)
    // The absolute reading of the same map, written out rather than imported
    // so this assertion does not depend on a core testing helper: nothing at
    // all clears a flat 0.5.
    expect([...depth].filter(v => v > 0.5)).toHaveLength(0)
  })

  it('still refuses a depth map that does not match its dimensions', () => {
    // This read: *"The argument guard is the needle `site/dist.test.ts` greps
    // for to prove the player bundle left the editor's legibility code out.
    // Exercised here so that a move which kept the function and lost the guard
    // is red at the module as well as in the bundle check."* **The pairing it
    // claims exists in neither direction**, measured 2026-10-16:
    // `site/dist.test.ts`'s only `measureInk` needle is `'measureInk: the ink
    // fraction must be in (0, 1], got'` at line 1344 — the **fraction** guard,
    // thrown from `src/shared/perception.ts:171`. The guard annotated here is
    // the **dimension** guard, and no bundle check names it.
    //
    // Corrected rather than deleted because the assertion is worth keeping on
    // its own terms: the dimension guard is the one that turns a caller's
    // width/height mix-up into a message instead of a silently wrong median,
    // and nothing else in the suite exercises it. It simply is not the
    // module-side half of a bundle check, and a reader must not infer that
    // losing it would redden one.
    //
    // Reported and deliberately not fixed, because `site/dist.test.ts` is
    // P3b's: that row still carries `source: 'site/legibility.ts'`, which is
    // now a 46-line re-export shim containing no such string.
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
    expect(perception.legibilityOf(ink, stroke + 1).grade).toBe('illegible')
    expect(perception.legibilityOf(ink, stroke).grade).toBe('tight')
    expect(perception.legibilityOf(ink, stroke / perception.TIGHT_MULTIPLE).grade).toBe('clear')
  })

  it('refuses to grade what it cannot measure', () => {
    expect(perception.legibilityOf({ ...inkOf(9), measured: false }, 18).grade).toBe('unmeasured')
    expect(perception.legibilityOf(inkOf(9), 0).grade).toBe('unmeasured')
  })

  it('returns the boundaries it graded against, so no caller re-derives one', () => {
    // **P7 criterion 2, measured rather than argued.** The criterion is
    // "graded functions return quantities *and* a grade; a caller wanting
    // numbers never reads the grade", and the question put to this phase was
    // whether a bare `Legibility` string satisfies it with rationale. It does
    // not, and the discriminator the orchestrator named is whether the
    // function derives a quantity the caller cannot recover from the arguments
    // it was passed.
    //
    // It derives exactly one: `budget × TIGHT_MULTIPLE`, the stroke width in
    // scene px at which the grade turns `clear`. `budget` is an argument and
    // `medianRun` is a field of one, but `TIGHT_MULTIPLE` is neither — a
    // caller can only reach it by importing a second name from this module and
    // repeating the multiply. There was a live witness of exactly that before
    // this change: `site/legibility.test.ts` wrote
    // `legibilityOf(at(18 * TIGHT_MULTIPLE - 1), 18)`, which is a downstream
    // copy of a perceptual boundary's arithmetic and is the shape criterion 6
    // exists to stop.
    //
    // `fusionComfort` already honours this — it returns `plateau` and `cliff`
    // beside its grade "so a view that wants to draw a margin reads them
    // rather than inlining them". This is the same contract, stated the same
    // way, for the other axis.
    const r = perception.legibilityOf(inkOf(9), 18)
    expect(r.medianRun).toBe(9)
    expect(r.budget).toBe(18)
    expect(r.clearAt).toBe(18 * perception.TIGHT_MULTIPLE)
    expect(r.grade).toBe('illegible')
  })

  it('reports the boundaries even where it declines to grade', () => {
    // The quantities are not a reward for a gradeable input. A panel drawing
    // an axis still needs the budget it could not grade against, and the
    // alternative — `undefined` on the one path where the caller most needs to
    // explain itself — is the "subjective score and nothing else" shape R22
    // obligation 4 forbids, in its quiet form.
    const r = perception.legibilityOf({ ...inkOf(9), measured: false }, 18)
    expect(r.grade).toBe('unmeasured')
    expect(r.budget).toBe(18)
    expect(r.clearAt).toBe(18 * perception.TIGHT_MULTIPLE)
  })
})

describe('describeLegibility, at the new path', () => {
  it('leads with the quantities and puts the verdict after them', () => {
    // Design §10.3's contract, asserted as an ordering rather than as a
    // sentence: the reader must be able to see the margin before being told
    // what it means.
    //
    // **The second half of this comment was superseded 2026-10-15 and is
    // amended in place rather than deleted, because it is why nobody touched
    // the string for a week.** It read: "Pinning the wording would pin the
    // verdict text this phase is explicitly not allowed to change." The
    // ruling is the opposite — a verdict *string* is not a threshold, so
    // design §10.3's "lead with quantities" does land here, and the shipped
    // advice is the thing P7 criterion 5 exists to remove. What may not move
    // is the numbers: `INK_FRACTION`, `TIGHT_MULTIPLE` and the grade
    // boundaries in `legibilityOf`. The assertions below are deliberately
    // still structural — they are an ordering claim, not a wording one — so
    // they survived the reword untouched, which is the reason to write them
    // this way and not a reason to leave the comment stale.
    const line = perception.describeLegibility(inkOf(9), DEFAULT_STEREO)
    const verdict = line.indexOf('—')
    expect(verdict).toBeGreaterThan(0)
    expect(line.slice(0, verdict)).toMatch(/\d/)
  })

  it('does not offer the budget as a legibility lever', () => {
    // **P7 criterion 5.** The shipped line told the author to "raise sepNear
    // to shrink the budget — that buys legibility with depth range". The
    // 2026-10-12 findings call the advice worse than silence, and the reason
    // recorded in three documents before 2026-10-15 was wrong: it is *not*
    // that shrinking the budget makes fusion harder. Shrinking moves the
    // budget toward the measured plateau (§1's sweep: comfortable from a
    // budget of 0 to 22), so fusion gets **easier**.
    //
    // It is bad because the purchase does not exist. §1 round 2 held the
    // stroke at 14px and varied the budget across a 3× range — 10, 18, 24,
    // 30px — and read 4/4. The legibility threshold is an **absolute stroke
    // width**; the budget is not a lever on it at all. So the string
    // advertised a real cost (depth range *is* `sepFar − sepNear`) against
    // nothing, which is strictly worse than saying nothing.
    const line = perception.describeLegibility(inkOf(9), DEFAULT_STEREO)
    expect(line).not.toMatch(/depth range|shallower|less depth/i)
    // `sepNear` by itself is not the tell and must not be asserted on: the
    // line names it anyway, in `(sepFar 110 − sepNear 92)`, so that the
    // budget is checkable. What must be gone is sepNear as an *instruction*.
    expect(line).toContain('sepNear 92')
    expect(line).not.toMatch(/rais\w*\s+sepNear|sepNear\s+to\s+\w/i)
  })

  it('keeps the clear boundary visible, as a quantity and as the multiple', () => {
    // The trap in rewording this branch: `${TIGHT_MULTIPLE}×` was the grade
    // boundary's **only** user-facing appearance, so a reword that dropped it
    // would make the boundary invisible to the one reader who can see the
    // verdict. Resolved by printing both — the derived px figure first,
    // because design §10.3 says lead with quantities and px is the unit every
    // other number on the line is in, and the multiple after it, because that
    // is the form `TIGHT_MULTIPLE`'s own docblock reasons about.
    const stereo = DEFAULT_STEREO
    const budget = perception.disparityBudget(stereo)
    const ink = inkOf(budget + 1)
    const reading = perception.legibilityOf(ink, budget)
    expect(reading.grade).toBe('tight')
    const line = perception.describeLegibility(ink, stereo)
    expect(line).toContain(`${reading.clearAt} px`)
    expect(line).toContain(`${perception.TIGHT_MULTIPLE}×`)
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
  it('pins every threshold to a literal, over a set the compiler enumerates', () => {
    // **Invariant 4's narrow exception, and the measurement that bought it.**
    // "Assert on structure, not on values" is right everywhere else and is
    // wrong here: a threshold's whole content *is* its value, so a test that
    // derives its expectation from the constant cannot see the constant move.
    // Measured before this assertion existed, each mutation rebuilt and run
    // against the full suite:
    //
    //   INK_FRACTION         0.5 -> 0.9   1 red   (site/legibility.test.ts)
    //   TIGHT_MULTIPLE       2   -> 3     1 red   (site/legibility.test.ts)
    //   DEPTH_BLUR_RELIEF    1   -> 2     1 red   (perception.cardboarding)
    //   FUSION_PLATEAU_BUDGET 22 -> 20    1 red   (perception.fusion)
    //   FUSION_CLIFF_BUDGET  32  -> 30    1 red   (perception.fusion)
    //   STOP_COUNT_MAX       8   -> 7     1 red   (perception.stops)
    //   STOP_COUNT_MIN       6   -> 5     **2117 passed, 0 red**
    //
    // Six of the seven had picked up a witness along the way, one each, by
    // accident rather than by rule. The seventh had none, and it is not
    // dormant: at `sepFar: 100, sepNear: 92` that move takes `depthStops` from
    // **8 detents to 5**, with all 128 `[measured]` values in the suite
    // byte-identical. `perception.stops.test.ts` bounds the count with
    // `>= Math.min(STOP_COUNT_MIN, capacity)` and `<= STOP_COUNT_MAX`, so the
    // bounds move with the constants and hold at any value of them.
    //
    // **The set is derived, not listed.** Six-of-seven is the signature of
    // accident, so the fix cannot be six more literals typed into this file —
    // that is §9's hand-written list, and it would go short green the day the
    // module grows an eighth threshold. `PerceptionThresholdName` is the
    // module's numeric value exports as the compiler sees them, and
    // `THRESHOLDS` is checked against it in both directions by an
    // `AssertNever` pair. A new threshold is a typecheck error until someone
    // writes its number down.
    expect(THRESHOLD_NAMES.length).toBeGreaterThan(0)
    for (const name of THRESHOLD_NAMES) {
      expect(perception[name], `${name} has moved away from the literal the roster pins`)
        .toBe(THRESHOLDS[name][0])
    }
  })

  it('classifies exactly the module\'s numeric exports, neither more nor fewer', () => {
    // The runtime witness for the `AssertNever` pair, for the reason
    // `perception.ts` gives about `LAYER_RELIEF_KEYS`: the pair is enforced by
    // `npm run typecheck` alone, so without this the ratchet is invisible to
    // `npm test`, and the two gates run on different triggers. This one also
    // names the export that drifted, which the mapped form costs.
    const numeric = Object.entries(perception)
      .filter(([, v]) => typeof v === 'number')
      .map(([k]) => k)
      .sort()
    expect(numeric).toEqual([...THRESHOLD_NAMES].sort())
  })

  it('records what each threshold is and how good the evidence for it is', () => {
    // The half a machine cannot check. A literal says the number has not
    // moved; it cannot say the number is right, and these range from
    // arithmetic over a citation to one observer hedging three times in a
    // sentence. Identical in kind to `PARAM_KINDS` and `GRADING`, and
    // identically honest about its limits.
    for (const name of THRESHOLD_NAMES) {
      expect(THRESHOLDS[name][1].length, `${name} has no recorded reason`)
        .toBeGreaterThan(20)
    }
  })

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
