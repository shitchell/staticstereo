/** Public surface of the animation engine. */
export { EASINGS } from './easing.js'
export { CHANNELS, evalTrack, composeAnim } from './track.js'
export type { AnimCompiler, Channel } from './track.js'
export { PRESETS, compilePreset } from './presets.js'
export type { PresetCtx, PresetFn } from './presets.js'
