import { namedEasing, resolveEasing } from './easing.js'
import { IDENTITY } from '../types.js'
import type {
  Anim, AssertNever, Easing, Key, Preset, Track, Transform,
} from '../types.js'
import type { PresetCtx } from './presets.js'

/**
 * The animatable channels, canonical. Exported through `core/index.ts` because
 * the CLI and site scene validators each need the same list to decide which
 * keyframe fields are legal, and each had grown its own unguarded copy — both
 * of which missed `rotateX`/`rotateY` and so rejected them.
 */
export const CHANNELS = ['x', 'y', 'depth', 'scale', 'rotate', 'rotateX', 'rotateY'] as const
export type Channel = typeof CHANNELS[number]

// A channel added to `Transform` without being listed above would silently
// stop interpolating — `evalTrack` only walks CHANNELS — and nothing else in
// the codebase would notice. Same guard as `STEREO_KEYS` in `types.ts`.
type _NoChannelMissing = AssertNever<Exclude<keyof Transform, Channel>>
type _NoChannelExtra = AssertNever<Exclude<Channel, keyof Transform>>

/**
 * Solvers built from `cubic-bezier(...)` strings, keyed by the string.
 *
 * **This cache is about the render loop, not about microbenchmarks.**
 * `channelAt` runs once per animated channel per layer per frame, and
 * `resolveEasing` on a bezier does a regex match, a split, four `Number()`
 * conversions, and then allocates a closure over six precomputed
 * coefficients. None of that can vary between frames: the easing is a
 * property of the track, and the track does not change while the scene
 * renders. Resolving per call would mean building and discarding one solver
 * per channel per layer per frame.
 *
 * Keyed by the string rather than by the `Track` so that two layers sharing
 * an easing share a solver, and so a `WeakMap` is not needed to avoid
 * retaining tracks.
 *
 * Unbounded, deliberately — **and that rests on an assumption about the
 * caller that is true today and will stop being true.** The keys are easing
 * strings, so while they are written by a scene author the population is the
 * number of distinct curves in the scene *file*: a handful, and an eviction
 * policy would be machinery guarding against a scene nobody writes.
 *
 * The editor breaks that assumption rather than stretching it. Design §4.4
 * puts an inline bezier preview beside four draggable numbers, and §7.6
 * reserves the space for a value-graph editor; dragging one of those numbers
 * emits a *new* easing string on every frame of the drag, each one a distinct
 * key and each one a permanent `Map` entry retaining a closure over six
 * coefficients. The population stops being "curves in the file" and becomes
 * "curves ever scrubbed through", which is unbounded in a session that never
 * reloads.
 *
 * So this is a decision about a scene renderer, not a decision about the
 * cache. **Whoever builds that control owns this line**: the options are an
 * LRU, a cache the editor clears when the drag ends, or resolving the
 * in-flight curve outside the cache and only interning it on commit. Leaving
 * it as-is is also allowed — but as a measured choice, not by inheriting a
 * rationale that was about scene files.
 */
const BEZIER_SOLVERS = new Map<string, (t: number) => number>()

/**
 * The function an easing denotes, memoised for the bezier form.
 *
 * **The named path must not get slower**, and that is why the record lookup
 * comes first instead of everything going through the map. The five named
 * curves are what every scene in the repo uses today; routing them through a
 * `Map.get` would add a hash lookup per channel per layer per frame to every
 * existing scene in exchange for nothing — they are already plain functions
 * with nothing to build. So: property lookup for the named curves, exactly as
 * before, and the cache only on the path that would otherwise allocate.
 *
 * Exported for the test that pins both halves of that: same instance back for
 * a repeated bezier, and `EASINGS`' own function for a named one.
 */
export function easingFor(ease: Easing): (t: number) => number {
  // `namedEasing`, not `EASINGS[ease]`: a bare index resolves inherited
  // `Object.prototype` keys, so an `ease` of `'toString'` returned a function
  // that is not an easing and `channelAt` produced `NaN` in silence. One
  // owner of the "is this a shipped name" question, shared with `isEasing`
  // and `resolveEasing` — see `namedEasing` in `easing.ts`.
  const named = namedEasing(ease)
  if (named !== undefined) return named
  let solver = BEZIER_SOLVERS.get(ease)
  if (solver === undefined) {
    solver = resolveEasing(ease)
    BEZIER_SOLVERS.set(ease, solver)
  }
  return solver
}

/** Map wall-clock seconds to this track's normalised local time, honouring repeat. */
function localTime(tr: Track, seconds: number, sceneDuration: number): number {
  const start = tr.start ?? 0
  const dur = tr.duration ?? Math.max(sceneDuration - start, 1e-9)
  let u = (seconds - start) / dur
  // A track is idle at its first key until `start`. Without this guard the
  // repeat wrap below runs on negative time, so `{start: 1, repeat: 'loop'}`
  // displays three-quarters of its animation *before* it is meant to begin.
  if (u <= 0) return 0
  const repeat = tr.repeat ?? 'once'
  if (repeat === 'loop') {
    u = u - Math.floor(u)
  } else if (repeat === 'pingpong') {
    const cycle = Math.floor(u)
    const frac = u - cycle
    u = cycle % 2 === 0 ? frac : 1 - frac
  }
  return u < 0 ? 0 : u > 1 ? 1 : u
}

/** Value of one channel at normalised time u, or undefined if no key sets it. */
function channelAt(keys: Key[], ch: Channel, u: number, ease: Easing): number | undefined {
  const pts = keys
    .filter(k => k[ch] !== undefined)
    .sort((a, b) => a.t - b.t)
  if (pts.length === 0) return undefined
  if (pts.length === 1 || u <= pts[0]!.t) return pts[0]![ch]
  const last = pts[pts.length - 1]!
  if (u >= last.t) return last[ch]

  let i = 0
  while (i < pts.length - 1 && pts[i + 1]!.t < u) i++
  const a = pts[i]!, b = pts[i + 1]!
  const span = b.t - a.t
  const local = span <= 0 ? 0 : (u - a.t) / span
  // `easingFor`, not `EASINGS[ease]`. This is the **fourth** easing
  // touchpoint and the only one that is not a validator: it is the actual
  // runtime resolution path, it never checked anything, and indexing a record
  // keyed by the five named curves with a widened `Easing` yields `undefined`
  // for a bezier string — a TypeError one line later, in the render loop.
  const e = easingFor(ease)(local)
  return a[ch]! + (b[ch]! - a[ch]!) * e
}

/** Evaluate a single track at `seconds` into a scene of `sceneDuration` seconds. */
export function evalTrack(tr: Track, seconds: number, sceneDuration: number): Transform {
  const u = localTime(tr, seconds, sceneDuration)
  const ease = tr.ease ?? 'linear'
  const out: Transform = { ...IDENTITY }
  for (const ch of CHANNELS) {
    const v = channelAt(tr.keys, ch, u, ease)
    if (v !== undefined) out[ch] = v
  }
  return out
}

function isTrack(a: Track | Preset): a is Track {
  return 'keys' in a
}

/**
 * Turns a preset into a track. `compilePreset` from `./presets.js` is the only
 * implementation; it is injected rather than imported so `track.ts` stays free
 * of the preset registry (and so tests can stub it).
 */
export type AnimCompiler = (preset: Preset, ctx: PresetCtx) => Track

/**
 * Default compiler: refuses, loudly.
 *
 * It would be easy to default to `() => ({ keys: [] })`, but that makes a
 * mis-wired call site render a *motionless* scene with no error at all — the
 * single most miserable animation bug to chase down. Fail at the call site
 * instead.
 */
const noCompiler: AnimCompiler = preset => {
  throw new Error(
    `composeAnim: cannot expand preset "${preset.kind}" — no preset compiler was ` +
    `supplied. Call composeAnim(anim, seconds, sceneDuration, ctx, compilePreset).`,
  )
}

/**
 * How each channel accumulates when several animators act on one layer: the
 * displacements **sum**, `scale` **multiplies**. A 2× and a 5× animator compose
 * to 10×, not to 8× and not to 5× — "later animator wins" is not the rule, and
 * the asymmetry is the whole reason this is a partition and not a single list.
 * 2× and 5× rather than the obvious 2× and 3×, because `acc.scale` starts at 1
 * and 2 and 3 give 6 under *either* operator (2 × 3 = 1 + 2 + 3), so that
 * example distinguishes nothing. The collision is exactly `(a−1)(b−1) = 2`.
 *
 * Derived from, and guarded against, `CHANNELS` because `composeAnim` used to
 * write all seven accumulations out by hand. That made an eighth channel a
 * *silent* no-op — and the hole was **four** edits wide, not three. Measured on
 * the parent of the commit that added this guard (`80e2241` as this is written,
 * but that is a branch-local hash: trust the description over the digits if the
 * branch is rebased again): adding a channel on `Transform`, in `IDENTITY` and
 * in `CHANNELS` leaves `npm run typecheck` at **2**, from
 * `site/scalescene.test.ts`'s `_NoChannelUnclassified`, which demands the new
 * channel be classified in `site/scalescene.ts`'s `SCALED_CHANNELS` or
 * `UNSCALED_CHANNELS`. That guard predates this one (`da5be08`), so
 * `site/scalescene.ts` is *not* a place where a channel slips through
 * unnoticed — read it as the fourth place, not as an unguarded one. Make that
 * fourth edit and the four gate commands all exit 0 with every test green, at
 * the same file and pass counts as the unmutated commit, while the compositor
 * discards the channel once per layer per frame. Both scene validators needed
 * no edit and raised no objection either: their `KEY_CHANNELS` spread
 * `CHANNELS`. This is the same defect P0 removed from both scene validators,
 * surviving in the one place that consumes the channels rather than validating
 * them.
 *
 * Exported only for the test that pins the partition at runtime, as
 * `cli/scene.ts` exports `KEY_CHANNELS`: `AssertNever` is enforced by
 * `npm run typecheck` alone (`types.seam.test.ts`), so without a runtime
 * witness the guard below is invisible to `npm test`. Not on the package root —
 * nothing outside `core` composes animators.
 */
export const SUMMED_CHANNELS = ['x', 'y', 'depth', 'rotate', 'rotateX', 'rotateY'] as const
export const MULTIPLIED_CHANNELS = ['scale'] as const
type SummedChannel = typeof SUMMED_CHANNELS[number]
type MultipliedChannel = typeof MULTIPLIED_CHANNELS[number]

// The partition must be **total and disjoint** over `CHANNELS`. Total is the
// guard that was missing: a channel in neither set is a channel `composeAnim`
// never accumulates, and this is what now fails the build instead of shipping.
// Disjoint matters because a channel in both would be summed *and* multiplied,
// which is silent too — the second operator just overwrites the first.
type _NoChannelUncomposed = AssertNever<Exclude<Channel, SummedChannel | MultipliedChannel>>
type _NoComposedChannelExtra = AssertNever<Exclude<SummedChannel | MultipliedChannel, Channel>>
type _CompositionDisjoint = AssertNever<Extract<SummedChannel, MultipliedChannel>>

/**
 * Compose one or many animators into a single transform.
 * Translations/rotations sum; scales multiply; depth sums (then the caller clamps).
 * This is what lets `[{kind: 'move'}, <a three-key bounce track>]` work
 * without a move-with-bounce preset — and it is why §4.2b could narrow the
 * registry to five verbs: a composition does not need a name.
 *
 * `ctx` carries the scene/content measurements a preset may need, and every
 * field of it now has a reader: `push` reads `layerDepth`, and `move`'s
 * symbolic off-stage endpoints read the other six to turn `offLeft`,
 * `offRight`, `offTop` and `offBottom` into stage px. It is optional only
 * because an anim built entirely from raw tracks does not need it; a preset
 * without it throws rather than guessing a size.
 */
export function composeAnim(
  anim: Anim | undefined, seconds: number, sceneDuration: number,
  ctx?: PresetCtx,
  compile: AnimCompiler = noCompiler,
): Transform {
  if (!anim) return { ...IDENTITY }
  const list = Array.isArray(anim) ? anim : [anim]
  if (list.length === 0) return { ...IDENTITY }

  const acc: Transform = { ...IDENTITY }
  for (const item of list) {
    let tr: Track
    if (isTrack(item)) {
      tr = item
    } else {
      if (!ctx) {
        throw new Error(
          `composeAnim: preset "${item.kind}" needs a PresetCtx ` +
          `({ sceneW, sceneH, contentW, contentH, layerDepth, marginLeft, ` +
          `marginRight }) but none was passed.`,
        )
      }
      tr = compile(item, ctx)
    }
    const t = evalTrack(tr, seconds, sceneDuration)
    // Each channel accumulates into its own slot, so replacing the seven
    // statements with these loops reorders no float operation: *within* a
    // channel the sequence is still animator by animator, in list order, which
    // is the only ordering that could change a result. Verified by comparing
    // both spellings bitwise (`Object.is`, so −0 and NaN count) over 280,000
    // channel values of mixed-magnitude random compositions: zero differences.
    for (const ch of SUMMED_CHANNELS) acc[ch] += t[ch]
    for (const ch of MULTIPLIED_CHANNELS) acc[ch] *= t[ch]
  }
  return acc
}
