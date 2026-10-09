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
