import { describe, it, expect } from 'vitest'
import { makeRng, noiseAt } from './rng.js'

describe('makeRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(7), b = makeRng(7)
    expect(Array.from({ length: 8 }, () => a())).toEqual(
      Array.from({ length: 8 }, () => b()),
    )
  })

  it('differs across seeds', () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)())
  })

  it('stays in [0, 1)', () => {
    const r = makeRng(3)
    for (let i = 0; i < 2000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('is roughly balanced around 0.5 (sanity, not a statistics suite)', () => {
    const r = makeRng(11)
    let lo = 0
    for (let i = 0; i < 10_000; i++) if (r() < 0.5) lo++
    expect(lo).toBeGreaterThan(4700)
    expect(lo).toBeLessThan(5300)
  })

  it('does not collapse to a constant when seeded with 0', () => {
    const r = makeRng(0)
    expect(new Set(Array.from({ length: 50 }, () => r())).size).toBeGreaterThan(40)
  })
})

describe('noiseAt', () => {
  it('is a pure function of position', () => {
    expect(noiseAt(7, 3, 9)).toBe(noiseAt(7, 3, 9))
  })

  it('has no draw order to desynchronise', () => {
    // The whole point: reading (5,5) first or last gives the same value.
    const direct = noiseAt(7, 5, 5)
    for (let i = 0; i < 50; i++) noiseAt(7, i, i)
    expect(noiseAt(7, 5, 5)).toBe(direct)
  })

  it('differs across x, y, and seed', () => {
    expect(noiseAt(7, 0, 0)).not.toBe(noiseAt(7, 1, 0))
    expect(noiseAt(7, 0, 0)).not.toBe(noiseAt(7, 0, 1))
    expect(noiseAt(7, 0, 0)).not.toBe(noiseAt(8, 0, 0))
  })

  it('does not correlate x with y (a weak hash makes diagonals)', () => {
    // A naive seed^x^y collapses on the diagonal: noiseAt(s,a,b) would equal
    // noiseAt(s,b,a) and the dot field would show visible structure.
    let same = 0
    for (let a = 0; a < 40; a++) for (let b = 0; b < 40; b++) {
      if (a !== b && noiseAt(3, a, b) === noiseAt(3, b, a)) same++
    }
    expect(same).toBe(0)
  })

  it('stays in [0, 1) and is roughly balanced over a real image area', () => {
    let lo = 0, n = 0
    for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
      const v = noiseAt(11, x, y)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
      if (v < 0.5) lo++
      n++
    }
    expect(lo / n).toBeGreaterThan(0.48)
    expect(lo / n).toBeLessThan(0.52)
  })
})
