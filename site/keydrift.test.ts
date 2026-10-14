/**
 * A drift sensor over this validator's *inlined* key handling.
 *
 * `site/scene.ts` has no key rosters to compare against core's. It rebuilds a
 * scene and every layer **field by field** (`:277-348`, `:361-392`), and its
 * own comment calls that "**the silent drop**": a key the rebuild does not
 * name is not rejected, it simply does not survive, "and the scene loads
 * looking almost right." On this side the hash *is* the scene, so a field the
 * rebuild forgets is destroyed on every round trip through the URL rather than
 * merely ignored. Nothing went red the day the rebuild fell behind `Layer`.
 * §9's last trap: a recorded note is not a sensor.
 *
 * ## This is a sensor, deliberately not a rewiring
 *
 * The field-by-field rebuild is not an oversight to replace with a roster
 * loop. It is the recorded, deliberate difference between the two validators —
 * the CLI **errors** on an unknown key, this one **drops** it — and
 * `:280-290` records why unknown-key parity was delivered for keyframe
 * channels only. Nothing here changes what this module accepts, returns or
 * imports. It round-trips values through the public `validateScene` and reads
 * what comes back.
 *
 * ## What it measures
 *
 * For every variant of `Layer`, a sample carrying **every** key that variant
 * admits goes in, and the keys that survive must be exactly `LAYER_KEYS`'
 * entry for it. A key on the type that the rebuild drops is a control the
 * editor can set and the URL then eats; a key that appears from nowhere is a
 * field invented on the author's behalf.
 *
 * The samples are not hand-written lists of "the keys a layer has" (§9: such a
 * list goes stale silently). They are annotated `Required<LayerOf<T>>`, so the
 * compiler rejects this file until each one carries every key of its variant.
 */
import { describe, expect, it } from 'vitest'
import { LAYER_KEYS, SCENE_KEYS } from '../src/core/index.js'
import type { AssertNever, Layer, LayerOf, Scene } from '../src/core/index.js'
import { validateScene } from './scene.js'

/**
 * Which variants survive the rebuild and which this validator refuses
 * outright.
 *
 * **`draw` is the one deliberate disagreement between the two validators**,
 * and it is encoded here as an expectation rather than tolerated as noise:
 * `site/scene.ts:267-278` refuses it by name citing design §9.5 (a module path
 * cannot be resolved inside a static bundle), while `src/cli/scene.ts:104`
 * accepts it and `src/core/raster.ts:386` renders it. Both are right; the
 * partition between them is the thing worth pinning, because the day it moves
 * in either direction — the browser quietly accepting `draw`, or a second
 * variant being dropped from the editor without a word — is the day this
 * should be read again.
 *
 * This is a hand-written split, which is exactly what §9 warns about. The two
 * guards below are the mitigation and the same one `site/scalescene.test.ts:72-78`
 * uses for its own classification: the partition must be **total** over
 * `Layer['type']` and must invent nothing, so a sixth variant is a compile
 * error here and has to be classified deliberately rather than defaulting into
 * whichever arm the loop happens to reach.
 */
const REBUILT_LAYER_TYPES = ['text', 'image', 'gif', 'shape'] as const
const REFUSED_LAYER_TYPES = ['draw'] as const
type ClassifiedLayerType =
  typeof REBUILT_LAYER_TYPES[number] | typeof REFUSED_LAYER_TYPES[number]
type _NoLayerVariantUnclassified = AssertNever<Exclude<Layer['type'], ClassifiedLayerType>>
type _NoLayerVariantInvented = AssertNever<Exclude<ClassifiedLayerType, Layer['type']>>

/**
 * `shape`'s closed value set, guarded the same way.
 *
 * It needs its own list because this validator's rebuild is **shape-dependent**:
 * a circle keeps `r`/`start`/`end` and drops `w`/`h`, a rect does the reverse
 * (`:330-347`). Neither sample alone carries all seven of the variant's own
 * keys through, so the measurement is the **union over the closed set** — and
 * the union is only honest while the set is complete, which is what these two
 * lines buy.
 */
const SHAPE_KINDS = ['circle', 'rect'] as const
type _NoShapeKindUncovered = AssertNever<Exclude<LayerOf<'shape'>['shape'], typeof SHAPE_KINDS[number]>>
type _NoShapeKindInvented = AssertNever<Exclude<typeof SHAPE_KINDS[number], LayerOf<'shape'>['shape']>>

/** Every key `LayerBase` contributes, with values this validator accepts. */
const BASE: Required<Pick<Layer, 'id' | 'name' | 'depth' | 'at' | 'anim'>> = {
  id: 'l1', name: 'a layer', depth: 0.5, at: [0, 0], anim: { keys: [{ t: 0 }] },
}

/**
 * One or more samples per variant, each carrying **every** key that variant
 * admits.
 *
 * The `Required<LayerOf<T>>` annotation is what makes this a measurement
 * rather than a list: a key added to a variant is a missing-property error
 * here. Values are the cheapest thing this validator accepts — `anim` needs a
 * non-empty `keys` array (`:186-189`), `id`/`name`/`font` a non-empty string
 * (`:74-77`), `depth` merely finite (core clamps, so the site deliberately
 * does not bound it).
 */
const SAMPLES: { [T in Layer['type']]: readonly Required<LayerOf<T>>[] } = {
  text: [{ ...BASE, type: 'text', text: 'HELLO', size: 64, font: 'Inter', weight: '700' }],
  image: [{ ...BASE, type: 'image', src: 'art/ball.png', mode: 'silhouette', mask: 'alpha' }],
  gif: [{ ...BASE, type: 'gif', src: 'art/spin.gif', loop: 'loop', mode: 'silhouette', mask: 'alpha' }],
  shape: SHAPE_KINDS.map(shape => (
    { ...BASE, type: 'shape', shape, r: 10, w: 20, h: 20, start: 0, end: 90 } as const
  )),
  draw: [{ ...BASE, type: 'draw', fn: './plugins/spiral.js' }],
}

/** A scene carrying every key `Scene` admits, around one valid layer. */
const FULL_SCENE: Required<Scene> = {
  size: [10, 10],
  fps: 30,
  duration: 2,
  stereo: {},
  freezeNoise: false,
  layers: [SAMPLES.text[0]!],
}

/** `'refused'`, or the sorted union of keys that survived the rebuild. */
function survives(variant: Layer['type']): 'refused' | readonly string[] {
  const kept = new Set<string>()
  for (const sample of SAMPLES[variant]) {
    let out: Scene
    try {
      out = validateScene({ size: [10, 10], layers: [sample] })
    } catch {
      return 'refused'
    }
    for (const key of Object.keys(out.layers[0] ?? {})) kept.add(key)
  }
  return [...kept].sort()
}

/**
 * Each key on one side and not the other, prefixed with which side is missing
 * it. A plain function over plain inputs so the control below can drive it
 * with a result that *is* wrong — without it nothing would notice this
 * collapsing to `() => []`.
 */
function disagreements(
  where: string, kept: readonly string[], declared: readonly string[],
): string[] {
  const inKept = new Set(kept)
  const inDeclared = new Set(declared)
  const out: string[] = []
  for (const k of inDeclared) if (!inKept.has(k)) out.push(`${where}: "${k}" is on the type, dropped by site/scene.ts`)
  for (const k of inKept) if (!inDeclared.has(k)) out.push(`${where}: "${k}" came back from site/scene.ts, not on the type`)
  return out.sort()
}

describe('site/scene.ts has not drifted from core', () => {
  it('rebuilds every key of every variant it accepts', () => {
    const found = REBUILT_LAYER_TYPES.flatMap(variant => {
      const kept = survives(variant)
      if (kept === 'refused') return [`${variant}: refused outright, but is classified as rebuilt`]
      return disagreements(variant, kept, LAYER_KEYS[variant])
    })
    expect(
      found,
      'a field the editor can set that does not survive a round trip through the URL — on ' +
      'this side the hash IS the scene, so the value is destroyed, not ignored.',
    ).toEqual([])
  })

  it('refuses exactly the variants it is supposed to refuse', () => {
    // Driven by `Object.keys(LAYER_KEYS)`, which `types.ts` forces to be total
    // over the union, so the observed partition is measured over every variant
    // rather than over the ones somebody remembered. `draw` is the deliberate
    // disagreement with the CLI; a second refusal, or `draw` quietly becoming
    // loadable, moves a boundary design §9.5 owns.
    const observed = Object.keys(LAYER_KEYS)
      .filter(v => survives(v as Layer['type']) === 'refused')
      .sort()
    expect(observed).toEqual([...REFUSED_LAYER_TYPES].sort())
  })

  it('names design §9.5 when it refuses one, rather than failing anonymously', () => {
    // The refusal is a product, not a rejection: the recorded worry is that
    // somebody reports it as a bug or "fixes" it with a dynamic import that
    // cannot work in a static bundle. A refusal that stopped explaining itself
    // would still pass the partition test above.
    expect(() => validateScene({ size: [10, 10], layers: [SAMPLES.draw[0]!] }))
      .toThrow(/design §9\.5/)
  })

  it('rebuilds every key of Scene itself', () => {
    const out = validateScene(FULL_SCENE)
    expect(
      disagreements('scene', Object.keys(out).sort(), SCENE_KEYS),
      'a top-level scene field the editor can set and the URL then eats.',
    ).toEqual([])
  })

  it('would say so — the same comparison over a result made wrong on purpose', () => {
    // The paired control (§6.5a). Pinned exactly rather than merely non-empty:
    // "found something" is also satisfied by a predicate that has rotted into
    // matching everything, and the untouched keys are here to be the ones it
    // must *not* name.
    const wrong = [...LAYER_KEYS.shape.filter(k => k !== 'end'), 'glow'].sort()
    expect(disagreements('shape', wrong, LAYER_KEYS.shape)).toEqual([
      'shape: "end" is on the type, dropped by site/scene.ts',
      'shape: "glow" came back from site/scene.ts, not on the type',
    ])
  })

  it('would say so — the samples really do carry every key in', () => {
    // Without this the sensor would pass vacuously if a sample ever lost a
    // key: a key absent from the input cannot be dropped by the rebuild, so
    // "nothing was dropped" would be true and meaningless. The annotation on
    // `SAMPLES` is what makes this hold, and this is what makes it observable
    // to `npm test` rather than to `npm run typecheck` alone.
    const found = Object.keys(LAYER_KEYS).flatMap(variant => {
      const supplied = new Set(
        SAMPLES[variant as Layer['type']].flatMap(s => Object.keys(s)),
      )
      return disagreements(variant, [...supplied].sort(), LAYER_KEYS[variant as Layer['type']])
    })
    expect(found).toEqual([])
  })

  it('would say so — the shape samples cover the whole closed set', () => {
    // The union over `SHAPE_KINDS` is only honest while every member is
    // actually sampled. The `AssertNever` pair above keeps the list total
    // against the type; this keeps the samples total against the list.
    expect(SAMPLES.shape.map(s => s.shape).sort()).toEqual([...SHAPE_KINDS].sort())
  })
})
