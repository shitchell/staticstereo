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
 * Returns `period: NaN` when the window is too short to measure anything in
 * `[lo, hi]`. Always check `samples` before trusting a result from a
 * user-selected region: a period scored over 20 comparisons and one scored over
 * 400 are not equally believable, and nothing else in the return distinguishes
 * them.
 *
 * @param row one row of single-channel samples
 * @param lo  shortest period to consider, inclusive
 * @param hi  longest period to consider, inclusive
 */
export function dominantPeriod(
  row: ArrayLike<number>,
  lo: number,
  hi: number,
): { period: number; score: number; samples: number } {
  let bestScore = -1
  let bestPeriod = Number.NaN
  let bestSamples = 0

  for (let p = lo; p <= hi; p++) {
    const n = row.length - p
    // n shrinks monotonically as p grows, so this is a stop, not a skip.
    // Below the floor an exact-looking match is indistinguishable from a
    // coin-flip streak: 16 consecutive matches of binary samples is ~1.5e-5
    // against chance, which is the least evidence worth reporting.
    if (n < MIN_OVERLAP) break

    let matches = 0
    for (let i = 0; i < n; i++) if (row[i] === row[i + p]) matches++
    const score = matches / n
    if (score > bestScore) {
      bestScore = score
      bestPeriod = p
      bestSamples = n
    }
  }

  // Never report a period that was not actually measured. Returning `lo` with a
  // sentinel score here would be indistinguishable from a real measurement to
  // any caller that forgot to check.
  if (bestScore < 0) return { period: Number.NaN, score: 0, samples: 0 }
  return { period: bestPeriod, score: bestScore, samples: bestSamples }
}

/**
 * Fewest overlapping comparisons that can support a period claim. Windows
 * narrower than this in the diagnostics panel report NaN rather than a guess.
 */
export const MIN_OVERLAP = 16

/** Extract row `y` from a width-`w` greyscale buffer. */
export function rowOf(buf: ArrayLike<number>, w: number, y: number): number[] {
  const out = new Array<number>(w)
  for (let x = 0; x < w; x++) out[x] = buf[y * w + x]!
  return out
}
