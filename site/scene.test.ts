import { describe, expect, it } from 'vitest'
import { validateScene } from './scene.js'

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
    expect(message).toMatch(/marquee/)
    expect(message).toMatch(/layers\[0\]\.anim/)
  })

  it('accepts a list of animators, a raw track, and a preset', () => {
    const scene = validateScene({
      size: [8, 8],
      layers: [
        { type: 'text', text: 'A', anim: [{ kind: 'marquee' }, { kind: 'bob' }] },
        { type: 'text', text: 'B', anim: { keys: [{ t: 0, y: 0 }, { t: 1, y: 10 }], ease: 'linear' } },
        { type: 'text', text: 'C', anim: { kind: 'emerge' } },
      ],
    })
    expect(scene.layers).toHaveLength(3)
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

  it('rejects an unknown gif loop mode and an unknown image mode', () => {
    expect(() => validateScene({ size: [8, 8], layers: [{ type: 'gif', src: 'a.gif', loop: 'reverse' }] }))
      .toThrowError(/layers\[0\]\.loop/)
    expect(() => validateScene({ size: [8, 8], layers: [{ type: 'image', src: 'a.png', mode: 'relief' }] }))
      .toThrowError(/layers\[0\]\.mode/)
  })
})
