import { MIN_OVERLAP, dominantPeriod, rowOf } from '../src/core/index.js'
import type { StereoOpts } from '../src/core/types.js'

/**
 * The diagnostics readout.
 *
 * `dominantPeriod` is shipped core code and this panel is exactly its use case:
 * the horizontal repeat period *is* the encoded depth, so measuring a row over
 * background and a row over the object is the only way to check that the
 * encoder did what the depth map asked — and the only check that distinguishes
 * an encoding bug from an authoring one in a picture nobody can read by eye.
 *
 * **Everything here exists to honour two parts of that function's contract**,
 * both of which are easy to violate while producing a panel that looks fine:
 *
 * 1. It returns `period: NaN` when the window is too thin for any candidate to
 *    have {@link MIN_OVERLAP} comparisons behind it. Rendering that number puts
 *    "NaN px" in the UI; coercing it to 0 is worse, because 0 reads as a
 *    measurement. So an unmeasurable window is reported as
 *    {@link UNMEASURED} and is never formatted as a quantity.
 * 2. It returns a `samples` count precisely because a period scored over 20
 *    comparisons and one scored over 400 are not equally believable. The score
 *    alone cannot tell them apart — both can be 1.0 — so the readout always
 *    carries the count *and* a grade derived from it, and two readouts with
 *    identical periods and scores but different sample counts never describe
 *    identically.
 */

export type Confidence = 'none' | 'weak' | 'fair' | 'strong'

export interface PeriodReadout {
  /** May be `NaN`; check {@link PeriodReadout.measured} before formatting. */
  period: number
  score: number
  samples: number
  measured: boolean
  confidence: Confidence
}

export interface GreyFrameLike {
  pixels: ArrayLike<number>
  width: number
  height: number
}

/** What the panel shows instead of a number it does not have. */
export const UNMEASURED = '—'

/**
 * Sample-count grade boundaries.
 *
 * Not derived from anything: `MIN_OVERLAP` (16) is core's floor for "the least
 * evidence worth reporting at all", and these are two further steps of four,
 * chosen so that a full-width row of an 800px scene lands in `strong` and a
 * narrow user-selected region cannot.
 */
export const WEAK_SAMPLES = 64
export const FAIR_SAMPLES = 256

/**
 * The lowest score that may be graded above `weak`.
 *
 * A row of independent noise has no period, but `dominantPeriod` still returns
 * whichever candidate happened to score best — around 0.5 for binary samples.
 * Without this floor a wide window would grade that as `strong`, which is the
 * one lie the panel must not tell.
 */
export const MIN_CREDIBLE_SCORE = 0.75

/** How far either side of the expected range the scan runs, in px. */
export const PERIOD_MARGIN = 8

/**
 * The two periods a correct render must produce.
 *
 * Both scale by `noiseScale`, because the upscale is the last stage of the
 * pipeline: `sepFar: 110, noiseScale: 2` measures 220px, not 110. Forgetting
 * that factor is the single most likely reason a correct image looks wrong in
 * this panel.
 */
export function expectedPeriods(stereo: StereoOpts): { near: number; far: number } {
  return {
    near: stereo.sepNear * stereo.noiseScale,
    far: stereo.sepFar * stereo.noiseScale,
  }
}

/** The candidate range to scan: the expected periods plus a margin either side. */
export function periodWindow(stereo: StereoOpts): { lo: number; hi: number } {
  const { near, far } = expectedPeriods(stereo)
  return {
    // A period below 2px is not a thing the encoder can produce (`sirdsFromDepth`
    // floors `sep` at 2), so scanning there only wastes comparisons.
    lo: Math.max(2, Math.round(near) - PERIOD_MARGIN),
    hi: Math.round(far) + PERIOD_MARGIN,
  }
}

export function confidenceOf(score: number, samples: number): Confidence {
  if (samples < MIN_OVERLAP) return 'none'
  if (score < MIN_CREDIBLE_SCORE) return 'weak'
  if (samples < WEAK_SAMPLES) return 'weak'
  if (samples < FAIR_SAMPLES) return 'fair'
  return 'strong'
}

export function readPeriod(row: ArrayLike<number>, lo: number, hi: number): PeriodReadout {
  const { period, score, samples } = dominantPeriod(row, lo, hi)
  const measured = Number.isFinite(period) && samples >= MIN_OVERLAP
  return {
    period,
    score,
    samples,
    measured,
    confidence: measured ? confidenceOf(score, samples) : 'none',
  }
}

/**
 * Measure the horizontal band `[x0, x1)` of row `y`.
 *
 * **The band is not a refinement, it is the point.** A full-width row of any
 * real scene crosses both the object and the background, and `dominantPeriod`
 * returns the single period that best explains the whole row — which is the
 * background's, since the background is almost always the larger share. Driving
 * the built page in a browser made this concrete: on the `emerge` example at
 * full rise, every row in the frame reported 220px (`sepFar × 2`) and no row
 * anywhere could report 184px (`sepNear × 2`). The object was visible only as
 * the match dropping from 100% to ~87%.
 *
 * So half of what design §6 calls the measurement — "inside versus outside the
 * object" — is unreachable without an x window. Core's own `render.test.ts`
 * slices one before measuring; this is the same thing, exposed to the panel.
 */
export function readSegment(
  frame: GreyFrameLike, y: number, x0: number, x1: number, lo: number, hi: number,
): PeriodReadout {
  if (!Number.isInteger(y) || y < 0 || y >= frame.height) {
    throw new Error(`row ${y} is outside a frame of height ${frame.height}`)
  }
  if (
    !Number.isInteger(x0) || !Number.isInteger(x1) ||
    x0 < 0 || x1 > frame.width || x1 <= x0
  ) {
    throw new Error(
      `band [${x0}, ${x1}) is not a non-empty range inside a frame of ` +
      `width ${frame.width}`,
    )
  }
  return readPeriod(rowOf(frame.pixels, frame.width, y).slice(x0, x1), lo, hi)
}

/** The whole of row `y`. Reports the background period for any typical scene. */
export function readRow(
  frame: GreyFrameLike, y: number, lo: number, hi: number,
): PeriodReadout {
  return readSegment(frame, y, 0, frame.width, lo, hi)
}

/** The period as a quantity, or {@link UNMEASURED}. Never emits "NaN". */
export function formatPeriod(r: PeriodReadout): string {
  if (!r.measured) return UNMEASURED
  return `${Math.round(r.period)} px`
}

/**
 * One line for the panel.
 *
 * The sample count is always present when there is a measurement, so a thin
 * window can never be mistaken for a thorough one; and when there is no
 * measurement the line says why rather than showing a bare dash.
 */
export function describeReadout(r: PeriodReadout): string {
  if (!r.measured) {
    return `${UNMEASURED} (window too narrow to measure: fewer than ` +
      `${MIN_OVERLAP} overlapping comparisons)`
  }
  return `${formatPeriod(r)} · match ${(r.score * 100).toFixed(1)}% · ` +
    `n=${r.samples} (${r.confidence})`
}
