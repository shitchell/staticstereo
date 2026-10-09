/**
 * The Node adapter: everything `core` needs that only exists off the browser.
 *
 * Imported as `staticstereo/node`. `core` is published as `staticstereo` and
 * never reaches into this directory, which is what keeps `@napi-rs/canvas` and
 * `node:child_process` out of the browser bundle.
 */

export { nodeCanvas } from './canvas.js'

export {
  LOSSLESS_MP4,
  resolveMp4Encoding,
  writeGif,
  writeMp4,
  writePng,
  writePngSequence,
} from './encode.js'

export type {
  FrameSource,
  GifOpts,
  GreyFrame,
  Mp4Encoding,
  Mp4Opts,
  PngSequenceOpts,
} from './encode.js'
