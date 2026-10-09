/**
 * The drawing surface `core` needs, as an interface rather than an import.
 *
 * This is the seam that makes the core isomorphic: Node injects an adapter over
 * `@napi-rs/canvas`, the browser injects one over `OffscreenCanvas`, and nothing
 * in `src/core/` imports either. Keeping this interface *narrow* is the point —
 * every method added here is a method both adapters must implement, so add only
 * what the rasteriser actually calls.
 */

export interface CanvasSurface {
  readonly width: number
  readonly height: number
}

export interface ImageDataLike {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
}

/**
 * Anything `drawImage` accepts. Deliberately opaque: core never inspects a
 * decoded image, it only positions one, so the concrete type is the adapter's
 * business.
 */
export type Drawable = CanvasSurface

export interface DecodedImage extends CanvasSurface {
  /** Opaque handle the owning adapter can pass to its own `drawImage`. */
  readonly handle: Drawable
  /** True if any pixel has alpha < 255 — decides silhouette vs heightmap. */
  readonly hasAlpha: boolean
}

export interface DecodedGif extends CanvasSurface {
  readonly frames: readonly GifFrame[]
}

export interface GifFrame {
  /** Row-major RGBA, length width*height*4. */
  readonly rgba: Uint8Array
  /**
   * Frame delay in milliseconds. Note GIF stores this in 10ms units, so values
   * are always multiples of 10 — a requested 83ms (12fps) reads back as 80ms.
   */
  readonly delayMs: number
}

/** The 2D context subset the rasteriser uses. */
export interface Ctx2D {
  readonly canvas: CanvasSurface

  save(): void
  restore(): void
  translate(x: number, y: number): void
  rotate(angle: number): void
  scale(x: number, y: number): void

  clearRect(x: number, y: number, w: number, h: number): void
  fillRect(x: number, y: number, w: number, h: number): void
  beginPath(): void
  arc(x: number, y: number, r: number, start: number, end: number): void
  closePath(): void
  fill(): void

  fillText(text: string, x: number, y: number): void
  measureText(text: string): { readonly width: number }

  createImageData(w: number, h: number): ImageDataLike
  putImageData(data: ImageDataLike, x: number, y: number): void
  drawImage(img: Drawable, x: number, y: number, w?: number, h?: number): void
  getImageData(x: number, y: number, w: number, h: number): ImageDataLike

  fillStyle: string
  font: string
  textBaseline: 'alphabetic' | 'top' | 'middle' | 'bottom'
}

export interface CanvasLike {
  /** Allocate a fresh surface of exactly w x h and return its 2D context. */
  make(w: number, h: number): Ctx2D
  /** Decode a still image (PNG/JPEG/…) from a path or URL. */
  loadImage(src: string): Promise<DecodedImage>
  /** Decode an animated GIF into RGBA frames. */
  loadGif(src: string): Promise<DecodedGif>
}
