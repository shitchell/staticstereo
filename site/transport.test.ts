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
  it('imports nothing from controls.ts', () => {
    expect(SOURCE).not.toMatch(/from\s+'\.\/controls/)
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
    expect(timeAt(play(initialTransport(ANIM), 0), 1_000, ANIM)).toBeCloseTo(1, 10)
    expect(timeAt(play(initialTransport(fine), 0), 1_000, fine)).toBeCloseTo(1, 10)
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
    expect(timeAt(t, loopDuration(ragged) * 1_000, ragged)).toBe(timeOfFrame(ragged, 0))
    // The positive control: wrapping on `duration` would not be back at frame 0.
    expect(timeAt(t, 0.55 * 1_000, ragged)).not.toBe(timeOfFrame(ragged, 0))
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
    // Nothing editor-shaped: UiState and reduce stay on the other side.
    expect(SOURCE).not.toMatch(/from\s+'\.\/(controls|main|examples|legibility|diagnostics|depthmap|stageguide)/)
    // Vacuity floor.
    expect(SOURCE).toContain('export function timeAt')
    expect(SOURCE).toContain('export function seek')
    expect(SOURCE.length).toBeGreaterThan(2_000)
  })
})
