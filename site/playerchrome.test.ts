import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CHROME_IDLE_MS,
  CONTROL_PREFIX,
  FRAMINGS,
  FRAMING_NAMES,
  MIN_CHROME_NODES,
  ROLE_CANVAS,
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

describe('every framing carries a transport (R16, design §8.2)', () => {
  for (const framing of EVERY_FRAMING) {
    describe(framing, () => {
      const spec = chromeSpec(framing)

      it('is not a stub', () => {
        // A wrapper holding only a canvas would pass "contains a canvas" and
        // every other shape assertion that does not count. The floor is the
        // smallest conformant tree: wrapper, canvas, transport, play, seek.
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
    expect(chromeVisible(playing(CHROME_IDLE_MS * 10), 0)).toBe(true)
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
