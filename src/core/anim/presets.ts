/**
 * Preset sugar. Every preset compiles to a plain `Track`, so there is exactly
 * one evaluator (`evalTrack`) and raw tracks are not a parallel mechanism — see
 * the design doc, §4.
 *
 * Nothing here animates opacity. Fading is motion in `depth` (`emerge`).
 */
import { EASINGS } from './easing.js'
import type { Easing, Preset, Track } from '../types.js'

/**
 * Measurements a preset may need. `contentW`/`contentH` are the *measured* size
 * of the layer being animated (text metrics, image dimensions), which is what
 * lets `marquee` scroll an over-wide string all the way off the frame.
 */
export interface PresetCtx {
  sceneW: number
  sceneH: number
  contentW: number
  contentH: number
}

export type PresetFn = (p: Preset, ctx: PresetCtx) => Track

const REPEATS = ['once', 'loop', 'pingpong'] as const
type Repeat = typeof REPEATS[number]

const DIRECTIONS = ['left', 'right', 'top', 'bottom'] as const
type Direction = typeof DIRECTIONS[number]

/* ------------------------------------------------------------------ params */

/**
 * Parameter readers reject garbage instead of silently falling back to the
 * default: a typo'd preset param that quietly produces the default animation is
 * the same debugging trap as an unknown preset compiling to no motion.
 */
function num(p: Preset, key: string, fallback: number): number {
  const v = p[key]
  if (v === undefined) return fallback
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`preset "${p.kind}": "${key}" must be a finite number, got ${JSON.stringify(v)}`)
  }
  return v
}

function pair(p: Preset, key: string, fallback: [number, number]): [number, number] {
  const v = p[key]
  if (v === undefined) return fallback
  if (
    !Array.isArray(v) || v.length !== 2 ||
    typeof v[0] !== 'number' || !Number.isFinite(v[0]) ||
    typeof v[1] !== 'number' || !Number.isFinite(v[1])
  ) {
    throw new Error(`preset "${p.kind}": "${key}" must be an [x, y] number pair, got ${JSON.stringify(v)}`)
  }
  return [v[0], v[1]]
}

function direction(p: Preset, key: string, fallback: Direction): Direction {
  const v = p[key]
  if (v === undefined) return fallback
  if (typeof v !== 'string' || !(DIRECTIONS as readonly string[]).includes(v)) {
    throw new Error(
      `preset "${p.kind}": "${key}" must be one of ${DIRECTIONS.join(', ')}, got ${JSON.stringify(v)}`,
    )
  }
  return v as Direction
}

/**
 * Per-preset timing/easing overrides. Every preset honours `ease`, `repeat`,
 * `start` and `duration`, so the escape hatch is incremental: you can nudge one
 * field of a preset without hand-rolling the whole keyframe track.
 */
function overrides(tr: Track, p: Preset): Track {
  const ease = p['ease']
  if (ease !== undefined) {
    if (typeof ease !== 'string' || !(ease in EASINGS)) {
      throw new Error(
        `preset "${p.kind}": unknown easing ${JSON.stringify(ease)} — ` +
        `valid: ${Object.keys(EASINGS).join(', ')}`,
      )
    }
    tr.ease = ease as Easing
  }
  const repeat = p['repeat']
  if (repeat !== undefined) {
    if (typeof repeat !== 'string' || !(REPEATS as readonly string[]).includes(repeat)) {
      throw new Error(
        `preset "${p.kind}": unknown repeat ${JSON.stringify(repeat)} — ` +
        `valid: ${REPEATS.join(', ')}`,
      )
    }
    tr.repeat = repeat as Repeat
  }
  if (p['start'] !== undefined) tr.start = num(p, 'start', 0)
  if (p['duration'] !== undefined) {
    const d = num(p, 'duration', 0)
    if (d <= 0) throw new Error(`preset "${p.kind}": "duration" must be > 0, got ${d}`)
    tr.duration = d
  }
  return tr
}

/* ----------------------------------------------------------------- presets */

/**
 * The v1 registry. Adding a preset is adding an entry here — not a refactor.
 *
 * Note what is *not* here: default durations. A track with no `duration` runs
 * for the remainder of the scene, which is the right default for one-shot
 * motion (`slide`, `emerge`) and the reason `bounce`/`bob` take a `duration`
 * when you want a faster cycle than once-per-scene. `marquee` is the one
 * exception: its duration is derived from `speed`, because a scroll rate in
 * px/sec is the thing an author actually wants to control.
 */
export const PRESETS: Record<string, PresetFn> = {
  /** Straight A→B move. `from`/`to` are `[x, y]` offsets from the layer's `at`. */
  slide: p => {
    const from = pair(p, 'from', [0, 0])
    const to = pair(p, 'to', [0, 0])
    return overrides({
      keys: [
        { t: 0, x: from[0], y: from[1] },
        { t: 1, x: to[0], y: to[1] },
      ],
      ease: 'linear',
      repeat: 'once',
    }, p)
  },

  /**
   * Enter from off-frame and come to rest at the layer's own position. Only the
   * axis being entered on is keyed, so the other axis stays composable with
   * e.g. `bob`.
   */
  'slide-in': (p, ctx) => {
    const dir = direction(p, 'from', 'left')
    const horizontal = dir === 'left' || dir === 'right'
    // Off-frame by the content's own extent on the near side, by the scene's on
    // the far side — the same convention marquee uses.
    const offset =
      dir === 'left' ? -ctx.contentW :
      dir === 'right' ? ctx.sceneW :
      dir === 'top' ? -ctx.contentH :
      ctx.sceneH
    return overrides({
      keys: horizontal
        ? [{ t: 0, x: offset }, { t: 1, x: 0 }]
        : [{ t: 0, y: offset }, { t: 1, y: 0 }],
      ease: 'easeOut',
      repeat: 'once',
    }, p)
  },

  /**
   * Right-to-left scroll. Travels from `+sceneW` (fully off the right edge) to
   * `-contentW` (fully off the left edge). Ending at 0 would leave the tail of
   * an over-wide string parked on screen forever, which is the bug this
   * endpoint exists to prevent.
   */
  marquee: (p, ctx) => {
    const speed = num(p, 'speed', 60)
    if (speed <= 0) throw new Error(`preset "marquee": "speed" must be > 0 px/sec, got ${speed}`)
    const from = ctx.sceneW
    const to = -ctx.contentW
    const tr: Track = {
      keys: [{ t: 0, x: from }, { t: 1, x: to }],
      ease: 'linear',
      repeat: 'loop',
      duration: Math.abs(from - to) / speed,
    }
    return overrides(tr, p)
  },

  /** Rise out of the background. The depth-space stand-in for a fade-in. */
  emerge: p => overrides({
    keys: [
      { t: 0, depth: num(p, 'from', 0) },
      { t: 1, depth: num(p, 'to', 1) },
    ],
    ease: 'easeOut',
    repeat: 'once',
  }, p),

  /** Up and back down, landing with the bounce easing. */
  bounce: p => {
    // The design doc writes this param as `h`, the implementation plan's test as
    // `height`; accept either rather than making one of them wrong.
    const height = p['height'] !== undefined ? num(p, 'height', 100) : num(p, 'h', 100)
    return overrides({
      keys: [
        { t: 0, y: 0 },
        { t: 0.5, y: -height },
        { t: 1, y: 0 },
      ],
      ease: 'easeOutBounce',
      repeat: 'loop',
    }, p)
  },

  /** Small idle wobble. Pingpong over a symmetric 3-key arc reads as a sine. */
  bob: p => {
    const amount = num(p, 'amount', 8)
    return overrides({
      keys: [
        { t: 0, y: 0 },
        { t: 0.5, y: -amount },
        { t: 1, y: 0 },
      ],
      ease: 'easeInOut',
      repeat: 'pingpong',
    }, p)
  },
}

/**
 * Expand preset sugar into a track.
 *
 * Throws on an unknown kind. A no-op fallback here would render a perfectly
 * still scene with no diagnostic at all, so the error names the kind and lists
 * what is valid.
 */
export function compilePreset(p: Preset, ctx: PresetCtx): Track {
  const fn = PRESETS[p.kind]
  if (!fn) {
    throw new Error(
      `unknown animation preset "${p.kind}" — valid kinds: ` +
      `${Object.keys(PRESETS).sort().join(', ')}`,
    )
  }
  return fn(p, ctx)
}
