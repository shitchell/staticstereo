#!/usr/bin/env node
/**
 * `stst` — the CLI.
 *
 * This file is plumbing on purpose: parsing lives in `args.ts` (pure), scene
 * loading and validation in `scene.ts`, and every stage of the pipeline is
 * already built and tested in `core` and `node`. What is left here is the
 * wiring, and the wiring is exactly what `index.test.ts` measures rather than
 * trusts — it renders a real GIF and checks that the repeat period inside the
 * shape is `sepNear × noiseScale` and outside it `sepFar × noiseScale`. "Exited
 * 0" is not evidence about a stereogram.
 *
 * Three decisions worth knowing:
 *
 * - **`run()` returns an exit code and never throws.** The process exit lives in
 *   the `main` guard at the bottom, so the whole CLI is callable from a test
 *   with captured output.
 * - **Nothing is printed to `process.stderr` from here on the success path.**
 *   `writeMp4` writes its own lossy-encoding warning there, and that warning
 *   must not be intercepted, buffered, or reworded: an MP4 that will not fuse
 *   looks exactly like a bug in the generator.
 * - **Timing comes from the scene, every time.** `sceneFps` feeds the encoder,
 *   so a `--fps 20` scene gets 20 frames *and* 50ms GIF delays. Hardcoding 12
 *   in either place produces an animation that plays at the wrong speed while
 *   every frame is individually correct.
 */
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  createRasterCache,
  dominantPeriod,
  frameTimes,
  isStill,
  rasterDepth,
  renderFrame,
  renderFrames,
  resolveStereo,
  rowOf,
  sceneDurationOf,
  sceneFps,
  stillTime,
} from '../core/index.js'
import type { CanvasLike, RasterCache, Scene, StereoOpts } from '../core/index.js'
import { nodeCanvas, writeGif, writeMp4, writePng, writePngSequence } from '../node/index.js'
import { HELP, UsageError, outputFormat, parseArgs } from './args.js'
import type { CliArgs } from './args.js'
import { applyOverrides, loadScene, textScene } from './scene.js'
import type { MeasureText } from './scene.js'

/** Where the CLI writes. Injected so tests can read what it said. */
export interface Io {
  out(line: string): void
  err(line: string): void
}

const CONSOLE_IO: Io = {
  out: line => void process.stdout.write(`${line}\n`),
  err: line => void process.stderr.write(`${line}\n`),
}

/**
 * Run the CLI. Returns the process exit code: 0 success, 1 failure, 2 usage.
 *
 * Never throws — every error becomes a one-line `stst: …` message, because a
 * stack trace from inside the rasteriser tells a user nothing about the scene
 * file they got wrong.
 */
export async function run(argv: readonly string[], io: Io = CONSOLE_IO): Promise<number> {
  try {
    const parsed = parseArgs(argv)
    if (parsed.kind === 'help') {
      io.out(HELP.trimEnd())
      return 0
    }
    if (parsed.kind === 'version') {
      io.out(await packageVersion())
      return 0
    }
    await execute(parsed.args, io)
    return 0
  } catch (err) {
    return report(err, io)
  }
}

function report(err: unknown, io: Io): number {
  const e = err instanceof Error ? err : new Error(String(err))
  io.err(`stst: ${e.message}`)
  if (e instanceof UsageError) {
    io.err('stst: see "stst --help" for usage')
    return 2
  }
  // Opt-in only: the message is the product, the stack is for whoever is
  // debugging staticstereo itself.
  if (process.env['STST_DEBUG'] !== undefined && e.stack !== undefined) io.err(e.stack)
  return 1
}

async function packageVersion(): Promise<string> {
  try {
    const path = fileURLToPath(new URL('../../package.json', import.meta.url))
    const pkg = JSON.parse(await readFile(path, 'utf8')) as { version?: unknown }
    if (typeof pkg.version === 'string') return pkg.version
  } catch {
    /* fall through — a missing package.json is not worth failing over */
  }
  return '0.0.0'
}

/* ------------------------------------------------------------------ dispatch */

async function execute(args: CliArgs, io: Io): Promise<void> {
  const say = args.quiet ? () => undefined : (line: string) => io.out(line)
  const canvas = nodeCanvas()
  const cache = createRasterCache()

  const base = args.scene !== undefined
    ? await loadScene(args.scene)
    : textScene(args, measurer(canvas))
  const scene = applyOverrides(base, args)

  /** The instant a single frame is taken from: §4.1's midpoint unless told otherwise. */
  const sampleAt = args.atTime ?? stillTime(scene)

  if (args.depthMap !== undefined) {
    await writeDepthMap(args.depthMap, scene, sampleAt, canvas, cache)
    say(`stst: wrote ${args.depthMap} (depth map at t=${sampleAt.toFixed(2)}s)`)
  }

  switch (args.command) {
    case 'still': {
      const out = args.output!
      const frame = await renderFrame(scene, sampleAt, canvas, cache)
      await writePng(out, frame)
      say(
        `stst: wrote ${out} (${frame.width}x${frame.height}, ` +
        `one frame at t=${sampleAt.toFixed(2)}s)`,
      )
      return
    }

    case 'render': {
      const out = args.output!
      const written = await writeSequence(out, scene, args, canvas, cache)
      say(`stst: wrote ${written.label} (${written.frames} frames, ${written.size})`)
      return
    }

    case 'preview': {
      const out = args.output ?? await tempPreviewPath(scene)
      const written = await writeSequence(out, scene, args, canvas, cache)
      for (const line of await previewReport(args, scene, sampleAt, canvas, cache, written)) {
        say(line)
      }
      if (args.open) openInViewer(written.label)
      return
    }
  }
}

function measurer(canvas: CanvasLike): MeasureText {
  // One 1x1 scratch context: `measureText` needs a context, not a surface.
  const ctx = canvas.make(1, 1)
  return (text, font) => {
    ctx.font = font
    return ctx.measureText(text).width
  }
}

/* -------------------------------------------------------------------- output */

interface Written {
  /** The path to show the user; for a sequence, the directory pattern. */
  label: string
  frames: number
  size: string
}

/**
 * Encode `scene` to `out`, picking the encoder from the extension.
 *
 * `frameTimes` is the single source of the frame count, so what is reported and
 * what is encoded cannot drift apart.
 */
async function writeSequence(
  out: string, scene: Scene, args: CliArgs, canvas: CanvasLike, cache: RasterCache,
): Promise<Written> {
  const format = outputFormat(out)
  const o = resolveStereo(scene)
  const [w, h] = scene.size
  const size = `${w * o.noiseScale}x${h * o.noiseScale}`
  const count = frameTimes(scene).length

  switch (format) {
    case 'gif':
      await writeGif(out, renderFrames(scene, canvas, cache), { fps: sceneFps(scene) })
      return { label: out, frames: count, size }

    case 'mp4':
      // `args.mp4` is spread last and is empty unless a flag was given, so the
      // lossless default in `writeMp4` stands untouched. Its warnings go
      // straight to stderr and are deliberately not routed through `io`.
      await writeMp4(out, renderFrames(scene, canvas, cache), {
        fps: sceneFps(scene), ...args.mp4,
      })
      return { label: out, frames: count, size }

    case 'png': {
      if (isStill(scene)) {
        const frame = await renderFrame(scene, stillTime(scene), canvas, cache)
        await writePng(out, frame)
        return { label: out, frames: 1, size }
      }
      // An animation cannot be one PNG, so `-o anim/frame.png` becomes
      // `anim/frame-0000.png`, … — padded so ffmpeg can read it straight back.
      const dir = dirname(out)
      const prefix = `${basename(out, extname(out))}-`
      const paths = await writePngSequence(dir, renderFrames(scene, canvas, cache), { prefix })
      return { label: join(dir, `${prefix}%04d.png`), frames: paths.length, size }
    }
  }
}

/**
 * Dump the depth map as a greyscale PNG.
 *
 * Deliberately *not* upscaled by `noiseScale`: this is the authored depth, in
 * scene pixels, and it is the only way to tell a depth-authoring bug from an
 * encoding bug — a stereogram cannot be inspected by eye (design §5).
 */
async function writeDepthMap(
  path: string, scene: Scene, seconds: number, canvas: CanvasLike, cache: RasterCache,
): Promise<void> {
  const [width, height] = scene.size
  const depth = await rasterDepth(scene, seconds, canvas, cache)
  const pixels = new Uint8Array(width * height)
  for (let i = 0; i < pixels.length; i++) {
    const d = depth[i]!
    pixels[i] = Math.round((d < 0 ? 0 : d > 1 ? 1 : d) * 255)
  }
  await writePng(path, { pixels, width, height })
}

/* ------------------------------------------------------------------- preview */

async function tempPreviewPath(scene: Scene): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'stst-preview-'))
  return join(dir, isStill(scene) ? 'preview.png' : 'preview.gif')
}

/**
 * What `preview` prints.
 *
 * There is no window to open here (see the report in the commit message), so
 * the useful thing a terminal *can* do is measure: `dominantPeriod` on the
 * middle row is the same check the test suite trusts, and the depth range says
 * whether the scene rasterised to anything at all. Both beat looking at a GIF
 * of static and guessing.
 */
async function previewReport(
  args: CliArgs,
  scene: Scene,
  seconds: number,
  canvas: CanvasLike,
  cache: RasterCache,
  written: Written,
): Promise<string[]> {
  const o = resolveStereo(scene)
  const [w, h] = scene.size
  const times = frameTimes(scene)

  const depth = await rasterDepth(scene, seconds, canvas, cache)
  let lo = Number.POSITIVE_INFINITY
  let hi = Number.NEGATIVE_INFINITY
  for (const d of depth) {
    if (d < lo) lo = d
    if (d > hi) hi = d
  }

  const frame = await renderFrame(scene, seconds, canvas, cache)
  const row = rowOf(frame.pixels, frame.width, Math.floor(frame.height / 2))
  const measured = dominantPeriod(
    row,
    Math.max(2, Math.floor(o.sepNear * o.noiseScale * 0.5)),
    Math.ceil(o.sepFar * o.noiseScale * 1.5),
  )

  const source = args.scene ?? `--text ${JSON.stringify(args.text ?? '')}`
  const timing = isStill(scene)
    ? `still, one frame sampled at t=${seconds.toFixed(2)}s`
    : `animated, ${sceneDurationOf(scene).toFixed(2)}s at ${sceneFps(scene)}fps = ` +
      `${times.length} frames`

  return [
    `stst preview: ${source}`,
    `  size     ${w}x${h} scene -> ${written.size} output (noiseScale ${o.noiseScale})`,
    `  timing   ${timing}`,
    `  stereo   ${stereoLine(o)}`,
    `  depth    ${lo.toFixed(2)}..${hi.toFixed(2)} over ${scene.layers.length} ` +
      `layer${scene.layers.length === 1 ? '' : 's'} at t=${seconds.toFixed(2)}s`,
    `  period   middle row ${describePeriod(measured)}; ` +
      `expect ${o.sepNear * o.noiseScale}px near, ${o.sepFar * o.noiseScale}px far`,
    `  wrote    ${written.label}`,
  ]
}

function stereoLine(o: StereoOpts): string {
  return (
    `sepFar ${o.sepFar}, sepNear ${o.sepNear}, depthBlur ${o.depthBlur}, ` +
    `seed ${o.seed}, cross ${o.cross ? 'on' : 'off'}`
  )
}

function describePeriod(m: { period: number; score: number; samples: number }): string {
  if (!Number.isFinite(m.period)) return 'not measurable (row too narrow)'
  return `${m.period}px (score ${m.score.toFixed(2)} over ${m.samples} samples)`
}

/**
 * Hand the rendered file to the platform's viewer.
 *
 * Opt-in (`--open`) and never on the default path, so no test ever spawns a
 * window — which is also why this is the one branch here with no coverage.
 */
function openInViewer(path: string): void {
  const cmd = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32' ? 'explorer' : 'xdg-open'
  const child = spawn(cmd, [path], { stdio: 'ignore', detached: true })
  child.on('error', () => undefined)
  child.unref()
}

/* ---------------------------------------------------------------------- main */

/**
 * Run only when executed, not when imported — vitest imports this module, and
 * `process.argv[1]` is the test runner there, so the comparison is what keeps
 * the suite from launching a render on import.
 */
const invoked = process.argv[1]
if (invoked !== undefined && import.meta.url === pathToFileURL(invoked).href) {
  process.exitCode = await run(process.argv.slice(2))
}
