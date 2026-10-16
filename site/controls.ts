import { LAYER_KEYS, PRESET_PARAMS, SCENE_KEYS, STEREO_KEYS, resolveStereo } from '../src/core/index.js'
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
import type {
  Anim,
  AssertNever,
  Layer,
  LayerOf,
  Preset,
  Scene,
  SceneKey,
  StereoKey,
  StereoOpts,
} from '../src/core/types.js'
import type { ParamDescriptor, PresetKind } from '../src/core/index.js'

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

/* ------------------------------------------------ criterion 22: the write
 * path for every control
 *
 * **What was wrong.** ESC-7 measured 17 of 63 `CONTROLS` entries with a keyed
 * `Action` and 46 with none — every `layer.*.at`/`.depth`/`.name`, all
 * `layer.shape.*`, all `image|gif.src|mode|mask`, all 11 `preset.*`. Their
 * only write path was handing `reduce` a whole rebuilt `Scene`, which
 * `store.ts`'s header says the store must not own, and criterion 6 is
 * structurally unable to see it: it proves a spec is *reachable*, not that a
 * value is *writable*.
 *
 * **Why the obvious fix is worse than the gap.** A path-addressed action
 * carrying a computed key **erases the field type**. Measured, at this phase's
 * commit, with `tsc` under this repo's own `strict` + `noUncheckedIndexedAccess`:
 *
 * ```ts
 * const bad: Action = { type: 'stereo', patch: { cross: 1 } }        // TS2322
 * declare const key: string
 * const sneaky: Action = { type: 'stereo', patch: { [key]: Number(raw) } }  // 0 errors
 * declare const narrow: keyof StereoOpts
 * const p: Partial<StereoOpts> = { [narrow]: Number(raw) }                  // 0 errors
 * ```
 *
 * The third line is the part worth keeping: **narrowing the key to the
 * correct union does not restore the check.** A fresh object literal with a
 * computed key is typed by its *index signature*, and an index signature of
 * `number` satisfies a target whose property is `boolean`. So a generated
 * widget could write a number into `cross` with nothing between it and the
 * scene. SPIKE-1's own code had that bug and compiled.
 *
 * **The shape that does not erase.** One `Action` member per control, built
 * by distributing a mapped type over a map from control id to the *model's*
 * type for that field. Each member pairs one literal id with one concrete
 * value type, so the checker has a correlation to lose rather than an index
 * signature to widen — and the member for `'stereo.cross'` is the only one
 * whose `control` accepts that literal.
 *
 * Three consequences, all of them deliberate:
 *
 *  - A caller holding an id in a *variable* cannot write at all. That is the
 *    generic renderer, and the compile error is the point: it must narrow —
 *    by switching on the unit, by a per-control reader — before it writes.
 *    This is the hole closing, not a missing feature.
 *  - `value` is required even where the model's field is optional, and
 *    `undefined` is only *accepted* there. Omitting it is a different mistake
 *    from clearing the field and the two must not be one spelling.
 *  - `index` is required exactly on the layer controls and refused on the
 *    singletons, because `scene` and `scene.stereo` are singletons and a
 *    layer control that did not say *which* layer would be addressing the
 *    selection rather than the model.
 *
 * **What this does not reach: the eleven `preset.*` controls.** `Preset` is
 * `{kind: string; [param: string]: unknown}` (`src/core/types.ts`), so a verb
 * parameter's declared type in the model **is** `unknown` and there is no
 * wrong-typed write into one to refuse. They are therefore not in this map;
 * they are declared in {@link unwritableControls}, and
 * `_PresetParamsAreUntypedInTheModel` below is the tripwire that fires the day
 * that stops being true. See that function for the full argument and the cost
 * of each alternative.
 */

/**
 * The layer variants the editor derives controls for.
 *
 * Written out and tied to the model's union below rather than read from
 * `browserReachableLayerTypes()`, because that function is a *runtime* probe
 * of the validator and a type cannot ask it anything. The tie here is the
 * narrower claim the types can carry — `draw` and nothing else is excluded —
 * and `controls.test.ts` asserts this tuple against the probe's answer, which
 * is the half the compiler cannot make.
 */
export const BROWSER_LAYER_VARIANTS = ['text', 'image', 'gif', 'shape'] as const
type BrowserLayerVariant = typeof BROWSER_LAYER_VARIANTS[number]
type EditableLayerType = Exclude<Layer['type'], 'draw'>
type _NoVariantMissing = AssertNever<Exclude<EditableLayerType, BrowserLayerVariant>>
type _NoVariantExtra = AssertNever<Exclude<BrowserLayerVariant, EditableLayerType>>

/**
 * Scene keys whose members are controls under another owner, not controls in
 * their own right.
 *
 * The type-level twin of `controlspec.ts`'s `SCENE_CONTAINERS`, and declared
 * here rather than imported because that table's declared type is
 * `Partial<Record<SceneKey, …>>`, whose `keyof` is every scene key. The two
 * are independent readings of one decision and `controls.test.ts` compares
 * the id sets they produce, which is what makes this a guard rather than a
 * copy.
 */
const CONTAINER_SCENE_KEYS = ['stereo', 'layers'] as const
type AuthorableSceneKey = Exclude<SceneKey, typeof CONTAINER_SCENE_KEYS[number]>

type SceneValues = { [K in AuthorableSceneKey as `scene.${K}`]: Scene[K] }
/**
 * `Scene['stereo']` and not `StereoOpts`: the field a control writes is
 * `scene.stereo.sepFar`, whose declared type is `Partial<StereoOpts>`'s, so
 * `undefined` is part of it. Taking the resolved `StereoOpts` instead would be
 * stricter than the model and would make this path disagree with the existing
 * `{type: 'stereo'}` arm, which accepts a `Partial`.
 */
type StereoValues = { [K in StereoKey as `stereo.${K}`]: NonNullable<Scene['stereo']>[K] }
type LayerValuesOf<V extends BrowserLayerVariant> =
  { [K in keyof LayerOf<V> as `layer.${V}.${K & string}`]: LayerOf<V>[K] }
type LayerValues =
  & LayerValuesOf<'text'>
  & LayerValuesOf<'image'>
  & LayerValuesOf<'gif'>
  & LayerValuesOf<'shape'>

/** Every writable control id, mapped to the model's own type for its field. */
export type ControlValues = SceneValues & StereoValues & LayerValues

/** A control id this module can write. See {@link unwritableControls} for the rest. */
export type WritableControlId = keyof ControlValues

/**
 * The same id set, composed from the *rosters* instead of from the types.
 *
 * The pair below is not a membership guard — `LAYER_KEYS` and `keyof LayerOf<V>`
 * are already tied by ten `AssertNever` pairs in `src/core/types.ts`, and §9 is
 * blunt that a guard derived from the roster it guards *"proves only that the
 * derivation ran twice."* What it does guard is this file's own composition:
 * the id **grammar** (`owner.key`, `owner.scope.key`), the container exclusion
 * and the variant exclusion. Get any of those wrong and the runtime list below
 * stops naming the same controls the type map does, which is the drift a
 * reader of either one alone cannot see.
 */
type RosterWritableId =
  | `scene.${AuthorableSceneKey}`
  | `stereo.${StereoKey}`
  | { [V in BrowserLayerVariant]: `layer.${V}.${typeof LAYER_KEYS[V][number]}` }[BrowserLayerVariant]
type _NoWritableIdMissing = AssertNever<Exclude<WritableControlId, RosterWritableId>>
type _NoWritableIdExtra = AssertNever<Exclude<RosterWritableId, WritableControlId>>

/**
 * Where a layer control says *which* layer, and where a singleton refuses to.
 *
 * `index?: never` rather than an omission: an omitted property is satisfied by
 * an object that carries one, so `{control: 'scene.fps', index: 0}` would
 * compile and the index would be silently ignored.
 */
type ControlAddress<K> = K extends `layer.${string}`
  ? { readonly index: number }
  : { readonly index?: never }

/**
 * Write one control's value.
 *
 * `-?` on the outer mapped type is load-bearing and was measured: without it
 * the map inherits the optionality of the model's own fields, the indexed
 * access then yields `… | undefined`, and `const a: SetAction = undefined`
 * compiles. The modifier strips that; `value`'s own optionality is unaffected
 * because it is declared in an ordinary type literal inside the body.
 */
export type SetAction = {
  [K in keyof ControlValues]-?: {
    readonly type: 'set'
    readonly control: K
    readonly value: ControlValues[K]
  } & ControlAddress<K>
}[keyof ControlValues]

/**
 * Every control id {@link SetAction} can write, as runtime data.
 *
 * `AssertNever` is enforced by `npm run typecheck` alone, so without a runtime
 * witness the pair above is invisible to `npm test` — the same reason
 * `SCENE_KEYS` and `LAYER_KEYS` are exported upstream. The element type is the
 * roster-composed union, so the pair ties this array to the type map as well.
 */
export const WRITABLE_CONTROL_IDS: readonly RosterWritableId[] = [
  ...SCENE_KEYS
    .filter((key): key is AuthorableSceneKey =>
      !(CONTAINER_SCENE_KEYS as readonly string[]).includes(key))
    .map(key => `scene.${key}` as const),
  ...STEREO_KEYS.map(key => `stereo.${key}` as const),
  ...BROWSER_LAYER_VARIANTS.flatMap(variant =>
    // `as RosterWritableId` and not `as const`: `flatMap` instantiates the
    // callback once over the whole variant union, so the inferred template
    // literal is the cross product `layer.${V}.${every key of any variant}` —
    // wider than the truth and wide enough to hide a real drift. The pair
    // above is what keeps this cast honest; the cast only stops the cross
    // product from being the thing the pair compares.
    LAYER_KEYS[variant].map(key => `layer.${variant}.${key}` as RosterWritableId)),
]

/** Why a `CONTROLS` entry has no type-preserving write path. */
export interface UnwritableControl {
  /** The control id. Mirrors the key, as `ControlInfo.control` does. */
  readonly control: string
  /** The class of the gap, so a reader can tell two causes apart. */
  readonly disposition: 'untyped-in-model'
  /** The argument, in prose a human can be shown. */
  readonly reason: string
}

/**
 * Fires the day `Preset` stops being an open bag of `unknown`.
 *
 * `unknown extends T` is true only of `unknown` and `any`, so this resolves to
 * `never` exactly while a verb parameter has no declared type. The moment one
 * does, this is a typecheck failure carrying the sentence below — which is
 * §9's *"a recorded note is not a sensor"* applied to the one finding in this
 * task that is a statement about a type nobody is editing today.
 */
type _PresetParamsAreUntypedInTheModel = AssertNever<
  unknown extends Preset[string]
    ? never
    : 'Preset parameters now carry types; the preset residue in `unwritableControls` can shrink'
>

const PRESET_RESIDUE_REASON =
  '`Preset` is `{kind: string; [param: string]: unknown}`, so this parameter\'s declared type ' +
  'in the model IS `unknown`. Criterion 22\'s second clause — a wrong-typed write fails to ' +
  'compile — therefore has no subject here: every write is well-typed, and a compile-error ' +
  'sensor would report the gap GREEN. Typing it needs one of three things, all upstream of ' +
  'this module: a per-kind `Preset` union in `src/core/types.ts` (breaks `PresetFn`, which ' +
  'reads parameters by name off an open bag); generic parameter constructors plus `as const` ' +
  'on `PRESET_PARAMS` in `src/core/anim/params.ts`, so the descriptor names and shapes survive ' +
  'into the type level; or a hand-written value-type table here, which is §9\'s "hand-written ' +
  'list of the places that do X" and would be tied to nothing. Addressing is a second, ' +
  'independent gap: a verb parameter lives inside `layer.anim`, which is ' +
  '`Track | Preset | (Track | Preset)[]`, so a write needs a layer index AND an anim slot, and ' +
  'the `CONTROLS` entry carries neither.'

/**
 * Every `CONTROLS` entry with no type-preserving write path, and why.
 *
 * **Derived from the same roster the controls are**, not listed: a sixth verb
 * registered in `PRESET_PARAMS` produces controls in `controlspec.ts` and
 * joins this residue here in the same breath, so the partition over
 * `CONTROL_IDS` that `controls.test.ts` asserts stays total without anyone
 * remembering to extend a list. That is the whole difference between a
 * declared gap and an undetected one — §9: *"a recorded note is not a sensor.
 * Where a gap is accepted, convert the note into a test that goes red the day
 * someone crosses it."*
 *
 * `params` is a parameter for the reason every reader in `controlspec.ts`
 * takes its population: the vacuity floor has to be able to drive this to
 * zero, and a residue that could only be asked about the verbs that shipped
 * would be unprovable over any other roster.
 */
export function unwritableControls(
  params: Readonly<Record<string, readonly ParamDescriptor[]>> = PRESET_PARAMS,
): readonly UnwritableControl[] {
  const out: UnwritableControl[] = []
  for (const kind of Object.keys(params)) {
    for (const descriptor of params[kind] ?? []) {
      out.push({
        control: `preset.${kind}.${descriptor.name}`,
        disposition: 'untyped-in-model',
        reason: PRESET_RESIDUE_REASON,
      })
    }
  }
  return out
}

/** `PRESET_PARAMS` is keyed by the verb registry's own union; this names it. */
type _PresetParamsIsKeyedByKind = AssertNever<
  Exclude<keyof typeof PRESET_PARAMS, PresetKind>
>

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
   * Criterion 22's write path: one member per writable control, each pairing
   * a literal id with the model's own type for that field. See the block
   * above {@link BROWSER_LAYER_VARIANTS} for why it is a distributed union
   * and not one member carrying a path and a value.
   *
   * **This overlaps the keyed arms above for 17 controls and the overlap is
   * declared, not hidden.** The alternative — reimplementing `size`, `fps`,
   * `duration`, `freezeNoise`, `stereo`, `layerAnim` and `layerText` in terms
   * of this one — was weighed and declined here: `layerText` carries bounds
   * checks `set` does not, `layerAnim` is addressed by index alone and does
   * not know the variant, and all seven are consumed by `main.ts`, which this
   * task may not edit. So the duplication is pinned instead: `controls.test.ts`
   * asserts the two paths produce an identical state for every one of the 17,
   * which is the guard the channel list never had.
   */
  | SetAction

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

/**
 * Apply one {@link SetAction}.
 *
 * **The computed key is here and only here, and that is the trade.** The hole
 * criterion 22 exists to close is a computed key in the *vocabulary*, where
 * every caller is exposed to it; this is a computed key in one reducer arm,
 * behind a union that has already proved the id and the value agree. The cast
 * to `Record<string, unknown>` is the same one `patchText` and the `layerAnim`
 * arm already make for the same reason recorded there — *"deleting an optional
 * key off a `Layer` is not expressible in the type."*
 *
 * **`undefined` removes the key rather than storing it, on the scene and the
 * layer.** `TextPatch`'s docblock settled that distinction for the text
 * controls and the reasoning is general: `{fps: undefined}` serialises to a
 * hash with no `fps` key, so keeping the key in memory makes the state and the
 * share link disagree. The one exception is `scene.stereo`, which *spreads*,
 * because the keyed `{type: 'stereo'}` arm it has to agree with spreads — and
 * the resolved stereo block is materialised whole by {@link initialState}, so
 * a removal there has no meaning the editor can act on.
 *
 * Pair values are copied. `{...scene, size: action.value}` would alias the
 * array the caller handed in, so a renderer reusing one scratch pair would
 * mutate the committed scene from outside the store.
 */
function applySet(state: UiState, action: SetAction): UiState {
  const value = Array.isArray(action.value) ? [...action.value] : action.value
  const [owner, first, second] = action.control.split('.')

  if (owner === 'scene') {
    const scene = { ...state.scene } as unknown as Record<string, unknown>
    if (value === undefined) delete scene[first!]
    else scene[first!] = value
    return withScene(state, scene as unknown as Scene)
  }

  if (owner === 'stereo') {
    return withScene(state, {
      ...state.scene,
      stereo: { ...state.scene.stereo, [first!]: value } as Partial<StereoOpts>,
    })
  }

  // `layer.<variant>.<key>`. The index is required by the type; the *variant*
  // is not something the type can check against the scene, because which
  // variant sits at an index is a runtime fact. Refused by name rather than
  // applied, on `patchText`'s precedent: writing `r` onto a text layer would
  // produce a scene the validator rejects with the banner naming no field.
  const index = action.index!
  const layer = requireLayer(state.scene, index, `set ${action.control}`)
  if (layer.type !== first) {
    throw new Error(
      `cannot set ${action.control} on layer ${index}: it is a ${layer.type} layer`,
    )
  }
  const next = { ...layer } as unknown as Record<string, unknown>
  if (value === undefined) delete next[second!]
  else next[second!] = value
  const layers = state.scene.layers.map((each, i) =>
    (i === index ? (next as unknown as Layer) : each))
  return withScene(state, { ...state.scene, layers })
}

export function reduce(state: UiState, action: Action): UiState {
  switch (action.type) {
    case 'set':
      return applySet(state, action)

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
