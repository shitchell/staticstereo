import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as controls from './controls.js'
import * as transport from './transport.js'
import {
  frameIndexAt,
  frameTimesOf,
  initialTransport,
  lastFrameTime,
  loopDuration,
  pause,
  play,
  seek,
  snapLoopTime,
  snapTime,
  timeAt,
  timeOfFrame,
  toggle,
} from './transport.js'
import { sceneFps, stillTime } from '../src/core/index.js'
import type { Scene } from '../src/core/types.js'

const ANIM: Scene = { size: [64, 32], fps: 12, duration: 2, layers: [{ type: 'text', text: 'A' }] }
const STILL: Scene = { size: [64, 32], layers: [{ type: 'text', text: 'A' }] }

/** The names moved out of `controls.ts` by T9. */
const MOVED = ['frameTimesOf', 'frameIndexAt', 'timeOfFrame', 'lastFrameTime'] as const

const SOURCE = readFileSync(new URL('./transport.ts', import.meta.url), 'utf8')

/**
 * The editor's own modules. The player may not pull any of them in, by phase
 * brief: `UiState`, `reduce` and the editor panels stay on the other side.
 */
const EDITOR_MODULES = [
  'controls', 'main', 'examples', 'legibility', 'diagnostics', 'depthmap', 'stageguide',
] as const

/**
 * Does `source` reach for one of `modules` by **any** import spelling?
 *
 * Both import bans in this file used to be written as `/from\s+'\.\/controls/`
 * and its seven-module sibling: the `from` keyword, and single quotes. So
 * `from "./controls.js"` passed, as did a bare `import './controls.js'` and a
 * dynamic `import('./controls.js')`. Measured: adding
 * `import { reduce } from "./controls.js"` to `transport.ts` — the editor's
 * whole reducer, by the back door the move existed to close — left this file
 * at 23 passed, `transportdriver.test.ts` at 12, and the full suite at
 * 50 files / 1162 passed / 0 skipped.
 *
 * Prettier would not write the double-quoted form, which is why the old guard
 * survived review; "unlikely" and "guarded" are not the same property, and the
 * comment above it was being read as the second.
 *
 * A strict superset of the two patterns it replaces — the same `./`-prefix
 * match, widened to all three quote characters and to `import`/`require` with
 * or without the call parentheses. Nothing it used to reject is now accepted.
 */
function importsAnyOf(source: string, modules: readonly string[]): boolean {
  return new RegExp(
    `(?:\\bfrom|\\bimport|\\brequire)\\s*\\(?\\s*['"\`]\\.\\/(?:${modules.join('|')})`,
  ).test(source)
}

describe('the frame grid, moved here from controls.ts', () => {
  /**
   * Identity, not equality of behaviour.
   *
   * This repo's signature defect is one list living in three files with only
   * one of them guarded — the channel list is guarded in `track.ts` and
   * duplicated unguarded in `src/cli/scene.ts` and `site/scene.ts`, and both
   * site-side validators silently drop channels because of it. A second copy
   * of the frame grid would be the fourth instance. `toBe` is the only
   * predicate that fails when someone re-implements instead of re-exporting;
   * a behavioural test would pass against a divergent copy until the day the
   * two implementations disagreed.
   */
  it('is the very same function object as the one controls.ts exports', () => {
    for (const name of MOVED) {
      expect(typeof transport[name], name).toBe('function')
      expect(controls[name], name).toBe(transport[name])
    }
    // Vacuity floor: a typo in MOVED would make the loop above assert nothing.
    expect(MOVED).toHaveLength(4)
  })

  /**
   * The direction of the dependency is the whole point of the move.
   *
   * `controls.ts` carries `UiState`, `Action` and `reduce` — the editor's
   * reducer. If `transport.ts` imported from it, the player would pull the
   * editor into its bundle through the back door, and P3 could not lift this
   * module into the editor store without dragging its own consumer along.
   */
  it('imports nothing from controls.ts, by any spelling of an import', () => {
    expect(importsAnyOf(SOURCE, ['controls'])).toBe(false)
    // Positive controls: every spelling the single-quote-only pattern let
    // through. The second of these is the measured one — see `importsAnyOf`.
    for (const spelling of [
      `import { reduce } from './controls.js'`,
      `import { reduce } from "./controls.js"`,
      `import './controls.js'`,
      `const m = await import('./controls.js')`,
      'const m = await import(`./controls.js`)',
      `const m = require("./controls.js")`,
    ]) {
      expect(importsAnyOf(spelling, ['controls']), spelling).toBe(true)
    }
    // ...and it is still a ban on the editor's modules, not on relative
    // imports. `src/core` and `site/scene.ts` are permitted and must stay so,
    // or the guard would be refusing the thing this module is built out of.
    expect(importsAnyOf(`import { frameTimes } from '../src/core/index.js'`, EDITOR_MODULES))
      .toBe(false)
    expect(importsAnyOf(`import { validateScene } from './scene.js'`, EDITOR_MODULES)).toBe(false)
    // Vacuity floor: proves we are reading the real module and not an empty
    // or renamed file that trivially satisfies the negative above.
    for (const name of MOVED) expect(SOURCE).toContain(`export function ${name}`)
  })

  it('matches core: excludes the endpoint', () => {
    expect(frameTimesOf(ANIM)).toHaveLength(24)
    expect(lastFrameTime(ANIM)).toBeCloseTo(23 / 12, 10)
  })

  it('gives a still exactly one frame, at the midpoint', () => {
    expect(frameTimesOf(STILL)).toEqual([stillTime(STILL)])
    expect(lastFrameTime(STILL)).toBe(stillTime(STILL))
  })

  it('frameIndexAt finds the nearest frame and clamps outside the scene', () => {
    expect(frameIndexAt(ANIM, 0)).toBe(0)
    expect(frameIndexAt(ANIM, 99)).toBe(23)
    expect(frameIndexAt(ANIM, -5)).toBe(0)
  })

  it('timeOfFrame clamps an out-of-range index', () => {
    expect(timeOfFrame(ANIM, -1)).toBe(0)
    expect(timeOfFrame(ANIM, 999)).toBeCloseTo(23 / 12, 10)
  })
})

const MS_PER_FRAME = 1000 / sceneFps(ANIM)

describe('the transport state machine', () => {
  it('starts paused on the first frame of the grid', () => {
    const t0 = initialTransport(ANIM)
    expect(t0.playing).toBe(false)
    expect(timeAt(t0, 0, ANIM)).toBe(frameTimesOf(ANIM)[0])
    expect(timeAt(initialTransport(STILL), 0, STILL)).toBe(stillTime(STILL))
  })

  it('holds a paused time however far the wall clock runs', () => {
    const t = seek(initialTransport(ANIM), 1, 1_000, ANIM)
    for (const now of [1_000, 1_001, 5_000, 60_000, 3_600_000]) {
      expect(timeAt(t, now, ANIM), String(now)).toBe(timeOfFrame(ANIM, 12))
    }
  })

  it('plays one second of scene time per second of wall time', () => {
    const t = play(initialTransport(ANIM), 10_000)
    expect(timeAt(t, 10_000 + 1_000, ANIM)).toBeCloseTo(1, 10)
    expect(timeAt(t, 10_000 + 1_500, ANIM)).toBeCloseTo(1.5, 10)
  })

  it('samples faster at a higher fps without playing faster', () => {
    // Scene fps governs how often the grid is sampled, not how fast time runs.
    // Reaching for fps anywhere in the rate is how a 60fps scene plays at 5x.
    const fine: Scene = { ...ANIM, fps: 60 }
    expect(frameTimesOf(fine)).toHaveLength(5 * frameTimesOf(ANIM).length)

    // **Sampled where the rival rule cannot alias, which this test used not to
    // do.** It asked both scenes only at 1_000 ms, and multiplying `timeAt`'s
    // elapsed by `sceneFps / 12` left the ENTIRE suite green: 5 s of scene
    // time wraps to 1 s in a 2 s loop, so *every* odd-integer multiplier
    // agrees with the correct answer at exactly that instant. One second is
    // the worst moment in this loop at which to ask the question.
    expect(timeAt(play(initialTransport(ANIM), 0), 250, ANIM)).toBeCloseTo(0.25, 10)
    expect(timeAt(play(initialTransport(fine), 0), 250, fine)).toBeCloseTo(0.25, 10)

    // ...and the rate as a rule rather than as two readings. The playhead must
    // land within half a sample of the wall-clock elapsed, which is what "one
    // second of scene time per second of wall time" means once the snapping is
    // accounted for. Stated that way it holds at every fps without a
    // hand-derived expectation per grid, so a rate that scales with fps is
    // caught wherever it is sampled rather than only where the arithmetic
    // happens not to alias.
    const samples = [250, 500, 750, 1_250, 1_750] as const
    const grids: readonly Scene[] = [ANIM, fine, { ...ANIM, fps: 6 }, { ...ANIM, fps: 25 }]
    for (const scene of grids) {
      const t = play(initialTransport(scene), 0)
      // Half a sample interval, in seconds. The epsilon is for the exact ties
      // at 6 and 25 fps, where the true distance is half an interval and the
      // two sides of the comparison round differently.
      const halfFrame = 0.5 / sceneFps(scene) + 1e-9
      for (const ms of samples) {
        expect(
          Math.abs(timeAt(t, ms, scene) - ms / 1_000),
          `${sceneFps(scene)}fps @ ${ms}ms`,
        ).toBeLessThanOrEqual(halfFrame)
      }
    }
    // Vacuity floor: the sweep is two nested loops, and an empty one would
    // prove the rate rule for every fps at once.
    expect(samples).toHaveLength(5)
    expect(grids).toHaveLength(4)
    expect(new Set(grids.map(sceneFps)).size).toBe(4)

    // The positive control: the rival rule, spelled out, really does give a
    // different answer at the new sample — and really does agree at 1_000 ms,
    // which is the fact that let it hide here for the whole phase.
    const rival = (scene: Scene, ms: number): number =>
      snapLoopTime(scene, (ms / 1_000) * (sceneFps(scene) / 12))
    expect(rival(fine, 250)).not.toBeCloseTo(0.25, 10)
    expect(rival(fine, 1_000)).toBeCloseTo(1, 10)
  })

  it('wraps modulo the grid rather than stopping at the end', () => {
    // Structural, and the same rule today's player applies as
    // `(currentFrame + 1) % times.length`.
    const t = play(initialTransport(ANIM), 0)
    const count = frameTimesOf(ANIM).length
    for (let k = 0; k <= 2 * count + 3; k++) {
      expect(timeAt(t, k * MS_PER_FRAME, ANIM), `frame ${k}`).toBe(timeOfFrame(ANIM, k % count))
    }
  })

  it('loops over the grid span, which is not always the scene duration', () => {
    // `count = max(1, round(duration*fps))`, so a duration that is not a whole
    // number of frames has a grid longer or shorter than itself. Wrapping on
    // `duration` would land between frames and duplicate or drop one every
    // loop.
    const ragged: Scene = { ...ANIM, duration: 0.55 } // 0.55 x 12 = 6.6 -> 7 frames
    const count = frameTimesOf(ragged).length
    expect(count).toBe(7)
    expect(loopDuration(ragged)).toBeCloseTo(count / sceneFps(ragged), 10)
    expect(loopDuration(ragged)).not.toBeCloseTo(0.55, 3)

    const t = play(initialTransport(ragged), 0)
    const interval = 1000 / sceneFps(ragged)
    for (let k = 0; k <= 2 * count + 1; k++) {
      expect(timeAt(t, k * interval, ragged), `frame ${k}`).toBe(timeOfFrame(ragged, k % count))
    }
    // The positive control: the rival rule, spelled out, really does give a
    // different answer — so the loop above is discriminating and not merely
    // true of any wrapping at all.
    const wrappedOnDuration = (k: number): number =>
      snapTime(ragged, (((k / 12) % 0.55) + 0.55) % 0.55)
    expect(wrappedOnDuration(14)).not.toBe(timeOfFrame(ragged, 14 % count))
  })

  it('resumes from the paused time with no catch-up jump', () => {
    // The anchoring exists for exactly this. A transport storing only a start
    // time counts the whole paused interval as elapsed scene time and leaps
    // forward on resume; the gap below is minutes long so that a leap is not
    // mistakable for rounding.
    let t = play(initialTransport(ANIM), 1_000)
    t = pause(t, 1_500, ANIM)
    expect(timeAt(t, 1_500, ANIM)).toBe(timeOfFrame(ANIM, 6))
    expect(timeAt(t, 400_000, ANIM)).toBe(timeOfFrame(ANIM, 6))
    t = play(t, 400_000)
    expect(timeAt(t, 400_000, ANIM)).toBe(timeOfFrame(ANIM, 6))
    expect(timeAt(t, 400_000 + 1_000, ANIM)).toBe(timeOfFrame(ANIM, 18))
  })

  it('keeps playing across a seek, re-anchored at the sought time', () => {
    const t = seek(play(initialTransport(ANIM), 0), 1.5, 700, ANIM)
    expect(t.playing).toBe(true)
    expect(timeAt(t, 700, ANIM)).toBe(timeOfFrame(ANIM, 18))
    // 1.5 + 1 = 2.5, which wraps to 0.5 in a 2s scene.
    expect(timeAt(t, 700 + 1_000, ANIM)).toBe(timeOfFrame(ANIM, 6))
  })

  it('leaves a paused transport paused across a seek', () => {
    const t = seek(initialTransport(ANIM), 1, 0, ANIM)
    expect(t.playing).toBe(false)
    expect(timeAt(t, 999_999, ANIM)).toBe(timeOfFrame(ANIM, 12))
  })

  it('wraps a seek out of range into the scene rather than clamping or throwing', () => {
    const cases: ReadonlyArray<readonly [number, number]> = [
      [2.5, 6], [-0.5, 18], [-2, 0], [4, 0], [Number.NaN, 0], [Number.POSITIVE_INFINITY, 0],
    ]
    for (const [sought, frame] of cases) {
      const t = seek(initialTransport(ANIM), sought, 0, ANIM)
      expect(timeAt(t, 0, ANIM), String(sought)).toBe(timeOfFrame(ANIM, frame))
    }
    expect(cases).toHaveLength(6)
  })

  it('always returns a time the renderer is defined at', () => {
    // The renderer is only well-defined on `frameTimes`, so `timeAt` snaps
    // rather than leaving every caller to remember to.
    const times = frameTimesOf(ANIM)
    const t = play(initialTransport(ANIM), 0)
    for (let ms = 0; ms < 2_500; ms += 7) expect(times, String(ms)).toContain(timeAt(t, ms, ANIM))
    expect(snapTime(ANIM, 0.51)).toBe(timeOfFrame(ANIM, frameIndexAt(ANIM, 0.51)))
  })

  it('snaps the final gap circularly, so a loop never repeats its last frame', () => {
    // Under playback the grid is a circle: the point after the last frame is
    // frame 0 of the *next* loop. Snapping along the line instead holds the
    // last frame for the whole final inter-frame gap and then lands past it —
    // every loop shows frame 23 twice and skips frame 0, which is the stutter
    // `frameTimes` excludes the endpoint to avoid. A driver test caught this;
    // any clock whose ticks do not land exactly on multiples of the interval
    // spends most of its wraps inside that gap.
    const t = play(initialTransport(ANIM), 0)
    const last = timeOfFrame(ANIM, 23)
    expect(timeAt(t, 1_999.999, ANIM)).toBe(timeOfFrame(ANIM, 0))
    expect(timeAt(t, 1_970, ANIM)).toBe(timeOfFrame(ANIM, 0))
    expect(timeAt(t, 1_950, ANIM)).toBe(last)
    // The plain snap stays on the line — that is the scrubber's rule, where
    // dragging to the end must show the end.
    expect(snapTime(ANIM, 1.999999)).toBe(last)
  })

  it('toggles without moving the time', () => {
    const t0 = seek(initialTransport(ANIM), 1, 0, ANIM)
    const t1 = toggle(t0, 0, ANIM)
    expect(t1.playing).toBe(true)
    expect(timeAt(t1, 0, ANIM)).toBe(timeAt(t0, 0, ANIM))
    const t2 = toggle(t1, 500, ANIM)
    expect(t2.playing).toBe(false)
    expect(timeAt(t2, 500, ANIM)).toBe(timeAt(t1, 500, ANIM))
    expect(timeAt(t2, 5_000, ANIM)).toBe(timeAt(t1, 500, ANIM))
  })

  it('ignores a play while playing and a pause while paused', () => {
    // Not cosmetic: re-anchoring a playing transport would snap away its
    // sub-frame phase, so a driver that called play twice would quietly lose
    // time. The driver relies on this being a no-op.
    const playing = play(initialTransport(ANIM), 0)
    expect(play(playing, 777)).toBe(playing)
    const paused = initialTransport(ANIM)
    expect(pause(paused, 777, ANIM)).toBe(paused)
  })

  it('is total on a still, whose one time never advances', () => {
    let t = initialTransport(STILL)
    const seen = new Set<number>([timeAt(t, 0, STILL)])
    t = play(t, 0)
    seen.add(timeAt(t, 5_000, STILL))
    t = seek(t, 42, 5_000, STILL)
    seen.add(timeAt(t, 9_999, STILL))
    t = toggle(t, 9_999, STILL)
    seen.add(timeAt(t, 50_000, STILL))
    t = pause(t, 50_000, STILL)
    seen.add(timeAt(t, 99_999, STILL))
    expect([...seen]).toEqual([stillTime(STILL)])
    // The modulus is a formality for a still, but it must still be usable.
    expect(loopDuration(STILL)).toBeGreaterThan(0)
    expect(Number.isFinite(loopDuration(STILL))).toBe(true)
  })

  it('is a pure function of its arguments, every one of them', () => {
    const base = play(initialTransport(ANIM), 1_234)
    const frozen = JSON.stringify(base)
    const calls = [
      () => initialTransport(ANIM),
      () => play(seek(initialTransport(ANIM), 0.4, 10, ANIM), 20),
      () => pause(base, 2_345, ANIM),
      () => seek(base, 1.1, 2_345, ANIM),
      () => toggle(base, 2_345, ANIM),
    ]
    for (const call of calls) expect(call()).toEqual(call())
    expect(JSON.stringify(base)).toBe(frozen)
    expect(timeAt(base, 2_345, ANIM)).toBe(timeAt(base, 2_345, ANIM))
    expect(calls).toHaveLength(5)
  })

  it('reads no clock, touches no DOM and keeps no module state, so a store can own it', () => {
    for (const forbidden of [
      /\bDate\s*\.\s*now\s*\(/, /\bperformance\s*\./, /\bsetTimeout\s*\(/, /\bsetInterval\s*\(/,
      /\brequestAnimationFrame\s*\(/, /\bdocument\b/, /\bwindow\b/, /addEventListener/,
    ]) {
      expect(SOURCE, String(forbidden)).not.toMatch(forbidden)
    }
    // Module-level `let`/`var` only — an indented one inside a function body is
    // local and fine. State has to be a value the caller holds.
    expect(SOURCE).not.toMatch(/^(let|var)\s/m)
    // Nothing editor-shaped: UiState and reduce stay on the other side. By
    // any spelling of an import — see `importsAnyOf` for the measurement.
    expect(importsAnyOf(SOURCE, EDITOR_MODULES)).toBe(false)
    for (const name of EDITOR_MODULES) {
      expect(importsAnyOf(`import { x } from "./${name}.js"`, EDITOR_MODULES), name).toBe(true)
    }
    expect(EDITOR_MODULES).toHaveLength(7)
    // Vacuity floor.
    expect(SOURCE).toContain('export function timeAt')
    expect(SOURCE).toContain('export function seek')
    expect(SOURCE.length).toBeGreaterThan(2_000)
  })
})
