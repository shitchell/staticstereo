import { describe, it, expect } from 'vitest'
import { degToRad, radToDeg } from './angle.js'

/**
 * The deg↔rad seam. It exists as a named pair because this codebase keeps two
 * angle conventions side by side — `shape.start`/`end` are degrees,
 * `Transform.rotate`/`rotateX`/`rotateY` are radians — and the only converter
 * before this one was a `RAD` constant private to `raster.ts`, which is how a
 * second private copy gets written instead of imported.
 */
describe('degToRad / radToDeg', () => {
  it('converts the half turn exactly, because that is the value callers pin', () => {
    // `Math.PI`, not 3.14159…: `flip` writes exactly a half turn and `rotate`
    // {to: 180} must land on the same double, or an equality assertion
    // downstream becomes a tolerance one for no reason.
    expect(degToRad(180)).toBe(Math.PI)
    expect(degToRad(90)).toBe(Math.PI / 2)
    expect(degToRad(360)).toBe(2 * Math.PI)
    expect(degToRad(0)).toBe(0)
  })

  it('keeps the sign, so a negative angle is a turn the other way', () => {
    expect(degToRad(-180)).toBe(-Math.PI)
    expect(radToDeg(-Math.PI)).toBe(-180)
  })

  it('round-trips the cardinal angles', () => {
    for (const deg of [0, 30, 45, 90, 180, 270, 360, -90]) {
      expect(radToDeg(degToRad(deg)), `${deg}°`).toBeCloseTo(deg, 10)
    }
  })
})
