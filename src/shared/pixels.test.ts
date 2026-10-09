import { describe, expect, it } from 'vitest'
import { anyTransparent } from './pixels.js'

/** `n` fully opaque black pixels. */
function opaque(n: number): Uint8Array {
  const d = new Uint8Array(n * 4)
  for (let i = 0; i < n; i++) d[i * 4 + 3] = 255
  return d
}

describe('anyTransparent', () => {
  it('is false when every pixel is fully opaque', () => {
    expect(anyTransparent(opaque(16))).toBe(false)
  })

  it('is true for a single pixel one step below opaque', () => {
    // 254, not 0: the silhouette/heightmap decision keys off "< 255", so a
    // threshold that only catches alpha 0 would mis-mode a feathered mask.
    const d = opaque(16)
    d[7 * 4 + 3] = 254
    expect(anyTransparent(d)).toBe(true)
  })

  it('finds transparency in the first and the last pixel', () => {
    const first = opaque(4)
    first[3] = 0
    expect(anyTransparent(first)).toBe(true)
    const last = opaque(4)
    last[15] = 0
    expect(anyTransparent(last)).toBe(true)
  })

  it('looks only at the alpha channel, not at colour', () => {
    const d = opaque(2)
    d[0] = 0; d[1] = 0; d[2] = 0        // black, opaque
    d[4] = 255; d[5] = 255; d[6] = 255  // white, opaque
    expect(anyTransparent(d)).toBe(false)
  })

  it('is false for an empty buffer', () => {
    expect(anyTransparent(new Uint8Array(0))).toBe(false)
  })

  it('accepts a Uint8ClampedArray, which is what getImageData returns', () => {
    expect(anyTransparent(new Uint8ClampedArray(4))).toBe(true)
  })
})
