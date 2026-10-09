import { describe, expect, it } from 'vitest'
import { depthToRgba, greyToRgba } from './depthmap.js'

/**
 * The depth panel is the only way to tell an authoring bug from an encoding
 * bug (design §5), so its mapping has to be boring and exact: a depth of 1 must
 * read as white and a depth of 0 as black, with nothing clever in between.
 */
describe('depthToRgba', () => {
  it('maps 0 to black and 1 to white', () => {
    const out = depthToRgba(Float32Array.from([0, 1]))
    expect([...out.slice(0, 4)]).toEqual([0, 0, 0, 255])
    expect([...out.slice(4, 8)]).toEqual([255, 255, 255, 255])
  })

  it('maps the midpoint to mid grey', () => {
    expect(depthToRgba(Float32Array.from([0.5]))[0]).toBe(128)
  })

  // The next two pin the *guarantee* rather than a branch of depthToRgba:
  // writing to a Uint8ClampedArray clamps and maps NaN to 0 by specification,
  // so the implementation relies on that instead of re-checking. They are what
  // fails if the output ever becomes a plain Uint8Array, where 1.5 wraps to 127
  // and draws a dark patch exactly where the nearest surface is.
  it('clamps depths outside 0..1 instead of wrapping them', () => {
    const out = depthToRgba(Float32Array.from([-0.5, 1.5]))
    expect(out[0]).toBe(0)
    expect(out[4]).toBe(255)
  })

  it('renders a NaN depth as black rather than as undefined bytes', () => {
    const out = depthToRgba(Float32Array.from([Number.NaN]))
    expect([...out.slice(0, 4)]).toEqual([0, 0, 0, 255])
  })

  it('is fully opaque everywhere', () => {
    const out = depthToRgba(Float32Array.from([0, 0.25, 0.5, 0.75, 1]))
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255)
  })

  it('emits four bytes per depth sample', () => {
    expect(depthToRgba(new Float32Array(7)).length).toBe(28)
  })

  it('writes into a provided buffer and returns it, so the panel can reuse one', () => {
    const buf = new Uint8ClampedArray(8)
    const out = depthToRgba(Float32Array.from([1, 0]), buf)
    expect(out).toBe(buf)
    expect(buf[0]).toBe(255)
  })

  it('rejects a provided buffer of the wrong size instead of writing part of it', () => {
    expect(() => depthToRgba(Float32Array.from([1, 0]), new Uint8ClampedArray(4)))
      .toThrowError(/8 bytes/)
  })
})

describe('greyToRgba', () => {
  it('replicates each sample across RGB and sets alpha opaque', () => {
    const out = greyToRgba(Uint8Array.from([0, 255, 128]))
    expect([...out]).toEqual([0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255])
  })

  it('rejects a provided buffer of the wrong size', () => {
    expect(() => greyToRgba(Uint8Array.from([1]), new Uint8ClampedArray(3)))
      .toThrowError(/4 bytes/)
  })
})
