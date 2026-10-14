/**
 * Layer id generation, shared by every writer of a scene.
 *
 * It lives in `src/shared/` rather than next to either validator because
 * there are two of those — `src/cli/scene.ts` and `site/scene.ts` — and this
 * project has already paid for list-shaped knowledge kept in two places (the
 * channel list drifted a release behind in both of them). An id minted one
 * way in the CLI and another way in the browser would be worse than drift: it
 * is the same scene, round-tripping through a URL, carrying two different
 * notions of what identifies a layer.
 *
 * **Nothing calls this yet.** Neither validator may: an id assigned at load
 * time would make opening an untouched legacy scene and saving it back a
 * diff. The caller is the editor's mutation path, which has an actual edit to
 * attach the id to (design §4.1, "assigned on first mutation, not on load").
 */

/**
 * base64url, the URL-safe alphabet — because a layer id ends up in a URL hash,
 * in a YAML scalar and potentially in a DOM id or CSS selector, and this is
 * the widest alphabet that needs no escaping in any of the three. `+` and `/`
 * from plain base64 would need escaping in the first and the last.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/**
 * Characters per id. 10 base64url characters is 60 bits.
 *
 * The rationale is the birthday bound, and the population is not one scene's
 * layers: ids outlive deletion, because an undo entry still names the layer it
 * removed, so the count that matters is every layer ever minted in a session.
 * Taking a deliberately extravagant 10 000 of those, the chance that any two
 * collide is about n²/2^61 ≈ 4e-11 — small enough that it will not happen, and
 * small enough that the 10 000-draw test cannot flake on it.
 *
 * Shorter was tempting and is wrong by less margin than it looks: 6 characters
 * is 36 bits, where the same 10 000 ids collide with probability ~7e-4. That
 * is rare enough to survive every test and still bite somebody eventually,
 * which is the worst available outcome. Longer buys nothing — these are read
 * by people scanning a panel and a diff, and 10 characters already fits.
 */
const LENGTH = 10

/**
 * A fresh layer id: {@link LENGTH} base64url characters, cryptographically
 * random.
 *
 * `crypto.getRandomValues` rather than `Math.random` not for secrecy but for
 * independence — `Math.random`'s state is per-realm and some engines seed it
 * poorly, and two tabs opened from the same link minting the same first id
 * would be a silent merge hazard the moment the two scenes meet. It is a
 * global in browsers and in Node >= 18, which is the whole point of the Web
 * Crypto spelling here: `node:crypto` would not survive the site bundle.
 *
 * `& 63` is uniform rather than modulo-biased because 256 is a multiple of 64,
 * so every alphabet index is reachable from exactly four byte values.
 */
export function newLayerId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LENGTH))
  let id = ''
  for (const b of bytes) id += ALPHABET[b & 63]
  return id
}
