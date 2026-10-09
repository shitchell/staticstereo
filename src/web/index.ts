/**
 * The web adapter: everything `core` needs that only exists in a browser.
 *
 * Imported as `staticstereo/web`. `core` is published as `staticstereo` and
 * never reaches into this directory; this directory, in turn, must never reach
 * into `src/node/` or a `node:` builtin, which is what keeps a browser bundle
 * buildable. `index.test.ts` walks the import graph from this file and asserts
 * exactly that.
 */

export { webCanvas } from './canvas.js'

export { gifBlob, gifBytes, pngBlob } from './encode.js'

export type { FrameSource, GifOpts, GreyFrame } from './encode.js'
