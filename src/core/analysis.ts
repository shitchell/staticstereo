/**
 * Stereogram measurement. Shipped code, not test-only: the web view reuses
 * `dominantPeriod` for its diagnostics panel.
 *
 * "It rendered without throwing" proves nothing about a stereogram, so this is
 * how one is verified — the horizontal repeat period IS the encoded depth
 * (design doc §6). Golden-imaging the dot field would only test the PRNG.
 */

/**
 * Find the horizontal repeat period that best explains a row of pixels.
 *
 * A row over background should return `sepFar * noiseScale`; a row over the
 * nearest surface should return `sepNear * noiseScale`.
 *
 * Ties resolve to the shortest period, because `p` is scanned ascending and
 * only a strictly better score displaces the incumbent. That matters: a row
 * with an exact period `p` also matches at `2p`, `3p`, ... so the fundamental
 * must win.
 *
 * @param row one row of single-channel samples
 * @param lo  shortest period to consider, inclusive
 * @param hi  longest period to consider, inclusive
 */
export function dominantPeriod(
  row: ArrayLike<number>,
  lo: number,
  hi: number,
): { period: number; score: number } {
  let bestScore = -1
  let bestPeriod = lo
  for (let p = lo; p <= hi; p++) {
    let matches = 0
    const n = row.length - p
    if (n <= 0) break
    for (let i = 0; i < n; i++) if (row[i] === row[i + p]) matches++
    const score = matches / n
    if (score > bestScore) {
      bestScore = score
      bestPeriod = p
    }
  }
  return { period: bestPeriod, score: bestScore }
}

/** Extract row `y` from a width-`w` greyscale buffer. */
export function rowOf(buf: ArrayLike<number>, w: number, y: number): number[] {
  const out = new Array<number>(w)
  for (let x = 0; x < w; x++) out[x] = buf[y * w + x]!
  return out
}
