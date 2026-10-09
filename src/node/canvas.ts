import { createCanvas, loadImage as skLoadImage } from '@napi-rs/canvas'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type {
  CanvasLike, Ctx2D, DecodedGif, DecodedImage,
} from '../core/canvaslike.js'
import { decodeGif } from '../shared/gif.js'
import { anyTransparent } from '../shared/pixels.js'

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

      // The decode itself — including the disposal model, which is where all
      // the subtlety is — is shared with the web adapter. See
      // `src/shared/gif.ts`; `omggif` is dependency-free and isomorphic, so a
      // second copy would only be a second thing to get wrong.
      return decodeGif(bytes, src)
    },
  }
}
