import { GifReader } from 'omggif'
import type { DecodedGif, GifFrame } from '../core/canvaslike.js'
import { checkFrame, iterate, toRgba, type FrameSource } from './frames.js'
import { GIFEncoder, applyPalette, twoColourPalette } from './gifenc.js'

/**
 * GIF decode and encode, shared by the Node and web adapters.
 *
 * `omggif` and `gifenc` are both dependency-free and isomorphic, so there is no
 * reason for the browser to have its own copy of either algorithm — and one
 * very good reason not to: the disposal model below is subtle, was wrong twice
 * before it was right, and a second copy would be wrong in a way only a browser
 * could reveal.
 */

function describeCause(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

/**
 * Clear an axis-aligned rect of an RGBA buffer to transparent black.
 *
 * This is GIF disposal method 2 ("restore to background"); every browser
 * implements "background" as transparent rather than the palette's background
 * index, and so do we.
 *
 * The clamping is load-bearing, not defensive: a frame rect may extend past the
 * logical screen (malformed, but it plays), and an unclamped row fill wraps into
 * the following row and erases pixels the frame never owned.
 */
function clearRect(
  rgba: Uint8Array, screenW: number, screenH: number,
  x: number, y: number, w: number, h: number,
): void {
  const x0 = Math.max(x, 0)
  const x1 = Math.min(x + w, screenW)
  const y1 = Math.min(y + h, screenH)
  if (x1 <= x0) return
  for (let row = Math.max(y, 0); row < y1; row++) {
    const start = (row * screenW + x0) * 4
    rgba.fill(0, start, start + (x1 - x0) * 4)
  }
}

/**
 * Decode an animated GIF into one full-screen RGBA buffer per frame.
 *
 * `label` only shapes error messages — pass the URL or path the bytes came
 * from, so a failure says which asset is broken.
 *
 * `decodeAndBlitFrameRGBA` *blits*: it writes only the frame's own subrect and
 * skips transparent pixels outright. So the buffer handed to it IS the
 * compositing canvas, and getting that wrong fails in two opposite ways:
 *
 *   - reuse it untouched and a frame that asked to be cleared (disposal 2)
 *     bleeds through everything after it;
 *   - clear it every frame and partial-frame GIFs (what gifsicle and ffmpeg
 *     emit, i.e. most real-world GIFs) lose the background they are drawn on.
 *
 * Neither is a judgement call: the GIF spec says which to do, per frame, via the
 * disposal method, and omggif does not act on it for us.
 */
export function decodeGif(bytes: Uint8Array, label = 'GIF'): DecodedGif {
  let reader: GifReader
  try {
    reader = new GifReader(bytes)
  } catch (err) {
    throw new Error(`failed to decode GIF "${label}": ${describeCause(err)}`,
      { cause: err })
  }

  const width = reader.width
  const height = reader.height
  const count = reader.numFrames()
  if (count < 1) throw new Error(`failed to decode GIF "${label}": no frames`)

  const canvasBuf = new Uint8Array(width * height * 4)
  const frames: GifFrame[] = []

  for (let i = 0; i < count; i++) {
    const info = reader.frameInfo(i)
    // Disposal 3 restores what was underneath, so snapshot before drawing.
    const before = info.disposal === 3 ? canvasBuf.slice() : undefined

    try {
      reader.decodeAndBlitFrameRGBA(i, canvasBuf)
    } catch (err) {
      throw new Error(
        `failed to decode GIF "${label}" frame ${i}: ${describeCause(err)}`,
        { cause: err },
      )
    }

    // Each returned frame gets its own buffer. Handing out views on the shared
    // compositing canvas would make every frame equal to the last.
    frames.push({ rgba: canvasBuf.slice(), delayMs: info.delay * 10 })

    if (info.disposal === 2) {
      clearRect(canvasBuf, width, height, info.x, info.y, info.width, info.height)
    } else if (info.disposal === 3 && before) {
      canvasBuf.set(before)
    }
    // 0 (unspecified) and 1 (do not dispose): leave the canvas as it is.
  }

  return { width, height, frames }
}

export interface GifOpts {
  /** Frames per second. Default 12. Ignored if `delayMs` is given. */
  fps?: number
  /**
   * Per-frame delay in milliseconds. GIF stores delays in 10ms units, so this
   * is rounded: 12fps (83ms) is written — and reads back — as 80ms.
   */
  delayMs?: number
  /** -1 = play once, 0 = loop forever (default), >0 = that many repeats. */
  loop?: number
}

/**
 * Encode greyscale frames into GIF bytes.
 *
 * GIF is a genuinely good container here rather than a compromise: a stereogram
 * frame is binary black and white, so a 2-colour palette is exact. The format is
 * therefore lossless for this payload *and* smaller than a lossless MP4 of the
 * same frames.
 *
 * `label` prefixes per-frame error messages so each adapter can keep its own
 * public function name in them.
 */
export async function encodeGif(
  frames: FrameSource, opts: GifOpts = {}, label = 'encodeGif',
): Promise<Uint8Array> {
  const delay = opts.delayMs ?? Math.round(1000 / (opts.fps ?? 12))
  const loop = opts.loop ?? 0
  const enc = GIFEncoder()

  let palette: number[][] | undefined
  let width = 0
  let height = 0
  let count = 0

  for await (const frame of iterate(frames)) {
    checkFrame(frame, `${label} frame ${count}`)
    if (count === 0) {
      width = frame.width
      height = frame.height
    } else if (frame.width !== width || frame.height !== height) {
      throw new Error(
        `${label} frame ${count}: every frame must be the same size; ` +
        `expected ${width}x${height}, got ${frame.width}x${frame.height}`,
      )
    }

    const rgba = toRgba(frame)
    palette ??= twoColourPalette(rgba)

    const index = applyPalette(rgba, palette)
    enc.writeFrame(index, width, height, {
      // The palette and the loop count live in the global header, which gifenc
      // writes on the first frame only.
      ...(count === 0 ? { palette, repeat: loop } : {}),
      delay,
    })
    count++
  }

  if (count === 0) throw new Error(`${label}: no frames to encode`)

  enc.finish()
  return enc.bytes()
}
