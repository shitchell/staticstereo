import { resolveStereo } from '../src/core/index.js'
import {
  frameIndexAt,
  frameTimesOf,
  initialTransport,
  lastFrameTime,
  pause as pauseTransport,
  play as playTransport,
  seek as seekTransport,
  timeAt,
  timeOfFrame,
} from './transport.js'
import { validateScene } from './scene.js'
import type { TransportState } from './transport.js'
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
 *
 * ## The transport lives here, as `transport.ts`'s machine and not a copy
 *
 * Plan §3 breaks the P4↔P6 cycle by putting scene time and the transport
 * primitive in the editor's store, and `transportdriver.ts` names the seam:
 * *"That module is a pure state machine over values and nothing else, which is
 * the property that lets P3 lift it into the editor store wholesale; this one
 * owns a loop and a pending handle, and a store wants the machine without the
 * loop."* So the machine is in {@link UiState} and the loop is not: every
 * transport action carries its own `nowMs`, nothing in this module's import
 * closure reads a clock, and a whole playback session is a sequence of numbers
 * a test writes down.
 *
 * **One scene time, under two names.** `UiState.time` is the scrub position
 * and `TransportState.anchorTime` is the playhead's anchor, and they are
 * always the same number — every arm below sets `time` from the transport it
 * just computed, never from arithmetic of its own. A-1 declined to hold both
 * in the store while they could still disagree (*"a store quietly holding both
 * is where that disagreement would have become permanent"*); they agree now
 * because the reconciliation landed first, and the equality is asserted over
 * the whole `Action` vocabulary rather than left as an intention.
 */

export type DepthView = 'composited' | 'encoded'

export interface UiState {
  scene: Scene
  /**
   * Always an element of `frameTimes(scene)`, and always
   * `transport.anchorTime`. The scrubber reads this one; {@link currentTime}
   * is the live answer while playing.
   */
  time: number
  depthView: DepthView
  /**
   * Where the playhead is and whether it is moving — `transport.ts`'s own
   * value, held and never rebuilt here.
   */
  transport: TransportState
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
   * The transport primitive. **`nowMs` is the wall clock in milliseconds and
   * it is an argument**, on `transportdriver.ts`'s precedent, because a
   * reducer that read a clock would make every state it produces depend on
   * when the test ran rather than on what it was handed.
   *
   * Three actions and not four: `toggle` is `transport.ts`'s and stays there,
   * since a caller holding the store can already read
   * `state.transport.playing` and pick. An action that only dispatches one of
   * two other actions is a UI affordance, and putting it in the vocabulary
   * would oblige every consumer of the union — the hash projector's sweep,
   * the store's, a future history layer's — to carry a case that can never
   * reach `reduce` in a shape the other two do not already cover.
   */
  | { type: 'play'; nowMs: number }
  | { type: 'pause'; nowMs: number }
  | { type: 'seek'; seconds: number; nowMs: number }

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
 * three cases is load-bearing. **A bare `move` does nothing**: its `from` and
 * `to` are `[x, y]` offsets from the layer's own `at` and both default to
 * `[0, 0]`, so `{kind: 'move'}` compiles to
 * `[{t: 0, x: 0, y: 0}, {t: 1, x: 0, y: 0}]` — a track that animates precisely
 * nothing. Verified against core with a correct `PresetCtx`.
 *
 * **`move` is no longer the only inert bare preset, and this note does not
 * claim otherwise.** Every verb whose parameters are a *delta from rest*
 * defaults to rest — `rotate` is the first of them, 0°→0° — so the set grows
 * as the verb vocabulary does. What still earns `move` a sentence of its own
 * is that it is the one an author picks while *expecting* motion: `rotate`
 * with no angle reads as an unfinished thought, whereas `move` reads like a
 * complete instruction and so is the choice that gets mistaken for a broken
 * renderer. The others take the generic note.
 *
 * Not every bare preset that *animates* nothing is inert: `flip` holds a
 * constant half turn, so no channel of its track varies, yet the layer is
 * visibly mirrored. It needs no warning for the same reason `rotate` needs
 * none — what it does bare is what it says.
 *
 * The dropdown cannot carry parameters — those live in the scene JSON — so
 * without this sentence that one user action is indistinguishable from a bug.
 * Core's own parameter readers reject garbage rather than defaulting, for
 * exactly this reason; a delta verb's defaults are the place that argument
 * does not hold, and the UI pays for it here.
 */
export function presetNote(kind: string, layerCount: number): string {
  if (layerCount === 0) return 'This scene has no layers.'
  if (kind === CUSTOM_TRACK) {
    return 'This layer has a hand-written keyframe track. Choosing a preset replaces it; ' +
      'edit it in the scene JSON below to keep it.'
  }
  if (kind === 'move') {
    return 'move needs from and to — they are [x, y] offsets from the layer\'s own at, ' +
      'and both default to [0, 0], so a bare move animates nothing at all. Give it ' +
      '{"kind": "move", "from": [-60, 0], "to": [700, 0]} in the scene JSON below.'
  }
  return 'Presets compile to keyframe tracks, so anything here can also be written out ' +
    'longhand in the scene JSON — and a longhand track is where anything the five ' +
    'verbs cannot say goes, such as a three-key bounce. A track takes its period ' +
    'from the scene duration unless you give it its own.'
}

/**
 * The frame grid lives in `transport.ts` and is re-exported — not re-stated — here.
 *
 * The player must be able to reach `frameTimesOf`/`frameIndexAt`/`timeOfFrame`/
 * `lastFrameTime` without importing this module, which carries the editor's
 * `UiState` and `reduce`. A second copy is the thing to avoid: the channel list
 * is already guarded in `track.ts` and duplicated unguarded in two validators,
 * and both of them silently drop channels because of it. `transport.test.ts`
 * asserts these are the *same function objects*, so a re-implementation here
 * fails rather than quietly diverging.
 */
export { frameIndexAt, frameTimesOf, lastFrameTime, timeOfFrame }

/*
 * There was a `const snap = snapTime` alias here, the last remnant of a
 * private copy of `timeOfFrame(scene, frameIndexAt(scene, seconds))` that was
 * byte-identical to `snapTime`'s body and that nothing asserted agreed with
 * it. Every call site it served now reaches the grid through
 * {@link seekTransport} instead, so the alias had no readers left; the record
 * of why the copy was wrong lives on `snapTime`'s own docblock, which is the
 * file a reader of this one would go to next.
 */

/**
 * Materialise the stereo settings into the scene.
 *
 * The controls need concrete numbers to show, and `scene.stereo` is optional
 * and partial. Resolving it once here means the sliders and the renderer read
 * the same values, rather than the sliders showing defaults they invented.
 */
export function initialState(scene: Scene): UiState {
  const withStereo: Scene = { ...scene, stereo: { ...resolveStereo(scene) } }
  // `time` is read off the transport rather than computed as `snapTime(scene, 0)`
  // beside it. The two give the same answer today, which is exactly why one
  // of them has to be the other's source: an initialiser that happened to
  // agree is the agreeing duplicate this module's guards exist to refuse.
  const transport = initialTransport(withStereo)
  return { scene: withStereo, time: transport.anchorTime, depthView: 'composited', transport }
}

export function currentFrame(state: UiState): number {
  return frameIndexAt(state.scene, state.time)
}

/**
 * The scene time to show at wall-clock `nowMs`, in seconds, on the grid.
 *
 * `transport.ts`'s {@link timeAt} under the editor's name for it — the
 * `currentTime` plan §3 says belongs to the store. While paused it is
 * `state.time` for every `nowMs`, which is what makes the scrubber's number
 * and the playhead's number one number; while playing it advances, and the
 * advance is where the loop wraps.
 *
 * **A function and not a field, which is the whole reason the store needs no
 * clock.** A stored `currentTime` would have to be refreshed by something, and
 * that something is a timer; derived, the caller that already has a clock —
 * the render loop, a test — supplies it at the point of use and this layer
 * stays expressible as values.
 */
export function currentTime(state: UiState, nowMs: number): number {
  return timeAt(state.transport, nowMs, state.scene)
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

/**
 * Commit a transport, and take the scrub time from it.
 *
 * **The single write site for scene time.** Every arm that moves the playhead
 * goes through here, so `time` can only ever be a number `transport.ts`
 * produced; there is no arm in which it is computed beside the transport and
 * could come out different. That is the structural form of the invariant the
 * sequencing of this work was arranged around, rather than a convention each
 * arm has to remember.
 */
function withTransport(state: UiState, scene: Scene, transport: TransportState): UiState {
  return { ...state, scene, transport, time: transport.anchorTime }
}

/**
 * Replace the scene and re-anchor the playhead onto its grid.
 *
 * **`anchorTime` is documented as "always a point of `frameTimes(scene)`"**,
 * and an `fps` or `duration` edit moves the grid out from under it — so a
 * scene swap that only re-snapped `time` would leave the transport anchored
 * between two frames of a grid it had never seen. Re-snapping is
 * {@link seekTransport}, which is the same call the scrubber makes, so the two
 * cannot drift apart.
 *
 * **The wall clock is the one already stored.** A scene edit carries no
 * `nowMs` — `fps`, `duration`, `size` and the layer edits are issued by
 * controls that know nothing about time — so the anchor pair keeps the origin
 * it had and only its scene-time half moves. Paused, `anchorMs` is meaningless
 * and this is exact. Playing, it means the edit does not re-time the playhead,
 * which is the conservative of the two readings and the only one available
 * without inventing a clock read in a pure reducer.
 */
function withScene(state: UiState, scene: Scene): UiState {
  return withTransport(
    state,
    scene,
    seekTransport(state.transport, state.time, state.transport.anchorMs, scene),
  )
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

    // The two clock-free scrub arms. Both move the playhead and so both are
    // seeks: before the transport lived here they wrote `time` directly, and
    // a scrubber that set one number while the playhead kept another is
    // precisely the two-representations defect this arm's rewrite removes.
    // They carry no `nowMs`, so they re-anchor the scene-time half of the pair
    // and leave the wall-clock half alone — see {@link withScene}. A caller
    // that is scrubbing *during playback* should dispatch `seek`, which
    // carries the clock and so re-times the playhead as well.
    case 'time':
      return withTransport(
        state,
        state.scene,
        seekTransport(state.transport, action.seconds, state.transport.anchorMs, state.scene),
      )

    case 'frame':
      return withTransport(
        state,
        state.scene,
        seekTransport(
          state.transport,
          timeOfFrame(state.scene, action.index),
          state.transport.anchorMs,
          state.scene,
        ),
      )

    case 'depthView':
      return { ...state, depthView: action.value }

    case 'play':
      return withTransport(state, state.scene, playTransport(state.transport, action.nowMs))

    case 'pause':
      return withTransport(
        state,
        state.scene,
        pauseTransport(state.transport, action.nowMs, state.scene),
      )

    case 'seek':
      return withTransport(
        state,
        state.scene,
        seekTransport(state.transport, action.seconds, action.nowMs, state.scene),
      )

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
