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

/** Slack for the `floor`, so a ratio that is 1.9999999 in binary reads as 2. */
const EPS = 1e-9

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
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
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
  /** Backing store → device pixels. A positive **integer**, never 0. */
  readonly scale: number
  readonly cssWidth: number
  readonly cssHeight: number
  /** `scale * plateWidth`. Integer by construction. */
  readonly deviceWidth: number
  /** `scale * plateHeight`. Integer by construction. */
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
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
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
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
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
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
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
    cssHeight: (snap.scale * plateHeight) / (Number.isFinite(dpr) && dpr > 0 ? dpr : 1),
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
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
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
