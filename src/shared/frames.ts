/**
 * Greyscale frame plumbing, shared by every encoder.
 *
 * `src/shared/` is for code that is isomorphic *and* needs a dependency, which
 * is why it is not in `src/core/`: core's purity test requires every import
 * specifier under `dist/core` to be relative, and the GIF codecs next door are
 * packages. Nothing here is adapter-specific — the Node and web encoders must
 * agree on frame validation and greyscale expansion, and the way to guarantee
 * that is to not write it twice.
 */

/** A rendered stereogram frame: row-major 8-bit greyscale, `width * height`. */
export interface GreyFrame {
  readonly pixels: Uint8Array
  readonly width: number
  readonly height: number
}

/** Frames may arrive lazily; no encoder holds a whole animation in memory. */
export type FrameSource = Iterable<GreyFrame> | AsyncIterable<GreyFrame>

/**
 * Throw unless `frame` is self-consistent, prefixing `label` so the caller's
 * own function name and frame index appear in the message.
 */
export function checkFrame(frame: GreyFrame, label: string): void {
  const { pixels, width, height } = frame
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`${label}: bad frame size ${width}x${height}`)
  }
  if (pixels.length !== width * height) {
    throw new Error(
      `${label}: frame is ${width}x${height} so pixels should be ` +
      `${width * height} bytes, got ${pixels.length}`,
    )
  }
}

/** Greyscale → opaque RGBA, which is what every encoder here wants. */
export function toRgba(frame: GreyFrame): Uint8Array {
  const { pixels } = frame
  const rgba = new Uint8Array(pixels.length * 4)
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i]!
    const o = i * 4
    rgba[o] = v
    rgba[o + 1] = v
    rgba[o + 2] = v
    rgba[o + 3] = 255
  }
  return rgba
}

/** Walk a sync or async frame source uniformly. */
export async function* iterate(frames: FrameSource): AsyncGenerator<GreyFrame> {
  if (Symbol.asyncIterator in frames) {
    for await (const f of frames as AsyncIterable<GreyFrame>) yield f
  } else {
    for (const f of frames as Iterable<GreyFrame>) yield f
  }
}
