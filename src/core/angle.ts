/**
 * Degrees ↔ radians, as a named pair.
 *
 * This codebase carries **two angle conventions side by side**, and the design
 * doc's §9.1 names that as a live provenance hazard: `shape.start`/`end` are
 * **degrees** (`types.ts`), `Transform.rotate`/`rotateX`/`rotateY` are
 * **radians** (what `CanvasLike.rotate` takes and what `Math.cos` is fed in
 * `raster.ts`), and the `rotate` *preset* takes degrees and must convert. Three
 * boundaries, one word.
 *
 * It is a module rather than a constant because the only converter before it
 * was `const RAD = Math.PI / 180` **private to a function inside `raster.ts`**,
 * which is precisely how the second private copy comes to be written instead of
 * imported — the `DEFAULT_TEXT_SIZE` failure, already hand-copied into a
 * comment in `site/legibility.ts`.
 */

/**
 * Degrees to radians.
 *
 * Written `(deg * Math.PI) / 180` rather than against a precomputed
 * `Math.PI / 180` so that the only rounding is of the result: the cardinal
 * angles callers pin — 90, 180, 360 — come out as exactly `Math.PI / 2`,
 * `Math.PI` and `2 * Math.PI`. `flip` and `rotate` both assert exact equality
 * against those, and a tolerance there would accept a conversion that was
 * wrong in the last bits.
 */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Radians to degrees — the inverse, exported alongside rather than added later.
 *
 * It is the direction a UI needs: a control that edits a `rotate` preset reads
 * degrees, but anything inspecting a compiled `Track` or a composed
 * `Transform` holds radians. Shipping only the one direction is what leaves
 * the next caller writing `* 180 / Math.PI` inline, which is the duplication
 * this module exists to end.
 */
export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI
}
