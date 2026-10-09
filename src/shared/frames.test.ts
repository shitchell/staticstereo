import { describe, expect, it } from 'vitest'
import { checkFrame, iterate, toRgba, type GreyFrame } from './frames.js'

const frame = (w: number, h: number, fill = 0): GreyFrame =>
  ({ pixels: new Uint8Array(w * h).fill(fill), width: w, height: h })

async function collect(src: AsyncIterable<GreyFrame>): Promise<GreyFrame[]> {
  const out: GreyFrame[] = []
  for await (const f of src) out.push(f)
  return out
}

describe('checkFrame', () => {
  it('accepts a frame whose pixel count matches its size', () => {
    expect(() => checkFrame(frame(4, 3), 'x')).not.toThrow()
  })

  it('rejects a pixel buffer of the wrong length, naming both numbers', () => {
    const bad: GreyFrame = { pixels: new Uint8Array(3), width: 16, height: 12 }
    expect(() => checkFrame(bad, 'writeGif frame 0')).toThrow(/writeGif frame 0/)
    expect(() => checkFrame(bad, 'x')).toThrow(/192/)
    expect(() => checkFrame(bad, 'x')).toThrow(/got 3/)
  })

  it('rejects a zero or negative dimension', () => {
    expect(() => checkFrame({ pixels: new Uint8Array(0), width: 0, height: 4 }, 'x'))
      .toThrow(/bad frame size 0x4/)
    expect(() => checkFrame({ pixels: new Uint8Array(0), width: 4, height: -1 }, 'x'))
      .toThrow(/bad frame size/)
  })

  it('rejects a non-integer dimension rather than silently rounding', () => {
    expect(() => checkFrame({ pixels: new Uint8Array(6), width: 1.5, height: 4 }, 'x'))
      .toThrow(/bad frame size/)
  })
})

describe('toRgba', () => {
  it('expands greyscale to fully opaque RGBA', () => {
    const rgba = toRgba({ pixels: Uint8Array.from([0, 128, 255]), width: 3, height: 1 })
    expect(rgba.length).toBe(12)
    expect(Array.from(rgba)).toEqual([0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255])
  })
})

describe('iterate', () => {
  it('walks a sync iterable', async () => {
    const got = await collect(iterate([frame(1, 1, 1), frame(1, 1, 2)]))
    expect(got.map(f => f.pixels[0])).toEqual([1, 2])
  })

  it('walks an async iterable', async () => {
    async function* gen(): AsyncGenerator<GreyFrame> {
      yield frame(1, 1, 3)
      yield frame(1, 1, 4)
    }
    const got = await collect(iterate(gen()))
    expect(got.map(f => f.pixels[0])).toEqual([3, 4])
  })

  it('yields nothing for an empty source', async () => {
    expect(await collect(iterate([]))).toEqual([])
  })
})
