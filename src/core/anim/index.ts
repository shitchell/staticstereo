/** Public surface of the animation engine. */
export { EASINGS } from './easing.js'
export { CHANNELS, evalTrack, composeAnim } from './track.js'
export type { AnimCompiler, Channel } from './track.js'
export { PRESETS, compilePreset } from './presets.js'
export type { PresetCtx, PresetFn, PresetKind } from './presets.js'
export { PARAM_UNITS, PRESET_PARAMS } from './params.js'
export type { EnumParam, NumericParam, ParamDescriptor, ParamShape, ParamUnit } from './params.js'
