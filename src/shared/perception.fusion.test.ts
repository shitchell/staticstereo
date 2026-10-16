import { describe, expect, it } from 'vitest'
import { DEFAULT_STEREO } from '../core/index.js'
import type { StereoOpts } from '../core/types.js'
import {
  FUSION_CLIFF_BUDGET,
  FUSION_PLATEAU_BUDGET,
  disparityBudget,
  fusionComfort,
} from './perception.js'

/**
 * `fusionComfort` — the axis the findings document separates from legibility.
 *
 * Its own file rather than an addition to `perception.test.ts`. The reason
 * given when this file was written was: *"that file is the
 * behaviour-preservation proof for the legibility move: it is unmodified by
 * this task, and keeping it that way is what lets it say anything about the
 * move at all."* **Both halves of that are now false, and the second was
 * false when written.** It is kept and corrected beside rather than deleted,
 * because four other files in this package chained off it and a reader
 * meeting one of them needs to find the correction here.
 *
 * *Spent.* `perception.test.ts` was modified at `b3e7601` and again at
 * `f352b99`, both later than `96dceb6`, which created this file. "Unmodified"
 * is past tense; the separation below stands on its own merits now and not as
 * anybody's proof.
 *
 * *Misattributed.* `perception.test.ts` was never the move's
 * behaviour-preservation proof. Its own docblock says it is **deliberately
 * not** a second copy of `site/legibility.test.ts` and names that file as the
 * witness — which was correct, and is also spent, since P7 criteria 2 and 5
 * modified `site/legibility.test.ts` on purpose. What pins the thresholds now
 * is `perception.test.ts`'s `pins every threshold to a literal, over a set
 * the compiler enumerates`, swept over a roster the compiler derives.
 *
 * **What this file exists to prevent is one specific bug**, and every
 * assertion below is chosen so that the bug reddens it. The rule keys on the
 * **budget** (`sepFar − sepNear`), not on `sepNear`. A `sepNear`-keyed
 * implementation is not a hypothetical: revision 1 of the design shipped one,
 * R22 was raised in response to it, and §9 of the execution plan carries it as
 * a trap row. So the pinned cases are paired with discriminators — a pin both
 * implementations pass is not a pin.
 */

/** The stereo defaults at a given pair of separations, and nothing else moved. */
function at(sepFar: number, sepNear: number): StereoOpts {
  return { ...DEFAULT_STEREO, sepFar, sepNear }
}

describe('fusionComfort keys on the budget, not on sepNear', () => {
  it('fires at sepFar 140 / sepNear 78 — a 62px budget, twice past the cliff', () => {
    // Design §10.2's first pinned case, asserted through the budget rather
    // than through the separations that produce it: the quantity is what the
    // rule is about, and a reading that graded 'hard' off the wrong number
    // would otherwise look identical here.
    const reading = fusionComfort(at(140, 78))
    expect(reading.budget).toBe(62)
    expect(reading.grade).toBe('hard')
  })

  it('stays silent at sepFar 100 / sepNear 80 — a 20px budget inside the plateau', () => {
    // The second pinned case, and the one that makes the pair discriminating:
    // `sepNear` 80 is the sweep's own "right at the edge of what's easy"
    // reading — but that was at `sepFar` 110, where 80 means a budget of 30.
    // At `sepFar` 100 the same `sepNear` is a budget of 20 and sits in the
    // measured plateau. Same `sepNear`, different answer; only the budget
    // tells them apart.
    const reading = fusionComfort(at(100, 80))
    expect(reading.budget).toBe(20)
    expect(reading.grade).toBe('comfortable')
  })

  it('grades one sepNear two ways when sepFar moves it across the cliff', () => {
    // The discriminator proper. `sepNear` is held fixed at the findings'
    // cliff value and only `sepFar` moves, so a `sepNear`-keyed rule — of any
    // boundary and either comparison direction — must return the same grade
    // for both and cannot satisfy this. 78 is the value deliberately chosen:
    // it is the one `sepNear` such an implementation is most likely to key on.
    const past = fusionComfort(at(140, 78))
    const inside = fusionComfort(at(95, 78))
    expect(past.budget).toBeGreaterThan(FUSION_CLIFF_BUDGET)
    expect(inside.budget).toBeLessThanOrEqual(FUSION_PLATEAU_BUDGET)
    expect(past.grade).toBe('hard')
    expect(inside.grade).toBe('comfortable')
  })

  it('grades two sepNears the same way when the budget is the same', () => {
    // The other half of "it is the budget": holding the budget and moving
    // both separations must not move the grade. A `sepNear`-keyed rule fails
    // this for the same reason it fails the test above — measured, by
    // planting one.
    //
    // It does **not** catch the other way to get the axis wrong. This comment
    // first claimed a `sepFar`-keyed rule "fails only this one"; planting
    // `sepFar > 120 ? 'hard' : sepFar > 110 ? 'unresolved' : …` left this test
    // green — both cells are above 120 — and reddened the two fixed-`sepFar`
    // scans below instead. Those scans hold `sepFar` at 110 and sweep
    // `sepNear`, which is exactly the shape a `sepFar`-keyed rule cannot
    // reproduce. Recorded rather than quietly corrected, because the claim
    // read as plausible and was wrong.
    const low = fusionComfort(at(140, 78))
    const high = fusionComfort(at(150, 88))
    expect(low.budget).toBe(high.budget)
    expect(low.grade).toBe(high.grade)
  })
})

describe('the unresolved band is reported as unresolved', () => {
  it('leaves every budget between the plateau and the cliff ungraded either way', () => {
    // The sweep has points at budget 22 and below (comfortable) and at 30 and
    // 32 (degrading), and nothing at all between 22 and 30 — so there is no
    // boundary in this band to find, and inventing one would be calibration.
    // Asserted over the whole band rather than at a sample, because the defect
    // this guards against is precisely a boundary placed *somewhere* in it.
    //
    // The two assertions after the loop are its vacuity floor, and they are
    // here because the first RED run caught this test passing with no
    // implementation at all: with both constants `undefined` the bounds are
    // `NaN`, the loop body never runs, and a bare `for` of expectations is
    // green over nothing. §6.5a — an assertion that cannot fail is not one.
    const graded = new Map<number, string>()
    for (let budget = FUSION_PLATEAU_BUDGET + 1; budget <= FUSION_CLIFF_BUDGET; budget++) {
      const reading = fusionComfort(at(110, 110 - budget))
      graded.set(reading.budget, reading.grade)
    }
    expect(graded.size).toBe(FUSION_CLIFF_BUDGET - FUSION_PLATEAU_BUDGET)
    expect([...new Set(graded.values())]).toEqual(['unresolved'])
  })

  it('puts the plateau edge and the cliff on the sides the sweep put them', () => {
    // Boundaries at the two measured points and nowhere else. The plateau's
    // own top reading (88 at sepFar 110, budget 22) was comfortable, so 22 is
    // comfortable; the cliff reading (78, budget 32) was "the true limit" and
    // the difficulty was reported *below* it, so 32 is not yet 'hard'.
    //
    // **Both sides of both boundaries**, and the plateau's upper side is here
    // because a mutation put it there: moving `FUSION_PLATEAU_BUDGET` from 22
    // to 26 — a boundary invented inside the unresolved band, the exact defect
    // this file guards — reddened nothing. Every other assertion about the
    // plateau either sits below it (budget 20, 22) or derives its bounds from
    // the constant itself and moves with it. Budget 23 is the one reading that
    // says *where* the plateau stops, and it is written as a budget on the
    // sweep's own `sepFar` so that it names a configuration rather than a
    // number: 23 is unresolved not because anything measured 23, but because
    // 22 is the last point anything measured as comfortable.
    expect(fusionComfort(at(110, 88)).grade).toBe('comfortable')
    expect(fusionComfort(at(110, 87)).grade).toBe('unresolved')
    expect(fusionComfort(at(110, 78)).grade).toBe('unresolved')
    expect(fusionComfort(at(110, 77)).grade).toBe('hard')
  })

  it('orders its two thresholds, so the band is non-empty by construction', () => {
    expect(FUSION_PLATEAU_BUDGET).toBeLessThan(FUSION_CLIFF_BUDGET)
  })
})

describe('the quantities are separable from the judgement', () => {
  it('reports the budget as the module already computes it, not as a second rule', () => {
    // Design §10's "quantities and a grade" obligation, and §2.6's: a caller
    // wanting the number reads `budget`, and that number is `disparityBudget`
    // itself rather than a reimplementation that could drift from it.
    for (const stereo of [DEFAULT_STEREO, at(140, 78), at(100, 80), at(110, 92)]) {
      expect(fusionComfort(stereo).budget).toBe(disparityBudget(stereo))
    }
  })

  it('reports the thresholds it graded against, so a view can show the margin', () => {
    // The view owns the warning (R22 obligation 2), and it cannot write "62px
    // against a cliff at 32" without being told the 32. Reading them off the
    // reading rather than importing the constants is what keeps the threshold
    // uninlined at the call site.
    const reading = fusionComfort(at(140, 78))
    expect(reading.plateau).toBe(FUSION_PLATEAU_BUDGET)
    expect(reading.cliff).toBe(FUSION_CLIFF_BUDGET)
  })
})

describe('it takes the stereo config and nothing else', () => {
  it('is invariant under noiseScale and under the encoder choice', () => {
    // Design §10.6: every perception function takes and returns scene px, and
    // `noiseScale` is applied after the encoder. `algorithm` is listed here
    // because `linked` is a value of it and not a boolean on `StereoOpts` —
    // the shape a rule reaching for "is this linked?" would expect.
    const base = fusionComfort(at(140, 78))
    for (const noiseScale of [1, DEFAULT_STEREO.noiseScale, DEFAULT_STEREO.noiseScale * 2]) {
      for (const algorithm of ['shift', 'linked'] as const) {
        expect(fusionComfort({ ...at(140, 78), noiseScale, algorithm })).toEqual(base)
      }
    }
  })

  it('advises rather than refuses when there is no budget at all', () => {
    // R22 obligation 2 as a property: the model never throws, clamps or
    // corrects. A `sepNear` at or above `sepFar` is a misconfiguration that
    // `describeLegibility` already reports in its own words; this function
    // does not duplicate that judgement and must not warn about a cliff that
    // nothing is near. Zero disparity is the far end of the sweep's own
    // plateau (`sepNear` 110 at `sepFar` 110), so silence is also what the
    // evidence says.
    expect(() => fusionComfort(at(110, 110))).not.toThrow()
    expect(fusionComfort(at(110, 110)).grade).toBe('comfortable')
    expect(fusionComfort(at(110, 130)).grade).toBe('comfortable')
  })

  it('does not mutate the config it is handed', () => {
    const stereo = at(140, 78)
    const before = JSON.stringify(stereo)
    fusionComfort(stereo)
    expect(JSON.stringify(stereo)).toBe(before)
  })
})
