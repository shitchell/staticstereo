import { sceneFps } from '../src/core/index.js'
import {
  frameTimesOf,
  initialTransport,
  pause as pauseAt,
  play as playAt,
  seek as seekAt,
  timeAt,
} from './transport.js'
import type { TransportState } from './transport.js'
import type { Scene } from '../src/core/types.js'

/**
 * The driver: the one piece that turns a playing {@link TransportState} into
 * repeated callbacks.
 *
 * It is a separate module from `transport.ts` on purpose. That module is a pure
 * state machine over values and nothing else, which is the property that lets
 * P3 lift it into the editor store wholesale; this one owns a loop and a
 * pending handle, and a store wants the machine without the loop. Keeping them
 * apart makes "the state machine holds nothing and schedules nothing" a fact
 * about a file rather than a claim about a subset of its exports.
 *
 * **Both the clock and the scheduler are arguments.** Nothing here reads a
 * clock or creates a timer, so a whole playback session — including a slow
 * render, a wrap and a seek — is expressible as a sequence of values in a test,
 * in plain node, with no DOM and no fake-timer plugin.
 */

/** A handle the caller's scheduler hands back, whatever shape it has. */
export interface TransportDriverOptions<Handle> {
  /** The wall clock, in milliseconds. */
  now(): number
  /** Arrange for `fn` after at least `ms` milliseconds. */
  schedule(fn: () => void, ms: number): Handle
  /** Un-arrange a handle this driver got from {@link schedule}. */
  cancel(handle: Handle): void
  /** Show this scene time, in **seconds**, already on the frame grid. */
  onFrame(seconds: number): void
  scene: Scene
}

export interface TransportDriver {
  play(): void
  pause(): void
  toggle(): void
  /** Jump the playhead to `seconds` and show it, playing or not. */
  seek(seconds: number): void
  /** Cancel everything, permanently. Idempotent. */
  stop(): void
  playing(): boolean
  /** The scene time currently on screen, in seconds. */
  time(): number
}

/**
 * Drive `scene` through the caller's scheduler.
 *
 * **Cadence, inherited from the player's `playLoop`:** each tick asks for
 * `1000 / sceneFps(scene)` minus the milliseconds the frame itself took. A
 * stereogram render is frequently slower than the frame interval, and asking
 * for the full interval afterwards lets the overrun compound into drift against
 * real time; subtracting it keeps the loop honest and keeps the tab responsive.
 * The remainder floors at 0 rather than going negative.
 *
 * **Paced by a timeout, not by requestAnimationFrame — preserved deliberately.**
 * rAF matches the display and stops in a background tab, both genuinely
 * desirable; but it fires at the display's rate, so a 12 fps scene would be
 * sampled 60 times a second and 4 of every 5 samples would re-encode a frame
 * already on screen. The scene's own fps is the right sampling rate, and a
 * stereogram frame is far too expensive to compute five times over. A caller
 * who wants display sync can inject an rAF-backed `schedule` instead: that
 * choice now lives at the composition root rather than being welded in here.
 */
export function runTransport<Handle>(options: TransportDriverOptions<Handle>): TransportDriver {
  const { now, schedule, cancel, onFrame, scene } = options
  const interval = 1000 / sceneFps(scene)
  /**
   * A still is never looped. The player this replaces breaks out of its loop on
   * `times.length <= 1`, and the state machine already guarantees a still's time
   * cannot advance — so a loop here would re-encode one unchanging stereogram
   * twelve times a second forever.
   */
  const animated = frameTimesOf(scene).length > 1

  // Per-driver, never module-level: two players on one page must not share a
  // playhead or a pending handle.
  const self = {
    state: initialTransport(scene) as TransportState,
    pending: undefined as Handle | undefined,
    stopped: false,
  }

  const clear = (): void => {
    if (self.pending !== undefined) {
      cancel(self.pending)
      self.pending = undefined
    }
  }

  const arm = (ms: number): void => {
    clear()
    self.pending = schedule(tick, ms > 0 ? ms : 0)
  }

  const emit = (at: number): void => {
    onFrame(timeAt(self.state, at, scene))
  }

  function tick(): void {
    // The handle that just fired is spent; dropping it before anything else
    // keeps `clear` from cancelling a stale id that a scheduler may have reused.
    self.pending = undefined
    if (self.stopped || !self.state.playing) return
    const started = now()
    emit(started)
    const spent = now() - started
    arm(interval - (Number.isFinite(spent) ? spent : 0))
  }

  return {
    play(): void {
      if (self.stopped || self.state.playing || !animated) return
      self.state = playAt(self.state, now())
      // The first tick is a whole interval away: the frame the playhead is
      // already on is already on screen, and re-emitting it on play would
      // re-render it for nothing.
      arm(interval)
    },

    pause(): void {
      clear()
      if (!self.state.playing) return
      self.state = pauseAt(self.state, now(), scene)
    },

    toggle(): void {
      if (self.state.playing) this.pause()
      else this.play()
    },

    seek(seconds: number): void {
      if (self.stopped) return
      const at = now()
      self.state = seekAt(self.state, seconds, at, scene)
      // Emitted rather than left to the caller: a seek changes which frame
      // should be on screen *now*, and the driver is the thing that knows how
      // to put one there. A pause does not emit, because the time did not move.
      emit(at)
      // Re-armed from the seek, not from whenever the superseded tick was due,
      // so a scrub does not produce a frame a millisecond later.
      if (self.state.playing) arm(interval)
    },

    stop(): void {
      clear()
      if (self.state.playing) self.state = pauseAt(self.state, now(), scene)
      // Disposed, not merely paused. Teardown has to be final: a `play` queued
      // behind an unmount would otherwise resurrect a loop rendering into a
      // canvas that is gone.
      self.stopped = true
    },

    playing(): boolean {
      return self.state.playing
    },

    time(): number {
      return timeAt(self.state, now(), scene)
    },
  }
}
