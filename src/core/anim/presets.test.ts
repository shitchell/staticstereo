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
 * `move`'s symbolic off-stage endpoints — `offLeft`, `offRight`, `offTop`,
 * `offBottom` (design §4.2).
 *
 * This is the arithmetic the deleted `marquee` and `slide-in` did, back on the
 * production path. §4.2b's table says what `marquee` becomes: "`move` with
 * off-stage endpoints".
 *
 * **Nothing here asserts a literal.** Every expectation is spelled from the
 * fixture's own fields, because the claim is a *relationship* between the
 * stage, the plate's margins and the measured content — not today's numbers.
 * `CTX`'s margins are the `shift` pair, `{110, 55}`, chosen in
 * `ctx.fixture.ts` precisely because they are unequal: a resolution that added
 * the wrong margin, or the same one twice, would pass against a symmetric
 * fixture. Note while reading that `110 = 2 × 55`, so an assertion that would
 * also hold with the margins doubled or halved is not pinning what it claims;
 * every one below is checked against both, and against substituting either
 * cross-axis measurement.
 *
 * **Two of them are not checked against the margins being swapped, because no
 * fixture can check them** — the swap is invisible to those two algebraically
 * rather than by an accident of `{110, 55}`. See `spans the whole plate plus
 * the content`, which records the measurement and why editing the fixture
 * would not help.
 */
describe('move off-stage endpoints', () => {
  /**
   * The two channel values a `move` compiles to, read off the keys rather than
   * through `evalTrack`, because the keys *are* the channel values and the
   * guarantees here are exact. `evalTrack` at `t = 1` goes through the easing
   * and a division, and a tolerance there would accept a resolution that was
   * wrong in the last few bits.
   */
  const poses = (p: Record<string, unknown>, c: typeof ctx = ctx) => {
    const tr = compilePreset({ kind: 'move', ...p }, c)
    const start = tr.keys[0]!
    const end = tr.keys[tr.keys.length - 1]!
    return { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y }, track: tr }
  }

  it('resolves each token from the stage and the plate, in the slot its axis owns', () => {
    // The four resolutions, against the ctx's own fields. `offLeft`/`offRight`
    // are the deleted `OFF_LEFT`/`OFF_RIGHT` constants; `offTop`/`offBottom`
    // are what `slide-in` used for its two vertical directions.
    const horizontal = poses({ from: ['offRight', 0], to: ['offLeft', 0] })
    expect(horizontal.start.x).toBe(ctx.sceneW + ctx.marginRight)
    expect(horizontal.end.x).toBe(-(ctx.contentW + ctx.marginLeft))
    const vertical = poses({ from: [0, 'offBottom'], to: [0, 'offTop'] })
    expect(vertical.start.y).toBe(ctx.sceneH)
    expect(vertical.end.y).toBe(-ctx.contentH)
    // Cross-axis confusion is caught by the fixture, not by inspection:
    // `sceneW ≠ sceneH` and `contentW ≠ contentH`, so a resolution reading the
    // other axis's measurement is red above rather than coincidentally equal.
    expect(ctx.sceneW).not.toBe(ctx.sceneH)
    expect(ctx.contentW).not.toBe(ctx.contentH)
  })

  it('carries the plate margin on the horizontal pair and none on the vertical', () => {
    // The asymmetry is the behaviour, not an oversight: `Margins` is
    // `{left, right}` only and `plateLayoutOf` applies no vertical padding, so
    // there is no top/bottom margin to add (design §10.2). `slide-in`'s own
    // deleted test spelled out both halves — "a blanket 'add the margin' would
    // push a `from: 'top'` entry a plate-margin's worth above the frame for no
    // reason".
    const flat = { ...ctx, marginLeft: 0, marginRight: 0 }
    const unpadded = poses({ from: ['offRight', 0], to: ['offLeft', 0] }, flat)
    expect(unpadded.start.x).toBe(flat.sceneW)
    expect(unpadded.end.x).toBe(-flat.contentW)

    // With margins, each horizontal endpoint gains *its own side's* margin and
    // only that one. Stated as a difference from the unpadded pose so that the
    // margin term is isolated: dropping it, or substituting the other side's,
    // moves this and nothing else.
    const padded = poses({ from: ['offRight', 0], to: ['offLeft', 0] })
    expect(padded.start.x! - unpadded.start.x!).toBe(ctx.marginRight)
    expect(unpadded.end.x! - padded.end.x!).toBe(ctx.marginLeft)

    // And neither margin reaches the vertical pair at all — asserted as
    // *invariance under a margin change*, which is stronger than restating the
    // formula and is what turns a blanket "add the margin" red.
    const verticalArgs = { from: [0, 'offBottom'], to: [0, 'offTop'] }
    expect(poses(verticalArgs).start).toEqual(poses(verticalArgs, flat).start)
    expect(poses(verticalArgs).end).toEqual(poses(verticalArgs, flat).end)
  })

  it('spans the whole plate plus the content, which is the point of the margin terms', () => {
    // The assertion deleted with `marquee` — `OFF_RIGHT - OFF_LEFT` — restored
    // structurally rather than as its old `2165`. It is the one statement that
    // ties both margins, the stage and the measurement together in a single
    // number.
    //
    // **It cannot see the two margins being swapped, and no fixture can make
    // it.** Both sides reduce to `sceneW + contentW + marginLeft + marginRight`
    // — each side sums the two margins, so the equality is an identity in them
    // and holds for any pair, not just for one where `110 = 2 × 55`. Measured
    // with `offLeft`/`offRight` reading each other's margin: this test and
    // `resolves before speed` below stay green, while 4 other assertions in
    // this file and 3 in `raster.test.ts` redden — and setting `CTX` to
    // coprime, non-2:1 margins (97/31) under the same swap leaves both green.
    // That last run is the one worth recording: a reader told the fixture is
    // at fault will go and edit it for nothing.
    //
    // Kept rather than deleted, because it is not vacuous and nothing else
    // states this whole relation in one number: doubling the margin terms,
    // halving them, and substituting `contentH` for `contentW` or `sceneH` for
    // `sceneW` each redden it.
    const { start, end } = poses({ from: ['offRight', 0], to: ['offLeft', 0] })
    const plateWidth = ctx.marginLeft + ctx.sceneW + ctx.marginRight
    expect(start.x! - end.x!).toBe(plateWidth + ctx.contentW)
  })

  it('takes a token in one slot and a number in the other', () => {
    // The per-slot spelling's whole premise: a token stands where a number
    // stands. A resolver that replaced the pair wholesale would lose the 7.
    const { start } = poses({ from: ['offRight', 7] })
    expect(start.x).toBe(ctx.sceneW + ctx.marginRight)
    expect(start.y).toBe(7)
    const other = poses({ from: [-3, 'offTop'] })
    expect(other.start.x).toBe(-3)
    expect(other.start.y).toBe(-ctx.contentH)
  })

  it('resolves before speed, so a token scroll derives its own duration', () => {
    // `marquee`, reconstructed from the five verbs — the thing §4.2b claims is
    // possible. It also pins the *order*: `speed` divides the distance between
    // the resolved endpoints, so a resolution that happened after the duration
    // was derived would leave `duration` computed over a zero-length move and
    // throw instead.
    const speed = 100
    const tr = poses(
      { from: ['offRight', 0], to: ['offLeft', 0], speed, repeat: 'loop' },
    ).track
    // `travel` is the same commutative sum of the two margins, so this is the
    // *second* of the two assertions the margin swap cannot see — measured
    // green under the swap, and still green under the swap with coprime 97/31
    // margins. `spans the whole plate plus the content` above carries the
    // algebra and the full mutation table; it is recorded in both places
    // because reading either test alone invites the same wrong conclusion.
    // Doubling and halving the margin terms, and both cross-axis
    // substitutions, do redden this.
    const travel = (ctx.sceneW + ctx.marginRight) + (ctx.contentW + ctx.marginLeft)
    expect(tr.duration).toBeCloseTo(travel / speed, 10)
    expect(tr.repeat).toBe('loop')
  })

  it('rejects a token in the other axis\'s slot, naming the axis and the slot', () => {
    // An authoring error on a URL-is-the-scene design must be loud: design
    // §4.1 prefers a rejection to a silent drop precisely because a link
    // someone else wrote cannot be debugged from the render. `from: [offTop,
    // 0]` is a plausible typo and would otherwise resolve to a y-axis distance
    // written into x.
    const wrong = [
      { slot: 0, token: 'offTop', axis: 'x' },
      { slot: 0, token: 'offBottom', axis: 'x' },
      { slot: 1, token: 'offLeft', axis: 'y' },
      { slot: 1, token: 'offRight', axis: 'y' },
    ] as const
    for (const key of ['from', 'to']) {
      for (const { slot, token, axis } of wrong) {
        const value = slot === 0 ? [token, 0] : [0, token]
        const p = { kind: 'move', [key]: value }
        const where = JSON.stringify(p)
        // the axis the slot is …
        expect(() => compilePreset(p, ctx), where).toThrow(new RegExp(`${axis} axis`))
        // … the slot it was written in, and the parameter it was written on …
        expect(() => compilePreset(p, ctx), where).toThrow(new RegExp(`"${key}"\\[${slot}\\]`))
        // … and the token itself, so the message is actionable without the docs
        expect(() => compilePreset(p, ctx), where).toThrow(new RegExp(token))
      }
    }
  })

  it('still rejects garbage, so widening the pair reader swallowed nothing', () => {
    // The existing malformed-params assertion restated here, because widening
    // the reader to accept strings is exactly the change that could have made a
    // typo compile to a default. A *whole-vector* token is rejected too: the
    // spelling is per-slot, and `to: "offLeft"` silently meaning `[offLeft, 0]`
    // would be a second spelling of the same parameter.
    expect(() => compilePreset({ kind: 'move', to: 'nope' }, ctx))
      .toThrow(/\[x, y\] number pair/)
    expect(() => compilePreset({ kind: 'move', to: 'offLeft' }, ctx))
      .toThrow(/\[x, y\] number pair/)
    expect(() => compilePreset({ kind: 'move', to: ['offLeft'] }, ctx))
      .toThrow(/\[x, y\] number pair/)
    expect(() => compilePreset({ kind: 'move', to: [Number.NaN, 0] }, ctx))
      .toThrow(/\[x, y\] number pair/)
    expect(() => compilePreset({ kind: 'move', to: [0, {}] }, ctx))
      .toThrow(/\[x, y\] number pair/)
    // An unknown name in a slot is rejected by the slot reader instead, which
    // names what *is* accepted there — the list is derived from the token
    // table, so it cannot go stale.
    expect(() => compilePreset({ kind: 'move', to: ['nope', 0] }, ctx)).toThrow(/offLeft/)
    expect(() => compilePreset({ kind: 'move', to: ['nope', 0] }, ctx)).toThrow(/nope/)
    expect(() => compilePreset({ kind: 'move', to: [0, 'nope'] }, ctx)).toThrow(/offTop/)
  })

  it('is a move parameter only — no sixth verb, and no token on a scalar param', () => {
    // Two independent assertions already pin the five-verb registry
    // (`presets.test.ts`'s first test and `presets.golden.test.ts`), and this
    // task adds parameter *values*, never a kind. The second half is the one
    // those do not cover: the scalar readers stay strict, so a token leaking
    // into `push`/`scale`/`rotate` is an error rather than a `NaN` depth.
    expect(Object.keys(PRESETS).sort()).toEqual(['flip', 'move', 'push', 'rotate', 'scale'])
    for (const kind of ['push', 'scale', 'rotate']) {
      expect(() => compilePreset({ kind, to: 'offLeft' }, ctx), kind)
        .toThrow(/must be a finite number/)
    }
  })

  it('survives both scene validators, so a token round-trips through a link', async () => {
    // Both validators are documented as passing preset params through — the CLI
    // returns early ("Preset parameters are open-ended by design") and the site
    // rebuilds the bag with `{ ...v }`. That is a claim about two files this
    // task may not edit, and the site validator's standing behaviour on
    // anything it does not name is to drop it *silently* (design §4.1), so it
    // is asserted rather than read: a dropped token would leave the feature
    // unreachable from the editor, which is its only consumer.
    //
    // Imported dynamically, and only here: `src/core` must not depend on the
    // CLI or the site, and a test that reaches across the layers to check a
    // boundary should not put that specifier at the top of a core module.
    const scene = {
      size: [800, 450],
      layers: [{
        type: 'text',
        text: 'ABC',
        anim: { kind: 'move', from: ['offRight', 0], to: ['offLeft', 0], speed: 100 },
      }],
    }
    const cli = await import('../../cli/scene.js')
    const site = await import('../../../site/scene.js')
    const validated = [
      ['cli', cli.validateScene(structuredClone(scene), 'round-trip')],
      ['site', site.validateScene(structuredClone(scene))],
    ] as const
    for (const [which, out] of validated) {
      const anim = out.layers[0]!.anim as Record<string, unknown>
      expect(anim['from'], which).toEqual(['offRight', 0])
      expect(anim['to'], which).toEqual(['offLeft', 0])
      // and it still compiles to the resolved endpoints after the trip
      const tr = compilePreset(anim as { kind: string }, ctx)
      expect(tr.keys[0]!.x, which).toBe(ctx.sceneW + ctx.marginRight)
      expect(tr.keys[1]!.x, which).toBe(-(ctx.contentW + ctx.marginLeft))
    }
  })
})

/**
 * Both registries in this file are indexed with a string that came from a scene
 * file, which on the site means **from a URL someone else wrote**. Neither
 * lookup may consult `Object.prototype`.
 *
 * This is the third instance of one idiom being wrong in this repo, in three
 * files written by three different authors — `site/fit.ts`'s `parseFit` (`key in
 * FIT_MODES` returned `'constructor'` as a valid fit mode), `site/scene.ts`'s
 * `kind in PRESETS`, and these two. So the assertions below pin the *message*
 * rather than the fact of a throw: every one of these keys already threw
 * something before the guards went in, and a test asserting `.toThrow()` alone
 * would have passed against a registry that was still inheriting.
 *
 * `constructor` and `__proto__` are named individually, not probed as "a weird
 * key", because they fail in different shapes — a function and an object — and
 * a guard that catches one need not catch the other. `toString`/`valueOf` ride
 * along as the two the repo has already been bitten by (`track.test.ts`).
 */
const INHERITED = ['constructor', '__proto__', 'toString', 'valueOf'] as const

describe('registry lookups do not walk the prototype chain', () => {
  it('rejects an inherited key as a preset kind, loudly and with the registry', () => {
    // The pre-fix shapes, measured against `dist/core` at `3a05f63`:
    //   `{kind: 'constructor'}` returned the *Preset* typed as a `Track`
    //   `{kind: 'toString'}`    returned the string "[object Undefined]" as a `Track`
    //   `{kind: '__proto__'}`   threw `TypeError: fn is not a function`
    //   `{kind: 'valueOf'}`     threw `TypeError: Cannot convert undefined …`
    // Two silent, two loud-but-illegible, so neither "it throws" nor "it does
    // not return garbage" is sufficient on its own and both are asserted.
    for (const kind of INHERITED) {
      let thrown: unknown
      let returned: unknown
      try {
        returned = compilePreset({ kind }, ctx)
      } catch (err) {
        thrown = err
      }
      expect(thrown, `${kind}: must not compile to anything`).toBeInstanceOf(Error)
      expect(returned, kind).toBeUndefined()
      // Not a `TypeError` from inside the registry: that is what indexing an
      // inherited property produced, and it names no field and no scene.
      expect((thrown as Error).constructor.name, kind).toBe('Error')
      const message = (thrown as Error).message
      expect(message, kind).toMatch(/unknown animation preset/)
      expect(message, kind).toContain(kind)
      for (const valid of Object.keys(PRESETS)) expect(message, kind).toContain(valid)
    }
  })

  it('rejects an inherited key in an endpoint slot with the token message, not the axis one', () => {
    // The pre-fix shape here is the subtler of the two: `OFF_STAGE[v]` found an
    // inherited property, so `if (!token)` did not fire and execution fell into
    // the *axis-mismatch* branch one line down, where `token.slot` is
    // `undefined`. The thrown message read "…is a undefined-axis endpoint —
    // write it as "from"[undefined]", which is loud, actionable-looking and
    // wrong: it tells the author to move a token that does not exist to a slot
    // that does not exist. Asserting the correct message is what separates the
    // fix from that, and `not.toMatch` pins the old text so it cannot come back
    // under a different guard.
    const valid = { 0: ['offLeft', 'offRight'], 1: ['offTop', 'offBottom'] } as const
    for (const key of ['from', 'to']) {
      for (const slot of [0, 1] as const) {
        for (const token of INHERITED) {
          const p = { kind: 'move', [key]: slot === 0 ? [token, 0] : [0, token] }
          const where = JSON.stringify(p)
          let message = ''
          try {
            compilePreset(p, ctx)
          } catch (err) {
            message = (err as Error).message
          }
          // the unknown-token message, which is the one an unknown name gets …
          expect(message, where).toMatch(/must be a number or one of/)
          expect(message, where).toContain(token)
          // … naming the slot written and the tokens that slot does accept …
          expect(message, where).toContain(`"${key}"[${slot}]`)
          for (const name of valid[slot]) expect(message, where).toContain(name)
          // … and never the axis-mismatch message, whose slot and axis are
          // `undefined` for a key that is not in the table at all.
          expect(message, where).not.toMatch(/axis endpoint/)
          expect(message, where).not.toContain('undefined')
        }
      }
    }
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
