import { describe, expect, it } from 'vitest'
import { PRESENT_PARAM, isPresenting, presentSearch, presentUrl } from './present.js'
import { encodeSceneHash, parseSceneHash } from './hash.js'
import { validateScene } from './scene.js'
import { DEFAULT_EXAMPLE } from './examples.js'

/**
 * The presentation-mode flag, and the one property that actually matters about
 * it: **it cannot reach the hash.**
 *
 * The flag was put in `location.search` rather than in the fragment because the
 * fragment is the save format and `parseSceneHash` throws on any byte outside
 * base64url. The tests below are in two halves accordingly — the ordinary
 * parsing of the parameter, and then a round-trip of a real scene through a URL
 * that carries both, asserting the scene comes back byte-identical.
 */

describe('isPresenting', () => {
  it('is off when the parameter is absent', () => {
    expect(isPresenting('')).toBe(false)
    expect(isPresenting('?')).toBe(false)
    expect(isPresenting('?other=1')).toBe(false)
  })

  it('is on for the canonical spelling, with or without the leading ?', () => {
    expect(isPresenting('?present=1')).toBe(true)
    expect(isPresenting('present=1')).toBe(true)
  })

  it('reads a bare flag as on, because that is how a human types one', () => {
    expect(isPresenting('?present')).toBe(true)
    expect(isPresenting('?present=')).toBe(true)
  })

  /**
   * **The third of the three spellings the permissive read covers, which was
   * the one nothing asserted.**
   *
   * `isPresenting`'s docblock names three things that mean on: a bare
   * `?present`, an empty `?present=`, and "a value nobody can read". The first
   * two had tests and the third did not, and it is the only one that is a
   * *choice* — `smooth.ts` reads its own unreadable value the other way and
   * says so.
   *
   * Measured. The mutation `value === '' ? true :
   * booleanSpelling(normaliseParam(value)) === true` — which flips
   * `?present=maybe` from on to off — passed `present.test.ts` plus
   * `query.test.ts` at **38 passed, 0 skipped**, and those two files are the
   * only ones in the repo that reference `isPresenting`. `query.test.ts`'s
   * cross-check iterates `BOOLEAN_SPELLINGS`, so it only ever sees *recognised*
   * spellings and cannot reach this branch at all.
   */
  it('reads a value nobody can read as on, because it is still someone asking', () => {
    for (const value of ['maybe', '2', 'yep', 'true!', 'ON!', '-1', 'null']) {
      expect(isPresenting(`?present=${value}`), value).toBe(true)
    }
    // ...and the branch discriminates rather than meaning "the name is present,
    // so on": the explicitly falsy spellings next door still mean off, which is
    // what makes `?present=0` a way to say no rather than a synonym for yes.
    expect(isPresenting('?present=off')).toBe(false)
  })

  it('reads an explicitly falsy value as off', () => {
    for (const value of ['0', 'false', 'FALSE', 'no', 'off', ' off ']) {
      expect(isPresenting(`?present=${value}`), value).toBe(false)
    }
  })

  it('takes the last of a repeated parameter, so the later assignment wins', () => {
    expect(isPresenting('?present=1&present=0')).toBe(false)
    expect(isPresenting('?present=0&present=1')).toBe(true)
  })

  it('sees the flag among other parameters, in any position', () => {
    expect(isPresenting('?utm_source=x&present=1')).toBe(true)
    expect(isPresenting('?present=1&utm_source=x')).toBe(true)
    expect(isPresenting('?a=1&present=1&b=2')).toBe(true)
  })

  it('is not fooled by a parameter that merely contains the name', () => {
    expect(isPresenting('?presenting=1')).toBe(false)
    expect(isPresenting('?notpresent=1')).toBe(false)
    expect(isPresenting('?x=present=1')).toBe(false)
  })
})

describe('presentSearch', () => {
  it('adds the canonical spelling to an empty query', () => {
    expect(presentSearch('', true)).toBe('?present=1')
  })

  it('removes every copy, not just the last', () => {
    // Leaving one behind would put the page straight back into presentation
    // mode on the next reload, which is the opposite of an exit.
    expect(presentSearch('?present=0&present=1', false)).toBe('')
    expect(isPresenting(presentSearch('?present=0&present=1', false))).toBe(false)
  })

  it('leaves no stray ? when the flag was the only parameter', () => {
    expect(presentSearch('?present=1', false)).toBe('')
  })

  it('keeps other parameters, and keeps their order', () => {
    expect(presentSearch('?a=1&b=2', true)).toBe('?a=1&b=2&present=1')
    expect(presentSearch('?a=1&present=1&b=2', false)).toBe('?a=1&b=2')
  })

  it('is idempotent in both directions', () => {
    for (const search of ['', '?a=1', '?present=1', '?a=1&present=0&b=2']) {
      for (const on of [true, false]) {
        const once = presentSearch(search, on)
        expect(presentSearch(once, on), `${search} → ${on}`).toBe(once)
        expect(isPresenting(once)).toBe(on)
      }
    }
  })

  it('re-serialises what it kept, which is a real change and is documented', () => {
    // Asserted rather than glossed over: this round-trips through
    // URLSearchParams, so a bare flag gains an `=` and a space becomes `+`.
    // Harmless for a query (every parser reads the pairs the same way) and the
    // reason it is harmless is that the SCENE is in the hash, not here.
    expect(presentSearch('?debug', true)).toBe('?debug=&present=1')
    expect(presentSearch('?note=a b', true)).toBe('?note=a+b&present=1')
  })
})

describe('presentUrl', () => {
  const at = (search: string, hash: string) => ({ pathname: '/staticstereo/', search, hash })

  it('composes pathname, search and hash', () => {
    expect(presentUrl(at('', '#v1.abc'), true)).toBe('/staticstereo/?present=1#v1.abc')
    expect(presentUrl(at('?present=1', '#v1.abc'), false)).toBe('/staticstereo/#v1.abc')
  })

  it('works with no hash at all — a first visit', () => {
    expect(presentUrl(at('', ''), true)).toBe('/staticstereo/?present=1')
    expect(presentUrl(at('?present=1', ''), false)).toBe('/staticstereo/')
  })

  /**
   * **The property the whole design rests on.**
   *
   * A flag in the fragment would make `parseSceneHash` throw — it takes
   * everything after the first `.` and base64-decodes it, and base64url has no
   * `&`, `=` or `?`. So the test is not "the hash looks unchanged", it is "a
   * real scene survives a round trip through a presented URL and validates
   * back to the same object".
   */
  it('never touches the hash, so a real scene survives the round trip', () => {
    const hash = `#${encodeSceneHash(DEFAULT_EXAMPLE.scene)}`
    for (const search of ['', '?present=1', '?a=1']) {
      for (const on of [true, false]) {
        const url = presentUrl({ pathname: '/p/', search, hash }, on)
        // The hash is the tail of the URL, byte for byte.
        expect(url.endsWith(hash), `${search} → ${on}`).toBe(true)
        // ...and the flag is on the other side of the `#`.
        const [before, after] = url.split('#') as [string, string]
        expect(after.includes(PRESENT_PARAM)).toBe(false)
        const query = before.includes('?') ? before.slice(before.indexOf('?')) : ''
        expect(isPresenting(query), `${search} → ${on}`).toBe(on)
        // The decode a visitor's browser would do: JSON-identical, and the
        // validator still accepts it.
        expect(parseSceneHash(`#${after}`)).toEqual(DEFAULT_EXAMPLE.scene)
        expect(() => validateScene(parseSceneHash(`#${after}`))).not.toThrow()
      }
    }
  })

  it('and the fragment spelling it rejects really would break the scene', () => {
    // The positive control. Without this, "never touches the hash" is a claim
    // about a danger nobody has shown to exist.
    const body = encodeSceneHash(DEFAULT_EXAMPLE.scene)
    expect(() => parseSceneHash(`#${body}&present=1`)).toThrow(/not a base64url character/)
    expect(() => parseSceneHash(`#${body}?present=1`)).toThrow(/not a base64url character/)
  })
})
