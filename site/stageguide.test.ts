import { describe, expect, it } from 'vitest'
import { stageGuideLabel, stageGuideStyle } from './stageguide.js'
import { plateLayoutOf } from '../src/core/index.js'
import type { Scene } from '../src/core/index.js'

/**
 * The guide's geometry, which is the half of it a test can see.
 *
 * `main.ts` has no unit tests (no `OffscreenCanvas` under node, and jsdom does
 * not rasterise — design §9.12), so the arithmetic that decides *where* the
 * guide lands is pulled out here where it can be checked. What stays untested
 * is the two lines of `style.left = …`, plus the CSS, and the markup contract
 * for the new ids is covered by `markup.test.ts`.
 */

const frame = (width: number, height: number, x: number, w: number) => ({
  width, height, stage: { x, y: 0, width: w, height },
})

describe('stageGuideStyle', () => {
  it('places the stage at its real fraction of the plate', () => {
    // 800px stage inside a 965px plate, i.e. `shift`'s 110/55 margins. A hand
    // built frame, not a scene: this function takes a rendered frame's own
    // geometry, so it is independent of which encoder is the default.
    expect(stageGuideStyle(frame(965, 300, 110, 800))).toEqual({
      left: '11.3990%', width: '82.9016%', top: '0.0000%', height: '100.0000%',
    })
  })

  it('is independent of noiseScale, because it is a fraction', () => {
    // The same scene at noiseScale 1 and 3 must put the guide in the same
    // place: the canvas is CSS-scaled to the same box either way, so a
    // pixel-valued guide would be wrong at one of the two.
    expect(stageGuideStyle(frame(965, 300, 110, 800)))
      .toEqual(stageGuideStyle(frame(2895, 900, 330, 2400)))
  })

  it('covers the whole plate when there are no margins', () => {
    expect(stageGuideStyle(frame(800, 300, 0, 800))).toMatchObject({
      left: '0.0000%', width: '100.0000%',
    })
  })

  it('refuses a frame with no area rather than emitting NaN%', () => {
    // `NaN%` is an invalid CSS value, silently ignored, so the guide would
    // simply stay wherever it last was — a guide pointing at the wrong columns
    // is worse than no guide.
    expect(() => stageGuideStyle(frame(0, 300, 0, 0))).toThrow(/no area/)
    expect(() => stageGuideStyle(frame(800, 0, 0, 800))).toThrow(/no area/)
  })
})

describe('stageGuideLabel', () => {
  const scene = (stereo?: Scene['stereo']): Scene => ({ size: [800, 300], stereo, layers: [] })

  it('names the stage, the plate and both margins', () => {
    // The shipped defaults, which pad symmetrically since `linked` became the
    // default encoder (2026-10-09). It read 965×300 and 110/55 under `shift`.
    const text = stageGuideLabel(plateLayoutOf(scene()), 1)
    expect(text).toContain('stage 800×300')
    expect(text).toContain('910×300 plate')
    expect(text).toContain('55px left + 55px right')
  })

  it('says the dead space is not croppable, which is the counter-intuitive half', () => {
    // Design §10.4: the margins are the partner pixels fusion needs for the
    // stage's own edge columns, so "dead" means "compose nothing here", not
    // "this can be trimmed". The project nearly cropped them.
    expect(stageGuideLabel(plateLayoutOf(scene()), 1)).toMatch(/not croppable/)
  })

  it('mentions the drawn size only when noiseScale changes it', () => {
    expect(stageGuideLabel(plateLayoutOf(scene()), 1)).not.toContain('noiseScale')
    // The default 910px plate at noiseScale 2; it was 1930×600 under `shift`.
    expect(stageGuideLabel(plateLayoutOf(scene()), 2)).toContain('1820×600')
  })

  // Was 'tracks the encoder, since linked pads symmetrically', asserting the
  // linked numbers. Flipped to `shift` rather than renumbered: those numbers
  // are now the default, so the linked spelling would just restate the test
  // above and the label would stop being checked against a second encoder.
  it('tracks the encoder, since shift pads left-heavily', () => {
    const text = stageGuideLabel(plateLayoutOf(scene({ algorithm: 'shift' })), 1)
    expect(text).toContain('965×300 plate')
    expect(text).toContain('110px left + 55px right')
  })
})
