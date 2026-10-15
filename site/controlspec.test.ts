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
  indexControls,
  refusedLayerVariant,
  unmountedControls,
  unrecordedUnits,
} from './controlspec.js'
import type { ControlInfo, ControlRosters } from './controlspec.js'
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

/**
 * The names every object literal answers for unless something stops it.
 *
 * **The seven are measured, not listed from memory**, and the measurement is
 * the same one that settles the typecheck hazard below: at TypeScript 5.9.3 /
 * svelte-check 4.7.6, an object literal contextually typed
 * `Record<string, ControlInfo>` widens every literal-union field of its value
 * to `string` under exactly the keys the `Object` **interface** declares —
 * `constructor`, `toString`, `toLocaleString`, `valueOf`, `hasOwnProperty`,
 * `isPrototypeOf`, `propertyIsEnumerable` — and under no other key. So the
 * widening set and the runtime inheritance set are the same set, and one list
 * serves both.
 *
 * `__proto__` is here because E8 / R-l names it and because it is the one
 * runtime hazard of the group, but it is **not** one of the seven: it is not a
 * declared member of `Object`, so neither `__proto__:` nor `['__proto__']`
 * widens anything. The three names C-3 left out (`toLocaleString`,
 * `isPrototypeOf`, `propertyIsEnumerable`) are inherited exactly as the other
 * four are; omitting them was a short list where a derived one was not
 * available, which is §9's hand-written-list trap in its mildest form.
 */
const INHERITED = [
  'constructor',
  '__proto__',
  'toString',
  'toLocaleString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
]

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
    // The same hole `SCENE_KEYS` had at `05aeb26`, `LAYER_KEYS` at `22572ea`,
    // `SLOTS` at `4a75928` and `PANEL_IDS` at `7dedb7d`. The shape differs in
    // one way that makes it worse: `CONTROLS` is a `Record`, so two sources
    // deriving the same id do not produce a duplicate at all — the second
    // **overwrites** the first and the registry is silently one control short,
    // with no list to inspect.
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

/**
 * Every question this module answers, as sorted `[label, value]` rows.
 *
 * **Parameterised on both of the things the answers depend on**, not only on
 * the rosters: C-10 measured that a census parameterised on the registry alone
 * makes its own result unfalsifiable, because the rows that are supposed to
 * stay still have nothing that could move them. The rosters are the
 * registration seam; the layout is the only other input any reader here reads.
 *
 * **Every label is prefixed with the exported reader that produced it**, and
 * `names every reader this module exports` is what makes that pay: a census
 * diffed against itself cannot see a row somebody deleted — the row is gone
 * from both sides and the label sets still match — so the label set has to be
 * checked against something derived independently of the census, and the
 * module's own `export function` list is that something.
 *
 * Labels for the per-owner, per-unit and per-shape rows range over the closed
 * vocabularies rather than over the data, so registering a control cannot
 * change the label *set* — only values move, which is what makes the budget a
 * count of moved labels rather than a count of new ones.
 */
function census<P extends string>(
  rosters: ControlRosters,
  layout: LayoutConfig<P>,
): readonly (readonly [string, string])[] {
  const specs = deriveControls(rosters)
  const table = indexControls(specs)
  const ids = specs.map(spec => spec.control)
  const rows: [string, string][] = [
    ['indexControls.keys', String(Object.keys(table).length)],
    ['deriveControls.count', String(specs.length)],
    ['deriveControls.unique', String(new Set(ids).size)],
    ['deriveControls.scopes', [...new Set(specs.map(s => s.scope ?? ''))].sort().join(' ')],
    ['controlInfo.answers', String(ids.filter(id => controlInfo(id, table) !== undefined).length)],
    ['controlInfo.refuses', String(INHERITED.filter(n => controlInfo(n, table) === undefined).length)],
    ['duplicateControlIds.ids', duplicateControlIds(ids).join(' ')],
    ['unrecordedUnits.ids', unrecordedUnits(specs).join(' ')],
    ['unmountedControls.ids', unmountedControls(layout, specs).join(' ')],
    ['browserReachableLayerTypes.variants', [...browserReachableLayerTypes()].sort().join(' ')],
    [
      'refusedLayerVariant.answers',
      Object.keys(REFUSED_LAYER_VARIANTS)
        .filter(v => refusedLayerVariant(v) !== undefined)
        .sort()
        .join(' '),
    ],
    ['rosters.reachable', [...rosters.reachable].sort().join(' ')],
    ['layout.mounted', [...mountedPanels(layout)].sort().join(' ')],
  ]
  for (const owner of CONTROL_OWNERS) {
    rows.push([`deriveControls.owner.${owner}`, String(specs.filter(s => s.owner === owner).length)])
  }
  for (const unit of CONTROL_UNITS) {
    rows.push([`deriveControls.unit.${unit}`, String(specs.filter(s => s.unit === unit).length)])
  }
  for (const shape of CONTROL_SHAPES) {
    rows.push([`deriveControls.shape.${shape}`, String(specs.filter(s => s.shape === shape).length)])
  }
  return rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
}

/**
 * The labels whose value moved, with the label *set* asserted equal first.
 *
 * C-9's idiom, and the first assertion is the load-bearing one: without it a
 * label that vanished between the two runs reads as a label that did not move.
 */
function movedLabels(
  before: readonly (readonly [string, string])[],
  after: readonly (readonly [string, string])[],
): readonly string[] {
  expect(after.map(r => r[0]), 'the census answered a different set of questions').toEqual(
    before.map(r => r[0]),
  )
  return before.filter((row, i) => row[1] !== after[i]?.[1]).map(row => row[0])
}

/** A scene key nobody has declared, and a unit nobody has recorded for it. */
const DUMMY_KEY = 'c11registration'

/** The same declaration, made in the scene roster. */
const REGISTERED: ControlRosters = { ...MODEL_ROSTERS, scene: [...MODEL_ROSTERS.scene, DUMMY_KEY] }

describe('registering a control costs one declaration and nothing else', () => {
  it('makes a control appear in every reader of the registry', () => {
    // Design §11 row 3, verbatim: *"Scalar controls | `CONTROLS` specs (§9) |
    // **one declaration**"*, under §11's own sentence *"Each registry gets one
    // test that registers a dummy entry and asserts it appears without
    // touching any other file. Without that, 'moving a panel costs a
    // declaration' is unverified until the first time it is false."* Plan §7's
    // P3 criterion 3 is the same requirement in the plan's words: *"One
    // registration test per registry — a dummy entry appears without touching
    // another file … This is what makes R7 falsifiable."*
    //
    // **Row 3 says "one declaration" where rows 2, 4, 6 and 7 say "one
    // registration", and the difference is this registry's whole shape.** A
    // control is not registered *into* `CONTROLS` — there is nothing in this
    // module to add it to. It is *declared* in a roster, and design §9.1's
    // adopted bullet says where: *"Each `PresetFn` declares its own parameter
    // descriptors, so a verb's controls come from the verb … the declaration
    // sits next to the code it describes."* The seam is therefore
    // `deriveControls`' input, and what this test owns is the claim that a
    // declaration made there reaches **every** reader — which until the
    // readers took a table they could not do, because all four read module
    // scope and no caller could hand them a registry that had grown.
    const specs = deriveControls(REGISTERED)
    const table = indexControls(specs)
    const id = `scene.${DUMMY_KEY}`

    expect(controlInfo(id, table), 'the reader cannot see a registered control').toBeDefined()
    expect(controlInfo(id, table)?.owner).toBe('scene')
    expect(controlInfo(id, table)?.key).toBe(DUMMY_KEY)
    expect(Object.keys(table), 'the record did not grow with the derivation').toContain(id)
    expect(specs.map(s => s.control), 'the derivation did not produce it').toContain(id)
    expect(unrecordedUnits(specs), 'a key with no recorded unit went unnamed').toContain(id)
    expect(unmountedControls(NO_INSPECTOR, specs), 'the new control is not reachable-checked')
      .toContain(id)
    expect(duplicateControlIds(specs.map(s => s.control)), 'the registration collided').toEqual([])
  })

  it('moves exactly the rows that are about the control, and no others', () => {
    // The budget, as a count of moved labels rather than as a claim. Each
    // label is named rather than counted: §9's trap says a total somebody
    // wrote down is not a count of anything, and seven is a total I would
    // otherwise be writing down.
    const moved = movedLabels(
      census(MODEL_ROSTERS, DEFAULT_LAYOUT),
      census(REGISTERED, DEFAULT_LAYOUT),
    )
    expect([...moved].sort()).toEqual([
      'controlInfo.answers',
      'deriveControls.count',
      'deriveControls.owner.scene',
      'deriveControls.shape.scalar',
      'deriveControls.unique',
      'deriveControls.unit.unrecorded',
      'indexControls.keys',
      'unrecordedUnits.ids',
    ])
  })

  it('moves nothing at all when nothing is declared', () => {
    // §6.5a's floor under the budget above: the instrument has to be shown
    // answering "nothing moved" when nothing moved, or "seven rows moved" is a
    // number with no zero beneath it.
    expect(
      movedLabels(census(MODEL_ROSTERS, DEFAULT_LAYOUT), census(MODEL_ROSTERS, DEFAULT_LAYOUT)),
    ).toEqual([])
  })

  it('can move every row it just said did not move', () => {
    // 🚩 C-10's P12, which is the half that is easy to ship unchecked: *"'no
    // row another file owns moved' was **unfalsifiable** — the row it protects
    // does not move under a registration, which is the entire claim and
    // therefore exactly the wrong thing to leave unchecked."* Each still row
    // above gets a second control that moves it from the other side. A census
    // row that no mutation in this file can move is an unchecked declaration,
    // not a measurement.
    const base = census(MODEL_ROSTERS, DEFAULT_LAYOUT)

    // A duplicate declaration, which the registration above deliberately is not.
    const doubled: ControlRosters = {
      ...MODEL_ROSTERS,
      stereo: [...MODEL_ROSTERS.stereo, MODEL_ROSTERS.stereo[0]!],
    }
    expect(movedLabels(base, census(doubled, DEFAULT_LAYOUT))).toContain('duplicateControlIds.ids')

    // A layout that mounts no inspector: the two layout-fed rows.
    const stranded = movedLabels(base, census(MODEL_ROSTERS, NO_INSPECTOR))
    expect(stranded).toContain('unmountedControls.ids')
    expect(stranded).toContain('layout.mounted')

    // A narrowed reachable set: the roster input that is not a key list.
    const narrowed: ControlRosters = { ...MODEL_ROSTERS, reachable: [MODEL_ROSTERS.reachable[0]!] }
    const fewer = movedLabels(base, census(narrowed, DEFAULT_LAYOUT))
    expect(fewer).toContain('rosters.reachable')
    expect(fewer).toContain('deriveControls.owner.layer')

    // A declaration in another owner, so `owner.scene` is shown to be the
    // registration's own row rather than a row that moves whatever happens.
    const elsewhere: ControlRosters = {
      ...MODEL_ROSTERS,
      stereo: [...MODEL_ROSTERS.stereo, DUMMY_KEY],
    }
    const other = movedLabels(base, census(elsewhere, DEFAULT_LAYOUT))
    expect(other).toContain('deriveControls.owner.stereo')
    expect(other, 'a stereo declaration moved the scene row').not.toContain(
      'deriveControls.owner.scene',
    )

    // A declaration carrying a unit and an arity, so the vocabulary rows are
    // shown to be per-member rather than one row wearing twelve labels.
    const paired: ControlRosters = {
      ...MODEL_ROSTERS,
      preset: {
        ...MODEL_ROSTERS.preset,
        // `default` is a tagged `ValueDefault`, not a bare value — the bare
        // `[0, 0]` and then `[0, 0] as const` were both accepted by vitest and
        // both rejected by `npm run typecheck`, on a file the suite had
        // already run green twice. That is §9's split between the gate's two
        // legs, met twice in one assertion.
        [DUMMY_KEY]: [
          {
            name: 'wedge',
            unit: 'degrees',
            shape: 'pair',
            default: { from: 'value', value: [0, 0] },
          },
        ],
      },
    }
    // `browserReachableLayerTypes.variants` is the one row with no mover in
    // this file, and saying so is better than leaving it looking checked. It
    // reads the browser's own validator rather than any parameter, so the only
    // thing that moves it is `site/scene.ts` changing which variants it
    // refuses — which `is refused by the browser's own scene validator` above
    // already sensors, from the other end and against the refusal table. The
    // row stays in the census because it is one of the module's answers and
    // because `rosters.reachable`, which is the input the derivation actually
    // reads, is moved here; it is recorded as declared-not-measured.
    const widened = movedLabels(base, census(paired, DEFAULT_LAYOUT))
    expect(widened).toContain('deriveControls.unit.degrees')
    expect(widened).toContain('deriveControls.shape.pair')
    expect(widened).toContain('deriveControls.scopes')
    expect(widened, 'a recorded unit was reported as unrecorded').not.toContain(
      'deriveControls.unit.unrecorded',
    )
  })

  it('names every reader this module exports, so a deleted census row is visible', () => {
    // 🚩 The reconciliation C-9's P5c and C-10's P8 were left disagreeing
    // about, settled here because one plant settles it for every census
    // written to that idiom, this one included. **Both reports are right and they are about
    // different assertions.** `movedLabels`' label-set equality is computed by
    // the *same* function on both sides, so a row deleted from `census` is
    // absent from `before` and from `after` alike and the equality still
    // holds — C-10's P8 exactly, and it is not a defect in C-9's P5c, which
    // catches a label that vanishes between two runs rather than one that
    // vanishes from the source. Neither catches a deletion, and nothing in
    // either file was wrong.
    //
    // What catches a deletion is a label set checked against something
    // derived independently of the census. The module's own exported reader
    // list is that something, and it is derived rather than typed: the day a
    // reader is added and the census is not extended, this names it too.
    const exported = [...SOURCE.matchAll(/^export function (\w+)/gm)].map(m => m[1]!)
    expect(exported.length, 'the source parse found no exported reader at all').toBeGreaterThan(0)
    const labels = census(MODEL_ROSTERS, DEFAULT_LAYOUT).map(r => r[0])
    for (const fn of exported) {
      expect(
        labels.filter(l => l.startsWith(`${fn}.`)),
        `${fn} is exported and the census records none of its answers`,
      ).not.toEqual([])
    }
  })

  it('keeps an entry whose id is __proto__, which a {} accumulator would lose', () => {
    // C-9's measured hazard, applied to the function this task added. The
    // derivation cannot produce this id — every control id is `owner.key` —
    // so the only way to reach it is through `indexControls`' own parameter,
    // which is exactly the surface a caller holding derived specs uses. A
    // `{}` accumulator here sets the prototype and loses the entry: no wrong
    // value to notice, only an absence.
    const kept = indexControls([
      { control: '__proto__', owner: 'scene', key: 'x', unit: 'unrecorded', shape: 'scalar', panel: 'inspector' },
    ])
    expect(Object.keys(kept), 'the entry was swallowed by the prototype').toEqual(['__proto__'])
    expect(controlInfo('__proto__', kept)?.key).toBe('x')
  })
})

describe('a caller’s own table is read with the same guard as the registry', () => {
  /**
   * A table that really does own a `constructor` entry.
   *
   * **`satisfies` and not a bare literal, and the reason is measured.** At
   * TypeScript 5.9.3 / svelte-check 4.7.6, an object literal contextually
   * typed `Record<string, ControlInfo>` under any of the seven keys the
   * `Object` interface declares has **every literal-union field of its value
   * widened to `string`** — all four of `ControlInfo`'s at once
   * (`owner`, `unit`, `shape`, `panel`), four errors per entry — while vitest
   * runs green, so `npm run typecheck` is the only thing that sees it.
   * `satisfies ControlInfo` on the value pins the literals and clears it;
   * `as const` does too. Neither a type parameter on `ControlInfo` nor a
   * widened field is needed.
   */
  const SHADOWED: Record<string, ControlInfo> = {
    constructor: {
      control: 'constructor',
      owner: 'scene',
      key: 'constructor',
      unit: 'unrecorded',
      shape: 'scalar',
      panel: 'inspector',
    } satisfies ControlInfo,
  }

  it('answers an own entry whose name is inherited, and refuses the rest', () => {
    // E8 / R-l, at the seam this task opened. `CONTROLS` has a null prototype,
    // so until a reader took a table the guard in `controlInfo` was defence in
    // depth and nothing could prove it fired. A caller-supplied table is an
    // ordinary object, so the guard is now load-bearing — and this is the pair
    // of cases that tells a real guard from a cheap one: `Object.hasOwn` says
    // yes to the own `constructor` and no to the six inherited siblings, while
    // `in`, a truthiness test and a bare index each get exactly one of the two
    // wrong.
    expect(controlInfo('constructor', SHADOWED)?.control, 'a real entry was refused').toBe(
      'constructor',
    )
    for (const name of INHERITED.filter(n => n !== 'constructor')) {
      expect(controlInfo(name, SHADOWED), `${name} resolved to an inherited member`).toBeUndefined()
    }
  })

  it('refuses every inherited name on a table that owns none of them', () => {
    const plain: Record<string, ControlInfo> = { 'scene.real': CONTROLS[CONTROL_IDS[0]!]! }
    for (const name of INHERITED) {
      expect(controlInfo(name, plain), name).toBeUndefined()
    }
    // §6.5a: the nulls are evidence only because the same table, asked for
    // what it has, answers.
    expect(controlInfo('scene.real', plain), 'the reader refuses everything').toBeDefined()
  })

  it('defaults to the shipped registry when no table is given', () => {
    // The widening is additive or it is a different function. Every existing
    // caller passes one argument, and must still be reading `CONTROLS`.
    for (const id of CONTROL_IDS) {
      expect(controlInfo(id), id).toBe(controlInfo(id, CONTROLS))
    }
    expect(duplicateControlIds()).toEqual(duplicateControlIds(CONTROL_IDS))
    expect(unrecordedUnits()).toEqual(unrecordedUnits(CONTROL_SPECS))
    expect(unmountedControls(DEFAULT_LAYOUT)).toEqual(
      unmountedControls(DEFAULT_LAYOUT, CONTROL_SPECS),
    )
    expect(indexControls(CONTROL_SPECS)).toEqual(CONTROLS)
  })

  it('derives a floor from the roster it registers into, not from a number', () => {
    // §9's numeric-floor trap, and the form every test in this file already
    // uses: two populations on one run, one structurally containing the
    // other. The registration adds exactly one declaration to the scene
    // roster, so the grown registry is exactly one larger than the shipped
    // one — stated as a containment and a difference, with no total typed.
    const grown = deriveControls(REGISTERED)
    expect(MODEL_ROSTERS.scene.length, 'the scene roster is empty').toBeGreaterThan(0)
    expect(REGISTERED.scene.length).toBe(MODEL_ROSTERS.scene.length + 1)
    expect(grown.length).toBe(CONTROL_SPECS.length + 1)
    const added = grown.map(s => s.control).filter(id => !CONTROL_IDS.includes(id))
    expect(added, 'one declaration produced something other than one control').toEqual([
      `scene.${DUMMY_KEY}`,
    ])
  })
})
