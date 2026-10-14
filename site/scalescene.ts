/**
 * `fit=render`: scale a scene's geometry to a {@link RenderFit} plan — or
 * refuse, in the open, and say why.
 *
 * ## Why this function refuses rather than always succeeding
 *
 * Re-rendering a scene smaller requires knowing which numbers in it are
 * **lengths in scene px**. For a plain `Track` keyframe that is knowable: `x`
 * and `y` are displacements and nothing else. For a `Preset` it is not.
 * `slide.from` is an `[x, y]` offset in **scene px**; `emerge.from` is a scalar
 * in **depth units**. Same key name, same JSON shape class, and
 * `examples/pacman.yaml` contains both. There is no structural rule that
 * separates them, and the design doc says so in §9.1: *"`Preset` has an index
 * signature, so `keyof Preset` is `string` and the exclusion can never reduce
 * to `never`. Verb and bundle parameters — the surface R9 and R10 make central
 * — are outside any type-level proof."*
 *
 * The machine-readable fix is each verb's parameters carrying their unit, and
 * it is being added upstream where the author of each verb already knows the
 * answer. This module does not wait for it. It ships the honest floor: scale
 * the scenes that can be scaled, and refuse the rest **loudly** rather than
 * silently mis-scaling them. A refusal costs the user their preferred fit mode
 * and leaves them looking at a correct picture; a wrong guess leaves them
 * looking at a wrong one with nothing to tell them so.
 *
 * ## W2's seam — `sceneScale` versus `sceneWidth`/`sceneHeight`
 *
 * `plan.sceneScale` is the **ideal real-valued factor** and is what every
 * geometric quantity is multiplied by. `plan.sceneWidth`/`sceneHeight` are that
 * factor floored per axis, and they — not `sceneScale * scene.size` — become
 * the stage, because a rasteriser cannot be handed a fractional stage
 * (`padDepth` rejects one). The two differ by under one scene px per axis, and
 * that residue is absorbed **at the stage edge**, inside the fusion fringe the
 * margins exist to cover.
 *
 * It is deliberately not two per-axis ratios. The model has no non-uniform
 * scale slot — design §4.3 D1: `shape.circle` has a single `r`, and
 * `Transform.scale` is one number — and floored per-axis ratios are not
 * composable anyway, because `floor` does not distribute over multiplication.
 * The parameter is the whole `RenderFit` rather than three loose numbers so
 * that a caller cannot pass three values that disagree with each other.
 *
 * ## What is NOT scaled, and why — each for a different reason
 *
 * - **`sepFar`/`sepNear` and the rest of `stereo`.** Separation is a property
 *   of the **viewer's eyes**, not of the picture (requirements §7 C1). This is
 *   exactly why `render` is pixel-exact where `contain` is not, and why the
 *   margin arithmetic in `renderFit` is affine rather than proportional.
 * - **`noiseScale`.** A **backing-store** multiplier — a different pixel space
 *   from the scene px everything here counts in.
 * - **`depth`, on a layer and on a keyframe.** Depth units, not px.
 * - **The `scale` channel.** Already a dimensionless multiplier, and
 *   `composeAnim` **multiplies** it rather than summing it. Scaling it would
 *   compound.
 * - **`rotate`, `rotateX`, `rotateY`.** Angles. Note the unit collision:
 *   `Transform.rotate` is in **radians** while `shape.start`/`end` are in
 *   **degrees**. Neither is a length, and the collision is not a licence to
 *   treat either as one.
 * - **Keyframe times, `start`, `duration`, `fps`, `ease`, `repeat`.** Time is
 *   not geometry.
 *
 * Everything here is pure and allocation-only: nothing is mutated, and the
 * output shares references only with substructures that were not rewritten.
 */
import type { Key, Layer, Preset, Scene, Track, Transform } from '../src/core/types.js'
import type { RenderFit } from './scale.js'

/* ------------------------------------------------------------- the refusals */

/** Why a scene cannot be re-rendered at a different size. */
export type ScaleRefusal =
  | 'raster-geometry'
  | 'draw-layer'
  | 'unsized-text'
  | 'unscalable-preset'

/** What {@link SCALE_REFUSALS} records about one refusal. */
export interface ScaleRefusalInfo {
  /** The refusal's own name, so an entry carries its key when passed around alone. */
  readonly reason: ScaleRefusal
  /** Why this scene is refused, in prose a human can be shown. */
  readonly explanation: string
}

/**
 * The reasons a scene is refused, keyed by reason.
 *
 * A **sibling** of `site/fit.ts`'s `REJECTED_FIT_MODES`/`fitNotice`, mirroring
 * their shape — a record keyed by name whose values carry their own key — and
 * deliberately *not* an extension of them. `REJECTED_FIT_MODES` is keyed on the
 * requested mode **spelling** and answers "is `cover` a mode?". This record is
 * keyed on a property of the **scene** and answers "can this scene be
 * re-rendered?". Folding the second into the first would make one lookup
 * answer two unrelated questions, and the player needs to ask them separately:
 * the mode is known good and the scene is still unscalable, all the time.
 *
 * The explanations are long on purpose. A user who asks for `render` on a photo
 * scene is owed the reason, not just the refusal — the reason is the only thing
 * that tells them whether to change the scene, change the mode, or file a bug.
 */
export const SCALE_REFUSALS: Record<ScaleRefusal, ScaleRefusalInfo> = {
  'raster-geometry': {
    reason: 'raster-geometry',
    explanation:
      "An image, gif or heightmap layer's geometry IS the source raster's native pixel " +
      'dimensions: src/core/raster.ts draws it with ctx.drawImage(handle, 0, 0, img.width, ' +
      'img.height), and LayerBase carries only depth, at and anim — there is no resting ' +
      'scale. So there is literally nothing in the scene to multiply, and scaling the stage ' +
      'around the layer would leave the picture at its authored pixel size inside a smaller ' +
      'frame. The cure is a new resting scale field on LayerBase plus one multiply in the ' +
      'rasteriser, and it is deliberately deferred rather than forgotten: PresetCtx.contentW ' +
      'and contentH still reach presets from the unscaled raster, so a verb computing an ' +
      'off-frame endpoint would compute it from the original size and the animation would ' +
      'be wrong in a second, less visible way. That is a scene-model decision, and render is ' +
      'not the default fit mode — contain is, and it shows this scene correctly.',
  },
  'draw-layer': {
    reason: 'draw-layer',
    explanation:
      "A draw layer's geometry lives inside a module named by a path string (its fn field), " +
      'so there is no number in the scene to scale and no way to learn one without executing ' +
      'that module. Core refuses draw layers outright at render time already, so refusing ' +
      'them here costs nothing that was ever going to be drawn; it only moves the refusal ' +
      'somewhere the player can explain it instead of throwing.',
  },
  'unsized-text': {
    reason: 'unsized-text',
    explanation:
      'A text layer that omits size falls back to DEFAULT_TEXT_SIZE = 48, which is ' +
      'module-private in src/core/raster.ts and exported nowhere, so this module cannot ' +
      'reach it in order to scale it. Scaling the stage to half size while the type went on ' +
      'rendering at 48 scene px would render that type at twice its authored relative size — ' +
      'which is precisely the silent mis-scaling fit=render exists to avoid, and it would be ' +
      'most visible on exactly the headline a reader looks at first. Give the layer an ' +
      'explicit size and it scales; this closes the hole without a core change.',
  },
  'unscalable-preset': {
    reason: 'unscalable-preset',
    explanation:
      'This animator is a Preset whose kind is not on the allow-list of kinds known to carry ' +
      'no scene-px parameter. Preset parameters are untyped — slide.from is an [x, y] offset ' +
      'in scene px while emerge.from is a scalar in depth units, the same key name and the ' +
      'same JSON shape — so there is no structural rule that tells a length from a depth, and ' +
      'examples/pacman.yaml contains both spellings. Until each verb declares the unit of its ' +
      'parameters, an unrecognised kind is refused rather than guessed at: a wrong guess ' +
      'silently mis-scales the picture with nothing to show for it, while a refusal falls back ' +
      'to the default fit mode and shows a correct picture in a different one.',
  },
}

/** Which layer, and which construct within it, caused the refusal. */
export interface ScaleRefusalDetail extends ScaleRefusalInfo {
  /** Index into `scene.layers`, or `-1` for a scene-level refusal. */
  readonly layer: number
  /** The layer `type` or the preset `kind` that triggered it, for a message. */
  readonly subject: string
}

/**
 * A scaled scene, or a refusal carrying a machine-readable reason.
 *
 * Discriminated rather than "scene or `undefined`" because the caller has to
 * do something different in each case — fall back to another fit mode, and
 * ideally say why — and because `reason` is what lets it do that without
 * parsing prose.
 */
export type ScaleResult =
  | { readonly ok: true; readonly scene: Scene }
  | { readonly ok: false; readonly reason: ScaleRefusal; readonly detail: ScaleRefusalDetail }

/* ------------------------------------------------- the preset ALLOW-list */

/**
 * Preset kinds known to carry **no** scene-px parameter. Everything else is
 * refused — known kinds included, unknown kinds especially.
 *
 * ## Why an allow-list and not a deny-list
 *
 * The obvious spelling is the opposite one: deny-list the kinds that *do*
 * carry px params — `slide`, `bounce`, `bob`, `marquee` — and let everything
 * else through. **That spelling fails open, and the failure is silent.**
 *
 * The verbs are being renamed upstream (`slide`→`move`, `emerge`→`push`).
 * After that lands, a scene containing `move` matches nothing in a deny-list;
 * the detector concludes "no px params here", scales nothing, refuses nothing,
 * and emits exactly the mis-scaled output this whole mechanism exists to
 * prevent — with no test turning red, because no test can assert about a name
 * nobody has written down yet. An allow-list fails the other way: an unknown
 * kind is refused, the player falls back to the default fit mode, and the user
 * sees a correct picture in a different mode.
 *
 * The two spellings read equally reasonably in a ticket. They differ in exactly
 * the way that kills: one is wrong loudly and one is wrong quietly.
 *
 * ## Why these two
 *
 * - `emerge` — `from`/`to` are absolute **depths**, and its only other params
 *   are timing overrides.
 * - `slide-in` — its `from` is a **direction word**, and the off-frame distance
 *   it computes comes from `PresetCtx` (`contentW`, `sceneW`, the margins),
 *   which the renderer measures against whatever scene it is handed. A scaled
 *   scene produces a scaled context, so the endpoint follows for free.
 *
 * ## Replacing this with the unit-aware path
 *
 * {@link presetIsScaleFree} is the **only** seam any caller touches — nothing
 * in this module or outside it reads the set directly. When each verb's
 * parameters carry their unit, that one function body becomes "ask the verb's
 * parameter tags whether any of them is a scene-px length", with this set left
 * as the fallback for verbs that have not been tagged yet. One edit, no caller
 * changes, and the fail-closed default is preserved by construction because the
 * fallback for "no tags, not listed" stays `false`.
 */
export const SCALE_FREE_PRESET_KINDS: ReadonlySet<string> = new Set(['emerge', 'slide-in'])

/**
 * Does this preset provably carry no scene-px parameter?
 *
 * The single seam described above. Fails closed: anything it cannot vouch for
 * is `false`.
 */
export function presetIsScaleFree(preset: Preset): boolean {
  return SCALE_FREE_PRESET_KINDS.has(preset.kind)
}

/* ------------------------------------------------- the field classifications */

/**
 * A shape's scene-px lengths. Exported, and used by the scaling code below, so
 * that the list a test proves exhaustive is the same list the code obeys — a
 * second copy is a second thing that can drift.
 *
 * This is also where a stroke width would go: design §8.1 promises "stroke
 * widths scale with the frame", and the moment the shape variant grows one it
 * belongs in this array and nowhere else.
 */
export const SCALED_SHAPE_LENGTHS = ['r', 'w', 'h'] as const

/**
 * A shape's numbers that are **not** lengths: wedge bounds in DEGREES,
 * clockwise from 3 o'clock. An angle does not change when the picture does.
 */
export const UNSCALED_SHAPE_NUMBERS = ['start', 'end'] as const

/** A text layer's scene-px lengths. Only present when explicitly authored. */
export const SCALED_TEXT_LENGTHS = ['size'] as const

/**
 * The keyframe channels that are displacements in scene px.
 *
 * Typed against `Transform` so that a channel renamed in the model is a compile
 * error here rather than a channel that quietly stops being scaled.
 */
export const SCALED_CHANNELS = ['x', 'y'] as const satisfies readonly (keyof Transform)[]

/**
 * The keyframe channels that are deliberately left alone — see the file header
 * for the reason each one is on this list. They are enumerated rather than
 * merely omitted so that the partition can be proved exhaustive: a new channel
 * must be put in one list or the other.
 */
export const UNSCALED_CHANNELS = [
  'depth', 'scale', 'rotate', 'rotateX', 'rotateY',
] as const satisfies readonly (keyof Transform)[]

/* ---------------------------------------------------------- Track or Preset */

/**
 * Is this animator a raw `Track`?
 *
 * Structurally identical to core's own predicate — `src/core/anim/track.ts:68`,
 * a private `isTrack` whose entire body is `return 'keys' in a` — and mirrored
 * rather than imported because it is not exported. Exported *here* so a test
 * can pin the agreement: an object carrying both `kind` and `keys` must be
 * classified the same way by this function and by `composeAnim`. A disagreement
 * would mean this module scaled something as a track that the renderer then
 * compiled as a preset, or the reverse, and nothing would throw.
 */
export function isTrackAnimator(a: Track | Preset): a is Track {
  return 'keys' in a
}

/* --------------------------------------------------------------- the engine */

/**
 * Scale a scene's geometry to `plan`, or refuse and say why.
 *
 * Pure: `scene` is not mutated, and every rewritten container is a fresh one.
 * Substructures that carry no scene-px length (`stereo`, an allow-listed
 * preset) are passed through by reference, which is what makes a surplus key
 * the type does not know about survive the round trip.
 *
 * The accept/refuse decision is taken **before** `plan` is read, and reads only
 * the scene's structure. A scene that is unscalable is unscalable at every
 * factor, 1 included — otherwise `x1` would hand back a scene that happened to
 * be correct, and the caller would have no way to know it was lucky.
 */
export function scaleScene(scene: Scene, plan: RenderFit): ScaleResult {
  const refusal = refuseReason(scene)
  if (refusal !== undefined) return { ok: false, reason: refusal.reason, detail: refusal }

  const s = plan.sceneScale
  return {
    ok: true,
    // Spread-and-override, never a field-by-field rebuild. The trap table
    // records that `site/scene.ts` "rebuilds field-by-field and silently drops
    // unknown keys", which is why ids would be stripped on every URL round
    // trip. `size` takes the plan's floored integers rather than `s * size`
    // because the stage must be whole — see the header on W2's seam.
    scene: {
      ...scene,
      size: [plan.sceneWidth, plan.sceneHeight],
      layers: scene.layers.map(layer => scaleLayer(layer, s)),
    },
  }
}

function scaleLayer(layer: Layer, s: number): Layer {
  // Shared by every variant: `at` is a position in scene px, `anim` may carry
  // scene-px displacements. Built as a spreadable fragment so that an absent
  // field stays absent rather than becoming an explicit `undefined`.
  const base = {
    ...(layer.at !== undefined ? { at: [layer.at[0] * s, layer.at[1] * s] as [number, number] } : {}),
    ...(layer.anim !== undefined ? { anim: scaleAnim(layer.anim, s) } : {}),
  }

  switch (layer.type) {
    case 'text': {
      // Unsized text was refused above, so this branch is reached only with an
      // explicit size. The conditional is the honest spelling of that rather
      // than a non-null assertion: if the refusal is ever relaxed, this
      // degrades to "leave it alone" instead of multiplying `undefined`.
      const size = layer.size
      return size === undefined ? { ...layer, ...base } : { ...layer, ...base, size: size * s }
    }
    case 'shape': {
      const lengths: Partial<Record<typeof SCALED_SHAPE_LENGTHS[number], number>> = {}
      for (const field of SCALED_SHAPE_LENGTHS) {
        const v = layer[field]
        if (v !== undefined) lengths[field] = v * s
      }
      return { ...layer, ...base, ...lengths }
    }
    default:
      // image, gif and draw never reach here — `refuseReason` has already
      // rejected the whole scene. Kept total rather than throwing so that a
      // classification mistake is a no-op, not a crash in the render loop.
      return { ...layer, ...base }
  }
}

function scaleAnim(anim: NonNullable<Layer['anim']>, s: number): NonNullable<Layer['anim']> {
  return Array.isArray(anim)
    ? anim.map(a => scaleAnimator(a, s))
    : scaleAnimator(anim, s)
}

function scaleAnimator(a: Track | Preset, s: number): Track | Preset {
  // An allow-listed preset carries no scene-px parameter by definition, so it
  // passes through untouched — by reference, surplus keys and all.
  if (!isTrackAnimator(a)) return a
  return { ...a, keys: a.keys.map(k => scaleKey(k, s)) }
}

function scaleKey(k: Key, s: number): Key {
  const out: Key = { ...k }
  for (const channel of SCALED_CHANNELS) {
    const v = k[channel]
    if (v !== undefined) out[channel] = v * s
  }
  return out
}

/* ------------------------------------------------------------ classification */

/**
 * The first reason this scene cannot be scaled, or `undefined`.
 *
 * First rather than all: the caller's only decision is whether to use this mode
 * at all, and a list of four reasons answers that question no better than one
 * does while being four times as much to render. Deterministic order — layers
 * in index order, and within a layer the variant before its animators — so the
 * message a user sees does not depend on object key order.
 *
 * Reads **structure only**. It never sees the plan.
 */
function refuseReason(scene: Scene): ScaleRefusalDetail | undefined {
  for (let i = 0; i < scene.layers.length; i++) {
    const layer = scene.layers[i]
    if (layer === undefined) continue
    const refusal = refuseLayer(layer, i)
    if (refusal !== undefined) return refusal
  }
  return undefined
}

function refuseLayer(layer: Layer, index: number): ScaleRefusalDetail | undefined {
  switch (layer.type) {
    case 'image':
    case 'gif':
      // Covers heightmaps too: `mode: 'heightmap'` is a mode of these two
      // variants, not a variant of its own, and its geometry is the same source
      // raster read a different way.
      return detail('raster-geometry', index, layer.type)
    case 'draw':
      return detail('draw-layer', index, layer.type)
    case 'text':
      if (layer.size === undefined) return detail('unsized-text', index, layer.type)
      break
    case 'shape':
      break
  }
  return refuseAnim(layer.anim, index)
}

function refuseAnim(anim: Layer['anim'], index: number): ScaleRefusalDetail | undefined {
  if (anim === undefined) return undefined
  for (const a of Array.isArray(anim) ? anim : [anim]) {
    if (isTrackAnimator(a)) continue
    if (!presetIsScaleFree(a)) return detail('unscalable-preset', index, String(a.kind))
  }
  return undefined
}

function detail(reason: ScaleRefusal, layer: number, subject: string): ScaleRefusalDetail {
  // The explanation is copied from the record rather than re-stated, so the
  // text a caller shows and the text the record documents cannot diverge.
  return { ...SCALE_REFUSALS[reason], layer, subject }
}
