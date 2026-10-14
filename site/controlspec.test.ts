/**
 * The runtime witness for `site/controlspec.ts`, and the registry's own tests.
 *
 * ## Why a runtime witness at all
 *
 * Same reason `site/layout.test.ts`, `site/panels.test.ts` and
 * `src/core/scenekeys.test.ts` exist: `npm run typecheck` is the only thing
 * that enforces an `AssertNever`, vitest does not type-check, so a registry
 * guarded only that way is invisible to `npm test` and therefore to the gate's
 * test leg. Survey §F-6 names the pairing rule.
 *
 * ## What is different here, and it is the whole task
 *
 * `CONTROLS` is **derived**, so the membership half of the usual pair would be
 * a tautology: a tuple written out beside a union that was computed from it
 * proves only that the computation was run twice. The membership guard for
 * this registry is **upstream** — cluster B's twelve `AssertNever` pairs over
 * `LAYER_KEYS`, `SCENE_KEYS` and `STEREO_KEYS` — and re-declaring it here
 * would be the tautology, not the guard.
 *
 * What *is* non-tautologous, and is what the pairs in `controlspec.ts` guard,
 * is the module's own **vocabulary**: `ControlUnit` and `ControlShape` extend
 * `ParamUnit` and `ParamShape` from `src/core/anim/params.ts`, and the tuples
 * beside them are written independently. A member added upstream is then a
 * compile error here rather than a unit this registry can never name. The
 * tests below are the runtime half of those two pairs.
 *
 * ## The floors are containments, not numbers
 *
 * §9's trap in its numeric form: *"a numeric floor chosen from today's count
 * is not a check — a specifier floor of 160 was overtaken inside its own
 * cluster"*, which happened on this branch. Every floor below is two
 * populations measured on the same run, one read from this module and one read
 * from a roster in another module, with the second structurally contained in
 * the first. 64, 63, 41 and 33 have all been offered as the right total for
 * this registry by three different documents; none of them appears here.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  CONTROLS,
  CONTROL_IDS,
  CONTROL_OWNERS,
  CONTROL_SHAPES,
  CONTROL_SPECS,
  CONTROL_UNITS,
  MODEL_ROSTERS,
  REFUSED_LAYER_VARIANTS,
  browserReachableLayerTypes,
  controlInfo,
  deriveControls,
  duplicateControlIds,
  refusedLayerVariant,
  unmountedControls,
  unrecordedUnits,
} from './controlspec.js'
import { LAYER_KEYS, PARAM_UNITS, PRESET_PARAMS, SCENE_KEYS, STEREO_KEYS } from '../src/core/index.js'
import { DEFAULT_LAYOUT, mountedPanels } from './layout.js'
import type { LayoutConfig } from './layout.js'
import { validateScene } from './scene.js'

/** This module's own source, for the one claim only the source can settle. */
const SOURCE = readFileSync(new URL('./controlspec.ts', import.meta.url), 'utf8')

/**
 * A layout with no inspector.
 *
 * The §6.5a control for the panel seam: `unmountedControls(DEFAULT_LAYOUT)`
 * answering `[]` is evidence only to the extent that the same reader, handed a
 * layout that really does drop the panel every control is assigned to, says
 * so. Written over `LayoutConfig` rather than `PanelLayout` deliberately —
 * this is the run-time case no `AssertNever` reaches.
 */
const NO_INSPECTOR: LayoutConfig<'canvas'> = {
  id: 'no-inspector',
  label: 'No inspector',
  slots: { left: [], centre: ['canvas'], right: [], bottom: [] },
}

/** The names every object literal answers for unless something stops it. */
const INHERITED = ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']

describe('CONTROLS is derived, never enumerated', () => {
  it('contains no control id written as a literal anywhere in its own module', () => {
    // Diff item G7, ruling R-d: *"Approved emphatically. Derive `CONTROLS`;
    // never enumerate it."* The only instrument that can settle this is one
    // that reads the source — §9's trap about `tsc` eliding an unused import
    // is the same lesson, and `src/svelte-free.test.ts` is the precedent.
    //
    // Driven off the ids the derivation actually produced, so it is not a
    // hand-written list of forbidden spellings either: the day someone types
    // `'layer.text.font'` into the registry, this names it.
    const typed = CONTROL_IDS.filter(id => SOURCE.includes(`'${id}'`) || SOURCE.includes(`"${id}"`))
    expect(typed, 'a control id is written out in the module that derives them').toEqual([])
  })

  it('can see an id that was typed out, so the sweep above is not vacuous', () => {
    // §6.5a. Without this the check is satisfied by an empty registry and by a
    // `SOURCE` that failed to load.
    expect(CONTROL_IDS.length, 'nothing was derived, so nothing could be found').toBeGreaterThan(0)
    const planted = `const _ = '${CONTROL_IDS[0]}'`
    expect(CONTROL_IDS.filter(id => planted.includes(`'${id}'`))).toEqual([CONTROL_IDS[0]])
  })

  it('derives nothing from rosters that are empty', () => {
    // The vacuity control, and the reason `deriveControls` is exported as a
    // function over rosters rather than only applied once at module scope. An
    // empty registry is what every universally-quantified claim below is
    // vacuously true over, so the instrument has to be shown reaching zero.
    expect(
      deriveControls({ scene: [], stereo: [], layer: {}, preset: {}, reachable: [] }),
    ).toEqual([])
  })

  it('gives every control an id composed of its owner, its scope and its key', () => {
    for (const spec of CONTROL_SPECS) {
      const expected = [spec.owner, spec.scope, spec.key].filter(s => s !== undefined).join('.')
      expect(spec.control, `${spec.control} does not carry its own composed key`).toBe(expected)
      expect(CONTROL_OWNERS, spec.control).toContain(spec.owner)
    }
  })

  it('names each control exactly once, which a Record cannot say for itself', () => {
    // The fifth instance of this hole in this phase — `SCENE_KEYS` at
    // `05aeb26`, `LAYER_KEYS` at `22572ea`, `SLOTS` at `4a75928`, `PANEL_IDS`
    // at `7dedb7d`, and here. The shape differs in one way that makes it
    // worse: `CONTROLS` is a `Record`, so two sources deriving the same id do
    // not produce a duplicate at all — the second **overwrites** the first and
    // the registry is silently one control short, with no list to inspect.
    expect(duplicateControlIds(), 'two sources derive the same control id').toEqual([])
    expect(
      Object.keys(CONTROLS).length,
      'the record is shorter than the derivation, so an id collided',
    ).toBe(CONTROL_SPECS.length)
    expect([...CONTROL_IDS]).toEqual(CONTROL_SPECS.map(s => s.control))
  })

  it('is a duplicate check that can see a duplicate', () => {
    // §6.5a. `duplicateControlIds` answering `[]` is satisfied by `() => []`.
    const doubled = deriveControls({
      ...MODEL_ROSTERS,
      // The same key twice in one roster is exactly what `Exclude` cannot see.
      stereo: [...MODEL_ROSTERS.stereo, MODEL_ROSTERS.stereo[0]],
    })
    const ids = doubled.map(s => s.control)
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([`stereo.${MODEL_ROSTERS.stereo[0]}`])
  })
})

describe('the floor is a containment read off the rosters', () => {
  it('registers a control for every stereo key', () => {
    for (const key of STEREO_KEYS) {
      expect(controlInfo(`stereo.${key}`), `stereo.${key} has no control`).toBeDefined()
    }
    expect(STEREO_KEYS.length, 'the stereo roster collapsed').toBeGreaterThan(0)
  })

  it('registers a control for every key of every variant the browser will load', () => {
    const reachable = browserReachableLayerTypes()
    expect(reachable.length, 'no layer variant is reachable, so this sweep is empty').toBeGreaterThan(0)
    for (const variant of reachable) {
      const keys = LAYER_KEYS[variant]
      expect(keys.length, `${variant} has no keys`).toBeGreaterThan(0)
      for (const key of keys) {
        expect(controlInfo(`layer.${variant}.${key}`), `layer.${variant}.${key}`).toBeDefined()
      }
    }
  })

  it('registers a control for every preset parameter descriptor', () => {
    const kinds = Object.keys(PRESET_PARAMS)
    expect(kinds.length, 'the preset registry collapsed').toBeGreaterThan(0)
    for (const kind of kinds) {
      for (const d of PRESET_PARAMS[kind as keyof typeof PRESET_PARAMS]) {
        expect(controlInfo(`preset.${kind}.${d.name}`), `preset.${kind}.${d.name}`).toBeDefined()
      }
    }
  })

  it('registers a control for every scene key that is not a container', () => {
    // And the containers are not simply dropped: a scene key may be omitted
    // only because its members are registered under another owner, which is
    // the half a bare exclusion list would not say. `stereo` is the sharp
    // case — it is one key here and seven controls there.
    for (const key of SCENE_KEYS) {
      const own = controlInfo(`scene.${key}`)
      const expands = MODEL_ROSTERS.containers[key as keyof typeof MODEL_ROSTERS.containers]
      if (expands === undefined) {
        expect(own, `scene.${key} is neither a control nor a container`).toBeDefined()
        continue
      }
      expect(own, `scene.${key} expands and is also its own control`).toBeUndefined()
      const members = CONTROL_SPECS.filter(s => s.owner === expands)
      expect(members.length, `scene.${key} expands into ${expands}, which registered nothing`)
        .toBeGreaterThan(0)
    }
  })

  it('is larger than any one of its sources, so no source carries the registry alone', () => {
    // Four populations, all measured on this run from three other modules.
    // None of these numbers is typed: the claim is that the registry strictly
    // contains each source, which an emptied registry and a registry that
    // silently lost a source both fail.
    const sources = [
      STEREO_KEYS.length,
      SCENE_KEYS.length,
      Object.values(LAYER_KEYS).reduce((n, keys) => n + keys.length, 0),
      Object.values(PRESET_PARAMS).reduce((n, ds) => n + ds.length, 0),
    ]
    for (const n of sources) {
      expect(n, 'a source roster is empty, so the floor below proves nothing').toBeGreaterThan(0)
      expect(CONTROL_IDS.length, 'the registry is no larger than one of its sources').toBeGreaterThan(n)
    }
  })
})

describe('the draw exclusion is the validator’s, not this module’s', () => {
  it('is refused by the browser’s own scene validator, which is the tie', () => {
    // Ruling R-q, and the one-line form of it. `site/scene.ts:268` refuses
    // `type: 'draw'` citing design §9.5; the day it stops, this goes red and
    // the partition below goes red with it.
    expect(() => validateScene({ size: [2, 2], layers: [{ type: 'draw', fn: 'x' }] }))
      .toThrow(/draw/)
  })

  it('reaches exactly the variants the validator accepts, and no others', () => {
    // The structural half, and it is a partition: refused and reachable are
    // disjoint and together cover `Layer['type']`. Both directions redden.
    // The validator lifting its refusal makes `draw` reachable *and* leaves it
    // in the refusal table; the validator refusing a fifth variant leaves that
    // variant in neither set.
    const reachable = [...browserReachableLayerTypes()].sort()
    const refused = Object.keys(REFUSED_LAYER_VARIANTS).sort()
    const all = Object.keys(LAYER_KEYS).sort()
    expect(reachable.filter(t => refused.includes(t)), 'a variant is both reachable and refused')
      .toEqual([])
    expect([...reachable, ...refused].sort(), 'reachable and refused do not partition Layer')
      .toEqual(all)
  })

  it('registers no control for a refused variant', () => {
    for (const variant of Object.keys(REFUSED_LAYER_VARIANTS)) {
      const leaked = CONTROL_SPECS.filter(s => s.scope === variant && s.owner === 'layer')
      expect(leaked.map(s => s.control), `${variant} is refused and has controls`).toEqual([])
    }
  })

  it('is a probe that can say yes, not one that refuses everything', () => {
    // §6.5a. A `browserReachableLayerTypes` that returned `[]` would satisfy
    // the disjointness above and leave the registry with no layer controls at
    // all; the containment floor catches that, and so does this.
    expect(browserReachableLayerTypes().length).toBeGreaterThan(1)
    for (const variant of browserReachableLayerTypes()) {
      expect(refusedLayerVariant(variant), `${variant} is reachable and refused`).toBeUndefined()
    }
  })

  it('records a reason for each refusal, because the absence is the decision', () => {
    const named = Object.keys(REFUSED_LAYER_VARIANTS)
    expect(named.length, 'nothing is refused, so this table is decorative').toBeGreaterThan(0)
    for (const key of named) {
      const refusal = refusedLayerVariant(key)
      expect(refusal?.variant, key).toBe(key)
      expect(refusal?.reason.length ?? 0, `${key} is refused with no reason`).toBeGreaterThan(0)
    }
  })
})

describe('every control names its unit', () => {
  it('leaves no control with an unrecorded unit', () => {
    // §2.7, as an acceptance criterion rather than a style note. The unit
    // tables are deliberately **partial**, so a key added to a guarded roster
    // produces a control (which is the point — the registry is derived) whose
    // unit nobody has recorded, and this names it. That is §9's *"convert the
    // note into a test"* applied to the one thing a derivation cannot derive.
    expect(unrecordedUnits(), 'a control carries no recorded unit').toEqual([])
  })

  it('can see an unrecorded unit, so the check above is not vacuous', () => {
    // §6.5a, and it doubles as the demonstration that a new roster key does
    // reach the registry: an invented stereo key derives a control, and the
    // same reader that answered `[]` above names it.
    const grown = deriveControls({ ...MODEL_ROSTERS, stereo: [...MODEL_ROSTERS.stereo, 'bleed'] })
    expect(grown.filter(s => s.unit === 'unrecorded').map(s => s.control)).toEqual(['stereo.bleed'])
  })

  it('names a unit from the closed vocabulary, on every control', () => {
    for (const spec of CONTROL_SPECS) {
      expect(CONTROL_UNITS, `${spec.control} has a unit outside the vocabulary`).toContain(spec.unit)
      expect(CONTROL_SHAPES, `${spec.control} has a shape outside the vocabulary`).toContain(spec.shape)
    }
  })

  it('is the runtime witness for the two vocabulary pairs', () => {
    // `controlspec.ts`'s `_NoUnitMissing`/`_NoUnitExtra` and the shape pair tie
    // `ControlUnit` to `CONTROL_UNITS` and `ControlShape` to `CONTROL_SHAPES`,
    // and nothing in `npm test` can read a type. What it can read is that the
    // upstream vocabulary these extend is still wholly inside them — a member
    // added to `PARAM_UNITS` or to `ParamShape` is a compile error in that
    // module and is caught here if the two are repaired out of step.
    for (const unit of PARAM_UNITS) {
      expect(CONTROL_UNITS, `${unit} is a ParamUnit this registry cannot name`).toContain(unit)
    }
    expect(CONTROL_SHAPES, 'a ParamShape this registry cannot name').toEqual(
      expect.arrayContaining(['scalar', 'pair']),
    )
    expect(new Set(CONTROL_UNITS).size, 'a unit is listed twice').toBe(CONTROL_UNITS.length)
    expect(new Set(CONTROL_SHAPES).size, 'a shape is listed twice').toBe(CONTROL_SHAPES.length)
  })

  it('keeps the two provenance collisions design §9.1 names apart', () => {
    // §9.1 item 2, verbatim: distributing over the union *"collapses
    // provenance: `shape.start`/`end` are **degrees**, `Track.start`/`duration`
    // are **seconds**"*. Three quantities wearing two words, and a derivation
    // over a flat key set is precisely where they collapse into one. The two
    // spellings are named here because naming them is the point, as
    // `layout.test.ts` names `'before'`.
    expect(controlInfo('layer.shape.start')?.unit, 'a wedge bound in seconds').toBe('degrees')
    expect(controlInfo('layer.shape.end')?.unit, 'a wedge bound in seconds').toBe('degrees')
    expect(controlInfo('scene.duration')?.unit, 'a scene length in degrees').toBe('seconds')
  })

  it('keeps the pixel spaces §2.7 names apart', () => {
    // Four spaces exist — scene px, plate px, backing-store px (×`noiseScale`),
    // device px — and `render.ts:4` fixes which of them each of these lives
    // in: `rasterDepth → blurDepth → padDepth → sirdsFromDepth → upscale`.
    // `depthBlur` acts before `padDepth`, so it is a scene-pixel radius;
    // `sepFar`/`sepNear` act inside `sirdsFromDepth`, after the pad and before
    // the upscale, so they are plate pixels. A single `px` tag would make a
    // consumer that scales one scale the other.
    expect(controlInfo('stereo.depthBlur')?.unit).toBe('scenePx')
    expect(controlInfo('stereo.sepFar')?.unit).toBe('platePx')
    expect(controlInfo('stereo.sepNear')?.unit).toBe('platePx')
    expect(controlInfo('stereo.depthBlur')?.unit).not.toBe(controlInfo('stereo.sepFar')?.unit)
  })

  it('carries the rate tag down from the descriptor that recorded it', () => {
    // `NumericParam.per` exists so that "scale every `scenePx` parameter" gets
    // `move.speed` right for free. Dropping it in the derivation would
    // reintroduce the fail-open bug one level down, which is the whole reason
    // `params.ts` refused a `scenePxPerSecond` tag.
    const speed = controlInfo('preset.move.speed')
    expect(speed?.unit).toBe('scenePx')
    expect(speed?.per, 'the rate tag was dropped in the derivation').toBe('second')
    expect(controlInfo('preset.move.from')?.per, 'a distance became a rate').toBeUndefined()
  })

  it('records a pair as one control with an arity, not as two controls', () => {
    // `ParamShape` is already this repo's answer to "is an [x, y] pair one
    // control or two" — `PRESET_PARAMS` carries `SCENE_PX_PAIR('from', …)` as
    // one descriptor. Applying it to `scene.size` and `layer.*.at` is what
    // keeps the two pair-valued model keys from being counted differently from
    // each other and from the eleven preset descriptors.
    expect(controlInfo('scene.size')?.shape).toBe('pair')
    expect(controlInfo('layer.text.at')?.shape).toBe('pair')
    expect(controlInfo('scene.fps')?.shape).toBe('scalar')
  })
})

describe('the registry is complete, and visibility is not in it', () => {
  it('declares no visibility, no mode and no filter on a control', () => {
    // Design §11: *"`CONTROLS` is complete; visibility is layered over it.
    // Revision 1 said simple mode would use 'a filtered `CONTROLS` set', which
    // contradicts §9's completeness requirement. The registry stays complete —
    // that is R6 — and per-mode visibility sets select from it."* Plan §7's P3
    // section: *"a filtered registry would fail criterion 6."* C-2 declined the
    // same field on `PanelInfo`; this is the registry the temptation is
    // actually about, because the inspector is where a simple mode would want
    // to hide forty widgets.
    //
    // The literals are the refused spellings, which is the one place naming a
    // string is the point.
    expect(CONTROL_SPECS.length, 'nothing to inspect').toBeGreaterThan(0)
    for (const spec of CONTROL_SPECS) {
      const fields = Object.keys(spec)
      expect(fields, `${spec.control} declares its own visibility`).not.toContain('visible')
      expect(fields, `${spec.control} declares which modes show it`).not.toContain('modes')
      expect(fields, `${spec.control} declares itself hidden`).not.toContain('hidden')
      expect(fields, `${spec.control} declares a mode`).not.toContain('mode')
    }
  })
})

describe('every control resolves to a panel', () => {
  it('assigns each control a panel the default layout mounts', () => {
    // Design §9.2's realistic regression, read from the control's side: *"spec
    // written, assigned to a panel no layout slots."* This is the hook
    // criterion 6 needs; the count half of it is the containment floor above.
    expect(unmountedControls(DEFAULT_LAYOUT), 'a control is assigned to an unmounted panel')
      .toEqual([])
    expect(mountedPanels(DEFAULT_LAYOUT).length).toBeGreaterThan(0)
  })

  it('names the controls a layout strands, when it strands some', () => {
    // §6.5a, and the case that matters: a simple mode built by dropping the
    // inspector is exactly how forty controls become unreachable in silence.
    const stranded = unmountedControls(NO_INSPECTOR)
    // Both halves: every control is stranded, *and* there were controls to
    // strand. The equality alone is `0 === 0` over an emptied registry, which
    // is the defect survey §I-1 measured criterion 6 for in the first place.
    expect(stranded.length, 'dropping the inspector stranded nothing').toBe(CONTROL_IDS.length)
    expect(stranded.length, 'there was nothing to strand').toBeGreaterThan(0)
  })
})

describe('every lookup refuses the prototype chain', () => {
  // E8 / R-l. `Object.hasOwn` and not a bare index or `in`. The live reading
  // here is inside the derivation itself: the unit tables are plain object
  // literals keyed by model key, so an unguarded `LAYER_SPECS[key]` answers
  // with the `Object` **function** for a roster key called `constructor`, and
  // the derived control would then carry `undefined` as its unit and its
  // shape — past the `unrecordedUnits` sensor, which looks for the word.
  it('answers undefined for an inherited member, on every table', () => {
    for (const name of INHERITED) {
      expect(controlInfo(name), name).toBeUndefined()
      expect(refusedLayerVariant(name), name).toBeUndefined()
      expect(controlInfo(`stereo.${name}`), `stereo.${name}`).toBeUndefined()
      expect(controlInfo(`layer.text.${name}`), `layer.text.${name}`).toBeUndefined()
    }
  })

  it('gives an inherited roster key no unit rather than the Object function', () => {
    // The derivation's own reading, and the one a registration test would miss
    // by only probing the finished registry. A roster carrying `constructor`
    // is absurd as a model key and entirely ordinary as a key read from a
    // stored preference or a hand-edited scene.
    const grown = deriveControls({ ...MODEL_ROSTERS, stereo: ['constructor'] })
    const spec = grown.find(s => s.control === 'stereo.constructor')
    expect(spec, 'the derivation dropped the key instead of deriving it').toBeDefined()
    expect(spec?.unit, 'an inherited member answered as a unit spec').toBe('unrecorded')
    expect(spec?.shape).toBe('scalar')
  })

  it('is a guard and not a reader that answers undefined to everything', () => {
    // §6.5a: the nulls above are evidence only because the same readers, asked
    // for something real, answer.
    for (const id of CONTROL_IDS) {
      expect(controlInfo(id), id).toBeDefined()
    }
    for (const variant of Object.keys(REFUSED_LAYER_VARIANTS)) {
      expect(refusedLayerVariant(variant), variant).toBeDefined()
    }
  })
})
