/**
 * Depth map → greyscale RGBA for the side-by-side panel.
 *
 * Boring on purpose. The panel is the only way to tell a depth-authoring bug
 * from an encoding bug (design §5), so it must not editorialise: 0 is black,
 * 1 is white, and anything a layer did in between shows up linearly. A
 * false-colour ramp would read nicer and would hide exactly the thing the panel
 * exists to reveal — whether a region is at one flat depth or a gradient.
 *
 * **Out-of-range and NaN depths are handled by the output type, not by a branch
 * here, and that is a deliberate call rather than an oversight.** An earlier
 * version clamped explicitly. Writing to a `Uint8ClampedArray` already clamps
 * to 0..255 and already converts `NaN` to 0 — both by specification, not by
 * luck — so the branch was unreachable in the sense that matters: no input
 * could distinguish its presence from its absence, which is also why
 * `depthmap.test.ts`'s clamp and NaN cases pin the *guarantee* rather than any
 * code written here. They still earn their place: they are what fails if this
 * ever moves to a plain `Uint8Array`, where a depth of 1.2 would wrap to 127
 * and draw a dark patch exactly where the nearest surface is.
 *
 * `Math.round` is likewise not load-bearing for correctness — assignment to a
 * clamped array rounds too (half-to-even rather than half-up) and a `Float32`
 * depth times 255 can never land exactly on a half, since `(2n+1)/510` is not a
 * dyadic rational. It stays because it makes the intended mapping explicit.
 */
export function depthToRgba(
  depth: Float32Array, into?: Uint8ClampedArray,
): Uint8ClampedArray {
  const need = depth.length * 4
  if (into !== undefined && into.length !== need) {
    throw new Error(
      `depthToRgba: a ${depth.length}-sample depth map needs ${need} bytes, ` +
      `got a buffer of ${into.length}`,
    )
  }
  const out = into ?? new Uint8ClampedArray(need)

  for (let i = 0; i < depth.length; i++) {
    const v = Math.round(depth[i]! * 255)
    const o = i * 4
    out[o] = v
    out[o + 1] = v
    out[o + 2] = v
    out[o + 3] = 255
  }
  return out
}

/**
 * A rendered stereogram frame (single-channel, 0 or 255) → opaque RGBA, for
 * `putImageData`.
 *
 * `src/shared/frames.ts` has the same expansion for the encoders, but it
 * returns a `Uint8Array` and `ImageData` requires a `Uint8ClampedArray`, so
 * using it here would mean a second full copy of every frame on every repaint.
 * It is also not part of the `staticstereo/web` public surface, and the site is
 * held to importing only `src/core/` and `src/web/`.
 */
export function greyToRgba(
  grey: ArrayLike<number>, into?: Uint8ClampedArray,
): Uint8ClampedArray {
  const need = grey.length * 4
  if (into !== undefined && into.length !== need) {
    throw new Error(
      `greyToRgba: a ${grey.length}-sample frame needs ${need} bytes, got a ` +
      `buffer of ${into.length}`,
    )
  }
  const out = into ?? new Uint8ClampedArray(need)
  for (let i = 0; i < grey.length; i++) {
    const v = grey[i]!
    const o = i * 4
    out[o] = v
    out[o + 1] = v
    out[o + 2] = v
    out[o + 3] = 255
  }
  return out
}
