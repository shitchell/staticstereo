/**
 * Scene × time → depth map.
 *
 * This is where the compositing invariant lives:
 *
 *     depth[i] = max(depth[i], layerDepth × mask[i])
 *
 * **Never alpha-blend.** Blending two layers at different depths produces a
 * value that means neither — a logo at 1.0 over a dot at 0.6 reads 0.8, a
 * surface floating in empty space between two real ones. See the design doc
 * §2.1, and the regression test in `raster.test.ts` that exists solely to fail
 * if this is ever "simplified".
 *
 * `depthBlur` is deliberately **not** applied here. It belongs to the render
 * pipeline, after compositing and before encoding, precisely so the invariant
 * above stays exactly testable on unblurred output (design §2.2).
 *
 * The drawing surface is injected (`CanvasLike`), so this file is isomorphic:
 * it imports nothing from `src/node/` or `src/web/` and has no dependencies.
 */
import { composeAnim, compilePreset } from './anim/index.js'
import type { PresetCtx } from './anim/index.js'
import type { CanvasLike, Ctx2D, DecodedGif, DecodedImage, ImageDataLike } from './canvaslike.js'
import type { Layer, MaskSource, Scene, Transform } from './types.js'

/** Default type size for a text layer, in px. */
const DEFAULT_TEXT_SIZE = 48
const DEFAULT_FONT_FAMILY = 'sans-serif'

/**
 * GIF delay to assume when a frame declares 0. Real GIFs do this constantly —
 * "as fast as possible" — and browsers substitute ~100ms. Zero would make the
 * cycle length 0 and the frame choice a division by zero.
 */
const GIF_DEFAULT_DELAY_MS = 100

/**
 * How a layer's drawn RGBA becomes (mask, depth).
 *
 * - `'alpha'`     — mask is the alpha channel; depth is the layer's flat depth.
 * - `{luma: t}`   — mask is `luminance >= t` (gated by alpha); flat depth.
 *                   This is the opaque-artwork case: a logo on a white
 *                   background silhouettes to a rectangle under `'alpha'`.
 * - `'heightmap'` — depth is per-pixel luminance scaled by the layer's depth;
 *                   mask is still alpha, so a transparent PNG's background
 *                   does not become a depth-0 slab that hides nothing.
 */
type Readback = 'alpha' | 'heightmap' | { luma: number }

interface Prepared {
  /** Measured content extent, fed to presets as `contentW`/`contentH`. */
  contentW: number
  contentH: number
  /** Where the layer's local origin sits when `at` is omitted. */
  defaultAt: [number, number]
  /** Draw the mask in white, at the layer's local origin. */
  draw(ctx: Ctx2D): void
  readback: Readback
}

/**
 * Decoded-asset cache. `rasterDepth` is called once per frame, so without this
 * a 48-frame render decodes every PNG and GIF 48 times. Callers that render a
 * sequence should create one and pass it to every frame.
 */
export interface RasterCache {
  images: Map<string, Promise<DecodedImage>>
  gifs: Map<string, Promise<DecodedGif>>
  /** Scratch surfaces used to make a GIF frame drawable, keyed by src. */
  gifScratch: Map<string, Ctx2D>
}

export function createRasterCache(): RasterCache {
  return { images: new Map(), gifs: new Map(), gifScratch: new Map() }
}

/**
 * Scene duration in seconds, never 0.
 *
 * Design §4.1: a zero-width window pins every track at one endpoint — for
 * `marquee` that is fully off-screen, so a still of a scrolling scene renders
 * completely empty. An explicit `0` is treated the same as an absent value
 * rather than honoured, because the only thing honouring it can produce is
 * that empty frame.
 */
export function sceneDurationOf(scene: Scene): number {
  const d = scene.duration
  return d !== undefined && Number.isFinite(d) && d > 0 ? d : 1
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Rec. 709 relative luminance, normalised to 0..1. */
function luma(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/**
 * Rasterise one frame of `scene` at `seconds` into a depth map.
 *
 * @returns row-major, length `w*h`, values 0..1 (0 = background, 1 = nearest)
 */
export async function rasterDepth(
  scene: Scene,
  seconds: number,
  canvas: CanvasLike,
  cache: RasterCache = createRasterCache(),
): Promise<Float32Array> {
  const [w, h] = scene.size
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) {
    throw new Error(`rasterDepth: scene.size must be positive integers, got [${w}, ${h}]`)
  }
  const out = new Float32Array(w * h)
  const sceneDuration = sceneDurationOf(scene)
  // One scratch surface for every layer: each layer's mask is read back before
  // the next is drawn, and compositing happens in `out`, never on the canvas.
  const scratch = canvas.make(w, h)

  for (const layer of scene.layers) {
    const prep = await prepare(layer, scene, seconds, sceneDuration, canvas, scratch, cache)
    // Hoisted because presets need it too, not only the compositor: `emerge`
    // expresses an absolute depth range as an offset and cannot do that without
    // knowing the base it is offsetting from.
    const layerDepth = layer.depth ?? 1
    const ctx: PresetCtx = {
      sceneW: w,
      sceneH: h,
      contentW: prep.contentW,
      contentH: prep.contentH,
      layerDepth,
    }
    const t: Transform = composeAnim(layer.anim, seconds, sceneDuration, ctx, compilePreset)

    const at = layer.at ?? prep.defaultAt
    scratch.clearRect(0, 0, w, h)
    scratch.fillStyle = '#ffffff'
    scratch.save()
    scratch.translate(at[0] + t.x, at[1] + t.y)
    if (t.rotate !== 0) scratch.rotate(t.rotate)
    if (t.scale !== 1) scratch.scale(t.scale, t.scale)
    prep.draw(scratch)
    scratch.restore()

    composite(out, scratch.getImageData(0, 0, w, h), layerDepth, t.depth, prep.readback)
  }

  return out
}

/**
 * The invariant, in one place.
 *
 * Note the clamp happens on the layer's depth *before* the mask multiply, not
 * on the composited result. The layer's surface is at a clamped depth and its
 * antialiased edge ramps from there to the background; clamping afterwards
 * would instead let an over-1.0 offset push edge pixels to a depth the surface
 * itself never occupies.
 *
 * One consequence worth stating, because it contradicts a literal reading of
 * design §2.2: a layer-over-layer boundary is *not* always a hard step. Where a
 * near layer at 1.0 overlaps a far one at 0.6, its own antialiased mask edge
 * yields `max(0.6, 1.0 × m)` for `m` in (0.6, 1), i.e. a 1px ramp of genuinely
 * intermediate depths — measured at 16 such pixels for a 4px-radius circle on
 * `@napi-rs/canvas`, including 0.769 and 0.780. That ramp is correct and is the
 * artifact mitigation §2.2's last paragraph wants; what max-compositing forbids
 * is an intermediate value across an overlap *interior*. The regression test
 * must therefore be written on exact (non-antialiased) masks, which is a second
 * reason the core tests use a fake canvas rather than a real one.
 */
function composite(
  out: Float32Array,
  img: ImageDataLike,
  baseDepth: number,
  depthOffset: number,
  readback: Readback,
): void {
  const px = img.data
  const flat = clamp01(baseDepth + depthOffset)
  const threshold = typeof readback === 'object' ? readback.luma : 0

  for (let i = 0; i < out.length; i++) {
    const p = i * 4
    const a = px[p + 3]! / 255
    if (a === 0) continue

    let mask = a
    let depth = flat
    if (readback === 'heightmap') {
      depth = clamp01(baseDepth * luma(px[p]!, px[p + 1]!, px[p + 2]!) + depthOffset)
    } else if (typeof readback === 'object') {
      if (luma(px[p]!, px[p + 1]!, px[p + 2]!) < threshold) continue
      mask = a
    }

    const v = depth * mask
    if (v > out[i]!) out[i] = v
  }
}

/* -------------------------------------------------------------- per layer */

async function prepare(
  layer: Layer,
  scene: Scene,
  seconds: number,
  sceneDuration: number,
  canvas: CanvasLike,
  scratch: Ctx2D,
  cache: RasterCache,
): Promise<Prepared> {
  const [sceneW, sceneH] = scene.size

  switch (layer.type) {
    case 'text': {
      const size = layer.size ?? DEFAULT_TEXT_SIZE
      const font = [layer.weight, `${size}px`, layer.font ?? DEFAULT_FONT_FAMILY]
        .filter(Boolean)
        .join(' ')
      // Measure before drawing: `marquee` travels to `-contentW`, so an unmeasured
      // (or zero) width leaves the tail of an over-wide string parked on screen.
      scratch.font = font
      const contentW = scratch.measureText(layer.text).width
      return {
        contentW,
        contentH: size,
        defaultAt: [0, 0],
        draw: ctx => {
          ctx.font = font
          // 'top' makes `at` the top-left corner of the text box, so a layer's
          // position means the same thing for text as for everything else.
          ctx.textBaseline = 'top'
          ctx.fillText(layer.text, 0, 0)
        },
        readback: 'alpha',
      }
    }

    case 'image': {
      const img = await loadImage(layer.src, canvas, cache)
      return {
        contentW: img.width,
        contentH: img.height,
        defaultAt: [0, 0],
        draw: ctx => ctx.drawImage(img.handle, 0, 0, img.width, img.height),
        readback: imageReadback(layer.mode, layer.mask, img.hasAlpha),
      }
    }

    case 'gif': {
      const gif = await loadGif(layer.src, canvas, cache)
      if (gif.frames.length === 0) throw new Error(`gif layer "${layer.src}" decoded to 0 frames`)
      const frame = gif.frames[gifFrameIndex(gif, seconds, layer.loop ?? 'loop')]!
      // putImageData ignores the transform, so the frame goes onto its own
      // surface first and is then drawn through the layer transform.
      let host = cache.gifScratch.get(layer.src)
      if (!host) {
        host = canvas.make(gif.width, gif.height)
        cache.gifScratch.set(layer.src, host)
      }
      const data = host.createImageData(gif.width, gif.height)
      data.data.set(frame.rgba)
      host.putImageData(data, 0, 0)
      const handle = host.canvas
      // Per-frame, because a GIF's frames need not agree: a sprite sheet can
      // have transparent frames and opaque ones, and guessing from frame 0
      // would silently change how later frames render.
      let frameHasAlpha = false
      for (let i = 3; i < frame.rgba.length; i += 4) {
        if (frame.rgba[i]! < 255) { frameHasAlpha = true; break }
      }
      return {
        contentW: gif.width,
        contentH: gif.height,
        defaultAt: [0, 0],
        draw: ctx => ctx.drawImage(handle, 0, 0, gif.width, gif.height),
        // Resolved exactly like a still image. GIF layers originally hardcoded
        // silhouette, which left an opaque GIF silhouetting to its bounding
        // rectangle with heightmap not expressible at all.
        readback: imageReadback(layer.mode, layer.mask, frameHasAlpha),
      }
    }

    case 'shape': {
      if (layer.shape === 'circle') {
        const r = layer.r
        if (r === undefined || !Number.isFinite(r) || r <= 0) {
          throw new Error(`shape layer "circle" needs a positive "r", got ${JSON.stringify(layer.r)}`)
        }
        return {
          contentW: r * 2,
          contentH: r * 2,
          // `at` is a circle's *centre*, so the scene centre is the only
          // sensible default — (0,0) would put three quarters of it off-canvas.
          defaultAt: [sceneW / 2, sceneH / 2],
          draw: ctx => {
            // `start`/`end` in DEGREES, clockwise from 3 o'clock, turn the
            // circle into a pie slice — which is the only thing standing
            // between this scene format and a pacman, the shape that started
            // the project. A wedge otherwise needs a PNG, and the examples
            // then need binary art that cannot be reviewed in a diff.
            const span = arcSpan(layer.start, layer.end)
            ctx.beginPath()
            if (span !== null) ctx.moveTo(0, 0)   // the wedge's point
            ctx.arc(0, 0, r, span?.[0] ?? 0, span?.[1] ?? Math.PI * 2)
            ctx.closePath()
            ctx.fill()
          },
          readback: 'alpha',
        }
      }
      const { w, h } = layer
      if (w === undefined || h === undefined || !(w > 0) || !(h > 0)) {
        throw new Error(
          `shape layer "rect" needs positive "w" and "h", got ` +
          `${JSON.stringify(layer.w)} x ${JSON.stringify(layer.h)}`,
        )
      }
      return {
        contentW: w,
        contentH: h,
        defaultAt: [0, 0],
        draw: ctx => ctx.fillRect(0, 0, w, h),
        readback: 'alpha',
      }
    }

    case 'draw':
      // Deliberately unimplemented in `core`. `fn` is a module *path*, and
      // resolving one is a platform concern: `import()` of a filesystem path
      // works in Node and not in a static browser bundle, where there is no
      // path to resolve and no bundler entry for it. Loading it here would
      // either break the web build or smuggle a Node dependency into `core`,
      // which the injected `CanvasLike` exists to prevent. The seam belongs on
      // the adapter (a `CanvasLike.loadModule`, or a pre-resolved function on
      // the layer) — a decision for the author, not a guess from here.
      throw new Error(
        `layer type "draw" (fn: ${JSON.stringify(layer.fn)}) is not supported by core: ` +
        `resolving a module path is platform-specific, so the loader seam has to be ` +
        `designed on the adapter rather than guessed at in core.`,
      )
  }
}

/**
 * Wedge bounds in degrees → radians, or `null` for a full circle.
 *
 * Both or neither: one alone is almost certainly a typo for a pie slice, and
 * silently drawing a full disc would look like the renderer ignoring the scene.
 * Same loud-failure policy as the preset registry.
 */
function arcSpan(
  start: number | undefined,
  end: number | undefined,
): [number, number] | null {
  if (start === undefined && end === undefined) return null
  if (start === undefined || end === undefined) {
    throw new Error(
      'shape layer "circle": "start" and "end" must be given together ' +
      `(got start=${JSON.stringify(start)}, end=${JSON.stringify(end)}); ` +
      'omit both for a full circle',
    )
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error(
      `shape layer "circle": "start" and "end" must be finite degrees, got ` +
      `${JSON.stringify(start)} and ${JSON.stringify(end)}`,
    )
  }
  if (end <= start) {
    throw new Error(
      `shape layer "circle": "end" (${end}) must be greater than "start" ` +
      `(${start}); the wedge is swept clockwise from 3 o'clock`,
    )
  }
  const RAD = Math.PI / 180
  return [start * RAD, end * RAD]
}

/**
 * Image → depth mode resolution (design §3.1).
 *
 * Note the second rule, which the plan's three-line version omits: a `mask`
 * with no `mode` must select silhouette. The design's own example is
 * `{src: 'logo.png', depth: 1.0, mask: {luma: 0.5}}` — opaque artwork, so
 * alpha auto-detection would fall through to heightmap and silently ignore the
 * mask that was the whole point of writing it.
 */
function imageReadback(
  mode: 'silhouette' | 'heightmap' | undefined,
  mask: MaskSource | undefined,
  hasAlpha: boolean,
): Readback {
  if (mode === 'heightmap') return 'heightmap'
  if (mode === 'silhouette') return mask ?? 'alpha'
  if (mask !== undefined) return mask
  return hasAlpha ? 'alpha' : 'heightmap'
}

function loadImage(src: string, canvas: CanvasLike, cache: RasterCache): Promise<DecodedImage> {
  let p = cache.images.get(src)
  if (!p) {
    p = canvas.loadImage(src)
    cache.images.set(src, p)
  }
  return p
}

function loadGif(src: string, canvas: CanvasLike, cache: RasterCache): Promise<DecodedGif> {
  let p = cache.gifs.get(src)
  if (!p) {
    p = canvas.loadGif(src)
    cache.gifs.set(src, p)
  }
  return p
}

/**
 * Pick a GIF frame from the GIF's own delays — underneath the layer animator,
 * so a walk cycle plays while the sprite also translates.
 *
 * `pingpong` reflects in *frame index* space (0,1,2,1 for three frames) rather
 * than in time (which would yield 0,1,2,2,1,0 and hold both turning frames for
 * a double beat).
 */
export function gifFrameIndex(
  gif: DecodedGif,
  seconds: number,
  loop: 'loop' | 'once' | 'pingpong',
): number {
  const n = gif.frames.length
  if (n <= 1) return 0

  const delay = (i: number) => {
    const d = gif.frames[i]!.delayMs
    return Number.isFinite(d) && d > 0 ? d : GIF_DEFAULT_DELAY_MS
  }

  const order: number[] = []
  for (let i = 0; i < n; i++) order.push(i)
  if (loop === 'pingpong') for (let i = n - 2; i >= 1; i--) order.push(i)

  let cycle = 0
  for (const i of order) cycle += delay(i)

  let ms = seconds * 1000
  if (!Number.isFinite(ms) || ms < 0) ms = 0
  if (loop === 'once') {
    if (ms >= cycle) return n - 1
  } else {
    ms = ms - Math.floor(ms / cycle) * cycle
  }

  let acc = 0
  for (const i of order) {
    acc += delay(i)
    if (ms < acc) return i
  }
  return order[order.length - 1]!
}
