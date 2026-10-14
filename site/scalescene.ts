/**
 * `fit=render`: scale a scene's geometry to a {@link RenderFit} plan — or
 * refuse, in the open, and say why.
 *
 * ## Why this function refuses rather than always succeeding
 *
 * Re-rendering a scene smaller requires knowing which numbers in it are
 * **lengths in scene px**. For a plain `Track` keyframe that is knowable: `x`
 * and `y` are displacements and nothing else. For a `Preset` it is not.
 * `move.from` is an `[x, y]` offset in **scene px**; `push.from` is a scalar
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
 * ## Known limitation: the exhaustiveness guard does not partition accept/refuse
 *
 * `scalescene.test.ts` carries a two-armed `AssertNever` guard over
 * `Layer['type']` — scaled or refused — so that a sixth layer variant is a
 * compile error until somebody classifies it. **Read what it actually proves
 * before trusting it.** The two arms partition the variant *names*, not the
 * accept/refuse *outcome*. `text` sits in the scaled arm even though an
 * unsized text layer is refused, because the refusal is conditional on a field
 * rather than on the variant.
 *
 * The consequence: a future variant with that same conditional shape — scaled
 * when some field is present, refused when it is absent — would be put in the
 * scaled arm, the guard would be satisfied, and the conditional half would be
 * nobody's job. The guard catches a forgotten *variant*; it does not catch a
 * forgotten *condition*.
 *
 * Recorded rather than fixed, deliberately. Representing "conditionally
 * refused" properly means a third arm and a per-variant predicate the guard
 * can check, which is more machinery than one conditional refusal warrants.
 * If a second one appears, that is the moment to build it.
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
      'that module. Core does not render these at all: src/core/raster.ts throws for layer ' +
      'type "draw", because resolving a module path is platform-specific — import() of a ' +
      'filesystem path works in Node and not in a static browser bundle, where there is no ' +
      'path to resolve and no bundler entry for it — so the loader seam belongs on the ' +
      'adapter rather than guessed at in core. The player IS that static browser bundle, so ' +
      'a draw layer was never going to be drawn here under any fit mode. Refusing it costs ' +
      'nothing and moves the failure somewhere it can be explained instead of thrown.',
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
      'no scene-px parameter. Preset parameters are untyped — move.from is an [x, y] offset ' +
      'in scene px while push.from is a scalar in depth units, the same key name and the ' +
      'same JSON shape — so there is no structural rule that tells a length from a depth, and ' +
      'examples/pacman.yaml contains both spellings. Until each verb declares the unit of its ' +
      'parameters, an unrecognised kind is refused rather than guessed at: a wrong guess ' +
      'silently mis-scales the picture with nothing to show for it, while a refusal falls back ' +
      'to the default fit mode and shows a correct picture in a different one.',
  },
}

/* ------------------------------------- the note: informational, not a gate */

/** Things a caller should know about a `render` plan that are not refusals. */
export type ScaleNote = 'margin-share'

/** What {@link SCALE_NOTES} records about one note. */
export interface ScaleNoteInfo {
  /** The note's own name, as {@link ScaleRefusalInfo} does. */
  readonly note: ScaleNote
  /** What the caller should know, in prose a human can be shown. */
  readonly explanation: string
}

/**
 * Properties of `fit=render` that are worth saying out loud and are **not**
 * grounds for refusing.
 *
 * A third category alongside "scaled" and "refused", and it needs to exist
 * because the alternative spellings are both wrong. Folding this into
 * {@link SCALE_REFUSALS} would turn a working mode into a broken one; leaving
 * it out entirely makes a real and surprising property of the mode something a
 * user has to rediscover by looking at a picture and wondering.
 */
export const SCALE_NOTES: Record<ScaleNote, ScaleNoteInfo> = {
  'margin-share': {
    note: 'margin-share',
    explanation:
      'Under fit=render the stage scales and the plate margins do not, so the stage takes a ' +
      'shrinking share of the emitted image as the render gets smaller. The margins are ' +
      'ceil(sepFar/2) either side (ceil(sepFar) and ceil(sepFar/2) under the shift algorithm) ' +
      'and sepFar does not scale, because separation is a property of the viewer\'s eyes ' +
      'rather than of the picture (requirements §7 C1) — scaling it would change the ' +
      'disparity budget, a perceptual decision, in the course of answering a layout ' +
      'question. Measured on a 960x480 scene at sepFar 110, linked, noiseScale 2, dpr 1: the ' +
      'stage is 92.7% of the plate at 3000 CSS px of available width, 82.8% at 1280, and ' +
      '56.0% at 500. Small renders are proportionally more dead margin. That is a real cost ' +
      'of this mode and not a defect — the picture is smaller, not broken — and there is ' +
      'deliberately no threshold at which it is refused, because nobody has measured where ' +
      'it stops being worth it and an unmeasured threshold is worse than none.',
  },
}

/** The note for a given plan, with the share this particular plan produces. */
export interface ScaleNotice extends ScaleNoteInfo {
  /**
   * `plan.sceneWidth / plan.plateWidth` — the fraction of the emitted image
   * that is stage rather than dead margin. Dimensionless, 0..1. Read off the
   * plan rather than re-solved, so it cannot disagree with `renderFit`.
   */
  readonly stageShare: number
}

/**
 * What a caller should know about this `render` plan.
 *
 * **Total, unlike `fitNotice`.** `site/fit.ts`'s notice returns `undefined` for
 * a mode with nothing to say, because most modes have nothing to say. This one
 * always has something to say: the property it reports holds for every render
 * plan, and only its magnitude varies. Returning `undefined` below some share
 * would be a threshold wearing a notice's clothes — exactly the thing that was
 * declined — so the caller gets the number and decides for itself whether it
 * is worth surfacing.
 */
export function scaleNotice(plan: RenderFit): ScaleNotice {
  return { ...SCALE_NOTES['margin-share'], stageShare: plan.sceneWidth / plan.plateWidth }
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
 * The rename it predicted has now landed (`slide`→`move`, `emerge`→`push`). A
 * scene containing `move` matches nothing in a deny-list written against the
 * old names; the detector concludes "no px params here", scales nothing,
 * refuses nothing, and emits exactly the mis-scaled output this whole
 * mechanism exists to prevent — with no test turning red, because no test can
 * assert about a name nobody has written down yet. An allow-list fails the
 * other way: an unknown kind is refused, the player falls back to the default
 * fit mode, and the user sees a correct picture in a different mode. **The
 * prediction was borne out on this very list**, which went on naming `emerge`
 * after `emerge` ceased to exist and refused every depth-animated scene until
 * a test that compares the list against the live registry said so. That is the
 * difference being claimed here, observed: the wrong allow-list refused
 * correct pictures, where the wrong deny-list would have shipped incorrect
 * ones.
 *
 * The two spellings read equally reasonably in a ticket. They differ in exactly
 * the way that kills: one is wrong loudly and one is wrong quietly.
 *
 * ## Why this one
 *
 * - `push` — `from`/`to` are absolute **depths**, and its only other
 *   parameters are timing overrides. Nothing it carries is a length.
 *   `PRESET_PARAMS.push` is `[DEPTH('from'), DEPTH('to')]`, which is upstream
 *   saying the same thing in a form a test can read.
 *
 * `slide-in` was on this list and has been removed. It looked safe — its
 * `from` is a direction *word* and the off-frame distance comes from
 * `PresetCtx`, which the renderer measures against whatever scene it is handed
 * — but P0 deleted the verb outright and its replacement, `move`, takes
 * explicit off-stage endpoints in scene px. So it lands in the refused arm by
 * the ordinary rule, and the entry was dropped rather than kept and reasoned
 * about. After the rename this list is `{push}` alone, and it now is.
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
 *
 * **Those tags now exist** — `PRESET_PARAMS` in `src/core/anim/params.ts`,
 * tied to the registry by `Record<PresetKind, …>` so a verb cannot omit them,
 * and designed for this consumer: `speed` is tagged `scenePx` with
 * `per: 'second'` rather than given a unit of its own precisely so that the
 * rule "scale every `scenePx` parameter" catches a rate for free. The swap was
 * **deliberately not taken here**, because it is not the one-line edit the
 * paragraph above anticipated. Under the descriptor rule `rotate` (degrees),
 * `scale` (multiplier) and `flip` (enum) all become scale-*free* — correctly,
 * none of them carries a length — so `fit=render` would begin accepting three
 * verbs it refuses today. That is a widening of what the mode renders, not a
 * refactor: it moves the floor of `refuses every registered kind that is not
 * on the allow-list` from four kinds to one, and it falsifies the sentence
 * "Preset parameters are untyped" that the `unscalable-preset` refusal
 * explanation — and the regexes pinning it — are built on. Worth doing, as its
 * own task, with its own per-verb tests.
 *
 * What is taken from the tags meanwhile is the *check*, not the mechanism:
 * `scalescene.test.ts` now asserts that every allow-listed kind has no
 * `scenePx` descriptor. The list stays hand-written and fail-closed; the claim
 * it makes in its first line has stopped being unverified prose.
 */
export const SCALE_FREE_PRESET_KINDS: ReadonlySet<string> = new Set(['push'])

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
