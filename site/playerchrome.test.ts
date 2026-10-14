import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CHROME_IDLE_MS,
  CONTROL_PREFIX,
  FRAMINGS,
  FRAMING_NAMES,
  MIN_CHROME_NODES,
  ROLE_CANVAS,
  ROLE_FULLSCREEN,
  ROLE_PLAY,
  ROLE_SEEK,
  ROLE_TRANSPORT,
  ROLE_WRAPPER,
  chromeSpec,
  chromeVisible,
  fullscreenTarget,
  noteActivity,
  isControlRole,
  flowViolations,
  nodesOf,
  pathToRole,
} from './playerchrome.js'
// The whole namespace as well as the names above, so the role *count* can be
// read off the module rather than kept in this file — see the node-floor block.
// `chromedom.test.ts` does the same, for the same recorded reason: however a
// constant is spelled, annotated or re-exported, it is a key of the module
// object at runtime, where a source-text regex has three known holes.
import * as chrome from './playerchrome.js'
import type { ChromeActivity, ChromeNode, Framing } from './playerchrome.js'

const SOURCE = readFileSync(new URL('./playerchrome.ts', import.meta.url), 'utf8')

/**
 * The module's source with every comment removed.
 *
 * Needed because this file's docblocks argue about `Date.now` by name —
 * "no timers, no DOM, no `Date.now`" — and a grep for a forbidden identifier
 * that matches the prose explaining why it is forbidden is the `yuv444p`
 * mistake `dist.test.ts` already records. The floor below keeps the stripping
 * itself honest: a regex that ate the whole file would otherwise prove every
 * absence at once.
 */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * Every framing, written out by hand.
 *
 * Deliberately not `FRAMING_NAMES` — a test that enumerates the thing under
 * test cannot notice it shrinking. The first assertion below compares the two
 * lists in both directions, so adding a framing without adding it here is a
 * red test, and the per-framing suites below then run over the module's own
 * list so the new member is actually exercised rather than merely counted.
 */
const EVERY_FRAMING: readonly Framing[] = ['inline', 'present', 'embed', 'fullscreen']

/** Every role in `spec`, in no particular order. */
function rolesOf(spec: ChromeNode): string[] {
  return nodesOf(spec).map(n => n.role)
}

/**
 * Is every part of the transport — the container and each control — inside the
 * subtree of `spec` named by `targetRole`?
 *
 * Design §8.2's reason for targeting the wrapper is about the transport and
 * not about the canvas: *"Fullscreening the canvas would make sibling
 * transport unrenderable and R15+R16 unimplementable together."* A fullscreen
 * element's siblings are not painted, so anything of the transport left
 * outside the target vanishes at the exact moment R16 says play/pause must
 * work.
 *
 * Takes the target as a **role rather than a node**, which is the only thing
 * that makes it falsifiable at all: against today's specs the target is the
 * root, so the answer is trivially yes. Parameterised, the same predicate can
 * be pointed at a target one box in — the shape a future "fullscreen just the
 * stage" edit would produce — and the positive control below does exactly
 * that.
 *
 * `false` for a target that is not in the tree, and for a tree with no
 * transport at all: every clause here is "nothing is outside X", and both of
 * those satisfy it vacuously.
 */
function transportSurvivesFullscreen(spec: ChromeNode, targetRole: string): boolean {
  const target = nodesOf(spec).find(n => n.role === targetRole)
  const parts = nodesOf(spec).filter(n => n.role === ROLE_TRANSPORT || isControlRole(n.role))
  if (target === undefined || parts.length === 0) return false
  const inside = new Set(nodesOf(target))
  return parts.every(part => inside.has(part))
}

describe('the framings are enumerable, and every one of them has a spec', () => {
  it('enumerates exactly the framings this test knows about', () => {
    expect([...FRAMING_NAMES].sort()).toEqual([...EVERY_FRAMING].sort())
    expect(Object.keys(FRAMINGS).sort()).toEqual([...EVERY_FRAMING].sort())
    // Vacuity floor: an empty or truncated enumeration would satisfy a
    // set-equality check against an equally empty hand list only if the hand
    // list above were also wrong, but it would sail through every `for (const
    // f of FRAMING_NAMES)` loop in this file in silence.
    expect(FRAMING_NAMES.length).toBeGreaterThanOrEqual(4)
  })

  it('describes every framing it enumerates', () => {
    for (const framing of FRAMING_NAMES) {
      const info = FRAMINGS[framing]
      expect(info.framing).toBe(framing)
      expect(info.description.length).toBeGreaterThan(20)
    }
  })

  it('is total: every framing produces a spec rooted at the wrapper', () => {
    for (const framing of FRAMING_NAMES) {
      const spec = chromeSpec(framing)
      expect(spec.role).toBe(ROLE_WRAPPER)
    }
  })
})

/**
 * `MIN_CHROME_NODES` is a hand-maintained literal whose docblock promises it
 * "tracks the smallest *conformant* tree", and nothing made that true.
 *
 * It is the floor every structural rule in this module rests on — each is of
 * the form "no node does X", which a tree with no nodes satisfies — and it has
 * already been wrong once in exactly the way a hand-kept count goes wrong. It
 * said five against a real count of six, so it carried one node of slack, and
 * measured, that slack was the whole guard: deleting `ROLE_FULLSCREEN` from the
 * control list dropped the control from all four framings and left the entire
 * suite green at 1151 passed. `e21e954` repaired the value. Nothing stopped it
 * re-acquiring the slack the next time a control is added, with the identical
 * symptom — a deletable control and a green suite.
 *
 * So the count is derived from the module's own role constants and compared
 * against the literal. Every structural rule here gives a role **at most one**
 * node (asserted per framing below, "uses each role at most once"), and the
 * smallest conformant tree is the one that gives each required role exactly
 * one — so the node floor and the role count are the same number, and the role
 * count is something the namespace knows.
 *
 * Read from the namespace rather than from a list typed here, for
 * `chromedom.test.ts`'s recorded reason: a source-text regex misses a type
 * annotation, a renamed re-export and a `satisfies` clause, and however a
 * constant is spelled it is a key of the module object at runtime. A role added
 * tomorrow, by somebody who never opens this file, is counted or else fails.
 *
 * **The floor stays a literal in `playerchrome.ts` and this is deliberate, not
 * a limitation worked around.** The constant is what the module *promises*;
 * deriving it in the module would make the promise follow whatever the role
 * list happens to say, which is the opposite of a floor — a control deleted
 * along with its role constant would lower the floor to meet it and stay green.
 * Asserting the two agree keeps one of them a decision and the other a
 * measurement, and reds when they part. Adding a role now forces an explicit
 * answer to "does the smallest conformant tree contain it", which is the
 * question the slack was hiding.
 */
describe('the node floor tracks the module’s roles, rather than being remembered', () => {
  const roleValues = Object.entries(chrome as unknown as Record<string, unknown>)
    .filter(([name]) => /^ROLE_[A-Z_]+$/.test(name))
    .map(([, value]) => value as string)

  it('found the role constants, rather than counting nothing and passing', () => {
    // The vacuity floor. The comparison below is against `roleValues.length`,
    // so an enumeration that found nothing would demand a floor of zero and
    // red for the right reason — but an enumeration that found *some* would
    // quietly demand a lower floor, which is the failure worth naming.
    expect(roleValues.length).toBeGreaterThanOrEqual(6)
    expect(new Set(roleValues).size, 'two roles share a value').toBe(roleValues.length)
    for (const role of roleValues) expect(typeof role).toBe('string')
  })

  it('agrees with MIN_CHROME_NODES, and the count is split so a failure says which arrived', () => {
    const controls = roleValues.filter(isControlRole)
    const structural = roleValues.filter(role => !isControlRole(role))
    // Both kinds are non-empty, which is what makes `isControlRole` a working
    // discriminator here rather than a predicate that happens to answer the
    // same way for everything — the shape that would let the split in the
    // failure message below name the wrong kind.
    expect(controls.length, 'no role is a control, so the split is not discriminating')
      .toBeGreaterThan(0)
    expect(structural.length, 'every role is a control, so the split is not discriminating')
      .toBeGreaterThan(0)
    expect(
      MIN_CHROME_NODES,
      `the module declares ${structural.length} structural roles and ${controls.length} ` +
      `controls, so the smallest conformant tree has ${roleValues.length} nodes and the ` +
      `floor says ${MIN_CHROME_NODES}. A role was added or removed without deciding whether ` +
      'that tree contains it — leaving the floor with slack, which is a control that can be ' +
      'deleted with the suite green (measured once already: 1151 passed)',
    ).toBe(roleValues.length)
  })
})

describe('every framing carries a transport (R16, design §8.2)', () => {
  for (const framing of EVERY_FRAMING) {
    describe(framing, () => {
      const spec = chromeSpec(framing)

      it('is not a stub', () => {
        // A wrapper holding only a canvas would pass "contains a canvas" and
        // every other shape assertion that does not count. The floor is the
        // smallest conformant tree: wrapper, canvas, transport, and the three
        // controls below it — play and seek (R16, design §7.4) and the way
        // out of fullscreen (R15).
        expect(nodesOf(spec).length).toBeGreaterThanOrEqual(MIN_CHROME_NODES)
      })

      it('names every node it contains', () => {
        for (const node of nodesOf(spec)) {
          expect(node.role.length).toBeGreaterThan(0)
          expect(node.tag.length).toBeGreaterThan(0)
        }
      })

      it('uses each role at most once, so a role identifies a node', () => {
        const roles = rolesOf(spec)
        expect(new Set(roles).size).toBe(roles.length)
      })

      it('has exactly one canvas and exactly one transport container', () => {
        expect(rolesOf(spec).filter(r => r === ROLE_CANVAS)).toHaveLength(1)
        expect(rolesOf(spec).filter(r => r === ROLE_TRANSPORT)).toHaveLength(1)
      })

      it('puts a play/pause control and a seek control inside that container', () => {
        const transport = nodesOf(spec).find(n => n.role === ROLE_TRANSPORT)!
        const inside = rolesOf(transport)
        expect(inside).toContain(ROLE_PLAY)
        expect(inside).toContain(ROLE_SEEK)
      })

      it('puts the way out of fullscreen inside it too, in THIS framing (R15)', () => {
        // The module claims this in prose and attributes it to R15 — the
        // control is present in every framing, "including `fullscreen` itself,
        // because it is a toggle", and in fullscreen "it is the only *visible*
        // way back out. Escape also works, but a control surface that relies
        // on the user knowing an unlabelled key is the same mistake as having
        // no transport." Nothing asserted it.
        //
        // Measured before this existed: deleting
        // `{ role: ROLE_FULLSCREEN, tag: 'button' }` from the control list —
        // which drops it from all four framings at once, one builder serving
        // them all — left the whole suite green at 1151 passed. The floor was
        // `MIN_CHROME_NODES = 5` against a real count of 6, so it had exactly
        // one node of slack, and no test in the phase imported the constant.
        //
        // Per framing and not once over the set, because "in every framing" is
        // the claim: a builder that special-cased `fullscreen` into dropping
        // its own exit would be the precise thing R15 forbids, and a single
        // check against one spec would not see it.
        const transport = nodesOf(spec).find(n => n.role === ROLE_TRANSPORT)!
        expect(rolesOf(transport)).toContain(ROLE_FULLSCREEN)
      })

      it('puts every control inside the transport container', () => {
        // The container is the thing the renderer positions and the auto-hide
        // policy shows and hides. A control outside it would be unreachable by
        // both, which is how today's page lost its transport in present mode.
        const transport = nodesOf(spec).find(n => n.role === ROLE_TRANSPORT)!
        const insideTransport = new Set(nodesOf(transport))
        for (const node of nodesOf(spec)) {
          if (!isControlRole(node.role)) continue
          expect(insideTransport.has(node)).toBe(true)
        }
      })
    })
  }

  it('recognises a control by its role prefix, not by a hand-kept list', () => {
    expect(isControlRole(ROLE_PLAY)).toBe(true)
    expect(isControlRole(ROLE_SEEK)).toBe(true)
    expect(isControlRole(`${CONTROL_PREFIX}invented-tomorrow`)).toBe(true)
    expect(isControlRole(ROLE_TRANSPORT)).toBe(false)
    expect(isControlRole(ROLE_CANVAS)).toBe(false)
    expect(isControlRole(ROLE_WRAPPER)).toBe(false)
  })
})

describe('fullscreen targets the wrapper, and clicks still reach the canvas', () => {
  for (const framing of EVERY_FRAMING) {
    describe(framing, () => {
      const spec = chromeSpec(framing)

      it('names the wrapper, and never the canvas (design §8.2)', () => {
        // "Fullscreening the canvas would make sibling transport unrenderable
        // and R15+R16 unimplementable together." Today's page targets
        // `document.documentElement` (main.ts:1056) — neither one.
        expect(fullscreenTarget(spec)).toBe(ROLE_WRAPPER)
        expect(fullscreenTarget(spec)).not.toBe(ROLE_CANVAS)
      })

      it('keeps the canvas a proper descendant of whatever it names', () => {
        const target = nodesOf(spec).find(n => n.role === fullscreenTarget(spec))!
        const canvas = nodesOf(spec).find(n => n.role === ROLE_CANVAS)!
        expect(nodesOf(target)).toContain(canvas)
        expect(target).not.toBe(canvas)
      })

      it('keeps the transport inside it too — the reason it names the wrapper', () => {
        // The assertion above checks only that the *canvas* is a descendant,
        // which is not what design §8.2 gives as the reason: "Fullscreening
        // the canvas would make sibling transport unrenderable and R15+R16
        // unimplementable together." The clause carrying that reason had no
        // assertion behind it at all.
        //
        // Unfalsifiable against today's four specs, knowingly: the target IS
        // the root, so every node is inside it and this cannot fail. That is
        // a statement about the current tree, not about the rule — the rule
        // is what stops the next person retargeting fullscreen at an inner
        // box. The positive control below is what proves the predicate
        // discriminates, and it is the load-bearing half of this pair.
        expect(transportSurvivesFullscreen(spec, fullscreenTarget(spec))).toBe(true)
      })

      it('makes the transport container transparent to pointers', () => {
        const transport = nodesOf(spec).find(n => n.role === ROLE_TRANSPORT)!
        expect(transport.pointerEvents).toBe('none')
      })

      it('makes every control inside it take pointers again', () => {
        const transport = nodesOf(spec).find(n => n.role === ROLE_TRANSPORT)!
        const controls = nodesOf(transport).filter(n => isControlRole(n.role))
        // Found by walking, never by a hand-listed set, so a control added
        // later without the property fails here instead of shipping
        // unclickable under the container's `none`.
        expect(controls.length).toBeGreaterThanOrEqual(2)
        for (const control of controls) {
          expect(control.pointerEvents).toBe('auto')
        }
      })

      it('leaves no ancestor of the canvas swallowing its clicks', () => {
        // A canvas with no `pointer-events` of its own is still unclickable
        // under an ancestor set to `none`, so asserting the canvas alone would
        // prove nothing. Clicking the canvas is how the diagnostics band is
        // placed today, which is what makes this load-bearing.
        const path = pathToRole(spec, ROLE_CANVAS)!
        expect(path.length).toBeGreaterThanOrEqual(2)
        for (const ancestor of path.slice(0, -1)) {
          expect(ancestor.pointerEvents).not.toBe('none')
        }
      })

      it('states nothing at all about the canvas itself', () => {
        // Not `'auto'`: an explicit auto would make the canvas clickable *in
        // spite of* an ancestor saying none, and hide that bug from the
        // assertion above. The canvas keeps the plain default hit behaviour.
        const canvas = nodesOf(spec).find(n => n.role === ROLE_CANVAS)!
        expect(canvas.pointerEvents).toBeUndefined()
      })
    })
  }

  it('would reject a target holding the canvas but not the transport', () => {
    // The positive control for the clause above, and the only way to show the
    // two clauses are not the same clause. `stage` contains the canvas, so
    // "keeps the canvas a proper descendant" is perfectly satisfied by
    // fullscreening it — and the transport, left outside as a sibling, stops
    // being painted. That is design §8.2's sentence, made falsifiable.
    const canvasNode: ChromeNode = { role: ROLE_CANVAS, tag: 'canvas', flow: 'flow' }
    const stage: ChromeNode = { role: 'stage', tag: 'div', flow: 'flow', children: [canvasNode] }
    const retargeted: ChromeNode = {
      role: ROLE_WRAPPER,
      tag: 'div',
      flow: 'flow',
      children: [
        stage,
        {
          role: ROLE_TRANSPORT,
          tag: 'div',
          flow: 'absolute',
          pointerEvents: 'none',
          children: [{ role: ROLE_PLAY, tag: 'button', flow: 'flow', pointerEvents: 'auto' }],
        },
      ],
    }
    // The canvas clause cannot tell the two candidate targets apart...
    expect(nodesOf(stage)).toContain(canvasNode)
    expect(stage).not.toBe(canvasNode)
    // ...and the transport clause can, which is the whole point of adding it.
    expect(transportSurvivesFullscreen(retargeted, ROLE_WRAPPER)).toBe(true)
    expect(transportSurvivesFullscreen(retargeted, 'stage')).toBe(false)
    // Neither a target absent from the tree nor a tree with no transport is a
    // pass: both would satisfy "nothing is outside the target" vacuously.
    expect(transportSurvivesFullscreen(retargeted, 'invented-tomorrow')).toBe(false)
    expect(transportSurvivesFullscreen(stage, 'stage')).toBe(false)
  })

  it('refuses a tree that is not rooted at a wrapper', () => {
    // Positive control for the two assertions above: they would both hold
    // vacuously if `fullscreenTarget` returned the literal wrapper role no
    // matter what it was handed, and a renderer would then fullscreen an
    // element that is not in the tree.
    const canvasRooted: ChromeNode = { role: ROLE_CANVAS, tag: 'canvas', flow: 'flow' }
    expect(() => fullscreenTarget(canvasRooted)).toThrow(/wrapper/)
  })
})

describe('nothing sits above the canvas in normal flow (design §8.3)', () => {
  /** A toolbar — the thing somebody will one day want above the plate. */
  const toolbar = (flow: 'flow' | 'absolute' | 'fixed'): ChromeNode => ({
    role: 'toolbar',
    tag: 'div',
    flow,
  })
  const canvasNode: ChromeNode = { role: ROLE_CANVAS, tag: 'canvas', flow: 'flow' }
  const transportNode: ChromeNode = {
    role: ROLE_TRANSPORT,
    tag: 'div',
    flow: 'flow',
    pointerEvents: 'none',
    children: [{ role: ROLE_PLAY, tag: 'button', flow: 'flow', pointerEvents: 'auto' }],
  }
  const rooted = (children: readonly ChromeNode[]): ChromeNode => ({
    role: ROLE_WRAPPER,
    tag: 'div',
    flow: 'flow',
    children,
  })

  for (const framing of EVERY_FRAMING) {
    it(`${framing} puts nothing above the canvas and nothing in its way`, () => {
      expect(flowViolations(chromeSpec(framing))).toEqual([])
    })
  }

  it('rejects an in-flow node above the canvas', () => {
    // The positive control. Every assertion above is "the list is empty", and
    // a predicate that never finds anything satisfies all four of them.
    const bad = rooted([toolbar('flow'), canvasNode, transportNode])
    const found = flowViolations(bad)
    expect(found.map(v => v.kind)).toContain('above-canvas')
    expect(found.find(v => v.kind === 'above-canvas')!.role).toBe('toolbar')
  })

  it('permits the same node once it is out of flow', () => {
    // And the negative half of the control: the rule is about flow, not about
    // document order, so a predicate that rejected any preceding sibling
    // whatsoever would pass the test above for the wrong reason.
    expect(flowViolations(rooted([toolbar('absolute'), canvasNode, transportNode]))).toEqual([])
    expect(flowViolations(rooted([toolbar('fixed'), canvasNode, transportNode]))).toEqual([])
  })

  it('looks at every level, not just the canvas’s own parent', () => {
    // The displacement is of the canvas's *branch*: a strip above the box the
    // canvas is inside moves the canvas by exactly as much as one beside it.
    const nested = rooted([
      toolbar('flow'),
      { role: 'stage', tag: 'div', flow: 'flow', children: [canvasNode] },
      transportNode,
    ])
    expect(flowViolations(nested).map(v => v.kind)).toContain('above-canvas')

    const deep = rooted([
      {
        role: 'stage',
        tag: 'div',
        flow: 'flow',
        children: [{ role: 'label', tag: 'p', flow: 'flow' }, canvasNode],
      },
      transportNode,
    ])
    const inner = flowViolations(deep).find(v => v.kind === 'above-canvas')!
    expect(inner.role).toBe('label')
    expect(inner.parentRole).toBe('stage')
  })

  it('rejects a transport placed above the canvas in flow, on both counts', () => {
    const bad = rooted([transportNode, canvasNode])
    const kinds = flowViolations(bad).map(v => v.kind)
    expect(kinds).toContain('above-canvas')
    expect(kinds).toContain('transport-placement')
  })

  it('permits an overlaid transport wherever it sits in the children', () => {
    const overlay = { ...transportNode, flow: 'absolute' as const }
    expect(flowViolations(rooted([overlay, canvasNode]))).toEqual([])
    expect(flowViolations(rooted([canvasNode, overlay]))).toEqual([])
  })

  it('rejects a transport that is in flow but not after the canvas', () => {
    // In flow and in a different branch: it neither follows the canvas nor is
    // out of its way, so the canvas's origin depends on how tall it is.
    const sideways = rooted([
      { role: 'strip', tag: 'div', flow: 'flow', children: [transportNode] },
      canvasNode,
    ])
    expect(flowViolations(sideways).map(v => v.kind)).toContain('transport-placement')
  })

  it('reports a missing canvas or transport rather than holding vacuously', () => {
    // Without this the whole predicate is satisfied by an empty wrapper, which
    // is the exact shape a half-finished renderer would hand it.
    const empty = rooted([])
    const kinds = flowViolations(empty).map(v => v.kind)
    expect(kinds).toEqual(['absent', 'absent'])
    expect(flowViolations(rooted([canvasNode])).map(v => v.role)).toEqual([ROLE_TRANSPORT])
    expect(flowViolations(rooted([transportNode])).map(v => v.role)).toEqual([ROLE_CANVAS])
  })
})

describe('chrome auto-hides, as a pure policy (design §8.2)', () => {
  const playing = (lastActivityMs: number): ChromeActivity => ({ lastActivityMs, playing: true })

  it('keeps the idle delay a named constant with a recorded reason', () => {
    expect(Number.isFinite(CHROME_IDLE_MS)).toBe(true)
    expect(CHROME_IDLE_MS).toBeGreaterThan(0)
    // "a few seconds", design §8.2. The bounds are loose on purpose — the
    // point is that the number is inside the range the design states, not
    // that it is any particular value inside it.
    expect(CHROME_IDLE_MS).toBeGreaterThanOrEqual(1000)
    expect(CHROME_IDLE_MS).toBeLessThanOrEqual(10_000)
    // Not an inline number: declared once, with a docblock carrying the
    // argument, and referenced by name from the policy.
    expect(SOURCE).toMatch(/\/\*\*[\s\S]{80,}?\*\/\nexport const CHROME_IDLE_MS = \d/)
    const body = CODE.slice(CODE.indexOf('export function chromeVisible'))
    expect(body.slice(0, body.indexOf('\n}'))).toContain('CHROME_IDLE_MS')
  })

  it('is visible immediately after activity', () => {
    expect(chromeVisible(noteActivity(playing(0), 5_000), 5_000)).toBe(true)
  })

  it('is visible strictly before the delay and hidden strictly after it', () => {
    expect(chromeVisible(playing(0), CHROME_IDLE_MS - 1)).toBe(true)
    expect(chromeVisible(playing(0), CHROME_IDLE_MS + 1)).toBe(false)
    // The boundary itself belongs to hidden, pinned so a later refactor has to
    // mean it: "visible for CHROME_IDLE_MS, then gone".
    expect(chromeVisible(playing(0), CHROME_IDLE_MS)).toBe(false)
  })

  it('comes back on activity, again and again', () => {
    // A sequence, not a single transition: a policy that latched hidden after
    // the first timeout would satisfy every one of the assertions above.
    const script: readonly { at: number; activity: boolean }[] = [
      { at: 0, activity: true },
      { at: CHROME_IDLE_MS - 1, activity: false },
      { at: CHROME_IDLE_MS, activity: false },
      { at: CHROME_IDLE_MS * 10, activity: false },
      { at: CHROME_IDLE_MS * 10, activity: true },
      { at: CHROME_IDLE_MS * 11 - 1, activity: false },
      { at: CHROME_IDLE_MS * 11, activity: false },
      { at: CHROME_IDLE_MS * 50, activity: true },
    ]
    let state = playing(0)
    const seen = script.map(step => {
      if (step.activity) state = noteActivity(state, step.at)
      return chromeVisible(state, step.at)
    })
    expect(seen).toEqual([true, true, false, false, true, true, false, true])
  })

  it('stays visible while paused, however long ago the last activity was', () => {
    // A paused player with hidden controls has no visible way to resume.
    expect(chromeVisible({ lastActivityMs: 0, playing: false }, CHROME_IDLE_MS * 1000)).toBe(true)
    // And an omitted flag is treated as paused, which is the safe default of
    // the two: chrome that will not hide costs some plate, chrome that hides
    // with no way back costs the player.
    expect(chromeVisible({ lastActivityMs: 0 }, CHROME_IDLE_MS * 1000)).toBe(true)
  })

  it('is total for degenerate clocks', () => {
    // Backwards clock, or a stamp from the future: visible, because visible is
    // the state a user can recover from.
    //
    // Swept over the magnitude of the backwards step rather than asserted at
    // one, because the policy no longer carries an arm for it: `if (elapsed <
    // 0) return true` stood in `chromeVisible` and could not change the answer
    // for any input, since a negative elapsed is below any positive delay.
    // It was deleted — a line that cannot change the answer reads as though it
    // can — and this is the sweep that holds the behaviour it used to look
    // responsible for.
    for (const back of [1, 10, CHROME_IDLE_MS, CHROME_IDLE_MS * 10, 1e12]) {
      expect(chromeVisible(playing(back), 0), String(back)).toBe(true)
    }
    expect(chromeVisible(playing(10), 10)).toBe(true)
    for (const now of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(chromeVisible(playing(0), now)).toBe(true)
    }
    expect(chromeVisible(playing(Number.NaN), 10_000)).toBe(true)
  })

  it('is a pure function of its arguments', () => {
    const state = playing(1_000)
    const snapshot = structuredClone(state)
    expect(chromeVisible(state, 9_999)).toEqual(chromeVisible(state, 9_999))
    expect(noteActivity(state, 7_000)).toEqual(noteActivity(state, 7_000))
    expect(state).toEqual(snapshot)
    // No clock of its own, either: a module that read `Date.now` would pass
    // every assertion above and still be untestable where it is used.
    expect(CODE).not.toMatch(/Date\.now|performance\.now|setTimeout|requestAnimationFrame/)
    expect(CODE).toContain('export function chromeVisible')
    expect(CODE.length).toBeGreaterThan(1500)
  })

  /**
   * The file header's rule, verbatim: *"**No DOM types appear in this file, by
   * rule** — not `HTMLElement`, not `Element`, not `CSSStyleDeclaration`.
   * `tag` is a string because this module is not allowed to know what a tag
   * resolves to."*
   *
   * It was true and nothing asserted it, which is the worst combination
   * available: the whole reason the policy is **data** rather than
   * DOM-building code is that no tier of this project has a browser, so a DOM
   * type arriving here does not fail — it quietly moves the module's rules out
   * of reach of every test in the repo at once. The same guard already exists
   * one directory over, in the sense that `chromedom.test.ts` asserts the
   * renderer may not mention a framing; this is the other half of that line.
   *
   * It reuses `CODE` for the reason `CODE` exists: the header argues about
   * `HTMLElement` and `Element` **by name**, so a grep over the raw source
   * would match the prose explaining the prohibition.
   *
   * **Word-boundaried, and that is load-bearing rather than tidy.** A bare
   * `Node` matches thirteen times in this very module, so the naive pattern is
   * red on arrival — and the obvious way to make it green is to drop the term,
   * which is the one term a renderer dragged in here would most plausibly
   * arrive as.
   *
   * The attribution of those thirteen is corrected from what this docblock used
   * to claim. It said they were `ChromeNode`, `nodesOf` and `MIN_CHROME_NODES`.
   * Measured over the stripped source: all **thirteen** are `ChromeNode`, and
   * the other two contribute **nothing** — the grep is case-sensitive, so
   * `nodesOf` has a lowercase `n` and `MIN_CHROME_NODES` has an uppercase
   * `NODES`. Right on the count, wrong on where it came from, and that mattered
   * because the near-miss controls below were written from the wrong list: one
   * of them returned `[]` under a plain substring grep too, so it discriminated
   * nothing. The boundary is still load-bearing — via `ChromeNode` alone, which
   * is enough for the argument and is now what the block asserts.
   */
  const DOM_VOCABULARY: readonly string[] = [
    'HTMLElement', 'Element', 'Node', 'NodeList', 'Document', 'document',
    'DocumentFragment', 'ShadowRoot', 'CSSStyleDeclaration', 'window',
    'createElement', 'appendChild', 'classList', 'querySelector',
    'getElementById', 'addEventListener', 'innerHTML', 'textContent',
  ]

  it('names no DOM vocabulary at all, which its header states as a rule', () => {
    for (const term of DOM_VOCABULARY) {
      expect(CODE, `${term} appears in playerchrome.ts`).not.toMatch(new RegExp(`\\b${term}\\b`))
    }
    // Vacuity floors, both halves. The list has to be a list...
    expect(DOM_VOCABULARY.length).toBeGreaterThanOrEqual(15)
    // ...and the stripped source has to still be the module rather than a
    // regex's leftovers, or every absence above is proved at once.
    expect(CODE).toContain('export function chromeSpec')
    expect(CODE).toContain('export interface ChromeNode')
    expect(CODE.length).toBeGreaterThan(1500)
  })

  it('bans it with a pattern that spares this module’s own near-misses', () => {
    const banned = (text: string): string[] =>
      DOM_VOCABULARY.filter(term => new RegExp(`\\b${term}\\b`).test(text))
    // Positive controls: the shapes a renderer leaking back in here takes.
    expect(banned('function applyTo(n: ChromeNode, element: HTMLElement): void {'))
      .toContain('HTMLElement')
    expect(banned('element.classList.add(n.role)')).toContain('classList')
    expect(banned('const element = doc.createElement(node.tag)')).toContain('createElement')
    expect(banned('function parentOf(n: Node): Node | null { return n.parentNode }'))
      .toContain('Node')
    // ...and the near-miss, as a discriminating *pair*: the substring grep
    // reds on it and the boundaried one spares it. Stated as a pair because
    // the `toEqual([])` half alone says nothing about whether the boundary did
    // any work — which is exactly how the two lines this replaces got in.
    //
    // They were `banned('export function nodesOf(spec: ChromeNode): ...')` and
    // `banned('export const MIN_CHROME_NODES = 6')`, offered as two more
    // near-misses. The first discriminates only through the `ChromeNode` it
    // happens to contain, so it was the line above again; the second returns
    // `[]` under a substring grep too and discriminated nothing at all.
    // Neither identifier is a near-miss: the grep is case-sensitive, `nodesOf`
    // is lowercase and `MIN_CHROME_NODES` is uppercase.
    const substringBanned = (text: string): string[] =>
      DOM_VOCABULARY.filter(term => text.includes(term))
    const nearMiss = 'export interface ChromeNode { readonly role: string }'
    expect(substringBanned(nearMiss), 'the near-miss is not one, so it proves nothing')
      .toEqual(['Node'])
    expect(banned(nearMiss)).toEqual([])

    // And the claim the three hand-written lines were standing in for, taken
    // from the module instead of from a list typed here: `ChromeNode` is the
    // *only* identifier in it that a substring ban would trip on. A second one
    // arriving is a real event — another banned term now has a shadow in this
    // module, and whether the boundary still discriminates or is now hiding a
    // leak is a question for a human — so it reds rather than passing in
    // silence, which is what the old controls did.
    expect(
      substringBanned(CODE),
      'a DOM term has acquired a new substring shadow in playerchrome.ts',
    ).toEqual(['Node'])
    // ...and every one of those occurrences is `ChromeNode`, which is the
    // corrected measurement rather than a count: strike the identifier and the
    // term is gone from the module entirely.
    expect(CODE.replace(/ChromeNode/g, '')).not.toMatch(/Node/)
  })

  it('records activity without disturbing anything else about the state', () => {
    const before = playing(1_000)
    const after = noteActivity(before, 4_321)
    expect(after).toEqual({ lastActivityMs: 4_321, playing: true })
    expect(before.lastActivityMs).toBe(1_000)
    // A non-finite reading is refused rather than stored: a NaN stamp would
    // make every later comparison non-finite, pinning the chrome visible for
    // the rest of the session.
    expect(noteActivity(before, Number.NaN)).toEqual(before)
  })
})
