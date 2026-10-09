/**
 * RGBA buffer inspection shared by the adapters' `loadImage`.
 *
 * Trivial in size, deliberately not trivial in placement: both adapters decide
 * `DecodedImage.hasAlpha` with it, and the rasteriser picks silhouette vs
 * heightmap mode off that flag. Two copies that disagreed — one testing `< 255`
 * and one testing `=== 0`, say — would make the same image render differently
 * in the browser than in the CLI, which is the one class of bug this
 * architecture exists to prevent.
 */

/** True if any pixel in a row-major RGBA buffer is less than fully opaque. */
export function anyTransparent(data: ArrayLike<number>): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i]! < 255) return true
  return false
}
