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
 *
 * `cover` is absent on purpose and its absence is itself recorded — see
 * {@link REJECTED_FIT_MODES}.
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
 *
 * `Object.hasOwn` and **not** `key in FIT_MODES`: `in` walks the prototype
 * chain, so `'constructor' in FIT_MODES` is `true` and this function returned
 * `'constructor'` as a `FitMode`. `planFit`'s exhaustive switch then threw on
 * it and the player laid out nothing — the one outcome the permissive read
 * above exists to rule out. The value is attacker-chosen in the only sense
 * that matters here: it comes from a URL nobody in this repo wrote.
 */
export function parseFit(search: string): FitMode {
  const value = lastValue(search, FIT_PARAM)
  if (value === undefined) return DEFAULT_FIT
  const key = normalise(value)
  return Object.hasOwn(FIT_MODES, key) ? (key as FitMode) : DEFAULT_FIT
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

/** What {@link REJECTED_FIT_MODES} records about a mode we will not implement. */
export interface RejectedFitMode {
  /** The spelling a caller might ask for. Mirrors the key, as {@link FitModeInfo} does. */
  readonly mode: string
  /** Why it is not offered, in prose a human can be shown. */
  readonly reason: string
}

/**
 * Fit modes that are asked for, understood, and deliberately not offered.
 *
 * This exists because the reason has to live somewhere a person will actually
 * look. `cover` is the obvious thing to try — R14 was *originally written* as
 * `cover`, and `background-size: cover` is the phrase the behaviour was first
 * described with — so the parser will be handed it, and the honest answer is
 * not "unknown value" but "we know that one, and here is why not".
 *
 * The reason itself, from R14 and design §8.1: `cover` crops the overflow, and
 * cropping horizontally eats the **margins** — which are the fusion partners
 * for the stage's own edge columns. A `cover` crop therefore destroys edge
 * fusion *by construction*, which is a different kind of failure from
 * `contain`'s accepted softening. R20 accepts blurring because it degrades the
 * whole image gracefully and leaves every column present; a crop silently
 * removes the data the edges need in order to fuse at all, so it is not a
 * harsher point on the same scale — it is off the scale.
 *
 * Keyed by `string` rather than by a union: the point of the record is to
 * answer for spellings that are *not* `FitMode`s.
 */
export const REJECTED_FIT_MODES: Record<string, RejectedFitMode> = {
  cover: {
    mode: 'cover',
    reason:
      'cover crops the overflow, and cropping horizontally eats the margins — which are the ' +
      "fusion partners for the stage's edge columns — so a cover crop destroys edge fusion by " +
      'construction. R14 was clarified from cover to contain on exactly this point; contain ' +
      'letterboxes and accepts resampling (R20) instead, which blurs every column but drops none.',
  },
}

/** What {@link fitNotice} hands back when a query asked for a rejected mode. */
export interface FitNotice {
  /** The normalised spelling the query asked for. */
  readonly requested: string
  /** Why it is not offered — {@link RejectedFitMode.reason}, verbatim. */
  readonly reason: string
  /** What {@link parseFit} returned instead. */
  readonly fallback: FitMode
}

/**
 * The notice a caller should show or log for this query string, if any.
 *
 * Separate from {@link parseFit} rather than folded into its return type
 * because the player must not be made to care: `parseFit` stays a total
 * function to a `FitMode`, and the explanation is an optional second question
 * asked by whoever has somewhere to put the answer.
 *
 * Returns `undefined` for an absent, valid or merely-unknown value. An unknown
 * spelling has no recorded reason to give, and inventing one ("`fil` is not a
 * fit mode") is a generic message any caller can write for itself; this export
 * exists to carry the arguments we actually made.
 *
 * It reads the repeated parameter through the same {@link lastValue} as
 * `parseFit`, so the two cannot disagree about which spelling is operative —
 * a page that letterboxed for one reason while explaining a different one
 * would be worse than silence.
 *
 * The `Object.hasOwn` guard is load-bearing and was the **worse** half of the
 * same prototype-chain defect `parseFit` had. A bare `REJECTED_FIT_MODES[key]`
 * answers `Object` itself for `?fit=constructor`, and `Object` is not
 * `undefined`, so the guard below passed and this function returned a notice
 * that was structurally valid and semantically empty: `requested` and `reason`
 * both `undefined`, which the player interpolates into a message reading
 * `“undefined”: undefined`. A wrong enum is at least visible; a notice that
 * explains nothing in well-formed prose is not.
 */
export function fitNotice(search: string): FitNotice | undefined {
  const value = lastValue(search, FIT_PARAM)
  if (value === undefined) return undefined
  const key = normalise(value)
  if (!Object.hasOwn(REJECTED_FIT_MODES, key)) return undefined
  const rejected = REJECTED_FIT_MODES[key]
  if (rejected === undefined) return undefined
  return { requested: rejected.mode, reason: rejected.reason, fallback: parseFit(search) }
}
