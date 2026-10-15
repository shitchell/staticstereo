/**
 * The player's resampling hint: `?smooth=auto|on|off`.
 *
 * ## What it controls, and why it is a separate parameter from `fit`
 *
 * `fit` decides *how big* the plate is drawn; `smooth` decides *what the
 * browser does to the pixels on the way there* — CSS `image-rendering`. They
 * are separate because they are separately wrong: `fit=contain` at a 0.9×
 * downscale wants smoothing, and the same `fit=contain` at a 3× upscale wants
 * nearest-neighbour, and no single value of `fit` can say both. Design §8.1
 * gives the default policy its own sentence for the same reason.
 *
 * ## Why it is a query parameter and not part of the hash or the scene
 *
 * Identical to `present.ts` and `fit.ts`, and design §8.1 states it of this
 * parameter by name: "Both are **query parameters, not fragment tokens**, for
 * the same reason `present` is: the fragment *is* the scene." The hash is
 * strictly `v1.<base64url>` and `parseSceneHash` throws on the first byte
 * outside that alphabet. And resampling is a property of the screen the plate
 * lands on, not of the picture: `stst` and every exported GIF would otherwise
 * have to have an opinion about it.
 *
 * ## Why reading is permissive
 *
 * Same reason as `fit.ts`: a third party pastes an `<iframe src>` into a page
 * we will never see (R14). An unparseable value must cost the embedder their
 * preferred resampling, not the stereogram.
 *
 * Pure string work, so it is unit-tested rather than left to a browser.
 *
 * The *mechanism* is `site/query.ts`'s and is shared with `present.ts` and
 * `fit.ts`: the optional leading `?`, last-of-repeated-wins, the case-and-space
 * latitude, and the eight words a human types for a boolean. This module used
 * to hand-roll all four, which is how it inherited `fit.ts`'s prototype-chain
 * defect along with the idiom. What stays here is this parameter's
 * **vocabulary** — three modes, and which of them a boolean lands on.
 */

import { booleanSpelling, lastParam, normaliseParam } from './query.js'

/**
 * Errors unless its argument is `never` — the repo's exhaustiveness idiom, as
 * used in `src/core/types.ts` and `src/core/anim/track.ts`. Declared locally
 * for `site/scale.ts:180`'s recorded reason: it is three words long and sharing
 * it would couple two modules that have nothing else to say to each other.
 */
type AssertNever<T extends never> = T

/** The resampling hints the player understands. See {@link SMOOTH_MODES}. */
export type SmoothMode = 'auto' | 'on' | 'off'

export const SMOOTH_PARAM = 'smooth'

/**
 * `auto` per design §8.1: "smooth when downscaling (R20's accepted 'softening
 * and blurring'), `pixelated` when upscaling, where integer factors stay
 * exact."
 *
 * The default is the policy rather than either fixed answer because the right
 * answer genuinely reverses with the direction of the scale, and an embedder
 * who has not thought about it should get the one that is right for their
 * container rather than the one that is right for half of all containers.
 */
export const DEFAULT_SMOOTH: SmoothMode = 'auto'

/** What {@link SMOOTH_MODES} records about one mode. */
export interface SmoothModeInfo {
  /** The mode's own name, so an entry carries its key when passed around alone. */
  readonly mode: SmoothMode
  /** One line, human-facing: what this mode asks the browser to do. */
  readonly description: string
}

/**
 * The resampling hints, keyed by name.
 *
 * A record for the same reason `FIT_MODES` is one — design §11's registries
 * cost "one registration" to move, and that is only true of an object literal
 * keyed by name. These two parameters are read together and should not have
 * two different shapes.
 */
export const SMOOTH_MODES: Record<SmoothMode, SmoothModeInfo> = {
  auto: {
    mode: 'auto',
    description:
      'Smooth when the plate is drawn smaller than its backing store, pixelated when drawn larger.',
  },
  on: {
    mode: 'on',
    description: 'Always let the browser interpolate, at any scale in either direction.',
  },
  off: {
    mode: 'off',
    description: 'Never interpolate; nearest-neighbour at any scale, so integer factors stay exact.',
  },
}

/**
 * Which of this parameter's modes a boolean spelling lands on.
 *
 * **The decision, recorded.** `present.ts` already established that this page
 * reads a boolean parameter the way a human types one — `1`, `true`, `no`,
 * `off` — and the alternative here was to reject all of that and let
 * `?smooth=true` fall back to `auto`. It was rejected because `off` is
 * *already* a canonical value of this parameter, so the two vocabularies are
 * half-merged whether we like it or not: a page where `?smooth=off` means off
 * but `?smooth=false` means auto is not principled, it is an accident of which
 * three words were picked for the union. Finishing the merge costs one map and
 * removes the surprise.
 *
 * The *spellings* are no longer here: they are `query.ts`'s one
 * {@link booleanSpelling} table, shared with `present.ts`, which is where that
 * merge finally got finished. Two files recognising the same six words in two
 * different shapes — with `on` and `off` in one of them and not the other — was
 * half of what let the prototype-chain defect be copied into this file in the
 * first place. The **mapping** stays local, because `on` and `off` are this
 * parameter's words and `present`'s boolean has no such names.
 *
 * `auto` deliberately has no spelling. It is not a boolean state, so there is
 * no spelling a reader would expect to land on it — and that is why this is a
 * function of a `boolean` rather than a third entry in a table.
 */
function smoothForBoolean(flag: boolean): SmoothMode {
  return flag ? 'on' : 'off'
}

/**
 * The resampling hint this query string asks for.
 *
 * `search` is `location.search`-shaped: either empty, or a leading `?` followed
 * by the parameters. The leading `?` is optional, matching `isPresenting` and
 * `parseFit`, so a caller can pass a stored fragment of a query.
 *
 * Repeated parameters resolve to the **literal last** one, not the last
 * *recognised* one, for `parseFit`'s recorded reason: reaching back past an
 * unreadable later assignment makes the URL behave in a way no reader of it
 * could predict.
 *
 * A bare `?smooth` and an empty `?smooth=` both fall back to
 * {@link DEFAULT_SMOOTH}, which is **the one place this deliberately diverges
 * from `present.ts`**, where a bare flag means on. A boolean's two states make
 * a bare flag unambiguous — it can only mean "the non-default one". This
 * parameter is tri-state and its default is a real third answer, so a bare
 * spelling names the parameter without choosing among its values. There is
 * nothing for it to toggle *to*, and falling back is the only reading that
 * does not invent an intent the author did not express.
 *
 * `SMOOTH_MODES` is read with `Object.hasOwn` and not with `in`, because `in`
 * walks the prototype chain: `'constructor' in SMOOTH_MODES` is `true`, so
 * `?smooth=constructor` read as the `SmoothMode` `'constructor'`. There used to
 * be a second such lookup immediately below — a bare `ALIASES[key]`, which
 * answered with the `Object` **function** once the first was guarded, since
 * both registries were plain object literals and so shared a prototype.
 * `query.ts`'s table is a `Map`, which has no chain to walk, so that half of
 * the defect is now unavailable rather than guarded.
 *
 * Unlike `fit.ts`'s, this defect had no visible symptom: `imageRenderingFor`
 * falls through to the `auto` policy for any mode that is neither `on` nor
 * `off`, so a `Function` flowing through as a `SmoothMode` does not throw. The
 * parameter just quietly stopped being parsed.
 */
export function parseSmooth(search: string): SmoothMode {
  const value = lastParam(search, SMOOTH_PARAM)
  if (value === undefined) return DEFAULT_SMOOTH
  const key = normaliseParam(value)
  if (Object.hasOwn(SMOOTH_MODES, key)) return key as SmoothMode
  const flag = booleanSpelling(key)
  return flag === undefined ? DEFAULT_SMOOTH : smoothForBoolean(flag)
}

/**
 * Is this ratio a genuine downscale — the one case where interpolation helps?
 *
 * A function and not an inlined `< 1` per invariant 6: this is the threshold
 * the whole `auto` policy turns on, and if trials ever show that, say, a 0.98×
 * downscale is better served by nearest-neighbour than by a blur, this is the
 * single body to change.
 *
 * Strictly between 0 and 1, which makes it false for `NaN` by construction
 * (every comparison with `NaN` is false) and false for zero and negatives,
 * which are not downscales at all — they are a container with no size or an
 * arithmetic error upstream. None of those is a reason to start blending.
 */
function isDownscale(devicePerBackingPx: number): boolean {
  return devicePerBackingPx > 0 && devicePerBackingPx < 1
}

/**
 * The CSS `image-rendering` value for a mode at a given resampling ratio.
 *
 * `devicePerBackingPx` is **device px drawn ÷ backing-store px** — `Fit.scale`,
 * named in both of the two pixel spaces it spans because getting it wrong here
 * is invisible. The backing store is the plate at `noiseScale` (default 2).
 * Below 1 the browser is throwing information away; above 1 it is inventing it.
 *
 * ## Not the CSS-px ratio. This was argued the other way and was wrong.
 *
 * This parameter was `displayScale` — **CSS px shown ÷ backing-store px**, the
 * same quantity divided by `dpr` — and the argument for it, written out at
 * `site/scale.ts`'s `RescalePlan` and repeated in two further places, was that
 * handing this function `Fit.scale` "would call a 1x plate on a dpr-2 panel an
 * upscale and pixelate a picture that is in fact being halved". The picture is
 * not being halved. At `displayScale` 1 on a dpr-2 panel each backing pixel
 * covers a **2×2 block of device pixels**: it is being doubled, and
 * `pixelated` is exactly right for it.
 *
 * The browser does not resample into CSS px. CSS px are a layout unit; the
 * resampling step `image-rendering` hints at is backing store → **device
 * grid**, so the ratio that decides it is the device one and nothing else. The
 * consequence of the old reading was that at dpr 2 every CSS ratio in (0.5, 1)
 * — which includes every 1× snap plan and every re-render, the two modes whose
 * entire purpose is pixel-exactness — was a genuine device upscale being
 * blended, which is the one outcome the "Up, pixelated" rule below exists to
 * prevent. It is a no-op at dpr 1, so the whole suite passed over it.
 *
 * Recorded rather than quietly corrected because the direction of this ratio is
 * a question somebody has now got wrong once in writing. A reader who finds
 * only the rule has no reason to check it; a reader who finds the rule and the
 * refuted alternative has.
 *
 * The policy is design §8.1's: "smooth when downscaling (R20's accepted
 * 'softening and blurring'), `pixelated` when upscaling, where integer factors
 * stay exact." Both halves are load-bearing and neither is a preference:
 *
 * - **Down, smooth.** Nearest-neighbour on the way down *drops whole columns*,
 *   and a dropped column is removed independently of its stereo partner, which
 *   breaks correspondence outright. R20 accepts "softening and blurring and
 *   pixels compressing into each other" and does not accept that.
 * - **Up, pixelated.** Interpolating upward blends adjacent *random* dots, and
 *   at an integer factor nearest-neighbour is exactly lossless — every original
 *   pixel becomes an n×n block and the correspondence survives intact.
 *
 * At exactly `1` the choice is observable, so it is argued rather than left to
 * fall out of a comparison: at a true 1:1 neither value resamples and the two
 * are identical, but a *nominal* 1:1 is not a true one — the plate's
 * device-pixel origin is fractional whenever the layout lands it off a whole
 * pixel, and `auto` in that state blends adjacent columns of random dots, which
 * is precisely what `site/scale.ts` exists to prevent. `pixelated` is right at
 * 1:1 and still right when the ratio drifts off it, so it is the fail-safe
 * branch, and it agrees with the "integer factors stay exact" rule that governs
 * the whole upper half.
 *
 * Total by construction: the mode chain ends in `auto`'s policy rather than in
 * a lookup, and `isDownscale` is false for every non-finite and non-positive
 * input. A CSS property set to `undefined` is a silent no-op, so a hole here
 * would not throw — it would quietly stop pixelating, which is the kind of bug
 * that is only ever found by eye.
 *
 * ## Why the `default:` arm returns instead of throwing
 *
 * Total by construction was the whole guard until an extra `SmoothMode` member
 * was planted and measured: `npm run typecheck` reported **0 errors** and the suite
 * reddened exactly one test, `SMOOTH_MODES`' membership pin. Nothing noticed
 * that the new mode had no policy — it silently inherited `auto`'s — and the
 * test named *"is total: every mode and every scale yields one of the two legal
 * values"* **passed, and could not have failed**: this function's declared
 * return type is `'auto' | 'pixelated'` and the chain was total by
 * fall-through, so the assertion cannot distinguish "has a policy" from "fell
 * through". The sequence for whoever adds a mode was therefore: one pin goes
 * red, they update it to go green, and they ship a mode that does nothing, with
 * a green suite and a test whose name claims totality.
 *
 * So the fall-through is now a `default:` arm carrying an {@link AssertNever},
 * which makes any member added to {@link SmoothMode} a **compile error here**,
 * naming the exact place the new mode's policy is missing. Not an ordinal:
 * the count of modes is `Object.keys(SMOOTH_MODES).length` and nothing here
 * writes it down.
 *
 * **It returns `auto`'s policy rather than throwing, and the asymmetry with
 * `planFit` is the ruling, not a preference.** `site/scale.ts`'s guard throws
 * because a wrong layout is invisible and ruins the artifact: a `FitPlan` that
 * read as "no scale" would paint nothing. A wrong resampling hint costs a
 * slightly soft frame, and throwing here would lose the whole frame over a
 * hint. Guard everything at compile time; reserve the runtime throw for the
 * registries where a wrong answer destroys output.
 *
 * The runtime behaviour is therefore unchanged in every case, including the one
 * the `Object.hasOwn` note above describes — a value lying to the compiler
 * still lands on `auto`'s policy, exactly as it did when this was an `if`
 * chain.
 *
 * ## Where this guard fails, and whether `npm test` can see it
 *
 * §F-6 pairs a compile-time `AssertNever` with a runtime witness, because an
 * `AssertNever` is enforced by `npm run typecheck` alone. **This guard has no
 * runtime witness and cannot have one**: it is ruled to leave behaviour
 * identical to its own absence, so there is nothing for a runtime assertion to
 * distinguish. That is not the hole §F-6 is about, and the reason is measured
 * rather than argued.
 *
 * It fails in `svelte-check` and in nothing else that the scripts run:
 * `npm run build` is `tsc -p tsconfig.json`, whose `include` is `["src"]`, so
 * it never opens this file; `npm run build:site` is vite, which transpiles
 * without checking. Planted and measured: both exit **0** with the error
 * present.
 *
 * `npm test` **does** see it, through three harnesses that spawn the project's
 * own gate — `site/typecheck-gate.test.ts`, `site/fitregistration.test.ts` and
 * `site/bindingregistration.test.ts`. Measured with the member planted and this
 * guard in place: **8 tests red across 4 files**, where without the guard it
 * was one. They go red because each asserts the type-check surface is clean,
 * so they name the error rather than this registry — which is coverage, not a
 * witness, and is why that distinction is written down here.
 */
export function imageRenderingFor(
  mode: SmoothMode,
  devicePerBackingPx: number,
): 'auto' | 'pixelated' {
  switch (mode) {
    case 'on':
      return 'auto'
    case 'off':
      return 'pixelated'
    case 'auto':
      break
    default: {
      // `mode` is `never` here, and stops being `never` the moment a member is
      // added to `SmoothMode` without a case above. Falls out to `auto`'s
      // policy rather than throwing — see the docblock.
      //
      // Nothing reads `unhandled`, and nothing needs to: the annotation is the
      // assertion. It is not `void`-ed because `noUnusedLocals` is not set in
      // either tsconfig, and `scale.ts`'s guard — which does read its local,
      // into a throw this one deliberately does not have — is the precedent
      // for the shape rather than for the read.
      const unhandled: AssertNever<typeof mode> = mode
      break
    }
  }
  return isDownscale(devicePerBackingPx) ? 'auto' : 'pixelated'
}
