import { describe, it, expect, vi } from 'vitest'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { run } from './index.js'
import { dominantPeriod } from '../core/index.js'
import { decodeGif } from '../shared/gif.js'

/**
 * End-to-end tests for the CLI. These write real files into real temp
 * directories and then *measure* them, because "exited 0" is not evidence that
 * a stereogram pipeline was wired up correctly (design §6).
 */

interface Capture {
  out: string
  err: string
  io: { out(s: string): void; err(s: string): void }
}

function capture(): Capture {
  const c: Capture = {
    out: '',
    err: '',
    io: {
      out: (s: string) => { c.out += `${s}\n` },
      err: (s: string) => { c.err += `${s}\n` },
    },
  }
  return c
}

async function dir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'stst-cli-'))
}

/** Run the CLI, returning the exit code alongside whatever it printed. */
async function cli(argv: string[]): Promise<Capture & { code: number }> {
  const c = capture()
  const code = await run(argv, c.io)
  return { ...c, code, out: c.out, err: c.err }
}

async function readPng(path: string): Promise<{
  width: number; height: number; data: Uint8ClampedArray
}> {
  const img = await loadImage(path)
  const width = img.naturalWidth || img.width
  const height = img.naturalHeight || img.height
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  return { width, height, data: ctx.getImageData(0, 0, width, height).data }
}

/* ------------------------------------------------------------------ fixtures */

/**
 * A flat slab on a background, with the same geometry the core's own period
 * tests use: small separations so a measurement window fits, and a slab whose
 * interior is well clear of the `depthBlur` ramp at its edge.
 */
const SEP = { sepFar: 30, sepNear: 20 }
const NOISE = 2
const W = 240
const H = 24
const SLAB_X = 80
/** Measurement windows in *scene* px; the frame is NOISE times wider. */
const BG: [number, number] = [0, 60]
const SLAB: [number, number] = [120, 240]

const SLAB_SCENE =
  `size: [${W}, ${H}]\n` +
  'fps: 12\n' +
  'duration: 1\n' +
  `stereo: {sepFar: ${SEP.sepFar}, sepNear: ${SEP.sepNear}, noiseScale: ${NOISE}, seed: 7}\n` +
  'layers:\n' +
  `  - {type: shape, shape: rect, at: [${SLAB_X}, 0], w: ${W - SLAB_X}, h: ${H}, depth: 1}\n`

/** A scene whose only layer is off-screen at t=0 — design §4.1's trap. */
const MARQUEE_SCENE =
  `size: [${W}, ${H}]\n` +
  'fps: 12\n' +
  'duration: 1\n' +
  `stereo: {sepFar: ${SEP.sepFar}, sepNear: ${SEP.sepNear}, noiseScale: 1, seed: 7}\n` +
  'layers:\n' +
  '  - {type: text, text: HELLO, size: 16, depth: 1, anim: {kind: marquee, speed: 400}}\n'

async function scene(body: string, name = 'scene.yaml'): Promise<{ dir: string; path: string }> {
  const d = await dir()
  const path = join(d, name)
  await writeFile(path, body)
  return { dir: d, path }
}

/** One row of an RGBA buffer as single-channel samples. */
function rgbaRow(data: ArrayLike<number>, width: number, y: number): number[] {
  const out = new Array<number>(width)
  for (let x = 0; x < width; x++) out[x] = data[(y * width + x) * 4]!
  return out
}

/** Measure the repeat period over a window given in *scene* pixels. */
function periodIn(
  row: number[], [x0, x1]: [number, number], n: number,
): { period: number; score: number; samples: number } {
  return dominantPeriod(row.slice(x0 * n, x1 * n), 4, Math.round(SEP.sepFar * n * 1.3))
}

/* ------------------------------------------------------------------ the tests */

describe('stst --help / --version', () => {
  it('prints usage and exits 0 with no arguments', async () => {
    const r = await cli([])
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/stst render/)
    expect(r.out).toMatch(/stst still/)
    expect(r.out).toMatch(/stst preview/)
  })

  it('prints a version and exits 0', async () => {
    const r = await cli(['--version'])
    expect(r.code).toBe(0)
    expect(r.out.trim()).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe('stst still', () => {
  it('writes a PNG from --text, sized by noiseScale', async () => {
    const d = await dir()
    const out = join(d, 'hello.png')
    const r = await cli(['still', '--text', 'HELLO', '-o', out, '--size', '200x80',
      '--noise-scale', '2', '--sep-far', '30', '--sep-near', '20'])
    expect(r.err).toBe('')
    expect(r.code).toBe(0)

    const png = await readPng(out)
    expect(png.width).toBe(400)
    expect(png.height).toBe(160)
    // A dot field, not a blank canvas: both values present.
    const values = new Set<number>()
    for (let i = 0; i < png.data.length; i += 4) values.add(png.data[i]!)
    expect([...values].sort((a, b) => a - b)).toEqual([0, 255])
  })

  it('reports what it wrote', async () => {
    const d = await dir()
    const out = join(d, 'hello.png')
    const r = await cli(['still', '--text', 'HI', '-o', out, '--size', '80x40'])
    expect(r.out).toMatch(/hello\.png/)
  })

  it('--quiet prints nothing on success', async () => {
    const d = await dir()
    const r = await cli(['still', '--text', 'HI', '-o', join(d, 'a.png'), '--size', '80x40', '-q'])
    expect(r.code).toBe(0)
    expect(r.out).toBe('')
  })

  it('samples the scene midpoint, so a still of a marquee is not empty (§4.1)', async () => {
    const { dir: d, path } = await scene(MARQUEE_SCENE)
    const depth = join(d, 'depth.png')
    const r = await cli(['still', path, '-o', join(d, 'mid.png'), '--depth-map', depth])
    expect(r.code).toBe(0)

    const map = await readPng(depth)
    let max = 0
    for (let i = 0; i < map.data.length; i += 4) max = Math.max(max, map.data[i]!)
    expect(max).toBeGreaterThan(200)
  })

  it('--at-time 0 shows the same scene as empty, which is why 0 is not the default', async () => {
    const { dir: d, path } = await scene(MARQUEE_SCENE)
    const depth = join(d, 'depth.png')
    await cli(['still', path, '-o', join(d, 'zero.png'), '--depth-map', depth, '--at-time', '0'])

    const map = await readPng(depth)
    let max = 0
    for (let i = 0; i < map.data.length; i += 4) max = Math.max(max, map.data[i]!)
    expect(max).toBe(0)
  })

  it('writes one frame for an animated scene', async () => {
    const { dir: d, path } = await scene(SLAB_SCENE)
    const out = join(d, 'one.png')
    expect((await cli(['still', path, '-o', out])).code).toBe(0)
    const png = await readPng(out)
    expect(png.width).toBe(W * NOISE)
  })
})

describe('stst render', () => {
  it('writes a GIF whose frame count and delay follow the scene timing', async () => {
    const { dir: d, path } = await scene(SLAB_SCENE)
    const out = join(d, 'out.gif')
    const r = await cli(['render', path, '-o', out])
    expect(r.err).toBe('')
    expect(r.code).toBe(0)

    const gif = decodeGif(await readFile(out), 'out.gif')
    expect(gif.frames).toHaveLength(12)
    expect(gif.width).toBe(W * NOISE)
    // GIF stores delays in 10ms units, so 12fps (83ms) reads back as 80ms.
    expect(gif.frames[0]!.delayMs).toBe(80)
  })

  it('honours --fps for the encoder, not just for the frame count', async () => {
    const { dir: d, path } = await scene(SLAB_SCENE)
    const out = join(d, 'out.gif')
    expect((await cli(['render', path, '-o', out, '--fps', '20'])).code).toBe(0)
    const gif = decodeGif(await readFile(out), 'out.gif')
    expect(gif.frames).toHaveLength(20)
    expect(gif.frames[0]!.delayMs).toBe(50)
  })

  it('ENCODES THE DEPTH: the GIF measures sepNear inside the slab and sepFar outside', async () => {
    // The check from the plan's done criteria. This is the only test here that
    // proves the CLI wired the pipeline up, rather than merely exiting 0.
    const { dir: d, path } = await scene(SLAB_SCENE)
    const out = join(d, 'out.gif')
    expect((await cli(['render', path, '-o', out])).code).toBe(0)

    const gif = decodeGif(await readFile(out), 'out.gif')
    const row = rgbaRow(gif.frames[0]!.rgba, gif.width, Math.floor((H * NOISE) / 2))

    const inside = periodIn(row, SLAB, NOISE)
    const outside = periodIn(row, BG, NOISE)
    expect(inside.period).toBe(SEP.sepNear * NOISE)
    expect(outside.period).toBe(SEP.sepFar * NOISE)
    expect(outside.score).toBe(1)
    expect(inside.samples).toBeGreaterThan(100)
  })

  it('passes --noise-scale through to the measured period', async () => {
    const { dir: d, path } = await scene(SLAB_SCENE)
    const out = join(d, 'out.gif')
    expect((await cli(['render', path, '-o', out, '--noise-scale', '1'])).code).toBe(0)

    const gif = decodeGif(await readFile(out), 'out.gif')
    expect(gif.width).toBe(W)
    const row = rgbaRow(gif.frames[0]!.rgba, gif.width, Math.floor(H / 2))
    expect(periodIn(row, SLAB, 1).period).toBe(SEP.sepNear)
    expect(periodIn(row, BG, 1).period).toBe(SEP.sepFar)
  })

  it('--cross inverts which region reads as nearer', async () => {
    const { dir: d, path } = await scene(SLAB_SCENE)
    const out = join(d, 'cross.gif')
    expect((await cli(['render', path, '-o', out, '--noise-scale', '1', '--cross'])).code).toBe(0)

    const gif = decodeGif(await readFile(out), 'cross.gif')
    const row = rgbaRow(gif.frames[0]!.rgba, gif.width, Math.floor(H / 2))
    expect(periodIn(row, SLAB, 1).period).toBe(SEP.sepFar)
    expect(periodIn(row, BG, 1).period).toBe(SEP.sepNear)
  })

  it('--freeze-noise reuses one dot field; without it every frame differs', async () => {
    const { dir: d, path } = await scene(SLAB_SCENE)
    const frozen = join(d, 'frozen.gif')
    const free = join(d, 'free.gif')
    await cli(['render', path, '-o', frozen, '--freeze-noise', '--duration', '0.25'])
    await cli(['render', path, '-o', free, '--duration', '0.25'])

    const a = decodeGif(await readFile(frozen), 'frozen.gif')
    const b = decodeGif(await readFile(free), 'free.gif')
    expect(Array.from(a.frames[0]!.rgba)).toEqual(Array.from(a.frames[1]!.rgba))
    expect(Array.from(b.frames[0]!.rgba)).not.toEqual(Array.from(b.frames[1]!.rgba))
  })

  it('writes a PNG sequence for an animated scene', async () => {
    const { dir: d, path } = await scene(SLAB_SCENE)
    const r = await cli(['render', path, '-o', join(d, 'seq/frame.png'), '--duration', '0.25'])
    expect(r.code).toBe(0)
    const files = (await readdir(join(d, 'seq'))).sort()
    expect(files).toEqual(['frame-0000.png', 'frame-0001.png', 'frame-0002.png'])
    expect(r.out).toMatch(/3 frames/)
  })

  it('writes a single PNG when the scene is a still', async () => {
    const { dir: d, path } = await scene(
      `size: [${W}, ${H}]\nlayers:\n  - {type: shape, shape: rect, at: [80, 0], w: 160, h: 24}\n`,
    )
    const out = join(d, 'still.png')
    expect((await cli(['render', path, '-o', out])).code).toBe(0)
    expect((await readPng(out)).width).toBe(W * 2)
  })
})

describe('stst render -o out.mp4', () => {
  it('writes a lossless MP4 by default, with no warning', async () => {
    const { dir: d, path } = await scene(SLAB_SCENE)
    const out = join(d, 'out.mp4')
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    try {
      const r = await cli(['render', path, '-o', out, '--duration', '0.25'])
      expect(r.code).toBe(0)
      expect(stderr.mock.calls.map(c => String(c[0])).join('')).toBe('')
    } finally {
      stderr.mockRestore()
    }
    expect((await readFile(out)).byteLength).toBeGreaterThan(0)
  })

  it('does not swallow the lossy-encoding warning', async () => {
    const { dir: d, path } = await scene(SLAB_SCENE)
    const out = join(d, 'lossy.mp4')
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    let written = ''
    try {
      const r = await cli([
        'render', path, '-o', out, '--duration', '0.25', '--crf', '28', '--pix-fmt', 'yuv420p',
      ])
      written = stderr.mock.calls.map(c => String(c[0])).join('')
      expect(r.code).toBe(0)
    } finally {
      stderr.mockRestore()
    }
    expect(written).toMatch(/WARNING/)
    expect(written).toMatch(/-crf 28/)
    expect(written).toMatch(/yuv420p/)
    expect(written).toMatch(/stereo signal/)
  })
})

describe('stst preview', () => {
  it('renders to a temp file and reports the scene it measured', async () => {
    const { path } = await scene(SLAB_SCENE)
    const r = await cli(['preview', path])
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/240x24/)
    expect(r.out).toMatch(/12 frames/)
    expect(r.out).toMatch(/sepFar 30/)
    expect(r.out).toMatch(/sepNear 20/)
    // The measurement is the point: a stereogram cannot be checked by eye.
    expect(r.out).toMatch(/period/)
    const match = /(\S+\.gif)/.exec(r.out)
    expect(match).not.toBeNull()
    expect((await readFile(match![1]!)).byteLength).toBeGreaterThan(0)
  })

  it('writes a PNG for a still scene, and honours -o', async () => {
    const { dir: d, path } = await scene(
      `size: [${W}, ${H}]\nlayers:\n  - {type: shape, shape: rect, at: [80, 0], w: 160, h: 24}\n`,
    )
    const out = join(d, 'preview.png')
    const r = await cli(['preview', path, '-o', out])
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/still/)
    expect((await readPng(out)).width).toBe(W * 2)
  })

  it('reports the depth range it rasterised', async () => {
    const { path } = await scene(SLAB_SCENE)
    const r = await cli(['preview', path])
    expect(r.out).toMatch(/depth/)
    expect(r.out).toMatch(/1\.00/)
  })
})

describe('stst error reporting', () => {
  /** No stack frames, no TypeScript-shaped internals. */
  function expectClean(text: string): void {
    expect(text).not.toMatch(/\n\s+at /)
    expect(text).not.toMatch(/Cannot read propert|undefined is not|TypeError/)
  }

  it('reports a usage error with exit code 2 and a pointer to --help', async () => {
    const r = await cli(['render', 'scene.yaml', '-o', 'out.gif', '--sepfar', '120'])
    expect(r.code).toBe(2)
    expect(r.err).toMatch(/unknown option "--sepfar"/)
    expect(r.err).toMatch(/--help/)
    expect(r.out).toBe('')
    expectClean(r.err)
  })

  it('names the offending field for a malformed scene, and exits 1', async () => {
    const { dir: d, path } = await scene('size: [40, 20]\nlayers:\n  - {type: txt, text: HI}\n')
    const r = await cli(['render', path, '-o', join(d, 'unused.gif')])
    expect(r.code).toBe(1)
    expect(r.err).toMatch(/layers\[0\]\.type/)
    expect(r.err).toMatch(/"txt"/)
    expect(r.err).toMatch(/scene\.yaml/)
    expectClean(r.err)
  })

  it('names the missing field when size is absent', async () => {
    const { dir: d, path } = await scene('layers: []\n')
    const r = await cli(['render', path, '-o', join(d, 'unused.gif')])
    expect(r.code).toBe(1)
    expect(r.err).toMatch(/size/)
    expectClean(r.err)
  })

  it('reports a missing scene file without ENOENT noise', async () => {
    const r = await cli(['render', '/nonexistent/scene.yaml', '-o', join(await dir(), 'u.gif')])
    expect(r.code).toBe(1)
    expect(r.err).toMatch(/not found/)
    expect(r.err).not.toMatch(/ENOENT/)
    expectClean(r.err)
  })

  it('reports a nonexistent image path, naming the file', async () => {
    const { dir: d, path } = await scene(
      'size: [40, 20]\nlayers:\n  - {type: image, src: missing-ball.png}\n',
    )
    const r = await cli(['still', path, '-o', join(d, 'out.png')])
    expect(r.code).toBe(1)
    expect(r.err).toMatch(/missing-ball\.png/)
    expectClean(r.err)
  })

  it('propagates the stereo error for sepNear >= sepFar', async () => {
    const { dir: d, path } = await scene(SLAB_SCENE)
    const r = await cli(['render', path, '-o', join(d, 'unused.gif'), '--sep-near', '200'])
    expect(r.code).toBe(1)
    expect(r.err).toMatch(/sepNear/)
    expect(r.err).toMatch(/depth budget|flat plane/)
    expectClean(r.err)
  })

  it('surfaces the unresolved "draw" layer design question intelligibly', async () => {
    const { dir: d, path } = await scene(
      'size: [40, 20]\nlayers:\n  - {type: draw, fn: ./custom.mjs}\n',
    )
    const r = await cli(['still', path, '-o', join(d, 'out.png')])
    expect(r.code).toBe(1)
    expect(r.err).toMatch(/draw/)
    expect(r.err).toMatch(/custom\.mjs/)
    expect(r.err).toMatch(/platform-specific|not supported/)
    expectClean(r.err)
  })

  it('names the valid kinds for an unknown animation preset', async () => {
    const { dir: d, path } = await scene(
      'size: [40, 20]\nlayers:\n  - {type: text, text: HI, anim: {kind: zoom}}\n',
    )
    const r = await cli(['still', path, '-o', join(d, 'out.png')])
    expect(r.code).toBe(1)
    expect(r.err).toMatch(/unknown animation preset "zoom"/)
    expect(r.err).toMatch(/marquee/)
    expectClean(r.err)
  })

  it('rejects an unsupported output extension, listing the supported ones', async () => {
    const { dir: d, path } = await scene(SLAB_SCENE)
    const r = await cli(['render', path, '-o', join(d, 'out.webm')])
    expect(r.code).toBe(2)
    expect(r.err).toMatch(/\.webm/)
    expect(r.err).toMatch(/\.gif/)
  })
})
