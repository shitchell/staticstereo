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
   * `resolveStereo` is the one place allowed to apply the default.
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
  // 'linked' as of 2026-10-09, after a blinded comparison confirmed the
  // measurement. Shaun ranked two shift renders as "heavy streaking" and two
  // linked renders as "much cleaner", with both replicates of each grouping
  // correctly and an independent motion pair agreeing. Crucially he did NOT
  // report linked's own artifact (isolated 1px coherent columns), which was the
  // one thing that could have made this a real trade.
  //
  // Measured: shift leaves a sepNear-periodic excess 36 SE above chance in
  // seven runs each exactly 18px wide — the disparity budget, precisely wide
  // enough to fuse. linked measures at chance. Costs ~2.9x at this budget.
  algorithm: 'linked',
}

/**
 * Every key `StereoOpts` has, as runtime data.
 *
 * One canonical list, because there were two: `src/cli/scene.ts` and
 * `site/scene.ts` each carried their own copy to reject typo'd settings, and
 * neither was derived from the type. Adding `algorithm` therefore needed three
 * coordinated edits, and missing one is invisible — the CLI would accept a
 * setting the browser rejects by name, or vice versa.
 *
 * The two `AssertNever` lines below are the point of the exercise: a field added
 * to `StereoOpts` without being listed here, or listed here without existing on
 * the type, is a COMPILE error rather than a validator that silently drifts.
 */
export const STEREO_KEYS = [
  'sepFar', 'sepNear', 'noiseScale', 'depthBlur', 'cross', 'seed', 'algorithm',
] as const

export type StereoKey = typeof STEREO_KEYS[number]

/**
 * Errors unless its argument is `never`.
 *
 * Exported, and the only declaration: `anim/track.ts` had an independent copy
 * guarding `CHANNELS`, so the one mechanism that keeps a hand-written list in
 * step with a type was itself duplicated — and unavailable to the validators
 * outside `core`, which is exactly where the unguarded copies of those lists
 * ended up.
 */
export type AssertNever<T extends never> = T
type _NoStereoKeyMissing = AssertNever<Exclude<keyof StereoOpts, StereoKey>>
type _NoStereoKeyExtra = AssertNever<Exclude<StereoKey, keyof StereoOpts>>

/**
 * What an animator can move. Deliberately has no `opacity`: there is no
 * meaningful transparency in depth space, so fading is expressed as motion in
 * `depth` (the `push` preset) instead.
 *
 * **This is a sampled pose, not an animation.** Duration, easing and endpoints
 * live on {@link Track} and on the preset that compiled it; a `Transform` is
 * the answer to "where is this layer at this instant", which is why it has no
 * time in it.
 *
 * ## The three rotations
 *
 * `rotate` is rotation **about z** — the axis pointing at the viewer, i.e. the
 * ordinary in-plane spin — and is kept under its original name because every
 * existing scene and preset uses it.
 *
 * `rotateX` and `rotateY` rotate about the horizontal and vertical axes, which
 * under this project's **orthographic** projection reduce exactly to a cosine
 * scale on the opposite axis:
 *
 *     rotateX(θ)  →  scale y by cos θ
 *     rotateY(θ)  →  scale x by cos θ
 *
 * So they are not an approximation of 3D — for a flat layer at one depth that
 * *is* the correct orthographic projection. Three consequences worth knowing:
 *
 * 1. **Mirroring is `rotateY = π`**, where cos = −1. There is deliberately no
 *    separate `flip` channel and no non-uniform `scale`: a mirror is a half
 *    turn, and naming it as one means the in-between values are meaningful too.
 * 2. **At ±π/2 the layer vanishes**, cos = 0, which is a card seen edge-on.
 * 3. **Rotations compose additively**, so two `rotateY = π/2` animators sum to
 *    a mirror. That is physically right and falls out of `composeAnim` summing
 *    every channel except `scale`.
 *
 * **What they do not yet do is read as depth.** With a flat layer, `rotateY` is
 * visually indistinguishable from a horizontal squash, because an orthographic
 * projection carries no perspective cue. The turn becomes a real one when the
 * rasteriser transforms *depth* alongside position — rotate a heightmap about y
 * and each column's depth should shift too. That is a rasteriser change and not
 * a model change: this type is identical in both worlds, which is the whole
 * reason the three rotations are here now rather than a `scale` pair.
 */
export interface Transform {
  x: number
  y: number
  depth: number
  scale: number
  /** About z — the in-plane spin. Radians, as `CanvasLike.rotate` takes. */
  rotate: number
  /** About x. Radians. Orthographically, a cosine scale on y. */
  rotateX: number
  /** About y. Radians. Orthographically, a cosine scale on x. `π` mirrors. */
  rotateY: number
}

export const IDENTITY: Transform = {
  x: 0, y: 0, depth: 0, scale: 1, rotate: 0, rotateX: 0, rotateY: 0,
}

/** A keyframe. `t` is normalised 0..1 within the track's own window. */
export type Key = { t: number } & Partial<Transform>

/**
 * The five curves shipped as functions, and the key type of `EASINGS`.
 *
 * Kept as its own name rather than folded into `Easing` because these five
 * are an **enumerable, exhaustive** set and the rest of `Easing` is not:
 * `EASINGS` is `Record<NamedEasing, fn>`, which is what makes "every named
 * curve has an implementation" a compile error to break rather than a
 * convention. Widening `Easing` in place would have turned that record into
 * a promise to implement infinitely many curves.
 */
export type NamedEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'easeOutBounce'

/**
 * A CSS `cubic-bezier(a, b, c, d)`.
 *
 * A template literal rather than `string`, and the difference is the whole
 * point: `string` would make `Easing` accept every typo the named union
 * currently catches at compile time — `easeout`, `ease-out`, `easeOutBonce`
 * would all become valid scenes that silently render with the wrong motion.
 * This keeps the prefix checked.
 *
 * What a template literal **cannot** express is "four finite numbers with the
 * first and third in 0..1", so the argument list is `string` here and
 * `isEasing` is the real check. The split is deliberate rather than a
 * shortfall: the type catches a misspelled *name*, which is what a scene
 * author gets wrong while typing, and the runtime guard catches a malformed
 * *argument list*, which is what they get wrong while tuning — and which only
 * the validators, with a file and a path to name, can report usefully.
 */
export type CubicBezierEasing = `cubic-bezier(${string})`

export type Easing = NamedEasing | CubicBezierEasing

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
  /**
   * Stable identity, for anything that has to refer to this layer across an
   * edit — a selection, an undo entry, a panel row.
   *
   * **Optional, and assigned on first mutation rather than on load** (design
   * §4.1). Every scene written before this field existed is still valid, and
   * loading one and saving it back unchanged stays byte-identical, because no
   * validator mints an id. An array index cannot serve: reordering or deleting
   * a layer renumbers every layer after it, so a selection or an undo entry
   * held by index silently retargets.
   */
  id?: string
  /**
   * Display name. Optional because a layer that has never been renamed should
   * not carry a name at all — `layerName()` derives one from the content
   * (`HELLO`, `ball.png`, `circle`), so the panel never lists a scene as
   * "Layer 1 / Layer 2 / Layer 3" and never makes renaming the first chore.
   */
  name?: string
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
