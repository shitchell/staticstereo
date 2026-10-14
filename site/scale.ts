/**
 * How big the plate is allowed to be on screen, and what that does to the
 * layout.
 *
 * ## The defect this file exists to fix
 *
 * `styles.css` used to render the stereogram with
 * `canvas { width: 100%; image-rendering: pixelated }`. `pixelated` is the only
 * correct filter for a dot field — anything that smooths blends neighbouring
 * dots and destroys exactly the pixel-level correlation that *is* the stereo
 * signal — but `width: 100%` hands it an arbitrary, almost always non-integer
 * ratio, and nearest-neighbour at a non-integer ratio is not a harmless
 * approximation:
 *
 * - **Above 1:1** source columns map to *unequal* runs of display columns.
 *   `out[x]` may be 3 columns wide while its partner `out[x + sep]` is 2, so
 *   the pair stops being a copy of a source pair and that percept does not
 *   form. It recurs with a period set by the fractional part — 5-18 display px
 *   apart at the ratios a real window produces — which is why it reads as
 *   vertical columns of raised and lowered texture rather than as noise.
 * - **Below 1:1** source columns are *dropped*. The partner pixel a percept
 *   needs is not on screen at all, and correspondence is destroyed outright.
 *   **A stereogram cannot be shrunk.** Measured on the default scene (a
 *   1500x720 plate) in headless Chromium before this module existed: 0.23x at a
 *   750px viewport, 0.39x at 1280, 0.61x at 1920. The live page was not
 *   mis-scaling the plate by a few percent; on every ordinary desktop width it
 *   was throwing more than half the columns away.
 *
 * ## What is snapped, and in which units
 *
 * The scale that matters is the one from the backing store to **device**
 * pixels, not to CSS pixels. `devicePixelRatio` is routinely fractional — 1.25,
 * 1.5, 2.5 on a HiDPI panel or at browser zoom — so an integer *CSS* scale at
 * dpr 1.5 still lands on a fractional device scale and the artifact comes
 * straight back. {@link snapScale} therefore solves for
 * `cssWidth x dpr = integer x plateWidth` and leaves the CSS width fractional
 * if that is what it takes. `site/scale.test.ts` asserts it at fractional dpr,
 * and the browser run-length check in the task report is what proves the
 * browser agreed.
 *
 * `plateWidth` is the **backing-store** width, i.e. `canvas.width`, which
 * `renderFrame` has already multiplied by `noiseScale`. So `noiseScale` and the
 * display scale compose and neither needs to know about the other; passing
 * `scene.size` here instead would double-count it.
 *
 * ## No "fit to width"
 *
 * There is deliberately no mode that shrinks the plate to fit. It would produce
 * a tidy-looking page containing an unfusable image, which is the worst
 * available outcome for this project: the failure is invisible to anyone who
 * has not already fused a working one. The minimum is 1:1 and the container
 * scrolls instead — and the page says so in a line of prose
 * ({@link scaleNote}), because a visitor on a phone would otherwise read the
 * sideways scroll as a broken layout.
 *
 * **Presentation mode does not relax this.** `?present=1` hides every panel and
 * gives the plate the whole viewport, which sounds like the one place a
 * fit-to-window would be wanted — and {@link fitScale} still floors at 1 and
 * still lets an over-large plate scroll. The reason is unchanged: the floor is
 * not about tidiness, it is that below 1:1 the partner pixel a percept needs is
 * not on screen at all. All presentation mode adds is the **second axis**: the
 * normal view's scale is bound by width only, because the page scrolls
 * vertically anyway, while a presented plate has a fixed height to fit inside
 * too.
 *
 * ### Amendment — `contain` knowingly overrides the section above (R20)
 *
 * Everything above this line still stands as measurement and still governs
 * {@link snapScale}, {@link fitScale} and {@link viewLayout}. What has changed
 * is not the measurement but the **ordering of two goods**, decided by Shaun
 * and recorded as requirement R20 after the embed case (R14) was specified:
 *
 * > "i'd say any issues that arise from taking a stereogram intended to be
 * > shown at 1080x720 resolution and then fitting it into a 200x100 box... are
 * > not our problem :p i would rather preserve the integrity of the original
 * > pixels produced at the intended resolution as much as possible (softening
 * > and blurring and pixels compressing into each other acknowledged and
 * > accepted) rather than try to preserve the effect."
 *
 * **Fidelity to the authored artifact now outranks fidelity to the fused
 * percept** — for the embed, and only for the embed. The context matters and is
 * part of the rationale: a third party pastes an `<iframe src>` into a page we
 * will never see and sizes it to their own layout (R14). The choice there is not
 * between a fusable plate and a blurred one; it is between a blurred one and a
 * plate that bursts out of a 300px column. That is a different question from the
 * one the section above answers, which is what a *visitor to this site* should
 * be shown, and {@link containFit} is the only function that answers it.
 *
 * So the division of labour, exactly:
 *
 * | mode | function | the 1:1 floor |
 * |---|---|---|
 * | `snap` | {@link fitScale} | **honoured** — never downscales, scrolls instead |
 * | `contain` | {@link containFit} | **waived**, per R20, for the embed case |
 * | `render` | `renderFit` | **honoured** — re-renders smaller geometry rather than resampling, so no column is ever dropped |
 *
 * `contain` is therefore the one place in this file where a scale below 1 can
 * be returned, and the measurements above are the honest statement of what it
 * costs: at 0.23x more than half the columns are gone and nothing will fuse.
 * R20 accepts that outcome rather than preferring it. `REJECTED_FIT_MODES` in
 * `site/fit.ts` records the one thing R20 does **not** buy — `cover`, which
 * crops the margins and so destroys edge fusion by construction rather than by
 * degradation.
 *
 * ## The known residual, measured
 *
 * A whole-number scale is necessary but it is not quite the end of it. Swept
 * over 96 (viewport, devicePixelRatio, mode) combinations in headless Chromium,
 * **95 reproduce the backing store exactly** — every source pixel exactly
 * `scale` device columns wide, verified against the backing store read back
 * through `getImageData`. The one that does not is a 1920px viewport at
 * `devicePixelRatio` 2.5, full width, scale 3 — a 4500px-wide rendered canvas —
 * where **5 runs in 314** are a device pixel off. They are five fixed vertical
 * seams (device x ~175, 288, 760, 1620, 3067, stable down every row and across
 * repeat runs), not a periodic pattern, so they cannot read as the columns of
 * raised and lowered texture the original defect produced.
 *
 * It is Chromium's own rasterisation of a very wide scaled canvas, not the
 * arithmetic here: the CSS width it is given satisfies
 * `cssWidth x dpr === scale x plateWidth` exactly. Two things were tried
 * against it. Nudging the canvas's device origin onto a whole pixel with a
 * negative margin changed **nothing** — the 96-case sweep was byte-identical
 * with and without — so it was deleted rather than kept on the strength of the
 * argument. Moving the 1px border off the canvas and onto `.canvas-wrap` *did*
 * help, taking the sweep from 92/96 to 95/96, and it stayed. What is left would
 * need the integer replication done into the backing store ourselves and
 * displayed 1:1, which costs `scale^2` memory — 69 MB at scale 4 on this
 * plate — to remove a defect 20x smaller than the one being fixed. Not taken.
 *
 * ## A second residual, found by the presentation-mode sweep
 *
 * Both {@link snapScale} and {@link fitScale} guarantee
 * `cssWidth * dpr === scale * plateWidth` *in arithmetic*. The browser cannot
 * always honour it, because **Chromium quantises laid-out lengths to 1/64 CSS
 * px**, so a `cssWidth` that is not a multiple of 1/64 is unreachable.
 *
 * Measured in headless Chromium on a 820x320 plate (a 300x160 scene) at
 * `devicePixelRatio` 3, where the scale is 1 and `cssWidth` is therefore
 * `820 / 3 = 273.3333…`: the laid-out width comes to 273.328125 CSS px, i.e.
 * **819.984 device px for an 820px plate**, and one source column is dropped —
 * 21.8% of device pixels then disagree with the backing store, because
 * everything past the drop is shifted by one column in a dot field. It is
 * **not** this mode's doing: the same plate at the same ratio in the *normal*
 * view measures 21.6%, and the pre-change build at `HEAD` measures 21.76%. The
 * project's earlier 96-case sweep missed it only because it used a 1500px plate,
 * and 1500 divided by every ratio it tried (1, 1.25, 1.5, 2, 2.5, 3) happens to
 * land on a whole number.
 *
 * It is left alone, and a warning for it was considered and rejected: the
 * obvious predicate — `cssWidth * 64` not being an integer — **over-predicts**.
 * The same plate at dpr 1.5 is equally unrepresentable (546.65625 instead of
 * 546.6667, the same 0.0156 device px short) and nonetheless reproduces the
 * backing store exactly. A warning that fires on a plate that is in fact
 * perfect is worse than none in a project whose whole problem is that a broken
 * stereogram looks fine. Fixing it properly means doing the integer replication
 * into the backing store ourselves, which is the `scale^2` memory cost already
 * rejected above.
 *
 * Worth knowing alongside it: a scale that large is perceptually dubious
 * anyway. `sepFar x noiseScale x scale` is the on-screen disparity, and at
 * scale 5 with the defaults that is 1100 device pixels, far outside what anyone
 * can fuse. A perceptual cap on `scale` may be the right feature, but it is a
 * design decision with its own measurement and it is not made here.
 *
 * Pure arithmetic, exported and unit-tested, rather than inline in a resize
 * handler: the interesting cases are fractional dpr and a plate wider than the
 * window, and neither is reachable from a test that needs a browser.
 */

import { DEFAULT_STEREO, plateLayoutOf } from '../src/core/index.js'
import type { Margins, Scene } from '../src/core/index.js'
import type { FitMode } from './fit.js'

/**
 * Errors unless its argument is `never` — the repo's exhaustiveness idiom, as
 * used in `src/core/types.ts` and `src/core/anim/track.ts`. Declared locally
 * there too; it is three words long and sharing it would couple two modules
 * that have nothing else to say to each other.
 */
type AssertNever<T extends never> = T

/** Slack for the `floor`, so a ratio that is 1.9999999 in binary reads as 2. */
const EPS = 1e-9

/**
 * Is this a `devicePixelRatio` the arithmetic here can use?
 *
 * Finite and positive, and nothing else. Every function in this module reads a
 * `dpr` that arrived from `window.devicePixelRatio` or from a caller that read
 * it, so the rule has to be a *coercion* rather than a rejection: a detached
 * document, a headless context or a resize handler firing mid-teardown can all
 * report 0, and a layout pass that threw on one would take out the page it was
 * laying out. `plateWidth` and `plateHeight` are the opposite case — those are
 * a programming error and they throw.
 *
 * ## Why it is one function and not nine copies
 *
 * It is one line, which is exactly why it had been written out inline at every
 * site that needed it: eight copies of
 * `Number.isFinite(dpr) && dpr > 0 ? dpr : 1` here, a ninth spelled with `??`
 * inside {@link planFit}, and a tenth under two more names in
 * `site/playerplan.ts` whose own docblock recorded the duplication rather than
 * removing it. **Nothing pinned the fallback**: every dpr loop in
 * `site/scale.test.ts` was finite and positive, the degenerate sweeps swept
 * lengths and plate sizes instead, and a verifier changed one copy's fallback
 * to `7` without the suite noticing. That is this repo's signature recorded
 * defect — one policy in several files, only some of them guarded, as with the
 * animatable-channel list — so the copies are gone and
 * `site/scale.test.ts`'s `usableDpr` block asserts the rule both directly and
 * through every function that applies it.
 *
 * `undefined` is unusable by the same predicate, which is what makes the eight
 * signatures here that spell the fallback as a `dpr = 1` default parameter
 * (`snapScale`, `snapOffset`, `fitScale`, `containFit`, `renderFit`, `fitNote`,
 * `viewLayout`, `scaleNote` — `planFit` is the one that reads `input.dpr`
 * instead) agree with this function by construction rather than by coincidence.
 */
export function isUsableDpr(dpr: number | undefined): dpr is number {
  return typeof dpr === 'number' && Number.isFinite(dpr) && dpr > 0
}

/**
 * The ratio {@link isUsableDpr} accepts, or **1**.
 *
 * 1 and not 0: `dpr` is a divisor — `cssWidth` is `deviceWidth / dpr` — so 0 is
 * unusable as a fallback for the same reason it is unusable as an input, and 1
 * is the ratio of a display that does not scale, which is the honest reading of
 * "we were not told".
 */
export function usableDpr(dpr: number | undefined): number {
  return isUsableDpr(dpr) ? dpr : 1
}

export interface SnapInput {
  /** Backing-store width in px — `canvas.width`, `noiseScale` already applied. */
  readonly plateWidth: number
  /** CSS px the canvas may occupy. Non-finite or negative is treated as 0. */
  readonly availableWidth: number
  /** `devicePixelRatio`. Non-finite or non-positive falls back to 1. */
  readonly dpr?: number
}

export interface Snap {
  /** Backing store → device pixels. A positive **integer**, never 0. */
  readonly scale: number
  /** What to write into `style.width`. May be fractional; `scale` may not. */
  readonly cssWidth: number
  /** `scale * plateWidth`. Integer by construction. */
  readonly deviceWidth: number
  /** `cssWidth > availableWidth`: the plate does not fit and must scroll. */
  readonly overflows: boolean
}

/**
 * The largest integer device-pixel scale that fits `availableWidth`, floored
 * at 1.
 *
 * Contract:
 *
 * - `scale` is an integer and `scale >= 1`. Never 0, never negative, never
 *   fractional. A zero scale is the "fit to width" failure above wearing a
 *   different hat.
 * - `cssWidth * dpr === deviceWidth === scale * plateWidth`, exactly.
 * - `scale` is monotonically non-decreasing in `availableWidth` and in `dpr`.
 * - `overflows` is true exactly when the result is wider than it was allowed to
 *   be, which can only happen at `scale === 1`.
 * - `plateWidth` must be finite and positive; anything else is a programming
 *   error and throws. `availableWidth` and `dpr`, by contrast, come from the
 *   DOM and are *coerced*: a detached or `display: none` element measures 0, and
 *   a resize handler must not throw on it.
 */
export function snapScale({ plateWidth, availableWidth, dpr = 1 }: SnapInput): Snap {
  if (!Number.isFinite(plateWidth) || plateWidth <= 0) {
    throw new Error(
      `snapScale: plateWidth must be a finite positive number of pixels, got ` +
      `${JSON.stringify(plateWidth)}`,
    )
  }
  const ratio = usableDpr(dpr)
  const avail = Number.isFinite(availableWidth) && availableWidth > 0 ? availableWidth : 0
  const scale = Math.max(1, Math.floor((avail * ratio) / plateWidth + EPS))
  const deviceWidth = scale * plateWidth
  const cssWidth = deviceWidth / ratio
  return { scale, cssWidth, deviceWidth, overflows: cssWidth > avail + 1e-6 }
}

/* ------------------------------------------------- both axes (presentation) */

export interface FitInput {
  /** Backing-store width in px — `canvas.width`, `noiseScale` already applied. */
  readonly plateWidth: number
  /** Backing-store height in px — `canvas.height`. */
  readonly plateHeight: number
  /** CSS px the canvas may occupy horizontally. Coerced like {@link SnapInput}. */
  readonly availableWidth: number
  /** CSS px the canvas may occupy vertically. Coerced like {@link SnapInput}. */
  readonly availableHeight: number
  readonly dpr?: number
}

/** Which axis chose the scale — the one with the *smaller* integer quotient. */
export type FitLimit = 'width' | 'height' | 'both'

export interface Fit {
  /**
   * **Backing-store px → device px.** Not CSS px: `cssWidth` is this divided by
   * `dpr`, so the CSS-px layout ratio is `scale / dpr`, not `scale`. Two of the
   * four pixel spaces are named here on purpose — the two functions returning
   * this shape differ in the *value*, never in the space.
   *
   * This is the ratio the browser resamples by and therefore the one
   * `imageRenderingFor` in `site/smooth.ts` takes; it reaches it as
   * {@link RescalePlan.devicePerBackingScale}. This docblock used to attribute
   * the CSS-px ratio to that function instead, which is the mistake recorded in
   * full at {@link RescalePlan.displayScale}.
   *
   * {@link fitScale} returns a positive **integer**, never 0.
   * {@link containFit} returns any non-negative real, and 0 only for a box that
   * has not been laid out. Each function's own contract is the authority.
   */
  readonly scale: number
  readonly cssWidth: number
  readonly cssHeight: number
  /** `scale * plateWidth`, in device px. Integer when `scale` is. */
  readonly deviceWidth: number
  /** `scale * plateHeight`, in device px. Integer when `scale` is. */
  readonly deviceHeight: number
  readonly overflowsWidth: boolean
  readonly overflowsHeight: boolean
  /** Either axis overflows, so something has to scroll. */
  readonly overflows: boolean
  readonly limit: FitLimit
  /**
   * Left offset to centre the plate, in CSS px, snapped by
   * {@link snapOffset} so the plate's device origin is a whole device pixel.
   * `0` when the plate overflows.
   */
  readonly offsetX: number
  /** Top offset, same treatment. */
  readonly offsetY: number
}

/** Slack for comparing a float against the integer it is meant to be. */
const NEAR = 1e-6

const isWhole = (x: number): boolean => Math.abs(x - Math.round(x)) < NEAR

/**
 * The largest centring offset, in CSS px, that puts the plate's origin on a
 * **whole device pixel** and is itself representable in Chromium's layout grid.
 *
 * ## Why an offset needs snapping at all
 *
 * Centring is the one thing presentation mode adds that the normal view does
 * not do, and it is what makes the plate's device origin arbitrary: half of
 * whatever is left over. Measured in headless Chromium on a 420x600 plate at
 * scale 5, dpr 1.5, with `margin: auto` doing the centring:
 *
 * | viewport | device x-origin | device px disagreeing with the backing store |
 * | --- | --- | --- |
 * | 3825x2160 | 1818.75 | **109910 of 6300000 (1.745%)** |
 * | 3826x2160 | 1819.50 | 0 |
 * | 3828x2160 | 1821.00 | 0 |
 *
 * and, at the 3825px viewport, forcing the offset by hand:
 *
 * | `margin-left` | device x-origin | disagreeing |
 * | --- | --- | --- |
 * | `auto` | 1818.75 | 109910 |
 * | `1212px` | 1818.00 | **0** |
 * | `1213px` | 1819.50 | 109910 |
 * | `1212.667px` | 1818.98 | 109910 |
 * | `1210px` | 1815.00 | **0** |
 * | `1214px` | 1821.00 | **0** |
 *
 * The failure is not an edge artifact. The 109910 bad pixels sit in **74
 * columns spaced exactly 10 device px apart** — 10 being `2 x scale` — running
 * down all 3000 rows: a one-column shift over the first 740 device columns,
 * which is the unequal-run defect this whole file exists to prevent, reaching
 * 148 of the plate's 420 source columns. A whole-device-pixel origin removes it
 * completely, and that is a measurement rather than an argument — the
 * project's earlier attempt to correct a fractional origin in the *normal* view
 * measured byte-identical and was deleted (see `site/main.ts`); this one does
 * not.
 *
 * ## Why two conditions and not one
 *
 * `d / dpr` for an integer device offset `d` is not necessarily a CSS length
 * the browser can hold: Chromium quantises layout to **1/64 CSS px**. At dpr
 * 1.5, `1819 / 1.5 = 1212.6667` becomes 1212.65625 and the device origin comes
 * out at 1818.98 — fractional again, and the row above measures it broken. So
 * the accepted offsets are those where `d / dpr` is *also* a multiple of 1/64,
 * which at dpr 1.5 means an even whole number of CSS px, at dpr 1.25 a multiple
 * of 4, and at dpr 1 anything.
 *
 * The search walks **outward from** the ideal half-remainder — nearer first,
 * either side — rather than only downward, because at a dpr whose step is
 * coarse that is the difference between visibly off-centre and not: at dpr
 * 2.625 only every 21st device pixel qualifies, and searching down only put a
 * 420x600 plate in a 412px viewport 6 CSS px left of centre where the nearest
 * qualifying offset is 2 px right of it. Candidates above the ideal are still
 * bounded by `spare`, so the plate can never be pushed off the far edge.
 *
 * It **falls back to 0** — flush left or top, not centred — if nothing
 * qualifies within {@link OFFSET_SEARCH} device px. That ordering is
 * deliberate: an exactly-reproduced plate pushed to one side is usable and a
 * centred one with broken correspondence is not, so "exact" outranks "centred"
 * when a dpr makes the two incompatible. 0 always qualifies, so the fallback is
 * only ever a loss of centring.
 */
export const OFFSET_SEARCH = 256

export function snapOffset(spare: number, dpr = 1): number {
  const ratio = usableDpr(dpr)
  const room = Number.isFinite(spare) && spare > 0 ? spare : 0
  const ideal = Math.floor((room / 2) * ratio + NEAR)
  // The plate must still end inside the box, so an offset above the ideal is
  // allowed only up to the whole remainder, not up to twice the half.
  const limit = Math.floor(room * ratio + NEAR)
  const ok = (d: number): boolean => d >= 0 && d <= limit && isWhole((64 * d) / ratio)
  for (let step = 0; step < OFFSET_SEARCH; step++) {
    if (ok(ideal - step)) return (ideal - step) / ratio
    if (step > 0 && ok(ideal + step)) return (ideal + step) / ratio
  }
  return 0
}

/**
 * The largest integer device-pixel scale that fits **both** axes, floored at 1.
 *
 * This is presentation mode's whole layout decision. {@link snapScale} answers
 * it for one axis; the second axis is the *same* arithmetic with the roles of
 * the two axes swapped, so this calls `snapScale` twice — once with
 * `plateHeight`/`availableHeight` in the width slots — and takes the smaller
 * scale, rather than restating `max(1, floor(avail * dpr / plate))` a third
 * time in the file. The height axis is not a different rule; it is the same rule
 * pointed sideways.
 *
 * `Math.min` of two integers ≥ 1 is an integer ≥ 1, so the contract
 * {@link snapScale} documents survives intact:
 *
 * - `scale` is an integer and `scale >= 1`.
 * - `cssWidth * dpr === deviceWidth === scale * plateWidth`, exactly, and the
 *   same for the height. Both axes carry the *same* integer, so the aspect ratio
 *   is exact and the browser has no rounding to do.
 * - `scale` is monotonically non-decreasing in either available dimension and
 *   in `dpr`.
 * - `overflows` is true exactly when the plate is bigger than the box it was
 *   given, which — as in `snapScale` — can only happen at `scale === 1`.
 *
 * **It still never downscales**, and that is the point of flooring at 1 rather
 * than letting a tall plate in a short window shrink. The reason is in the file
 * header and it is the same reason: below 1:1 nearest neighbour *drops* whole
 * source columns, so the partner pixel a percept needs is not on screen at all.
 * A letterboxed-but-exact plate that scrolls is usable; a shrunk one that fits
 * perfectly is not an image of a stereogram any more.
 *
 * `limit` says which axis bound the result, which is the one thing a caller
 * cannot recover from `scale` alone and the thing a reader of the note wants to
 * know ("it is the height, so a shorter plate would not help").
 */
export function fitScale({
  plateWidth,
  plateHeight,
  availableWidth,
  availableHeight,
  dpr = 1,
}: FitInput): Fit {
  if (!Number.isFinite(plateHeight) || plateHeight <= 0) {
    throw new Error(
      `fitScale: plateHeight must be a finite positive number of pixels, got ` +
      `${JSON.stringify(plateHeight)}`,
    )
  }
  const byWidth = snapScale({ plateWidth, availableWidth, dpr })
  // The axis swap. `snapScale` is agnostic about which dimension it is given —
  // it solves `max(1, floor(avail * dpr / plate))` — so passing the vertical
  // pair is not a trick, it is the same equation with the same guarantees.
  const byHeight = snapScale({ plateWidth: plateHeight, availableWidth: availableHeight, dpr })

  const scale = Math.min(byWidth.scale, byHeight.scale)
  const ratio = usableDpr(dpr)
  const deviceWidth = scale * plateWidth
  const deviceHeight = scale * plateHeight
  const cssWidth = deviceWidth / ratio
  const cssHeight = deviceHeight / ratio
  const availW = Number.isFinite(availableWidth) && availableWidth > 0 ? availableWidth : 0
  const availH = Number.isFinite(availableHeight) && availableHeight > 0 ? availableHeight : 0
  return {
    scale,
    cssWidth,
    cssHeight,
    deviceWidth,
    deviceHeight,
    overflowsWidth: cssWidth > availW + 1e-6,
    overflowsHeight: cssHeight > availH + 1e-6,
    overflows: cssWidth > availW + 1e-6 || cssHeight > availH + 1e-6,
    limit:
      byWidth.scale === byHeight.scale ? 'both' : byWidth.scale < byHeight.scale ? 'width' : 'height',
    offsetX: snapOffset(availW - cssWidth, ratio),
    offsetY: snapOffset(availH - cssHeight, ratio),
  }
}

/* --------------------------------------------------- contain (embed, R20) */

/**
 * The largest scale that fits **both** axes with the aspect ratio preserved —
 * **not** floored at 1 and **not** snapped to an integer.
 *
 * This is design §8.1's `fit=contain`, the default for the embedded player, and
 * it is the one function in this file permitted to return a scale below 1. The
 * reason it is permitted, and the measurements it is overriding, are in the file
 * header under *"Amendment — `contain` knowingly overrides the section above
 * (R20)"*. In one line: for an `<iframe>` whose size a third party chose, R20
 * orders fidelity to the authored pixels above fidelity to the fused percept,
 * and accepts "softening and blurring and pixels compressing into each other".
 *
 * ## Which ratio this returns, and in which pixel spaces
 *
 * `scale` is **backing-store px → device px**, exactly as in {@link fitScale},
 * so the two are interchangeable at a call site and a caller that swaps one for
 * the other does not have to re-derive anything. Concretely:
 *
 *     scale   = min(availableWidth * dpr / plateWidth,
 *                   availableHeight * dpr / plateHeight)     // device ÷ backing
 *     cssWidth  = scale * plateWidth / dpr                   // CSS px
 *
 * The `dpr` in the numerator is load-bearing and is the one thing easy to get
 * backwards. `min(availableWidth / plateWidth, …)` — the obvious spelling, and
 * the one the task brief uses — is the **display** scale: CSS px ÷ backing-store
 * px, a layout ratio. It is this function's `scale / dpr`. Returning *that* in
 * the `scale` field would make a plate come out `1 / dpr` of the size it was
 * asked for on every HiDPI panel — correct-looking at dpr 1 and a quarter-size
 * picture at dpr 2 — so the field carries the device-space ratio and a caller
 * wanting the display scale divides.
 *
 * This paragraph also used to say the display scale "is what `imageRenderingFor`
 * in `site/smooth.ts` takes". It is not, and the correction is recorded at
 * {@link RescalePlan.displayScale}: the browser resamples backing store onto
 * the **device** grid, so `scale` is the ratio the smoothing policy wants and
 * the division is the thing that would be wrong there.
 *
 * Contract:
 *
 * - `cssWidth <= availableWidth` and `cssHeight <= availableHeight`, and at
 *   least one holds with equality: the scale is the **maximum** that fits, so
 *   the binding axis is filled to the pixel and `overflows` is always false for
 *   a box with a positive size.
 * - `cssHeight / cssWidth === plateHeight / plateWidth`. One scale drives both
 *   axes, so the aspect ratio is the plate's own and the browser is never asked
 *   to letterbox by distorting.
 * - `scale` is monotonically non-decreasing in either available dimension and in
 *   `dpr`, and is idempotent: fitting a plate into the box this function just
 *   gave it returns the same scale. **See the note below — this clause appeals
 *   to a convention that is written down nowhere.**
 * - `scale >= 0`, and `0` **only** for a box that measures 0 — a detached or
 *   `display: none` element, which a resize handler must survive rather than
 *   throw on. A zero scale here is not the "shrink to fit" failure the header
 *   warns about; it is "there is nowhere to draw yet".
 * - `plateWidth`/`plateHeight` must be finite and positive, and anything else
 *   throws: those are a programming error, not a measurement off the DOM.
 *
 * ### What the idempotence clause leaves unstated
 *
 * The clause above is correct and is tested (`scale.test.ts`, *"is idempotent:
 * re-fitting a plate into its own result changes nothing"*). What it does not
 * say is that it rests on a **convention this module never states**: that
 * "the box this function just gave it" means feeding `cssWidth`/`cssHeight`
 * back in as `availableWidth`/`availableHeight`. Those are four different
 * fields and the mapping between them is an interpretation, not a definition —
 * grepping either `scale.ts` or `scale.test.ts` for the word `convention`
 * returns nothing, and the one test embodies the mapping in a single call
 * without naming it as the rule the clause means.
 *
 * Two things follow that a reader is entitled to know, both measured:
 *
 * - **It is approximate, not exact.** The test asserts `toBeCloseTo(…, 9)`,
 *   and it has to: a 1500x720 plate in a 1281x803 box at dpr 1.7777777777
 *   re-fits to `1.5182222221557995` against the original `1.5182222221557997`.
 *   "Returns the same scale" is true to nine places, not bit for bit, because
 *   the second solve divides a quotient rather than the original length.
 * - **It is a claim about this function only.** {@link fitScale} happens to be
 *   idempotent under the same re-feeding, because it floors to an integer.
 *   `renderFit` is **not**: re-feeding its `cssWidth`/`cssHeight` lowers
 *   `sceneScale` — 0.828125 to 0.8277777… on the committed default scene in a
 *   1280x800 box, and 0.905 to 0.75 for a 2000x4 scene in 3840x2160 — because
 *   the plate it reports is built from a *floored* integer stage and is
 *   therefore narrower than the budget it was solved against. Nothing in
 *   `scale.test.ts` says so either way, so a future reader generalising this
 *   bullet across the module would be wrong.
 *
 * ## The centring offsets still go through {@link snapOffset}
 *
 * Deliberately, and it is not an oversight that a mode which has given up
 * pixel-exact scaling still pays for a whole-device-pixel origin. Design §8.3's
 * measurement is about the canvas element's **fractional device-pixel origin** —
 * a property of where the element sits, not of how much it is scaled — and
 * `snapOffset`'s own contract takes a `spare` in CSS px and a `dpr`. It never
 * sees the scale, so a non-integer one is nothing it has to accept: there is no
 * shipped behaviour here to change. `contain` gives up pixel-exact *scaling*
 * because R20 says to; it has no reason to also give up a whole-pixel *origin*,
 * which is free, and which keeps the letterboxed axis from landing the plate on
 * a half pixel on top of everything else.
 */
export function containFit({
  plateWidth,
  plateHeight,
  availableWidth,
  availableHeight,
  dpr = 1,
}: FitInput): Fit {
  if (!Number.isFinite(plateWidth) || plateWidth <= 0) {
    throw new Error(
      `containFit: plateWidth must be a finite positive number of pixels, got ` +
      `${JSON.stringify(plateWidth)}`,
    )
  }
  if (!Number.isFinite(plateHeight) || plateHeight <= 0) {
    throw new Error(
      `containFit: plateHeight must be a finite positive number of pixels, got ` +
      `${JSON.stringify(plateHeight)}`,
    )
  }
  const ratio = usableDpr(dpr)
  const availW = Number.isFinite(availableWidth) && availableWidth > 0 ? availableWidth : 0
  const availH = Number.isFinite(availableHeight) && availableHeight > 0 ? availableHeight : 0

  // The per-axis quotients, in device px ÷ backing-store px. Same two
  // expressions `snapScale` floors; here they are kept whole, which is the
  // entire difference between the two modes.
  const byWidth = (availW * ratio) / plateWidth
  const byHeight = (availH * ratio) / plateHeight
  const scale = Math.min(byWidth, byHeight)

  const deviceWidth = scale * plateWidth
  const deviceHeight = scale * plateHeight
  const cssWidth = deviceWidth / ratio
  const cssHeight = deviceHeight / ratio
  // A tolerance rather than `===` because the two quotients come from different
  // divisions: a box that is exactly the plate's aspect ratio can still produce
  // two doubles a ulp apart, and labelling that tie 'width' would put a false
  // "width is the binding constraint" into a note a reader is meant to trust.
  const tied = Math.abs(byWidth - byHeight) <= NEAR * Math.max(1, byWidth, byHeight)
  return {
    scale,
    cssWidth,
    cssHeight,
    deviceWidth,
    deviceHeight,
    // Always false for a box with a size — kept in the shape, and computed by
    // the same predicate as `fitScale`, so a caller switching modes at runtime
    // reads one field rather than branching on which mode produced it.
    overflowsWidth: cssWidth > availW + 1e-6,
    overflowsHeight: cssHeight > availH + 1e-6,
    overflows: cssWidth > availW + 1e-6 || cssHeight > availH + 1e-6,
    limit: tied ? 'both' : byWidth < byHeight ? 'width' : 'height',
    offsetX: snapOffset(availW - cssWidth, ratio),
    offsetY: snapOffset(availH - cssHeight, ratio),
  }
}

/* ------------------------------------------- scene → backing store, shared */

/**
 * The scene's resolved `noiseScale`, which is the plate px → backing-store px
 * factor and nothing else.
 *
 * Merged over {@link DEFAULT_STEREO} rather than through `resolveStereo`: that
 * function validates the *whole* stereo block and throws for settings that have
 * no bearing on geometry, and a layout pass that refused to measure a plate
 * because `sepNear` was 1 would be answering a question it was not asked. The
 * check here is only what this arithmetic needs — a positive, finite factor.
 * `resolveStereo` remains the authority at render time, and it is stricter
 * (a positive **integer**, because the factor is a pixel replication count).
 */
function noiseScaleOf(scene: Scene): number {
  const noiseScale = scene.stereo?.noiseScale ?? DEFAULT_STEREO.noiseScale
  if (!Number.isFinite(noiseScale) || noiseScale <= 0) {
    throw new Error(
      `stereo.noiseScale must be a finite positive number, got ${JSON.stringify(noiseScale)}`,
    )
  }
  return noiseScale
}

/** A canvas's `width`/`height`, in **backing-store px**. */
export interface BackingStore {
  readonly width: number
  readonly height: number
}

/**
 * The backing store a scene renders into: `plateLayoutOf(scene).plate` — margins
 * included — multiplied by `noiseScale`.
 *
 * This is the bridge from the scene to the two spaces {@link fitScale} and
 * {@link containFit} work in, and it is exported because every caller of theirs
 * needs it and a second derivation is a second thing that can disagree. The
 * `plateWidth` those functions take is this `width`, **not** `scene.size[0]`:
 * passing the scene size would drop the margins and double-count nothing, but
 * passing the plate without `noiseScale` would under-count by a factor of 2 at
 * the defaults, which is the double-count the file header warns about wearing
 * its other face.
 */
export function backingStoreOf(scene: Scene): BackingStore {
  const { plate } = plateLayoutOf(scene)
  const noiseScale = noiseScaleOf(scene)
  return { width: plate.width * noiseScale, height: plate.height * noiseScale }
}

/* -------------------------------------------------- render (re-render, R21) */

export interface RenderFitInput {
  /**
   * The scene as authored. Only `size` and `stereo` are read: nothing a layer
   * does changes the plate's geometry.
   */
  readonly scene: Scene
  /** CSS px the canvas may occupy horizontally. Coerced like {@link SnapInput}. */
  readonly availableWidth: number
  /** CSS px the canvas may occupy vertically. Coerced like {@link SnapInput}. */
  readonly availableHeight: number
  readonly dpr?: number
}

/**
 * A plan for re-rendering a scene at a container's size. **Not a render.**
 *
 * Every field names the pixel space it is counted in, because this type spans
 * all four of them and a mislabelled one is the defect this whole module exists
 * to prevent.
 */
export interface RenderFit {
  /**
   * The factor every **scene-px** quantity must be multiplied by: `scene.size`
   * and, with it, each layer's `at`, a text layer's `size`, a shape's `r`/`w`/`h`
   * — which is what "stroke widths scale with the frame" (design §8.1) means and
   * what requirements §7 C1 priced as the cost of this mode.
   *
   * Dimensionless: scene px ÷ scene px. It is **not** a display ratio and must
   * never be written into `style.width`; `render` displays its backing store at
   * exactly one device pixel per backing pixel, which is the whole point.
   */
  readonly sceneScale: number
  /** Target stage width, in **scene px**. A positive integer. */
  readonly sceneWidth: number
  /** Target stage height, in **scene px**. A positive integer. */
  readonly sceneHeight: number
  /**
   * The dead strips either side of the stage, in **scene px** — which is also
   * **plate px**, the two being the same space. Constant in `sceneScale`; see
   * {@link renderFit}.
   */
  readonly margins: Margins
  /** `margins.left + sceneWidth + margins.right`, in **plate px**. */
  readonly plateWidth: number
  /** `sceneHeight`, in **plate px**: margins are x-only. */
  readonly plateHeight: number
  /** The scene's resolved `stereo.noiseScale`. Plate px → backing-store px. */
  readonly noiseScale: number
  /** `plateWidth * noiseScale`, in **backing-store px** — i.e. `canvas.width`. */
  readonly backingWidth: number
  /** `plateHeight * noiseScale`, in **backing-store px** — i.e. `canvas.height`. */
  readonly backingHeight: number
  /**
   * What to write into `style.width`, in **CSS px**: `backingWidth / dpr`, so
   * the backing store lands on device pixels 1:1 and nothing is resampled.
   */
  readonly cssWidth: number
  /** `backingHeight / dpr`, in **CSS px**. */
  readonly cssHeight: number
  /** Left centring offset in CSS px, snapped by {@link snapOffset}. */
  readonly offsetX: number
  /** Top centring offset in CSS px, snapped by {@link snapOffset}. */
  readonly offsetY: number
  readonly overflowsWidth: boolean
  readonly overflowsHeight: boolean
  readonly overflows: boolean
  /** Which axis bound the ideal scale, before any clamp. */
  readonly limit: FitLimit
  /**
   * `sceneScale` is **not** the solve: one of the two bounds took over.
   *
   * Two bounds, one flag, and they behave oppositely — which is worth knowing
   * before reading it:
   *
   * - the **floor** (a box too small to hold even a one-pixel stage) hands back
   *   a plate *bigger* than the box, so `overflows` is true with it;
   * - the **cap** ({@link MAX_SCENE_SCALE}, a box far larger than the authored
   *   plate) hands back a *smaller* one, so `overflows` is false and the plate
   *   letterboxes inside the container.
   *
   * One flag rather than two because a caller's question is the same either
   * way — "is this the size I asked for?" — and the direction is recoverable
   * from `overflows` and from `sceneScale` against the cap.
   */
  readonly clamped: boolean
}

/**
 * The largest `sceneScale` {@link renderFit} will solve for, **64**.
 *
 * ## Why there is an upper bound at all
 *
 * `renderFit`'s solve is driven by the container, and under `fit=render` the
 * container is a length *a third party chose*: R14's whole case is a host page
 * pasting an `<iframe src>` into a layout we will never see, and `width:
 * 100000px` is legal CSS. The result of the solve is then handed to a
 * rasteriser as `scene.size` and as `canvas.width`/`height`. Before this bound
 * existed there was none — the floor at a one-pixel scene is a *lower* bound
 * and `clamped` reported only that — so a 1e6 CSS px container asked the
 * default scene for a `sceneScale` of **781078**, i.e. a 500-megapixel-wide
 * stage. This is a resource bound, not a quality judgement: nothing about the
 * picture is wrong at 781078x, there is simply no machine that will draw it.
 *
 * ## Why the bound is a scene multiplier and not a pixel count
 *
 * `scene.size` is the one length in the whole chain that a host page cannot
 * inflate. Bounding `sceneScale` therefore bounds the rasteriser's input to a
 * multiple of **what the author actually authored**, which is the only quantity
 * here anyone has a claim over.
 *
 * ## Why 64, and the honest statement of what it is
 *
 * **64 is a judgement, not a measurement.** Nobody has measured where
 * `renderFrame` stops being able to allocate, and a threshold presented as
 * measured when it is not would be worse than none.
 *
 * What can be said precisely is where it engages. The widest device-pixel
 * budget real hardware offers is of the order of 6000 px (a 2560 CSS px panel
 * at `devicePixelRatio` 2, or a 3840 CSS px desktop at 1.5), which at the
 * default `noiseScale` **2** is about 3000 plate px. 64x therefore needs an
 * authored stage narrower than roughly 45 plate px, and `site/scale.test.ts`
 * asserts that no scene from 300x160 upward reaches the cap in a 3840x2160 box
 * at any dpr in its sweep. So the bound cannot change what an ordinary embed of
 * a realistically authored scene does; it engages only for a deliberately tiny
 * scene or a deliberately absurd container.
 *
 * Lower was considered and rejected: a 16x16 scene in an ordinary 1280x800 box
 * at dpr 3 solves to 75, so a cap of 8 or 16 would letterbox small scenes as a
 * matter of routine, which is a layout decision this constant has no business
 * making.
 *
 * ## The limitation, recorded rather than papered over
 *
 * A cap in scene-multiples is necessarily looser for a large scene than for a
 * small one: at 64x the committed 640x360 default would still reach an
 * 82140x46080 backing store, which no allocator will serve. Reaching it needs a
 * container of ~82000 CSS px, so it is only reachable by a host page that has
 * asked for it — but it is reachable. A bound that was uniform in memory would
 * have to cap `backingWidth * backingHeight`, and that needs the measurement
 * nobody has taken. This is the weaker bound that can be stated honestly today,
 * and it is strictly better than the none that was here before.
 */
export const MAX_SCENE_SCALE = 64

/**
 * The plan for `fit=render`: how much to scale a scene's geometry so that the
 * plate it emits fits the container exactly, at one backing pixel per device
 * pixel.
 *
 * Design §8.1: *"re-render at the container's exact size, scene geometry scaled.
 * Pixel-exact; stroke widths scale with the frame."* This is the mode that
 * honours the file header's no-downscale rule by a different route from
 * {@link fitScale}: it never resamples, so no source column is ever dropped —
 * there simply are fewer columns, authored smaller.
 *
 * ## The chain, named at every step
 *
 * The container is measured in CSS px and the thing being scaled is in scene px,
 * and the four spaces between them do not compose into a single multiply:
 *
 * | step | operation |
 * |---|---|
 * | scene px → plate px | **add** `margins.left + margins.right` (x only; `plate.height === stage.height`) |
 * | plate px → backing-store px | × `noiseScale` (default **2**) |
 * | backing-store px → device px | × **1** — the mode's defining choice |
 * | device px → CSS px | ÷ `dpr` |
 *
 * ## The one fact the arithmetic turns on: the margins are a CONSTANT
 *
 * `plateLayoutOf` is the authority and it is imported rather than re-derived.
 * What it says is that `marginsFor` reads `sepFar` and the algorithm **and
 * nothing else** — `ceil(sepFar/2)` either side for `linked`, `ceil(sepFar)` and
 * `ceil(sepFar/2)` for `shift`. The scene's width is not an input. So
 *
 *     plateWidth(s) = L + s·sceneWidth + R
 *
 * is **affine in `s`, not proportional to it**, and therefore
 *
 *     sceneScale  !=  containerWidth / plateWidth
 *
 * which is the mistake this comment exists to prevent. The dead strips have to
 * come out of the budget *before* the division:
 *
 *     sceneScale = min( (availableWidth·dpr/noiseScale − L − R) / sceneWidth,
 *                       (availableHeight·dpr/noiseScale)        / sceneHeight )
 *
 * And `sepFar` does not scale with the scene, which is why the margins do not:
 * separation is a property of the viewer's eyes, not of the picture
 * (requirements §7 C1). Scaling it would change the disparity budget — a
 * perceptual decision — in the course of answering a layout question. The
 * visible consequence is that the dead strips take a *growing* share of the
 * plate as the scene shrinks, and at some size the stage is a minority of what
 * is emitted. That is a real cost of this mode and it is asserted, not hidden.
 *
 * ## Contract
 *
 * - `sceneWidth`/`sceneHeight` are **integers** — a rasteriser cannot be handed
 *   a fractional stage (`padDepth` rejects one) — obtained by flooring, never
 *   rounding: rounding up is how a plan overflows the box it was solved for.
 * - For an unclamped plan the resulting backing store fits the box on both axes,
 *   and `cssWidth * dpr === backingWidth` exactly.
 * - `sceneScale` is monotonically non-decreasing in either available dimension
 *   and in `dpr`, and strictly increasing wherever the clamp is not in play.
 * - `sceneScale > 0` always. A box too small to hold even the margins has no
 *   solution — the unclamped formula goes to zero and then negative — and the
 *   answer is the smallest renderable scene plus `overflows`, not a zero or
 *   negative scale handed to a rasteriser.
 * - `sceneScale` never exceeds {@link MAX_SCENE_SCALE}, because the container is
 *   a length a third party chose and the solve would otherwise follow it
 *   anywhere. See that constant for why there is a ceiling and why it is 64.
 * - **Both clamps are flat**, which is where strict growth fails and the only
 *   place it does. They are reported by the one `clamped` flag and they differ
 *   in sign: the floor overflows the box, the cap letterboxes inside it.
 * - A scene whose `stereo` cannot produce margins throws from `plateLayoutOf`,
 *   where that rule lives. This function does not second-guess it.
 */
export function renderFit({
  scene,
  availableWidth,
  availableHeight,
  dpr = 1,
}: RenderFitInput): RenderFit {
  const [sceneW, sceneH] = scene.size
  if (
    !Number.isFinite(sceneW) || sceneW <= 0 ||
    !Number.isFinite(sceneH) || sceneH <= 0
  ) {
    throw new Error(
      `renderFit: scene.size must be two finite positive numbers of scene px, got ` +
      `${JSON.stringify(scene.size)}`,
    )
  }
  // The authority on margins, imported rather than restated. It throws for a
  // scene whose `sepFar` cannot be measured, and that is the right place for it
  // to throw.
  const { margins } = plateLayoutOf(scene)
  const noiseScale = noiseScaleOf(scene)
  const ratio = usableDpr(dpr)
  const availW = Number.isFinite(availableWidth) && availableWidth > 0 ? availableWidth : 0
  const availH = Number.isFinite(availableHeight) && availableHeight > 0 ? availableHeight : 0

  // CSS px → device px → backing-store px → plate px. Three of the four spaces
  // in two lines; the fourth is what we are solving for.
  const plateBudgetW = (availW * ratio) / noiseScale
  const plateBudgetH = (availH * ratio) / noiseScale
  // The subtraction that makes this affine rather than proportional.
  const dead = margins.left + margins.right
  const byWidth = (plateBudgetW - dead) / sceneW
  const byHeight = plateBudgetH / sceneH
  const ideal = Math.min(byWidth, byHeight)

  // The smallest scale that still floors to a whole pixel on BOTH axes, which
  // is the smallest scene a rasteriser will accept.
  const minScale = Math.max(1 / sceneW, 1 / sceneH)
  // Both bounds, in the order that makes the floor win. They can only conflict
  // for a scene authored smaller than one pixel on an axis (`scene.size` is
  // finite and positive but need not be integral), and there the floor has to
  // win: "renderable at all" outranks "within the resource bound".
  const sceneScale = Math.max(minScale, Math.min(ideal, MAX_SCENE_SCALE))
  // `!==` rather than `>`, because the clamp now works in both directions. An
  // exact comparison is right: `sceneScale` IS `ideal`, bit for bit, whenever
  // neither bound engaged.
  const clamped = sceneScale !== ideal

  const sceneWidth = Math.floor(sceneScale * sceneW + EPS)
  const sceneHeight = Math.floor(sceneScale * sceneH + EPS)
  const plateWidth = margins.left + sceneWidth + margins.right
  const plateHeight = sceneHeight
  const backingWidth = plateWidth * noiseScale
  const backingHeight = plateHeight * noiseScale
  const cssWidth = backingWidth / ratio
  const cssHeight = backingHeight / ratio
  const tied = Math.abs(byWidth - byHeight) <= NEAR * Math.max(1, Math.abs(byWidth), Math.abs(byHeight))
  return {
    sceneScale,
    sceneWidth,
    sceneHeight,
    margins,
    plateWidth,
    plateHeight,
    noiseScale,
    backingWidth,
    backingHeight,
    cssWidth,
    cssHeight,
    offsetX: snapOffset(availW - cssWidth, ratio),
    offsetY: snapOffset(availH - cssHeight, ratio),
    overflowsWidth: cssWidth > availW + 1e-6,
    overflowsHeight: cssHeight > availH + 1e-6,
    overflows: cssWidth > availW + 1e-6 || cssHeight > availH + 1e-6,
    limit: tied ? 'both' : byWidth < byHeight ? 'width' : 'height',
    clamped,
  }
}

/* ----------------------------------------------- the three modes, dispatched */

/**
 * One input for all three modes.
 *
 * Identical to {@link RenderFitInput} by construction rather than by copy: the
 * scene is the only thing any of them needs that the container does not supply,
 * and a caller should not have to know which mode wants a plate size and which
 * wants a scene. {@link backingStoreOf} does that conversion once.
 */
export type PlanFitInput = RenderFitInput

/**
 * A plan that changes **how an already-rendered backing store is displayed**.
 *
 * `snap` and `contain` both land here. They disagree about the scale and about
 * nothing else, which is why they share a payload: the caller's job is identical
 * for both — set `style.width`/`height`, set the offsets, do not re-render.
 */
export interface RescalePlan {
  readonly kind: 'rescale'
  readonly mode: 'snap' | 'contain'
  /** The layout, in the same shape for both modes. See {@link Fit}. */
  readonly fit: Fit
  /** The backing store the plan was computed against, in backing-store px. */
  readonly backingWidth: number
  readonly backingHeight: number
  /**
   * **CSS px shown ÷ backing-store px** — `fit.scale / dpr`, *not* `fit.scale`.
   *
   * A layout ratio: how big the canvas is in the unit the stylesheet and the
   * container are written in. That is all it is, and it is kept because that
   * question is a real one and `scale.test.ts` pins the answer.
   *
   * ## It is NOT the ratio `imageRenderingFor` takes. That was argued here, and
   * it was wrong.
   *
   * What stood in this docblock was: *"This is the ratio `imageRenderingFor` in
   * `site/smooth.ts` takes, and it is carried here so that the one call site
   * bridging fit and smoothing cannot get the pixel space wrong: `Fit.scale` is
   * device px ÷ backing-store px, and handing that to the smoothing policy
   * would call a 1x plate on a dpr-2 panel an upscale and pixelate a picture
   * that is in fact being halved."*
   *
   * The picture is not being halved. At `displayScale` 1 on a dpr-2 panel each
   * backing pixel covers a **2x2 block of device pixels** — it is being
   * doubled, and `pixelated` is exactly right for it. The step the browser
   * resamples at is backing store → **device grid**; CSS px are a layout unit
   * and nothing is ever resampled into them. So the smoothing policy takes
   * {@link devicePerBackingScale}, and the consequence of the old reading was
   * that at dpr 2 every CSS ratio in (0.5, 1) — which is every 1x `snap` plan
   * and every re-render — was a genuine device upscale being blended.
   *
   * The refuted argument is quoted rather than deleted because the thing worth
   * preserving is not the conclusion but the fact that somebody stood here,
   * considered both directions, and picked the wrong one. A reader who finds
   * only the rule has no reason to check it. The division is a no-op at dpr 1,
   * so nothing but a second dpr in a test will ever show the difference.
   */
  readonly displayScale: number
  /**
   * **Device px drawn ÷ backing-store px** — `fit.scale`, carried under a name
   * that says both spaces.
   *
   * This is the ratio the browser resamples by and therefore the one
   * `imageRenderingFor` in `site/smooth.ts` takes. It is a field rather than a
   * division at the call site for the reason {@link displayScale} was: the one
   * place that bridges fit and smoothing should not have to re-derive a ratio
   * whose two readings differ by a factor nobody can see at dpr 1.
   */
  readonly devicePerBackingScale: number
}

/**
 * A plan that changes **what gets rendered**.
 *
 * Only `render` lands here. The distinction from {@link RescalePlan} is the
 * reason this is a discriminated union and not one wide object: a caller that
 * cannot tell them apart will resample a re-rendered frame — pay for
 * pixel-exactness and then throw it away — and nothing downstream would report
 * it, because the result merely looks slightly soft.
 */
export interface RerenderPlan {
  readonly kind: 'rerender'
  readonly mode: 'render'
  readonly plan: RenderFit
  /**
   * `1 / dpr`, always: a re-render is displayed one backing pixel per **device**
   * pixel by construction, so in CSS px it is `1 / dpr` and nothing else.
   *
   * A layout ratio, like {@link RescalePlan.displayScale}, and like that field
   * **not** what the smoothing policy is given — see the refuted argument
   * recorded there. {@link devicePerBackingScale} is the resampling ratio, and
   * for this plan it is 1 at every dpr.
   */
  readonly displayScale: number
  /**
   * **`1`, always** — the same quantity as {@link RescalePlan.devicePerBackingScale}
   * and the mode's defining choice, stated in the space it is a choice about.
   *
   * `renderFit`'s contract is `cssWidth * dpr === backingWidth` exactly, so one
   * backing pixel lands on one device pixel at every `dpr`. The CSS-px reading
   * of the same plan is `1 / dpr` and moves; this one does not, which is the
   * clearest single demonstration that they are not interchangeable.
   */
  readonly devicePerBackingScale: number
}

/** What {@link planFit} returns. Discriminated on `kind`. */
export type FitPlan = RescalePlan | RerenderPlan

/**
 * The fit mode's arithmetic, chosen by name.
 *
 * Parsing is **not** done here — `parseFit` in `site/fit.ts` is the caller's
 * job and this module is arithmetic. The split is deliberate: a URL is
 * untrusted and a `FitMode` is not, and mixing the two would make every test of
 * the arithmetic also a test of the query string.
 *
 * The `switch` ends in an {@link AssertNever} guard rather than a `default` that
 * falls back to a mode. That is the mechanism design §11's "moving a fit mode
 * costs one registration" turns on: adding a fourth member to `FitMode` makes
 * this file a **compile error**, naming the exact place the new mode's
 * arithmetic is missing, instead of silently letterboxing it. The runtime throw
 * behind the guard is not dead code — it is what a caller lying to the compiler
 * (an `as FitMode`, a registry read at runtime) gets instead of `undefined`,
 * which in a layout path would read as "no scale" and paint nothing.
 */
export function planFit(mode: FitMode, input: PlanFitInput): FitPlan {
  const ratio = usableDpr(input.dpr)
  const rescale = (named: 'snap' | 'contain', fit: Fit, backing: BackingStore): RescalePlan => ({
    kind: 'rescale',
    mode: named,
    fit,
    backingWidth: backing.width,
    backingHeight: backing.height,
    displayScale: fit.scale / ratio,
    devicePerBackingScale: fit.scale,
  })
  switch (mode) {
    case 'snap':
    case 'contain': {
      const backing = backingStoreOf(input.scene)
      const args: FitInput = {
        plateWidth: backing.width,
        plateHeight: backing.height,
        availableWidth: input.availableWidth,
        availableHeight: input.availableHeight,
        dpr: input.dpr,
      }
      return rescale(mode, mode === 'snap' ? fitScale(args) : containFit(args), backing)
    }
    case 'render': {
      const plan = renderFit(input)
      return {
        kind: 'rerender',
        mode: 'render',
        plan,
        displayScale: 1 / ratio,
        devicePerBackingScale: 1,
      }
    }
    default: {
      // `mode` is `never` here, and stops being `never` the moment a mode is
      // added to `FitMode` without a case above.
      const unhandled: AssertNever<typeof mode> = mode
      throw new Error(`planFit: unhandled fit mode ${JSON.stringify(unhandled)}`)
    }
  }
}

/**
 * The one-line receipt for presentation mode.
 *
 * Presentation mode hides every panel, this note included, so nobody reads it on
 * screen — which is not why it exists. It is the **machine-readable receipt**
 * the headless browser check reads back out of the DOM to confirm that the scale
 * the page applied is the scale the arithmetic chose, and it is what the panel
 * shows the instant Escape puts the page back. Keeping one function per mode
 * also keeps `scaleNote`'s wording about the row/column decision out of a mode
 * that has no columns.
 */
export function fitNote(fit: Fit, dpr = 1): string {
  const ratio = usableDpr(dpr)
  const head =
    `Presenting at exactly ${fit.scale}x — ${fit.deviceWidth}x${fit.deviceHeight} ` +
    `device px, devicePixelRatio ${+ratio.toFixed(3)}.`
  const bound =
    fit.limit === 'both'
      ? ` Width and height bind it equally.`
      : ` ${fit.limit === 'width' ? 'Width' : 'Height'} is the binding constraint.`
  const tail = fit.overflows
    ? ` At 1:1 this plate is still larger than the viewport ` +
      `(${fit.overflowsWidth ? 'horizontally' : ''}` +
      `${fit.overflowsWidth && fit.overflowsHeight ? ' and ' : ''}` +
      `${fit.overflowsHeight ? 'vertically' : ''}), so it is centred and scrolls ` +
      `rather than being shrunk — below 1:1 whole columns are dropped and it stops fusing.`
    : ` The rest of the viewport is page background, not image.`
  return `${head}${bound}${tail}`
}

export interface ViewLayoutInput {
  /** Backing-store width of the plate, in px. */
  readonly plateWidth: number
  /** Backing-store height of the plate, in px. */
  readonly plateHeight: number
  /** `clientWidth` of the element holding both views, in CSS px. */
  readonly containerWidth: number
  /** The grid's column gap, in CSS px. */
  readonly gap: number
  readonly dpr?: number
  /** The "use the full width" control. */
  readonly fullWidth?: boolean
  /**
   * Narrowest side-by-side track that is still usable, in CSS px.
   *
   * Must match the figure that `styles.css` was written against. Below it the
   * views stack regardless of the scale: the depth panel is load-bearing
   * (design §5) and a 170px-wide column with a `<select>` and two paragraphs in
   * it is collapsed in all but name.
   */
  readonly minTrack?: number
}

/** Why {@link viewLayout} chose the layout it chose. */
export type StackReason =
  /** Two views side by side; the plate fits one track at this scale. */
  | 'row'
  /** The full-width control is on, so the plate claims the whole row. */
  | 'full-width'
  /** The plate does not fit a track even at 1:1. */
  | 'too-wide'
  /** A track would be too narrow to use, whatever the plate's size. */
  | 'too-narrow'

export interface ViewLayout extends Snap {
  /** `style.height` for the canvas. Integer device height by construction. */
  readonly cssHeight: number
  /** Stack the stereo and depth views into a column instead of a row. */
  readonly stacked: boolean
  readonly reason: StackReason
  /** Width one track gets in the two-column layout, in CSS px. */
  readonly trackWidth: number
}

/**
 * The scale **and** the row-or-column decision, together, because the second
 * depends on the first.
 *
 * The old `grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px),
 * 1fr))` reflowed on *viewport* width, which is the wrong trigger: what decides
 * whether two views fit side by side is whether **two plates at the chosen
 * scale** do, and that depends on the plate, on `noiseScale` and on `dpr` — none
 * of which a media query can see. At dpr 1 a 1500px plate needs a 1500px track,
 * so the 1280px viewport that `auto-fit` happily gives two 592px columns to
 * cannot host a row at all.
 *
 * So the CSS now carries a plain two-column grid plus a `.stacked` modifier and
 * this function is the only thing that chooses between them.
 *
 * `trackWidth` is derived arithmetically from `containerWidth` and `gap` rather
 * than measured off the DOM, and that is deliberate: the track width depends on
 * the `.stacked` class, which depends on the scale, which would then depend on
 * the track width. Measuring it would close that loop and the layout would
 * oscillate. The container's own width is independent of all of it — the canvas
 * lives in an `overflow-x: auto` scroller with `min-width: 0`, so it never
 * widens its track.
 */
export function viewLayout({
  plateWidth,
  plateHeight,
  containerWidth,
  gap,
  dpr = 1,
  fullWidth = false,
  minTrack = 320,
}: ViewLayoutInput): ViewLayout {
  if (!Number.isFinite(plateHeight) || plateHeight <= 0) {
    throw new Error(
      `viewLayout: plateHeight must be a finite positive number of pixels, got ` +
      `${JSON.stringify(plateHeight)}`,
    )
  }
  const total = Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : 0
  const gutter = Number.isFinite(gap) && gap > 0 ? gap : 0
  const trackWidth = Math.max(0, (total - gutter) / 2)

  const finish = (snap: Snap, stacked: boolean, reason: StackReason): ViewLayout => ({
    ...snap,
    cssHeight: (snap.scale * plateHeight) / usableDpr(dpr),
    stacked,
    reason,
    trackWidth,
  })

  if (fullWidth) {
    return finish(snapScale({ plateWidth, availableWidth: total, dpr }), true, 'full-width')
  }
  if (trackWidth < minTrack) {
    return finish(snapScale({ plateWidth, availableWidth: total, dpr }), true, 'too-narrow')
  }
  const row = snapScale({ plateWidth, availableWidth: trackWidth, dpr })
  if (!row.overflows) return finish(row, false, 'row')
  return finish(snapScale({ plateWidth, availableWidth: total, dpr }), true, 'too-wide')
}

/**
 * One line of prose for the panel.
 *
 * It exists for the `overflows` case. A visitor whose window is narrower than
 * the plate gets a canvas that scrolls sideways, and without being told why
 * that reads as a broken page — so the sentence has to say both that the plate
 * is not being shrunk and *why* shrinking it is not on offer. The rest of the
 * time it is a one-line receipt for the scale, which is also the only place the
 * fix is visible at all when it is working.
 *
 * Device pixels are named rather than CSS pixels because that is what was
 * snapped: at dpr 1.5 a "1x" plate is 1000 CSS px wide and quoting 1000 would
 * invite the reader to check the wrong arithmetic.
 */
export function scaleNote(layout: ViewLayout, dpr = 1): string {
  const ratio = usableDpr(dpr)
  const deviceHeight = Math.round(layout.cssHeight * ratio)
  const head =
    `Displayed at exactly ${layout.scale}x — ${layout.deviceWidth}x${deviceHeight} ` +
    `device px, devicePixelRatio ${+ratio.toFixed(3)}.`
  const why =
    `The scale is snapped to a whole number of device pixels per plate pixel: at a ` +
    `fractional scale nearest-neighbour gives paired pixels unequal widths and the ` +
    `pairing breaks in visible columns.`
  const tail = layout.overflows
    ? ` This plate is wider than the space available, so it scrolls sideways — a ` +
      `stereogram cannot be shrunk to fit (below 1:1 whole columns are dropped and ` +
      `it stops fusing), so it is never downscaled. Reduce the scene width or ` +
      `noiseScale for a plate that fits.`
    : ''
  return `${head} ${why}${tail}`
}
