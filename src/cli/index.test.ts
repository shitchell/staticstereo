import { spawnSync } from 'node:child_process'
import { describe, it, expect, vi } from 'vitest'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { run } from './index.js'
import { DEFAULT_STEREO, dominantPeriod, marginsFor, PRESETS } from '../core/index.js'
import type { Margins } from '../core/index.js'
import { decodeGif } from '../shared/gif.js'
import { writeStst } from '../shared/container.js'
import { readStst } from '../shared/containerRead.js'
import type { StstMember } from '../shared/container.js'
import { parseSceneText, validateScene } from './scene.js'

/**
 * ffmpeg is an external binary and GitHub's runners no longer ship it.
 * Skip rather than fail where it is absent — src/node/encode.test.ts already
 * does this, and the asymmetry is what broke CI: these tests asserted exit
 * code 0 on a machine with no encoder.
 */
const HAVE_FFMPEG = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0

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
/** Measurement windows in *stage* px; the plate is wider and offset (§10). */
const BG: [number, number] = [0, 60]
const SLAB: [number, number] = [120, 240]

/**
 * What the CLI actually emits: the **plate**, i.e. the stage inset by the
 * encoder's dead margins (design §10). Written out rather than hardcoded so
 * the two encoders the tests below exercise get their own numbers — `shift`
 * pads 30/15 at this `sepFar`, `linked` pads 15/15.
 *
 * `MARGINS` tracks `DEFAULT_STEREO.algorithm` because none of the scene
 * fixtures below name an encoder, so every plate width and every measurement
 * offset here is a consequence of whichever one is the default. `linked` as of
 * 2026-10-09, hence 15/15 and a 270px plate where it used to be 285.
 */
const MARGINS = marginsFor(SEP.sepFar, DEFAULT_STEREO.algorithm)
const SHIFT_MARGINS = marginsFor(SEP.sepFar, 'shift')
const PLATE_W = MARGINS.left + W + MARGINS.right
/** A scene with no `stereo:` block gets the shipped defaults, hence a wider plate. */
const DEFAULT_PLATE_W =
  W + marginsFor(DEFAULT_STEREO.sepFar, DEFAULT_STEREO.algorithm).left +
  marginsFor(DEFAULT_STEREO.sepFar, DEFAULT_STEREO.algorithm).right

const SLAB_SCENE =
  `size: [${W}, ${H}]\n` +
  'fps: 12\n' +
  'duration: 1\n' +
  `stereo: {sepFar: ${SEP.sepFar}, sepNear: ${SEP.sepNear}, noiseScale: ${NOISE}, seed: 7}\n` +
  'layers:\n' +
  `  - {type: shape, shape: rect, at: [${SLAB_X}, 0], w: ${W - SLAB_X}, h: ${H}, depth: 1}\n`

/**
 * A scene whose only layer is off-screen at t=0 — design §4.1's trap.
 *
 * Written as a `move` rather than the `marquee` it used to be (§4.2b deleted
 * that kind). The endpoints are chosen rather than measured: `+W` is off the
 * right edge of a 240px stage whatever the text measures, and `-200` is well
 * left of the stage for a 16px `HELLO`. The old `marquee` derived them from
 * `contentW`, which this test never needed — it only needs "empty at t=0,
 * covered at the midpoint".
 */
const SCROLL_SCENE =
  `size: [${W}, ${H}]\n` +
  'fps: 12\n' +
  'duration: 1\n' +
  `stereo: {sepFar: ${SEP.sepFar}, sepNear: ${SEP.sepNear}, noiseScale: 1, seed: 7}\n` +
  'layers:\n' +
  `  - {type: text, text: HELLO, size: 16, depth: 1, anim: {kind: move, from: [${W}, 0], to: [-200, 0]}}\n`

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

/**
 * Measure the repeat period over a window given in *stage* pixels.
 *
 * The window is offset by the left margin as well as scaled by `noiseScale`,
 * because the file on disk is the plate: stage x=0 is at plate x=marginLeft.
 * Without the offset these windows silently measure the dead strip for the
 * first `marginLeft` columns of every assertion.
 */
function periodIn(
  row: number[], [x0, x1]: [number, number], n: number, margins: Margins = MARGINS,
): { period: number; score: number; samples: number } {
  return dominantPeriod(
    row.slice((margins.left + x0) * n, (margins.left + x1) * n),
    4,
    Math.round(SEP.sepFar * n * 1.3),
  )
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
    // 200px stage + the default encoder's dead margins (§10). At `linked`'s
    // 15/15 that is a 230px plate, x2 = 460; under `shift` it was 245 and 490.
    expect(png.width).toBe((200 + MARGINS.left + MARGINS.right) * 2)
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

  it('samples the scene midpoint, so a still of a scrolling scene is not empty (§4.1)', async () => {
    const { dir: d, path } = await scene(SCROLL_SCENE)
    const depth = join(d, 'depth.png')
    const r = await cli(['still', path, '-o', join(d, 'mid.png'), '--depth-map', depth])
    expect(r.code).toBe(0)

    const map = await readPng(depth)
    let max = 0
    for (let i = 0; i < map.data.length; i += 4) max = Math.max(max, map.data[i]!)
    expect(max).toBeGreaterThan(200)
  })

  it('--at-time 0 shows the same scene as empty, which is why 0 is not the default', async () => {
    const { dir: d, path } = await scene(SCROLL_SCENE)
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
    expect(png.width).toBe(PLATE_W * NOISE)
  })

  it('reports the stage it was given and the plate it emitted', async () => {
    const { dir: d, path } = await scene(SLAB_SCENE)
    const out = join(d, 'one.png')
    const r = await cli(['still', path, '-o', out])
    expect(r.out).toMatch(new RegExp(`stage ${W}x${H} -> plate ${PLATE_W}x${H}`))
    // The scene names no encoder, so this is the default one reported back.
    expect(r.out).toMatch(/dead margins 15\+15px, linked/)
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
    expect(gif.width).toBe(PLATE_W * NOISE)
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
    expect(gif.width).toBe(PLATE_W)
    const row = rgbaRow(gif.frames[0]!.rgba, gif.width, Math.floor(H / 2))
    expect(periodIn(row, SLAB, 1).period).toBe(SEP.sepNear)
    expect(periodIn(row, BG, 1).period).toBe(SEP.sepFar)
  })

  // The flag has to reach the encoder *and* still encode the depth. Was
  // `--algorithm linked` against a bare default render; flipped to
  // `--algorithm shift` rather than renumbered, because `linked` is now the
  // default and the bare render already exercises it — comparing the flag
  // against the default would have been comparing a render with itself, which
  // is exactly how this test failed.
  it('--algorithm shift renders a different image that still encodes the depth', async () => {
    const { dir: d, path } = await scene(SLAB_SCENE)
    const defaultOut = join(d, 'default.gif')
    const shiftOut = join(d, 'shift.gif')
    expect((await cli(['render', path, '-o', defaultOut, '--noise-scale', '1'])).code).toBe(0)
    expect((await cli([
      'render', path, '-o', shiftOut, '--noise-scale', '1', '--algorithm', 'shift',
    ])).code).toBe(0)

    const dflt = decodeGif(await readFile(defaultOut), 'default.gif')
    const shift = decodeGif(await readFile(shiftOut), 'shift.gif')
    const defaultRow = rgbaRow(dflt.frames[0]!.rgba, dflt.width, Math.floor(H / 2))
    const shiftRow = rgbaRow(shift.frames[0]!.rgba, shift.width, Math.floor(H / 2))
    expect(shiftRow).not.toEqual(defaultRow)

    // `shift` pads left-heavily, so its plate is wider than the default
    // `linked` one and its stage sits at a different offset — which is why
    // `periodIn` takes the margins rather than assuming one encoder.
    expect(shift.width).toBe(SHIFT_MARGINS.left + W + SHIFT_MARGINS.right)
    expect(periodIn(shiftRow, SLAB, 1, SHIFT_MARGINS).period).toBe(SEP.sepNear)
    expect(periodIn(shiftRow, BG, 1, SHIFT_MARGINS).period).toBe(SEP.sepFar)
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
    expect((await readPng(out)).width).toBe(DEFAULT_PLATE_W * 2)
  })
})

describe.skipIf(!HAVE_FFMPEG)('stst render -o out.mp4', () => {
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
    expect(r.out).toMatch(new RegExp(`stage ${W}x${H} -> plate ${PLATE_W}x${H}`))
    // The default encoder's symmetric margins, and the stage offset that
    // follows from them: 15px x noiseScale 2. Under `shift` this read
    // `30px left + 15px right` and `stage at 60,0`.
    expect(r.out).toMatch(/margins  15px left \+ 15px right/)
    expect(r.out).toMatch(/stage at 30,0 480x48 in the output/)
    expect(r.out).toMatch(/12 frames/)
    expect(r.out).toMatch(/sepFar 30/)
    expect(r.out).toMatch(/sepNear 20/)
    expect(r.out).toMatch(/algorithm linked/)
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
    expect((await readPng(out)).width).toBe(DEFAULT_PLATE_W * 2)
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
    // Swept over the registry, not one hardcoded kind: naming a single kind
    // is how this assertion kept passing while saying nothing.
    for (const kind of Object.keys(PRESETS)) expect(r.err).toMatch(kind)
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

/* -------------------------------------------------------------------- .stst */

/**
 * P1 criterion 6 end to end: `stst` reads and writes `.stst`, **and adds no
 * member to `COMMANDS`** — `render`, `still` and `preview` are the whole verb
 * list, so the read is an input the existing commands accept and the write is
 * a side-output flag like `--depth-map`.
 *
 * The read half does not assert "exited 0". It renders the *same* slab scene
 * out of a container and measures the GIF's repeat periods, because the thing
 * that could go wrong is a scene that survives the archive with its `stereo`
 * block or its layers quietly reduced, and that renders fine and encodes the
 * wrong depth.
 */
describe('stst over a .stst project file', () => {
  const PROJECT_SCENE = validateScene(parseSceneText(SLAB_SCENE, 'slab.yaml'), 'slab.yaml')

  async function project(members: StstMember[] = []): Promise<{ dir: string; path: string }> {
    const d = await dir()
    const path = join(d, 'project.stst')
    await writeFile(path, await writeStst(PROJECT_SCENE, members))
    return { dir: d, path }
  }

  it('renders a .stst, encoding the same depth the .yaml does', async () => {
    const { dir: d, path } = await project()
    const out = join(d, 'out.gif')
    const r = await cli(['render', path, '-o', out])
    expect(r.err).toBe('')
    expect(r.code).toBe(0)

    const gif = decodeGif(await readFile(out), 'out.gif')
    expect(gif.width).toBe(PLATE_W * NOISE)
    expect(gif.frames).toHaveLength(12)
    const row = rgbaRow(gif.frames[0]!.rgba, gif.width, Math.floor((H * NOISE) / 2))
    expect(periodIn(row, SLAB, NOISE).period).toBe(SEP.sepNear * NOISE)
    expect(periodIn(row, BG, NOISE).period).toBe(SEP.sepFar * NOISE)
  })

  it('takes a .stst on still and preview too, since the input is not a command', async () => {
    const { dir: d, path } = await project()
    expect((await cli(['still', path, '-o', join(d, 'one.png')])).code).toBe(0)
    expect((await cli(['preview', path, '-o', join(d, 'p.gif')])).code).toBe(0)
  })

  it('reports a damaged project as a usage-level error naming the file, not a stack', async () => {
    const d = await dir()
    const path = join(d, 'truncated.stst')
    const bytes = await writeStst(PROJECT_SCENE, [])
    await writeFile(path, bytes.slice(0, bytes.length - 40))
    const r = await cli(['render', path, '-o', join(d, 'out.gif')])
    expect(r.code).toBe(1)
    expect(r.err).toMatch(/truncated\.stst/)
    // The container reader is what spoke, not the YAML parser. Without this
    // line the test passes on the *old* loader too — a truncated zip handed to
    // `parseSceneText` also exits 1 with the file name in it — so the
    // assertion that distinguishes the two is the one worth having.
    expect(r.err).not.toMatch(/valid YAML or JSON/)
    expect(r.err).toMatch(/zip/)
    // Same bar as `stst error reporting`'s `expectClean`, restated rather than
    // shared: hoisting that helper out of its describe would edit a block this
    // task was not asked to touch (invariant 8).
    expect(r.err).not.toMatch(/\n\s+at /)
    expect(r.err).not.toMatch(/Cannot read propert|undefined is not|TypeError/)
  })

  /* ---------------------------------------------------------- --save-project */

  it('writes a .stst that readStst reads back, from a plain .yaml scene', async () => {
    const { dir: d, path } = await scene(SLAB_SCENE)
    const saved = join(d, 'saved.stst')
    const r = await cli(['render', path, '-o', join(d, 'out.gif'), '--save-project', saved])
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/saved\.stst/)

    const back = await readStst(new Uint8Array(await readFile(saved)))
    expect(back.scene.size).toEqual([W, H])
    expect(back.scene.layers).toHaveLength(1)
    expect(back.members).toEqual([])
  })

  /**
   * **The decision in `scene.ts`, as a sensor.** Reading a project through a
   * `Scene`-shaped door and saving it again would drop every mask and source,
   * and the command below writes to the path it read from — so the lossy
   * version destroys the only copy. Nothing warns; the loss is removed
   * instead, and this is what notices if it comes back.
   *
   * **SAME-ENGINE ONLY. This is not a cross-engine byte-identity claim, and
   * design §6.2 requires every determinism pin in this repo to say so in the
   * file rather than in a document** — without the sentence it reads, six
   * months on, as the guarantee that died with case E. The same sentence
   * stands on the pins in `container.test.ts` and `zip.test.ts`; this one was
   * missed because it is a CLI test and the rule was applied where the writer
   * lives.
   *
   * Both arms below run in one process on one engine — the same Node, the
   * same `CompressionStream` — so the `Buffer.compare` further down pins that
   * **our** writer is a function of the scene and members and of nothing
   * else. It says nothing about two engines producing the same bytes: the
   * container deflates since case E, and `CompressionStream('deflate-raw')`
   * is measured to emit **+59% in Firefox 153 and 10.7x in WebKit 26**
   * against Node and Chromium, diverging at byte 0 or 1. Read as a
   * cross-engine guarantee the assertion is false; read as written it is true
   * and is worth keeping.
   */
  it('round-trips a project onto its own path without losing masks or sources', async () => {
    const members: StstMember[] = [
      { name: 'ball.png', role: 'mask', data: new Uint8Array([9, 8, 7]) },
      { name: 'ball.png', role: 'source', data: new Uint8Array([6, 5]) },
      { name: 'sky.png', role: 'source', data: new Uint8Array([4]) },
    ]
    const { dir: d, path } = await project(members)
    const before = await readFile(path)

    // Saved **beside** the input first, not over it. Writing to the same path
    // and then comparing bytes is the vacuous version of this test: a
    // `--save-project` that did nothing at all would leave the file untouched
    // and pass. A separate path makes "it wrote" and "it kept everything" one
    // assertion, since determinism (P1 criterion 5 — fixed mtimes, fixed
    // entry order, fixed compression level) says a lossless re-save of the
    // same scene and members is byte-identical in one engine — so a dropped
    // member, a reordered entry or a moved mtime all show up here.
    //
    // **The citation used to read "criteria 5 and 7" and criterion 7 is no
    // longer the right one to send a reader to.** Corrected in place rather
    // than beside, because this sentence is descriptive prose written here
    // and not a quote of a ruling — §9 forbids editing the second, and the
    // test for which it is turns on whether the words are being preserved as
    // the record of what somebody decided. These are not. Criterion 7 used to
    // read "CLI and site produce identical bytes for one scene"; it was
    // re-scoped when case E made that unachievable, and its surviving part is
    // **one production producer of `.stst` bytes** — discharged by there
    // being a single writer, not by any byte comparison. A future reader sent
    // to criterion 7 by this comment would find a criterion that no longer
    // says what the comment implies, which is worse than no citation.
    // Criterion 5 is intact and is the one that actually carries this.
    const copy = join(d, 'copy.stst')
    const r = await cli(['render', path, '-o', join(d, 'out.gif'), '--save-project', copy])
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/copy\.stst/)
    expect(Buffer.compare(before, await readFile(copy))).toBe(0)

    // And over the path it was read from, which is the command that destroys
    // the only copy if the read is lossy.
    expect((await cli(['render', path, '-o', join(d, 'out.gif'), '--save-project', path])).code)
      .toBe(0)
    const back = await readStst(new Uint8Array(await readFile(path)))
    expect(back.members.map(m => `${m.role}:${m.name}`))
      .toEqual(['mask:ball.png', 'source:ball.png', 'source:sky.png'])
    expect([...back.members[0]!.data]).toEqual([9, 8, 7])
  })

  it('saves the scene the render used, overrides included', async () => {
    const { dir: d, path } = await scene(SLAB_SCENE)
    const saved = join(d, 'saved.stst')
    const r = await cli([
      'render', path, '-o', join(d, 'out.gif'), '--sep-far', '44', '--save-project', saved,
    ])
    expect(r.code).toBe(0)
    const back = await readStst(new Uint8Array(await readFile(saved)))
    // What you rendered is what you saved. The alternative — saving the scene
    // file as authored — would make the project disagree with the artifact it
    // was produced alongside, and there would be no way to tell from the
    // `.stst` which flags were in play.
    expect(back.scene.stereo?.sepFar).toBe(44)
  })

  it('saves a project built from --text, which has no scene file at all', async () => {
    const d = await dir()
    const saved = join(d, 'text.stst')
    const r = await cli([
      'still', '--text', 'HI', '--size', '60x30', '-o', join(d, 'o.png'),
      '--save-project', saved,
    ])
    expect(r.code).toBe(0)
    const back = await readStst(new Uint8Array(await readFile(saved)))
    expect(back.scene.size).toEqual([60, 30])
    expect(back.scene.layers[0]!.type).toBe('text')
  })
})
