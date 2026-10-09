import { checkFrame, toRgba, type FrameSource, type GreyFrame } from '../shared/frames.js'
import { encodeGif, type GifOpts } from '../shared/gif.js'

/**
 * Browser encoders. There is no filesystem here, so these return bytes and
 * `Blob`s for the caller to hand to a download link or `showSaveFilePicker`.
 *
 * The GIF path is the same code the CLI uses (`src/shared/gif.ts`), so a GIF
 * exported from the site is byte-identical to one rendered by `stst` from the
 * same scene — which is the property that makes the browser preview trustworthy
 * as a preview. MP4 export is deliberately absent: it needs WebCodecs, whose
 * lossy defaults destroy the stereo signal (design §5), and getting that right
 * is its own task rather than a line in this file.
 */

/**
 * Copy bytes into a plain `ArrayBuffer` for the `Blob` constructor.
 *
 * Not ceremony: since TypeScript 5.7 a `Uint8Array` is generic over its buffer
 * and may be a view on a `SharedArrayBuffer`, which `BlobPart` rejects. `Blob`
 * copies its parts regardless, so this adds a transient copy and no retained
 * memory — and it also means a view over a larger pooled buffer cannot smuggle
 * the whole backing store into the download.
 */
function toBlobPart(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buf).set(bytes)
  return buf
}

/** Encode frames to GIF bytes. See `GifOpts` for the 10ms delay quantisation. */
export function gifBytes(frames: FrameSource, opts: GifOpts = {}): Promise<Uint8Array> {
  return encodeGif(frames, opts, 'gifBytes')
}

/** The same bytes as a `Blob`, ready for `URL.createObjectURL`. */
export async function gifBlob(frames: FrameSource, opts: GifOpts = {}): Promise<Blob> {
  const bytes = await encodeGif(frames, opts, 'gifBlob')
  return new Blob([toBlobPart(bytes)], { type: 'image/gif' })
}

/**
 * Encode one frame as a PNG `Blob` — lossless, so the dot field survives
 * byte-exactly.
 *
 * Only the frame validation here is tested; `convertToBlob` needs a real
 * browser. Deliberately left as a forward rather than a hand-rolled PNG writer:
 * a second encoder is a second thing to be wrong about, and the platform's is
 * lossless already.
 */
export async function pngBlob(frame: GreyFrame): Promise<Blob> {
  checkFrame(frame, 'pngBlob')
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error(
      'pngBlob: OffscreenCanvas is not available in this environment. PNG ' +
      'export needs a browser or worker that implements it; under node use ' +
      'writePng from "staticstereo/node" instead.',
    )
  }

  const canvas = new OffscreenCanvas(frame.width, frame.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error(
      `pngBlob: OffscreenCanvas.getContext("2d") returned null for ` +
      `${frame.width}x${frame.height}`,
    )
  }
  const id = ctx.createImageData(frame.width, frame.height)
  id.data.set(toRgba(frame))
  ctx.putImageData(id, 0, 0)
  return canvas.convertToBlob({ type: 'image/png' })
}

export type { FrameSource, GreyFrame } from '../shared/frames.js'
export type { GifOpts } from '../shared/gif.js'
