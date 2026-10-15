import { describe, expect, it } from 'vitest'
import { DEFAULT_STEREO, marginsFor, plateLayoutOf, sepAt, sirdsFromDepth } from '../core/index.js'
import type { Scene, SirdsAlgorithm, StereoOpts } from '../core/types.js'
import { disparityBudget, encodableDepths, quantisationStep } from './perception.js'

/**
 * `encodableDepths` and `quantisationStep` — the objective half of design §10.1.
 *
 * Its own file rather than an addition to `perception.test.ts` or
 * `perception.fusion.test.ts`, for the reason the latter records about the
 * former: those two files are unmodified by this task, and keeping them that
 * way is what lets them say anything about it.
 *
 * **What this file exists to prevent is one specific bug.** Design §10.1 gives
 * capacity as `sepFar − sepNear + 1`, and that closed form is *not* the
 * function — it is the unclamped, unrounded half of `sepAt`, and it is wrong
 * in 7 of the 20 configurations swept below. An implementation that wrote the
 * closed form would pass every assertion taken at the defaults, so the pinned
 * cases are paired with discriminators that only the `sepAt`-derived answer
 * survives. A pin both implementations pass is not a pin.
 *
 * Every sweep here is run against `sepAt` itself (orchestrator ruling E-7),
 * which is the point: the thing being asserted is *agreement with the
 * encoder*, not agreement with a formula someone wrote down. The one
 * independent instrument is {@link CLOSED_FORM_CASES}' expected column, which
 * does not go through `sepAt` at all.
 */

/** The stereo defaults at a given pair of separations, and nothing else moved. */
function at(sepFar: number, sepNear: number): StereoOpts {
  return { ...DEFAULT_STEREO, sepFar, sepNear }
}

/**
 * What `sepAt`'s upper clamp is given when no plate is in hand.
 *
 * Not a threshold and not a guess: `Infinity` makes the clamp inert, which is
 * the honest reading of "the plate is wide enough", and `does not need the
 * plate width` below is the measurement that it always is.
 */
const UNBOUNDED_PLATE = Number.POSITIVE_INFINITY

/**
 * How finely z is swept.
 *
 * 100,001 samples over [0, 1] puts consecutive `sepFar − z·range` values under
 * 0.01 apart for every budget used here, so no attainable separation can fall
 * between two samples. That is not asserted by eye: a sweep too coarse to hit
 * every integer produces a *non-contiguous* set, and `covers a contiguous band`
 * below would redden. The sampling density is checked by the same assertion
 * that uses it.
 */
const SAMPLES = 100001

/** Every separation `sepAt` produces over z ∈ [0, 1], at this plate width. */
function separationsOver(s: StereoOpts, maxSep: number = UNBOUNDED_PLATE): Set<number> {
  const range = s.sepFar - s.sepNear
  const out = new Set<number>()
  for (let i = 0; i < SAMPLES; i++) {
    out.add(sepAt(i / (SAMPLES - 1), s.sepFar, range, maxSep))
  }
  return out
}

/**
 * The configurations swept, spanning every regime the clamps and the rounding
 * distinguish: the shipped default, the two `fusionComfort` pins, budgets of
 * one and two separations, fractional separations on either side and both,
 * `sepNear` under the encoder's floor of 2, a negative `sepNear`, an inverted
 * pair, and a zero budget.
 */
const CONFIGS: readonly StereoOpts[] = [
  at(110, 92), at(110, 88), at(140, 78), at(100, 80), at(10, 9), at(10, 8),
  at(3, 2), at(200, 2), at(110.4, 92.3), at(110.5, 92.5), at(110.5, 92),
  at(110, 92.5), at(10.4, 8.4), at(99.7, 2.2), at(92, 110), at(110, 110),
  at(110, 1), at(110, 0), at(50, -10), at(2, 2),
]

describe('encodableDepths counts what the encoder can actually produce', () => {
  it('equals the number of distinct separations sepAt yields, across every regime', () => {
    // Criterion 2: agreement with `sepAt` across a sweep, not at the defaults.
    // The count is read off the encoder's own mapping rather than computed a
    // second way, which is the whole reason E-7 made `sepAt` visible.
    expect(CONFIGS.length).toBeGreaterThan(0)
    for (const s of CONFIGS) {
      const produced = separationsOver(s)
      expect(produced.size, `${s.sepFar}/${s.sepNear}`).toBeGreaterThan(0)
      expect(encodableDepths(s), `${s.sepFar}/${s.sepNear}`).toBe(produced.size)
    }
  })

  it('covers a contiguous band, so a count is a count of levels', () => {
    // Why this is here and not folded into the test above: "19 separations"
    // is only a depth *resolution* if they are 19 consecutive integers. A set
    // with a hole would make the histogram design §10.7 asks for a lie, and
    // the arithmetic `max − min + 1` the function uses would overcount. It is
    // also the sensor on SAMPLES: too coarse a sweep punches holes.
    for (const s of CONFIGS) {
      const produced = [...separationsOver(s)].sort((a, b) => a - b)
      const span = produced[produced.length - 1]! - produced[0]! + 1
      expect(span, `${s.sepFar}/${s.sepNear} is not contiguous`).toBe(produced.length)
      // And the function reports that band width, which is the form it
      // computes the answer in — the nearest and farthest separations and the
      // levels between them, never a count of set members.
      expect(encodableDepths(s), `${s.sepFar}/${s.sepNear}`).toBe(span)
    }
  })

  it('is sepFar − sepNear + 1 at the defaults, with the defaults supplying the number', () => {
    // Design §10.1's figure, asserted as the relationship rather than as 19.
    // 19 is a consequence of `DEFAULT_STEREO`; hard-coding it would pin the
    // defaults and say nothing about the function (§2 invariant 4). Changing
    // `DEFAULT_STEREO` must not redden this, and changing the function must.
    expect(encodableDepths(DEFAULT_STEREO))
      .toBe(DEFAULT_STEREO.sepFar - DEFAULT_STEREO.sepNear + 1)
  })

  it('is not the closed form — seven configurations tell them apart', () => {
    // The discriminator proper, and the only instrument in this file that does
    // not go through `sepAt`. `sepFar − sepNear + 1` is the unclamped,
    // unrounded half of the mapping: it is wrong wherever a separation is
    // fractional, wherever `sepNear` falls under the encoder's floor of 2, and
    // it returns a negative "count" when the pair is inverted. Each expected
    // value below is written out rather than computed, so an implementation
    // that quietly became the closed form cannot satisfy both columns.
    const cases: readonly (readonly [number, number, number])[] = [
      // sepFar, sepNear, levels      closed form, for contrast
      [110.5, 92, 20],             // 19.5 — not even an integer
      [110, 92.5, 18],             // 18.5
      [110.4, 92.3, 19],           // 19.1
      [99.7, 2.2, 99],             // 98.5
      [110, 1, 109],               // 110 — sepNear 1 encodes as 2
      [110, 0, 109],               // 111
      [50, -10, 49],               // 61
      [92, 110, 19],               // −17, a negative count
    ]
    for (const [sepFar, sepNear, levels] of cases) {
      const s = at(sepFar, sepNear)
      expect(encodableDepths(s), `${sepFar}/${sepNear}`).toBe(levels)
      // And the closed form really does disagree here, so the case above is
      // discriminating rather than merely correct.
      expect(sepFar - sepNear + 1, `closed form at ${sepFar}/${sepNear}`).not.toBe(levels)
    }
  })

  it('is invariant under noiseScale, while the same instrument moves under sepNear', () => {
    // Design §10.1: capacity is invariant under `noiseScale`, "which is applied
    // after the encoder" — `upscale` is the last stage and the encoder never
    // sees it. Design §10.6 puts every quantity here in scene px for the same
    // reason.
    //
    // §6.5a: a null measurement needs a paired control. "Nothing moved" is
    // evidence only if the instrument could have seen movement, so the same
    // call is driven with a change that *must* register — one px of sepNear is
    // one level — and the integrality check is what stops a function returning
    // a constant, or NaN, from satisfying the invariance half vacuously.
    const base = encodableDepths(DEFAULT_STEREO)
    expect(Number.isInteger(base)).toBe(true)
    expect(base).toBeGreaterThanOrEqual(1)
    for (const noiseScale of [1, 2, 3, 4, 7]) {
      expect(encodableDepths({ ...DEFAULT_STEREO, noiseScale }), `noiseScale ${noiseScale}`)
        .toBe(base)
      expect(quantisationStep({ ...DEFAULT_STEREO, noiseScale }), `noiseScale ${noiseScale}`)
        .toBe(quantisationStep(DEFAULT_STEREO))
    }
    // The control.
    expect(encodableDepths({ ...DEFAULT_STEREO, sepNear: DEFAULT_STEREO.sepNear - 1 }))
      .toBe(base + 1)
  })

  it('does not need the plate width, because the plate is never too narrow for sepFar', () => {
    // The precondition decision, measured rather than documented. The upper
    // clamp in `sepAt` is `w − 1` for the *plate*, which this function never
    // sees — so the question is whether omitting it can change the answer.
    //
    // It cannot, and the reason is `marginsFor`: it pads by `ceil(sepFar/2)`
    // per side under `linked` and `sepFar` + `ceil(sepFar/2)` under `shift`,
    // so a plate is at least `sepFar` columns wider than its stage and
    // `plate.width − 1 ≥ sepFar` for any stage at all. Rather than record that
    // as a comment — §9: a recorded note is not a sensor — the sweep below runs
    // `sepAt` at the *real* plate width and asserts the no-width answer is the
    // same one. It reddens the day the margin rule stops covering sepFar.
    const algorithms: readonly SirdsAlgorithm[] = ['shift', 'linked']
    let checked = 0
    for (const algorithm of algorithms) {
      for (const sepFar of [2, 3, 10, 110, 140, 400]) {
        for (const width of [1, 8, 640, 1600]) {
          const stereo = { ...DEFAULT_STEREO, algorithm, sepFar, sepNear: 2 }
          const scene: Scene = {
            size: [width, 16], fps: 12, duration: 1, freezeNoise: true,
            layers: [], stereo,
          }
          const plate = plateLayoutOf(scene).plate.width
          expect(encodableDepths(stereo), `${algorithm} ${sepFar}px on a ${width}px stage`)
            .toBe(separationsOver(stereo, plate - 1).size)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(0)

    // The control §6.5a asks for: the same instrument, pointed at a plate that
    // *is* too narrow, reports a different number. Without this the sweep above
    // is indistinguishable from an instrument that cannot tell plates apart.
    const narrow = at(110, 92)
    expect(separationsOver(narrow, narrow.sepNear + 1).size)
      .not.toBe(encodableDepths(narrow))
  })
})

describe('quantisationStep is the depth resolution the rounding leaves', () => {
  /**
   * Is this configuration outside `sepAt`'s lower clamp everywhere?
   *
   * The clamp pins every separation under 2 to exactly 2, so a band of depths
   * at the near end all encode identically and **no** step resolves them. The
   * uniform step below is therefore a statement about the unclamped regime,
   * which is the whole of the shipped one: `resolveStereo` rejects `sepNear`
   * under 2. Rather than let that stay a caveat in prose, `the step stops
   * resolving below the encoder's floor` pins the excluded case as behaviour.
   */
  const clampFree = (s: StereoOpts): boolean => Math.min(s.sepFar, s.sepNear) >= 2

  /**
   * The configurations with a budget of at least one separation, clamp-free.
   * A budget under 1 makes one step wider than the whole depth axis, so there
   * is no pair of depths inside [0, 1] to measure and the sweeps below would
   * assert nothing — which `expect(pairs).toBeGreaterThan(0)` is there to
   * catch.
   */
  const STEPPED = CONFIGS.filter(s => clampFree(s) && Math.abs(disparityBudget(s)) >= 1)

  it('always changes the separation by exactly one scene px', () => {
    // Both halves of the contract in one sweep, because they are one fact.
    //
    // *Sufficiency*: two depths one step apart never encode identically — that
    // is what makes the step the right input to a colliding-pairs check.
    // *Units*: the change is exactly 1, and 1 **scene px of separation** is
    // what a step of depth buys. That is the §10.6 reading of a function whose
    // own return value is on the normalised depth axis and therefore has no px
    // to be in: the px live on the other side of the mapping.
    expect(STEPPED.length).toBeGreaterThan(0)
    for (const s of STEPPED) {
      const range = s.sepFar - s.sepNear
      const step = quantisationStep(s)
      let pairs = 0
      for (let i = 0; i <= 2000; i++) {
        const z = i / 2000
        const z2 = z + step
        // `!(z2 <= 1)` and not `z2 > 1`, so a non-finite step leaves the sweep
        // empty and trips the pair count rather than silently sampling nothing.
        if (!(z2 <= 1)) break
        const gap = Math.abs(
          sepAt(z, s.sepFar, range, UNBOUNDED_PLATE)
          - sepAt(z2, s.sepFar, range, UNBOUNDED_PLATE),
        )
        expect(gap, `${s.sepFar}/${s.sepNear} at z=${z}`).toBe(1)
        pairs++
      }
      expect(pairs, `${s.sepFar}/${s.sepNear} sampled no pairs`).toBeGreaterThan(0)
    }
  })

  it('is tight — a shade under one step, some depths do encode identically', () => {
    // Without this, a step twice the size would pass every assertion above:
    // over-wide is still sufficient. This is the half that says the step is
    // the *smallest* difference that guarantees a change, which is what makes
    // a colliding-pairs check built on it neither unsound nor useless.
    //
    // 0.9 rather than something nearer 1 is a property of the measurement, not
    // a threshold: at a difference of `f` steps the colliding depths occupy a
    // `1 − f` fraction of each band, so at 0.99 a 2000-point grid lands in that
    // window by luck and at 0.9 it cannot miss. Measured: 0.9 finds 1000–1990
    // colliding pairs per configuration, and a doubled step finds zero at any
    // factor.
    const JUST_UNDER = 0.9
    // Budgets under 2 separations have no room inside [0, 1] for such a pair
    // at all — the sub-step offset pushes z past 1 before it reaches a band
    // boundary — so they are excluded here and covered by the sweep above.
    const wide = CONFIGS.filter(s => clampFree(s) && Math.abs(disparityBudget(s)) >= 2)
    expect(wide.length).toBeGreaterThan(0)
    for (const s of wide) {
      const range = s.sepFar - s.sepNear
      const d = quantisationStep(s) * JUST_UNDER
      let collisions = 0
      let pairs = 0
      for (let i = 0; i <= 2000; i++) {
        const z = i / 2000
        const z2 = z + d
        if (!(z2 <= 1)) break
        pairs++
        if (sepAt(z, s.sepFar, range, UNBOUNDED_PLATE)
          === sepAt(z2, s.sepFar, range, UNBOUNDED_PLATE)) collisions++
      }
      expect(pairs, `${s.sepFar}/${s.sepNear} sampled no pairs`).toBeGreaterThan(0)
      expect(collisions, `${s.sepFar}/${s.sepNear}`).toBeGreaterThan(0)
    }
  })

  it('is a magnitude — never negative, whichever way round the separations are', () => {
    // Added because a mutation found nothing to hit. Dropping the `Math.abs`
    // from the implementation reddened **no** test in this file: the sweeps
    // above step backwards just as happily as forwards, because the mapping is
    // linear and a step of −1/budget changes the separation by exactly 1 too.
    // The sign is invisible to every assertion that only asks whether the
    // separation moved.
    //
    // It is not invisible to a consumer. Design §10.1's use for this is
    // `collidingPairs`, which asks `|a.depth − b.depth| < step`; against a
    // negative step that comparison is false for every pair, so an inverted
    // configuration would silently report no collisions at all. A distance
    // that can be negative is the fail-open shape.
    for (const s of CONFIGS) {
      expect(quantisationStep(s), `${s.sepFar}/${s.sepNear}`).toBeGreaterThan(0)
    }
    // The discriminating case: only here do the two implementations differ.
    const inverted = at(92, 110)
    expect(disparityBudget(inverted)).toBeLessThan(0)
    expect(quantisationStep(inverted)).toBe(quantisationStep(at(110, 92)))
  })

  it('stops resolving below the encoder\'s floor, and the capacity is what records it', () => {
    // The excluded case, pinned rather than written down. `resolveStereo`
    // rejects `sepNear` under 2 and the shipped pipeline therefore never sees
    // this — but these functions are advisory and take an unvalidated
    // `StereoOpts`, so the honest statement of the step's scope is a test and
    // not a sentence in a docblock (§9: a recorded note is not a sensor).
    //
    // At `110/1` the near end of the sweep falls under `sepAt`'s clamp, which
    // pins a whole band of depths to separation 2. One step apart inside that
    // band encodes identically — a single scalar cannot say "uniform here,
    // infinite there" — and it is `encodableDepths` that carries the loss: 109
    // levels where the step's own arithmetic would imply 110.
    const clamped = at(110, 1)
    const range = clamped.sepFar - clamped.sepNear
    const step = quantisationStep(clamped)
    let unresolved = 0
    for (let i = 0; i <= 2000; i++) {
      const z = i / 2000
      const z2 = z + step
      if (!(z2 <= 1)) break
      if (sepAt(z, clamped.sepFar, range, UNBOUNDED_PLATE)
        === sepAt(z2, clamped.sepFar, range, UNBOUNDED_PLATE)) unresolved++
    }
    expect(unresolved).toBeGreaterThan(0)
    expect(encodableDepths(clamped)).toBe(109)
    expect(encodableDepths(clamped)).toBeLessThan(1 / step + 1)
  })

  it('agrees with encodableDepths that a zero budget is a single flat plane', () => {
    // The degenerate case both functions have to answer, and they have to
    // answer it the same way: one encodable separation, and no depth
    // difference whatever that encodes differently. It is the same statement
    // `resolveStereo` makes in prose when it refuses `sepNear >= sepFar` —
    // "encodes every depth identically and the result fuses to a flat plane" —
    // and the one these advisory functions must make without throwing.
    const flat = at(110, 110)
    expect(encodableDepths(flat)).toBe(1)
    expect(quantisationStep(flat)).toBe(Number.POSITIVE_INFINITY)
  })
})

/**
 * P7 criterion 4's sensor: the `linked` dead strips fall **inside** the plate
 * margins.
 *
 * Criterion 4 asked {@link encodableDepths} to report the dead strips alongside
 * the stage capacity, and `perception.ts`' docblock declines on a measurement —
 * the strips fall entirely inside the columns `src/core/plate.ts` already
 * reserves, so the guarantee exists and widening a `number` into a shape to
 * restate it is machinery. §9 says a recorded note is not a sensor, so the
 * measurement is run here rather than asserted in prose. The day `marginsFor`
 * stops covering the strips, or the encoder's skip test moves, this reddens.
 *
 * ## Containment, not equality, because equality is false
 *
 * The criterion was written as *"assert the strip width equals the margin
 * width"*. That is **false at every odd `sepFar`** and would have shipped green
 * only because nothing in this repo sweeps an odd separation. `marginsFor`
 * gives `ceil(sepFar/2)` on both sides under `linked`; the encoder's skip test
 * (`sirds.ts`: `left = x - (sep >> 1)`, `right = left + sep`) leaves
 * `floor(sep/2)` dead on the left and `ceil(sep/2)` on the right. At the
 * default 110 both are 55 and the two claims coincide; at 111 the left strip is
 * 55 against a margin of 56. Measured below, end to end, at 3/5/11/47/93/111/141.
 *
 * So the property is `strip <= margin` per side — true for every `sepFar >= 2`
 * by `floor <= ceil` — **plus** a tightness bound, because containment alone is
 * satisfied by making the margin enormous and would make the wrong fix the
 * cheap one. The bound is {@link MAX_MARGIN_SLACK}.
 *
 * ## What is measured and what is derived, and why it is split that way
 *
 * The margin comes from `marginsFor`. The strips come from a **real encoded
 * frame**, counted — neither side is restated here, which is §9's rule that a
 * guard derived from the roster it guards proves only that the derivation ran
 * twice.
 *
 * The split of the dead strip into a left half and a right half is observable
 * **only at a separation the frame has something to contrast against**, and that
 * is not a limitation of this probe but of the encoder's output. For a field at
 * one uniform depth the set of linked pairs is `{(a, a+sep)}` for
 * `0 <= a <= w-1-sep` whichever way the skip test rounds: swapping
 * `x - (sep >> 1)` for `x - ceil(sep/2)` shifts which `x` are skipped and
 * relabels which depth-map column produced each pair, but produces the **same
 * pair set and a bit-identical frame**. The far extreme is exactly that case —
 * a feature at `sep = sepFar` is by construction indistinguishable from the
 * background — so the worst-case strip cannot be read off an image at all.
 *
 * The sweep therefore does the two halves separately:
 *
 * 1. {@link deadStrips} measures the strips at a separation a slab really
 *    encodes at, over odd and even values including the encoder's floor of 2.
 *    That is the geometric identity `marginsFor` rests on, exercised against the
 *    encoder rather than against arithmetic.
 * 2. `never produces a separation wider than sepFar` establishes, over `sepAt`,
 *    that `sepFar` is the widest separation any depth reaches — which is what
 *    makes `marginsFor(sepFar)` the margin for the worst case rather than for
 *    one case.
 */
const STRIP_FIELD_HEIGHT = 24

/**
 * How much wider than the slab's own separation the background is set.
 *
 * Any positive budget works: the point is only that the slab (depth 1,
 * separation `sep`) and the background (depth 0, separation `sep + GAP`) encode
 * at *different* offsets, so `linkedColumns` at `sep` sees the slab and nothing
 * else. 18 is the shipped default budget, picked so the sweep runs in a regime
 * the project actually ships rather than a degenerate one.
 */
const STRIP_FAR_GAP = 18

/**
 * The most a margin may exceed the strip it covers, per side, in plate columns
 * (scene px — the encoder runs before `upscale`).
 *
 * **The claim is `ceil(sepFar/2) - floor(sepFar/2) <= 1`**, written as a bound
 * rather than as that expression so the margin is not compared against a second
 * copy of its own arithmetic. One column of slack exists at odd separations and
 * nowhere else; widening this number is a visible change of claim rather than a
 * test that keeps passing.
 */
const MAX_MARGIN_SLACK = 1

/**
 * Columns `x` where `x` and `x + off` are identical in **every** row — the
 * left members of the pairs the encoder constrained at that offset.
 *
 * `sirds.linked.test.ts` carries the same construction and the same reasoning:
 * over a slab identical in every row, a chance agreement across `h` rows is
 * `2^-h`, so at 24 rows this is the set the encoder genuinely linked.
 */
function linkedLeftMembers(img: Uint8Array, w: number, h: number, off: number): number[] {
  const out: number[] = []
  for (let x = 0; x + off < w; x++) {
    let all = true
    for (let y = 0; y < h && all; y++) if (img[y * w + x] !== img[y * w + x + off]) all = false
    if (all) out.push(x)
  }
  return out
}

/** A plate-wide depth map at background, with a near slab spanning `[x0, x1)`. */
function slabFrame(sep: number, w: number, x0: number, x1: number): Uint8Array {
  const h = STRIP_FIELD_HEIGHT
  const depth = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) depth[y * w + x] = 1
  return sirdsFromDepth(depth, w, h, {
    sepFar: sep + STRIP_FAR_GAP, sepNear: sep, cross: false, seed: 7, algorithm: 'linked',
  })
}

/**
 * The left and right dead strips at separation `sep`, measured from encoded
 * frames and in plate columns.
 *
 * Three independent readings, because a probe that can only be checked against
 * the thing it is measuring is not a measurement:
 *
 * - A slab clear of both edges gives `left` directly: its encoded centres run
 *   `[x0, x1)`, so the smallest left member is `x0 - left`. Nothing about the
 *   encoder's rounding is assumed — the offset is read off the frame.
 * - A slab hugging the left edge loses exactly `left` of its columns, so
 *   `L - count` is a second reading of the same quantity by a different route
 *   (a count, not a position). The two are asserted equal.
 * - A slab hugging the right edge gives `right` the same way from the other
 *   end, using the `left` just measured.
 *
 * The windows discard transitive noise: merging two equivalence classes gives
 * both the colour of whichever had the right-most member, so a slab can make
 * two far-apart columns equal at an offset neither was linked at. The repo's
 * own `encodedCentres` filters for the same reason.
 */
function deadStrips(sep: number): { left: number; right: number } {
  const slab = 2 * sep + 20
  const w = 6 * sep + 120
  const x0 = Math.floor((w - slab) / 2)

  const centred = linkedLeftMembers(slabFrame(sep, w, x0, x0 + slab), w, STRIP_FIELD_HEIGHT, sep)
    .filter(x => x >= x0 - sep && x < x0 + slab)
  expect(centred.length, `sep ${sep}: a centred slab encoded nothing`).toBeGreaterThan(0)
  const left = x0 - centred[0]!

  const hugLeft = linkedLeftMembers(slabFrame(sep, w, 0, slab), w, STRIP_FIELD_HEIGHT, sep)
    .filter(x => x >= 0 && x < slab)
  expect(slab - hugLeft.length, `sep ${sep}: the two readings of the left strip disagree`)
    .toBe(left)

  const hugRight = linkedLeftMembers(slabFrame(sep, w, w - slab, w), w, STRIP_FIELD_HEIGHT, sep)
    .filter(x => x >= w - slab - sep && x < w)
  expect(hugRight.length, `sep ${sep}: a right-hugging slab encoded nothing`).toBeGreaterThan(0)
  const right = w - 1 - left - hugRight[hugRight.length - 1]!

  return { left, right }
}

/**
 * Separations swept, chosen so the odd ones are not incidental.
 *
 * Every entry but the first is paired with its neighbour across the parity
 * boundary, because parity is the whole reason the criterion's original
 * equality was wrong; 2 is `marginsFor`'s and `sepAt`'s floor; 110 is the
 * shipped default and 111 the case that refutes the equality.
 */
const STRIP_SEPARATIONS: readonly number[] = [
  2, 3, 4, 5, 10, 11, 46, 47, 92, 93, 110, 111, 140, 141,
]

describe('the linked dead strips fall inside the plate margins', () => {
  it('leaves no column of the margin uncovered, and no more than one to spare', () => {
    // Criterion 4's sensor proper. Both sides come from shipped code: the
    // margin from `marginsFor`, the strips from frames the encoder actually
    // emitted. Measured, 24 rows, seed 7:
    //
    //   sep    left  right   margin
    //     2      1      1      1/1
    //     3      1      2      2/2     <- the criterion's equality is false here
    //    11      5      6      6/6
    //    93     46     47     47/47
    //   110     55     55     55/55    <- and true here, which is why it shipped
    //   111     55     56     56/56
    //   141     70     71     71/71
    for (const sep of STRIP_SEPARATIONS) {
      const { left, right } = deadStrips(sep)
      const margin = marginsFor(sep, 'linked')

      expect(left, `sep ${sep}: left strip escapes the margin`).toBeLessThanOrEqual(margin.left)
      expect(right, `sep ${sep}: right strip escapes the margin`).toBeLessThanOrEqual(margin.right)
      expect(margin.left - left, `sep ${sep}: left margin is slack`)
        .toBeLessThanOrEqual(MAX_MARGIN_SLACK)
      expect(margin.right - right, `sep ${sep}: right margin is slack`)
        .toBeLessThanOrEqual(MAX_MARGIN_SLACK)
    }
  })

  it('is tight on at least one side at every separation, so the bound is not slack twice', () => {
    // The containment above is satisfied by a margin one column too wide on
    // both sides, which `MAX_MARGIN_SLACK` permits by itself. What makes the
    // pair of bounds actually pin the margin is that one side is always
    // exact — `ceil(sep/2)` is the right strip, so the right margin has zero
    // slack at every separation, odd or even. Asserted separately from the
    // containment so that a margin widened by one column is a named failure
    // rather than a quantity drifting inside a tolerance.
    for (const sep of STRIP_SEPARATIONS) {
      const { right } = deadStrips(sep)
      expect(marginsFor(sep, 'linked').right, `sep ${sep}`).toBe(right)
    }
  })

  it('never needs a wider margin than sepFar buys, at any depth a renderable scene has', () => {
    // The half no image can show, and the half that turns a measurement at one
    // separation into a guarantee about the plate. `marginsFor` is a function
    // of `sepFar` alone, so it is the right margin for *every* depth only if
    // no depth encodes wider than `sepFar` does. Swept over `sepAt` across
    // `CONFIGS` rather than reasoned from its body.
    //
    // Scoped to the configurations `resolveStereo` accepts, and the scope is
    // the finding rather than a convenience: under an **inverted** pair the
    // widest separation is at depth 1, not depth 0 — at `92/110` it is 110
    // against a margin cut for 92 — so an inverted scene's margins do not
    // cover its own strips. Nothing renders one (`render.ts` refuses
    // `sepNear >= sepFar`), which is the only reason that is not a defect, and
    // the inverted arm is asserted below rather than skipped.
    let renderable = 0
    for (const s of CONFIGS) {
      if (!(s.sepNear >= 2 && s.sepNear < s.sepFar)) continue
      renderable++
      let widest = Number.NEGATIVE_INFINITY
      for (const sep of separationsOver(s)) if (sep > widest) widest = sep
      const needed = marginsFor(widest, 'linked')
      const bought = marginsFor(s.sepFar, 'linked')
      expect(needed.left, `sepFar ${s.sepFar} / sepNear ${s.sepNear}`)
        .toBeLessThanOrEqual(bought.left)
      expect(needed.right, `sepFar ${s.sepFar} / sepNear ${s.sepNear}`)
        .toBeLessThanOrEqual(bought.right)
    }
    expect(renderable).toBeGreaterThan(0)

    // The inverted arm, pinned so the scope above is a measurement and not an
    // exclusion: the widest separation really is at the near end there, and it
    // really does exceed what `sepFar` pays for.
    const inverted = at(92, 110)
    let widest = Number.NEGATIVE_INFINITY
    for (const sep of separationsOver(inverted)) if (sep > widest) widest = sep
    expect(widest).toBeGreaterThan(inverted.sepFar)
    expect(marginsFor(widest, 'linked').right)
      .toBeGreaterThan(marginsFor(inverted.sepFar, 'linked').right)
  })
})
