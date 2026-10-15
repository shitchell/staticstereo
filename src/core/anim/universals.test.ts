/**
 * The parameters every verb honours, and the one verb that disagrees about
 * a default.
 *
 * `PRESET_PARAMS` describes what each verb takes *on its own*. It describes
 * none of `start`, `duration`, `ease` or `repeat`, because `overrides()`
 * applies them to every preset alike, and repeating them in every verb's
 * table would rot the moment a newly registered verb forgot them —
 * `params.ts`' own argument.
 * `UNIVERSAL_PARAMS` is the sibling table that argument asks for.
 *
 * ## Why this is a sibling table and not an extra key
 *
 * `params.test.ts` pins `Object.keys(PRESET_PARAMS)` equal to
 * `Object.keys(PRESETS)`. A pseudo-key holding the universals would redden
 * that, correctly: `PRESET_PARAMS` is keyed by the *registry*, and "every
 * verb" is not a verb. The site layer would have accepted the pseudo-key —
 * `ControlRosters.preset` is `Record<string, …>`, not `Record<PresetKind, …>`
 * — so the permissive consumer is not evidence that the shape is right.
 *
 * ## The two halves, and they are checked by two different instruments
 *
 * `ease` and `repeat` are substituted **by the compiler**: every verb writes
 * one of each onto the `Track` it returns, so the recorded default is checked
 * the way `params.test.ts` checks every other default — compile bare, compile
 * with the default spelled out, demand the two tracks be identical.
 *
 * `start` and `duration` are **not**. No verb writes either onto its track;
 * they stay absent and `evalTrack` supplies them, which is why spelling
 * `start: 0` produces a track that is *not* equal to the bare one. Recording
 * them as `value` defaults would therefore be a lie of exactly the kind
 * `params.ts` built `NoDefault` to avoid — and `NoDefault` would be the
 * opposite lie, because omitting them *is* equivalent to a value, just one
 * substituted a stage later. They get their own two cases, and the check is
 * run through `evalTrack` rather than `compilePreset`.
 *
 * ## Units
 *
 * `start` is **seconds** here and **degrees** on a `shape` layer, and
 * `Transform.rotate` is radians while `rotate`'s parameter is degrees. Design
 * §9.1 cites that collision as the reason provenance cannot be recovered from
 * a union, so every descriptor below carries its unit and the sweep over
 * `from` further down shows what a bare name is worth: one word, several
 * recorded quantities.
 */
import { describe, it, expect } from 'vitest'
import {
  PARAM_UNITS, PRESET_PARAMS, UNIVERSAL_PARAMS, VERB_DEFAULTS, universalParams,
} from './params.js'
import type { ParamDescriptor, VerbDefaults } from './params.js'
import { PRESETS, compilePreset } from './presets.js'
import type { Preset, Track } from '../types.js'
import type { PresetKind } from './presets.js'
import { evalTrack } from './track.js'
import { CUBIC_BEZIER_SYNTAX, EASINGS } from './easing.js'
import { CTX, GOLDEN_CTX } from '../testing/ctx.fixture.js'

/** The registered verbs, taken from the registry rather than written out. */
const KINDS = Object.keys(PRESETS) as PresetKind[]

/** One descriptor of the universal table, by name. */
function universal(kind: PresetKind, name: string): ParamDescriptor {
  const d = universalParams(kind).find(p => p.name === name)
  if (d === undefined) throw new Error(`no universal parameter "${name}"`)
  return d
}

/**
 * Every key a verb's compilation *reads* off the preset it is handed.
 *
 * A Proxy rather than a parse of `overrides()`' source. The source is three
 * `p['…']` lookups today and a regex over them would answer correctly today;
 * it would also answer confidently the day one of them moves behind a helper,
 * a destructure or a line wrap. Executing the thing is strictly stronger —
 * it sees whatever the function actually asks for, however it is spelled —
 * and `overrides()` is executable, so §9's "where the upstream is executable,
 * execute it" applies.
 */
function keysRead(kind: PresetKind): ReadonlySet<string> {
  const seen = new Set<string>()
  const base: Record<string, unknown> = { kind }
  const probe = new Proxy(base, {
    get(target, key) {
      if (typeof key === 'string') seen.add(key)
      // `Reflect.get` rather than `target[key]`: a Proxy's `get` trap is
      // handed symbols too (vitest's equality checks reach for
      // `Symbol.toStringTag`), and only strings are parameter names.
      return Reflect.get(target, key)
    },
  }) as unknown as Preset
  compilePreset(probe, CTX)
  return seen
}

/** The keys every registered verb reads — the universal set, `kind` included. */
function readByEveryKind(kinds: readonly PresetKind[]): readonly string[] {
  const sets = kinds.map(keysRead)
  const first = sets[0]
  if (first === undefined) throw new Error('no kinds to intersect')
  return [...first].filter(k => sets.every(s => s.has(k))).sort()
}

/**
 * The key that selects the verb rather than parameterising it.
 *
 * `kind` is the one property `Preset` declares by name; everything else
 * reaches it through the index signature. `satisfies` ties the spelling to
 * the type, so renaming the discriminant is a compile error here rather than
 * an extra "universal parameter" appearing in the table below.
 */
const DISCRIMINANT = 'kind' satisfies keyof Preset

describe('the universal parameter set', () => {
  it('is derived by running every verb, not by reading a list someone typed', () => {
    const read = readByEveryKind(KINDS)
    // The control for the instrument, and it is two-sided. If the probe
    // stopped seeing `kind` the filter below would be excluding nothing, and
    // the set would look right for the wrong reason.
    expect(read, 'the probe no longer observes the discriminant').toContain(DISCRIMINANT)
    const universals = read.filter(k => k !== DISCRIMINANT)
    expect(universalParams(KINDS[0]!).map(p => p.name).sort()).toEqual(universals)
    expect(UNIVERSAL_PARAMS.map(p => p.name).sort()).toEqual(universals)
  })

  it('narrows: a key only some verbs read is not universal', () => {
    // The other half of the control. An intersection that returned everything
    // would also "contain the universal four", so the measurement is only
    // evidence if something can be seen to drop out of it. `axis` is read by
    // `rotate` and `flip` and by neither of the other three.
    const axisReaders = KINDS.filter(k => keysRead(k).has('axis'))
    expect(axisReaders.length, 'no verb reads `axis` any more').toBeGreaterThan(0)
    expect(axisReaders.length, '`axis` is read by every verb, so it proves nothing')
      .toBeLessThan(KINDS.length)
    expect(readByEveryKind(KINDS)).not.toContain('axis')
    // …and over the verbs that do read it, it survives the intersection.
    expect(readByEveryKind(axisReaders)).toContain('axis')
  })

  it('covers the verbs the descriptor table covers', () => {
    // Not a count. `PRESET_PARAMS` is `Record<PresetKind, …>` and
    // `params.test.ts` pins its keys against the registry's, so agreeing with
    // it is agreeing with the registry through a compile-time tie.
    expect(KINDS.length, 'the preset registry collapsed').toBeGreaterThan(0)
    expect([...KINDS].sort()).toEqual(Object.keys(PRESET_PARAMS).sort())
  })

  it('offers the whole set for every verb, with no verb short of one', () => {
    for (const kind of KINDS) {
      const names = universalParams(kind).map(p => p.name).sort()
      expect(names, kind).toEqual(UNIVERSAL_PARAMS.map(p => p.name).sort())
    }
  })
})

describe('the units the universal four carry', () => {
  it('names a unit on every one of them, from the closed vocabulary', () => {
    for (const d of UNIVERSAL_PARAMS) {
      expect(PARAM_UNITS as readonly string[], d.name).toContain(d.unit)
    }
  })

  it('records start and duration in seconds — the collision is with degrees', () => {
    // `Track.start`/`duration` are seconds; `shape.start`/`end` are degrees;
    // `Transform.rotate` is radians while `rotate`'s own parameter is
    // degrees. Three quantities, two words, and the only thing standing
    // between a control and a ±3.14 spinner for a half turn is this tag.
    for (const name of ['start', 'duration']) {
      for (const kind of KINDS) {
        const d = universal(kind, name)
        expect(d.unit, `${kind}.${name}`).toBe('seconds')
        if (d.unit === 'enum') throw new Error(`${name} must not be an enum`)
        expect(d.shape, `${kind}.${name}`).toBe('scalar')
      }
    }
  })

  it('shows what a bare parameter name is worth: `from` wears four units', () => {
    // Not decoration. This is the live, in-tree demonstration that the
    // collision above is the normal case rather than a curiosity — one name,
    // several recorded quantities, across the shipped per-verb table.
    const units = new Set(
      KINDS.flatMap(k => PRESET_PARAMS[k].filter(d => d.name === 'from').map(d => d.unit)),
    )
    expect(units.size, 'every `from` now agrees, so the collision is gone').toBeGreaterThan(1)
  })

  it('gives the `seconds` tag the user `PRESET_PARAMS` reserved it for', () => {
    // `params.ts` records that `seconds` has no entry in `PRESET_PARAMS` and
    // that this is correct, "so that whoever does surface them has the word
    // already fixed". This pins the division of labour: a seconds-valued
    // parameter belongs in the universal table, not in a verb's.
    for (const kind of KINDS) {
      for (const d of PRESET_PARAMS[kind]) {
        expect(d.unit, `${kind}.${d.name} is seconds and sits in the per-verb table`)
          .not.toBe('seconds')
      }
    }
    expect(UNIVERSAL_PARAMS.filter(d => d.unit === 'seconds').length).toBeGreaterThan(0)
  })
})

/**
 * `ease` and `repeat`: defaults the *compiler* substitutes.
 *
 * Checked by `params.test.ts`' own acceptance, applied to this table — a
 * recorded default must *be* the default, demonstrated by compiling the verb
 * twice. Under two contexts for the same reason that file gives: a default
 * that is a fact about the layer rather than a number passes under one and
 * fails under the other.
 */
const CONTEXTS = [
  ['CTX (layerDepth 1)', CTX],
  ['GOLDEN_CTX (layerDepth 0.6)', GOLDEN_CTX],
] as const

describe('the defaults the compiler substitutes', () => {
  for (const [label, ctx] of CONTEXTS) {
    it(`compiles the same track bare as with each recorded default spelled out — ${label}`, () => {
      let checked = 0
      for (const kind of KINDS) {
        const bare = compilePreset({ kind }, ctx)
        for (const d of universalParams(kind)) {
          if (d.default.from !== 'value') continue
          checked++
          const spelled = compilePreset({ kind, [d.name]: d.default.value }, ctx)
          expect(spelled, `${kind}.${d.name}`).toEqual(bare)
        }
      }
      // Without this the loop above passes by skipping everything.
      expect(checked, 'no compiler-substituted default was checked').toBeGreaterThan(0)
    })
  }

  it('leaves no universal parameter marked as having no default', () => {
    // The inverse of `move.speed`. Omitting any of them *is* equivalent
    // to a value — the `start`/`duration` tests below prove it for the two
    // the compiler does not write — so `from: 'none'` would be false here,
    // and it is the lazy answer for a default nobody looked up.
    for (const kind of KINDS) {
      for (const d of universalParams(kind)) {
        expect(d.default.from, `${kind}.${d.name}`).not.toBe('none')
      }
    }
  })
})

describe('push disagrees about ease, and the disagreement is expressible', () => {
  it('records a different ease default for push than for the other verbs', () => {
    const easeOf = (kind: PresetKind) => {
      const d = universal(kind, 'ease')
      if (d.default.from !== 'value') throw new Error(`${kind}.ease is not a literal default`)
      return d.default.value
    }
    const recorded = new Set(KINDS.map(easeOf))
    expect(recorded.size, 'every verb records the same ease, so nothing is overridden')
      .toBeGreaterThan(1)
    expect(easeOf('push')).not.toBe(easeOf('move'))
  })

  it('compiles push to its own recorded ease and not to the common one', () => {
    // The demonstration rather than the assertion. A table that merely said
    // "push is different" would be a second copy of a fact whose first copy
    // is the function body. This asks the function.
    const common = universal('move', 'ease')
    const pushEase = universal('push', 'ease')
    if (common.default.from !== 'value' || pushEase.default.from !== 'value') {
      throw new Error('both ease defaults must be literals for this comparison')
    }
    const bare = compilePreset({ kind: 'push' }, CTX)
    expect(compilePreset({ kind: 'push', ease: pushEase.default.value }, CTX)).toEqual(bare)
    expect(compilePreset({ kind: 'push', ease: common.default.value }, CTX)).not.toEqual(bare)
    // …and the converse, so the test is not passing because `push` is special
    // in some way that has nothing to do with the recorded value.
    const moveBare = compilePreset({ kind: 'move' }, CTX)
    expect(compilePreset({ kind: 'move', ease: common.default.value }, CTX)).toEqual(moveBare)
    expect(compilePreset({ kind: 'move', ease: pushEase.default.value }, CTX)).not.toEqual(moveBare)
  })

  it('records no departure that is not a departure', () => {
    // An override equal to the common default is inert, and an inert entry in
    // a table of exceptions is worse than none: it says a verb is special
    // when it is not, and the next reader builds on it.
    const base = new Map(UNIVERSAL_PARAMS.map(d => [d.name, d.default]))
    let departures = 0
    for (const [kind, byName] of Object.entries(VERB_DEFAULTS)) {
      for (const [name, def] of Object.entries(byName ?? {})) {
        expect(base.has(name), `${kind}.${name} is not a universal parameter`).toBe(true)
        expect(def, `${kind}.${name} restates the common default`).not.toEqual(base.get(name))
        departures++
      }
    }
    expect(departures, 'the per-verb override mechanism has no user').toBeGreaterThan(0)
  })

  it('rejects an override for a parameter the universal table does not have', () => {
    const bogus: VerbDefaults = { push: { notAUniversal: { from: 'value', value: 1 } } }
    expect(() => universalParams('push', bogus)).toThrow(/notAUniversal/)
  })

  it('applies a planted departure without the table being edited', () => {
    // The override table is a defaulted parameter, so a consumer can ask what
    // the descriptors would be under a different set of departures. Without
    // this the mechanism is only exercised by the one entry that ships.
    const planted: VerbDefaults = { flip: { repeat: { from: 'value', value: 'loop' } } }
    const d = universalParams('flip', planted).find(p => p.name === 'repeat')!
    expect(d.default).toEqual({ from: 'value', value: 'loop' })
    // Unplanted verbs are untouched, and the shipped table is not mutated.
    expect(universalParams('move', planted).find(p => p.name === 'repeat')!.default)
      .toEqual({ from: 'value', value: 'once' })
    expect(universal('flip', 'repeat').default).toEqual({ from: 'value', value: 'once' })
  })
})

/**
 * `start` and `duration`: defaults the compiler does **not** substitute.
 *
 * `evalTrack` does, and it is the only place that knows the scene's length.
 * These tests drive the evaluator at several times rather than comparing
 * tracks, because the two tracks are by construction *not* equal — that
 * inequality is the finding, and it is asserted first.
 */
const SCENE_DURATION = 4
const SAMPLES = [0, 0.5, 1, 2, 3, 4]

/** The trajectory a track describes over the whole scene. */
function trajectory(tr: Track): string {
  return SAMPLES.map(s => JSON.stringify(evalTrack(tr, s, SCENE_DURATION))).join('|')
}

describe('the defaults the evaluator substitutes', () => {
  it('does not claim the compiler writes start or duration', () => {
    for (const kind of KINDS) {
      for (const name of ['start', 'duration']) {
        const d = universal(kind, name)
        expect(['value', 'ctx'], `${kind}.${name}`).not.toContain(d.default.from)
      }
    }
  })

  it('and the compiler demonstrably does not: spelling start out changes the track', () => {
    // The measurement the claim above rests on. Were `start` recorded as a
    // `value` default, `params.test.ts`' acceptance — compile bare, compile
    // spelled, demand equality — would be false for it.
    for (const kind of KINDS) {
      const bare = compilePreset({ kind }, CTX)
      expect(bare.start, `${kind} writes a start after all`).toBeUndefined()
      expect(compilePreset({ kind, start: 0 }, CTX), kind).not.toEqual(bare)
    }
  })

  it('substitutes start at evaluation, so omitting it is the recorded value', () => {
    const d = universal('move', 'start')
    if (d.default.from !== 'eval') throw new Error('start is no longer an eval default')
    const bare = compilePreset({ kind: 'move', to: [100, 0] }, CTX)
    const spelled: Track = { ...bare, start: d.default.value }
    expect(trajectory(spelled)).toEqual(trajectory(bare))
    // The paired control: the instrument can see a start that is not the
    // default, so the equality above is evidence rather than a tautology.
    expect(trajectory({ ...bare, start: d.default.value + 1 })).not.toEqual(trajectory(bare))
  })

  it('runs for the rest of the scene when duration is omitted', () => {
    const d = universal('move', 'duration')
    expect(d.default.from, 'duration is no longer the remainder case').toBe('remainder')
    const bare = compilePreset({ kind: 'move', to: [100, 0] }, CTX)
    const start = universal('move', 'start')
    if (start.default.from !== 'eval') throw new Error('start is no longer an eval default')
    const rest = SCENE_DURATION - start.default.value
    expect(trajectory({ ...bare, duration: rest })).toEqual(trajectory(bare))
    expect(trajectory({ ...bare, duration: rest / 2 })).not.toEqual(trajectory(bare))
  })

  it('records the remainder as a case and not as a number', () => {
    // There is no number to record. `evalTrack`'s fallback is
    // `sceneDuration - start`, and `sceneDuration` is not a key of
    // `PresetCtx` — the compile context carries seven measurements and none
    // of them is the scene's length — so `CtxDefault` cannot name it and a
    // literal would be wrong for every scene but one.
    const d = universal('move', 'duration')
    expect(d.default).toEqual({ from: 'remainder' })
    expect(Object.keys(CTX)).not.toContain('sceneDuration')
  })
})

describe('ease is an open enum and repeat is a closed one', () => {
  it('declares the named curves the reader names, and says the list is not all of them', () => {
    const d = universal('move', 'ease')
    if (d.unit !== 'enum') throw new Error('ease is no longer an enum')
    expect([...d.values].sort()).toEqual(Object.keys(EASINGS).sort())
    expect(d.open, 'ease declares no open half').toBe(CUBIC_BEZIER_SYNTAX)
    for (const v of d.values) {
      expect(() => compilePreset({ kind: 'move', ease: v }, CTX), `ease=${v}`).not.toThrow()
    }
    // The open half is not decoration: a value outside `values` compiles.
    expect(() => compilePreset({ kind: 'move', ease: 'cubic-bezier(0.1, 0, 0.9, 1)' }, CTX))
      .not.toThrow()
  })

  it('matches the reader\'s own refusal, which is where the list comes from', () => {
    // `params.test.ts` strikes this deal for the per-verb enums: enumerating
    // the values proves the list is not too small, and matching it against
    // the reader's error text proves it is not too large.
    for (const name of ['ease', 'repeat']) {
      const d = universal('move', name)
      if (d.unit !== 'enum') throw new Error(`${name} is not an enum`)
      let msg = ''
      try {
        compilePreset({ kind: 'move', [name]: `__no_such_${name}__` }, CTX)
      } catch (e) {
        msg = String(e)
      }
      expect(msg, `${name} silently accepted a bogus value`).not.toBe('')
      for (const v of d.values) {
        expect(msg, `${name}: the reader does not name "${v}"`).toContain(v)
      }
      if (d.open !== undefined) {
        expect(msg, `${name}: the reader does not offer "${d.open}"`).toContain(d.open)
      }
    }
  })

  it('leaves repeat closed, and every one of its values compiles', () => {
    const d = universal('move', 'repeat')
    if (d.unit !== 'enum') throw new Error('repeat is no longer an enum')
    expect(d.open, 'repeat has grown an open half with no reader behind it').toBeUndefined()
    expect(d.values.length, 'repeat lists nothing').toBeGreaterThan(0)
    for (const v of d.values) {
      expect(() => compilePreset({ kind: 'move', repeat: v }, CTX), `repeat=${v}`).not.toThrow()
    }
  })

  it('defaults every enum to one of its own values', () => {
    for (const kind of KINDS) {
      for (const d of universalParams(kind)) {
        if (d.unit !== 'enum') continue
        expect(d.default.from, `${kind}.${d.name}`).toBe('value')
        expect(d.values, `${kind}.${d.name}`).toContain(d.default.value)
      }
    }
  })
})
