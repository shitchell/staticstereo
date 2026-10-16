import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as ts from 'typescript'
import {
  BROWSER_LAYER_VARIANTS,
  CUSTOM_TRACK,
  WRITABLE_CONTROL_IDS,
  coerceInt,
  coerceNumber,
  currentFrame,
  currentTime,
  frameIndexAt,
  frameTimesOf,
  initialState,
  lastFrameTime,
  presetNote,
  reduce,
  sceneError,
  timeOfFrame,
  unwritableControls,
} from './controls.js'
import type { Action, SetAction, UiState, WritableControlId } from './controls.js'
import {
  CONTROL_IDS,
  CONTROL_SPECS,
  browserReachableLayerTypes,
  controlInfo,
} from './controlspec.js'
import type { ControlInfo } from './controlspec.js'
import { initialTransport, pause, play, seek } from './transport.js'
import { CHANNELS, PRESETS, STEREO_KEYS, compilePreset, stillTime } from '../src/core/index.js'
import { CTX } from '../src/core/testing/ctx.fixture.js'
import type { Preset, Scene, Track } from '../src/core/types.js'

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
    reduce(before, { type: 'layerAnim', index: 0, anim: { kind: 'push' } })
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
    let s = reduce(initialState(ANIM), { type: 'layerAnim', index: 0, anim: { kind: 'push', to: 0.2 } })
    expect(s.scene.layers[0]?.anim).toEqual({ kind: 'push', to: 0.2 })
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
        initialState({ ...mixed(), layers: [{ type: 'text', text: 'A', size: 90, weight: 'bold', anim: { kind: 'push' } }] }),
        { type: 'layerText', index: 0, patch: { size: 48 } },
      )
      expect(s.scene.layers[0]).toEqual({
        type: 'text', text: 'A', size: 48, weight: 'bold', anim: { kind: 'push' },
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
   * The claim the note makes about `move` is checked against core rather than
   * asserted in prose, and the check is written so that it fails **either** way
   * round: if `move` ever gains a non-zero default the note becomes a lie, and
   * if another preset ever loses its default the note stops warning about it.
   *
   * Over `CHANNELS`, never a list written out here. A fourth hand-copy of the
   * channel list lived at this spot and was missing `rotateX`/`rotateY`, so a
   * preset that animated only an axis rotation was reported as motionless —
   * the test would have endorsed exactly the bug it exists to catch.
   */
  const trackMovesNothing = (track: Track): boolean =>
    CHANNELS.every(axis => {
      const values = track.keys.map(k => k[axis]).filter(v => v !== undefined)
      return values.every(v => v === values[0])
    })

  const movesNothing = (kind: string): boolean =>
    trackMovesNothing(compilePreset({ kind } as Preset, CTX))

  it('counts the axis rotations as motion, like every other channel', () => {
    // The guard on the helper itself. `rotateX`/`rotateY` are the two channels
    // every hand-written copy of this list has dropped, here and in both scene
    // validators, so they are the ones worth pinning.
    expect(trackMovesNothing({
      keys: [{ t: 0, rotateX: 0 }, { t: 1, rotateX: 1 }],
      ease: 'linear',
      repeat: 'once',
    })).toBe(false)
  })

  it('names every bare preset whose channels do not vary', () => {
    // Two different reasons land a kind in this list, and only one of them is
    // a dead animation:
    //
    //   - the **delta verbs** default to rest, so bare they are genuinely
    //     inert — `move` ([0,0]→[0,0]), `rotate` (0°→0°) and `scale` (1→1,
    //     the multiplicative rest). Choosing one from the dropdown and seeing
    //     nothing happen is the case `presetNote` exists to explain.
    //   - **`flip` is static sugar**: it holds a half turn for its whole span.
    //     No channel varies, so it is in this list, but it is very much not
    //     inert — the layer is mirrored. "Does not move" and "does nothing"
    //     are different claims and this helper only measures the first.
    //
    // An exact list rather than a membership check, so that a verb becoming
    // inert by accident — a default changed from 100px to 0 — fails here
    // instead of shipping a dropdown entry that silently does nothing.
    const dead = Object.keys(PRESETS).filter(movesNothing)
    expect(dead).toEqual(['move', 'rotate', 'scale', 'flip'])
  })

  it('says so, naming from and to, so a dead animation is not read as a bug', () => {
    const note = presetNote('move', 1)
    expect(note).toContain('from')
    expect(note).toContain('to')
    expect(note).toMatch(/nothing/)
    // The generic note must not be what a `move` user sees.
    expect(note).not.toBe(presetNote('push', 1))
  })

  it('explains a hand-written track rather than offering to discard it silently', () => {
    expect(presetNote(CUSTOM_TRACK, 1)).toMatch(/scene JSON/)
    expect(presetNote(CUSTOM_TRACK, 1)).toMatch(/replaces it/)
  })

  it('reports an empty scene ahead of any preset advice', () => {
    expect(presetNote('move', 0)).toBe('This scene has no layers.')
    expect(presetNote(CUSTOM_TRACK, 0)).toBe('This scene has no layers.')
  })

  it('gives every other preset the generic note', () => {
    for (const kind of Object.keys(PRESETS).filter(k => k !== 'move')) {
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

/* ------------------------------- criterion 9: the transport, consumed not copied */

/**
 * Object literals in `text` that are a {@link TransportState} by their own key
 * set — the sensor for a transport re-implemented here instead of called.
 *
 * **The key set is derived, never written out.** §9: *"a hand-written list of
 * 'the places that do X' goes stale silently"*, and a transport that grew a
 * fourth field would walk straight past a list of three. `initialTransport`
 * is the only constructor `transport.ts` exports, so its answer's own keys are
 * the vocabulary, and a field added there tightens this guard without anyone
 * editing it.
 *
 * **Parsed and not grepped**, for the reason `store.test.ts` records at
 * length: `controls.ts` discusses the transport in prose, and
 * `TransportState`'s field names appear in this file's own docblocks, so a
 * text search is red on a module that is behaving.
 *
 * **Throws rather than returning `[]`** where it cannot see — plan §1.2k
 * applied to an instrument. A `controls.ts` that had stopped importing
 * `transport.js` altogether is precisely the state this guard exists to catch,
 * and reporting "no transport literals found" over it would be the fail-open
 * answer.
 */
function transportLiteralsIn(path: string, text: string, keys: readonly string[]): readonly string[] {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true)
  if (keys.length === 0) throw new Error('no TransportState keys were supplied; this guard is blind')

  let importsTransport = false
  const hits: string[] = []
  const walk = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === './transport.js'
    ) {
      importsTransport = true
    }
    if (ts.isObjectLiteralExpression(node)) {
      const names = node.properties.flatMap(property =>
        property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
          ? [property.name.text]
          : [])
      if (keys.every(key => names.includes(key))) {
        const line = file.getLineAndCharacterOfPosition(node.getStart()).line + 1
        hits.push(`${path}:${line} {${names.join(', ')}}`)
      }
    }
    ts.forEachChild(node, walk)
  }
  walk(file)

  if (!importsTransport) {
    throw new Error(`${path} no longer imports './transport.js', so this guard is checking nothing`)
  }
  return hits
}

describe('the transport is consumed, not re-implemented', () => {
  const SOURCE = readFileSync(fileURLToPath(new URL('./controls.ts', import.meta.url)), 'utf8')
  const KEYS = Object.keys(initialTransport(ANIM))

  it('builds no transport state of its own, read off its own source', () => {
    /**
     * Criterion 2's duplication half, and it is the half that ships green.
     * A-4 measured that an *agreeing* duplicate reducer arm left the entire
     * repository unmoved — suite, typecheck, both builds — so the behavioural
     * sweep below can only sense divergence and something has to sense the
     * copy. This repo's signature defect is the shape: the animatable-channel
     * list is guarded in `track.ts`, duplicated unguarded in two validators,
     * and both duplicates agreed on the day they were written.
     */
    expect(KEYS.length, 'TransportState has no keys, so the guard matches everything').toBeGreaterThan(0)
    expect(
      transportLiteralsIn('site/controls.ts', SOURCE, KEYS),
      'controls.ts constructed a TransportState instead of calling transport.ts for it. ' +
      'play/pause/seek are a state machine with one definition; a second one here would ' +
      'agree on the day it was written and drift afterwards.',
    ).toEqual([])
  })

  it('would see a hand-rolled transport, and does not fire on prose, which is the control', () => {
    // §6.5a's paired half. Both plants are written the way the mistake would
    // actually be made — a literal inside a reducer arm — and the second pair
    // is what makes the parse worth its cost over a grep.
    const plant = (body: string): string =>
      `import { snapTime } from './transport.js'\n${body}\n`
    const of = (body: string): readonly string[] =>
      transportLiteralsIn('/plant/controls.ts', plant(body), KEYS)

    expect(of('export const t = { playing: true, anchorTime: 0, anchorMs: 0 }').length).toBe(1)
    // Key order is not the signal, and nor is an extra field: a copy that
    // carried one more key is still a copy.
    expect(of('export const t = { anchorMs: 0, extra: 1, anchorTime: 0, playing: false }').length)
      .toBe(1)
    // A subset is not a transport — `{playing}` alone is a UI flag, and
    // flagging it would push the next author into spelling the copy some other
    // way rather than into calling `transport.ts`.
    expect(of('export const t = { playing: true }')).toEqual([])
    // Prose naming every key, which is what this module is full of.
    expect(of('// playing, anchorTime and anchorMs all live in transport.ts\nexport const t = 1'))
      .toEqual([])
    // And it refuses rather than reporting clean when the import is gone.
    expect(() => transportLiteralsIn('/plant/controls.ts', 'export const t = 1\n', KEYS))
      .toThrow(/no longer imports/)
  })

  it('computes every transport transition with transport.ts itself', () => {
    // The divergence half, paired with the duplication half above because the
    // two fail on different things: this one would stay green over a copy that
    // agreed, and that one would stay green over a call that passed the wrong
    // arguments.
    const s0 = initialState(ANIM)
    expect(reduce(s0, { type: 'play', nowMs: 1_000 }).transport)
      .toEqual(play(s0.transport, 1_000))

    const playing = reduce(s0, { type: 'play', nowMs: 1_000 })
    expect(reduce(playing, { type: 'pause', nowMs: 1_500 }).transport)
      .toEqual(pause(playing.transport, 1_500, playing.scene))

    expect(reduce(s0, { type: 'seek', seconds: 1.3, nowMs: 2_000 }).transport)
      .toEqual(seek(s0.transport, 1.3, 2_000, s0.scene))

    // The clock-free scrub arms reach the same function, which is what makes
    // the scrubber and the playhead one playhead rather than two.
    expect(reduce(s0, { type: 'time', seconds: 1.3 }).transport)
      .toEqual(seek(s0.transport, 1.3, s0.transport.anchorMs, s0.scene))
    expect(reduce(s0, { type: 'frame', index: 7 }).transport)
      .toEqual(seek(s0.transport, timeOfFrame(s0.scene, 7), s0.transport.anchorMs, s0.scene))
  })

  it('reports the paused time without any clock, for any clock', () => {
    // `currentTime` is the editor's `currentTime`, and while paused it is a
    // function of the state alone. Asserted over wildly separated clocks
    // rather than one, because a stray `nowMs - anchorMs` term while paused
    // would be invisible at a single sample.
    const s = reduce(initialState(ANIM), { type: 'time', seconds: 1.3 })
    for (const nowMs of [0, 1, 1_000, -5_000, 86_400_000]) {
      expect(currentTime(s, nowMs), `nowMs=${nowMs}`).toBe(s.time)
    }
  })
})

/* -------------------------------------- criterion 22: writable, not merely
 * reachable
 *
 * Criterion 6 (`reachability.test.ts`) proves a `CONTROLS` entry resolves to a
 * mounted panel. It is structurally incapable of noticing that the panel has
 * nothing to dispatch: ESC-7 measured 17 of 63 entries with a keyed `Action`
 * and 46 with none, whose only write path was handing `reduce` a whole
 * rebuilt `Scene` — which `store.ts`'s header says the store must not own.
 *
 * The second clause is the one with teeth. A computed string key **erases the
 * field type**, measured here and reproduced at the top of this phase:
 * `{type: 'stereo', patch: {[key]: Number(raw)}}` compiles clean where
 * `{type: 'stereo', patch: {cross: 1}}` is `TS2322`, so a generic renderer can
 * write a number into a boolean with nothing to stop it. Narrowing the key to
 * `keyof StereoOpts` does **not** restore the check — also measured. A
 * path-addressed action that reintroduces that hole satisfies the first clause
 * and fails the criterion.
 */

const WRITABLE_SCENE: Scene = {
  size: [64, 32],
  fps: 12,
  duration: 2,
  layers: [
    { type: 'text', text: 'A' },
    { type: 'image', src: 'a.png' },
    { type: 'gif', src: 'a.gif' },
    { type: 'shape', shape: 'circle', r: 4 },
  ],
}

/** Where each variant's specimen sits in {@link WRITABLE_SCENE}. */
const VARIANT_INDEX: Readonly<Record<string, number>> = { text: 0, image: 1, gif: 2, shape: 3 }

/**
 * A value this control would accept, derived from its own `ControlInfo`.
 *
 * Derived rather than tabulated, for §9's reason: a table of 52 sample values
 * is a hand-written list of the places that do X, and it would go stale one
 * control at a time as the rosters move. The only per-control special case is
 * the discriminant, which is not a free value — see the sweep below.
 */
function sampleFor(spec: ControlInfo, current?: unknown): unknown {
  if (spec.owner === 'layer' && spec.key === 'type') return spec.scope
  if (spec.shape === 'structured') {
    return spec.key === 'anim' ? { kind: 'push', to: 0.2 } : { luma: 0.5 }
  }
  switch (spec.unit) {
    case 'boolean': return true
    // The first option that is not the one already there. A fixed choice
    // would silently make `stereo.algorithm` (resolved to `linked`) and
    // `layer.shape.shape` (the specimen is a circle) into no-op writes, and a
    // sweep whose write happens to be a no-op cannot tell an applied edit
    // from a dropped one — the failure mode this whole project is about.
    case 'enum': return spec.values?.find(value => value !== current) ?? spec.values?.[0]
    case 'text': case 'identity': return 'sample'
    case 'depth': return 0.25
    default: return spec.shape === 'pair' ? [3, 5] : 7
  }
}

/** What the model holds for `control` right now, by the id's own grammar. */
function readControl(state: UiState, control: string): unknown {
  const [owner, a, b] = control.split('.')
  if (owner === 'scene') return (state.scene as unknown as Record<string, unknown>)[a!]
  if (owner === 'stereo') return (state.scene.stereo as Record<string, unknown> | undefined)?.[a!]
  const layer = state.scene.layers[VARIANT_INDEX[a!]!]
  return (layer as unknown as Record<string, unknown>)[b!]
}

/**
 * The `set` action that writes `value` into `spec`'s field.
 *
 * The cast is the sweep's own price and it is worth naming: a test iterating
 * `CONTROL_IDS` holds an id as a `string`, which is exactly the position the
 * type map refuses to serve — that refusal is the criterion's second clause
 * working. So the sweep buys totality over the registry by giving up the
 * correlation, and the correlation is proved separately, by the compiler,
 * in `wrongTypedWritesDoNotCompile`. Neither half is sufficient alone: this
 * one cannot see a type hole and that one cannot see a missing control.
 */
function setFor(spec: ControlInfo, value: unknown): SetAction {
  if (spec.owner !== 'layer') {
    return { type: 'set', control: spec.control, value } as unknown as SetAction
  }
  return {
    type: 'set', control: spec.control, value, index: VARIANT_INDEX[spec.scope!]!,
  } as unknown as SetAction
}

describe('criterion 22 — every CONTROLS entry is writable', () => {
  it('partitions CONTROL_IDS into the writable set and a declared residue', () => {
    // Total over the registry's own population, never over a number: §9's
    // *"a total in a document is a count of something — not necessarily"*, and
    // the control population was once given as 64 under two arity conventions
    // at once where the answer is 63 under one and 68 under the other.
    const residue = unwritableControls().map(entry => entry.control)
    expect([...WRITABLE_CONTROL_IDS, ...residue].sort()).toEqual([...CONTROL_IDS].sort())

    // The vacuity floor. A partition is trivially satisfiable by declaring
    // everything unwritable, so both halves are pinned non-empty and the
    // residue is pinned a minority — a sweep that could go green over an empty
    // writable set is the "check that cannot see" shape this project is
    // organised around.
    expect(WRITABLE_CONTROL_IDS.length).toBeGreaterThan(0)
    expect(residue.length).toBeGreaterThan(0)
    expect(residue.length).toBeLessThan(WRITABLE_CONTROL_IDS.length)
    expect(CONTROL_IDS.length).toBe(WRITABLE_CONTROL_IDS.length + residue.length)
  })

  it('derives controls for exactly the variants the validator will load', () => {
    // The half the compiler cannot make. `BROWSER_LAYER_VARIANTS` is a tuple
    // tied by `AssertNever` to `Exclude<Layer['type'], 'draw'>`, which is a
    // claim about the *model*; whether the browser loads a variant is the
    // validator's answer and only a probe can ask it. Ruling R-q's reasoning,
    // one level down: writing the four names and leaving it there would be
    // correct today and a silent lie the day `site/scene.ts` changes its mind
    // in either direction.
    expect([...BROWSER_LAYER_VARIANTS].sort()).toEqual([...browserReachableLayerTypes()].sort())
    expect(Object.keys(VARIANT_INDEX).sort()).toEqual([...BROWSER_LAYER_VARIANTS].sort())
  })

  it('names the residue by disposition, and it is exactly the preset family', () => {
    // `Preset` is `{kind: string; [param: string]: unknown}`, so a verb
    // parameter's declared type in the model IS `unknown` and no write into
    // one can be wrong-typed. The criterion's second clause is therefore
    // *vacuously* satisfiable there, which is worse than unmet: a compile-error
    // sensor would report it green. The residue is derived from the same
    // roster `controlspec.ts` derives the controls from, so a sixth verb joins
    // it rather than escaping the partition above.
    const residue = unwritableControls()
    const fromRegistry = CONTROL_SPECS.filter(spec => spec.owner === 'preset').map(s => s.control)
    expect(residue.map(entry => entry.control).sort()).toEqual([...fromRegistry].sort())
    for (const entry of residue) {
      expect(entry.disposition, entry.control).toBe('untyped-in-model')
      expect(entry.reason.length, entry.control).toBeGreaterThan(40)
    }
  })

  it('writes every writable control through reduce, and reads the value back', () => {
    const start = initialState(WRITABLE_SCENE)
    let changed = 0
    let inert = 0
    for (const control of WRITABLE_CONTROL_IDS) {
      const spec = controlInfo(control)
      expect(spec, `${control} is not in CONTROLS`).toBeDefined()
      const before = readControl(start, control)
      const sample = sampleFor(spec!, before)
      const after = readControl(reduce(start, setFor(spec!, sample)), control)
      expect(after, control).toEqual(sample)
      // The discriminant is the one control whose only type-correct value is
      // the one already there: `LayerOf<'text'>['type']` is the literal
      // `'text'`, so a variant change is an `OPERATIONS` affordance (design
      // §5.6) and not a field write. Counted rather than skipped, because a
      // sweep where every write could be inert is a sweep that proves nothing
      // — this is the vacuity floor for the reads above.
      if (Object.is(after, before)) inert += 1
      else changed += 1
    }
    expect(inert, 'exactly the four layer discriminants are inert writes').toBe(4)
    expect(changed).toBe(WRITABLE_CONTROL_IDS.length - 4)
  })

  it('refuses a layer write addressed at the wrong variant, by name', () => {
    const start = initialState(WRITABLE_SCENE)
    expect(() => reduce(start, {
      type: 'set', control: 'layer.shape.r', value: 9, index: VARIANT_INDEX['text']!,
    })).toThrow(/layer 0/)
    expect(() => reduce(start, {
      type: 'set', control: 'layer.text.text', value: 'x', index: 99,
    })).toThrow(/99/)
  })

  it('agrees with every keyed arm that already covered one of these controls', () => {
    // The overlap is the duplication this task creates, declared rather than
    // hidden: 17 controls now have two write paths. `store.test.ts` records
    // that an *agreeing* duplicate is invisible to a behavioural sweep, so the
    // agreement is pinned here instead of assumed — the channel list agreed on
    // the day it was written too.
    const start = initialState(WRITABLE_SCENE)
    const pairs: readonly (readonly [SetAction, Action])[] = [
      [{ type: 'set', control: 'scene.size', value: [80, 40] }, { type: 'size', value: [80, 40] }],
      [{ type: 'set', control: 'scene.fps', value: 24 }, { type: 'fps', value: 24 }],
      [{ type: 'set', control: 'scene.fps', value: undefined }, { type: 'fps', value: undefined }],
      [{ type: 'set', control: 'scene.duration', value: 3 }, { type: 'duration', value: 3 }],
      [{ type: 'set', control: 'scene.duration', value: undefined }, { type: 'duration', value: undefined }],
      [{ type: 'set', control: 'scene.freezeNoise', value: true }, { type: 'freezeNoise', value: true }],
      ...STEREO_KEYS.map(key => [
        { type: 'set', control: `stereo.${key}`, value: sampleFor(controlInfo(`stereo.${key}`)!) },
        { type: 'stereo', patch: { [key]: sampleFor(controlInfo(`stereo.${key}`)!) } },
      ] as unknown as readonly [SetAction, Action]),
      ...Object.keys(VARIANT_INDEX).map(variant => [
        {
          type: 'set', control: `layer.${variant}.anim`,
          value: { kind: 'push', to: 0.2 }, index: VARIANT_INDEX[variant]!,
        },
        { type: 'layerAnim', index: VARIANT_INDEX[variant]!, anim: { kind: 'push', to: 0.2 } },
      ] as unknown as readonly [SetAction, Action]),
      [
        { type: 'set', control: 'layer.text.size', value: 48, index: 0 },
        { type: 'layerText', index: 0, patch: { size: 48 } },
      ],
      [
        { type: 'set', control: 'layer.text.weight', value: '700', index: 0 },
        { type: 'layerText', index: 0, patch: { weight: '700' } },
      ],
    ]
    // 17 is the count ESC-7 measured as *already keyed*, arrived at here from
    // the other direction — one row per keyed control rather than one per
    // action variant. The extra rows are the `undefined` outcomes of `fps` and
    // `duration`, which are a different edit from a number.
    expect(new Set(pairs.map(([set]) => set.control)).size).toBe(17)
    for (const [set, keyed] of pairs) {
      expect(reduce(start, set), `${set.control} vs {type:'${keyed.type}'}`)
        .toEqual(reduce(start, keyed))
    }
  })
})

/**
 * The wrong-typed writes, in a function nothing calls.
 *
 * **These are assertions made by `npm run typecheck`, not by `npm test`.**
 * An `@ts-expect-error` is itself an error when the line below it stops being
 * one, so the day the type map loses a field's type the gate goes red naming
 * the line and the file. That is the cheapest available sensor for a
 * compile-time claim and it spawns no `svelte-check` process — whether this
 * phase also wants a fourth harness is H-2's question, not this file's.
 *
 * Never called, because several of these are not merely ill-typed but
 * ill-formed at run time: `anyId` is the generic renderer's variable and has
 * no value. A `describe` block below references it so it is not dead code.
 *
 * The paired control is {@link wellTypedWritesCompile}: the same writes, with
 * the right value types, compile. Without it this wall is satisfiable by a
 * type that rejects everything, which is §6.5a's rule applied to a
 * compile-time instrument — an `@ts-expect-error` that can never be wrong is
 * an instrument with no failure mode.
 */
function wrongTypedWritesDoNotCompile(anyId: WritableControlId): readonly unknown[] {
  return [
    // a number into a boolean — the exact write the computed-key form admits
    // @ts-expect-error
    { type: 'set', control: 'stereo.cross', value: 1 } satisfies SetAction,
    // a boolean into a number
    // @ts-expect-error
    { type: 'set', control: 'stereo.sepFar', value: true } satisfies SetAction,
    // a name outside the enum's vocabulary
    // @ts-expect-error
    { type: 'set', control: 'stereo.algorithm', value: 'nope' } satisfies SetAction,
    // a string into a scene-pixel length
    // @ts-expect-error
    { type: 'set', control: 'layer.shape.r', value: 'big', index: 3 } satisfies SetAction,
    // a variant change dressed as a field write: `LayerOf<'text'>['type']` is
    // the literal `'text'`, so creating an image layer stays `OPERATIONS`' job
    // @ts-expect-error
    { type: 'set', control: 'layer.text.type', value: 'image', index: 0 } satisfies SetAction,
    // a key that belongs to another variant
    // @ts-expect-error
    { type: 'set', control: 'layer.shape.text', value: 'x', index: 3 } satisfies SetAction,
    // a layer write naming no layer
    // @ts-expect-error
    { type: 'set', control: 'layer.shape.r', value: 4 } satisfies SetAction,
    // a singleton write carrying a layer index
    // @ts-expect-error
    { type: 'set', control: 'scene.fps', value: 12, index: 0 } satisfies SetAction,
    // omitting the value entirely, which is a different edit from clearing it
    // @ts-expect-error
    { type: 'set', control: 'layer.shape.r', index: 3 } satisfies SetAction,
    // clearing a field the model declares required
    // @ts-expect-error
    { type: 'set', control: 'layer.text.text', value: undefined, index: 0 } satisfies SetAction,
    // and the generic-renderer path: an id held in a *variable* cannot be
    // paired with a value the checker has not correlated to it. This is
    // exactly the hole SPIKE-1 measured, closed — a renderer must narrow
    // before it writes, and the compile error is the feature.
    // @ts-expect-error
    { type: 'set', control: anyId, value: 1 } satisfies SetAction,
  ]
}

/** §6.5a's paired half for the wall above: these must compile. */
const wellTypedWritesCompile: readonly SetAction[] = [
  { type: 'set', control: 'stereo.cross', value: true },
  { type: 'set', control: 'stereo.sepFar', value: 110 },
  { type: 'set', control: 'stereo.algorithm', value: 'linked' },
  { type: 'set', control: 'scene.size', value: [2, 2] },
  { type: 'set', control: 'scene.fps', value: undefined },
  { type: 'set', control: 'layer.shape.r', value: 4, index: 3 },
  { type: 'set', control: 'layer.shape.r', value: undefined, index: 3 },
  { type: 'set', control: 'layer.text.text', value: 'hi', index: 0 },
  { type: 'set', control: 'layer.text.type', value: 'text', index: 0 },
  { type: 'set', control: 'layer.image.mask', value: { luma: 0.5 }, index: 1 },
]

describe('criterion 22, second clause — a wrong-typed write fails to compile', () => {
  it('has a well-typed control that does compile, and a rejection wall that does not', () => {
    // The runtime half of this pair can only witness that both lists exist and
    // that the compiling one is not empty. The claim itself — that the eleven
    // writes in `wrongTypedWritesDoNotCompile` are errors — is `typecheck`'s,
    // and it is checked on every run of the gate rather than once by hand.
    expect(wellTypedWritesCompile.length).toBeGreaterThan(0)
    expect(typeof wrongTypedWritesDoNotCompile).toBe('function')
    // Every well-typed write really is applicable, so the control is not a
    // list of expressions that happen to typecheck and do nothing.
    const start = initialState(WRITABLE_SCENE)
    for (const action of wellTypedWritesCompile) {
      expect(() => reduce(start, action), action.control).not.toThrow()
    }
  })
})
