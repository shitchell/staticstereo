import { describe, it, expect } from 'vitest'
import { PRESET_PARAMS } from './params.js'
import { PRESETS, compilePreset } from './presets.js'
import { CTX } from '../testing/ctx.fixture.js'

/**
 * The descriptor table is *tied* to the registry by its type — deleting a
 * kind's entry is a compile error, not a silent gap. These are the halves of
 * the tie that a type cannot state.
 */
describe('preset parameter descriptors', () => {
  it('covers exactly the registered kinds', () => {
    // The compile-time tie catches a *missing* entry. It cannot catch a stale
    // one, because `PRESETS` is `Record<string, PresetFn>` — deliberately, so
    // that `compilePreset` can index it with a plain string — and an extra key
    // in a `Record<PresetKind, …>` is only an error at the literal. This is
    // the runtime half: a kind deleted from the registry must lose its
    // descriptors too.
    expect(Object.keys(PRESET_PARAMS).sort()).toEqual(Object.keys(PRESETS).sort())
  })

  it('names each parameter once per kind', () => {
    // A duplicated name means two descriptors disagree about one parameter and
    // a consumer sees whichever it reaches first — the silent mis-scale §6a is
    // written to prevent, one level down.
    for (const [kind, params] of Object.entries(PRESET_PARAMS)) {
      const names = params.map(p => p.name)
      expect(new Set(names).size, `${kind}: duplicate parameter name`).toBe(names.length)
    }
  })

  it('declares exactly the enum values the preset itself names', () => {
    // Enumerating the accepted values proves the list is not *too small*;
    // matching it against the reader's own error text proves it is not too
    // large. Together they make the descriptor a recorded fact rather than a
    // hand-maintained guess that drifts the first time a direction is added.
    for (const [kind, params] of Object.entries(PRESET_PARAMS)) {
      for (const d of params) {
        if (d.unit !== 'enum') continue
        expect(d.values.length, `${kind}.${d.name}: empty enum`).toBeGreaterThan(0)
        for (const v of d.values) {
          expect(() => compilePreset({ kind, [d.name]: v }, CTX), `${kind}.${d.name}=${v}`)
            .not.toThrow()
        }
        const bogus = `__no_such_${d.name}__`
        let msg = ''
        try {
          compilePreset({ kind, [d.name]: bogus }, CTX)
        } catch (e) {
          msg = String(e)
        }
        expect(msg, `${kind}.${d.name} silently accepted ${bogus}`).not.toBe('')
        for (const v of d.values) {
          expect(msg, `${kind}.${d.name}: reader does not name "${v}"`).toContain(v)
        }
      }
    }
  })
})
