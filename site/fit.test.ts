import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FIT,
  FIT_MODES,
  FIT_PARAM,
  REJECTED_FIT_MODES,
  fitNotice,
  parseFit,
} from './fit.js'
import { encodeSceneHash, parseSceneHash } from './hash.js'
import { validateScene } from './scene.js'
import type { Scene } from '../src/core/types.js'

/**
 * The `?fit=` parameter, and the two properties that matter about it: it is
 * **permissive** (a bad embed URL still shows a stereogram) and it **cannot
 * reach the hash** (the fragment is the scene).
 *
 * Structured like `present.test.ts` for the same reasons, including the
 * fragment round-trip and its positive control. The scene is a literal rather
 * than `DEFAULT_EXAMPLE`, because `site/examples.ts` is editor-only and nothing
 * in the player may depend on it.
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

describe('FIT_MODES', () => {
  it('is a record keyed by mode name, so a registry is one object literal away', () => {
    // Design §11 lists "Fit modes · FIT_MODES registry · moving it costs one
    // registration". Asserting the SHAPE (keyed record, self-describing values)
    // rather than the contents is what makes that retrofit mechanical.
    expect(Object.keys(FIT_MODES).sort()).toEqual(['contain', 'render', 'snap'])
    for (const [name, mode] of Object.entries(FIT_MODES)) {
      expect(mode.mode, name).toBe(name)
      expect(typeof mode.description, name).toBe('string')
      // A one-line human description, not a placeholder: long enough that a
      // stub cannot satisfy it, short enough to still be one line.
      expect(mode.description.length, name).toBeGreaterThan(20)
      expect(mode.description, name).not.toContain('\n')
    }
  })

  it('names the default, and the default is a registered mode', () => {
    expect(DEFAULT_FIT).toBe('contain')
    expect(FIT_MODES[DEFAULT_FIT]).toBeDefined()
  })

  it('parses every registered mode from its canonical spelling', () => {
    // Driven off the registry, so a mode added without a spelling fails here
    // rather than shipping unreachable.
    const names = Object.keys(FIT_MODES)
    expect(names.length).toBeGreaterThan(2)
    for (const name of names) {
      expect(parseFit(`?${FIT_PARAM}=${name}`), name).toBe(name)
    }
  })
})

describe('parseFit', () => {
  it('falls back to the default when the parameter is absent', () => {
    expect(parseFit('')).toBe(DEFAULT_FIT)
    expect(parseFit('?')).toBe(DEFAULT_FIT)
    expect(parseFit('?other=1')).toBe(DEFAULT_FIT)
  })

  it('reads the canonical spellings, with or without the leading ?', () => {
    expect(parseFit('?fit=contain')).toBe('contain')
    expect(parseFit('?fit=snap')).toBe('snap')
    expect(parseFit('?fit=render')).toBe('render')
    expect(parseFit('fit=snap')).toBe('snap')
  })

  it('is permissive about surrounding space and case, as present.ts is', () => {
    expect(parseFit('?fit=SNAP')).toBe('snap')
    expect(parseFit('?fit=%20Render%20')).toBe('render')
  })

  it('falls back rather than throwing on an unknown or empty value', () => {
    // The governing reason: a bad embed URL must still show a stereogram. An
    // iframe with a typo in it is a worse failure than a wrong fit mode.
    for (const value of ['', 'fill', 'contain!', '1', 'true', 'none']) {
      expect(() => parseFit(`?fit=${value}`), value).not.toThrow()
      expect(parseFit(`?fit=${value}`), value).toBe(DEFAULT_FIT)
    }
    expect(parseFit('?fit')).toBe(DEFAULT_FIT)
  })

  it('takes the last of a repeated parameter, so the later assignment wins', () => {
    expect(parseFit('?fit=snap&fit=render')).toBe('render')
    expect(parseFit('?fit=render&fit=snap')).toBe('snap')
    // The LITERAL last, not the last recognised one: an unreadable later
    // assignment is still the author's most recent word, and silently reaching
    // back past it would make `?fit=snap&fit=typo` behave as `snap` in a way no
    // reader of the URL could predict.
    expect(parseFit('?fit=snap&fit=typo')).toBe(DEFAULT_FIT)
  })

  it('sees the parameter among other parameters, in any position', () => {
    expect(parseFit('?present=1&fit=snap')).toBe('snap')
    expect(parseFit('?fit=snap&present=1')).toBe('snap')
    expect(parseFit('?a=1&fit=render&b=2')).toBe('render')
  })

  it('is not fooled by a parameter that merely contains the name', () => {
    expect(parseFit('?unfit=snap')).toBe(DEFAULT_FIT)
    expect(parseFit('?fitmode=snap')).toBe(DEFAULT_FIT)
    expect(parseFit('?fit_mode=snap')).toBe(DEFAULT_FIT)
    expect(parseFit('?x=fit=snap')).toBe(DEFAULT_FIT)
  })
})

describe('REJECTED_FIT_MODES', () => {
  /**
   * Execution plan §7/P2.4 requires that `cover` not being implemented is
   * recorded **where someone will look**. A comment in a file nobody opens is
   * not that; a machine-readable record the parser itself can hand back is.
   * `cover` is the spelling that will actually be tried — R14 was originally
   * written as `cover` — so the parser will be handed it in the wild.
   */
  it('records cover as understood and refused, not merely unknown', () => {
    expect('cover' in FIT_MODES).toBe(false)
    expect('cover' in REJECTED_FIT_MODES).toBe(true)
  })

  it('shares no key with FIT_MODES, so no mode is both offered and refused', () => {
    const offered = Object.keys(FIT_MODES)
    const refused = Object.keys(REJECTED_FIT_MODES)
    expect(refused.length).toBeGreaterThan(0)
    expect(refused.filter(name => offered.includes(name))).toEqual([])
  })

  it('gives a reason that names both the crop and its consequence for fusion', () => {
    // Asserted on the two IDEAS rather than on the wording, so the prose can be
    // rewritten but cannot quietly lose the argument: cover crops, and the crop
    // eats the margins, which are the fusion partners of the stage's edge
    // columns. The length floor is what stops a stub ('not supported') passing.
    const reason = REJECTED_FIT_MODES.cover?.reason ?? ''
    expect(reason.length).toBeGreaterThan(80)
    expect(reason).toMatch(/crop/i)
    expect(reason).toMatch(/fusion|fuse/i)
    expect(reason).toMatch(/margin/i)
  })

  it('carries its own key, like FIT_MODES does', () => {
    for (const [name, rejected] of Object.entries(REJECTED_FIT_MODES)) {
      expect(rejected.mode, name).toBe(name)
    }
  })
})

describe('parseFit and fitNotice on a rejected mode', () => {
  it('falls back without throwing, so a cover embed still shows a stereogram', () => {
    expect(() => parseFit('?fit=cover')).not.toThrow()
    expect(parseFit('?fit=cover')).toBe(DEFAULT_FIT)
    expect(parseFit('?fit=COVER')).toBe(DEFAULT_FIT)
  })

  it('surfaces the recorded reason so a caller can show or log it', () => {
    const notice = fitNotice('?fit=cover')
    expect(notice).toBeDefined()
    expect(notice?.requested).toBe('cover')
    expect(notice?.fallback).toBe(DEFAULT_FIT)
    expect(notice?.reason).toBe(REJECTED_FIT_MODES.cover?.reason)
  })

  it('is silent for absent, valid and merely-unknown values', () => {
    // An unknown spelling has no recorded reason to give. Inventing one is the
    // generic message a caller can write for itself; this export exists to
    // carry the arguments we actually made.
    for (const search of ['', '?other=1', '?fit=contain', '?fit=snap', '?fit=typo', '?fit=']) {
      expect(fitNotice(search), search).toBeUndefined()
    }
  })

  it('reads the same repeated parameter parseFit does', () => {
    // The two must not disagree about which spelling is operative, or the page
    // would letterbox for one reason and explain a different one.
    expect(fitNotice('?fit=cover&fit=snap')).toBeUndefined()
    expect(fitNotice('?fit=snap&fit=cover')?.requested).toBe('cover')
    expect(parseFit('?fit=snap&fit=cover')).toBe(DEFAULT_FIT)
  })
})

describe('parseFit and the fragment', () => {
  /**
   * **The property the whole parameter design rests on.**
   *
   * `fit` is a query parameter and not a fragment token for exactly the reason
   * `present` is: the fragment *is* the scene, and `parseSceneHash`
   * base64-decodes everything after the first `.`. So the test is not "the hash
   * looks unchanged" — it is "a real scene survives byte-identically while the
   * query says `fit=snap`, and `parseFit` reads only the query".
   */
  it('reads only the search, so a scene carrying the text is unaffected', () => {
    const body = encodeSceneHash(SCENE)
    const hash = `#${body}`
    for (const search of ['', '?fit=snap', '?fit=render&present=1']) {
      const url = `/p/${search}${hash}`
      // The hash is the tail of the URL, byte for byte.
      expect(url.endsWith(hash), search).toBe(true)
      const [before, after] = url.split('#') as [string, string]
      expect(after).toBe(body)
      expect(parseSceneHash(`#${after}`)).toEqual(SCENE)
      expect(() => validateScene(parseSceneHash(`#${after}`))).not.toThrow()
      // ...and the parameter is read from the other side of the `#`.
      const query = before.includes('?') ? before.slice(before.indexOf('?')) : ''
      expect(parseFit(query), search).toBe(search === '' ? DEFAULT_FIT : parseFit(search))
    }
  })

  it('ignores the parameter spelling when it appears inside the fragment', () => {
    // Decoded or encoded, a scene whose text happens to read `fit=snap` has no
    // effect: parseFit never sees the fragment.
    const sneaky: Scene = {
      ...SCENE,
      layers: [{ type: 'text', text: 'fit=snap', size: 60, depth: 0.6 }],
    }
    const hash = `#${encodeSceneHash(sneaky)}`
    expect(parseFit('')).toBe(DEFAULT_FIT)
    expect(parseSceneHash(hash)).toEqual(sneaky)
    // And the encoded form really does carry the text, so this is not vacuous.
    expect(JSON.stringify(parseSceneHash(hash))).toContain('fit=snap')
  })

  it('and the fragment spelling it refuses really would break the scene', () => {
    // The positive control. Without it, "fit lives in the query" is a claim
    // about a danger nobody has shown to exist.
    const body = encodeSceneHash(SCENE)
    expect(() => parseSceneHash(`#${body}&fit=snap`)).toThrow(/not a base64url character/)
    expect(() => parseSceneHash(`#${body}?fit=snap`)).toThrow(/not a base64url character/)
  })
})
