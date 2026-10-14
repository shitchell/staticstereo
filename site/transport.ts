import { frameTimes, sceneFps } from '../src/core/index.js'
import type { Scene } from '../src/core/types.js'

/**
 * Scene time: the frame grid, and the transport over it.
 *
 * This module is deliberately the player's, not the editor's. It holds no DOM,
 * reads no clock and keeps no module-level mutable state — wall-clock time
 * arrives as a parameter and state is a plain value passed in and returned —
 * because the execution plan has P3 lifting the transport primitive
 * (`currentTime`, play/pause/seek) into the editor store, where P4 and P6 both
 * consume it. Anything entangled with the player's page here cannot be lifted,
 * and the P4↔P6 dependency cycle stays broken. The same constraint is what
 * makes every rule below testable in plain node, with no browser.
 *
 * The frame grid moved here out of `controls.ts`, which carries `UiState` and
 * `reduce`: the player needs the grid and must not pull the editor's reducer
 * into its bundle to get it. `controls.ts` re-exports these names rather than
 * keeping a second copy — see `transport.test.ts` for why that distinction is
 * asserted by object identity.
 */

/** `frameTimes`, re-exported through here so the page has one import for the grid. */
export function frameTimesOf(scene: Scene): number[] {
  return frameTimes(scene)
}

export function lastFrameTime(scene: Scene): number {
  const times = frameTimes(scene)
  return times[times.length - 1]!
}

/**
 * The frame whose sample time is nearest `seconds`.
 *
 * Ties resolve to the lower index: scanning ascending and only accepting a
 * strictly smaller distance makes the result independent of float noise in the
 * midpoint, which `<` on an exact tie would not be.
 */
export function frameIndexAt(scene: Scene, seconds: number): number {
  const times = frameTimes(scene)
  const t = Number.isFinite(seconds) ? seconds : 0
  let best = 0
  let bestDistance = Math.abs(times[0]! - t)
  for (let i = 1; i < times.length; i++) {
    const d = Math.abs(times[i]! - t)
    if (d < bestDistance) {
      bestDistance = d
      best = i
    }
  }
  return best
}

export function timeOfFrame(scene: Scene, index: number): number {
  const times = frameTimes(scene)
  const i = Number.isFinite(index) ? Math.round(index) : 0
  return times[i < 0 ? 0 : i >= times.length ? times.length - 1 : i]!
}

/* ------------------------------------------------- the transport state machine */

/**
 * Where the playhead is, and whether it is moving. **Scene time is in seconds**,
 * the unit `renderFrame(scene, seconds, …)` takes; wall-clock time is in
 * milliseconds, the unit every clock a caller can inject reports.
 *
 * The pair (`anchorTime`, `anchorMs`) rather than a single stored time is the
 * whole design. A transport that remembered only when playback *started* counts
 * the time it spent paused as elapsed scene time, and leaps forward on resume —
 * a bug that is invisible on a 2-second loop watched for 2 seconds and glaring
 * on one left paused in a background tab. Re-anchoring on every transition
 * makes the paused interval structurally uncountable.
 */
export interface TransportState {
  readonly playing: boolean
  /** Scene seconds at the anchor; always a point of `frameTimes(scene)`. */
  readonly anchorTime: number
  /**
   * The wall clock in milliseconds when the anchor was taken. Meaningless while
   * paused — nothing reads it until the next `play` overwrites it — and kept in
   * the type anyway so the state has one shape rather than two.
   */
  readonly anchorMs: number
}

/**
 * The wall-clock seconds one loop of the scene takes.
 *
 * The **grid span**, `frames / fps`, not `scene.duration`. They differ whenever
 * `duration × fps` is not a whole number, because the grid is
 * `count = max(1, round(duration × fps))` samples at `i / fps`: a 0.55s scene at
 * 12fps has 7 frames spanning 0.5833s. Wrapping on `duration` would land
 * between frames every loop and so duplicate or drop one; wrapping on the span
 * reproduces exactly what the player does today with
 * `(currentFrame + 1) % times.length`.
 *
 * Always positive — `count` floors at 1 and `sceneFps` never returns 0 — so it
 * is safe as a modulus. For a still it is a formality: the grid has one point,
 * every time snaps to it, and the modulus is unobservable.
 */
export function loopDuration(scene: Scene): number {
  return frameTimes(scene).length / sceneFps(scene)
}

/**
 * Snap a scene time onto the frame grid.
 *
 * Composed from the two moved functions rather than restating their arithmetic,
 * so there is still exactly one definition of "nearest frame" in the project.
 */
export function snapTime(scene: Scene, seconds: number): number {
  return timeOfFrame(scene, frameIndexAt(scene, seconds))
}

/**
 * Fold a time into `[0, loopDuration)`.
 *
 * Wrapping, not clamping, on both sides: a scene plays, loops and does not stop
 * at the end, and a backwards nudge off the start should land at the end rather
 * than pile up at 0. A non-finite input becomes 0 instead of poisoning the
 * anchor — the same choice {@link frameIndexAt} already makes, and for the same
 * reason: the value reaching here came from a slider or a URL.
 */
function wrapTime(scene: Scene, seconds: number): number {
  if (!Number.isFinite(seconds)) return 0
  const span = loopDuration(scene)
  return ((seconds % span) + span) % span
}

/** Paused, on the scene's first frame. */
export function initialTransport(scene: Scene): TransportState {
  return { playing: false, anchorTime: timeOfFrame(scene, 0), anchorMs: 0 }
}

/**
 * The scene time to render at wall-clock `nowMs`, **in seconds, on the grid**.
 *
 * Two decisions, recorded because the alternatives are each defensible and the
 * mixture is not:
 *
 * **Snapped, not continuous.** `renderFrame` is only well-defined at the times
 * `frameTimes` enumerates, so returning continuous time would hand every caller
 * the same snapping obligation and hand the one caller who forgets an undefined
 * render. It also makes a still total for free: one grid point means a still's
 * time provably cannot advance. If a smooth playhead ever needs the unsnapped
 * value it should arrive as its own named function, so that this one keeps
 * meaning exactly one thing.
 *
 * **One second of scene time per second of wall time.** Scene fps governs how
 * often the grid is *sampled*, never the rate — reaching for `fps` in this
 * arithmetic is how a 60fps scene ends up playing at 5x.
 */
export function timeAt(state: TransportState, nowMs: number, scene: Scene): number {
  if (!state.playing) return snapTime(scene, state.anchorTime)
  const elapsedMs = nowMs - state.anchorMs
  const elapsed = Number.isFinite(elapsedMs) ? elapsedMs / 1000 : 0
  return snapTime(scene, wrapTime(scene, state.anchorTime + elapsed))
}

/**
 * Start playing from where the playhead already is.
 *
 * A second `play` on a playing transport returns it **unchanged**, rather than
 * re-anchoring: re-anchoring would snap the current time and so discard the
 * sub-frame phase, losing up to a frame each call. The driver leans on this.
 */
export function play(state: TransportState, nowMs: number): TransportState {
  if (state.playing) return state
  return { playing: true, anchorTime: state.anchorTime, anchorMs: nowMs }
}

/** Stop, keeping the time the playhead had reached at `nowMs`. */
export function pause(state: TransportState, nowMs: number, scene: Scene): TransportState {
  if (!state.playing) return state
  return { playing: false, anchorTime: timeAt(state, nowMs, scene), anchorMs: nowMs }
}

/**
 * Move the playhead to `seconds`, playing or not.
 *
 * Playing stays playing — a scrub during playback is a jump, not a stop — and
 * re-anchoring at `nowMs` is what makes it one: `timeAt` at that same `nowMs`
 * returns the sought time, with no elapsed interval to account for.
 */
export function seek(
  state: TransportState,
  seconds: number,
  nowMs: number,
  scene: Scene,
): TransportState {
  return {
    playing: state.playing,
    anchorTime: snapTime(scene, wrapTime(scene, seconds)),
    anchorMs: nowMs,
  }
}

/** Play if paused, pause if playing. The time does not move either way. */
export function toggle(state: TransportState, nowMs: number, scene: Scene): TransportState {
  return state.playing ? pause(state, nowMs, scene) : play(state, nowMs)
}
