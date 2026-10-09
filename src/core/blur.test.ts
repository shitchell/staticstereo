import { describe, it, expect } from 'vitest'
import { blurDepth } from './blur.js'

const W = 24, H = 12

/** Hard vertical step: 0 on the left half, 1 on the right. */
function step(): Float32Array {
  const d = new Float32Array(W * H)
  for (let y = 0; y < H; y++) for (let x = W / 2; x < W; x++) d[y * W + x] = 1
  return d
}

function constant(v: number): Float32Array {
  return new Float32Array(W * H).fill(v)
}

describe('blurDepth', () => {
  it('leaves a flat field exactly flat', () => {
    // This is the edge-clamping test in disguise. Treating out-of-bounds as 0
    // would pull the border toward 0 and draw a dark frame around the image;
    // an unnormalised kernel would drift the whole field. Either bug shows up
    // here and nowhere else.
    const out = blurDepth(constant(0.42), W, H, 2)
    for (const v of out) expect(v).toBeCloseTo(0.42, 6)
  })

  it('softens a hard step into a ramp', () => {
    // The entire point: without this there is no ramp, and the encoder's
    // period jump stays abrupt (design §2.2).
    const out = blurDepth(step(), W, H, 2)
    const row = Array.from(out.slice((H / 2) * W, (H / 2) * W + W))
    const mid = row.slice(W / 2 - 3, W / 2 + 3)
    const intermediate = mid.filter(v => v > 0.05 && v < 0.95)
    expect(intermediate.length).toBeGreaterThan(0)
  })

  it('keeps the ramp monotonic across the step', () => {
    const out = blurDepth(step(), W, H, 2)
    const row = Array.from(out.slice((H / 2) * W, (H / 2) * W + W))
    for (let i = 1; i < row.length; i++) {
      expect(row[i]!).toBeGreaterThanOrEqual(row[i - 1]! - 1e-6)
    }
  })

  it('stays within the original value range', () => {
    const out = blurDepth(step(), W, H, 3)
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('preserves the mean of the field', () => {
    const src = step()
    const out = blurDepth(src, W, H, 2)
    const mean = (a: Float32Array) => a.reduce((s, v) => s + v, 0) / a.length
    expect(mean(out)).toBeCloseTo(mean(src), 4)
  })

  it('returns a copy, never the input, at radius 0', () => {
    // Downstream encoders quantise in place; aliasing a frame buffer here
    // would corrupt it. Same lesson as upscale(n=1).
    //
    // 0.5 rather than 0.3 on purpose: Float32Array rounds 0.3 to
    // 0.30000001192092896, so `toBe(0.3)` can never hold. Powers of two are
    // exact. This bit me writing the test.
    const src = constant(0.5)
    const out = blurDepth(src, W, H, 0)
    expect(out).not.toBe(src)
    out[0] = 99
    expect(src[0]).toBe(0.5)
  })

  it('treats negative and NaN radii as disabled rather than throwing', () => {
    expect(blurDepth(constant(0.5), W, H, -1)[0]).toBe(0.5)
    expect(blurDepth(constant(0.5), W, H, Number.NaN)[0]).toBe(0.5)
  })

  it('blurs more at a larger radius', () => {
    const at = (r: number) => {
      const row = blurDepth(step(), W, H, r).slice((H / 2) * W, (H / 2) * W + W)
      return Array.from(row).filter(v => v > 0.05 && v < 0.95).length
    }
    expect(at(3)).toBeGreaterThan(at(1))
  })

  it('is symmetric for a symmetric input', () => {
    const d = new Float32Array(W * H)
    for (let y = 0; y < H; y++) for (let x = 10; x < 14; x++) d[y * W + x] = 1
    const out = blurDepth(d, W, H, 2)
    const row = Array.from(out.slice((H / 2) * W, (H / 2) * W + W))
    for (let i = 0; i < W / 2; i++) {
      expect(row[i]!).toBeCloseTo(row[W - 1 - i]!, 5)
    }
  })
})
