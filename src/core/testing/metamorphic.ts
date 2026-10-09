/**
 * Measurement kit for metamorphic / property tests of the stereogram encoders.
 *
 * ## Why this file exists
 *
 * Every defect this project has shipped was perceptual or spatial, and every
 * one was found by a human looking at a render. The output is *noise*: it has
 * no golden image worth pinning, equality assertions on it are vacuous, and
 * `dominantPeriod` reports a clean `sepFar` at score 1.000 over a region that
 * is thoroughly contaminated (design §2.3). "It rendered" and "the period is
 * right" are both satisfied by images that fuse to garbage.
 *
 * ## Three instruments, and what each one can and cannot see
 *
 * 1. **Control diff** — render twice at the same seed, once with the feature
 *    and once without. The difference *is* the feature's influence.
 *    {@link diffAgainstControl}. No width floor; works on arbitrary content.
 *    Its blind spot is that it measures *colour*, and colour in a constrained-
 *    pair encoder is a global gauge: see the warning below.
 *
 * 2. **Autocorrelation** (`dominantPeriod`, in `analysis.ts`) — reads the
 *    encoded depth off a row directly, which is the only instrument that
 *    reports an *absolute* disparity. It has a hard width floor: it needs
 *    `lo + MIN_OVERLAP` samples to return anything at all and `p +
 *    MIN_OVERLAP` for the true period to be reachable, so resolving
 *    `sepNear = 92` takes **≥108px** of uniform depth and `sepFar = 110` takes
 *    **≥126px**. Real content rarely has that: the committed examples' widest
 *    solid-depth runs are 92px (ball) and 61px (pacman), and text has none.
 *    It is a *fixture* instrument, not a content instrument.
 *
 * 3. **Coherent-column structure** ({@link coherentColumns}) — the columns
 *    where `img[x] === img[x+off]` in **every** row. This is the instrument
 *    this module adds, and it closes the gap the other two leave. It reports
 *    *where* a given disparity is encoded, with **no width floor** (a 1px
 *    feature is detected) and a false-positive rate of `2^-h` per column, so
 *    at `h = 16` a 1600px frame expects 0.02 false hits and at `h = 40` it is
 *    unmeasurable. Measured on a feature-free control: **0 hits**, every time.
 *
 * ## The trap: colour is a gauge, structure is the observable
 *
 * A raw pixel diff measures colour change. What a fused viewer resolves is
 * *equality structure* — which pixel equals which, at what offset. The two come
 * apart in **both** directions, and a property that confuses them is confidently
 * wrong:
 *
 * - `'linked'` recolours **everything** upstream of a near object — merging two
 *   equivalence classes repaints the whole losing chain, which can reach either
 *   frame edge — while leaving the far wallpaper's equality structure exactly
 *   intact. A pixel diff screams; a viewer sees nothing. Measured: a single
 *   near pixel at x=800 in a 1600px frame has a raw reach of 724px left and
 *   706px right. **Raw-pixel locality is therefore not a correctness property
 *   for `'linked'` at all**, and asserting it would be asserting a bug that
 *   does not exist.
 * - `'shift'` leaves the far wallpaper downstream of a near object *perfectly*
 *   intact (agreement 1.000) while replicating an 18px-wide band of
 *   near-period structure every `sepFar` px to the right edge. A period
 *   measurement is silent; a viewer sees the ghost.
 *
 * So: use the raw diff for **completeness** and for **row** locality, and use
 * {@link coherentColumns} for anything that claims to be about what a viewer
 * sees.
 *
 * ## Sample time and noise policy
 *
 * Everything here takes depth arrays and calls `sirdsFromDepth` directly, which
 * sidesteps a trap that bites control diffs built on the render pipeline: a
 * frame's seed is derived from its **sample time** unless `freezeNoise` is set,
 * so a control rendered at a different `t` than its subject differs in every
 * pixel and reads exactly like a row-independence regression. A control must
 * match its subject's sample time *and* noise policy, or not involve either.
 *
 * Lives under `src/core/testing/` alongside `fakeCanvas.ts`: `tsconfig.json`
 * excludes the directory from the build (and `purity.test.ts` asserts that no
 * `testing/` file reaches `dist`), while `tsconfig.typecheck.json` still checks
 * it.
 */
import { sirdsFromDepth } from '../sirds.js'
import type { SirdsOpts } from '../types.js'

/* ------------------------------------------------------------- encoders */

/**
 * A row-major greyscale encoder with its options already bound.
 *
 * Properties are written against this rather than against `sirdsFromDepth`
 * directly for one reason that matters: it lets every property be re-run
 * against a deliberately **broken** encoder defined inside a test file, which
 * is the only honest way to show the property can fail. A regression test
 * nobody has watched go red is a guess.
 */
export type Encoder = (depth: Float32Array, w: number, h: number) => Uint8Array

/** Bind `sirdsFromDepth` to one set of options. */
export function encoderFor(o: SirdsOpts): Encoder {
  return (depth, w, h) => sirdsFromDepth(depth, w, h, o)
}

/* ------------------------------------------------------- depth builders */

/** A uniform depth field. `z = 0` is the control every diff is taken against. */
export function flatDepth(w: number, h: number, z = 0): Float32Array {
  const d = new Float32Array(w * h)
  if (z !== 0) d.fill(z)
  return d
}

/** A full-height column band at depth `z` spanning `[x0, x1)`. */
export function slabDepth(w: number, h: number, x0: number, x1: number, z = 1): Float32Array {
  const d = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) d[y * w + x] = z
  }
  return d
}

/** One pixel at depth `z`. The minimal perturbation for a locality probe. */
export function pointDepth(w: number, h: number, x: number, y: number, z = 1): Float32Array {
  const d = new Float32Array(w * h)
  d[y * w + x] = z
  return d
}

/** A filled disc of radius `r` centred on `(cx, cy)`, at depth `z`. */
export function discDepth(
  w: number, h: number, cx: number, cy: number, r: number, z = 1,
): Float32Array {
  const d = new Float32Array(w * h)
  const r2 = r * r
  for (let y = 0; y < h; y++) {
    const dy = y - cy
    for (let x = 0; x < w; x++) {
      const dx = x - cx
      if (dx * dx + dy * dy <= r2) d[y * w + x] = z
    }
  }
  return d
}

/**
 * Pseudo-random depth in 0..1, for "perturb everything else" probes.
 *
 * Its own small LCG rather than `noiseAt`: a probe field that shared a mixer
 * with the encoder's own noise could in principle correlate with it, and a
 * property that passes because two hashes agree is not a property.
 */
export function randomDepth(w: number, h: number, seed: number): Float32Array {
  const d = new Float32Array(w * h)
  let s = (Math.imul(seed, 2654435761) + 1) >>> 0
  for (let i = 0; i < d.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    d[i] = s / 4294967296
  }
  return d
}

/* ------------------------------------------------------- control diffing */

/** Where a feature left a mark, relative to a feature-free control. */
export interface Diff {
  readonly w: number
  readonly h: number
  /** Count of differing pixels. */
  readonly changed: number
  /** `changed / (w*h)`. */
  readonly fraction: number
  /** Per-column: did any row in this column change? */
  readonly columns: Uint8Array
  /** Per-row: did any column in this row change? */
  readonly rows: Uint8Array
  /** Bounding box of the change, or all `-1` when nothing changed. */
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
}

/** Diff two same-size single-channel buffers. */
export function diffControl(
  a: ArrayLike<number>, b: ArrayLike<number>, w: number, h: number,
): Diff {
  const columns = new Uint8Array(w)
  const rows = new Uint8Array(h)
  let changed = 0
  let minX = -1, maxX = -1, minY = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    const base = y * w
    for (let x = 0; x < w; x++) {
      if (a[base + x] === b[base + x]) continue
      changed++
      columns[x] = 1
      rows[y] = 1
      if (minX < 0 || x < minX) minX = x
      if (x > maxX) maxX = x
      if (minY < 0 || y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return { w, h, changed, fraction: changed / (w * h), columns, rows, minX, maxX, minY, maxY }
}

/** Render `depth` and a feature-free control at the same seed, and diff them. */
export function diffAgainstControl(
  encode: Encoder, depth: Float32Array, w: number, h: number,
): Diff {
  return diffControl(encode(depth, w, h), encode(flatDepth(w, h), w, h), w, h)
}

/**
 * How far a change travelled from the pixel that caused it, in each direction.
 *
 * All four are `-1` when nothing changed at all. That is a distinct finding — a
 * perturbation that encoded to *nothing* — and must never be reported as
 * "reach 0". It happens constantly with single-pixel probes: changing `sep` at
 * one column swaps which of two random source pixels is copied, and those two
 * agree half the time, so roughly half of all single-pixel perturbations are
 * silent at any given seed. A locality property with a single-pixel probe must
 * therefore sweep seeds (or sites) and ignore the silent ones.
 */
export interface Reach {
  readonly left: number
  readonly right: number
  readonly up: number
  readonly down: number
  readonly changed: number
}

export function reachFrom(diff: Diff, x0: number, y0: number): Reach {
  if (diff.changed === 0) return { left: -1, right: -1, up: -1, down: -1, changed: 0 }
  return {
    left: Math.max(0, x0 - diff.minX),
    right: Math.max(0, diff.maxX - x0),
    up: Math.max(0, y0 - diff.minY),
    down: Math.max(0, diff.maxY - y0),
    changed: diff.changed,
  }
}

/* ----------------------------------------------------------- footprints */

/** Columns of a frame that carry a feature's signal, per the raw diff. */
export interface Footprint {
  /** First and last column with any change, or `-1`/`-1` for none. */
  readonly first: number
  readonly last: number
  /** Columns with a change, counted over `[first, last]`. */
  readonly covered: number
  /** Columns inside `[first, last]` with no change — holes in the signal. */
  readonly holes: number
}

export function columnFootprint(diff: Diff): Footprint {
  if (diff.minX < 0) return { first: -1, last: -1, covered: 0, holes: 0 }
  let covered = 0
  for (let x = diff.minX; x <= diff.maxX; x++) if (diff.columns[x]) covered++
  return {
    first: diff.minX,
    last: diff.maxX,
    covered,
    holes: diff.maxX - diff.minX + 1 - covered,
  }
}

/**
 * What the depth map *asks for*, per column: how many pixels in that column
 * carry depth above `threshold`.
 *
 * The counts, not a boolean, because a completeness assertion has to exclude
 * one-pixel-tall columns. The extreme-left column of a disc holds a single
 * depth pixel, and whether it leaves a mark is a coin flip on the seed (see
 * {@link Reach}) — scoring it as "lost depth" turns a correct encoder red at
 * 50% of seeds.
 */
export function depthColumns(
  depth: Float32Array, w: number, h: number, threshold = 0,
): { first: number; last: number; counts: Int32Array } {
  const counts = new Int32Array(w)
  let first = -1, last = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (depth[y * w + x]! <= threshold) continue
      counts[x]!++
      if (first < 0) first = x
    }
  }
  for (let x = w - 1; x >= 0; x--) if (counts[x]! > 0) { last = x; break }
  if (first >= 0) {
    for (let x = 0; x < w; x++) if (counts[x]! > 0) { first = x; break }
  }
  return { first, last, counts }
}

/** Per-row: does this row of the depth map carry any depth above `threshold`? */
export function rowsWithDepth(
  depth: Float32Array, w: number, h: number, threshold = 0,
): Uint8Array {
  const rows = new Uint8Array(h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (depth[y * w + x]! > threshold) { rows[y] = 1; break }
    }
  }
  return rows
}

/**
 * Columns the depth map asks for that the encoding does not deliver.
 *
 * `shift` puts a feature's signal `sepNear` px to the *left* of its depth
 * columns and `linked` puts it `sepNear/2` to the left, so a caller must pass
 * the encoder's own `offset`; {@link coherentColumns} plus {@link runsOf}
 * measures that offset rather than assuming it.
 *
 * @param minPixels ignore intended columns thinner than this (see
 *                  {@link depthColumns})
 */
export function missingColumns(
  counts: Int32Array, signal: Uint8Array, offset: number, minPixels = 1,
): { missing: number[]; intended: number } {
  const missing: number[] = []
  let intended = 0
  for (let x = 0; x < counts.length; x++) {
    if (counts[x]! < minPixels) continue
    intended++
    const probe = x + offset
    if (probe < 0 || probe >= signal.length || !signal[probe]) missing.push(x)
  }
  return { missing, intended }
}

/* --------------------------------------------------- equality structure */

/**
 * `1` where `img[x] === img[x + off]`, else `0`. The last `off` columns of each
 * row are `0` and callers must ignore them — there is no pair there.
 *
 * This is the field a fused viewer actually resolves. Two images with wildly
 * different pixels and identical match fields look identical through a
 * stereoscope.
 */
export function matchField(
  img: ArrayLike<number>, w: number, h: number, off: number,
): Uint8Array {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const base = y * w
    for (let x = 0; x + off < w; x++) out[base + x] = img[base + x] === img[base + x + off] ? 1 : 0
  }
  return out
}

/**
 * Fraction of `off`-separated pairs inside `[x0, x1)` that agree. `1` is a
 * perfect wallpaper, `~0.5` is chance, `NaN` when the window holds no pair.
 */
export function agreement(
  img: ArrayLike<number>, w: number, h: number, x0: number, x1: number, off: number,
): number {
  let n = 0, ok = 0
  for (let y = 0; y < h; y++) {
    const base = y * w
    for (let x = x0; x + off < x1; x++) {
      n++
      if (img[base + x] === img[base + x + off]) ok++
    }
  }
  return n === 0 ? Number.NaN : ok / n
}

/**
 * Columns where `img[x] === img[x + off]` in **every** row — i.e. where the
 * disparity `off` is coherently encoded down the whole frame.
 *
 * The workhorse of this module, and the instrument with no width floor: it
 * localises a 1px-wide feature, which autocorrelation cannot do below ~108px.
 * Background columns agree at `off = sepNear` with probability ~1/2 per row
 * independently, so a false positive needs all `h` rows to agree: `2^-h`. On a
 * feature-free control at `h = 16` over 1600 columns the expectation is 0.02
 * hits and the measurement is 0; at `h = 40` it is not worth stating. Assert
 * that control count is 0 before trusting a measurement — {@link coherentColumns}
 * is only meaningful against a silent baseline.
 */
export function coherentColumns(
  img: ArrayLike<number>, w: number, h: number, off: number,
): Uint8Array {
  const cols = new Uint8Array(w)
  for (let x = 0; x + off < w; x++) {
    let all = true
    for (let y = 0; y < h; y++) {
      if (img[y * w + x] !== img[y * w + x + off]) { all = false; break }
    }
    cols[x] = all ? 1 : 0
  }
  return cols
}

export interface Run {
  readonly start: number
  readonly end: number
  readonly length: number
}

/** Contiguous runs of set columns, left to right. */
export function runsOf(cols: Uint8Array): Run[] {
  const out: Run[] = []
  let start = -1
  for (let x = 0; x <= cols.length; x++) {
    const on = x < cols.length && cols[x] === 1
    if (on && start < 0) start = x
    else if (!on && start >= 0) { out.push({ start, end: x - 1, length: x - start }); start = -1 }
  }
  return out
}

/**
 * The longest run, which for a single compact feature is its real encoded
 * footprint; every other run is spurious structure (a ghost echo, or a chance
 * coincidence in the equivalence classes).
 *
 * Longest rather than nearest-to-the-feature on purpose: it needs no prior
 * knowledge of where the feature should have landed, which is the whole point
 * of a property that catches the *next* bug rather than the last one.
 */
export function principalRun(runs: readonly Run[]): Run | undefined {
  let best: Run | undefined
  for (const r of runs) if (!best || r.length > best.length) best = r
  return best
}

/** Every run except the principal one, widest first. */
export function spuriousRuns(runs: readonly Run[]): Run[] {
  const best = principalRun(runs)
  return runs.filter(r => r !== best).sort((a, b) => b.length - a.length)
}

/**
 * Width of the band at each frame edge in which a feature produces **no**
 * encoded disparity at all.
 *
 * Swept with a narrow probe rather than reasoned about: both encoders drop
 * depth near an edge, for different reasons and by different amounts, and the
 * asymmetry is what turns a centred ball into a crescent.
 *
 * @param probeW width of the probe slab
 * @param limit  how far in from each edge to sweep
 * @param step   sweep granularity, in px
 */
export function deadZones(
  encode: Encoder, w: number, h: number, off: number,
  { probeW = 8, limit = 200, step = 2 } = {},
): { left: number; right: number } {
  const silent = (x0: number): boolean => {
    const cols = coherentColumns(encode(slabDepth(w, h, x0, x0 + probeW), w, h), w, h, off)
    return !cols.includes(1)
  }
  let left = 0
  for (let x0 = 0; x0 <= limit; x0 += step) if (silent(x0)) left = x0 + probeW
  let right = 0
  for (let x0 = w - probeW; x0 >= w - limit; x0 -= step) if (silent(x0)) right = w - x0
  return { left, right }
}

/* ------------------------------------------------------ depth geometry */

/**
 * Lengths of every horizontal run of above-threshold depth, over every row.
 *
 * The authoring-side feature-size metric. A stroke narrower than the disparity
 * budget `sepFar - sepNear` cannot be *fused*, because the two eyes' images of
 * it are displaced further apart than the stroke is wide and there is no
 * unambiguous correspondence left: the viewer sees two thin features at the
 * background depth rather than one at the near depth.
 *
 * It is measured on the **depth map**, not the dot field, and that is forced
 * rather than convenient — see the FEATURE SIZE section of
 * `metamorphic.test.ts` for the measurement showing the limit is invisible in
 * the output. The encoder faithfully encodes a 1px feature; it is the viewer
 * that cannot recover it. So this is the only side the rule can be checked on.
 *
 * The metric is "median over all horizontal runs in all rows", which is
 * deliberately not the same as "stem width": runs through the thin parts of
 * curves and diagonals pull it down, and it reads roughly 2–3× lower than a
 * by-eye stem measurement of the same glyphs. The threshold must be calibrated
 * against *this* definition rather than inherited from a hand measurement.
 */
export function runLengths(
  depth: Float32Array, w: number, h: number, threshold = 0,
): number[] {
  const out: number[] = []
  for (let y = 0; y < h; y++) {
    const base = y * w
    let run = 0
    for (let x = 0; x < w; x++) {
      if (depth[base + x]! > threshold) {
        run++
      } else if (run > 0) {
        out.push(run)
        run = 0
      }
    }
    if (run > 0) out.push(run)
  }
  return out
}

/** Median of `xs`. `NaN` for an empty input — never 0, which is a real width. */
export function median(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/* ---------------------------------------------------------- row purity */

/**
 * Rows whose output changed when **every other row's depth was replaced with
 * noise**.
 *
 * The general form of row independence, and the property the sequential-PRNG
 * defect violated. A row's output must be a pure function of its own depth row
 * and its `y`; anything else means the encoder carries hidden state across
 * rows, which is invisible in a still and reads as the whole bottom half of an
 * animation twitching when one object crosses one scanline.
 *
 * Replacing the other rows wholesale — rather than perturbing one pixel — is
 * what makes this robust. The sequential defect only fired when a row's draw
 * count changed, which needed the perturbation to land in the leftmost `sepFar`
 * px; a probe that only pokes the middle of the frame measures `down = 0` and
 * reports the bug as absent (measured: a single near pixel at x=100 propagates
 * to every row below, at x=110 it propagates to none).
 *
 * Costs `h` encodes. Keep `h` small.
 */
export function rowsContaminatedByOtherRows(
  encode: Encoder, depth: Float32Array, w: number, h: number, seed = 1,
): number[] {
  const baseline = encode(depth, w, h)
  const bad: number[] = []
  for (let r = 0; r < h; r++) {
    const perturbed = randomDepth(w, h, seed + r)
    for (let x = 0; x < w; x++) perturbed[r * w + x] = depth[r * w + x]!
    const got = encode(perturbed, w, h)
    for (let x = 0; x < w; x++) {
      if (got[r * w + x] !== baseline[r * w + x]) { bad.push(r); break }
    }
  }
  return bad
}

/**
 * Rows of a `hShort`-tall render that differ from the same rows of a `hTall`
 * render of the same depth content.
 *
 * The cheap companion probe: adding rows below must not change the rows already
 * there. `depthFor(h)` must produce the same first `hShort` rows at both
 * heights.
 */
export function rowsChangedByHeight(
  encode: Encoder, depthFor: (h: number) => Float32Array,
  w: number, hShort: number, hTall: number,
): number[] {
  const short = encode(depthFor(hShort), w, hShort)
  const tall = encode(depthFor(hTall), w, hTall)
  const bad: number[] = []
  for (let y = 0; y < hShort; y++) {
    for (let x = 0; x < w; x++) {
      if (short[y * w + x] !== tall[y * w + x]) { bad.push(y); break }
    }
  }
  return bad
}

/* ------------------------------------------------------------ reporting */

/**
 * Print a measured number into the test log.
 *
 * Properties here are graded on measurements, and a suite that reports only
 * pass/fail throws the measurement away — including for the properties that are
 * *expected* to fail, where the number is the only thing that says whether the
 * known defect got better or worse. `STST_QUIET=1` silences it.
 */
export function report(label: string, value: unknown): void {
  if (process.env['STST_QUIET']) return
  // `JSON.stringify` turns NaN into `null`, and NaN is a *meaningful* result
  // here — it is what `dominantPeriod` returns when a window is too narrow to
  // measure. A log line reading `period: null` looks like a bug in the test.
  const text = typeof value === 'string'
    ? value
    : JSON.stringify(value, (_k, v) => (typeof v === 'number' && Number.isNaN(v) ? 'NaN' : v))
  // eslint-disable-next-line no-console
  console.log(`  [measured] ${label}: ${text}`)
}

/** `{start,end,length}` as a compact string, for {@link report}. */
export function fmtRuns(runs: readonly Run[], max = 6): string {
  const head = runs.slice(0, max).map(r => `${r.start}-${r.end}(${r.length})`)
  return head.join(' ') + (runs.length > max ? ` …+${runs.length - max}` : '')
}
