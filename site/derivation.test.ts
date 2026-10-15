/**
 * The proof that the shipped `CONTROLS` is *computed from* the guarded rosters.
 *
 * ## The claim, and what it is not
 *
 * Ruling R-d, from the gap list: *"Approved emphatically. Derive `CONTROLS`;
 * never enumerate it."* `site/controlspec.ts` ships the derivation. What this
 * file owns is the claim that the registry a consumer imports is wired to
 * `SCENE_KEYS`, `STEREO_KEYS`, `LAYER_KEYS` and `PRESET_PARAMS` **as they are
 * declared upstream** — so a key declared in one of those rosters produces a
 * `CONTROLS` entry with this file's subject, `site/controlspec.ts`, unedited.
 *
 * **This is a statement about where the data comes from, and it is not the
 * withdrawn "without touching another file" property.** That wording asked
 * what a registration *costs*; the execution plan withdrew it as *"always the
 * wrong property"* because a real registration on three registries does touch
 * another file, and design §11 was amended to match. The replacement cost
 * property — *"adding an entry costs one declaration, and everything else that
 * must change is named by the compiler"* — is `site/controlspec.test.ts`'s
 * business, not this file's. Nothing here is a claim about cost. A declaration
 * here is *expected* to touch another file: the roster module is where it
 * belongs, which is design §11 row 3 saying *"one declaration"* where rows 2,
 * 4, 6 and 7 say *"one registration"*.
 *
 * ## Why it needs its own file, in the words of the test that drew the line
 *
 * `site/controlspec.test.ts`'s registration test: *"Mine proves that a
 * declaration made at the seam reaches **every reader of the registry** and
 * costs **exactly the rows about that control**; D-4's proves the **shipped**
 * `CONTROLS` is wired to the **shipped guarded rosters**. Neither implies the
 * other — today a registry wired to a hand-written copy of `LAYER_KEYS` would
 * pass mine, and a registry whose readers all ignored it would pass D-4's."*
 *
 * **That sentence was measured true before this file existed, and `copies the
 * roster instead of reading it` below is it as an assertion.** With
 * `MODEL_ROSTERS` re-pointed at hand-written arrays carrying today's keys, the
 * whole suite stayed green — 78 files, 1825 passed, 0 skipped — and
 * `npm run typecheck` reported 0 errors over 448 files. Every existing
 * containment floor reads a guarded roster and asks whether a control exists
 * for each key; a copy with the same content answers yes to all of them. The
 * loose typing of `ControlRosters` is deliberate and documented, so the
 * compiler cannot distinguish the two either: this property is assertable at
 * run time and has no compile-time sensor to build.
 *
 * ## The seam, and why no mutable path was needed
 *
 * `site/controlspec.ts` asked, when it shipped the derivation: *"if D-4 would
 * rather plant by mutating a frozen roster, say so now, because that would
 * want a different seam."* **It does not, and the seam it already has is the
 * right one.** `CONTROLS` is `Object.freeze(… Object.create(null))` and should
 * stay that way. A plant does not need to mutate it, or the rosters, because
 * the rosters reach the registry through a module import: replacing the
 * binding and re-evaluating the module produces a second, independently frozen
 * `CONTROLS` derived from the planted roster, while the shipped one is
 * untouched and available in the same test for comparison.
 *
 * That is also why the plants here go through the module graph rather than
 * through `deriveControls(rosters)`. Calling the exported function with an
 * argument proves the function is a function of its input, which
 * `controlspec.test.ts` already establishes; it says nothing about what the
 * module-scope `CONTROLS` was built from. The claim is about the shipped
 * value, so the shipped value is what is re-derived.
 *
 * ## Floors
 *
 * No population here is written down. 63, 64, 41 and 33 have all been offered
 * as the size of this registry and none of them appears in this file: every
 * bound is two populations measured on the same run, and every growth is
 * stated as the named set difference rather than as a total. The registry is
 * expected to grow when the universal animation parameters are wired into the
 * rosters; `stays silent while the registry grows` is that growth, planted,
 * with every predicate in this file re-asserted over it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  CONTROLS,
  CONTROL_IDS,
  MODEL_ROSTERS,
  deriveControls,
  duplicateControlIds,
  indexControls,
} from './controlspec.js'
import type { ControlRosters } from './controlspec.js'
import { LAYER_KEYS, PRESET_PARAMS, SCENE_KEYS, STEREO_KEYS } from '../src/core/index.js'
import {
  LAYER_KEYS as DECLARED_LAYER_KEYS,
  SCENE_KEYS as DECLARED_SCENE_KEYS,
  STEREO_KEYS as DECLARED_STEREO_KEYS,
} from '../src/core/types.js'
import { PRESET_PARAMS as DECLARED_PRESET_PARAMS, UNIVERSAL_PARAMS } from '../src/core/anim/params.js'

/** The module whose bytes the claim says a declaration does not touch. */
const SUBJECT = new URL('./controlspec.ts', import.meta.url)

/** The specifier `site/controlspec.ts` reads its rosters through. */
const ROSTER_MODULE = '../src/core/index.js'

type Controlspec = typeof import('./controlspec.js')
type RosterModule = typeof import('../src/core/index.js')

/**
 * A module graph: the registry, and the roster module it read.
 *
 * **Both halves, and the reason is a property of the instrument rather than
 * of the subject.** `vi.resetModules()` invalidates the registry of loaded
 * modules, so the re-evaluated graph builds *fresh* roster objects — a planted
 * `MODEL_ROSTERS.scene` is therefore never `===` the `SCENE_KEYS` this file
 * imported statically, however correctly it is wired. Identity is only
 * meaningful inside one graph, so each graph carries the roster module to
 * compare itself against. A later reader tempted to assert a planted roster
 * against this file's own import will get a failure that says nothing about
 * the registry.
 */
interface Graph {
  readonly spec: Controlspec
  readonly roster: RosterModule
}

/** The ids of a graph's registry, sorted. */
function idsOf(graph: Graph): readonly string[] {
  return [...graph.spec.CONTROL_IDS].sort()
}

/**
 * Re-evaluate `site/controlspec.ts` against a patched roster module.
 *
 * The patch is applied to the barrel because that is the binding the subject
 * actually imports — planting anywhere else would be planting into a module
 * the registry does not read, which is the shape of a test that passes for the
 * wrong reason. `reads each roster from the module that declares it` is the
 * other half: it ties the barrel's bindings to the declarations the
 * `AssertNever` pairs guard, so a plant into the barrel is a plant into the
 * guarded roster and not into a re-export that had drifted.
 */
async function reDerive(patch: (real: RosterModule) => Record<string, unknown>): Promise<Graph> {
  vi.resetModules()
  vi.doMock(ROSTER_MODULE, async importOriginal => {
    const real = await importOriginal<RosterModule>()
    return { ...real, ...patch(real) }
  })
  const spec = await import('./controlspec.js')
  const roster = await import('../src/core/index.js')
  return { spec, roster }
}

afterEach(() => {
  vi.doUnmock(ROSTER_MODULE)
  vi.resetModules()
})

/**
 * Every answer the derivation gives about its own sources, as sorted
 * `[label, value]` rows.
 *
 * §6.5a's measurement half: reproducing a reddened test is one piece of
 * evidence and the moved measurement is the other, so the plants below diff
 * these rows sorted with their labels rather than asserting pass or fail. The
 * identity rows are the ones no count can carry — `wired.*` is the whole
 * difference between a roster that is read and a roster that was copied, and
 * it is invisible in every population row beside it.
 */
function sources(rosters: ControlRosters): readonly (readonly [string, string])[] {
  const specs = deriveControls(rosters)
  const rows: [string, string][] = [
    ['wired.scene', String(rosters.scene === SCENE_KEYS)],
    ['wired.stereo', String(rosters.stereo === STEREO_KEYS)],
    ['wired.layer', String(rosters.layer === LAYER_KEYS)],
    ['wired.preset', String(rosters.preset === PRESET_PARAMS)],
    ['roster.scene.keys', [...rosters.scene].sort().join(' ')],
    ['roster.stereo.keys', [...rosters.stereo].sort().join(' ')],
    ['roster.layer.variants', Object.keys(rosters.layer).sort().join(' ')],
    ['roster.preset.kinds', Object.keys(rosters.preset).sort().join(' ')],
    ['roster.reachable', [...rosters.reachable].sort().join(' ')],
    ['controls.derived', String(specs.length)],
    ['controls.indexed', String(Object.keys(indexControls(specs)).length)],
    ['controls.ids', specs.map(s => s.control).sort().join(' ')],
  ]
  return rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
}

/**
 * The labels whose value moved, with the label *set* asserted equal first.
 *
 * Without the equality a label that vanished between the two runs reads as a
 * label that did not move, which is the failure mode that makes "nothing
 * changed" worthless as evidence.
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

/** The ids present in `after` and absent from `before`, named rather than counted. */
function appeared(before: readonly string[], after: readonly string[]): readonly string[] {
  const had = new Set(before)
  return [...after].filter(id => !had.has(id)).sort()
}

/** The shipped registry's ids, sorted, as every consumer imports them. */
const SHIPPED_IDS: readonly string[] = [...CONTROL_IDS].sort()

/** A key no roster declares, so a control bearing it can only be the plant's. */
const PLANTED = 'derivationplant'

describe('the shipped CONTROLS is wired to the shipped guarded rosters', () => {
  it('reads each roster from the module that declares it, by reference and not by value', () => {
    // `toBe` and not `toEqual`, and that is the entire assertion: a copy of a
    // roster is equal to it and is not it, so equality cannot tell a derived
    // registry from an enumerated one that happens to agree today.
    //
    // Two links per roster. The barrel is what the subject imports; the
    // declaration in `types.ts` / `params.ts` is what the `AssertNever` pairs
    // guard. Asserting only the near link would leave a barrel that re-exported
    // a copy indistinguishable from one that re-exports the roster, and the
    // guard would then be guarding a list the registry does not read.
    expect(MODEL_ROSTERS.scene, 'the scene roster is a copy, not the guarded list').toBe(SCENE_KEYS)
    expect(MODEL_ROSTERS.stereo, 'the stereo roster is a copy').toBe(STEREO_KEYS)
    expect(MODEL_ROSTERS.layer, 'the layer roster is a copy').toBe(LAYER_KEYS)
    expect(MODEL_ROSTERS.preset, 'the preset roster is a copy').toBe(PRESET_PARAMS)

    expect(SCENE_KEYS, 'the barrel re-exports a copy of SCENE_KEYS').toBe(DECLARED_SCENE_KEYS)
    expect(STEREO_KEYS, 'the barrel re-exports a copy of STEREO_KEYS').toBe(DECLARED_STEREO_KEYS)
    expect(LAYER_KEYS, 'the barrel re-exports a copy of LAYER_KEYS').toBe(DECLARED_LAYER_KEYS)
    expect(PRESET_PARAMS, 'the barrel re-exports a copy of PRESET_PARAMS').toBe(
      DECLARED_PRESET_PARAMS,
    )
  })

  it('names every roster field, so a source added later is declared and not assumed', () => {
    // A hand-written list of the fields to check would go stale the day a
    // source is added — §9's trap exactly, and it is live: the universal
    // animation parameters are declared and deliberately not yet wired in, so
    // this registry is known to be about to gain a source. The partition below
    // is total over `MODEL_ROSTERS`' own keys, so whoever wires them is told
    // to say which upstream the new field reads rather than being allowed to
    // add an unchecked one.
    //
    // Growth is not a regression here: a field added to `MODEL_ROSTERS`
    // reddens this with the field's name, and the fix is to declare its
    // upstream beside the four below — the same one-line cost every other
    // roster paid.
    const upstream: Record<string, unknown> = {
      scene: SCENE_KEYS,
      stereo: STEREO_KEYS,
      layer: LAYER_KEYS,
      preset: PRESET_PARAMS,
    }
    // Computed in the subject rather than imported, with the reason recorded:
    // these two are answers `site/controlspec.ts` works out, not rosters it
    // reads. `reachable` is the browser validator's verdict on which layer
    // variants load, and `containers` is the subject's own record of which
    // scene keys expand into another owner. Neither has an upstream roster to
    // be wired to.
    const local = ['reachable', 'containers']

    for (const field of Object.keys(MODEL_ROSTERS)) {
      const known = Object.hasOwn(upstream, field) || local.includes(field)
      expect(
        known,
        `${field} is a roster source with no declared upstream — name it here, or say why it has none`,
      ).toBe(true)
      if (Object.hasOwn(upstream, field)) {
        expect(
          MODEL_ROSTERS[field as keyof typeof MODEL_ROSTERS],
          `${field} is no longer the roster this file says it is`,
        ).toBe(upstream[field])
      }
    }
    expect(Object.keys(upstream).length, 'no upstream is checked at all').toBeGreaterThan(0)
  })

  it('is exactly the derivation over those rosters, with nothing hand-added', () => {
    // Both directions, because they fail differently. A missing id is a roster
    // key that did not reach the registry; an extra id is an entry that came
    // from somewhere other than the rosters, which is the enumerated registry
    // this ruling exists to forbid. Neither population is written down — the
    // claim is set equality between two values measured on this run.
    const derived = deriveControls(MODEL_ROSTERS)
    expect(derived.length, 'the derivation produced nothing, so equality below is vacuous')
      .toBeGreaterThan(0)
    expect([...CONTROL_IDS].sort(), 'the registry and the derivation name different controls')
      .toEqual(derived.map(s => s.control).sort())
    expect(CONTROLS, 'the registry is not the index of the derivation').toEqual(
      indexControls(derived),
    )
    expect(duplicateControlIds(), 'two sources derive the same control id').toEqual([])
  })

  it('copies the roster instead of reading it, and nothing about the registry can tell', () => {
    // §6.5a for the identity assertion, in both halves. The reddened test is
    // the matcher control below: `toBe` handed a content-identical copy says
    // no where `toEqual` says yes, so the matcher above is discriminating and
    // not merely true. The moved measurement is the diff: a rosters object
    // re-pointed at copies of all four guarded lists is run through the same
    // census and diffed sorted with its labels, and the identity rows are the
    // only thing that moves. Same ids, same count, same variants, same
    // reachable set.
    //
    // **This is the sentence this file exists to make assertable, and it was
    // measured outside the test first.** With `site/controlspec.ts` itself
    // re-pointed at hand-written arrays carrying today's keys — the real form
    // of the defect this simulates — the whole suite stayed green at 78 files
    // / 1825 passed / 0 skipped and `npm run typecheck` reported 0 errors over
    // 448 files. Nothing but an identity check can see it.
    const copy = [...STEREO_KEYS]
    expect(copy, 'the matcher cannot tell a copy from the roster').not.toBe(STEREO_KEYS)
    expect(copy, 'the copy is not a copy, so the control above proves nothing').toEqual([
      ...STEREO_KEYS,
    ])

    const enumerated: ControlRosters = {
      ...MODEL_ROSTERS,
      scene: [...SCENE_KEYS],
      stereo: [...STEREO_KEYS],
      layer: Object.fromEntries(Object.entries(LAYER_KEYS).map(([v, keys]) => [v, [...keys]])),
      preset: Object.fromEntries(Object.entries(PRESET_PARAMS).map(([k, ds]) => [k, [...ds]])),
    }
    const moved = movedLabels(sources(MODEL_ROSTERS), sources(enumerated))
    expect([...moved].sort(), 'a copied roster moved something other than its identity').toEqual([
      'wired.layer',
      'wired.preset',
      'wired.scene',
      'wired.stereo',
    ])
  })

  it('moves nothing at all when the rosters are the rosters', () => {
    // The zero beneath the diff above: the census has to be shown answering
    // "nothing moved" when nothing moved, or four moved rows is a number with
    // no floor under it.
    expect(movedLabels(sources(MODEL_ROSTERS), sources(MODEL_ROSTERS))).toEqual([])
  })
})

describe('a key declared in a guarded roster reaches CONTROLS with this module unedited', () => {
  for (const plant of [
    {
      roster: 'stereo',
      // A stereo setting: its own control, derived straight from the key.
      patch: (real: RosterModule) => ({ STEREO_KEYS: [...real.STEREO_KEYS, PLANTED] }),
      ids: [`stereo.${PLANTED}`],
    },
    {
      roster: 'scene',
      // A scene key that is not a container, so it is its own control rather
      // than expanding into another owner.
      patch: (real: RosterModule) => ({ SCENE_KEYS: [...real.SCENE_KEYS, PLANTED] }),
      ids: [`scene.${PLANTED}`],
    },
    {
      roster: 'layer',
      // A key on one variant, which is the unit `LAYER_KEYS` is keyed by.
      patch: (real: RosterModule) => ({
        LAYER_KEYS: { ...real.LAYER_KEYS, text: [...real.LAYER_KEYS.text, PLANTED] },
      }),
      ids: [`layer.text.${PLANTED}`],
    },
  ]) {
    it(`derives a control when the ${plant.roster} roster gains a key`, async () => {
      const before = readFileSync(SUBJECT, 'utf8')
      const grown = await reDerive(plant.patch)

      // The substitution check, as its own assertion rather than as a
      // precondition folded into the result: a mock that did not apply gives a
      // registry identical to the shipped one, and `appeared` would then
      // answer `[]` while looking like a measurement.
      expect(idsOf(grown), 'the plant did not substitute').not.toEqual(SHIPPED_IDS)

      // And the re-evaluated subject is still reading its rosters from the
      // module it imports — asserted inside the planted graph, which is the
      // only place identity means anything after a module reset.
      expect(grown.spec.MODEL_ROSTERS.scene, 'the re-derived scene roster is a copy')
        .toBe(grown.roster.SCENE_KEYS)
      expect(grown.spec.MODEL_ROSTERS.stereo, 'the re-derived stereo roster is a copy')
        .toBe(grown.roster.STEREO_KEYS)
      expect(grown.spec.MODEL_ROSTERS.layer, 'the re-derived layer roster is a copy')
        .toBe(grown.roster.LAYER_KEYS)

      expect(appeared(SHIPPED_IDS, idsOf(grown)), 'a roster key did not reach the registry')
        .toEqual(plant.ids)
      for (const id of plant.ids) {
        expect(Object.hasOwn(grown.spec.CONTROLS, id), `${id} is in no record`).toBe(true)
        expect(grown.spec.CONTROLS[id]?.control, id).toBe(id)
      }

      // The half the claim is named for. The registry grew while the module
      // that builds it was not touched — stated against its bytes on disk,
      // before and after, because the alternative is to assert it in prose.
      expect(readFileSync(SUBJECT, 'utf8'), 'the subject was edited to make this pass').toBe(before)

      // And the growth is exactly the declaration: nothing else appeared, and
      // nothing that was there went away.
      expect(appeared(idsOf(grown), SHIPPED_IDS), 'the plant removed a control').toEqual([])
      expect(idsOf(grown).length).toBe(SHIPPED_IDS.length + plant.ids.length)
    })
  }

  it('derives nothing new when no key is declared, so the plants above are not noise', async () => {
    // §6.5a's floor under the three plants: the instrument has to be shown
    // reaching zero through the same path. A mock that re-exports the real
    // bindings unchanged is the null case, and it exercises every step the
    // plants do — reset, mock, re-evaluate, re-index.
    const same = await reDerive(real => ({ STEREO_KEYS: real.STEREO_KEYS }))
    expect([...same.spec.MODEL_ROSTERS.stereo], 'the null plant substituted something')
      .toEqual([...STEREO_KEYS])
    expect(appeared(SHIPPED_IDS, idsOf(same))).toEqual([])
    expect(appeared(idsOf(same), SHIPPED_IDS)).toEqual([])
  })

  it('loses the control again when the declaration is withdrawn', async () => {
    // The plant demonstrated both ways, which is what makes it a seam rather
    // than a one-way ratchet. The registry is re-imported through the same
    // reset-and-re-evaluate path the plant used, with the mock removed, so
    // this is the revert and not merely the static import left over from the
    // top of the file.
    const grown = await reDerive(real => ({ STEREO_KEYS: [...real.STEREO_KEYS, PLANTED] }))
    expect(Object.hasOwn(grown.spec.CONTROLS, `stereo.${PLANTED}`), 'the plant did not substitute')
      .toBe(true)

    vi.doUnmock(ROSTER_MODULE)
    vi.resetModules()
    const reverted: Controlspec = await import('./controlspec.js')
    const barrel: RosterModule = await import('../src/core/index.js')
    expect(reverted.MODEL_ROSTERS.stereo, 'the reverted roster is a copy').toBe(barrel.STEREO_KEYS)
    expect([...reverted.MODEL_ROSTERS.stereo], 'the roster did not revert').toEqual([
      ...STEREO_KEYS,
    ])
    expect(Object.hasOwn(reverted.CONTROLS, `stereo.${PLANTED}`), 'the plant outlived the mock')
      .toBe(false)
    expect([...reverted.CONTROL_IDS].sort()).toEqual(SHIPPED_IDS)
  })

  it('keeps the derived registry frozen and prototype-free however it was derived', async () => {
    // Whether this proof wanted a mutable path, as an assertion: it did not.
    // The shipped registry and a registry derived from a planted roster are
    // both frozen null-prototype records, so nothing here asks
    // `site/controlspec.ts` to loosen a guard in order to be testable.
    const grown = await reDerive(real => ({ STEREO_KEYS: [...real.STEREO_KEYS, PLANTED] }))
    const registries = [['shipped', CONTROLS], ['planted', grown.spec.CONTROLS]] as const
    for (const [label, registry] of registries) {
      expect(Object.isFrozen(registry), `the ${label} registry is mutable`).toBe(true)
      expect(Object.getPrototypeOf(registry), `the ${label} registry has a prototype`).toBe(null)
    }
  })
})

describe('the registry is allowed to grow', () => {
  it('stays silent while the registry grows by the universal parameters', async () => {
    // The universal animation parameters are declared and deliberately not
    // wired into the rosters; wiring them is a later task's, and it will add a
    // control for each of them on each verb. Every bound in this file has to
    // survive that untouched, or the bound was a pinned count wearing a
    // predicate's clothes.
    //
    // Planted rather than noted, because a note is not a sensor: the growth is
    // applied through the roster the wiring will use, and every predicate
    // above is re-asserted over the grown registry here.
    const grown = await reDerive(real => ({
      PRESET_PARAMS: Object.fromEntries(
        Object.entries(real.PRESET_PARAMS).map(([kind, ds]) => [kind, [...ds, ...UNIVERSAL_PARAMS]]),
      ),
    }))

    // The growth is named, never counted: the expected set is derived from the
    // same two populations the wiring would read, so this needs no edit when a
    // universal parameter is added or a verb is.
    const expected = Object.keys(PRESET_PARAMS)
      .flatMap(kind => UNIVERSAL_PARAMS.map(d => `preset.${kind}.${d.name}`))
      .sort()
    expect(expected.length, 'no universal parameter is declared, so this proves nothing')
      .toBeGreaterThan(0)
    expect(appeared(SHIPPED_IDS, idsOf(grown)), 'the wiring did not produce the controls it should')
      .toEqual(expected)

    // The predicates, re-asserted over the grown registry. A real regression
    // arrives as a named list from one of these; the growth arrives as silence.
    expect(grown.spec.MODEL_ROSTERS.scene, 'growth broke the scene wiring')
      .toBe(grown.roster.SCENE_KEYS)
    expect(grown.spec.MODEL_ROSTERS.stereo, 'growth broke the stereo wiring')
      .toBe(grown.roster.STEREO_KEYS)
    expect(grown.spec.MODEL_ROSTERS.layer, 'growth broke the layer wiring')
      .toBe(grown.roster.LAYER_KEYS)
    expect(grown.spec.CONTROLS, 'the grown registry is not the index of its own derivation')
      .toEqual(indexControls(deriveControls(grown.spec.MODEL_ROSTERS)))
    expect(grown.spec.duplicateControlIds(), 'the universals collided with a verb parameter')
      .toEqual([])
    expect(appeared(idsOf(grown), SHIPPED_IDS), 'growth removed a control').toEqual([])
  })

  it('names what went missing when a roster is dropped, which growth never does', async () => {
    // The reader-facing half of the rule above, and the reason the assertions
    // are set differences rather than counts: the two events have to be
    // distinguishable in the output. A regression prints the ids that are
    // gone; growth prints nothing at all.
    const emptied = await reDerive(() => ({ STEREO_KEYS: [] }))
    expect(appeared(idsOf(emptied), SHIPPED_IDS), 'emptying a roster lost nothing')
      .toEqual([...STEREO_KEYS].map(k => `stereo.${k}`).sort())
    expect(appeared(SHIPPED_IDS, idsOf(emptied)), 'emptying a roster added a control').toEqual([])
  })

  it('is a registry no one source carries alone, measured on this run', async () => {
    // Not a floor on the total — a floor on each source's share of it, read
    // from the rosters on the same run. An enumerated registry that had
    // quietly stopped reading one of its sources passes a total and fails
    // this.
    const carried: [string, number][] = []
    for (const [roster, patch] of [
      ['scene', () => ({ SCENE_KEYS: [] })],
      ['stereo', () => ({ STEREO_KEYS: [] })],
      ['preset', () => ({ PRESET_PARAMS: {} })],
      ['layer', () => ({ LAYER_KEYS: {} })],
    ] as const) {
      const without = await reDerive(patch)
      carried.push([roster, appeared(idsOf(without), SHIPPED_IDS).length])
      vi.doUnmock(ROSTER_MODULE)
      vi.resetModules()
    }
    for (const [roster, n] of carried) {
      expect(n, `${roster} contributes no control, so the registry is not reading it`)
        .toBeGreaterThan(0)
      expect(CONTROL_IDS.length, `${roster} carries the whole registry`).toBeGreaterThan(n)
    }
  })
})

describe('the rosters this file plants into are the ones the type guards cover', () => {
  it('derives a control for every key of every guarded roster, and for nothing else', () => {
    // The containment the registration test states per roster, stated here as
    // the partition it actually is: every key of every guarded roster has a
    // control, and every control's key comes from one of them. The second half
    // is the one a copied roster cannot fake over time — an entry whose key no
    // roster declares has nowhere to have come from.
    const containers = MODEL_ROSTERS.containers as Readonly<Record<string, string>>
    const declared = new Set<string>([
      ...[...SCENE_KEYS].filter(k => !Object.hasOwn(containers, k)).map(k => `scene.${k}`),
      ...[...STEREO_KEYS].map(k => `stereo.${k}`),
      ...MODEL_ROSTERS.reachable.flatMap(v =>
        (LAYER_KEYS[v as keyof typeof LAYER_KEYS] ?? []).map(k => `layer.${v}.${k}`),
      ),
      ...Object.keys(PRESET_PARAMS).flatMap(kind =>
        (PRESET_PARAMS[kind as keyof typeof PRESET_PARAMS] ?? []).map(d => `preset.${kind}.${d.name}`),
      ),
    ])
    expect(declared.size, 'the rosters declare nothing, so the equality below is vacuous')
      .toBeGreaterThan(0)
    expect([...CONTROL_IDS].sort(), 'the registry and the rosters disagree').toEqual(
      [...declared].sort(),
    )
  })
})
