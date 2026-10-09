import { noiseAt } from './rng.js'
import type { SirdsOpts } from './types.js'

/**
 * Turn a depth map into a random-dot stereogram.
 *
 * Each row is walked left to right, copying the pixel from `sep` px back.
 * `sep` shrinks as depth approaches 1, and your fused eyes read that shorter
 * repeat period as "nearer". Columns with no source yet (x < sep) seed the row
 * with fresh random pixels.
 *
 * Row-major is both correct and cache-friendly: within a row the dependency is
 * strictly leftward, so `out[y*w + (x-sep)]` is always already written.
 *
 * @param depth row-major, length w*h, values 0..1 (1 = nearest)
 * @returns row-major greyscale, length w*h, values 0 or 255
 */
export function sirdsFromDepth(
  depth: Float32Array,
  w: number,
  h: number,
  o: SirdsOpts,
): Uint8Array {
  const out = new Uint8Array(w * h)
  const range = o.sepFar - o.sepNear
  const maxSep = w - 1

  for (let y = 0; y < h; y++) {
    const base = y * w
    for (let x = 0; x < w; x++) {
      const i = base + x
      let z = depth[i]!
      if (o.cross) z = 1 - z
      if (z < 0) z = 0
      else if (z > 1) z = 1

      let sep = Math.round(o.sepFar - z * range)
      if (sep < 2) sep = 2
      else if (sep > maxSep) sep = maxSep

      const src = x - sep
      out[i] = src >= 0 ? out[base + src]! : noiseAt(o.seed, x, y) < 0.5 ? 0 : 255
    }
  }
  return out
}

/**
 * Nearest-neighbour upscale. Chunkier noise pixels fuse more easily.
 *
 * Always returns a fresh buffer, including at `n === 1`. Returning `src` there
 * would be zero-copy but makes the return value an alias of the caller's
 * frame — and downstream encoders quantise in place, so a frame buffer reused
 * across frames would be silently corrupted. One memcpy on the uncommon path
 * is worth not having that bug.
 */
export function upscale(src: Uint8Array, w: number, h: number, n: number): Uint8Array {
  if (n === 1) return src.slice()
  const W = w * n
  const out = new Uint8Array(W * h * n)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = src[y * w + x]!
      for (let dy = 0; dy < n; dy++) {
        const rowStart = (y * n + dy) * W + x * n
        for (let dx = 0; dx < n; dx++) out[rowStart + dx] = v
      }
    }
  }
  return out
}
