import { describe, expect, it } from 'vitest'
import {
  FAIR_SAMPLES,
  PERIOD_MARGIN,
  UNMEASURED,
  WEAK_SAMPLES,
  describeReadout,
  expectedPeriods,
  formatPeriod,
  periodWindow,
  readPeriod,
  readRow,
  readSegment,
} from './diagnostics.js'
import { MIN_OVERLAP } from '../src/core/index.js'
import type { StereoOpts } from '../src/core/types.js'

const STEREO: StereoOpts = {
  sepFar: 110, sepNear: 92, noiseScale: 2, depthBlur: 1, cross: false, seed: 0,
  algorithm: 'shift',
}

/**
 * A binary row with an exact horizontal period and no shorter one.
 *
 * The self-check is not decoration. An earlier version built the cell from
 * `(i * 7 + i % 3) & 1`, whose true period is 6 — so `periodicRow(24, …)`
 * actually had period 6, and `readSegment(…, 16, 48)` correctly returned 18 (the
 * smallest multiple of 6 in range) while the test asserted 24. The fixture was
 * wrong and the code was right, which is the expensive way round to find out.
 */
function periodicRow(period: number, length: number): number[] {
  const cell: number[] = []
  for (let i = 0; i < period; i++) {
    let s = Math.imul(i + 1, 2654435761) >>> 0
    s = Math.imul(s ^ (s >>> 15), 2246822519) >>> 0
    cell.push((s >>> 13) & 1 ? 255 : 0)
  }
  for (let p = 1; p < period; p++) {
    if (period % p !== 0) continue
    let shorter = true
    for (let i = 0; i < period && shorter; i++) if (cell[i] !== cell[(i + p) % period]) shorter = false
    if (shorter) throw new Error(`periodicRow(${period}) fixture also has period ${p}`)
  }
  const out: number[] = []
  for (let i = 0; i < length; i++) out.push(cell[i % period]!)
  return out
}

describe('expectedPeriods / periodWindow', () => {
  it('scales both separations by noiseScale, which is where the factor of 2 lives', () => {
    expect(expectedPeriods(STEREO)).toEqual({ near: 184, far: 220 })
    expect(expectedPeriods({ ...STEREO, noiseScale: 1 })).toEqual({ near: 92, far: 110 })
  })

  it('brackets the expected range with a margin', () => {
    expect(periodWindow(STEREO)).toEqual({ lo: 184 - PERIOD_MARGIN, hi: 220 + PERIOD_MARGIN })
  })

  it('never scans below a 2px period', () => {
    expect(periodWindow({ ...STEREO, sepNear: 2, sepFar: 4, noiseScale: 1 }).lo).toBe(2)
  })
})

describe('readPeriod', () => {
  it('measures an exact period and reports the comparison count', () => {
    const r = readPeriod(periodicRow(8, 408), 4, 12)
    expect(r.period).toBe(8)
    expect(r.score).toBe(1)
    expect(r.samples).toBe(400)
    expect(r.measured).toBe(true)
    expect(r.confidence).toBe('strong')
  })

  it('reports an unmeasurable window as unmeasured, never as a number', () => {
    // dominantPeriod returns period: NaN when no candidate has MIN_OVERLAP
    // comparisons behind it. Rendering that as a number would put "NaN px" in
    // the panel; treating it as 0 would be worse, because 0 looks like a
    // measurement.
    const r = readPeriod(periodicRow(8, MIN_OVERLAP + 2), 20, 40)
    expect(Number.isNaN(r.period)).toBe(true)
    expect(r.measured).toBe(false)
    expect(r.samples).toBe(0)
    expect(r.confidence).toBe('none')
    expect(formatPeriod(r)).toBe(UNMEASURED)
    expect(describeReadout(r)).not.toMatch(/NaN/)
    expect(describeReadout(r)).not.toMatch(/\d+\s*px/)
  })

  it('grades thin evidence as weak even when the score is perfect', () => {
    const r = readPeriod(periodicRow(8, 8 + 20), 8, 8)
    expect(r.period).toBe(8)
    expect(r.score).toBe(1)
    expect(r.samples).toBe(20)
    expect(r.samples).toBeLessThan(WEAK_SAMPLES)
    expect(r.confidence).toBe('weak')
  })

  it('grades a mid-sized window as fair', () => {
    const r = readPeriod(periodicRow(8, 8 + 100), 8, 8)
    expect(r.samples).toBe(100)
    expect(r.samples).toBeGreaterThanOrEqual(WEAK_SAMPLES)
    expect(r.samples).toBeLessThan(FAIR_SAMPLES)
    expect(r.confidence).toBe('fair')
  })

  it('does not call a weak score strong just because the window is wide', () => {
    // A row of independent noise has no period; dominantPeriod still returns
    // whichever candidate scored best. Reporting that as a strong measurement
    // of a 184px period is precisely the lie the panel must not tell.
    const noise: number[] = []
    let s = 12345
    for (let i = 0; i < 1000; i++) {
      s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff
      // Bit 20, not bit 0: the low bit of an LCG modulo a power of two has
      // period 2, which would make this "noise" exactly periodic at every even
      // lag and the test would assert the opposite of what it means to.
      noise.push((s >>> 20) & 1 ? 255 : 0)
    }
    const r = readPeriod(noise, 176, 228)
    expect(r.score).toBeLessThan(0.75)
    expect(r.confidence).toBe('weak')
  })

  it('distinguishes 20 comparisons from 400, which is the whole point of samples', () => {
    const thin = readPeriod(periodicRow(8, 8 + 20), 8, 8)
    const thick = readPeriod(periodicRow(8, 8 + 400), 8, 8)
    expect(thin.period).toBe(thick.period)
    expect(thin.score).toBe(thick.score)
    expect(describeReadout(thin)).not.toBe(describeReadout(thick))
    expect(describeReadout(thin)).toContain('20')
    expect(describeReadout(thick)).toContain('400')
  })
})

describe('formatPeriod / describeReadout', () => {
  it('formats a measured period with its unit', () => {
    expect(formatPeriod(readPeriod(periodicRow(8, 408), 4, 12))).toBe('8 px')
  })

  it('names the confidence grade so a number is never shown bare', () => {
    const d = describeReadout(readPeriod(periodicRow(8, 8 + 20), 8, 8))
    expect(d).toContain('8 px')
    expect(d).toContain('weak')
  })
})

describe('readRow', () => {
  const frame = { pixels: new Uint8Array(40 * 3), width: 40, height: 3 }

  it('measures the requested row of a frame', () => {
    const pixels = new Uint8Array(40 * 3)
    const row = periodicRow(8, 40)
    for (let x = 0; x < 40; x++) pixels[1 * 40 + x] = row[x]!
    const r = readRow({ pixels, width: 40, height: 3 }, 1, 4, 12)
    expect(r.period).toBe(8)
  })

  it('refuses a row outside the frame and names the bound', () => {
    expect(() => readRow(frame, 3, 4, 12)).toThrowError(/height 3/)
    expect(() => readRow(frame, -1, 4, 12)).toThrowError(/height 3/)
  })
})

describe('readSegment', () => {
  /**
   * The reason this exists at all, found by running the page in a browser: a
   * *full-width* row of a real scene crosses both the object and the
   * background, and `dominantPeriod` returns the one period that best explains
   * the whole row — which is the background's, because the background is almost
   * always the larger share. Measured on the `emerge` example at full rise:
   * the full row reported 220px (= sepFar × 2) at 87% match, and no row
   * anywhere in the frame could report 184px (= sepNear × 2). The object shows
   * up only as that drop from 100%.
   *
   * Core's own `render.test.ts` does not have this problem because it slices an
   * x-band before measuring. The panel has to do the same or it cannot show the
   * near period at all, which is half of what design §6 says the measurement is
   * for.
   */
  function bandedFrame(): { pixels: Uint8Array; width: number; height: number } {
    const width = 600
    const pixels = new Uint8Array(width)
    // x < 300: period 40. x >= 300: period 24.
    const far = periodicRow(40, 300)
    const near = periodicRow(24, 300)
    for (let x = 0; x < 300; x++) pixels[x] = far[x]!
    for (let x = 0; x < 300; x++) pixels[300 + x] = near[x]!
    return { pixels, width, height: 1 }
  }

  it('measures the band it is given, not the row it sits in', () => {
    const frame = bandedFrame()
    expect(readSegment(frame, 0, 0, 300, 16, 48).period).toBe(40)
    expect(readSegment(frame, 0, 300, 600, 16, 48).period).toBe(24)
  })

  it('reports a sample count scoped to the band, which is why callers must check it', () => {
    const frame = bandedFrame()
    const wide = readSegment(frame, 0, 300, 500, 24, 24)
    const narrow = readSegment(frame, 0, 300, 348, 24, 24)
    expect(wide.samples).toBe(176)
    expect(narrow.samples).toBe(24)
    expect(wide.confidence).toBe('fair')
    expect(narrow.confidence).toBe('weak')
  })

  it('reports a band too narrow for the candidate range as unmeasured', () => {
    const frame = bandedFrame()
    const r = readSegment(frame, 0, 300, 320, 24, 48)
    expect(r.measured).toBe(false)
    expect(formatPeriod(r)).toBe(UNMEASURED)
  })

  it('refuses an empty or reversed band and names the frame width', () => {
    const frame = bandedFrame()
    expect(() => readSegment(frame, 0, 100, 100, 16, 48)).toThrowError(/width 600/)
    expect(() => readSegment(frame, 0, 200, 100, 16, 48)).toThrowError(/width 600/)
    expect(() => readSegment(frame, 0, -1, 100, 16, 48)).toThrowError(/width 600/)
    expect(() => readSegment(frame, 0, 0, 601, 16, 48)).toThrowError(/width 600/)
  })

  it('refuses a row outside the frame', () => {
    expect(() => readSegment(bandedFrame(), 1, 0, 10, 4, 6)).toThrowError(/height 1/)
  })
})
