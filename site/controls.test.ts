import { describe, expect, it } from 'vitest'
import {
  CUSTOM_TRACK,
  coerceInt,
  coerceNumber,
  currentFrame,
  frameIndexAt,
  frameTimesOf,
  initialState,
  lastFrameTime,
  presetNote,
  reduce,
  sceneError,
  timeOfFrame,
} from './controls.js'
import { PRESETS, compilePreset, stillTime } from '../src/core/index.js'
import type { PresetCtx } from '../src/core/index.js'
import type { Preset, Scene } from '../src/core/types.js'

const ANIM: Scene = { size: [64, 32], fps: 12, duration: 2, layers: [{ type: 'text', text: 'A' }] }
const STILL: Scene = { size: [64, 32], layers: [{ type: 'text', text: 'A' }] }

describe('coerceNumber / coerceInt', () => {
  it('reads a numeric input value', () => {
    expect(coerceNumber('110', 1)).toBe(110)
    expect(coerceNumber('2.5', 1)).toBe(2.5)
    expect(coerceNumber('-3', 1)).toBe(-3)
    expect(coerceNumber(7, 1)).toBe(7)
  })

  it('falls back rather than yielding NaN or Infinity', () => {
    // An <input type=number> hands back '' while the user is mid-edit and
    // 'abc' if they paste. Either becoming NaN propagates into `sepFar` and
    // the render throws from inside the encoder, naming nothing useful.
    expect(coerceNumber('', 5)).toBe(5)
    expect(coerceNumber('   ', 5)).toBe(5)
    expect(coerceNumber('abc', 5)).toBe(5)
    expect(coerceNumber('1e400', 5)).toBe(5)
    expect(coerceNumber(Number.NaN, 5)).toBe(5)
    expect(coerceNumber(null, 5)).toBe(5)
  })

  it('coerceInt refuses a fractional value instead of rounding it', () => {
    // noiseScale is a pixel replication factor; rounding 2.5 to 2 silently
    // halves every measured period relative to what the control says.
    expect(coerceInt('3', 2)).toBe(3)
    expect(coerceInt('2.5', 2)).toBe(2)
    expect(coerceInt('0', 2)).toBe(0)
  })
})

describe('the frame grid', () => {
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
    expect(frameIndexAt(ANIM, 1 / 12 + 0.001)).toBe(1)
    expect(frameIndexAt(ANIM, 2 / 12 - 0.001)).toBe(2)
    expect(frameIndexAt(ANIM, 99)).toBe(23)
    expect(frameIndexAt(ANIM, -5)).toBe(0)
  })

  it('resolves an exact tie to the lower index', () => {
    // The midpoint has to be *representable* to be a tie at all: 1.5/12 sits
    // 4.166666666666666e-2 from 1/12 and 4.1666666666666657e-2 from 2/12, so
    // at 12fps there is no tie to resolve and asserting one tests float noise.
    // A power-of-two frame rate gives exact eighths, where there genuinely is.
    const eighths: Scene = { ...ANIM, fps: 8 }
    expect(1.5 / 8 - 1 / 8).toBe(2 / 8 - 1.5 / 8)
    expect(frameIndexAt(eighths, 1.5 / 8)).toBe(1)
  })

  it('timeOfFrame clamps an out-of-range index', () => {
    expect(timeOfFrame(ANIM, -1)).toBe(0)
    expect(timeOfFrame(ANIM, 999)).toBeCloseTo(23 / 12, 10)
  })
})

describe('reduce', () => {
  it('keeps the scrub time on the frame grid', () => {
    const s = reduce(initialState(ANIM), { type: 'time', seconds: 0.51 })
    expect(frameTimesOf(ANIM)).toContain(s.time)
  })

  it('clamps the scrub time into the scene', () => {
    expect(reduce(initialState(ANIM), { type: 'time', seconds: -10 }).time).toBe(0)
    expect(reduce(initialState(ANIM), { type: 'time', seconds: 10 }).time)
      .toBeCloseTo(23 / 12, 10)
  })

  it('pins the scrubber of a still at the midpoint whatever it is asked for', () => {
    expect(reduce(initialState(STILL), { type: 'time', seconds: 0 }).time).toBe(stillTime(STILL))
    expect(reduce(initialState(STILL), { type: 'time', seconds: 9 }).time).toBe(stillTime(STILL))
  })

  it('preserves the moment, not the frame index, when fps changes', () => {
    // The index is meaningless across a rate change: frame 12 of 24 is halfway
    // through a 2s scene at 12fps and a quarter of the way through at 25fps.
    const at = reduce(initialState(ANIM), { type: 'time', seconds: 1 })
    expect(at.time).toBeCloseTo(1, 10)
    const faster = reduce(at, { type: 'fps', value: 25 })
    expect(faster.time).toBeCloseTo(1, 2)
    expect(frameTimesOf(faster.scene)).toContain(faster.time)
  })

  it('re-clamps the scrub time when the duration shortens under it', () => {
    const at = reduce(initialState(ANIM), { type: 'time', seconds: 1.9 })
    const shorter = reduce(at, { type: 'duration', value: 0.5 })
    expect(shorter.time).toBeLessThanOrEqual(lastFrameTime(shorter.scene))
    expect(frameTimesOf(shorter.scene)).toContain(shorter.time)
  })

  it('patches only the named stereo fields', () => {
    const s = reduce(initialState(ANIM), { type: 'stereo', patch: { seed: 9 } })
    expect(s.scene.stereo).toMatchObject({ seed: 9, sepFar: 110, sepNear: 92, noiseScale: 2 })
  })

  it('never mutates the state it was given', () => {
    const before = initialState(ANIM)
    const snapshot = JSON.stringify(before)
    reduce(before, { type: 'stereo', patch: { seed: 9 } })
    reduce(before, { type: 'time', seconds: 1 })
    reduce(before, { type: 'layerAnim', index: 0, anim: { kind: 'bob' } })
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('drops fps and duration when set to undefined, making the scene a still again', () => {
    let s = initialState(ANIM)
    s = reduce(s, { type: 'fps', value: undefined })
    s = reduce(s, { type: 'duration', value: undefined })
    expect('fps' in s.scene).toBe(false)
    expect('duration' in s.scene).toBe(false)
    expect(frameTimesOf(s.scene)).toHaveLength(1)
  })

  it('sets and clears a layer animator', () => {
    let s = reduce(initialState(ANIM), { type: 'layerAnim', index: 0, anim: { kind: 'bob', amount: 20 } })
    expect(s.scene.layers[0]?.anim).toEqual({ kind: 'bob', amount: 20 })
    s = reduce(s, { type: 'layerAnim', index: 0, anim: undefined })
    expect(s.scene.layers[0] && 'anim' in s.scene.layers[0]).toBe(false)
  })

  it('refuses a layer index that does not exist rather than growing the array', () => {
    expect(() => reduce(initialState(ANIM), { type: 'layerAnim', index: 4, anim: undefined }))
      .toThrowError(/layer 4/)
  })

  describe('layerText', () => {
    /**
     * Built fresh per call, never shared.
     *
     * A module-level const here was a real hazard rather than a style point:
     * `initialState` spreads the scene shallowly, so every test would hold the
     * *same* layer objects. A reducer that patched a layer in place would then
     * leave the mutation visible to later tests — and in particular would make
     * the "never mutates" test below pass, because by the time it ran the
     * field it sets would already have the value it sets. Mutation testing
     * caught exactly that.
     */
    const mixed = (): Scene => ({
      size: [64, 32],
      layers: [
        { type: 'text', text: 'A' },
        { type: 'shape', shape: 'rect', w: 4, h: 4 },
      ],
    })

    it('sets a size and a weight on the addressed text layer', () => {
      let s = reduce(initialState(mixed()), { type: 'layerText', index: 0, patch: { size: 120 } })
      expect(s.scene.layers[0]).toMatchObject({ type: 'text', text: 'A', size: 120 })
      s = reduce(s, { type: 'layerText', index: 0, patch: { weight: 'bold' } })
      expect(s.scene.layers[0]).toMatchObject({ size: 120, weight: 'bold' })
    })

    it('patches only the named fields, leaving the rest of the layer alone', () => {
      const s = reduce(
        initialState({ ...mixed(), layers: [{ type: 'text', text: 'A', size: 90, weight: 'bold', anim: { kind: 'bob' } }] }),
        { type: 'layerText', index: 0, patch: { size: 48 } },
      )
      expect(s.scene.layers[0]).toEqual({
        type: 'text', text: 'A', size: 48, weight: 'bold', anim: { kind: 'bob' },
      })
    })

    it('removes a field set to undefined rather than storing the key', () => {
      // Same rule as fps/duration and layerAnim: `{weight: undefined}`
      // serialises to a hash with no key, so keeping it in memory would make
      // the state and the share link disagree.
      //
      // BOTH fields are checked, and separately. The obvious implementation
      // slip is `patch.size !== undefined` in place of `'size' in patch`,
      // which silently turns a removal into a no-op — and a test that only
      // cleared the weight did not notice it.
      const sized = reduce(initialState(mixed()), { type: 'layerText', index: 0, patch: { size: 120, weight: '900' } })

      const noWeight = reduce(sized, { type: 'layerText', index: 0, patch: { weight: undefined } })
      expect('weight' in noWeight.scene.layers[0]!).toBe(false)
      expect(noWeight.scene.layers[0]).toMatchObject({ size: 120 })

      const noSize = reduce(sized, { type: 'layerText', index: 0, patch: { size: undefined } })
      expect('size' in noSize.scene.layers[0]!).toBe(false)
      expect(noSize.scene.layers[0]).toMatchObject({ weight: '900' })

      const neither = reduce(noWeight, { type: 'layerText', index: 0, patch: { size: undefined } })
      expect(neither.scene.layers[0]).toEqual({ type: 'text', text: 'A' })
    })

    it('distinguishes an absent key from an explicit undefined', () => {
      const sized = reduce(initialState(mixed()), { type: 'layerText', index: 0, patch: { size: 120, weight: 'bold' } })
      // `{size: 48}` must not clear the weight it never mentioned.
      const resized = reduce(sized, { type: 'layerText', index: 0, patch: { size: 48 } })
      expect(resized.scene.layers[0]).toMatchObject({ size: 48, weight: 'bold' })
    })

    it('refuses a layer index that does not exist', () => {
      expect(() => reduce(initialState(mixed()), { type: 'layerText', index: 7, patch: { size: 10 } }))
        .toThrowError(/layer 7/)
    })

    it('refuses a layer that is not text, naming what it actually is', () => {
      // The controls are disabled for a non-text layer, but a hash-loaded
      // scene can change the layer under a stale selection. A silent no-op
      // would look exactly like a broken field.
      expect(() => reduce(initialState(mixed()), { type: 'layerText', index: 1, patch: { size: 10 } }))
        .toThrowError(/layer 1.*shape/)
    })

    it('rejects a size that is not a positive finite number, since the validator would', () => {
      // `sceneError` delegates to `validateScene`, which calls `size` positive.
      // Letting 0 through here would put the page in a state its own share
      // link refuses to load.
      for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => reduce(initialState(mixed()), { type: 'layerText', index: 0, patch: { size: bad } }))
          .toThrowError(/size/)
      }
    })

    it('rejects an empty weight, since the validator requires a non-empty string', () => {
      expect(() => reduce(initialState(mixed()), { type: 'layerText', index: 0, patch: { weight: '' } }))
        .toThrowError(/weight/)
    })

    it('leaves a scene it produced loadable from its own share link', () => {
      const s = reduce(initialState(mixed()), { type: 'layerText', index: 0, patch: { size: 120, weight: '900' } })
      expect(sceneError(s.scene)).toBeUndefined()
    })

    it('never mutates the state or the layer it was given', () => {
      const before = initialState(mixed())
      const snapshot = JSON.stringify(before)
      const after = reduce(before, { type: 'layerText', index: 0, patch: { size: 120 } })
      expect(JSON.stringify(before)).toBe(snapshot)
      // Identity, not only value. A patch applied in place would leave these
      // the same object, and then the snapshot above passes whenever the field
      // happens already to hold the value being set — which is how an
      // in-place mutation survived the first version of this test.
      expect(after.scene.layers[0]).not.toBe(before.scene.layers[0])
    })

    it('leaves the untouched layers identical, not merely equal', () => {
      const before = initialState(mixed())
      const after = reduce(before, { type: 'layerText', index: 0, patch: { size: 120 } })
      expect(after.scene.layers[1]).toBe(before.scene.layers[1])
    })
  })

  it('replaces the scene and re-clamps the time onto the new grid', () => {
    const at = reduce(initialState(ANIM), { type: 'time', seconds: 1.9 })
    const next = reduce(at, { type: 'scene', scene: STILL })
    expect(next.time).toBe(stillTime(STILL))
  })

  it('tracks freezeNoise and the depth view', () => {
    const s = reduce(initialState(ANIM), { type: 'freezeNoise', value: true })
    expect(s.scene.freezeNoise).toBe(true)
    expect(reduce(s, { type: 'depthView', value: 'encoded' }).depthView).toBe('encoded')
  })

  it('currentFrame reports the index matching the stored time', () => {
    const s = reduce(initialState(ANIM), { type: 'time', seconds: 1 })
    expect(currentFrame(s)).toBe(12)
  })
})

describe('presetNote', () => {
  /**
   * The claim the note makes about `slide` is checked against core rather than
   * asserted in prose, and the check is written so that it fails **either** way
   * round: if `slide` ever gains a non-zero default the note becomes a lie, and
   * if another preset ever loses its default the note stops warning about it.
   */
  const CTX: PresetCtx = {
    sceneW: 640, sceneH: 360, contentW: 200, contentH: 100, layerDepth: 1,
    marginLeft: 110, marginRight: 55,
  }
  const movesNothing = (kind: string): boolean => {
    const track = compilePreset({ kind } as Preset, CTX)
    const axes = ['x', 'y', 'depth', 'scale', 'rotate'] as const
    return axes.every(axis => {
      const values = track.keys.map(k => k[axis]).filter(v => v !== undefined)
      return values.every(v => v === values[0])
    })
  }

  it('slide is the only bare preset that animates nothing', () => {
    const dead = Object.keys(PRESETS).filter(movesNothing)
    expect(dead).toEqual(['slide'])
  })

  it('says so, naming from and to, so a dead animation is not read as a bug', () => {
    const note = presetNote('slide', 1)
    expect(note).toContain('from')
    expect(note).toContain('to')
    expect(note).toMatch(/nothing/)
    // The generic note must not be what a `slide` user sees.
    expect(note).not.toBe(presetNote('bob', 1))
  })

  it('explains a hand-written track rather than offering to discard it silently', () => {
    expect(presetNote(CUSTOM_TRACK, 1)).toMatch(/scene JSON/)
    expect(presetNote(CUSTOM_TRACK, 1)).toMatch(/replaces it/)
  })

  it('reports an empty scene ahead of any preset advice', () => {
    expect(presetNote('slide', 0)).toBe('This scene has no layers.')
    expect(presetNote(CUSTOM_TRACK, 0)).toBe('This scene has no layers.')
  })

  it('gives every other preset the generic note', () => {
    for (const kind of Object.keys(PRESETS).filter(k => k !== 'slide')) {
      expect(presetNote(kind, 1), kind).toMatch(/compile to keyframe tracks/)
    }
  })
})

describe('sceneError', () => {
  it('is undefined for a renderable scene', () => {
    expect(sceneError(ANIM)).toBeUndefined()
  })

  it('reports an unrenderable stereo setting without throwing', () => {
    // The reducer deliberately applies whatever a control hands it, so that a
    // slider dragged through an invalid combination does not throw out of an
    // event handler. The page asks this instead and shows the message.
    const s = reduce(initialState(ANIM), { type: 'stereo', patch: { sepNear: 200 } })
    expect(sceneError(s.scene)).toMatch(/depth budget/)
  })
})
