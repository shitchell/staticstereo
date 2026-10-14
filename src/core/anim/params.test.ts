import { describe, it, expect } from 'vitest'
import { PRESET_PARAMS } from './params.js'
import type { NumericParam } from './params.js'
import { PRESETS, compilePreset } from './presets.js'
import type { PresetKind } from './presets.js'
import { CTX } from '../testing/ctx.fixture.js'

/**
 * Look one parameter up by name and insist it carries a physical quantity.
 *
 * The lookup is by *name* rather than by index so that the assertions below
 * pin the recorded unit and nothing about how the table is ordered or spelled
 * — reordering `move`'s parameters is not a change to what a degree is.
 */
function numeric(kind: PresetKind, name: string): NumericParam {
  const d = PRESET_PARAMS[kind].find(p => p.name === name)
  if (d === undefined) throw new Error(`${kind} has no parameter "${name}"`)
  if (d.unit === 'enum') throw new Error(`${kind}.${name} is an enum, not a quantity`)
  return d
}

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

/**
 * The recorded facts, one assertion per claim.
 *
 * These are not a restatement of the table — they are the reason the table is
 * worth having. A wrong unit is invisible until P3 builds a control out of it
 * and offers a degrees spinner for a depth, or until P2 scales a multiplier by
 * the container's width. Nothing downstream can re-derive these; the function
 * bodies are the only other witness and reading units out of implementations
 * is exactly what §6a exists to stop.
 */
describe('recorded parameter units', () => {
  it('move travels in scene pixels, on both axes', () => {
    // `from`/`to` are `[x, y]` offsets from the layer's resting `at`, so both
    // components are distances and both scale under `fit=render`. The pair
    // shape is the half P2 cannot guess: `marquee.speed` is also `scenePx` and
    // is a single number.
    for (const name of ['from', 'to']) {
      const d = numeric('move', name)
      expect(d.unit, name).toBe('scenePx')
      expect(d.shape, name).toBe('pair')
      expect(d.per, name).toBeUndefined()
    }
  })

  it('move\'s speed is a scene-pixel rate per second, not a unit of its own', () => {
    // Tagged `scenePx` + `per: 'second'` on purpose. A `scenePxPerSecond` tag
    // would hide it from "scale every scenePx parameter", which is the rule
    // `fit=render` is going to be written as — and the geometry scaling while
    // time does not is precisely why the same factor is correct for both.
    const d = numeric('move', 'speed')
    expect(d.unit).toBe('scenePx')
    expect(d.shape).toBe('scalar')
    expect(d.per).toBe('second')
  })

  it('push moves in depth, which is normalised and does not scale', () => {
    // `from`/`to` are absolute depths in 0..1. Were these mistagged `scenePx`,
    // `fit=render` would multiply a depth by the container's scale factor and
    // drive every pushed layer straight into the near clamp.
    for (const name of ['from', 'to']) {
      const d = numeric('push', name)
      expect(d.unit, name).toBe('depth')
      expect(d.shape, name).toBe('scalar')
      expect(d.per, name).toBeUndefined()
    }
  })
})
