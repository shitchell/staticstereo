import { describe, expect, it } from 'vitest'
import { validateScene } from './scene.js'
import { CHANNELS, PRESETS } from '../src/core/index.js'
import type { Track } from '../src/core/types.js'

/**
 * A scene arriving from `location.hash` is **untrusted input** — it came from a
 * link someone else wrote, possibly by hand, possibly from an older version of
 * this page. Letting it reach `renderFrame` unchecked turns a typo into an
 * exception from four frames deep inside the rasteriser, which is the one
 * failure mode a shareable-link feature cannot afford.
 *
 * The validator's rule: be exactly as permissive as `core`, and no more. Where
 * core already errors (non-integer size, fps/duration of 0, sepNear >= sepFar)
 * the check is delegated to core so the two cannot drift. Where core would
 * instead throw late and obscurely (an unknown preset kind, a `draw` layer) the
 * check is made here and the message names the field path.
 */

const MIN = { size: [8, 8], layers: [] }

describe('validateScene', () => {
  it('accepts a minimal still scene', () => {
    expect(validateScene({ size: [320, 180], layers: [{ type: 'text', text: 'HI' }] })).toEqual({
      size: [320, 180],
      layers: [{ type: 'text', text: 'HI' }],
    })
  })

  it('accepts an empty layer list — that is a pure dot field, which is valid', () => {
    expect(validateScene(MIN).layers).toEqual([])
  })

  it('returns a copy, so mutating the result cannot write back into untrusted input', () => {
    const input = { size: [8, 8], layers: [{ type: 'text', text: 'HI' }] }
    const out = validateScene(input)
    out.layers[0] = { type: 'text', text: 'CHANGED' }
    out.size[0] = 999
    expect(input.layers[0]).toEqual({ type: 'text', text: 'HI' })
    expect(input.size[0]).toBe(8)
  })

  it('rejects a non-object', () => {
    expect(() => validateScene(null)).toThrowError(/scene/i)
    expect(() => validateScene([])).toThrowError(/scene/i)
    expect(() => validateScene('{}')).toThrowError(/scene/i)
  })

  it('names "size" when it is missing or not a pair of positive integers', () => {
    expect(() => validateScene({ layers: [] })).toThrowError(/size/)
    expect(() => validateScene({ size: [8], layers: [] })).toThrowError(/size/)
    expect(() => validateScene({ size: [8, 0], layers: [] })).toThrowError(/size/)
    expect(() => validateScene({ size: [8.5, 8], layers: [] })).toThrowError(/size/)
    expect(() => validateScene({ size: ['8', '8'], layers: [] })).toThrowError(/size/)
  })

  it('rejects fps: 0 and duration: 0 rather than reinterpreting them (design §4.1)', () => {
    expect(() => validateScene({ ...MIN, fps: 0 })).toThrowError(/fps/)
    expect(() => validateScene({ ...MIN, duration: 0 })).toThrowError(/duration/)
    expect(() => validateScene({ ...MIN, fps: -1 })).toThrowError(/fps/)
  })

  it('accepts fps alone and duration alone', () => {
    expect(validateScene({ ...MIN, fps: 25 }).fps).toBe(25)
    expect(validateScene({ ...MIN, duration: 3 }).duration).toBe(3)
  })

  it('rejects a non-boolean freezeNoise', () => {
    expect(() => validateScene({ ...MIN, freezeNoise: 'yes' })).toThrowError(/freezeNoise/)
  })

  it('rejects layers that are not an array', () => {
    expect(() => validateScene({ size: [8, 8], layers: {} })).toThrowError(/layers/)
  })

  it('surfaces type "draw" as unsupported-by-design, not as a missing field', () => {
    let message = ''
    try {
      validateScene({ size: [8, 8], layers: [{ type: 'draw', fn: './x.mjs' }] })
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toMatch(/layers\[0\]/)
    expect(message).toMatch(/draw/)
    expect(message).toMatch(/not supported/i)
    // It is an open design question (design §9.5), not an oversight: a module
    // path cannot be resolved inside a static bundle. Say so, so nobody files
    // it as a bug or "fixes" it with a dynamic import.
    expect(message).toMatch(/module path|static/i)
  })

  it('lists the valid layer types for an unknown one', () => {
    let message = ''
    try {
      validateScene({ size: [8, 8], layers: [{ type: 'sprite' }] })
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toMatch(/sprite/)
    for (const t of ['text', 'image', 'gif', 'shape']) expect(message).toContain(t)
  })

  it('requires the discriminating field of each layer type', () => {
    expect(() => validateScene({ size: [8, 8], layers: [{ type: 'text' }] }))
      .toThrowError(/layers\[0\]\.text/)
    expect(() => validateScene({ size: [8, 8], layers: [{ type: 'image' }] }))
      .toThrowError(/layers\[0\]\.src/)
    expect(() => validateScene({ size: [8, 8], layers: [{ type: 'gif', src: '' }] }))
      .toThrowError(/layers\[0\]\.src/)
    expect(() => validateScene({ size: [8, 8], layers: [{ type: 'shape', shape: 'circle' }] }))
      .toThrowError(/layers\[0\]\.r/)
    expect(() => validateScene({ size: [8, 8], layers: [{ type: 'shape', shape: 'rect', w: 4 }] }))
      .toThrowError(/layers\[0\]\.h/)
  })

  it('accepts both mask sources and rejects a malformed one', () => {
    expect(validateScene({ size: [8, 8], layers: [{ type: 'image', src: 'a.png', mask: 'alpha' }] })
      .layers[0]).toMatchObject({ mask: 'alpha' })
    expect(validateScene({ size: [8, 8], layers: [{ type: 'image', src: 'a.png', mask: { luma: 0.5 } }] })
      .layers[0]).toMatchObject({ mask: { luma: 0.5 } })
    expect(() => validateScene({ size: [8, 8], layers: [{ type: 'image', src: 'a.png', mask: { luma: 'x' } }] }))
      .toThrowError(/layers\[0\]\.mask/)
  })

  it('names an unknown animation preset and lists the registry, because core throws mid-render', () => {
    let message = ''
    try {
      validateScene({ size: [8, 8], layers: [{ type: 'text', text: 'X', anim: { kind: 'wobble' } }] })
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toMatch(/wobble/)
    for (const kind of Object.keys(PRESETS)) expect(message).toMatch(kind)
    expect(message).toMatch(/layers\[0\]\.anim/)
  })

  it('accepts a list of animators, a raw track, and a preset', () => {
    const scene = validateScene({
      size: [8, 8],
      layers: [
        { type: 'text', text: 'A', anim: [{ kind: 'move' }, { kind: 'push' }] },
        { type: 'text', text: 'B', anim: { keys: [{ t: 0, y: 0 }, { t: 1, y: 10 }], ease: 'linear' } },
        { type: 'text', text: 'C', anim: { kind: 'push' } },
      ],
    })
    expect(scene.layers).toHaveLength(3)
  })

  it('accepts a cubic-bezier ease on a track and on a preset', () => {
    // The site half of the acceptance: the same scene must also pass the
    // CLI's `validateScene`. This validator **rebuilds** the track field by
    // field, so a rejected `ease` here is not merely an error — before the
    // check was widened it was an error; had it instead been dropped, the
    // shared link would have rendered with `linear` and said nothing.
    const scene = validateScene({
      size: [8, 8],
      layers: [
        {
          type: 'text', text: 'A',
          anim: { keys: [{ t: 0 }, { t: 1, x: 5 }], ease: 'cubic-bezier(.17,.67,.83,.67)' },
        },
        { type: 'text', text: 'B', anim: { kind: 'scale', ease: 'cubic-bezier(0, 0, 1, 1)' } },
      ],
    })
    expect((scene.layers[0]!.anim as Track).ease).toBe('cubic-bezier(.17,.67,.83,.67)')
  })

  it('still rejects a malformed or out-of-range cubic-bezier, naming the form', () => {
    for (const ease of [
      'cubic-bezier(0,0,1)', 'cubic-bezier(a,b,c,d)', 'cubic-bezier(2,0,1,1)', 'snap',
    ]) {
      let message = ''
      try {
        validateScene({
          size: [8, 8],
          layers: [{ type: 'text', text: 'A', anim: { keys: [{ t: 0 }], ease } }],
        })
      } catch (err) {
        message = (err as Error).message
      }
      expect(message, ease).toMatch(/ease/)
      // The named list stopped describing what is accepted the moment the
      // type widened, so the message has to name the other form as well.
      expect(message, ease).toMatch(/cubic-bezier/)
    }
  })

  it('rejects a raw track with no usable keys', () => {
    expect(() => validateScene({
      size: [8, 8],
      layers: [{ type: 'text', text: 'A', anim: { keys: [] } }],
    })).toThrowError(/keys/)
    expect(() => validateScene({
      size: [8, 8],
      layers: [{ type: 'text', text: 'A', anim: { keys: [{ y: 3 }] } }],
    })).toThrowError(/\.t\b/)
  })

  // Unlike the CLI validator, this one rebuilds every object field by field
  // and keeps only what it explicitly copies, so an unlisted channel is not
  // rejected — it is silently dropped, and the layer renders motionless on that
  // axis with no error anywhere. Widening a list would not have been enough:
  // the copy itself has to be the loop over `CHANNELS`.
  it('keeps every animatable channel in a keyframe rather than dropping it', () => {
    const key: Record<string, number> = { t: 0 }
    CHANNELS.forEach((ch, i) => { key[ch] = i + 1 })
    const out = validateScene({
      size: [8, 8],
      layers: [{ type: 'text', text: 'A', anim: { keys: [key] } }],
    })
    const track = out.layers[0]?.anim as Track | undefined
    const got = (track?.keys[0] ?? {}) as Record<string, number>
    expect(new Set(Object.keys(got))).toEqual(new Set(['t', ...CHANNELS]))
    for (const ch of CHANNELS) expect(got[ch]).toBe(key[ch])
  })

  // The other half of the same asymmetry. The test above makes the *known*
  // channels survive the rebuild; a misspelled one was still discarded in
  // silence. `rotatX: 5` made the CLI name the key and refuse to load, while
  // the site accepted the scene, dropped the value, and rendered something
  // subtly wrong with no signal anywhere — the one error class a validator
  // catches that nothing downstream ever will.
  it('rejects an unknown keyframe channel instead of dropping it', () => {
    let message = ''
    try {
      validateScene({
        size: [8, 8],
        layers: [{ type: 'text', text: 'A', anim: { keys: [{ t: 0, rotatX: 5 }] } }],
      })
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toMatch(/rotatX/)
    expect(message).toMatch(/layers\[0\]\.anim\.keys\[0\]/)
    // Naming the bad key without listing the good ones leaves the author
    // guessing, which is where the CLI's wording earns its keep.
    for (const valid of ['t', ...CHANNELS]) expect(message).toContain(valid)
  })

  it('rejects an animator that is neither a track nor a preset', () => {
    expect(() => validateScene({
      size: [8, 8],
      layers: [{ type: 'text', text: 'A', anim: { speed: 60 } }],
    })).toThrowError(/layers\[0\]\.anim/)
  })

  it('delegates the stereo invariants to core so the two cannot drift', () => {
    expect(() => validateScene({ ...MIN, stereo: { sepNear: 120, sepFar: 110 } }))
      .toThrowError(/depth budget/)
    expect(() => validateScene({ ...MIN, stereo: { noiseScale: 1.5 } }))
      .toThrowError(/noiseScale/)
  })

  it('rejects an unknown stereo key, because a typo would silently do nothing', () => {
    expect(() => validateScene({ ...MIN, stereo: { sepfar: 120 } })).toThrowError(/sepfar/)
  })

  // A URL-shared scene goes through this validator, so an encoder the core
  // supports has to survive the trip — and a misspelled one must not.
  it('accepts stereo.algorithm and delegates its spelling to core', () => {
    expect(validateScene({ ...MIN, stereo: { algorithm: 'linked' } }).stereo)
      .toEqual({ algorithm: 'linked' })
    expect(() => validateScene({ ...MIN, stereo: { algorithm: 'linkd' } }))
      .toThrowError(/algorithm/)
    expect(() => validateScene({ ...MIN, stereo: { algorithm: 2 } }))
      .toThrowError(/algorithm/)
  })

  it('rejects a non-numeric at pair and a non-numeric depth', () => {
    expect(() => validateScene({ size: [8, 8], layers: [{ type: 'text', text: 'A', at: [0] }] }))
      .toThrowError(/layers\[0\]\.at/)
    expect(() => validateScene({ size: [8, 8], layers: [{ type: 'text', text: 'A', depth: 'near' }] }))
      .toThrowError(/layers\[0\]\.depth/)
  })

  // Not a validation nicety: the hash *is* the scene here, so a field this
  // rebuild forgets to copy is destroyed on every round trip through the URL,
  // not merely ignored. A dropped `id` takes every reference to that layer
  // with it, and there is no other copy to restore it from.
  it('carries a layer id and name through the rebuild, and mints neither', () => {
    const out = validateScene({
      size: [8, 8],
      layers: [{ type: 'text', text: 'A', id: 'k3Qp', name: 'greeting' }],
    })
    expect(out.layers[0]).toMatchObject({ id: 'k3Qp', name: 'greeting' })

    const bare = validateScene({ size: [8, 8], layers: [{ type: 'text', text: 'A' }] })
    expect(bare.layers[0]).not.toHaveProperty('id')
    expect(bare.layers[0]).not.toHaveProperty('name')

    expect(() => validateScene({
      size: [8, 8], layers: [{ type: 'text', text: 'A', id: 5 }],
    })).toThrowError(/layers\[0\]\.id/)
    expect(() => validateScene({
      size: [8, 8], layers: [{ type: 'text', text: 'A', name: [] }],
    })).toThrowError(/layers\[0\]\.name/)
  })

  it('rejects an unknown gif loop mode and an unknown image mode', () => {
    expect(() => validateScene({ size: [8, 8], layers: [{ type: 'gif', src: 'a.gif', loop: 'reverse' }] }))
      .toThrowError(/layers\[0\]\.loop/)
    expect(() => validateScene({ size: [8, 8], layers: [{ type: 'image', src: 'a.png', mode: 'relief' }] }))
      .toThrowError(/layers\[0\]\.mode/)
  })

  /**
   * The two registry lookups this validator performs on a hash-supplied string
   * — the preset `kind` and the track `ease`.
   *
   * This is the file's own premise under test. The docblock at the top says the
   * rule is "be exactly as permissive as `core`, and no more"; a lookup that
   * consults `Object.prototype` is *more* permissive than core by twelve keys
   * nobody wrote down, and the scene it admits is not one core can render. It
   * is also the only input on this page that an attacker chooses: a link is the
   * whole scene, so "a string from a URL nobody in this repo wrote" is the
   * normal case, not the adversarial one. `site/fit.ts:111-116` records the
   * same reasoning for `?fit=`.
   *
   * `constructor` and `__proto__` are enumerated rather than sampled because
   * they resolve to different *types* — a function and an object — and a guard
   * can be wrong about one while handling the other.
   */
  describe('inherited Object.prototype keys are not registry members', () => {
    const INHERITED = ['constructor', '__proto__', 'toString', 'valueOf'] as const

    const message = (scene: unknown): string => {
      try {
        validateScene(scene)
      } catch (err) {
        return (err as Error).message
      }
      return ''
    }

    it('rejects an inherited key as a preset kind, which core cannot render', () => {
      // Measured at `3a05f63`: `kind in PRESETS` was `true` for all four, so
      // this validator *accepted* the scene and handed it to the rasteriser,
      // where `compilePreset`'s own `if (!fn)` guard was bypassed the same way
      // and `{kind: 'constructor'}` came back typed as a `Track`. Nothing threw
      // and nothing warned — the link rendered a still.
      //
      // Asserting the message, not the throw: core threw a `TypeError` from
      // inside `evalTrack` for two of these four even before the fix, so a
      // `.toThrow()` here would not have been red, and would not distinguish
      // this validator doing its job from the rasteriser crashing later.
      for (const kind of INHERITED) {
        const scene = { size: [8, 8], layers: [{ type: 'text', text: 'X', anim: { kind } }] }
        const msg = message(scene)
        expect(msg, kind).toMatch(/unknown animation preset/)
        expect(msg, kind).toContain(kind)
        expect(msg, kind).toMatch(/layers\[0\]\.anim/)
        for (const valid of Object.keys(PRESETS)) expect(msg, kind).toContain(valid)
      }
    })

    it('rejects an inherited key as a track ease', () => {
      // **Already closed, and not by this task.** `ease in EASINGS` was this
      // file's other prototype-chain site; widening `Easing` to admit
      // `cubic-bezier(...)` replaced it with `isEasing`, which resolves names
      // through `namedEasing`'s `Object.prototype.hasOwnProperty.call`. So this
      // test was green the first time it ran and is a regression pin, not
      // evidence — its RED was established by mutation, by restoring `!(ease in
      // EASINGS)` here, which turns all eight assertions red.
      //
      // Worth pinning anyway because this was the *silent* half: `EASINGS`
      // inherits `toString`, `channelAt` multiplied a keyframe delta by the
      // string it returns, and the layer sat at `x: NaN` for the whole scene
      // with no error anywhere. `track.test.ts` holds the core half of that.
      //
      // **Tracks only, deliberately.** `ease` on a *preset* is not checked
      // here: `validateAnimOne` copies a preset's parameter bag through
      // untouched by design (see its comment), and core's `overrides()` is what
      // rejects it — measured: `compilePreset({kind: 'move', ease:
      // 'constructor'})` throws `preset "move": unknown easing "constructor" —
      // valid: …`. Asserting a rejection here would be asserting against this
      // validator's stated division of labour, not for it.
      for (const ease of INHERITED) {
        const anim = { keys: [{ t: 0 }, { t: 1, x: 5 }], ease }
        const msg = message({ size: [8, 8], layers: [{ type: 'text', text: 'X', anim }] })
        expect(msg, ease).toMatch(/ease/)
        expect(msg, ease).toContain(ease)
      }
    })
  })
})
