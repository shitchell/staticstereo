/**
 * Separable Gaussian blur over a depth map.
 *
 * This exists because of the echo artifact (design §2.2): a hard depth step
 * makes the encoder copy from source content of a different repeat period,
 * leaving a visible ghost of the shape up to `sepFar` px to its right. Softening
 * the step into a ramp turns the hard period jump into a gradual one.
 *
 * It is applied in the render pipeline — *after* compositing, *before*
 * encoding — never inside the rasteriser, so the rasteriser's max-compositing
 * invariant stays exactly testable on unblurred output.
 */

/** Gaussian taps for a given radius, normalised to sum to exactly 1. */
function kernel(radius: number): Float32Array {
  const sigma = radius
  const reach = Math.max(1, Math.ceil(radius * 3))
  const k = new Float32Array(reach * 2 + 1)
  const denom = 2 * sigma * sigma
  let sum = 0
  for (let i = -reach; i <= reach; i++) {
    const v = Math.exp(-(i * i) / denom)
    k[i + reach] = v
    sum += v
  }
  // Normalising is what keeps a flat field flat. Without it the whole depth map
  // drifts, which would quietly rescale every disparity in the image.
  for (let i = 0; i < k.length; i++) k[i]! /= sum
  return k
}

/**
 * Blur `src` with the given radius in px. Returns a new buffer; `radius <= 0`
 * yields a copy rather than the input itself, so callers can never alias a
 * frame buffer that a downstream encoder will mutate in place.
 *
 * Edges clamp to the border pixel. Treating out-of-bounds as zero would pull
 * the border toward background depth and draw a dark frame around every image.
 */
export function blurDepth(
  src: Float32Array,
  w: number,
  h: number,
  radius: number,
): Float32Array {
  if (!(radius > 0)) return src.slice()

  const k = kernel(radius)
  const reach = (k.length - 1) / 2
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)

  // Horizontal pass.
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      let acc = 0
      for (let t = -reach; t <= reach; t++) {
        let sx = x + t
        if (sx < 0) sx = 0
        else if (sx >= w) sx = w - 1
        acc += src[row + sx]! * k[t + reach]!
      }
      tmp[row + x] = acc
    }
  }

  // Vertical pass.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0
      for (let t = -reach; t <= reach; t++) {
        let sy = y + t
        if (sy < 0) sy = 0
        else if (sy >= h) sy = h - 1
        acc += tmp[sy * w + x]! * k[t + reach]!
      }
      out[y * w + x] = acc
    }
  }

  return out
}
