import { frameTimes, resolveStereo } from '../src/core/index.js'
import { validateScene } from './scene.js'
import type { Anim, Layer, Scene, StereoOpts } from '../src/core/types.js'

/**
 * The page's state and the pure transitions over it.
 *
 * Kept away from the DOM on purpose: everything here is either arithmetic over
 * the frame grid or an immutable scene edit, and both have a failure mode that
 * is invisible in a browser but obvious in a unit test.
 *
 * Two decisions shape the whole module.
 *
 * **The scrub position is a *time*, not a frame index.** An index is meaningless
 * across a rate change — frame 12 of 24 is halfway through a 2s scene at 12fps
 * and a quarter of the way through at 25fps — so storing one makes the scrubber
 * jump whenever `fps` or `duration` is touched. The time is stored and always
 * snapped back onto `frameTimes(scene)`, so what the preview shows is a frame
 * the exported GIF also contains, and changing the rate keeps the moment.
 *
 * **The reducer applies what it is given, even when the result is unrenderable.**
 * A `sepNear` slider dragged up past `sepFar` must not throw out of an event
 * handler. {@link sceneError} is the separate question the page asks before it
 * renders; until the combination is valid again the last good frame stays on
 * screen with the message underneath it.
 */

export type DepthView = 'composited' | 'encoded'

export interface UiState {
  scene: Scene
  /** Always an element of `frameTimes(scene)`. */
  time: number
  depthView: DepthView
}

export type Action =
  | { type: 'scene'; scene: Scene }
  | { type: 'stereo'; patch: Partial<StereoOpts> }
  | { type: 'freezeNoise'; value: boolean }
  | { type: 'fps'; value: number | undefined }
  | { type: 'duration'; value: number | undefined }
  | { type: 'size'; value: [number, number] }
  | { type: 'time'; seconds: number }
  | { type: 'frame'; index: number }
  | { type: 'depthView'; value: DepthView }
  | { type: 'layerAnim'; index: number; anim: Anim | undefined }
  | { type: 'layerText'; index: number; patch: TextPatch }

/**
 * A typography edit to one `text` layer.
 *
 * **A key that is present with the value `undefined` means "remove it"**, and a
 * key that is absent means "leave it alone". The two are different actions and
 * the control panel issues both: changing the size must not clear a weight it
 * never mentioned, and choosing the blank weight option must put the layer back
 * to the font stack's own default rather than writing `"normal"` — those are
 * not the same thing to a face that has a Book or a Light.
 *
 * `font` is deliberately absent. Size and weight degrade predictably when the
 * viewer's font stack cannot honour them (a size always applies; a weight
 * saturates at the heaviest face present), whereas a family name either exists
 * on the viewer's machine or silently becomes something else entirely — and
 * `scene.layers[n].font` is still there in the JSON editor for anyone who wants
 * to take that risk knowingly.
 */
export interface TextPatch {
  /** px. `undefined` removes it, restoring core's own default size. */
  size?: number | undefined
  /** A CSS font-weight. `undefined` removes it. */
  weight?: string | undefined
}

/**
 * Read a control's value as a number, falling back rather than yielding NaN.
 *
 * An `<input type="number">` reports `''` while the user is mid-edit and
 * whatever they pasted otherwise. Either becoming `NaN` propagates into
 * `sepFar`, and the render then throws from inside the encoder naming nothing
 * the user touched. `Number('')` is 0, which is worse than a fallback: it
 * silently commits a value the user never typed.
 */
export function coerceNumber(raw: unknown, fallback: number): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : fallback
  if (typeof raw !== 'string') return fallback
  const text = raw.trim()
  if (text === '') return fallback
  const n = Number(text)
  return Number.isFinite(n) ? n : fallback
}

/**
 * As {@link coerceNumber}, but a fractional value is *rejected* rather than
 * rounded.
 *
 * `noiseScale` is a nearest-neighbour pixel replication factor, so quietly
 * rounding 2.5 to 2 would halve every measured period relative to what the
 * control reads back — the exact class of bug the design makes a point of
 * guarding in `resolveStereo`.
 */
export function coerceInt(raw: unknown, fallback: number): number {
  const n = coerceNumber(raw, fallback)
  return Number.isInteger(n) ? n : fallback
}

/**
 * The kind string the preset dropdown shows for a hand-written keyframe track.
 *
 * Not a preset name, and deliberately not a legal one: a dropdown cannot
 * represent an arbitrary track, and silently showing "none" would invite one
 * click that discards it.
 */
export const CUSTOM_TRACK = '(custom track)'

/**
 * The explanatory note under the preset dropdown.
 *
 * Pure and tested rather than built inline in the DOM layer, because one of the
 * three cases is load-bearing. **`slide` is the only v1 preset that does
 * nothing when chosen bare**: its `from` and `to` are `[x, y]` offsets from the
 * layer's own `at` and both default to `[0, 0]`, so `{kind: 'slide'}` compiles
 * to `[{t: 0, x: 0, y: 0}, {t: 1, x: 0, y: 0}]` — a track that animates
 * precisely nothing. Verified against core with a correct `PresetCtx`; every
 * other preset has a usable bare default (`slide-in` enters from `-contentW`,
 * `marquee` defaults to 60 px/sec, `bounce` to 100px, `bob` to 8px, `emerge`
 * rises to the layer's own depth).
 *
 * The dropdown cannot carry parameters — those live in the scene JSON — so
 * without this sentence the one user action that produces a dead animation is
 * indistinguishable from a broken renderer. Core's own parameter readers reject
 * garbage rather than defaulting, for exactly this reason; `slide`'s defaults
 * are the one place that argument does not hold, and the UI pays for it here.
 */
export function presetNote(kind: string, layerCount: number): string {
  if (layerCount === 0) return 'This scene has no layers.'
  if (kind === CUSTOM_TRACK) {
    return 'This layer has a hand-written keyframe track. Choosing a preset replaces it; ' +
      'edit it in the scene JSON below to keep it.'
  }
  if (kind === 'slide') {
    return 'slide needs from and to — they are [x, y] offsets from the layer\'s own at, ' +
      'and both default to [0, 0], so a bare slide animates nothing at all. Give it ' +
      '{"kind": "slide", "from": [-60, 0], "to": [700, 0]} in the scene JSON below. ' +
      'Every other preset has a usable default.'
  }
  return 'Presets compile to keyframe tracks, so anything here can also be written out ' +
    'longhand in the scene JSON. bob and bounce take their period from the scene ' +
    'duration unless you give them their own.'
}

/** `frameTimes`, re-exported through here so the page has one import for the grid. */
export function frameTimesOf(scene: Scene): number[] {
  return frameTimes(scene)
}

export function lastFrameTime(scene: Scene): number {
  const times = frameTimes(scene)
  return times[times.length - 1]!
}

/**
 * The frame whose sample time is nearest `seconds`.
 *
 * Ties resolve to the lower index: scanning ascending and only accepting a
 * strictly smaller distance makes the result independent of float noise in the
 * midpoint, which `<` on an exact tie would not be.
 */
export function frameIndexAt(scene: Scene, seconds: number): number {
  const times = frameTimes(scene)
  const t = Number.isFinite(seconds) ? seconds : 0
  let best = 0
  let bestDistance = Math.abs(times[0]! - t)
  for (let i = 1; i < times.length; i++) {
    const d = Math.abs(times[i]! - t)
    if (d < bestDistance) {
      bestDistance = d
      best = i
    }
  }
  return best
}

export function timeOfFrame(scene: Scene, index: number): number {
  const times = frameTimes(scene)
  const i = Number.isFinite(index) ? Math.round(index) : 0
  return times[i < 0 ? 0 : i >= times.length ? times.length - 1 : i]!
}

/** Snap a time onto the scene's frame grid. */
function snap(scene: Scene, seconds: number): number {
  return timeOfFrame(scene, frameIndexAt(scene, seconds))
}

/**
 * Materialise the stereo settings into the scene.
 *
 * The controls need concrete numbers to show, and `scene.stereo` is optional
 * and partial. Resolving it once here means the sliders and the renderer read
 * the same values, rather than the sliders showing defaults they invented.
 */
export function initialState(scene: Scene): UiState {
  const withStereo: Scene = { ...scene, stereo: { ...resolveStereo(scene) } }
  return { scene: withStereo, time: snap(withStereo, 0), depthView: 'composited' }
}

export function currentFrame(state: UiState): number {
  return frameIndexAt(state.scene, state.time)
}

/**
 * Why a scene cannot be rendered, or `undefined`.
 *
 * Delegates to the same validator the URL hash goes through, so the controls
 * cannot produce a state the share link would refuse to load.
 */
export function sceneError(scene: Scene): string | undefined {
  try {
    validateScene(scene)
    return undefined
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

/** Replace the scene and re-snap the scrub time onto its grid. */
function withScene(state: UiState, scene: Scene): UiState {
  return { ...state, scene, time: snap(scene, state.time) }
}

/**
 * The layer a per-layer action addresses, or a throw naming the mismatch.
 *
 * Every per-layer action needs this and the index is not trustworthy: the
 * `<select>` is rebuilt on a scene swap, so a hash-loaded scene can shrink the
 * layer list under a selection made against the previous one. Growing the array
 * to fit would invent a layer.
 */
function requireLayer(scene: Scene, index: number, what: string): Layer {
  if (!Number.isInteger(index) || index < 0 || index >= scene.layers.length) {
    throw new Error(
      `cannot ${what} on layer ${index}: the scene has ` +
      `${scene.layers.length} layer(s)`,
    )
  }
  return scene.layers[index]!
}

/**
 * Apply a {@link TextPatch} to one layer object.
 *
 * The bounds are checked here rather than left to {@link sceneError} on purpose.
 * `validateScene` would reject a `size` of 0 — so the page would show an error
 * banner and refuse to render — but the *control* would still read back 0,
 * leaving the user with a broken scene and no indication which field did it.
 * Rejecting at the edit names the field, and the last good frame stays up.
 */
function patchText(layer: Layer, index: number, patch: TextPatch): Layer {
  if (layer.type !== 'text') {
    throw new Error(
      `cannot set text properties on layer ${index}: it is a ${layer.type} ` +
      `layer, not a text layer`,
    )
  }
  // A record, because deleting an optional key off a `Layer` is not expressible
  // in the type — same shape as the `layerAnim` removal below.
  const next = { ...layer } as Record<string, unknown>

  if ('size' in patch) {
    const size = patch.size
    if (size === undefined) delete next['size']
    else if (!Number.isFinite(size) || size <= 0) {
      throw new Error(
        `layer ${index}: size must be a positive number of pixels, got ${size}`,
      )
    } else next['size'] = size
  }

  if ('weight' in patch) {
    const weight = patch.weight
    if (weight === undefined) delete next['weight']
    else if (weight.trim() === '') {
      // Rejected rather than treated as a removal: `undefined` already means
      // "remove", and two spellings for one action is how a control ends up
      // writing `weight: ""` into a share link that the validator then refuses
      // to load. The DOM layer maps its blank option to `undefined`.
      throw new Error(
        `layer ${index}: weight must be a CSS font-weight such as normal, bold ` +
        `or 900 — use undefined to remove it`,
      )
    } else next['weight'] = weight
  }

  return next as unknown as Layer
}

export function reduce(state: UiState, action: Action): UiState {
  switch (action.type) {
    case 'scene':
      return withScene(state, action.scene)

    case 'stereo':
      return withScene(state, {
        ...state.scene,
        stereo: { ...state.scene.stereo, ...action.patch },
      })

    case 'freezeNoise':
      return withScene(state, { ...state.scene, freezeNoise: action.value })

    case 'size':
      return withScene(state, { ...state.scene, size: [...action.value] })

    case 'fps':
    case 'duration': {
      // Deleted rather than set to undefined: design §4.1 distinguishes a scene
      // that *names* a field from one that does not — `{fps: undefined}` would
      // serialise to a hash with no `fps` key anyway, so keeping the key around
      // would make the in-memory state and the share link disagree.
      const scene: Scene = { ...state.scene }
      if (action.value === undefined) delete scene[action.type]
      else scene[action.type] = action.value
      return withScene(state, scene)
    }

    case 'time':
      return { ...state, time: snap(state.scene, action.seconds) }

    case 'frame':
      return { ...state, time: timeOfFrame(state.scene, action.index) }

    case 'depthView':
      return { ...state, depthView: action.value }

    case 'layerAnim': {
      const { index, anim } = action
      requireLayer(state.scene, index, 'set an animator')
      const layers = state.scene.layers.map((layer, i): Layer => {
        if (i !== index) return layer
        if (anim === undefined) {
          // Removed, not set to undefined: `{anim: undefined}` would serialise
          // to a hash without the key anyway, so leaving it in memory makes the
          // state and the share link disagree about whether the layer animates.
          const rest = { ...layer } as Record<string, unknown>
          delete rest['anim']
          return rest as unknown as Layer
        }
        return { ...layer, anim }
      })
      return withScene(state, { ...state.scene, layers })
    }

    case 'layerText': {
      const { index, patch } = action
      // Thrown before anything is built, so a rejected edit leaves the state
      // untouched rather than half-applied.
      const patched = patchText(requireLayer(state.scene, index, 'set text properties'), index, patch)
      const layers = state.scene.layers.map((layer, i) => (i === index ? patched : layer))
      return withScene(state, { ...state.scene, layers })
    }
  }
}
