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
