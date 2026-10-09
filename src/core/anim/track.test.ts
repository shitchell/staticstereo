import { describe, it, expect } from 'vitest'
import { evalTrack, composeAnim } from './track.js'
import { IDENTITY } from '../types.js'

describe('evalTrack', () => {
  const tr = { keys: [{ t: 0, x: 0 }, { t: 1, x: 100 }] }

  it('returns the first key at t=0', () => {
    expect(evalTrack(tr, 0, 1).x).toBe(0)
  })

  it('interpolates linearly at the midpoint', () => {
    expect(evalTrack(tr, 0.5, 1).x).toBeCloseTo(50)
  })

  it('returns the last key at t=1', () => {
    expect(evalTrack(tr, 1, 1).x).toBe(100)
  })

  it('leaves unspecified channels at identity', () => {
    const r = evalTrack(tr, 0.5, 1)
    expect(r.y).toBe(IDENTITY.y)
    expect(r.scale).toBe(IDENTITY.scale)
  })

  it('interpolates each channel independently', () => {
    const t2 = { keys: [{ t: 0, x: 0, depth: 0 }, { t: 1, x: 10, depth: 1 }] }
    const r = evalTrack(t2, 0.25, 1)
    expect(r.x).toBeCloseTo(2.5)
    expect(r.depth).toBeCloseTo(0.25)
  })

  it('clamps past the end when repeat is "once"', () => {
    expect(evalTrack({ ...tr, repeat: 'once' }, 1.5, 1).x).toBe(100)
  })

  it('wraps when repeat is "loop"', () => {
    expect(evalTrack({ ...tr, repeat: 'loop' }, 1.25, 1).x).toBeCloseTo(25)
  })

  it('reverses on alternate cycles when repeat is "pingpong"', () => {
    expect(evalTrack({ ...tr, repeat: 'pingpong' }, 1.25, 1).x).toBeCloseTo(75)
  })

  // Not in the implementation plan. The plan's `localTime` fed negative time
  // straight into the repeat wrap, so a track with `start: 1` and `repeat:
  // 'loop'` showed 75% of its animation *before it was supposed to begin*.
  // Every repeat mode must hold the first key until `start`.
  it('holds the first key before start, whatever the repeat mode', () => {
    for (const repeat of ['once', 'loop', 'pingpong'] as const) {
      const windowed = { keys: [{ t: 0, x: 0 }, { t: 1, x: 100 }], start: 1, duration: 2, repeat }
      expect(evalTrack(windowed, 0, 4).x).toBe(0)
      expect(evalTrack(windowed, 0.5, 4).x).toBe(0)
    }
  })

  it('honours start and duration windows', () => {
    const windowed = { keys: [{ t: 0, x: 0 }, { t: 1, x: 100 }], start: 1, duration: 2 }
    expect(evalTrack(windowed, 0.5, 4).x).toBe(0)      // before start -> first key
    expect(evalTrack(windowed, 2.0, 4).x).toBeCloseTo(50)
    expect(evalTrack(windowed, 3.5, 4).x).toBe(100)    // after end -> last key
  })
})

describe('composeAnim', () => {
  it('sums translations and multiplies scales', () => {
    const r = composeAnim([
      { keys: [{ t: 0, x: 10, scale: 2 }] },
      { keys: [{ t: 0, x: 5, scale: 3 }] },
    ], 0, 1)
    expect(r.x).toBe(15)
    expect(r.scale).toBe(6)
  })

  it('returns identity for an empty or absent anim', () => {
    expect(composeAnim(undefined, 0, 1)).toEqual(IDENTITY)
    expect(composeAnim([], 0, 1)).toEqual(IDENTITY)
  })

  it('accepts a bare track as well as a list', () => {
    expect(composeAnim({ keys: [{ t: 0, x: 4 }] }, 0, 1).x).toBe(4)
  })
})

// Not in the implementation plan. These pin the resolution of the plan's
// `compile = () => ({ keys: [] })` default, which would have made an unwired
// preset render a motionless scene with no error at all.
describe('composeAnim preset wiring', () => {
  const ctx = {
    sceneW: 800, sceneH: 450, contentW: 100, contentH: 20, layerDepth: 1,
    marginLeft: 110, marginRight: 55,
  }

  it('throws rather than silently dropping a preset when no compiler is passed', () => {
    expect(() => composeAnim({ kind: 'marquee' }, 0, 1, ctx))
      .toThrow(/no preset compiler/i)
  })

  it('throws when a preset is used but no PresetCtx is passed', () => {
    expect(() => composeAnim({ kind: 'marquee' }, 0, 1, undefined, () => ({ keys: [] })))
      .toThrow(/needs a PresetCtx/i)
  })

  it('threads the ctx through to the compiler', () => {
    const seen: unknown[] = []
    composeAnim({ kind: 'marquee' }, 0, 1, ctx, (p, c) => {
      seen.push([p.kind, c])
      return { keys: [{ t: 0, x: c.contentW }] }
    })
    expect(seen).toEqual([['marquee', ctx]])
  })

  it('composes a raw track and a compiled preset together', () => {
    const r = composeAnim(
      [{ keys: [{ t: 0, y: 7 }] }, { kind: 'stub' }],
      0, 1, ctx,
      () => ({ keys: [{ t: 0, y: 3, scale: 2 }] }),
    )
    expect(r.y).toBe(10)
    expect(r.scale).toBe(2)
  })
})
