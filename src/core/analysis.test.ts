import { describe, it, expect } from 'vitest'
import { dominantPeriod, rowOf, MIN_OVERLAP } from './analysis.js'

/** A row with an exact repeat period of `p`, built from a fixed pattern. */
function periodic(length: number, p: number): number[] {
  const seed = Array.from({ length: p }, (_, i) => ((i * 37) % 7 < 3 ? 0 : 255))
  return Array.from({ length }, (_, i) => seed[i % p]!)
}

describe('dominantPeriod', () => {
  it('finds an exact period and reports full confidence', () => {
    const r = dominantPeriod(periodic(500, 110), 80, 140)
    expect(r.period).toBe(110)
    expect(r.score).toBe(1)
  })

  it('reports the fundamental, not a harmonic', () => {
    // A row with period 50 also matches perfectly at 100 and 150.
    const r = dominantPeriod(periodic(600, 50), 40, 160)
    expect(r.period).toBe(50)
  })

  it('reports how many comparisons backed the answer', () => {
    const r = dominantPeriod(periodic(500, 110), 80, 140)
    expect(r.samples).toBe(500 - 110)
  })

  it('returns NaN rather than a period it never measured', () => {
    // Window of 90 with candidates 80..140: only p=80..74 would clear the
    // overlap floor, so nothing in range is measurable.
    const r = dominantPeriod(periodic(90, 110), 120, 140)
    expect(r.period).toBeNaN()
    expect(r.score).toBe(0)
    expect(r.samples).toBe(0)
  })

  it('never returns a result backed by fewer than MIN_OVERLAP comparisons', () => {
    // Sweep shrinking windows; any non-NaN answer must carry real evidence.
    for (let len = 20; len <= 300; len += 7) {
      const r = dominantPeriod(periodic(len, 110), 80, 140)
      if (!Number.isNaN(r.period)) {
        expect(r.samples).toBeGreaterThanOrEqual(MIN_OVERLAP)
        expect(len - r.period).toBe(r.samples)
      }
    }
  })

  it('does not treat a short coin-flip streak as a period', () => {
    // 10 samples cannot support any candidate in 80..140.
    expect(dominantPeriod([0, 255, 0, 255, 0, 255, 0, 255, 0, 255], 80, 140).period).toBeNaN()
  })
})

describe('rowOf', () => {
  it('extracts the requested row from a row-major buffer', () => {
    const buf = new Uint8Array([1, 2, 3, 4, 5, 6])
    expect(rowOf(buf, 3, 0)).toEqual([1, 2, 3])
    expect(rowOf(buf, 3, 1)).toEqual([4, 5, 6])
  })
})
