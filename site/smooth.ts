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
 */

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
 * Spellings that are not canonical but are unambiguous, and what they mean.
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
 * `auto` deliberately has no alias. It is not a boolean state, so there is no
 * spelling a reader would expect to land on it.
 */
const ALIASES: Readonly<Record<string, SmoothMode>> = {
  '1': 'on',
  true: 'on',
  yes: 'on',
  '0': 'off',
  false: 'off',
  no: 'off',
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
 */
export function parseSmooth(search: string): SmoothMode {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const all = params.getAll(SMOOTH_PARAM)
  const value = all[all.length - 1]
  if (value === undefined) return DEFAULT_SMOOTH
  const key = value.trim().toLowerCase()
  if (key in SMOOTH_MODES) return key as SmoothMode
  return ALIASES[key] ?? DEFAULT_SMOOTH
}
