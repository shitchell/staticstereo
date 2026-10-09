import { noiseAt } from './rng.js'
import type { SirdsOpts } from './types.js'

/**
 * Turn a depth map into a random-dot stereogram.
 *
 * Two encoders live here, selected by `o.algorithm` and **defaulting to
 * `'shift'`**:
 *
 * - {@link shiftSirds} — one leftward copy per pixel. See its own docs.
 * - {@link linkedSirds} — Thimbleby–Inglis–Witten constrained pairs with
 *   hidden-surface removal. Fixes the shift method's unbounded rightward
 *   propagation.
 *
 * Both are O(w·h) and both draw their noise from `noiseAt(seed, x, y)` rather
 * than a stream, which is what keeps rows independent (see `rng.ts`).
 *
 * @param depth row-major, length w*h, values 0..1 (1 = nearest)
 * @returns row-major greyscale, length w*h, values 0 or 255
 */
export function sirdsFromDepth(
  depth: Float32Array,
  w: number,
  h: number,
  o: SirdsOpts,
): Uint8Array {
  return o.algorithm === 'linked'
    ? linkedSirds(depth, w, h, o)
    : shiftSirds(depth, w, h, o)
}

/**
 * Depth → separation, the one mapping both encoders share.
 *
 * `sep(z) = round(sepFar - z·(sepFar - sepNear))`, clamped to `[2, w-1]`.
 * Everything in this repo — scenes, defaults, the period tests, the preview
 * report — is expressed in separation pixels, so the paper's `E`/`mu`
 * formulation is deliberately *not* used.
 */
function sepAt(z: number, sepFar: number, range: number, maxSep: number): number {
  const sep = Math.round(sepFar - z * range)
  return sep < 2 ? 2 : sep > maxSep ? maxSep : sep
}

/** Clamp a depth sample into 0..1, inverting it first for cross-eyed viewing. */
function normDepth(d: number, cross: boolean): number {
  const z = cross ? 1 - d : d
  return z < 0 ? 0 : z > 1 ? 1 : z
}

/**
 * The original encoder: each row is walked left to right, copying the pixel
 * from `sep` px back.
 *
 * `sep` shrinks as depth approaches 1, and your fused eyes read that shorter
 * repeat period as "nearer". Columns with no source yet (x < sep) seed the row
 * with fresh random pixels.
 *
 * Row-major is both correct and cache-friendly: within a row the dependency is
 * strictly leftward, so `out[y*w + (x-sep)]` is always already written.
 *
 * **Its known failure is unbounded rightward propagation.** Because every
 * pixel is a copy of one to its left, a near object rewrites every pixel
 * downstream of it, and the near-period patch it creates is re-copied every
 * `sepFar` px to the right edge — a ghost of the shape, repeated. Measured on a
 * 1600px frame with a 200px slab at x=150, 41–47% of pixels in every band to
 * the right differ from an object-free control; the same slab at x=1250 leaves
 * the left two-thirds bit-identical. `sirds.linked.test.ts` pins both halves.
 */
function shiftSirds(
  depth: Float32Array,
  w: number,
  h: number,
  o: SirdsOpts,
): Uint8Array {
  const out = new Uint8Array(w * h)
  const range = o.sepFar - o.sepNear
  const maxSep = w - 1

  for (let y = 0; y < h; y++) {
    const base = y * w
    for (let x = 0; x < w; x++) {
      const i = base + x
      const sep = sepAt(normDepth(depth[i]!, o.cross), o.sepFar, range, maxSep)
      const src = x - sep
      out[i] = src >= 0 ? out[base + src]! : noiseAt(o.seed, x, y) < 0.5 ? 0 : 255
    }
  }
  return out
}

/**
 * Thimbleby–Inglis–Witten: constrained symmetric pairs with hidden-surface
 * removal.
 *
 * Per row, `same[x]` holds the equivalence class of column x as a sorted linked
 * list — `same[x] === x` means "x is its own representative", otherwise
 * `same[x] > x` is the next column constrained to the same colour. For each
 * column the pair the two eyes would see as one point is
 * `left = x - (sep >> 1)`, `right = left + sep`; linking them *is* the depth
 * encoding. Colouring then walks right to left, so every `same[x] > x` has
 * already been resolved.
 *
 * Three consequences of that shape, all of them the point:
 *
 * 1. **A pixel depends only on pixels to its right.** `same[x] > x` always, so
 *    an object cannot rewrite anything downstream of itself. That is the whole
 *    reason this encoder exists.
 * 2. **The constraint is symmetric about x**, so the columns a near surface at
 *    `[x0, x1)` touches are `[x0 - sep/2, x1 + sep/2)` and the near-period
 *    *equality* is indexed by its left member, on `[x0 - sep/2, x1 - sep/2)`.
 *    The depth of columns within `sep/2` of either image edge is therefore
 *    dropped (no in-range pair), where the shift method loses `sep` px at the
 *    left edge only. Both dead zones are measured in `sirds.linked.test.ts`.
 * 3. **The dependency runs the other way instead.** Colours upstream (left) of
 *    an object do change — but only *colours*: the far wallpaper's equality
 *    structure there is untouched, and random dots recoloured are still random
 *    dots. `sirds.linked.test.ts` measures both statements.
 */
function linkedSirds(
  depth: Float32Array,
  w: number,
  h: number,
  o: SirdsOpts,
): Uint8Array {
  const out = new Uint8Array(w * h)
  const range = o.sepFar - o.sepNear
  const maxSep = w - 1
  const same = new Int32Array(w)
  /** Smallest depth step that could occlude anything — `z_t - z` at t = 1. */
  const scanFloor = 2 / range
  // Depth for the current row, already cross-inverted and clamped. Hoisted so
  // the occlusion scan below reads exactly the values `sepAt` was given — a
  // scan over the raw map would disagree with the separations under `cross`.
  const z = new Float32Array(w)

  for (let y = 0; y < h; y++) {
    const base = y * w
    let zMax = 0
    for (let x = 0; x < w; x++) {
      const d = normDepth(depth[base + x]!, o.cross)
      // NaN is pinned to background HERE, not in `normDepth`, because the two
      // encoders cannot agree on it and the shift encoder's behaviour is
      // frozen (a NaN there makes `sep` NaN, `src >= 0` false, and the column
      // fresh noise). Left alone it would reach the union step as a NaN
      // endpoint: `NaN >> 1` is 0 and every comparison against a bound is
      // false, so the out-of-range guard would pass it through and
      // `Int32Array[x] = NaN` would store 0 — aliasing the column to column 0
      // and reading a pixel that has not been coloured yet. Found by
      // inspection, not by a failing test; the test came after.
      z[x] = d === d ? d : 0
      if (d > zMax) zMax = d
    }
    for (let x = 0; x < w; x++) same[x] = x

    // The occlusion scan is the expensive part of this encoder — up to R/2
    // probes per column — and it is pure overhead on a row where nothing can
    // occlude anything. `z_t` is smallest at t = 1, so a row whose deepest
    // sample is below `z[x] + 2/R` cannot block any sightline through x. Rows
    // with no object in them (every row of an empty frame, every row above or
    // below a text band) therefore skip the scan entirely, bit-identically:
    // 1600x600 went from 85 to 40 ms/frame empty, and 80 to 68 with a ball in
    // it. Checked by checksum against the unshortcut version, not by eye.
    for (let x = 0; x < w; x++) {
      const sep = sepAt(z[x]!, o.sepFar, range, maxSep)
      const left = x - (sep >> 1)
      const right = left + sep

      // OUT-OF-RANGE ENDPOINTS ARE SKIPPED, NOT CLAMPED OR MIRRORED. A clamp
      // would link a pair whose separation is not sep(z), i.e. it would encode
      // a depth nobody asked for — a wrong surface is worse than a missing
      // one. A mirror would fabricate a correlation at a separation that
      // depends on the distance to the edge, which reads as a spurious sloped
      // surface along the border. Skipping costs a dead zone of about sep/2 at
      // each edge (measured in sirds.linked.test.ts), which the render
      // pipeline can pad away; a wrong depth cannot be padded away.
      if (left < 0 || right >= w) continue

      if (zMax >= z[x]! + scanFloor && !linkVisible(z, x, w, range)) continue

      // Union by splicing into the sorted chain (the paper's own loop). Near-
      // linear in practice: chains are the equivalence classes of one row, and
      // a walk only advances through columns already constrained to this pair,
      // so flat depth never walks at all.
      let a = left
      let b = right
      let next = same[a]!
      while (next !== a && next !== b) {
        if (next < b) {
          a = next
          next = same[a]!
        } else {
          same[a] = b
          a = b
          b = next
          next = same[a]!
        }
      }
      same[a] = b
    }

    // Right to left: `same[x] > x` is always already coloured.
    for (let x = w - 1; x >= 0; x--) {
      out[base + x] = same[x] === x
        ? (noiseAt(o.seed, x, y) < 0.5 ? 0 : 255)
        : out[base + same[x]!]!
    }
  }
  return out
}

/**
 * Hidden-surface removal: is the point (x, z[x]) visible to **both** eyes?
 *
 * ## Derivation (from this repo's linear `sep(z)`, not the paper's constants)
 *
 * Write `R = sepFar - sepNear`, so `sep(z) = sepFar - R·z` and `dsep/dz = -R`.
 * A point at depth `z` centred on column `x` puts its left-eye ray through the
 * screen at `x - sep(z)/2` and its right-eye ray at `x + sep(z)/2`.
 *
 * Ask which *other* depth-map entries lie on that same left-eye ray. A point at
 * depth `z'` centred on column `x'` does iff its left-eye crossing coincides:
 *
 *     x' - sep(z')/2 = x - sep(z)/2
 *     x' = x + (sep(z') - sep(z))/2 = x - R·(z' - z)/2
 *
 * So moving `t = x - x'` columns to the LEFT along the left-eye ray corresponds
 * to moving nearer by `z' - z = 2t/R`. By the mirror argument the right-eye ray
 * reaches column `x + t` at the same depth. Hence
 *
 *     z_t = z + 2t/R
 *
 * is the depth at which a surface `t` columns either side would *exactly* graze
 * the sightline, and anything at or in front of it blocks the view:
 *
 *     occluded  ⟺  ∃ t ≥ 1 :  z[x-t] ≥ z_t  or  z[x+t] ≥ z_t
 *
 * The scan stops as soon as `z_t ≥ 1`, because depth is normalised to 0..1 and
 * nothing can be nearer than 1 — which also bounds the loop at `t ≤ R/2`
 * iterations and makes the whole encoder O(w·h·R), with R fixed by the scene.
 *
 * **Two things this derivation says that are easy to get wrong.** First, the
 * `2/R` slope is set by the *depth budget*, not by `sepFar`: at the shipped
 * 18px budget a near plane only occludes within 9 columns, because 18px of
 * total disparity is a very thin plate hovering just in front of the
 * background. Widen the budget and the occluded span widens with it. Second,
 * the inequality direction matters and nothing else catches it being wrong: an
 * always-true `visible` degrades this encoder back toward the shift method's
 * ghosting (links that should be cut are kept), and an always-false one deletes
 * the object entirely. `sirds.linked.test.ts` mutation-tests both directions.
 *
 * (This is deliberately *not* the paper's `z + 2(2 - mu·z)·t/(mu·E)`. Working
 * that formulation back through `sep(z) = E(1 - mu·z)/(2 - mu·z)` gives a local
 * slope of `mu·E/(2 - mu·z)²`, i.e. a `z_t` with `(2 - mu·z)²` where the
 * paper's code has `(2 - mu·z)` — the paper's test is a factor of up to two
 * more eager to declare occlusion. We have no `E` or `mu` to reconstruct, and
 * the pair geometry here is `sep`-centred by construction, so the condition is
 * derived from `sep(z)` directly and stays consistent with the pairing.)
 */
function linkVisible(z: Float32Array, x: number, w: number, range: number): boolean {
  // No depth budget means no depth, so nothing can occlude anything. Also
  // guards the loop below against a non-positive `range` (`resolveStereo`
  // rejects those, but this function is reachable without it).
  if (!(range > 0)) return true

  const zx = z[x]!
  for (let t = 1; ; t++) {
    const zt = zx + (2 * t) / range
    if (zt >= 1) return true
    const l = x - t
    if (l >= 0 && z[l]! >= zt) return false
    const r = x + t
    if (r < w && z[r]! >= zt) return false
  }
}

/**
 * Nearest-neighbour upscale. Chunkier noise pixels fuse more easily.
 *
 * Always returns a fresh buffer, including at `n === 1`. Returning `src` there
 * would be zero-copy but makes the return value an alias of the caller's
 * frame — and downstream encoders quantise in place, so a frame buffer reused
 * across frames would be silently corrupted. One memcpy on the uncommon path
 * is worth not having that bug.
 */
export function upscale(src: Uint8Array, w: number, h: number, n: number): Uint8Array {
  if (n === 1) return src.slice()
  const W = w * n
  const out = new Uint8Array(W * h * n)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = src[y * w + x]!
      for (let dy = 0; dy < n; dy++) {
        const rowStart = (y * n + dy) * W + x * n
        for (let dx = 0; dx < n; dx++) out[rowStart + dx] = v
      }
    }
  }
  return out
}
