import type { Scene, StereoOpts } from '../core/types.js'

/**
 * The authoring legibility check: is this text wide enough to fuse at all?
 *
 * **The rule.** `sepFar - sepNear` is the entire disparity budget — 18px at the
 * defaults. A feature narrower than that budget has no room to carry an
 * unambiguous horizontal shift, so no amount of staring will fuse it; it reads
 * as noise with a faint texture. Text is where this bites, because a 90px face
 * has stems around a tenth of its size and the author has no reason to connect
 * "my type looks fine" with "my depth budget is 18px".
 *
 * **Why it is measured on the depth map and not on the rendered frame.** The
 * encoder does not lose the feature — a 1px depth feature's encoded footprint
 * is exactly 1px and perfectly coherent in both encoders, and far-period
 * agreement against feature width has no knee anywhere near the budget. It is
 * the *viewer* who cannot recover it. So there is nothing in the output to
 * detect: the readable signal is the ink in the depth map, which is the only
 * place the feature's width still exists as a width.
 *
 * ## The two things this module must not pretend
 *
 * **1. The threshold is calibrated against a metric, not derived from one.**
 * "Stroke width" has no canonical definition, and the comparison
 * `medianRun < sepFar - sepNear` is calibrated against **this one**: the median
 * width of horizontal runs of depth-map samples at or above half the layer's
 * own peak depth, in pre-upscale scene pixels. Change any clause of that
 * sentence and the number moves. 18px is a real quantity — it is literally
 * `sepFar - sepNear` — but the stroke figure it is compared against is a
 * statistic over a mask, not a physical measurement of a glyph, and the two are
 * only commensurable because they were lined up by measurement rather than
 * derived from one another.
 *
 * What that calibration rests on, measured through `@napi-rs/canvas` on the **vendored
 * face** (`assets/fonts/inter-*`, which `src/node/canvas.ts` registers and this page
 * declares over `@font-face`), strings `STATIC` / `HELLO` / `Static on the Stereo` —
 * which agree with each other to within 1px at every cell but one (the three strings
 * span 48-50 at 240px/900):
 *
 * | size | regular | bold  | 900   |
 * |------|---------|-------|-------|
 * | 48   | 5       | 8     | 10-11 |
 * | 90   | 9       | 14    | 19    |
 * | 120  | 12      | 19    | 25    |
 * | 150  | 14-15   | 23-24 | 30-31 |
 * | 240  | 23      | 37    | 48-50 |
 *
 * So at 90px regular a stroke is 9px against an 18px budget — a half, which is the
 * observation this check exists to surface, and it is why the shipped examples (120px
 * regular at 12px, 96px regular at 10px, 64px regular at 7px) all trip it.
 *
 * **The halving is not cured by bold.** 90px bold is 14px, still under the budget; the
 * smallest size that reaches 18px is 182px regular, 110px bold, or 83px at 900. An
 * earlier version of this comment said 90px bold measured "13–18px, i.e. at or just
 * under the whole budget" — that was DejaVu Sans, the heaviest of the system fallbacks
 * and a 29% outlier, and it is the single reason the CLI's `--text` default (now bold)
 * was expected to land on the budget and does not.
 *
 * There are also two defaults, not one, and the smaller is worse than a half:
 * `core`'s `DEFAULT_TEXT_SIZE` is **48** (what a scene layer with no `size:`
 * gets), measuring 5px regular — barely a quarter of the budget. The CLI's
 * `--text` path supplies its own `TEXT_FONT_SIZE` of **90** at `TEXT_FONT_WEIGHT`
 * of **bold**, i.e. the 14px cell. Neither fuses.
 *
 * One claim about this was *not* reproducible and the comment is written
 * without it: switching to the other obvious ink definition (any sample above
 * zero, i.e. counting the antialiasing fringe) moves the number by 0–20%, never
 * the ~2× an earlier pair of figures implied. The fringe is about one pixel per
 * side, so it cannot double a 10px stem. What produced the low column of that
 * pair is now known — it was the CSS generic `sans-serif` falling through to a
 * dingbat font in `@napi-rs/canvas`, which `src/node/canvas.ts` now resolves;
 * see §9 of `docs/2026-10-09-testing-retrospective.md`. Which is all the more
 * reason to state the metric in full rather than to call any of these numbers
 * "the stroke width".
 *
 * **The cross-platform caveat the table used to carry is gone, and that is the point of
 * vendoring the face.** The two sides of this project no longer resolve `sans-serif`
 * differently: both answer it with the same three files, and the WOFF2 the browser
 * downloads was produced from the TTF Node reads. Measured against a headless Chromium,
 * advance widths agree to 0.0054% and this very statistic agrees exactly in 11 of 16
 * cells and by 1px in the rest — rasteriser hinting at the half-peak threshold, not a
 * different font. It used to be 10–25%, Liberation Sans in the browser against DejaVu
 * Sans in the CLI.
 *
 * **A heavier weight now does something, and it did not before.** `weight: "900"` used to
 * be a request nobody could honour: DejaVu Sans, Liberation Sans and Noto Sans each
 * declare only 400 and 700, so Chromium rendered 900 byte-identically to bold while
 * `@napi-rs/canvas` synthesised it at +13–25% — which is why the same assertion ("900
 * buys at most 5% over bold") passed on one machine and failed on GitHub's runner at
 * +15%. The vendored family declares a real 900, and the gain is consistent across both
 * rasterisers: +36% over bold at 90px measured in Node, and 23px → 31px at 150px measured
 * in this page. That is a property of the vendored file rather than of this code, so the
 * measurement is still the only honest advisor — and this module still gives the user the
 * measurement rather than a promise.
 */

/**
 * The share of the layer's own peak depth a sample must reach to count as ink.
 *
 * Scaled to the layer rather than absolute, because `rasterDepth` returns
 * *depth*, so a fully opaque glyph on a `depth: 0.4` layer peaks at 0.4 and an
 * absolute 0.5 would measure it as empty.
 *
 * 0.5 excludes the antialiasing fringe, which is the point: a half-covered
 * pixel carries half the shift and therefore contributes ambiguity rather than
 * disparity. It is also what makes the measured number smaller — and the
 * warning stricter — than an any-ink definition would.
 */
export const INK_FRACTION = 0.5

/**
 * How many budgets of stroke width count as comfortable rather than tight.
 *
 * **Chosen, not measured.** The rule only supports one boundary: below one
 * budget there is no shift to carry. One budget exactly is not a comfortable
 * margin either, so there is a middle grade, and two is the roundest number
 * that is clearly more than one. Nothing was measured at 1.5 or 3.
 */
export const TIGHT_MULTIPLE = 2

/** What the panel shows instead of a stroke width it does not have. */
export const UNMEASURED_INK = '—'

export interface InkMeasurement {
  /**
   * Median horizontal ink-run width in depth-map pixels. May be `NaN` — check
   * {@link InkMeasurement.measured} before formatting.
   */
  medianRun: number
  /** How many runs the median rests on. */
  runs: number
  /** The largest finite depth found, which the threshold is a fraction of. */
  peak: number
  /** The absolute depth a sample had to reach to count. */
  threshold: number
  measured: boolean
}

/**
 * Median width of the horizontal ink runs in a depth map.
 *
 * The median rather than the mean, because glyphs are mostly stems with the
 * occasional crossbar: one 40px bar across four 2px stems has a mean of 9.6px,
 * which reads as comfortable at an 18px budget, and a median of 2px, which is
 * the truth. The mean is the statistic that would make this check useless on
 * exactly the strings it exists for.
 *
 * Runs never span a row boundary. A run clipped by the frame edge is still
 * counted as the width it has on screen, which is what the viewer has to fuse.
 */
export function measureInk(
  depth: ArrayLike<number>, width: number, height: number, fraction: number = INK_FRACTION,
): InkMeasurement {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(
      `measureInk: a depth map needs positive whole dimensions, got ` +
      `${width}×${height}`,
    )
  }
  if (depth.length !== width * height) {
    throw new Error(
      `measureInk: a ${width}×${height} depth map has ${width * height} ` +
      `samples, got ${depth.length}`,
    )
  }
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) {
    throw new Error(
      `measureInk: the ink fraction must be in (0, 1], got ${fraction}`,
    )
  }

  // **A NaN sample needs no guard, and an explicit one would be dead code.**
  // Both loops below compare with `>` / `>=`, and every comparison against NaN
  // is false, so a NaN can neither become the peak nor extend a run. An earlier
  // version wrote `Number.isFinite(v) && v > peak`; mutation testing showed no
  // input could distinguish its presence from its absence, exactly as
  // `depthmap.ts` records for its own removed clamp. What must not appear here
  // is `Math.max(peak, v)`, which propagates NaN and would report every layer
  // as empty — so `legibility.test.ts` pins the *guarantee* with a NaN case
  // rather than pinning any code written here.
  let peak = 0
  for (let i = 0; i < depth.length; i++) {
    const v = depth[i]!
    if (v > peak) peak = v
  }
  const threshold = peak * fraction
  if (peak <= 0) {
    // No ink, or ink pinned at depth 0. The two are indistinguishable here
    // because `rasterDepth` returns depth and not coverage — and that costs
    // nothing: a layer at depth 0 sits on the background plane and encodes no
    // disparity for anyone to fuse.
    return { medianRun: Number.NaN, runs: 0, peak, threshold: 0, measured: false }
  }

  const runs: number[] = []
  for (let y = 0; y < height; y++) {
    const row = y * width
    let run = 0
    for (let x = 0; x < width; x++) {
      const v = depth[row + x]!
      // `NaN >= threshold` is false, so a NaN ends a run rather than extending
      // one. See the peak loop above for why that is left implicit.
      if (v >= threshold) run++
      else if (run > 0) {
        runs.push(run)
        run = 0
      }
    }
    if (run > 0) runs.push(run)
  }

  if (runs.length === 0) {
    return { medianRun: Number.NaN, runs: 0, peak, threshold, measured: false }
  }
  runs.sort((a, b) => a - b)
  const mid = runs.length >> 1
  const medianRun = runs.length % 2 === 1
    ? runs[mid]!
    : (runs[mid - 1]! + runs[mid]!) / 2
  return { medianRun, runs: runs.length, peak, threshold, measured: true }
}

/**
 * The disparity budget in depth-map pixels.
 *
 * **Not scaled by `noiseScale`**, unlike `diagnostics.ts`'s expected periods.
 * The two live on opposite sides of the upscale: a measured repeat period is
 * read off the finished frame, where the upscale has already happened, whereas
 * `rasterDepth` works at `scene.size` and `upscale` is the last stage after the
 * encoder. Multiplying here would make the warning wrong by exactly
 * `noiseScale`, and there is no default at which that is harmless: this clause
 * used to end "and silently right at the default of 1", which was false —
 * `DEFAULT_STEREO.noiseScale` in `src/core/types.ts` is **2**, so the
 * hypothetical mistake would double the budget on every scene nobody had
 * configured. Stated as the rule rather than as a number, because that is what
 * went stale: the budget is in scene px (design §10.6) whatever `noiseScale`
 * is.
 */
export function disparityBudget(stereo: StereoOpts): number {
  return stereo.sepFar - stereo.sepNear
}

/**
 * The widest budget the fusion sweep measured as comfortable, in scene px.
 *
 * **Where it comes from.** `docs/2026-10-12-legibility-findings.md` §1's fusion
 * subsection: *"88-110 was pretty comfortable with no perceived
 * increase/decrease in difficulty."* At the `sepFar` of 110 that sweep ran at,
 * `sepNear` 88 is a budget of 22 — which is the figure §2's table carries as
 * "flat to ~22px".
 *
 * **How weak the evidence is, stated because the number looks like the table's
 * other numbers and is not.** The stroke-legibility rounds above it in that
 * document are blinded trials; this is Shaun's own sweep, run sighted, labelled
 * in the document itself as *"not a blinded trial"*, one observer. The
 * document's own §4.1 warm-up confound applies to it in full, and it is a
 * difficulty ranking — exactly the kind of judgement that section says is *not*
 * robust, unlike the reads.
 */
export const FUSION_PLATEAU_BUDGET = 22

/**
 * The budget past which the sweep reported fusion failing, in scene px.
 *
 * **Where it comes from.** The same quote: *"80 for sepNear was right at the
 * edge of what's easy to focus on. 78 was the true limit. once i went below
 * that, it became exceedingly difficult to keep my eyes focused on the text for
 * more than a second or so at a time."* At `sepFar` 110 that is a budget of 32,
 * and the difficulty is reported *below* `sepNear` 78 — i.e. *above* a budget
 * of 32 — which is why {@link fusionComfort} grades 32 itself as unresolved
 * rather than hard, and why §2's table says "cliff **past** ~32px".
 *
 * **`sepNear` 78 is this budget's value only at `sepFar` 110**, and writing the
 * rule on `sepNear` is the error R22 was raised in response to: it would stay
 * silent at `sepFar: 140, sepNear: 78` (a budget of 62, twice past the cliff)
 * while firing at `sepFar: 100, sepNear: 80` (a budget of 20, inside the
 * plateau). Design §10.2, and a row of its own in the execution plan's §9.
 *
 * Same weakness as {@link FUSION_PLATEAU_BUDGET}: one observer, unblinded,
 * warm-up unaddressed.
 */
export const FUSION_CLIFF_BUDGET = 32

/**
 * Where a budget sits against the fusion sweep.
 *
 * Three grades rather than two, and the middle one is the point. The sweep's
 * budgets run 0, 22, 30, 32 and "below 78" — so between 22 and 30 it has **no
 * point at all**, and a two-grade scale would have to put a boundary in that
 * hole. `unresolved` says the band exists and that nothing measured it; it is
 * not a severity between the other two so much as an admission.
 *
 * (The band is not quite empty of evidence: budget 30 is the sweep's "right at
 * the edge of what's easy" and 32 its "true limit", so degradation does begin
 * inside it. What is missing is any point that could say *where* — which is the
 * same thing as saying the boundary is not there to be found yet.)
 */
export type FusionComfort = 'comfortable' | 'unresolved' | 'hard'

/** What {@link fusionComfort} measured, and only then what it thinks of it. */
export interface FusionReading {
  /** `sepFar − sepNear`, in scene px. Not scaled by `noiseScale` — design §10.6. */
  budget: number
  /** The threshold it was graded against. {@link FUSION_PLATEAU_BUDGET}. */
  plateau: number
  /** The threshold it was graded against. {@link FUSION_CLIFF_BUDGET}. */
  cliff: number
  grade: FusionComfort
}

/**
 * How hard this depth budget is to *hold fused* — the other axis.
 *
 * **Not legibility, and pointing the other way.** The findings document's §2
 * separates the two: resolving the letters tracks stroke width absolutely and
 * was 4/4 across a 3× range of budget, while holding fusion tracks the budget
 * and nothing else. They point in opposite directions, which is why conflating
 * them produces actively bad advice — a thin stroke makes the legibility rule
 * suggest widening the budget, which does nothing for the letters and makes
 * *this* worse. Two functions, deliberately, reading two different quantities.
 *
 * **Keys on the budget, not on `sepNear`.** See {@link FUSION_CLIFF_BUDGET} for
 * the two configurations that tell the implementations apart.
 *
 * **Advisory only** (R22, design §10's second obligation): it returns a reading
 * and never throws, clamps or corrects, including for a `sepNear` at or above
 * `sepFar`. That is a misconfiguration `describeLegibility` already reports in
 * its own words, and duplicating it here would mean warning about a cliff that
 * nothing is near. Zero disparity is also the far end of the sweep's own
 * plateau — `sepNear` 110 at `sepFar` 110 — so the quiet answer is what the
 * evidence says as well as what the obligation requires. The one wrinkle worth
 * recording: at a budget of 0 there is no disparity to fuse at all, so that end
 * of the plateau is comfortable in a sense the rest of it is not.
 *
 * The numbers and the grade are separable (design §10): a view that wants to
 * draw a margin reads `budget`, `plateau` and `cliff` and never looks at
 * `grade`, and it gets the thresholds from the reading rather than inlining
 * them, which is §2.6.
 */
export function fusionComfort(stereo: StereoOpts): FusionReading {
  const budget = disparityBudget(stereo)
  // Ordered widest-first so a non-finite budget falls through to the quiet
  // answer rather than to a warning: every comparison against NaN is false.
  // Silence on a number this function cannot read is the advisory-only stance,
  // and the caller still sees the NaN in `budget`.
  const grade: FusionComfort = budget > FUSION_CLIFF_BUDGET
    ? 'hard'
    : budget > FUSION_PLATEAU_BUDGET
      ? 'unresolved'
      : 'comfortable'
  return { budget, plateau: FUSION_PLATEAU_BUDGET, cliff: FUSION_CLIFF_BUDGET, grade }
}

export type Legibility = 'unmeasured' | 'illegible' | 'tight' | 'clear'

/**
 * Grade a measured stroke against a budget.
 *
 * The boundary at exactly one budget falls on the `tight` side: the rule is
 * "narrower than the budget cannot carry a shift", so a stroke of exactly the
 * budget still has one.
 */
export function legibilityOf(ink: InkMeasurement, budget: number): Legibility {
  if (!ink.measured || !Number.isFinite(budget) || budget <= 0) return 'unmeasured'
  if (ink.medianRun < budget) return 'illegible'
  if (ink.medianRun < budget * TIGHT_MULTIPLE) return 'tight'
  return 'clear'
}

/**
 * One line for the panel: what was measured, what it was measured against, and
 * only then what that means.
 *
 * The order is deliberate and is the same contract `describeReadout` keeps —
 * the numbers come first so the margin is visible, and the verdict is something
 * the reader can check rather than something they have to accept.
 */
export function describeLegibility(ink: InkMeasurement, stereo: StereoOpts): string {
  const budget = disparityBudget(stereo)
  const how = `budget ${budget} px (sepFar ${stereo.sepFar} − sepNear ${stereo.sepNear})`
  const grade = legibilityOf(ink, budget)

  if (grade === 'unmeasured') {
    if (!ink.measured) {
      return `${UNMEASURED_INK} · ${how} — no ink to measure in this layer's ` +
        `depth map (an empty string, fully off-stage, or pinned at depth 0, ` +
        `which encodes no disparity anyway).`
    }
    return `${UNMEASURED_INK} · there is no depth budget to measure against ` +
      `while sepNear (${stereo.sepNear}) is not below sepFar (${stereo.sepFar}).`
  }

  const measured = `median stroke ${Math.round(ink.medianRun)} px · n=${ink.runs} runs · ${how}`

  if (grade === 'illegible') {
    return `${measured} — narrower than the budget, so there is no room for an ` +
      `unambiguous shift and this will not fuse however long you stare. Enlarge ` +
      `the type, or raise sepNear to shrink the budget — that buys legibility ` +
      `with depth range, since the gap between the two separations *is* the range.`
  }
  if (grade === 'tight') {
    return `${measured} — over the budget but under ${TIGHT_MULTIPLE}× it, so ` +
      `expect it to be hard work. Enlarging the type or raising sepNear (which ` +
      `trades depth range for legibility) both widen the margin.`
  }
  return `${measured} — comfortably over the budget.`
}

/**
 * The scene reduced to one layer, for measuring that layer's ink alone.
 *
 * Measuring the composited depth map would measure whichever layer happens to
 * have the most ink, which on any scene with a background shape is not the
 * text. The frame grid, `freezeNoise` and `stereo` all come along deliberately:
 * a track is sampled against the scene's own duration, so dropping `fps` or
 * `duration` would re-phase every animator and measure a frame nobody is
 * looking at.
 */
export function soloLayerScene(scene: Scene, index: number): Scene {
  if (!Number.isInteger(index) || index < 0 || index >= scene.layers.length) {
    throw new Error(
      `cannot measure layer ${index}: the scene has ${scene.layers.length} layer(s)`,
    )
  }
  return { ...scene, layers: [scene.layers[index]!] }
}
