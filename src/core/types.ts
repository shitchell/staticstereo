/**
 * Scene model for staticstereo.
 *
 * Depth convention throughout: 0 = background, 1 = nearest to the viewer.
 * This file is types + constants only — no runtime logic, so it is safe to
 * import from anywhere including the browser bundle.
 */

/** 0 = background, 1 = nearest to viewer. */
export type Depth = number

export interface StereoOpts {
  /** Repeat period of the background, in px. */
  sepFar: number
  /** Repeat period of the nearest surface, in px. Must be < sepFar. */
  sepNear: number
  /** Nearest-neighbour upscale of noise pixels. 2 fuses more easily than 1. */
  noiseScale: number
  /** Invert depth for cross-eyed viewers. */
  cross: boolean
  seed: number
}

/**
 * The gap between sepFar and sepNear is the entire depth budget — 18px here.
 * Widening it reads as "deeper" but artifacts grow and fusion gets harder, so
 * treat a change to these as a perceptual decision, not a tuning knob.
 */
export const DEFAULT_STEREO: StereoOpts = {
  sepFar: 110,
  sepNear: 92,
  noiseScale: 2,
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
    | { type: 'gif'; src: string; loop?: 'loop' | 'once' | 'pingpong'; mask?: MaskSource }
    | { type: 'shape'; shape: 'circle' | 'rect'; r?: number; w?: number; h?: number }
    | { type: 'draw'; fn: string }
  )

export interface Scene {
  size: [number, number]
  fps?: number
  /** Seconds. Omit for a still. */
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
