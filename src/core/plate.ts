/**
 * Plate, stage and margins — the coordinate split (design §10).
 *
 * | term | meaning |
 * |---|---|
 * | **plate** | the full emitted pixel grid: what is written to PNG, what one eye sees |
 * | **stage** | the region that survives fusion; the authoring space where layers live |
 * | **margin** | the dead strips between stage and plate edge |
 *
 * `plate = stage + leftMargin + rightMargin`, and **`scene.size` means the
 * stage**. An author composes the picture they want fused; the pipeline emits
 * the plate it had to encode in order to fuse it.
 *
 * Three facts this module exists to keep in one place:
 *
 * - **Margins are x-only.** The encoders work row by row and nothing is lost
 *   vertically, so `plate.height === stage.height` (design §10.2).
 * - **Margins are per-encoder and measured, not derived.** See
 *   {@link marginsFor}; the symmetric-margin argument that was in §10.3 has
 *   been retracted.
 * - **Margins are emitted, never cropped.** Fusion needs those partner pixels:
 *   the percept of a pair `(P, P+sep)` is formed from *both* members, and the
 *   partner of a stage-edge column lives in the margin. Cropping them destroys
 *   the stereo signal at exactly the edges the margins were added to rescue
 *   (design §10.4). "Dead" means nothing should be *composed* there.
 *
 * This file has no dependencies beyond `types.ts` on purpose: both
 * `raster.ts` (which needs the margins to place a preset's off-plate poses) and
 * `render.ts` (which needs them to pad and to report) import it, and routing
 * either through the other would make a cycle.
 */
import { DEFAULT_STEREO } from './types.js'
import type { Scene, SirdsAlgorithm } from './types.js'

/** Dead-strip widths either side of the stage, in the same units as the stage. */
export interface Margins {
  readonly left: number
  readonly right: number
}

/** An axis-aligned box. Used for the stage's placement inside the plate. */
export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * The geometry of one scene, in **scene pixels** — i.e. before `noiseScale`.
 *
 * `stage.x === margins.left` and `stage.y === 0` by construction; both are
 * spelled out anyway so a consumer drawing a guide never has to re-derive the
 * relationship and get the sign wrong.
 */
export interface PlateLayout {
  readonly margins: Margins
  readonly stage: Rect
  readonly plate: { readonly width: number; readonly height: number }
}

/**
 * Margin widths for one encoder, in scene px. **Measured, not derived.**
 *
 * | encoder | left | right |
 * |---|---|---|
 * | `shift` | `sepFar` | `ceil(sepFar/2)` |
 * | `linked` | `ceil(sepFar/2)` | `ceil(sepFar/2)` |
 *
 * Two different losses are being covered, and conflating them is what produced
 * the retracted symmetric-margin claim in design §10.3:
 *
 * - **The encoding dead zone**, where depth physically cannot be encoded.
 *   `shift` computes `out[x] = out[x - sep(x)]` and has no source column for
 *   `x < sep`, so it discards that depth outright — `sepFar` in the worst case
 *   over depth, and **on the left only**. `linked` constrains the symmetric
 *   pair `(x - sep/2, x + sep/2)` and skips a pair with an out-of-range
 *   endpoint, so its dead zone is `sepFar/2` on *each* side. Both are swept
 *   with a probe in `metamorphic.test.ts` (`shift` 92/0, `linked` 44/44 at
 *   `sepNear`, growing to `sepFar` under `cross`).
 * - **The fusion fringe**, which is perceptual and symmetric for any algorithm:
 *   a percept is formed per pair `(P, P+sep)` and appears centred at
 *   `P + sep/2`, so the outermost `sep/2` columns of any plate carry no percept
 *   centre.
 *
 * `sepFar` rather than `sepNear` because `sep(z)` ranges over
 * `[sepNear, sepFar]` and the margin has to cover the worst case over depth —
 * which is also what `cross` reaches, since inverting depth puts an authored
 * near object at `z = 0` and therefore at `sepFar`.
 *
 * **Honest note on the `shift` right margin.** It is there for the fusion
 * fringe, and no measurement in this repo can see it: `shift`'s pairs are
 * `(x - sep, x)`, so a slab flush against the stage's right edge is fully
 * encoded with a right margin of 0 (verified — `plate.test.ts` records it).
 * It is kept because §10.3 specifies it, it costs `ceil(sepFar/2)` emitted
 * columns, and the percept it buys cannot be measured monocularly. Unlike the
 * other three numbers here, mutating it to 0 does **not** turn any test red.
 */
export function marginsFor(sepFar: number, algorithm: SirdsAlgorithm): Margins {
  if (!Number.isFinite(sepFar) || sepFar < 2) {
    throw new Error(
      `plate margins need a finite stereo.sepFar of at least 2px, got ` +
      `${JSON.stringify(sepFar)}`,
    )
  }
  const half = Math.ceil(sepFar / 2)
  // `=== 'linked'` rather than a switch, matching `sirdsFromDepth`'s own
  // dispatch: an algorithm name this function and the encoder disagreed about
  // would pad for one encoder and encode with the other, which is a plate whose
  // stage is in the wrong place and nothing would throw.
  return algorithm === 'linked'
    ? { left: half, right: half }
    : { left: Math.ceil(sepFar), right: half }
}

/**
 * The margins a scene's own stereo settings imply.
 *
 * Reads `sepFar`/`algorithm` straight off `scene.stereo` over
 * {@link DEFAULT_STEREO} rather than taking a resolved `StereoOpts`, because
 * `rasterDepth` needs these and must not depend on `render.ts`. It is the same
 * merge `resolveStereo` performs; the validation it does *not* perform is
 * `resolveStereo`'s job, and nothing is emitted for a scene that fails it.
 */
export function sceneMargins(scene: Scene): Margins {
  return marginsFor(
    scene.stereo?.sepFar ?? DEFAULT_STEREO.sepFar,
    scene.stereo?.algorithm ?? DEFAULT_STEREO.algorithm,
  )
}

/** Full plate/stage geometry for a scene, in scene px. */
export function plateLayoutOf(scene: Scene): PlateLayout {
  const [w, h] = scene.size
  const margins = sceneMargins(scene)
  return {
    margins,
    stage: { x: margins.left, y: 0, width: w, height: h },
    plate: { width: margins.left + w + margins.right, height: h },
  }
}

/** Multiply a rect by an integer factor — scene px → output px. */
export function scaleRect(r: Rect, n: number): Rect {
  return { x: r.x * n, y: r.y * n, width: r.width * n, height: r.height * n }
}

/**
 * Widen a stage-sized depth map to plate width by **edge extension**: every
 * left-margin column is a copy of stage column 0 and every right-margin column
 * a copy of the last stage column.
 *
 * Edge extension rather than zero fill, and the difference is not cosmetic.
 * Zero fill would plant a hard step from the stage's own edge depth down to
 * background at the stage boundary — i.e. it would manufacture, at the one place
 * the margins exist to protect, exactly the artifact `depthBlur` and the
 * `linked` encoder were both built to suppress (design §2.2). An object flush
 * against the stage edge would then be encoded as an object with a cliff behind
 * it. Edge extension introduces no new depth discontinuity anywhere: the plate's
 * depth map is constant across each margin and continuous into the stage.
 *
 * Returns a fresh buffer even for zero margins, so the result can never alias a
 * caller's frame (same reason `upscale` and `blurDepth` copy).
 */
export function padDepth(
  src: Float32Array,
  w: number,
  h: number,
  margins: Margins,
): Float32Array {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) {
    throw new Error(`padDepth: stage size must be positive integers, got ${w}x${h}`)
  }
  if (src.length !== w * h) {
    throw new Error(`padDepth: a ${w}x${h} stage needs ${w * h} samples, got ${src.length}`)
  }
  const { left, right } = margins
  if (!Number.isInteger(left) || !Number.isInteger(right) || left < 0 || right < 0) {
    throw new Error(
      `padDepth: margins must be non-negative integers, got ${JSON.stringify(margins)}`,
    )
  }
  if (left === 0 && right === 0) return src.slice()

  const W = left + w + right
  const out = new Float32Array(W * h)
  for (let y = 0; y < h; y++) {
    const s = y * w
    const d = y * W
    const first = src[s]!
    const last = src[s + w - 1]!
    for (let x = 0; x < left; x++) out[d + x] = first
    out.set(src.subarray(s, s + w), d + left)
    const tail = d + left + w
    for (let x = 0; x < right; x++) out[tail + x] = last
  }
  return out
}
