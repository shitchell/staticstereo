import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as ts from 'typescript'
import {
  PROJECTED_FIELDS,
  UNPROJECTED_FIELDS,
  attachHashProjection,
  projectedHash,
} from './hashprojection.js'
import type { HashTarget, Schedule } from './hashprojection.js'
import { HASH_VERSION, encodeSceneHash, parseSceneHash } from './hash.js'
import { createSceneStore } from './store.js'
import { initialState } from './controls.js'
import type { Action } from './controls.js'
import type { Scene } from '../src/core/types.js'

const ANIM: Scene = { size: [64, 32], fps: 12, duration: 2, layers: [{ type: 'text', text: 'A' }] }
const OTHER: Scene = { size: [100, 50], layers: [{ type: 'text', text: 'B' }] }

const SOURCE = readFileSync(new URL('./hashprojection.ts', import.meta.url), 'utf8')

/* --------------------------------------------------------------- the double */

interface Recorder extends HashTarget {
  /** Every value {@link HashTarget.write} was called with, in order. */
  readonly writes: readonly string[]
  /**
   * Move the fragment **without** recording a write — the Back button, a
   * pasted link, a `hashchange` from anything that is not this projector.
   * Modelled because the projector's guard reads the fragment rather than
   * remembering what it last wrote, and that difference is only observable
   * when something else has moved it.
   */
  clobber(fragment: string): void
}

/**
 * A `{read, write}` pair that behaves like a real fragment: a write is visible
 * to the next read.
 *
 * A double whose `read` always answered `''` would make the projector write on
 * every mutation and the unchanged-guard untestable — the control in
 * *"the partition"* below would then pass for the wrong reason, which is this
 * project's standing failure mode in miniature.
 */
function recordingTarget(initial = ''): Recorder {
  const writes: string[] = []
  // Closure state, never module scope: two tests in one file must not share a
  // fragment, for the same reason `store.ts` gives for its own `self`.
  let fragment = initial
  return {
    read: () => fragment,
    write: (next: string) => {
      fragment = next
      writes.push(next)
    },
    writes,
    clobber: (next: string) => {
      fragment = next
    },
  }
}

/* ---------------------------------------------------------- the schedulers */

/**
 * Run the flush at once.
 *
 * The uncoalesced configuration, and what every test outside the coalescing
 * block uses. Those tests are about *what* is written and against which
 * fragment; a scheduler that deferred would make each of them assert across a
 * tick boundary that is not their subject, so their claims stay claims about
 * one notification, exactly as written. The coalescing block re-establishes
 * the load-bearing ones through a deferred scheduler as well, because "the
 * exclusion survives batching" is a different statement from "the exclusion
 * holds" and only the first is evidence that coalescing left them alone.
 */
const immediately: Schedule = flush => flush()

/**
 * A hand-cranked queue: nothing runs until {@link TickQueue.run}, and a flush
 * that schedules another lands in the *next* crank rather than extending this
 * one. That is what makes a crank a tick boundary rather than a drain, and it
 * is the whole reason the fake exists — "N mutations in one tick" has no
 * meaning against a scheduler with no ticks.
 */
interface TickQueue {
  readonly schedule: Schedule
  /** Run everything queued when the crank started; answers how many ran. */
  run(): number
  /** How many flushes are waiting. */
  depth(): number
}

function tickQueue(): TickQueue {
  // Closure state, never module scope, for the reason `recordingTarget` gives.
  const waiting: (() => void)[] = []
  return {
    schedule: flush => {
      waiting.push(flush)
    },
    run: () => {
      const due = waiting.splice(0)
      for (const flush of due) flush()
      return due.length
    },
    depth: () => waiting.length,
  }
}

/**
 * One turn of the **real** microtask queue.
 *
 * `await` on a settled promise enqueues its continuation behind whatever is
 * already queued, so a flush that `queueMicrotask` queued before this call has
 * run by the time it returns. Used wherever the question is *which* queue the
 * projector landed on: a fake scheduler is indistinguishable between
 * `queueMicrotask` and `setTimeout`, so a fake-only suite cannot see that
 * mistake, and the microtask/macrotask difference is the whole of design
 * §3.4's "on a microtask".
 */
const microtask = (): Promise<void> => Promise.resolve()

/* -------------------------------------------------- the Action vocabulary */

/**
 * One sample per {@link Action} variant, **total by the compiler**.
 *
 * Written as `{[K in Action['type']]: …}` rather than as an `Action[]`, so a
 * twelfth variant added to `controls.ts` is a typecheck failure naming the
 * variant rather than a sweep that quietly covers eleven. §9: *"a hand-written
 * list of 'the places that do X' is a check — it goes stale silently."*
 *
 * The one hole in that instrument is an `as`/`satisfies` escape; there is none
 * here, and `store.test.ts` closes it independently by reading the union out of
 * `controls.ts`'s source with a parser. Two totality instruments over one
 * vocabulary is enough; a third copy of its AST machinery here would be the
 * duplication this comment is warning about.
 *
 * Several samples where a variant has more than one *shape* of outcome — in
 * particular an index `reduce` rejects, because a rejected dispatch must leave
 * the fragment alone rather than half-written.
 */
const SAMPLES: { readonly [K in Action['type']]: readonly Extract<Action, { type: K }>[] } = {
  scene: [{ type: 'scene', scene: OTHER }],
  stereo: [{ type: 'stereo', patch: { seed: 9 } }, { type: 'stereo', patch: { sepNear: 1e6 } }],
  freezeNoise: [{ type: 'freezeNoise', value: true }],
  fps: [{ type: 'fps', value: 24 }, { type: 'fps', value: undefined }],
  duration: [{ type: 'duration', value: 3 }],
  size: [{ type: 'size', value: [80, 40] }],
  // Scene time: in the store, out of the hash. Both arms swept, because a
  // projection that carried it would only be caught by the one that moves.
  time: [{ type: 'time', seconds: 1.3 }, { type: 'time', seconds: 0 }],
  frame: [{ type: 'frame', index: 7 }],
  depthView: [{ type: 'depthView', value: 'encoded' }, { type: 'depthView', value: 'composited' }],
  // The transport: in the store, out of the hash, for the reason
  // `UNPROJECTED_FIELDS` records. These three rows are what the mapped type
  // above promised — criterion 9 added the variants and the compiler named
  // each one here rather than letting the sweep quietly cover eleven.
  play: [{ type: 'play', nowMs: 1_000 }],
  pause: [{ type: 'pause', nowMs: 1_500 }],
  seek: [{ type: 'seek', seconds: 1.3, nowMs: 2_000 }],
  layerAnim: [
    { type: 'layerAnim', index: 0, anim: { kind: 'push', to: 0.2 } },
    // Out of range: `reduce` throws, `dispatch` rethrows, and no subscriber
    // runs — so no write.
    { type: 'layerAnim', index: 4, anim: undefined },
  ],
  layerText: [
    { type: 'layerText', index: 0, patch: { size: 48 } },
    // Rejected at the edit by `patchText`; throws like the above.
    { type: 'layerText', index: 0, patch: { size: 0 } },
  ],
}

const EVERY_SAMPLE: readonly Action[] = Object.values(SAMPLES).flat()

/* ------------------------------------------------------------ AST sensors */

const BROWSER_GLOBALS = ['location', 'history', 'window', 'document', 'globalThis'] as const

/**
 * The ways a module could make its own tick instead of being handed one.
 *
 * Kept apart from {@link BROWSER_GLOBALS} rather than folded in, because the
 * two sensors fail for different reasons and a reader of a merged failure
 * could not tell "it touched the DOM" from "it welded in a scheduler" —
 * §6.5a's rule that a harness unable to say *which* failure happened has told
 * you almost nothing. `Promise` is on the list because
 * `Promise.resolve().then(flush)` is a microtask scheduler spelled without a
 * scheduler's name.
 */
const TIMER_GLOBALS = [
  'queueMicrotask',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'requestAnimationFrame',
  'requestIdleCallback',
  'Promise',
  'process',
] as const

/**
 * Which browser globals `text` **names as code**.
 *
 * Parsed, not grepped, and the difference is the whole point: this module's
 * docblocks discuss `location.hash` and `history.replaceState` at length,
 * because explaining what it refuses to touch is most of its rationale. A grep
 * cannot tell a mention from a reference, so it would force the prose to be
 * written around the instrument. Comments and string literals are not
 * identifiers and a parser knows it — the same argument
 * `src/core/testing/imports.ts` makes for parsing import specifiers.
 *
 * Deliberately conservative: a *property* named `history` would be reported
 * too. A false positive costs one comment; a false negative is a DOM
 * dependency nobody notices.
 *
 * `names` is defaulted rather than fixed so {@link TIMER_GLOBALS} reuses the
 * walk without a second copy of it — the alternative is two parsers drifting
 * apart, and P3a's carried finding 4 already ruled that a defaulted table
 * parameter wins over a hard-wired one.
 */
function globalsNamedIn(text: string, names: readonly string[] = BROWSER_GLOBALS): string[] {
  const file = ts.createSourceFile('x.ts', text, ts.ScriptTarget.ES2022, true)
  const found = new Set<string>()
  const walk = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && names.includes(node.text)) {
      found.add(node.text)
    }
    ts.forEachChild(node, walk)
  }
  walk(file)
  return [...found].sort()
}

/** The names of every module-scope `let`/`var` in `text`. */
function mutableModuleBindingsIn(text: string): string[] {
  const file = ts.createSourceFile('x.ts', text, ts.ScriptTarget.ES2022, true)
  const out: string[] = []
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue
    if ((statement.declarationList.flags & ts.NodeFlags.Const) !== 0) continue
    for (const declaration of statement.declarationList.declarations) {
      out.push(declaration.name.getText(file))
    }
  }
  return out.sort()
}

/* ================================================================== tests */

describe('projectedHash', () => {
  it('round-trips: parsing the projection yields the scene back', () => {
    // The codec-independent half. It would survive a change of encoding, which
    // is the guarantee — that a link carries the scene — rather than today's
    // bytes.
    const state = initialState(ANIM)
    expect(parseSceneHash(projectedHash(state))).toEqual(state.scene)
  })

  it('is the codec applied to the projected scene, with nothing added', () => {
    // Pins that the projector encodes once and wraps nothing: no second
    // version prefix, no `#`, no query. The `#` belongs to the fragment and is
    // the writer's, which is why it is asserted absent here and present below.
    const state = initialState(ANIM)
    expect(projectedHash(state)).toBe(encodeSceneHash(state.scene))
    expect(projectedHash(state).startsWith(`${HASH_VERSION}.`)).toBe(true)
    expect(projectedHash(state).startsWith('#')).toBe(false)
  })

  it('is a function of the state and of nothing else', () => {
    // Two stores, never one: a projection reading anything ambient would be
    // free to disagree between them.
    const a = createSceneStore(initialState(ANIM))
    const b = createSceneStore(initialState(ANIM))
    expect(projectedHash(a.state())).toBe(projectedHash(b.state()))

    b.dispatch({ type: 'scene', scene: OTHER })
    expect(projectedHash(b.state())).not.toBe(projectedHash(a.state()))
  })

  it('does not mutate the state it is handed', () => {
    const state = Object.freeze(initialState(ANIM))
    expect(() => projectedHash(state)).not.toThrow()
    expect(state).toEqual(initialState(ANIM))
  })
})

describe('the partition between what a link carries and what it does not', () => {
  /**
   * The paired control gate §6.5a requires, both halves in one test and
   * through one instrument.
   *
   * The hash carries one field of `UiState` and leaves the rest. The excluded
   * ones are not an accident of today's encoder: `controls.ts` snaps `time`
   * onto the frame grid as a scrub position, `depthView` chooses which of two
   * pictures the canvas shows, and `transport` is that same scrub position
   * paired with a reading of this machine's wall clock. None of them is the
   * scene, and a shared link carries the scene.
   *
   * **The precondition is stated rather than assumed**, and it was measured:
   * the target starts holding the projection, which is what a page opened on
   * a share link holds. On a fragment that *disagrees* — the first visit, with
   * nothing after the `#` — the first mutation writes whatever its field was,
   * because the projector reconciles rather than diffing against a remembered
   * value. That is the convergence the test below this pair pins, and the two
   * claims are only compatible with the precondition written down.
   */
  it('writes for a scene mutation and not for a depthView one', () => {
    const store = createSceneStore(initialState(ANIM))
    const target = recordingTarget(`#${projectedHash(store.state())}`)
    attachHashProjection(store, target, immediately)

    store.dispatch({ type: 'depthView', value: 'encoded' })
    expect(target.writes, 'depthView is a view concern and must not reach the link').toEqual([])

    store.dispatch({ type: 'stereo', patch: { seed: 9 } })
    expect(
      target.writes.length,
      'the same instrument saw nothing for an included field either, so the null above is blind',
    ).toBe(1)
  })

  it('writes for a scene mutation and not for a time one', () => {
    const store = createSceneStore(initialState(ANIM))
    const target = recordingTarget(`#${projectedHash(store.state())}`)
    attachHashProjection(store, target, immediately)

    store.dispatch({ type: 'time', seconds: 1.3 })
    expect(target.writes, 'the scrub position is not the scene').toEqual([])

    store.dispatch({ type: 'fps', value: 24 })
    expect(target.writes.length).toBe(1)
  })

  it('reconciles a disagreeing fragment on the next mutation, whichever field it was', () => {
    /**
     * The other half of the pair above, and the behaviour that makes the two
     * criteria compatible instead of contradictory.
     *
     * "An excluded field never writes" and "the fragment always equals the
     * projection" cannot both hold from an empty fragment: something has to
     * close the gap, and the only notification available is the next
     * mutation, whatever field it touched. The projector converges — it does
     * not diff against what it last wrote — so the gap closes on the first
     * dispatch of any kind, and the payload still carries no `depthView`.
     *
     * Pinned because the alternative is reachable by a one-line change and
     * looks like a tightening: guarding on the previous *projection* would
     * make this test red and leave a page that can sit indefinitely with a
     * fragment that is not its scene.
     */
    const store = createSceneStore(initialState(ANIM))
    const target = recordingTarget()
    attachHashProjection(store, target, immediately)

    store.dispatch({ type: 'depthView', value: 'encoded' })
    expect(target.read()).toBe(`#${projectedHash(store.state())}`)
    expect(parseSceneHash(target.read())).toEqual(store.state().scene)
    expect(JSON.stringify(parseSceneHash(target.read()))).not.toContain('depthView')
  })

  it('classifies every field of UiState, so a new one cannot be forgotten', () => {
    // The runtime half of the `AssertNever` pairs in the module. The compiler
    // half catches a field added to the *type*; this one catches a field that
    // `initialState` puts on the object without declaring, which the type
    // cannot see.
    const keys = Object.keys(initialState(ANIM)).sort()
    expect([...PROJECTED_FIELDS, ...UNPROJECTED_FIELDS].sort()).toEqual(keys)
    expect(PROJECTED_FIELDS).toEqual(['scene'])
  })

  it('keeps the two view flags out of the store entirely, not merely out of the hash', () => {
    /**
     * The sensor for two rationales recorded in prose in `site/main.ts`, which
     * the teardown deletes. Diagnostics selection: *"A view concern, not scene
     * state, so it stays out of the hash — a shared link carries the picture,
     * not where someone last pointed the ruler."* Presentation mode: *"A view
     * flag and nothing more: it is not in the scene, not in the hash, not in
     * `UiState`."*
     *
     * §9 is blunt that a recorded note is not a sensor. This is the sensor: the
     * day one of these is added to `UiState`, it reddens here and the quote
     * above says why it was refused.
     */
    const keys = Object.keys(initialState(ANIM))
    for (const name of ['diagRow', 'bandX0', 'bandX1', 'presenting']) {
      expect(keys, `${name} is a view flag and does not belong in the store`).not.toContain(name)
    }
    // The control: the scan can see a field that *is* there, so the four nulls
    // above are a fact about the state and not a broken check.
    expect(keys).toContain('depthView')
  })
})

describe('location and history are the caller’s', () => {
  it('names no browser global anywhere in the module', () => {
    expect(globalsNamedIn(SOURCE)).toEqual([])
  })

  it('…and the scan can see one, in code but not in prose', () => {
    // Both halves of the control. The first proves the instrument fires; the
    // second proves it fires on *references* and not on the docblocks this
    // module is full of, which is the discrimination a grep cannot make.
    expect(globalsNamedIn("const h = location.hash\nhistory.replaceState(null, '', h)\n"))
      .toEqual(['history', 'location'])
    expect(globalsNamedIn("// location.hash, then history.replaceState\nconst s = 'location'\n"))
      .toEqual([])
  })

  it('holds no module-level mutable state, so two pages cannot share a fragment', () => {
    expect(mutableModuleBindingsIn(SOURCE)).toEqual([])
    // Control, same instrument: it finds one when there is one to find.
    expect(mutableModuleBindingsIn('let lastWrittenHash = ""\nconst x = 1\n'))
      .toEqual(['lastWrittenHash'])
  })

  it('is driven to completion by a plain {read, write} pair in node', () => {
    const store = createSceneStore(initialState(ANIM))
    const target = recordingTarget()
    attachHashProjection(store, target, immediately)
    store.dispatch({ type: 'scene', scene: OTHER })
    expect(target.writes).toEqual([`#${projectedHash(store.state())}`])
  })
})

describe('the store and the fragment cannot disagree', () => {
  it('writes nothing on attach, because attaching is not a mutation', () => {
    // A projector that wrote on attach would overwrite the link the page was
    // opened with before the reader touched anything, and would make "one
    // mutation, one write" false at the one moment nothing was mutated.
    const store = createSceneStore(initialState(ANIM))
    const target = recordingTarget()
    attachHashProjection(store, target, immediately)
    expect(target.writes).toEqual([])
  })

  it('leaves the fragment equal to the projection after every Action variant', () => {
    const store = createSceneStore(initialState(ANIM))
    const target = recordingTarget()
    attachHashProjection(store, target, immediately)

    let wrote = 0
    let skipped = 0
    for (const action of EVERY_SAMPLE) {
      const before = target.read()
      const writesBefore = target.writes.length
      try {
        store.dispatch(action)
      } catch {
        // `reduce` refused it; the store is unchanged and so is the fragment.
      }
      const expected = `#${projectedHash(store.state())}`
      expect(target.read(), `after ${JSON.stringify(action)}`).toBe(expected)
      const written = target.writes.length - writesBefore
      // Derived per step rather than counted at the end: a write happens
      // exactly when the projection moved.
      expect(written, `after ${JSON.stringify(action)}`).toBe(before === expected ? 0 : 1)
      if (written === 1) wrote++
      else skipped++
    }

    // The sweep is not vacuous and exercised both arms of the guard — a run in
    // which nothing ever wrote, or nothing was ever skipped, would make one
    // half of the assertion above untested.
    expect(wrote, 'no sample moved the projection').toBeGreaterThan(0)
    expect(skipped, 'no sample left the projection alone').toBeGreaterThan(0)
    expect(wrote + skipped).toBe(EVERY_SAMPLE.length)
  })

  it('agrees after an arbitrary interleaving of included, excluded and refused edits', () => {
    const store = createSceneStore(initialState(ANIM))
    const target = recordingTarget()
    attachHashProjection(store, target, immediately)

    const sequence: readonly Action[] = [
      { type: 'depthView', value: 'encoded' },
      { type: 'stereo', patch: { seed: 3 } },
      { type: 'time', seconds: 1.3 },
      { type: 'layerText', index: 0, patch: { size: 0 } },
      { type: 'size', value: [80, 40] },
      { type: 'scene', scene: OTHER },
      { type: 'frame', index: 1 },
      { type: 'layerAnim', index: 4, anim: undefined },
      { type: 'fps', value: undefined },
    ]
    for (const action of sequence) {
      try {
        store.dispatch(action)
      } catch {
        /* refused; see the sweep above */
      }
      expect(target.read()).toBe(`#${projectedHash(store.state())}`)
    }
    // And the end state is readable as a scene, not merely equal to itself.
    expect(parseSceneHash(target.read())).toEqual(store.state().scene)
  })

  it('writes nothing for a dispatch reduce refuses', () => {
    const store = createSceneStore(initialState(ANIM))
    const target = recordingTarget()
    attachHashProjection(store, target, immediately)
    store.dispatch({ type: 'stereo', patch: { seed: 4 } })
    const after = [...target.writes]

    expect(() => store.dispatch({ type: 'layerAnim', index: 9, anim: undefined })).toThrow()
    expect(target.writes).toEqual(after)
  })

  it('rewrites when something else moved the fragment, holding no remembered value', () => {
    /**
     * The guard compares against the fragment as it **is**, not against a
     * remembered last write, and this is the case that tells the two apart.
     *
     * A projector holding `lastWritten` would see the dispatch below produce a
     * projection equal to the one it last wrote, skip the write, and leave the
     * fragment on whatever the Back button put there — the store and the link
     * disagreeing, silently, with no test able to see it. That is the defect
     * class design §3.4 names and the reason this module keeps no state at all.
     */
    const store = createSceneStore(initialState(ANIM))
    const target = recordingTarget()
    attachHashProjection(store, target, immediately)

    store.dispatch({ type: 'stereo', patch: { seed: 5 } })
    const projected = target.read()
    expect(projected).toBe(`#${projectedHash(store.state())}`)

    target.clobber('#v1.something-else-entirely')
    // An edit that leaves the scene exactly where it already was.
    store.dispatch({ type: 'scene', scene: store.state().scene })

    expect(target.read()).toBe(projected)
    expect(target.writes.at(-1)).toBe(projected)
  })

  it('stops writing once detached, so the subscription is the only write path', () => {
    // The structural claim in criterion 8's second half: the write is produced
    // by subscribing, not by a convention observed at each mutation site. If
    // removing the subscription left any write behind, there would be a second
    // path — which is exactly what `main.ts`'s four hand-placed `syncHash()`
    // calls are.
    const store = createSceneStore(initialState(ANIM))
    const target = recordingTarget()
    const detach = attachHashProjection(store, target, immediately)

    store.dispatch({ type: 'stereo', patch: { seed: 6 } })
    expect(target.writes.length).toBe(1)

    detach()
    for (const action of EVERY_SAMPLE) {
      try {
        store.dispatch(action)
      } catch {
        /* refused */
      }
    }
    expect(target.writes.length, 'a write survived the detach').toBe(1)
  })

  it('keeps two stores on two fragments apart', () => {
    const a = createSceneStore(initialState(ANIM))
    const b = createSceneStore(initialState(ANIM))
    const ta = recordingTarget()
    const tb = recordingTarget()
    attachHashProjection(a, ta, immediately)
    attachHashProjection(b, tb, immediately)

    a.dispatch({ type: 'scene', scene: OTHER })
    expect(ta.writes.length).toBe(1)
    expect(tb.writes).toEqual([])
    expect(ta.read()).not.toBe(tb.read())
  })
})

/* ============================================================== coalescing */

describe('the write is deferred to a tick boundary, so a gesture is one write', () => {
  it('writes once for N mutations in one tick — and N times across N ticks', () => {
    /**
     * Criterion 15, with the control §6.5a requires in the same test and
     * through the same instrument.
     *
     * The control is not decoration here. "One write for three mutations" is
     * satisfied just as well by a projector that has stopped writing, and a
     * coalescing commit is exactly the change that could stop it: the two
     * halves below differ only in **when the queue is cranked**, so a silent
     * projector fails the second and a non-coalescing one fails the first.
     * Nothing else about the two halves differs — same store, same target,
     * same queue, same kind of mutation.
     */
    const store = createSceneStore(initialState(ANIM))
    const target = recordingTarget()
    const queue = tickQueue()
    attachHashProjection(store, target, queue.schedule)

    store.dispatch({ type: 'stereo', patch: { seed: 1 } })
    const first = `#${projectedHash(store.state())}`
    store.dispatch({ type: 'stereo', patch: { seed: 2 } })
    const middle = `#${projectedHash(store.state())}`
    store.dispatch({ type: 'scene', scene: OTHER })
    const last = `#${projectedHash(store.state())}`

    // Stated rather than assumed: if two of the three projections coincided,
    // "it wrote the final one" would be satisfiable by writing an earlier one
    // and the value half of this test would prove nothing.
    expect(new Set([first, middle, last]).size, 'the three states must differ').toBe(3)
    expect(target.writes, 'nothing is written before the tick turns').toEqual([])

    expect(queue.run(), 'three mutations scheduled one flush').toBe(1)
    expect(target.writes.length, 'three mutations, one write').toBe(1)
    expect(target.writes[0], 'the write carries the final state, not an intermediate').toBe(last)

    // The control. The same three kinds of mutation, one per tick.
    const before = target.writes.length
    for (const seed of [3, 4, 5]) {
      store.dispatch({ type: 'stereo', patch: { seed } })
      expect(queue.run(), 'one mutation scheduled one flush').toBe(1)
    }
    expect(target.writes.length - before, 'three ticks, three writes').toBe(3)
    // Three *distinct* writes, so this is three projections and not one value
    // written three times by a projector that has lost the state.
    expect(new Set(target.writes.slice(before)).size).toBe(3)
    expect(target.writes.at(-1)).toBe(`#${projectedHash(store.state())}`)
  })

  it('coalesces on the real microtask queue — not synchronously, not on a timer', async () => {
    /**
     * Which queue, measured. The fake above is identical for `queueMicrotask`
     * and `setTimeout`, so it cannot see a projector that landed on the wrong
     * one, and "on a microtask" is design §3.4's actual words: the write must
     * be in before the task that caused it yields to the event loop.
     *
     * The two assertions bracket the queue from both sides. Nothing written
     * before the first `await` rules out a synchronous flush; everything
     * written after it rules out any macrotask scheduler, none of which has
     * run by the first microtask checkpoint.
     */
    const store = createSceneStore(initialState(ANIM))
    const target = recordingTarget()
    attachHashProjection(store, target, queueMicrotask)

    store.dispatch({ type: 'stereo', patch: { seed: 1 } })
    store.dispatch({ type: 'stereo', patch: { seed: 2 } })
    store.dispatch({ type: 'scene', scene: OTHER })
    expect(target.writes, 'the flush is not synchronous').toEqual([])

    await microtask()
    expect(target.writes, 'one write, of the final state, by the first microtask').toEqual([
      `#${projectedHash(store.state())}`,
    ])

    // The control, on the real queue: separate ticks are separate writes.
    const before = target.writes.length
    for (const seed of [3, 4, 5]) {
      store.dispatch({ type: 'stereo', patch: { seed } })
      await microtask()
    }
    expect(target.writes.length - before, 'three microtask turns, three writes').toBe(3)
    expect(new Set(target.writes.slice(before)).size).toBe(3)
  })

  it('queues nothing further from inside the flush, so the microtask queue drains', async () => {
    /**
     * The starvation question, which is the only way a microtask projector
     * could harm a page: a microtask that unconditionally queues another one
     * never lets the event loop run again. It cannot happen here because the
     * flush neither dispatches nor schedules — but "cannot happen" is a claim
     * about today's body, so it gets a sensor.
     *
     * This is also the measurable half of S-1's open item 8, the interaction
     * with `site/main.ts:604-623`'s render chain. That chain is promise-based
     * and so shares this queue; an undraining projector would starve it. A
     * draining one cannot, whatever the interleaving.
     *
     * **It counts `schedule` calls and not writes, and the difference was
     * measured.** An earlier version of this test watched `writes`, and a
     * planted flush that re-queued itself once passed it: the follow-up flush
     * found the fragment unchanged and wrote nothing, so a projector queuing
     * microtasks forever was invisible to the only test asking whether it
     * did. The queue is the subject; the writes are a proxy that cannot see
     * it.
     */
    const store = createSceneStore(initialState(ANIM))
    const target = recordingTarget()
    let scheduled = 0
    attachHashProjection(store, target, flush => {
      scheduled++
      queueMicrotask(flush)
    })

    store.dispatch({ type: 'scene', scene: OTHER })
    await microtask()
    expect(scheduled, 'one mutation, one microtask').toBe(1)
    expect(target.writes.length).toBe(1)

    await microtask()
    await microtask()
    await microtask()
    expect(scheduled, 'the flush queued another microtask').toBe(1)
    expect(target.writes.length).toBe(1)

    // Control, same counter and same loop: it does see a microtask queued on
    // a later turn, so the null above is a fact about the flush and not a
    // checkpoint that stopped looking.
    store.dispatch({ type: 'stereo', patch: { seed: 11 } })
    await microtask()
    expect(scheduled).toBe(2)
    expect(target.writes.length).toBe(2)
  })

  it('writes exactly when the projection moved across the tick, not per mutation', () => {
    /**
     * The rule the sweep above the coalescing block derives per *mutation*,
     * restated per *tick* — which is the honest form of criterion 15 once
     * coalescing exists. "N mutations ⇒ one write" is false when the tick's
     * net effect on the projection is nil: the guard that skips an unchanged
     * fragment does not stop applying because several mutations were batched,
     * and a projector that wrote anyway would reinstate exactly the cost
     * `main.ts:683-684` gives for preferring `replaceState` over `pushState`.
     *
     * So: **at most one write per tick, and exactly one when the projection
     * moved.** Both arms are exercised below, in that order.
     */
    const store = createSceneStore(initialState(ANIM))
    const target = recordingTarget()
    const queue = tickQueue()
    attachHashProjection(store, target, queue.schedule)

    store.dispatch({ type: 'stereo', patch: { seed: 1 } })
    queue.run()
    const settled = `#${projectedHash(store.state())}`
    expect(target.writes).toEqual([settled])

    // A tick that goes away and comes back.
    store.dispatch({ type: 'stereo', patch: { seed: 2 } })
    expect(`#${projectedHash(store.state())}`, 'the excursion must be visible').not.toBe(settled)
    store.dispatch({ type: 'stereo', patch: { seed: 1 } })
    expect(`#${projectedHash(store.state())}`, 'and must come back').toBe(settled)
    expect(queue.run(), 'the excursion did schedule a flush').toBe(1)
    expect(target.writes, 'a round trip within one tick writes nothing').toEqual([settled])

    // The control: the same two mutations in one tick, not returning.
    store.dispatch({ type: 'stereo', patch: { seed: 2 } })
    store.dispatch({ type: 'stereo', patch: { seed: 3 } })
    expect(queue.run()).toBe(1)
    expect(target.writes.length, 'a tick that moved the projection writes once').toBe(2)
    expect(target.writes.at(-1)).toBe(`#${projectedHash(store.state())}`)
  })

  it('collapses the whole Action vocabulary in one tick into a single write', () => {
    /**
     * Criterion 15 over every `Action` variant rather than over a chosen
     * three, refusals included. The sweep is total by the compiler for the
     * reason {@link SAMPLES} records, so a twelfth variant joins this test
     * without anyone remembering to add it.
     */
    const store = createSceneStore(initialState(ANIM))
    const target = recordingTarget()
    const queue = tickQueue()
    attachHashProjection(store, target, queue.schedule)

    let refused = 0
    for (const action of EVERY_SAMPLE) {
      try {
        store.dispatch(action)
      } catch {
        refused++
      }
    }
    // Vacuity floor: a sweep in which everything was refused would reach the
    // assertions below with nothing having been dispatched at all.
    expect(refused, 'every sample was refused, so nothing was swept').toBeLessThan(
      EVERY_SAMPLE.length,
    )
    expect(target.writes, 'the whole gesture is still in flight').toEqual([])

    expect(queue.run(), `${EVERY_SAMPLE.length} mutations scheduled one flush`).toBe(1)
    expect(target.writes.length).toBe(1)
    expect(target.writes[0]).toBe(`#${projectedHash(store.state())}`)
    expect(target.read()).toBe(`#${projectedHash(store.state())}`)

    // The control: the same vocabulary one mutation per tick writes once per
    // step that moved the projection, derived rather than counted, which is
    // how the sweep above the coalescing block states the same rule.
    const fresh = createSceneStore(initialState(ANIM))
    const freshTarget = recordingTarget()
    const freshQueue = tickQueue()
    attachHashProjection(fresh, freshTarget, freshQueue.schedule)
    let moved = 0
    for (const action of EVERY_SAMPLE) {
      const before = freshTarget.read()
      try {
        fresh.dispatch(action)
      } catch {
        /* refused; the store and the fragment are both unchanged */
      }
      freshQueue.run()
      if (`#${projectedHash(fresh.state())}` !== before) moved++
    }
    expect(moved, 'no step moved the projection').toBeGreaterThan(1)
    expect(freshTarget.writes.length, 'one write per tick that moved it').toBe(moved)
  })

  it('schedules nothing on attach, and nothing for a dispatch reduce refuses', () => {
    const store = createSceneStore(initialState(ANIM))
    const target = recordingTarget()
    const queue = tickQueue()
    attachHashProjection(store, target, queue.schedule)

    expect(queue.depth(), 'attaching is not a mutation').toBe(0)
    expect(() => store.dispatch({ type: 'layerAnim', index: 9, anim: undefined })).toThrow()
    expect(queue.depth(), 'a refused edit is not a mutation either').toBe(0)

    // Control: the same queue is filled by a mutation the store accepts, so
    // the two zeroes above are facts about the store and not a dead scheduler.
    store.dispatch({ type: 'stereo', patch: { seed: 2 } })
    expect(queue.depth()).toBe(1)
  })

  it('cancels a queued write when it is detached before the tick turns', () => {
    /**
     * Criterion 5, and the reason the projector holds a `detached` flag rather
     * than a handle: a microtask cannot be un-queued, so the only place a
     * cancellation can live is inside the flush. `transportdriver.ts` takes a
     * `cancel` alongside its `schedule` because a timeout *can* be cleared;
     * the asymmetry is the queue's and not a difference of taste.
     *
     * Without the flag, a panel that unmounts mid-gesture leaves one last
     * write in flight and the fragment is set by a projector that no longer
     * exists.
     */
    const store = createSceneStore(initialState(ANIM))
    const target = recordingTarget()
    const queue = tickQueue()
    const detach = attachHashProjection(store, target, queue.schedule)

    store.dispatch({ type: 'stereo', patch: { seed: 7 } })
    expect(queue.depth(), 'a flush is in flight').toBe(1)
    detach()
    queue.run()
    expect(target.writes, 'a write survived the detach').toEqual([])

    // Control, same queue and same target: an attached projector writes
    // through it, so the null above is the detach and not a dead crank.
    attachHashProjection(store, target, queue.schedule)
    store.dispatch({ type: 'stereo', patch: { seed: 8 } })
    queue.run()
    expect(target.writes.length).toBe(1)
  })

  it('gives each projector its own pending flush, sharing one queue', () => {
    /**
     * The behavioural half of "no module-level mutable state". A `pending`
     * flag hoisted to module scope passes every test above — one projector
     * at a time never notices — and silently drops one of the two writes
     * here. The source-text half is in *"holds no module-level mutable
     * state"*; the two fail on different things, which is why both exist.
     */
    const a = createSceneStore(initialState(ANIM))
    const b = createSceneStore(initialState(ANIM))
    const ta = recordingTarget()
    const tb = recordingTarget()
    const queue = tickQueue()
    attachHashProjection(a, ta, queue.schedule)
    attachHashProjection(b, tb, queue.schedule)

    a.dispatch({ type: 'scene', scene: OTHER })
    b.dispatch({ type: 'stereo', patch: { seed: 4 } })
    expect(queue.depth(), 'two projectors, two pending flushes').toBe(2)

    expect(queue.run()).toBe(2)
    expect(ta.writes.length).toBe(1)
    expect(tb.writes.length).toBe(1)
    expect(ta.read()).toBe(`#${projectedHash(a.state())}`)
    expect(tb.read()).toBe(`#${projectedHash(b.state())}`)
    expect(ta.read()).not.toBe(tb.read())
  })

  it('schedules a further flush for a mutation made during a flush', () => {
    /**
     * Where the pending flag is cleared decides whether this case works, and
     * both placements look right. Cleared at the *end* of the flush, a
     * dispatch that happens while the write is being applied sees a flush
     * still pending, schedules nothing, and is never projected — the store and
     * the fragment part company permanently, which is the defect class this
     * module exists to remove. Cleared at the *top*, it schedules another.
     *
     * Reachable rather than theoretical: a `hashchange` handler, an analytics
     * hook or a panel reacting to the URL all run inside `write`.
     */
    const store = createSceneStore(initialState(ANIM))
    const base = recordingTarget()
    const queue = tickQueue()
    let reentered = false
    const target: HashTarget = {
      read: () => base.read(),
      write: fragment => {
        base.write(fragment)
        if (reentered) return
        reentered = true
        store.dispatch({ type: 'scene', scene: OTHER })
      },
    }
    attachHashProjection(store, target, queue.schedule)

    store.dispatch({ type: 'stereo', patch: { seed: 1 } })
    expect(queue.run()).toBe(1)
    expect(base.writes.length).toBe(1)
    expect(reentered, 'the re-entrant dispatch did not happen').toBe(true)

    expect(queue.run(), 'the mutation made during the flush scheduled another').toBe(1)
    expect(base.writes.length).toBe(2)
    expect(base.writes.at(-1)).toBe(`#${projectedHash(store.state())}`)
    expect(target.read()).toBe(`#${projectedHash(store.state())}`)
  })
})

describe('what coalescing did not change', () => {
  /**
   * Criterion 4. A-2 measured that "an excluded field never writes" and "the
   * fragment always equals the projection" are jointly unsatisfiable from an
   * empty fragment, and resolved it: the exclusion holds *once the fragment
   * already agrees*, and the projector converges on the first mutation while
   * it does not. Both halves are pinned above, through a synchronous
   * scheduler.
   *
   * They are re-established here through a deferred one, because a batched
   * write is a different occasion from an immediate one and A-2's tests
   * cannot speak about it. Nothing below is a new claim; each is one of
   * A-2's, asked again across a tick boundary.
   */
  it('still excludes a field the fragment already agrees about, coalesced', () => {
    const store = createSceneStore(initialState(ANIM))
    const target = recordingTarget(`#${projectedHash(store.state())}`)
    const queue = tickQueue()
    attachHashProjection(store, target, queue.schedule)

    store.dispatch({ type: 'depthView', value: 'encoded' })
    store.dispatch({ type: 'time', seconds: 1.3 })
    expect(queue.run(), 'the excluded mutations did schedule a flush').toBe(1)
    expect(target.writes, 'neither view field reaches the link').toEqual([])

    // The same instrument, on an included field: it writes, so the null is
    // the partition and not a flush that never ran.
    store.dispatch({ type: 'stereo', patch: { seed: 9 } })
    expect(queue.run()).toBe(1)
    expect(target.writes.length).toBe(1)
  })

  it('still converges on a disagreeing fragment, coalesced', () => {
    const store = createSceneStore(initialState(ANIM))
    const target = recordingTarget()
    const queue = tickQueue()
    attachHashProjection(store, target, queue.schedule)

    // An excluded field, from a fragment that does not agree: the gap closes
    // on the next flush whatever caused it, and the payload still carries no
    // `depthView`.
    store.dispatch({ type: 'depthView', value: 'encoded' })
    queue.run()
    expect(target.read()).toBe(`#${projectedHash(store.state())}`)
    expect(parseSceneHash(target.read())).toEqual(store.state().scene)
    expect(JSON.stringify(parseSceneHash(target.read()))).not.toContain('depthView')
  })

  it('still holds no remembered value, coalesced', () => {
    const store = createSceneStore(initialState(ANIM))
    const target = recordingTarget()
    const queue = tickQueue()
    attachHashProjection(store, target, queue.schedule)

    store.dispatch({ type: 'stereo', patch: { seed: 5 } })
    queue.run()
    const projected = target.read()

    target.clobber('#v1.something-else-entirely')
    store.dispatch({ type: 'scene', scene: store.state().scene })
    queue.run()
    expect(target.read(), 'the guard read a remembered value, not the fragment').toBe(projected)
  })
})

describe('the tick is the caller’s', () => {
  it('names no timer or scheduler global anywhere in the module', () => {
    // Criterion 3's structural content, and the pair of the browser-global
    // scan above: a module that reached for `queueMicrotask` itself would
    // satisfy every behavioural test here while welding the editor's batching
    // policy into a file the composition root cannot override.
    expect(globalsNamedIn(SOURCE, TIMER_GLOBALS)).toEqual([])
  })

  it('…and the scan can see one, in code but not in prose', () => {
    expect(globalsNamedIn('queueMicrotask(flush)\nsetTimeout(flush, 0)\n', TIMER_GLOBALS)).toEqual([
      'queueMicrotask',
      'setTimeout',
    ])
    expect(globalsNamedIn("// queueMicrotask, or setTimeout\nconst s = 'Promise'\n", TIMER_GLOBALS))
      .toEqual([])
  })
})
