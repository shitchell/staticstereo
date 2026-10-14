import { frameTimes } from '../src/core/index.js'
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
