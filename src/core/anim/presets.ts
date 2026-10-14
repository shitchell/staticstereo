/**
 * Preset sugar. Every preset compiles to a plain `Track`, so there is exactly
 * one evaluator (`evalTrack`) and raw tracks are not a parallel mechanism — see
 * the design doc, §4.
 *
 * Nothing here animates opacity. Fading is motion in `depth` (`push`).
 */
import { CUBIC_BEZIER_SYNTAX, EASINGS, isEasing } from './easing.js'
import { degToRad } from '../angle.js'
import type { Channel } from './track.js'
import type { Preset, Track } from '../types.js'

/**
 * Measurements a preset may need. `contentW`/`contentH` are the *measured*
 * size of the layer being animated (text metrics, image dimensions); that is
 * what let the old `marquee` scroll an over-wide string all the way off the
 * frame rather than parking its tail on screen.
 *
 * `sceneW`/`sceneH` are the **stage** (design §10): the region that survives
 * fusion, and the space a layer's `at` and a track's `x`/`y` are expressed in.
 *
 * **Every field has a reader again.** `push` reads `layerDepth`; the other six
 * are read by `move`'s symbolic off-stage endpoints (`OFF_STAGE` below), which
 * is the `measureText → contentW → endpoint` chain that `marquee`'s deletion
 * took off the production path and §4.2 puts back. They are required rather
 * than optional for the reason they always were: the context is built once per
 * layer per frame by the rasteriser whether or not a preset asks for it
 * (`raster.ts`), so nothing is saved by trimming it, and a caller which has not
 * thought about what it is measuring against should be a compile error.
 */
export interface PresetCtx {
  sceneW: number
  sceneH: number
  contentW: number
  contentH: number
  /**
   * Plate margin widths in **stage pixels**, left and right of the stage
   * (design §10). For computing an *off-frame* pose, so that "off-frame"
   * means off the whole emitted image rather than off a sub-rectangle of it.
   *
   * **Read by `move`'s `offLeft`/`offRight` tokens** (`OFF_STAGE` below), which
   * are the two consumers `marquee` and `slide-in` used to be. The measurement
   * below is why those tokens exist rather than being left to a caller: it is
   * the thing an author writing the endpoint by hand must not have to
   * re-decide, and got wrong by 17.33px when one did — `site/examples.ts`'s own
   * derivation comment records that miss and that nothing caught it.
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
   * be expressed against the image that is emitted, a scroll's `speed` should
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
   * `push` needs this and cannot work without it. Transforms are *additive*
   * offsets, but the design specifies this verb as rising "from 0 to target" —
   * an absolute range. Without knowing the base depth, it keyed 0→1 as an
   * offset, so a layer at the default depth of 1 animated 1→2, clamped, and sat
   * perfectly static: the designated depth-space stand-in for a fade did
   * nothing at all.
   */
  layerDepth: number
}

export type PresetFn = (p: Preset, ctx: PresetCtx) => Track

const REPEATS = ['once', 'loop', 'pingpong'] as const
type Repeat = typeof REPEATS[number]

/**
 * The three rotation axes and the channel each one names.
 *
 * `satisfies Record<..., Channel>` rather than a bare object so the mapping is
 * tied to the canonical channel list: renaming a channel in `CHANNELS` without
 * fixing this is a compile error, not a `rotate` that silently writes nowhere.
 */
const ROTATION_AXES = ['x', 'y', 'z'] as const
const ROTATION_CHANNEL = {
  x: 'rotateX',
  y: 'rotateY',
  /** `z` is the in-plane spin, and its channel is the unsuffixed `rotate`. */
  z: 'rotate',
} as const satisfies Record<typeof ROTATION_AXES[number], Channel>

/**
 * `flip`'s axes — **two**, where `rotate`'s are three.
 *
 * There is no meaningful flip about z. A half turn in the plane is an in-plane
 * spin, not a mirror: the layer ends up rotated, never reversed, and `rotate`
 * already expresses it exactly. Offering `flip: {axis: 'z'}` would give one
 * effect two spellings with different defaults, which is the ambiguity the
 * verb vocabulary is being narrowed to remove.
 */
const FLIP_AXES = ['x', 'y'] as const

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

function pairError(p: Preset, key: string, v: unknown): Error {
  return new Error(
    `preset "${p.kind}": "${key}" must be an [x, y] number pair, got ${JSON.stringify(v)}`,
  )
}

/**
 * The axis each slot of an `[x, y]` pair is, indexed by the slot itself so the
 * two cannot drift in an error message.
 */
const SLOT_AXIS = ['x', 'y'] as const

interface OffStageEndpoint {
  /** `0` is the `x` slot of an `[x, y]` pair, `1` the `y` slot. */
  readonly slot: 0 | 1
  readonly of: (ctx: PresetCtx) => number
}

/**
 * The symbolic off-stage endpoints `move`'s `from`/`to` accept in place of a
 * number (design §4.2) — the arithmetic the deleted `marquee` and `slide-in`
 * did, back on the production path. §4.2b's table says this in one line:
 * `marquee` *becomes* "`move` with off-stage endpoints".
 *
 * **Computed from the stage and the plate, never from the layer's `at`.** A
 * token resolves to a value for the `x`/`y` *channel*, and `raster.ts` applies
 * that channel as `at[0] + t.x` — so a layer with `at[0] ≠ 0` ends up `at[0]`px
 * away from off-frame rather than at it. That is not a defect in the
 * resolution; it is the same convention every hand-written scroll in this repo
 * relies on, and `src/cli/scene.ts`'s `textScene` records why it is
 * load-bearing and what it costs. (`PresetCtx` carries no `at` deliberately:
 * adding one would make the resolution depend on a quantity the compile context
 * has never carried, and the golden asserts equality on the whole context.) The
 * case to know about is not hypothetical — a `shape: circle` layer defaults its
 * `at` to the stage centre (`raster.ts`), so a token on one lands half a stage
 * short.
 *
 * **Four tokens, two formula shapes, and the asymmetry is correct.** The
 * horizontal pair is off the *plate*: the near side by the content's own
 * measured extent plus the margin on that side, the far side by the stage's
 * width plus the margin on *its* side, so the travel spans the image that is
 * actually emitted and a scroll's `speed` means px/sec across it. The vertical
 * pair gets no margin term, because there is none to get — `Margins` is
 * `{left, right}` only and `plateLayoutOf` applies no vertical padding (design
 * §10.2, and see `marginLeft` above). A blanket "add the margin" would push an
 * `offTop` start a plate-margin's worth above the frame for no reason, which is
 * what `slide-in`'s own test was written to catch.
 *
 * **Per-slot, not per-vector.** §4.2 says `from`/`to` "accept a symbolic
 * endpoint as well as a number", and they are pairs of numbers, so a token
 * stands exactly where a number stands — in one slot. The alternative,
 * `from: offLeft` as a whole-vector token that also *selects* an axis, is
 * `slide-in`'s `from: 'left'`, and §4.2b's table assigns that spelling to a P6
 * UI template rather than to the verb. Keeping it out of `move` is what keeps
 * `from` one parameter with one shape instead of two.
 */
const OFF_STAGE: Readonly<Record<string, OffStageEndpoint>> = {
  offLeft: { slot: 0, of: ctx => -(ctx.contentW + ctx.marginLeft) },
  offRight: { slot: 0, of: ctx => ctx.sceneW + ctx.marginRight },
  offTop: { slot: 1, of: ctx => -ctx.contentH },
  offBottom: { slot: 1, of: ctx => ctx.sceneH },
}

/** The tokens valid in one slot, derived from the table so a message cannot go stale. */
function tokensIn(slot: 0 | 1): string {
  return Object.keys(OFF_STAGE).filter(name => OFF_STAGE[name]!.slot === slot).join(', ')
}

/**
 * One slot of an endpoint pair: a finite number, or a token for that slot's
 * axis.
 *
 * **A token in the other axis's slot throws rather than resolving.** `offLeft`
 * is a horizontal distance and writing it into `y` is an authoring mistake with
 * no sensible reading — and on a design where the URL *is* the scene, a link
 * someone else wrote cannot be debugged from the render, so a loud rejection
 * beats a quiet wrong pose (design §4.1 makes that trade for keyframe channels
 * for the same reason). The message names the axis, the slot it was written in
 * and the slot it belongs in, because that is the whole fix.
 */
function endpoint(
  p: Preset, key: string, v: unknown, slot: 0 | 1, ctx: PresetCtx, whole: unknown,
): number {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw pairError(p, key, whole)
    return v
  }
  // Anything that is neither a number nor a string keeps the pair reader's own
  // message: widening this to accept tokens must not turn `to: [0, {}]` into a
  // report about symbolic endpoints, which is not what went wrong.
  if (typeof v !== 'string') throw pairError(p, key, whole)
  // `Object.hasOwn`, not a bare `OFF_STAGE[v]`: the table is an object literal
  // on `Object.prototype`, so `OFF_STAGE['constructor']` is a *function* and
  // `OFF_STAGE['__proto__']` is an *object* — both truthy, both sailing past
  // the guard below and landing in the axis-mismatch branch, where
  // `token.slot` is `undefined`. The message that produced told the author to
  // "write it as `from`[undefined]", which is a loud error about a token that
  // does not exist in a slot that does not exist. `v` reaches here from a
  // scene file, and on the site that means from a link someone else wrote —
  // both validators pass preset parameters through byte-for-byte by design, so
  // nothing upstream filters it. Third instance of this idiom in the repo;
  // `site/fit.ts:111-116` records the first.
  const token = Object.hasOwn(OFF_STAGE, v) ? OFF_STAGE[v] : undefined
  if (!token) {
    throw new Error(
      `preset "${p.kind}": "${key}"[${slot}] must be a number or one of ` +
      `${tokensIn(slot)}, got ${JSON.stringify(v)}`,
    )
  }
  if (token.slot !== slot) {
    throw new Error(
      `preset "${p.kind}": "${key}"[${slot}] is the ${SLOT_AXIS[slot]} axis, and ` +
      // "an x-axis", "a y-axis". The article is read off `SLOT_AXIS` rather
      // than written as a literal `a`, which is what printed "is a x-axis
      // endpoint" at an author. Derived from the same table the axis name is,
      // so the two cannot disagree if the names ever change.
      `${JSON.stringify(v)} is ${SLOT_AXIS[token.slot] === 'x' ? 'an' : 'a'} ` +
      `${SLOT_AXIS[token.slot]}-axis endpoint — write it as ` +
      `"${key}"[${token.slot}]. Valid in "${key}"[${slot}]: ${tokensIn(slot)}.`,
    )
  }
  return token.of(ctx)
}

function endpointPair(
  p: Preset, key: string, fallback: [number, number], ctx: PresetCtx,
): [number, number] {
  const v = p[key]
  if (v === undefined) return fallback
  if (!Array.isArray(v) || v.length !== 2) throw pairError(p, key, v)
  // The whole value is passed down so a bad slot still reports the pair the
  // author wrote rather than the one element, which is not where they look.
  return [endpoint(p, key, v[0], 0, ctx, v), endpoint(p, key, v[1], 1, ctx, v)]
}

/**
 * One name out of a fixed set. Generic over the set rather than one reader per
 * enum, because the error text *is* the contract `params.test.ts` checks the
 * `EnumParam` descriptors against — two readers phrasing it differently would
 * let one enum's descriptor drift unnoticed.
 */
function oneOf<T extends string>(
  p: Preset, key: string, allowed: readonly T[], fallback: T,
): T {
  const v = p[key]
  if (v === undefined) return fallback
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    throw new Error(
      `preset "${p.kind}": "${key}" must be one of ${allowed.join(', ')}, got ${JSON.stringify(v)}`,
    )
  }
  return v as T
}

/**
 * Per-preset timing/easing overrides. Every preset honours `ease`, `repeat`,
 * `start` and `duration`, so the escape hatch is incremental: you can nudge one
 * field of a preset without hand-rolling the whole keyframe track.
 */
function overrides(tr: Track, p: Preset): Track {
  const ease = p['ease']
  if (ease !== undefined) {
    // `isEasing`, not `ease in EASINGS`: the record holds the five named
    // curves, and `Easing` also admits `cubic-bezier(...)`. The message names
    // that form too, because a list of five curve names has stopped
    // describing what is accepted — without it an author is told that their
    // valid easing is invalid, and offered five curves that are not it.
    if (!isEasing(ease)) {
      throw new Error(
        `preset "${p.kind}": unknown easing ${JSON.stringify(ease)} — ` +
        `valid: ${Object.keys(EASINGS).join(', ')}, or ${CUBIC_BEZIER_SYNTAX}`,
      )
    }
    tr.ease = ease
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
 * The verb vocabulary — **five entries, and adding a sixth is a design
 * decision, not a refactor** (design §4.2b).
 *
 * It used to hold nine. `marquee`, `bounce`, `bob` and `slide-in` were
 * deleted because each was a *composition* of these five rather than a
 * primitive beside them, and offering both spellings meant the same motion
 * had two names with different defaults. Each is still sayable as an
 * ordinary `Anim`: `marquee` is a `move` between the two horizontal off-stage
 * endpoints with a `speed` and `repeat: loop`, `slide-in` is a `move` from one
 * of the four, and `bounce` and `bob` are three-key `Track`s. The first two are
 * now sayable without computing anything — that is what `OFF_STAGE` above is
 * for — and §4.2b assigns the remaining two, plus `slide-in`'s whole-direction
 * `from`, to P6 UI templates that emit exactly those tracks. What each compiled
 * to is recorded in the commit that removed their golden entries; that is the
 * reference, not this file's history.
 *
 * Note what is *not* here: default durations. A track with no `duration` runs
 * for the remainder of the scene, which is the right default for one-shot
 * motion. `move`'s optional `speed` is the one exception, because a travel
 * rate in px/sec is the thing an author actually wants to control when they
 * care how fast something crosses the frame.
 */
const REGISTRY = {
  /**
   * Straight A→B move. `from`/`to` are `[x, y]` offsets from the layer's `at`,
   * and either slot may be a symbolic off-stage endpoint instead of a number —
   * see `OFF_STAGE` for the four, the axis each one belongs to, and why the
   * resolution cannot see `at`.
   *
   * `speed` is optional, in **scene px per second**, and derives `duration`
   * from the distance travelled. It was `marquee`'s one distinct capability
   * and is why that kind could be deleted (design §4.2b): `marquee` travelled
   * on one axis and divided `abs(from - to)` by the speed, `move` travels on
   * two, so the same idea is the Euclidean distance between the endpoints. A rate is what an author
   * controls when they care how fast a thing crosses the frame; a duration is
   * what they control when they care when it arrives. Both are offered, and
   * `speed` is derived *from* the endpoints so that editing `to` keeps the
   * rate rather than silently changing it.
   */
  move: (p, ctx) => {
    // Resolved before anything downstream reads them, `speed` included: the
    // derived duration is the distance between the *resolved* endpoints, which
    // is what made `marquee` a `move` rather than a separate verb.
    const from = endpointPair(p, 'from', [0, 0], ctx)
    const to = endpointPair(p, 'to', [0, 0], ctx)
    const tr: Track = {
      keys: [
        { t: 0, x: from[0], y: from[1] },
        { t: 1, x: to[0], y: to[1] },
      ],
      ease: 'linear',
      repeat: 'once',
    }
    if (p['speed'] !== undefined) {
      // Rejected rather than resolved by precedence. `speed` and `duration`
      // define the same quantity, so honouring either one silently would make
      // the scene mean something the author cannot see in the file they wrote
      // — and which of the two won would be invisible in the rendered GIF
      // until they measured it. Name both, so the fix is to delete one.
      if (p['duration'] !== undefined) {
        throw new Error(
          `preset "${p.kind}": "speed" and "duration" both set the length of the ` +
          'move and cannot be combined — "speed" derives the duration from the ' +
          'distance between "from" and "to". Keep one.',
        )
      }
      const speed = num(p, 'speed', 60)
      // Zero is a layer that never arrives and a negative rate is a
      // direction, which `from`/`to` already express. (This was `marquee`'s
      // contract too, which is what made the two interchangeable.)
      if (speed <= 0) throw new Error(`preset "${p.kind}": "speed" must be > 0 px/sec, got ${speed}`)
      const distance = Math.hypot(to[0] - from[0], to[1] - from[1])
      // The derived twin of `overrides()`' `duration <= 0` rejection, and for
      // the same reason: `localTime` divides by `duration`, so a zero is not a
      // degenerate animation but a division by zero. A positive `speed` over a
      // zero-length move derives exactly that, and nothing downstream could
      // tell it apart from an authored `duration: 0`. Reachable from the
      // defaults alone — `{kind: 'move', speed: 60}` is `[0,0]` → `[0,0]` —
      // so it names the endpoints rather than the speed, which is where the
      // mistake is.
      if (distance <= 0) {
        throw new Error(
          `preset "${p.kind}": "speed" derives the duration from the distance between ` +
          `"from" and "to", which must be > 0 — both are ` +
          `[${from[0]}, ${from[1]}], so the move goes nowhere and the derived ` +
          'duration is 0. Drop "speed", or move the layer somewhere.',
        )
      }
      tr.duration = distance / speed
    }
    return overrides(tr, p)
  },

  /**
   * Turn about one axis. `from`/`to` are **degrees**, a delta from the layer's
   * resting orientation, and both default to 0.
   *
   * **Degrees in, radians out, and the conversion happens here.** The channels
   * this writes are radians — that is what `CanvasLike.rotate` takes and what
   * `Math.cos` is fed for the two axis rotations in `raster.ts` — while the
   * parameter is degrees because that is the unit a scene author writes and
   * the unit `shape.start`/`end` already use elsewhere in the same file format.
   * Nothing between the scene file and here converts, so a preset that keyed
   * `num(p, 'to', 0)` straight into `rotate` would turn a requested 180° into
   * 180 radians — ~28.6 full turns, which under `once` lands back at a
   * near-identity pose and reads as "the rotation did nothing".
   *
   * `axis` names the channel rather than the appearance: `'z'` is the in-plane
   * spin and is the default, because that is what "rotate" means without
   * qualification and it is the one rotation that is a true rotation under an
   * orthographic projection (§ `Transform`).
   *
   * Only the named axis is keyed, so two `rotate` animators on different axes
   * compose — `composeAnim` sums all three rotation channels.
   */
  rotate: p => {
    const axis = oneOf(p, 'axis', ROTATION_AXES, 'z')
    const channel = ROTATION_CHANNEL[axis]
    return overrides({
      keys: [
        { t: 0, [channel]: degToRad(num(p, 'from', 0)) },
        { t: 1, [channel]: degToRad(num(p, 'to', 0)) },
      ],
      ease: 'linear',
      repeat: 'once',
    }, p)
  },

  /**
   * Grow or shrink. `from`/`to` are **absolute multipliers** and both default
   * to 1.
   *
   * **Absolute, not a delta — and that is not an inconsistency with the other
   * verbs.** `composeAnim` *multiplies* this one channel and sums every other,
   * so `scale`'s rest value is 1 rather than 0; for a multiplicative channel
   * the absolute factor already *is* the delta from rest, and there is nothing
   * to subtract. Writing `to − 1` to match the additive verbs would make the
   * default track key 0 → 0 and collapse every bare `scale` layer to a point
   * — a zero-scale catastrophe, not a rounding difference.
   *
   * Uniform only: `Transform` has one `scale`, deliberately, because a
   * non-uniform pair and a `rotateY` describe overlapping deformations and the
   * rotation is the one that carries depth meaning (§ `Transform`).
   */
  scale: p => overrides({
    keys: [
      { t: 0, scale: num(p, 'from', 1) },
      { t: 1, scale: num(p, 'to', 1) },
    ],
    ease: 'linear',
    repeat: 'once',
  }, p),

  /**
   * Mirror the layer. A **constant** half turn about x or y, defaulting to y.
   *
   * **This is static sugar, not a motion, and the two are kept
   * non-overlapping on purpose.** Animating a flip already has a spelling:
   * `{kind: 'rotate', axis: 'y', from: 0, to: 180}`. What `rotate` cannot
   * express without ceremony is the common case — a layer that simply faces
   * the other way, with no animation involved — and a `flip` that swept would
   * be `rotate` under a worse name while leaving the static mirror unsayable.
   * `Transform` makes this possible by having no separate mirror channel: a
   * mirror *is* a half turn, which is also why the in-between values of a
   * `rotate` are meaningful (§ `Transform`).
   *
   * One key rather than two at the same value. A constant is better stated by
   * having nothing to interpolate between than by two endpoints that a later
   * edit could pull apart; `evalTrack` returns the single key's value across
   * the whole span, whatever `ease`, `repeat` or `duration` say.
   *
   * `degToRad(180)` rather than a literal `Math.PI` so that a half turn is
   * written in the same unit the `rotate` verb takes — the two are the same
   * angle and should read as it. The conversion is exact at 180.
   */
  flip: p => overrides({
    keys: [{ t: 0, [ROTATION_CHANNEL[oneOf(p, 'axis', FLIP_AXES, 'y')]]: degToRad(180) }],
    ease: 'linear',
    repeat: 'once',
  }, p),

  /**
   * Rise out of the background. `from`/`to` are **absolute** depths — `to`
   * defaults to the layer's own depth, so `{kind: 'push'}` means "come up
   * from the noise to wherever this layer lives".
   *
   * Keys are emitted as offsets relative to the layer's base depth, because
   * that is what the transform model composes. Keying absolute values here is
   * exactly the bug this replaced: a layer at depth 1 animated 1→2 and clamped
   * to a static surface.
   *
   * **`ease: 'easeOut'` is deliberate, and it contradicts design §4.2. Do not
   * "fix" it to `linear`.** §4.2 says all five verbs default to
   * `ease: 'linear'` because "verbs are unopinionated primitives", and names
   * opinionated defaults as the very thing that disqualified `emerge` from
   * being a verb. But §4.2b requires `push` to compile to **precisely** what
   * `emerge` did — that is the whole reason the golden corpus was captured
   * before the rename, to prove the rename was a rename and not a rewrite —
   * and `emerge` defaulted to `easeOut`. The exact-reproduction requirement is
   * the stronger of the two, so it wins, and `push` is the one verb carrying an
   * opinionated default: by inheritance, not by choice.
   *
   * Changing this word reddens `presets.golden.json` on both `push/bare` and
   * `push/params`, and makes `presets.golden.test.ts`'s `OVERRIDE_EASE`
   * reasoning wrong (`easeIn` is chosen there as the one easing no preset
   * defaults to — which depends on this `easeOut`). If the conflict is to be
   * resolved the other way, that is a design decision about whether `push`
   * remains a faithful rename, not a one-word edit here.
   */
  push: (p, ctx) => overrides({
    keys: [
      { t: 0, depth: num(p, 'from', 0) - ctx.layerDepth },
      { t: 1, depth: num(p, 'to', ctx.layerDepth) - ctx.layerDepth },
    ],
    ease: 'easeOut',
    repeat: 'once',
  }, p),
} satisfies Record<string, PresetFn>

/**
 * The registered kinds, as a literal union.
 *
 * `satisfies` above rather than a type annotation is what keeps this narrow:
 * an annotation would widen the object's own type to `Record<string, …>` and
 * `keyof` would give back `string`, which is no constraint at all. The union
 * exists so that `PRESET_PARAMS` can be keyed by it and a verb registered
 * without parameter descriptors is a compile error (§6a).
 */
export type PresetKind = keyof typeof REGISTRY

/**
 * The registry as consumed. Deliberately **not** narrowed to `PresetKind`:
 * `compilePreset` below looks it up with a plain `string` taken from the scene
 * file, and both scene validators ask the same question of unvalidated input.
 * Narrowing the public type would push a cast into all three call sites to buy
 * nothing — the compile-time tie we actually want is on the descriptor table,
 * where a missing entry is the failure mode, not here.
 *
 * **All three sites must ask `Object.hasOwn`, never `kind in PRESETS`.** This
 * is a plain object literal, so `in` answers `true` for the dozen keys on
 * `Object.prototype`. All three asked it the wrong way: `compilePreset` below
 * indexed bare, and both scene validators asked `kind in PRESETS`. All three
 * are now guarded — `site/scene.ts` and `compilePreset` together, `src/cli/
 * scene.ts` after it, where the symptom was a validator *accepting* the scene
 * rather than a wrong render. What makes a wide public type safe is the guard
 * at each lookup, not the type, so a fourth consumer inherits nothing from
 * these three being right.
 */
export const PRESETS: Record<string, PresetFn> = REGISTRY

/**
 * Expand preset sugar into a track.
 *
 * Throws on an unknown kind. A no-op fallback here would render a perfectly
 * still scene with no diagnostic at all, so the error names the kind and lists
 * what is valid.
 *
 * `Object.hasOwn` is what makes the guard below reachable. A bare
 * `PRESETS[p.kind]` found inherited properties, so `{kind: 'constructor'}`
 * returned `Object` from the registry, `fn(p, ctx)` called it, and this
 * function handed back the `Preset` object itself typed as a `Track` — no
 * throw, nothing logged, a still frame. `{kind: 'toString'}` was worse: it
 * returned the *string* `"[object Undefined]"` as a `Track`. `{kind:
 * '__proto__'}` threw `TypeError: fn is not a function` from in here, naming
 * no field and no scene. The kind is a string from a scene file, and on the
 * site the scene is the URL, so none of those four are hypothetical.
 */
export function compilePreset(p: Preset, ctx: PresetCtx): Track {
  const fn = Object.hasOwn(PRESETS, p.kind) ? PRESETS[p.kind] : undefined
  if (!fn) {
    throw new Error(
      `unknown animation preset "${p.kind}" — valid kinds: ` +
      `${Object.keys(PRESETS).sort().join(', ')}`,
    )
  }
  return fn(p, ctx)
}
