import { EASINGS, resolveEasing } from './easing.js'
import { IDENTITY } from '../types.js'
import type {
  Anim, AssertNever, Easing, Key, NamedEasing, Preset, Track, Transform,
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
 * Unbounded, deliberately. The keys are easing strings written by a scene
 * author, so the population is the number of *distinct curves in the scene
 * file* — a handful. An eviction policy here would be machinery guarding
 * against a scene nobody writes.
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
  const named = EASINGS[ease as NamedEasing]
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
 * Compose one or many animators into a single transform.
 * Translations/rotations sum; scales multiply; depth sums (then the caller clamps).
 * This is what makes [marquee, bob] work without a marquee-with-bob preset.
 *
 * `ctx` carries the scene/content measurements presets need (marquee's travel
 * distance depends on the measured content width). It is optional only because
 * an anim built entirely from raw tracks does not need it; a preset without it
 * throws rather than guessing a size.
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
    acc.x += t.x
    acc.y += t.y
    acc.depth += t.depth
    acc.rotate += t.rotate
    acc.rotateX += t.rotateX
    acc.rotateY += t.rotateY
    acc.scale *= t.scale
  }
  return acc
}
