import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { execFile, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { loadImage } from '@napi-rs/canvas'
import { GifReader } from 'omggif'
import {
  LOSSLESS_MP4,
  resolveMp4Encoding,
  writeGif,
  writeMp4,
  writePng,
  writePngSequence,
  type GreyFrame,
} from './encode.js'

const run = promisify(execFile)

/** ffmpeg is an external binary. Skip rather than fail where it is absent. */
const HAVE_FFMPEG = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0
const HAVE_FFPROBE = spawnSync('ffprobe', ['-version'], { stdio: 'ignore' }).status === 0

/** Is a compiler available? The node-resolution test runs the built output. */
const HAVE_TSC = spawnSync('npx', ['tsc', '--version'], { stdio: 'ignore' }).status === 0

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

let dir: string
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'stst-encode-')) })
afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

const out = (name: string) => join(dir, name)

describe('writePng', () => {
  it('writes a real PNG with the frame dimensions', async () => {
    const p = out('one.png')
    await writePng(p, dots(1))
    const bytes = await readFile(p)
    expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
    const img = await loadImage(bytes)
    expect(img.width).toBe(W)
    expect(img.height).toBe(H)
  })

  it('preserves every pixel exactly — PNG is lossless and must stay that way', async () => {
    const frame = dots(2)
    const p = out('exact.png')
    await writePng(p, frame)
    const { createCanvas } = await import('@napi-rs/canvas')
    const img = await loadImage(await readFile(p))
    const c = createCanvas(W, H)
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, W, H).data
    for (let i = 0; i < W * H; i++) {
      expect(d[i * 4]).toBe(frame.pixels[i])
      expect(d[i * 4 + 3]).toBe(255)
    }
  })

  it('creates missing parent directories', async () => {
    const p = out('nested/deeper/x.png')
    await writePng(p, solid(255))
    expect((await readFile(p)).length).toBeGreaterThan(0)
  })

  it('rejects when pixels.length does not match width*height', async () => {
    const bad = { pixels: new Uint8Array(3), width: W, height: H }
    await expect(writePng(out('bad.png'), bad)).rejects.toThrow(/192.*got 3|pixels/i)
  })
})

describe('writePngSequence', () => {
  it('writes one zero-padded file per frame and returns the paths in order', async () => {
    const d = out('seq')
    const paths = await writePngSequence(d, [dots(1), dots(2), dots(3)])
    expect(paths).toHaveLength(3)
    expect(paths.map(p => p.split('/').pop())).toEqual([
      'frame-0000.png', 'frame-0001.png', 'frame-0002.png',
    ])
    expect((await readdir(d)).sort()).toEqual([
      'frame-0000.png', 'frame-0001.png', 'frame-0002.png',
    ])
  })

  it('honours prefix and padding', async () => {
    const paths = await writePngSequence(out('seq2'), [solid(0)], { prefix: 'f', pad: 2 })
    expect(paths[0]!.endsWith('f00.png')).toBe(true)
  })

  it('accepts an async iterable so callers need not buffer every frame', async () => {
    async function* gen() { yield dots(4); yield dots(5) }
    const paths = await writePngSequence(out('seq3'), gen())
    expect(paths).toHaveLength(2)
  })
})

describe('writeGif', () => {
  it('writes a GIF that decodes to the expected frame count and size', async () => {
    const p = out('anim.gif')
    await writeGif(p, [dots(1), dots(2), dots(3)], { fps: 12 })
    const r = new GifReader(await readFile(p))
    expect(r.width).toBe(W)
    expect(r.height).toBe(H)
    expect(r.numFrames()).toBe(3)
  })

  it('quantises a 12fps delay to 80ms, per the GIF 10ms storage unit', async () => {
    const p = out('delay.gif')
    await writeGif(p, [dots(1), dots(2)], { fps: 12 })
    const r = new GifReader(await readFile(p))
    // frameInfo().delay is in 1/100s units; 12fps = 83.3ms requests 8 -> 80ms.
    expect(r.frameInfo(0).delay).toBe(8)
    expect(r.frameInfo(1).delay).toBe(8)
  })

  it('honours an explicit delayMs over fps', async () => {
    const p = out('delay2.gif')
    await writeGif(p, [solid(0)], { fps: 12, delayMs: 200 })
    expect(new GifReader(await readFile(p)).frameInfo(0).delay).toBe(20)
  })

  it('is pixel-exact: a 2-colour palette makes GIF lossless for dot fields', async () => {
    const frames = [dots(7), dots(8)]
    const p = out('exact.gif')
    await writeGif(p, frames, { fps: 10 })
    const r = new GifReader(await readFile(p))
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

  it('uses a 2-colour global palette', async () => {
    const p = out('palette.gif')
    await writeGif(p, [dots(1)], { fps: 10 })
    const r = new GifReader(await readFile(p))
    expect(r.frameInfo(0).palette_size).toBe(2)
  })

  it('still writes two palette entries when the first frame is a single colour', async () => {
    // quantize(allBlack, 2) returns ONE colour. Taking that as the global
    // palette collapses every later frame to black — silent total data loss.
    const p = out('degenerate.gif')
    await writeGif(p, [solid(0), dots(3)], { fps: 10 })
    const r = new GifReader(await readFile(p))
    expect(r.frameInfo(0).palette_size).toBe(2)
    const rgba = new Uint8Array(W * H * 4)
    r.decodeAndBlitFrameRGBA(1, rgba)
    const vals = new Set<number>()
    for (let i = 0; i < W * H; i++) vals.add(rgba[i * 4]!)
    expect([...vals].sort((a, b) => a - b)).toEqual([0, 255])
  })

  it('accepts an async iterable', async () => {
    async function* gen() { yield dots(1); yield dots(2) }
    const p = out('gen.gif')
    await writeGif(p, gen(), { fps: 10 })
    expect(new GifReader(await readFile(p)).numFrames()).toBe(2)
  })

  it('rejects an empty frame source instead of writing a broken file', async () => {
    await expect(writeGif(out('empty.gif'), [], { fps: 10 })).rejects.toThrow(/no frames/i)
  })

  it('rejects a frame whose size differs from the first', async () => {
    const odd = { pixels: new Uint8Array(4), width: 2, height: 2 }
    await expect(writeGif(out('ragged.gif'), [dots(1), odd], { fps: 10 }))
      .rejects.toThrow(/16x12.*2x2|size/i)
  })
})

describe('gifenc module interop', () => {
  /**
   * `writeGif` reaches gifenc through a shape probe (`src/shared/gifenc.ts`)
   * rather than a plain default import, because the module's shape inverts
   * between node and any bundler. Every test above only exercises the bundler
   * half — vitest resolves through vite — so deleting the shim would leave the
   * suite green and break the shipped CLI. The shape measurement itself now
   * lives in `src/shared/gifenc.test.ts`, next to the shim.
   *
   * What this test adds is the end-to-end one: `writeGif`, loaded by node,
   * through the whole relative-import chain into `src/shared/`, writing a file
   * that decodes. It compiles the project first *because* of that chain — node
   * 22's `--experimental-strip-types` does not rewrite a `./x.js` specifier to
   * `./x.ts` (measured: ERR_MODULE_NOT_FOUND), so a `.ts` entry point stops
   * working the moment it imports a sibling. Running `dist/` is the better
   * check anyway: that is the artifact `files: ["dist"]` publishes and the
   * `bin` entry point loads.
   */
  it.skipIf(!HAVE_TSC)('writes a decodable GIF when loaded by node, not just by vite', async () => {
    // Built *inside* the repo, not in /tmp: node resolves `@napi-rs/canvas`
    // and `gifenc` by walking up from the importing file, so output parked
    // outside the project cannot see node_modules at all. `node_modules/.cache`
    // is the conventional spot and is already ignored by git.
    const built = join(process.cwd(), 'node_modules', '.cache', 'stst-node-probe')
    // A type error elsewhere in the tree is `npm run typecheck`'s business, not
    // this test's, and tsc emits anyway — so judge it on whether the entry
    // point exists, not on its exit status.
    await run('npx', ['tsc', '-p', 'tsconfig.json', '--outDir', built], { cwd: process.cwd() })
      .catch(() => undefined)
    const entryPath = join(built, 'node', 'encode.js')
    expect(existsSync(entryPath)).toBe(true)
    const p = out('via-node.gif')
    const entry = pathToFileURL(entryPath).href
    const probe = `
      import { writeGif } from ${JSON.stringify(entry)}
      const pixels = new Uint8Array(${W * H})
      for (let i = 0; i < pixels.length; i++) pixels[i] = i % 3 ? 255 : 0
      await writeGif(${JSON.stringify(p)}, [{ pixels, width: ${W}, height: ${H} }], { fps: 10 })
    `
    // Deliberately NOT wrapped in a try/catch that pattern-matches the error:
    // execFile puts the whole command line into the rejection message, so any
    // such filter matches its own flags and silently skips the test.
    await run(process.execPath, ['--input-type=module', '--eval', probe],
      { cwd: process.cwd() })
    const r = new GifReader(await readFile(p))
    expect(r.numFrames()).toBe(1)
    expect(r.frameInfo(0).palette_size).toBe(2)
  })
})

describe('resolveMp4Encoding', () => {
  it('defaults to lossless libx264 -qp 0 -pix_fmt yuv444p', () => {
    const e = resolveMp4Encoding({}, 'o.mp4')
    expect(e.args).toContain('libx264')
    expect(e.args.join(' ')).toContain('-qp 0')
    expect(e.args.join(' ')).toContain('-pix_fmt yuv444p')
    expect(LOSSLESS_MP4).toEqual({ codec: 'libx264', qp: 0, pixFmt: 'yuv444p' })
  })

  it('emits no warnings for the default encoding', () => {
    expect(resolveMp4Encoding({}, 'o.mp4').warnings).toEqual([])
    expect(resolveMp4Encoding({ fps: 25 }, 'o.mp4').warnings).toEqual([])
  })

  it('puts the frame rate and the output path in the args', () => {
    const e = resolveMp4Encoding({ fps: 25 }, '/tmp/x.mp4')
    expect(e.fps).toBe(25)
    expect(e.args.join(' ')).toContain('-framerate 25')
    expect(e.args[e.args.length - 1]).toBe('/tmp/x.mp4')
  })

  it('warns, naming the consequence, when crf makes the encode lossy', () => {
    const w = resolveMp4Encoding({ crf: 23 }, 'o.mp4').warnings
    expect(w).toHaveLength(1)
    expect(w[0]).toMatch(/-crf 23/)
    expect(w[0]).toMatch(/stereo signal/i)
    expect(w[0]).toMatch(/not fuse/i)
    expect(w[0]).toMatch(/qp 0/)
  })

  it('warns when qp is non-zero', () => {
    const w = resolveMp4Encoding({ qp: 18 }, 'o.mp4').warnings
    expect(w.join('\n')).toMatch(/-qp 18/)
    expect(w.join('\n')).toMatch(/stereo signal/i)
  })

  it('warns about chroma subsampling separately from quantisation', () => {
    const w = resolveMp4Encoding({ pixFmt: 'yuv420p' }, 'o.mp4').warnings
    expect(w).toHaveLength(1)
    expect(w[0]).toMatch(/yuv420p/)
    expect(w[0]).toMatch(/chroma/i)
    expect(w[0]).toMatch(/not fuse/i)
  })

  it('warns twice when both quantisation and chroma are degraded', () => {
    expect(resolveMp4Encoding({ crf: 30, pixFmt: 'yuv420p' }, 'o.mp4').warnings).toHaveLength(2)
  })

  it('does not warn for other losslessly-capable pixel formats', () => {
    expect(resolveMp4Encoding({ pixFmt: 'gbrp' }, 'o.mp4').warnings).toEqual([])
    expect(resolveMp4Encoding({ codec: 'ffv1', pixFmt: 'gbrp' }, 'o.mp4').warnings).toEqual([])
  })

  it('warns for a codec that cannot encode losslessly at all', () => {
    const w = resolveMp4Encoding({ codec: 'mpeg4' }, 'o.mp4').warnings
    expect(w.join('\n')).toMatch(/mpeg4/)
    expect(w.join('\n')).toMatch(/not fuse/i)
  })

  it('appends extraArgs before the output path', () => {
    const e = resolveMp4Encoding({ extraArgs: ['-movflags', '+faststart'] }, 'o.mp4')
    const i = e.args.indexOf('-movflags')
    expect(i).toBeGreaterThan(-1)
    expect(i).toBeLessThan(e.args.length - 1)
  })
})

describe('writeMp4 failure modes', () => {
  it('writes each lossy-override warning to stderr', async () => {
    const seen: string[] = []
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((c: unknown) => {
      seen.push(String(c)); return true
    }) as never)
    try {
      await writeMp4(out('never.mp4'), [solid(0)], {
        crf: 30, pixFmt: 'yuv420p', ffmpegPath: join(dir, 'no-such-ffmpeg'),
      }).catch(() => undefined)
    } finally { spy.mockRestore() }
    const text = seen.join('')
    expect(text).toMatch(/-crf 30/)
    expect(text).toMatch(/yuv420p/)
    expect(text).toMatch(/stereo signal/i)
    expect(text).toMatch(/not fuse/i)
  })

  it('writes nothing to stderr for the lossless default', async () => {
    if (!HAVE_FFMPEG) return
    const seen: string[] = []
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((c: unknown) => {
      seen.push(String(c)); return true
    }) as never)
    try { await writeMp4(out('quiet.mp4'), [solid(0), solid(255)], { fps: 10 }) }
    finally { spy.mockRestore() }
    expect(seen.join('')).toBe('')
  })

  it('fails with an install hint, not an ENOENT stack, when ffmpeg is absent', async () => {
    const err = await writeMp4(out('x.mp4'), [solid(0)], {
      ffmpegPath: join(dir, 'definitely-not-ffmpeg'),
    }).then(() => null, (e: unknown) => e as Error)
    expect(err).toBeInstanceOf(Error)
    expect(err!.message).toMatch(/ffmpeg/i)
    expect(err!.message).toMatch(/install/i)
    expect(err!.message).not.toMatch(/ENOENT/)
  })

  it('rejects an empty frame source', async () => {
    await expect(writeMp4(out('empty.mp4'), [])).rejects.toThrow(/no frames/i)
  })
})

describe.skipIf(!HAVE_FFMPEG || !HAVE_FFPROBE)('writeMp4 with ffmpeg present', () => {
  it('produces a yuv444p stream with the right size and frame count', async () => {
    const p = out('real.mp4')
    await writeMp4(p, [dots(1), dots(2), dots(3), dots(4)], { fps: 12 })
    const { stdout } = await run('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0', '-count_frames',
      '-show_entries', 'stream=width,height,pix_fmt,nb_read_frames',
      '-of', 'default=nokey=1:noprint_wrappers=1', p,
    ])
    const fields = stdout.trim().split('\n')
    expect(fields).toContain(String(W))
    expect(fields).toContain(String(H))
    expect(fields).toContain('yuv444p')
    expect(fields).toContain('4')
  })

  it('round-trips every pixel bit-exactly at the lossless default', async () => {
    // This is the assertion the -qp 0 / yuv444p default exists to satisfy.
    // Measured on ffmpeg 8.0.1: 0 mismatches lossless, ~145/256 at -crf 28.
    const frames = [dots(11), dots(12), dots(13)]
    const p = out('lossless.mp4')
    await writeMp4(p, frames, { fps: 10 })
    const raw = out('lossless.gray')
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', p,
      '-f', 'rawvideo', '-pix_fmt', 'gray', raw])
    const bytes = await readFile(raw)
    expect(bytes.length).toBe(W * H * frames.length)
    for (let f = 0; f < frames.length; f++) {
      const got = bytes.subarray(f * W * H, (f + 1) * W * H)
      expect(Array.from(got)).toEqual(Array.from(frames[f]!.pixels))
    }
  })

  it('accepts an async iterable', async () => {
    async function* gen() { yield dots(21); yield dots(22) }
    const p = out('gen.mp4')
    await writeMp4(p, gen(), { fps: 10 })
    expect((await readFile(p)).length).toBeGreaterThan(0)
  })

  it('surfaces ffmpeg stderr when the encode fails', async () => {
    // An unknown codec also earns a lossy-override warning; swallow it so the
    // suite output stays readable.
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((() => true) as never)
    try {
      await expect(writeMp4(out('bad.mp4'), [solid(0)], { codec: 'not-a-real-codec' }))
        .rejects.toThrow(/not-a-real-codec|ffmpeg (exited|failed)/i)
    } finally { spy.mockRestore() }
  })
})
