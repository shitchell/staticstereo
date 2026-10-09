/**
 * A dependency-free `CanvasLike` for testing `core`.
 *
 * Why this exists: `rasterDepth` is the one piece of `core` that cannot be
 * tested on plain arrays, because its whole job is "draw with a 2D context and
 * read one channel back". Importing `@napi-rs/canvas` here would make the core
 * test suite depend on a native binary and on `src/node/`, which is exactly the
 * boundary the injected `CanvasLike` exists to protect.
 *
 * What it is *not*: a canvas implementation. It rasterises with binary
 * coverage (no antialiasing), samples images nearest-neighbour, and renders
 * text as one filled box per character. That is deliberate — the rasteriser
 * only consumes *extent* and *one channel*, and a fake with no antialiasing
 * makes mask values exactly 0 or 1, so a compositing assertion is exact rather
 * than approximate. Where a test needs a fractional mask it supplies one
 * directly as image alpha (see `rasterDepth`'s compositing regression test).
 */
import type {
  CanvasLike,
  CanvasSurface,
  Ctx2D,
  DecodedGif,
  DecodedImage,
  Drawable,
  ImageDataLike,
} from '../canvaslike.js'

/**
 * Width of one character cell as a fraction of the font's px size. Tests that
 * assert on measured text width import this rather than hardcoding 0.6, so the
 * expectation stays tied to the fake's metrics.
 */
export const FAKE_CHAR_ASPECT = 0.6

interface Bitmap {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
}

/**
 * Surface → pixels, kept out of the surface object itself so `core` cannot
 * read pixels out of a `Drawable`. The real adapters' handles are opaque too,
 * and a fake that leaked pixels would let a bug compile here and fail there.
 */
const BITMAPS = new WeakMap<object, Bitmap>()

function allocate(width: number, height: number): { surface: CanvasSurface; bmp: Bitmap } {
  const bmp: Bitmap = { width, height, data: new Uint8ClampedArray(width * height * 4) }
  const surface: CanvasSurface = { width, height }
  BITMAPS.set(surface, bmp)
  return { surface, bmp }
}

type RGBA = [number, number, number, number]

function parseColor(css: string): RGBA {
  const s = css.trim().toLowerCase()
  if (s === 'white') return [255, 255, 255, 255]
  if (s === 'black') return [0, 0, 0, 255]
  const hex6 = /^#([0-9a-f]{6})$/.exec(s)
  if (hex6) {
    const n = parseInt(hex6[1]!, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]
  }
  const hex3 = /^#([0-9a-f]{3})$/.exec(s)
  if (hex3) {
    const d = hex3[1]!
    const c = (k: number) => parseInt(d[k]! + d[k]!, 16)
    return [c(0), c(1), c(2), 255]
  }
  const rgb = /^rgba?\(([^)]*)\)$/.exec(s)
  if (rgb) {
    const parts = rgb[1]!.split(',').map(p => Number(p.trim()))
    if (parts.length >= 3 && parts.every(p => Number.isFinite(p))) {
      return [parts[0]!, parts[1]!, parts[2]!, parts.length > 3 ? Math.round(parts[3]! * 255) : 255]
    }
  }
  // Loud, because a silently-black fill reads back as an empty mask and the
  // resulting test failure says nothing about the cause.
  throw new Error(`fakeCanvas: unsupported fillStyle ${JSON.stringify(css)}`)
}

/** Pull the px size out of a CSS font shorthand. */
function fontSize(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font)
  return m ? Number(m[1]) : 10
}

/** 2D affine matrix in canvas order: [a, b, c, d, e, f]. */
type Matrix = [number, number, number, number, number, number]

class FakeCtx implements Ctx2D {
  readonly canvas: CanvasSurface
  fillStyle = '#000000'
  font = '10px sans-serif'
  textBaseline: 'alphabetic' | 'top' | 'middle' | 'bottom' = 'alphabetic'

  private readonly bmp: Bitmap
  private m: Matrix = [1, 0, 0, 1, 0, 0]
  private readonly stack: Matrix[] = []
  private arcs: { x: number; y: number; r: number }[] = []

  constructor(width: number, height: number) {
    const { surface, bmp } = allocate(width, height)
    this.canvas = surface
    this.bmp = bmp
  }

  /** Test-only view of the backing store. */
  pixels(): Uint8ClampedArray {
    return this.bmp.data
  }

  save(): void {
    this.stack.push([...this.m])
  }

  restore(): void {
    const prev = this.stack.pop()
    if (prev) this.m = prev
  }

  translate(x: number, y: number): void {
    const [a, b, c, d, e, f] = this.m
    this.m = [a, b, c, d, e + a * x + c * y, f + b * x + d * y]
  }

  scale(sx: number, sy: number): void {
    const [a, b, c, d, e, f] = this.m
    this.m = [a * sx, b * sx, c * sy, d * sy, e, f]
  }

  rotate(angle: number): void {
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const [a, b, c, d, e, f] = this.m
    this.m = [a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin, e, f]
  }

  beginPath(): void {
    this.arcs = []
  }

  closePath(): void {
    /* no-op: the fake has no subpath state beyond pending arcs */
  }

  arc(x: number, y: number, r: number, _start: number, _end: number): void {
    // Angles are ignored: the rasteriser only ever draws full circles, and a
    // partial arc that silently filled whole would be worse than not claiming
    // support at all — see the note in fill().
    this.arcs.push({ x, y, r })
  }

  fill(): void {
    for (const a of this.arcs) {
      this.paintLocal(
        [a.x - a.r, a.y - a.r, a.x + a.r, a.y + a.r],
        (lx, ly) => (lx - a.x) ** 2 + (ly - a.y) ** 2 <= a.r ** 2,
        parseColor(this.fillStyle),
      )
    }
    this.arcs = []
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    this.paintLocal([x, y, x + w, y + h], () => true, [0, 0, 0, 0], true)
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.paintLocal([x, y, x + w, y + h], () => true, parseColor(this.fillStyle))
  }

  fillText(text: string, x: number, y: number): void {
    const size = fontSize(this.font)
    const cell = size * FAKE_CHAR_ASPECT
    const top =
      this.textBaseline === 'top' ? y :
      this.textBaseline === 'middle' ? y - size / 2 :
      y - size
    const colour = parseColor(this.fillStyle)
    for (let i = 0; i < text.length; i++) {
      if (text[i] === ' ') continue
      const left = x + i * cell
      this.paintLocal([left, top, left + cell, top + size], () => true, colour)
    }
  }

  measureText(text: string): { readonly width: number } {
    return { width: text.length * fontSize(this.font) * FAKE_CHAR_ASPECT }
  }

  createImageData(w: number, h: number): ImageDataLike {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }
  }

  /** Per the canvas spec, putImageData ignores the current transform. */
  putImageData(data: ImageDataLike, x: number, y: number): void {
    for (let sy = 0; sy < data.height; sy++) {
      const dy = y + sy
      if (dy < 0 || dy >= this.bmp.height) continue
      for (let sx = 0; sx < data.width; sx++) {
        const dx = x + sx
        if (dx < 0 || dx >= this.bmp.width) continue
        const s = (sy * data.width + sx) * 4
        const d = (dy * this.bmp.width + dx) * 4
        for (let k = 0; k < 4; k++) this.bmp.data[d + k] = data.data[s + k]!
      }
    }
  }

  drawImage(img: Drawable, x: number, y: number, w?: number, h?: number): void {
    const src = BITMAPS.get(img)
    if (!src) throw new Error('fakeCanvas: drawImage got a surface this fake did not allocate')
    const dw = w ?? src.width
    const dh = h ?? src.height
    if (dw <= 0 || dh <= 0) return
    this.paintLocal(
      [x, y, x + dw, y + dh],
      () => true,
      undefined,
      false,
      (lx, ly) => {
        const sx = Math.min(src.width - 1, Math.max(0, Math.floor(((lx - x) / dw) * src.width)))
        const sy = Math.min(src.height - 1, Math.max(0, Math.floor(((ly - y) / dh) * src.height)))
        const s = (sy * src.width + sx) * 4
        return [src.data[s]!, src.data[s + 1]!, src.data[s + 2]!, src.data[s + 3]!]
      },
    )
  }

  getImageData(x: number, y: number, w: number, h: number): ImageDataLike {
    const data = new Uint8ClampedArray(w * h * 4)
    for (let sy = 0; sy < h; sy++) {
      const py = y + sy
      if (py < 0 || py >= this.bmp.height) continue
      for (let sx = 0; sx < w; sx++) {
        const px = x + sx
        if (px < 0 || px >= this.bmp.width) continue
        const s = (py * this.bmp.width + px) * 4
        const d = (sy * w + sx) * 4
        for (let k = 0; k < 4; k++) data[d + k] = this.bmp.data[s + k]!
      }
    }
    return { width: w, height: h, data }
  }

  /* --------------------------------------------------------------- raster */

  /**
   * Rasterise a local-space axis-aligned box under the current transform.
   *
   * Inverse mapping (device pixel centre → local space) rather than forward
   * scan-conversion, because it handles rotation and scale with the same four
   * lines and cannot leave seams.
   */
  private paintLocal(
    box: [number, number, number, number],
    inside: (lx: number, ly: number) => boolean,
    colour: RGBA | undefined,
    erase = false,
    sample?: (lx: number, ly: number) => RGBA,
  ): void {
    const [a, b, c, d, e, f] = this.m
    const det = a * d - b * c
    if (det === 0) return
    const [x0, y0, x1, y1] = box

    const corners: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [lx, ly] of corners) {
      const dx = a * lx + c * ly + e
      const dy = b * lx + d * ly + f
      if (dx < minX) minX = dx
      if (dx > maxX) maxX = dx
      if (dy < minY) minY = dy
      if (dy > maxY) maxY = dy
    }
    const px0 = Math.max(0, Math.floor(minX))
    const py0 = Math.max(0, Math.floor(minY))
    const px1 = Math.min(this.bmp.width - 1, Math.ceil(maxX))
    const py1 = Math.min(this.bmp.height - 1, Math.ceil(maxY))

    for (let py = py0; py <= py1; py++) {
      for (let px = px0; px <= px1; px++) {
        const ox = px + 0.5 - e
        const oy = py + 0.5 - f
        const lx = (d * ox - c * oy) / det
        const ly = (-b * ox + a * oy) / det
        if (lx < x0 || lx >= x1 || ly < y0 || ly >= y1) continue
        if (!inside(lx, ly)) continue
        const rgba = sample ? sample(lx, ly) : colour
        if (!rgba) continue
        if (!erase && rgba[3] === 0) continue // source-over with alpha 0 is a no-op
        const i = (py * this.bmp.width + px) * 4
        this.bmp.data[i] = rgba[0]
        this.bmp.data[i + 1] = rgba[1]
        this.bmp.data[i + 2] = rgba[2]
        this.bmp.data[i + 3] = rgba[3]
      }
    }
  }
}

/* ---------------------------------------------------------------- fixtures */

export interface FakeImageSpec {
  width: number
  height: number
  /** Row-major RGBA, length width*height*4. */
  rgba: Uint8Array
}

export interface FakeGifSpec {
  width: number
  height: number
  frames: { rgba: Uint8Array; delayMs: number }[]
}

export interface FakeCanvasOpts {
  images?: Record<string, FakeImageSpec>
  gifs?: Record<string, FakeGifSpec>
}

/** Build an RGBA buffer from a per-pixel callback. */
export function rgbaImage(
  width: number,
  height: number,
  at: (x: number, y: number) => RGBA,
): FakeImageSpec {
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = at(x, y)
      const i = (y * width + x) * 4
      rgba[i] = r
      rgba[i + 1] = g
      rgba[i + 2] = b
      rgba[i + 3] = a
    }
  }
  return { width, height, rgba }
}

export interface FakeCanvas extends CanvasLike {
  /** Every context handed out, oldest first — for asserting on draw results. */
  readonly contexts: FakeCtx[]
}

export function fakeCanvas(opts: FakeCanvasOpts = {}): FakeCanvas {
  const contexts: FakeCtx[] = []
  return {
    contexts,
    make(w, h) {
      const ctx = new FakeCtx(w, h)
      contexts.push(ctx)
      return ctx
    },
    async loadImage(src): Promise<DecodedImage> {
      const spec = opts.images?.[src]
      if (!spec) throw new Error(`fakeCanvas: no image fixture for ${JSON.stringify(src)}`)
      const { surface, bmp } = allocate(spec.width, spec.height)
      bmp.data.set(spec.rgba)
      let hasAlpha = false
      for (let i = 3; i < spec.rgba.length; i += 4) {
        if (spec.rgba[i]! < 255) {
          hasAlpha = true
          break
        }
      }
      return { width: spec.width, height: spec.height, handle: surface, hasAlpha }
    },
    async loadGif(src): Promise<DecodedGif> {
      const spec = opts.gifs?.[src]
      if (!spec) throw new Error(`fakeCanvas: no gif fixture for ${JSON.stringify(src)}`)
      return {
        width: spec.width,
        height: spec.height,
        frames: spec.frames.map(f => ({ rgba: f.rgba, delayMs: f.delayMs })),
      }
    },
  }
}
