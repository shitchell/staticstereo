/** Public surface of the animation engine. */
export { CUBIC_BEZIER_SYNTAX, EASINGS, isEasing, resolveEasing } from './easing.js'
export { cubicBezier } from './bezier.js'
export { CHANNELS, evalTrack, composeAnim } from './track.js'
export type { AnimCompiler, Channel } from './track.js'
export { PRESETS, compilePreset } from './presets.js'
export type { PresetCtx, PresetFn, PresetKind } from './presets.js'
export { PARAM_UNITS, PRESET_PARAMS } from './params.js'
/**
 * The whole descriptor table, including the tagged union behind `default`.
 *
 * The union members are exported for the same reason the descriptors are:
 * `params.ts` designs `default` so that a consumer **switches over it
 * exhaustively instead of sniffing the value's JavaScript type**, and a
 * consumer that cannot name the members cannot write that switch. Without
 * them `ParamDescriptor` is readable but not processable — `d.default.from`
 * reads fine, while a function taking one, an exhaustive `switch`, and any
 * mention of the `ctx` case are all unsayable. The only recourse left is to
 * re-declare the union locally, which is exactly the duplication this table
 * exists to end.
 */
export type {
  CtxDefault,
  EnumDefault,
  EnumParam,
  NoDefault,
  NumericDefault,
  NumericParam,
  ParamDefault,
  ParamDescriptor,
  ParamShape,
  ParamUnit,
  ValueDefault,
} from './params.js'
