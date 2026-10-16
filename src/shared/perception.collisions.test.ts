import { describe, expect, it } from 'vitest'
import { DEFAULT_STEREO, sepAt } from '../core/index.js'
import type { Layer, Scene, StereoOpts } from '../core/types.js'
import {
  collidingPairs, disparityBudget, quantisationStep, restingDepth,
  type CollidingPair,
} from './perception.js'

/**
 * `collidingPairs` and `restingDepth` — the consumer half of design §10.1,
 * "layer pairs closer than one step, which encode identically".
 *
 * Its own file. The reason given when this file was written was the one
 * `perception.capacity.test.ts` records — *"those files are unmodified by
 * this task, and keeping them that way is what lets them say anything about
 * it"* — and **that reason is spent**: `perception.test.ts` was modified at
 * `b3e7601` and `f352b99`, both later than `8d08ef1`, which created this
 * file. The chain it was quoting was also wrong about which file ever
 * witnessed the move; the correction is at `perception.fusion.test.ts`'s
 * docblock. The separation stands on its own merits.
 *
 * **Three things this file exists to prevent.**
 *
 * 1. *A restated threshold.* `collidingPairs` must compare against
 *    {@link quantisationStep}, not against a second copy of `1 / (sepFar −
 *    sepNear)`. The sweep in `keys on quantisationStep itself` is the
 *    discriminator: the two disagree in sign on an inverted pair, so a config
 *    list containing one tells them apart. A pin both implementations pass is
 *    not a pin.
 *
 * 2. *A sign-unsafe comparison.* `perception.capacity.test.ts`'s `is a
 *    magnitude` records that dropping the `Math.abs` from `quantisationStep`
 *    reddened nothing in that file, and traces the consequence here: against a
 *    negative step, `|Δdepth| < step` is false for **every** pair, so an
 *    inverted configuration silently reports no collisions. That is the
 *    fail-open shape, and `is sign-safe` below is the assertion that sees it.
 *    There is a second `Math.abs` in play — the one on the gap itself — and
 *    `the gap is a magnitude` is its sensor: without it, the *further* apart an
 *    ascending pair is, the more certainly it is reported as a collision.
 *
 * 3. *Behaviour pinned on the shipped examples.* It is not. Every scene here is
 *    constructed. The three committed examples were measured to contain no
 *    `image`, `gif` or `draw` layer at all, so `reads depth alone` is the only
 *    place type-independence is pinned.
 *
 * **Where the boundary is backed by something other than the constant being
 * tested.** `exactly one step apart` reads the answer off `sepAt` as well as
 * off the function — one step apart encodes to two different separations, a
 * sub-step pair encodes to one — so the boundary assertion does not derive its
 * bound from the very quantity it is checking.
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
 * A scene whose layers differ in **nothing but depth** — `undefined` omits the
 * field, which is how the "no depth means 1" case is constructed.
 *
 * `circle` with an `r`, because that is a layer the rasteriser would accept;
 * the function under test never rasterises, and `reads depth alone` is where
 * that is asserted rather than assumed.
 */
function depths(...ds: readonly (number | undefined)[]): Scene {
  return {
    size: [64, 64],
    layers: ds.map((d): Layer => (d === undefined
      ? { type: 'shape', shape: 'circle', r: 8 }
      : { type: 'shape', shape: 'circle', r: 8, depth: d })),
  }
}

/**
 * The returned pairs as sorted `a-b` labels.
 *
 * Sorted because an assertion on an unsorted list pins the enumeration order
 * as well as the membership, and only the membership is the guarantee. The
 * *normalisation* (that a pair is reported once, lower index first) is a
 * separate claim and `enumerates each unordered pair once` is where it is
 * pinned.
 */
function labels(pairs: readonly CollidingPair[]): string[] {
  return pairs.map(p => `${p.a}-${p.b}`).sort()
}

/**
 * Two depths that fall in the same rounding bucket at the defaults.
 *
 * Not arbitrary: at 110/92 the separation is `round(110 − 18z)`, so both of
 * these land on 109 — which `exactly one step apart` asserts through `sepAt`
 * rather than through this comment. Their gap is 0.05 against a step of
 * 0.0555…, i.e. inside the step with room to spare on both sides of the
 * float.
 */
const SAME_BUCKET: readonly [number, number] = [0.03, 0.08]

/**
 * Every regime the capacity sweep covers, minus the ones whose step is not a
 * finite distance.
 *
 * Carried here rather than imported because `perception.capacity.test.ts` is
 * one of the files this task does not modify. Inverted (`92/110`), fractional
 * (`110.5/92`), clamped (`110/1`) and negative-separation (`50/-10`) cases are
 * all present, and the filter below keeps the list honest about which of them
 * survived it.
 */
const CONFIGS: readonly StereoOpts[] = [
  at(110, 92), at(110, 88), at(140, 78), at(100, 80), at(10, 9), at(10, 8),
  at(3, 2), at(200, 2), at(110.4, 92.3), at(110.5, 92.5), at(110.5, 92),
  at(110, 92.5), at(10.4, 8.4), at(99.7, 2.2), at(92, 110), at(110, 110),
  at(110, 1), at(110, 0), at(50, -10), at(2, 2),
]

const D = DEFAULT_STEREO

describe('collidingPairs finds the layer pairs the encoder cannot tell apart', () => {
  it('reports a pair closer than one step, with the gap it measured', () => {
    const scene = depths(0.50, 0.51, 0.0)
    const pairs = collidingPairs(scene, D)
    expect(labels(pairs)).toEqual(['0-1'])
    // Quantities first, design §10's preamble — the panel shows the distance,
    // not only the fact. 0.01 against a step of 1/18.
    expect(pairs[0]!.gap).toBeCloseTo(0.01, 12)
    expect(pairs[0]!.gap).toBeLessThan(quantisationStep(D))

    // **The one assertion here that is pending a ruling, named so the next
    // reader amends it rather than deletes it.** Design §10's preamble says
    // every function in this module returns quantities *and* a grade; §10.1
    // titles capacity and collisions objective. The conflict is escalated and
    // unresolved. This follows the in-file precedent for an objective quantity
    // — `disparityBudget` and `encodableDepths` are bare numbers, only
    // `fusionComfort` carries a reading — and pins the ungraded shape so that
    // adding a grade is a deliberate edit here, not a silent widening.
    expect(Object.keys(pairs[0]!).sort()).toEqual(['a', 'b', 'gap'])
  })

  it('treats exactly one step apart as no collision, and sepAt says why', () => {
    const step = quantisationStep(D)

    // **The boundary, decided.** Strictly closer than one step. Design §10.1
    // words it "closer than one step", and `quantisationStep`'s own docblock
    // gives the reason that wording is right: a depth difference of `1 /
    // budget` moves `sepAt`'s argument by exactly 1, "and a rounding of two
    // values a whole apart cannot collapse them". So a pair exactly one step
    // apart is a pair the encoder *does* resolve, and reporting it would be a
    // false positive on the badge design §5.4 drives.
    //
    // Asserted against the encoder as well as against the function, so this
    // does not take its bound from the quantity under test:
    expect(sepOf(D, 0)).not.toBe(sepOf(D, step))
    expect(labels(collidingPairs(depths(0, step), D))).toEqual([])

    // And the other side of the boundary, with the same independent witness:
    // these two depths encode to the *same* separation, which is the condition
    // design §10.1 names ("which encode identically").
    const [lo, hi] = SAME_BUCKET
    expect(sepOf(D, lo)).toBe(sepOf(D, hi))
    expect(hi - lo).toBeLessThan(step)
    expect(labels(collidingPairs(depths(lo, hi), D))).toEqual(['0-1'])
  })

  it('keys on quantisationStep itself, across every configuration', () => {
    // Criterion 2: the threshold is *called*, not restated. A second copy
    // written as `1 / (sepFar − sepNear)` agrees with the real one everywhere
    // the pair is the right way round and disagrees in sign at `92/110`, where
    // it would report nothing at all; a copy written from design §10.1's
    // closed form `sepFar − sepNear + 1` disagrees everywhere. Both are
    // excluded by running the same two probes against all of CONFIGS.
    const finite = CONFIGS.filter(s => Number.isFinite(quantisationStep(s)))
    expect(finite.length).toBeGreaterThan(0)
    // The inverted config must survive the filter, or this sweep is blind to
    // the one case that discriminates.
    expect(finite.some(s => disparityBudget(s) < 0)).toBe(true)

    for (const s of finite) {
      const step = quantisationStep(s)
      const tag = `${s.sepFar}/${s.sepNear}`
      // Exactly one step: resolved, so not a collision.
      expect(labels(collidingPairs(depths(0, step), s)), tag).toEqual([])
      // A tenth under it: closer than one step, so a collision — whatever the
      // regime. 0.9 rather than `1 − ε` because the claim being pinned is the
      // comparison, not float spacing.
      expect(labels(collidingPairs(depths(0, step * 0.9), s)), tag).toEqual(['0-1'])
    }
  })

  it('is sign-safe: an inverted configuration reports the same collisions', () => {
    // The defect this function was given in advance.
    // `perception.capacity.test.ts`'s `is a magnitude` records that dropping
    // the `Math.abs` from `quantisationStep` reddened **nothing** — the sweeps
    // there step backwards as happily as forwards. The loss lands here: a step
    // of −1/18 makes `gap < step` false for every pair, and an inverted scene
    // reports no collisions at all while looking perfectly healthy.
    const inverted = at(92, 110)
    const forward = at(110, 92)
    expect(disparityBudget(inverted)).toBeLessThan(0)

    const [lo, hi] = SAME_BUCKET
    const scene = depths(lo, hi, 0.60)
    expect(labels(collidingPairs(scene, inverted))).toEqual(['0-1'])
    // And it is the *same* answer, not merely a non-empty one: the budget's
    // sign is not a perceptual fact and must not change what is reported.
    expect(labels(collidingPairs(scene, inverted)))
      .toEqual(labels(collidingPairs(scene, forward)))
  })

  it('measures a gap as a magnitude, so layer order cannot change the answer', () => {
    // The second `Math.abs`, and its failure mode is the opposite of the
    // first's. Without it the comparison is `depth[a] − depth[b] < step`, and
    // for a pair listed near-to-far that difference is *negative* — so the
    // further apart two layers are, the more certainly they are reported as
    // tied. A false positive that grows with the distance.
    const [lo, hi] = SAME_BUCKET
    const far: readonly [number, number] = [0.0, 1.0]

    expect(labels(collidingPairs(depths(far[0], far[1]), D))).toEqual([])
    expect(labels(collidingPairs(depths(far[1], far[0]), D))).toEqual([])
    expect(labels(collidingPairs(depths(lo, hi), D))).toEqual(['0-1'])
    expect(labels(collidingPairs(depths(hi, lo), D))).toEqual(['0-1'])

    // The reported distance is the same both ways round too, not just the
    // membership.
    expect(collidingPairs(depths(lo, hi), D)[0]!.gap)
      .toBe(collidingPairs(depths(hi, lo), D)[0]!.gap)
    expect(collidingPairs(depths(lo, hi), D)[0]!.gap).toBeGreaterThan(0)
  })

  it('enumerates each unordered pair once and never pairs a layer with itself', () => {
    // Four layers at one depth is the worst case: 6 pairs if the enumeration
    // is right, 12 if it reports both orders, 16 if it pairs a layer with
    // itself, 10 if it only walks neighbours. Every one of those is a distinct
    // wrong answer and this distinguishes all of them.
    const pairs = collidingPairs(depths(0.5, 0.5, 0.5, 0.5), D)
    expect(labels(pairs)).toEqual(['0-1', '0-2', '0-3', '1-2', '1-3', '2-3'])
    expect(pairs.length).toBe(6)
    for (const p of pairs) expect(p.a).toBeLessThan(p.b)
    // The two empty cases, carried here rather than alone: on their own they
    // pass against a function that returns nothing at all, which is exactly
    // the stub this file was first run against.
    expect(collidingPairs(depths(0.5), D)).toEqual([])
    expect(collidingPairs(depths(), D)).toEqual([])
  })

  it('reads an omitted depth as 1, the default the rasteriser composites at', () => {
    // `raster.ts` hoists `const layerDepth = layer.depth ?? 1` before building
    // the preset context, and `types.ts` documents the field as "Default 1
    // (nearest)". A collision check that read an absent depth as 0 would miss
    // the single commonest tie there is — two layers neither of which has ever
    // been given a depth.
    expect(restingDepth({ type: 'shape', shape: 'circle', r: 8 })).toBe(1)
    expect(labels(collidingPairs(depths(undefined, 1, 0), D))).toEqual(['0-1'])
    expect(labels(collidingPairs(depths(undefined, undefined), D))).toEqual(['0-1'])
  })

  it('collides every pair at a zero budget, the flat plane the capacity reports', () => {
    // The degenerate configuration, answered the same way the rest of the
    // module answers it. `encodableDepths` calls a zero budget one level and
    // `quantisationStep` calls it an infinite step — "no depth difference
    // encodes differently" — and the only reading of that consistent with both
    // is that every pair collides. It is the flat plane `resolveStereo`
    // describes in prose when it refuses `sepNear >= sepFar`, which this
    // advisory module must report without throwing.
    const flat = at(110, 110)
    expect(quantisationStep(flat)).toBe(Number.POSITIVE_INFINITY)
    expect(labels(collidingPairs(depths(0, 0.5, 1), flat)))
      .toEqual(['0-1', '0-2', '1-2'])
  })

  it('reads depth alone, so the layer type cannot change the answer', () => {
    // Criterion 3's corpus note, made into an assertion. The three committed
    // examples contain no `image`, `gif` or `draw` layer at all, so no fixture
    // in this repository could have caught a `collidingPairs` that skipped a
    // type — a `switch` over `layer.type` with four arms, say, or a filter to
    // the layers it knows how to measure.
    const [lo, hi] = SAME_BUCKET
    const mixed: Scene = {
      size: [64, 64],
      layers: [
        { type: 'text', text: 'HELLO', size: 90, depth: lo },
        { type: 'image', src: 'ball.png', depth: hi },
        { type: 'gif', src: 'spin.gif', depth: 0.60 },
        { type: 'shape', shape: 'rect', w: 10, h: 10, depth: 0.62 },
        { type: 'draw', fn: './wave.js', depth: 0.0 },
      ],
    }
    // 0–1 and 2–3 are inside a step of each other; 0–4 is `lo` against the
    // `draw` layer at 0, a gap of 0.03. Nothing else is within 0.0555.
    expect(labels(collidingPairs(mixed, D))).toEqual(['0-1', '0-4', '2-3'])
    // And the same depths as bare shapes give the same answer — the types
    // contributed nothing.
    expect(labels(collidingPairs(depths(lo, hi, 0.60, 0.62, 0.0), D)))
      .toEqual(['0-1', '0-4', '2-3'])
  })

  it('answers a non-finite depth with no collision rather than a throw', () => {
    // Advisory only (R22, design §10's second obligation): this module never
    // throws, clamps or corrects, and an editor control mid-edit is exactly
    // where a `NaN` depth comes from. Every comparison against `NaN` is false,
    // so a `NaN` layer ties with nothing — silence on a number the function
    // cannot read, which is the same stance `fusionComfort` takes on a
    // non-finite budget. The rest of the scene is still measured, which is the
    // half that matters: one unreadable layer must not blind the check.
    const [lo, hi] = SAME_BUCKET
    expect(labels(collidingPairs(depths(Number.NaN, lo, hi), D))).toEqual(['1-2'])
    expect(labels(collidingPairs(depths(Number.POSITIVE_INFINITY, lo, hi), D)))
      .toEqual(['1-2'])
    // Two infinities are not a tie either: their difference is `NaN`, not 0.
    expect(labels(collidingPairs(
      depths(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY), D,
    ))).toEqual([])
  })

  it('reads the resting depth, which an animated depth channel does not move', () => {
    // **The scope, pinned rather than written down** (§9: a recorded note is
    // not a sensor). `Transform.depth` is an animatable channel, so a layer's
    // depth can sweep a range rather than sit at a point, and "closer than one
    // step" is then a question about time. Design §10.1 does not say which it
    // means and the gap is reported, not guessed: this reads the **resting**
    // depth, the pose before any animator runs.
    //
    // This test is the tripwire. The day someone makes the check
    // time-dependent it reddens, and the right fix is to replace it with the
    // semantics that was chosen — not to widen it.
    const animated: Layer = {
      type: 'shape', shape: 'circle', r: 8, depth: 0.5,
      anim: { keys: [{ t: 0, depth: 0 }, { t: 1, depth: 0.45 }] },
    }
    expect(restingDepth(animated)).toBe(0.5)

    // At rest these two are 0.02 apart and tie. At t=1 the animator has
    // carried the first to 0.95, nowhere near the second — so a time-aware
    // version of this function would answer differently for most of the
    // scene's duration.
    const scene: Scene = {
      size: [64, 64], duration: 2,
      layers: [animated, { type: 'shape', shape: 'circle', r: 8, depth: 0.52 }],
    }
    expect(labels(collidingPairs(scene, D))).toEqual(['0-1'])
  })
})
