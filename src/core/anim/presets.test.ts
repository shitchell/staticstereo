import { describe, it, expect } from 'vitest'
import { compilePreset, PRESETS } from './presets.js'
import { evalTrack } from './track.js'

const ctx = { sceneW: 800, sceneH: 450, contentW: 1200, contentH: 90 }

describe('presets', () => {
  it('registers the v1 set', () => {
    expect(Object.keys(PRESETS).sort()).toEqual(
      ['bob', 'bounce', 'emerge', 'marquee', 'slide', 'slide-in'],
    )
  })

  it('marquee carries over-wide content fully off the left edge', () => {
    // 1200px of text across an 800px viewport must end at -1200, not 0,
    // or the tail never leaves the frame.
    const tr = compilePreset({ kind: 'marquee', speed: 100 }, ctx)
    const end = evalTrack({ ...tr, repeat: 'once' }, 1e6, 1)
    expect(end.x).toBeLessThanOrEqual(-ctx.contentW)
  })

  it('marquee starts fully off the right edge', () => {
    const tr = compilePreset({ kind: 'marquee', speed: 100 }, ctx)
    expect(evalTrack(tr, 0, 1).x).toBeGreaterThanOrEqual(ctx.sceneW)
  })

  it('marquee loops by default', () => {
    expect(compilePreset({ kind: 'marquee' }, ctx).repeat).toBe('loop')
  })

  it('emerge animates depth from 0 and never touches opacity', () => {
    const tr = compilePreset({ kind: 'emerge', to: 1 }, ctx)
    expect(evalTrack(tr, 0, 1).depth).toBe(0)
    expect(evalTrack(tr, 1, 1).depth).toBeCloseTo(1)
    expect(JSON.stringify(tr)).not.toContain('opacity')
  })

  it('bounce returns to its start height', () => {
    const tr = compilePreset({ kind: 'bounce', height: 200 }, ctx)
    expect(evalTrack(tr, 0, 1).y).toBeCloseTo(evalTrack(tr, 1, 1).y)
  })

  it('throws a helpful error for an unknown preset', () => {
    expect(() => compilePreset({ kind: 'nope' }, ctx))
      .toThrow(/unknown animation preset "nope"/i)
  })
})

// Not in the implementation plan: `slide`, `slide-in` and `bob` were specified
// in prose with no test behind them, so these pin the spec's wording.
describe('presets implemented from prose spec', () => {
  it('unknown-preset error lists the valid kinds', () => {
    expect(() => compilePreset({ kind: 'nope' }, ctx)).toThrow(/slide-in/)
  })

  it('slide runs from its from pair to its to pair, once', () => {
    const tr = compilePreset({ kind: 'slide', from: [0, 0], to: [100, 50] }, ctx)
    expect(tr.repeat).toBe('once')
    expect(evalTrack(tr, 0, 1)).toMatchObject({ x: 0, y: 0 })
    const end = evalTrack(tr, 1, 1)
    expect(end.x).toBeCloseTo(100)
    expect(end.y).toBeCloseTo(50)
  })

  it('slide-in enters from off-frame and rests at 0', () => {
    for (const [from, channel, offset] of [
      ['left', 'x', -ctx.contentW],
      ['right', 'x', ctx.sceneW],
      ['top', 'y', -ctx.contentH],
      ['bottom', 'y', ctx.sceneH],
    ] as const) {
      const tr = compilePreset({ kind: 'slide-in', from }, ctx)
      expect(evalTrack(tr, 0, 1)[channel]).toBe(offset)
      expect(evalTrack(tr, 1, 1)[channel]).toBe(0)
    }
  })

  it('slide-in only keys the axis it enters on, so bob can own the other', () => {
    const tr = compilePreset({ kind: 'slide-in', from: 'left' }, ctx)
    expect(evalTrack(tr, 0.5, 1).y).toBe(0)
    expect(JSON.stringify(tr)).not.toContain('"y"')
  })

  it('bob wobbles a small amount and returns to 0', () => {
    const tr = compilePreset({ kind: 'bob', amount: 10 }, ctx)
    expect(tr.repeat).toBe('pingpong')
    expect(evalTrack(tr, 0, 1).y).toBe(0)
    expect(evalTrack(tr, 0.5, 1).y).toBeCloseTo(-10)
    expect(evalTrack(tr, 1, 1).y).toBe(0)
  })

  it('bounce accepts the design doc\'s `h` as well as the plan\'s `height`', () => {
    expect(evalTrack(compilePreset({ kind: 'bounce', h: 60 }, ctx), 0.5, 1).y).toBeCloseTo(-60)
    expect(evalTrack(compilePreset({ kind: 'bounce', height: 60 }, ctx), 0.5, 1).y).toBeCloseTo(-60)
  })

  it('every preset honours ease/repeat/start/duration overrides', () => {
    for (const kind of Object.keys(PRESETS)) {
      const tr = compilePreset(
        { kind, ease: 'easeInOut', repeat: 'pingpong', start: 2, duration: 3 },
        ctx,
      )
      expect([kind, tr.ease, tr.repeat, tr.start, tr.duration])
        .toEqual([kind, 'easeInOut', 'pingpong', 2, 3])
    }
  })

  it('rejects malformed params instead of quietly using the default', () => {
    expect(() => compilePreset({ kind: 'slide', to: 'nope' }, ctx)).toThrow(/\[x, y\] number pair/)
    expect(() => compilePreset({ kind: 'slide-in', from: 'sideways' }, ctx)).toThrow(/must be one of/)
    expect(() => compilePreset({ kind: 'marquee', speed: 0 }, ctx)).toThrow(/> 0 px\/sec/)
    expect(() => compilePreset({ kind: 'bob', ease: 'elastic' }, ctx)).toThrow(/unknown easing/)
    expect(() => compilePreset({ kind: 'bob', repeat: 'forever' }, ctx)).toThrow(/unknown repeat/)
  })

  it('marquee duration follows speed over the full travel distance', () => {
    // 800px of viewport + 1200px of content = 2000px at 100px/s.
    expect(compilePreset({ kind: 'marquee', speed: 100 }, ctx).duration).toBeCloseTo(20)
  })
})
