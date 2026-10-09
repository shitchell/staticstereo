/**
 * Metamorphic / property regression suite for the stereogram encoders.
 *
 * ## What this suite is for
 *
 * Five real defects reached a render and were found by a human looking at it.
 * The 500-odd tests that existed missed all five, and the reason is structural
 * rather than careless: they assert *examples* ("a slab at x=300 measures
 * sepNear") and every one of the five was a *relation* between renders — this
 * feature reached further than it should, that feature produced no signal, this
 * row moved when a different row changed.
 *
 * So nothing here asserts a value of the output. Every test asserts a relation
 * between two or more renders, or between a render and the geometry it came
 * from. The properties are written to be ignorant of the five known defects:
 * each one is a statement about what a depth-to-dots encoder must do, and the
 * known defects are simply what it currently catches.
 *
 * ## Honest status, up front
 *
 * Four tests here, and two more in `src/node/metamorphic.real.test.ts`, are
 * **red on purpose** and marked `it.fails`. They cover two live, unfixed
 * defects of the default `'shift'` encoder — unbounded rightward propagation
 * and left-edge depth loss — stated as four separate bounds because the two
 * defects have four distinct consequences (raw reach, fusible ghost echoes,
 * dead-zone width, dead-zone asymmetry) and a partial fix should move them
 * independently.
 *
 * `it.fails` inverts the result, so the suite is green today *and goes red the
 * moment any of those bounds starts being met* — at which point the marker is
 * deleted and the property becomes an ordinary guard. Three of the four bounds
 * are already met by `'linked'` in the sibling tests immediately below each
 * one, which is the evidence that they are achievable rather than aspirational.
 * A suite tuned to green by weakening them would be worth nothing.
 *
 * The `'linked'` encoder is run through every property alongside `'shift'`,
 * because a property that only one implementation satisfies is usually a
 * description of that implementation.
 *
 * ## Instruments
 *
 * See `testing/metamorphic.ts` for the three (control diff, autocorrelation,
 * coherent-column structure), what each can see, and the colour-is-a-gauge trap
 * that makes a raw pixel diff the wrong instrument for anything perceptual.
 *
 * ## Proof that these can fail
 *
 * `sequentialShift` below is a local copy of the encoder as it was *before* the
 * positional-noise fix: one sequential PRNG stream for the whole image. It is
 * not imported from `sirds.ts` and does not affect it. Every property that
 * claims to catch the row-desynchronisation defect is re-run against it and
 * shown to go red. The two live defects are evidenced by their own measured
 * numbers, reported in the log.
 */
import { describe, expect, it } from 'vitest'
import { dominantPeriod, rowOf, MIN_OVERLAP } from './analysis.js'
import {
  agreement, coherentColumns, columnFootprint, deadZones, depthColumns, diffAgainstControl,
  discDepth, encoderFor, flatDepth, fmtRuns, median, missingColumns, pointDepth, principalRun,
  randomDepth, reachFrom, report, rowsChangedByHeight, rowsContaminatedByOtherRows,
  rowsWithDepth, runLengths, runsOf, slabDepth, spuriousRuns,
} from './testing/metamorphic.js'
import type { Encoder } from './testing/metamorphic.js'
import { DEFAULT_STEREO } from './types.js'
import type { SirdsAlgorithm, SirdsOpts } from './types.js'

const SEP_FAR = DEFAULT_STEREO.sepFar   // 110
const SEP_NEAR = DEFAULT_STEREO.sepNear // 92
/** The whole depth budget, and the width below which a feature cannot fuse. */
const BUDGET = SEP_FAR - SEP_NEAR       // 18

const ALGORITHMS: readonly SirdsAlgorithm[] = ['shift', 'linked']

function opts(algorithm: SirdsAlgorithm, seed = 7): SirdsOpts {
  return { sepFar: SEP_FAR, sepNear: SEP_NEAR, cross: false, seed, algorithm }
}

/**
 * Where each encoder puts a feature's encoded signal, relative to the depth
 * columns that asked for it.
 *
 * Not a tolerance and not folklore — `coherent column offset is exact` below
 * measures these from the output and would fail if either changed. `shift`
 * links `x` to `x - sep`, so the coherent pair starts at `x - sepNear`;
 * `linked` links `x - sep/2` to `x + sep/2`, so it starts at `x - sepNear/2`.
 */
const SIGNAL_OFFSET: Record<SirdsAlgorithm, number> = {
  shift: -SEP_NEAR,
  linked: -(SEP_NEAR >> 1),
}

/* ------------------------------------------------------- broken encoder */

/**
 * The encoder as it was before the positional-noise fix: **one sequential PRNG
 * stream for the whole image**, drawn from only where `x < sep`.
 *
 * A row therefore consumed exactly `sep` numbers, and `sep` depends on that
 * row's own depth, so changing any row re-phased the stream for every row
 * below it. Shaun hit it in the browser: with `freezeNoise` on, a marquee's
 * background held still until the text reached the left edge, then "the entire
 * bottom half of the screen started moving" — 0 rows below the text band
 * changed at frame 40 and 259 changed at frame 41, the frame the text entered
 * the `sepFar = 110` seed strip.
 *
 * Kept here, local to the test file, purely so the row-locality properties can
 * be watched going red. It is a copy, not an import; `sirds.ts` is untouched.
 */
function sequentialShift(depth: Float32Array, w: number, h: number, o: SirdsOpts): Uint8Array {
  const out = new Uint8Array(w * h)
  const range = o.sepFar - o.sepNear
  let s = (o.seed >>> 0) || 0x9e3779b9
  const rnd = (): number => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let y = 0; y < h; y++) {
    const base = y * w
    for (let x = 0; x < w; x++) {
      const i = base + x
      const raw = o.cross ? 1 - depth[i]! : depth[i]!
      const z = raw < 0 ? 0 : raw > 1 ? 1 : raw
      let sep = Math.round(o.sepFar - z * range)
      if (sep < 2) sep = 2
      if (sep > w - 1) sep = w - 1
      const src = x - sep
      out[i] = src >= 0 ? out[base + src]! : rnd() < 0.5 ? 0 : 255
    }
  }
  return out
}

const brokenRowOrder: Encoder = (d, w, h) => sequentialShift(d, w, h, opts('shift'))

/* ----------------------------------------------------------- shared probe */

const BAND_W = 600
const BAND_H = 24

/**
 * Depth in rows 8..15 only, spanning columns 40..239.
 *
 * The column span is not arbitrary and is the difference between a probe that
 * works and one that does not. It **straddles the leftmost `sepFar` px**,
 * because that is the only region where the sequential-PRNG defect was
 * observable: the leak needed a row's random-draw count to change, and a row
 * draws only where `x < sep`. The same band placed at columns 200..399 is
 * encoded identically by the broken and the fixed encoder, and a probe written
 * there reports the defect as absent (verified — it was the first version of
 * this test).
 */
function depthBand(): Float32Array {
  const d = new Float32Array(BAND_W * BAND_H)
  for (let y = 8; y < 16; y++) for (let x = 40; x < 240; x++) d[y * BAND_W + x] = 1
  return d
}

/* ====================================================================== */
/* PROPERTY 1 — ROW LOCALITY                                              */
/* ====================================================================== */

/**
 * A row's output is a pure function of its own depth row and its `y`.
 *
 * The most valuable half of locality, and the one that is a genuine invariant
 * for *any* encoder: rows of a stereogram are independent by construction, the
 * disparity is purely horizontal, and an encoder that leaks across rows has
 * hidden state. It is also the half that is invisible in a still and
 * catastrophic in an animation.
 *
 * Three probes, in increasing strength. The ordering matters, because the weak
 * one is the one most people would write and it does not work.
 */
describe.each(ALGORITHMS)('P1 row locality (%s)', algorithm => {
  const encode = encoderFor(opts(algorithm))

  it('a single near pixel changes no other row — at any x, including the seed strip', () => {
    const W = 800, H = 16
    const vertical: string[] = []
    let observed = 0
    for (const x0 of [10, 50, 100, 109, 110, 200, 600]) {
      for (let seed = 1; seed <= 6; seed++) {
        const enc = encoderFor(opts(algorithm, seed))
        const r = reachFrom(diffAgainstControl(enc, pointDepth(W, H, x0, 2), W, H), x0, 2)
        if (r.changed === 0) continue // silent perturbation; see Reach's docs
        observed++
        vertical.push(`x${x0}s${seed}:${r.up}/${r.down}`)
        expect(r.up, `up-reach at x=${x0} seed=${seed}`).toBe(0)
        expect(r.down, `down-reach at x=${x0} seed=${seed}`).toBe(0)
      }
    }
    report(`${algorithm} 1px vertical reach up/down (n=${observed})`, vertical.slice(0, 8).join(' '))
    // Guard against a vacuous pass: half of all single-pixel perturbations are
    // silent (see `Reach`), and a probe that happened to be silent everywhere
    // would assert nothing at all.
    expect(observed).toBeGreaterThan(10)
  })

  // STRONGEST PROBE, and the one to copy. Replacing every *other* row with
  // noise is what makes it unconditional: the sequential defect only fired when
  // a row's draw count changed, which needed depth inside the leftmost sepFar
  // px. Measured on the broken encoder: a single near pixel at x=100
  // propagates to every row below it, and the same pixel at x=110 propagates
  // to none. A probe that pokes the middle of the frame reports the bug as
  // absent.
  it('a row is unchanged when every other row is replaced with noise', () => {
    const W = 300, H = 8
    const bad = rowsContaminatedByOtherRows(encode, slabDepth(W, H, 50, 100), W, H)
    report(`${algorithm} rows contaminated by other rows`, `${bad.length}/${H}`)
    expect(bad).toEqual([])
  })

  it('a row is unchanged by the image height', () => {
    const W = 200
    const bad = rowsChangedByHeight(
      encode, h => slabDepth(W, h, 40, 90), W, 3, 9)
    report(`${algorithm} rows changed by height 3→9`, `${bad.length}/3`)
    expect(bad).toEqual([])
  })

  // The shape the coordinator independently confirmed on the committed example
  // scenes: rows-that-changed must be exactly rows-that-carry-depth. Stated as
  // a set equality rather than a bound, so it fails in both directions — a row
  // that changed without depth is leakage, and a row with depth that did not
  // change is lost content.
  it('rows that changed are exactly the rows that carry depth', () => {
    const d = depthBand()
    const diff = diffAgainstControl(encode, d, BAND_W, BAND_H)
    const want = rowsWithDepth(d, BAND_W, BAND_H)
    report(`${algorithm} rows depth/changed`,
      `${[...want].filter(Boolean).length}/${[...diff.rows].filter(Boolean).length}`)
    expect(Array.from(diff.rows)).toEqual(Array.from(want))
  })
})

describe('P1 proof of failure — sequential PRNG', () => {
  it('goes red on the "other rows are noise" probe', () => {
    const W = 300, H = 8
    const bad = rowsContaminatedByOtherRows(brokenRowOrder, slabDepth(W, H, 50, 100), W, H)
    report('sequential rows contaminated by other rows', `${bad.length}/${H} → ${JSON.stringify(bad)}`)
    expect(bad.length).toBeGreaterThan(0)
  })

  it('goes red on the "rows changed == rows with depth" probe', () => {
    const d = depthBand()
    const diff = diffAgainstControl(brokenRowOrder, d, BAND_W, BAND_H)
    const want = rowsWithDepth(d, BAND_W, BAND_H)
    const spurious = [...diff.rows].filter((v, y) => v === 1 && !want[y]).length
    report('sequential rows changed without depth', `${spurious}/${BAND_H}`)
    expect(spurious).toBeGreaterThan(0)
    expect(Array.from(diff.rows)).not.toEqual(Array.from(want))
  })

  it('goes red on the "single pixel changes no other row" probe — but only inside the seed strip', () => {
    const W = 800, H = 16
    const measured: string[] = []
    for (const x0 of [100, 110]) {
      const r = reachFrom(diffAgainstControl(brokenRowOrder, pointDepth(W, H, x0, 2), W, H), x0, 2)
      measured.push(`x=${x0} down=${r.down} changed=${r.changed}`)
    }
    report('sequential 1px vertical reach', measured.join(' | '))
    // x=100 is inside sepFar, so that row's draw count drops and every row
    // below it re-phases. x=110 is not, so the defect is invisible there —
    // which is exactly why the strong probe above exists.
    const inside = reachFrom(diffAgainstControl(brokenRowOrder, pointDepth(W, H, 100, 2), W, H), 100, 2)
    expect(inside.down).toBeGreaterThan(0)
    const outside = reachFrom(diffAgainstControl(brokenRowOrder, pointDepth(W, H, 110, 2), W, H), 110, 2)
    expect(outside.down).toBe(0)
  })

  it('still satisfies height independence — so that probe alone is not enough', () => {
    // A deliberately recorded gap. Height independence is the probe that
    // `sirds.test.ts` already had, and the sequential encoder passes it,
    // because adding rows below does not change the stream phase of the rows
    // above. It is necessary and nowhere near sufficient.
    const W = 200
    const bad = rowsChangedByHeight(brokenRowOrder, h => slabDepth(W, h, 40, 90), W, 3, 9)
    report('sequential rows changed by height 3→9', `${bad.length}/3`)
    expect(bad).toEqual([])
  })
})

/* ====================================================================== */
/* PROPERTY 2 — HORIZONTAL LOCALITY (raw colour reach)                    */
/* ====================================================================== */

/**
 * How far a one-pixel depth change moves pixels, horizontally.
 *
 * **This is where the framing needed correcting.** "Perturbing the depth at one
 * pixel should change the output only within a bounded neighbourhood" is a
 * correctness property for `'shift'` and *not* for `'linked'`, and the
 * difference is not a matter of degree.
 *
 * `'shift'` is a leftward copy, so its colour assignment is causal and local by
 * construction; unbounded reach in it is a real defect. `'linked'` resolves
 * equivalence classes and then colours each class, so colour is a **global
 * gauge**: linking one new pair merges two classes and repaints the whole
 * losing chain, which can extend to either frame edge. Measured below at 724px
 * left and 706px right from a single pixel. That is not ghosting and a viewer
 * cannot see it — random dots recoloured are still random dots. Asserting a
 * raw-reach bound on `'linked'` would be asserting a bug that does not exist.
 *
 * The property that *is* shared, and is the perceptual one, is PROPERTY 3.
 */
describe('P2 horizontal locality (raw colour reach)', () => {
  const W = 1600, H = 16

  /** Reach of a full-height 1px column of near depth, which is never silent. */
  function reachAt(algorithm: SirdsAlgorithm, x0: number) {
    const encode = encoderFor(opts(algorithm))
    return reachFrom(diffAgainstControl(encode, slabDepth(W, H, x0, x0 + 1), W, H), x0, 0)
  }

  it('shift never changes anything to the LEFT of the perturbation', () => {
    const lefts = [200, 800, 1400].map(x => reachAt('shift', x).left)
    report('shift leftward reach at x=200/800/1400', lefts)
    expect(lefts).toEqual([0, 0, 0])
  })

  // PENDING — LIVE DEFECT #1, unbounded rightward propagation.
  //
  // `out[x] = out[x - sep(x)]` makes every pixel a copy of one to its left, so
  // a depth change rewrites pixels all the way to the right edge.
  //
  // Be clear about what the bound rests on: **no encoder in this repo meets
  // it**, including `'linked'`, which violates it in both directions for the
  // gauge reason above. It is justified by the structure of `'shift'` alone — a
  // strictly causal leftward copy has no reason to propagate a local change
  // beyond one period — and the perceptually meaningful version of the same
  // claim, the one `'linked'` does satisfy, is PROPERTY 3. Kept because the raw
  // reach is the cheapest possible detector for a *new* encoder that smears,
  // and because the number it reports (770px from one pixel) is the defect's
  // magnitude in the plainest available terms.
  it.fails('shift keeps a 1px depth change within sepFar px [PENDING: live defect]', () => {
    const measured = [200, 800, 1400].map(x => `x${x}:${reachAt('shift', x).right}`)
    report('shift rightward reach at x=200/800/1400 (bound would be 110)', measured.join(' '))
    for (const x0 of [200, 800, 1400]) {
      expect(reachAt('shift', x0).right).toBeLessThanOrEqual(SEP_FAR)
    }
  })

  it('shift rightward reach currently runs to the frame edge, and the frame width sets it', () => {
    // The pinned magnitude of the same defect, so a partial fix is visible as a
    // number rather than only as a flipped `it.fails`. Reach grows with the
    // frame, which is the signature of unbounded propagation as opposed to a
    // fixed-size halo.
    const narrow = reachFrom(
      diffAgainstControl(encoderFor(opts('shift')), slabDepth(800, H, 200, 201), 800, H), 200, 0)
    const wide = reachAt('shift', 200)
    report('shift rightward reach at x=200, W=800 vs W=1600', `${narrow.right} → ${wide.right}`)
    expect(wide.right).toBeGreaterThan(narrow.right + 500)
    expect(wide.right).toBeGreaterThan(W - 200 - 2 * SEP_FAR)
  })

  it('linked raw reach is unbounded in BOTH directions — gauge, not ghosting', () => {
    // Recorded as a measurement, not asserted as good or bad. Its perceptual
    // consequence is nil and PROPERTY 3 is what proves that; what this pins is
    // that raw-reach locality must never be asserted for this encoder, so
    // nobody "fixes" the suite by adding it.
    const r = reachAt('linked', 800)
    report('linked raw reach from x=800 (left/right)', `${r.left}/${r.right}`)
    expect(r.left).toBeGreaterThan(SEP_FAR)
    expect(r.right).toBeGreaterThan(SEP_FAR)
  })
})

/* ====================================================================== */
/* PROPERTY 3 — NO SPURIOUS NEAR-PERIOD STRUCTURE (the ghost detector)    */
/* ====================================================================== */

/**
 * Outside a feature's own footprint, the image must carry no fusible
 * near-depth structure.
 *
 * This is the perceptual form of locality and the single most valuable property
 * in the suite, because it is stated in the terms a viewer actually resolves and
 * it needs no knowledge of either defect to catch #1.
 *
 * It also explains why five hundred tests missed the ghost. Downstream of a
 * near slab the `sepFar` wallpaper is **perfectly** intact — measured agreement
 * 1.000, so `dominantPeriod` happily reports `sepFar` at score 1.000 — while an
 * 18px-wide band of `sepNear` structure has been replicated into it every
 * `sepFar` px to the right edge. Nothing that looks at one offset can see that.
 *
 * The width criterion ties this property to PROPERTY 5: a spurious band
 * narrower than the disparity budget cannot be fused, so it is not an artifact.
 * `'shift'`'s echoes are exactly `BUDGET` px wide — right at the threshold,
 * which is why Shaun could see them. `'linked'`'s are 1px.
 */
describe('P3 spurious near-period structure', () => {
  const W = 1600, H = 24
  const SLAB: readonly [number, number] = [600, 800]

  function structure(algorithm: SirdsAlgorithm) {
    const encode = encoderFor(opts(algorithm))
    const img = encode(slabDepth(W, H, SLAB[0], SLAB[1]), W, H)
    const control = encode(flatDepth(W, H), W, H)
    const cols = coherentColumns(img, W, H, SEP_NEAR)
    const runs = runsOf(cols)
    return {
      img, control, runs,
      principal: principalRun(runs),
      spurious: spuriousRuns(runs),
      controlHits: [...coherentColumns(control, W, H, SEP_NEAR)].filter(Boolean).length,
    }
  }

  it.each(ALGORITHMS)('%s: the control carries no near-period structure at all', algorithm => {
    // The instrument's own calibration. Without this the counts below could be
    // measuring the dot field's chance coincidences rather than the encoder.
    const { controlHits } = structure(algorithm)
    report(`${algorithm} control coherent columns at sepNear (expect 0)`, controlHits)
    expect(controlHits).toBe(0)
  })

  // PENDING — LIVE DEFECT #1 again, this time in the form a viewer sees it.
  //
  // Measured: a 200px slab leaves its true 200px footprint plus ~11 further
  // runs of exactly 18px, spaced sepFar apart, out to the frame edge. 18px is
  // the whole disparity budget, i.e. a feature exactly wide enough to fuse, so
  // each echo is a visible phantom plate. `'linked'` passes this with 1px runs.
  it.fails('shift leaves no fusible near-period structure outside the footprint [PENDING: live defect]', () => {
    const { principal, spurious } = structure('shift')
    report('shift footprint',
      `${principal?.start}-${principal?.end}(${principal?.length})`)
    report(`shift spurious near-period runs (${spurious.length})`, fmtRuns(spurious))
    const widest = spurious[0]?.length ?? 0
    report('shift widest spurious run vs budget', `${widest} vs ${BUDGET}`)
    expect(widest).toBeLessThan(BUDGET)
  })

  it('shift spurious echoes are exactly BUDGET px wide and repeat every sepFar, to the edge', () => {
    // The pinned characterisation of the defect. Each assertion is a separate
    // claim about its mechanism, so a partial fix shows up as which one broke.
    const { spurious } = structure('shift')
    const widths = new Set(spurious.map(r => r.length))
    const gaps = spurious.slice(1).map((r, i) => r.start - spurious[i]!.start)
    report('shift echo widths / gaps', `${[...widths].join(',')} / ${[...new Set(gaps)].join(',')}`)
    const last = spurious[spurious.length - 1]!
    report('shift echo count and last column', `${spurious.length} echoes, last ends at ${last.end} of ${W}`)
    expect([...widths]).toEqual([BUDGET])
    expect([...new Set(gaps)]).toEqual([SEP_FAR])
    // Scale-free statement of "to the edge": the echoes fill the available
    // space, so the last one lands within one period of the right margin. A
    // hardcoded count would only be true at this frame width.
    expect(spurious.length).toBe(Math.floor((W - SLAB[1]) / SEP_FAR))
    expect(W - last.end).toBeLessThan(SEP_FAR + SEP_NEAR)
  })

  it('linked leaves only sub-fusible (1px) spurious structure', () => {
    const { principal, spurious } = structure('linked')
    const widest = spurious[0]?.length ?? 0
    report('linked footprint', `${principal?.start}-${principal?.end}(${principal?.length})`)
    report(`linked spurious runs (${spurious.length}), widest`, `${widest} vs budget ${BUDGET}`)
    // Not zero, and that is worth stating plainly: resolving the equivalence
    // classes does produce isolated columns elsewhere that happen to agree at
    // sepNear, spaced sepFar apart, upstream as well as downstream. They are
    // 1px wide against an 18px fusion threshold, so they are not artifacts —
    // but the honest claim is "sub-fusible", not "none".
    expect(widest).toBeLessThan(BUDGET)
    expect(widest).toBeLessThanOrEqual(2)
  })

  it('the naive check is blind to this: far-period agreement is 1.000 downstream of the ghost', () => {
    // A test whose job is to document why the existing suite passed. If this
    // ever stops being 1.000, the ghost became visible to period analysis and
    // the comment above it is out of date.
    const { img } = structure('shift')
    const far: string[] = []
    for (let x = SLAB[1] + 200; x + 200 <= W; x += 200) {
      far.push(agreement(img, W, H, x, x + 200, SEP_FAR).toFixed(3))
    }
    report('shift far-period agreement in bands right of the slab', far.join(' '))
    expect(far.every(v => v === '1.000')).toBe(true)
  })

  it('and the aggregate near-period agreement does see it', () => {
    // The cheaper, lower-resolution version of this property: near-period
    // agreement per band against the control's chance baseline. Useful because
    // it degrades gracefully on ragged real content where `coherentColumns`
    // needs full-height features.
    const { img, control } = structure('shift')
    const rows: string[] = []
    let worst = 0
    for (let x = SLAB[1] + 200; x + 200 <= W; x += 200) {
      const a = agreement(img, W, H, x, x + 200, SEP_NEAR)
      const c = agreement(control, W, H, x, x + 200, SEP_NEAR)
      worst = Math.max(worst, a - c)
      rows.push(`${a.toFixed(3)}/${c.toFixed(3)}`)
    }
    report('shift near-period agreement img/control, bands right of slab', rows.join(' '))
    report('shift worst near-period excess over chance', worst.toFixed(3))
    expect(worst).toBeGreaterThan(0.05)
  })

  it('the same aggregate is at chance for linked', () => {
    const { img, control } = structure('linked')
    let worst = 0
    const rows: string[] = []
    for (let x = 0; x + 200 <= W; x += 200) {
      if (x < SLAB[1] + 100 && x + 200 > SLAB[0] - 100) continue // the feature's own band
      const a = agreement(img, W, H, x, x + 200, SEP_NEAR)
      const c = agreement(control, W, H, x, x + 200, SEP_NEAR)
      worst = Math.max(worst, a - c)
      rows.push(`${a.toFixed(3)}/${c.toFixed(3)}`)
    }
    report('linked near-period agreement img/control, bands away from slab', rows.join(' '))
    report('linked worst near-period excess over chance', worst.toFixed(3))
    expect(worst).toBeLessThan(0.05)
  })

  it('the sequential-PRNG encoder fails this too, for the same reason', () => {
    // Proof the property is not accidentally coupled to the positional noise:
    // the ghost is a property of the shift recurrence, and swapping the noise
    // source does not touch it.
    const img = brokenRowOrder(slabDepth(W, H, SLAB[0], SLAB[1]), W, H)
    const widest = spuriousRuns(runsOf(coherentColumns(img, W, H, SEP_NEAR)))[0]?.length ?? 0
    report('sequential widest spurious run', `${widest} vs budget ${BUDGET}`)
    expect(widest).toBeGreaterThanOrEqual(BUDGET)
  })
})

/* ====================================================================== */
/* PROPERTY 4 — COMPLETENESS: footprint vs intended geometry              */
/* ====================================================================== */

/**
 * Every depth feature in the content area must produce a measurable signal, in
 * the right place, with no holes.
 *
 * The three failure modes this separates, which a single "it changed" assertion
 * conflates:
 *
 * - **wrong place** — the signal's offset from the depth columns. Measured, not
 *   assumed; the two encoders differ by `sepNear/2` and a test that hardcodes
 *   one of them is pinning an implementation.
 * - **holes** — intended columns with no signal while their neighbours have one.
 * - **dead zones** — a band at a frame edge where a feature produces nothing at
 *   all. This is defect #3, and the bound is principled rather than observed:
 *   a symmetric-pair construction forces a loss of `sep/2` at each edge, so
 *   `sepFar/2` is the best any encoder can do and anything worse is discarding
 *   depth it could have expressed.
 */
describe('P4 completeness', () => {
  const W = 1600, H = 24

  it.each(ALGORITHMS)('%s: the coherent-column offset is exact and holds across the frame', algorithm => {
    const encode = encoderFor(opts(algorithm))
    const measured: string[] = []
    for (const x0 of [300, 700, 1100]) {
      const width = 200
      const cols = coherentColumns(encode(slabDepth(W, H, x0, x0 + width), W, H), W, H, SEP_NEAR)
      const p = principalRun(runsOf(cols))!
      measured.push(`x${x0}: ${p.start}-${p.end} len=${p.length} offset=${p.start - x0}`)
      expect(p.length, `footprint width at x=${x0}`).toBe(width)
      expect(p.start - x0, `offset at x=${x0}`).toBe(SIGNAL_OFFSET[algorithm])
    }
    report(`${algorithm} footprint of a 200px slab`, measured.join(' | '))
  })

  it.each(ALGORITHMS)('%s: an interior feature has no holes in its footprint', algorithm => {
    const encode = encoderFor(opts(algorithm))
    const d = slabDepth(W, H, 700, 900)
    const cols = coherentColumns(encode(d, W, H), W, H, SEP_NEAR)
    const { counts } = depthColumns(d, W, H)
    const { missing, intended } = missingColumns(counts, cols, SIGNAL_OFFSET[algorithm], H)
    report(`${algorithm} interior slab columns missing a signal`, `${missing.length}/${intended}`)
    expect(missing).toEqual([])
  })

  /**
   * Dead-zone sweep. 8px probe stepped 4px in from each edge; the dead zone is
   * the furthest-in position that still produces no signal anywhere.
   */
  const DEAD = Object.fromEntries(ALGORITHMS.map(a => [
    a, deadZones(encoderFor(opts(a)), 800, 16, SEP_NEAR, { probeW: 8, limit: 160, step: 4 }),
  ])) as Record<SirdsAlgorithm, { left: number; right: number }>

  it.each(ALGORITHMS)('%s: dead zones, measured', algorithm => {
    report(`${algorithm} dead zone left/right px`,
      `${DEAD[algorithm].left}/${DEAD[algorithm].right}`)
    expect(DEAD[algorithm].left + DEAD[algorithm].right).toBeGreaterThan(0) // both lose some
  })

  // PENDING — LIVE DEFECT #3, left-edge depth loss.
  //
  // `shift` has no source column for `x < sep`, so it discards the depth there
  // outright: measured 92px of dead zone on the left and 0 on the right. A ball
  // of radius 60 centred at x=80 loses its left 72px and fuses as a crescent.
  // `linked` meets the bound at 44/44.
  it.fails('shift loses no more than sepFar/2 at either edge [PENDING: live defect]', () => {
    report('shift dead zone vs bound',
      `${DEAD.shift.left}/${DEAD.shift.right} vs ${SEP_FAR / 2}`)
    expect(DEAD.shift.left).toBeLessThanOrEqual(SEP_FAR / 2)
    expect(DEAD.shift.right).toBeLessThanOrEqual(SEP_FAR / 2)
  })

  // PENDING — the same defect in the form that actually produces the crescent.
  // Total loss is not the problem; `linked` loses 88px in total and `shift`
  // loses 92. The problem is that `shift` takes it all off one side, so a
  // symmetric object near an edge is encoded asymmetrically.
  it.fails('shift loses depth symmetrically at the two edges [PENDING: live defect]', () => {
    const skew = Math.abs(DEAD.shift.left - DEAD.shift.right)
    report('shift dead-zone asymmetry', `${skew}px (linked: ${Math.abs(DEAD.linked.left - DEAD.linked.right)}px)`)
    expect(skew).toBeLessThanOrEqual(8) // one probe width
  })

  it('linked meets both edge bounds', () => {
    report('linked dead zone left/right', `${DEAD.linked.left}/${DEAD.linked.right}`)
    expect(DEAD.linked.left).toBeLessThanOrEqual(SEP_FAR / 2)
    expect(DEAD.linked.right).toBeLessThanOrEqual(SEP_FAR / 2)
    expect(Math.abs(DEAD.linked.left - DEAD.linked.right)).toBeLessThanOrEqual(8)
  })

  /**
   * The witness for the general property above, on the geometry that produced
   * the original observation: a disc of radius 60 at x=80 against the same disc
   * at x=560. Kept because the number is the one a human saw, and because it
   * shows the general property and the bespoke observation agree.
   */
  it('witness: a disc at the left edge loses most of its body columns (shift)', () => {
    const CW = 800, CH = 160
    const encode = encoderFor(opts('shift'))
    const measured: string[] = []
    const lost: Record<number, number> = {}
    for (const cx of [80, 560]) {
      const d = discDepth(CW, CH, cx, 80, 60)
      const diff = diffAgainstControl(encode, d, CW, CH)
      const { counts, first, last } = depthColumns(d, CW, CH)
      // minPixels = 4: the extreme columns of a disc are one or two pixels
      // tall, and whether a single pixel leaves a mark is a coin flip on the
      // seed. Scoring those as lost depth makes a correct encoder red half
      // the time.
      const { missing, intended } = missingColumns(counts, diff.columns, 0, 4)
      lost[cx] = missing.length
      measured.push(`cx=${cx}: intended [${first},${last}], ` +
        `encoded from ${columnFootprint(diff).first}, lost ${missing.length}/${intended}`)
    }
    report('shift disc r=60 completeness', measured.join(' | '))
    expect(lost[560]).toBe(0)
    expect(lost[80]).toBeGreaterThan(60)
  })
})

/* ====================================================================== */
/* PROPERTY 5 — FEATURE SIZE                                              */
/* ====================================================================== */

/**
 * A feature narrower than the disparity budget cannot be fused, so it must be
 * caught on the **depth map** — it is not detectable in the output.
 *
 * That last clause is the finding, and it took three failed attempts to reach.
 * The intuition was that a too-thin feature would encode weakly and show up as
 * a degraded period measurement. It does not:
 *
 * - The encoded footprint of a 1px feature is exactly 1px wide and perfectly
 *   coherent (measured below). The encoder loses nothing; the *viewer* cannot
 *   recover it, because at a budget of `B` px the two monocular images of a
 *   feature narrower than `B` do not overlap in background-registered
 *   coordinates, so there is no unambiguous correspondence to fuse.
 * - Far-period agreement over the frame declines perfectly smoothly with
 *   feature width — 0.993 at 8px, 0.985 at 18px, 0.963 at 40px — with no knee
 *   anywhere near the budget. There is no threshold in the image to find.
 * - `dominantPeriod` cannot even be pointed at a sub-budget feature: it needs
 *   `lo + MIN_OVERLAP` samples of uniform depth to return anything, which is
 *   108px for `sepNear`. Everything in the 18–108px band is perceptible but
 *   unmeasurable by autocorrelation.
 *
 * So the automatable form of this rule is an **authoring check**: measure the
 * depth map's horizontal run lengths and warn when the median is below the
 * budget. `src/node/metamorphic.real.test.ts` runs it on real rasterised
 * glyphs, which is where the rule earns its keep.
 */
describe('P5 feature size', () => {
  it('the run-length metric recovers known widths exactly', () => {
    // The metric's own unit test. Without it, a measurement of real glyphs
    // means nothing.
    const W = 400, H = 3
    const d = new Float32Array(W * H)
    for (const [x0, wid] of [[10, 3], [50, 18], [100, 57]] as const) {
      for (let y = 0; y < H; y++) for (let x = x0; x < x0 + wid; x++) d[y * W + x] = 1
    }
    const runs = runLengths(d, W, H, 0.5)
    report('run lengths of bars 3/18/57 over 3 rows', runs)
    expect(runs.sort((a, b) => a - b)).toEqual([3, 3, 3, 18, 18, 18, 57, 57, 57])
    expect(median([3, 18, 57])).toBe(18)
  })

  it.each(ALGORITHMS)('%s: a sub-budget feature IS encoded, faithfully — the limit is perceptual', algorithm => {
    const W = 800, H = 24
    const encode = encoderFor(opts(algorithm))
    const measured: string[] = []
    for (const width of [1, 2, 4, 8, BUDGET]) {
      const cols = coherentColumns(encode(slabDepth(W, H, 400, 400 + width), W, H), W, H, SEP_NEAR)
      const p = principalRun(runsOf(cols))
      measured.push(`w=${width}→${p?.length ?? 0}`)
      expect(p?.length, `encoded footprint of a ${width}px feature`).toBe(width)
    }
    report(`${algorithm} intended vs encoded footprint width`, measured.join(' '))
  })

  it('there is no knee in the output at the budget — so the rule cannot live there', () => {
    const W = 600, H = 8
    const encode = encoderFor(opts('shift'))
    const curve: string[] = []
    const vals: number[] = []
    for (const width of [4, 8, 14, 18, 22, 30, 40, 60]) {
      const a = agreement(encode(slabDepth(W, H, 250, 250 + width), W, H), W, H, 0, W, SEP_FAR)
      vals.push(a)
      curve.push(`${width}:${a.toFixed(4)}`)
    }
    report('shift far-period agreement vs feature width', curve.join(' '))
    // Monotone and smooth: no single step dominates, so no threshold is
    // recoverable. "Smooth" is quantified as "every consecutive drop is within
    // 3x of the mean drop".
    const drops = vals.slice(1).map((v, i) => vals[i]! - v)
    const mean = drops.reduce((a, b) => a + b, 0) / drops.length
    report('consecutive drops in far agreement', drops.map(d => d.toFixed(4)).join(' '))
    expect(Math.max(...drops)).toBeLessThan(mean * 3)
    expect(Math.min(...drops)).toBeGreaterThan(0)
  })

  it('autocorrelation has a hard width floor, and it is above the fusion threshold', () => {
    // Pins the measurement gap: features between the budget (18px) and
    // lo + MIN_OVERLAP (108px) are perceptible but unmeasurable by period
    // analysis. This is why the suite's general instrument is the control diff
    // and `coherentColumns`, not `dominantPeriod`.
    const floor = SEP_NEAR + MIN_OVERLAP
    report('autocorrelation floor for sepNear / sepFar',
      `${SEP_NEAR + MIN_OVERLAP} / ${SEP_FAR + MIN_OVERLAP}px of uniform depth`)
    report('measurement gap (perceptible but unmeasurable)', `${BUDGET}px … ${floor}px`)
    expect(floor).toBeGreaterThan(BUDGET)

    const W = 600, H = 8
    const img = encoderFor(opts('shift'))(slabDepth(W, H, 250, 250 + 60), W, H)
    // A window the size of a 60px feature cannot resolve sepNear at all.
    const narrow = dominantPeriod(rowOf(img, W, 4).slice(250, 310), SEP_NEAR, SEP_FAR)
    report('dominantPeriod over a 60px window', narrow)
    expect(Number.isNaN(narrow.period)).toBe(true)
    expect(narrow.samples).toBe(0)
  })
})

/* ====================================================================== */
/* PROPERTY 6 — DETERMINISM, PURITY, CALIBRATION                          */
/* ====================================================================== */

/**
 * The cheap invariants. None of them caught one of the five, and they are here
 * because each one is a thing a future change could plausibly break silently,
 * and each is a metamorphic relation rather than a pinned value.
 */
describe.each(ALGORITHMS)('P6 determinism and calibration (%s)', algorithm => {
  const encode = encoderFor(opts(algorithm))

  it('is a pure function of (depth, w, h, opts) on arbitrary depth', () => {
    // Randomised depth rather than a slab: a flat-plus-slab field exercises two
    // separation values out of nineteen.
    const W = 400, H = 12
    for (let seed = 1; seed <= 4; seed++) {
      const d = randomDepth(W, H, seed)
      const enc = encoderFor(opts(algorithm, seed))
      expect(Array.from(enc(d, W, H))).toEqual(Array.from(enc(d.slice(), W, H)))
    }
    report(`${algorithm} determinism over 4 random depth fields`, 'identical')
  })

  it('does not mutate its input depth map', () => {
    const W = 300, H = 8
    const d = randomDepth(W, H, 9)
    const before = Array.from(d)
    encode(d, W, H)
    expect(Array.from(d)).toEqual(before)
  })

  it('encodes flat depth z as exactly sepAt(z), monotonically', () => {
    // The calibration relation: the measured period must equal the declared
    // mapping for every z, and must never increase with z. Catches a sign flip
    // or a mis-clamped `sepAt`, neither of which any existing test would see
    // outside z ∈ {0, 1}.
    const W = 600, H = 4
    const measured: number[] = []
    const rows: string[] = []
    for (const z of [0, 0.125, 0.25, 0.5, 0.75, 0.875, 1]) {
      const img = encode(flatDepth(W, H, z), W, H)
      const { period, score } = dominantPeriod(rowOf(img, W, 2), SEP_NEAR - 2, SEP_FAR + 2)
      const want = Math.round(SEP_FAR - z * BUDGET)
      rows.push(`z=${z}→${period}(${score.toFixed(3)}) want ${want}`)
      measured.push(period)
      expect(period, `period at z=${z}`).toBe(want)
      expect(score, `score at z=${z}`).toBe(1)
    }
    report(`${algorithm} flat-depth calibration`, rows.join(' '))
    for (let i = 1; i < measured.length; i++) {
      expect(measured[i]!).toBeLessThanOrEqual(measured[i - 1]!)
    }
  })

  it('cross mode is exactly depth inversion', () => {
    // Metamorphic: cross(d) must equal plain(1-d), bit for bit. The cheapest
    // possible check that `cross` is a depth transform and not a second,
    // divergent code path.
    const W = 400, H = 8
    const d = randomDepth(W, H, 3)
    const inv = new Float32Array(d.length)
    for (let i = 0; i < d.length; i++) inv[i] = 1 - d[i]!
    const a = encoderFor({ ...opts(algorithm), cross: true })(d, W, H)
    const b = encoderFor({ ...opts(algorithm), cross: false })(inv, W, H)
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('the encoded structure is independent of the seed', () => {
    // The seed chooses colours; the depth chooses structure. Pinning this
    // separation is what makes every `coherentColumns` measurement above
    // seed-independent, and it would catch a seed leaking into `sepAt`.
    const W = 800, H = 24
    const d = slabDepth(W, H, 300, 400)
    const sets = [1, 2, 3, 4, 5].map(seed =>
      Array.from(coherentColumns(encoderFor(opts(algorithm, seed))(d, W, H), W, H, SEP_NEAR)))
    for (const s of sets) expect(s).toEqual(sets[0])
    report(`${algorithm} coherent columns identical across 5 seeds`,
      `${sets[0]!.filter(Boolean).length} columns`)
  })

  it('the output is two-valued and the two values are balanced', () => {
    // Guards the one thing a dot field must be. Balance is a weak statistical
    // check but it is the difference between "random dots" and "mostly black
    // with a few dots", which fuses to nothing and would otherwise pass every
    // structural property in this file.
    const W = 600, H = 32
    const img = encode(randomDepth(W, H, 11), W, H)
    expect([...new Set(img)].sort((a, b) => a - b)).toEqual([0, 255])
    const white = [...img].filter(v => v === 255).length / img.length
    report(`${algorithm} white fraction`, white.toFixed(4))
    expect(white).toBeGreaterThan(0.45)
    expect(white).toBeLessThan(0.55)
  })
})
