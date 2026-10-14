/**
 * The player's fit parameter: `?fit=contain|snap|render`.
 *
 * ## Why this is a query parameter and not part of the hash
 *
 * Identical reasoning to `present.ts`, and it is not a stylistic echo — it is
 * the same hard constraint. The hash is the save format and it is **strictly**
 * `v1.<base64url of the Scene JSON>`; `parseSceneHash` takes everything after
 * the first `.` and base64-decodes it, and `base64UrlToBytes` throws on the
 * first character outside the 64-character alphabet. A fit token appended to
 * the fragment would not degrade into "a scene plus an unknown trailer"; it
 * would make every link already in the wild report itself as truncated the
 * moment a newer page read an older one. Design §8.1 states the rule for both
 * of this module's parameters: "Both are **query parameters, not fragment
 * tokens**, for the same reason `present` is: the fragment *is* the scene."
 *
 * ## Why it is not in the scene either
 *
 * Fit changes no pixel of the authored artifact. It is a property of the
 * container the plate is being shown in — a viewport, an `<iframe>`, a
 * fullscreen element — not of the picture, and `stst` and every exported GIF
 * would otherwise have to have an opinion about it.
 *
 * ## Why reading is permissive
 *
 * Same recorded reason as `present.ts`: "Reading is deliberately more
 * permissive than writing." Here it is stronger than a convenience. The whole
 * point of R14 is that a third party pastes an `<iframe src>` into a page we
 * will never see. An unparseable value must therefore fall back to
 * {@link DEFAULT_FIT} rather than throw: a typo in an embed URL should cost the
 * embedder their preferred fit mode, not the stereogram.
 *
 * Everything here is pure string work, so it is unit-tested rather than left to
 * a browser. The browser-only part is what the player does with the answer.
 */

/** The fit modes the player implements. See {@link FIT_MODES}. */
export type FitMode = 'contain' | 'snap' | 'render'

export const FIT_PARAM = 'fit'

/**
 * `contain` per R14, as clarified by Shaun — "oh! my bad, yeah, i don't want
 * cover, i want contain :p" — and per R20, which orders the two goods: fidelity
 * to the authored artifact outranks fidelity to the fused percept, so an embed
 * too small for the plate letterboxes and resamples rather than refusing.
 */
export const DEFAULT_FIT: FitMode = 'contain'

/** What {@link FIT_MODES} records about one mode. */
export interface FitModeInfo {
  /** The mode's own name, so an entry carries its key when passed around alone. */
  readonly mode: FitMode
  /** One line, human-facing: what this mode does to the plate. */
  readonly description: string
}

/**
 * The implemented fit modes, keyed by name.
 *
 * A record and not a bare union or an array because design §11 budgets fit
 * modes at "one registration" to move, and the registry P3 retrofits wants
 * exactly one object literal keyed by name to wrap. The `mode` field duplicates
 * the key deliberately: a registry hands out values, and a value that does not
 * know its own name forces every caller to carry the pair.
 */
export const FIT_MODES: Record<FitMode, FitModeInfo> = {
  contain: {
    mode: 'contain',
    description:
      'Aspect preserved, scaled to fit entirely, letterboxed; browser resampling accepted per R20.',
  },
  snap: {
    mode: 'snap',
    description:
      'Largest whole-number scale that fits, letterboxing the remainder; never resampled.',
  },
  render: {
    mode: 'render',
    description:
      "Re-rendered at the container's exact size with scene geometry scaled; pixel-exact, stroke widths scale.",
  },
}

/**
 * Which query string, if any, asks for a given mode.
 *
 * `search` is `location.search`-shaped: either empty, or a leading `?` followed
 * by the parameters. The leading `?` is optional so that callers can pass a
 * stored fragment of a query without reassembling it, matching `isPresenting`.
 *
 * Repeated parameters resolve to the **literal last** one — not the last
 * *recognised* one. `?fit=snap&fit=typo` is therefore the default, not `snap`:
 * reaching back past an unreadable later assignment would make the URL behave
 * in a way no reader of it could predict, and the fallback is already harmless.
 */
export function parseFit(search: string): FitMode {
  const value = lastValue(search, FIT_PARAM)
  if (value === undefined) return DEFAULT_FIT
  const key = normalise(value)
  return key in FIT_MODES ? (key as FitMode) : DEFAULT_FIT
}

/**
 * The last value given for `name`, or `undefined` if it was never given.
 *
 * Factored out rather than inlined so that every reader of this parameter
 * agrees about which spelling in a repeated parameter is the operative one.
 */
function lastValue(search: string, name: string): string | undefined {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const all = params.getAll(name)
  return all[all.length - 1]
}

/**
 * Trim and lowercase, so `?fit=%20Render%20` and `?fit=SNAP` work.
 *
 * Permissiveness about case and space costs nothing and buys the hand-typed and
 * hand-edited embed URLs this parameter exists for; it is the same latitude
 * `isPresenting` gives its falsy spellings.
 */
function normalise(value: string): string {
  return value.trim().toLowerCase()
}
