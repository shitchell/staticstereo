/**
 * The generated-widget floor, as a predicate over a plain module.
 *
 * Design §12: *"Not tested: Svelte component DOM. Logic lives in plain modules
 * and is tested there."* Nothing here mounts anything; every assertion is over
 * the data structure {@link resolveWidget} returns, which is the whole reason
 * the resolver is a function rather than a component.
 *
 * Design §9.3 is the paragraph the subject lands in: *"Canvas for value ·
 * timeline for timing · depth strip for depth · generated widgets for the
 * residue. Generated widgets are the floor that guarantees R6, not the
 * intended primary surface."* So the claims worth asserting are about
 * **coverage** — which controls get a field, which are routed to an
 * instrument, and which get nothing and why — rather than about any
 * particular field's appearance.
 */
import { describe, expect, it } from 'vitest'
import {
  REFUSED_WIDGETS,
  instrumentedControls,
  refusedWidget,
  resolveWidget,
  widgetlessControls,
} from './widgets.js'
import type {
  ChoicePart,
  NumberPart,
  TextPart,
  WidgetInitial,
  WidgetPart,
} from './widgets.js'
import {
  CONTROL_SHAPES,
  CONTROL_UNITS,
  CONTROL_SPECS,
  MODEL_ROSTERS,
  deriveControls,
} from './controlspec.js'
import type { ControlInfo, ControlRosters } from './controlspec.js'
import { validateScene } from './scene.js'
import { PRESETS, PRESET_PARAMS, compilePreset } from '../src/core/index.js'
// A deep import, because the barrel does not re-export the universals —
// `site/scalescene.test.ts:36` is the precedent for reaching past it rather
// than widening it from a test.
import { UNIVERSAL_PARAMS, universalParams } from '../src/core/anim/params.js'
import type { ParamDescriptor } from '../src/core/anim/params.js'
import { CUBIC_BEZIER_SYNTAX } from '../src/core/anim/easing.js'
// The token vocabulary, by the same deep import `site/scalescene.test.ts:36`
// takes and for its reason: it is deliberately not published through the
// `core` barrel, because it is a seam for the probes in this repo rather than
// API, and routing it through the barrel would make it the latter.
import { OFF_STAGE_TOKENS } from '../src/core/anim/presets.js'
import type { PresetCtx, PresetKind } from '../src/core/anim/presets.js'
import { CTX } from '../src/core/testing/ctx.fixture.js'
import type { Preset } from '../src/core/types.js'

/**
 * What a part starts at, where a part can have a starting value at all.
 *
 * An instrument is not a field and has nothing to start at, which the type
 * says; this is the narrowing an assertion needs in order to ask the question
 * of whatever came back.
 */
function initialOf(part: WidgetPart | undefined): WidgetInitial | undefined {
  if (part === undefined || part.kind === 'instrument') return undefined
  return part.initial
}

/** The spec for one shipped control, by id. */
function specFor(control: string): ControlInfo {
  const spec = CONTROL_SPECS.find(s => s.control === control)
  expect(spec, `${control} is not a control this registry declares`).toBeDefined()
  return spec!
}

/**
 * The shipped rosters with the universal animation parameters wired through
 * the preset table, built here rather than shipped.
 *
 * Whether `site/controlspec.ts` should carry this wiring is a registry
 * question, and the position is recorded in the tree at
 * `site/reachability.test.ts:54-58`: the four universal parameters have
 * descriptors but are **not yet wired into `MODEL_ROSTERS`**, that wiring is
 * expected growth rather than a fix, and no assertion may redden when it
 * lands. So the wiring is built locally here rather than waited on, and
 * nothing in this file is pinned to the registry carrying it. What the
 * resolver needs is the four descriptors `src/core/anim/params.ts` declares,
 * because they are the only ones in the tree exercising three of the five
 * default tags and the only enum carrying an `open` form. Driving them
 * through the real `deriveControls` rather than hand-building a `ControlInfo`
 * keeps the test answerable to the derivation instead of to a literal
 * somebody typed.
 */
const WITH_UNIVERSALS: ControlRosters = {
  ...MODEL_ROSTERS,
  preset: Object.fromEntries(
    Object.entries(MODEL_ROSTERS.preset).map(([kind, descriptors]) => [
      kind,
      [...descriptors, ...universalParams(kind as PresetKind)],
    ]),
  ),
}

const UNIVERSAL_SPECS = deriveControls(WITH_UNIVERSALS)

/** The spec for one control of the rosters above. */
function universalSpec(control: string): ControlInfo {
  const spec = UNIVERSAL_SPECS.find(s => s.control === control)
  expect(spec, `${control} is not derived even with the universals wired`).toBeDefined()
  return spec!
}

describe('the floor covers the registry, and names what it does not cover', () => {
  it('resolves every control the registry declares, with the id it was asked about', () => {
    expect(CONTROL_SPECS.length, 'the registry is empty, so everything below is vacuous')
      .toBeGreaterThan(0)
    for (const spec of CONTROL_SPECS) {
      const widget = resolveWidget(spec)
      expect(widget.control, 'the spec does not name the control it is for').toBe(spec.control)
    }
  })

  it('has no widget without a reason and no reason without a widget', () => {
    // The one invariant that makes `widgetlessControls` a census rather than a
    // filter: an empty spec always says why, and a populated one never
    // pretends it is empty. Without it a resolver could drop a control on the
    // floor and the count of holes would stay at zero.
    for (const spec of CONTROL_SPECS) {
      const widget = resolveWidget(spec)
      expect(
        widget.parts.length === 0,
        `${spec.control}: parts and deferred disagree about whether there is a widget`,
      ).toBe(widget.deferred !== undefined)
    }
  })

  it('names the controls with no generated widget, and they are the refused ones', () => {
    // Derived on both sides: the expected set is read off the refusal table
    // and the registry, so recording a refusal or registering a variant moves
    // both halves together and neither is a list someone typed.
    const expected = CONTROL_SPECS
      .filter(s => refusedWidget(`${s.owner}.${s.key}`) !== undefined)
      .map(s => s.control)
      .sort()
    expect(expected.length, 'nothing is refused, so this proves nothing').toBeGreaterThan(0)
    expect(widgetlessControls(), 'a control lost its widget to something other than a refusal')
      .toEqual(expected)
  })

  it('is a census that can see a hole, so the list above is not empty by construction', () => {
    // §6.5a's paired control for the assertion above. A control whose unit the
    // registry never recorded has no field it could honestly offer, so it
    // appears — which is what makes "only the refused ones" a measurement.
    const planted: ControlInfo = {
      control: 'scene.widgetplant',
      owner: 'scene',
      key: 'widgetplant',
      unit: 'unrecorded',
      shape: 'scalar',
      panel: 'inspector',
    }
    expect(widgetlessControls([...CONTROL_SPECS, planted]))
      .toContain('scene.widgetplant')
    expect(resolveWidget(planted).deferred, 'the hole is unexplained').toBeDefined()
  })

  it('routes the structured controls to an instrument rather than to a field', () => {
    // Design §9.3 gives timing to the timeline and depth to the depth strip,
    // and `ControlShape`'s `structured` member is the registry saying so per
    // control. Derived from the shape rather than from the ids, so a key that
    // becomes structured is routed without this test being edited.
    const expected = CONTROL_SPECS.filter(s => s.shape === 'structured').map(s => s.control).sort()
    expect(expected.length, 'nothing is structured, so this proves nothing').toBeGreaterThan(0)
    expect(instrumentedControls()).toEqual(expected)
    for (const id of expected) {
      const parts = resolveWidget(specFor(id)).parts
      expect(parts.map(p => p.kind), `${id} was given a field`).toEqual(['instrument'])
    }
  })
})

describe('the arity of the control is the number of fields', () => {
  it('gives a scalar one field and a pair two, each saying which member it is', () => {
    const scalar = resolveWidget(specFor('stereo.sepFar')).parts
    expect(scalar.map(p => p.kind)).toEqual(['number'])
    expect((scalar[0] as NumberPart).index, 'a scalar field claims a member of a pair')
      .toBeUndefined()

    const pair = resolveWidget(specFor('scene.size')).parts
    expect(pair.map(p => p.kind)).toEqual(['number', 'number'])
    expect(pair.map(p => (p as NumberPart).index)).toEqual([0, 1])
  })

  it('carries the rate tag down rather than recomputing it from the unit', () => {
    // `params.ts` refuses a `scenePxPerSecond` tag on purpose so that "scale
    // every scenePx parameter" gets `move.speed` right for free. A widget that
    // dropped the tag would offer a px field for a px/s value, which is the
    // same fail-open defect one level further down.
    const speed = resolveWidget(specFor('preset.move.speed')).parts
    expect(speed.map(p => (p as NumberPart).per)).toEqual(['second'])
    // The number fields only: `move`'s endpoints also carry a picker per slot,
    // and a rate tag is a statement about a quantity rather than about a name.
    const distance = resolveWidget(specFor('preset.move.from')).parts
      .filter(p => p.kind === 'number')
    expect(distance.map(p => (p as NumberPart).per)).toEqual([undefined, undefined])
  })

  it('carries the unit down, so two pixel spaces cannot share a field', () => {
    // §2.7. `depthBlur` is scene px and `sepFar` is plate px; a field that
    // reported only "a number" would let a consumer rescale one with the
    // other's factor.
    const units = (id: string) =>
      resolveWidget(specFor(id)).parts.map(p => (p as NumberPart).unit)
    expect(units('stereo.depthBlur')).toEqual(['scenePx'])
    expect(units('stereo.sepFar')).toEqual(['platePx'])
  })
})

describe('a choice needs the values it is choosing between', () => {
  it('offers the recorded values, and nothing else, where they are recorded', () => {
    const axis = resolveWidget(specFor('preset.rotate.axis')).parts
    expect(axis.map(p => p.kind)).toEqual(['choice'])
    expect((axis[0] as ChoicePart).options).toEqual(['x', 'y', 'z'])
  })

  it('every enum the registry ships records its values, except the one it refuses', () => {
    // The state this task left the registry in, asserted rather than
    // described: if an enum key is added without a vocabulary, the control it
    // derives loses its picker and this names it before anybody meets the
    // empty list in a panel.
    const unvalued = CONTROL_SPECS
      .filter(s => s.unit === 'enum' && s.values === undefined)
      .filter(s => refusedWidget(`${s.owner}.${s.key}`) === undefined)
      .map(s => s.control)
    expect(unvalued, 'an enum control would render a picker with no options').toEqual([])
  })

  it('offers no picker at all where the values are not recorded, and says so', () => {
    // The honest failure, driven by a plant because the registry no longer
    // contains one — which is the point of the assertion above. A picker over
    // an empty list is a control an author cannot use and cannot tell is
    // broken; an absence that names itself is one somebody fixes. This is
    // `unrecordedUnits`' bargain applied to the other half of the descriptor.
    for (const values of [undefined, [] as readonly string[]]) {
      const planted: ControlInfo = {
        control: 'stereo.enumplant',
        owner: 'stereo',
        key: 'enumplant',
        unit: 'enum',
        shape: 'scalar',
        ...(values === undefined ? {} : { values }),
        panel: 'inspector',
      }
      const widget = resolveWidget(planted)
      expect(widget.parts, `values=${JSON.stringify(values)} offered a picker`).toEqual([])
      expect(widget.deferred, 'the missing vocabulary is unexplained').toBeDefined()
    }
  })

  it('adds a free-form field where the reader accepts more than the list', () => {
    // `EnumParam.open` carries the other accepted form's syntax *as the reader
    // phrases it*, so a control built from it cannot tell an author that a
    // valid `cubic-bezier(...)` is invalid — the exact error `overrides()`'
    // message was rewritten to stop giving. Two parts for one control, which
    // is the same artefact a number-or-token value wants.
    const ease = resolveWidget(universalSpec('preset.move.ease')).parts
    expect(ease.map(p => p.kind)).toEqual(['choice', 'text'])
    expect((ease[0] as ChoicePart).options).toEqual([...UNIVERSAL_PARAMS
      .filter(d => d.name === 'ease')
      .flatMap(d => (d.unit === 'enum' ? d.values : []))])
    expect((ease[1] as TextPart).syntax, 'the free-form field does not say what it accepts')
      .toBe(CUBIC_BEZIER_SYNTAX)
  })

  it('adds no free-form field to a closed list, so the clause above is not always true', () => {
    const repeat = resolveWidget(universalSpec('preset.move.repeat')).parts
    expect(repeat.map(p => p.kind)).toEqual(['choice'])
  })
})

/**
 * The slots that take a number **or** a name, and get a field for each.
 *
 * Design §4.2 gives `move`'s `from`/`to` a symbolic off-stage endpoint *as
 * well as* a number, per slot — `['offRight', 0]` is as valid as `[320, 0]`.
 * Design §9.3 makes the generated widget the floor that guarantees R6, so a
 * floor offering two spinners and no way to write `offRight` does not reach
 * the parameter it is standing under: an author with only this surface cannot
 * write the scroll `README.md` opens with.
 *
 * Two fields for one slot, which is the artefact `ease` already ships as
 * `[choice, text]`. The order the assertions pin is number-then-picker **per
 * slot**, because a pair's two slots are two separate decisions and
 * interleaving them is what keeps a renderer from having to pair them up by
 * index arithmetic.
 *
 * ## The hazard this cannot be allowed to reproduce
 *
 * A picker whose options are wrong for the slot is `REFUSED_WIDGETS`'
 * `layer.type` again, one parameter over: `offTop` belongs to the `y` slot and
 * `compilePreset` throws when it is written into `x`, so a floor that offered
 * all four names in both slots would hand an author a scene the player
 * refuses. The vocabulary is therefore asserted **per slot and against the
 * verb**, not against a list in this file.
 */
describe('a slot that takes a number or a token gets both, and only that slot’s tokens', () => {
  /** Every preset parameter the registry describes, as `kind.name`. */
  function presetDescriptors(): ReadonlyMap<string, ParamDescriptor> {
    const out = new Map<string, ParamDescriptor>()
    for (const [kind, params] of Object.entries(PRESET_PARAMS)) {
      for (const d of params) out.set(`${kind}.${d.name}`, d)
    }
    return out
  }

  /** The arity a descriptor declares, or `undefined` for an enum, which has none. */
  function shapeOf(d: ParamDescriptor): string | undefined {
    return d.unit === 'enum' ? undefined : d.shape
  }

  /** The pickers of one control, in the order the spec writes them. */
  function pickers(control: string): readonly ChoicePart[] {
    return resolveWidget(specFor(control)).parts.filter((p): p is ChoicePart => p.kind === 'choice')
  }

  /** `move.from` with `token` written into one slot and a plain number in the other. */
  function endpoint(slot: 0 | 1, token: string): Preset {
    return { kind: 'move', from: slot === 0 ? [token, 0] : [0, token] } as unknown as Preset
  }

  it('gives each endpoint slot a number field and a picker beside it', () => {
    const parts = resolveWidget(specFor('preset.move.from')).parts
    expect(parts.map(p => p.kind), 'an endpoint slot got one field where it needs two')
      .toEqual(['number', 'choice', 'number', 'choice'])
    expect(parts.filter(p => p.kind === 'number').map(p => (p as NumberPart).index)).toEqual([0, 1])
    expect(
      parts.filter(p => p.kind === 'choice').map(p => (p as ChoicePart).index),
      'a picker does not say which member of the pair it writes',
    ).toEqual([0, 1])
  })

  it('offers a slot only the tokens the verb accepts there, so the floor cannot write an unloadable scene', () => {
    // Measured against `compilePreset` rather than quoted from `OFF_STAGE`'s
    // docblock: the slot assignments are module-private, so the only honest
    // witness that a picker's options are right for its slot is the reader
    // that resolves them.
    const slots = pickers('preset.move.from')
    expect(slots.length, 'there are no pickers, so everything below is vacuous').toBe(2)
    for (const picker of slots) {
      const slot = picker.index
      expect(slot, 'a picker with no slot cannot be checked against one').toBeDefined()
      expect(picker.options.length, `slot ${slot} offers nothing`).toBeGreaterThan(0)
      for (const token of picker.options) {
        expect(
          () => compilePreset(endpoint(slot!, token), CTX),
          `the picker for slot ${slot} offers "${token}", which the verb refuses there`,
        ).not.toThrow()
      }
      // §6.5a's other half, and the `layer.type` hazard in miniature: the same
      // instrument over the names this picker withholds. Without it, a picker
      // that offered every token in every slot would pass the loop above.
      const withheld = OFF_STAGE_TOKENS.filter(t => !picker.options.includes(t))
      expect(withheld.length, `slot ${slot} withholds nothing, so the loop below is empty`)
        .toBeGreaterThan(0)
      for (const token of withheld) {
        expect(
          () => compilePreset(endpoint(slot!, token), CTX),
          `"${token}" is accepted in slot ${slot}, so withholding it hides a valid endpoint`,
        ).toThrow()
      }
    }
  })

  it('offers every token the verb has, between them, so no slot’s half was typed short', () => {
    // The completeness half, derived from the live table. A token added to
    // `OFF_STAGE` reaches a picker or reds here; a written-out copy of the
    // names in the descriptor would go stale in silence instead.
    expect(OFF_STAGE_TOKENS.length, 'the token table is empty').toBeGreaterThan(0)
    expect(
      pickers('preset.move.from').flatMap(p => [...p.options]).sort(),
      'the pickers and the verb disagree about the vocabulary',
    ).toEqual([...OFF_STAGE_TOKENS].sort())
  })

  it('declares the shape on exactly the parameters a probe finds token-accepting', () => {
    /*
     * The tie that makes the declaration answerable to behaviour, and the
     * reason the shape is worth more than the `scenePx` tag it sits beside: a
     * descriptor claiming a token slot that no verb reads, or a verb reading a
     * token in a slot no descriptor declares, is a disagreement between the
     * registry and the code — and until the shape existed there was nothing to
     * disagree with, only a probe and a unit tag that happened to coincide.
     *
     * The discriminator is `site/scalescene.test.ts`': a symbolic endpoint is
     * by definition read out of the `PresetCtx`, so placing one makes the
     * compiled track depend on the context where a number does not.
     * `layerDepth` is held equal because `push` reads it for its *numeric*
     * parameters, which would otherwise look token-accepting in every slot.
     */
    const PROBE_B = Object.fromEntries(
      Object.entries(CTX).map(([k, v]) => [k, k === 'layerDepth' ? v : v + 37]),
    ) as unknown as PresetCtx

    const compiled = (p: Preset, ctx: PresetCtx): string | null => {
      try {
        return JSON.stringify(compilePreset(p, ctx))
      } catch {
        return null
      }
    }
    const readsCtx = (kind: string, name: string, v: unknown): boolean => {
      const p = { kind, [name]: v } as Preset
      const a = compiled(p, CTX)
      const b = compiled(p, PROBE_B)
      return a !== null && b !== null && a !== b
    }
    const placements: readonly ((v: unknown) => unknown)[] = [v => v, v => [v, 0], v => [0, v]]

    const accepting = new Set<string>()
    let probes = 0
    for (const kind of Object.keys(PRESETS)) {
      for (const d of PRESET_PARAMS[kind as PresetKind]) {
        for (const token of OFF_STAGE_TOKENS) {
          for (const place of placements) {
            probes++
            if (readsCtx(kind, d.name, place(token)) && !readsCtx(kind, d.name, place(1))) {
              accepting.add(`${kind}.${d.name}`)
            }
          }
        }
      }
    }
    expect(
      accepting.size,
      `probed ${probes} parameter/token/placement combinations and found nothing that accepts ` +
      'a token, so the equality below is two empty sets',
    ).toBeGreaterThanOrEqual(1)

    const declared = [...presetDescriptors()]
      .filter(([, d]) => shapeOf(d) === 'endpoint-pair')
      .map(([id]) => id)
    expect(
      declared.sort(),
      'the registry and the verbs disagree about which parameters accept a symbolic endpoint',
    ).toEqual([...accepting].sort())
  })

  it('leaves scalability on the unit tag, so the rate that scales for free still does', () => {
    // The asymmetry this change had to price. `move.speed` is `scenePx` with
    // `per: 'second'` **on purpose**, so that a consumer whose rule is "scale
    // every `scenePx` parameter" catches a rate for free. The new shape says
    // which slots accept a name; it says nothing about whether a value is a
    // length, and a rule re-keyed onto it would drop `speed` silently — the
    // identical fail-open defect one level down from the one the shape was
    // added to fix. This is the test that would catch that.
    const speed = resolveWidget(specFor('preset.move.speed')).parts
    expect(speed.map(p => p.kind), 'the rate was given a picker it has no tokens for')
      .toEqual(['number'])
    expect((speed[0] as NumberPart).unit).toBe('scenePx')
    expect((speed[0] as NumberPart).per).toBe('second')

    const descriptors = presetDescriptors()
    const tagged = [...descriptors].filter(([, d]) => d.unit === 'scenePx').map(([id]) => id).sort()
    const tokened = [...descriptors]
      .filter(([, d]) => shapeOf(d) === 'endpoint-pair')
      .map(([id]) => id)
      .sort()
    expect(tagged, 'nothing carries the tag the scaling rule keys on').not.toEqual([])
    expect(tokened, 'nothing declares the token shape').not.toEqual([])
    expect(tagged, 'move.speed lost the tag that scales it').toContain('move.speed')
    expect(tokened, 'move.speed was told it accepts a symbolic endpoint, and it does not')
      .not.toContain('move.speed')
    expect(
      tagged.filter(id => !tokened.includes(id)),
      'every scene-px parameter now accepts a token, so the two rules have become the same ' +
      'rule and re-keying one onto the other would no longer be visible here',
    ).toContain('move.speed')
  })

  it('starts the number at the recorded default and the picker at nothing', () => {
    // The descriptor's own type is why: a numeric default is a number or a
    // pair of them, so the value the registry records belongs in the field
    // that takes numbers. A picker pre-selected with a token nobody wrote
    // would claim a default the table does not hold.
    const parts = resolveWidget(specFor('preset.move.from')).parts
    expect(parts.filter(p => p.kind === 'number').map(initialOf)).toEqual([
      { from: 'literal', value: 0 },
      { from: 'literal', value: 0 },
    ])
    expect(parts.filter(p => p.kind === 'choice').map(initialOf)).toEqual([undefined, undefined])
  })

  it('offers no picker at all where the slot’s tokens are not recorded, and says so', () => {
    // The enum arm's bargain, applied to the other half of the descriptor: a
    // picker over an empty list is an instrument an author cannot use and
    // cannot tell is broken, so the control becomes a countable hole instead.
    for (const tokens of [undefined, [[], []] as const]) {
      const planted = {
        control: 'preset.probe.from',
        owner: 'preset',
        scope: 'probe',
        key: 'from',
        unit: 'scenePx',
        shape: 'endpoint-pair',
        ...(tokens === undefined ? {} : { tokens }),
        panel: 'inspector',
      } as unknown as ControlInfo
      const widget = resolveWidget(planted)
      expect(widget.parts, `tokens=${JSON.stringify(tokens)} produced a field anyway`).toEqual([])
      expect(widget.deferred, 'the missing vocabulary is unexplained').toBeDefined()
    }
    // The paired control: the same plant with a vocabulary is not a hole.
    const recorded = {
      control: 'preset.probe.from',
      owner: 'preset',
      scope: 'probe',
      key: 'from',
      unit: 'scenePx',
      shape: 'endpoint-pair',
      tokens: [['near'], ['far']],
      panel: 'inspector',
    } as unknown as ControlInfo
    expect(resolveWidget(recorded).parts.map(p => p.kind))
      .toEqual(['number', 'choice', 'number', 'choice'])
  })
})

describe('a default is read by its tag, never by its JavaScript type', () => {
  it('shows a literal where the preset substitutes one', () => {
    expect(initialOf(resolveWidget(specFor('preset.rotate.from')).parts[0]))
      .toEqual({ from: 'literal', value: 0 })
  })

  it('splits a pair default across the two fields it belongs to', () => {
    // The number fields, which are the ones a recorded default can start: the
    // only pair defaults in the registry belong to `move`'s endpoints, whose
    // slots each carry a picker as well.
    const from = resolveWidget(specFor('preset.move.from')).parts.filter(p => p.kind === 'number')
    expect(from.map(initialOf)).toEqual([
      { from: 'literal', value: 0 },
      { from: 'literal', value: 0 },
    ])
  })

  it('names the context key rather than inventing a number for it', () => {
    // `push.to` defaults to wherever the layer sits. A field initialised to a
    // literal would be wrong for every layer but one, and the descriptor says
    // so rather than leaving a consumer to guess.
    expect(initialOf(resolveWidget(specFor('preset.push.to')).parts[0]))
      .toEqual({ from: 'context', key: 'layerDepth' })
  })

  it('leaves the field empty where omitting the parameter is not passing a value', () => {
    expect(initialOf(resolveWidget(specFor('preset.move.speed')).parts[0]))
      .toEqual({ from: 'absent' })
  })

  it('keeps the evaluator’s literal apart from the rest of the scene', () => {
    // The two cases the descriptor file split, read by the consumer it said
    // would switch on them. `start` has a number the evaluator substitutes;
    // `duration` has none — the field is empty and means "to the end". Reading
    // them as one case would make a consumer sniff the value's type, which is
    // what the tags exist to prevent.
    expect(initialOf(resolveWidget(universalSpec('preset.move.start')).parts[0]))
      .toEqual({ from: 'evaluated', value: 0 })
    const duration = initialOf(resolveWidget(universalSpec('preset.move.duration')).parts[0])
    expect(duration).toEqual({ from: 'rest-of-scene' })
    expect(JSON.stringify(duration), 'the empty field was given a number to show')
      .not.toMatch(/\d/)
  })

  it('shows the verb’s own departure where it has one', () => {
    // `push` eases out where the other verbs ease linearly, and a scheme that
    // could not express that would initialise one of five controls wrongly
    // with nothing saying so.
    expect(initialOf(resolveWidget(universalSpec('preset.push.ease')).parts[0]))
      .toEqual({ from: 'literal', value: 'easeOut' })
    expect(initialOf(resolveWidget(universalSpec('preset.move.ease')).parts[0]))
      .toEqual({ from: 'literal', value: 'linear' })
  })

  it('offers no initial value where the registry records no default', () => {
    // Most of the registry. The model's own keys carry a unit and an arity and
    // no default, so the spec says nothing rather than claiming zero — the
    // shell reads the scene.
    expect(initialOf(resolveWidget(specFor('stereo.sepFar')).parts[0])).toBeUndefined()
  })
})

describe('the discriminant gets no generated widget, and the refusal is the validator’s', () => {
  /**
   * One minimal layer per browser-reachable variant.
   *
   * Written here rather than imported: `site/controlspec.ts`'s probes are
   * module-private, and a specimen for this question has to be *complete* for
   * its variant so that a refusal below is a refusal of the retype and not of
   * a specimen that was never valid.
   *
   * The `gif` specimen carries `loop`, which no other variant has, and that is
   * deliberate: a specimen holding only the keys every variant shares could
   * not show the silent-loss half of the hazard at all.
   */
  const SPECIMENS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
    text: { type: 'text', text: 'probe' },
    image: { type: 'image', src: 'probe.png' },
    gif: { type: 'gif', src: 'probe.gif', loop: 'once' },
    shape: { type: 'shape', shape: 'circle', r: 1 },
  }

  /**
   * The bare retypes the validator lets through, and why each one is not a
   * reprieve.
   *
   * Declared and then **compared against the validator on every run**, which
   * is `REFUSED_LAYER_VARIANTS`' bargain with `browserReachableLayerTypes`: a
   * table that is checked against the thing that decides does not go stale in
   * silence. Keyed `from>to`.
   */
  const LOADS_ANYWAY: Readonly<Record<string, string>> = {
    'image>gif': 'every key of `image` is a key of `gif`, so nothing is missing and nothing ' +
      'is dropped — safe by containment, which is a fact about the two variants and not ' +
      'something the registry records or a picker could consult.',
    'gif>image': 'loads, and the site validator\'s field-by-field rebuild silently drops ' +
      '`loop` on the way through. No error, no warning, and an authored key is gone.',
  }

  /** Whether the browser's validator loads this layer, and what it kept. */
  function load(layer: Readonly<Record<string, unknown>>): Record<string, unknown> | undefined {
    try {
      const scene = validateScene({ size: [2, 2], layers: [layer] })
      return scene.layers[0] as unknown as Record<string, unknown>
    } catch {
      return undefined
    }
  }

  /** Every ordered pair of distinct browser-reachable variants. */
  function retypes(): readonly (readonly [string, string])[] {
    const variants = [...MODEL_ROSTERS.reachable].sort()
    return variants.flatMap(from => variants.filter(to => to !== from).map(to => [from, to] as const))
  }

  it('is a specimen set the validator accepts, so the refusals below mean something', () => {
    // §6.5a's other half. Without this the test below passes over specimens
    // that were never loadable for reasons of their own.
    expect(retypes().length, 'there is nothing to retype between').toBeGreaterThan(1)
    for (const variant of MODEL_ROSTERS.reachable) {
      expect(SPECIMENS[variant], `no specimen for the reachable variant ${variant}`).toBeDefined()
      expect(load(SPECIMENS[variant]!), `the ${variant} specimen does not load as itself`)
        .toBeDefined()
    }
  })

  it('refuses most of the scenes a picker over the discriminant would produce', () => {
    // The hazard, measured rather than quoted: writing a different name into
    // `type` and changing nothing else is what an enum widget over this key
    // does. The partition is asserted against the validator, so the day
    // `site/scene.ts` accepts or refuses a different set, this goes red and
    // the reason recorded in `REFUSED_WIDGETS` has to be rewritten rather than
    // quietly becoming false.
    const accepted = retypes()
      .filter(([from, to]) => load({ ...SPECIMENS[from]!, type: to }) !== undefined)
      .map(([from, to]) => `${from}>${to}`)
    expect(accepted.sort(), 'the validator accepts a different set of bare retypes than recorded')
      .toEqual(Object.keys(LOADS_ANYWAY).sort())
    // Both halves non-empty, or the partition is one bucket wearing two names.
    expect(accepted.length, 'nothing loads, so the silent-damage case below is gone')
      .toBeGreaterThan(0)
    expect(accepted.length, 'everything loads, so there is no refusal to speak of')
      .toBeLessThan(retypes().length)
  })

  it('loses an authored key without saying so on one of the retypes that does load', () => {
    // The half C-4's statement of the hazard did not reach, and the worse
    // half: a refusal is visible and this is not. `loop` is a key of `gif`
    // and not of `image`, so retyping drops it through the rebuild §9 names.
    const kept = load({ ...SPECIMENS['gif']!, type: 'image' })
    expect(kept, 'gif → image no longer loads, so this case has moved').toBeDefined()
    expect(Object.keys(SPECIMENS['gif']!).filter(k => !Object.hasOwn(kept!, k)))
      .toEqual(['loop'])
  })

  it('gives the discriminant no field, in every variant that registers one', () => {
    const typed = CONTROL_SPECS.filter(s => s.owner === 'layer' && s.key === 'type')
    expect(typed.length, 'no variant registers a type control').toBeGreaterThan(0)
    for (const spec of typed) {
      const widget = resolveWidget(spec)
      expect(widget.parts, `${spec.control} was given a field`).toEqual([])
      expect(widget.deferred, `${spec.control} is empty for no stated reason`)
        .toBe(REFUSED_WIDGETS['layer.type']?.reason)
    }
  })

  it('records a reason for every refusal, because the absence is the decision', () => {
    expect(Object.keys(REFUSED_WIDGETS).length, 'the table is empty').toBeGreaterThan(0)
    for (const key of Object.keys(REFUSED_WIDGETS)) {
      const entry = refusedWidget(key)
      expect(entry, key).toBeDefined()
      expect(entry!.key, `${key} does not mirror its own key`).toBe(key)
      expect(entry!.reason.length, `${key} has no reason`).toBeGreaterThan(40)
    }
  })

  it('answers undefined for an inherited member rather than the Object function', () => {
    // E8 / R-l. `REFUSED_WIDGETS['constructor']` is truthy on a plain object
    // literal, so an unguarded reader hands back a refusal whose key and
    // reason are both undefined — well-formed prose explaining nothing.
    for (const name of ['constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
      expect(refusedWidget(name), name).toBeUndefined()
    }
  })

  it('is a reader that can say yes, so the refusals above are not all it says', () => {
    expect(refusedWidget('layer.type'), 'the reader refuses everything').toBeDefined()
  })
})

describe('a unit that says nothing is a hole, and the shape is what tells them apart', () => {
  it('gives an opaque integer a field and an identity a text field', () => {
    // The split this task made in the registry's vocabulary. Both were
    // `none` and both are scalars, so nothing but the unit could have chosen
    // between a number field and a text field for them.
    expect(resolveWidget(specFor('stereo.seed')).parts.map(p => p.kind)).toEqual(['number'])
    expect(resolveWidget(specFor('layer.text.id')).parts.map(p => p.kind)).toEqual(['text'])
  })

  it('refuses to guess for a plain value whose unit says no unit applies', () => {
    // What would have caught a mis-tag: `anim` tagged as a scalar rather than
    // as structured reaches this arm and appears in the census of holes,
    // rather than being handed a field for a `Track | Preset | (…)[]`.
    const mistagged: ControlInfo = {
      control: 'layer.text.anim',
      owner: 'layer',
      scope: 'text',
      key: 'anim',
      unit: 'none',
      shape: 'scalar',
      panel: 'inspector',
    }
    expect(resolveWidget(mistagged).parts).toEqual([])
    expect(widgetlessControls([mistagged])).toEqual(['layer.text.anim'])
  })

  it('still routes it to an instrument when it is tagged structured, which is the control', () => {
    const tagged: ControlInfo = {
      control: 'layer.text.anim',
      owner: 'layer',
      scope: 'text',
      key: 'anim',
      unit: 'none',
      shape: 'structured',
      panel: 'inspector',
    }
    expect(resolveWidget(tagged).parts.map(p => p.kind)).toEqual(['instrument'])
    expect(widgetlessControls([tagged])).toEqual([])
  })
})

describe('the resolver answers for the whole vocabulary, not for today’s population', () => {
  it('gives every unit in the vocabulary an answer, with no arm falling through', () => {
    // The runtime half of the compile-time guard. `AssertNever` proves the
    // switch names every member; this proves each arm returns a spec that
    // satisfies the module's own invariant, including the members no shipped
    // control uses.
    expect(CONTROL_UNITS.length, 'the vocabulary is empty').toBeGreaterThan(0)
    for (const unit of CONTROL_UNITS) {
      for (const shape of CONTROL_SHAPES) {
        const probe: ControlInfo = {
          control: `scene.${unit}.${shape}`,
          owner: 'scene',
          key: 'probe',
          unit,
          shape,
          panel: 'inspector',
        }
        const widget = resolveWidget(probe)
        expect(
          widget.parts.length === 0,
          `${unit}/${shape}: parts and deferred disagree`,
        ).toBe(widget.deferred !== undefined)
      }
    }
  })

  it('gives a number field to every quantity and to nothing else', () => {
    // The partition the type-level guard asserts, asserted again over values:
    // a unit moved from one half to the other without the switch following
    // changes this list.
    const numeric = CONTROL_UNITS.filter(unit =>
      resolveWidget({
        control: 'scene.probe',
        owner: 'scene',
        key: 'probe',
        unit,
        shape: 'scalar',
        panel: 'inspector',
      }).parts.some(p => p.kind === 'number'),
    ).sort()
    expect(numeric).toEqual([
      'degrees',
      'depth',
      'framesPerSecond',
      'multiplier',
      'opaque',
      'platePx',
      'scenePx',
      'seconds',
    ])
  })
})

describe('nothing else moved', () => {
  /** Every question this module answers over a given registry, as sorted rows. */
  function census(specs: readonly ControlInfo[]): readonly (readonly [string, string])[] {
    const rows: [string, string][] = [
      ['widgetlessControls.ids', widgetlessControls(specs).join(' ')],
      ['instrumentedControls.ids', instrumentedControls(specs).join(' ')],
      [
        'refusedWidget.answers',
        Object.keys(REFUSED_WIDGETS).filter(k => refusedWidget(k) !== undefined).sort().join(' '),
      ],
    ]
    for (const kind of ['number', 'toggle', 'text', 'choice', 'instrument'] as const) {
      rows.push([
        `resolveWidget.part.${kind}`,
        String(specs.flatMap(s => resolveWidget(s).parts).filter(p => p.kind === kind).length),
      ])
    }
    return rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  }

  function moved(
    before: readonly (readonly [string, string])[],
    after: readonly (readonly [string, string])[],
  ): readonly string[] {
    expect(after.map(r => r[0]), 'the census answered a different set of questions')
      .toEqual(before.map(r => r[0]))
    return before.filter((row, i) => row[1] !== after[i]?.[1]).map(row => row[0])
  }

  it('moves only the rows about the parameters that were wired, and moves those', () => {
    // §6.5a in both halves. The measurement half is the one that is usually
    // skipped: the counts are diffed sorted with their labels, not merely
    // re-run for pass or fail.
    const base = census(CONTROL_SPECS)
    const grown = moved(base, census(UNIVERSAL_SPECS))
    expect(grown, 'wiring the universals changed nothing, so the census is blind')
      .not.toEqual([])
    expect(grown, 'a universal parameter produced an instrument').not.toContain(
      'instrumentedControls.ids',
    )
    expect(grown, 'wiring parameters changed which controls are refused').not.toContain(
      'widgetlessControls.ids',
    )
    expect(grown, 'the four universals added no number field').toContain(
      'resolveWidget.part.number',
    )
    expect(grown, 'the two universal enums added no picker').toContain(
      'resolveWidget.part.choice',
    )
  })

  it('moves nothing at all when the registry is the registry', () => {
    expect(moved(census(CONTROL_SPECS), census([...CONTROL_SPECS]))).toEqual([])
  })
})
