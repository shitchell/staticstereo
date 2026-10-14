import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as controls from './controls.js'
import * as transport from './transport.js'
import { frameIndexAt, frameTimesOf, lastFrameTime, timeOfFrame } from './transport.js'
import { stillTime } from '../src/core/index.js'
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
