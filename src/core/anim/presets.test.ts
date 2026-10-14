import { describe, it, expect } from 'vitest'
import { compilePreset, PRESETS } from './presets.js'
import { composeAnim, evalTrack } from './track.js'
import { CTX as ctx } from '../testing/ctx.fixture.js'
import type { Track } from '../types.js'

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
  it('registers the five verbs and nothing else', () => {
    // Design §4.2b: `PRESETS` holds the verb vocabulary, full stop. The four
    // kinds that used to sit alongside it — `marquee`, `bounce`, `bob`,
    // `slide-in` — were *compositions* of these, which is why each is
    // expressible as an ordinary `Anim`: `marquee` is a `move` with a `speed`
    // and `repeat: loop`, `bounce` and `bob` are three-key tracks. P6 rebuilds
    // them as UI templates that emit exactly that; the golden fixture's
    // history is the reference for what they compiled to.
    expect(Object.keys(PRESETS).sort()).toEqual(
      ['flip', 'move', 'push', 'rotate', 'scale'],
    )
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

  it('throws a helpful error for an unknown preset', () => {
    expect(() => compilePreset({ kind: 'nope' }, ctx))
      .toThrow(/unknown animation preset "nope"/i)
  })
})

// Not in the implementation plan: `slide` — since renamed to `move` — was
// specified in prose with no test behind it, so these pin the spec's wording.
describe('presets implemented from prose spec', () => {
  it('unknown-preset error lists the valid kinds', () => {
    // One registered kind is enough to prove the list is being built from the
    // registry rather than hardcoded; `presets.test.ts`'s first test pins the
    // list itself. `slide-in` used to be the probe here, which is exactly why
    // a probe naming one kind is the wrong shape for a shrinking registry.
    for (const kind of Object.keys(PRESETS)) {
      expect(() => compilePreset({ kind: 'nope' }, ctx)).toThrow(kind)
    }
  })

  it('move runs from its from pair to its to pair, once', () => {
    const tr = compilePreset({ kind: 'move', from: [0, 0], to: [100, 50] }, ctx)
    expect(tr.repeat).toBe('once')
    expect(evalTrack(tr, 0, 1)).toMatchObject({ x: 0, y: 0 })
    const end = evalTrack(tr, 1, 1)
    expect(end.x).toBeCloseTo(100)
    expect(end.y).toBeCloseTo(50)
  })

  // `speed` was `marquee`'s one distinct capability, moved onto `move` (design
  // §4.2b) — which is what let `marquee` be deleted. `marquee` derived its
  // duration from a one-axis `abs(from - to)`; `move` travels in two, so the
  // generalisation is the Euclidean distance.
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

  it('move rejects a non-positive speed', () => {
    expect(() => compilePreset({ kind: 'move', to: [30, 40], speed: 0 }, ctx))
      .toThrow(/> 0 px\/sec/)
    expect(() => compilePreset({ kind: 'move', to: [30, 40], speed: -5 }, ctx))
      .toThrow(/> 0 px\/sec/)
  })

  it('move rejects a speed over a zero-length move, naming the endpoints', () => {
    // `speed` derives `duration` from the distance travelled, so a move that
    // goes nowhere derives `duration: 0` — and `localTime` divides by it,
    // giving `±Infinity` and then a track pinned to one endpoint. An
    // author-written `duration: 0` is already rejected by `overrides()`; the
    // derived path had no equivalent check, and `speed` is new in this phase
    // so this hole is ours. Defaults make it reachable without writing any
    // endpoint at all: `{kind: 'move', speed: 60}` is `[0,0]` → `[0,0]`.
    for (const p of [
      { kind: 'move', speed: 60 },
      { kind: 'move', from: [10, 20], to: [10, 20], speed: 60 },
    ]) {
      expect(() => compilePreset(p, ctx), JSON.stringify(p)).toThrow(/must be > 0/)
      expect(() => compilePreset(p, ctx), JSON.stringify(p)).toThrow(/"from"/)
    }
    // The guard is on the distance, not on `speed`, so a move that does travel
    // is untouched however small the trip.
    expect(compilePreset({ kind: 'move', to: [0, 1], speed: 60 }, ctx).duration)
      .toBeCloseTo(1 / 60, 12)
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

  it('every preset accepts a cubic-bezier ease and carries it into the track', () => {
    // `overrides()` tested `ease in EASINGS`, which is every named curve and
    // nothing else — so it rejected the entire bezier half of `Easing`. The
    // string travels into the `Track` unchanged; `evalTrack` is what resolves
    // it, and it is the only thing that needs to.
    const ease = 'cubic-bezier(.17,.67,.83,.67)'
    for (const kind of Object.keys(PRESETS)) {
      expect(compilePreset({ kind, ease }, ctx).ease, kind).toBe(ease)
    }
  })

  it('names the cubic-bezier form when it rejects an easing', () => {
    // The message was built entirely from `Object.keys(EASINGS)`, which no
    // longer describes what is accepted. Left alone it tells an author that a
    // perfectly valid `cubic-bezier(...)` is invalid — and then lists five
    // alternatives, none of which is what they wanted.
    expect(() => compilePreset({ kind: 'move', ease: 'elastic' }, ctx))
      .toThrow(/cubic-bezier/)
    // A malformed bezier is still a rejection, and still names the form.
    expect(() => compilePreset({ kind: 'move', ease: 'cubic-bezier(0,0,1)' }, ctx))
      .toThrow(/cubic-bezier/)
    // Out-of-range x is rejected at the validator rather than reaching the
    // solver, which throws from inside the render loop.
    expect(() => compilePreset({ kind: 'move', ease: 'cubic-bezier(2,0,1,1)' }, ctx))
      .toThrow(/unknown easing/)
  })

  it('rejects malformed params instead of quietly using the default', () => {
    expect(() => compilePreset({ kind: 'move', to: 'nope' }, ctx)).toThrow(/\[x, y\] number pair/)
    expect(() => compilePreset({ kind: 'rotate', axis: 'sideways' }, ctx)).toThrow(/must be one of/)
    expect(() => compilePreset({ kind: 'move', to: [1, 0], speed: 0 }, ctx)).toThrow(/> 0 px\/sec/)
    expect(() => compilePreset({ kind: 'move', ease: 'elastic' }, ctx)).toThrow(/unknown easing/)
    expect(() => compilePreset({ kind: 'move', repeat: 'forever' }, ctx)).toThrow(/unknown repeat/)
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
    // An unkeyed channel must stay absent rather than be pinned to 0, or a
    // second animator on that channel is overridden instead of summed.
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

/**
 * `scale` — the one channel `composeAnim` does not sum.
 *
 * Every other channel is an additive offset from rest, so the rest value is 0
 * and a verb writes a delta. `scale` is multiplied and `IDENTITY.scale` is 1,
 * so for this channel the absolute factor *is* the delta, and the usual
 * "subtract the rest value" reflex is a catastrophe rather than a nuance.
 */
describe('scale', () => {
  it('multiplies rather than adds when composed with another animator', () => {
    // The acceptance criterion: 2 alongside 3 is 6, not 5. A raw track supplies
    // the second factor so the test does not depend on two presets at once.
    const doubled = { kind: 'scale', to: 2 }
    const tripled: Track = { keys: [{ t: 0, scale: 3 }, { t: 1, scale: 3 }] }
    expect(composeAnim([doubled, tripled], 1, 1, ctx, compilePreset).scale).toBe(6)
  })

  it('is absolute, so `to: 2` is a doubling', () => {
    const tr = compilePreset({ kind: 'scale', to: 2 }, ctx)
    expect(evalTrack(tr, 1, 1).scale).toBe(2)
  })

  it('defaults to the multiplicative identity at both ends, not to zero', () => {
    // The guard on the whole design. Writing `to − 1` would make the *default*
    // track 0 → 0 and collapse every bare `scale` layer to nothing — a
    // zero-scale catastrophe that an additive reading of "delta from rest"
    // produces directly.
    const tr = compilePreset({ kind: 'scale' }, ctx)
    expect(evalTrack(tr, 0, 1).scale).toBe(1)
    expect(evalTrack(tr, 1, 1).scale).toBe(1)
    expect(composeAnim([{ kind: 'scale' }], 1, 1, ctx, compilePreset).scale).toBe(1)
  })

  it('shrinks on a factor below 1 and honours an explicit from', () => {
    const tr = compilePreset({ kind: 'scale', from: 2, to: 0.5 }, ctx)
    expect(evalTrack(tr, 0, 1).scale).toBe(2)
    expect(evalTrack(tr, 1, 1).scale).toBe(0.5)
  })

  it('keys only scale, so it composes with a move on the same layer', () => {
    const tr = compilePreset({ kind: 'scale', to: 3 }, ctx)
    expect(JSON.stringify(tr)).not.toContain('"x"')
    expect(JSON.stringify(tr)).not.toContain('"y"')
  })
})

/**
 * `flip` — **static sugar, not a motion.**
 *
 * It holds a half turn for its whole span. Animating a flip is a different
 * verb and already exists: `{kind: 'rotate', axis: 'y', from: 0, to: 180}`.
 * Keeping the two non-overlapping is the point — a `flip` that swept would be
 * `rotate` with a worse name and no way to ask for the static mirror, which is
 * the common case (a layer facing the other way) and is not an animation at
 * all.
 */
describe('flip', () => {
  it('holds exactly Math.PI on rotateY for the whole span, by default', () => {
    // Both endpoints, because "constant" is the claim. A track that merely
    // *ended* at π would be a rotate with the wrong easing.
    const tr = compilePreset({ kind: 'flip' }, ctx)
    expect(evalTrack(tr, 0, 1).rotateY).toBe(Math.PI)
    expect(evalTrack(tr, 0.5, 1).rotateY).toBe(Math.PI)
    expect(evalTrack(tr, 1, 1).rotateY).toBe(Math.PI)
  })

  it('flips about x when asked, and writes nothing on the other axes', () => {
    const tr = compilePreset({ kind: 'flip', axis: 'x' }, ctx)
    expect(evalTrack(tr, 0, 1).rotateX).toBe(Math.PI)
    expect(evalTrack(tr, 1, 1).rotateX).toBe(Math.PI)
    expect(JSON.stringify(tr)).not.toContain('rotateY')
  })

  it('has no z axis, because an in-plane half turn is rotate\'s job', () => {
    // Two values where `rotate`'s enum has three. A "flip about z" is a 180°
    // in-plane spin — a real transform, but a rotation rather than a mirror,
    // and `rotate` already expresses it. Offering it here would give one
    // effect two spellings with different defaults.
    expect(() => compilePreset({ kind: 'flip', axis: 'z' }, ctx)).toThrow(/must be one of/)
    expect(() => compilePreset({ kind: 'flip', axis: 'z' }, ctx)).toThrow(/x, y/)
  })

  it('composes with rotate on the same axis, because the channels sum', () => {
    // A mirror plus a quarter turn is three quarters of a turn: the two verbs
    // are additive on `rotateY`, which is what makes `flip` sugar rather than
    // a mode.
    const t = composeAnim(
      [{ kind: 'flip' }, { kind: 'rotate', axis: 'y', from: 90, to: 90 }],
      1, 1, ctx, compilePreset,
    )
    expect(t.rotateY).toBeCloseTo(Math.PI * 1.5, 12)
  })
})
