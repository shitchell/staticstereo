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
  isControlRole,
  nodesOf,
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
