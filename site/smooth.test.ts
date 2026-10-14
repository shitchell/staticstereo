import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SMOOTH,
  SMOOTH_MODES,
  SMOOTH_PARAM,
  imageRenderingFor,
  parseSmooth,
} from './smooth.js'
import { encodeSceneHash, parseSceneHash } from './hash.js'
import { validateScene } from './scene.js'
import type { Scene } from '../src/core/types.js'

/**
 * The `?smooth=` resampling hint, parsed. Same house pattern as `present.ts`
 * and `fit.ts`: permissive reading, last of a repeat wins, and the fragment is
 * the scene and is never consulted.
 *
 * The scene is a literal rather than `DEFAULT_EXAMPLE` because
 * `site/examples.ts` is editor-only and nothing in the player may depend on it.
 */

const SCENE: Scene = {
  size: [320, 180],
  fps: 12,
  duration: 2,
  freezeNoise: false,
  stereo: { sepFar: 110, sepNear: 92, noiseScale: 2, depthBlur: 1, cross: false, seed: 7 },
  layers: [
    { type: 'text', text: 'HELLO', size: 60, depth: 0.6, anim: { kind: 'marquee', speed: 60 } },
  ],
}

describe('SMOOTH_MODES', () => {
  it('is a record keyed by mode name, matching FIT_MODES', () => {
    expect(Object.keys(SMOOTH_MODES).sort()).toEqual(['auto', 'off', 'on'])
    for (const [name, mode] of Object.entries(SMOOTH_MODES)) {
      expect(mode.mode, name).toBe(name)
      expect(typeof mode.description, name).toBe('string')
      expect(mode.description.length, name).toBeGreaterThan(20)
      expect(mode.description, name).not.toContain('\n')
    }
  })

  it('names the default, and the default is a registered mode', () => {
    expect(DEFAULT_SMOOTH).toBe('auto')
    expect(SMOOTH_MODES[DEFAULT_SMOOTH]).toBeDefined()
  })

  it('parses every registered mode from its canonical spelling', () => {
    const names = Object.keys(SMOOTH_MODES)
    expect(names.length).toBeGreaterThan(2)
    for (const name of names) {
      expect(parseSmooth(`?${SMOOTH_PARAM}=${name}`), name).toBe(name)
    }
  })
})

describe('parseSmooth', () => {
  it('falls back to the default when the parameter is absent', () => {
    expect(parseSmooth('')).toBe(DEFAULT_SMOOTH)
    expect(parseSmooth('?')).toBe(DEFAULT_SMOOTH)
    expect(parseSmooth('?other=1')).toBe(DEFAULT_SMOOTH)
  })

  it('reads the canonical spellings, with or without the leading ?', () => {
    expect(parseSmooth('?smooth=auto')).toBe('auto')
    expect(parseSmooth('?smooth=on')).toBe('on')
    expect(parseSmooth('?smooth=off')).toBe('off')
    expect(parseSmooth('smooth=on')).toBe('on')
  })

  it('is permissive about surrounding space and case', () => {
    expect(parseSmooth('?smooth=ON')).toBe('on')
    expect(parseSmooth('?smooth=%20Off%20')).toBe('off')
  })

  it('reads the boolean-ish spellings a human types onto a flag', () => {
    // The choice, recorded at the declaration in smooth.ts: present.ts already
    // established that a reader types `1`/`true`/`yes` to mean on and
    // `0`/`false`/`no`/`off` to mean off, and `off` is ALREADY a canonical
    // value here — so the two vocabularies are half-merged whether we like it
    // or not, and finishing the merge is less surprising than leaving
    // `?smooth=off` meaning off while `?smooth=false` means auto.
    for (const value of ['1', 'true', 'TRUE', 'yes']) {
      expect(parseSmooth(`?smooth=${value}`), value).toBe('on')
    }
    for (const value of ['0', 'false', 'no']) {
      expect(parseSmooth(`?smooth=${value}`), value).toBe('off')
    }
  })

  it('falls back rather than throwing on an unknown or empty value', () => {
    for (const value of ['', 'maybe', 'auto!', 'smooth', 'pixelated', '2']) {
      expect(() => parseSmooth(`?smooth=${value}`), value).not.toThrow()
      expect(parseSmooth(`?smooth=${value}`), value).toBe(DEFAULT_SMOOTH)
    }
  })

  it('reads a bare flag as auto, unlike present.ts, because this is tri-state', () => {
    // `?present` means on because a boolean's only two states make a bare flag
    // unambiguous. Here the default is `auto` and `auto` is a real third
    // answer, so a bare `?smooth` names the parameter without choosing between
    // its values — there is nothing for it to toggle TO. Falling back is the
    // only reading that does not invent an intent.
    expect(parseSmooth('?smooth')).toBe(DEFAULT_SMOOTH)
    expect(parseSmooth('?smooth=')).toBe(DEFAULT_SMOOTH)
  })

  it('takes the last of a repeated parameter, so the later assignment wins', () => {
    expect(parseSmooth('?smooth=on&smooth=off')).toBe('off')
    expect(parseSmooth('?smooth=off&smooth=on')).toBe('on')
    // The literal last, not the last recognised one — same rule as parseFit.
    expect(parseSmooth('?smooth=on&smooth=typo')).toBe(DEFAULT_SMOOTH)
  })

  it('sees the parameter among other parameters, in any position', () => {
    expect(parseSmooth('?fit=snap&smooth=on')).toBe('on')
    expect(parseSmooth('?smooth=on&fit=snap')).toBe('on')
    expect(parseSmooth('?a=1&smooth=off&b=2')).toBe('off')
  })

  it('is not fooled by a parameter that merely contains the name', () => {
    expect(parseSmooth('?unsmooth=on')).toBe(DEFAULT_SMOOTH)
    expect(parseSmooth('?smoothing=on')).toBe(DEFAULT_SMOOTH)
    expect(parseSmooth('?smooth_mode=on')).toBe(DEFAULT_SMOOTH)
    expect(parseSmooth('?x=smooth=on')).toBe(DEFAULT_SMOOTH)
  })
})

describe('imageRenderingFor', () => {
  /**
   * A sweep rather than two hand-picked points: the claim is "every downscale"
   * and "every upscale", and two points cannot distinguish that from a
   * threshold accidentally written at 0.5 or at 2.
   */
  const DOWN = [0.001, 0.01, 0.1, 0.25, 1 / 3, 0.5, 0.75, 0.9, 0.99, 0.999, 0.999999]
  const UP = [1.000001, 1.001, 1.01, 1.1, 1.5, 2, 2.5, 3, 10, 100, 1000]
  const DEGENERATE = [1, 0, -0, -1, -0.5, Number.NaN, Infinity, -Infinity]
  const ALL = [...DOWN, ...UP, ...DEGENERATE]

  it('is total: every mode and every scale yields one of the two legal values', () => {
    // A CSS property with an undefined value is a silent no-op, so a hole here
    // would not throw — it would just quietly stop pixelating.
    for (const mode of Object.keys(SMOOTH_MODES)) {
      for (const scale of ALL) {
        const got = imageRenderingFor(mode as never, scale)
        expect(['auto', 'pixelated'], `${mode} @ ${scale}`).toContain(got)
      }
    }
  })

  it('honours an explicit on at every scale, including the degenerate ones', () => {
    for (const scale of ALL) {
      expect(imageRenderingFor('on', scale), `on @ ${scale}`).toBe('auto')
    }
  })

  it('honours an explicit off at every scale, including the degenerate ones', () => {
    for (const scale of ALL) {
      expect(imageRenderingFor('off', scale), `off @ ${scale}`).toBe('pixelated')
    }
  })

  it('smooths every downscale under auto, per R20', () => {
    // R20: "softening and blurring and pixels compressing into each other
    // acknowledged and accepted". Nearest-neighbour on the way down drops
    // whole columns, which is the one outcome R20 does NOT accept.
    for (const scale of DOWN) {
      expect(imageRenderingFor('auto', scale), `auto @ ${scale}`).toBe('auto')
    }
  })

  it('pixelates every upscale under auto, so integer factors stay exact', () => {
    for (const scale of UP) {
      expect(imageRenderingFor('auto', scale), `auto @ ${scale}`).toBe('pixelated')
    }
  })

  it('pixelates at exactly 1:1, which is an argued pick and not a don’t-care', () => {
    // Observable, so it is argued rather than asserted blindly. At a true 1:1
    // neither value resamples and the two are identical — but a nominal 1:1 is
    // not a true one: the plate's device-pixel origin is fractional whenever
    // the layout lands it off a whole pixel, and `auto` in that state blends
    // adjacent columns of RANDOM dots, which is exactly the failure
    // site/scale.ts was written to prevent. `pixelated` is the value that is
    // right at 1:1 and still right when the ratio drifts off it, so it is the
    // fail-safe branch. It also agrees with the rule either neighbouring case
    // would suggest by continuity from above ("integer factors stay exact").
    expect(imageRenderingFor('auto', 1)).toBe('pixelated')
  })

  it('pixelates for a scale that cannot be a downscale', () => {
    // Zero, negative and NaN are not downscales; they are a container with no
    // size, an arithmetic error upstream, or a division by zero. None of them
    // is a reason to start blending random dots, so they take the same
    // fail-safe branch as 1:1 rather than a separate rule.
    for (const scale of [0, -0, -1, -0.5, Number.NaN, -Infinity]) {
      expect(imageRenderingFor('auto', scale), `auto @ ${scale}`).toBe('pixelated')
    }
    // Infinity is an upscale by any reading, and lands in the same place.
    expect(imageRenderingFor('auto', Infinity)).toBe('pixelated')
  })

  it('agrees with parseSmooth on the default, which is the composed behaviour', () => {
    // The pairing a caller actually writes: parse the URL, then ask the policy.
    // Pinned so that changing either half alone shows up here.
    expect(imageRenderingFor(parseSmooth(''), 0.5)).toBe('auto')
    expect(imageRenderingFor(parseSmooth(''), 2)).toBe('pixelated')
    expect(imageRenderingFor(parseSmooth('?smooth=on'), 2)).toBe('auto')
    expect(imageRenderingFor(parseSmooth('?smooth=off'), 0.5)).toBe('pixelated')
  })
})

describe('parseSmooth and the fragment', () => {
  it('reads only the search, so a scene carrying the text is unaffected', () => {
    const body = encodeSceneHash(SCENE)
    const hash = `#${body}`
    for (const search of ['', '?smooth=on', '?smooth=off&fit=snap']) {
      const url = `/p/${search}${hash}`
      expect(url.endsWith(hash), search).toBe(true)
      const [before, after] = url.split('#') as [string, string]
      expect(after).toBe(body)
      expect(parseSceneHash(`#${after}`)).toEqual(SCENE)
      expect(() => validateScene(parseSceneHash(`#${after}`))).not.toThrow()
      const query = before.includes('?') ? before.slice(before.indexOf('?')) : ''
      expect(parseSmooth(query), search).toBe(search === '' ? DEFAULT_SMOOTH : parseSmooth(search))
    }
  })

  it('ignores the parameter spelling when it appears inside the fragment', () => {
    const sneaky: Scene = {
      ...SCENE,
      layers: [{ type: 'text', text: 'smooth=on', size: 60, depth: 0.6 }],
    }
    const hash = `#${encodeSceneHash(sneaky)}`
    expect(parseSmooth('')).toBe(DEFAULT_SMOOTH)
    expect(parseSceneHash(hash)).toEqual(sneaky)
    // The encoded form really does carry the text, so this is not vacuous.
    expect(JSON.stringify(parseSceneHash(hash))).toContain('smooth=on')
  })

  it('and the fragment spelling it refuses really would break the scene', () => {
    // The positive control, as in present.test.ts and fit.test.ts.
    const body = encodeSceneHash(SCENE)
    expect(() => parseSceneHash(`#${body}&smooth=on`)).toThrow(/not a base64url character/)
    expect(() => parseSceneHash(`#${body}?smooth=on`)).toThrow(/not a base64url character/)
  })
})
