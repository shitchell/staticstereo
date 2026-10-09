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
 *
 * `sceneW`/`sceneH` are the **stage** (design §10): the region that survives
 * fusion, and the space a layer's `at` and a track's `x`/`y` are expressed in.
 */
export interface PresetCtx {
  sceneW: number
  sceneH: number
  contentW: number
  contentH: number
  /**
   * Plate margin widths in **stage pixels**, left and right of the stage
   * (design §10). Used by the presets that compute an *off-frame* pose, so that
   * "off-frame" means off the whole emitted image rather than off a
   * sub-rectangle of it.
   *
   * **What this does and does not buy, measured.** Design §10.5 justifies these
   * with "a `marquee` travelling to `stageW` would pop in at the stage edge
   * rather than slide in from off-plate". **That rationale does not hold for
   * this pipeline and the number it implies is not what is observed.** The
   * rasteriser draws the *stage* (`rasterDepth` is `scene.size`-sized) and
   * `render.ts` fills the margins by edge-extending it, so a layer positioned
   * outside the stage is not drawn *anywhere* — there is no "visible in the
   * dead strip" state for it to be in. Measured on a 40px full-height slab
   * entering a 240px stage with 30/15 margins: at `x = 241` the plate carries
   * no near structure at all, and at `x = 239` it carries 16 coherent columns.
   * The margin terms move that transition in *time* and change nothing about
   * what the frame looks like when it happens.
   *
   * What does pop is the padding itself, and no preset can fix it: the instant
   * the slab touches the stage's last column, **all 15** right-margin columns
   * become near depth at once, because that is what edge extension is. That is
   * a property of §10.3's fill rule, not of the animation.
   *
   * They are kept because the endpoint is still the honest one — a track should
   * be expressed against the image that is emitted, `marquee`'s `speed` should
   * mean px/sec across that image, and the loop then has a clean empty gap
   * instead of cutting from "tail leaving" straight back to "head arriving" —
   * and because it is the invariant that stays correct if the rasteriser ever
   * moves into plate coordinates. Required rather than optional so that a
   * caller which has not thought about margins is a compile error.
   *
   * Margins are x-only, so there is no top/bottom pair (§10.2).
   */
  marginLeft: number
  marginRight: number
  /**
   * The layer's own base depth, before any animator offset.
   *
   * `emerge` needs this and cannot work without it. Transforms are *additive*
   * offsets, but the design specifies emerge as rising "from 0 to target" —
   * an absolute range. Without knowing the base depth, emerge keyed 0→1 as an
   * offset, so a layer at the default depth of 1 animated 1→2, clamped, and sat
   * perfectly static: the designated depth-space stand-in for a fade did
   * nothing at all.
   */
  layerDepth: number
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
    // the far side — the same convention marquee uses. Off-**plate**, not
    // off-stage, on the two horizontal directions, so the start pose is off the
    // image that is actually emitted. Margins are x-only, so top/bottom are
    // unchanged (design §10.2). See `PresetCtx.marginLeft` for what this is and
    // is not measured to buy.
    const offset =
      dir === 'left' ? -(ctx.contentW + ctx.marginLeft) :
      dir === 'right' ? ctx.sceneW + ctx.marginRight :
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
   * Right-to-left scroll. Travels from `+sceneW + marginRight` (fully off the
   * right-hand edge of the **plate**) to `-(contentW + marginLeft)` (fully off
   * the left-hand edge of the plate). Ending at 0 would leave the tail of an
   * over-wide string parked on screen forever, which is the bug the
   * `-contentW` part of this endpoint exists to prevent.
   *
   * The margin terms express the travel against the **emitted** image rather
   * than against the stage, which is also what keeps `speed` meaning px/sec
   * across the picture: at the shipped defaults the plate is 110px wider than
   * the stage (55px of dead margin each side under `linked`), so a stage-only
   * travel would scroll the same string over a ~12% shorter distance at the
   * same nominal rate. Under `shift` the margins are 110/55, so the gap is
   * wider still — which is why this is computed rather than hardcoded. See
   * `PresetCtx.marginLeft` for the measurement of what this changes — which is
   * the timing, not the appearance.
   */
  marquee: (p, ctx) => {
    const speed = num(p, 'speed', 60)
    if (speed <= 0) throw new Error(`preset "marquee": "speed" must be > 0 px/sec, got ${speed}`)
    const from = ctx.sceneW + ctx.marginRight
    const to = -(ctx.contentW + ctx.marginLeft)
    const tr: Track = {
      keys: [{ t: 0, x: from }, { t: 1, x: to }],
      ease: 'linear',
      repeat: 'loop',
      duration: Math.abs(from - to) / speed,
    }
    return overrides(tr, p)
  },

  /** Rise out of the background. The depth-space stand-in for a fade-in. */
  /**
   * Rise out of the background. `from`/`to` are **absolute** depths — `to`
   * defaults to the layer's own depth, so `{kind: 'emerge'}` means "come up
   * from the noise to wherever this layer lives".
   *
   * Keys are emitted as offsets relative to the layer's base depth, because
   * that is what the transform model composes. Keying absolute values here is
   * exactly the bug this replaced: a layer at depth 1 animated 1→2 and clamped
   * to a static surface.
   */
  emerge: (p, ctx) => overrides({
    keys: [
      { t: 0, depth: num(p, 'from', 0) - ctx.layerDepth },
      { t: 1, depth: num(p, 'to', ctx.layerDepth) - ctx.layerDepth },
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
