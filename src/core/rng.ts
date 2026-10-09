/**
 * mulberry32 — small, fast, deterministic, good enough for dot fields.
 *
 * Determinism is load-bearing rather than incidental: it makes `freezeNoise`
 * reproducible, and it is what lets every stereo test assert on exact pixel
 * values instead of statistical tolerances.
 */
export function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 0x9e3779b9
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Deterministic noise as a pure function of position.
 *
 * This exists because a *stream* was the wrong shape for the encoder. The
 * encoder draws a random value only where `x < sep`, so a row consumed exactly
 * `sep` numbers — and `sep` depends on that row's own depth. Changing any row
 * therefore re-phased the shared stream for every row below it.
 *
 * Shaun found it in the browser: with `freezeNoise` on, a marquee's background
 * held still until the text reached the left edge, at which point "the entire
 * bottom half of the screen started moving". The onset was exactly the frame
 * the text entered the `sepFar` seed strip and that row's draw count dropped.
 *
 * Hashing the coordinates removes the concept of draw order entirely: rows
 * become independent, `freezeNoise` is genuinely frozen, and a row's output
 * depends only on its own depth. (It also makes rows trivially parallelisable,
 * though nothing exploits that yet.)
 *
 * Mixing is xxhash-style: multiply, xor-shift, multiply. Cheap enough to call
 * per pixel and well-distributed enough for a dot field — verified by the
 * balance and independence tests in rng.test.ts.
 */
export function noiseAt(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) >>> 0
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d) >>> 0
  h ^= h >>> 12
  h = Math.imul(h, 0x297a2d39) >>> 0
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}
