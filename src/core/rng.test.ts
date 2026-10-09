import { describe, it, expect } from 'vitest'
import { makeRng } from './rng.js'

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
