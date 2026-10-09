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

describe('row independence', () => {
  const o: SirdsOpts = { sepFar: 110, sepNear: 92, cross: false, seed: 7 }

  /** Two rows. Row 0's depth is the variable; row 1 is identical in both. */
  function twoRows(topDepth: number): Float32Array {
    const w = 300
    const d = new Float32Array(w * 2)
    for (let x = 0; x < w; x++) d[x] = topDepth          // row 0: varies
    for (let x = 50; x < 100; x++) d[w + x] = 1          // row 1: fixed
    return d
  }

  // REGRESSION. The encoder used ONE sequential PRNG stream for the whole
  // image, drawn from only where x < sep. A row therefore consumed exactly
  // `sep` numbers, and `sep` depends on that row's own depth — so changing any
  // row re-phased the stream for every row BELOW it.
  //
  // Shaun hit this in the browser: with freezeNoise on, a marquee's background
  // sat still until the text reached the left edge, then "the entire bottom
  // half of the screen started moving". Measured on the real scene: zero rows
  // below the text band changed at frame 40 (text x = 107) and 259 changed at
  // frame 41 (text x = 93) — the instant the text entered the sepFar=110 seed
  // strip and that row's draw count dropped from 110 to ~97.
  it('a row is unaffected by the depth of the row above it', () => {
    const w = 300
    const flat = sirdsFromDepth(twoRows(0), w, 2, o)
    const near = sirdsFromDepth(twoRows(1), w, 2, o)
    expect(Array.from(near.slice(w, 2 * w))).toEqual(Array.from(flat.slice(w, 2 * w)))
  })

  it('a row is unaffected by image height', () => {
    // Same consequence, simpler probe: rendering more rows must not change
    // the ones already there.
    const w = 200
    const mk = (h: number) => {
      const d = new Float32Array(w * h)
      for (let y = 0; y < h; y++) for (let x = 40; x < 90; x++) d[y * w + x] = 1
      return sirdsFromDepth(d, w, h, o)
    }
    const short = mk(2), tall = mk(6)
    expect(Array.from(tall.slice(0, 2 * w))).toEqual(Array.from(short.slice(0, 2 * w)))
  })
})
