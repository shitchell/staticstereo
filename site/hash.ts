import type { Scene } from '../src/core/types.js'

/**
 * Scene ⇄ `location.hash`.
 *
 * The whole shareability story rests on this file: there is no backend, so the
 * URL *is* the save format. Two consequences shape it.
 *
 * **It must be byte-exact over arbitrary text.** A text layer is the most
 * likely place for a non-ASCII character, and the obvious one-liner —
 * `btoa(JSON.stringify(scene))` — throws `InvalidCharacterError` on the first
 * accented letter, because `btoa` takes a latin1 string and a JavaScript string
 * is UTF-16. So the payload is UTF-8 encoded to bytes first, and base64 is
 * applied to bytes. `hash.test.ts` pins an astral-plane character (an emoji,
 * i.e. a surrogate pair) specifically because that is the case a
 * `String.fromCharCode` round-trip mangles silently rather than loudly.
 *
 * **It must survive a copy-paste.** Standard base64's `+`, `/` and `=` are all
 * legal in a URL fragment but `+` becomes a space the instant anything parses
 * the fragment as a query string, which link-shortening and chat clients do. So
 * the alphabet is base64url and the padding is dropped, leaving only unreserved
 * characters.
 *
 * The version prefix is cheap insurance: the day the scene schema changes, an
 * old link should say so rather than decode into a shape the validator rejects
 * with a confusing field-level message.
 */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** Reverse lookup, built once. `-1` means "not a base64url character". */
const B64_INDEX = ((): Int8Array => {
  const t = new Int8Array(128).fill(-1)
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i
  return t
})()

export const HASH_VERSION = 'v1'

/**
 * Bytes → base64url, unpadded.
 *
 * Hand-rolled rather than `btoa`: going through a latin1 string to reach a
 * built-in that then needs three character substitutions and a padding strip is
 * more surface, not less, and `btoa` is absent from some non-browser runtimes
 * this module is unit-tested in.
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    out += B64[(n >>> 18) & 63]! + B64[(n >>> 12) & 63]! + B64[(n >>> 6) & 63]! + B64[n & 63]!
  }
  const left = bytes.length - i
  if (left === 1) {
    const n = bytes[i]! << 16
    out += B64[(n >>> 18) & 63]! + B64[(n >>> 12) & 63]!
  } else if (left === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8)
    out += B64[(n >>> 18) & 63]! + B64[(n >>> 12) & 63]! + B64[(n >>> 6) & 63]!
  }
  return out
}

/** base64url → bytes. Throws on any character outside the alphabet. */
export function base64UrlToBytes(text: string): Uint8Array {
  const n = text.length
  // 4 chars → 3 bytes; a trailing group of 2 or 3 chars → 1 or 2 bytes.
  const whole = n >>> 2
  const tail = n & 3
  if (tail === 1) {
    throw new Error(`base64UrlToBytes: length ${n} is not a valid base64 length`)
  }
  const out = new Uint8Array(whole * 3 + (tail === 0 ? 0 : tail - 1))

  let o = 0
  let acc = 0
  let bits = 0
  for (let i = 0; i < n; i++) {
    const code = text.charCodeAt(i)
    const v = code < 128 ? B64_INDEX[code]! : -1
    if (v < 0) {
      throw new Error(
        `base64UrlToBytes: ${JSON.stringify(text[i])} at index ${i} is not a ` +
        `base64url character`,
      )
    }
    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (acc >>> bits) & 0xff
    }
  }
  return out
}

/** The hash body for `scene`, without the leading `#`. */
export function encodeSceneHash(scene: Scene): string {
  const json = JSON.stringify(scene)
  return `${HASH_VERSION}.${bytesToBase64Url(new TextEncoder().encode(json))}`
}

/**
 * Decode a hash back into whatever JSON value it carries.
 *
 * Deliberately returns `unknown`: this is untrusted input and the only thing
 * this function knows is that it was valid JSON. `validateScene` is what turns
 * it into a `Scene`, and keeping the two apart is what stops a decode error and
 * a schema error from sharing one message.
 *
 * Returns `undefined` for an absent hash — a first visit, which is not an
 * error.
 */
export function parseSceneHash(hash: string): unknown {
  const body = hash.replace(/^#/, '').trim()
  if (body === '') return undefined

  const dot = body.indexOf('.')
  if (dot < 0) {
    throw new Error(
      `this link's scene data has no version prefix (expected ` +
      `"${HASH_VERSION}.<data>"), so it cannot be read safely`,
    )
  }
  const version = body.slice(0, dot)
  if (version !== HASH_VERSION) {
    throw new Error(
      `this link was made by a different version of the page (its scene data ` +
      `says "${version}", this page reads "${HASH_VERSION}")`,
    )
  }

  let json: string
  try {
    json = new TextDecoder().decode(base64UrlToBytes(body.slice(dot + 1)))
  } catch (err) {
    throw new Error(
      `this link's scene data could not be decoded — it was probably truncated ` +
      `in copying: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    )
  }

  try {
    return JSON.parse(json) as unknown
  } catch (err) {
    throw new Error(
      `this link's scene data decoded but is not valid JSON: ` +
      `${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    )
  }
}
