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
 * all nine tables would say nothing a consumer could not get from the fact
 * that they are universal, and would rot the moment a tenth verb forgot them.
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
 * Scalar or `[x, y]` pair. P2 must be able to tell `move.from` (a pair of
 * scene-pixel offsets, both of which scale) from `move.speed` (one scalar)
 * without inspecting a scene that happens to use them, so the arity is part of
 * the descriptor rather than something discovered at the value.
 */
export type ParamShape = 'scalar' | 'pair'

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
 * Three cases, and the distinction between them is the content:
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

export type NumericDefault =
  | ValueDefault<number | readonly [number, number]>
  | CtxDefault
  | NoDefault

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
}

/** A parameter chosen from a fixed set of names. */
export interface EnumParam {
  readonly name: string
  readonly unit: 'enum'
  /** Every value the preset's own reader accepts, pinned by `params.test.ts`. */
  readonly values: readonly string[]
  /** One of `values`, pinned by `params.test.ts`. */
  readonly default: EnumDefault
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

const SCENE_PX_PAIR = (name: string, def: readonly [number, number]): NumericParam =>
  ({ name, unit: 'scenePx', shape: 'pair', default: value(def) })

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
    SCENE_PX_PAIR('from', [0, 0]),
    SCENE_PX_PAIR('to', [0, 0]),
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
