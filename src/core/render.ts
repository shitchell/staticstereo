/**
 * The render pipeline: scene × time → a dot field.
 *
 *     rasterDepth → blurDepth → sirdsFromDepth → upscale
 *
 * Every stage is already tested on its own; what lives here is the *order* and
 * the three things only this file can get wrong:
 *
 * - **`depthBlur` is applied here**, between compositing and encoding, never
 *   inside the rasteriser — so the rasteriser's max-compositing invariant stays
 *   exactly testable on unblurred output (design §2.2).
 * - **`noiseScale` is applied exactly once.** This is the only place `upscale`
 *   is called. A forgotten call halves every measured period and a doubled one
 *   squares it, and neither throws, so `render.test.ts` measures the period
 *   rather than trusting the code to read correctly.
 * - **One `RasterCache` spans the whole sequence.** `rasterDepth` runs per
 *   frame, so without a shared cache a 48-frame render decodes every PNG and
 *   GIF 48 times.
 *
 * Nothing here imports from `src/node/` or `src/web/`: the drawing surface
 * arrives as a `CanvasLike`, which is what lets the same pipeline run in a
 * browser bundle. `purity.test.ts` enforces it.
 */
import { blurDepth } from './blur.js'
import { createRasterCache, rasterDepth, sceneDurationOf } from './raster.js'
import type { RasterCache } from './raster.js'
import { sirdsFromDepth, upscale } from './sirds.js'
import { DEFAULT_STEREO } from './types.js'
import type { CanvasLike } from './canvaslike.js'
import type { Scene, SirdsOpts, StereoOpts } from './types.js'

/**
 * Frame rate used when a scene gives a `duration` but no `fps`.
 *
 * 12 is the design doc's own example value and what the POC animated at. The
 * alternative — treating a scene with a duration and no fps as a still — would
 * render a four-second animation as one frame, which is never what the author
 * of a `duration` meant.
 */
export const DEFAULT_FPS = 12

/** A rendered frame: single-channel, 0 or 255, row-major. */
export interface Frame {
  readonly pixels: Uint8Array
  readonly width: number
  readonly height: number
}

/** A frame plus where it sits in the sequence. */
export interface SequenceFrame extends Frame {
  readonly index: number
  /** The sample time this frame was rendered at, in seconds. */
  readonly seconds: number
}

/**
 * Merge `scene.stereo` over the defaults and reject settings that would
 * produce a silently wrong image rather than an error.
 *
 * Each check below corresponds to an output that looks like a generator bug:
 * a fractional `noiseScale` mis-sizes the buffer, and `sepNear >= sepFar`
 * encodes every depth identically, giving a flat field that fuses to nothing.
 */
export function resolveStereo(scene: Scene): StereoOpts {
  const o: StereoOpts = { ...DEFAULT_STEREO, ...scene.stereo }

  if (!Number.isInteger(o.noiseScale) || o.noiseScale < 1) {
    throw new Error(
      `stereo.noiseScale must be a positive integer (it is a nearest-neighbour ` +
      `pixel replication factor), got ${JSON.stringify(o.noiseScale)}`,
    )
  }
  if (!Number.isFinite(o.sepFar) || !Number.isFinite(o.sepNear)) {
    throw new Error(
      `stereo.sepFar and stereo.sepNear must be finite, got ` +
      `${JSON.stringify(o.sepFar)} and ${JSON.stringify(o.sepNear)}`,
    )
  }
  if (o.sepNear < 2) {
    throw new Error(`stereo.sepNear must be at least 2px, got ${o.sepNear}`)
  }
  if (o.sepNear >= o.sepFar) {
    throw new Error(
      `stereo.sepNear (${o.sepNear}) must be less than stereo.sepFar (${o.sepFar}): ` +
      `the gap between them is the entire depth budget, so sepNear >= sepFar ` +
      `encodes every depth identically and the result fuses to a flat plane`,
    )
  }
  if (!Number.isFinite(o.depthBlur) || o.depthBlur < 0) {
    throw new Error(`stereo.depthBlur must be a non-negative number of px, got ${o.depthBlur}`)
  }
  if (!Number.isFinite(o.seed)) {
    throw new Error(`stereo.seed must be a finite number, got ${JSON.stringify(o.seed)}`)
  }
  return o
}

/**
 * Per-frame noise seed.
 *
 * `freezeNoise` reuses one seed for every frame: stable and easier to fuse, but
 * the shape becomes visible as motion to a single eye. The default
 * re-randomises, which is what makes an animation read as pure static.
 *
 * The varying seed is derived from the *sample time*, not from a frame counter,
 * so `renderFrame(scene, t)` stays a pure function of its arguments — re-render
 * one frame of a sequence on its own and you get the same bytes back. A counter
 * would make a frame's appearance depend on how many frames preceded it, which
 * breaks resuming a render and makes a single-frame repro impossible.
 */
function frameSeed(base: number, seconds: number, freeze: boolean): number {
  if (freeze) return base >>> 0
  // Quantise to microseconds so a given sample time always maps to one seed.
  // ToUint32 wraps, which is fine: this is a mixing input, not a magnitude.
  const t = (Number.isFinite(seconds) ? Math.round(seconds * 1e6) : 0) >>> 0
  let s = ((base >>> 0) ^ t) >>> 0
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0
  return (s ^ (s >>> 16)) >>> 0
}

/**
 * Render one frame of `scene` at `seconds`.
 *
 * Pass `cache` when rendering more than one frame — see {@link renderFrames},
 * which does it for you.
 */
export async function renderFrame(
  scene: Scene,
  seconds: number,
  canvas: CanvasLike,
  cache: RasterCache = createRasterCache(),
): Promise<Frame> {
  const [w, h] = scene.size
  const o = resolveStereo(scene)

  const depth = await rasterDepth(scene, seconds, canvas, cache)

  // §2.2: soften the depth step so the encoder stops copying from source
  // content of a different period, which shows up as a ghost of the shape
  // echoed up to sepFar px to its right. No period measurement catches that
  // artifact, which is why this stage is wired in by construction here rather
  // than being left to the caller.
  const smoothed = blurDepth(depth, w, h, o.depthBlur)

  // The four fields the encoder actually consumes, spelled out rather than
  // passing `o`. `StereoOpts` is assignable to `SirdsOpts`, so handing the
  // whole object over compiles and silently ignores noiseScale/depthBlur; an
  // explicit literal makes the seam visible at the one place it matters.
  const enc: SirdsOpts = {
    sepFar: o.sepFar,
    sepNear: o.sepNear,
    cross: o.cross,
    seed: frameSeed(o.seed, seconds, scene.freezeNoise === true),
  }
  const grey = sirdsFromDepth(smoothed, w, h, enc)

  // The single `upscale` in the codebase's render path.
  return {
    pixels: upscale(grey, w, h, o.noiseScale),
    width: w * o.noiseScale,
    height: h * o.noiseScale,
  }
}

/**
 * Is this scene a still?
 *
 * Only when it names neither a frame rate nor a duration. Either one on its
 * own is enough to mean "animate": a bare `fps` animates over the default
 * one-second duration, a bare `duration` animates at {@link DEFAULT_FPS}.
 */
export function isStill(scene: Scene): boolean {
  return !positive(scene.fps) && !positive(scene.duration)
}

function positive(v: number | undefined): boolean {
  return v !== undefined && Number.isFinite(v) && v > 0
}

/**
 * The time a still samples the scene at, in seconds.
 *
 * The **midpoint**, not 0 (design §4.1). With an absent duration treated as
 * 1 second — never 0 — this is 0.5s. Sampling t=0 renders a `marquee` scene
 * completely empty, because the text is legitimately off-screen right at the
 * start of its travel; `render.test.ts` pins both halves of that.
 *
 * `stst still --at <seconds>` overrides it.
 */
export function stillTime(scene: Scene): number {
  return sceneDurationOf(scene) / 2
}

/**
 * The effective frame rate {@link frameTimes} samples at. Returns
 * {@link DEFAULT_FPS} for a scene that names none, including a still (where it
 * is unused).
 */
export function sceneFps(scene: Scene): number {
  const fps = scene.fps
  return fps !== undefined && Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_FPS
}

/**
 * The sample times of every frame in `scene`, in seconds.
 *
 * A still yields exactly one time, the midpoint. An animation yields
 * `round(duration × fps)` times at `i / fps`, which **excludes** the endpoint:
 * `t = duration` is the same pose as `t = 0` for anything looping, so
 * including it would stutter every loop by one duplicated frame.
 */
export function frameTimes(scene: Scene): number[] {
  if (isStill(scene)) return [stillTime(scene)]
  const fps = sceneFps(scene)
  const duration = sceneDurationOf(scene)
  const count = Math.max(1, Math.round(duration * fps))
  const out = new Array<number>(count)
  for (let i = 0; i < count; i++) out[i] = i / fps
  return out
}

/**
 * Render every frame of `scene`, lazily.
 *
 * An async generator rather than an array on purpose: a 48-frame 800×450 scene
 * at noiseScale 2 is 48 × 2.9MB of pixels, and neither the CLI (which pipes
 * each frame straight into an encoder) nor the browser (which draws it and
 * drops it) has any use for the ones it has already consumed.
 *
 * One `RasterCache` is created for the whole sequence; pass your own to share
 * decoded assets with another render.
 */
export async function* renderFrames(
  scene: Scene,
  canvas: CanvasLike,
  cache: RasterCache = createRasterCache(),
): AsyncGenerator<SequenceFrame, void, undefined> {
  const times = frameTimes(scene)
  for (let index = 0; index < times.length; index++) {
    const seconds = times[index]!
    const frame = await renderFrame(scene, seconds, canvas, cache)
    yield { ...frame, index, seconds }
  }
}
