import { describe, it, expect } from 'vitest'
import { cubicBezier } from './bezier.js'

/**
 * The curve, evaluated forward, written independently of the solver.
 *
 * Bernstein form with `P0 = 0` and `P3 = 1`, where `bezier.ts` uses the
 * expanded Horner form. Deliberately a *different* arrangement of the same
 * definition: it is the spec the solver is checked against, so sharing the
 * implementation's arithmetic would make the check circular.
 */
function forward(p1: number, p2: number, s: number): number {
  const u = 1 - s
  return 3 * u * u * s * p1 + 3 * u * s * s * p2 + s * s * s
}

/** 0, 1/32, …, 1 — enough samples to catch a solver that is right only near an end. */
const SAMPLES = Array.from({ length: 33 }, (_, i) => i / 32)

/**
 * Properties, not decimals.
 *
 * Invariant 4: pin the guarantee, not today's arithmetic. Nothing below names
 * an interior value of a named curve — a tightened Newton tolerance would move
 * every one of those in the last digits without changing a single thing that
 * matters, and a test that went red for it would be noise with a stack trace.
 */
describe('cubicBezier', () => {
  it('pins both endpoints exactly, whatever the control points do', () => {
    // Exactly, not approximately: `evalTrack` multiplies the easing by a
    // keyframe delta, so an `f(1)` of 0.9999999 leaves a layer a hair short of
    // its final pose forever. The endpoints are the curve's own definition
    // (it runs from (0,0) to (1,1)), not something the solver should iterate
    // towards.
    for (const [x1, y1, x2, y2] of [
      [0, 0, 1, 1], [0.42, 0, 0.58, 1], [0.25, 0.1, 0.25, 1],
      [0.68, -0.55, 0.265, 1.55], [1, 0, 0, 1],
    ] as const) {
      const f = cubicBezier(x1, y1, x2, y2)
      expect(f(0), `${x1},${y1},${x2},${y2}`).toBe(0)
      expect(f(1), `${x1},${y1},${x2},${y2}`).toBe(1)
    }
  })

  it('is the identity for the diagonal control set', () => {
    // `cubic-bezier(0,0,1,1)` is CSS's own spelling of `linear`, so an author
    // writing it must get a straight line and not a curve that merely passes
    // through the right endpoints.
    const f = cubicBezier(0, 0, 1, 1)
    for (const t of SAMPLES) expect(f(t), `t=${t}`).toBeCloseTo(t, 6)
  })

  it('maps progress along x to the value at y — checked against the forward curve', () => {
    // The whole content of the solver. For a parameter `s`, the point on the
    // curve is `(x(s), y(s))`; asking the easing for progress `x(s)` must give
    // back `y(s)`. This pins the inversion rather than re-deriving it: the
    // right-hand side is computed by `forward()` above, which knows nothing
    // about Newton-Raphson.
    //
    // Every curve here has a strictly positive x derivative. The one that
    // does not gets its own test below, because its accuracy is bounded by
    // double precision rather than by the solver.
    for (const [x1, y1, x2, y2] of [
      [0.42, 0, 0.58, 1], [0.25, 0.1, 0.25, 1], [0.17, 0.67, 0.83, 0.67],
      [0.68, -0.55, 0.265, 1.55], [0, 0.5, 1, 0.5],
    ] as const) {
      const f = cubicBezier(x1, y1, x2, y2)
      for (const s of SAMPLES) {
        expect(f(forward(x1, x2, s)), `${x1},${y1},${x2},${y2} @ s=${s}`)
          .toBeCloseTo(forward(y1, y2, s), 6)
      }
    }
  })

  it('inverts a curve that is flat in x as closely as doubles allow', () => {
    // `cubic-bezier(1,0,0,1)` — the near-step curve — has `x'(s) = 3(2s−1)²`,
    // which is zero at the midpoint. Around there `x(s) − 0.5` grows as
    // `4(s−0.5)³`, so for `|s − 0.5|` under ~3e-6 the difference is smaller
    // than one ulp of 0.5 and `x` is *literally constant* in IEEE doubles
    // across that window. No solver can resolve `s` better than that here,
    // whatever its tolerance, and the y error it implies is ~5e-6.
    //
    // The bound below is therefore an envelope around a precision limit, not
    // a solver tolerance — which is also why it is asserted as a bound rather
    // than pinned as a value. Measured worst case here is 2.9e-6; the
    // x-tolerance solver this one deliberately is not (see `EPSILON` in
    // `bezier.ts`) measures 1.1e-5 on the same curve while reporting itself
    // converged to 1e-7.
    const f = cubicBezier(1, 0, 0, 1)
    for (const s of SAMPLES) {
      expect(Math.abs(f(forward(1, 0, s)) - forward(0, 1, s)), `s=${s}`)
        .toBeLessThan(1e-4)
    }
  })

  it('is monotonically non-decreasing when the control points are', () => {
    // A curve whose y controls lie in 0..1 in order cannot turn back on
    // itself, and a layer easing with it must never travel backwards. A
    // solver that picked the wrong root, or one whose bisection bracket was
    // inverted, shows up here as a step in the wrong direction.
    for (const [x1, y1, x2, y2] of [
      [0.42, 0, 0.58, 1], [0.25, 0.1, 0.25, 1], [0.17, 0.67, 0.83, 0.67],
      [0.5, 0.05, 0.5, 0.95],
    ] as const) {
      const f = cubicBezier(x1, y1, x2, y2)
      let prev = -Infinity
      for (const t of SAMPLES) {
        const v = f(t)
        expect(v, `${x1},${y1},${x2},${y2} @ t=${t}`).toBeGreaterThanOrEqual(prev)
        prev = v
      }
    }
  })

  it('lets y overshoot 0..1, because that is what an anticipation curve is', () => {
    // `y1`/`y2` are unbounded on purpose. A back/anticipation curve pulls
    // below 0 before it moves and past 1 before it settles, and clamping the
    // output would turn exactly that into a flat spot.
    const f = cubicBezier(0.68, -0.55, 0.265, 1.55)
    expect(Math.min(...SAMPLES.map(f))).toBeLessThan(0)
    expect(Math.max(...SAMPLES.map(f))).toBeGreaterThan(1)
  })

  it('stays below the diagonal when both y controls are at 0', () => {
    // A convexity property rather than a value: controls on or under the
    // diagonal cannot produce a curve above it. This catches a solver that
    // has x and y transposed, which every endpoint test above would pass.
    const f = cubicBezier(0.42, 0, 1, 1)
    for (const t of SAMPLES) expect(f(t), `t=${t}`).toBeLessThanOrEqual(t + 1e-9)
  })

  it('refuses an x control point outside 0..1', () => {
    // Outside the range `x(s)` stops being monotonic, so "the value at
    // progress t" has more than one answer and the solver is ill-defined.
    // CSS imposes the same constraint for the same reason.
    const bad: ReadonlyArray<readonly [number, number, number, number]> = [
      [-0.1, 0, 0.5, 1], [1.1, 0, 0.5, 1], [0.5, 0, -0.01, 1], [0.5, 0, 1.5, 1],
    ]
    for (const [x1, y1, x2, y2] of bad) {
      expect(() => cubicBezier(x1, y1, x2, y2), `${x1},${y1},${x2},${y2}`).toThrow(/0\.\.1/)
    }
  })

  it('accepts the closed endpoints of the x range', () => {
    // 0 and 1 are legal — `cubic-bezier(0,0,1,1)` and `cubic-bezier(1,0,0,1)`
    // are both real CSS curves, and an exclusive bound would reject them.
    expect(() => cubicBezier(0, 0, 1, 1)).not.toThrow()
    expect(() => cubicBezier(1, 0, 0, 1)).not.toThrow()
  })

  it('refuses a non-finite control point on either axis', () => {
    // A `NaN` y is not an overshoot, it is a layer whose transform is `NaN`
    // for the whole scene — and `NaN` propagates silently through every
    // arithmetic step between here and the canvas.
    const bad: ReadonlyArray<readonly [number, number, number, number]> = [
      [NaN, 0, 0.5, 1], [0.5, NaN, 0.5, 1], [0.5, 0, 0.5, Infinity],
      [0.5, 0, NaN, 1],
    ]
    for (const [x1, y1, x2, y2] of bad) {
      expect(() => cubicBezier(x1, y1, x2, y2), `${x1},${y1},${x2},${y2}`).toThrow(/finite/)
    }
  })

  it('clamps progress outside 0..1 to the endpoints', () => {
    // The curve is only defined for x in 0..1. `evalTrack` already normalises
    // its local time, so this is a guard rather than a feature: extrapolating
    // a cubic past its domain diverges fast, and one bad caller would get a
    // layer flung off the plate rather than a visible error.
    const f = cubicBezier(0.42, 0, 0.58, 1)
    expect(f(-1)).toBe(0)
    expect(f(2)).toBe(1)
  })
})
