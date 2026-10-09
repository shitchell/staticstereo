/**
 * The published surface of `staticstereo` (the `.` export).
 *
 * A missing re-export is not a type error anywhere in this repo — only a
 * consumer finds out — so the surface is asserted rather than assumed.
 */
import { describe, it, expect } from 'vitest'
import * as core from './index.js'

describe('public surface', () => {
  it('exports the render pipeline', () => {
    for (const name of [
      'renderFrame',
      'renderFrames',
      'frameTimes',
      'stillTime',
      'sceneFps',
      'isStill',
      'resolveStereo',
    ] as const) {
      expect(typeof core[name], name).toBe('function')
    }
    expect(core.DEFAULT_FPS).toBe(12)
  })

  it('exports the stages the pipeline composes, so callers can drive them directly', () => {
    for (const name of [
      'rasterDepth',
      'createRasterCache',
      'sceneDurationOf',
      'gifFrameIndex',
      'blurDepth',
      'sirdsFromDepth',
      'upscale',
      'makeRng',
      'dominantPeriod',
      'rowOf',
      'compilePreset',
      'composeAnim',
      'evalTrack',
    ] as const) {
      expect(typeof core[name], name).toBe('function')
    }
    expect(core.DEFAULT_STEREO.sepFar).toBe(110)
    expect(core.IDENTITY.scale).toBe(1)
    expect(core.MIN_OVERLAP).toBe(16)
    expect(Object.keys(core.PRESETS).sort()).toEqual([
      'bob', 'bounce', 'emerge', 'marquee', 'slide', 'slide-in',
    ])
    expect(Object.keys(core.EASINGS).length).toBeGreaterThan(0)
  })

  it('does not export the test-only fake canvas', () => {
    // It is excluded from the build, so re-exporting it would break `npm run
    // build` — and ship a fake rasteriser to consumers if it ever did not.
    expect(Object.keys(core)).not.toContain('fakeCanvas')
  })

  it('renders end to end through the public entry point alone', async () => {
    const { fakeCanvas } = await import('./testing/fakeCanvas.js')
    const frame = await core.renderFrame(
      {
        size: [120, 8],
        stereo: { sepFar: 30, sepNear: 20, noiseScale: 2, seed: 1 },
        layers: [{ type: 'shape', shape: 'rect', at: [0, 0], w: 120, h: 8, depth: 1 }],
      },
      core.stillTime({ size: [120, 8], layers: [] }),
      fakeCanvas(),
    )
    expect(frame.width).toBe(240)
    const { period } = core.dominantPeriod(core.rowOf(frame.pixels, frame.width, 8), 4, 60)
    expect(period).toBe(40) // sepNear 20 x noiseScale 2
  })
})
