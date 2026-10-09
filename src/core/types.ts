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
 * What the SIRDS encoder itself consumes.
 *
 * Deliberately narrower than {@link StereoOpts}: `noiseScale` and `depthBlur`
 * are *pipeline stages* applied either side of the encoder, not encoder
 * parameters. Passing them to `sirdsFromDepth` did nothing while looking like
 * it worked, and a forgotten or doubled upscale silently halves or doubles
 * every measured period — so the type now makes it impossible to pass.
 */
export interface SirdsOpts {
  /** Repeat period of the background, in px. */
  sepFar: number
  /** Repeat period of the nearest surface, in px. Must be < sepFar. */
  sepNear: number
  /** Invert depth for cross-eyed viewers. */
  cross: boolean
  seed: number
}

export interface StereoOpts extends SirdsOpts {
  /** Nearest-neighbour upscale of noise pixels. 2 fuses more easily than 1. */
  noiseScale: number
  /**
   * Gaussian blur radius in px applied to the depth map *after* compositing
   * and *before* encoding. 0 disables it.
   *
   * This is not cosmetic. A hard depth step makes the encoder copy from source
   * content of a different period, producing a visible ghost of the shape
   * echoed up to `sepFar` px to its right. Canvas antialiasing only softens
   * mask edges against the background — it does nothing for heightmap interiors
   * or layer-over-layer boundaries, which are hard steps by construction.
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
 * depthBlur defaults to 1.0 because that is the value the Python POC was
 * visually validated at (`docs/poc/sirds.py`).
 */
export const DEFAULT_STEREO: StereoOpts = {
  sepFar: 110,
  sepNear: 92,
  noiseScale: 2,
  depthBlur: 1,
  cross: false,
  seed: 0,
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
    | { type: 'shape'; shape: 'circle' | 'rect'; r?: number; w?: number; h?: number }
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
   * Re-randomise the dot field every frame. Default true, which is what makes
   * an animation read as pure static; set false for a stable field that is
   * easier to fuse but reveals the shape as motion to a single eye.
   */
  freezeNoise?: boolean
  layers: Layer[]
}
