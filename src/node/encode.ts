import { createCanvas, type Canvas } from '@napi-rs/canvas'
import * as gifencModule from 'gifenc'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Writable } from 'node:stream'

/**
 * gifenc interop. This looks like paranoia and is not — the module's shape
 * genuinely inverts depending on who resolved it, because its package.json
 * offers an esbuild CJS bundle as `main` and an ESM bundle as `module`:
 *
 * |                              | node (CJS `main`)        | vite/esbuild (ESM `module`) |
 * |------------------------------|--------------------------|-----------------------------|
 * | `import g from 'gifenc'`     | the namespace object     | `GIFEncoder`, the function  |
 * | `import { quantize } from …` | SyntaxError at link time | works                       |
 * | `import * as ns from …`      | `{ default: namespace }` | full namespace              |
 *
 * (The named-import failure is because the CJS bundle installs its exports as
 * `Object.defineProperty` getters, which node's cjs-module-lexer cannot see.)
 *
 * So no single import form is correct everywhere, and this module is loaded
 * both ways: directly by node for the CLI, and through a bundler by the test
 * suite — and later by the web adapter, which hits the same wall. A namespace
 * import plus one probe for a function that only exists on the real API is the
 * only form that survives both.
 */
const gifenc = ((m: unknown): typeof gifencModule.default =>
  typeof (m as { quantize?: unknown }).quantize === 'function'
    ? (m as typeof gifencModule.default)
    : (m as { default: typeof gifencModule.default }).default
)(gifencModule)

const { GIFEncoder, quantize, applyPalette } = gifenc

/**
 * A rendered stereogram frame: row-major 8-bit greyscale, `width * height` long.
 *
 * Declared structurally rather than imported from `core` so the encoders stay
 * usable with anything that produces a greyscale buffer — including the
 * rasteriser's depth maps, which are useful to dump while debugging.
 */
export interface GreyFrame {
  readonly pixels: Uint8Array
  readonly width: number
  readonly height: number
}

/** Frames may arrive lazily; nothing here holds a whole animation in memory. */
export type FrameSource = Iterable<GreyFrame> | AsyncIterable<GreyFrame>

function checkFrame(frame: GreyFrame, label: string): void {
  const { pixels, width, height } = frame
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`${label}: bad frame size ${width}x${height}`)
  }
  if (pixels.length !== width * height) {
    throw new Error(
      `${label}: frame is ${width}x${height} so pixels should be ` +
      `${width * height} bytes, got ${pixels.length}`,
    )
  }
}

/** Greyscale → opaque RGBA, which is what every encoder here wants. */
function toRgba(frame: GreyFrame): Uint8Array {
  const { pixels } = frame
  const rgba = new Uint8Array(pixels.length * 4)
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i]!
    const o = i * 4
    rgba[o] = v
    rgba[o + 1] = v
    rgba[o + 2] = v
    rgba[o + 3] = 255
  }
  return rgba
}

async function* iterate(frames: FrameSource): AsyncGenerator<GreyFrame> {
  if (Symbol.asyncIterator in frames) {
    for await (const f of frames as AsyncIterable<GreyFrame>) yield f
  } else {
    for (const f of frames as Iterable<GreyFrame>) yield f
  }
}

function encodePng(canvas: Canvas, frame: GreyFrame): Buffer {
  const ctx = canvas.getContext('2d')
  const id = ctx.createImageData(frame.width, frame.height)
  id.data.set(toRgba(frame))
  ctx.putImageData(id, 0, 0)
  return canvas.encodeSync('png')
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

/** Write one frame as a PNG. Lossless, so the dot field survives byte-exactly. */
export async function writePng(path: string, frame: GreyFrame): Promise<void> {
  checkFrame(frame, 'writePng')
  const canvas = createCanvas(frame.width, frame.height)
  const bytes = encodePng(canvas, frame)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes)
}

export interface PngSequenceOpts {
  /** Filename prefix. Default `frame-`. */
  prefix?: string
  /** Zero-padding width for the index. Default 4. */
  pad?: number
}

/**
 * Write every frame into `dir` as `frame-0000.png`, `frame-0001.png`, …
 *
 * The padded, lexicographically sortable names are what let the sequence be fed
 * straight back to `ffmpeg -i frame-%04d.png` without a sort step.
 *
 * Unlike `writeGif` and `writeMp4`, a frame whose size differs from its
 * predecessor is allowed: these are independent files, nothing here stitches
 * them, and dumping differently-sized debug frames into one directory is a
 * reasonable thing to want. Feeding a ragged sequence to ffmpeg is the caller's
 * problem, and ffmpeg says so loudly.
 */
export async function writePngSequence(
  dir: string, frames: FrameSource, opts: PngSequenceOpts = {},
): Promise<string[]> {
  const prefix = opts.prefix ?? 'frame-'
  const pad = opts.pad ?? 4
  await mkdir(dir, { recursive: true })

  const written: string[] = []
  let canvas: Canvas | undefined
  let i = 0
  for await (const frame of iterate(frames)) {
    checkFrame(frame, `writePngSequence frame ${i}`)
    if (!canvas || canvas.width !== frame.width || canvas.height !== frame.height) {
      canvas = createCanvas(frame.width, frame.height)
    }
    const path = join(dir, `${prefix}${String(i).padStart(pad, '0')}.png`)
    await writeFile(path, encodePng(canvas, frame))
    written.push(path)
    i++
  }
  return written
}

// ---------------------------------------------------------------------------
// GIF
// ---------------------------------------------------------------------------

/** Black and white, in gifenc's `[r, g, b]` palette shape. */
const BW_PALETTE: number[][] = [[0, 0, 0], [255, 255, 255]]

export interface GifOpts {
  /** Frames per second. Default 12. Ignored if `delayMs` is given. */
  fps?: number
  /**
   * Per-frame delay in milliseconds. GIF stores delays in 10ms units, so this
   * is rounded: 12fps (83ms) is written — and reads back — as 80ms.
   */
  delayMs?: number
  /** -1 = play once, 0 = loop forever (default), >0 = that many repeats. */
  loop?: number
}

/**
 * Write an animated GIF.
 *
 * GIF is a genuinely good container here rather than a compromise: a stereogram
 * frame is binary black and white, so a 2-colour palette is exact. The format
 * is therefore lossless for this payload *and* smaller than a lossless MP4 of
 * the same frames.
 */
export async function writeGif(
  path: string, frames: FrameSource, opts: GifOpts = {},
): Promise<void> {
  const delay = opts.delayMs ?? Math.round(1000 / (opts.fps ?? 12))
  const loop = opts.loop ?? 0
  const enc = GIFEncoder()

  let palette: number[][] | undefined
  let width = 0
  let height = 0
  let count = 0

  for await (const frame of iterate(frames)) {
    checkFrame(frame, `writeGif frame ${count}`)
    if (count === 0) {
      width = frame.width
      height = frame.height
    } else if (frame.width !== width || frame.height !== height) {
      throw new Error(
        `writeGif frame ${count}: every frame must be the same size; ` +
        `expected ${width}x${height}, got ${frame.width}x${frame.height}`,
      )
    }

    const rgba = toRgba(frame)
    if (!palette) {
      // `quantize` returns FEWER entries than asked when the input has fewer
      // colours — an all-black first frame yields a single-colour palette, and
      // a global palette of one colour flattens every later frame to black.
      // Measured: quantize(allBlack, 2) -> [[0,0,0]].
      const found = quantize(rgba, 2)
      palette = found.length >= 2 ? found : BW_PALETTE
    }

    const index = applyPalette(rgba, palette)
    enc.writeFrame(index, width, height, {
      // The palette and the loop count live in the global header, which gifenc
      // writes on the first frame only.
      ...(count === 0 ? { palette, repeat: loop } : {}),
      delay,
    })
    count++
  }

  if (count === 0) throw new Error('writeGif: no frames to encode')

  enc.finish()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, enc.bytes())
}

// ---------------------------------------------------------------------------
// MP4
// ---------------------------------------------------------------------------

/**
 * The lossless default, and the reason for it.
 *
 * A stereogram's depth information is carried entirely by *which* dots match
 * which other dots horizontally. Lossy DCT compression smears neighbouring
 * pixels, and 4:2:0 chroma subsampling averages them outright, so both destroy
 * the exact correlations that are the signal. Measured on ffmpeg 8.0.1 with a
 * 16x12 dot field: `-qp 0 -pix_fmt yuv444p` round-trips with zero mismatched
 * pixels, while `-crf 28 -pix_fmt yuv420p` gets ~145 of 256 pixels wrong and
 * turns 2 distinct values into 55.
 */
export const LOSSLESS_MP4 = { codec: 'libx264', qp: 0, pixFmt: 'yuv444p' } as const

/** Pixel formats with no chroma subsampling, so safe for a dot field. */
const FULL_CHROMA = new Set([
  'yuv444p', 'yuv444p10le', 'yuv444p12le', 'yuv444p16le', 'yuvj444p',
  'yuva444p', 'gbrp', 'gbrp10le', 'gbrp12le', 'gbrp16le',
  'rgb24', 'bgr24', 'rgb48le', 'gray', 'gray10le', 'gray16le',
])

/** Codecs that can encode mathematically losslessly. */
const LOSSLESS_CAPABLE = new Set([
  'libx264', 'libx264rgb', 'libx265', 'ffv1', 'huffyuv', 'utvideo',
  'libvpx-vp9', 'libaom-av1', 'png', 'qtrle', 'rawvideo', 'v210',
])

const FUSION_CONSEQUENCE =
  'lossy compression smears the pixel-level dot correlations that carry the ' +
  'stereo signal, so the output may not fuse into a 3D image at all — a ' +
  'failure that looks like a bug in the generator rather than a bad encode'

export interface Mp4Opts {
  /** Frames per second. Default 12. */
  fps?: number
  /** Video codec. Default `libx264`. */
  codec?: string
  /** Constant quantiser. Default 0 (lossless). Ignored when `crf` is set. */
  qp?: number
  /** Constant rate factor. Lossy unless 0; overrides `qp` when set. */
  crf?: number
  /** Pixel format. Default `yuv444p` (no chroma subsampling). */
  pixFmt?: string
  /** Extra ffmpeg arguments, inserted just before the output path. */
  extraArgs?: readonly string[]
  /** ffmpeg binary. Default `ffmpeg`, resolved on PATH. */
  ffmpegPath?: string
}

export interface Mp4Encoding {
  readonly fps: number
  readonly ffmpegPath: string
  readonly args: readonly string[]
  /** One line per way the chosen settings will damage the stereo signal. */
  readonly warnings: readonly string[]
}

/**
 * Resolve `Mp4Opts` into an ffmpeg argv plus any warnings the settings earn.
 *
 * Pure, so the codec policy is testable without an ffmpeg on the machine.
 */
export function resolveMp4Encoding(opts: Mp4Opts = {}, outPath = 'out.mp4'): Mp4Encoding {
  const fps = opts.fps ?? 12
  const codec = opts.codec ?? LOSSLESS_MP4.codec
  const pixFmt = opts.pixFmt ?? LOSSLESS_MP4.pixFmt
  const useCrf = opts.crf !== undefined
  const qp = opts.qp ?? LOSSLESS_MP4.qp

  const quality = useCrf ? ['-crf', String(opts.crf)] : ['-qp', String(qp)]

  const args = [
    '-y',
    '-f', 'image2pipe',
    '-framerate', String(fps),
    '-i', '-',
    '-c:v', codec,
    ...quality,
    '-pix_fmt', pixFmt,
    ...(opts.extraArgs ?? []),
    outPath,
  ]

  const warnings: string[] = []
  if (useCrf ? opts.crf !== 0 : qp !== 0) {
    const flag = useCrf ? `-crf ${opts.crf}` : `-qp ${qp}`
    warnings.push(
      `staticstereo: WARNING: MP4 requested with ${flag}, which is lossy. ` +
      `Here ${FUSION_CONSEQUENCE}. The lossless default is -qp 0.`,
    )
  }
  if (!FULL_CHROMA.has(pixFmt)) {
    warnings.push(
      `staticstereo: WARNING: MP4 requested with -pix_fmt ${pixFmt}, which ` +
      `subsamples chroma. Averaging neighbouring dots is itself lossy, so ${FUSION_CONSEQUENCE}. ` +
      `The lossless default is -pix_fmt ${LOSSLESS_MP4.pixFmt}.`,
    )
  }
  if (!LOSSLESS_CAPABLE.has(codec)) {
    warnings.push(
      `staticstereo: WARNING: MP4 requested with -c:v ${codec}, which cannot ` +
      `encode losslessly at any quality setting. Here ${FUSION_CONSEQUENCE}. ` +
      `The lossless default is -c:v ${LOSSLESS_MP4.codec}.`,
    )
  }

  return { fps, ffmpegPath: opts.ffmpegPath ?? 'ffmpeg', args, warnings }
}

function ffmpegMissing(path: string): Error {
  return new Error(
    `ffmpeg not found: tried to run "${path}". MP4 output needs the ffmpeg ` +
    `binary, which is not bundled. Install it (Debian/Ubuntu: ` +
    `"sudo apt install ffmpeg"; macOS: "brew install ffmpeg"; otherwise ` +
    `https://ffmpeg.org/download.html), or pass ffmpegPath. GIF and PNG ` +
    `output need no external binary.`,
  )
}

function writeChunk(stream: Writable, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(bytes, err => (err ? reject(err) : resolve()))
  })
}

/**
 * Encode frames to an MP4 by piping PNGs into ffmpeg.
 *
 * Defaults to lossless (`LOSSLESS_MP4`). Any override that degrades the dot
 * field prints a warning to stderr naming the consequence, because the symptom
 * — an image that will not fuse — is otherwise indistinguishable from a bug in
 * the generator.
 */
export async function writeMp4(
  path: string, frames: FrameSource, opts: Mp4Opts = {},
): Promise<void> {
  const enc = resolveMp4Encoding(opts, path)
  for (const w of enc.warnings) process.stderr.write(`${w}\n`)

  // Pull the first frame before spawning anything, so an empty source fails
  // with its own message instead of leaving a doomed ffmpeg to be killed.
  const it = iterate(frames)[Symbol.asyncIterator]()
  const first = await it.next()
  if (first.done) throw new Error('writeMp4: no frames to encode')

  await mkdir(dirname(path), { recursive: true })

  const child = spawn(enc.ffmpegPath, enc.args, { stdio: ['pipe', 'ignore', 'pipe'] })

  let stderr = ''
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => {
    stderr += chunk
    if (stderr.length > 64_000) stderr = stderr.slice(-64_000)
  })

  let spawnErr: Error | undefined

  /** Rejects if the binary could not be started. Never resolves. */
  const fatal = new Promise<never>((_, reject) => {
    child.on('error', (err: NodeJS.ErrnoException) => {
      spawnErr = err.code === 'ENOENT' ? ffmpegMissing(enc.ffmpegPath) : err
      reject(spawnErr)
    })
  })

  /** Settles when the process is gone. */
  const closed = new Promise<void>((resolve, reject) => {
    child.on('close', (code, signal) => {
      // A failed spawn also emits 'close', with a code of -2 for ENOENT. Left
      // to itself that race wins and reports "ffmpeg exited with code -2",
      // burying the install hint the user actually needs.
      if (spawnErr) return reject(spawnErr)
      if (code === 0) return resolve()
      const why = signal ? `killed by ${signal}` : `exited with code ${code}`
      reject(new Error(
        `ffmpeg ${why} while writing "${path}".\n` +
        `command: ${enc.ffmpegPath} ${enc.args.join(' ')}\n` +
        `${stderr.trim() || '(no stderr output)'}`,
      ))
    })
  })

  // Both are awaited below, but not on every path; mark them handled so a
  // failure never surfaces as an unhandled rejection in an unrelated test.
  void fatal.catch(() => undefined)
  void closed.catch(() => undefined)

  const feed = async (): Promise<void> => {
    const canvas = createCanvas(first.value.width, first.value.height)
    let i = 0
    let step: IteratorResult<GreyFrame> = first
    while (!step.done) {
      const frame = step.value
      checkFrame(frame, `writeMp4 frame ${i}`)
      if (frame.width !== canvas.width || frame.height !== canvas.height) {
        throw new Error(
          `writeMp4 frame ${i}: every frame must be the same size; expected ` +
          `${canvas.width}x${canvas.height}, got ${frame.width}x${frame.height}`,
        )
      }
      await writeChunk(child.stdin, encodePng(canvas, frame))
      i++
      step = await it.next()
    }
  }

  try {
    // Racing against `fatal` matters: with no ffmpeg to read it, the first
    // write to stdin would otherwise hang rather than fail.
    await Promise.race([feed(), fatal])
  } catch (err) {
    // ffmpeg rejecting its arguments kills the pipe, so the write fails with
    // EPIPE before the exit status arrives. ffmpeg's own stderr is the useful
    // diagnosis, so give `closed` the chance to supply it.
    child.stdin.destroy()
    await closed.then(() => { throw err })
  }

  child.stdin.end()
  await Promise.race([closed, fatal])
}
