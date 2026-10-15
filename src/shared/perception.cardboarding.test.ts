import { describe, expect, it } from 'vitest'
import { DEFAULT_STEREO } from '../core/index.js'
import type { Layer, LayerOf, Scene, StereoOpts } from '../core/types.js'
import {
  cardboarding, DEPTH_BLUR_RELIEF, LAYER_RELIEF_KEYS, reliefOf, restingDepth,
  type CardboardReading, type LayerRelief,
} from './perception.js'

/**
 * `cardboarding` — design §10.5's "true when every layer is a flat plane".
 *
 * Its own file, for the reason `perception.capacity.test.ts` records about
 * `perception.test.ts` and `perception.fusion.test.ts`, and which
 * `perception.collisions.test.ts` and `perception.stops.test.ts` repeat: those
 * files are unmodified by this task, and keeping them that way is what lets
 * them say anything about it.
 *
 * **Five things this file exists to prevent.**
 *
 * 1. *Reporting cardboarding for a layer that has relief.* Execution plan §9
 *    carries the trap verbatim — "`heightmap` mode and `depthBlur` already
 *    ship. The gap is `text` and `shape` only" — so a function that calls a
 *    heightmap layer flat is wrong about the one case the design went out of
 *    its way to name. `does not call a heightmap layer a flat plane` and
 *    `stops calling the scene flat once the depth map is blurred` are the two
 *    sensors, one per shipping mechanism.
 *
 * 2. *A confident answer where the model does not have one.* Two layer cases
 *    are undecidable here and both were measured rather than assumed: `draw`,
 *    whose `fn` is a module path `core` throws on, and an `image`/`gif` with
 *    **neither `mode` nor `mask`**, which `raster.ts`'s `imageReadback` sends
 *    to `hasAlpha ? 'alpha' : 'heightmap'` — a branch on the decoded file.
 *    `cannot decide` covers both, and `decides an image the model fully
 *    describes` is the control that stops `undecided` becoming the answer to
 *    everything.
 *
 * 3. *A variant quietly gaining a relief mechanism.* Design §9.1's adopted
 *    mechanism is a per-variant roster with an `AssertNever` pair each, and
 *    those are invisible to vitest — `npm run typecheck` alone enforces them.
 *    {@link FULLY_POPULATED} is the runtime witness, built the way
 *    `src/core/layerkeys.test.ts` builds its own: compile-forced to carry every
 *    key of every variant, so the keys are observable to `Object.keys` without
 *    anyone hand-listing them (§9: "a hand-written list of the places that do X
 *    is not a check").
 *
 * 4. *A refusal.* R22 obligation 2 and P7 criterion 7: advisory only, never
 *    throws — on an empty scene, an inverted `StereoOpts`, a `draw` layer, or a
 *    discriminant no `Layer` variant has. `answers every scene without
 *    throwing` is that sensor.
 *
 * 5. *An invented grade.* The 2026-10-15 ruling reads "**graded** functions
 *    return quantities and a grade", and nothing here is graded: §10.5 names a
 *    boolean and this returns one. `reports quantities and no grade` pins the
 *    shape, and is the assertion to amend if that reverses.
 *
 * **What this file does not cover, because the module does not build it.**
 * §10.5's cure — per-layer depth blend modes, "a change to one compositing
 * function in `raster.ts`" — is named and scoped out by design §2. §10.7's
 * occupied-levels histogram is P4's. And the *overlap* half of §5.4's tie badge
 * is `collidingPairs`' recorded boundary, not this function's business.
 */

/** The stereo defaults at a given blur radius, and nothing else moved. */
function blurred(depthBlur: number): StereoOpts {
  return { ...DEFAULT_STEREO, depthBlur }
}

/** A scene of exactly these layers, at a size nothing here reads. */
function sceneOf(...layers: Layer[]): Scene {
  return { size: [320, 180], layers }
}

/**
 * One sample per variant carrying **every** key that variant admits.
 *
 * Carried rather than imported from `src/core/layerkeys.test.ts`, which holds
 * the same construction: that file is one this task does not modify, and
 * importing it would couple the two files' lifetimes for no gain — the same
 * reason `perception.stops.test.ts` carries its own copy of
 * `perception.capacity.test.ts`'s configuration sweep.
 *
 * The annotation is what does the work. `{ [T in Layer['type']]: ... }` is
 * total over the variants, so a sixth member of the union is a missing property
 * here; `Required<>` strips the `?`, so every optional key must be supplied.
 * The values are the cheapest thing of the right type — nothing below reads
 * them except `Object.keys`, and `reliefOf`, which only looks at four of them.
 */
const FULLY_POPULATED: { [T in Layer['type']]: Required<LayerOf<T>> } = {
  text: {
    type: 'text', text: 'HELLO', size: 64, font: 'Inter', weight: '700',
    id: 'l1', name: 'title', depth: 1, at: [0, 0], anim: { keys: [] },
  },
  image: {
    type: 'image', src: 'art/ball.png', mode: 'silhouette', mask: 'alpha',
    id: 'l2', name: 'ball', depth: 1, at: [0, 0], anim: { keys: [] },
  },
  gif: {
    type: 'gif', src: 'art/spin.gif', loop: 'loop', mode: 'silhouette',
    mask: 'alpha', id: 'l3', name: 'spin', depth: 1, at: [0, 0],
    anim: { keys: [] },
  },
  shape: {
    type: 'shape', shape: 'circle', r: 40, w: 10, h: 10, start: 0, end: 90,
    id: 'l4', name: 'disc', depth: 1, at: [0, 0], anim: { keys: [] },
  },
  draw: {
    type: 'draw', fn: './pretty.js',
    id: 'l5', name: 'custom', depth: 1, at: [0, 0], anim: { keys: [] },
  },
}

const VARIANTS = Object.keys(FULLY_POPULATED) as Layer['type'][]

/**
 * Enough samples per variant to reach every branch of `reliefOf`.
 *
 * `consults exactly the keys it declares` reads the keys back off a `Proxy`,
 * and a classifier short-circuits: an `image` with `mode: 'heightmap'` never
 * looks at `mask`. One sample per variant would therefore under-report the set
 * and the assertion would be measuring the sample rather than the code. The
 * four image/gif shapes are the four `imageReadback` resolves in — heightmap,
 * explicit silhouette, mask-without-mode, and neither — plus the depth-0 case
 * that reaches `restingDepth`.
 *
 * `text`, `shape` and `draw` get one each because their classifiers are
 * constant functions. If one ever stops being constant, its new branch is
 * unreached here and the key it reads is missing from `reads` — which this
 * test reports, rather than passing quietly.
 */
const BRANCH_COVERING: { [T in Layer['type']]: LayerOf<T>[] } = {
  text: [{ type: 'text', text: 'A' }],
  shape: [{ type: 'shape', shape: 'circle', r: 1 }],
  draw: [{ type: 'draw', fn: './x.js' }],
  image: [
    { type: 'image', src: 'a.png', mode: 'heightmap' },
    { type: 'image', src: 'a.png', mode: 'heightmap', depth: 0 },
    { type: 'image', src: 'a.png', mode: 'silhouette' },
    { type: 'image', src: 'a.png', mask: 'alpha' },
    { type: 'image', src: 'a.png' },
  ],
  gif: [
    { type: 'gif', src: 'a.gif', mode: 'heightmap' },
    { type: 'gif', src: 'a.gif', mode: 'heightmap', depth: 0 },
    { type: 'gif', src: 'a.gif', mode: 'silhouette' },
    { type: 'gif', src: 'a.gif', mask: 'alpha' },
    { type: 'gif', src: 'a.gif' },
  ],
}

describe('reliefOf', () => {
  it('calls a text layer and a shape layer flat, which is the whole defect', () => {
    // Design §10.5: "text and `shape` layers have no relief mechanism". Not an
    // omission to be fixed here — the cure is §2's scoped-out blend modes.
    expect(reliefOf({ type: 'text', text: 'STATIC' })).toBe('flat')
    expect(reliefOf({ type: 'shape', shape: 'circle', r: 40 })).toBe('flat')
  })

  it('does not call a heightmap layer a flat plane', () => {
    // The trap, verbatim from execution plan §9. `raster.ts:215` gives a
    // heightmap layer per-pixel depth, so it is the one shipping per-layer
    // relief mechanism and the one answer this function must not get wrong.
    expect(reliefOf({ type: 'image', src: 'h.png', mode: 'heightmap' })).toBe('relief')
    expect(reliefOf({ type: 'gif', src: 'h.gif', mode: 'heightmap' })).toBe('relief')
  })

  it('decides an image the model fully describes', () => {
    // The control on `cannot decide` below: `undecided` must not be the answer
    // to every image. An explicit `silhouette`, and a `mask` with no `mode`,
    // are both decidable — `imageReadback` resolves the second to the mask
    // without consulting the file, which is the clause `raster.ts:443` records
    // the plan's own three-line version omitting.
    expect(reliefOf({ type: 'image', src: 'a.png', mode: 'silhouette' })).toBe('flat')
    expect(reliefOf({ type: 'image', src: 'a.png', mask: 'alpha' })).toBe('flat')
    expect(reliefOf({ type: 'image', src: 'a.png', mask: { luma: 0.5 } })).toBe('flat')
    expect(reliefOf({ type: 'gif', src: 'a.gif', mode: 'silhouette' })).toBe('flat')
  })

  it('cannot decide an image with no mode, because the answer is in the file', () => {
    // `imageReadback(undefined, undefined, hasAlpha)` returns
    // `hasAlpha ? 'alpha' : 'heightmap'`. `hasAlpha` comes from `await
    // loadImage(...)`, so this is `collidingPairs`' recorded boundary again —
    // an async decode, which execution plan §7's preamble puts outside a plain
    // importable module.
    expect(reliefOf({ type: 'image', src: 'a.png' })).toBe('undecided')
    expect(reliefOf({ type: 'gif', src: 'a.gif' })).toBe('undecided')
  })

  it('cannot decide a draw layer, because `fn` is a module path', () => {
    // `raster.ts:386` throws on `draw` in `core` for this reason: resolving a
    // module path is platform-specific and the loader seam is undesigned. The
    // module it names could draw a gradient or a slab and nothing here can see
    // which.
    expect(reliefOf({ type: 'draw', fn: './relief.js' })).toBe('undecided')
  })

  it('reads a heightmap scaled to depth 0 as the flat plane it composites to', () => {
    // `raster.ts:215` is `clamp01(baseDepth * luma + depthOffset)` with
    // `baseDepth = layer.depth ?? 1`, so at depth 0 the luminance term vanishes
    // and every pixel of the layer lands on the same value. The relief is not
    // merely invisible, it is not computed.
    expect(reliefOf({ type: 'image', src: 'h.png', mode: 'heightmap', depth: 0 }))
      .toBe('flat')
    // And the depth that decides it is `restingDepth`'s, not a local `?? 0`:
    // an absent depth is 1, which is relief, not flat.
    expect(restingDepth({ type: 'image', src: 'h.png', mode: 'heightmap' })).toBe(1)
    expect(reliefOf({ type: 'image', src: 'h.png', mode: 'heightmap' })).toBe('relief')
  })

  it('treats a depth sweep as a translation of the plane, not a bend in it', () => {
    // Design §5.3 draws a depth-verb layer as "the resting mark plus a swept
    // range", and `collidingPairs` had to choose between the two readings. Here
    // they agree, and the reason is structural: `composite` adds the animator's
    // `t.depth` to **every** pixel of the layer uniformly, so a sweep moves a
    // flat plane along z and never bends it. A swept layer is a flat plane at
    // every frame.
    const swept: Layer = {
      type: 'text', text: 'STATIC',
      anim: { keys: [{ t: 0, depth: 0 }, { t: 1, depth: 1 }] },
    }
    expect(reliefOf(swept)).toBe('flat')
    // The same offset is additive against a heightmap's scaled luminance, so a
    // depth-0 heightmap stays flat under a sweep too — `clamp01(0 * luma +
    // offset)` is one value for the whole layer.
    const sweptZero: Layer = {
      type: 'image', src: 'h.png', mode: 'heightmap', depth: 0,
      anim: { keys: [{ t: 0, depth: 0 }, { t: 1, depth: 0.5 }] },
    }
    expect(reliefOf(sweptZero)).toBe('flat')
  })

  it('answers every variant without throwing, including one no variant has', () => {
    for (const t of VARIANTS) {
      const relief: LayerRelief = reliefOf(FULLY_POPULATED[t] as Layer)
      expect(['flat', 'relief', 'undecided']).toContain(relief)
    }
    // Advisory only (R22 obligation 2): a discriminant outside the union is
    // unreachable through the types and reachable through a cast, and the
    // honest answer to it is the same as `draw`'s.
    expect(reliefOf({ type: 'hologram' } as unknown as Layer)).toBe('undecided')
  })
})

describe('LAYER_RELIEF_KEYS', () => {
  it('accounts for every key of every variant, in both directions', () => {
    // The runtime witness for the five `AssertNever` pairs, which
    // `npm run typecheck` enforces and `npm test` cannot see. The comparison is
    // against the keys the compile-forced samples actually carry, never against
    // a second hand-written roster — execution plan §9: "a guard derived from
    // the roster it guards proves only that the derivation ran twice."
    const disagreements: string[] = []
    for (const t of VARIANTS) {
      const entry = LAYER_RELIEF_KEYS[t]
      const accounted = new Set<string>([...entry.reads, ...entry.inert])
      const actual = new Set(Object.keys(FULLY_POPULATED[t]))
      for (const k of actual) {
        if (!accounted.has(k)) disagreements.push(`${t}.${k} is on the type, unclassified`)
      }
      for (const k of accounted) {
        if (!actual.has(k)) disagreements.push(`${t}.${k} is classified, not on the type`)
      }
    }
    expect(disagreements).toEqual([])
  })

  it('classifies each key once, so neither list is the other\'s escape hatch', () => {
    // A key in both lists would be read *and* dismissed, which is how the
    // decision record stops being one.
    for (const t of VARIANTS) {
      const entry = LAYER_RELIEF_KEYS[t]
      const both = entry.reads.filter(k => (entry.inert as readonly string[]).includes(k))
      expect(both).toEqual([])
    }
  })

  it('consults exactly the keys it declares, per variant', () => {
    // The hole the `AssertNever` pairs cannot cover: moving a key from `reads`
    // to `inert` satisfies both of them, and is exactly how a key stops being
    // consulted without anyone saying so. Measured as a hole first — demoting
    // `mode` on `image` alone reddened nothing, because a *union* over the five
    // variants still found `mode` in `gif`'s copy. So the check is per variant
    // and the true set is recovered from the code rather than retyped:
    // `reliefOf` runs behind a `Proxy` that records every property read.
    //
    // Execution plan §9: "derive it from the thing that makes a site one of
    // them — the call sites … never from an enumeration someone typed."
    for (const t of VARIANTS) {
      const touched = new Set<string>()
      for (const sample of BRANCH_COVERING[t]) {
        reliefOf(new Proxy(sample, {
          get(target, key) {
            if (typeof key === 'string') touched.add(key)
            return Reflect.get(target, key)
          },
        }) as Layer)
      }
      expect({ [t]: [...touched].sort() })
        .toEqual({ [t]: [...LAYER_RELIEF_KEYS[t].reads].sort() })
    }
  })
})

describe('cardboarding', () => {
  it('reports a scene of text and shapes as every layer a flat plane', () => {
    const r = cardboarding(
      sceneOf({ type: 'text', text: 'STATIC' }, { type: 'shape', shape: 'circle', r: 40 }),
      DEFAULT_STEREO,
    )
    expect(r.cardboarding).toBe(true)
    expect(r.relief).toEqual(['flat', 'flat'])
  })

  it('is index-aligned with scene.layers, which is the only identifier they have', () => {
    // `collidingPairs` records why: `Layer.id` is optional by design §4.1, and
    // design §5.4 measured `max` commutative, so the index is stable.
    const r = cardboarding(
      sceneOf(
        { type: 'text', text: 'A' },
        { type: 'image', src: 'h.png', mode: 'heightmap' },
        { type: 'draw', fn: './x.js' },
      ),
      DEFAULT_STEREO,
    )
    expect(r.relief).toEqual(['flat', 'relief', 'undecided'])
    expect(r.relief).toHaveLength(3)
  })

  it('withholds the claim when one layer has relief', () => {
    const r = cardboarding(
      sceneOf({ type: 'text', text: 'A' }, { type: 'image', src: 'h.png', mode: 'heightmap' }),
      DEFAULT_STEREO,
    )
    expect(r.cardboarding).toBe(false)
  })

  it('withholds the claim when one layer cannot be decided', () => {
    // The direction matters and it is the opposite of `collidingPairs`'. That
    // function ships the **necessary** condition, so it over-reports and P4
    // filters. This one is a claim that a defect is *present*, so the
    // conservative direction is silence — the same stance `fusionComfort` takes
    // on a budget it cannot read and `depthStops` on a configuration it cannot.
    const r = cardboarding(
      sceneOf({ type: 'text', text: 'A' }, { type: 'draw', fn: './x.js' }),
      DEFAULT_STEREO,
    )
    expect(r.cardboarding).toBe(false)
    expect(r.relief).toEqual(['flat', 'undecided'])
  })

  it('stops calling the scene flat once the depth map is blurred', () => {
    // The second shipping mechanism (design §10.5, execution plan §9). Pinned
    // from both sides of {@link DEPTH_BLUR_RELIEF}, because only the boundary
    // can tell a threshold from a `> 0`: `blurDepth` blurs at any radius above
    // zero, and the observation behind this constant was taken at 1 and 2.
    const flat = sceneOf({ type: 'text', text: 'A' })
    const justUnder = blurred(DEPTH_BLUR_RELIEF - Number.EPSILON * DEPTH_BLUR_RELIEF)
    expect(cardboarding(flat, justUnder).cardboarding).toBe(true)
    expect(cardboarding(flat, blurred(DEPTH_BLUR_RELIEF)).cardboarding).toBe(false)
    expect(cardboarding(flat, blurred(DEPTH_BLUR_RELIEF * 2)).cardboarding).toBe(false)
    // Off, and below off. `blurDepth` returns a copy for `radius <= 0`, so a
    // negative radius is not blur at all and the scene is still flat planes.
    expect(cardboarding(flat, blurred(0)).cardboarding).toBe(true)
    expect(cardboarding(flat, blurred(-4)).cardboarding).toBe(true)
  })

  it('puts the boundary at the radii the observation was taken at', () => {
    // Added after the fact, because the test above was measured not to see
    // {@link DEPTH_BLUR_RELIEF} move: it spells the boundary through the
    // constant, so re-pointing the constant at 2 re-points the assertion with
    // it and the mutation survived. A threshold expressed only in terms of
    // itself is pinned by nothing.
    //
    // The radii here are literal for the same reason
    // `perception.fusion.test.ts` writes `140/78` and `100/80` literally: they
    // are the configurations the evidence was taken at, not today's output.
    // `src/core/types.ts` records blur **0** as "clean … more of a floating
    // square" and blur **1** and **2** as "connected to and protruding from the
    // background". Those three radii are the whole trial, and 0.5 is in the gap
    // nobody has looked at — which this reports as a flat plane, the reading
    // `types.ts` states for that band ("the cure is above perceptual threshold
    // and the disease is below it"). Move any of these and you are claiming a
    // measurement that does not exist yet.
    const flat = sceneOf({ type: 'text', text: 'A' })
    expect(cardboarding(flat, blurred(0)).cardboarding).toBe(true)
    expect(cardboarding(flat, blurred(0.5)).cardboarding).toBe(true)
    expect(cardboarding(flat, blurred(1)).cardboarding).toBe(false)
    expect(cardboarding(flat, blurred(2)).cardboarding).toBe(false)
  })

  it('leaves the layers alone when the blur is what defeats the claim', () => {
    // `relief` is each layer's **own** mechanism, before `depthBlur` — which is
    // scene-wide and sits on the composited map, not on any one layer. A
    // consumer that wants the per-layer badge reads `relief`; one that wants
    // §10.5's answer reads `cardboarding`, and the two disagree here by design.
    const r = cardboarding(sceneOf({ type: 'text', text: 'A' }), blurred(2))
    expect(r.cardboarding).toBe(false)
    expect(r.relief).toEqual(['flat'])
    expect(r.depthBlur).toBe(2)
    expect(r.blurRelief).toBe(DEPTH_BLUR_RELIEF)
  })

  it('says nothing at all about a scene with no layers', () => {
    // Vacuously every layer of an empty scene is a flat plane, and reporting
    // that is a truth about the quantifier rather than an observation about the
    // scene — a readout saying "every layer is a flat plane" of a scene with no
    // layers. `stopCount`'s capacity-of-1 answer is the same shape: a claim
    // that needs something to be about.
    const r = cardboarding(sceneOf(), DEFAULT_STEREO)
    expect(r.cardboarding).toBe(false)
    expect(r.relief).toEqual([])
  })

  it('answers every scene without throwing, the inverted pair included', () => {
    // R22 obligation 2 / P7 criterion 7. The inverted case is the one
    // `resolveStereo` refuses, which is why this signature takes resolved
    // options and never calls it.
    const everything = sceneOf(...VARIANTS.map(t => FULLY_POPULATED[t] as Layer))
    const opts: StereoOpts[] = [
      DEFAULT_STEREO,
      { ...DEFAULT_STEREO, sepFar: 92, sepNear: 110 },
      { ...DEFAULT_STEREO, sepFar: 110, sepNear: 110 },
      blurred(Number.NaN),
      blurred(Number.POSITIVE_INFINITY),
      blurred(-1),
    ]
    for (const o of opts) {
      expect(() => cardboarding(everything, o)).not.toThrow()
      expect(() => cardboarding(sceneOf(), o)).not.toThrow()
    }
  })

  it('keeps quiet on a blur radius it cannot read', () => {
    // Ordered so a non-finite radius falls through to the silent answer rather
    // than to the claim: every comparison against NaN is false. The caller
    // still sees the NaN in `depthBlur`.
    const r = cardboarding(sceneOf({ type: 'text', text: 'A' }), blurred(Number.NaN))
    expect(r.cardboarding).toBe(false)
    expect(Number.isNaN(r.depthBlur)).toBe(true)
  })

  it('reports quantities and no grade', () => {
    // The 2026-10-15 ruling: "**graded** functions return quantities and a
    // grade". Design §10.5 names a boolean and nothing here is compared against
    // a scale, so no grade was invented — R22 obligation 4 forbids exactly that
    // invention. This is the assertion to amend if the ruling reverses, and the
    // in-file precedent is `encodableDepths`, `collidingPairs` and `depthStops`.
    const r: CardboardReading = cardboarding(sceneOf({ type: 'text', text: 'A' }), DEFAULT_STEREO)
    expect(Object.keys(r).sort()).toEqual(['blurRelief', 'cardboarding', 'depthBlur', 'relief'])
    // The threshold travels with the reading, so no consumer inlines it (R22
    // obligation 3, P7 criterion 6).
    expect(r.blurRelief).toBe(DEPTH_BLUR_RELIEF)
  })
})
