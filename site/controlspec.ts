/**
 * Every control the editor exposes — **derived from the model's guarded
 * rosters, never enumerated.**
 *
 * Design §11 row 3 budgets a scalar control at *"one declaration"*, and §9 is
 * the reason that declaration cannot be a list in this file: *"a hand-written
 * list of the places that do X is not a check — it goes stale silently the day
 * a second place does X."* R6 is the requirement ("every control is exposed")
 * and R3 is the complaint it answers (the current editor exposes a fraction of
 * the model). A typed list of controls would meet R6 on the day it was typed
 * and silently stop meeting it on the day the model moved, which is the exact
 * failure mode R3 names. So there is **no list of controls in this module.**
 * There is a derivation, and four rosters in two other modules.
 *
 * ## Where the membership comes from, and where its guard is
 *
 * | source | guarded by | contributes |
 * |---|---|---|
 * | `SCENE_KEYS` | `_NoSceneKeyMissing`/`Extra` (`types.ts`) | the scene's own scalars |
 * | `STEREO_KEYS` | `_NoStereoKeyMissing`/`Extra` | every stereo setting |
 * | `LAYER_KEYS` | ten pairs, one per variant | every key of every reachable variant |
 * | `PRESET_PARAMS` | `Record<PresetKind, …>` | every verb parameter descriptor |
 *
 * **The membership guard for this registry is upstream, and that is the
 * design, not a gap.** `layout.ts` and `panels.ts` each declare a union and a
 * tuple independently and tie them with an `AssertNever` pair, because
 * *"neither declaration is derived from the other, or the pair would be a
 * tautology"*. Here both halves *would* be derived from the same rosters, so
 * a pair over them would prove only that the derivation was run twice. The
 * twelve pairs listed above are the guard; re-stating them here would weaken
 * the registry by making it look guarded in a second, emptier way.
 *
 * What this module *does* declare independently, and what its own two
 * `AssertNever` pairs guard, is its **vocabulary**: {@link ControlUnit} and
 * {@link ControlShape} extend `ParamUnit` and `ParamShape` from
 * `src/core/anim/params.ts`, and the tuples beside them are written out. A
 * member added upstream is then a compile error here — not a unit this
 * registry can silently never name. That pair is not a tautology, because the
 * union's upstream half and the tuple are independent.
 *
 * ## Why `deriveControls` is a function over rosters
 *
 * Three things need it and none of them can be had from a constant. The
 * vacuity control (§6.5a) has to drive the same instrument to zero; the
 * prototype-chain control has to hand it a roster key called `constructor`;
 * and cluster D's criterion-18 proof has to show a roster key producing a
 * control **without this file being edited**. A constant computed at module
 * scope answers none of those without someone mutating a frozen roster.
 * {@link CONTROLS} is that function applied to {@link MODEL_ROSTERS}.
 *
 * ## `draw` is excluded, and the exclusion is the validator's
 *
 * Ruling R-q. `site/scene.ts:268` refuses `type: 'draw'` with an error citing
 * design §9.5, so a `draw` control would be a control for a scene the browser
 * will not load — and design §9.2's criterion ("every `CONTROLS` entry
 * resolves to exactly one mounted panel") would then be *false on a correct
 * editor*. {@link browserReachableLayerTypes} therefore **asks the validator**
 * rather than carrying the number four: the day `site/scene.ts` stops
 * refusing `draw`, the probe says so, `draw` collides with
 * {@link REFUSED_LAYER_VARIANTS}, and the partition test goes red.
 *
 * Note the asymmetry and do not "fix" it: E7 / ruling R-i settled that the
 * `AssertNever` guard count in `types.ts` is **five**, `draw` included —
 * *"`draw` is a `Layer` variant whether or not the browser reaches it."* A
 * guard arm and a control entry are different questions about the same
 * variant, and both answers stand.
 *
 * ## This registry is complete; visibility is layered over it
 *
 * Design §11: *"`CONTROLS` is complete; visibility is layered over it.
 * Revision 1 said simple mode would use 'a filtered `CONTROLS` set', which
 * contradicts §9's completeness requirement. The registry stays complete —
 * that is R6 — and per-mode visibility sets select from it."* Plan §7's P3
 * section: *"a filtered registry would fail criterion 6."* There is no
 * visibility field, no mode field and no filter here, and `controlspec.test.ts`
 * is what keeps it that way. C-2 declined the same field one registry up; this
 * is the one the temptation is actually about.
 *
 * ## Ids keep the model's spelling
 *
 * Multi-word ids in this cluster are kebab-case (R-y) — but that governs ids
 * somebody **coins**, like `depth-strip`. Every segment of a control id is
 * read from the model (`sepFar`, `freezeNoise`, `noiseScale`), and
 * transliterating it would break the only thing the id is for: it is a *path*
 * to the key it writes. The two coined segments in an id — the owner and,
 * for a layer, the variant — are single words, so the question does not arise.
 *
 * ## There is no barrel
 *
 * Same reason `panels.ts` records: *"a barrel is a second place a registry has
 * to be registered, which is exactly the cost design §11 budgets at one."*
 * Consumers import `./controlspec.js` directly, which also keeps this module
 * inside `site/query.test.ts`'s cone walk — that walk only sees
 * `./<lowercase>.js`.
 */
import { LAYER_KEYS, PARAM_UNITS, PRESET_PARAMS, SCENE_KEYS, STEREO_KEYS } from '../src/core/index.js'
import type { AssertNever, LayerKey, ParamDescriptor, ParamShape, ParamUnit } from '../src/core/index.js'
import type { Layer } from '../src/core/types.js'
import type { LayoutConfig } from './layout.js'
import { mountedPanels } from './layout.js'
import type { PanelId } from './panels.js'
import { validateScene } from './scene.js'

/** Every key `Scene` itself has. Local because `core/index.ts` publishes the roster, not the alias. */
type SceneKey = typeof SCENE_KEYS[number]
/** Every key `StereoOpts` has. Local for {@link SceneKey}'s reason. */
type StereoKey = typeof STEREO_KEYS[number]
/** One `Layer` variant's discriminant. */
type LayerType = Layer['type']

/**
 * Which part of the model a control writes into.
 *
 * Four, because the model has exactly four places an authorable value lives
 * and each one is reached by a different mechanism: `Scene`'s own flat
 * interface, `StereoOpts` behind `scene.stereo`, a `Layer` variant behind
 * `scene.layers[]`, and a verb's parameter behind a layer's `anim`. The owner
 * is the first segment of every control id, and it is also what decides which
 * panel the control lands in — see {@link OWNER_PANELS}.
 *
 * Declared as a union **and** as {@link CONTROL_OWNERS}, tied by the pair
 * below. Unlike the registry itself, neither of these is derived from the
 * other, so the pair is a real guard.
 */
export type ControlOwner = 'scene' | 'stereo' | 'layer' | 'preset'

/**
 * The owners, in the order the model nests them: the scene, its stereo
 * settings, its layers, and the verbs a layer's animation is written in.
 * This is the iteration order every consumer of the registry inherits.
 */
export const CONTROL_OWNERS = ['scene', 'stereo', 'layer', 'preset'] as const

type _NoOwnerMissing = AssertNever<Exclude<ControlOwner, typeof CONTROL_OWNERS[number]>>
type _NoOwnerExtra = AssertNever<Exclude<typeof CONTROL_OWNERS[number], ControlOwner>>

/**
 * How a control's value should be treated.
 *
 * **Extends `ParamUnit` rather than restating it**, because a quarter of this
 * registry is derived straight from `PRESET_PARAMS`, whose descriptors already
 * carry a `ParamUnit`. A parallel vocabulary would mean translating at the
 * boundary, and a translation table is one more place a unit can be lost —
 * which is the provenance failure `params.ts`'s own header was written to stop.
 *
 * `enum` is already in the upstream list and is not a physical quantity, which
 * is the precedent for the additions here: what a consumer needs is *"how do I
 * treat this value"*, and "it is one of a fixed set of names" answers that in
 * the same way "it is a distance in scene pixels" does.
 *
 * **`platePx` is the one addition that is a measurement rather than a kind.**
 * §2.7 names four pixel spaces — scene px, plate px, backing-store px
 * (× `noiseScale`), device px — and `render.ts:4` fixes which of them each
 * control lives in: `rasterDepth → blurDepth → padDepth → sirdsFromDepth →
 * upscale`. `depthBlur` acts before `padDepth`, so its radius is scene px;
 * `sepFar`/`sepNear` act inside `sirdsFromDepth`, after the pad and before the
 * upscale, so they are plate px. Backing-store px and device px get no member
 * because **no authorable key is measured in either** — backing-store px is
 * reached only by multiplying by `noiseScale` (a `multiplier` here), and
 * device px is the snap/dpr space the shell computes and nobody writes. Adding
 * a member for a space no control uses would be a vocabulary that lies about
 * what the model contains.
 *
 * `unrecorded` is **the sensor, not a unit.** The unit tables below are
 * deliberately partial, so a key added to a guarded roster still produces a
 * control — that is the whole point of deriving — and it carries this tag
 * until somebody records what the key measures. {@link unrecordedUnits} is
 * what makes that loud, per §9's *"a recorded note is not a sensor"*.
 */
export type ControlUnit =
  | ParamUnit
  | 'platePx'
  | 'framesPerSecond'
  | 'boolean'
  | 'text'
  | 'none'
  | 'unrecorded'

/**
 * The runtime witness for {@link ControlUnit}, written out rather than spread
 * from `PARAM_UNITS`.
 *
 * Writing it out is the point: the union's upstream half and this tuple are
 * independent, so a member added to `PARAM_UNITS` is a compile error here
 * (`_NoUnitMissing`) rather than a unit the registry can never name. A spread
 * would make the pair a tautology, exactly as `panels.ts` records for
 * `PANEL_IDS`.
 */
export const CONTROL_UNITS = [
  'scenePx',
  'platePx',
  'degrees',
  'depth',
  'seconds',
  'framesPerSecond',
  'multiplier',
  'enum',
  'boolean',
  'text',
  'none',
  'unrecorded',
] as const

type _NoUnitMissing = AssertNever<Exclude<ControlUnit, typeof CONTROL_UNITS[number]>>
type _NoUnitExtra = AssertNever<Exclude<typeof CONTROL_UNITS[number], ControlUnit>>

/**
 * A control's arity.
 *
 * **Extends `ParamShape`, which is already this repo's answer to "is an
 * `[x, y]` pair one control or two".** `PRESET_PARAMS` carries
 * `SCENE_PX_PAIR('from', [0, 0])` as *one* descriptor with `shape: 'pair'`, so
 * the eleven preset controls are already counted that way. Applying the same
 * rule to the model's two pair-valued keys — `scene.size` and `LayerBase.at` —
 * is what keeps three populations from being counted by three conventions.
 * (Survey §F-11 counts `scene.size` as two controls and `layer.at` as one;
 * those are the same shape and cannot both be right. See this task's report.)
 *
 * `structured` is the third member and names what neither of the others can:
 * `anim` is a `Track | Preset | (Track | Preset)[]` and `mask` is
 * `'alpha' | {luma: number}`. Both are real authorable keys, both must appear
 * for R6, and neither is a widget — a `structured` control is the registry
 * saying *"this key needs an instrument, not a field"*, which is design §9.3's
 * division ("generated widgets for the residue") recorded per control instead
 * of assumed.
 */
export type ControlShape = ParamShape | 'structured'

/** The runtime witness for {@link ControlShape}. Written out, for {@link CONTROL_UNITS}'s reason. */
export const CONTROL_SHAPES = ['scalar', 'pair', 'structured'] as const

type _NoShapeMissing = AssertNever<Exclude<ControlShape, typeof CONTROL_SHAPES[number]>>
type _NoShapeExtra = AssertNever<Exclude<typeof CONTROL_SHAPES[number], ControlShape>>

/** What {@link CONTROLS} records about one control. */
export interface ControlInfo {
  /**
   * The control's own id, so an entry carries its key when passed around
   * alone — the same reason `PanelInfo.panel` and `FitModeInfo.mode` repeat
   * theirs. Composed, never typed: `owner.key`, or `owner.scope.key` where the
   * owner has a scope.
   */
  readonly control: string
  /** Which part of the model this writes into. See {@link ControlOwner}. */
  readonly owner: ControlOwner
  /**
   * The layer variant or the preset kind, where the owner has one.
   *
   * `undefined` for `scene` and `stereo`, which are singletons: there is one
   * `Scene` and one `stereo` block, so there is nothing to disambiguate.
   */
  readonly scope?: string
  /** The model key this control writes — a `SceneKey`, a `StereoKey`, a `LayerKey`, or a parameter name. */
  readonly key: string
  /** What the value is. See {@link ControlUnit}, and §2.7 on naming the pixel space. */
  readonly unit: ControlUnit
  /** One value, an `[x, y]` pair, or something that needs an instrument. */
  readonly shape: ControlShape
  /**
   * Present when the value is a *rate* in `unit` per second.
   *
   * Carried down from `NumericParam.per` rather than recomputed. `params.ts`
   * refused a `scenePxPerSecond` tag on purpose, so that a consumer whose rule
   * is "scale every `scenePx` parameter" gets `move.speed` right for free;
   * dropping the tag in this derivation would reintroduce that fail-open bug
   * one level down.
   */
  readonly per?: 'second'
  /**
   * Which panel this control is mounted in.
   *
   * Design §9.2's regression is *"spec written, assigned to a panel no layout
   * slots"*, which presupposes the spec names a panel — so it does, and
   * {@link unmountedControls} is the reader that catches it.
   *
   * Derived per **owner** and not per control (see {@link OWNER_PANELS}),
   * because a panel per control would be a hand-written list of the places
   * that do X, in a registry that exists to not have one.
   */
  readonly panel: PanelId
}

/**
 * Which panel each owner's controls land in.
 *
 * All four are the inspector today, and that is a recorded decision rather
 * than a placeholder. Design §9.3: *"Canvas for value · timeline for timing ·
 * depth strip for depth · **generated widgets for the residue**. Generated
 * widgets are the floor that guarantees R6, not the intended primary surface;
 * any control that deserves a spatial instrument should get one and lose its
 * widget."* `PANELS.inspector` says the same from the other side — it is
 * *"where §9.3's generated widgets land … the floor that guarantees R6"*. So
 * the floor is where every control starts, and promoting one to the canvas,
 * the depth strip or the timeline is a per-control decision made when the
 * instrument is built, not a default a registry can guess.
 *
 * `Record<ControlOwner, PanelId>` is the tie in both directions: an owner
 * added without a panel does not compile, and a panel named here that
 * `panels.ts` does not register does not compile either.
 */
const OWNER_PANELS: Record<ControlOwner, PanelId> = {
  scene: 'inspector',
  stereo: 'inspector',
  layer: 'inspector',
  preset: 'inspector',
}

/** What a unit table records about one model key. */
interface KeySpec {
  /** What the value is. See {@link ControlUnit}. */
  readonly unit: ControlUnit
  /** Defaults to `scalar`, which is what all but four model keys are. */
  readonly shape?: ControlShape
  /** Why this unit and not a neighbouring one — §2.3, and §9.1's provenance trap. */
  readonly note: string
}

/**
 * What each of `Scene`'s own keys measures.
 *
 * **Partial on purpose.** A total `Record<SceneKey, …>` would make a seventh
 * scene key a compile error here, which sounds stricter and is in fact the
 * opposite of what this registry is for: the control must appear anyway — that
 * is what "derived" means, and it is what cluster D's criterion-18 proof shows
 * — and {@link unrecordedUnits} is what then names the missing unit out loud.
 * Partiality still bounds the keys, so a typo is a compile error.
 */
const SCENE_SPECS: Partial<Record<SceneKey, KeySpec>> = {
  size: {
    unit: 'scenePx',
    shape: 'pair',
    note: 'The stage, which *defines* the scene-pixel space — `raster.ts:119`: "the depth map ' +
      'stays stage-sized; scene.size *is* the stage". One control with an arity, not two.',
  },
  fps: {
    unit: 'framesPerSecond',
    note: 'A rate, and deliberately not tagged `multiplier`: it is the sampling cadence of the ' +
      'animation, so halving it halves the frames rendered and changes nothing geometric.',
  },
  duration: {
    unit: 'seconds',
    note: 'Seconds, the same unit as `Track.start`/`duration` — and design §9.1 names the ' +
      'collision this tag exists to stop: `shape.start`/`end` are degrees.',
  },
  freezeNoise: {
    unit: 'boolean',
    note: 'Reuse one noise seed for every frame. Named for the opt-in; default false.',
  },
}

/**
 * Which scene keys are containers whose members are registered under another
 * owner, rather than controls in their own right.
 *
 * **This is not a filter.** Design §11's completeness rule forbids selecting a
 * subset of controls; this says something different and structural — that
 * `scene.stereo` is not a value anyone authors, it is the seven values under
 * it, and registering both would count every stereo setting twice. The test
 * over this table does not take that on trust: for each container it asserts
 * the named owner actually registered members, so a key dropped here with
 * nothing to show for it goes red.
 */
const SCENE_CONTAINERS: Partial<Record<SceneKey, ControlOwner>> = {
  stereo: 'stereo',
  layers: 'layer',
}

/**
 * What each stereo setting measures.
 *
 * **The two pixel spaces here are different, and §2.7 is why that matters.**
 * `render.ts:4` fixes the order: `rasterDepth → blurDepth → padDepth →
 * sirdsFromDepth → upscale`. `depthBlur` runs before the pad, on a
 * stage-sized depth map, so its radius is **scene px**. `sepFar`/`sepNear`
 * are consumed inside `sirdsFromDepth`, after the pad and before the upscale,
 * so they are **plate px** — which is also why the fusion budget is quoted as
 * a plate measurement. A single `px` tag would let a consumer that rescales
 * one rescale the other.
 */
const STEREO_SPECS: Partial<Record<StereoKey, KeySpec>> = {
  sepFar: {
    unit: 'platePx',
    note: 'Repeat period of the background, on the plate. The gap to `sepNear` is the entire ' +
      'depth budget (18px by default), so this is a perceptual decision, not a tuning knob.',
  },
  sepNear: {
    unit: 'platePx',
    note: 'Repeat period of the nearest surface, on the plate. Must be < `sepFar`; `resolveStereo` ' +
      'enforces it, so the control must not re-implement the bound.',
  },
  noiseScale: {
    unit: 'multiplier',
    note: 'Nearest-neighbour replication from plate px to backing-store px — the factor *between* ' +
      'two of §2.7\'s four spaces, which is why it is a multiplier and not a pixel count. ' +
      'A positive integer; `render.ts:106` rejects anything else.',
  },
  depthBlur: {
    unit: 'scenePx',
    note: 'Gaussian radius applied to the depth map before padding, so it is measured in scene px ' +
      'and not on the plate. Default 0 — the echo it was meant to suppress is below threshold ' +
      'at an 18px budget and the blur reads as a mesa.',
  },
  cross: { unit: 'boolean', note: 'Invert depth for cross-eyed viewers.' },
  seed: {
    unit: 'none',
    note: 'An opaque integer handed to the RNG. Deliberately `none` and not `multiplier`: it is ' +
      'not a quantity, nothing about it is ordered, and a slider would be the wrong instrument.',
  },
  algorithm: {
    unit: 'enum',
    note: 'One of `SIRDS_ALGORITHMS` (`shift` | `linked`). In the guarded roster since the ' +
      'encoder split and with no control in the current editor — survey §I-1 names it as the ' +
      'one countable R6 gap this registry closes with no design input at all.',
  },
}

/**
 * What each layer key measures, across every variant that admits it.
 *
 * **Flat over `LayerKey`, and the risk in that is worth stating.** Design
 * §9.1 item 2 is that distributing over the union *"collapses provenance"*,
 * and a flat table is exactly where a collapse would land: two variants
 * reusing one key name for two quantities would silently share one unit.
 * Today none do — `src`/`mode`/`mask` are shared by `image` and `gif` and mean
 * the same thing in both, and the five base keys mean the same thing in all
 * four — but nothing here *proves* that, and a per-variant table would be
 * forty-one entries that go stale one variant at a time. The trade is
 * recorded rather than hidden; see this task's report.
 *
 * **`fn` is deliberately absent**, and its absence is a second tie to the
 * validator. It belongs to `draw` alone, which `site/scene.ts:268` refuses, so
 * no control is derived for it today. The day that refusal lifts,
 * `layer.draw.fn` appears carrying `unrecorded` and {@link unrecordedUnits}
 * names it — which is better than a unit recorded now for a control nobody can
 * reach, because that would go stale unobserved.
 */
const LAYER_SPECS: Partial<Record<LayerKey, KeySpec>> = {
  type: {
    unit: 'enum',
    note: 'The discriminant. A *control* because R6 is about every authorable key and this one is ' +
      'in every scene file; creating a layer by choosing one is a different mechanism — design ' +
      '§5.6 assigns it to `OPERATIONS`, because "the author must choose a variant before any ' +
      'control applies".',
  },
  id: {
    unit: 'none',
    note: 'Stable identity (design §4.1), assigned on first mutation and never minted by a ' +
      'validator. Not a quantity and not free text a human composes.',
  },
  name: {
    unit: 'text',
    note: 'Display name. Absent means "never renamed" — `layerName()` derives one from the ' +
      'content, so the panel never lists "Layer 1 / Layer 2".',
  },
  depth: {
    unit: 'depth',
    note: '0 = background, 1 = nearest. Normalised, so it does not scale with the frame — the ' +
      'same reason `PRESET_PARAMS` gives `push` a `depth` tag rather than a pixel one.',
  },
  at: {
    unit: 'scenePx',
    shape: 'pair',
    note: 'Position on the stage, in scene px. A pair, exactly as `scene.size` is and as ' +
      '`PRESET_PARAMS`\' `SCENE_PX_PAIR` descriptors are.',
  },
  anim: {
    unit: 'none',
    shape: 'structured',
    note: 'A `Track | Preset | (Track | Preset)[]`. `structured` because design §9.3 gives timing ' +
      'to the timeline rather than to a generated widget; the verb parameters underneath it are ' +
      'registered separately, under the `preset` owner.',
  },
  text: { unit: 'text', note: 'The string a text layer draws.' },
  size: {
    unit: 'scenePx',
    note: 'Type size in scene px — `raster.ts:242` writes it straight into the font shorthand as ' +
      '`${size}px` on the stage-sized canvas. Not to be confused with `scene.size`, which is the ' +
      'stage itself; the two share a word and are in the same space for different reasons.',
  },
  font: {
    unit: 'text',
    note: 'A CSS font family. Free text and not an enum: the resolvable set differs between the ' +
      'browser and `@napi-rs/canvas`, which is how `sans-serif` resolved to dingbats for a day.',
  },
  weight: { unit: 'text', note: 'A CSS font weight, as written into the font shorthand.' },
  src: {
    unit: 'text',
    note: 'A URL or data URI. Text and not an enum — on this side the hash *is* the scene, so a ' +
      'src is frequently an inlined asset rather than a path.',
  },
  mode: {
    unit: 'enum',
    note: 'One of `silhouette` | `heightmap`. `heightmap` is the mode that already ships the ' +
      'cardboarding cure design §10.5 wanted, which is why it is authorable per layer.',
  },
  mask: {
    unit: 'none',
    shape: 'structured',
    note: '`\'alpha\'` or `{luma: t}` — a token or a thresholded object, so neither a scalar nor an ' +
      'enum. Opaque artwork (a logo on white) needs the luma form, which is why the token alone ' +
      'is not enough.',
  },
  loop: { unit: 'enum', note: 'One of `loop` | `once` | `pingpong`, for a GIF\'s own playback.' },
  shape: { unit: 'enum', note: 'One of `circle` | `rect`, and it decides which of r / w,h applies.' },
  r: { unit: 'scenePx', note: 'Circle radius, in scene px.' },
  w: { unit: 'scenePx', note: 'Rect width, in scene px.' },
  h: { unit: 'scenePx', note: 'Rect height, in scene px.' },
  start: {
    unit: 'degrees',
    note: 'Wedge bound, **degrees** clockwise from 3 o\'clock — design §9.1 item 2 names this exact ' +
      'collision: `Track.start` is *seconds* and `Transform.rotate` is *radians*. Three ' +
      'quantities wearing two words, and this tag is the only thing keeping them apart.',
  },
  end: {
    unit: 'degrees',
    note: 'The other wedge bound, degrees. Both or neither — core throws on one alone.',
  },
}

/**
 * One minimal layer per variant, for {@link browserReachableLayerTypes}'s probe.
 *
 * **Total over `Layer['type']` by annotation**, which is the right blast
 * radius: a sixth variant is a compile error here, and the only honest fix is
 * to say whether the browser can load one. It is not a list of controls and
 * not a list of reachable types — it is one specimen each, and what is
 * reachable is whatever the validator does with them.
 *
 * Each is the smallest object that gets *past* the per-variant required-field
 * checks in `validateLayer`, so a refusal is a refusal of the **variant** and
 * not of an incomplete specimen. Values are arbitrary; nothing reads them.
 */
const LAYER_PROBES: Record<LayerType, Readonly<Record<string, unknown>>> = {
  text: { type: 'text', text: 'probe' },
  image: { type: 'image', src: 'probe.png' },
  gif: { type: 'gif', src: 'probe.gif' },
  shape: { type: 'shape', shape: 'circle', r: 1 },
  draw: { type: 'draw', fn: 'probe' },
}

/**
 * The layer variants the browser will actually load, asked of the validator.
 *
 * **Ruling R-q, and the reason this is a probe rather than a constant.** The
 * brief's instruction was *"the exclusion must be tied to the validator's
 * refusal, not hardcoded"*, and a tie is only a tie if breaking it is visible:
 * writing `['text', 'image', 'gif', 'shape']` here would be four correct names
 * today and a silent lie the day `site/scene.ts` changes its mind in either
 * direction. Asking `validateScene` costs five calls at module load and cannot
 * drift, because it *is* the thing that decides.
 *
 * A variant counts as reachable when a minimal specimen of it survives
 * validation whole. That is deliberately stronger than "the type name is in
 * `LAYER_TYPES`": `LAYER_TYPES` is module-private to `site/scene.ts` and a
 * variant could be listed there and still refused by a later check, in which
 * case an editor offering its controls would be offering controls for a scene
 * that will not load.
 */
export function browserReachableLayerTypes(): readonly LayerType[] {
  const reachable: LayerType[] = []
  for (const variant of Object.keys(LAYER_PROBES) as LayerType[]) {
    try {
      validateScene({ size: [2, 2], layers: [LAYER_PROBES[variant]] })
      reachable.push(variant)
    } catch {
      // A refusal, not a bug: which refusals are expected is
      // `REFUSED_LAYER_VARIANTS`'s claim, and the partition between the two
      // tables is what `controlspec.test.ts` asserts.
    }
  }
  return reachable
}

/** What {@link REFUSED_LAYER_VARIANTS} records about a variant with no controls. */
export interface RefusedLayerVariant {
  /** The variant. Mirrors the key, as {@link ControlInfo.control} does. */
  readonly variant: string
  /** Why it has no controls, in prose a human can be shown. */
  readonly reason: string
}

/**
 * Layer variants that exist in the model and get no controls.
 *
 * A registry records decisions by listing, and an absence is the one thing a
 * list cannot record — §9's last trap is *"a recorded note is not a sensor"*.
 * Same mechanism as `layout.ts`'s `REFUSED_PLACEMENTS` and `panels.ts`'s
 * `REFUSED_PANELS`, and here it carries more weight than either: this table is
 * one half of a **partition** with {@link browserReachableLayerTypes}, so it
 * is checked against the validator on every run rather than merely read.
 *
 * Keyed by `string` rather than by `LayerType` for `REFUSED_PANELS`' reason:
 * the whole point is to answer for names, including names that are not
 * variants.
 */
export const REFUSED_LAYER_VARIANTS: Record<string, RefusedLayerVariant> = {
  draw: {
    variant: 'draw',
    reason:
      'Ruling R-q. `site/scene.ts:268` refuses `type: "draw"` in the browser with an error that ' +
      'says why: it names a module path, and resolving one inside a static bundle is not ' +
      'possible — there is no filesystem and no bundler entry for it. Design §9.5 records the ' +
      'loader seam as an open question rather than a missing loader. A mounted `draw` control ' +
      'would therefore be a control for a scene the browser will not load, and design §9.2\'s ' +
      'criterion ("every CONTROLS entry resolves to exactly one mounted panel") would be false ' +
      'on a *correct* editor. Note the asymmetry and do not "fix" it: `types.ts` guards five ' +
      'variants, `draw` included (E7 / R-i, "draw is a Layer variant whether or not the browser ' +
      'reaches it"). A guard arm and a control entry are different questions. The CLI still ' +
      'handles `draw` — `src/cli/scene.ts:356`, `src/core/raster.ts:386` — so this is a ' +
      'statement about the browser, not about the model.',
  },
}

/**
 * Why this variant has no controls, if it is one we have refused.
 *
 * `Object.hasOwn` and not a bare index: `REFUSED_LAYER_VARIANTS['constructor']`
 * is the `Object` **function**, which is truthy, so an unguarded caller shows
 * a refusal whose variant and reason are both `undefined` — well-formed prose
 * that explains nothing, which is worse than a visible wrong answer. E8 / R-l,
 * and the same fix P0b used in five registries.
 */
export function refusedLayerVariant(variant: string): RefusedLayerVariant | undefined {
  if (!Object.hasOwn(REFUSED_LAYER_VARIANTS, variant)) return undefined
  return REFUSED_LAYER_VARIANTS[variant]
}

/**
 * The four rosters a derivation runs over, plus what the browser can reach.
 *
 * Typed loosely — `readonly string[]`, not `readonly SceneKey[]` — and that is
 * the point rather than a shortcut. The guarded rosters are the *input* this
 * is applied to; the parameter has to admit a roster that is deliberately
 * wrong, or neither the vacuity control (§6.5a) nor the prototype-chain
 * control can be written at all, and cluster D's criterion-18 proof has
 * nothing to plant into.
 */
export interface ControlRosters {
  /** `Scene`'s own keys. */
  readonly scene: readonly string[]
  /** `StereoOpts`' keys. */
  readonly stereo: readonly string[]
  /** Each layer variant's keys, keyed by variant. */
  readonly layer: Readonly<Record<string, readonly string[]>>
  /** Each verb's parameter descriptors, keyed by kind. */
  readonly preset: Readonly<Record<string, readonly ParamDescriptor[]>>
  /** Which layer variants to derive controls for. See {@link browserReachableLayerTypes}. */
  readonly reachable: readonly string[]
  /** Scene keys that expand into another owner instead of being their own control. */
  readonly containers?: Readonly<Record<string, ControlOwner>>
}

/**
 * The real rosters: three guarded lists, one registry-keyed table, and the
 * validator's own answer about what the browser will load.
 *
 * Exported because every control in this phase's tests needs to name the
 * population it is quantifying over, and because cluster D's proof needs
 * something to spread.
 */
export const MODEL_ROSTERS = {
  scene: SCENE_KEYS,
  stereo: STEREO_KEYS,
  layer: LAYER_KEYS,
  preset: PRESET_PARAMS,
  reachable: browserReachableLayerTypes(),
  containers: SCENE_CONTAINERS,
} as const satisfies ControlRosters

/** The tag a key with no recorded unit carries. See {@link ControlUnit}. */
const UNRECORDED: KeySpec = {
  unit: 'unrecorded',
  note: 'No unit has been recorded for this key.',
}

/**
 * The spec for one model key, or the `unrecorded` placeholder.
 *
 * **`Object.hasOwn`, and this is the live reading of E8 in this module.** The
 * tables are plain object literals keyed by model key, so an unguarded
 * `table[key]` answers with the `Object` function for a roster key called
 * `constructor` — and the derived control would then carry `undefined` as its
 * unit and its shape, sailing past {@link unrecordedUnits}, which looks for a
 * word rather than for a falsy value. A control silently typed `undefined` is
 * exactly the failure `chromedom.ts:189` shipped: *"unstyled, and
 * unclickable."*
 */
function specFor(table: Readonly<Record<string, KeySpec | undefined>>, key: string): KeySpec {
  if (!Object.hasOwn(table, key)) return UNRECORDED
  return table[key] ?? UNRECORDED
}

/** One control, assembled from an owner, an optional scope, a key and its spec. */
function control(
  owner: ControlOwner,
  scope: string | undefined,
  key: string,
  spec: KeySpec,
): ControlInfo {
  return {
    control: scope === undefined ? `${owner}.${key}` : `${owner}.${scope}.${key}`,
    owner,
    ...(scope === undefined ? {} : { scope }),
    key,
    unit: spec.unit,
    shape: spec.shape ?? 'scalar',
    panel: OWNER_PANELS[owner],
  }
}

/**
 * Turn one parameter descriptor into a control.
 *
 * Discriminated on `unit` for `ParamDescriptor`'s own reason: `values` is
 * reachable only on an enum and `shape`/`per` only on a numeric one, so a flat
 * read would compile with an enum that lists nothing.
 */
function presetControl(kind: string, d: ParamDescriptor): ControlInfo {
  const base = {
    control: `preset.${kind}.${d.name}`,
    owner: 'preset' as const,
    scope: kind,
    key: d.name,
    panel: OWNER_PANELS.preset,
  }
  if (d.unit === 'enum') return { ...base, unit: 'enum', shape: 'scalar' }
  return { ...base, unit: d.unit, shape: d.shape, ...(d.per === undefined ? {} : { per: d.per }) }
}

/**
 * Every control these rosters describe, in model order.
 *
 * **An array and not a `Record`, and the difference is a defect this phase has
 * now had to close five times.** A `Record` cannot report a collision: two
 * sources deriving the same id do not produce a duplicate, the second
 * overwrites the first, and the registry is quietly one control short with
 * nothing left to inspect. {@link CONTROLS} is built from this list and
 * {@link duplicateControlIds} compares the two.
 *
 * Order is the model's own nesting — scene, stereo, each reachable layer
 * variant, each verb — which is the iteration order every consumer inherits,
 * and is worth being the one a reader of the scene format would expect rather
 * than alphabetical.
 */
export function deriveControls(rosters: ControlRosters): readonly ControlInfo[] {
  const out: ControlInfo[] = []
  const containers = rosters.containers ?? {}

  for (const key of rosters.scene) {
    // A container is not its own control: its members are registered under the
    // owner it names. See `SCENE_CONTAINERS` for why that is not a filter.
    if (Object.hasOwn(containers, key)) continue
    out.push(control('scene', undefined, key, specFor(SCENE_SPECS, key)))
  }

  for (const key of rosters.stereo) {
    out.push(control('stereo', undefined, key, specFor(STEREO_SPECS, key)))
  }

  for (const variant of rosters.reachable) {
    if (!Object.hasOwn(rosters.layer, variant)) continue
    for (const key of rosters.layer[variant] ?? []) {
      out.push(control('layer', variant, key, specFor(LAYER_SPECS, key)))
    }
  }

  for (const kind of Object.keys(rosters.preset)) {
    for (const d of rosters.preset[kind] ?? []) {
      out.push(presetControl(kind, d))
    }
  }

  return out
}

/** Every control the editor exposes, derived. See this file's header. */
export const CONTROL_SPECS: readonly ControlInfo[] = deriveControls(MODEL_ROSTERS)

/**
 * The control ids, in derivation order.
 *
 * Deliberately *not* deduplicated: this is the list {@link duplicateControlIds}
 * reads, and a reader that silently dropped a repeat would be the hole rather
 * than the sensor.
 */
export const CONTROL_IDS: readonly string[] = CONTROL_SPECS.map(spec => spec.control)

/**
 * Every control, keyed by id.
 *
 * A record for the reason `PANELS`, `SLOT_INFO` and `FIT_MODES` are records:
 * §11 budgets a registry at one registration to move, and that is only true of
 * a lookup keyed by name. Built with a null prototype so that the hole E8
 * names cannot be reached through this value at all — the `Object.hasOwn`
 * guard in {@link controlInfo} is still there, because a caller holding this
 * object is not required to use the reader.
 */
export const CONTROLS: Readonly<Record<string, ControlInfo>> = indexControls(CONTROL_SPECS)

/**
 * Index a derivation by control id, the way {@link CONTROLS} is indexed.
 *
 * **A function and not an inline `reduce`, for the reason {@link deriveControls}
 * is a function and not a module-scope loop.** Design §11 row 3 budgets a
 * scalar control at *"one declaration"*, and §11's own sentence is that each
 * registry gets a test which *"registers a dummy entry and asserts it
 * appears"*. A declaration reaches this registry through `deriveControls`'
 * rosters — there is nothing in this module to add an entry to — so without an
 * indexer a caller holding a grown derivation can reach the control *array*
 * and can never reach the *registry*. The registration would then be provable
 * only of the half of this module nobody looks a control up in.
 *
 * `Object.create(null)` and not `{}`: on a `{}` accumulator the assignment
 * `all['__proto__'] = spec` sets the prototype instead of creating a property,
 * so the entry vanishes with no wrong value to notice — only an absence, for
 * the one id whose absence is hardest to see. `Object.freeze` because a
 * registry a consumer can write to is not a registry.
 */
export function indexControls(
  specs: readonly ControlInfo[],
): Readonly<Record<string, ControlInfo>> {
  return Object.freeze(
    specs.reduce<Record<string, ControlInfo>>((all, spec) => {
      all[spec.control] = spec
      return all
    }, Object.create(null) as Record<string, ControlInfo>),
  )
}

/**
 * What this control is, or `undefined` if there is no such control.
 *
 * `control` is a `string` and not a narrowed id on purpose: the ids are
 * derived, so there is no literal union to narrow to, and every caller is by
 * construction holding a name that came from somewhere — a stored preference,
 * a `data-` attribute, a URL.
 *
 * `Object.hasOwn` even though {@link CONTROLS} has a null prototype: the
 * prototype is defence in depth, and the day somebody rebuilds this record
 * with an object literal — which is what every other registry in this cluster
 * uses — the guard is what stops `controlInfo('constructor')` handing back the
 * `Object` function typed as a `ControlInfo`. E8 / R-l.
 *
 * **`table` defaults to `CONTROLS`, and the day it is passed is the day the
 * guard above stops being defence in depth.** A caller-supplied table is an
 * ordinary object with `Object.prototype` behind it, so `Object.hasOwn` is
 * load-bearing on that path rather than belt-and-braces. C-8 made the general
 * argument in `keybindings.ts`'s `KeyBindingTable` docblock — *"a registration
 * test must be able to register an entry without editing this file"* — and it
 * binds harder here than there: this registry is derived, so the only entry a
 * test can register is one `deriveControls` produced, and until this parameter
 * existed no reader could be shown it.
 */
export function controlInfo(
  control: string,
  table: Readonly<Record<string, ControlInfo>> = CONTROLS,
): ControlInfo | undefined {
  if (!Object.hasOwn(table, control)) return undefined
  return table[control]
}

/**
 * The control ids derived more than once, sorted and deduplicated.
 *
 * The fifth instance in this phase of a hole that is the same shape every
 * time — `SCENE_KEYS` at `05aeb26`, `LAYER_KEYS` at `22572ea`, `SLOTS` at
 * `4a75928`, `PANEL_IDS` at `7dedb7d` — and the worst of the five, because
 * here the collapse is *into a `Record`*: there is no duplicate left to find
 * afterwards, only a registry that is short. Two sources reaching the same id
 * is not hypothetical, either: `size` is a key of both `Scene` and the `text`
 * variant, and it is only the owner segment of the id that keeps them apart.
 *
 * `ids` defaults to {@link CONTROL_IDS}. See {@link indexControls} for why the
 * registry's readers take their population: a control declared in a roster is
 * unobservable here otherwise, and "the registry rejects a collision" would be
 * provable only of the collisions that already shipped.
 */
export function duplicateControlIds(ids: readonly string[] = CONTROL_IDS): readonly string[] {
  const seen = new Set<string>()
  const twice = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) twice.add(id)
    seen.add(id)
  }
  return [...twice].sort()
}

/**
 * The controls carrying no recorded unit, sorted.
 *
 * §2.7 says to name the pixel space wherever a count appears, and §9's last
 * trap says a recorded note is not a sensor. This is the sensor: the unit
 * tables are partial, so a key added to a guarded roster *does* produce a
 * control — the registry is derived, which is the whole point — and this names
 * it until somebody records what it measures. The alternative, a total
 * `Record` per roster, would make the new key a compile error here and stop
 * the control from appearing at all, which would defeat the derivation to
 * enforce a comment.
 *
 * `specs` defaults to {@link CONTROL_SPECS}. The parameter is what lets the
 * sentence above be *tested* rather than asserted: a key added to a roster is
 * a control this reader must name, and before the parameter existed the only
 * roster it could be asked about was the one that shipped.
 */
export function unrecordedUnits(
  specs: readonly ControlInfo[] = CONTROL_SPECS,
): readonly string[] {
  return specs.filter(spec => spec.unit === 'unrecorded')
    .map(spec => spec.control)
    .sort()
}

/**
 * The controls this layout gives nowhere to live, sorted and deduplicated.
 *
 * Design §9.2, verbatim: *"Type-level exhaustiveness proves a declaration
 * exists, not that a user can reach it … the realistic regression is 'spec
 * written, assigned to a panel no layout slots.'"* This is that regression as
 * a reader, and it is total: it holds for every layout, including one
 * assembled at run time from a stored preference, which is the case no
 * `AssertNever` reaches. `panels.ts`'s `PanelLayout` is the compile-time door
 * for a layout written by hand.
 *
 * Returns ids rather than throwing, for `unregisteredPanels`' reason: the
 * caller holding the layout is the one that has to decide what to do about it.
 *
 * `specs` defaults to {@link CONTROL_SPECS}, so both of this reader's inputs
 * are now parameters. That is deliberate and is not symmetry for its own sake:
 * a reachability answer is a statement about a *pair*, and with only the
 * layout movable the control half of every such claim was fixed at whatever
 * shipped. §1.2k applies to the outcome — a control the layout strands is
 * cosmetic until somebody looks for it, so this reports rather than throws.
 */
export function unmountedControls<P extends string>(
  layout: LayoutConfig<P>,
  specs: readonly ControlInfo[] = CONTROL_SPECS,
): readonly string[] {
  const mounted = new Set<string>(mountedPanels(layout))
  const stranded = new Set<string>()
  for (const spec of specs) {
    if (!mounted.has(spec.panel)) stranded.add(spec.control)
  }
  return [...stranded].sort()
}
