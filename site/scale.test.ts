import { describe, expect, it } from 'vitest'
import { agreement, encoderFor, nearestScaleX, report, slabDepth } from '../src/core/testing/metamorphic.js'
import { OFFSET_SEARCH, fitNote, fitScale, scaleNote, snapOffset, snapScale, viewLayout } from './scale.js'
import type { SirdsOpts } from '../src/core/types.js'

/**
 * The display scale, and the measurement that says why it has to be an integer.
 *
 * Three groups:
 *
 * 1. {@link snapScale} / {@link viewLayout} / {@link scaleNote} — ordinary unit
 *    tests over the arithmetic.
 * 2. **The correspondence measurement.** A rendered plate is resampled the way
 *    a browser resamples it (`image-rendering: pixelated`, i.e. nearest
 *    neighbour) and the surviving `sep`-separated agreement is scored. This is
 *    the test that was missing while the bug was live: nothing in the suite
 *    looked at the plate *after* the display transform, so a page that halved
 *    the plate on its way to the screen was indistinguishable from one that did
 *    not.
 * 3. The two together: every scale `snapScale` is willing to return keeps
 *    agreement at 1.0000, and the scale `width: 100%` actually produced does
 *    not.
 *
 * **The window is restricted to background on purpose.** A whole-image score is
 * contaminated: the object region legitimately encodes a different period, so
 * `agreement` over the full width reads 0.8950 on an *unscaled* plate and a
 * threshold set from that number measures the object, not the scaling. The
 * measurement below pins the contaminated figure as well, so the next reader
 * does not have to rediscover it.
 */

/* ------------------------------------------------------------- snapScale */

describe('snapScale', () => {
  it('returns the largest integer scale that fits', () => {
    expect(snapScale({ plateWidth: 750, availableWidth: 1600, dpr: 1 }).scale).toBe(2)
    expect(snapScale({ plateWidth: 750, availableWidth: 2249, dpr: 1 }).scale).toBe(2)
    expect(snapScale({ plateWidth: 750, availableWidth: 2250, dpr: 1 }).scale).toBe(3)
    expect(snapScale({ plateWidth: 1500, availableWidth: 1920, dpr: 1 }).scale).toBe(1)
  })

  it('never returns 0, a negative, or a fraction — even for a degenerate box', () => {
    for (const availableWidth of [0, -1, -1e9, 1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const snap = snapScale({ plateWidth: 1500, availableWidth, dpr: 1 })
      expect(Number.isInteger(snap.scale), `availableWidth ${availableWidth}`).toBe(true)
      expect(snap.scale).toBeGreaterThanOrEqual(1)
    }
    // A zero scale is the "shrink it to fit" failure wearing a different hat:
    // it would produce a tidy page holding an unfusable image.
    expect(snapScale({ plateWidth: 1500, availableWidth: 10, dpr: 1 }).scale).toBe(1)
  })

  it('snaps in DEVICE pixels, so a fractional dpr still lands on a whole number', () => {
    // The trap this whole module exists for: an integer CSS scale at dpr 1.5 is
    // a fractional DEVICE scale, and the artifact comes straight back.
    for (const dpr of [1, 1.25, 1.5, 2, 2.5, 3, 1.7777777777]) {
      for (const availableWidth of [320, 700, 1280, 1600, 1920, 3840]) {
        for (const plateWidth of [750, 1500, 751, 16]) {
          const snap = snapScale({ plateWidth, availableWidth, dpr })
          expect(Number.isInteger(snap.scale)).toBe(true)
          expect(snap.deviceWidth).toBe(snap.scale * plateWidth)
          expect(Number.isInteger(snap.deviceWidth)).toBe(true)
          // The identity the browser has to honour. Asserted exactly, not with a
          // tolerance: `cssWidth` is derived by dividing, so any slack here
          // would hide a rounding bug rather than reveal one.
          expect(snap.cssWidth * dpr).toBeCloseTo(snap.deviceWidth, 9)
        }
      }
    }
  })

  it('is monotonically non-decreasing in the available width', () => {
    let previous = 0
    for (let availableWidth = 0; availableWidth <= 6000; availableWidth += 7) {
      const { scale } = snapScale({ plateWidth: 750, availableWidth, dpr: 1.5 })
      expect(scale).toBeGreaterThanOrEqual(previous)
      previous = scale
    }
    expect(previous).toBeGreaterThan(1)
  })

  it('is monotonically non-decreasing in dpr', () => {
    let previous = 0
    for (const dpr of [0.5, 1, 1.25, 1.5, 2, 2.5, 3, 4]) {
      const { scale } = snapScale({ plateWidth: 750, availableWidth: 1280, dpr })
      expect(scale).toBeGreaterThanOrEqual(previous)
      previous = scale
    }
  })

  it('reports an overflow exactly when the plate does not fit', () => {
    expect(snapScale({ plateWidth: 1500, availableWidth: 1500, dpr: 1 }).overflows).toBe(false)
    expect(snapScale({ plateWidth: 1500, availableWidth: 1499, dpr: 1 }).overflows).toBe(true)
    // ...and an overflow can only ever happen at 1:1, because any higher scale
    // was chosen *because* it fit.
    for (let availableWidth = 1; availableWidth < 4000; availableWidth += 13) {
      const snap = snapScale({ plateWidth: 1500, availableWidth, dpr: 1.25 })
      if (snap.overflows) expect(snap.scale).toBe(1)
    }
  })

  it('does not lose a whole step to binary floor error', () => {
    // 1.5 * 500 is exactly 750 in binary, but plenty of neighbouring triples
    // are not, and `floor` on a ratio that lands at 1.9999999996 would silently
    // halve the picture. Swept rather than argued.
    for (let plateWidth = 300; plateWidth <= 400; plateWidth++) {
      for (const dpr of [1.1, 1.3, 2.4, 1 / 3]) {
        const availableWidth = (3 * plateWidth) / dpr
        expect(
          snapScale({ plateWidth, availableWidth, dpr }).scale,
          `${plateWidth} @ ${dpr}`,
        ).toBe(3)
      }
    }
  })

  it('rejects a plate width that is not a real measurement', () => {
    for (const plateWidth of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => snapScale({ plateWidth, availableWidth: 800 })).toThrow(/plateWidth/)
    }
  })
})

/* ------------------------------------------------------------ viewLayout */

const DEFAULT_PLATE = { plateWidth: 1500, plateHeight: 720 }

describe('viewLayout', () => {
  it('keeps the two views in a row when the plate fits one track', () => {
    const layout = viewLayout({
      plateWidth: 600, plateHeight: 300, containerWidth: 1400, gap: 16, dpr: 1,
    })
    expect(layout.stacked).toBe(false)
    expect(layout.reason).toBe('row')
    expect(layout.scale).toBe(1)
    expect(layout.trackWidth).toBe(692)
  })

  it('stacks when the plate is wider than a track even at 1:1', () => {
    // The committed default scene: 640x360 stage, sepFar 110, `linked` → a 750px
    // plate, x noiseScale 2 → a 1500px backing store. There is no desktop width
    // at which two of those fit side by side, which is exactly why the trigger
    // cannot be a media query.
    const layout = viewLayout({ ...DEFAULT_PLATE, containerWidth: 1400, gap: 16, dpr: 1 })
    expect(layout.reason).toBe('too-wide')
    expect(layout.stacked).toBe(true)
    expect(layout.scale).toBe(1)
    expect(layout.cssWidth).toBe(1500)
    expect(layout.overflows).toBe(true)
  })

  it('stacks when a track would be too narrow to use, whatever the scale', () => {
    // The depth panel is load-bearing (design §5) — a 170px column holding a
    // <select> and two paragraphs is collapsed in all but name.
    const layout = viewLayout({
      plateWidth: 100, plateHeight: 50, containerWidth: 360, gap: 16, dpr: 1,
    })
    expect(layout.reason).toBe('too-narrow')
    expect(layout.stacked).toBe(true)
    expect(layout.scale).toBe(3)
  })

  it('full width means the largest integer scale that fits the whole row', () => {
    const row = viewLayout({
      plateWidth: 300, plateHeight: 150, containerWidth: 1400, gap: 16, dpr: 1,
    })
    const full = viewLayout({
      plateWidth: 300, plateHeight: 150, containerWidth: 1400, gap: 16, dpr: 1, fullWidth: true,
    })
    expect(row.scale).toBe(2)
    expect(full.scale).toBe(4)
    expect(full.cssWidth).toBe(1200)
    // Not `width: 100%` — 1200, not 1400. Filling the last 200px would need a
    // fractional scale, which is the defect.
    expect(full.cssWidth).toBeLessThan(1400)
    expect(full.stacked).toBe(true)
    expect(full.reason).toBe('full-width')
  })

  it('never gives full width a smaller scale than the row layout', () => {
    for (const containerWidth of [320, 700, 1024, 1280, 1600, 1920, 2560]) {
      for (const dpr of [1, 1.5, 2]) {
        for (const plateWidth of [120, 750, 1500, 3000]) {
          const common = { plateWidth, plateHeight: 100, containerWidth, gap: 16, dpr }
          expect(
            viewLayout({ ...common, fullWidth: true }).scale,
            `${plateWidth} in ${containerWidth} @ ${dpr}`,
          ).toBeGreaterThanOrEqual(viewLayout(common).scale)
        }
      }
    }
  })

  it('scales height by the same integer, so nothing is distorted', () => {
    for (const dpr of [1, 1.5, 2.5]) {
      const layout = viewLayout({
        plateWidth: 1500, plateHeight: 720, containerWidth: 6400, gap: 16, dpr, fullWidth: true,
      })
      expect(layout.cssHeight / layout.cssWidth).toBeCloseTo(720 / 1500, 12)
      expect(layout.cssHeight * dpr).toBeCloseTo(layout.scale * 720, 9)
    }
  })

  it('stacks whenever the chosen canvas is wider than a track', () => {
    // The actual invariant behind the row/column decision, swept rather than
    // reasoned about. "Two plates at this scale fit side by side" is the whole
    // trigger; the three `reason` values are just why it came out that way.
    for (const containerWidth of [200, 360, 700, 1024, 1280, 1600, 1920, 2560, 3840]) {
      for (const dpr of [1, 1.25, 1.5, 2, 3]) {
        for (const plateWidth of [16, 120, 300, 750, 1500, 3000]) {
          for (const fullWidth of [false, true]) {
            const layout = viewLayout({
              plateWidth, plateHeight: 100, containerWidth, gap: 16, dpr, fullWidth,
            })
            const fits = layout.cssWidth <= layout.trackWidth + 1e-6 && layout.trackWidth >= 320
            expect(
              layout.stacked,
              `plate ${plateWidth} in ${containerWidth} @ ${dpr}${fullWidth ? ' full' : ''}`,
            ).toBe(!fits)
          }
        }
      }
    }
  })

  it('survives a container that has not been laid out yet', () => {
    const layout = viewLayout({ ...DEFAULT_PLATE, containerWidth: 0, gap: Number.NaN })
    expect(layout.scale).toBe(1)
    expect(layout.stacked).toBe(true)
    expect(layout.overflows).toBe(true)
  })

  it('rejects a plate height that is not a real measurement', () => {
    expect(() => viewLayout({
      plateWidth: 100, plateHeight: 0, containerWidth: 800, gap: 16,
    })).toThrow(/plateHeight/)
  })
})

/* -------------------------------------------------------------- fitScale */

describe('fitScale', () => {
  const PLATE = { plateWidth: 1500, plateHeight: 720 }

  it('takes the smaller of the two axes', () => {
    // 3840x2160 at dpr 1: width allows floor(3840/1500) = 2, height allows
    // floor(2160/720) = 3. The answer is 2, and it is not a compromise between
    // them — 3 would overflow the width.
    const fit = fitScale({ ...PLATE, availableWidth: 3840, availableHeight: 2160, dpr: 1 })
    expect(fit.scale).toBe(2)
    expect(fit.limit).toBe('width')
    expect(fit.overflows).toBe(false)

    // And the other way round: a tall-enough window, a short one.
    const short = fitScale({ ...PLATE, availableWidth: 6000, availableHeight: 1500, dpr: 1 })
    expect(short.scale).toBe(2)
    expect(short.limit).toBe('height')
  })

  it('is exactly min(snapScale per axis), which is how it is built', () => {
    // The reuse asserted, not just intended: if `fitScale` ever grows its own
    // copy of the arithmetic, this is what fails.
    for (const availableWidth of [0, 1, 320, 760, 1280, 1920, 2560, 3840, 7680]) {
      for (const availableHeight of [0, 1, 200, 480, 720, 1080, 1440, 2160]) {
        for (const dpr of [1, 1.25, 1.5, 2, 2.5, 3, 1.7777777777]) {
          const fit = fitScale({ ...PLATE, availableWidth, availableHeight, dpr })
          const w = snapScale({ plateWidth: 1500, availableWidth, dpr }).scale
          const h = snapScale({ plateWidth: 720, availableWidth: availableHeight, dpr }).scale
          expect(fit.scale, `${availableWidth}x${availableHeight} @ ${dpr}`)
            .toBe(Math.min(w, h))
        }
      }
    }
  })

  it('never returns 0, a negative, or a fraction — even for a degenerate box', () => {
    for (const availableWidth of [0, -1, 1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      for (const availableHeight of [0, -1, 1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        const fit = fitScale({ ...PLATE, availableWidth, availableHeight, dpr: 1 })
        expect(Number.isInteger(fit.scale), `${availableWidth}x${availableHeight}`).toBe(true)
        expect(fit.scale).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('never downscales a plate larger than the viewport', () => {
    // A 1500x720 plate on a phone. Shrinking it to fit would drop whole source
    // columns and the image would stop fusing, so the answer is 1:1 and
    // something scrolls.
    const fit = fitScale({ ...PLATE, availableWidth: 390, availableHeight: 844, dpr: 3 })
    expect(fit.scale).toBe(1)
    expect(fit.cssWidth).toBe(500)
    expect(fit.overflowsWidth).toBe(true)
    expect(fit.overflowsHeight).toBe(false)
    expect(fit.overflows).toBe(true)
  })

  it('reports an overflow per axis, and only ever at 1:1', () => {
    expect(fitScale({ ...PLATE, availableWidth: 1500, availableHeight: 720, dpr: 1 }).overflows)
      .toBe(false)
    const narrow = fitScale({ ...PLATE, availableWidth: 1499, availableHeight: 720, dpr: 1 })
    expect(narrow.overflowsWidth).toBe(true)
    expect(narrow.overflowsHeight).toBe(false)
    const flat = fitScale({ ...PLATE, availableWidth: 1500, availableHeight: 719, dpr: 1 })
    expect(flat.overflowsWidth).toBe(false)
    expect(flat.overflowsHeight).toBe(true)

    for (let availableWidth = 1; availableWidth < 4000; availableWidth += 13) {
      for (const availableHeight of [11, 300, 719, 1200, 3000]) {
        const fit = fitScale({ ...PLATE, availableWidth, availableHeight, dpr: 1.25 })
        if (fit.overflows) expect(fit.scale).toBe(1)
      }
    }
  })

  it('snaps in DEVICE pixels on BOTH axes, so a fractional dpr still lands whole', () => {
    // The trap, now twice over: an integer CSS scale at dpr 1.5 is a fractional
    // device scale, and a height that was fitted in CSS px would reintroduce it
    // vertically even with the width snapped correctly.
    for (const dpr of [1, 1.25, 1.5, 2, 2.5, 3, 1.7777777777]) {
      for (const availableWidth of [320, 760, 1280, 1920, 3840]) {
        for (const availableHeight of [200, 480, 1080, 2160]) {
          for (const plate of [PLATE, { plateWidth: 751, plateHeight: 361 }]) {
            const fit = fitScale({ ...plate, availableWidth, availableHeight, dpr })
            const where = `${plate.plateWidth}x${plate.plateHeight} in ` +
              `${availableWidth}x${availableHeight} @ ${dpr}`
            expect(Number.isInteger(fit.scale), where).toBe(true)
            expect(fit.deviceWidth, where).toBe(fit.scale * plate.plateWidth)
            expect(fit.deviceHeight, where).toBe(fit.scale * plate.plateHeight)
            expect(Number.isInteger(fit.deviceWidth), where).toBe(true)
            expect(Number.isInteger(fit.deviceHeight), where).toBe(true)
            // The identities the browser has to honour, on both axes.
            expect(fit.cssWidth * dpr, where).toBeCloseTo(fit.deviceWidth, 9)
            expect(fit.cssHeight * dpr, where).toBeCloseTo(fit.deviceHeight, 9)
            // One integer for both axes, so the aspect ratio is exact.
            expect(fit.cssHeight / fit.cssWidth, where)
              .toBeCloseTo(plate.plateHeight / plate.plateWidth, 12)
          }
        }
      }
    }
  })

  it('is monotonically non-decreasing in each dimension and in dpr', () => {
    let previous = 0
    for (let availableWidth = 0; availableWidth <= 6000; availableWidth += 7) {
      const { scale } = fitScale({ ...PLATE, availableWidth, availableHeight: 1e6, dpr: 1.5 })
      expect(scale).toBeGreaterThanOrEqual(previous)
      previous = scale
    }
    expect(previous).toBeGreaterThan(1)

    previous = 0
    for (let availableHeight = 0; availableHeight <= 6000; availableHeight += 7) {
      const { scale } = fitScale({ ...PLATE, availableWidth: 1e6, availableHeight, dpr: 1.5 })
      expect(scale).toBeGreaterThanOrEqual(previous)
      previous = scale
    }
    expect(previous).toBeGreaterThan(1)

    previous = 0
    for (const dpr of [0.5, 1, 1.25, 1.5, 2, 2.5, 3, 4]) {
      const { scale } = fitScale({ ...PLATE, availableWidth: 1920, availableHeight: 1080, dpr })
      expect(scale).toBeGreaterThanOrEqual(previous)
      previous = scale
    }
  })

  it('does not lose a whole step to binary floor error on either axis', () => {
    for (let plate = 300; plate <= 400; plate++) {
      for (const dpr of [1.1, 1.3, 2.4, 1 / 3]) {
        const exact = (3 * plate) / dpr
        expect(
          fitScale({
            plateWidth: plate, plateHeight: plate,
            availableWidth: exact, availableHeight: exact, dpr,
          }).scale,
          `${plate} @ ${dpr}`,
        ).toBe(3)
      }
    }
  })

  it('names the binding axis, including when neither binds alone', () => {
    expect(fitScale({
      plateWidth: 100, plateHeight: 100, availableWidth: 250, availableHeight: 250, dpr: 1,
    }).limit).toBe('both')
    expect(fitScale({
      plateWidth: 100, plateHeight: 100, availableWidth: 250, availableHeight: 999, dpr: 1,
    }).limit).toBe('width')
    expect(fitScale({
      plateWidth: 100, plateHeight: 100, availableWidth: 999, availableHeight: 250, dpr: 1,
    }).limit).toBe('height')
  })

  it('rejects a plate size that is not a real measurement', () => {
    for (const plateHeight of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => fitScale({
        plateWidth: 100, plateHeight, availableWidth: 800, availableHeight: 600,
      })).toThrow(/fitScale: plateHeight/)
    }
    for (const plateWidth of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => fitScale({
        plateWidth, plateHeight: 100, availableWidth: 800, availableHeight: 600,
      })).toThrow(/plateWidth/)
    }
  })
})

/* ------------------------------------------------------------ snapOffset */

describe('snapOffset', () => {
  /** The two conditions the browser imposes, asserted as one predicate. */
  const usable = (offset: number, dpr: number): boolean =>
    Math.abs(offset * dpr - Math.round(offset * dpr)) < 1e-6 &&
    Math.abs(offset * 64 - Math.round(offset * 64)) < 1e-6

  it('reproduces the offsets measured exact in the browser, and skips the broken one', () => {
    // The 3825x2160 @ dpr 1.5 case, 420x600 plate at scale 5 → cssWidth 1400,
    // so the remainder is 2425 and `margin: auto` would give 1212.5 (device
    // origin 1818.75, measured 109910 bad device px). 1212 is the next offset
    // down that satisfies both conditions, and measured 0.
    expect(snapOffset(2425, 1.5)).toBe(1212)
    expect(snapOffset(2425, 1.5) * 1.5).toBe(1818)
    // ...and the two near misses the browser rejected are not what it picks.
    expect(snapOffset(2425, 1.5)).not.toBe(1212.5)
    expect(snapOffset(2425, 1.5)).not.toBeCloseTo(1819 / 1.5, 6)
  })

  it('is the plain half-remainder at dpr 1, where every offset is usable', () => {
    for (const spare of [0, 1, 2, 7, 140, 2425, 2426]) {
      expect(snapOffset(spare, 1)).toBe(Math.floor(spare / 2))
    }
  })

  it('always lands on a whole device pixel AND a 1/64 CSS px', () => {
    // Both halves, swept. Either one alone is reachable with a wrong offset:
    // `1819 / 1.5` is a whole device pixel and is NOT representable, and
    // `1212.5` is representable and is NOT a whole device pixel. The browser
    // measured both of those broken.
    for (const dpr of [1, 1.25, 1.5, 2, 2.5, 3, 2.625, 1.7777777777, 16 / 9, 1 / 3]) {
      for (let spare = 0; spare <= 4000; spare += 7) {
        const offset = snapOffset(spare, dpr)
        expect(usable(offset, dpr), `spare ${spare} @ ${dpr} → ${offset}`).toBe(true)
      }
    }
  })

  it('never overshoots the space it was given, and is never negative', () => {
    for (const dpr of [1, 1.25, 1.5, 2.625, 3]) {
      for (let spare = -10; spare <= 4000; spare += 11) {
        const offset = snapOffset(spare, dpr)
        expect(offset, `spare ${spare} @ ${dpr}`).toBeGreaterThanOrEqual(0)
        // Bounded by the whole remainder, not the half: the search may go
        // above the ideal midpoint, but never far enough to push the plate off
        // the far edge of the box.
        expect(offset, `spare ${spare} @ ${dpr}`).toBeLessThanOrEqual(Math.max(0, spare) + 1e-9)
      }
    }
  })

  it('stays close to centred, searching either side of the ideal', () => {
    // The fallback is flush-left, and a fallback taken often would be a
    // regression dressed as a safety net. At every realistic dpr the search
    // finds a usable offset within a few device pixels — on EITHER side, which
    // is what keeps a coarse-step dpr from reading as visibly off-centre.
    for (const dpr of [1, 1.25, 1.5, 2, 2.5, 3, 2.625, 16 / 9]) {
      for (const spare of [92, 100, 457, 1000, 2425, 3999]) {
        const ideal = (spare / 2) * dpr
        const got = snapOffset(spare, dpr) * dpr
        expect(Math.abs(ideal - got), `spare ${spare} @ ${dpr}`).toBeLessThan(32)
      }
    }
    expect(OFFSET_SEARCH).toBeGreaterThanOrEqual(32)
    // The specific case that motivated searching upward: a 420x600 plate at
    // scale 2 in a 412 CSS px viewport at dpr 2.625 leaves 92px of slack, and
    // only every 21st device px qualifies. Downward-only gave 40 (6px left of
    // centre); the nearest qualifying offset is 48 (2px right of it).
    expect(snapOffset(92, 2.625)).toBe(48)
    expect(snapOffset(92, 2.625) * 2.625).toBe(126)
    // ...and it still leaves the plate inside the box.
    expect(snapOffset(92, 2.625)).toBeLessThanOrEqual(92)
  })

  it('prefers an exact plate flush left over a centred broken one', () => {
    // 0 is always usable, so the fallback can only ever cost centring. The
    // ordering is the point: this project would rather have the picture in the
    // wrong place than in the wrong pixels.
    expect(snapOffset(0, 1.5)).toBe(0)
    expect(snapOffset(-100, 1.5)).toBe(0)
    expect(usable(snapOffset(1, 1.7777777777), 1.7777777777)).toBe(true)
  })

  it('gives the plate a whole-device-pixel origin through fitScale too', () => {
    for (const dpr of [1, 1.25, 1.5, 2, 2.5, 3, 2.625]) {
      for (const [w, h] of [
        [3825, 2160], [3826, 2160], [1920, 1080], [1921, 1081], [800, 2400], [320, 240],
      ] as const) {
        for (const plate of [{ plateWidth: 420, plateHeight: 600 }, { plateWidth: 820, plateHeight: 320 }]) {
          const fit = fitScale({ ...plate, availableWidth: w, availableHeight: h, dpr })
          const where = `${plate.plateWidth}x${plate.plateHeight} in ${w}x${h} @ ${dpr}`
          expect(usable(fit.offsetX, dpr), `${where} offsetX ${fit.offsetX}`).toBe(true)
          expect(usable(fit.offsetY, dpr), `${where} offsetY ${fit.offsetY}`).toBe(true)
          // An overflowing axis is flush, not negatively indented.
          if (fit.overflowsWidth) expect(fit.offsetX, where).toBe(0)
          if (fit.overflowsHeight) expect(fit.offsetY, where).toBe(0)
          // And the plate still sits inside the box it was given.
          if (!fit.overflowsWidth) expect(fit.offsetX + fit.cssWidth).toBeLessThanOrEqual(w + 1e-6)
          if (!fit.overflowsHeight) expect(fit.offsetY + fit.cssHeight).toBeLessThanOrEqual(h + 1e-6)
        }
      }
    }
  })
})

describe('fitNote', () => {
  const at = (availableWidth: number, availableHeight: number, dpr = 1) =>
    fitNote(
      fitScale({
        plateWidth: 1500, plateHeight: 720, availableWidth, availableHeight, dpr,
      }),
      dpr,
    )

  it('states the integer scale and the device size', () => {
    expect(at(3840, 2160)).toMatch(/exactly 2x/)
    expect(at(3840, 2160)).toContain('3000x1440 device px')
  })

  it('names the binding axis', () => {
    expect(at(3840, 2160)).toMatch(/Width is the binding constraint/)
    expect(at(6000, 1500)).toMatch(/Height is the binding constraint/)
    expect(at(3000, 1440)).toMatch(/equally/)
  })

  it('says the surround is page background when the plate fits', () => {
    expect(at(3840, 2160)).toMatch(/page background, not image/)
    expect(at(3840, 2160)).not.toMatch(/scrolls/)
  })

  it('explains the overflow, and names which way it goes', () => {
    expect(at(800, 2160)).toMatch(/horizontally/)
    expect(at(800, 2160)).not.toMatch(/vertically/)
    expect(at(3840, 300)).toMatch(/vertically/)
    expect(at(800, 300)).toMatch(/horizontally and vertically/)
    expect(at(800, 300)).toMatch(/rather than being shrunk/)
    expect(at(800, 300)).toMatch(/whole columns are dropped/)
  })

  it('names devicePixelRatio, because that is the thing that was snapped', () => {
    expect(at(3840, 2160, 1.5)).toContain('devicePixelRatio 1.5')
  })
})

describe('scaleNote', () => {
  const at = (containerWidth: number, dpr: number, fullWidth = false) =>
    scaleNote(viewLayout({ ...DEFAULT_PLATE, containerWidth, gap: 16, dpr, fullWidth }), dpr)

  it('states the integer scale and the device size', () => {
    expect(at(6400, 1)).toMatch(/exactly 2x/)
    expect(at(6400, 1)).toContain('3000x1440 device px')
    expect(at(6400, 1, true)).toMatch(/exactly 4x/)
    expect(at(6400, 1, true)).toContain('6000x2880 device px')
  })

  it('explains the sideways scroll, and only when there is one', () => {
    expect(at(1280, 1)).toMatch(/scrolls sideways/)
    expect(at(1280, 1)).toMatch(/cannot be shrunk/)
    expect(at(6400, 1)).not.toMatch(/scrolls sideways/)
  })

  it('names devicePixelRatio, because that is the thing that was snapped', () => {
    expect(at(1280, 1.5)).toContain('devicePixelRatio 1.5')
  })
})

/* ------------------------------------- the display transform, measured */

const PLATE_W = 750
const PLATE_H = 24
/** Background window: clear of `linked`'s 55px left dead zone and of the slab. */
const BG0 = 80
const BG1 = 380
/** A full-height near slab, so the plate is a real one and not a flat control. */
const SLAB = [500, 620] as const

function plateFor(sepFar: number, sepNear: number): Uint8Array {
  // No `noiseScale` here, and the type forbids it: `noiseScale` is applied by
  // the pipeline, upstream of the encoder, and it is already baked into the
  // backing-store width the display scale is snapped against. Passing it twice
  // is the double-count the task brief warns about, and `SirdsOpts` types the
  // field as `never` precisely so it cannot be done by accident.
  const opts: SirdsOpts = {
    sepFar, sepNear, cross: false, seed: 7, algorithm: 'linked',
  }
  return encoderFor(opts)(slabDepth(PLATE_W, PLATE_H, SLAB[0], SLAB[1], 1), PLATE_W, PLATE_H)
}

/**
 * Background agreement at `sep` after the plate is displayed `displayWidth` px
 * wide, nearest-neighbour.
 *
 * The offset is `round(sep * scale)`, which is the disparity a viewer's fusion
 * would have to find on screen. Rounding is not a fudge — it is the point: when
 * `sep * scale` is not a whole number there *is* no on-screen offset that
 * reproduces the source pairing, and the rounded one is the closest the eye can
 * get.
 */
function displayed(
  img: Uint8Array, displayWidth: number, sep: number, window: readonly [number, number] = [BG0, BG1],
): number {
  const scale = displayWidth / PLATE_W
  const scaled = nearestScaleX(img, PLATE_W, PLATE_H, displayWidth)
  return agreement(
    scaled, displayWidth, PLATE_H,
    Math.round(window[0] * scale), Math.round(window[1] * scale), Math.round(sep * scale),
  )
}

describe('a plate resampled the way a browser resamples it', () => {
  const img = plateFor(110, 92)

  it('is perfectly coherent in the background before anything scales it', () => {
    expect(displayed(img, PLATE_W, 110)).toBe(1)
    // And the number that makes a whole-image metric useless, pinned so nobody
    // calibrates a threshold against it again: the object region encodes
    // `sepNear`, not `sepFar`, so it scores as disagreement.
    const whole = agreement(img, PLATE_W, PLATE_H, 0, PLATE_W, 110)
    report('whole-image agreement @sepFar, UNSCALED', +whole.toFixed(4))
    expect(whole).toBeLessThan(0.9)
    expect(agreement(img, PLATE_W, PLATE_H, SLAB[0], SLAB[1], 92)).toBe(1)
  })

  it('holds at 1.0000 at every integer scale', () => {
    for (const k of [1, 2, 3, 4, 5]) {
      const got = displayed(img, PLATE_W * k, 110)
      report(`display ${PLATE_W * k} scale ${k}.000 INT`, +got.toFixed(4))
      expect(got, `scale ${k}`).toBe(1)
    }
  })

  it('degrades at the non-integer scales a real window produces', () => {
    // The widths Shaun's window actually gave the canvas. 1.0000 would mean
    // fusion intact; these are 7-8% of pairs broken, recurring with a period
    // set by the fractional part, which is why it reads as vertical columns of
    // raised and lowered texture rather than as noise.
    const table: Array<[number, number]> = []
    for (const displayWidth of [1280, 1600, 1920, 1000, 1100]) {
      const got = displayed(img, displayWidth, 110)
      table.push([displayWidth, +got.toFixed(4)])
      expect(got, `display ${displayWidth}`).toBeLessThan(0.95)
      expect(got, `display ${displayWidth}`).toBeGreaterThan(0.5)
    }
    report('non-integer scales [displayWidth, agreement]', table)
  })

  it('is destroyed outright by the downscaling the live page was doing', () => {
    // Not a near miss. `width: 100%` gave the 1500px backing store of the
    // default scene 592 CSS px at a 1280px viewport — 0.39x — and whole source
    // columns are then absent from the screen, so the partner pixel a percept
    // needs is not there to be found. Measured here on the 750px plate at the
    // same ratios.
    const table: Array<[string, number]> = []
    for (const displayWidth of [292, 591, 250, 188]) {
      const got = displayed(img, displayWidth, 110)
      table.push([`${displayWidth} (${(displayWidth / PLATE_W).toFixed(3)}x)`, +got.toFixed(4)])
      expect(got, `display ${displayWidth}`).toBeLessThan(0.81)
    }
    report('downscales [display, agreement]', table)
  })

  /**
   * **A correction to the brief this was built from, kept as a test.**
   *
   * "Integer scale" is the right rule, but "non-integer scale breaks it" is not
   * the mechanism. The exact condition is `sep * scale` being a whole number:
   * nearest neighbour maps source column `floor((X + 0.5) / scale)`, so
   * `out[X] === out[X + sep*scale]` holds for every `X` precisely when
   * `sep * scale` is an integer, and then the shift is exactly `sep` source
   * columns.
   *
   * Which means `scale = 1.5` is **perfect** for the default settings, because
   * `sepFar` and `sepNear` are both even — and that is a coincidence of the
   * defaults, not a property worth exploiting: bump `sepFar` to 111 and the same
   * 1.5 drops to 0.83. A plate also encodes every separation between `sepNear`
   * and `sepFar` across its depth range, and `s * sep` whole for two
   * *consecutive* integers `sep` forces `s` itself to be a whole number. So
   * integer is not merely sufficient, it is the only scale that is safe for
   * every scene — which is the right thing to implement, for a better reason
   * than the one the brief gave.
   */
  it('breaks at a half-integer scale as soon as a separation is odd', () => {
    const even = displayed(img, 1125, 110)
    const odd = displayed(plateFor(111, 93), 1125, 111)
    report('scale 1.5, sepFar 110 (even, 165 whole)', +even.toFixed(4))
    report('scale 1.5, sepFar 111 (odd, 166.5 NOT whole)', +odd.toFixed(4))
    expect(even).toBe(1)
    expect(odd).toBeLessThan(0.9)
    // ...while an integer scale is safe for both, which is the whole argument.
    expect(displayed(plateFor(111, 93), PLATE_W * 2, 111)).toBe(1)
    expect(displayed(plateFor(111, 93), PLATE_W * 3, 111)).toBe(1)
  })

  it('keeps every scale snapScale will actually choose at 1.0000', () => {
    // The two halves joined up. Swept over the widths and ratios a real visitor
    // brings, for both separations and for an odd-`sep` scene, against the
    // thing the page will really write into `style.width`.
    for (const [sepFar, sepNear] of [[110, 92], [111, 93]] as const) {
      const subject = plateFor(sepFar, sepNear)
      for (const availableWidth of [300, 760, 1280, 1600, 1920, 2560, 3840]) {
        for (const dpr of [1, 1.25, 1.5, 2, 2.5, 3]) {
          const { scale } = snapScale({ plateWidth: PLATE_W, availableWidth, dpr })
          const where = `sep ${sepFar}/${sepNear}, ${availableWidth} @ dpr ${dpr} → ${scale}x`
          // Background at sepFar, and the near slab at sepNear — measured in
          // its own window, because the background does NOT encode sepNear and
          // scoring it there reads 0.516 on a perfectly good plate.
          expect(displayed(subject, PLATE_W * scale, sepFar), where).toBe(1)
          expect(displayed(subject, PLATE_W * scale, sepNear, SLAB), where).toBe(1)
        }
      }
    }
  })

  it('keeps every scale fitScale will actually choose at 1.0000, in both orientations', () => {
    // The same join-up for presentation mode, which is the mode that adds the
    // height constraint — so the sweep includes landscape and portrait
    // viewports and a fractional dpr, and both separations.
    for (const [sepFar, sepNear] of [[110, 92], [111, 93]] as const) {
      const subject = plateFor(sepFar, sepNear)
      for (const [availableWidth, availableHeight] of [
        [1920, 1080], [1080, 1920], [3840, 2160], [2160, 3840],
        [1280, 800], [800, 1280], [390, 844], [844, 390], [2560, 1440],
      ] as const) {
        for (const dpr of [1, 1.25, 1.5, 2, 2.5, 3]) {
          const { scale } = fitScale({
            plateWidth: PLATE_W, plateHeight: PLATE_H, availableWidth, availableHeight, dpr,
          })
          const where =
            `sep ${sepFar}/${sepNear}, ${availableWidth}x${availableHeight} @ dpr ${dpr} → ${scale}x`
          expect(displayed(subject, PLATE_W * scale, sepFar), where).toBe(1)
          expect(displayed(subject, PLATE_W * scale, sepNear, SLAB), where).toBe(1)
        }
      }
    }
  })

  it('and the scale width:100% produced does not', () => {
    // The positive control for the test above: the measurement must be able to
    // tell the fix from the bug. `width: 100%` in a 1280px viewport's left
    // column gave the canvas 592 CSS px.
    expect(displayed(img, 591, 110)).toBeLessThan(0.81)
    expect(displayed(img, 1280, 110)).toBeLessThan(0.95)
  })
})
