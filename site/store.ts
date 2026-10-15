import { reduce } from './controls.js'
import type { Action, UiState } from './controls.js'

/**
 * The scene store: the editor's single source of truth for live state.
 *
 * **It holds state and notifies; it decides nothing.** Every transition is
 * `controls.ts`'s `reduce`, which already exists, is already pure and is
 * already tested against the frame grid and the validator. A store that
 * re-implemented any arm of it would be this repo's signature defect in a new
 * place — the animatable-channel list is guarded in `track.ts` and duplicated
 * unguarded in two validators, and both of those silently drop channels
 * because of it. So the delegation is the design, and `store.test.ts` sweeps
 * every `Action` variant the type declares to assert that dispatching through
 * here and calling `reduce` directly cannot disagree.
 *
 * **Why a factory and not a module-level value.** `transportdriver.ts` already
 * records the reason for its own `self` object — "two players on one page must
 * not share a playhead" — and the store's version is sharper: R2/R8's reduced
 * editor is a second instance of the same application, and the suite itself
 * needs stores that cannot leak into one another between tests. Nothing here
 * is declared with `let` at module scope, which `store.test.ts` asserts both
 * behaviourally (two stores, one mutated) and off the source text, because the
 * two fail on different things.
 *
 * **What is deliberately NOT here.**
 *
 *  - *No URL hash, and no `location` or `history` at all.* Design §3.4 makes
 *    the hash a projection *of* the store; a projection that lived inside its
 *    subject could not be swapped out for a test double, and the whole value
 *    of this module is that it is exercisable in plain node. The projector is
 *    a separate module taking `{read, write}` the way `transportdriver.ts`
 *    takes `{now, schedule}`, and {@link subscribe} is the seam it attaches to.
 *  - *No coalescing, and no scheduler.* Every `dispatch` notifies
 *    synchronously. Batching N mutations in a tick into one write is the
 *    projector's job and belongs on the write side: a store that coalesced its
 *    own notifications would make "what state is on screen" depend on a timer,
 *    and would force undo and the projector to share one batching policy they
 *    do not both want.
 *  - *No history, no marks, no undo.* Mark-based history accumulates
 *    `dispatch`es and flushes them as one entry, so it is a consumer of this
 *    module and not a field on it. `OPERATIONS` already carries the `mark` per
 *    entry that it will read.
 *  - *No equality check before notifying.* A `dispatch` that `reduce` accepts
 *    notifies, full stop. The alternative needs a comparison policy — deep?
 *    by `scene` identity? — and whichever one is chosen becomes a thing every
 *    subscriber has to know in order to reason about what it will and will not
 *    be told. `reduce` returns a fresh object for every arm, so the dedupe
 *    would almost never fire anyway, and a subscriber that wants one can hold
 *    the last value it saw.
 *
 * **Scene time is `UiState.time` and nothing else.** `controls.ts` snaps it
 * with `snapTime` and this module adds no second rule; `TransportState` and
 * its `anchorTime` are not held here. Reconciling the two representations is
 * its own task with its own invariant (`seek` and `snapTime` must select the
 * same frame for every t), and a store that quietly held both would be the
 * place the disagreement became permanent.
 *
 * **The depth selection is `UiState`'s `DepthView` by force, not by
 * preference.** `views.ts` declares the identical union as `DepthSource` and
 * records at its declaration that the collision is deliberate. Holding that
 * one instead would mean a second state type and a translation at every
 * `dispatch` — new logic, in the module whose contract is that it adds none —
 * so the store holds `UiState` whole and inherits the spelling that
 * `reduce` already speaks. Which of the two names survives is a decision for
 * whoever ties them; this module does not cast a vote by renaming either.
 */

/** Stop receiving notifications. Calling it more than once does nothing. */
export type Unsubscribe = () => void

/**
 * Called after every accepted mutation, with the store's state.
 *
 * The argument is always identical to {@link SceneStore.state}'s answer at the
 * moment of the call — see the note on re-entrancy in {@link createSceneStore}.
 */
export type Subscriber = (state: UiState) => void

export interface SceneStore {
  /** The current state. Never a copy, so identity comparison is meaningful. */
  state(): UiState
  /**
   * Apply an {@link Action}.
   *
   * Throws whatever `reduce` throws — an out-of-range layer index, a text
   * patch the editor refuses — and leaves the state untouched when it does.
   * Rethrowing rather than swallowing is deliberate: the caller is the thing
   * with somewhere to put the message, and a store that absorbed a refusal
   * would make a rejected edit indistinguishable from an applied one to every
   * subscriber downstream.
   */
  dispatch(action: Action): void
  /** Register `listener`, and hand back the way to remove it. */
  subscribe(listener: Subscriber): Unsubscribe
}

/** A registration, boxed so its identity is the thing an unsubscriber removes. */
interface Registration {
  readonly listener: Subscriber
}

/**
 * A store over `initial`.
 *
 * **`initial` is a `UiState` and not a `Scene`**: building one is
 * `initialState`'s job, and it materialises the stereo settings and snaps the
 * time, which are policies a caller may legitimately want to skip when
 * restoring a state it already has. The composition root spells
 * `createSceneStore(initialState(scene))`, which costs one call and keeps this
 * module from owning a construction rule it would then have to version.
 *
 * ## Notification order and re-entrancy, both decided here
 *
 * Subscribers are called in subscription order. That is observable, so it is
 * fixed rather than left to a `Set`'s iteration accident, and there is no
 * priority scheme — a consumer that needs to run after another should subscribe
 * after it or compose the two.
 *
 * A subscriber may subscribe, unsubscribe or dispatch from inside its own
 * callback, and all three are resolved rather than forbidden:
 *
 *  - **Removed during a pass ⇒ not called in that pass.** The alternative
 *    delivers an update to a panel that has already said it is gone.
 *  - **Added during a pass ⇒ not called in that pass**, but live for the next.
 *    It subscribed after the state it would have been told about was already
 *    computed, and it can read {@link SceneStore.state} itself.
 *  - **Dispatching during a pass ⇒ the later subscribers see the newer
 *    state.** The state is read at call time rather than captured when the
 *    pass began, so no subscriber is ever handed a value that disagrees with
 *    `state()`. Capturing it would hand every subscriber after the re-entrant
 *    one a superseded state, and both of the consumers this seam exists for —
 *    the hash projection and the shell — would then render and write it.
 *
 * The iteration is over a snapshot so that a removal mid-pass cannot shift the
 * array under the loop and skip the next listener; membership is re-checked
 * per listener, which is what makes removal take effect immediately. That is
 * quadratic in the subscriber count, which is the right trade at a count
 * bounded by the number of mounted panels.
 */
export function createSceneStore(initial: UiState): SceneStore {
  // Per-store and never module-level: two editors on one page, and two tests
  // in one file, must not share a scene.
  const self = {
    state: initial,
    registrations: [] as Registration[],
  }

  return {
    state(): UiState {
      return self.state
    },

    dispatch(action: Action): void {
      // Computed before the commit, so a `reduce` that throws leaves the store
      // exactly as it was rather than half-edited. `controls.ts` takes the same
      // care one level down, where `patchText` throws before anything is built.
      const next = reduce(self.state, action)
      self.state = next
      const pass = [...self.registrations]
      for (const registration of pass) {
        if (!self.registrations.includes(registration)) continue
        registration.listener(self.state)
      }
    },

    subscribe(listener: Subscriber): Unsubscribe {
      // Boxed, so the unsubscriber removes *this* registration rather than
      // every registration of the same function. Two panels passing the same
      // bound method are two subscribers, and the first to unmount must not
      // take the second one's updates with it.
      const registration: Registration = { listener }
      self.registrations.push(registration)
      return () => {
        const at = self.registrations.indexOf(registration)
        if (at >= 0) self.registrations.splice(at, 1)
      }
    },
  }
}
