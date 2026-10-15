/**
 * Criterion 6 as **one** predicate: every `CONTROLS` entry resolves to
 * *exactly one* mounted panel under the default layout.
 *
 * ## Why this file exists when both halves were already true
 *
 * The criterion was already *satisfied* before this file, and sensored — but
 * by two assertions in two modules that nothing joins:
 *
 * | half | the assertion | what it rules out |
 * |---|---|---|
 * | **at least one** | `controlspec.test.ts`: `unmountedControls` is `[]` | a control naming an unslotted panel |
 * | **at most one** | `layout.test.ts`: `duplicatePanelIds(DEFAULT_LAYOUT)` is `[]` | a panel slotted twice |
 *
 * **Neither is the criterion, and the control-side reader cannot become it.**
 * `unmountedControls` opens with `new Set(mountedPanels(layout))`, so
 * multiplicity is discarded in its first line: handed a layout that mounts the
 * inspector in two slots it answers `[]` — green — while every control in the
 * registry resolves to two live panels, of which only one is wired.
 * `layout.test.ts`'s own words for that symptom are *"two live copies, of
 * which one gets the events"*. {@link DOUBLE_INSPECTOR} is that layout, and
 * the test over it asserts the blindness out loud rather than leaving a reader
 * to infer that the `[]` next door covered it.
 *
 * So the deliverable is not a third reader. It is the **conjunction, stated
 * once, over the registry** — and it is the join that is load-bearing: the day
 * `layout.test.ts`'s at-most-one assertion is relaxed to admit a deliberately
 * doubled panel, criterion 6 becomes false and every assertion in
 * `controlspec.test.ts` stays green. §9: *"a recorded note is a sensor"* is
 * false; the note has to **be** the test.
 *
 * ## It asserts the count, not the values (design §9.2, invariant §2.4)
 *
 * Every control in the shipped registry names `inspector`, because
 * `OWNER_PANELS` is `Record<ControlOwner, PanelId>` and every owner is the
 * inspector today. That is a recorded decision of `controlspec.ts`'s —
 * design §9.3's *"generated widgets for the residue … the floor that
 * guarantees R6"* — **and it is not something this file may rest on.** A
 * predicate that is only true because there is one panel would go green on a
 * registry with no structure in it and red on the first control promoted to
 * the depth strip, which is the opposite of what criterion 6 is for. So the
 * sweep counts, never compares to `'inspector'`, and
 * `is about the count and not about which panel` re-runs it over a copy of the
 * registry dealt across **every** panel the default layout mounts.
 *
 * ## Nothing here is pinned, and that is twice load-bearing
 *
 * §9: *"a total in a document is a count of something"* — it is not; survey
 * §F-11's control population was two arity conventions at once and the
 * registry would have been wrong *and green* had anyone pinned it. Every
 * floor below is two populations measured on the same run with one
 * structurally containing the other, as `controlspec.test.ts` already does.
 *
 * The second reason is sequencing: the universal animation parameters
 * (`ease`, `repeat`, `start`, `duration`) have descriptors but are not yet
 * wired into `MODEL_ROSTERS`, and wiring them grows this registry. **An
 * assertion that reddens on that growth would be pinned, and would read as a
 * regression when nothing regressed.**
 * `stays true as the registry grows` plants that growth and shows it does not
 * move anything here; every failure message below names *control ids*, so a
 * real regression arrives as a named control and growth arrives as silence.
 *
 * ## `draw` is excluded by the validator, and that tie is not re-litigated here
 *
 * Ruling R-q: the predicate ranges over browser-reachable layer variants only,
 * because `site/scene.ts` refuses `type: 'draw'` and a mounted `draw` control
 * would be a control for a scene the browser will not load — criterion 6 would
 * be *false on a correct editor*. The structural half of that (the partition
 * of `Layer['type']` into reachable and refused) is `controlspec.test.ts`'s and
 * stays there. What this file owns is one line tying **its own population** to
 * the refusal, so the sweep cannot quietly become a sweep over a hardcoded
 * list of variants. No count of variants is written anywhere below.
 */
import { describe, expect, it } from 'vitest'
import {
  CONTROL_IDS,
  CONTROL_SPECS,
  MODEL_ROSTERS,
  browserReachableLayerTypes,
  deriveControls,
  unmountedControls,
} from './controlspec.js'
import type { ControlInfo } from './controlspec.js'
import { DEFAULT_LAYOUT, duplicatePanelIds, mountedPanels } from './layout.js'
import type { LayoutConfig } from './layout.js'
import { PANEL_IDS } from './panels.js'
import type { PanelId } from './panels.js'
import { LAYER_KEYS, PRESET_PARAMS, SCENE_KEYS, STEREO_KEYS } from '../src/core/index.js'
import { validateScene } from './scene.js'

/**
 * How many mounted panels this control resolves to, in this layout.
 *
 * The whole criterion is this number being 1, and `unmountedControls` is this
 * number being non-zero. Written over `mountedPanels` — the list, before any
 * `Set` — because the list is where the multiplicity still exists.
 */
function mountsFor(spec: ControlInfo, layout: LayoutConfig<string>): number {
  return mountedPanels(layout).filter(panel => panel === spec.panel).length
}

/**
 * Every control that does **not** resolve to exactly one mounted panel, each
 * labelled with the panel it named and the number of copies it found.
 *
 * Ids and not a count, so the failure message says which control and why. A
 * count would be a number the next reader has to reconcile against a registry
 * that is expected to grow.
 */
function misresolved(
  layout: LayoutConfig<string>,
  specs: readonly ControlInfo[] = CONTROL_SPECS,
): readonly string[] {
  return specs
    .filter(spec => mountsFor(spec, layout) !== 1)
    .map(spec => `${spec.control} → ${spec.panel} ×${mountsFor(spec, layout)}`)
    .sort()
}

/**
 * The default layout with the inspector slotted a second time.
 *
 * The §6.5a control that only this file has: criterion 6 is **false** here and
 * `unmountedControls` says `[]`. Built from `DEFAULT_LAYOUT` rather than typed
 * out, so it cannot drift away from the layout it is a mutation of.
 */
const DOUBLE_INSPECTOR: LayoutConfig<PanelId> = {
  id: 'double-inspector',
  label: 'Inspector twice',
  slots: {
    ...DEFAULT_LAYOUT.slots,
    bottom: [...DEFAULT_LAYOUT.slots.bottom, 'inspector'],
  },
}

/**
 * The default layout with the inspector dropped.
 *
 * The other §6.5a control, and the realistic one: a simple mode built by
 * removing the panel the generated-widget floor lands in strands every control
 * that landed there, in silence. `controlspec.test.ts` holds the same shape
 * for `unmountedControls`; it is here too because the predicate under test is
 * a different one and may not borrow another file's control.
 */
const NO_INSPECTOR: LayoutConfig<PanelId> = {
  id: 'no-inspector',
  label: 'No inspector',
  slots: { ...DEFAULT_LAYOUT.slots, right: [] },
}

/**
 * A layout that mounts nothing at all.
 *
 * The one zero-side control whose expected result is **independent of the
 * owner→panel map**, which the two above are not. Measured, not assumed: with
 * `OWNER_PANELS` planted to send `layer` to `layers` and `preset` to
 * `timeline` — a map this task had to decide against adopting, so a map a
 * successor may well adopt — the controls in this file that were written as
 * "every control is affected" went red while the criterion stayed green. An
 * assertion that reddens when a control is promoted to the depth strip is
 * pinned to today's map, and promoting one is the intended change.
 */
const EMPTY_LAYOUT: LayoutConfig<PanelId> = {
  id: 'empty',
  label: 'Nothing mounted',
  slots: { left: [], centre: [], right: [], bottom: [] },
}

/**
 * The controls a layout can reach at all, counted off the specs themselves.
 *
 * Every "how many does this strand" claim below is written against this rather
 * than against the registry's size, so each one survives any owner→panel map.
 */
function controlsNaming(panels: readonly string[], specs: readonly ControlInfo[]): number {
  return specs.filter(spec => panels.includes(spec.panel)).length
}

/** The panels the default layout mounts that `layout` does not. */
function droppedPanels(layout: LayoutConfig<string>): readonly string[] {
  const kept = new Set<string>(mountedPanels(layout))
  return [...new Set(mountedPanels(DEFAULT_LAYOUT))].filter(panel => !kept.has(panel))
}

describe('every control resolves to exactly one mounted panel', () => {
  it('resolves every control in the shipped registry under the default layout', () => {
    // The criterion itself, in one assertion, over the shipped value.
    expect(misresolved(DEFAULT_LAYOUT), 'a control does not resolve to exactly one mounted panel')
      .toEqual([])
  })

  it('swept the whole registry, and the registry is larger than any source', () => {
    // Hole 1, the empty-set hole: *"every X …"* is true of no X at all, which
    // is what survey §I-1 named criterion 6 for. The floor is a containment
    // measured on this run, never a literal. Several different totals have
    // been offered for this registry by documents that disagree with each
    // other; this file asserts none of them.
    const sources = [
      SCENE_KEYS.length,
      STEREO_KEYS.length,
      Object.values(LAYER_KEYS).reduce((n, keys) => n + keys.length, 0),
      Object.values(PRESET_PARAMS).reduce((n, ds) => n + ds.length, 0),
    ]
    for (const n of sources) {
      expect(n, 'a source roster is empty, so this floor proves nothing').toBeGreaterThan(0)
      expect(CONTROL_IDS.length, 'the registry is no larger than one of its sources')
        .toBeGreaterThan(n)
    }
    // And the sweep ranges over all of it rather than over a subset that
    // happens to pass: `misresolved` filters `CONTROL_SPECS`, so this is the
    // population the assertion above actually visited.
    expect(CONTROL_SPECS.length, 'the specs and the ids disagree on the population')
      .toBe(CONTROL_IDS.length)
  })

  it('names a registered panel on every control', () => {
    // The runtime witness for `OWNER_PANELS`' `Record<ControlOwner, PanelId>`:
    // the annotation makes an unregistered panel a compile error, and nothing
    // in `npm test` reads a type. "Resolves to a mounted panel" is a weaker
    // claim than "resolves to a *registered* panel that is mounted", and a
    // layout may mount a string the registry never heard of.
    for (const spec of CONTROL_SPECS) {
      expect(PANEL_IDS, `${spec.control} names a panel no registry declares`).toContain(spec.panel)
    }
    expect(PANEL_IDS.length, 'the panel registry collapsed').toBeGreaterThan(0)
  })
})

describe('the sweep can report something other than one', () => {
  it('counts zero for every control when nothing is mounted at all', () => {
    // §6.5a, the zero side, in the one form no owner→panel map can change.
    // `[]` above is evidence only to the extent that the same instrument,
    // handed a layout that reaches none of these controls, says so about
    // every one of them.
    expect(misresolved(EMPTY_LAYOUT).length, 'an empty layout stranded nothing')
      .toBe(CONTROL_IDS.length)
    expect(CONTROL_IDS.length, 'there was nothing to strand').toBeGreaterThan(0)
    for (const spec of CONTROL_SPECS) {
      expect(mountsFor(spec, EMPTY_LAYOUT), spec.control).toBe(0)
    }
  })

  it('counts zero for exactly the controls whose panel a layout drops', () => {
    // The realistic case, and the one that is *about* the map rather than
    // indifferent to it: a simple mode built by dropping the inspector. Both
    // sides derived — the panels this layout lost, and the controls that named
    // them — so the claim holds whatever `OWNER_PANELS` says.
    const dropped = droppedPanels(NO_INSPECTOR)
    expect(dropped.length, 'the control layout dropped no panel').toBeGreaterThan(0)
    const affected = controlsNaming(dropped, CONTROL_SPECS)
    expect(affected, 'no control names the panel this layout dropped').toBeGreaterThan(0)
    expect(misresolved(NO_INSPECTOR).length, 'dropping a panel stranded the wrong controls')
      .toBe(affected)
    for (const spec of CONTROL_SPECS) {
      expect(mountsFor(spec, NO_INSPECTOR), spec.control).toBe(dropped.includes(spec.panel) ? 0 : 1)
    }
  })

  it('counts two when the layout mounts their panel twice, which unmountedControls cannot', () => {
    // 🚩 The reason this file exists, and the half no existing assertion
    // reaches. Criterion 6 is FALSE under this layout and the shipped
    // control-side reader is green on it, because its first line is
    // `new Set(mountedPanels(layout))` and a `Set` has no multiplicity.
    //
    // Derived off `duplicatePanelIds` rather than off `'inspector'`, so the
    // claim is "the controls that named a doubled panel count two" and not
    // "all of them do" — the latter is only true while every owner shares one
    // panel, which is today's map and not the criterion.
    const doubled = duplicatePanelIds(DOUBLE_INSPECTOR)
    expect(doubled, 'the control layout doubles nothing').toEqual(['inspector'])
    const affected = controlsNaming(doubled, CONTROL_SPECS)
    expect(affected, 'no control names the doubled panel').toBeGreaterThan(0)
    for (const spec of CONTROL_SPECS) {
      expect(mountsFor(spec, DOUBLE_INSPECTOR), spec.control)
        .toBe(doubled.includes(spec.panel) ? 2 : 1)
    }
    expect(misresolved(DOUBLE_INSPECTOR).length, 'a doubled panel misresolved nothing')
      .toBe(affected)

    // The two readers that do exist, measured on the same layout, so the gap
    // is a measurement here rather than a claim about somebody else's file.
    expect(unmountedControls(DOUBLE_INSPECTOR), 'unmountedControls grew a multiplicity sensor')
      .toEqual([])
    expect(duplicatePanelIds(DOUBLE_INSPECTOR), 'the layout reader cannot see the doubling either')
      .toEqual(['inspector'])
  })

  it('is about the count and not about which panel', () => {
    // Hole 2, and the decision this task was sent to make: the shipped
    // owner→panel map sends every owner to `inspector`, so *"resolves to
    // exactly one mounted panel"* could be passing because there is only one
    // panel in play. It is not. The same sweep is re-run over a copy of the
    // registry dealt across every panel the default layout mounts — derived
    // from the layout, not typed — and it still holds. A non-trivial map,
    // whenever the depth strip or the timeline claims a control, needs no
    // change here.
    const panels = [...new Set(mountedPanels(DEFAULT_LAYOUT))]
    expect(panels.length, 'the default layout mounts one panel, so this control proves nothing')
      .toBeGreaterThan(1)
    const spread: readonly ControlInfo[] = CONTROL_SPECS.map((spec, i) => ({
      ...spec,
      panel: panels[i % panels.length]!,
    }))
    expect(new Set(spread.map(s => s.panel)).size, 'the deal did not spread the registry')
      .toBe(panels.length)
    expect(misresolved(DEFAULT_LAYOUT, spread), 'the sweep depends on the panel being the inspector')
      .toEqual([])

    // And it is still per-control rather than global: under a layout missing
    // one of those panels, exactly the controls dealt that panel are the ones
    // that misresolve. This is the shape the whole file needs to hold in —
    // all-or-nothing is only correct while one panel owns everything.
    const dropped = droppedPanels(NO_INSPECTOR)
    const stranded = misresolved(NO_INSPECTOR, spread)
    expect(stranded.length, 'a per-control sweep stranded all or none')
      .toBe(controlsNaming(dropped, spread))
    expect(stranded.length, 'the deal gave the dropped panel nothing').toBeGreaterThan(0)
    expect(stranded.length, 'the deal gave the dropped panel everything')
      .toBeLessThan(spread.length)
  })
})

describe('the population the sweep ranges over', () => {
  it('excludes draw because the browser’s own validator refuses it, not because of a number', () => {
    // Ruling R-q, as one line tied to the refusal: the day `site/scene.ts`
    // stops refusing `draw`, this goes red and the sweep below is knowingly
    // missing a variant. `controlspec.test.ts` owns the structural half — the
    // partition of `Layer['type']` into reachable and refused — and this is
    // deliberately not a second copy of it.
    expect(
      () => validateScene({ size: [2, 2], layers: [{ type: 'draw', fn: 'x' }] }),
      'the validator accepts draw, so a draw control is now reachable and this sweep is short',
    ).toThrow(/draw/)

    // The sweep's own population, read from the probe rather than from a list.
    const reachable = [...browserReachableLayerTypes()].sort()
    expect(reachable.length, 'no layer variant is reachable, so the layer half is empty')
      .toBeGreaterThan(1)
    expect(
      [...new Set(CONTROL_SPECS.filter(s => s.owner === 'layer').map(s => s.scope ?? ''))].sort(),
      'the layer controls swept here are not the variants the validator accepts',
    ).toEqual(reachable)
  })

  it('stays true as the registry grows', () => {
    // The sequencing hazard, discharged rather than noted. The universal
    // animation parameters are declared and not yet wired into
    // `MODEL_ROSTERS`; wiring them adds one control per parameter per verb and
    // grows this registry substantially. Nothing in this file may
    // redden for that reason, so the growth is planted here: a registry grown
    // through the same seam still resolves, and the floor still holds against
    // the grown population rather than against the shipped one.
    const grown = deriveControls({
      ...MODEL_ROSTERS,
      scene: [...MODEL_ROSTERS.scene, 'ease', 'repeat', 'start', 'duration'],
    })
    expect(grown.length, 'the growth seam produced nothing').toBeGreaterThan(CONTROL_SPECS.length)
    expect(misresolved(DEFAULT_LAYOUT, grown), 'a grown registry misresolves').toEqual([])
    expect(misresolved(EMPTY_LAYOUT, grown).length, 'the control did not grow with the registry')
      .toBe(grown.length)
  })
})
