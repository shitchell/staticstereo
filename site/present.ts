/**
 * Presentation mode's URL flag: `?present=1`.
 *
 * ## Why this is a query parameter and not part of the hash
 *
 * The hash is the save format and it is **strictly** `v1.<base64url of the
 * Scene JSON>`. `parseSceneHash` takes everything after the first `.` and
 * base64-decodes it, and `base64UrlToBytes` throws on the first character
 * outside the 64-character alphabet. So a flag appended to the fragment —
 * `#v1.eyJ…&present=1`, or `#v1.eyJ…?present=1` — does not degrade gracefully
 * into a scene plus an unknown trailer. It makes the link report itself as
 * truncated in copying, and it would do that to **every** link already in the
 * wild the moment a reader with the newer page opened an older one, because the
 * two halves would then disagree about where the payload ends.
 *
 * The alternative that keeps the fragment clean is a second hash segment plus a
 * `HASH_VERSION` bump, which `site/main.ts` already rejects for the full-width
 * toggle and for the same reason: bumping the version makes every existing link
 * say "this link was made by a different version of the page".
 *
 * So the flag lives in `location.search`, which `parseSceneHash` never sees and
 * which is designed for exactly this. `?present=1#v1.…` works: the browser
 * splits on the first `#`, the scene reaches the hash parser byte-for-byte, and
 * the flag reaches {@link isPresenting}.
 *
 * ## Why it is not in the scene either
 *
 * Same reasoning as the stage guide, the diagnostics band and the full-width
 * toggle: presentation mode changes no pixel. It is a property of the viewer's
 * screen, not of the picture, and `stst` and every exported GIF would otherwise
 * have to have an opinion about it.
 *
 * ## Shape of the flag
 *
 * `present=1` is the canonical spelling and the one {@link presentUrl} writes.
 * Reading is deliberately more permissive than writing — a bare `?present` and
 * `?present=` both mean on, because that is how a human types a flag — and
 * explicitly falsy spellings mean off, so that `?present=0` is a way to say
 * "no" rather than a confusing synonym for "yes".
 *
 * Everything here is pure string work over a location-shaped record, so it is
 * unit-tested rather than left to a browser. The browser-only part is what
 * `main.ts` does with the answer.
 *
 * The *mechanism* — the optional leading `?`, last-of-repeated-wins, the
 * case-and-space latitude, and the eight words a human types for a boolean —
 * is `site/query.ts`'s and is shared with `fit.ts` and `smooth.ts`. It used to
 * be written out here and again in each of them, which is how the
 * prototype-chain defect in those two came to be copied rather than caught.
 * Only the reading of the answer is this module's.
 */

import { booleanSpelling, lastParam, normaliseParam, searchParams } from './query.js'

export const PRESENT_PARAM = 'present'

/**
 * Is presentation mode asked for by this query string?
 *
 * `search` is `location.search`-shaped: either empty, or a leading `?` followed
 * by the parameters. A leading `?` is optional so that callers can pass a
 * stored fragment of a query without reassembling it.
 *
 * Repeated parameters resolve to the **last** one, matching how a reader would
 * read `?present=1&present=0` — the later assignment wins.
 *
 * `!== false` and not `=== true`, which is the permissive read spelled as a
 * comparison: only an **explicitly** falsy spelling means off. A bare
 * `?present`, an empty `?present=` and a value nobody can read all mean on,
 * because each of them is still a human asking for presentation mode, and
 * `?present=0` is the way to say no. This is the one place the three answers
 * {@link booleanSpelling} returns matter — `smooth.ts` reads its third answer
 * the other way, and that divergence is argued there.
 */
export function isPresenting(search: string): boolean {
  const value = lastParam(search, PRESENT_PARAM)
  if (value === undefined) return false
  return booleanSpelling(normaliseParam(value)) !== false
}

/**
 * `search` with the flag set, or with **every** copy of it removed.
 *
 * Every copy, not the last one: `URLSearchParams.delete` removes all entries
 * with the name, which is what "drop the param" has to mean — leaving
 * `?present=0&present=1` behind after an Escape would put the page straight
 * back into presentation mode on the next reload.
 *
 * Other parameters keep their **order** but not necessarily their exact
 * spelling: this round-trips through `URLSearchParams`, which re-serialises
 * everything it kept, so a bare `?debug` comes back as `?debug=` and a space
 * comes back as `+`. That is a real change and it is accepted rather than
 * hidden, on two grounds — the pairs are semantically identical to every query
 * parser, and the one string in this page that must survive byte-for-byte is the
 * scene, which is in the **hash** and is never touched here (see
 * {@link presentUrl}). Hand-splicing the parameter out of the raw string to
 * avoid the re-encoding was the alternative; it means reimplementing
 * `&`/`;`-separation and `+`-decoding, which is more surface for less
 * correctness.
 */
export function presentSearch(search: string, on: boolean): string {
  const params = searchParams(search)
  params.delete(PRESENT_PARAM)
  if (on) params.set(PRESENT_PARAM, '1')
  const body = params.toString()
  return body === '' ? '' : `?${body}`
}

/** The parts of `location` {@link presentUrl} needs. Keeps it DOM-free. */
export interface LocationParts {
  readonly pathname: string
  readonly search: string
  readonly hash: string
}

/**
 * A same-document URL for `history.replaceState`, with the flag set or dropped
 * and **the hash passed through untouched**.
 *
 * The hash being untouched is the whole safety property of this module, so it is
 * done by concatenation of the string the browser gave us rather than by
 * building a `URL` and reading `.hash` back: `new URL()` would re-encode the
 * fragment, and base64url's `-` and `_` are unreserved so that would be a no-op
 * *today* — but it would be a no-op by luck, and the scene is the one thing in
 * this page that must survive byte-for-byte.
 *
 * `replaceState` and not `pushState`, matching `syncHash`: entering and leaving
 * a view mode is not navigation, and filling the history stack with it would
 * make Back useless for the thing the visitor actually wants to go back to.
 */
export function presentUrl(location: LocationParts, on: boolean): string {
  return `${location.pathname}${presentSearch(location.search, on)}${location.hash}`
}
