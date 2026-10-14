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
import type { PresetKind } from './presets.js'

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
 * all six tables would say nothing a consumer could not get from the fact that
 * they are universal, and would rot the moment a seventh verb forgot them. The
 * tag exists so that whoever does surface them has the word already fixed.
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
 * scene-pixel offsets, both of which scale) from `marquee.speed` (one scalar)
 * without inspecting a scene that happens to use them, so the arity is part of
 * the descriptor rather than something discovered at the value.
 */
export type ParamShape = 'scalar' | 'pair'

/** A parameter carrying a physical quantity. */
export interface NumericParam {
  readonly name: string
  readonly unit: Exclude<ParamUnit, 'enum'>
  readonly shape: ParamShape
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
}

/**
 * Discriminated on `unit` so that `values` is reachable only where it means
 * something and `shape`/`per` only where they do. A flat shape with three
 * optional fields would compile with an enum that lists nothing, which is the
 * one descriptor a consumer cannot recover from.
 */
export type ParamDescriptor = NumericParam | EnumParam

const SCENE_PX_PAIR = (name: string): NumericParam =>
  ({ name, unit: 'scenePx', shape: 'pair' })

const DEPTH = (name: string): NumericParam =>
  ({ name, unit: 'depth', shape: 'scalar' })

const SCENE_PX = (name: string): NumericParam =>
  ({ name, unit: 'scenePx', shape: 'scalar' })

/** A rate in scene pixels per second. See `NumericParam.per`. */
const SCENE_PX_PER_SECOND = (name: string): NumericParam =>
  ({ name, unit: 'scenePx', shape: 'scalar', per: 'second' })

/**
 * The descriptors, keyed by the registry's own literal union.
 *
 * `Record<PresetKind, …>` is the tie: registering a verb without describing
 * its parameters is a `TS2741`, not a gap that shows up as a mis-scaled scene
 * in P2. Same mechanism as `CHANNELS`' `AssertNever` guard and `STEREO_KEYS`.
 *
 * Parameter names are read off the `PresetFn` bodies rather than off the
 * design table, because the bodies are what runs — `bounce` accepts both
 * `height` and the design doc's `h`, and a consumer that scaled only the first
 * would leave half the scenes in the corpus wrong.
 */
export const PRESET_PARAMS: Record<PresetKind, readonly ParamDescriptor[]> = {
  move: [
    SCENE_PX_PAIR('from'),
    SCENE_PX_PAIR('to'),
    SCENE_PX_PER_SECOND('speed'),
  ],
  'slide-in': [
    // The edge entered from, not a distance: the offset is computed from the
    // measured content and the plate margins, so there is nothing here for a
    // resize to scale.
    { name: 'from', unit: 'enum', values: ['left', 'right', 'top', 'bottom'] },
  ],
  marquee: [SCENE_PX_PER_SECOND('speed')],
  // Absolute depths in 0..1, not offsets — `push` subtracts `ctx.layerDepth`
  // itself. Depth is a normalised quantity and does not scale with the frame.
  push: [DEPTH('from'), DEPTH('to')],
  // `h` is a real second spelling of `height` (the design doc and the
  // implementation plan disagreed), so it is described rather than hidden.
  bounce: [SCENE_PX('height'), SCENE_PX('h')],
  bob: [SCENE_PX('amount')],
}
