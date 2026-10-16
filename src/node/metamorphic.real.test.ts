/**
 * The two properties from `src/core/metamorphic.test.ts` that cannot be checked
 * on synthetic depth arrays, run on real rasterised content.
 *
 * Why this file is under `src/node/` rather than next to its siblings: both
 * properties need **real glyph outlines**. `core`'s `fakeCanvas` draws text as
 * one filled box per character, which is the right call for testing the
 * rasteriser's compositing and completely useless for measuring a stroke width.
 * Only `@napi-rs/canvas` has actual curves, and `core` may not import it (see
 * `purity.test.ts`), so the test comes to the canvas instead.
 *
 * ## 1. Feature size, on the depth maps authors actually produce
 *
 * A feature narrower than the disparity budget cannot be fused. That limit is
 * invisible in the encoded image — `metamorphic.test.ts` measures why — so the
 * only place to check it is the depth map, and the only interesting depth maps
 * are the ones with text in them.
 *
 * **Everything absolute here is reported, not asserted** — and the reason has
 * changed, so it is worth restating rather than inheriting. It used to be that
 * font files differ between this machine and CI, so a pinned median stroke
 * width would have been a test of the runner's fontconfig. That is no longer
 * true: `assets/fonts/inter-*` is vendored and registered ahead of the system
 * chain, so these numbers are now reproducible anywhere the repository is
 * checked out. What is asserted is still the relations, but now as a *choice*:
 * the absolutes are properties of a font file, a font upgrade is allowed to move
 * them, and the thing that must fail when the face silently changes is an
 * identity test rather than every stroke assertion in the suite. That test is
 * `canvas.vendored.test.ts`, which compares the resolved face against each
 * system candidate over the probes that actually separate them. Two absolutes
 * *are* pinned there, both load-bearing for the CLI's defaults: that 90px bold
 * is below the disparity budget and 90px at 900 is above it.
 *
 * The old caveat used to be doing more work than it should have. Until
 * `src/node/canvas.ts` learned to resolve CSS generic families, "real glyph
 * outlines" was aspirational: `sans-serif` matched nothing in
 * `@napi-rs/canvas`, fell through to whichever family fontconfig registered
 * first, and on this machine that was a dingbat font. Every absolute number in
 * this file was therefore a measurement of URW Dingbats, and two of the
 * comments below record what it cost. Then the generic resolved to a system
 * family (DejaVu Sans on a Debian stack), which moved every figure once; now it
 * resolves to the vendored face, which moved them again and downwards — DejaVu's
 * bold is a 24-29% heavy outlier against every mainstream sans.
 *
 * ## 2. Row locality, on the committed example scenes
 *
 * The synthetic version of this property is strong but it is still a fixture.
 * These load `examples/*.yaml` and assert, over several sample times, that the
 * rows which changed are exactly the rows that carry depth — in both
 * directions, so a leak and a loss both fail.
 *
 * The control is constructed as an **all-zero depth map of the same size**, fed
 * to the same encoder with the same seed, rather than by re-rendering the scene
 * through the pipeline. That is not a shortcut: `renderFrame` derives its seed
 * from the sample *time* unless `freezeNoise` is set, so a control rendered at a
 * different `t` than its subject differs in every pixel and reads exactly like
 * a row-independence regression. Calling `sirdsFromDepth` directly removes both
 * the sample time and the noise policy from the comparison.
 */
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { nodeCanvas } from './canvas.js'
import { loadScene } from '../cli/scene.js'
import { marginsFor, padDepth } from '../core/plate.js'
import type { Margins } from '../core/plate.js'
import { rasterDepth } from '../core/raster.js'
import { dominantPeriod, MIN_OVERLAP, rowOf } from '../core/analysis.js'
import {
  diffAgainstControl, encoderFor, median, report, rowsWithDepth, runLengths,
} from '../core/testing/metamorphic.js'
import { DEFAULT_STEREO } from '../core/types.js'
import type { Scene, SirdsAlgorithm, SirdsOpts } from '../core/types.js'

const SEP_FAR = DEFAULT_STEREO.sepFar
const SEP_NEAR = DEFAULT_STEREO.sepNear
const BUDGET = SEP_FAR - SEP_NEAR

/**
 * The depth a sample must exceed to count as ink here — **absolute, 0..1**,
 * and deliberately not `perception.ts`'s `INK_FRACTION`.
 *
 * `runLengths` takes an absolute threshold and compares `depth > threshold`.
 * `measureInk` takes a *fraction of the layer's own peak* and compares
 * `depth >= peak × INK_FRACTION`. Both numbers are 0.5 today, and that is a
 * coincidence of two unrelated choices, not a shared constant:
 *
 * - On a layer at full depth they agree. On a `depth: 0.4` layer this one
 *   measures an empty map and the module measures the stroke, because 0.4
 *   never exceeds 0.5. Every scene below renders a text layer at the default
 *   depth of 1, which is the only reason the question has never bitten.
 * - The comparison differs as well as the scale — `>` here, `>=` there — so a
 *   sample sitting exactly on the threshold is ink to one and not to the
 *   other. Unobservable today, because depth arrives from 8-bit alpha and a
 *   sample is k/255, which is never exactly 0.5. Written down rather than
 *   relied on.
 *
 * **Importing `INK_FRACTION` here because the numbers match is a standing
 * ruling against**, and the reason is what it would cost: these call sites are
 * the authority for the calibration table `src/shared/perception.ts` publishes
 * (9px regular, 14px bold and 19px at 900 for 90px type, which the README
 * reprints). Coupling them to a constant that is scheduled to move — design
 * §10.3's calibration round is effort #2 — would silently re-measure the
 * published table against a different ink definition the day it moves, and
 * nothing in the suite compares the table to anything. A guard whose cheapest
 * satisfying action is wrong will eventually be satisfied wrongly; this is the
 * note that makes the right action the cheap one.
 *
 * The *peak-relative* sibling of this threshold, which **does** import the
 * constant because it really is the same quantity, is `inkExtent` in
 * `canvas.generics.test.ts`.
 */
const ABSOLUTE_INK_DEPTH = 0.5

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')
const canvas = nodeCanvas()

function opts(algorithm: SirdsAlgorithm, seed = 7): SirdsOpts {
  return { sepFar: SEP_FAR, sepNear: SEP_NEAR, cross: false, seed, algorithm }
}

/* ====================================================================== */
/* FEATURE SIZE on real glyphs                                            */
/* ====================================================================== */

/**
 * Median width of every horizontal stroke crossing in a rendered string.
 *
 * Not the same quantity as a by-eye stem measurement: crossings through the
 * thin parts of curves and diagonals are counted too, which reads roughly
 * 2–3× lower than measuring the stem of a `T`. Either definition works as a
 * warning, but the threshold has to be calibrated against the one in use, and
 * this is the one in use.
 */
async function strokeMedian(text: string, size: number, weight: string): Promise<number> {
  const w = Math.round(size * 0.8 * text.length) + 80
  const h = Math.round(size * 1.8)
  const scene: Scene = { size: [w, h], layers: [{ type: 'text', text, size, weight, at: [20, 10] }] }
  const depth = await rasterDepth(scene, 0, canvas)
  return median(runLengths(depth, w, h, ABSOLUTE_INK_DEPTH))
}

describe('feature size on real glyphs', () => {
  it('counts ink by an absolute depth, which is not the module\'s peak-relative rule', async () => {
    // **The sensor behind {@link ABSOLUTE_INK_DEPTH}'s "do not import
    // `INK_FRACTION`".** The two thresholds are both 0.5 and a reader can
    // only tell them apart on a layer whose peak is not 1, so the difference
    // is demonstrated here rather than asserted in a comment.
    //
    // Same glyphs, same size, same weight; only the layer depth differs. At
    // depth 1 the strokes measure. At 0.4 nothing in the map exceeds an
    // absolute 0.5, so this definition reports an empty map — while
    // `measureInk`, which scales its threshold to the peak, reports the
    // stroke unchanged (`src/shared/perception.test.ts` carries that half,
    // and the two files deliberately share no import).
    //
    // What this protects: every scene in this file renders text at the
    // default depth of 1, so swapping in a peak-relative threshold would
    // leave all of its numbers — and the published calibration table they
    // are the authority for — exactly where they are, and go unnoticed until
    // the calibration round moved the constant.
    const w = 400, h = 200
    const glyphs = (depth: number): Scene => ({
      size: [w, h],
      layers: [{ type: 'text', text: 'STATIC', size: 90, weight: 'bold', at: [20, 10], depth }],
    })
    const shallow = glyphs(0.4)
    const full = glyphs(1)

    const shallowDepth = await rasterDepth(shallow, 0, canvas)
    let peak = 0
    for (let i = 0; i < shallowDepth.length; i++) if (shallowDepth[i]! > peak) peak = shallowDepth[i]!
    report('peak depth of a depth:0.4 text layer vs the absolute ink threshold',
      `${peak.toFixed(4)} vs ${ABSOLUTE_INK_DEPTH}`)
    expect(peak).toBeGreaterThan(0.39)
    expect(peak).toBeLessThan(ABSOLUTE_INK_DEPTH)

    // The positive control: the same glyphs at full depth do measure, so the
    // empty answer below is the threshold talking and not an empty canvas.
    const fullRuns = runLengths(await rasterDepth(full, 0, canvas), w, h, ABSOLUTE_INK_DEPTH)
    report('runs at depth 1 vs depth 0.4, absolute threshold',
      `${fullRuns.length} vs ${runLengths(shallowDepth, w, h, ABSOLUTE_INK_DEPTH).length}`)
    expect(median(fullRuns)).toBeGreaterThan(0)
    expect(runLengths(shallowDepth, w, h, ABSOLUTE_INK_DEPTH)).toHaveLength(0)
  })

  const CASES = [
    ['normal', 90], ['normal', 150], ['bold', 90], ['bold', 150],
    ['bold', 240], ['bold', 360],
  ] as const

  it('reports the measured stroke median for each authoring choice', async () => {
    const rows: string[] = []
    for (const [weight, size] of CASES) {
      const m = await strokeMedian('STATIC', size, weight)
      rows.push(`${weight}/${size}=${m}${m < BUDGET ? ' (sub-budget)' : ''}`)
    }
    report(`stroke median, "STATIC", budget ${BUDGET}px`, rows.join(' '))
    expect(rows.length).toBe(CASES.length)
  })

  it('grows monotonically with size, at fixed weight', async () => {
    for (const weight of ['normal', 'bold']) {
      const series = await Promise.all([60, 90, 150, 240].map(s => strokeMedian('STATIC', s, weight)))
      report(`stroke median vs size (${weight}) 60/90/150/240`, series)
      for (let i = 1; i < series.length; i++) expect(series[i]!).toBeGreaterThan(series[i - 1]!)
    }
  })

  it('grows with weight, at fixed size', async () => {
    const thin = await strokeMedian('STATIC', 150, 'normal')
    const thick = await strokeMedian('STATIC', 150, 'bold')
    report('stroke median normal vs bold at 150px', `${thin} → ${thick}`)
    expect(thick).toBeGreaterThan(thin)
  })

  // The authoring trap behind defect #4: whether the weight knob does anything
  // past `bold` is the rasteriser's business, not this codebase's.
  //
  // **The story originally recorded here was wrong in both halves, and the
  // cause was the generic-family bug.** It said an earlier assertion ("900 buys
  // at most 5% over bold") passed locally because this machine saturates and
  // failed in CI because "GitHub's runner ships a real 900 face (53px vs bold's
  // 46px, +15%)". Measured, after `src/node/canvas.ts` started resolving
  // `sans-serif`:
  //
  //   - **There was no real 900 face anywhere.** DejaVu Sans, Liberation Sans
  //     and Noto Sans each declare exactly two weights, 400 and 700, and
  //     Chromium renders `900 240px <any of them>` byte-identically to `bold` —
  //     same ink count, same pixel hash. What `@napi-rs/canvas` gave instead
  //     was SYNTHESISED weight: +15.2% / +16.2% on DejaVu Sans and +22.9% /
  //     +21.2% on Liberation Sans at 240 / 360px.
  //   - **The local "saturation" was the bug.** Before the fix `sans-serif`
  //     resolved to nothing and fell through to the first registered family,
  //     `D050000L` (URW Dingbats), which renders `bold` and `900` identically
  //     to the pixel. The depth maps matched because the glyphs were dingbats.
  //   - **So CI was not special, it was just a different fallback.** The CI
  //     numbers 46px and 53px are *exactly* DejaVu Sans bold and 900 at 240px
  //     as measured after that fix. Its fontconfig put a real sans first; ours
  //     put a dingbat font first. One unresolved generic, two silent
  //     substitutions.
  //
  // **And the premise has now been removed rather than worked around.** The
  // vendored face declares a real 900, so the gain is selection and not
  // synthesis: +36% at 90px and +35% at 240px here, and 23px → 31px at 150px
  // measured in a headless Chromium through the site's own legibility panel —
  // the first time the two rasterisers have agreed about this at all. The
  // "(saturated)" branch in the report below is consequently unreachable with
  // the vendored face and is kept only because it becomes reachable again the
  // moment the registration fails and the system chain takes over.
  //
  // The assertion stays MONOTONICITY rather than a ratio, because the ratio is
  // still a property of the font file rather than of this code, and because the
  // degraded path must pass too.
  it('a weight heavier than bold never reduces stroke width', async () => {
    const pairs = await Promise.all([240, 360].map(async size => {
      const bold = await strokeMedian('STATIC', size, 'bold')
      const nine = await strokeMedian('STATIC', size, '900')
      return { size, bold, nine }
    }))
    report(
      'bold vs 900 stroke median',
      pairs.map(p => `${p.size}: ${p.bold}/${p.nine}` +
        (p.nine === p.bold ? ' (saturated)' : ' (distinct face)')).join(' '),
    )
    for (const p of pairs) expect(p.nine).toBeGreaterThanOrEqual(p.bold)
  })

  // The usable form of the rule: a verdict, derived from the depth map alone,
  // that agrees with what a viewer reported. Shaun's labels were
  // normal/90 and normal/150 unfusable, bold/240 and bold/360 fusable; this
  // metric with the budget as its threshold reproduces all four.
  it('the budget threshold reproduces the viewer verdicts', async () => {
    const fusable = async (size: number, weight: string) => await strokeMedian('STATIC', size, weight) >= BUDGET
    const verdicts = {
      'normal/90': await fusable(90, 'normal'),
      'normal/150': await fusable(150, 'normal'),
      'bold/240': await fusable(240, 'bold'),
      'bold/360': await fusable(360, 'bold'),
    }
    report('verdicts (true = wider than the budget)', verdicts)
    expect(verdicts).toEqual({
      'normal/90': false, 'normal/150': false, 'bold/240': true, 'bold/360': true,
    })
  })

  it('and real text sits below the autocorrelation floor, so period analysis cannot judge it', async () => {
    // Corroborates the measurement gap on content rather than on a fixture: a
    // feature can be comfortably fusable and still far too narrow for
    // `dominantPeriod` to see.
    //
    // Stated on the median rather than the maximum, because the maximum is a
    // *horizontal* bar — the crossbar of a T, the top of an S — and those can
    // clear the floor. Measured on 150px bold "STATIC" through the vendored
    // face: median 24px, max 90px, floor 108px, so **no** crossing clears it.
    // (29 / 102 / 108 on DejaVu Sans, which is what this read before the face
    // was vendored — the conclusion is the same and the margin is wider.)
    //
    // The figures here used to read "median 13px, max 114px, with only 1% of
    // crossings at or above the floor", and that was the unresolved
    // `sans-serif` generic being measured — the dingbat fallback, which returns
    // exactly 13 / 114 / 1.74% on this probe. Real glyphs make the conclusion
    // stronger, not weaker: nothing at all is measurable by autocorrelation,
    // rather than a 1.7% sliver that would report a period for a handful of
    // rows and NaN for the rest.
    const w = 1400, h = 300
    const scene: Scene = {
      size: [w, h], layers: [{ type: 'text', text: 'STATIC', size: 150, weight: 'bold', at: [40, 60] }],
    }
    const depth = await rasterDepth(scene, 0, canvas)
    const runs = runLengths(depth, w, h, ABSOLUTE_INK_DEPTH)
    const floor = SEP_NEAR + MIN_OVERLAP
    const above = runs.filter(r => r >= floor).length / runs.length
    report('150px bold text run lengths: median / max / floor',
      `${median(runs)} / ${Math.max(...runs)} / ${floor}`)
    report('fraction of crossings measurable by autocorrelation', above.toFixed(4))
    expect(median(runs)).toBeLessThan(floor)
    expect(above).toBeLessThan(0.05)

    // And the consequence, measured: a window the width of a typical stroke
    // reports nothing at all.
    const img = encoderFor(opts('shift'))(depth, w, h)
    const probe = dominantPeriod(rowOf(img, w, 150).slice(40, 40 + median(runs)), SEP_NEAR, SEP_FAR)
    report('dominantPeriod over one median-width stroke', probe)
    expect(Number.isNaN(probe.period)).toBe(true)
    expect(probe.samples).toBe(0)
  })
})

/* ====================================================================== */
/* ROW LOCALITY on the committed example scenes                           */
/* ====================================================================== */

describe('row locality on the committed examples', () => {
  const EXAMPLES = ['bouncing-ball.yaml', 'pacman.yaml', 'scrolling-text.yaml']
  const TIMES = [0.25, 1.0, 2.0, 3.5]

  /** No padding at all — the pipeline as it was before the plate/stage split. */
  const UNPADDED: Margins = { left: 0, right: 0 }

  /**
   * Extra seeds a candidate "lost" row is re-tested against.
   *
   * **This is what makes the probe usable on real glyphs, and it is not a
   * tolerance.** A control diff measures colour, and changing `sep` at one
   * column only swaps *which* of two random source pixels is copied — those two
   * agree half the time, so a row holding k depth pixels is silent at any given
   * seed with probability about `2^-k` even when the encoder did its job
   * perfectly (see `Reach`'s docs). Real text is full of 1–3px glyph tips:
   * measured on `scrolling-text.yaml`, exactly one row at t=2.0 (3 depth
   * pixels, x=686..688, depth 0.32) and one at t=3.5 (3 pixels, x=536..538)
   * went silent at seed 7 — mid-frame, nowhere near an edge.
   *
   * A row lost to a **dead zone** is a different thing entirely and is silent
   * at *every* seed, deterministically: where the encoder has no in-range
   * partner column it writes `noiseAt(seed, x, y)`, which is positional, so
   * that column is bit-identical in the subject and in the control no matter
   * what the seed is. Re-testing against more seeds therefore cannot hide a
   * dead zone — it can only remove the statistical false positives — and the
   * calibration test below demonstrates both halves of that.
   */
  const CONFIRM_SEEDS = [11, 23, 41, 59, 97, 151]

  /**
   * Rows with depth vs rows that changed, for one scene at one time.
   *
   * The depth map is **padded to plate width** the way `render.ts` does it
   * (design §10): the scene is rasterised at stage size, then the stage is
   * inset by the encoder's dead margins and the margin columns are
   * edge-extended. Passing `margins` explicitly rather than deriving them is
   * what lets the same probe measure the pre-split behaviour, which is the only
   * way to know this measurement is not vacuous.
   *
   * `rowsWithDepth` is unchanged by the padding — edge extension copies a row's
   * own border sample sideways, so it can neither create depth in an empty row
   * nor remove it from a filled one — so the intended row set is still exactly
   * what the author authored.
   */
  async function probe(
    file: string, seconds: number, algorithm: SirdsAlgorithm, margins: Margins,
  ) {
    const scene = await loadScene(resolve(ROOT, 'examples', file))
    const [w, h] = scene.size
    const depth = await rasterDepth(scene, seconds, canvas)
    const plateW = margins.left + w + margins.right
    const plate = padDepth(depth, w, h, margins)
    const want = rowsWithDepth(depth, w, h)

    const diff = diffAgainstControl(encoderFor(opts(algorithm)), plate, plateW, h)
    let leaked = 0
    let candidates: number[] = []
    for (let y = 0; y < h; y++) {
      if (diff.rows[y] && !want[y]) leaked++
      if (!diff.rows[y] && want[y]) candidates.push(y)
    }

    // Only paid when there is something to confirm, which after padding is
    // almost never — so the seed sweep costs nothing on the green path.
    for (const seed of CONFIRM_SEEDS) {
      if (candidates.length === 0) break
      const d = diffAgainstControl(encoderFor(opts(algorithm, seed)), plate, plateW, h)
      candidates = candidates.filter(y => !d.rows[y])
    }

    return {
      w, h, leaked, lost: candidates.length,
      depthRows: [...want].filter(Boolean).length,
    }
  }

  /** Every (example, time) pair, measured once per encoder. */
  async function sweep(algorithm: SirdsAlgorithm, margins: Margins) {
    const out: { label: string; leaked: number; lost: number; depthRows: number; h: number }[] = []
    for (const file of EXAMPLES) {
      for (const seconds of TIMES) {
        const r = await probe(file, seconds, algorithm, margins)
        out.push({ label: `${file.replace('.yaml', '')}@${seconds}`, ...r })
      }
    }
    return out
  }

  const marginsOf = (algorithm: SirdsAlgorithm): Margins => marginsFor(SEP_FAR, algorithm)

  /**
   * 20s, not the 5s default, for the three `it.each` blocks below — the six
   * tests that call `sweep()`, and only those. The rest of this file is not
   * raised: the other eight tests measured 15–92ms alone and 74–498ms inside a
   * full run, which is not a thin margin by any reading.
   *
   * `sweep()` rasterises and encodes three committed scenes at four times
   * each — twice over for the NO-margins pair, which runs the whole sweep
   * unpadded and again padded — so these six carry nearly all of the file's
   * cost and all of its sensitivity to how contended the box is. Measured on
   * 12 cores with other agents' suites running concurrently (load average
   * 9–12), inside a full `vitest run`:
   *
   *   shift / linked: the same sweep with NO margins   5226 / 5191 ms  ← RED
   *   linked: no row with depth produces nothing             3312 ms
   *   shift: no row with depth produces nothing              1969 ms
   *   shift / linked: no row changes without depth     1841 / 1607 ms
   *
   * The first pair timed out. The other four cleared 5s by less than 2×, and
   * the same four moved by up to 1.7× between two back-to-back full runs
   * (3312→2007, 1607→1208), so that margin is scheduling noise and not
   * headroom — which is why all six are raised together rather than only the
   * two seen red.
   *
   * This is a concurrency hazard, not a slow test. Alone on the same box the
   * six run in 338–932ms, and CI — which has the runner to itself — took
   * 1.95s for the slowest and 7.1s for the whole file (run 38804539248).
   *
   * What the raise costs: a genuine slowdown of several times over would no
   * longer turn this red. The numbers above are the reference for telling that
   * apart from a loaded machine — compare a suspect run against the 338–932ms
   * solo figures, never against the timeout.
   */
  const SWEEP_TIMEOUT_MS = 20_000

  // NO LEAKAGE. The real-content confirmation of PROPERTY 1: across three
  // committed scenes at four sample times, not one row without authored depth
  // changed. This is the positional-noise fix holding on content rather than on
  // a fixture, and it has to keep holding through the padding — edge extension
  // copies a row's own samples sideways and must not spread depth into a row
  // that had none.
  it.each(['shift', 'linked'] as const)('%s: no row changes without depth', async algorithm => {
    const rows = await sweep(algorithm, marginsOf(algorithm))
    report(`${algorithm} example rows leaked`,
      rows.map(r => `${r.label}:${r.leaked}`).join(' '))
    expect(rows.map(r => r.leaked)).toEqual(rows.map(() => 0))
  }, SWEEP_TIMEOUT_MS)

  // WAS `it.fails` — LIVE DEFECT #3, now fixed by the plate/stage split.
  //
  // The complement of the property above: a row that carries authored depth and
  // produces no signal at all has lost its content outright. Measured before
  // the split, both encoders: pacman at t=0.25s lost 62 of 80 rows, because
  // `move` brings it in from x=-60 and at that instant its whole visible
  // sliver sat inside the left dead zone, and scrolling-text at t=0.25 lost 94
  // of 104 rows under `linked`. A viewer did not see pacman slide in; they saw
  // it pop into existence once it cleared the dead-zone width.
  //
  // With the stage inset by the encoder's own margins the dead zone lies
  // entirely in emitted-but-dead plate columns, so nothing an author composed
  // can fall into it. The sibling test below keeps the pre-split numbers
  // measured, so this one cannot pass by being blind.
  it.each(['shift', 'linked'] as const)(
    '%s: no row with depth produces nothing', async algorithm => {
      const rows = await sweep(algorithm, marginsOf(algorithm))
      report(`${algorithm} example rows lost (padded)`,
        rows.filter(r => r.lost > 0).map(r => `${r.label}:${r.lost}/${r.depthRows}`).join(' ') || 'none')
      expect(rows.map(r => r.lost)).toEqual(rows.map(() => 0))
    }, SWEEP_TIMEOUT_MS)

  // The before/after, as a measurement rather than a comment. Keeps the defect
  // this fixed on the record and proves the probe above can fail: run the exact
  // same sweep with no margins and the committed examples lose whole bands of
  // rows.
  it.each(['shift', 'linked'] as const)(
    '%s: the same sweep with NO margins loses rows — the fix is what closed it',
    async algorithm => {
      const before = await sweep(algorithm, UNPADDED)
      const after = await sweep(algorithm, marginsOf(algorithm))
      report(`${algorithm} example rows lost (unpadded)`,
        before.filter(r => r.lost > 0).map(r => `${r.label}:${r.lost}/${r.depthRows}`).join(' ') || 'none')
      const total = (rs: typeof before) => rs.reduce((a, r) => a + r.lost, 0)
      report(`${algorithm} total rows lost, unpadded → padded`,
        `${total(before)} → ${total(after)}`)
      expect(total(before)).toBeGreaterThan(0)
      expect(total(after)).toBe(0)
    }, SWEEP_TIMEOUT_MS)

  // The calibration for `CONFIRM_SEEDS`, and the reason it is not a tolerance.
  // Two kinds of silence exist in this probe and they behave oppositely under a
  // seed change, so the sweep separates them rather than blurring them.
  it('dead-zone silence is seed-independent; thin-feature silence is not', async () => {
    const w = 400, h = 200
    const encodeAt = (seed: number) => encoderFor(opts('shift', seed))

    // (a) A full-height slab inside the unpadded dead zone: no in-range source
    // column exists, so every one of those columns is positional noise and is
    // bit-identical to the control at EVERY seed.
    const dead = new Float32Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < 40; x++) dead[y * w + x] = 1
    const deadSilent = [7, ...CONFIRM_SEEDS].map(s =>
      diffAgainstControl(encodeAt(s), dead, w, h).changed === 0)

    // (b) A 3px feature in the middle of the frame, which the encoder encodes
    // perfectly. Whether a given ROW of it leaves a colour mark is a coin flip
    // per pixel, so about `h / 2^3` rows go silent at any one seed — and a
    // *different* set of rows at each seed, which is why intersecting across
    // seeds drives the count to zero while the dead-zone count above stays put.
    const thin = new Float32Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 200; x < 203; x++) thin[y * w + x] = 0.3
    let surviving = Array.from({ length: h }, (_v, y) => y)
    const perSeed: number[] = []
    for (const s of [7, ...CONFIRM_SEEDS]) {
      const d = diffAgainstControl(encodeAt(s), thin, w, h)
      const silent = surviving.filter(y => !d.rows[y])
      perSeed.push([...d.rows].filter(v => v === 0).length)
      surviving = silent
    }

    report('dead-zone slab silent at each seed', deadSilent.join(','))
    report('3px mid-frame feature: silent rows per seed (of 200)', perSeed.join(','))
    report('3px mid-frame feature: rows silent at ALL 7 seeds', surviving.length)
    expect(deadSilent.every(Boolean)).toBe(true)
    // Silent at one seed: a real and sizeable population. Silent at all seven:
    // none. The first number is what a single-seed probe would have reported as
    // "lost content"; the second is the truth.
    expect(perSeed[0]!).toBeGreaterThan(5)
    expect(surviving).toEqual([])
  })

  it('a ball placed in the left dead zone DOES lose rows without margins', async () => {
    // The same probe, pointed at the geometry the examples used to have to
    // avoid. Without this, `lost === 0` above could mean the measurement is
    // blind rather than the content being safe. r=46 at cx=40 sits entirely
    // inside the 92px dead zone of the unpadded shift encoder — and entirely
    // inside the *stage* once the plate margins exist, which is the point.
    const w = 800, h = 300
    const scene: Scene = {
      size: [w, h],
      layers: [{ type: 'shape', shape: 'circle', r: 46, at: [40, 150], depth: 1 }],
    }
    const depth = await rasterDepth(scene, 0, canvas)
    const encode = encoderFor(opts('shift'))
    const want = rowsWithDepth(depth, w, h)
    const lostWith = (margins: Margins): number => {
      const plateW = margins.left + w + margins.right
      const diff = diffAgainstControl(encode, padDepth(depth, w, h, margins), plateW, h)
      let lost = 0
      for (let y = 0; y < h; y++) if (!diff.rows[y] && want[y]) lost++
      return lost
    }
    const bare = lostWith(UNPADDED)
    const padded = lostWith(marginsFor(SEP_FAR, 'shift'))
    report('shift: rows lost for a ball r=46 centred at x=40, unpadded → padded',
      `${bare}/${[...want].filter(Boolean).length} → ${padded}`)
    expect(bare).toBeGreaterThan(0)
    expect(padded).toBe(0)
  })
})
