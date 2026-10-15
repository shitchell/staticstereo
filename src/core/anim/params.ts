/**
 * Machine-readable parameter descriptors for the preset registry (design §4.2,
 * execution plan §6a).
 *
 * **This is not documentation; it gates real behaviour.** P2's `fit=render`
 * re-renders a scene at a container's size and has to know which animator
 * parameters are measured in scene pixels so it can scale them. The only other
 * way to know is to pattern-match on kind names, and that check **fails open
 * under a rename**: after `slide` became `move`, a scene full of `move` would
 * match nothing, the check would conclude "no px parameters here" and the
 * scene would be silently mis-scaled. A table keyed by the registry cannot
 * fail that way, because a kind with no entry does not compile.
 *
 * The moment to record a parameter's unit is while writing the function that
 * consumes it. Deferring it means reverse-engineering units from
 * implementations later, which is exactly the provenance loss that already
 * bit this codebase twice: `shape.start`/`end` are degrees while
 * `Transform.rotate` is radians, and `Track.start`/`duration` are seconds —
 * three different quantities wearing two words.
 */
import { CUBIC_BEZIER_SYNTAX } from './easing.js'
import { offStageTokens } from './presets.js'
import type { AssertNever, NamedEasing } from '../types.js'
import type { PresetCtx, PresetKind } from './presets.js'

/**
 * The unit vocabulary. Closed on purpose: a consumer switches over it, and an
 * open string would let a new verb invent `px` or `deg` and quietly fall out
 * of every rule written against the list.
 *
 * `enum` is in here alongside the physical units because what a consumer needs
 * from a descriptor is "how do I treat this value", and "it is one of a fixed
 * set of names" is an answer to that question in the same way "it is a
 * distance in scene pixels" is.
 *
 * `seconds` has no entry in `PRESET_PARAMS` below and that is correct, not an
 * omission: the only seconds-valued parameters are `start` and `duration`,
 * which `overrides()` applies to *every* preset uniformly. Repeating them in
 * every verb's table would say nothing a consumer could not get from the fact
 * that they are universal, and would rot the moment a newly registered verb
 * forgot them.
 * The tag exists so that whoever does surface them has the word already fixed.
 *
 * **There are four universal parameters, not two, and the other two have no
 * tag at all.** `overrides()` (`presets.ts`) applies `start`, `duration`,
 * `ease` and `repeat` to every preset alike; `PRESET_PARAMS` describes none of
 * them. `start`/`duration` at least have `seconds` waiting above. `ease` and
 * `repeat` do not, because neither is a physical quantity: `repeat` is one of
 * `once`/`loop`/`pingpong` and `ease` is an easing, and both are validated by
 * `overrides()` against their own lists rather than by anything here.
 *
 * Saying so is the point. A consumer driving UI from this table renders no
 * ease control and no repeat control, and — unlike a missing verb, which does
 * not compile — finds nothing in the table to say whether that is a decision
 * or a hole. That is precisely the provenance loss §6a exists to prevent, one
 * field over: it is cheap to record now and a guess later. Whoever surfaces
 * them should read `overrides()`, which is the single place all four are
 * applied, and should extend the vocabulary above rather than inventing tags
 * at the call site.
 *
 * **They are surfaced now, in {@link UNIVERSAL_PARAMS} at the foot of this
 * file, and the two paragraphs above stand unchanged except for their last
 * clause.** `PRESET_PARAMS` still describes none of them and still should
 * not: a sibling table is what "they are universal" means, and a pseudo-key
 * here would redden the registry tie `params.test.ts` holds over this one.
 * What is no longer true is only that a consumer finds nothing — it finds the
 * sibling.
 *
 * The reason given above for `ease` and `repeat` having no tag — that neither
 * is a physical quantity — turned out not to be a reason this vocabulary
 * cannot hold them, because `enum` was already here for exactly that and
 * `rotate.axis` and `flip.axis` are already described by it. What did need
 * extending was narrower and is recorded where it happened: `ease`'s accepted
 * values are not a closed list (`EnumParam.open`), and `start`/`duration` are
 * substituted a stage later than any existing default case could say
 * (`EvalDefault`, `RemainderDefault`).
 */
export const PARAM_UNITS = [
  'scenePx',
  'degrees',
  'depth',
  'seconds',
  'multiplier',
  'enum',
] as const
export type ParamUnit = typeof PARAM_UNITS[number]

/**
 * Scalar, `[x, y]` pair, or a pair whose slots each take a number **or** a
 * name. P2 must be able to tell `move.from` (a pair of scene-pixel offsets,
 * both of which scale) from `move.speed` (one scalar) without inspecting a
 * scene that happens to use them, so the arity is part of the descriptor
 * rather than something discovered at the value.
 *
 * ## `endpoint-pair`, and why the union it describes is in the shape
 *
 * Design §4.2 gives `move`'s `from`/`to` a symbolic off-stage endpoint *as
 * well as* a number, **per slot**: `['offRight', 0]` is as valid as
 * `[320, 0]`, and `endpointPair` below is the reader the member is named
 * after. With only `scalar` and `pair` to say it in, a descriptor could record
 * that the value is two numbers and nothing could record that either of them
 * may be a name — so a consumer generating a control offered two spinners and
 * no way to write `offRight`, which is the whole of what an author needs to
 * write the scroll `README.md` opens with.
 *
 * **It says which slots take a name. It does not say whether the value is a
 * length, and must not be read as if it did.** Scalability stays on the
 * `unit`, where `move.speed` is `scenePx` + `per: 'second'` on purpose so that
 * a consumer whose rule is "scale every `scenePx` parameter" catches a rate
 * for free (see {@link NumericParam.per}). `speed` takes no token and never
 * will; a rule re-keyed from the unit onto this shape would drop it silently,
 * which is the same fail-open defect one level down from the one the member
 * was added to fix. The two facts are orthogonal and are recorded in two
 * fields precisely so that neither can be mistaken for the other.
 *
 * The names a slot accepts are data, not type, so they travel beside the shape
 * in {@link NumericParam.tokens} rather than being something a consumer is
 * expected to know.
 */
export type ParamShape = 'scalar' | 'pair' | 'endpoint-pair'

/**
 * Where a parameter's default comes from, tagged so a consumer switches over
 * it exhaustively instead of sniffing the value's JavaScript type.
 *
 * **A default is recorded here for the same reason a unit is: the moment to
 * write it down is while writing the function that consumes it.** Without it
 * a phase building controls cannot give a control its initial value, so it
 * reads the numbers back out of the `PresetFn` bodies — the reverse-
 * engineering this whole table exists to stop.
 *
 * The cases split across one line and the split is the content.
 * `value`, `ctx` and `none` are what the **compiler** does, and they are the
 * only ones a `PRESET_PARAMS` descriptor may use — `params.test.ts` pins that
 * list, so a verb parameter reaching for either of the others is a failure
 * that names itself. `eval` and `remainder` are what the **evaluator** does,
 * and they exist because the parameters every verb honours straddle that
 * line:
 *
 * - `value` — a literal the preset substitutes when the parameter is absent.
 * - `ctx` — a value taken from the compile context, named by key. `push.to`
 *   defaults to `ctx.layerDepth`, and "defaults to wherever this layer sits"
 *   is a different fact from "defaults to 0.5". Faking a number here would
 *   make a control initialise to the wrong depth for every layer but one;
 *   omitting the field would say neither thing. `keyof PresetCtx` ties the
 *   key to the context type, so renaming the field is a compile error rather
 *   than a silent `undefined`.
 * - `none` — omitting the parameter is not equivalent to passing *any* value.
 *   `move.speed` is the only one: absent, no duration is derived at all; the
 *   `60` in its `num()` call is an unreachable fallback, not a default.
 *   Recording `60` would be a lie, and `params.test.ts` catches it by
 *   compiling the preset both ways.
 * - `eval` — a literal, but one the *evaluator* substitutes; the compiled
 *   track does not carry it. See {@link EvalDefault}.
 * - `remainder` — the rest of the scene, which no literal expresses. See
 *   {@link RemainderDefault}.
 */
export interface ValueDefault<V> {
  readonly from: 'value'
  readonly value: V
}

/** A default read from the compile context — see `ParamDefault`'s `ctx` case. */
export interface CtxDefault {
  readonly from: 'ctx'
  readonly key: keyof PresetCtx
}

/** No default: absence selects different behaviour, not a value. */
export interface NoDefault {
  readonly from: 'none'
}

/**
 * A literal substituted **when the track is evaluated**, not when the preset
 * is compiled — see `ParamDefault`'s `eval` and `remainder` cases.
 *
 * `start` is the only one. No verb writes a `start` onto the `Track` it
 * returns, so `compilePreset({kind: 'move'})` and
 * `compilePreset({kind: 'move', start: 0})` are *different tracks*; the
 * second carries a field the first does not. `localTime` then reads
 * `tr.start ?? 0` and the two behave identically from there on. Recording
 * this as a `value` default would claim the preset substitutes it and would
 * be false against the very check `params.test.ts` makes of every other
 * default; recording it as `none` would claim omission selects different
 * behaviour, and it does not.
 */
export interface EvalDefault {
  readonly from: 'eval'
  readonly value: number
}

/**
 * The rest of the scene: a default that **no number expresses**.
 *
 * `duration` only. `localTime` falls back to
 * `Math.max(sceneDuration - start, 1e-9)`, and `sceneDuration` is not a key
 * of `PresetCtx` — the compile context carries seven measurements of the
 * stage, the layer and the margins, and the scene's length is not among them,
 * because a preset compiles once and is evaluated against whatever scene
 * holds it. So this is not `CtxDefault` (there is no key to name), not
 * `ValueDefault` (any literal is wrong for every scene but one), and not
 * `NoDefault` (omission *is* equivalent to a value — the exact inverse of
 * `move.speed`). A consumer rendering a control shows the field empty and
 * means "to the end", which is a thing it can say only because this case
 * exists to be switched on.
 */
export interface RemainderDefault {
  readonly from: 'remainder'
}

export type NumericDefault =
  | ValueDefault<number | readonly [number, number]>
  | CtxDefault
  | NoDefault
  | EvalDefault
  | RemainderDefault

/**
 * An enum's default is always one of its own `values` — there is no context-
 * valued or absent case among them, and the narrower type says so. A default
 * outside the list would be a control whose initial selection is not one of
 * its options; `params.test.ts` pins membership.
 */
export type EnumDefault = ValueDefault<string>

export type ParamDefault = NumericDefault | EnumDefault

/** A parameter carrying a physical quantity. */
export interface NumericParam {
  readonly name: string
  readonly unit: Exclude<ParamUnit, 'enum'>
  readonly shape: ParamShape
  /** Matches `shape`: one number for `scalar`, an `[x, y]` pair for `pair`. */
  readonly default: NumericDefault
  /**
   * Present when the value is a *rate* in `unit` per second.
   *
   * `speed` is `scenePx` with `per: 'second'` rather than its own unit tag on
   * purpose. Under `fit=render` the geometry scales and time does not, so a
   * rate in px/s scales by exactly the same factor as a distance in px — a
   * consumer whose rule is "scale every `scenePx` parameter" then gets `speed`
   * right for free. A distinct `scenePxPerSecond` tag would make `speed`
   * invisible to that rule and reintroduce the same fail-open bug one level
   * down.
   */
  readonly per?: 'second'
  /**
   * The names each slot accepts in place of a number, indexed by slot.
   *
   * Present exactly where `shape` is `endpoint-pair`, and **read from the
   * module that resolves them** (`offStageTokens`) rather than written out
   * here: a copy of the four names in this file would be a second roster of a
   * set that already exists, and `presets.ts` records that drift as the reason
   * its own message builder derives the list instead of holding one.
   *
   * Indexed by slot because the vocabulary is: `offLeft`/`offRight` are
   * horizontal distances and `endpointPair` throws when either is written into
   * the `y` slot. A consumer handed one flat list would offer a name the verb
   * rejects, and design §9.3's floor would be producing scenes the player
   * refuses to load.
   */
  readonly tokens?: readonly [readonly string[], readonly string[]]
}

/** A parameter chosen from a fixed set of names. */
export interface EnumParam {
  readonly name: string
  readonly unit: 'enum'
  /** Every *named* value the reader accepts, pinned against its own refusal. */
  readonly values: readonly string[]
  /** One of `values`, pinned by `params.test.ts`. */
  readonly default: EnumDefault
  /**
   * Present when `values` is **not the whole of what the reader accepts**,
   * and carrying the other form's syntax as the reader itself phrases it.
   *
   * `ease` is why. `Easing` is five named curves *or* `cubic-bezier(a,b,c,d)`,
   * and `CUBIC_BEZIER_SYNTAX` exists in `easing.ts` precisely because "a list
   * of five curve names has stopped describing what is accepted". A closed
   * `values` is still the right thing to record — the five are enumerable and
   * a picker over them is the floor a generated control needs — but a
   * descriptor that stopped there would tell a consumer that a valid easing
   * is invalid, which is the exact error `overrides()`' message was rewritten
   * to stop giving authors.
   *
   * Absent on a genuinely closed enum, and that absence is checked: `repeat`
   * is three names and nothing else, and an `open` on it would be a free-text
   * field with no reader behind it. Same string the reader's error offers, so
   * that a control's hint and the refusal an author sees cannot drift.
   */
  readonly open?: string
}

/**
 * Discriminated on `unit` so that `values` is reachable only where it means
 * something and `shape`/`per` only where they do. A flat shape with three
 * optional fields would compile with an enum that lists nothing, which is the
 * one descriptor a consumer cannot recover from.
 */
export type ParamDescriptor = NumericParam | EnumParam

/**
 * Wrap a literal default. The constructors below take the raw value and wrap
 * it here, so the table reads as `DEGREES('from', 0)` rather than carrying
 * the tag at every entry — the tag is for consumers, not for authors.
 */
const value = <V>(v: V): ValueDefault<V> => ({ from: 'value', value: v })

/**
 * A pair of scene-pixel offsets, either slot of which may instead be one of
 * `move`'s symbolic off-stage endpoints. See {@link ParamShape}.
 *
 * The vocabulary is read per slot at module load, from the table that
 * resolves it, so a token added there reaches every consumer without this
 * line being edited and no consumer can be offered a name for the wrong axis.
 */
const SCENE_PX_ENDPOINTS = (name: string, def: readonly [number, number]): NumericParam =>
  ({
    name,
    unit: 'scenePx',
    shape: 'endpoint-pair',
    tokens: [offStageTokens(0), offStageTokens(1)],
    default: value(def),
  })

const DEPTH = (name: string, def: NumericDefault): NumericParam =>
  ({ name, unit: 'depth', shape: 'scalar', default: def })

/** A rate in scene pixels per second. See `NumericParam.per`. */
const SCENE_PX_PER_SECOND = (name: string, def: NumericDefault): NumericParam =>
  ({ name, unit: 'scenePx', shape: 'scalar', per: 'second', default: def })

/**
 * **Degrees, which is the parameter's unit and not the channel's.**
 * `Transform.rotate`/`rotateX`/`rotateY` are radians; the preset converts. The
 * descriptor describes what an author writes, so it says `degrees` — getting
 * this backwards would have P3 offer a ±3.14 spinner for a half turn.
 */
const DEGREES = (name: string, def: number): NumericParam =>
  ({ name, unit: 'degrees', shape: 'scalar', default: value(def) })

/**
 * A dimensionless factor. **Does not scale under `fit=render`** — that is the
 * whole point of giving it a unit of its own rather than leaving it untagged:
 * doubling a container's width must not double a layer's `scale`.
 */
const MULTIPLIER = (name: string, def: number): NumericParam =>
  ({ name, unit: 'multiplier', shape: 'scalar', default: value(def) })

/**
 * The descriptors, keyed by the registry's own literal union.
 *
 * `Record<PresetKind, …>` is the tie: registering a verb without describing
 * its parameters is a `TS2741`, not a gap that shows up as a mis-scaled scene
 * in P2. Same mechanism as `CHANNELS`' `AssertNever` guard and `STEREO_KEYS`.
 *
 * Parameter names are read off the `PresetFn` bodies rather than off the
 * design table, because the bodies are what runs. The now-deleted `bounce`
 * was the standing proof: it accepted both `height` and the design doc's
 * `h`, the table said so, and a consumer that had trusted the design table
 * alone would have scaled only the first and left half the corpus wrong.
 *
 * So are the defaults. Every one of them is checked against behaviour by
 * `params.test.ts`, which compiles each preset bare and again with the
 * recorded default written out, and demands the two tracks be identical — a
 * claimed default that no longer matches the function is a failure, not a
 * stale comment nobody reads.
 */
export const PRESET_PARAMS: Record<PresetKind, readonly ParamDescriptor[]> = {
  move: [
    SCENE_PX_ENDPOINTS('from', [0, 0]),
    SCENE_PX_ENDPOINTS('to', [0, 0]),
    // **No default, and that is not a gap.** Omitting `speed` does not
    // substitute a number — it leaves `duration` unset, so the move runs for
    // the remainder of the scene. The `60` in `move`'s `num(p, 'speed', 60)`
    // is unreachable: the call sits inside `if (p['speed'] !== undefined)`.
    SCENE_PX_PER_SECOND('speed', { from: 'none' }),
  ],
  rotate: [
    DEGREES('from', 0),
    DEGREES('to', 0),
    // Three values, because all three rotation channels exist and `z` is a
    // real, distinct turn. `flip`'s axis enum is two — see there for why.
    // `z` is the default: it is what "rotate" means unqualified.
    { name: 'axis', unit: 'enum', values: ['x', 'y', 'z'], default: value('z') },
  ],
  // Absolute factors, not deltas — `composeAnim` multiplies this channel and
  // its rest value is 1, so the factor is the delta. See `presets.ts`. Both
  // default to 1 for the same reason: 1 is rest, where 0 is rest everywhere
  // else, and a bare `scale` must therefore be a no-op rather than a collapse.
  scale: [MULTIPLIER('from', 1), MULTIPLIER('to', 1)],
  flip: [
    // **Two** values, where `rotate`'s enum has three. There is no meaningful
    // flip about z: a half turn in the plane is an in-plane spin, never a
    // mirror, and `rotate` already expresses it. The arity difference between
    // these two enums is a design decision, not an oversight.
    { name: 'axis', unit: 'enum', values: ['x', 'y'], default: value('y') },
  ],
  // Absolute depths in 0..1, not offsets — `push` subtracts `ctx.layerDepth`
  // itself. Depth is a normalised quantity and does not scale with the frame.
  push: [
    DEPTH('from', value(0)),
    // The one default that is not a literal. `{kind: 'push'}` rises to
    // *wherever this layer sits*, which is a different fact from any number
    // and is why `CtxDefault` exists.
    DEPTH('to', { from: 'ctx', key: 'layerDepth' }),
  ],
}

/* ------------------------------ the parameters every verb honours */

/**
 * The named curves, written out rather than spread from `EASINGS`.
 *
 * Writing it out is the point, and it is the same bargain `CONTROL_UNITS`
 * strikes in `site/controlspec.ts`: the tuple and the union are independent,
 * so a curve added to `NamedEasing` is a compile error here rather than one
 * the `ease` descriptor can never name. A spread would make the pair
 * a tautology — it would prove only that the derivation ran twice.
 */
const NAMED_EASINGS = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'easeOutBounce'] as const
type _NoNamedEasingMissing = AssertNever<Exclude<NamedEasing, typeof NAMED_EASINGS[number]>>
type _NoNamedEasingExtra = AssertNever<Exclude<typeof NAMED_EASINGS[number], NamedEasing>>

/**
 * The parameters every verb honours, described once.
 *
 * **A sibling of `PRESET_PARAMS`, not an extra key in it.** `PRESET_PARAMS` is
 * `Record<PresetKind, …>` and `params.test.ts` pins its keys against the
 * registry's, so a pseudo-key meaning "all of them" reddens that tie — which
 * is the tie working, because "every verb" is not a verb. The site layer
 * would have taken the pseudo-key (`ControlRosters.preset` is keyed by
 * `string`), and that permissiveness is not a second opinion.
 *
 * `overrides()` in `presets.ts` is the single place they are all applied and
 * is therefore the thing this table is answerable to. It is not read from
 * here — a table cannot import a module-private function — but
 * `universals.test.ts` derives the set by *running* every verb against a
 * recording proxy and intersecting what each one reads, so a parameter added
 * to `overrides()`, or one of these removed from it, reddens with the name in
 * the message. A hand-written list of "the parameters every verb
 * takes" would go stale in silence; this one goes stale loudly.
 *
 * ## The set straddles the compile/evaluate line, and that is the content
 *
 * `ease` and `repeat` are written onto the `Track` by every verb, so their
 * defaults are ordinary `value` defaults and are checked the ordinary way:
 * compile bare, compile with the default spelled out, demand equality.
 *
 * `start` and `duration` are not written by anything. They stay absent on the
 * compiled track and `localTime` supplies them, which is why they carry
 * `eval` and `remainder` rather than `value` — and why their check runs
 * through `evalTrack` instead. Getting this wrong in the convenient direction
 * (calling `start` a `value` default of 0) would be caught, because the
 * compiled tracks differ; getting it wrong in the lazy direction (`none`)
 * would not have been, which is why the test asserts the equivalence at
 * evaluation rather than trusting the tag.
 *
 * ## Units, and `start` is the collision design §9.1 names
 *
 * `start` here is **seconds**. `shape.start`/`end` on a layer are **degrees**,
 * and `Transform.rotate` is radians while `rotate`'s own parameter is
 * degrees: three quantities wearing two words, which is the collision §9.1
 * cites as the reason provenance cannot be recovered from a union. The tag is
 * the whole of what stands between a consumer and a degrees spinner for a
 * start time, so it is recorded here and asserted there rather than being
 * left for a reader to infer from the field's name.
 */
export const UNIVERSAL_PARAMS: readonly ParamDescriptor[] = [
  {
    name: 'start',
    unit: 'seconds',
    shape: 'scalar',
    default: { from: 'eval', value: 0 },
  },
  {
    name: 'duration',
    unit: 'seconds',
    shape: 'scalar',
    default: { from: 'remainder' },
  },
  {
    name: 'ease',
    unit: 'enum',
    values: NAMED_EASINGS,
    default: value('linear'),
    // Not the whole of what `isEasing` accepts — see `EnumParam.open`.
    open: CUBIC_BEZIER_SYNTAX,
  },
  {
    name: 'repeat',
    unit: 'enum',
    // Written out for the same reason `rotate`'s axes are, and checked the
    // same way: `universals.test.ts` matches this list against `overrides()`'
    // own refusal message, so it cannot be too small or too large. Spreading
    // `presets.ts`' private `REPEATS` would make that check compare a
    // constant with itself.
    values: ['once', 'loop', 'pingpong'],
    default: value('once'),
  },
]

/**
 * Per-verb departures from a universal default, keyed by verb then by
 * parameter name.
 *
 * **Partial on purpose, and the partiality is why the test is the tie.** A
 * total `Record<PresetKind, …>` would demand an entry per verb saying "no
 * departure", which is a row of noise per verb and another the day one is
 * registered. What makes a missing departure visible is not this type: it is
 * that the recorded default is compiled against the verb and must produce the
 * same track the bare verb produces.
 */
export type VerbDefaults =
  Readonly<Partial<Record<PresetKind, Readonly<Record<string, ParamDefault>>>>>

/**
 * The one verb that disagrees, and the reason is recorded where it happens.
 *
 * `push` compiles `ease: 'easeOut'` where the other four compile `'linear'`.
 * `presets.ts` argues it at length and the short form is that design §4.2
 * wants unopinionated primitives while §4.2b requires `push` to reproduce
 * what `emerge` did *precisely*, and `emerge` eased out. The exact-
 * reproduction requirement is the stronger of the two, so `push` carries an
 * opinionated default by inheritance rather than by choice.
 *
 * A descriptor scheme with nowhere to put that would have to pick: one `ease`
 * default for all five, wrong for one of them, with nothing in the table
 * saying so. That is the same silent-provenance failure the per-verb tables
 * above exist to prevent, one level up.
 */
export const VERB_DEFAULTS: VerbDefaults = {
  push: { ease: value('easeOut') },
}

/**
 * The universal descriptors as they apply to one verb.
 *
 * A function over the departure table rather than a constant, for the reason
 * `deriveControls` is: a consumer that cannot be handed a different table
 * cannot be tested for what it does with one, and "the override mechanism
 * works" would then rest entirely on the single entry that ships.
 *
 * Unknown parameter names throw rather than being ignored. A departure naming
 * a parameter that is not universal is a typo or a stale edit, and the
 * failure mode of ignoring it is a verb that silently keeps the common
 * default — the mistake being made, invisibly, by the mechanism built to
 * prevent it.
 */
export function universalParams(
  kind: PresetKind,
  verbDefaults: VerbDefaults = VERB_DEFAULTS,
): readonly ParamDescriptor[] {
  const departures = verbDefaults[kind]
  if (departures === undefined) return UNIVERSAL_PARAMS

  // `Object.hasOwn` throughout, never `in`: these are plain object literals,
  // so `in` answers true for the dozen keys on `Object.prototype` and a
  // departure named `constructor` would reach the switch below as a function.
  for (const name of Object.keys(departures)) {
    if (!UNIVERSAL_PARAMS.some(d => d.name === name)) {
      throw new Error(
        `preset "${kind}": "${name}" is not a universal parameter, so its default ` +
        `cannot be overridden here — they are ` +
        `${UNIVERSAL_PARAMS.map(d => d.name).join(', ')}`,
      )
    }
  }

  return UNIVERSAL_PARAMS.map(d => {
    if (!Object.hasOwn(departures, d.name)) return d
    const od = departures[d.name]
    if (od === undefined) return d
    if (d.unit === 'enum') {
      if (od.from !== 'value' || typeof od.value !== 'string') {
        throw new Error(
          `preset "${kind}": "${d.name}" is chosen from a list, so its default must be ` +
          'one of that list and not a derived or absent one',
        )
      }
      if (!d.values.includes(od.value)) {
        throw new Error(
          `preset "${kind}": "${d.name}" defaults to ${JSON.stringify(od.value)}, which is ` +
          `not one of ${d.values.join(', ')}`,
        )
      }
      return { ...d, default: { from: 'value', value: od.value } }
    }
    switch (od.from) {
      case 'value':
        if (typeof od.value === 'string') {
          throw new Error(
            `preset "${kind}": "${d.name}" is measured in ${d.unit}, so its default ` +
            'must not be a name',
          )
        }
        return { ...d, default: { from: 'value', value: od.value } }
      case 'ctx':
      case 'none':
      case 'eval':
      case 'remainder':
        return { ...d, default: od }
      default: {
        // A `ParamDefault` case this switch does not name is a compile error
        // here rather than a departure the function drops on the floor.
        const unhandled: never = od
        throw new Error(`preset "${kind}": unhandled default ${JSON.stringify(unhandled)}`)
      }
    }
  })
}
