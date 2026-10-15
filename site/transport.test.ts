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
 * **The `./` anchor was the second half of the same mistake, and it was still
 * open after the first fix.** Widening the quoting left the pattern anchored on
 * a literal `./`, so a module reached by any other relative spelling walked
 * through all three bans while the test's own name said "by any spelling".
 * Measured: `import { reduce } from "../site/controls.js"` — a resolvable
 * import of the editor's entire reducer — planted in `transport.ts` left this
 * file and `transportdriver.test.ts` at **35 passed, exit 0**.
 *
 * That is the failure the first fix's own commit message warned about one
 * paragraph above the defect: "'unlikely' and 'guarded' are not the same
 * property, and the comment above it was being read as the second." Prettier
 * would not write `../site/controls.js` for a sibling either.
 *
 * So the prefix is `.` or `..` and any number of path segments may intervene
 * before the module name. The trailing `(?![\w-])` is what keeps the widening
 * from buying false positives: without it `./maintenance.js` matches `main`,
 * and with path segments allowed the surface for that kind of collision is much
 * larger than it was. It rejects nothing a real specifier spells —
 * `./controls.js` and `./controls` both continue past the name on a
 * non-word character.
 *
 * A strict superset of the patterns it replaces, in both widenings: all three
 * quote characters, `import`/`require` with or without call parentheses, and
 * any relative path. Nothing it used to reject is now accepted. What it still
 * does not see is a non-relative specifier — a bare package name or a path
 * alias — and neither resolves in this repo, which is why the line is drawn
 * there and not further out.
 */
function importsAnyOf(source: string, modules: readonly string[]): boolean {
  return new RegExp(
    `(?:\\bfrom|\\bimport|\\brequire)\\s*\\(?\\s*['"\`]\\.{1,2}\\/(?:[\\w.-]+\\/)*` +
    `(?:${modules.join('|')})(?![\\w-])`,
  ).test(source)
}

/**
 * `EDITOR_MODULES` and `importsAnyOf` are **defined twice** — here and in
 * `transportdriver.test.ts` — and until now nothing asserted the copies agree.
 *
 * Definitions are what the count is of, and the word matters in the one pair of
 * files whose subject is copies drifting: those two definitions are called from
 * **three** ban assertions (two in this file, one in the sibling), so "two" and
 * "three" are both true of different things and `transportdriver.test.ts` used
 * to say "the third copy" where this said "twice". Both now say definitions.
 *
 * `5b9b05f`'s whole rationale is that one list living in several files with one
 * of them guarded is this repo's signature defect: the animatable-channel list
 * is guarded in `track.ts` and duplicated unguarded in `src/cli/scene.ts` and
 * `site/scene.ts`, which is why both site validators silently drop channels. A
 * two-copy ban predicate drifts the same way, and the copies have already been
 * edited together twice — once to widen the quoting, once to widen the path.
 * The third time is the one that gets done in one file.
 *
 * ## Why an identity assertion and not a shared module
 *
 * Both ways of actually sharing it cost more than they fix, which is a judgement
 * and so is recorded rather than implied:
 *
 *  - **A non-test `site/` module.** Anything under `site/` that does not end
 *    `.test.ts` enters `dist.test.ts`'s freshness source set, so editing a
 *    test helper would mark both built directories stale and silently skip
 *    every Pages-critical assertion until the next build — the exact trap this
 *    phase has already lost one suite to (`1130 passed | 20 skipped`). It also
 *    puts test scaffolding on the shipped module's typecheck surface.
 *  - **Importing the other `.test.ts`.** A test file's `describe`s register
 *    into whichever suite imports it, so the other file's assertions would run
 *    twice and the suite count would stop meaning what it says.
 *
 * So the duplication stays and the *agreement* is asserted, which is what was
 * actually missing. It is cheap, it needs no new machinery, and it reds
 * whichever copy drifts — the assertion is symmetric, so one of it is enough
 * for one fact and a second copy would reintroduce the problem it is about.
 *
 * Text identity rather than agreement on probe inputs, for the reason this file
 * already records one block down about the frame grid: "a behavioural test
 * would pass against a divergent copy until the day the two implementations
 * disagreed." Whitespace is normalised so that prettier rewrapping a line is
 * not a failure; comments are stripped because the two docblocks differ
 * deliberately, one carrying the rationale and the other pointing at it.
 */
describe('the import ban is one predicate, even though it is written twice', () => {
  const banSource = (file: string): string => {
    const code = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    const block = /const EDITOR_MODULES = \[[\s\S]*?\n\}\n/.exec(code)?.[0] ?? ''
    return block.replace(/\s+/g, ' ').trim()
  }

  it('is byte-identical in both files, once comments and wrapping are set aside', () => {
    const mine = banSource('transport.test.ts')
    const theirs = banSource('transportdriver.test.ts')
    // Vacuity floor, and it is the load-bearing half: an extraction that
    // matched nothing in both files would return two empty strings and compare
    // them happily. Named per file so the failure says which one moved.
    const copies: readonly (readonly [string, string])[] = [
      ['transport.test.ts', mine],
      ['transportdriver.test.ts', theirs],
    ]
    for (const [file, text] of copies) {
      expect(text.length, `${file}: the ban block was not found — it was renamed or moved`)
        .toBeGreaterThan(200)
      expect(text, file).toContain('EDITOR_MODULES')
      expect(text, file).toContain('function importsAnyOf')
      // The two widenings, so a copy reverted to either old pattern is caught
      // by this check and not only by its own positive controls.
      expect(text, `${file}: the quote class is gone`).toContain(`['"`)
      expect(text, `${file}: the path prefix is anchored on ./ again`).toContain('{1,2}')
    }
    expect(
      theirs,
      'the two copies of the import ban have drifted apart: one of them was widened, ' +
      'narrowed or re-listed and the other was not, which is the defect 5b9b05f set out ' +
      'to avoid reproducing',
    ).toBe(mine)
  })
})

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
      // The measured one for the *path* hole, as opposed to the quoting hole
      // above: a resolvable import of the editor's whole reducer that the
      // `./`-anchored pattern walked straight through.
      `import { reduce } from "../site/controls.js"`,
      `import { reduce } from '../../site/controls.js'`,
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

  /**
   * **This test asserted the opposite until the ruling below, and the change is
   * a decision and not a bug fix.**
   *
   * It read *"wraps a seek out of range into the scene rather than clamping or
   * throwing"*, with `2.5 → frame 6`, `-0.5 → frame 18` and `4 → frame 0`, and
   * it was correct about the behaviour P2 shipped. What P2 did not have was the
   * decision its own `seek` declaration records as open and assigns to P3. That
   * decision, from the handover's standing rulings:
   *
   * > **∀t, `seek` and `snapTime` select the same frame.** Both clamp, because
   * > an editor scrubber dragged past the end parks at the end; a playhead that
   * > teleports to zero is a bug in every timeline tool anyone has used.
   *
   * Out-of-range and inside-the-final-gap were never two rules: `seek` reached
   * both through one circular fold, so agreement with `snapTime` for *every* t
   * settles the out-of-range case as a consequence rather than as a second
   * choice. There is no reading of the invariant under which this test's old
   * rows survive — `2.5` would have to be frame 6 and the last frame at once.
   *
   * Kept and re-pointed rather than deleted, because the thing it guards is
   * still worth guarding and because the rows are the clearest statement of
   * what changed. The non-finite rows are **unchanged**: frame 0 is
   * `frameIndexAt`'s own older rule for a value from a slider or a URL, it is
   * not "clamped to the end", and it keeps the two functions agreeing.
   */
  it('clamps a seek out of range the way snapTime does, rather than wrapping', () => {
    const cases: ReadonlyArray<readonly [number, number]> = [
      [2.5, 23], [-0.5, 0], [-2, 0], [4, 23], [Number.NaN, 0], [Number.POSITIVE_INFINITY, 0],
    ]
    for (const [sought, frame] of cases) {
      const t = seek(initialTransport(ANIM), sought, 0, ANIM)
      expect(timeAt(t, 0, ANIM), String(sought)).toBe(timeOfFrame(ANIM, frame))
      // ...and `snapTime` answers the same, which is the invariant rather than
      // the row. Without this half the rows are a value pin again.
      expect(frameIndexAt(ANIM, snapTime(ANIM, sought)), String(sought)).toBe(frame)
    }
    expect(cases).toHaveLength(6)
    // The rows that moved really did move: the superseded rule, spelled out,
    // still gives its old answers, so this test is discriminating between the
    // two rules and not merely true of both.
    expect(frameIndexAt(ANIM, snapLoopTime(ANIM, 2.5))).toBe(6)
    expect(frameIndexAt(ANIM, snapLoopTime(ANIM, 4))).toBe(0)
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
      // ...and by a path that is not a bare sibling, which is the hole the
      // `./`-anchored pattern had. One per module, because a ban that is shut
      // for `controls` and open for the other six is the same defect narrowed.
      expect(importsAnyOf(`import { x } from "../site/${name}.js"`, EDITOR_MODULES), name)
        .toBe(true)
    }
    expect(EDITOR_MODULES).toHaveLength(7)
    // Vacuity floor.
    expect(SOURCE).toContain('export function timeAt')
    expect(SOURCE).toContain('export function seek')
    expect(SOURCE.length).toBeGreaterThan(2_000)
  })
})

/**
 * `seek` and `snapTime` are the project's two answers to "which frame is at
 * time *t*", and they used to give different ones.
 *
 * The decision, from the handover's standing rulings (`69abca9`), quoted
 * because a ruling's authority is the decision behind it and this one replaced
 * an inference that had been sitting in the same section wearing an
 * inheritance's clothes:
 *
 * > Two functions that both answer "which frame is at time *t*" must not
 * > disagree for any *t* — that, not the endpoint convention, is the invariant
 * > worth pinning, and it is assert-on-structure rather than a value pin:
 * > **∀t, `seek` and `snapTime` select the same frame.** Both clamp, because an
 * > editor scrubber dragged past the end parks at the end; a playhead that
 * > teleports to zero is a bug in every timeline tool anyone has used.
 * > **Playback wrap remains a separate operation** — looping is `repeat`, which
 * > acts on advance, not on frame selection.
 *
 * `seek`'s own declaration recorded this as the open question P3 owned, and
 * that record is kept there rather than rewritten.
 *
 * ## Why this is a generated sweep and not a table of times
 *
 * A table samples where its author looked. The two rules agree at every frame
 * boundary and at most of the interior — they part only inside the **final
 * inter-frame gap**, between the last frame's sample time and `loopDuration`,
 * and P2 measured that they are back in agreement a third of the way into it
 * (2 s 12 fps: apart at 1.99, together at 1.95). A hand-written table that
 * happened to pick 1.95 would have reported the invariant held. So the inputs
 * are generated from each grid's own geometry — every frame time, quarter-frame
 * offsets after each of them, a dense fan across the final gap out to its far
 * edge, values past `loopDuration`, and values below zero — and the grids vary
 * both fps and duration, because the gap's width is `1/fps` and its position
 * depends on the frame count.
 */
describe('seek and snapTime select the same frame, and both clamp', () => {
  /**
   * Six grids, each a different shape of the thing under test.
   *
   * `ragged` is the case where `duration × fps` is not a whole number, so
   * `loopDuration` and `scene.duration` differ and the gap is not where
   * `duration` says it is; `1 fps` makes the gap a full second wide, which is
   * the width at which a wrap would be unmissable in a real scrubber; the still
   * is here for totality, and it is degenerate — one grid point, and no gap at
   * all, since its single sample sits at the scene midpoint rather than at 0.
   */
  const GRIDS: readonly (readonly [string, Scene])[] = [
    ['12fps/2s — P2 measured the disagreement on this one', ANIM],
    ['6fps/1s', { ...ANIM, fps: 6, duration: 1 }],
    ['25fps/0.55s — ragged, 14 frames spanning 0.56s', { ...ANIM, fps: 25, duration: 0.55 }],
    ['60fps/0.5s', { ...ANIM, fps: 60, duration: 0.5 }],
    ['1fps/3s — a one-second gap', { ...ANIM, fps: 1, duration: 3 }],
    ['a still — one grid point, no gap', STILL],
  ]

  /** Every grid but the still has a final gap to sample; the still has none. */
  const WITH_GAP = GRIDS.filter(([, s]) => lastFrameTime(s) < loopDuration(s))

  /**
   * The swept inputs for one grid, derived from that grid rather than typed.
   *
   * The fractions inside the final gap run to 0.99999 rather than stopping at
   * 0.9 because the gap is where the two rules part and the far edge of it is
   * where they part hardest — the old circular rule flips to frame 0 once the
   * distance forward is shorter than the distance back, which is the gap's
   * second half.
   */
  const sweptTimes = (scene: Scene): number[] => {
    const step = 1 / sceneFps(scene)
    const last = lastFrameTime(scene)
    const span = loopDuration(scene)
    const out: number[] = [0, last, span]
    for (const t of frameTimesOf(scene)) {
      for (const f of [0, 0.25, 0.5, 0.75]) out.push(t + f * step)
    }
    for (const f of [0.01, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 0.99, 0.999, 0.99999]) {
      out.push(last + f * (span - last))
    }
    for (const k of [1e-9, 1e-6, 0.001, 0.1, 0.5, 1, 2, 7.25]) out.push(span + k)
    for (const k of [1e-9, 1e-6, 0.001, step / 4, step / 2, step, 1, 2.5, 100]) out.push(-k)
    out.push(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)
    return out
  }

  it('agrees with snapTime at every swept t, on every grid', () => {
    for (const [label, scene] of GRIDS) {
      for (const t of sweptTimes(scene)) {
        const anchored = seek(initialTransport(scene), t, 0, scene).anchorTime
        expect(frameIndexAt(scene, anchored), `${label} @ t=${t}`)
          .toBe(frameIndexAt(scene, snapTime(scene, t)))
        // The anchor is a point of the grid, which is what `TransportState`
        // promises and what makes index equality the same claim as value
        // equality.
        expect(frameTimesOf(scene), `${label} @ t=${t}`).toContain(anchored)
      }
    }
  })

  /**
   * The clamp, stated against the **grid** and not against either function.
   *
   * This is the arm that can still fail once `seek` is defined in terms of
   * `snapTime`: the agreement test above becomes a tautology the moment one
   * calls the other — it would then prove only that the composition ran twice —
   * so the floor moves here, where each function is compared to an index
   * computed from `frameTimesOf(scene).length` rather than to its twin.
   *
   * Finite `t` only. A non-finite input is frame 0 by `frameIndexAt`'s own
   * older rule, for a value that arrived from a slider or a URL, and it is not
   * "past the end": `+Infinity` parks at the first frame, not the last. That
   * rule predates this ruling, keeps the two functions agreeing — which is the
   * invariant that was actually decided — and no scrubber can produce one.
   */
  it('parks past the end on the last frame and below zero on the first, never wrapping', () => {
    for (const [label, scene] of GRIDS) {
      const count = frameTimesOf(scene).length
      const last = lastFrameTime(scene)
      for (const t of sweptTimes(scene).filter(Number.isFinite)) {
        const viaSeek = frameIndexAt(scene, seek(initialTransport(scene), t, 0, scene).anchorTime)
        const viaSnap = frameIndexAt(scene, snapTime(scene, t))
        if (t > last) {
          expect(viaSeek, `${label} @ t=${t}: seek did not park on the last frame`)
            .toBe(count - 1)
          expect(viaSnap, `${label} @ t=${t}: snapTime did not park on the last frame`)
            .toBe(count - 1)
        }
        if (t < 0) {
          expect(viaSeek, `${label} @ t=${t}: seek did not park on the first frame`).toBe(0)
          expect(viaSnap, `${label} @ t=${t}: snapTime did not park on the first frame`).toBe(0)
        }
      }
    }
  })

  /**
   * The sweep can see the bug.
   *
   * Three separate ways for a sweep like this to report a green lie, each
   * closed by one block below: sampling only where the rules already agree;
   * running over an empty or degenerate input set; and comparing a function
   * with itself over inputs that never reach the discriminating region.
   */
  it('samples the region where the two rules actually part', () => {
    for (const [label, scene] of WITH_GAP) {
      const times = sweptTimes(scene)
      const last = lastFrameTime(scene)
      const span = loopDuration(scene)
      // Inside the final gap, and specifically in its **far half**, which is
      // the only place the circular rule ever answered frame 0.
      expect(times.filter((t) => t > last && t < span).length, `${label}: no sample in the gap`)
        .toBeGreaterThan(3)
      expect(
        times.some((t) => t > (last + span) / 2 && t < span),
        `${label}: no sample in the far half of the gap`,
      ).toBe(true)
      expect(times.some((t) => t > span), `${label}: no sample past the end`).toBe(true)
      expect(times.some((t) => t < 0), `${label}: no sample below zero`).toBe(true)
    }
    // The grids are distinct in both axes that move the gap, so six entries are
    // six shapes and not one shape written six times.
    expect(new Set(GRIDS.map(([, s]) => `${sceneFps(s)}/${frameTimesOf(s).length}`)).size)
      .toBe(GRIDS.length)
    expect(WITH_GAP, 'only the still should be gapless').toHaveLength(GRIDS.length - 1)

    // The positive control: the rule `seek` applied before this ruling, spelled
    // out, really does give a different answer — and really does agree at 1.95,
    // which is the fact that would have let a hand-written table miss it. This
    // is P2's measurement, re-run here rather than quoted.
    expect(frameIndexAt(ANIM, snapLoopTime(ANIM, 1.99))).toBe(0)
    expect(frameIndexAt(ANIM, snapTime(ANIM, 1.99))).toBe(23)
    expect(frameIndexAt(ANIM, snapLoopTime(ANIM, 1.95)))
      .toBe(frameIndexAt(ANIM, snapTime(ANIM, 1.95)))
    // ...and the swept inputs land in that window, so the control is a control
    // over this sweep and not over some other one.
    expect(sweptTimes(ANIM).some((t) => t > 1.95 && t < 2)).toBe(true)
  })

  /**
   * Criterion 3: the clamp is about frame **selection**; looping is about
   * **advance**, and the ruling keeps them separate operations.
   *
   * The two existing playback tests in this file cover the wrap on its own, so
   * this one covers only the join the change creates — a seek that now parks on
   * the last frame instead of jumping to frame 0 must still wrap on the very
   * next tick, rather than sticking at the end for a frame or stopping there.
   */
  it('still loops after a seek into the final gap', () => {
    const t = seek(play(initialTransport(ANIM), 0), 1.99, 0, ANIM)
    expect(t.playing).toBe(true)
    expect(timeAt(t, 0, ANIM), 'the seek should park on the end').toBe(timeOfFrame(ANIM, 23))
    for (let k = 1; k <= 2 * 24; k++) {
      expect(timeAt(t, k * MS_PER_FRAME, ANIM), `tick ${k}`)
        .toBe(timeOfFrame(ANIM, (k - 1) % 24))
    }
  })
})
