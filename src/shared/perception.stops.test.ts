import { describe, expect, it } from 'vitest'
import { DEFAULT_STEREO, sepAt } from '../core/index.js'
import type { Layer, Scene, StereoOpts } from '../core/types.js'
import {
  collidingPairs, depthStops, encodableDepths, quantisationStep, restingDepth,
  STOP_COUNT_MAX, STOP_COUNT_MIN, type DepthStop,
} from './perception.js'

/**
 * `depthStops` — design §10.4's "named stops spaced across the encodable
 * separations, recomputed when `sepFar`/`sepNear` change".
 *
 * Its own file. The reason given when this file was written was the one
 * `perception.capacity.test.ts` records and `perception.collisions.test.ts`
 * repeats — *"those files are unmodified by this task, and keeping them that
 * way is what lets them say anything about it"* — and **that reason is
 * spent**: `perception.test.ts` was modified at `b3e7601` and `f352b99`, both
 * later than `76c5976`, which created this file. The chain was also wrong
 * about which file ever witnessed the legibility move; the correction is at
 * `perception.fusion.test.ts`'s docblock. The separation stands on its own
 * merits.
 *
 * **Four things this file exists to prevent.**
 *
 * 1. *A stop that does not land on a separation the encoder produces.* The
 *    weak form of that claim is vacuous — every depth in [0, 1] maps through
 *    `sepAt` to *some* separation, so "the stop's separation is in the band"
 *    cannot fail. The form asserted here is the strong one: each stop sits at
 *    the **centre** of its separation's rounding band, which `is centred on
 *    its separation's band` pins from both sides at once — a shade under half
 *    a step in either direction leaves the separation alone, a shade over
 *    changes it. A stop parked on a band *edge* passes the weak claim and
 *    fails this one.
 *
 * 2. *A literal count.* Execution plan §9: "a numeric floor chosen from
 *    today's count is a check — it is the same defect as a hand-written list,
 *    in numeric form". No assertion here contains a stop count. The
 *    discriminator is `divides the band exactly wherever the window allows`,
 *    which asserts only the structural property *all gaps equal* at two
 *    configurations measured to need **different** counts to achieve it — so
 *    no fixed number satisfies both.
 *
 * 3. *A restated encoder.* Every separation in this file is read off `sepAt`
 *    (orchestrator ruling E-7), never off `sepFar − z·range`. `6214ec5`
 *    measured the closed form for capacity disagreeing with the encoder in 8
 *    of 20 configurations — **8, not the 7 this read until 2026-10-16; the
 *    recount is `perception.capacity.test.ts`'s `names every disagreeing row
 *    of CONFIGS, and no other`, which is also what stops the figure being
 *    prose again** — and `CONFIGS` below carries the fractional, clamped
 *    and inverted regimes that produced those disagreements.
 *
 * 4. *A refusal.* R22 obligation 2 and P7 criterion 7: advisory only, never
 *    throws, the inverted pair included. `answers every StereoOpts without
 *    throwing` is that sensor.
 *
 * **What this file does not cover, because the module does not build it.**
 * Design §10.4's *application* rules — stops apply to `text` and `shape`, are
 * meaningless for heightmap layers (continuous per-pixel depth, though the
 * detents still render as reference), and apply only to the endpoints of
 * animated depth — are P4's, exactly as `collidingPairs` ships the depth-only
 * half of §10.4's tie badge and P4 filters by overlap. Nothing here asserts a
 * layer type, because nothing in `depthStops` reads one.
 */

/** The stereo defaults at a given pair of separations, and nothing else moved. */
function at(sepFar: number, sepNear: number): StereoOpts {
  return { ...DEFAULT_STEREO, sepFar, sepNear }
}

/** What `sepAt`'s upper clamp is given when no plate is in hand. Inert. */
const UNBOUNDED_PLATE = Number.POSITIVE_INFINITY

/** The separation the encoder actually produces for a depth, under `s`. */
function sepOf(s: StereoOpts, z: number): number {
  return sepAt(z, s.sepFar, s.sepFar - s.sepNear, UNBOUNDED_PLATE)
}

/**
 * The configurations swept.
 *
 * `perception.capacity.test.ts`'s twenty, carried rather than imported because
 * that file is one this task does not modify, plus two this function has its
 * own reason to hold: `10/-1000`, where the encoder's floor swallows all but
 * the first 0.8% of the depth axis — stops spaced evenly *in depth* collapse
 * onto one separation there, which is the bug that makes "spaced across the
 * encodable **separations**" the load-bearing half of design §10.4's
 * sentence — and `1e9/2`, where the band is wider than any plausible plate and
 * the arithmetic has to stay integral.
 */
const CONFIGS: readonly StereoOpts[] = [
  at(110, 92), at(110, 88), at(140, 78), at(100, 80), at(10, 9), at(10, 8),
  at(3, 2), at(200, 2), at(110.4, 92.3), at(110.5, 92.5), at(110.5, 92),
  at(110, 92.5), at(10.4, 8.4), at(99.7, 2.2), at(92, 110), at(110, 110),
  at(110, 1), at(110, 0), at(50, -10), at(2, 2), at(10, -1000), at(1e9, 2),
]

/** The separations a stop list encodes to, in order. */
function sepsOf(stops: readonly DepthStop[]): number[] {
  return stops.map(s => s.separation)
}

/** The size of each step between consecutive stops, in scene px. */
function gapsOf(stops: readonly DepthStop[]): number[] {
  const seps = sepsOf(stops)
  return seps.slice(1).map((v, i) => Math.abs(v - seps[i]!))
}

/** A scene whose layers sit one per stop, differing in nothing but depth. */
function sceneOn(stops: readonly DepthStop[]): Scene {
  return {
    size: [64, 64],
    layers: stops.map((s): Layer => ({ type: 'shape', shape: 'circle', r: 8, depth: s.depth })),
  }
}

describe('depthStops lands every stop on a separation the encoder produces', () => {
  it('reads each separation off sepAt, distinct, inside the band, both extremes held', () => {
    // Criterion 1, the half that is about the *set*: the stops are distinct
    // levels spanning the whole encodable band. Distinctness is the claim
    // design §10.4 rests on — two detents the encoder maps to one separation
    // are a lie told to the author — and it is the one that breaks first if
    // the count ever outruns the capacity, or if the stops are spaced in
    // depth rather than in separation (see `10/-1000` in CONFIGS).
    let seen = 0
    for (const s of CONFIGS) {
      const stops = depthStops(s)
      if (stops.length === 0) continue
      const far = sepOf(s, 0)
      const near = sepOf(s, 1)
      const lo = Math.min(far, near)
      const hi = Math.max(far, near)
      const seps = sepsOf(stops)
      for (const stop of stops) {
        expect(stop.separation, `${s.sepFar}/${s.sepNear} at depth ${stop.depth}`)
          .toBe(sepOf(s, stop.depth))
        expect(stop.separation, `${s.sepFar}/${s.sepNear} below the band`)
          .toBeGreaterThanOrEqual(lo)
        expect(stop.separation, `${s.sepFar}/${s.sepNear} above the band`)
          .toBeLessThanOrEqual(hi)
        seen++
      }
      expect(new Set(seps).size, `${s.sepFar}/${s.sepNear} repeats a separation`)
        .toBe(seps.length)
      expect(seps, `${s.sepFar}/${s.sepNear} misses the far extreme`).toContain(far)
      expect(seps, `${s.sepFar}/${s.sepNear} misses the near extreme`).toContain(near)
    }
    // The vacuity floor: a function returning `[]` everywhere satisfies every
    // loop above.
    expect(seen).toBeGreaterThan(0)
  })

  it('is centred on its separation\'s band, to within a shade of half a step', () => {
    // Criterion 1, the half that is about each *stop*, and the only form of
    // "lands on an encodable separation" that can fail. A rounding band is
    // exactly one `quantisationStep` wide in depth, so a stop at its centre
    // tolerates ±half a step and no more. Both directions are asserted:
    //
    //   ±0.49 step unchanged  — the stop is at least that far inside the band
    //   ±0.51 step changed    — and no further, i.e. it is the centre and not
    //                           merely somewhere inside
    //
    // The second is also the §6.5a control for the first. Without it "nothing
    // moved" would be satisfied by an instrument that cannot move at all; with
    // it, the same two calls are shown turning the answer over.
    //
    // Endpoints are excluded and handled by `pins its endpoints at the
    // authoring extremes` below: depth 0 and depth 1 are pinned to the axis
    // ends deliberately, and at a fractional `sepFar` or `sepNear` the band
    // centre for the extreme separation lies outside [0, 1] altogether.
    let interior = 0
    for (const s of CONFIGS) {
      const stops = depthStops(s)
      const step = quantisationStep(s)
      if (!Number.isFinite(step)) continue
      for (let i = 1; i < stops.length - 1; i++) {
        const { depth, separation } = stops[i]!
        const where = `${s.sepFar}/${s.sepNear} stop ${i}`
        expect(sepOf(s, depth + 0.49 * step), `${where} +0.49`).toBe(separation)
        expect(sepOf(s, depth - 0.49 * step), `${where} -0.49`).toBe(separation)
        expect(sepOf(s, depth + 0.51 * step), `${where} +0.51`).not.toBe(separation)
        expect(sepOf(s, depth - 0.51 * step), `${where} -0.51`).not.toBe(separation)
        interior++
      }
    }
    expect(interior).toBeGreaterThan(0)
  })

  it('pins its endpoints at the authoring extremes, which is where the default depth is', () => {
    // Depth 0 and depth 1 are stops by construction rather than by rounding,
    // and that is a decision with a consumer behind it. `restingDepth` reads
    // an absent `layer.depth` as 1 — "Default 1 (nearest)" in `types.ts` — so
    // every freshly-added layer sits at depth 1. Design §10.4 makes snapping
    // "the default gesture with a modifier to suspend"; a stop set whose
    // outermost detent fell short of 1 would mean the first nudge of a new
    // layer moved it off its own default and could never put it back. Depth 0
    // is the background plane and the same argument applies.
    for (const s of CONFIGS) {
      const stops = depthStops(s)
      if (stops.length === 0) continue
      expect(stops[0]!.depth, `${s.sepFar}/${s.sepNear} far end`).toBe(0)
      expect(stops[stops.length - 1]!.depth, `${s.sepFar}/${s.sepNear} near end`).toBe(1)
    }
    // And the consumer-level statement of it, through the function that owns
    // the default rather than through the literal 1.
    const fresh: Layer = { type: 'shape', shape: 'circle', r: 8 }
    expect(depthStops(DEFAULT_STEREO).map(s => s.depth)).toContain(restingDepth(fresh))
  })

  it('orders its stops along the depth axis, strictly', () => {
    // A detent list is consumed as a list: design §5.3 draws it left to right
    // along the strip. Equal or descending depths would make the strip's
    // nth detent not the nth stop, and an equality would be the same lie the
    // distinctness check above forbids, one axis over.
    for (const s of CONFIGS) {
      const stops = depthStops(s)
      for (let i = 1; i < stops.length; i++) {
        expect(stops[i]!.depth, `${s.sepFar}/${s.sepNear} stop ${i}`)
          .toBeGreaterThan(stops[i - 1]!.depth)
      }
    }
  })
})

describe('the stop count is derived from the constraint, not chosen', () => {
  it('keeps the two cited ranges overlapping at all', () => {
    // A tripwire on the constants themselves rather than on an output. The
    // window is the *intersection* of design §10.4's two citations — absolute
    // judgment of a 1-D stimulus at 4–8 categories, the lenticular trade at
    // 6–9 segments — so an edit that moved either past the other would leave
    // `stopCount` picking from an empty range and would do it silently. §9: a
    // recorded note is not a sensor.
    expect(STOP_COUNT_MIN).toBeLessThanOrEqual(STOP_COUNT_MAX)
    // And a window that cannot express a detent at all is not a window: two
    // stops is the least that is a *choice* between encodable depths.
    expect(STOP_COUNT_MIN).toBeGreaterThanOrEqual(2)
  })

  it('stays inside that window, and never asks for more stops than there are levels', () => {
    // The bound, stated against the exported constants rather than against
    // their values, so changing the evidence changes the test with it.
    for (const s of CONFIGS) {
      const stops = depthStops(s)
      const capacity = encodableDepths(s)
      const where = `${s.sepFar}/${s.sepNear}`
      if (stops.length === 0) continue
      expect(stops.length, `${where} outran the capacity`).toBeLessThanOrEqual(capacity)
      expect(stops.length, `${where} above the window`).toBeLessThanOrEqual(STOP_COUNT_MAX)
      expect(stops.length, `${where} below the window`)
        .toBeGreaterThanOrEqual(Math.min(STOP_COUNT_MIN, capacity))
    }
  })

  it('tracks the configuration — the count moves where only the separations moved', () => {
    // Criterion 2's title, as a property. A literal count is constant; this
    // one is not, and it is not constant *even across configurations whose
    // capacity leaves the whole window available*, which is the version a
    // `Math.min(7, capacity)` would also pass.
    const roomy = CONFIGS.filter(s => encodableDepths(s) >= STOP_COUNT_MAX)
    expect(roomy.length).toBeGreaterThan(1)
    expect(new Set(roomy.map(s => depthStops(s).length)).size).toBeGreaterThan(1)

    // §6.5a's paired control, for the null half asserted in `is invariant
    // under noiseScale` below: the same instrument, driven by the axis that
    // must *not* move it, holds still. Without this pair, "the count varies"
    // and "the count is invariant" are each satisfiable by a broken reading.
    const n = depthStops(DEFAULT_STEREO).length
    for (const noiseScale of [1, 2, 3, 7]) {
      expect(depthStops({ ...DEFAULT_STEREO, noiseScale }).length, `noiseScale ${noiseScale}`)
        .toBe(n)
    }
  })

  it('divides the band exactly wherever the window allows, which no fixed count can', () => {
    // The discriminator, and it carries no number. Both configurations below
    // admit a count in the window that divides their band into equal steps,
    // and they need **different** counts to do it — measured: 110/92 spans 18
    // separations and 100/80 spans 20, and no single count in [STOP_COUNT_MIN,
    // STOP_COUNT_MAX] divides both. So a stop count that is a literal fails at
    // one of these two whatever literal is chosen, while the assertion itself
    // only ever says "the steps are equal".
    for (const s of [at(110, 92), at(100, 80)]) {
      const gaps = gapsOf(depthStops(s))
      expect(gaps.length, `${s.sepFar}/${s.sepNear} has no steps`).toBeGreaterThan(0)
      expect(new Set(gaps).size, `${s.sepFar}/${s.sepNear} steps are uneven: ${gaps}`).toBe(1)
    }
    // And the pair really is discriminating: the two bands are different
    // widths, so the counts that divide them exactly are disjoint. Asserted
    // rather than asserted-in-prose, because a future `DEFAULT_STEREO` or a
    // changed window could quietly make both divisible by the same count and
    // turn the test above back into something a literal passes.
    const divisors = (s: StereoOpts): Set<number> => {
      const width = encodableDepths(s) - 1
      const out = new Set<number>()
      for (let n = STOP_COUNT_MIN; n <= STOP_COUNT_MAX; n++) if (width % (n - 1) === 0) out.add(n)
      return out
    }
    const a = divisors(at(110, 92))
    const b = divisors(at(100, 80))
    expect(a.size, 'no window count divides 110/92').toBeGreaterThan(0)
    expect(b.size, 'no window count divides 100/80').toBeGreaterThan(0)
    expect([...a].filter(n => b.has(n)), 'the pair stopped discriminating').toEqual([])
  })

  it('keeps its steps within one scene px of each other where it cannot divide exactly', () => {
    // "Spaced across the encodable separations" when the band does not divide:
    // the steps take at most two sizes and they differ by one. That is what
    // rounding an arithmetic progression onto the separation lattice can
    // guarantee and it is the whole of what evenness can mean here — and it is
    // a real sensor, because a stop whose depth missed its band by a whole
    // level shows up as a step short by one and the next long by one, a spread
    // of two.
    let measured = 0
    for (const s of CONFIGS) {
      const gaps = gapsOf(depthStops(s))
      if (gaps.length === 0) continue
      expect(Math.max(...gaps) - Math.min(...gaps), `${s.sepFar}/${s.sepNear}: ${gaps}`)
        .toBeLessThanOrEqual(1)
      measured++
    }
    expect(measured).toBeGreaterThan(0)
  })

  it('leaves a single odd step where the band will not divide, not a scattering', () => {
    // **Added because a mutation found nothing to hit.** Replacing the
    // minority share with the bare remainder — `odd / steps` instead of
    // `Math.min(odd, steps − odd) / steps` — reddened **no** test in this file.
    // Both readings agree wherever the band divides exactly, which is where
    // `divides the band exactly wherever the window allows` looks, so nothing
    // was asking the question anywhere else.
    //
    // 140/78 is where they disagree, and it is not a hypothetical: it is one of
    // the two configurations design §10.2 and P7 criterion 3 pin
    // `fusionComfort` on. Its band is 62 separations wide. The remainder
    // reading prefers 7 stops — six steps of 10, 11, 10, 10, 11, 10, *two* of
    // them odd — and the minority reading prefers 8 — seven steps of 9 with a
    // single 8. The assertion is on the shape rather than on either number: all
    // but one step are the same size.
    const gaps = gapsOf(depthStops(at(140, 78)))
    expect(gaps.length, 'no steps to judge').toBeGreaterThan(2)
    const sizes = new Map<number, number>()
    for (const g of gaps) sizes.set(g, (sizes.get(g) ?? 0) + 1)
    expect(gaps.length - Math.max(...sizes.values()), `odd steps among ${gaps}`)
      .toBeLessThanOrEqual(1)
    // And the configuration really is the discriminating one, so the assertion
    // above is not silently reduced to the even case: the band does not divide
    // exactly by any count the window offers.
    const width = encodableDepths(at(140, 78)) - 1
    for (let n = STOP_COUNT_MIN; n <= STOP_COUNT_MAX; n++) {
      expect(width % (n - 1), `${n} stops divides 140/78 exactly after all`).not.toBe(0)
    }
  })

  it('takes the most stops the window allows when every count divides equally well', () => {
    // **Added because a mutation found nothing to hit.** Flipping the tie-break
    // — `<` for `<=`, which hands a tie to the *fewest* stops instead of the
    // most — reddened no test, because no configuration in CONFIGS produces a
    // tie. A tie needs a band every count in the window divides, so the
    // narrowest one is the lowest common multiple of the step counts on offer,
    // computed here from the window rather than written down so that moving
    // either cited range moves the fixture with it.
    //
    // The tie-break is a decision and not a finding — nothing measured prefers
    // more detents to fewer inside a window both sources endorse — which is
    // precisely why it needs a sensor rather than a note (§9). The reasoning
    // recorded with it is design §10.4's own asymmetry: snapping is "the
    // default gesture with a modifier to suspend", so an unwanted detent costs
    // one key and a missing one costs the position.
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
    let width = 1
    for (let n = STOP_COUNT_MIN; n <= STOP_COUNT_MAX; n++) width = (width * (n - 1)) / gcd(width, n - 1)
    const tied = at(2 + width, 2)
    expect(encodableDepths(tied) - 1, 'the fixture is not the band it claims').toBe(width)
    // It is a genuine tie: every count in the window splits this band evenly,
    // so nothing but the tie-break can be choosing.
    for (let n = STOP_COUNT_MIN; n <= STOP_COUNT_MAX; n++) {
      expect(width % (n - 1), `${n} stops does not divide the tie fixture`).toBe(0)
    }
    expect(depthStops(tied).length).toBe(STOP_COUNT_MAX)
    expect(new Set(gapsOf(depthStops(tied))).size, 'the tie fixture is not even').toBe(1)
  })

  it('falls back to one stop per level when the encoder has fewer than the window wants', () => {
    // P7's "must still behave when `encodableDepths` is smaller than the
    // segment target". Below the window there is nothing to choose: every
    // encodable separation becomes a detent, which is both the most stops
    // available and the only spacing that is exactly even.
    let narrow = 0
    for (let capacity = 2; capacity < STOP_COUNT_MIN; capacity++) {
      const s = at(2 + (capacity - 1), 2)
      expect(encodableDepths(s), 'the fixture does not have the capacity it claims')
        .toBe(capacity)
      const stops = depthStops(s)
      expect(stops.length, `capacity ${capacity}`).toBe(capacity)
      expect(new Set(sepsOf(stops)).size, `capacity ${capacity} repeats`).toBe(capacity)
      narrow++
    }
    expect(narrow).toBeGreaterThan(0)
  })

  it('offers no detents at all where there is only one encodable level', () => {
    // The degenerate end, and the reasoning is the same one that makes
    // distinctness the load-bearing property. With a single separation there
    // is no *choice* between encodable depths: one stop would be a detent the
    // author can never move off, and two would be two detents the encoder
    // cannot tell apart. An empty list is the advisory silence `fusionComfort`
    // keeps on a budget it cannot read.
    for (const s of [at(110, 110), at(2, 2)]) {
      expect(encodableDepths(s), `${s.sepFar}/${s.sepNear}`).toBe(1)
      expect(depthStops(s), `${s.sepFar}/${s.sepNear}`).toEqual([])
    }
  })
})

describe('depthStops is advisory only', () => {
  it('answers every StereoOpts without throwing, the inverted pair included', () => {
    // P7 criterion 7 and R22 obligation 2: the model never refuses, clamps or
    // auto-corrects. `collidingPairs` takes resolved options for exactly this
    // reason — `resolveStereo` *throws* on `sepNear >= sepFar` — and this
    // function takes them for the same one. Every entry here is a
    // configuration `resolveStereo` would reject or has never seen.
    const hostile: readonly StereoOpts[] = [
      at(92, 110), at(110, 110), at(0, 0), at(-5, -10), at(110, 1), at(2, 1e9),
      at(Number.NaN, 92), at(110, Number.NaN), at(Number.NaN, Number.NaN),
      at(Number.POSITIVE_INFINITY, 92), at(110, Number.NEGATIVE_INFINITY),
      at(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
      at(110.000001, 110), at(1e-9, 0),
      // The extremal doubles, because the capacity is a *difference* and a
      // difference is where an overflow to Infinity would come from. A sweep
      // of 2,000,625 pairs found none — see `stopCount` — and these are the
      // corners of that sweep, kept so the claim has a standing sensor.
      at(Number.MAX_VALUE, -Number.MAX_VALUE), at(Number.MAX_VALUE, Number.MIN_VALUE),
      at(-Number.MAX_VALUE, Number.MAX_VALUE), at(Number.MIN_VALUE, -Number.MIN_VALUE),
    ]
    for (const s of hostile) {
      expect(() => depthStops(s), `${s.sepFar}/${s.sepNear}`).not.toThrow()
      const stops = depthStops(s)
      for (const stop of stops) {
        expect(Number.isFinite(stop.depth), `${s.sepFar}/${s.sepNear} depth`).toBe(true)
        expect(stop.depth, `${s.sepFar}/${s.sepNear} depth below 0`).toBeGreaterThanOrEqual(0)
        expect(stop.depth, `${s.sepFar}/${s.sepNear} depth above 1`).toBeLessThanOrEqual(1)
        expect(Number.isFinite(stop.separation), `${s.sepFar}/${s.sepNear} sep`).toBe(true)
      }
    }
    // The control §6.5a asks for: "nothing threw" is worth nothing unless the
    // same call can produce something. One of the hostile pairs is inverted
    // and is answered with a full stop list rather than with silence.
    expect(depthStops(at(92, 110)).length).toBeGreaterThan(1)
  })

  it('says nothing at all about a configuration it cannot read', () => {
    // The other half of advisory: a non-finite separation has no band, and the
    // honest answer is no detents rather than a detent at NaN. `fusionComfort`
    // orders its comparisons widest-first for the same reason — silence on a
    // number the function cannot read.
    for (const s of [at(Number.NaN, 92), at(110, Number.NaN),
      at(Number.POSITIVE_INFINITY, 92), at(110, Number.NEGATIVE_INFINITY)]) {
      expect(depthStops(s), `${s.sepFar}/${s.sepNear}`).toEqual([])
    }
  })

  it('is invariant under noiseScale, in scene px, while sepNear moves the same instrument', () => {
    // Design §10.6: every perception function takes and returns scene px, and
    // `noiseScale` is applied by `upscale` after the encoder, which never sees
    // it. Invariance is asserted on the whole structure and not only on the
    // count, so a stop list that kept its length while moving its depths would
    // still redden.
    const base = depthStops(DEFAULT_STEREO)
    expect(base.length).toBeGreaterThan(1)
    for (const noiseScale of [1, 2, 3, 4, 7]) {
      expect(depthStops({ ...DEFAULT_STEREO, noiseScale }), `noiseScale ${noiseScale}`)
        .toEqual(base)
    }
    // The control: one px of `sepNear` is one encodable level, and the same
    // comparison sees it.
    expect(depthStops({ ...DEFAULT_STEREO, sepNear: DEFAULT_STEREO.sepNear - 1 }))
      .not.toEqual(base)
  })
})

describe('what the stops mean to the two consumers design §10.4 names', () => {
  it('leaves no tie badge firing on a scene snapped to them, at whole separations', () => {
    // Design §5.4's badge, which `collidingPairs` carries the depth-only half
    // of: "snapping N layers into 6–9 bins makes ties the expected outcome
    // rather than a risk". Ties between layers on the *same* stop are
    // expected; a tie between two *different* stops would be the badge crying
    // wolf at the very gesture the stops exist to encourage. At whole
    // separations every stop is exactly a band centre — depth 0 and depth 1
    // included, because `(sepFar − round(sepFar))/range` is 0 when `sepFar` is
    // an integer — so consecutive stops are whole multiples of a step apart
    // and `collidingPairs`' strict `<` clears them all.
    const whole = CONFIGS.filter(s => Number.isInteger(s.sepFar) && Number.isInteger(s.sepNear))
    expect(whole.length).toBeGreaterThan(1)
    let scenes = 0
    for (const s of whole) {
      const stops = depthStops(s)
      if (stops.length === 0) continue
      expect(collidingPairs(sceneOn(stops), s), `${s.sepFar}/${s.sepNear}`).toEqual([])
      scenes++
    }
    expect(scenes).toBeGreaterThan(0)
  })

  it('can still be over-reported at a fractional separation, and that is the step\'s doing', () => {
    // The exception, pinned as behaviour rather than recorded as a caveat
    // (§9). At 10.4/8.4 the near extreme's band centre is at depth 1.2 — off
    // the axis — so pinning that stop at depth 1 puts it closer than a step to
    // its neighbour, and `collidingPairs` reports the pair.
    //
    // It is not a stop that collides: the two depths encode to **different**
    // separations, measured here through `sepAt` rather than argued. It is
    // `quantisationStep` being a uniform *sufficient* bound — a gap under one
    // step does not imply a collision, only that one scalar cannot certify
    // otherwise — and `collidingPairs` failing toward the false positive, which
    // is the safe direction for a necessary condition P4 filters.
    const s = at(10.4, 8.4)
    const stops = depthStops(s)
    const reported = collidingPairs(sceneOn(stops), s)
    expect(reported.length, 'the over-report has gone — check why before deleting this')
      .toBeGreaterThan(0)
    for (const pair of reported) {
      expect(sepOf(s, stops[pair.a]!.depth), `pair ${pair.a}-${pair.b}`)
        .not.toBe(sepOf(s, stops[pair.b]!.depth))
    }
    // And it is confined to the fractional case: the same two assertions run
    // against the whole-separation neighbour of this configuration find
    // nothing, which is what makes the clause above a scope and not an excuse.
    expect(collidingPairs(sceneOn(depthStops(at(10, 8))), at(10, 8))).toEqual([])
  })

  it('names each stop by the separation it encodes, with the pixel space on the label', () => {
    // Design §10.4 says *named* stops. The name is built from the separation
    // and not from the position, because every other candidate lies in some
    // configuration this function must answer: "far"/"near" invert with the
    // pair (92/110 is a legal input here and `resolveStereo` is the only thing
    // that rejects it), and an ordinal only restates the array index the
    // caller already holds. Invariant 7 wants the pixel space named wherever a
    // count appears, and design §5.3 has the strip labelling this very axis
    // "scene px", so the unit travels with the label.
    //
    // `toContain('scene px')` and not `toContain('px')`: invariant 7 names
    // *four* pixel spaces, so a bare "px" satisfies the sentence this comment
    // already made without satisfying invariant 7 — it is the one distinction
    // the assertion exists to make, and the weaker form was blind to it. Both
    // design §5.3 ("in **scene px, explicitly labelled**") and §10.6 ("The
    // depth strip labels its axis \"scene px\"") give that exact wording, so
    // the string is quoted from the design rather than coined here.
    //
    // Asserted as the guarantee — unique, carries the number, carries the
    // unit — rather than as the format string, which is §2 invariant 4.
    let named = 0
    for (const s of CONFIGS) {
      const stops = depthStops(s)
      if (stops.length === 0) continue
      const names = stops.map(st => st.name)
      expect(new Set(names).size, `${s.sepFar}/${s.sepNear} repeats a name`).toBe(names.length)
      for (const stop of stops) {
        expect(stop.name, `${s.sepFar}/${s.sepNear}`).toContain(String(stop.separation))
        expect(stop.name, `${s.sepFar}/${s.sepNear}`).toContain('scene px')
        named++
      }
    }
    expect(named).toBeGreaterThan(0)
  })

  it('returns quantities and no grade, which is the shape to amend if the preamble wins', () => {
    // Design §10's preamble says every function here returns quantities *and*
    // a grade; design §10.1 titles the objective functions "no perception
    // involved", and the orchestrator ruled on 2026-10-15 that the criterion
    // reads "**graded** functions return quantities and a grade" — forcing a
    // grade onto an objective count invents exactly the subjective score R22
    // obligation 4 forbids. A stop is a position, not a judgement: nothing
    // here is compared against a perceptual threshold, so there is nothing to
    // grade. This file's precedent is `collidingPairs`, which pins its own
    // ungraded shape in the same way and for the same reason.
    //
    // Pinned so that adding a grade is a deliberate edit to a named assertion
    // rather than a silent widening.
    const stops = depthStops(DEFAULT_STEREO)
    expect(stops.length).toBeGreaterThan(0)
    for (const stop of stops) {
      expect(Object.keys(stop).sort()).toEqual(['depth', 'name', 'separation'])
    }
  })
})
