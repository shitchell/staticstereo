import { describe, expect, it } from 'vitest'
import { agreement, encoderFor, nearestScaleX, report, slabDepth } from '../src/core/testing/metamorphic.js'
import { plateLayoutOf } from '../src/core/index.js'
import { FIT_MODES } from './fit.js'
import type { FitMode } from './fit.js'
import {
  MAX_SCENE_SCALE, OFFSET_SEARCH, backingStoreOf, containFit, fitNote, fitScale, isUsableDpr,
  planFit, renderFit, scaleNote, snapOffset, snapScale, usableDpr, viewLayout,
} from './scale.js'
import type { RenderFit } from './scale.js'
import type { Scene, SirdsOpts, StereoOpts } from '../src/core/types.js'

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

/* ----------------------------------------------------------- containFit */

/**
 * The mode that is allowed to shrink, and the one relationship that pins it
 * against the mode that is not.
 *
 * Every assertion here is swept or structural rather than a hand-picked point,
 * for the same reason the `fitScale` block above is: the interesting cases are
 * fractional dpr and a plate larger than its box, and a table of expected
 * numbers would pin today's arithmetic instead of the guarantee.
 */
describe('containFit', () => {
  const PLATES = [
    { plateWidth: 1500, plateHeight: 720 },
    { plateWidth: 751, plateHeight: 361 },
    { plateWidth: 820, plateHeight: 320 },
    { plateWidth: 16, plateHeight: 16 },
  ]
  const WIDTHS = [1, 200, 320, 760, 1280, 1920, 2560, 3840]
  const HEIGHTS = [1, 200, 480, 720, 1080, 2160]
  const CONTAIN_DPRS = [1, 1.25, 1.5, 2, 2.5, 3, 1.7777777777]

  const sweep = (
    f: (plate: { plateWidth: number; plateHeight: number },
        availableWidth: number, availableHeight: number, dpr: number, where: string) => void,
  ): void => {
    for (const plate of PLATES) {
      for (const availableWidth of WIDTHS) {
        for (const availableHeight of HEIGHTS) {
          for (const dpr of CONTAIN_DPRS) {
            f(plate, availableWidth, availableHeight, dpr,
              `${plate.plateWidth}x${plate.plateHeight} in ` +
              `${availableWidth}x${availableHeight} @ ${dpr}`)
          }
        }
      }
    }
  }

  it('never exceeds the box on either axis, and exactly fills one of them', () => {
    sweep((plate, availableWidth, availableHeight, dpr, where) => {
      const c = containFit({ ...plate, availableWidth, availableHeight, dpr })
      expect(c.cssWidth, where).toBeLessThanOrEqual(availableWidth + 1e-6)
      expect(c.cssHeight, where).toBeLessThanOrEqual(availableHeight + 1e-6)
      // Maximality, stated as the thing it means: the binding axis is filled
      // to the pixel. If neither were, the scale could grow.
      const fillsW = Math.abs(c.cssWidth - availableWidth) < 1e-6
      const fillsH = Math.abs(c.cssHeight - availableHeight) < 1e-6
      expect(fillsW || fillsH, `${where} → ${c.cssWidth}x${c.cssHeight}`).toBe(true)
      expect(c.overflows, where).toBe(false)
    })
  })

  it('is the maximum that fits — any epsilon more overflows an axis', () => {
    // The same guarantee from the other side, so a scale that merely fits
    // cannot pass: scaled up by a millionth it must break out of the box.
    sweep((plate, availableWidth, availableHeight, dpr, where) => {
      const c = containFit({ ...plate, availableWidth, availableHeight, dpr })
      const bigger = c.scale * (1 + 1e-6)
      const w = (bigger * plate.plateWidth) / dpr
      const h = (bigger * plate.plateHeight) / dpr
      expect(w > availableWidth + 1e-9 || h > availableHeight + 1e-9, where).toBe(true)
    })
  })

  it('preserves the plate aspect ratio exactly', () => {
    sweep((plate, availableWidth, availableHeight, dpr, where) => {
      const c = containFit({ ...plate, availableWidth, availableHeight, dpr })
      expect(c.cssHeight / c.cssWidth, where)
        .toBeCloseTo(plate.plateHeight / plate.plateWidth, 12)
      expect(c.deviceHeight / c.deviceWidth, where)
        .toBeCloseTo(plate.plateHeight / plate.plateWidth, 12)
      // One scale for both axes, in DEVICE px, like `fitScale` — the ratio is
      // what changes, not the space it is measured in.
      expect(c.deviceWidth, where).toBeCloseTo(c.scale * plate.plateWidth, 9)
      expect(c.cssWidth * dpr, where).toBeCloseTo(c.deviceWidth, 9)
      expect(c.cssHeight * dpr, where).toBeCloseTo(c.deviceHeight, 9)
    })
  })

  it('is NOT floored at 1 and is NOT an integer — which is the whole difference', () => {
    const small = containFit({
      plateWidth: 1500, plateHeight: 720, availableWidth: 390, availableHeight: 844, dpr: 3,
    })
    expect(small.scale).toBeLessThan(1)
    expect(small.scale).toBeGreaterThan(0)
    expect(Number.isInteger(small.scale)).toBe(false)
    // Same box, same plate, the mode that refuses to shrink: 1:1 and it scrolls.
    const snapped = fitScale({
      plateWidth: 1500, plateHeight: 720, availableWidth: 390, availableHeight: 844, dpr: 3,
    })
    expect(snapped.scale).toBe(1)
    expect(snapped.overflows).toBe(true)
    expect(small.overflows).toBe(false)
  })

  it('is >= fitScale when fitScale is not floored, and < 1 exactly when it is', () => {
    // The relationship that pins `contain` against `snap`. Not a sample: the
    // two modes agree up to a floor above 1:1, and disagree only — but always —
    // where `snap` would rather overflow than shrink.
    sweep((plate, availableWidth, availableHeight, dpr, where) => {
      const c = containFit({ ...plate, availableWidth, availableHeight, dpr })
      const f = fitScale({ ...plate, availableWidth, availableHeight, dpr })
      if (c.scale >= 1) {
        expect(c.scale + 1e-9, where).toBeGreaterThanOrEqual(f.scale)
        // Tighter: above 1:1 `snap` is exactly `contain` floored.
        expect(f.scale, where).toBe(Math.floor(c.scale + 1e-9))
      }
      expect(c.scale < 1, where).toBe(f.scale === 1 && f.overflows)
    })
  })

  it('is monotonically non-decreasing in each dimension and in dpr', () => {
    let previous = -1
    for (let availableWidth = 0; availableWidth <= 6000; availableWidth += 7) {
      const { scale } = containFit({
        plateWidth: 1500, plateHeight: 720, availableWidth, availableHeight: 1e6, dpr: 1.5,
      })
      expect(scale).toBeGreaterThanOrEqual(previous)
      previous = scale
    }
    expect(previous).toBeGreaterThan(1)

    previous = -1
    for (let availableHeight = 0; availableHeight <= 6000; availableHeight += 7) {
      const { scale } = containFit({
        plateWidth: 1500, plateHeight: 720, availableWidth: 1e6, availableHeight, dpr: 1.5,
      })
      expect(scale).toBeGreaterThanOrEqual(previous)
      previous = scale
    }
    expect(previous).toBeGreaterThan(1)

    previous = -1
    for (const dpr of [0.5, 1, 1.25, 1.5, 2, 2.5, 3, 4]) {
      const { scale } = containFit({
        plateWidth: 1500, plateHeight: 720, availableWidth: 1920, availableHeight: 1080, dpr,
      })
      expect(scale).toBeGreaterThanOrEqual(previous)
      previous = scale
    }
  })

  it('is idempotent: re-fitting a plate into its own result changes nothing', () => {
    sweep((plate, availableWidth, availableHeight, dpr, where) => {
      const once = containFit({ ...plate, availableWidth, availableHeight, dpr })
      const twice = containFit({
        ...plate, availableWidth: once.cssWidth, availableHeight: once.cssHeight, dpr,
      })
      expect(twice.scale, where).toBeCloseTo(once.scale, 9)
      expect(twice.cssWidth, where).toBeCloseTo(once.cssWidth, 9)
      expect(twice.cssHeight, where).toBeCloseTo(once.cssHeight, 9)
    })
  })

  it('names the binding axis, including when neither binds alone', () => {
    const square = { plateWidth: 100, plateHeight: 100 }
    expect(containFit({ ...square, availableWidth: 250, availableHeight: 250, dpr: 1 }).limit)
      .toBe('both')
    expect(containFit({ ...square, availableWidth: 250, availableHeight: 999, dpr: 1 }).limit)
      .toBe('width')
    expect(containFit({ ...square, availableWidth: 999, availableHeight: 250, dpr: 1 }).limit)
      .toBe('height')
    // A tie at a fractional scale is still a tie: the two quotients are
    // computed by different divisions and need not agree bit for bit.
    expect(containFit({
      plateWidth: 1500, plateHeight: 720, availableWidth: 1000, availableHeight: 480, dpr: 1,
    }).limit).toBe('both')
  })

  it('survives a box that has not been laid out yet', () => {
    // A detached or `display: none` element measures 0, and a resize handler
    // must not throw on it. Nothing is drawn, and nothing claims to fit.
    for (const availableWidth of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const c = containFit({
        plateWidth: 1500, plateHeight: 720, availableWidth, availableHeight: 0, dpr: 1,
      })
      expect(c.scale, `availableWidth ${availableWidth}`).toBe(0)
      expect(c.cssWidth).toBe(0)
      expect(c.offsetX).toBe(0)
    }
  })

  it('rejects a plate size that is not a real measurement', () => {
    for (const plateHeight of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => containFit({
        plateWidth: 100, plateHeight, availableWidth: 800, availableHeight: 600,
      })).toThrow(/containFit: plateHeight/)
    }
    for (const plateWidth of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => containFit({
        plateWidth, plateHeight: 100, availableWidth: 800, availableHeight: 600,
      })).toThrow(/containFit: plateWidth/)
    }
  })
})

/* ------------------------------------------------------------- renderFit */

/** A scene is only ever its geometry here; no layer affects the plate's size. */
const sceneOf = (size: [number, number], stereo?: Partial<StereoOpts>): Scene =>
  stereo ? { size, layers: [], stereo } : { size, layers: [] }

/**
 * The sweep every scene-shaped mode runs over. Shared by `renderFit` and
 * `planFit` deliberately: the dispatcher has to agree with the functions it
 * delegates to over the *same* inputs, and two drifting lists would make a
 * disagreement look like a pass. Extremes included, because an affine solve is
 * where a long thin scene stops behaving like a proportional one.
 */
const SCENES: Array<[number, number]> = [
  [640, 360], [1920, 1080], [16, 16], [2000, 4], [4, 2000], [300, 160], [800, 450],
]
const BOXES: Array<[number, number]> = [
  [320, 200], [760, 480], [1280, 800], [1920, 1080], [2560, 1440], [3840, 2160],
  [1080, 1920], [400, 300], [100, 100],
]
const DPRS = [1, 1.25, 1.5, 2, 3]

/**
 * The plan for re-rendering, and the single fact its arithmetic turns on.
 *
 * `renderFit` computes a plan, not a render: the chain it has to get right is
 * scene px → plate px (**plus constant margins**) → backing-store px
 * (× `noiseScale`) → device px (1:1, which is the point of the mode) → CSS px
 * (÷ `dpr`). The margin step is the one that is not a multiply, and the group
 * below pins it so that a later change to `plateLayoutOf`'s margin rule turns
 * this red rather than silently invalidating the solve.
 */
describe('renderFit', () => {
  const DEFAULT_SCENE = sceneOf([640, 360])

  it('margins are CONSTANT in scene size — which is why sceneScale is not containerW/plateW', () => {
    // The fact the whole function turns on. `marginsFor` reads `sepFar` and the
    // algorithm and nothing else, so the plate is `margins.left + w +
    // margins.right`: AFFINE in the scene width, not proportional to it.
    const margins = plateLayoutOf(DEFAULT_SCENE).margins
    expect(margins.left + margins.right).toBeGreaterThan(0)
    for (const w of [4, 16, 64, 640, 1920, 7680]) {
      expect(plateLayoutOf(sceneOf([w, 360])).margins, `width ${w}`).toEqual(margins)
      // Unit slope: one more scene column is exactly one more plate column.
      expect(
        plateLayoutOf(sceneOf([w + 1, 360])).plate.width -
          plateLayoutOf(sceneOf([w, 360])).plate.width,
        `width ${w}`,
      ).toBe(1)
    }

    // ...so solving for the scale has to subtract the dead strips FIRST. A
    // 3000 CSS px box at dpr 1 holds 1500 plate px at noiseScale 2, and the
    // margins come out of that before the division.
    const r = renderFit({
      scene: DEFAULT_SCENE, availableWidth: 3000, availableHeight: 1e6, dpr: 1,
    })
    // `dead` is read back off the result rather than written as 110, which is
    // `sepFar`: hardcoding it would make this test pin a perceptual constant by
    // accident, so that retuning `sepFar` — a decision about eyes — would turn
    // an arithmetic test red. The derived spelling is the one `share` uses in
    // the margin test below.
    const dead = r.margins.left + r.margins.right
    expect(dead).toBeGreaterThan(0)
    expect(r.sceneScale).toBeCloseTo((3000 / 2 - dead) / 640, 12)
    // And the naive answer — container ÷ today's plate — is a different number.
    // If margins ever became proportional the two would coincide and this is
    // the assertion that would catch it.
    expect(r.sceneScale).not.toBeCloseTo(3000 / 1500, 6)
  })

  it('is 1 for a box exactly the plate\'s natural size at dpr 1, and keeps today\'s dimensions', () => {
    // The committed default: a 640x360 stage, sepFar 110, `linked` → 55px
    // margins either side → a 750x360 plate → x noiseScale 2 → 1500x720.
    const r = renderFit({
      scene: DEFAULT_SCENE, availableWidth: 1500, availableHeight: 720, dpr: 1,
    })
    expect(r.sceneScale).toBeCloseTo(1, 12)
    expect(r.sceneWidth).toBe(640)
    expect(r.sceneHeight).toBe(360)
    expect(r.plateWidth).toBe(750)
    expect(r.plateHeight).toBe(360)
    expect(r.backingWidth).toBe(1500)
    expect(r.backingHeight).toBe(720)
    expect(r.cssWidth).toBe(1500)
    expect(r.cssHeight).toBe(720)
    expect(r.overflows).toBe(false)
    expect(r.limit).toBe('both')
    expect(r.clamped).toBe(false)
  })

  const sweepRender = (
    f: (r: RenderFit, size: [number, number], box: [number, number], dpr: number,
        where: string) => void,
  ): void => {
    for (const size of SCENES) {
      for (const box of BOXES) {
        for (const dpr of DPRS) {
          const r = renderFit({
            scene: sceneOf(size), availableWidth: box[0], availableHeight: box[1], dpr,
          })
          f(r, size, box, dpr, `${size[0]}x${size[1]} in ${box[0]}x${box[1]} @ ${dpr}`)
        }
      }
    }
  }

  it('never exceeds the box, and is displayed one backing px per DEVICE px', () => {
    // Three of the five assertions below sit behind `if (!r.clamped)`, and a
    // gate with no counter is a gate that can close completely in silence: if
    // every sweep point became clamped the three would simply stop executing
    // and this test would still pass. `MAX_SCENE_SCALE` made that sharply more
    // likely by adding a second way for a point to clamp, so both branches are
    // counted and both have a floor — the idiom `playerplan.test.ts` already
    // uses for its own sweeps.
    let unclamped = 0
    let clamped = 0
    sweepRender((r, _size, box, dpr, where) => {
      // The pixel-exactness claim, which is the whole reason the mode exists:
      // the backing store lands on device pixels 1:1, never resampled. True on
      // both sides of the gate, which is why it is outside it.
      expect(r.cssWidth * dpr, where).toBeCloseTo(r.backingWidth, 9)
      expect(r.cssHeight * dpr, where).toBeCloseTo(r.backingHeight, 9)
      if (!r.clamped) {
        expect(r.cssWidth, where).toBeLessThanOrEqual(box[0] + 1e-6)
        expect(r.cssHeight, where).toBeLessThanOrEqual(box[1] + 1e-6)
        expect(r.overflows, where).toBe(false)
        unclamped++
      } else {
        clamped++
      }
    })
    expect(unclamped + clamped).toBe(SCENES.length * BOXES.length * DPRS.length)
    // The floor on the gated branch, which is the one that can vanish.
    expect(unclamped).toBeGreaterThan(200)
    // ...and a floor on the other branch too, so that a clamp which stopped
    // firing altogether — a cap raised out of reach, a floor that stopped
    // engaging — shows up here rather than as three assertions quietly
    // becoming unconditional.
    expect(clamped).toBeGreaterThan(20)
  })

  it('reports a plate that is exactly margins + scaled stage, in whole scene px', () => {
    sweepRender((r, size, _box, _dpr, where) => {
      expect(Number.isInteger(r.sceneWidth), where).toBe(true)
      expect(Number.isInteger(r.sceneHeight), where).toBe(true)
      expect(r.sceneWidth, where).toBeGreaterThanOrEqual(1)
      expect(r.sceneHeight, where).toBeGreaterThanOrEqual(1)
      expect(r.plateWidth, where).toBe(r.margins.left + r.sceneWidth + r.margins.right)
      expect(r.plateHeight, where).toBe(r.sceneHeight)
      expect(r.backingWidth, where).toBe(r.plateWidth * r.noiseScale)
      expect(r.backingHeight, where).toBe(r.plateHeight * r.noiseScale)
      // The scene the caller will actually build is the ideal scale floored,
      // never rounded up — rounding up is how a plan overflows the box it was
      // solved for.
      expect(r.sceneWidth, where).toBeLessThanOrEqual(r.sceneScale * size[0] + 1e-6)
      expect(r.sceneHeight, where).toBeLessThanOrEqual(r.sceneScale * size[1] + 1e-6)
    })
  })

  it('is monotonically non-decreasing in each dimension and in dpr', () => {
    let previous = -Infinity
    for (let availableWidth = 0; availableWidth <= 6000; availableWidth += 7) {
      const { sceneScale } = renderFit({
        scene: DEFAULT_SCENE, availableWidth, availableHeight: 1e6, dpr: 1.5,
      })
      expect(sceneScale).toBeGreaterThanOrEqual(previous)
      previous = sceneScale
    }
    expect(previous).toBeGreaterThan(1)

    previous = -Infinity
    for (let availableHeight = 0; availableHeight <= 6000; availableHeight += 7) {
      const { sceneScale } = renderFit({
        scene: DEFAULT_SCENE, availableWidth: 1e6, availableHeight, dpr: 1.5,
      })
      expect(sceneScale).toBeGreaterThanOrEqual(previous)
      previous = sceneScale
    }
    expect(previous).toBeGreaterThan(1)

    previous = -Infinity
    for (const dpr of [0.5, 1, 1.25, 1.5, 2, 2.5, 3, 4]) {
      const { sceneScale } = renderFit({
        scene: DEFAULT_SCENE, availableWidth: 1920, availableHeight: 1080, dpr,
      })
      expect(sceneScale).toBeGreaterThanOrEqual(previous)
      previous = sceneScale
    }
  })

  it('is strictly greater for a box twice as large on both axes', () => {
    // Non-decreasing is not enough: a function that ignored the box entirely
    // would satisfy it. Doubling the box must really buy a bigger scene.
    let checked = 0
    for (const size of SCENES) {
      for (const box of BOXES) {
        for (const dpr of DPRS) {
          const at = (k: number) => renderFit({
            scene: sceneOf(size), availableWidth: box[0] * k, availableHeight: box[1] * k, dpr,
          })
          const one = at(1)
          const two = at(2)
          const where = `${size[0]}x${size[1]} in ${box[0]}x${box[1]} @ ${dpr}`
          // Only where BOTH plans are real solves. Either clamp is flat, so a
          // pair with one in it is equal or smaller by construction rather than
          // by defect — the floor is asserted on its own below and the cap in
          // its own test. Both are named in the gate because `MAX_SCENE_SCALE`
          // made the doubled box the one more likely to be clamped.
          if (!one.clamped && !two.clamped) {
            expect(two.sceneScale, where).toBeGreaterThan(one.sceneScale)
            checked++
          }
        }
      }
    }
    // The gate's own floor: with no counter, a sweep in which every pair ended
    // up clamped would assert nothing and still pass.
    expect(checked).toBeGreaterThan(200)
    expect(checked).toBeLessThan(SCENES.length * BOXES.length * DPRS.length)
  })

  it('scales with dpr and inversely with noiseScale, because both are in the chain', () => {
    const box = { availableWidth: 1200, availableHeight: 1e6 }
    const one = renderFit({ scene: DEFAULT_SCENE, ...box, dpr: 1 })
    const two = renderFit({ scene: DEFAULT_SCENE, ...box, dpr: 2 })
    // Twice the device pixels for the same CSS box: the stage budget doubles
    // AFTER the constant margins are taken out, so the scale does not. `dead`
    // is read off the result for the reason given above — it is `sepFar`, a
    // perceptual constant, and this is not a test about eyes.
    const dead = one.margins.left + one.margins.right
    expect(dead).toBeGreaterThan(0)
    expect(two.margins).toEqual(one.margins)
    expect(two.sceneScale).toBeCloseTo((1200 * 2 / 2 - dead) / 640, 12)
    expect(one.sceneScale).toBeCloseTo((1200 / 2 - dead) / 640, 12)

    const coarse = renderFit({ scene: sceneOf([640, 360], { noiseScale: 1 }), ...box, dpr: 1 })
    expect(coarse.noiseScale).toBe(1)
    expect(one.noiseScale).toBe(2)
    // Same plate margins at a different `noiseScale`: they are plate px and
    // `noiseScale` is the step after them. Asserted rather than assumed,
    // because the line below uses this scene's own margins and the equality is
    // what makes that the same claim as the two above.
    expect(coarse.margins).toEqual(one.margins)
    const coarseDead = coarse.margins.left + coarse.margins.right
    expect(coarse.sceneScale).toBeCloseTo((1200 / 1 - coarseDead) / 640, 12)
  })

  it('margins do not scale, so they eat a growing share of a shrinking plate', () => {
    // Worth asserting rather than only noting: `sepFar` is a property of the
    // viewer's eyes, not of the picture (requirements §7 C1), so it is NOT
    // scene geometry and does NOT scale. The consequence is that `render` into
    // a small box spends proportionally more of the plate on dead strips.
    const big = renderFit({ scene: DEFAULT_SCENE, availableWidth: 3000, availableHeight: 1e6 })
    const small = renderFit({ scene: DEFAULT_SCENE, availableWidth: 400, availableHeight: 1e6 })
    expect(small.margins).toEqual(big.margins)
    const share = (r: RenderFit) => (r.margins.left + r.margins.right) / r.plateWidth
    expect(share(small)).toBeGreaterThan(share(big))
  })

  it('clamps at a one-pixel scene rather than planning an empty render', () => {
    // A box that cannot hold even the margins has no solution: the honest
    // answer is the smallest renderable scene plus an overflow, not a zero or
    // negative scale that a caller would hand to a rasteriser.
    const r = renderFit({ scene: DEFAULT_SCENE, availableWidth: 10, availableHeight: 10, dpr: 1 })
    expect(r.clamped).toBe(true)
    expect(r.sceneWidth).toBeGreaterThanOrEqual(1)
    expect(r.sceneHeight).toBeGreaterThanOrEqual(1)
    expect(r.sceneScale).toBeGreaterThan(0)
    expect(r.overflows).toBe(true)
    // ...and the clamp is flat, which is why the strict-growth sweep above
    // skips it rather than pretending otherwise.
    const tinier = renderFit({
      scene: DEFAULT_SCENE, availableWidth: 1, availableHeight: 1, dpr: 1,
    })
    expect(tinier.sceneScale).toBe(r.sceneScale)
  })

  it('caps sceneScale at the other end, and reports that through `clamped` too', () => {
    // The box is a length a third party chose. A host page pastes an `<iframe
    // src>` (R14) and `width: 100000px` is legal CSS, so without an upper bound
    // the solve grows with the container and the product is handed to a
    // rasteriser. The floor and the cap are both clamps and both say so.
    const huge = renderFit({
      scene: DEFAULT_SCENE, availableWidth: 1e6, availableHeight: 1e6, dpr: 1,
    })
    expect(huge.sceneScale).toBe(MAX_SCENE_SCALE)
    expect(huge.clamped).toBe(true)
    // The two clamps differ in one visible way, and it is worth pinning: the
    // floor hands back a plate BIGGER than the box and overflows, the cap hands
    // back a smaller one and letterboxes.
    expect(huge.overflows).toBe(false)
    expect(huge.cssWidth).toBeLessThan(1e6)
    expect(huge.cssHeight).toBeLessThan(1e6)
    // ...and the cap is flat, exactly as the floor is: a container ten times
    // larger buys nothing at all.
    const huger = renderFit({
      scene: DEFAULT_SCENE, availableWidth: 1e7, availableHeight: 1e7, dpr: 1,
    })
    expect(huger.sceneScale).toBe(huge.sceneScale)
    expect(huger.backingWidth).toBe(huge.backingWidth)
    expect(huger.backingHeight).toBe(huge.backingHeight)
  })

  it('bounds the rasteriser input by a multiple of the AUTHORED scene, at every dpr', () => {
    // Why the bound is a scene multiplier and not a pixel count: `scene.size`
    // is the one length in the chain a host page cannot inflate. `dpr`
    // multiplies the budget as well, so it is swept rather than argued.
    let capped = 0
    for (const size of SCENES) {
      for (const dpr of DPRS) {
        const r = renderFit({
          scene: sceneOf(size), availableWidth: 1e9, availableHeight: 1e9, dpr,
        })
        const where = `${size[0]}x${size[1]} @ ${dpr}`
        expect(r.sceneScale, where).toBe(MAX_SCENE_SCALE)
        expect(r.clamped, where).toBe(true)
        // Floored, so one px of slack on each axis rather than an equality.
        expect(r.sceneWidth, where).toBeLessThanOrEqual(MAX_SCENE_SCALE * size[0] + 1)
        expect(r.sceneHeight, where).toBeLessThanOrEqual(MAX_SCENE_SCALE * size[1] + 1)
        capped++
      }
    }
    expect(capped).toBe(SCENES.length * DPRS.length)
    expect(capped).toBeGreaterThan(30)
  })

  it('does not engage for any container a real display can offer', () => {
    // The cap is a resource bound and it must not become a layout rule by
    // accident. The widest device-pixel budget real hardware offers is of the
    // order of 6000 px, which at the default `noiseScale` 2 is 3000 plate px,
    // so a realistically authored scene cannot reach the cap — asserted here
    // rather than only claimed in the constant's docblock.
    expect(Number.isFinite(MAX_SCENE_SCALE)).toBe(true)
    expect(MAX_SCENE_SCALE).toBeGreaterThan(1)
    let unclamped = 0
    for (const size of [[300, 160], [640, 360], [800, 450], [1920, 1080]] as Array<[number, number]>) {
      for (const dpr of DPRS) {
        const r = renderFit({
          scene: sceneOf(size), availableWidth: 3840, availableHeight: 2160, dpr,
        })
        const where = `${size[0]}x${size[1]} @ ${dpr}`
        expect(r.sceneScale, where).toBeLessThan(MAX_SCENE_SCALE)
        expect(r.clamped, where).toBe(false)
        unclamped++
      }
    }
    expect(unclamped).toBe(4 * DPRS.length)
  })

  it('survives a box that has not been laid out yet', () => {
    for (const availableWidth of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = renderFit({ scene: DEFAULT_SCENE, availableWidth, availableHeight: 0 })
      expect(r.sceneScale, `availableWidth ${availableWidth}`).toBeGreaterThan(0)
      expect(r.clamped).toBe(true)
      expect(r.overflows).toBe(true)
    }
  })

  it('rejects a scene whose size is not a real measurement', () => {
    for (const size of [[0, 100], [100, 0], [-1, 100], [Number.NaN, 100]] as Array<[number, number]>) {
      expect(() => renderFit({
        scene: sceneOf(size), availableWidth: 800, availableHeight: 600,
      }), `${size[0]}x${size[1]}`).toThrow(/renderFit: scene\.size/)
    }
  })

  it('lets the margin authority reject a scene it cannot measure', () => {
    // `plateLayoutOf` is the authority on margins and this does not second-guess
    // it: a scene with an unusable `sepFar` throws from there, where the rule
    // lives, rather than being papered over with a default here.
    expect(() => renderFit({
      scene: sceneOf([640, 360], { sepFar: 1 }), availableWidth: 800, availableHeight: 600,
    })).toThrow(/sepFar/)
  })
})

/* -------------------------------------------------------- planFit (all 3) */

/**
 * The three modes behind one call, and the two outcomes behind the three modes.
 *
 * `snap` and `contain` change how an **already-rendered** backing store is
 * displayed; `render` changes **what gets rendered**. A caller that cannot tell
 * those apart will resample a re-rendered frame — i.e. pay for pixel-exactness
 * and then throw it away — so the tag that separates them is asserted here, not
 * the scale values, which are each mode's own tests' business.
 */
describe('planFit', () => {
  const INPUT = { scene: sceneOf([640, 360]), availableWidth: 1280, availableHeight: 800, dpr: 1.5 }

  it('derives the backing store from the scene, once, for every mode', () => {
    // The scene → backing-store bridge: plate px (margins included) x
    // noiseScale. The default scene's 640x360 stage is a 750x360 plate and a
    // 1500x720 backing store, which is what `canvas.width`/`height` carry.
    expect(backingStoreOf(sceneOf([640, 360]))).toEqual({ width: 1500, height: 720 })
    for (const size of SCENES) {
      for (const noiseScale of [1, 2, 3]) {
        const scene = sceneOf(size, { noiseScale })
        const layout = plateLayoutOf(scene)
        expect(backingStoreOf(scene), `${size[0]}x${size[1]} @ ns ${noiseScale}`).toEqual({
          width: layout.plate.width * noiseScale,
          height: layout.plate.height * noiseScale,
        })
      }
    }
  })

  it("delegates 'snap' to fitScale without drifting from it", () => {
    const plan = planFit('snap', INPUT)
    expect(plan.kind).toBe('rescale')
    expect(plan.mode).toBe('snap')
    const backing = backingStoreOf(INPUT.scene)
    if (plan.kind !== 'rescale') throw new Error('unreachable')
    expect(plan.fit).toEqual(fitScale({
      plateWidth: backing.width,
      plateHeight: backing.height,
      availableWidth: INPUT.availableWidth,
      availableHeight: INPUT.availableHeight,
      dpr: INPUT.dpr,
    }))
  })

  it("delegates 'contain' to containFit without drifting from it", () => {
    const plan = planFit('contain', INPUT)
    expect(plan.kind).toBe('rescale')
    expect(plan.mode).toBe('contain')
    const backing = backingStoreOf(INPUT.scene)
    if (plan.kind !== 'rescale') throw new Error('unreachable')
    expect(plan.fit).toEqual(containFit({
      plateWidth: backing.width,
      plateHeight: backing.height,
      availableWidth: INPUT.availableWidth,
      availableHeight: INPUT.availableHeight,
      dpr: INPUT.dpr,
    }))
  })

  it("delegates 'render' to renderFit without drifting from it", () => {
    const plan = planFit('render', INPUT)
    expect(plan.kind).toBe('rerender')
    expect(plan.mode).toBe('render')
    if (plan.kind !== 'rerender') throw new Error('unreachable')
    expect(plan.plan).toEqual(renderFit(INPUT))
  })

  it('agrees with a direct call for every mode, over a sweep', () => {
    // The equality above at one point is a spot check; this is the guarantee.
    // If the dispatcher ever grows its own copy of any mode's arithmetic, this
    // is what fails.
    for (const size of SCENES) {
      for (const box of BOXES) {
        for (const dpr of DPRS) {
          const input = {
            scene: sceneOf(size), availableWidth: box[0], availableHeight: box[1], dpr,
          }
          const backing = backingStoreOf(input.scene)
          const common = {
            plateWidth: backing.width,
            plateHeight: backing.height,
            availableWidth: box[0],
            availableHeight: box[1],
            dpr,
          }
          const where = `${size[0]}x${size[1]} in ${box[0]}x${box[1]} @ ${dpr}`
          const snap = planFit('snap', input)
          const contain = planFit('contain', input)
          const render = planFit('render', input)
          if (snap.kind !== 'rescale' || contain.kind !== 'rescale') {
            throw new Error('unreachable')
          }
          if (render.kind !== 'rerender') throw new Error('unreachable')
          expect(snap.fit, where).toEqual(fitScale(common))
          expect(contain.fit, where).toEqual(containFit(common))
          expect(render.plan, where).toEqual(renderFit(input))
        }
      }
    }
  })

  /**
   * **The sixth copy of a refuted argument, rewritten in place.**
   *
   * What stood here read: *"`displayScale` is CSS px shown ÷ backing-store px —
   * what `imageRenderingFor` in site/smooth.ts takes, and NOT `Fit.scale`,
   * which is device px ÷ backing-store px. The two differ by exactly `dpr`, and
   * this is the field that keeps a caller from confusing them."*
   *
   * Every arithmetic clause of that is true and the attribution is backwards.
   * The browser resamples the backing store onto the **device** grid; CSS px
   * are a layout unit and nothing is ever resampled into them. So the smoothing
   * policy takes the device ratio — `RescalePlan.devicePerBackingScale`, which
   * *is* `Fit.scale`, the quantity this comment went out of its way to rule
   * out — and `displayScale` is the layout ratio and only that. Corrected in
   * production at `65e4f03`; this was the sixth place the old claim was written
   * down and the last one still standing, left behind because `scale.test.ts`
   * was outside the file set of the change that rewrote the other five.
   *
   * Which ratio each quantity actually feeds, since that is the part a reader
   * needs: `fit.scale` → `devicePerBackingScale` → `imageRenderingFor`;
   * `fit.scale / dpr` → `cssPerBackingScale` → `style.width` and the stylesheet.
   *
   * The assertions below never changed and never needed to — they pinned
   * `fit.scale / dpr`, which is still exactly right. Only the sentence about
   * what the field is *for* was wrong, which is why it is rewritten rather than
   * deleted: a reader who finds only the corrected rule has no reason to check
   * it, and the division is a no-op at dpr 1 so nothing but a second dpr ever
   * shows the difference. The policy's own end-to-end assertion lives in
   * `playerplan.test.ts`; what is asserted here is that both ratios are carried
   * and that they differ by exactly `dpr`.
   *
   * ## The field the assertions name is now `cssPerBackingScale`
   *
   * It was `displayScale`, immediately above `devicePerBackingScale` on the same
   * interface. One of those two names states both of the pixel spaces it spans
   * and the other states **neither** — "display" is not one of this project's
   * four spaces — so a call site had two `number` fields whose names gave a
   * reader no way to know they differ by `dpr`. That asymmetry is invariant 7's,
   * and it is the shape of the defect this very docblock records: the wrong one
   * was handed to the smoothing policy and nothing complained.
   *
   * This file is the only thing that pins the CSS reading, which is why the
   * field lives here and not on `PlayerPlan` — that copy had no production
   * consumer at all and was deleted in the same change.
   */
  it('tags re-render apart from rescale, and carries both ratios for both', () => {
    for (const size of SCENES) {
      for (const box of BOXES) {
        for (const dpr of DPRS) {
          const input = {
            scene: sceneOf(size), availableWidth: box[0], availableHeight: box[1], dpr,
          }
          const where = `${size[0]}x${size[1]} in ${box[0]}x${box[1]} @ ${dpr}`
          for (const mode of ['snap', 'contain', 'render'] as FitMode[]) {
            const plan = planFit(mode, input)
            if (plan.kind === 'rescale') {
              expect(plan.cssPerBackingScale, `${where} ${mode}`)
                .toBeCloseTo(plan.fit.scale / dpr, 9)
              expect(plan.cssPerBackingScale, `${where} ${mode}`)
                .toBeCloseTo(plan.fit.cssWidth / plan.backingWidth, 9)
              // The device ratio, carried under its own name so the call site
              // that bridges fit and smoothing does not have to choose by
              // doing arithmetic. Asserted here because the comment above
              // names it, and a comment claiming more than its assertions do
              // is the defect this file has already been through once.
              expect(plan.devicePerBackingScale, `${where} ${mode}`).toBe(plan.fit.scale)
              expect(plan.devicePerBackingScale, `${where} ${mode}`)
                .toBeCloseTo(plan.cssPerBackingScale * dpr, 9)
            } else {
              // A re-render is 1:1 in DEVICE px by construction, so its display
              // scale is 1/dpr and never anything else.
              expect(plan.cssPerBackingScale, `${where} ${mode}`).toBeCloseTo(1 / dpr, 12)
              expect(plan.cssPerBackingScale, `${where} ${mode}`)
                .toBeCloseTo(plan.plan.cssWidth / plan.plan.backingWidth, 9)
              // ...and in device px it is 1 at every dpr, which is the clearest
              // single demonstration that the two readings are not the same
              // number wearing different units.
              expect(plan.devicePerBackingScale, `${where} ${mode}`).toBe(1)
            }
          }
        }
      }
    }
  })

  it('handles every registered fit mode — no key in FIT_MODES falls through', () => {
    // Iterated off the registry rather than written out, so adding a mode to
    // FIT_MODES without handling it here fails THIS test as well as the
    // compiler: the switch's exhaustiveness guard throws on an unknown mode
    // rather than returning undefined.
    const modes = Object.keys(FIT_MODES) as FitMode[]
    // Vacuity floor: a registry that stopped enumerating would otherwise pass.
    expect(modes.length).toBeGreaterThanOrEqual(3)
    for (const mode of modes) {
      const plan = planFit(mode, INPUT)
      expect(plan.mode, mode).toBe(mode)
      expect(['rescale', 'rerender'], mode).toContain(plan.kind)
      expect(FIT_MODES[mode].mode, mode).toBe(mode)
    }
    // ...and the two outcomes are both really reachable, so a dispatcher that
    // tagged everything 'rescale' could not pass either.
    const kinds = new Set(modes.map(m => planFit(m, INPUT).kind))
    expect(kinds).toEqual(new Set(['rescale', 'rerender']))
  })

  it('throws rather than returning undefined for a mode it does not know', () => {
    // The runtime half of the exhaustiveness guard. Reachable only by lying to
    // the compiler, which is exactly what an un-updated registry would do.
    expect(() => planFit('cover' as FitMode, INPUT)).toThrow(/fit mode/)
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

  it('gives a contain-fitted plate a whole-device-pixel origin too', () => {
    // `contain` gives up a pixel-exact *scale*; it does not give up a
    // whole-device-pixel *origin*. The measurement above is about where the
    // element sits, not about how much it was scaled, so the same snapping
    // applies — and the letterbox axis is where all the slack is.
    for (const dpr of [1, 1.25, 1.5, 2, 2.5, 3, 2.625]) {
      for (const [w, h] of [
        [3825, 2160], [3826, 2160], [1920, 1080], [320, 240], [412, 600],
      ] as const) {
        for (const plate of [
          { plateWidth: 420, plateHeight: 600 }, { plateWidth: 1500, plateHeight: 720 },
        ]) {
          const c = containFit({ ...plate, availableWidth: w, availableHeight: h, dpr })
          const where = `${plate.plateWidth}x${plate.plateHeight} in ${w}x${h} @ ${dpr}`
          expect(usable(c.offsetX, dpr), `${where} offsetX ${c.offsetX}`).toBe(true)
          expect(usable(c.offsetY, dpr), `${where} offsetY ${c.offsetY}`).toBe(true)
          expect(c.offsetX + c.cssWidth, where).toBeLessThanOrEqual(w + 1e-6)
          expect(c.offsetY + c.cssHeight, where).toBeLessThanOrEqual(h + 1e-6)
          // The binding axis is filled, so one of the two offsets is 0 — the
          // letterbox is on the other axis, and that is where centring happens.
          expect(c.offsetX === 0 || c.offsetY === 0, where).toBe(true)
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

/* --------------------------------------------------- the dpr coercion, once */

/**
 * One rule for an unusable `devicePixelRatio`, and the nine places that had
 * their own copy of it.
 *
 * `dpr` reaches this module off the DOM, so it is coerced rather than rejected,
 * and until {@link usableDpr} existed the coercion was written out inline at
 * every site that needed it — eight copies of
 * `Number.isFinite(dpr) && dpr > 0 ? dpr : 1`, a ninth spelled with `??` inside
 * `planFit`, and a tenth under two more names in `site/playerplan.ts`.
 *
 * **Nothing pinned the fallback.** Every dpr loop in this file was finite and
 * positive (`DPRS`, `CONTAIN_DPRS`, and about twenty inline lists); the
 * degenerate sweeps that do exist sweep *lengths and plate sizes*, never `dpr`;
 * and `undefined` was pinned nowhere at all, because eight signatures there
 * reach the fallback through a `dpr = 1` default parameter rather than through
 * the predicate. A verifier changed one copy's fallback to `7` and the suite
 * stayed green.
 *
 * So the rule is asserted twice over: directly on the helper, and *through*
 * every exported function that applies it. The second is the one that matters,
 * because a shared coercion one call site has quietly stopped calling is the
 * same defect with a tidier diff.
 */
describe('usableDpr', () => {
  /**
   * Everything a browser can hand us that the arithmetic cannot use, including
   * both spellings of absence. `-0` is in here because it is finite and the
   * predicate has to reject it on the comparison rather than on `isFinite`.
   */
  const UNUSABLE: Array<[string, number | undefined]> = [
    ['zero', 0],
    ['negative zero', -0],
    ['negative', -2],
    ['NaN', Number.NaN],
    ['+Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['undefined', undefined],
  ]

  it('passes a finite positive ratio through untouched', () => {
    for (const dpr of [1, 1.25, 1.5, 2, 2.5, 3, 0.5, 1 / 3, 1e9, Number.MIN_VALUE]) {
      expect(isUsableDpr(dpr), `${dpr}`).toBe(true)
      expect(usableDpr(dpr), `${dpr}`).toBe(dpr)
    }
  })

  it('substitutes exactly 1 — not 0, not the input, not any other number', () => {
    // The direct pin. `dpr` is a divisor (`cssWidth` is `deviceWidth / dpr`),
    // so 0 is unusable as a fallback for the same reason it is unusable as an
    // input, and 1 is the ratio of a display that does not scale — the honest
    // reading of "we were not told".
    for (const [name, dpr] of UNUSABLE) {
      expect(isUsableDpr(dpr), name).toBe(false)
      expect(usableDpr(dpr), name).toBe(1)
    }
  })

  /** Every exported function in this module that reads a `dpr`, in one bundle. */
  const everythingAt = (dpr: number | undefined, box: [number, number]) => {
    const scene = sceneOf([640, 360])
    const common = { availableWidth: box[0], availableHeight: box[1], dpr }
    const fit = fitScale({ ...DEFAULT_PLATE, ...common })
    const view = viewLayout({ ...DEFAULT_PLATE, containerWidth: box[0], gap: 16, dpr })
    return {
      snap: snapScale({ plateWidth: 1500, availableWidth: box[0], dpr }),
      fit,
      contain: containFit({ ...DEFAULT_PLATE, ...common }),
      render: renderFit({ scene, ...common }),
      offset: snapOffset(2425, dpr),
      view,
      plans: (['snap', 'contain', 'render'] as FitMode[])
        .map(mode => planFit(mode, { scene, ...common })),
      fitNote: fitNote(fit, dpr),
      scaleNote: scaleNote(view, dpr),
    }
  }

  it('is the ONE rule every exported function here applies', () => {
    let checked = 0
    for (const box of BOXES) {
      const one = everythingAt(1, box)
      for (const [name, dpr] of UNUSABLE) {
        expect(everythingAt(dpr, box), `${name} in ${box[0]}x${box[1]}`).toEqual(one)
        checked++
      }
    }
    // Vacuity floor: a loop that stopped iterating would assert nothing, and
    // this test's whole value is that it covers every site rather than one.
    expect(checked).toBe(BOXES.length * UNUSABLE.length)
    expect(checked).toBeGreaterThan(50)
  })

  it('treats an explicit undefined dpr exactly like an absent one', () => {
    // The hole the default parameters left: `{ dpr: undefined }` and an object
    // with no `dpr` key at all travel different routes to the same fallback,
    // and nothing asserted they arrive together.
    const scene = sceneOf([640, 360])
    const box = { availableWidth: 1280, availableHeight: 800 }
    expect(snapScale({ plateWidth: 1500, availableWidth: 1280, dpr: undefined }))
      .toEqual(snapScale({ plateWidth: 1500, availableWidth: 1280 }))
    expect(fitScale({ ...DEFAULT_PLATE, ...box, dpr: undefined }))
      .toEqual(fitScale({ ...DEFAULT_PLATE, ...box }))
    expect(containFit({ ...DEFAULT_PLATE, ...box, dpr: undefined }))
      .toEqual(containFit({ ...DEFAULT_PLATE, ...box }))
    expect(renderFit({ scene, ...box, dpr: undefined })).toEqual(renderFit({ scene, ...box }))
    expect(snapOffset(2425, undefined)).toBe(snapOffset(2425))
    expect(viewLayout({ ...DEFAULT_PLATE, containerWidth: 1400, gap: 16, dpr: undefined }))
      .toEqual(viewLayout({ ...DEFAULT_PLATE, containerWidth: 1400, gap: 16 }))
    for (const mode of ['snap', 'contain', 'render'] as FitMode[]) {
      expect(planFit(mode, { scene, ...box, dpr: undefined }), mode)
        .toEqual(planFit(mode, { scene, ...box }))
    }
    const fit = fitScale({ ...DEFAULT_PLATE, ...box })
    expect(fitNote(fit, undefined)).toBe(fitNote(fit))
    const view = viewLayout({ ...DEFAULT_PLATE, containerWidth: 1400, gap: 16 })
    expect(scaleNote(view, undefined)).toBe(scaleNote(view))
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
