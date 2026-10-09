import { describe, expect, it } from 'vitest'
import { GifReader } from 'omggif'
import { decodeGif, encodeGif } from './gif.js'
import type { GreyFrame } from './frames.js'
import {
  dispose2Gif, dispose3Gif, keepGif, makeGif, solid3Gif,
} from './testing/gifFixtures.js'

/**
 * These are the isomorphic halves of both adapters: `omggif` and `gifenc` are
 * dependency-free and run identically under node and in a browser, so the
 * disposal model and the palette guard are tested here, once, under node —
 * rather than duplicated into a web suite that cannot run.
 */

const W = 16, H = 12

/** Deterministic binary dot field — the real payload shape, not a flat colour. */
function dots(seed: number): GreyFrame {
  let s = (seed >>> 0) || 1
  const pixels = new Uint8Array(W * H)
  for (let i = 0; i < pixels.length; i++) {
    s = (s * 1103515245 + 12345) >>> 0
    pixels[i] = s / 4294967296 < 0.5 ? 0 : 255
  }
  return { pixels, width: W, height: H }
}

function solid(value: number): GreyFrame {
  return { pixels: new Uint8Array(W * H).fill(value), width: W, height: H }
}

/** The four RGBA bytes at (x, y) of a width-`w` buffer. */
function px(rgba: ArrayLike<number>, w: number, x: number, y: number): number[] {
  const o = (y * w + x) * 4
  return [rgba[o]!, rgba[o + 1]!, rgba[o + 2]!, rgba[o + 3]!]
}

describe('decodeGif', () => {
  it('reports the logical screen size and frame count', () => {
    const g = decodeGif(solid3Gif())
    expect(g.width).toBe(4)
    expect(g.height).toBe(4)
    expect(g.frames).toHaveLength(3)
  })

  it('converts GIF 1/100s delays to milliseconds (12fps reads back as 80ms)', () => {
    for (const f of decodeGif(solid3Gif()).frames) expect(f.delayMs).toBe(80)
  })

  it('returns full-screen RGBA buffers even for partial frames', () => {
    // The second frame of this fixture is a 2x2 subrect of a 4x4 screen.
    for (const f of decodeGif(dispose2Gif()).frames) expect(f.rgba.length).toBe(4 * 4 * 4)
  })

  it('returns the frames distinctly, each in its own buffer', () => {
    const [a, b, c] = decodeGif(solid3Gif()).frames
    expect(px(a!.rgba, 4, 0, 0)).toEqual([255, 0, 0, 255])
    expect(px(b!.rgba, 4, 0, 0)).toEqual([0, 255, 0, 255])
    expect(px(c!.rgba, 4, 0, 0)).toEqual([0, 0, 255, 255])
    // Handing out views on the shared compositing canvas would make every
    // frame equal to the last.
    expect(a!.rgba).not.toBe(b!.rgba)
    a!.rgba[0] = 7
    expect(b!.rgba[0]).not.toBe(7)
  })

  it('disposal 2: does not bleed a disposed frame into the next one', () => {
    // decodeAndBlitFrameRGBA *blits*: it writes only the frame's own subrect
    // and skips transparent pixels. Hand it one reused buffer and frame 0
    // survives underneath frame 1 even though frame 0 asked to be cleared.
    const f1 = decodeGif(dispose2Gif()).frames[1]!.rgba
    expect(px(f1, 4, 0, 0)).toEqual([0, 255, 0, 255])  // the 2x2 subrect
    expect(px(f1, 4, 3, 3)).toEqual([0, 0, 0, 0])      // disposed to background
    expect(px(f1, 4, 3, 0)).toEqual([0, 0, 0, 0])
  })

  it('disposal 1: keeps the previous frame underneath', () => {
    // The opposite error: clearing the buffer every frame loses the background
    // that partial-frame GIFs (what gifsicle and ffmpeg emit) rely on.
    const f1 = decodeGif(keepGif()).frames[1]!.rgba
    expect(px(f1, 4, 0, 0)).toEqual([0, 255, 0, 255])    // subrect on top
    expect(px(f1, 4, 3, 3)).toEqual([255, 0, 0, 255])    // frame 0 still there
  })

  it('disposal 3: restores what was underneath the disposed frame', () => {
    // Frame 1 is a green 2x2 at the top left declaring "restore to previous";
    // frame 2 paints blue at the bottom right. Where the green was, frame 0's
    // red must be back — not green (ignored disposal) and not transparent
    // (disposal 2's behaviour applied to 3).
    const g = decodeGif(dispose3Gif())
    expect(px(g.frames[1]!.rgba, 4, 0, 0)).toEqual([0, 255, 0, 255])
    const f2 = g.frames[2]!.rgba
    expect(px(f2, 4, 0, 0)).toEqual([255, 0, 0, 255])
    expect(px(f2, 4, 3, 3)).toEqual([0, 0, 255, 255])
  })

  it('clips a disposal rect that runs past the logical screen', () => {
    // Malformed-but-playable, and it happens: the frame rect exceeds the
    // screen. Frame 0 covers (2,2)..(3,3) plus whatever omggif's blit spills
    // onto the next rows, then asks for disposal 2 over a 4x4 rect at (2,2).
    // Clearing that rect without clamping x wraps 8 bytes into the following
    // row and erases pixels the frame never owned.
    const bytes = makeGif(4, 4, [
      { index: 1, disposal: 2, x: 2, y: 2, w: 4, h: 4 },
      { index: 2, x: 0, y: 0, w: 1, h: 1 },
    ])
    const g = decodeGif(bytes)
    expect(g.frames).toHaveLength(2)
    expect(g.frames[0]!.rgba.length).toBe(4 * 4 * 4)
    const f1 = g.frames[1]!.rgba
    expect(px(f1, 4, 0, 0)).toEqual([0, 255, 0, 255])   // frame 1's 1x1 subrect
    expect(px(f1, 4, 3, 3)).toEqual([0, 0, 0, 0])       // inside the cleared rect
    expect(px(f1, 4, 0, 3)).toEqual([255, 0, 0, 255])   // outside it — must survive
  })

  it('throws a message naming the source when the bytes are not a GIF', () => {
    const notAGif = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])
    expect(() => decodeGif(notAGif, 'logo.png')).toThrow(/logo\.png/)
    expect(() => decodeGif(notAGif, 'logo.png')).toThrow(/gif/i)
  })

  it('throws on empty input rather than returning zero frames', () => {
    expect(() => decodeGif(new Uint8Array(0), 'empty.gif')).toThrow(/empty\.gif/)
  })
})

describe('encodeGif', () => {
  it('returns bytes that decode to the expected size and frame count', async () => {
    const r = new GifReader(await encodeGif([dots(1), dots(2), dots(3)], { fps: 12 }))
    expect(r.width).toBe(W)
    expect(r.height).toBe(H)
    expect(r.numFrames()).toBe(3)
  })

  it('quantises a 12fps delay to 80ms, per the GIF 10ms storage unit', async () => {
    const r = new GifReader(await encodeGif([dots(1), dots(2)], { fps: 12 }))
    expect(r.frameInfo(0).delay).toBe(8)
    expect(r.frameInfo(1).delay).toBe(8)
  })

  it('honours an explicit delayMs over fps', async () => {
    const r = new GifReader(await encodeGif([solid(0)], { fps: 12, delayMs: 200 }))
    expect(r.frameInfo(0).delay).toBe(20)
  })

  it('loops forever by default and honours an explicit repeat count', async () => {
    expect(new GifReader(await encodeGif([solid(0)])).loopCount()).toBe(0)
    expect(new GifReader(await encodeGif([solid(0)], { loop: 3 })).loopCount()).toBe(3)
  })

  it('uses a 2-colour global palette', async () => {
    const r = new GifReader(await encodeGif([dots(1)], { fps: 10 }))
    expect(r.frameInfo(0).palette_size).toBe(2)
  })

  it('is pixel-exact: a 2-colour palette makes GIF lossless for dot fields', async () => {
    const frames = [dots(7), dots(8)]
    const r = new GifReader(await encodeGif(frames, { fps: 10 }))
    for (let f = 0; f < frames.length; f++) {
      const rgba = new Uint8Array(W * H * 4)
      r.decodeAndBlitFrameRGBA(f, rgba)
      for (let i = 0; i < W * H; i++) {
        expect(rgba[i * 4]).toBe(frames[f]!.pixels[i])
        expect(rgba[i * 4 + 1]).toBe(frames[f]!.pixels[i])
        expect(rgba[i * 4 + 2]).toBe(frames[f]!.pixels[i])
      }
    }
  })

  it('still writes two palette entries when the first frame is a single colour', async () => {
    // quantize(allBlack, 2) returns ONE colour. Taking that as the global
    // palette collapses every later frame to black — silent total data loss.
    const r = new GifReader(await encodeGif([solid(0), dots(3)], { fps: 10 }))
    expect(r.frameInfo(0).palette_size).toBe(2)
    const rgba = new Uint8Array(W * H * 4)
    r.decodeAndBlitFrameRGBA(1, rgba)
    const vals = new Set<number>()
    for (let i = 0; i < W * H; i++) vals.add(rgba[i * 4]!)
    expect([...vals].sort((a, b) => a - b)).toEqual([0, 255])
  })

  it('accepts an async iterable so callers need not buffer every frame', async () => {
    async function* gen(): AsyncGenerator<GreyFrame> { yield dots(1); yield dots(2) }
    expect(new GifReader(await encodeGif(gen(), { fps: 10 })).numFrames()).toBe(2)
  })

  it('rejects an empty frame source instead of returning a broken file', async () => {
    await expect(encodeGif([], { fps: 10 })).rejects.toThrow(/no frames/i)
  })

  it('rejects a frame whose size differs from the first', async () => {
    const odd: GreyFrame = { pixels: new Uint8Array(4), width: 2, height: 2 }
    await expect(encodeGif([dots(1), odd], { fps: 10 }))
      .rejects.toThrow(/16x12.*2x2|size/i)
  })

  it('uses the caller-supplied label in frame errors, so adapters keep their own', async () => {
    const bad: GreyFrame = { pixels: new Uint8Array(3), width: W, height: H }
    await expect(encodeGif([bad], {}, 'writeGif')).rejects.toThrow(/writeGif frame 0/)
  })
})

describe('encodeGif + decodeGif round-trip', () => {
  it('reads back every frame of its own output pixel-exactly', async () => {
    const frames = [dots(31), dots(32), dots(33)]
    const g = decodeGif(await encodeGif(frames, { fps: 10 }))
    expect(g.width).toBe(W)
    expect(g.height).toBe(H)
    expect(g.frames).toHaveLength(3)
    for (let f = 0; f < frames.length; f++) {
      expect(g.frames[f]!.delayMs).toBe(100)
      for (let i = 0; i < W * H; i++) {
        expect(g.frames[f]!.rgba[i * 4]).toBe(frames[f]!.pixels[i])
        expect(g.frames[f]!.rgba[i * 4 + 3]).toBe(255)
      }
    }
  })
})
