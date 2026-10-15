import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as ts from 'typescript'
import {
  PROJECTED_FIELDS,
  UNPROJECTED_FIELDS,
  attachHashProjection,
  projectedHash,
} from './hashprojection.js'
import type { HashTarget } from './hashprojection.js'
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
 */
function globalsNamedIn(text: string): string[] {
  const file = ts.createSourceFile('x.ts', text, ts.ScriptTarget.ES2022, true)
  const found = new Set<string>()
  const walk = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && (BROWSER_GLOBALS as readonly string[]).includes(node.text)) {
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
   * `UiState` has three fields and the hash carries one. The excluded two are
   * not an accident of today's encoder: `controls.ts` snaps `time` onto the
   * frame grid as a scrub position, and `depthView` chooses which of two
   * pictures the canvas shows. Neither is the scene, and a shared link carries
   * the scene.
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
    attachHashProjection(store, target)

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
    attachHashProjection(store, target)

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
    attachHashProjection(store, target)

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
    attachHashProjection(store, target)
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
    attachHashProjection(store, target)
    expect(target.writes).toEqual([])
  })

  it('leaves the fragment equal to the projection after every Action variant', () => {
    const store = createSceneStore(initialState(ANIM))
    const target = recordingTarget()
    attachHashProjection(store, target)

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
    attachHashProjection(store, target)

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
    attachHashProjection(store, target)
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
    attachHashProjection(store, target)

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
    const detach = attachHashProjection(store, target)

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
    attachHashProjection(a, ta)
    attachHashProjection(b, tb)

    a.dispatch({ type: 'scene', scene: OTHER })
    expect(ta.writes.length).toBe(1)
    expect(tb.writes).toEqual([])
    expect(ta.read()).not.toBe(tb.read())
  })
})
