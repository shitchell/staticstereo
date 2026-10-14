import { describe, expect, it } from 'vitest'
import {
  SCALED_CHANNELS,
  SCALED_SHAPE_LENGTHS,
  SCALED_TEXT_LENGTHS,
  SCALE_FREE_PRESET_KINDS,
  SCALE_NOTES,
  SCALE_REFUSALS,
  UNSCALED_CHANNELS,
  UNSCALED_SHAPE_NUMBERS,
  isTrackAnimator,
  presetIsScaleFree,
  scaleNotice,
  scaleScene,
} from './scalescene.js'
import type { ScaleRefusal } from './scalescene.js'
import { renderFit } from './scale.js'
import type { RenderFit } from './scale.js'
import { DEFAULT_STEREO, PRESETS, compilePreset, composeAnim, plateLayoutOf } from '../src/core/index.js'
import type { PresetCtx } from '../src/core/index.js'
import type { Layer, Preset, Scene, Track, Transform } from '../src/core/types.js'

/**
 * `scaleScene` — scale what can be scaled, refuse the rest, say why.
 *
 * Everything here is constructed in-memory and asserted on **structure**: no
 * DOM, no fixtures on disk, no pinned output values beyond the ones that are
 * the point (a factor applied is a multiplication, and a multiplication has an
 * exact answer). The house rule from `markup.test.ts` applies throughout —
 * every enumeration-driven assertion carries a vacuity floor, so a loop that
 * silently stops matching cannot pass.
 */

/* ------------------------------------------------------------- type guards */

/** Errors unless its argument is `never` — the same device `src/core/types.ts` uses. */
type AssertNever<T extends never> = T

/**
 * **The classification cannot be forgotten.**
 *
 * Every `Layer` variant is either scaled or refused, and these two arms must
 * between them cover `Layer['type']` exactly. A sixth variant added to the
 * model is a COMPILE error here until somebody decides which arm it is in —
 * which is the whole difference between "we have not got to images yet" and
 * "images silently render at their authored size inside a half-size frame".
 */
const SCALED_LAYER_TYPES = ['text', 'shape'] as const
const REFUSED_LAYER_TYPES = ['image', 'gif', 'draw'] as const
type ClassifiedLayerType =
  | typeof SCALED_LAYER_TYPES[number]
  | typeof REFUSED_LAYER_TYPES[number]
type _NoLayerVariantUnclassified = AssertNever<Exclude<Layer['type'], ClassifiedLayerType>>
type _NoLayerVariantInvented = AssertNever<Exclude<ClassifiedLayerType, Layer['type']>>

/** The numeric members of a type, so an enumeration can be proved exhaustive. */
type NumericKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends number ? K : never
}[keyof T]

/**
 * The shape variant's **own** numbers — `LayerBase`'s `depth`/`at`/`anim` are
 * handled once for every variant and are excluded here so this guard is about
 * the variant and nothing else.
 */
type ShapeOwn = Omit<
  Extract<Layer, { type: 'shape' }>,
  'type' | 'shape' | 'depth' | 'at' | 'anim'
>
type ClassifiedShapeNumber =
  | typeof SCALED_SHAPE_LENGTHS[number]
  | typeof UNSCALED_SHAPE_NUMBERS[number]
type _NoShapeNumberUnclassified = AssertNever<Exclude<NumericKeys<ShapeOwn>, ClassifiedShapeNumber>>
type _NoShapeNumberInvented = AssertNever<Exclude<ClassifiedShapeNumber, NumericKeys<ShapeOwn>>>

type TextOwn = Omit<
  Extract<Layer, { type: 'text' }>,
  'type' | 'text' | 'font' | 'weight' | 'depth' | 'at' | 'anim'
>
type _NoTextNumberUnclassified = AssertNever<
  Exclude<NumericKeys<TextOwn>, typeof SCALED_TEXT_LENGTHS[number]>
>
type _NoTextNumberInvented = AssertNever<
  Exclude<typeof SCALED_TEXT_LENGTHS[number], NumericKeys<TextOwn>>
>

/** Every keyframe channel is either a scene-px length or deliberately not one. */
type ClassifiedChannel = typeof SCALED_CHANNELS[number] | typeof UNSCALED_CHANNELS[number]
type _NoChannelUnclassified = AssertNever<Exclude<keyof Transform, ClassifiedChannel>>
type _NoChannelInvented = AssertNever<Exclude<ClassifiedChannel, keyof Transform>>

/* ------------------------------------------------------------------ fixtures */

/**
 * A plan at an exact factor.
 *
 * `renderFit` solves for a factor from a container size, which is the wrong
 * direction for a test of what the factor *does*. This builds the same
 * `RenderFit` the real solver would have produced for a given `sceneScale`,
 * internally consistent by construction: `sceneWidth`/`sceneHeight` are the
 * floor of the factor per axis (W2's seam — the sub-pixel residue is absorbed
 * at the stage edge), margins come from `plateLayoutOf` rather than a literal,
 * and the backing store is the plate times `noiseScale`.
 *
 * Criterion 6 is the one test that uses the *real* `renderFit`, which is what
 * ties this fixture back to the shipped arithmetic.
 */
function planAt(scene: Scene, sceneScale: number): RenderFit {
  const { margins } = plateLayoutOf(scene)
  const noiseScale = scene.stereo?.noiseScale ?? DEFAULT_STEREO.noiseScale
  const sceneWidth = Math.floor(sceneScale * scene.size[0])
  const sceneHeight = Math.floor(sceneScale * scene.size[1])
  const plateWidth = margins.left + sceneWidth + margins.right
  const plateHeight = sceneHeight
  const backingWidth = plateWidth * noiseScale
  const backingHeight = plateHeight * noiseScale
  return {
    sceneScale,
    sceneWidth,
    sceneHeight,
    margins,
    plateWidth,
    plateHeight,
    noiseScale,
    backingWidth,
    backingHeight,
    cssWidth: backingWidth,
    cssHeight: backingHeight,
    offsetX: 0,
    offsetY: 0,
    overflowsWidth: false,
    overflowsHeight: false,
    overflows: false,
    limit: 'both',
    clamped: false,
  }
}

/**
 * A scene exercising every **accepted** construct at once: sized text, both
 * shape variants, a bare `Track`, an array of animators, and one allow-listed
 * preset of each kind. `size` is 960x480 so that the dyadic factors the
 * composition test uses floor exactly.
 */
function accepted(): Scene {
  return {
    size: [960, 480],
    fps: 12,
    duration: 2,
    freezeNoise: false,
    stereo: { sepFar: 110, sepNear: 92, noiseScale: 2, depthBlur: 1, cross: false, seed: 7 },
    layers: [
      {
        type: 'text',
        text: 'HELLO',
        size: 64,
        font: 'Inter',
        weight: 'bold',
        at: [100, 200],
        depth: 0.6,
        anim: {
          keys: [
            { t: 0, x: -40, y: 16, depth: 0.2, scale: 1.5, rotate: 0.3, rotateX: 0.1, rotateY: 0.25 },
            { t: 1, x: 80, y: -24 },
          ],
          ease: 'easeOut',
          repeat: 'loop',
          start: 0.25,
          duration: 1.5,
        },
      },
      {
        type: 'shape',
        shape: 'circle',
        r: 48,
        start: 30,
        end: 300,
        at: [480, 240],
        depth: 1,
        anim: [
          { kind: 'emerge', from: 0, to: 1 },
          { keys: [{ t: 0, y: 0 }, { t: 1, y: -32 }] },
        ],
      },
      {
        type: 'shape',
        shape: 'rect',
        w: 200,
        h: 120,
        at: [10, 20],
        depth: 0.4,
        anim: { kind: 'emerge', from: 0.1, to: 0.4 },
      },
    ],
  }
}

/** One layer of each variant, in its simplest renderable form. */
function layerOfType(type: Layer['type']): Layer {
  switch (type) {
    case 'text': return { type: 'text', text: 'HI', size: 32, at: [4, 8] }
    case 'shape': return { type: 'shape', shape: 'rect', w: 16, h: 8, at: [4, 8] }
    case 'image': return { type: 'image', src: 'logo.png', at: [4, 8] }
    case 'gif': return { type: 'gif', src: 'spin.gif', at: [4, 8] }
    case 'draw': return { type: 'draw', fn: './shapes.js#star' }
  }
}

function sceneOf(...layers: Layer[]): Scene {
  return { size: [320, 160], fps: 12, duration: 1, layers }
}

const CTX: PresetCtx = {
  sceneW: 320, sceneH: 160, contentW: 40, contentH: 20,
  marginLeft: 55, marginRight: 55, layerDepth: 1,
}

/** `structuredClone` is in node 18+; vitest runs on plain node here. */
function clone<T>(v: T): T {
  return structuredClone(v)
}

function ok(scene: Scene, factor: number): Scene {
  const r = scaleScene(scene, planAt(scene, factor))
  if (!r.ok) throw new Error(`expected an accepted scene, got refusal ${r.reason}: ${r.detail.subject}`)
  return r.scene
}

/**
 * Deep comparison with a float tolerance, counting the numbers it compared so
 * the caller can floor the count. Used by the composition test, where `a` then
 * `b` and `a·b` are only guaranteed equal to within rounding.
 */
function deepClose(a: unknown, b: unknown, path = '$'): number {
  if (typeof a === 'number' || typeof b === 'number') {
    expect(typeof b, path).toBe('number')
    expect(typeof a, path).toBe('number')
    const x = a as number, y = b as number
    const tol = 1e-9 * Math.max(1, Math.abs(x), Math.abs(y))
    expect(Math.abs(x - y) <= tol, `${path}: ${x} !~= ${y}`).toBe(true)
    return 1
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    expect(Array.isArray(a), path).toBe(true)
    expect(Array.isArray(b), path).toBe(true)
    const xs = a as unknown[], ys = b as unknown[]
    expect(xs.length, `${path}.length`).toBe(ys.length)
    let n = 0
    for (let i = 0; i < xs.length; i++) n += deepClose(xs[i], ys[i], `${path}[${i}]`)
    return n
  }
  if (a !== null && typeof a === 'object') {
    expect(b !== null && typeof b === 'object', path).toBe(true)
    const xs = a as Record<string, unknown>, ys = b as Record<string, unknown>
    expect(Object.keys(xs).sort(), `${path} keys`).toEqual(Object.keys(ys).sort())
    let n = 0
    for (const k of Object.keys(xs)) n += deepClose(xs[k], ys[k], `${path}.${k}`)
    return n
  }
  expect(a, path).toEqual(b)
  return 0
}

/* ------------------------------------------------------- 1. identity at x1 */

describe('scaleScene — identity', () => {
  it('returns a scene deep-equal to the input at a factor of 1', () => {
    const scene = accepted()
    expect(ok(scene, 1)).toEqual(clone(scene))
  })

  it('carries a surplus key the type does not know about, at every level', () => {
    // P0-proofing. `site/scene.ts` "rebuilds field-by-field and silently drops
    // unknown keys", which is why ids would be stripped on every URL round
    // trip; P0 is adding optional `id`/`name` to `Layer`. Spread-and-override
    // makes that a non-event, and this is the test that keeps it one.
    const scene = accepted() as Scene & Record<string, unknown>
    scene['surplus'] = 'scene level'
    const layer = scene.layers[0]! as Layer & Record<string, unknown>
    layer['id'] = 'headline'
    layer['name'] = 'the headline'
    const track = layer['anim'] as Track & Record<string, unknown>
    track['surplus'] = 'track level'
    ;(track.keys[0] as Record<string, unknown>)['surplus'] = 'key level'
    const preset = (scene.layers[1]!.anim as Array<Track | Preset>)[0] as Preset
    preset['surplus'] = 'preset level'

    const out = ok(scene, 1) as Scene & Record<string, unknown>
    expect(out).toEqual(clone(scene))
    // Named explicitly as well as by deep equality, so the reason this test
    // exists survives a future rewrite of the comparison above.
    expect(out['surplus']).toBe('scene level')
    expect((out.layers[0] as Layer & Record<string, unknown>)['id']).toBe('headline')
    expect(((out.layers[0]!.anim as Track).keys[0] as Record<string, unknown>)['surplus'])
      .toBe('key level')
  })

  it('refuses a refusable scene at a factor of 1 too', () => {
    // Identity is scoped to the accepted subset: `x1` is not a licence to pass
    // an unscalable scene through, because the caller would then get a scene
    // that is correct only by accident of the factor.
    const scene = sceneOf(layerOfType('image'))
    for (const factor of [1, 0.5, 2]) {
      expect(scaleScene(scene, planAt(scene, factor)).ok, `factor ${factor}`).toBe(false)
    }
  })
})

/* ------------------------------------------------------------ 2. composition */

describe('scaleScene — composition', () => {
  // Chosen so that every product floors exactly on a 960x480 stage: the point
  // of this test is that the multiplications compose, not that `Math.floor`
  // distributes over them (it does not — see the module header on W2's seam).
  const PAIRS: ReadonlyArray<readonly [number, number]> = [
    [0.5, 0.25],
    [2, 3],
    [0.25, 2],
    [1, 1],
  ]

  for (const [a, b] of PAIRS) {
    it(`scaling by ${a} then ${b} equals scaling by ${a * b}`, () => {
      const scene = accepted()
      const twice = ok(ok(scene, a), b)
      const once = ok(scene, a * b)
      const compared = deepClose(twice, once)
      // Vacuity floor: the scene above carries well over thirty numbers, so a
      // comparison that matched only a handful has stopped traversing.
      expect(compared).toBeGreaterThan(30)
    })
  }

  it('accepts or refuses on structure alone, never on the factor', () => {
    // The predicate must not read `plan`. A factor of 0 or 1e6 is as much a
    // `render` plan as 0.5 is, and a scene that is unscalable is unscalable at
    // all of them.
    const FACTORS = [0, 1e-9, 0.25, 1, 2, 1e6]
    const cases: ReadonlyArray<readonly [string, Scene]> = [
      ['accepted', accepted()],
      ['image', sceneOf(layerOfType('image'))],
      ['gif', sceneOf(layerOfType('gif'))],
      ['draw', sceneOf(layerOfType('draw'))],
      ['unsized text', sceneOf({ type: 'text', text: 'HI' })],
      ['px preset', sceneOf({ type: 'shape', shape: 'circle', r: 4, anim: { kind: 'slide', to: [10, 0] } })],
    ]
    let checked = 0
    for (const [label, scene] of cases) {
      const first = scaleScene(scene, planAt(scene, FACTORS[0]!)).ok
      for (const factor of FACTORS) {
        expect(scaleScene(scene, planAt(scene, factor)).ok, `${label} @ ${factor}`).toBe(first)
        checked++
      }
    }
    expect(checked).toBe(cases.length * FACTORS.length)
    expect(checked).toBeGreaterThan(30)
  })
})

/* ------------------------------- 3. every scaling field scales, exhaustively */

describe('scaleScene — what scales', () => {
  it('classifies every layer variant, and the classification holds at runtime', () => {
    // The compile-time half of this is the AssertNever pair at the top of the
    // file. This is the runtime half: the arms are not just exhaustive, they
    // are also *correct*.
    for (const type of SCALED_LAYER_TYPES) {
      const scene = sceneOf(layerOfType(type))
      expect(scaleScene(scene, planAt(scene, 0.5)).ok, type).toBe(true)
    }
    for (const type of REFUSED_LAYER_TYPES) {
      const scene = sceneOf(layerOfType(type))
      expect(scaleScene(scene, planAt(scene, 0.5)).ok, type).toBe(false)
    }
    expect(SCALED_LAYER_TYPES.length + REFUSED_LAYER_TYPES.length).toBeGreaterThanOrEqual(5)
  })

  it('multiplies every scene-px length by the factor', () => {
    const s = 0.5
    const before = accepted()
    const after = ok(before, s)
    let checked = 0
    const scaled = (label: string, got: number | undefined, was: number | undefined): void => {
      expect(typeof was, `${label} (input)`).toBe('number')
      expect(got, label).toBeCloseTo(was! * s, 9)
      checked++
    }

    // The stage itself. Floored per axis, which at 0.5 of 960x480 is exact.
    scaled('size[0]', after.size[0], before.size[0])
    scaled('size[1]', after.size[1], before.size[1])

    for (let i = 0; i < before.layers.length; i++) {
      const was = before.layers[i]!, got = after.layers[i]!
      scaled(`layers[${i}].at[0]`, got.at?.[0], was.at?.[0])
      scaled(`layers[${i}].at[1]`, got.at?.[1], was.at?.[1])
      if (was.type === 'text' && got.type === 'text') {
        for (const f of SCALED_TEXT_LENGTHS) scaled(`layers[${i}].${f}`, got[f], was[f])
      }
      if (was.type === 'shape' && got.type === 'shape') {
        for (const f of SCALED_SHAPE_LENGTHS) {
          if (was[f] === undefined) continue
          scaled(`layers[${i}].${f}`, got[f], was[f])
        }
      }
      const wasAnims = was.anim === undefined ? [] : Array.isArray(was.anim) ? was.anim : [was.anim]
      const gotAnims = got.anim === undefined ? [] : Array.isArray(got.anim) ? got.anim : [got.anim]
      for (let j = 0; j < wasAnims.length; j++) {
        const wa = wasAnims[j]!, ga = gotAnims[j]!
        if (!isTrackAnimator(wa)) continue
        expect(isTrackAnimator(ga), `layers[${i}].anim[${j}]`).toBe(true)
        const wk = wa.keys, gk = (ga as Track).keys
        for (let k = 0; k < wk.length; k++) {
          for (const ch of SCALED_CHANNELS) {
            if (wk[k]![ch] === undefined) continue
            scaled(`layers[${i}].anim[${j}].keys[${k}].${ch}`, gk[k]![ch], wk[k]![ch])
          }
        }
      }
    }
    // Vacuity floor: 2 stage + 6 `at` + 1 text size + 3 shape lengths + 6 track
    // channels is 18, and a loop that stopped early cannot reach it.
    expect(checked).toBeGreaterThanOrEqual(18)
  })

  it('enumerates the fields it scales, and the enumerations are not empty', () => {
    // The AssertNever pairs above prove the enumerations are exhaustive and
    // contain nothing invented. This proves they are not *empty* — an
    // exhaustive partition of nothing is still exhaustive.
    expect(SCALED_SHAPE_LENGTHS.length).toBeGreaterThanOrEqual(3)
    expect(UNSCALED_SHAPE_NUMBERS.length).toBeGreaterThanOrEqual(2)
    expect(SCALED_TEXT_LENGTHS.length).toBeGreaterThanOrEqual(1)
    expect(SCALED_CHANNELS.length).toBeGreaterThanOrEqual(2)
    expect(UNSCALED_CHANNELS.length).toBeGreaterThanOrEqual(5)
    // Disjoint: a field cannot be both.
    const both = [...SCALED_CHANNELS].filter(c => (UNSCALED_CHANNELS as readonly string[]).includes(c))
    expect(both).toEqual([])
    const shapeBoth = [...SCALED_SHAPE_LENGTHS]
      .filter(c => (UNSCALED_SHAPE_NUMBERS as readonly string[]).includes(c))
    expect(shapeBoth).toEqual([])
  })
})

/* ---------------------------------------- 4. every non-scaling field is kept */

describe('scaleScene — what must not scale', () => {
  it('leaves every non-geometric field byte-identical under a non-unit factor', () => {
    const before = accepted()
    const after = ok(before, 0.5)
    let checked = 0
    const same = (label: string, got: unknown, was: unknown): void => {
      expect(got, label).toEqual(was)
      checked++
    }

    // Separation is a property of the viewer's EYES, not of the picture
    // (requirements §7 C1), and `noiseScale` is a backing-store multiplier in a
    // different pixel space (invariant 7). Neither is a scene-px length.
    same('stereo', after.stereo, before.stereo)
    same('stereo.sepFar', after.stereo?.sepFar, 110)
    same('stereo.sepNear', after.stereo?.sepNear, 92)
    same('stereo.noiseScale', after.stereo?.noiseScale, 2)
    // Time is not geometry.
    same('fps', after.fps, before.fps)
    same('duration', after.duration, before.duration)
    same('freezeNoise', after.freezeNoise, before.freezeNoise)

    for (let i = 0; i < before.layers.length; i++) {
      const was = before.layers[i]!, got = after.layers[i]!
      same(`layers[${i}].type`, got.type, was.type)
      // Depth units, not px.
      same(`layers[${i}].depth`, got.depth, was.depth)
      if (was.type === 'text' && got.type === 'text') {
        same(`layers[${i}].text`, got.text, was.text)
        same(`layers[${i}].font`, got.font, was.font)
        same(`layers[${i}].weight`, got.weight, was.weight)
      }
      if (was.type === 'shape' && got.type === 'shape') {
        same(`layers[${i}].shape`, got.shape, was.shape)
        // DEGREES, not px — and note the unit collision in the trap table:
        // `Transform.rotate` is radians while `shape.start`/`end` are degrees.
        // Neither is a length; the collision is not a licence to scale either.
        for (const f of UNSCALED_SHAPE_NUMBERS) same(`layers[${i}].${f}`, got[f], was[f])
      }
      const wasAnims = was.anim === undefined ? [] : Array.isArray(was.anim) ? was.anim : [was.anim]
      const gotAnims = got.anim === undefined ? [] : Array.isArray(got.anim) ? got.anim : [got.anim]
      same(`layers[${i}].anim length`, gotAnims.length, wasAnims.length)
      for (let j = 0; j < wasAnims.length; j++) {
        const wa = wasAnims[j]!, ga = gotAnims[j]!
        if (!isTrackAnimator(wa)) {
          // An allow-listed preset passes through whole: its parameters carry
          // no scene-px length, so there is nothing to touch.
          same(`layers[${i}].anim[${j}] (preset)`, ga, wa)
          continue
        }
        const wt = wa, gt = ga as Track
        same(`layers[${i}].anim[${j}].ease`, gt.ease, wt.ease)
        same(`layers[${i}].anim[${j}].repeat`, gt.repeat, wt.repeat)
        same(`layers[${i}].anim[${j}].start`, gt.start, wt.start)
        same(`layers[${i}].anim[${j}].duration`, gt.duration, wt.duration)
        for (let k = 0; k < wt.keys.length; k++) {
          same(`layers[${i}].anim[${j}].keys[${k}].t`, gt.keys[k]!.t, wt.keys[k]!.t)
          for (const ch of UNSCALED_CHANNELS) {
            // `scale` is already a dimensionless multiplier that `composeAnim`
            // MULTIPLIES — scaling it would compound. `depth` is depth units.
            // `rotate`/`rotateX`/`rotateY` are angles.
            same(`layers[${i}].anim[${j}].keys[${k}].${ch}`, gt.keys[k]![ch], wt.keys[k]![ch])
          }
        }
        // Named explicitly as well as enumerated. Moving a channel from
        // UNSCALED_CHANNELS to SCALED_CHANNELS would remove it from the loop
        // above, so these four are the ones that must survive that edit — the
        // three the trap table singles out, plus `depth`, which is in depth
        // units rather than px and is the one most likely to look like a length.
        if (j === 0 && wt.keys[0]!.depth !== undefined) {
          same(`layers[${i}].anim[0].keys[0].depth (named)`, gt.keys[0]!.depth, 0.2)
          same(`layers[${i}].anim[0].keys[0].scale (named)`, gt.keys[0]!.scale, 1.5)
          same(`layers[${i}].anim[0].keys[0].rotate (named)`, gt.keys[0]!.rotate, 0.3)
          same(`layers[${i}].anim[0].keys[0].rotateY (named)`, gt.keys[0]!.rotateY, 0.25)
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(40)
  })
})

/* ---------------------------------------------------------------- 5. purity */

describe('scaleScene — purity', () => {
  it('mutates nothing in the input scene', () => {
    const scene = accepted()
    const snapshot = clone(scene)
    scaleScene(scene, planAt(scene, 0.375))
    expect(scene).toEqual(snapshot)
  })

  it('does not alias the arrays it rewrites', () => {
    const scene = accepted()
    const out = ok(scene, 0.5)
    expect(out).not.toBe(scene)
    expect(out.layers).not.toBe(scene.layers)
    expect(out.size).not.toBe(scene.size)
    expect(out.layers[0]!.at).not.toBe(scene.layers[0]!.at)
  })
})

/* -------------------------------------------- 6. the plan agrees with the plate */

describe('scaleScene — agreement with renderFit', () => {
  it('emits a plate no larger than the plan it was scaled by', () => {
    // The only test that uses the REAL solver. If this fails, either this
    // module's geometry or `renderFit`'s arithmetic is wrong — they cannot
    // both be right and disagree.
    const scene = accepted()
    let checked = 0
    for (const [w, h] of [[800, 400], [500, 900], [1920, 1080], [120, 90]] as const) {
      const plan = renderFit({ scene, availableWidth: w, availableHeight: h, dpr: 1 })
      const out = ok(scene, plan.sceneScale)
      // `ok` floors from `plan.sceneScale` exactly as `renderFit` does, so the
      // stage it produces IS the plan's stage.
      expect(out.size[0], `${w}x${h} stage width`).toBe(plan.sceneWidth)
      expect(out.size[1], `${w}x${h} stage height`).toBe(plan.sceneHeight)
      const layout = plateLayoutOf(out)
      expect(layout.plate.width, `${w}x${h} plate width`).toBeLessThanOrEqual(plan.plateWidth)
      expect(layout.plate.height, `${w}x${h} plate height`).toBeLessThanOrEqual(plan.plateHeight)
      expect(layout.stage.width).toBeLessThanOrEqual(plan.sceneWidth)
      expect(layout.stage.height).toBeLessThanOrEqual(plan.sceneHeight)
      checked++
    }
    expect(checked).toBe(4)
  })
})

/* ------------------------------------------------- 7. the allow-list fails closed */

describe('scaleScene — the preset allow-list', () => {
  it('refuses a kind that exists in no registry', () => {
    // THE test that would have caught the deny-list spelling. A deny-list of
    // the kinds that DO carry px params matches nothing here, concludes "no px
    // params", and silently mis-scales. An allow-list refuses.
    const kind = 'no-such-preset-kind-in-any-registry'
    expect(Object.keys(PRESETS)).not.toContain(kind)
    expect(SCALE_FREE_PRESET_KINDS.has(kind)).toBe(false)
    const scene = sceneOf({ type: 'shape', shape: 'circle', r: 8, anim: { kind } })
    const r = scaleScene(scene, planAt(scene, 0.5))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('unscalable-preset')
    expect(r.detail.subject).toBe(kind)
  })

  it('refuses every registered kind that is not on the allow-list', () => {
    // Driven off the live registry, so a preset added upstream is refused by
    // default rather than mis-scaled by default. `slide`, `bounce`, `bob` and
    // `marquee` all carry scene-px parameters today.
    const refusable = Object.keys(PRESETS).filter(k => !SCALE_FREE_PRESET_KINDS.has(k))
    expect(refusable.length).toBeGreaterThanOrEqual(4)
    for (const kind of refusable) {
      const scene = sceneOf({ type: 'shape', shape: 'circle', r: 8, anim: { kind } })
      expect(scaleScene(scene, planAt(scene, 0.5)).ok, kind).toBe(false)
    }
  })

  it('does not allow-list slide-in', () => {
    // Ruling: P0 deletes `slide-in` entirely and its replacement, `move`, takes
    // explicit off-stage endpoints in scene px — so it belongs in the refused
    // arm by the ordinary rule and there is nothing to reason about. Removed
    // rather than argued over. Asserted by name because "not in the set" is the
    // kind of fact that silently comes back.
    expect(SCALE_FREE_PRESET_KINDS.has('slide-in')).toBe(false)
    const scene = sceneOf({ type: 'shape', shape: 'circle', r: 8, anim: { kind: 'slide-in', from: 'left' } })
    const r = scaleScene(scene, planAt(scene, 0.5))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('unscalable-preset')
  })

  it('accepts every allow-listed kind, and each one really exists', () => {
    expect(SCALE_FREE_PRESET_KINDS.size).toBeGreaterThanOrEqual(1)
    for (const kind of SCALE_FREE_PRESET_KINDS) {
      // An allow-listed kind that no registry implements would be an allow-list
      // that had drifted away from the thing it is making a claim about.
      expect(Object.keys(PRESETS), kind).toContain(kind)
      expect(presetIsScaleFree({ kind })).toBe(true)
      const scene = sceneOf({ type: 'shape', shape: 'circle', r: 8, anim: { kind } })
      expect(scaleScene(scene, planAt(scene, 0.5)).ok, kind).toBe(true)
    }
  })

  it('refuses a px-carrying preset even when it shares a layer with a safe one', () => {
    const scene = sceneOf({
      type: 'shape', shape: 'circle', r: 8,
      anim: [{ kind: 'emerge' }, { keys: [{ t: 0, y: 0 }] }, { kind: 'bob', amount: 8 }],
    })
    const r = scaleScene(scene, planAt(scene, 0.5))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.detail.subject).toBe('bob')
  })
})

/* ------------------------------------------- Track vs Preset, pinned to core */

describe('isTrackAnimator', () => {
  it('agrees with core about an object carrying BOTH kind and keys', () => {
    // Mirrors `src/core/anim/track.ts:68` — a private `isTrack` whose whole
    // body is `return 'keys' in a`. A disagreement here is a disagreement with
    // the renderer about what an animator fundamentally IS, and it would be
    // invisible: the scene would scale as a track and animate as a preset, or
    // the reverse.
    const hybrid = {
      kind: 'no-such-preset-kind-in-any-registry',
      keys: [{ t: 0, x: 100 }, { t: 1, x: 100 }],
    } as unknown as Track & Preset

    expect(isTrackAnimator(hybrid)).toBe(true)

    // Core's OBSERVABLE behaviour: had it taken the preset branch it would have
    // called `compilePreset`, which throws for an unknown kind. It returns the
    // track's own x instead.
    const t = composeAnim(hybrid, 0.5, 1, CTX, compilePreset)
    expect(t.x).toBe(100)

    // Positive control: the same kind WITHOUT `keys` really does throw, so the
    // assertion above is evidence of a branch and not of a missing throw.
    expect(() => composeAnim({ kind: hybrid.kind } as Preset, 0.5, 1, CTX, compilePreset))
      .toThrow(/unknown animation preset/)

    // And this module follows core: the hybrid's keys are scaled, and it is not
    // put to the allow-list at all.
    const scene = sceneOf({ type: 'shape', shape: 'circle', r: 8, anim: hybrid })
    const out = ok(scene, 0.5)
    const anim = out.layers[0]!.anim as Track
    expect(anim.keys[0]!.x).toBe(50)
    expect((anim as unknown as Preset)['kind']).toBe(hybrid.kind)
  })
})

/* ------------------------- the margin-share note: informational, not a gate */

describe('scaleNotice', () => {
  it('always returns a note for a render plan — it is not a threshold', () => {
    // The orchestrator declined to add a refusal threshold for this, because
    // nobody has measured where a small render stops being worth it and an
    // unmeasured threshold is worse than none. So the note is unconditional:
    // if it were sometimes absent, the condition under which it appeared WOULD
    // be a threshold, just an undocumented one.
    const scene = accepted()
    let checked = 0
    for (const w of [3000, 1920, 1280, 800, 500, 300]) {
      const plan = renderFit({ scene, availableWidth: w, availableHeight: 10000, dpr: 1 })
      const note = scaleNotice(plan)
      expect(note.note, `${w}`).toBe('margin-share')
      expect(note.explanation, `${w}`).toBe(SCALE_NOTES['margin-share'].explanation)
      checked++
    }
    expect(checked).toBe(6)
  })

  it('reports the stage share as the plan measures it', () => {
    const scene = accepted()
    const plan = renderFit({ scene, availableWidth: 1280, availableHeight: 10000, dpr: 1 })
    // Derived from the plan, not re-solved: a second derivation is a second
    // thing that can disagree with `renderFit`.
    expect(scaleNotice(plan).stageShare).toBeCloseTo(plan.sceneWidth / plan.plateWidth, 12)
    expect(scaleNotice(plan).stageShare).toBeGreaterThan(0)
    expect(scaleNotice(plan).stageShare).toBeLessThanOrEqual(1)
  })

  it('the share falls as the render gets smaller — the property being recorded', () => {
    // THE structural claim, and the reason the note exists: the stage scales
    // and the margins do not, so the dead strips take a growing share of the
    // plate as the factor shrinks. Asserted as a monotone trend rather than
    // against pinned percentages, which would pin today's sepFar.
    const scene = accepted()
    const shares = [3000, 1920, 1280, 800, 500, 300].map(w =>
      scaleNotice(renderFit({ scene, availableWidth: w, availableHeight: 10000, dpr: 1 })).stageShare,
    )
    for (let i = 1; i < shares.length; i++) {
      expect(shares[i]!, `share at index ${i}`).toBeLessThan(shares[i - 1]!)
    }
    // Vacuity floor: a sequence that never actually moved would pass a
    // non-strict comparison, and a one-element sequence passes any of them.
    expect(shares.length).toBeGreaterThanOrEqual(6)
    expect(shares[0]! - shares[shares.length - 1]!).toBeGreaterThan(0.25)
  })

  it('mirrors the shape of fit.ts notice machinery and explains itself', () => {
    for (const [key, info] of Object.entries(SCALE_NOTES)) {
      expect(info.note, key).toBe(key)
      expect(info.explanation.length, key).toBeGreaterThan(200)
      // The specific consequence, not a generic "margins exist" sentence.
      expect(info.explanation, key).toMatch(/do not scale|does not scale/)
      expect(info.explanation, key).toMatch(/share/)
    }
    expect(Object.keys(SCALE_NOTES).length).toBeGreaterThanOrEqual(1)
  })
})

/* ------------------------------ 8. every refusal is reachable and explains itself */

describe('SCALE_REFUSALS', () => {
  /** One scene per reason, so a reason with no way to reach it fails here. */
  const REACHES: Record<ScaleRefusal, () => Scene> = {
    'raster-geometry': () => sceneOf(layerOfType('image')),
    'draw-layer': () => sceneOf(layerOfType('draw')),
    'unsized-text': () => sceneOf({ type: 'text', text: 'HI' }),
    'unscalable-preset': () =>
      sceneOf({ type: 'shape', shape: 'circle', r: 8, anim: { kind: 'slide', to: [10, 0] } }),
  }

  /**
   * The specific consequence each reason must name. A stub reading "not
   * supported" satisfies a length floor; it does not satisfy this.
   */
  const MUST_SAY: Record<ScaleRefusal, RegExp> = {
    'raster-geometry': /drawImage|native pixel|no resting scale/i,
    'draw-layer': /path string|module/i,
    'unsized-text': /DEFAULT_TEXT_SIZE|48/,
    'unscalable-preset': /allow-list|scene px|depth units/i,
  }

  it('is keyed by reason and every entry knows its own key', () => {
    // Mirrors the SHAPE of `fitNotice`/`FitNotice` in `site/fit.ts` — a record
    // keyed by name whose values carry their key — without extending
    // `REJECTED_FIT_MODES`, which is keyed on a requested mode SPELLING and
    // answers a different question.
    for (const [key, info] of Object.entries(SCALE_REFUSALS)) {
      expect(info.reason, key).toBe(key)
      expect(typeof info.explanation, key).toBe('string')
    }
    expect(Object.keys(SCALE_REFUSALS).length).toBeGreaterThanOrEqual(4)
  })

  it('every reason is reachable from a constructed scene', () => {
    const reached = new Set<string>()
    for (const [reason, build] of Object.entries(REACHES)) {
      const scene = build()
      const r = scaleScene(scene, planAt(scene, 0.5))
      expect(r.ok, reason).toBe(false)
      if (r.ok) continue
      expect(r.reason, reason).toBe(reason)
      expect(r.detail.reason, reason).toBe(reason)
      expect(r.detail.explanation, reason).toBe(SCALE_REFUSALS[reason as ScaleRefusal].explanation)
      expect(r.detail.layer, reason).toBe(0)
      expect(typeof r.detail.subject, reason).toBe('string')
      expect(r.detail.subject.length, reason).toBeGreaterThan(0)
      reached.add(reason)
    }
    // Drives off the record, so a reason added without a reaching scene fails.
    expect([...reached].sort()).toEqual(Object.keys(SCALE_REFUSALS).sort())
  })

  it('every reason explains itself, specifically', () => {
    let checked = 0
    for (const [key, info] of Object.entries(SCALE_REFUSALS)) {
      // Long enough that a placeholder cannot satisfy it; `fit.ts`'s own
      // rejection reason runs to several lines for the same reason.
      expect(info.explanation.length, key).toBeGreaterThan(200)
      expect(info.explanation, key).toMatch(MUST_SAY[key as ScaleRefusal])
      checked++
    }
    expect(checked).toBe(Object.keys(SCALE_REFUSALS).length)
    expect(checked).toBeGreaterThanOrEqual(4)
  })
})
