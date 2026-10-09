import { describe, expect, it } from 'vitest'
import { GifReader } from 'omggif'
import { gifBlob, gifBytes, pngBlob } from './encode.js'
import type { GreyFrame } from '../shared/frames.js'

/**
 * `gifBytes` and `gifBlob` are fully testable under node: GIF encoding never
 * touches a canvas, and node has `Blob`. `pngBlob` cannot be — it is a forward
 * to `OffscreenCanvas.convertToBlob`, so only its missing-API diagnosis is
 * asserted here, and its output would need a browser.
 */

const W = 8, H = 6

function dots(seed: number): GreyFrame {
  let s = (seed >>> 0) || 1
  const pixels = new Uint8Array(W * H)
  for (let i = 0; i < pixels.length; i++) {
    s = (s * 1103515245 + 12345) >>> 0
    pixels[i] = s / 4294967296 < 0.5 ? 0 : 255
  }
  return { pixels, width: W, height: H }
}

async function readBlob(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

describe('gifBytes', () => {
  it('encodes frames to decodable GIF bytes', async () => {
    const r = new GifReader(await gifBytes([dots(1), dots(2)], { fps: 12 }))
    expect(r.width).toBe(W)
    expect(r.height).toBe(H)
    expect(r.numFrames()).toBe(2)
    expect(r.frameInfo(0).delay).toBe(8)       // 12fps quantises to 80ms
    expect(r.frameInfo(0).palette_size).toBe(2)
  })

  it('is pixel-exact for a dot field', async () => {
    const frame = dots(5)
    const r = new GifReader(await gifBytes([frame]))
    const rgba = new Uint8Array(W * H * 4)
    r.decodeAndBlitFrameRGBA(0, rgba)
    for (let i = 0; i < W * H; i++) expect(rgba[i * 4]).toBe(frame.pixels[i])
  })

  it('rejects an empty frame source', async () => {
    await expect(gifBytes([])).rejects.toThrow(/no frames/i)
  })
})

describe('gifBlob', () => {
  it('wraps the same bytes in an image/gif Blob, ready for a download link', async () => {
    const blob = await gifBlob([dots(3), dots(4)], { fps: 10 })
    expect(blob.type).toBe('image/gif')
    const r = new GifReader(await readBlob(blob))
    expect(r.numFrames()).toBe(2)
    expect(r.frameInfo(0).delay).toBe(10)
    expect(blob.size).toBe((await gifBytes([dots(3), dots(4)], { fps: 10 })).length)
  })
})

describe('pngBlob', () => {
  it('rejects with the missing-API diagnosis, naming the Node adapter', async () => {
    const err = await pngBlob(dots(1)).then(() => null, (e: unknown) => e as Error)
    expect(err).toBeInstanceOf(Error)
    expect(err!.message).toMatch(/OffscreenCanvas/)
    expect(err!.message).toMatch(/writePng|staticstereo\/node/)
  })

  it('validates the frame before it touches the platform', async () => {
    const bad: GreyFrame = { pixels: new Uint8Array(3), width: W, height: H }
    await expect(pngBlob(bad)).rejects.toThrow(/48.*got 3|pngBlob/)
  })
})
