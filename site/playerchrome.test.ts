import { describe, expect, it } from 'vitest'
import {
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
  fullscreenTarget,
  isControlRole,
  nodesOf,
  pathToRole,
} from './playerchrome.js'
import type { ChromeNode, Framing } from './playerchrome.js'

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
