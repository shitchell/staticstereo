/**
 * Scene model for staticstereo.
 *
 * Depth convention throughout: 0 = background, 1 = nearest to the viewer.
 * This file is types + constants only — no runtime logic, so it is safe to
 * import from anywhere including the browser bundle.
 */

/** 0 = background, 1 = nearest to viewer. */
export type Depth = number

/**
 * Which encoder turns a depth map into dots.
 *
 * - `'shift'` — `out[x] = out[x - sep(x)]`, one leftward copy per pixel. The
 *   original, and still the default. Cheap and exact over flat depth, but
 *   content propagates rightward **without bound**: a near object rewrites
 *   every pixel downstream of itself and its ghost repeats every `sepFar` px to
 *   the right edge.
 * - `'linked'` — Thimbleby–Inglis–Witten. Constrains the *symmetric* pair
 *   `(x - sep/2, x + sep/2)` around each column, resolves the resulting
 *   equivalence classes, and removes links a nearer surface occludes. Content
 *   then stops at the object instead of smearing.
 *
 * Kept selectable rather than swapped in: the two are visibly different images
 * and which one fuses better is a perceptual judgement, not a correctness one.
 */
export type SirdsAlgorithm = 'shift' | 'linked'

export const SIRDS_ALGORITHMS: readonly SirdsAlgorithm[] = ['shift', 'linked']

/**
 * What the SIRDS encoder itself consumes.
 *
 * Deliberately narrower than {@link StereoOpts}: `noiseScale` and `depthBlur`
 * are *pipeline stages* applied either side of the encoder, not encoder
 * parameters. Passing them to `sirdsFromDepth` did nothing while looking like
 * it worked, and a forgotten or doubled upscale silently halves or doubles
 * every measured period.
 *
 * The `?: never` members are what actually enforce that, and they are not
 * decoration. An earlier version simply omitted the two fields and claimed the
 * compiler would reject them — it did not. Excess-property checking fires only
 * on fresh object literals, so with `StereoOpts extends SirdsOpts` a
 * `StereoOpts` *variable* was assignable to this parameter and
 * `sirdsFromDepth(d, w, h, stereo)` compiled clean while silently dropping both
 * fields. That is the exact mistake the split existed to prevent, via the most
 * natural call shape. Declaring them as `never` makes the wider type genuinely
 * unassignable.
 */
export interface SirdsOpts {
  /** Repeat period of the background, in px. */
  sepFar: number
  /** Repeat period of the nearest surface, in px. Must be < sepFar. */
  sepNear: number
  /** Invert depth for cross-eyed viewers. */
  cross: boolean
  seed: number
  /**
   * Which encoder to use. **Absent means `'shift'`**, the original behaviour,
   * so every existing caller and scene renders exactly as before.
   */
  algorithm?: SirdsAlgorithm
  /** Not an encoder parameter — applied by the pipeline via `upscale`. */
  noiseScale?: never
  /** Not an encoder parameter — applied by the pipeline via `blurDepth`. */
  depthBlur?: never
}

export interface StereoOpts
  extends Omit<SirdsOpts, 'noiseScale' | 'depthBlur' | 'algorithm'> {
  /** Nearest-neighbour upscale of noise pixels. 2 fuses more easily than 1. */
  noiseScale: number
  /**
   * Which encoder to use. Required here and optional on {@link SirdsOpts}: a
   * resolved {@link StereoOpts} is the pipeline's single source of truth, and
   * `resolveStereo` is the one place allowed to apply the `'shift'` default.
   * A scene's own `stereo.algorithm` is still optional — `Scene['stereo']` is a
   * `Partial` of this.
   */
  algorithm: SirdsAlgorithm
  /**
   * Gaussian blur radius in px applied to the depth map *after* compositing
   * and *before* encoding. **Defaults to 0 — off.**
   *
   * The theory was that a hard depth step makes the encoder copy from source
   * content of a different repeat period, leaving a ghost of the shape echoed
   * up to `sepFar` px to its right, and that blurring the step would suppress
   * it. The echo is a real artifact of the shift method — the Thimbleby
   * algorithm does hidden-surface removal precisely because of it.
   *
   * It does not survive contact with a viewer at this depth budget. Shaun
   * compared blur 0/1/2 by eye at the default 18px disparity, switching between
   * them in-place with `feh` while holding fusion:
   *
   * > "i think blur0 was clean … genuinely little to no difference. i will say:
   * > blur1 and blur2 *seemed* to have almost a sort of extra border at the
   * > bottom that gave a sense of more of a mountain sort of thing? like the
   * > square was connected to and protruding from the background. whereas
   * > blur0 seemed to just be more of a floating square."
   *
   * No ghost at 0, and a *cost* at 1 and above. That cost is not misperception:
   * blur puts a literal depth gradient at the edge, and a gradient, fused, is a
   * slope — so the object reads as a mesa instead of a floating plane, which is
   * the opposite of the point. With an 18px budget the cure is above
   * perceptual threshold and the disease is below it.
   *
   * Kept as a knob because the trade reverses as the budget widens: at
   * sepFar/sepNear far apart the echo should become visible and worth blurring.
   *
   * Applied in the render pipeline rather than in the rasteriser, so the
   * rasteriser's max-compositing invariant stays exactly testable.
   */
  depthBlur: number
}

/**
 * The gap between sepFar and sepNear is the entire depth budget — 18px here.
 * Widening it reads as "deeper" but artifacts grow and fusion gets harder, so
 * treat a change to these as a perceptual decision, not a tuning knob.
 *
 * depthBlur defaults to **0**, reversing an earlier default of 1.0 that was
 * inherited from the Python POC and never actually tested. See the field's own
 * documentation below for the observation that changed it.
 */
export const DEFAULT_STEREO: StereoOpts = {
  sepFar: 110,
  sepNear: 92,
  noiseScale: 2,
  depthBlur: 0,
  cross: false,
  seed: 0,
  algorithm: 'shift',
}

/**
 * What an animator can move. Deliberately has no `opacity`: there is no
 * meaningful transparency in depth space, so fading is expressed as motion in
 * `depth` (the `emerge` preset) instead.
 */
export interface Transform {
  x: number
  y: number
  depth: number
  scale: number
  rotate: number
}

export const IDENTITY: Transform = { x: 0, y: 0, depth: 0, scale: 1, rotate: 0 }

/** A keyframe. `t` is normalised 0..1 within the track's own window. */
export type Key = { t: number } & Partial<Transform>

export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'easeOutBounce'

export interface Track {
  keys: Key[]
  ease?: Easing
  repeat?: 'once' | 'loop' | 'pingpong'
  /** Seconds. Defaults to 0. */
  start?: number
  /** Seconds. Defaults to the remainder of the scene. */
  duration?: number
}

/** Preset sugar. Compiles to a Track. */
export interface Preset {
  kind: string
  [param: string]: unknown
}

export type Anim = Track | Preset | (Track | Preset)[]

/**
 * Where a silhouette mask comes from. `'alpha'` uses the image's alpha
 * channel; `{luma: t}` thresholds brightness, which is what opaque artwork
 * (a logo on a white background) needs.
 */
export type MaskSource = 'alpha' | { luma: number }

interface LayerBase {
  /** Flat depth for silhouette mode. Default 1 (nearest). */
  depth?: Depth
  at?: [number, number]
  anim?: Anim
}

export type Layer = LayerBase &
  (
    | { type: 'text'; text: string; size?: number; font?: string; weight?: string }
    | { type: 'image'; src: string; mode?: 'silhouette' | 'heightmap'; mask?: MaskSource }
    | {
        type: 'gif'
        src: string
        loop?: 'loop' | 'once' | 'pingpong'
        mode?: 'silhouette' | 'heightmap'
        mask?: MaskSource
      }
    | {
        type: 'shape'
        shape: 'circle' | 'rect'
        r?: number
        w?: number
        h?: number
        /**
         * Wedge bounds in DEGREES, clockwise from 3 o'clock. `circle` only.
         * Supplying both makes a pie slice instead of a full disc — which is
         * what a pacman is. Omit both for a full circle.
         */
        start?: number
        end?: number
      }
    | { type: 'draw'; fn: string }
  )

export interface Scene {
  size: [number, number]
  fps?: number
  /**
   * Seconds. Omit for a still, in which case it is treated as 1 — NOT 0.
   *
   * Zero would collapse every track's window and pin all animators at their
   * t=0 pose, which for `marquee` is fully off-screen: a still of a scrolling
   * scene would render completely empty. Stills therefore also take an explicit
   * sample time, defaulting to the midpoint rather than 0, so an animated scene
   * stills to something visible.
   */
  duration?: number
  stereo?: Partial<StereoOpts>
  /**
   * Reuse one noise seed for every frame.
   *
   * Default **false**: the dot field is re-randomised per frame, which is what
   * makes an animation read as pure static. Set true for a stable field that is
   * easier to fuse but reveals the shape as motion to a single eye — the POC's
   * `--freeze-noise`, and the reason the flag is named for the opt-in.
   *
   * (This comment previously read "Re-randomise the dot field every frame.
   * Default true" — a description of the inverse field, which would have made
   * `freezeNoise: true` mean *un*frozen. Design §3's own example scene says
   * `freezeNoise: false` for the static-looking default, and the POC's flag is
   * documented as "reuse one noise seed every frame".)
   *
   * The per-frame seed is derived from the sample *time*, not from a frame
   * counter, so `renderFrame(scene, t)` stays a pure function of its arguments.
   */
  freezeNoise?: boolean
  layers: Layer[]
}
