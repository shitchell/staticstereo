import { describe, it, expect } from 'vitest'
import { PRESET_PARAMS } from './params.js'
import type { NumericParam, ParamDescriptor } from './params.js'
import { PRESETS, compilePreset } from './presets.js'
import type { PresetCtx, PresetKind } from './presets.js'
import { CTX, GOLDEN_CTX } from '../testing/ctx.fixture.js'

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
    // shape is the half P2 cannot guess: `move.speed` is also `scenePx` and
    // is a single number.
    //
    // `endpoint-pair` rather than `pair`, and the arity is the same two: the
    // member says additionally that either slot may carry one of the symbolic
    // off-stage endpoints `endpointPair` resolves, which a consumer
    // generating a control needs and no unit tag can tell it. **The unit is
    // asserted beside it on purpose** — whether the value is a *length* is
    // still the unit's statement and not the shape's, which is what keeps
    // `move.speed` inside "scale every `scenePx` parameter".
    for (const name of ['from', 'to']) {
      const d = numeric('move', name)
      expect(d.unit, name).toBe('scenePx')
      expect(d.shape, name).toBe('endpoint-pair')
      expect(d.per, name).toBeUndefined()
      expect(d.tokens, `${name} accepts names and records none`).toBeDefined()
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

/**
 * The recorded defaults, checked against behaviour rather than believed.
 *
 * A table that merely *claims* a default is worth nothing — it is a second
 * copy of a fact whose first copy is the `PresetFn` body, and two copies of a
 * number drift. These tests make the table a *checked* copy: the claim is
 * worth exactly as much as the assertion that it still matches what the
 * function does, which is the same deal `recorded parameter units` above
 * strikes for units.
 *
 * Everything below runs under **two** contexts whose `layerDepth` differs.
 * That is not redundancy: it is the only thing that distinguishes a default of
 * "0.6" from a default of "wherever this layer sits". A literal recorded for
 * `push.to` passes under one ctx and fails under the other.
 */
const CONTEXTS: ReadonlyArray<readonly [string, PresetCtx]> = [
  ['CTX (layerDepth 1)', CTX],
  ['GOLDEN_CTX (layerDepth 0.6)', GOLDEN_CTX],
]

/** What an author would have to write to get the recorded default explicitly. */
function explicitly(d: ParamDescriptor, ctx: PresetCtx): unknown {
  switch (d.default.from) {
    case 'value': return d.default.value
    case 'ctx': return ctx[d.default.key]
    case 'none': throw new Error(`${d.name} has no default to spell out`)
  }
}

describe('recorded parameter defaults', () => {
  it('records a default for every parameter of every registered kind', () => {
    // Without this a later phase cannot render a control with an initial
    // value, so it reads the defaults back out of the `PresetFn` bodies —
    // exactly the reverse-engineering §6a exists to stop.
    for (const [kind, params] of Object.entries(PRESET_PARAMS)) {
      for (const d of params) {
        expect(['value', 'ctx', 'none'], `${kind}.${d.name}`).toContain(d.default?.from)
      }
    }
  })

  it('spells the default in the shape the descriptor claims', () => {
    for (const [kind, params] of Object.entries(PRESET_PARAMS)) {
      for (const d of params) {
        const where = `${kind}.${d.name}`
        if (d.unit === 'enum') {
          // An enum default outside its own value list is a control whose
          // initial selection is not one of its options.
          expect(d.default.from, where).toBe('value')
          expect(d.values, where).toContain(explicitly(d, CTX))
          continue
        }
        if (d.default.from !== 'value') continue
        // Every non-scalar shape is a pair today, and the condition is
        // written that way round deliberately: a shape added to `ParamShape`
        // and not classified here lands in the two-member branch and reds,
        // where `=== 'pair'` would have sent it quietly to the scalar check
        // and asked `Number.isFinite` of an array.
        if (d.shape !== 'scalar') {
          expect(d.default.value, where).toHaveLength(2)
          for (const n of d.default.value as readonly number[]) {
            expect(Number.isFinite(n), where).toBe(true)
          }
        } else {
          expect(Number.isFinite(d.default.value), where).toBe(true)
        }
      }
    }
  })

  for (const [label, ctx] of CONTEXTS) {
    it(`compiles the same track bare as with every default spelled out — ${label}`, () => {
      // The acceptance, and the whole point of the task: a recorded default
      // must *be* the default. Passing one parameter explicitly at its
      // recorded value, leaving the rest bare, has to produce the byte-equal
      // track the fully bare preset produces. Per-parameter rather than all
      // at once so a failure names the offender.
      for (const kind of Object.keys(PRESET_PARAMS) as PresetKind[]) {
        const bare = compilePreset({ kind }, ctx)
        for (const d of PRESET_PARAMS[kind]) {
          if (d.default.from === 'none') continue
          const spelled = compilePreset({ kind, [d.name]: explicitly(d, ctx) }, ctx)
          expect(spelled, `${kind}.${d.name}`).toEqual(bare)
        }
      }
    })
  }

  it('marks a parameter whose omission is not equivalent to any value', () => {
    // `from: 'none'` must not become the lazy answer for a default someone did
    // not want to look up. It is only honest when omitting the parameter
    // selects *different behaviour* rather than a value — `move.speed` absent
    // means "do not derive a duration at all", which no number expresses — so
    // a probe value has to visibly change the compiled track.
    const probes: Record<string, unknown> = { scalar: 1, pair: [1, 1] }
    // Extra parameters a probe needs to be *legal*, not merely meaningful. A
    // bare `move` runs [0,0] → [0,0], and `speed` over a zero-length move is
    // rejected outright: it derives `duration: 0`, which `localTime` divides
    // by. Probing against a move that actually travels asks the same question
    // — "is omitting `speed` equivalent to some value of it?" — in the only
    // place the parameter is allowed to exist.
    const probeBase: Partial<Record<PresetKind, Record<string, unknown>>> = {
      move: { to: [10, 0] },
    }
    let seen = 0
    for (const kind of Object.keys(PRESET_PARAMS) as PresetKind[]) {
      for (const d of PRESET_PARAMS[kind]) {
        if (d.unit === 'enum' || d.default.from !== 'none') continue
        seen++
        const base = { kind, ...probeBase[kind] }
        const bare = compilePreset(base, CTX)
        const probed = compilePreset({ ...base, [d.name]: probes[d.shape] }, CTX)
        expect(probed, `${kind}.${d.name} has a default after all`).not.toEqual(bare)
      }
    }
    // Pins that the marker is in use. If a later edit gives `move.speed` a
    // default, this drops to 0 and says so rather than vacuously passing.
    expect(seen, 'no parameter is marked as having no default').toBe(1)
  })

  it('records push.to as the layer\'s own depth, not a number', () => {
    // The one default that cannot be a literal, and the reason the marker
    // exists. `{kind: "push"}` means "come up from the noise to wherever this
    // layer lives" — a consumer must be able to tell that from "defaults to
    // 0.5", and an omitted field says neither. `keyof PresetCtx` ties the key
    // to the context type, so renaming the field is a compile error here
    // rather than a control that initialises to `undefined`.
    const d = numeric('push', 'to')
    expect(d.default.from).toBe('ctx')
    expect(d.default).toEqual({ from: 'ctx', key: 'layerDepth' })
  })
})
