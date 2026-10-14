import { describe, it, expect } from 'vitest'
import { compilePreset, PRESETS } from './presets.js'
import { evalTrack } from './track.js'
import { CTX as ctx } from '../testing/ctx.fixture.js'

/** Fully off the plate on each side, in stage coordinates (§10). */
const OFF_LEFT = -(ctx.contentW + ctx.marginLeft)   // -1310
const OFF_RIGHT = ctx.sceneW + ctx.marginRight      // 855

/**
 * Absolute depth a layer actually ends up at: tracks emit additive OFFSETS, so
 * asserting a track's raw `depth` channel tests the wrong number. The old
 * `emerge` test — `emerge` is the name `push` was renamed from — asserted raw
 * offsets and passed only because it happened to use a layer depth of 1.
 */
function absDepth(tr: Parameters<typeof evalTrack>[0], t: number, layerDepth: number) {
  return layerDepth + evalTrack(tr, t, 1).depth
}

describe('presets', () => {
  it('registers the v1 set', () => {
    expect(Object.keys(PRESETS).sort()).toEqual(
      ['bob', 'bounce', 'marquee', 'move', 'push', 'rotate', 'slide-in'],
    )
  })

  // UPDATED FOR THE PLATE/STAGE SPLIT (§10). The endpoints used to be
  // `-contentW` and `+sceneW`, which are off the *stage* but still inside the
  // *plate* that is emitted; the travel now runs margin to margin, so the track
  // is expressed against the image that is actually written out. The
  // assertions are exact rather than inequalities so that losing a margin term
  // fails here. (§10.5's own justification for this — "text pops in at the
  // stage edge" — is NOT what happens under a stage-only rasteriser; see
  // `PresetCtx.marginLeft` for the measurement.)
  it('marquee carries over-wide content fully off the left edge of the PLATE', () => {
    // 1200px of text across an 800px stage with a 110px left margin must end at
    // -1310, not -1200 and certainly not 0, or the tail never leaves the plate.
    const tr = compilePreset({ kind: 'marquee', speed: 100 }, ctx)
    const end = evalTrack({ ...tr, repeat: 'once' }, 1e6, 1)
    expect(end.x).toBe(OFF_LEFT)
    expect(end.x).toBeLessThan(-ctx.contentW)
  })

  it('marquee starts fully off the right edge of the PLATE', () => {
    const tr = compilePreset({ kind: 'marquee', speed: 100 }, ctx)
    expect(evalTrack(tr, 0, 1).x).toBe(OFF_RIGHT)
    expect(evalTrack(tr, 0, 1).x).toBeGreaterThan(ctx.sceneW)
  })

  it('marquee endpoints reduce to the pre-margin values when margins are 0', () => {
    // Pins the relationship rather than only the arithmetic: with no dead space
    // there is nothing to traverse and the old endpoints are correct.
    const tr = compilePreset({ kind: 'marquee', speed: 100 },
      { ...ctx, marginLeft: 0, marginRight: 0 })
    expect(evalTrack(tr, 0, 1).x).toBe(ctx.sceneW)
    expect(evalTrack({ ...tr, repeat: 'once' }, 1e6, 1).x).toBe(-ctx.contentW)
  })

  it('marquee loops by default', () => {
    expect(compilePreset({ kind: 'marquee' }, ctx).repeat).toBe('loop')
  })

  it('push rises from 0 to the layer depth and never touches opacity', () => {
    const tr = compilePreset({ kind: 'push' }, ctx)
    expect(absDepth(tr, 0, 1)).toBeCloseTo(0)
    expect(absDepth(tr, 1, 1)).toBeCloseTo(1)
    expect(JSON.stringify(tr)).not.toContain('opacity')
  })

  // REGRESSION. This preset (then named `emerge`) previously keyed absolute
  // 0 -> 1 into an ADDITIVE offset, so a layer at the default depth of 1
  // animated 1 -> 2, clamped, and sat completely static -- the design's own
  // stand-in for a fade did nothing.
  // A layer at 0.6 saturated by t=0.25. Only depth: 0 ever worked.
  it('push actually moves for a layer at the default depth', () => {
    const tr = compilePreset({ kind: 'push' }, ctx)
    const samples = [0, 0.25, 0.5, 0.75, 1].map(t => absDepth(tr, t, 1))
    expect(new Set(samples.map(v => v.toFixed(3))).size).toBeGreaterThan(3)
    expect(Math.max(...samples)).toBeCloseTo(1)
    expect(Math.min(...samples)).toBeCloseTo(0)
  })

  it('push targets a non-default layer depth without saturating', () => {
    const c = { ...ctx, layerDepth: 0.6 }
    const tr = compilePreset({ kind: 'push' }, c)
    expect(absDepth(tr, 0, 0.6)).toBeCloseTo(0)
    expect(absDepth(tr, 1, 0.6)).toBeCloseTo(0.6)
    expect(absDepth(tr, 0.25, 0.6)).toBeLessThan(0.6)
    expect(absDepth(tr, 0.25, 0.6)).toBeGreaterThan(0)
  })

  it('push honours an explicit absolute to/from', () => {
    const tr = compilePreset({ kind: 'push', from: 0.2, to: 0.5 }, ctx)
    expect(absDepth(tr, 0, 1)).toBeCloseTo(0.2)
    expect(absDepth(tr, 1, 1)).toBeCloseTo(0.5)
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

// Not in the implementation plan: `slide` — since renamed to `move` — plus
// `slide-in` and `bob` were specified in prose with no test behind them, so
// these pin the spec's wording.
describe('presets implemented from prose spec', () => {
  it('unknown-preset error lists the valid kinds', () => {
    expect(() => compilePreset({ kind: 'nope' }, ctx)).toThrow(/slide-in/)
  })

  it('move runs from its from pair to its to pair, once', () => {
    const tr = compilePreset({ kind: 'move', from: [0, 0], to: [100, 50] }, ctx)
    expect(tr.repeat).toBe('once')
    expect(evalTrack(tr, 0, 1)).toMatchObject({ x: 0, y: 0 })
    const end = evalTrack(tr, 1, 1)
    expect(end.x).toBeCloseTo(100)
    expect(end.y).toBeCloseTo(50)
  })

  // `speed` is `marquee`'s one distinct capability, moved onto `move` (design
  // §4.2b). `marquee` derives its duration from a one-axis `abs(from - to)`;
  // `move` travels in two, so the generalisation is the Euclidean distance.
  it('move derives its duration from speed, over the 2-D distance', () => {
    // 3-4-5: the distance is 5× the speed's unit, so `duration` is exactly 5
    // and a hypot computed on one axis only would give 3 or 4 instead.
    const tr = compilePreset({ kind: 'move', from: [0, 0], to: [30, 40], speed: 10 }, ctx)
    expect(tr.duration).toBeCloseTo(5, 10)
    // The endpoints are the ones `from`/`to` name — `speed` sets how long the
    // trip takes, never where it goes — and it is at the *derived* duration
    // that `to` is reached, which is the whole claim `speed` makes.
    expect(evalTrack(tr, 0, 1)).toMatchObject({ x: 0, y: 0 })
    expect(evalTrack(tr, 5, 1)).toMatchObject({ x: 30, y: 40 })
    // Halfway in time is halfway along, because `move` eases linearly: 10 px/s
    // for 2.5s is 25px, and 25px along a 3-4-5 is (15, 20).
    expect(evalTrack(tr, 2.5, 1)).toMatchObject({ x: 15, y: 20 })
  })

  it('move without speed leaves duration unset, so the track runs the scene', () => {
    // The guard on the above: `speed` is optional and adding it must not have
    // given every `move` a derived duration.
    expect(compilePreset({ kind: 'move', from: [0, 0], to: [30, 40] }, ctx).duration)
      .toBeUndefined()
  })

  it('move refuses speed together with an explicit duration, naming both', () => {
    // The two define the same quantity. Silently preferring one would make the
    // scene mean something the author cannot see in the file they wrote.
    expect(() => compilePreset(
      { kind: 'move', from: [0, 0], to: [30, 40], speed: 10, duration: 2 }, ctx,
    )).toThrow(/speed/)
    expect(() => compilePreset(
      { kind: 'move', from: [0, 0], to: [30, 40], speed: 10, duration: 2 }, ctx,
    )).toThrow(/duration/)
  })

  it('move rejects a non-positive speed, as marquee does', () => {
    expect(() => compilePreset({ kind: 'move', to: [30, 40], speed: 0 }, ctx))
      .toThrow(/> 0 px\/sec/)
    expect(() => compilePreset({ kind: 'move', to: [30, 40], speed: -5 }, ctx))
      .toThrow(/> 0 px\/sec/)
  })

  // UPDATED FOR THE PLATE/STAGE SPLIT: the two horizontal directions gained
  // their margin, the two vertical ones did not, because margins are x-only
  // (§10.2). Both halves matter — a blanket "add the margin" would push a
  // `from: 'top'` entry a plate-margin's worth above the frame for no reason.
  it('slide-in enters from off-PLATE horizontally, off-frame vertically, and rests at 0', () => {
    for (const [from, channel, offset] of [
      ['left', 'x', OFF_LEFT],
      ['right', 'x', OFF_RIGHT],
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
    expect(() => compilePreset({ kind: 'move', to: 'nope' }, ctx)).toThrow(/\[x, y\] number pair/)
    expect(() => compilePreset({ kind: 'slide-in', from: 'sideways' }, ctx)).toThrow(/must be one of/)
    expect(() => compilePreset({ kind: 'marquee', speed: 0 }, ctx)).toThrow(/> 0 px\/sec/)
    expect(() => compilePreset({ kind: 'bob', ease: 'elastic' }, ctx)).toThrow(/unknown easing/)
    expect(() => compilePreset({ kind: 'bob', repeat: 'forever' }, ctx)).toThrow(/unknown repeat/)
  })

  it('marquee duration follows speed over the full travel distance', () => {
    // 800px of stage + 1200px of content + 165px of margins = 2165px at
    // 100px/s. The margins lengthen the travel, so a `speed` keeps meaning
    // px/sec rather than silently scrolling faster to cover more ground.
    expect(compilePreset({ kind: 'marquee', speed: 100 }, ctx).duration)
      .toBeCloseTo((OFF_RIGHT - OFF_LEFT) / 100)
    expect(OFF_RIGHT - OFF_LEFT).toBe(2165)
  })
})

/**
 * `rotate` — the unit trap, named in the execution plan's trap table.
 *
 * The verb's parameters are **degrees** by design decision (§4.2), while
 * `Transform.rotate`/`rotateX`/`rotateY` are **radians** — that is what
 * `scratch.rotate()` takes and what `Math.cos` is fed in `raster.ts`. Nothing
 * upstream converts, so the conversion is the preset's job and these pin it.
 */
describe('rotate', () => {
  /** The channel each axis name selects, written out so the test is independent
   *  of the preset's own mapping. */
  const CHANNEL_OF = { x: 'rotateX', y: 'rotateY', z: 'rotate' } as const

  it('compiles a half turn to exactly Math.PI, on the axis it names', () => {
    // `Math.PI`, not 3.14159…. A tolerance here would pass against a
    // conversion that was wrong in the last few bits, and the whole claim is
    // that 180 degrees *is* π.
    for (const axis of ['x', 'y', 'z'] as const) {
      const tr = compilePreset({ kind: 'rotate', to: 180, axis }, ctx)
      const terminal = tr.keys[tr.keys.length - 1]!
      expect(terminal.t, axis).toBe(1)
      expect(terminal[CHANNEL_OF[axis]], axis).toBe(Math.PI)
    }
  })

  it('defaults to the z axis — the in-plane spin', () => {
    const tr = compilePreset({ kind: 'rotate', to: 180 }, ctx)
    expect(evalTrack(tr, 1, 1).rotate).toBe(Math.PI)
    expect(evalTrack(tr, 1, 1).rotateX).toBe(0)
    expect(evalTrack(tr, 1, 1).rotateY).toBe(0)
  })

  it('keys only its own axis, so two rotate animators compose', () => {
    // Same property `slide-in` has on x/y: an unkeyed channel must stay absent
    // rather than be pinned to 0, or a second animator on that channel is
    // overridden instead of summed.
    const tr = compilePreset({ kind: 'rotate', from: 10, to: 20, axis: 'y' }, ctx)
    expect(JSON.stringify(tr)).not.toContain('rotateX')
    expect(JSON.stringify(tr)).not.toContain('"rotate"')
  })

  it('is a delta from rest, so both ends default to no rotation', () => {
    const tr = compilePreset({ kind: 'rotate' }, ctx)
    expect(evalTrack(tr, 0, 1).rotate).toBe(0)
    expect(evalTrack(tr, 1, 1).rotate).toBe(0)
  })

  it('honours a non-zero from, in degrees', () => {
    const tr = compilePreset({ kind: 'rotate', from: -90, to: 90 }, ctx)
    expect(evalTrack(tr, 0, 1).rotate).toBe(-Math.PI / 2)
    expect(evalTrack(tr, 1, 1).rotate).toBe(Math.PI / 2)
  })

  it('rejects an axis that is not x, y or z', () => {
    expect(() => compilePreset({ kind: 'rotate', axis: 'w' }, ctx)).toThrow(/must be one of/)
    expect(() => compilePreset({ kind: 'rotate', axis: 'w' }, ctx)).toThrow(/x, y, z/)
  })
})
