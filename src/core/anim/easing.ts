import { cubicBezier } from './bezier.js'
import type { Easing, NamedEasing } from '../types.js'

/**
 * The shipped curves, as functions.
 *
 * Still keyed by `NamedEasing` and not by `Easing` now that the latter also
 * admits `cubic-bezier(...)`: these five are an exhaustive, enumerable set
 * and a record over them is what makes "every named curve has an
 * implementation" a compile error to break. A record over the widened type
 * would be a promise to implement infinitely many curves, and the error
 * messages built from `Object.keys(EASINGS)` would stop describing a list.
 */
export const EASINGS: Record<NamedEasing, (t: number) => number> = {
  linear: t => t,
  easeIn: t => t * t,
  easeOut: t => 1 - (1 - t) * (1 - t),
  easeInOut: t => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
  easeOutBounce: t => {
    const n = 7.5625, d = 2.75
    if (t < 1 / d) return n * t * t
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375
    return n * (t -= 2.625 / d) * t + 0.984375
  },
}

/**
 * The half of `Easing` that no list can enumerate, phrased for an error
 * message.
 *
 * One exported string rather than three hand-written clauses, because there
 * are three validation sites (`overrides()`, the CLI validator, the site
 * validator) and they already disagree about whether to sort the named list.
 * A second drifting difference in the same sentence is not worth having, and
 * an author who reads two different accounts of what is accepted will believe
 * the stricter one.
 */
export const CUBIC_BEZIER_SYNTAX =
  'cubic-bezier(a, b, c, d) with a and c in 0..1'

/**
 * A CSS `<number>`: optional sign, digits with an optional decimal point on
 * either side, optional exponent.
 *
 * Matched before `Number()` rather than relying on `parseFloat`, which stops
 * at the first character it does not understand and would read
 * `cubic-bezier(1abc,0,1,1)` as a perfectly good 1.
 */
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/

const CUBIC_BEZIER = /^cubic-bezier\((.*)\)$/

/**
 * Parse `cubic-bezier(a, b, c, d)` into its four control coordinates, or
 * `undefined` if it is not one.
 *
 * The x-coordinate range check lives here rather than in the caller so that
 * every consumer of the string form agrees on what "well-formed" means. An
 * out-of-range x is not merely unusual — `cubicBezier` throws on it, because
 * the curve stops being a function of progress — so letting it through here
 * would convert an authoring typo into a crash at render time, with no file
 * or path to name.
 */
function parseCubicBezier(
  s: string,
): readonly [number, number, number, number] | undefined {
  const m = CUBIC_BEZIER.exec(s.trim())
  if (!m) return undefined
  const parts = m[1]!.split(',')
  if (parts.length !== 4) return undefined
  const out: number[] = []
  for (const part of parts) {
    const text = part.trim()
    if (!NUMBER.test(text)) return undefined
    const n = Number(text)
    // `NUMBER` already excludes `NaN`/`Infinity` as spellings; this catches an
    // overflow to Infinity from a huge exponent.
    if (!Number.isFinite(n)) return undefined
    out.push(n)
  }
  const [x1, y1, x2, y2] = out as [number, number, number, number]
  // Only x is constrained. y is unbounded because overshoot is the point of
  // an anticipation or bounce curve; see `cubicBezier`.
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) return undefined
  return [x1, y1, x2, y2]
}

/**
 * Is this a usable easing — a shipped name, or a well-formed
 * `cubic-bezier(...)`?
 *
 * Takes `unknown` because every caller is validating scene input: all three
 * validation sites previously asked `ease in EASINGS`, which is correct only
 * while the named curves are the whole of `Easing`.
 */
export function isEasing(x: unknown): x is Easing {
  if (typeof x !== 'string') return false
  if (namedEasing(x) !== undefined) return true
  return parseCubicBezier(x) !== undefined
}

/**
 * The shipped function a *named* easing denotes, or `undefined` if the string
 * does not name one.
 *
 * **`hasOwnProperty`, not `EASINGS[name]`, and this function exists so that
 * there is exactly one place that decides.** A bare index finds inherited
 * properties: `EASINGS['toString']` is `Object.prototype.toString`, which is
 * truthy, is not an easing, and when handed to `channelAt` multiplies a
 * keyframe delta by a string and yields `NaN` for the whole scene with no
 * error. `EASINGS['valueOf']` fails later and less legibly still. `isEasing`
 * got this right and both resolution paths got it wrong, which is the shape
 * of bug a duplicated guard produces — so the guard is no longer duplicated.
 *
 * Exported for `evalTrack`'s memoising `easingFor`, which must take the same
 * fast named path and must agree with this one about what a name is.
 */
export function namedEasing(name: string): ((t: number) => number) | undefined {
  return Object.prototype.hasOwnProperty.call(EASINGS, name)
    ? EASINGS[name as NamedEasing]
    : undefined
}

/**
 * The function an `Easing` denotes, for either form.
 *
 * Throws rather than falling back to `linear` on an unrecognised string. The
 * type keeps honest callers out of that branch, but both scene validators
 * handle unvalidated input and this is the last place the mistake is still
 * legible: a silent `linear` renders the whole scene with the wrong motion
 * and nothing anywhere says why.
 *
 * **No memoisation here.** `evalTrack` is the per-layer-per-frame caller and
 * it owns the cache, because only it can key one — see `track.ts`.
 */
export function resolveEasing(ease: Easing): (t: number) => number {
  const named = typeof ease === 'string' ? namedEasing(ease) : undefined
  if (named) return named
  const pts = typeof ease === 'string' ? parseCubicBezier(ease) : undefined
  if (!pts) {
    throw new Error(
      `unknown easing ${JSON.stringify(ease)} — valid: ` +
      `${Object.keys(EASINGS).join(', ')}, or ${CUBIC_BEZIER_SYNTAX}`,
    )
  }
  return cubicBezier(...pts)
}
