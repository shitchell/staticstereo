import { describe, it, expect } from 'vitest'
import { EASINGS, isEasing, resolveEasing } from './easing.js'
import { cubicBezier } from './bezier.js'

const SAMPLES = Array.from({ length: 21 }, (_, i) => i / 20)

describe('isEasing', () => {
  it('accepts every key of EASINGS', () => {
    // Derived from the record rather than written out, so adding a sixth
    // named curve cannot leave the guard behind. The named union and
    // `EASINGS` are the same set by construction (`Record<NamedEasing, …>`),
    // and this is the runtime half of that claim.
    for (const name of Object.keys(EASINGS)) {
      expect(isEasing(name), name).toBe(true)
    }
  })

  it('accepts a well-formed cubic-bezier, in the spellings CSS allows', () => {
    for (const s of [
      'cubic-bezier(.17,.67,.83,.67)',   // the acceptance case: leading dots
      'cubic-bezier(0.42, 0, 0.58, 1)',  // spaces after the commas
      'cubic-bezier(0,0,1,1)',           // integers
      'cubic-bezier(0.68,-0.55,0.265,1.55)', // y overshoot, both directions
      'cubic-bezier(1,0,0,1)',           // x at both closed bounds
      ' cubic-bezier(0,0,1,1) ',         // surrounding whitespace
      'cubic-bezier(5e-1,0,5e-1,1)',     // exponent notation is a CSS <number>
    ]) {
      expect(isEasing(s), s).toBe(true)
    }
  })

  it('rejects a malformed cubic-bezier', () => {
    for (const s of [
      'cubic-bezier(0,0,1)',        // three
      'cubic-bezier(0,0,1,1,1)',    // five
      'cubic-bezier()',             // none
      'cubic-bezier(a,b,c,d)',      // not numbers
      'cubic-bezier(0,0,1,1',       // unclosed
      'cubic-bezier 0,0,1,1',       // no parens
      'cubicbezier(0,0,1,1)',       // near-miss function name
      'cubic-bezier(0,0,1,1)x',     // trailing junk
      'cubic-bezier(0,,1,1)',       // empty argument
      'cubic-bezier(1abc,0,1,1)',   // parseFloat would have taken this as 1
      'cubic-bezier(NaN,0,1,1)',
      'cubic-bezier(0,Infinity,1,1)',
    ]) {
      expect(isEasing(s), s).toBe(false)
    }
  })

  it('rejects an x control point outside 0..1 but allows y anywhere', () => {
    // The asymmetry is the solver's constraint, not a style choice: x is what
    // gets inverted, and outside 0..1 it stops being monotonic. See
    // `bezier.ts`. Accepting an out-of-range x here would push the failure
    // into `cubicBezier`, which throws — turning an authoring typo into a
    // render-time crash instead of a validation error naming the file.
    for (const s of [
      'cubic-bezier(1.1,0,0.5,1)',
      'cubic-bezier(-0.1,0,0.5,1)',
      'cubic-bezier(0.5,0,1.5,1)',
      'cubic-bezier(0.5,0,-0.01,1)',
    ]) {
      expect(isEasing(s), s).toBe(false)
    }
    expect(isEasing('cubic-bezier(0.5,-9,0.5,9)')).toBe(true)
  })

  it('rejects a near-miss name', () => {
    // The whole reason `Easing` is widened with a template literal rather
    // than to `string`: these stay compile errors, and the runtime guard
    // agrees with the type.
    for (const s of ['easeout', 'ease-out', 'easeOutBonce', 'ease', 'Linear', 'bounce', '']) {
      expect(isEasing(s), s).toBe(false)
    }
  })

  it('rejects anything that is not a string', () => {
    for (const v of [undefined, null, 5, {}, [], true, { kind: 'linear' }]) {
      expect(isEasing(v), JSON.stringify(v) ?? 'undefined').toBe(false)
    }
  })
})

describe('resolveEasing', () => {
  it('returns the shipped function for a named easing', () => {
    for (const [name, fn] of Object.entries(EASINGS)) {
      const r = resolveEasing(name as keyof typeof EASINGS)
      for (const t of SAMPLES) expect(r(t), `${name} @ ${t}`).toBe(fn(t))
    }
  })

  it('returns the curve a cubic-bezier names', () => {
    // Checked against `cubicBezier` rather than against values, so this test
    // pins the *wiring* — that the four numbers are parsed in order and
    // handed over — and leaves the curve's own correctness to `bezier.test.ts`.
    const r = resolveEasing('cubic-bezier(.17,.67,.83,.67)')
    const f = cubicBezier(0.17, 0.67, 0.83, 0.67)
    for (const t of SAMPLES) expect(r(t), `t=${t}`).toBe(f(t))
  })

  it('does not transpose the control points', () => {
    // An asymmetric curve, so swapping any pair gives a different function.
    // With a symmetric one this test would pass against a solver that read
    // the arguments backwards.
    const r = resolveEasing('cubic-bezier(0.1,0.9,0.2,0.3)')
    const f = cubicBezier(0.1, 0.9, 0.2, 0.3)
    for (const t of SAMPLES) expect(r(t), `t=${t}`).toBe(f(t))
    expect(r(0.5)).not.toBe(cubicBezier(0.9, 0.1, 0.3, 0.2)(0.5))
  })

  it('throws on a string that is not an easing', () => {
    // The type keeps honest callers out of here, but both scene validators
    // take unvalidated input and the resolver is the last line. Returning
    // `linear` instead would render the scene with silently wrong motion.
    for (const s of ['nope', 'cubic-bezier(0,0,1)', 'cubic-bezier(2,0,1,1)']) {
      expect(() => resolveEasing(s as never), s).toThrow(/easing/)
    }
  })
})
