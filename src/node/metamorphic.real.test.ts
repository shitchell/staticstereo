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
 * **Everything absolute here is reported, not asserted.** Font files differ
 * between this machine and CI, so a pinned median stroke width would be a test
 * of the runner's fontconfig. What is asserted are the relations: the metric
 * responds monotonically to the knobs an author has, and asking for a weight
 * heavier than `bold` buys nothing.
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
import { rasterDepth } from '../core/raster.js'
import { dominantPeriod, MIN_OVERLAP, rowOf } from '../core/analysis.js'
import {
  diffAgainstControl, encoderFor, median, report, rowsWithDepth, runLengths,
} from '../core/testing/metamorphic.js'
import type { Encoder } from '../core/testing/metamorphic.js'
import { DEFAULT_STEREO } from '../core/types.js'
import type { Scene, SirdsAlgorithm, SirdsOpts } from '../core/types.js'

const SEP_FAR = DEFAULT_STEREO.sepFar
const SEP_NEAR = DEFAULT_STEREO.sepNear
const BUDGET = SEP_FAR - SEP_NEAR

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
  return median(runLengths(depth, w, h, 0.5))
}

describe('feature size on real glyphs', () => {
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

  // The authoring trap behind defect #4: the weight knob saturates. Asserted as
  // "buys essentially nothing" rather than "is byte-identical", because whether
  // a 900 face exists is a property of the host's font stack and not of this
  // codebase. On this machine the two depth maps are identical to the pixel.
  it('a weight heavier than bold buys no extra stroke width', async () => {
    const pairs = await Promise.all([240, 360].map(async size => {
      const bold = await strokeMedian('STATIC', size, 'bold')
      const nine = await strokeMedian('STATIC', size, '900')
      return { size, bold, nine }
    }))
    report('bold vs 900 stroke median', pairs.map(p => `${p.size}: ${p.bold}/${p.nine}`).join(' '))
    for (const p of pairs) expect(p.nine).toBeLessThanOrEqual(p.bold * 1.05)
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
    // *horizontal* bar — the crossbar of a T, the top of an S — and those do
    // clear the floor. Measured on 150px bold "STATIC": median 13px, max
    // 114px, with only 1% of crossings at or above the floor. So a period
    // measurement aimed at text can succeed on a handful of rows and report
    // NaN on the other 99%, which is worse than failing outright.
    const w = 1400, h = 300
    const scene: Scene = {
      size: [w, h], layers: [{ type: 'text', text: 'STATIC', size: 150, weight: 'bold', at: [40, 60] }],
    }
    const depth = await rasterDepth(scene, 0, canvas)
    const runs = runLengths(depth, w, h, 0.5)
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

  /** Rows with depth vs rows that changed, for one scene at one time. */
  async function probe(file: string, seconds: number, encode: Encoder) {
    const scene = await loadScene(resolve(ROOT, 'examples', file))
    const [w, h] = scene.size
    const depth = await rasterDepth(scene, seconds, canvas)
    const diff = diffAgainstControl(encode, depth, w, h)
    const want = rowsWithDepth(depth, w, h)
    let leaked = 0, lost = 0
    for (let y = 0; y < h; y++) {
      if (diff.rows[y] && !want[y]) leaked++
      if (!diff.rows[y] && want[y]) lost++
    }
    return { w, h, leaked, lost, depthRows: [...want].filter(Boolean).length }
  }

  /** Every (example, time) pair, measured once per encoder. */
  async function sweep(algorithm: SirdsAlgorithm) {
    const encode = encoderFor(opts(algorithm))
    const out: { label: string; leaked: number; lost: number; depthRows: number; h: number }[] = []
    for (const file of EXAMPLES) {
      for (const seconds of TIMES) {
        const r = await probe(file, seconds, encode)
        out.push({ label: `${file.replace('.yaml', '')}@${seconds}`, ...r })
      }
    }
    return out
  }

  // NO LEAKAGE. The real-content confirmation of PROPERTY 1: across three
  // committed scenes at four sample times, not one row without authored depth
  // changed. This is the positional-noise fix holding on content rather than on
  // a fixture.
  it.each(['shift', 'linked'] as const)('%s: no row changes without depth', async algorithm => {
    const rows = await sweep(algorithm)
    report(`${algorithm} example rows leaked`,
      rows.map(r => `${r.label}:${r.leaked}`).join(' '))
    expect(rows.map(r => r.leaked)).toEqual(rows.map(() => 0))
  })

  // PENDING — LIVE DEFECT #3, on committed content.
  //
  // The complement: a row that carries authored depth and produces no signal at
  // all has lost its content outright. Measured, both encoders: pacman at
  // t=0.25s loses 62 of 80 rows, because `slide` brings it in from x=-60 and at
  // that instant its whole visible sliver is inside the left dead zone. A
  // viewer does not see it slide in; they see it pop into existence once it
  // clears the dead-zone width.
  //
  // `it.fails`, not a relaxed bound: the examples are correct YAML and the
  // encoder is losing their content. When the edge handling is fixed (the
  // plate/stage split the ball example's comment refers to), this goes red and
  // becomes an ordinary guard.
  it.fails.each(['shift', 'linked'] as const)(
    '%s: no row with depth produces nothing [PENDING: live defect]', async algorithm => {
      const rows = await sweep(algorithm)
      report(`${algorithm} example rows lost`,
        rows.filter(r => r.lost > 0).map(r => `${r.label}:${r.lost}/${r.depthRows}`).join(' ') || 'none')
      expect(rows.map(r => r.lost)).toEqual(rows.map(() => 0))
    })

  it('a ball placed in the left dead zone DOES lose rows — the probe is not vacuous', async () => {
    // The same probe, pointed at the geometry the examples deliberately avoid.
    // Without this, `lost === 0` above could mean the measurement is blind
    // rather than the content being safe. r=46 at cx=40 sits entirely inside
    // the 92px dead zone of the shift encoder.
    const w = 800, h = 300
    const scene: Scene = {
      size: [w, h],
      layers: [{ type: 'shape', shape: 'circle', r: 46, at: [40, 150], depth: 1 }],
    }
    const depth = await rasterDepth(scene, 0, canvas)
    const encode = encoderFor(opts('shift'))
    const diff = diffAgainstControl(encode, depth, w, h)
    const want = rowsWithDepth(depth, w, h)
    let lost = 0
    for (let y = 0; y < h; y++) if (!diff.rows[y] && want[y]) lost++
    report('shift: rows lost for a ball r=46 centred at x=40',
      `${lost}/${[...want].filter(Boolean).length}`)
    expect(lost).toBeGreaterThan(0)
  })
})
