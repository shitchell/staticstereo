/** Public surface of the animation engine. */
export { CUBIC_BEZIER_SYNTAX, EASINGS, isEasing, resolveEasing } from './easing.js'
export { cubicBezier } from './bezier.js'
export { CHANNELS, evalTrack, composeAnim } from './track.js'
export type { AnimCompiler, Channel } from './track.js'
export { PRESETS, compilePreset } from './presets.js'
export type { PresetCtx, PresetFn, PresetKind } from './presets.js'
export { PARAM_UNITS, PRESET_PARAMS } from './params.js'
export type { EnumParam, NumericParam, ParamDescriptor, ParamShape, ParamUnit } from './params.js'
