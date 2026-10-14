/**
 * The one way this page reads a query parameter.
 *
 * ## Why this module exists
 *
 * `present.ts`, `fit.ts` and `smooth.ts` each independently implemented the
 * same four decisions: the leading `?` is optional, a repeat resolves to the
 * last assignment, a value is trimmed and lowercased before it is recognised,
 * and a boolean may be spelled any of about eight ways. Three copies of one
 * policy, written in the order the parameters were added.
 *
 * **Three of those four were decisions.** The optional leading `?` was not: the
 * `URLSearchParams` string constructor strips one itself, so all three copies of
 * `startsWith('?') ? slice(1) : …` were no-ops, and so was the copy this module
 * inherited from them. It is argued at {@link searchParams}, which is where the
 * false rationale for keeping it was recorded. What is shared here is the three
 * that are real.
 *
 * **It was not a tidiness problem.** The prototype-chain defect fixed in the
 * commit before this module was created — `'constructor' in FIT_MODES` is
 * `true`, so `?fit=constructor` parsed as a `FitMode` and the player laid out
 * nothing — existed in *two* of the three files, because the registry lookup
 * was copied along with everything around it. That is this repo's signature
 * recorded defect wearing a different costume: the animatable-channel list is
 * written in three files and guarded in one, and both site validators silently
 * drop channels as a result.
 *
 * So the mechanism is here and there is exactly one of it, and
 * `site/query.test.ts` asserts that by sweeping every non-test module in
 * `site/` for each spelling of the policy. A later parameter that hand-rolls
 * its own reader fails that sweep rather than quietly becoming the fourth copy.
 *
 * ## What is deliberately NOT here
 *
 * **Each parameter's vocabulary.** `fit` knows about `contain`/`snap`/`render`
 * and about `cover` being refused; `smooth` knows that its boolean maps onto
 * `on`/`off` and that `auto` has no spelling; `present` knows that a bare flag
 * means on. None of that is shared, because none of it is the same decision
 * twice — and a module that collected every parameter's words would be a file
 * every parameter has to be edited through. Only the mechanism is shared, and
 * the one table that genuinely *was* the same decision twice: the words a human
 * types for true and false.
 *
 * **Writing.** `presentSearch` is the only function that edits a query string,
 * and its re-serialisation behaviour is argued at its own declaration. It takes
 * {@link searchParams} and does the rest itself.
 *
 * Pure string work over `location.search`-shaped values, so it is unit-tested
 * rather than left to a browser.
 */

/**
 * `location.search`, parsed, with the leading `?` optional.
 *
 * Optional because a caller may hold a stored fragment of a query without
 * having reassembled it, or a `search` something upstream has already stripped,
 * and because `''` and `'?'` are both things a browser really puts in
 * `location.search` — the first on a URL with no query, the second when the
 * last parameter was removed.
 *
 * ## There is no strip here, and the reason there used to be one was false
 *
 * This body was `new URLSearchParams(search.startsWith('?') ? search.slice(1) :
 * search)`, and the docblock justified the slice with: *"`URLSearchParams`
 * treats a leading `?` as part of the first parameter's **name**, so without the
 * strip `?present=1` would be a parameter called `?present`."*
 *
 * It does not. The WHATWG string constructor removes one leading `?` itself —
 * "if init is a string and starts with U+003F (?), remove the first code point
 * from init" — so `new URLSearchParams('?present=1')` has the single key
 * `present`, and `new URLSearchParams('?a=?').get('a')` is `'?'` without any
 * help from us. The slice changed the answer for exactly one input, `'??a=1'`,
 * which no `location.search` can produce; every behaviour test of this function
 * stayed green when it was deleted, and the only thing that went red was the
 * source-text sweep in `site/query.test.ts` asserting that *somebody* wrote
 * `startsWith('?')`.
 *
 * So the line is gone rather than re-justified: it was a no-op defended by a
 * claim about a platform API that a reader would have trusted and copied, and
 * the only test that could have pinned it would have had to pin `'??a=1'` — an
 * input no caller can hand us, which is not a guarantee worth asserting.
 *
 * The tolerance itself is unchanged and still contractual: callers pass a
 * `search` with or without its `?` and this module answers the same way. That
 * is pinned below; it is now upheld by `URLSearchParams` rather than by us,
 * which is a fact about where the behaviour lives and not about whether it
 * holds.
 */
export function searchParams(search: string): URLSearchParams {
  return new URLSearchParams(search)
}

/**
 * The last value given for `name`, or `undefined` if it was never given.
 *
 * **The last and not the first**, so that every reader of every parameter on
 * this page agrees about which spelling in a repeated parameter is the
 * operative one, and agrees with how a human reads `?fit=snap&fit=render` — the
 * later assignment wins. The three parsers that used to implement this
 * separately all happened to agree; that they *had* to was not asserted
 * anywhere.
 *
 * The **literal** last, which is a stronger rule than it looks and is argued at
 * `parseFit`: `?fit=snap&fit=typo` is the default, not `snap`. Reaching back
 * past an unreadable later assignment to find a recognised earlier one would
 * make the URL behave in a way no reader of it could predict, and that choice
 * is the caller's to implement — which it can only do if it is handed the
 * literal last value rather than a pre-filtered one.
 *
 * A bare `?fit` and an empty `?fit=` both come back as `''`, which is
 * deliberately **not** `undefined`: "the author named this parameter and chose
 * nothing" and "the author never mentioned it" get different answers from
 * different parameters — `present` reads a bare flag as on, `smooth` reads it
 * as its default — and collapsing them here would take that choice away.
 */
export function lastParam(search: string, name: string): string | undefined {
  const all = searchParams(search).getAll(name)
  return all[all.length - 1]
}

/**
 * Trim and lowercase, so `?fit=%20Render%20` and `?smooth=ON` work.
 *
 * Permissiveness about case and surrounding space costs nothing and buys the
 * hand-typed and hand-edited embed URLs these parameters exist for: R14's whole
 * premise is that a third party pastes an `<iframe src>` into a page we will
 * never see, and the first thing a human does to such a URL is retype part of
 * it.
 *
 * Applied by the caller rather than folded into {@link lastParam}, because a
 * parameter whose values are case-sensitive data rather than a fixed vocabulary
 * would be destroyed by it. Every parameter this page has today wants it; that
 * is not a reason to make it unavoidable.
 */
export function normaliseParam(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * The words a human types for true and false, and which one each means.
 *
 * **The decision, recorded** — it was `smooth.ts`'s and it still applies.
 * `present.ts` established that this page reads a boolean parameter the way a
 * human types one, with `FALSY = ['0','false','no','off']`. `smooth.ts` then
 * needed the same vocabulary and wrote its own, `{1,true,yes → on;
 * 0,false,no → off}`. The alternative there was to recognise none of it and let
 * `?smooth=true` fall back to `auto`; it was rejected because `off` is
 * *already* a canonical value of that parameter, so the two vocabularies are
 * half-merged whether we like it or not — a page where `?smooth=off` means off
 * but `?smooth=false` means auto is not principled, it is an accident of which
 * three words were picked for the union.
 *
 * What was left standing was the same six words in two shapes in two files,
 * with `on` and `off` present in one and not the other. The union is here, once.
 *
 * **A `Map` and not a record.** The defect this module was extracted in
 * response to was a lookup that walked `Object.prototype`, and a record is the
 * shape that makes that mistake available — `ALIASES['constructor']` answered
 * with the `Object` function. A `Map` has no prototype chain to walk, so this
 * table cannot acquire that defect however it is read. The two registries that
 * must stay records for design §11's sake (`FIT_MODES`, `SMOOTH_MODES`) are
 * guarded with `Object.hasOwn` instead; this one does not have to be.
 */
export const BOOLEAN_SPELLINGS: ReadonlyMap<string, boolean> = new Map([
  ['1', true],
  ['true', true],
  ['yes', true],
  ['on', true],
  ['0', false],
  ['false', false],
  ['no', false],
  ['off', false],
])

/**
 * What this spelling means as a boolean, or `undefined` if it is not one.
 *
 * **Three answers and not two**, because a caller has to be able to tell "the
 * author said no" from "the author said something I cannot read". Those get
 * different treatment and the difference is argued in both callers: a value
 * `isPresenting` cannot read means on, because a bare or mistyped flag is still
 * someone asking for presentation mode, while a value `parseSmooth` cannot read
 * falls back to `auto`, because `smooth` is tri-state and its default is a real
 * third answer rather than the other half of a toggle.
 *
 * Expects an already-{@link normaliseParam}d spelling, and does not normalise
 * on its caller's behalf. Normalising here would let a caller skip
 * `normaliseParam` for the boolean path and not for its own vocabulary, which
 * is how `?smooth=TRUE` and `?smooth=AUTO` would come to disagree about case.
 */
export function booleanSpelling(value: string): boolean | undefined {
  return BOOLEAN_SPELLINGS.get(value)
}
