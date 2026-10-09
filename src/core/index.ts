/**
 * `staticstereo` — the isomorphic core.
 *
 * Everything here runs unchanged in Node and in a browser, because the one
 * platform dependency (a drawing surface) arrives as an injected
 * {@link CanvasLike}. The adapters live behind their own entry points —
 * `staticstereo/node` and `staticstereo/web` — and **nothing in this directory
 * may import from either**; that is the only thing keeping the browser bundle
 * free of `@napi-rs/canvas` and `node:child_process`, and `purity.test.ts`
 * enforces it against the built output.
 *
 * Typical use:
 *
 * ```ts
 * import { renderFrames } from 'staticstereo'
 * import { nodeCanvas, writeGif } from 'staticstereo/node'
 *
 * await writeGif('out.gif', renderFrames(scene, nodeCanvas()), { fps: 12 })
 * ```
 *
 * The exports are explicit rather than `export *` so that adding a module to
 * `core` is not accidentally a change to the published API.
 */

/* ------------------------------------------------------------------ pipeline */

export { DEFAULT_FPS, frameTimes, isStill, renderFrame, renderFrames, resolveStereo, sceneFps, stillTime } from './render.js'
export type { Frame, SequenceFrame } from './render.js'

/* -------------------------------------------------------------- scene model */

export { DEFAULT_STEREO, IDENTITY, SIRDS_ALGORITHMS, STEREO_KEYS } from './types.js'
export type {
  Anim,
  Depth,
  Easing,
  Key,
  Layer,
  MaskSource,
  Preset,
  Scene,
  SirdsAlgorithm,
  SirdsOpts,
  StereoOpts,
  Track,
  Transform,
} from './types.js'

/* ------------------------------------------------------------- canvas seam */

export type {
  CanvasLike,
  CanvasSurface,
  Ctx2D,
  DecodedGif,
  DecodedImage,
  Drawable,
  GifFrame,
  ImageDataLike,
} from './canvaslike.js'

/* ------------------------------------------------------------------- stages */

export { createRasterCache, gifFrameIndex, rasterDepth, sceneDurationOf } from './raster.js'
export type { RasterCache } from './raster.js'
export { blurDepth } from './blur.js'
export { sirdsFromDepth, upscale } from './sirds.js'
export { makeRng } from './rng.js'

/* ---------------------------------------------------------------- animation */

export { EASINGS, PRESETS, compilePreset, composeAnim, evalTrack } from './anim/index.js'
export type { AnimCompiler, PresetCtx, PresetFn } from './anim/index.js'

/* -------------------------------------------------------------- measurement */

/**
 * Shipped, not test-only: the web view's diagnostics panel measures the same
 * way the tests do, because the repeat period *is* the encoded depth.
 */
export { MIN_OVERLAP, dominantPeriod, rowOf } from './analysis.js'
