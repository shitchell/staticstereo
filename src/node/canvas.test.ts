import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas'
import { nodeCanvas } from './canvas.js'
import { dispose2Gif, keepGif, solid3Gif } from '../shared/testing/gifFixtures.js'

/**
 * Every fixture here is generated at run time. Committing a binary GIF/PNG
 * would make the trap this file exists to catch (frame bleed in `loadGif`)
 * invisible to review: you could not tell a wrong expectation from a wrong
 * fixture without a hex editor.
 *
 * The GIF fixtures and the disposal-model assertions they feed now live in
 * `src/shared/` alongside the decoder itself, which both adapters share. What
 * stays here is this adapter's own wiring: that a *path* on disk reaches that
 * decoder, and that failures name the file.
 */

function png(draw: (ctx: SKRSContext2D) => void, w: number, h: number): Buffer {
  const c = createCanvas(w, h)
  draw(c.getContext('2d'))
  return c.encodeSync('png')
}

/** No pixel is even slightly transparent. */
function opaquePng(w: number, h: number): Buffer {
  return png(ctx => {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, Math.floor(h / 2))
  }, w, h)
}

/** Left half opaque white, right half never painted — alpha 0. */
function alphaPng(w: number, h: number): Buffer {
  return png(ctx => {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, Math.floor(w / 2), h)
  }, w, h)
}

let dir: string
const paths: Record<string, string> = {}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'stst-canvas-'))
  const write = async (name: string, bytes: Uint8Array) => {
    const p = join(dir, name)
    await writeFile(p, bytes)
    paths[name] = p
  }
  await write('opaque.png', opaquePng(8, 8))
  await write('alpha.png', alphaPng(8, 8))
  await write('solid3.gif', solid3Gif())
  await write('dispose2.gif', dispose2Gif())
  await write('keep.gif', keepGif())
})

afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

/** The four RGBA bytes at (x, y) of a width-`w` buffer. */
function px(rgba: ArrayLike<number>, w: number, x: number, y: number): number[] {
  const o = (y * w + x) * 4
  return [rgba[o]!, rgba[o + 1]!, rgba[o + 2]!, rgba[o + 3]!]
}

describe('nodeCanvas().make', () => {
  it('returns a context whose backing store is exactly w x h', () => {
    const ctx = nodeCanvas().make(37, 11)
    expect(ctx.canvas.width).toBe(37)
    expect(ctx.canvas.height).toBe(11)
  })

  it('allocates an independent surface per call', () => {
    const cv = nodeCanvas()
    const a = cv.make(4, 4)
    const b = cv.make(4, 4)
    a.fillStyle = '#fff'
    a.fillRect(0, 0, 4, 4)
    expect(px(Uint8Array.from(b.getImageData(0, 0, 4, 4).data), 4, 0, 0)).toEqual([0, 0, 0, 0])
  })

  it('starts transparent black', () => {
    const ctx = nodeCanvas().make(2, 2)
    expect(Array.from(ctx.getImageData(0, 0, 2, 2).data)).toEqual(new Array(16).fill(0))
  })

  it('fillRect writes the fillStyle colour and getImageData reads it back', () => {
    const ctx = nodeCanvas().make(4, 4)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(1, 1, 2, 2)
    const d = Uint8Array.from(ctx.getImageData(0, 0, 4, 4).data)
    expect(px(d, 4, 1, 1)).toEqual([255, 255, 255, 255])
    expect(px(d, 4, 0, 0)).toEqual([0, 0, 0, 0])
  })

  it('clearRect erases back to transparent', () => {
    const ctx = nodeCanvas().make(4, 4)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 4, 4)
    ctx.clearRect(0, 0, 2, 4)
    const d = Uint8Array.from(ctx.getImageData(0, 0, 4, 4).data)
    expect(px(d, 4, 0, 0)).toEqual([0, 0, 0, 0])
    expect(px(d, 4, 3, 0)).toEqual([255, 255, 255, 255])
  })

  it('save/translate/restore is a real transform stack', () => {
    const ctx = nodeCanvas().make(8, 4)
    ctx.fillStyle = '#fff'
    ctx.save()
    ctx.translate(4, 0)
    ctx.fillRect(0, 0, 1, 1)   // lands at x=4
    ctx.restore()
    ctx.fillRect(0, 0, 1, 1)   // lands at x=0
    const d = Uint8Array.from(ctx.getImageData(0, 0, 8, 4).data)
    expect(px(d, 8, 4, 0)).toEqual([255, 255, 255, 255])
    expect(px(d, 8, 0, 0)).toEqual([255, 255, 255, 255])
    expect(px(d, 8, 1, 0)).toEqual([0, 0, 0, 0])
  })

  it('scale multiplies subsequent geometry', () => {
    const ctx = nodeCanvas().make(8, 8)
    ctx.fillStyle = '#fff'
    ctx.scale(2, 2)
    ctx.fillRect(0, 0, 2, 2)   // covers 0..4 in device space
    const d = Uint8Array.from(ctx.getImageData(0, 0, 8, 8).data)
    expect(px(d, 8, 3, 3)).toEqual([255, 255, 255, 255])
    expect(px(d, 8, 5, 5)).toEqual([0, 0, 0, 0])
  })

  it('arc + fill paints a disc', () => {
    const ctx = nodeCanvas().make(16, 16)
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(8, 8, 5, 0, Math.PI * 2)
    ctx.closePath()
    ctx.fill()
    const d = Uint8Array.from(ctx.getImageData(0, 0, 16, 16).data)
    expect(px(d, 16, 8, 8)).toEqual([255, 255, 255, 255])
    expect(px(d, 16, 0, 0)).toEqual([0, 0, 0, 0])
  })

  // **This test is deliberately weak and must not be mistaken for a text
  // test.** It says the plumbing works: a font can be set, measured and drawn.
  // It passed for a day while `sans-serif` silently resolved to a dingbat font
  // and every rendered string was unreadable — the fallback draws MORE ink than
  // DejaVu Sans does, so an ink count can never see it. Whether real glyphs
  // come out is `canvas.generics.test.ts`'s job.
  it('fillText marks pixels and measureText grows with font size', () => {
    const ctx = nodeCanvas().make(200, 60)
    ctx.fillStyle = '#fff'
    ctx.textBaseline = 'top'
    ctx.font = '40px sans-serif'
    const big = ctx.measureText('HELLO').width
    ctx.font = '10px sans-serif'
    const small = ctx.measureText('HELLO').width
    expect(big).toBeGreaterThan(0)
    expect(big).toBeGreaterThan(small * 2)

    ctx.font = '40px sans-serif'
    ctx.fillText('HELLO', 0, 0)
    const d = ctx.getImageData(0, 0, 200, 60).data
    let lit = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) lit++
    expect(lit).toBeGreaterThan(50)
  })

  it('createImageData / putImageData / getImageData round-trips bytes', () => {
    const ctx = nodeCanvas().make(4, 2)
    const id = ctx.createImageData(4, 2)
    expect(id.width).toBe(4)
    expect(id.height).toBe(2)
    for (let i = 0; i < 8; i++) {
      id.data[i * 4] = i * 30
      id.data[i * 4 + 1] = i * 30
      id.data[i * 4 + 2] = i * 30
      id.data[i * 4 + 3] = 255
    }
    ctx.putImageData(id, 0, 0)
    const back = ctx.getImageData(0, 0, 4, 2).data
    expect(Array.from(back.subarray(0, 8))).toEqual([0, 0, 0, 255, 30, 30, 30, 255])
  })
})

describe('nodeCanvas().loadImage', () => {
  it('reports the decoded dimensions', async () => {
    const img = await nodeCanvas().loadImage(paths['opaque.png']!)
    expect(img.width).toBe(8)
    expect(img.height).toBe(8)
  })

  it('hasAlpha is false when every pixel is fully opaque', async () => {
    const img = await nodeCanvas().loadImage(paths['opaque.png']!)
    expect(img.hasAlpha).toBe(false)
  })

  it('hasAlpha is true when any pixel has alpha < 255', async () => {
    const img = await nodeCanvas().loadImage(paths['alpha.png']!)
    expect(img.hasAlpha).toBe(true)
  })

  it('returns a handle the same adapter can drawImage', async () => {
    const cv = nodeCanvas()
    const img = await cv.loadImage(paths['opaque.png']!)
    const ctx = cv.make(8, 8)
    ctx.drawImage(img.handle, 0, 0)
    const d = Uint8Array.from(ctx.getImageData(0, 0, 8, 8).data)
    expect(px(d, 8, 0, 0)).toEqual([255, 255, 255, 255])  // top half white
    expect(px(d, 8, 0, 7)).toEqual([0, 0, 0, 255])        // bottom half black
  })

  it('scales when drawImage is given a width and height', async () => {
    const cv = nodeCanvas()
    const img = await cv.loadImage(paths['opaque.png']!)
    const ctx = cv.make(16, 16)
    ctx.drawImage(img.handle, 0, 0, 16, 16)
    const d = Uint8Array.from(ctx.getImageData(0, 0, 16, 16).data)
    expect(px(d, 16, 0, 0)).toEqual([255, 255, 255, 255])
    expect(px(d, 16, 0, 15)).toEqual([0, 0, 0, 255])
  })

  it('rejects with a message naming the source, not a bare decoder error', async () => {
    const missing = join(dir, 'nope-does-not-exist.png')
    await expect(nodeCanvas().loadImage(missing)).rejects.toThrow(
      new RegExp(`nope-does-not-exist\\.png`),
    )
    await expect(nodeCanvas().loadImage(missing)).rejects.toThrow(/load image/i)
  })
})

describe('nodeCanvas().loadGif', () => {
  it('reports the logical screen size and frame count', async () => {
    const g = await nodeCanvas().loadGif(paths['solid3.gif']!)
    expect(g.width).toBe(4)
    expect(g.height).toBe(4)
    expect(g.frames).toHaveLength(3)
  })

  it('converts GIF 1/100s delays to milliseconds (12fps reads back as 80ms)', async () => {
    const g = await nodeCanvas().loadGif(paths['solid3.gif']!)
    for (const f of g.frames) expect(f.delayMs).toBe(80)
  })

  it('returns full-size RGBA buffers', async () => {
    const g = await nodeCanvas().loadGif(paths['solid3.gif']!)
    for (const f of g.frames) expect(f.rgba.length).toBe(4 * 4 * 4)
  })

  it('returns three distinct frames', async () => {
    const g = await nodeCanvas().loadGif(paths['solid3.gif']!)
    const [a, b, c] = g.frames
    expect(px(a!.rgba, 4, 0, 0)).toEqual([255, 0, 0, 255])
    expect(px(b!.rgba, 4, 0, 0)).toEqual([0, 255, 0, 255])
    expect(px(c!.rgba, 4, 0, 0)).toEqual([0, 0, 255, 255])
  })

  it('gives each frame its own buffer', async () => {
    const g = await nodeCanvas().loadGif(paths['solid3.gif']!)
    const [a, b] = g.frames
    expect(a!.rgba).not.toBe(b!.rgba)
    a!.rgba[0] = 7
    expect(b!.rgba[0]).not.toBe(7)
  })

  it('does not bleed a disposed frame into the next one', async () => {
    // decodeAndBlitFrameRGBA *blits*: it only writes the frame's own subrect and
    // skips transparent pixels. Hand it one reused buffer and frame 0 survives
    // underneath frame 1 even though frame 0 asked to be cleared.
    const g = await nodeCanvas().loadGif(paths['dispose2.gif']!)
    const f1 = g.frames[1]!.rgba
    expect(px(f1, 4, 0, 0)).toEqual([0, 255, 0, 255])  // the 2x2 subrect
    expect(px(f1, 4, 3, 3)).toEqual([0, 0, 0, 0])      // disposed to background
    expect(px(f1, 4, 3, 0)).toEqual([0, 0, 0, 0])
  })

  it('keeps the previous frame underneath when disposal says "do not dispose"', async () => {
    // The opposite error: clearing the buffer every frame loses the background
    // that partial-frame GIFs (what gifsicle and ffmpeg emit) rely on.
    const g = await nodeCanvas().loadGif(paths['keep.gif']!)
    const f1 = g.frames[1]!.rgba
    expect(px(f1, 4, 0, 0)).toEqual([0, 255, 0, 255])    // subrect on top
    expect(px(f1, 4, 3, 3)).toEqual([255, 0, 0, 255])    // frame 0 still there
  })

  it('rejects with a message naming the source when the bytes are not a GIF', async () => {
    await expect(nodeCanvas().loadGif(paths['opaque.png']!)).rejects.toThrow(/opaque\.png/)
    await expect(nodeCanvas().loadGif(paths['opaque.png']!)).rejects.toThrow(/gif/i)
  })

  it('rejects with a message naming the source when the file is missing', async () => {
    await expect(nodeCanvas().loadGif(join(dir, 'absent.gif'))).rejects.toThrow(/absent\.gif/)
  })
})
