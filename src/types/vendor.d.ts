/**
 * Hand-written types for the two dependencies that ship no declarations.
 *
 * Both are CommonJS. The difference in how they must be imported is not a
 * style choice, it is a runtime constraint measured on node 22:
 *
 *   - `omggif` ends with a literal `exports.GifWriter = ...; exports.GifReader = ...`,
 *     which node's cjs-module-lexer detects, so named ESM imports work.
 *   - `gifenc` is an esbuild CJS bundle whose exports are *getters* installed via
 *     `Object.defineProperty`. The lexer cannot see them, so
 *     `import { GIFEncoder } from 'gifenc'` throws
 *     `SyntaxError: Named export 'GIFEncoder' not found`.
 *     It must be a default import, then destructured.
 *
 * The declarations below encode that: `gifenc` exports only a default.
 */

declare module 'omggif' {
  export interface GifFrameInfo {
    /** Subrect origin within the logical screen. Partial frames are the norm. */
    x: number
    y: number
    /** Subrect size, NOT the logical screen size. */
    width: number
    height: number
    has_local_palette: boolean
    palette_offset: number
    palette_size: number
    data_offset: number
    data_length: number
    /** Palette index treated as transparent, or null if the frame has none. */
    transparent_index: number | null
    interlaced: boolean
    /** Delay in 1/100 s units — multiply by 10 for milliseconds. */
    delay: number
    /**
     * 0 = unspecified, 1 = do not dispose, 2 = restore to background,
     * 3 = restore to previous. `decodeAndBlitFrameRGBA` does NOT act on this;
     * the caller must.
     */
    disposal: number
  }

  export class GifReader {
    constructor(buf: Uint8Array)
    /** Logical screen width. */
    readonly width: number
    /** Logical screen height. */
    readonly height: number
    numFrames(): number
    loopCount(): number
    frameInfo(frameNum: number): GifFrameInfo
    /**
     * *Blits* frame `frameNum` onto `pixels` (length width*height*4). Only the
     * frame's own subrect is touched, and transparent pixels are skipped
     * entirely, so whatever was already in the buffer shows through.
     */
    decodeAndBlitFrameRGBA(frameNum: number, pixels: Uint8Array | Uint8ClampedArray): void
    decodeAndBlitFrameBGRA(frameNum: number, pixels: Uint8Array | Uint8ClampedArray): void
  }

  export interface GifWriterFrameOpts {
    /** Packed 0xRRGGBB entries. Length must be a power of two, 2..256. */
    palette?: readonly number[] | null
    /** 1/100 s units. */
    delay?: number
    disposal?: number
    transparent?: number | null
  }

  export class GifWriter {
    constructor(
      buf: Uint8Array,
      width: number,
      height: number,
      gopts?: { loop?: number; palette?: readonly number[]; background?: number },
    )
    addFrame(
      x: number, y: number, w: number, h: number,
      indexedPixels: Uint8Array | readonly number[],
      opts?: GifWriterFrameOpts,
    ): number
    /** Writes the trailer and returns the total byte length written to `buf`. */
    end(): number
    getOutputBuffer(): Uint8Array
    getOutputBufferPosition(): number
  }
}

declare module 'gifenc' {
  /** `[r, g, b]` or `[r, g, b, a]` byte tuples. */
  export type GifPalette = number[][]

  export type GifColorFormat = 'rgb565' | 'rgb444' | 'rgba4444'

  export interface GifFrameOpts {
    palette?: GifPalette | null
    first?: boolean
    transparent?: boolean
    transparentIndex?: number
    /** Milliseconds. gifenc rounds to the GIF spec's 10ms unit. */
    delay?: number
    /** -1 = play once, 0 = forever, >0 = repeat count. */
    repeat?: number
    colorDepth?: number
    dispose?: number
  }

  export interface GifEncoderInstance {
    reset(): void
    finish(): void
    bytes(): Uint8Array
    bytesView(): Uint8Array
    writeHeader(): void
    writeFrame(
      index: Uint8Array, width: number, height: number, opts?: GifFrameOpts,
    ): void
  }

  export interface QuantizeOpts {
    format?: GifColorFormat
    oneBitAlpha?: boolean | number
    clearAlpha?: boolean
    clearAlphaThreshold?: number
    clearAlphaColor?: number
  }

  interface Gifenc {
    GIFEncoder(opts?: { initialCapacity?: number; auto?: boolean }): GifEncoderInstance
    /** May return FEWER than `maxColors` entries for low-colour input. */
    quantize(
      rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: QuantizeOpts,
    ): GifPalette
    applyPalette(
      rgba: Uint8Array | Uint8ClampedArray, palette: GifPalette, format?: GifColorFormat,
    ): Uint8Array
    prequantize(
      rgba: Uint8Array | Uint8ClampedArray,
      opts?: { roundRGB?: number; roundAlpha?: number; oneBitAlpha?: boolean | number },
    ): void
    nearestColor(palette: GifPalette, pixel: number[]): number[]
    nearestColorIndex(palette: GifPalette, pixel: number[]): number
    nearestColorIndexWithDistance(palette: GifPalette, pixel: number[]): [number, number]
    snapColorsToPalette(palette: GifPalette, knownColors: number[][], threshold?: number): void
  }

  const gifenc: Gifenc
  export default gifenc
}
