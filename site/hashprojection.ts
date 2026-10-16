import { encodeSceneHash } from './hash.js'
import type { SceneStore, Unsubscribe } from './store.js'
import type { UiState } from './controls.js'
import type { AssertNever } from '../src/core/index.js'

/**
 * The URL fragment as a **projection of the store** (design §3.4, R13).
 *
 * There is no backend, so the link is the save format. The question this
 * module answers is not *how* a scene becomes a fragment — `hash.ts` is a pure
 * codec and has answered that — but *when*, and by whose authority.
 *
 * **Why a projection and not a sync.** The editor it replaces calls a
 * `syncHash()` by hand after each mutation, at four call sites. Every one of
 * them is correct; the arrangement is not, because correctness is a property
 * of the *set* of call sites and nothing holds the set. A fifth mutation path
 * that forgets the call desynchronises the link from the picture silently, and
 * no test can see it — the state is module-level `let`s inside a file nothing
 * imports. Here the write is produced by subscribing: there is one path, it is
 * attached once, and a new mutation path cannot forget to use it because it
 * does not know it exists. That is the difference between a convention and a
 * projection, and it is the whole of this module's content.
 *
 * **`read`, `write` and the tick are arguments.** `transportdriver.ts` makes
 * the same choice for the clock and the scheduler and gives the reason this
 * module inherits: with the ambient thing injected, a whole editing session is
 * expressible as a sequence of values in a test, in plain node, with no DOM.
 * Neither `location` nor `history` nor any timer is named anywhere below, and
 * `hashprojection.test.ts` asserts both by parsing **this module's whole
 * import closure** — so the paragraphs here are free to discuss them, which
 * they must, since what this module refuses to touch is most of its rationale.
 *
 * That sentence used to end *"by parsing this file"*, and the scope was the
 * defect. It was literally true and narrower than the property it stood in
 * for: `hash.ts` is this module's one runtime import, it was outside the scan,
 * and a `Date.now()` and a `location.hash` planted in it left the whole
 * repository green at 99 files / 2227 passed / exit 0. A projector whose codec
 * samples a clock has a fragment that depends on when it was produced, and
 * every behavioural test here injects the schedule and would never notice.
 *
 * **The guard reads the fragment rather than remembering its last write.**
 * Both answer "has anything changed?", and they differ exactly when something
 * *else* moved the fragment — a Back button, a pasted link, a `hashchange`.
 * A remembered value then claims the URL already holds a projection it no
 * longer holds, and the store and the link part company with nothing able to
 * see it. The editor being replaced carries that defect in the other
 * direction: its early return skips the write without updating the remembered
 * value, so its `hashchange` listener can test incoming fragments against a
 * value that was never written. Holding no state removes the whole class, and
 * costs one read per accepted mutation.
 *
 * That also answers the question the remembered value existed for. A consumer
 * asking *"is this incoming fragment the one we put there?"* compares it to
 * {@link projectedHash} of the current state — derived, so it cannot go stale
 * — instead of to a record of what was last written.
 *
 * **The coalescing is here and not in the store** (design §3.4, criterion 15).
 * A slider drag fires dozens of `input` events and each one is a `dispatch`;
 * uncoalesced that is dozens of `replaceState` calls a second, which is the
 * cost `main.ts` already names one level up as its reason for `replaceState`
 * over `pushState`. The store stays synchronous — "what is on screen" must
 * never depend on a timer, and undo and this module would otherwise have to
 * share one batching policy neither of them chose — so the batching lives on
 * the write side, which is the only side that wants it.
 *
 * **What is deliberately NOT here.**
 *
 *  - *No timer, and no opinion about which queue.* {@link Schedule} is an
 *    argument with no default, exactly as `transportdriver.ts` takes `now`,
 *    `schedule` and `cancel` with none — "that choice now lives at the
 *    composition root rather than being welded in here". A default would make
 *    the coalescing policy of every editor on the page a property of this
 *    file, and would let a caller inherit a tick it never asked for; required,
 *    the compiler names every site that has to decide.
 *  - *No loading.* Fragment → scene is the inverse projection, it needs the
 *    validator and somewhere to put an error message, and it runs once at boot
 *    rather than on every mutation. Nothing is shared but the codec.
 *  - *No validity filter.* The reducer applies what it is given even when the
 *    result is unrenderable — `controls.ts` argues that at length — so a
 *    fragment written here can carry a scene the canvas is currently refusing
 *    to draw. The editor being replaced has the same behaviour for a different
 *    reason (it syncs before it paints). **Whether a link should be able to
 *    carry an unrenderable scene is an open question and not this module's to
 *    settle**: answering "no" costs a predicate at the composition root, and
 *    answering "yes" is what shipping a broken scene to a collaborator for
 *    diagnosis requires. Changed here, it would be settled by accident.
 */

/**
 * The fields of `UiState` a link carries — today, `scene` and nothing else.
 *
 * **The partition is data, so that growing `UiState` forces a decision.** The
 * fields left out are not an oversight and not a property of the encoder:
 * `time` is a scrub position snapped onto the frame grid, `depthView` chooses
 * which of two pictures the canvas shows, and a shared link carries the scene.
 * Written down and made total by the `AssertNever` pairs below, a further
 * field cannot be added to the state without someone saying which side it
 * falls on — which is the thing a comment could not have made happen. It has
 * already happened once, which is the evidence that it works: `transport`
 * arrived with criterion 9 and reddened the compiler here until it was
 * classified.
 */
export const PROJECTED_FIELDS = ['scene'] as const

/**
 * The rest of `UiState`. See {@link PROJECTED_FIELDS} for why the split is data.
 *
 * **`transport` is unprojected, and not only because `time` is.** Half of it
 * is `anchorMs`, a reading of *this* machine's wall clock, which means
 * nothing on the machine that opens the link; and `playing` would make a
 * shared scene start moving on arrival, which is a decision about how a link
 * behaves rather than about which scene it names. The scene-time half is
 * `anchorTime`, and that is `time` — the same number under its other name —
 * so projecting `transport` would also put the excluded scrub position into
 * the link by the side door.
 */
export const UNPROJECTED_FIELDS = ['time', 'depthView', 'transport'] as const

type ProjectedField = typeof PROJECTED_FIELDS[number]
type UnprojectedField = typeof UNPROJECTED_FIELDS[number]

// Totality in both directions plus disjointness, the `layout.ts` pattern: a new
// `UiState` field fails the first, a field removed from `UiState` fails the
// second, and a field listed on both sides fails the third.
type _NoFieldUnclassified = AssertNever<Exclude<keyof UiState, ProjectedField | UnprojectedField>>
type _NoFieldInvented = AssertNever<Exclude<ProjectedField | UnprojectedField, keyof UiState>>
type _NoFieldOnBothSides = AssertNever<ProjectedField & UnprojectedField>

/**
 * The fragment body `state` projects to — **no leading `#`**.
 *
 * The `#` is punctuation belonging to the fragment and not to the payload, and
 * keeping it out here is what lets this function be compared against
 * `encodeSceneHash` directly and parsed by `parseSceneHash` without a strip.
 * {@link attachHashProjection} adds it, once.
 */
export function projectedHash(state: UiState): string {
  // Indexed through the roster rather than spelled `state.scene`, so the
  // roster is the code and not a description of it. A roster nothing reads is
  // a comment with a type annotation, and would drift the first time the
  // partition moved.
  return encodeSceneHash(state[PROJECTED_FIELDS[0]])
}

/** Somewhere to put a fragment, and a way to see the one that is there. */
export interface HashTarget {
  /**
   * The fragment as it stands: `'#…'` when there is one, `''` when there is
   * not. That is `location.hash`'s own convention, so the browser adapter is
   * the identity and a test double is three lines.
   */
  read(): string
  /** Install `fragment`, leading `#` included. */
  write(fragment: string): void
}

/**
 * Arrange for `flush` at the end of the current tick.
 *
 * `queueMicrotask` is the intended argument and what design §3.4 asks for:
 * the write lands before the task that caused it yields to the event loop, so
 * a copied link is never a tick behind the picture, and a whole gesture —
 * every `input` event of a slider drag is one task — still collapses into one
 * write. A caller wanting a frame-paced or idle-paced URL passes something
 * else; a test passes a queue it cranks by hand.
 *
 * **It is deliberately not {@link HashTarget}'s third member.** That
 * interface answers *where* the fragment is and its browser adapter is very
 * nearly the identity; this answers *when*, which is a policy and the only
 * thing a caller is likely to want to vary on its own.
 *
 * **And it hands back nothing to cancel with.** A microtask cannot be
 * un-queued, so unlike `transportdriver.ts` — which takes a `cancel` because
 * a timeout genuinely can be cleared — detachment here is a flag the flush
 * reads. Asking for a handle this module could not use on the one scheduler
 * it is built for would be a cost paid by every caller for nothing.
 */
export type Schedule = (flush: () => void) => void

/**
 * Project `store` onto `target` for as long as the returned function is
 * uncalled.
 *
 * **Nothing is written on attach.** Attaching is not a mutation, and the page
 * was in all likelihood opened on a link whose fragment is already the thing
 * this would write; a projector that wrote anyway would rewrite the reader's
 * URL before they had touched anything, and would make "one mutation, one
 * write" false at the one moment nothing had been mutated. The composition
 * root dispatches whatever it loaded, and that is the write.
 *
 * **Which makes the projector converge rather than diff**, and the two
 * properties are a pair. Between attaching and the first mutation the fragment
 * may not be the projection — on a first visit there is no fragment at all —
 * and the next notification closes that gap whatever field caused it. So "a
 * mutation of an excluded field never writes" is true *once the fragment
 * agrees*, and false for the first mutation after it does not; the stronger
 * reading costs a remembered previous projection, which is the state this
 * module exists without, and buys a page that can sit indefinitely holding a
 * fragment that is not its scene.
 *
 * The alternative — writing on attach, which would make the fragment agree
 * from the start and the exclusion unconditional — was declined on a concrete
 * harm: a reader who arrives on a *broken* link gets an error naming it, and
 * an attach-time write would replace the evidence with the default scene
 * before they could read it.
 *
 * ## Coalescing
 *
 * A notification does not write; it asks `schedule` for a flush, and only if
 * one is not already pending. So N mutations in one tick are one flush and at
 * most one write — criterion 15 — and the gesture's *final* state is what
 * reaches the link, because the flush projects {@link SceneStore.state} as it
 * stands when it runs rather than the state it was notified with. That is
 * `store.ts`'s own re-entrancy rule applied one level out: it reads the state
 * at call time so that no subscriber is ever handed a value disagreeing with
 * `state()`, and a projector that wrote a captured state would be the
 * subscriber that reinstated the disagreement.
 *
 * **"One write" is "at most one write", and the difference is the guard.** A
 * tick whose mutations cancel out — a slider dragged away and back, an undo
 * inside one gesture — leaves the projection where it was, and the unchanged
 * fragment is skipped exactly as it is outside a tick. The rule the tests
 * pin is therefore *a write happens exactly when the projection moved across
 * the tick*, which is the per-mutation rule with "the tick" substituted for
 * "the mutation" and nothing else changed.
 */
export function attachHashProjection(
  store: SceneStore,
  target: HashTarget,
  schedule: Schedule,
): Unsubscribe {
  // Per-attachment and never module-level, for the reason `store.ts` gives for
  // its own `self`: two editors on one page, and two tests in one file, must
  // not share a pending flush — sharing one drops every write but the first.
  const self = { pending: false, detached: false }

  const flush = (): void => {
    // Cleared first, so a mutation made *during* the write — a `hashchange`
    // handler, a panel reacting to the URL — schedules a further flush
    // instead of seeing one still pending and being dropped. Clearing it
    // afterwards looks equally correct and loses that mutation permanently.
    self.pending = false
    // A queued microtask cannot be withdrawn, so the detach is honoured here.
    // Without this a panel unmounting mid-gesture still gets one last word on
    // the URL, from a projector that no longer exists.
    if (self.detached) return
    const fragment = `#${projectedHash(store.state())}`
    // Skipped rather than written: `replaceState` with an unchanged fragment
    // is not free — it is a history-entry edit per slider tick — and the
    // editor's own reason for `replaceState` over `pushState` ("a slider drag
    // would otherwise fill the history stack") is an argument about the same
    // cost one level up.
    if (target.read() === fragment) return
    target.write(fragment)
  }

  // The notification carries the state and this ignores it, deliberately: see
  // the note above on why the flush re-reads the store.
  const unsubscribe = store.subscribe(() => {
    if (self.pending) return
    self.pending = true
    schedule(flush)
  })

  return () => {
    self.detached = true
    unsubscribe()
  }
}
