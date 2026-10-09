import { createCanvas, loadImage as skLoadImage } from '@napi-rs/canvas'
import { GifReader } from 'omggif'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type {
  CanvasLike, Ctx2D, DecodedGif, DecodedImage, GifFrame,
} from '../core/canvaslike.js'

/**
 * The Node implementation of `CanvasLike`, over `@napi-rs/canvas`.
 *
 * Nothing in `src/core/` may import this file; the dependency runs one way, with
 * the adapter handed *into* core as a parameter.
 */

/**
 * `SKRSContext2D` satisfies `Ctx2D` at runtime but not by assignability: its
 * `fillStyle` is `string | CanvasGradient | CanvasPattern` and its
 * `textBaseline` is the full six-value DOM union, and mutable properties are
 * invariant in TypeScript. `Ctx2D` deliberately narrows both, so a real context
 * is a *supertype* on those two members and the compiler rejects the assignment
 * in either direction. Narrowing the surface area core may touch is the whole
 * point of `Ctx2D`, so the cast stays here, in one place, rather than being
 * paid for by widening the interface.
 *
 * The `canvas.test.ts` suite exercises every `Ctx2D` member against the real
 * context so this cast cannot silently become untrue.
 */
function asCtx2D(ctx: unknown): Ctx2D {
  return ctx as Ctx2D
}

/** Bytes for a local path, a `file:` URL, an `http(s)` URL, or a data URL. */
async function readBytes(src: string): Promise<Uint8Array> {
  if (/^https?:/i.test(src) || /^data:/i.test(src)) {
    const res = await fetch(src)
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    return new Uint8Array(await res.arrayBuffer())
  }
  if (src.startsWith('file:')) return readFile(fileURLToPath(src))
  return readFile(src)
}

function describeCause(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

/** True if any pixel in an RGBA buffer is less than fully opaque. */
function anyTransparent(data: ArrayLike<number>): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i]! < 255) return true
  return false
}

/**
 * Clear an axis-aligned rect of an RGBA buffer to transparent black.
 * This is GIF disposal method 2 ("restore to background"); every browser
 * implements "background" as transparent rather than the palette's background
 * index, and so do we.
 */
function clearRect(
  rgba: Uint8Array, screenW: number, screenH: number,
  x: number, y: number, w: number, h: number,
): void {
  const x1 = Math.min(x + w, screenW)
  const y1 = Math.min(y + h, screenH)
  for (let row = Math.max(y, 0); row < y1; row++) {
    const start = (row * screenW + Math.max(x, 0)) * 4
    rgba.fill(0, start, start + (x1 - Math.max(x, 0)) * 4)
  }
}

export function nodeCanvas(): CanvasLike {
  return {
    make(w: number, h: number): Ctx2D {
      if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
        throw new Error(`nodeCanvas.make: bad size ${w}x${h}; both must be >= 1`)
      }
      const canvas = createCanvas(Math.round(w), Math.round(h))
      return asCtx2D(canvas.getContext('2d'))
    },

    async loadImage(src: string): Promise<DecodedImage> {
      let img
      try {
        img = await skLoadImage(src)
      } catch (err) {
        throw new Error(`failed to load image "${src}": ${describeCause(err)}`,
          { cause: err })
      }
      const width = img.naturalWidth || img.width
      const height = img.naturalHeight || img.height
      if (width < 1 || height < 1) {
        throw new Error(`failed to load image "${src}": decoded to ${width}x${height}`)
      }

      // `Image` exposes no pixels, so the only way to answer `hasAlpha` is to
      // rasterise once. It matters: the rasteriser picks silhouette vs heightmap
      // mode off this flag, so guessing would silently change how every image
      // renders. One decode per layer, at load time, is the right price.
      const probe = createCanvas(width, height)
      const pctx = probe.getContext('2d')
      pctx.drawImage(img, 0, 0)
      const hasAlpha = anyTransparent(pctx.getImageData(0, 0, width, height).data)

      return { width, height, handle: img, hasAlpha }
    },

    async loadGif(src: string): Promise<DecodedGif> {
      let bytes: Uint8Array
      try {
        bytes = await readBytes(src)
      } catch (err) {
        throw new Error(`failed to read GIF "${src}": ${describeCause(err)}`,
          { cause: err })
      }

      let reader: GifReader
      try {
        reader = new GifReader(bytes)
      } catch (err) {
        throw new Error(`failed to decode GIF "${src}": ${describeCause(err)}`,
          { cause: err })
      }

      const width = reader.width
      const height = reader.height
      const count = reader.numFrames()
      if (count < 1) throw new Error(`failed to decode GIF "${src}": no frames`)

      // `decodeAndBlitFrameRGBA` blits: it writes only the frame's own subrect
      // and skips transparent pixels outright. So the buffer handed to it IS the
      // compositing canvas, and getting it wrong fails in two opposite ways:
      //
      //   - reuse it untouched and a frame that asked to be cleared (disposal 2)
      //     bleeds through everything after it;
      //   - clear it every frame and partial-frame GIFs (what gifsicle and
      //     ffmpeg emit) lose the background they are drawn on top of.
      //
      // Neither is a judgement call: the GIF spec says which to do, per frame,
      // via the disposal method, and omggif does not act on it for us.
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
            `failed to decode GIF "${src}" frame ${i}: ${describeCause(err)}`,
            { cause: err },
          )
        }

        // Each returned frame gets its own buffer. Handing out views on the
        // shared compositing canvas would make every frame equal to the last.
        frames.push({ rgba: canvasBuf.slice(), delayMs: info.delay * 10 })

        if (info.disposal === 2) {
          clearRect(canvasBuf, width, height, info.x, info.y, info.width, info.height)
        } else if (info.disposal === 3 && before) {
          canvasBuf.set(before)
        }
        // 0 (unspecified) and 1 (do not dispose): leave the canvas as it is.
      }

      return { width, height, frames }
    },
  }
}
