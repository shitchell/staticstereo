import { describe, it, expect } from 'vitest'
import { sirdsFromDepth, upscale } from './sirds.js'
import { dominantPeriod, rowOf } from './analysis.js'
import { DEFAULT_STEREO } from './types.js'
import type { SirdsOpts } from './types.js'

const W = 800,
  H = 200

/** Depth map: a flat slab at depth 1.0 spanning x in [300, 500), else 0. */
function slab(): Float32Array {
  const d = new Float32Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 300; x < 500; x++) d[y * W + x] = 1
  return d
}

describe('sirdsFromDepth', () => {
  const o: SirdsOpts = {
    sepFar: DEFAULT_STEREO.sepFar,
    sepNear: DEFAULT_STEREO.sepNear,
    cross: false,
    seed: 7,
  }

  it('encodes background depth as the sepFar repeat period', () => {
    const img = sirdsFromDepth(slab(), W, H, o)
    const row = rowOf(img, W, H / 2).slice(0, 250) // entirely background
    const { period, score } = dominantPeriod(row, 80, 140)
    expect(period).toBe(o.sepFar)
    expect(score).toBe(1) // background is an exact wallpaper repeat
  })

  it('encodes near depth as the sepNear repeat period', () => {
    const img = sirdsFromDepth(slab(), W, H, o)
    // Window fully inside the slab, offset past its leading edge so the
    // shorter period has room to establish itself.
    const row = rowOf(img, W, H / 2).slice(300, 500)
    const { period } = dominantPeriod(row, 80, 140)
    expect(period).toBe(o.sepNear)
  })

  it('produces a different period inside the object than outside', () => {
    const img = sirdsFromDepth(slab(), W, H, o)
    const bg = dominantPeriod(rowOf(img, W, H / 2).slice(0, 250), 80, 140).period
    const fg = dominantPeriod(rowOf(img, W, H / 2).slice(300, 500), 80, 140).period
    expect(fg).toBeLessThan(bg) // nearer == shorter period
  })

  it('is deterministic for a fixed seed', () => {
    const a = sirdsFromDepth(slab(), W, H, o)
    const b = sirdsFromDepth(slab(), W, H, o)
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('changes with the seed', () => {
    const a = sirdsFromDepth(slab(), W, H, { ...o, seed: 1 })
    const b = sirdsFromDepth(slab(), W, H, { ...o, seed: 2 })
    expect(Array.from(a)).not.toEqual(Array.from(b))
  })

  it('emits only two pixel values', () => {
    const img = sirdsFromDepth(slab(), W, H, o)
    expect([...new Set(img)].sort((p, q) => p - q)).toEqual([0, 255])
  })

  it('cross mode inverts which region is nearer', () => {
    const img = sirdsFromDepth(slab(), W, H, { ...o, cross: true })
    const bg = dominantPeriod(rowOf(img, W, H / 2).slice(0, 250), 80, 140).period
    const fg = dominantPeriod(rowOf(img, W, H / 2).slice(300, 500), 80, 140).period
    expect(fg).toBeGreaterThan(bg) // inverted: the slab is now further away
  })
})

describe('upscale', () => {
  it('scales both axes by nearest neighbour', () => {
    const src = new Uint8Array([0, 255, 255, 0]) // 2x2
    const out = upscale(src, 2, 2, 2) // -> 4x4
    expect(out.length).toBe(16)
    expect(Array.from(out.slice(0, 4))).toEqual([0, 0, 255, 255])
    expect(Array.from(out.slice(4, 8))).toEqual([0, 0, 255, 255])
  })

  it('multiplies the encoded period by the scale factor', () => {
    const o: SirdsOpts = {
      sepFar: DEFAULT_STEREO.sepFar,
      sepNear: DEFAULT_STEREO.sepNear,
      cross: false,
      seed: 7,
    }
    const scale = 2
    const img = sirdsFromDepth(slab(), W, H, o)
    const big = upscale(img, W, H, scale)
    const row = rowOf(big, W * scale, H).slice(0, 500)
    expect(dominantPeriod(row, 180, 260).period).toBe(o.sepFar * scale)
  })
})
