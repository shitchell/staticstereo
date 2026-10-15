/**
 * The runtime witness for `site/panels.ts`'s three `AssertNever` pairs, and the
 * registry's own unit tests.
 *
 * ## Why a runtime witness at all
 *
 * Same reason `site/layout.test.ts` and `src/core/layerkeys.test.ts` exist:
 * `npm run typecheck` is the only thing that enforces an `AssertNever`, vitest
 * does not type-check, so a registry guarded only that way is invisible to
 * `npm test` and therefore to the gate's test leg. Survey §F-6 names the
 * pairing rule; `anim/track.ts:204-208` records it for `SUMMED_CHANNELS`.
 *
 * ## The floors are containments, not numbers
 *
 * Every claim below of the form "every registered panel …" or "every mounted
 * panel …" is universally quantified and vacuously true over an empty
 * registry. §9's trap is that *"a numeric floor chosen from today's count is
 * not a check — a specifier floor of 160 was overtaken inside its own
 * cluster"*, which happened on this branch. So the floors here are
 * `src/svelte-free.test.ts:194-235`'s shape: **two populations measured on the
 * same run, one structurally containing the other.** The registry must contain
 * what `DEFAULT_LAYOUT` mounts, and the chrome panels must be a *strict*
 * non-empty subset of the registry. Neither bound is a count anyone typed, and
 * both go red on a registry that collapsed to nothing.
 */
import { describe, expect, it } from 'vitest'
import {
  PANELS,
  PANEL_IDS,
  REFUSED_PANELS,
  chromePanels,
  panelInfo,
  refusedPanel,
  unregisteredPanels,
} from './panels.js'
import type { PanelInfo, PanelLayout, PanelTable } from './panels.js'
import { DEFAULT_LAYOUT, SLOTS, mountedPanels } from './layout.js'
import type { LayoutConfig } from './layout.js'

/**
 * A layout that mounts a panel nobody registered.
 *
 * This is criterion 5's **control** and not an example: `unregisteredPanels`
 * answering `[]` for the default layout is evidence only to the extent that the
 * same reader, handed a layout that really does name a stranger, says so
 * (§6.5a). It is written over its own vocabulary — `LayoutConfig<P extends
 * string>`, not {@link PanelLayout} — because that is precisely the door the
 * compile-time tie cannot close, and the point of the runtime check is to stand
 * where the compiler does not.
 */
const STRANGER_LAYOUT: LayoutConfig<'canvas' | 'toolbar'> = {
  id: 'stranger',
  label: 'Stranger',
  slots: { left: [], centre: ['canvas'], right: ['toolbar'], bottom: [] },
}

/**
 * A second layout written over the registry's own vocabulary, narrowed.
 *
 * `PanelLayout` and not `LayoutConfig`, which is the whole difference: this one
 * cannot name a panel that is not registered, and the proof is that
 * {@link STRANGER_LAYOUT} above had to drop down to `LayoutConfig` to be
 * written at all.
 */
const SIMPLE_LAYOUT: PanelLayout<'layers' | 'canvas' | 'inspector'> = {
  id: 'simple',
  label: 'Simple',
  slots: { left: ['layers'], centre: ['canvas'], right: ['inspector'], bottom: [] },
}

/** Members of `a` that are also in `b`. Used in both directions, so it is one function. */
function overlap(a: readonly string[], b: readonly string[]): string[] {
  return a.filter(x => b.includes(x)).sort()
}

describe('PANEL_IDS', () => {
  it('is the runtime witness for the compile-time panel pair', () => {
    // `panels.ts`'s `_NoPanelMissing`/`_NoPanelExtra` tie the `PanelId` union to
    // this tuple, and nothing in `npm test` can read a type. What it can read is
    // the thing the compiler forced to track it: the keys of the record
    // annotated `Record<PanelId, …>`. A panel deleted from the tuple and from
    // the union together is a clean typecheck and is caught here, because
    // `PANELS` would then be short a key only if it moved too.
    expect(Object.keys(PANELS).sort(), 'PANELS is keyed by PanelId').toEqual([...PANEL_IDS].sort())
  })

  it('names each panel exactly once', () => {
    // `readonly PanelId[]` admits a member written twice and `Exclude` is
    // set-valued, so neither the annotation nor either `AssertNever` pair can
    // see a duplicate. The same hole `SCENE_KEYS` had at `05aeb26`,
    // `LAYER_KEYS` at `22572ea` and `SLOTS` at `4a75928`, closed by hand here
    // for the same reason — and the shape is the same every time: the type is
    // set-valued and the value is a list.
    //
    // The symptom here is specific and quiet. `PANEL_IDS` is the iteration
    // order every consumer inherits, so a panel listed twice is a panel
    // *mounted* twice by anything that walks the registry rather than the
    // layout — two live instances of one panel, of which only one is wired.
    const repeated = PANEL_IDS.filter((p, i, all) => all.indexOf(p) !== i)
    expect(repeated, 'a panel listed twice is a panel built twice').toEqual([])
  })

  it('gives every panel an entry that knows its own key, a name and a reason', () => {
    // The floor for this loop is the pair-witness above: `PANELS`'s keys are
    // `PANEL_IDS`, so an empty tuple is already red there rather than silently
    // passing here.
    for (const panel of PANEL_IDS) {
      const info = PANELS[panel]
      expect(info.panel, `${panel} does not carry its own key`).toBe(panel)
      expect(info.label.length, `${panel} has no human-facing name`).toBeGreaterThan(0)
      expect(info.description.length, `${panel} has no recorded reason`).toBeGreaterThan(0)
    }
  })

  it('declares what a panel is, and neither where it goes nor whether it is shown', () => {
    // Two absences, and both are load-bearing enough that the shape of
    // `PanelInfo` is where they are recorded rather than a comment.
    //
    // **No `slot`.** Design §11 budgets panel placement at "a declaration" and
    // which panels exist at "one registration" — two rows, two mechanisms. A
    // panel that knew its own slot would make moving it cost an edit here *and*
    // in `LayoutConfig`, which is the one thing both rows exist to prevent. It
    // would also make a second layout (§11's architecture test) incoherent,
    // because the panel would be asserting a placement that the other layout
    // contradicts.
    //
    // **No visibility.** §11 again: *"`CONTROLS` is complete; visibility is
    // layered over it … the registry stays complete — that is R6 — and per-mode
    // visibility sets select from it."* The same argument applies one registry
    // up: the moment a panel can declare itself hidden in some mode, `PANELS`
    // has stopped being the complete list of panels that exist.
    //
    // The literals are the *refused spellings*, which is the one place naming a
    // string is the point — exactly as `layout.test.ts` names `'before'` and
    // `fit.ts` keys `REJECTED_FIT_MODES` by `'cover'`. The day somebody adds one
    // this goes red and has to be argued with.
    for (const panel of PANEL_IDS) {
      const fields = Object.keys(PANELS[panel])
      expect(fields, `${panel} declares its own placement`).not.toContain('slot')
      expect(fields, `${panel} declares its own visibility`).not.toContain('visible')
      expect(fields, `${panel} declares which modes show it`).not.toContain('modes')
    }
  })
})

describe('the seam with LayoutConfig', () => {
  it('registers every panel the default layout mounts', () => {
    // Criterion 5's runtime half. The compile-time half is `panels.ts`'s
    // `_EveryMountedPanelRegistered`, which is the stronger of the two and
    // covers exactly one layout; this covers every layout, including one built
    // at run time from a stored preference, which is the case no `AssertNever`
    // can reach. Design §9.2 calls the regression "spec written, assigned to a
    // panel no layout slots"; this is its mirror, and the one a compiler sees.
    expect(
      unregisteredPanels(DEFAULT_LAYOUT),
      'the default layout mounts a panel nobody registered',
    ).toEqual([])
  })

  it('contains what the default layout mounts, so the check above is not vacuous', () => {
    // The derived floor. Both populations are measured on this run — one from
    // this module's registry, one from `layout.ts`'s value — and neither is a
    // number anyone typed. `unregisteredPanels` answering `[]` is satisfied by
    // a registry that is empty *and* a layout that mounts nothing; the
    // containment below is not, because the mounted set is read from a second
    // module that would have to collapse in the same run.
    const mounted = mountedPanels(DEFAULT_LAYOUT)
    expect(
      [...PANEL_IDS],
      'the registry does not contain the panels the default layout mounts',
    ).toEqual(expect.arrayContaining([...mounted]))
    expect(
      mounted.length,
      'the default layout mounts fewer panels than it has slots, so the sweep collapsed',
    ).toBeGreaterThanOrEqual(SLOTS.length)
  })

  it('names a panel nobody registered, when there is one', () => {
    // §6.5a's other half: the null above is evidence only because the same
    // reader, handed a layout that really does mount a stranger, says so.
    // Without this the whole seam is satisfied by `return []`.
    expect(unregisteredPanels(STRANGER_LAYOUT)).toEqual(['toolbar'])
  })

  it('is the same reader over a second layout, which is the point of the generic', () => {
    // §11's architecture test is that simple mode must be "a different
    // `LayoutConfig` plus a visibility set, not a second app". `SIMPLE_LAYOUT`
    // is a `PanelLayout`, so naming an unregistered panel in it is a compile
    // error in *this file*; `STRANGER_LAYOUT` had to drop to the unconstrained
    // `LayoutConfig` to be written at all, which is the demonstration that the
    // narrowing is real and not decorative.
    expect(unregisteredPanels(SIMPLE_LAYOUT)).toEqual([])
    expect(
      mountedPanels(SIMPLE_LAYOUT).length,
      'the second layout is not narrower than the default',
    ).toBeLessThan(mountedPanels(DEFAULT_LAYOUT).length)
  })
})

describe('one key hides all chrome', () => {
  it('splits the registry, so the key neither hides everything nor nothing', () => {
    // Design §5.1: "One key hides all chrome." The set that key hides is derived
    // from the registry rather than written down beside it, because §9's trap is
    // that *"a hand-written list of the places that do X goes stale silently the
    // day a second place does X"* — and a panel added next year that nobody adds
    // to such a list would stay on screen in a mode whose entire purpose is that
    // nothing is.
    //
    // A **strict, non-empty** subset, and both halves are the floor:
    // non-emptiness rules out a key that does nothing, strictness rules out a
    // key that hides the canvas the author is fusing, and an emptied registry
    // fails both. Neither bound is a count.
    const chrome = chromePanels()
    const all = [...PANEL_IDS]
    expect(all, 'a chrome panel is not registered').toEqual(expect.arrayContaining([...chrome]))
    expect(chrome.length, 'nothing is chrome, so the key hides nothing').toBeGreaterThan(0)
    expect(
      chrome.length,
      'every panel is chrome, so the key hides the canvas the author is fusing',
    ).toBeLessThan(all.length)
  })
})

describe('every lookup refuses the prototype chain', () => {
  // E8 / R-l. `Object.hasOwn` and not a bare index or `in`:
  // `PANELS['constructor']` on a plain object literal is the `Object` function,
  // which is not `undefined`, so an unguarded reader hands back a `PanelInfo`
  // whose every field is `undefined` and whose `.label` interpolates into a
  // panel header. P0b closed this in five registries; `site/chromedom.ts:189`
  // was a live sixth until this phase closed it too.
  const INHERITED = ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']

  it('answers undefined for an inherited member, on every table', () => {
    for (const name of INHERITED) {
      expect(panelInfo(name), name).toBeUndefined()
      expect(refusedPanel(name), name).toBeUndefined()
    }
  })

  it('reports an inherited member as unregistered rather than accepting it', () => {
    // The sharper reading, and the reason `unregisteredPanels` uses
    // `Object.hasOwn` rather than `in`: a layout that mounts `'constructor'`
    // would otherwise pass the seam check above — the registry "has" the key —
    // and the shell would then build a panel from the `Object` function.
    for (const name of INHERITED) {
      const layout: LayoutConfig = {
        id: 'inherited',
        label: 'Inherited',
        slots: { left: [name], centre: [], right: [], bottom: [] },
      }
      expect(unregisteredPanels(layout), name).toEqual([name])
    }
  })

  it('is a guard and not a function that answers undefined to everything', () => {
    // §6.5a: the nulls above are evidence only because the same readers, asked
    // for something real, answer.
    for (const panel of PANEL_IDS) {
      expect(panelInfo(panel), panel).toBeDefined()
    }
    for (const refused of Object.keys(REFUSED_PANELS)) {
      expect(refusedPanel(refused), refused).toBeDefined()
    }
  })
})

describe('the panels the design refused', () => {
  it('records a reason for each, because the absence is the decision', () => {
    // §9: "a recorded note is not a sensor". Both of these are one sentence in
    // the design today, and the failure mode is not that somebody disagrees with
    // them — it is that nobody encounters them. A comment above `PANELS` is
    // deleted by whoever adds the panel; a table with a test over it has to be
    // argued with.
    const named = Object.keys(REFUSED_PANELS)
    expect(named.length, 'nothing is refused, so this table is decorative').toBeGreaterThan(0)
    for (const key of named) {
      const refusal = refusedPanel(key)
      expect(refusal?.panel, key).toBe(key)
      expect(refusal?.reason.length ?? 0, `${key} is refused with no reason`).toBeGreaterThan(0)
    }
  })

  it('refuses nothing it also registers', () => {
    expect(
      overlap(PANEL_IDS, Object.keys(REFUSED_PANELS)),
      'a panel is both registered and refused, so one of the two is stale',
    ).toEqual([])
  })

  it('is a disjointness check that can see an overlap', () => {
    // The control for the null above (§6.5a). `overlap` is the same function.
    expect(overlap(PANEL_IDS, ['canvas', 'graph-editor'])).toEqual(['canvas'])
  })
})

/* ──────────────────────────────────────────────────────────────────────────
 * The registration test — plan §7 P3 criterion 3, design §11 row 2.
 *
 * ## What the row says the unit is
 *
 * Design §11's table has two panel rows and they are two different mechanisms:
 *
 * | Panel placement    | `LayoutConfig` naming slots → panel ids | a declaration    |
 * | Which panels exist | `PANELS` registry                       | one registration |
 *
 * Row 1 is `site/layout.ts`'s and its registration test is `layout.test.ts`'s.
 * **Row 2 is this one, and its unit is a panel** — not a placement, not a slot.
 * So the dummy below is a *panel*, registered in a panel table, and the claim
 * under test is the budget beside it: **one registration**, which `panels.ts`'
 * own header spells out as *"one entry in `PANELS` plus its name in `PANEL_IDS`
 * and `PanelId` — three spellings in this file … and nothing anywhere else."*
 *
 * Plan §7 P3 criterion 3 words the deliverable as *"a dummy entry appears
 * without touching another file"*; design §11 gives the reason it is a test and
 * not a comment: *"without that, 'moving a panel costs a declaration' is
 * unverified until the first time it is false."* That sentence was prose in a
 * docblock until this file, which is §9's *"a recorded note is not a sensor"*
 * pointed at the registry's own budget.
 *
 * ## Why the readers grew a `table` parameter
 *
 * They had no seam. `panelInfo`, `chromePanels` and `unregisteredPanels` each
 * closed over the module-level `PANELS`, so the only registration observable
 * through them was the one already shipped, and "a dummy appears" could only
 * have been tested by reimplementing the readers here — which would assert that
 * *this file* is total over a registration and say nothing about the module.
 *
 * The widening is the shape this cluster already uses, and `keybindings.ts`'
 * {@link KeyBindingTable} states the reason in terms: *"a registration test
 * must be able to register an entry without editing this file."* `OperationTable`,
 * `ShadingTable` and `ViewTable` are the same door. The shipped registry is
 * still the default argument and still total over {@link PanelId}, so nothing
 * in production reads a second table; what the parameter buys is that the
 * readers can be *shown* total over registrations rather than over today's five.
 *
 * ## The budget, as an instrument rather than as a claim
 *
 * Each census row below carries its `source`. A row is `registry` if its value
 * is a function of the panel table; it is `elsewhere` if its value is owned by
 * another module or another table — `REFUSED_PANELS`, and `layout.ts`'
 * `DEFAULT_LAYOUT`. §11 row 2's budget is then two assertions over one diff:
 * **every moved row is a `registry` row**, and **no `elsewhere` row moves**.
 * The second is the "without touching another file" half in the only form a
 * test can hold it: a registration that disturbed the layout module would move
 * `layout.unregistered`, and a registration that disturbed the refusal table
 * would move `refused.ids`.
 *
 * The label *set* is asserted equal before the values are diffed, because a
 * row that vanished would otherwise read as a row that did not move.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * The id the dummy registers under.
 *
 * Deliberately not a name anybody has argued for: design §10.7 wants an
 * occupied-levels histogram and §7.6 a graph editor, and using either here
 * would make this test collide with the day one of them is registered for real.
 * That it is absent from both tables is asserted below rather than assumed.
 */
const DUMMY_ID = 'dummy-panel'

/** A second dummy, not chrome, so the census can be shown to discriminate. */
const SURFACE_ID = 'dummy-surface'

/**
 * The registration itself.
 *
 * `PanelInfo<string>` and not `PanelInfo`, which is the whole reason the
 * interface took a parameter: the shipped entries' `panel` field is a
 * {@link PanelId} and stays one, and a dummy that could satisfy that type would
 * not be a dummy — it would be an already-registered panel.
 */
const DUMMY: PanelInfo<string> = {
  panel: DUMMY_ID,
  label: 'Dummy panel',
  chrome: true,
  description:
    'A dummy registration, and the only entry in this repository whose reason to exist is ' +
    'that design §11 row 2 budgets a panel at one registration and that budget is unverified ' +
    'until something registers one. It never reaches `PANELS`.',
}

/** The same, as the surface the author fuses rather than as chrome. */
const SURFACE_DUMMY: PanelInfo<string> = { ...DUMMY, panel: SURFACE_ID, chrome: false }

/** The shipped registry with one more panel in it. This is the registration. */
const REGISTERED: PanelTable = { ...PANELS, [DUMMY_ID]: DUMMY }

/** The same registration, of a panel that is not chrome. */
const SURFACE_REGISTERED: PanelTable = { ...PANELS, [SURFACE_ID]: SURFACE_DUMMY }

/** A layout that mounts the dummy — the cross-module half of "it appears". */
const DUMMY_LAYOUT: LayoutConfig<'canvas' | typeof DUMMY_ID> = {
  id: 'dummy',
  label: 'Dummy',
  slots: { left: [], centre: ['canvas'], right: [DUMMY_ID], bottom: [] },
}

/** Where a census row's value comes from, which is what §11 row 2 budgets. */
type RowSource = 'registry' | 'elsewhere'

/** One question the module answers, with its answer rendered as a string. */
interface CensusRow {
  readonly label: string
  readonly source: RowSource
  readonly value: string
}

/**
 * Every question this module answers, sorted by label.
 *
 * Three inputs and not one, because the `elsewhere` tag is a claim that has to
 * be falsifiable: a row declared "owned by another file" and then never shown
 * to move when that other file moves is a tag nobody checked. Planting it
 * proved the point — mis-tagging `layout.unregistered` as `registry` leaves
 * the suite green, because that row does not move under a *registration*. So
 * the layout and the refusal table are parameters too, and the control below
 * moves them.
 *
 * Sorted by label so the diff's output is deterministic to read. The diff
 * itself is order-independent by construction — {@link movedLabels} matches on
 * the label rather than on position — which is stronger than §6.5a's
 * *"sorted with their labels"* asks for, and the sort is not what provides it.
 * Rendered as strings so one diff covers lists, counts and presence.
 */
function census(
  table: PanelTable,
  layout: LayoutConfig<string> = DEFAULT_LAYOUT,
  refused: Readonly<Record<string, unknown>> = REFUSED_PANELS,
): readonly CensusRow[] {
  const ids = Object.keys(table)
  const chrome = [...chromePanels(table)]
  const surface = ids.filter(id => !chrome.includes(id))
  const rows: readonly CensusRow[] = [
    { label: 'registry.ids', source: 'registry', value: [...ids].sort().join(' ') },
    { label: 'registry.order', source: 'registry', value: ids.join(' ') },
    { label: 'registry.size', source: 'registry', value: String(ids.length) },
    { label: 'chrome.ids', source: 'registry', value: [...chrome].sort().join(' ') },
    { label: 'chrome.size', source: 'registry', value: String(chrome.length) },
    { label: 'surface.ids', source: 'registry', value: [...surface].sort().join(' ') },
    {
      label: `lookup.${DUMMY_ID}`,
      source: 'registry',
      value: panelInfo(DUMMY_ID, table)?.label ?? '(absent)',
    },
    {
      label: `lookup.${SURFACE_ID}`,
      source: 'registry',
      value: panelInfo(SURFACE_ID, table)?.label ?? '(absent)',
    },
    {
      label: 'refused.ids',
      source: 'elsewhere',
      value: Object.keys(refused).sort().join(' '),
    },
    {
      label: 'layout.mounted',
      source: 'elsewhere',
      value: [...mountedPanels(layout)].sort().join(' '),
    },
    {
      label: 'layout.unregistered',
      source: 'elsewhere',
      value: [...unregisteredPanels(layout, table)].sort().join(' '),
    },
  ]
  return [...rows].sort((a, b) => a.label.localeCompare(b.label))
}

/** The labels whose value differs between two censuses, sorted. */
function movedLabels(before: readonly CensusRow[], after: readonly CensusRow[]): string[] {
  const was = new Map(before.map(row => [row.label, row.value]))
  return after
    .filter(row => was.get(row.label) !== row.value)
    .map(row => row.label)
    .sort()
}

/** The labels a census carries that are tagged with the given source, sorted. */
function labelsFrom(rows: readonly CensusRow[], source: RowSource): string[] {
  return rows.filter(row => row.source === source).map(row => row.label).sort()
}

describe('registering a panel (design §11 row 2, plan §7 P3.3)', () => {
  it('registers an id that is neither registered nor refused, so the dummy is a dummy', () => {
    // Derived rather than assumed. If somebody registers `dummy-panel` for
    // real, every assertion below silently stops testing a registration and
    // starts testing a tautology; this is the row that notices.
    for (const id of [DUMMY_ID, SURFACE_ID]) {
      expect(PANEL_IDS, `${id} is already a registered panel`).not.toContain(id)
      expect(Object.keys(REFUSED_PANELS), `${id} is already refused`).not.toContain(id)
      expect(Object.keys(PANELS).length, 'the registration added nothing').toBeLessThan(
        Object.keys(REGISTERED).length,
      )
    }
  })

  it('makes the dummy appear through every reader, with no other file edited', () => {
    // Criterion 3's own sentence, one reader at a time. None of these knows
    // the dummy's name; each is total over whatever it was handed, which is
    // the property "one registration" is a claim about.
    const info = panelInfo(DUMMY_ID, REGISTERED)
    expect(info, 'the registered panel is not resolvable').toBeDefined()
    expect(info!.panel, 'the entry does not carry its own key').toBe(DUMMY_ID)
    expect(info!.label).toBe(DUMMY.label)
    expect(chromePanels(REGISTERED), 'the registered chrome panel is not chrome').toContain(
      DUMMY_ID,
    )
    // The cross-module half, and the sharper of the two: a layout that mounts
    // the dummy stops reporting it as unregistered — `layout.ts` unedited, the
    // registration alone. This is design §9.2's regression read backwards.
    expect(unregisteredPanels(DUMMY_LAYOUT, REGISTERED)).toEqual([])
  })

  it('does not see the dummy before it is registered, which is what makes the above evidence', () => {
    // §6.5a, both halves named. The null half is this one: the *same* readers,
    // over the *shipped* table, do not know the dummy. Without it "the dummy
    // appears" is satisfied by a reader that answers yes to everything, and
    // the test above would pass against `panelInfo = () => DUMMY`.
    expect(panelInfo(DUMMY_ID), 'the shipped registry already has the dummy').toBeUndefined()
    expect(chromePanels()).not.toContain(DUMMY_ID)
    expect(
      unregisteredPanels(DUMMY_LAYOUT),
      'the dummy layout mounts a panel the shipped registry does not have, and nobody noticed',
    ).toEqual([DUMMY_ID])
  })

  it('answers the same census questions before and after, so a vanished row cannot read as unchanged', () => {
    // Asserted first, deliberately. `movedLabels` compares `after` against a
    // map built from `before`, so a label that disappeared contributes nothing
    // and reads exactly like a label that did not move. C-9 found this with a
    // plant; it is cheaper to assert than to rediscover.
    expect(census(PANELS).map(row => row.label)).toEqual(census(REGISTERED).map(row => row.label))
  })

  it('moves only rows the panel registry owns, and no row another file owns', () => {
    // §11 row 2's budget, as two assertions over one diff rather than as a
    // sentence. Every row that moved is a function of the table that was
    // registered into; no row owned by `layout.ts` or by `REFUSED_PANELS`
    // moved. That second clause is "without touching another file" in the only
    // form a test can hold — a registration that cost an edit in `layout.ts`
    // would be a registration that changed what `layout.ts` reports.
    const moved = movedLabels(census(PANELS), census(REGISTERED))
    const owned = labelsFrom(census(REGISTERED), 'registry')
    const elsewhere = labelsFrom(census(REGISTERED), 'elsewhere')

    expect(moved.length, 'the registration is invisible, so this instrument measures nothing')
      .toBeGreaterThan(0)
    // The floor for the clause below, and it was found by planting it: if
    // every row were tagged `registry`, `elsewhere` would be empty and "no
    // row another file owns moved" would be `[] ⊆ []` — a null measurement
    // with nothing that could have moved, which §6.5a says is not evidence.
    expect(elsewhere.length, 'no row is owned by another file, so the clause below is vacuous')
      .toBeGreaterThan(0)
    expect(overlap(moved, elsewhere), 'a registration moved a row another file owns').toEqual([])
    expect(overlap(moved, owned).length, 'a row moved that no source claims').toBe(moved.length)
    // The floor, derived from the instrument rather than typed: the moved rows
    // are a *strict* subset of the rows there are. A census that moved
    // everything would satisfy both clauses above and measure nothing.
    expect(moved.length, 'everything moved, so the diff discriminates nothing').toBeLessThan(
      census(REGISTERED).length,
    )
  })

  it('moves the rows another file owns when that other file moves, so the tag is checked', () => {
    // §6.5a pointed at the instrument rather than at the registry, and found
    // by planting: "no `elsewhere` row moved" is evidence only if an
    // `elsewhere` row *can* move and be seen. Mis-tagging `layout.unregistered`
    // as `registry` leaves the suite green without this, because that row does
    // not move under a registration — which is the whole claim, and therefore
    // exactly the wrong thing to leave unchecked.
    //
    // It is also design §11's two rows shown to be two mechanisms: changing
    // the *layout* moves only rows no panel registration touches, and
    // registering a *panel* moves only rows no layout touches. Row 1 is
    // `layout.ts`'s budget and row 2 is this module's, and if either moved the
    // other's rows they would be one mechanism wearing two names.
    const byLayout = movedLabels(census(PANELS), census(PANELS, DUMMY_LAYOUT))
    const byRefusal = movedLabels(census(PANELS), census(PANELS, DEFAULT_LAYOUT, {}))
    const elsewhere = labelsFrom(census(PANELS), 'elsewhere')
    const owned = labelsFrom(census(PANELS), 'registry')

    expect(byLayout.length, 'no row moves when the layout does, so the tag is unfalsifiable')
      .toBeGreaterThan(0)
    expect(overlap(byLayout, owned), 'a layout change moved a row the panel registry owns')
      .toEqual([])
    expect(overlap(byLayout, elsewhere).length).toBe(byLayout.length)
    // Named one by one, because this is the control and naming the rows is
    // what a control is for: a row that quietly ignored the argument it is
    // supposed to read would otherwise hide behind any sibling that did not.
    // Planted: `layout.mounted` reading `DEFAULT_LAYOUT` instead of its
    // parameter is green without this line.
    expect(byLayout, 'the mounted-panel row ignores the layout it was handed')
      .toContain('layout.mounted')
    expect(byLayout, 'the unregistered-panel row ignores the layout it was handed')
      .toContain('layout.unregistered')
    expect(byRefusal, 'emptying the refusal table did not move the row that reports it')
      .toContain('refused.ids')
  })

  it('tells a chrome registration from a surface one, so the diff is about the entry', () => {
    // The control for the census itself (§6.5a applied to the instrument, not
    // to the registry). "Only registry rows moved" is satisfied by an
    // instrument that always moves the same rows whatever is registered. These
    // two registrations differ in exactly one field, and the rows that move
    // differ with it.
    const chromeMoved = movedLabels(census(PANELS), census(REGISTERED))
    const surfaceMoved = movedLabels(census(PANELS), census(SURFACE_REGISTERED))
    expect(chromeMoved, 'a chrome registration did not move the chrome rows').toContain('chrome.ids')
    expect(chromeMoved, 'a chrome registration moved the surface the author fuses').not.toContain(
      'surface.ids',
    )
    expect(surfaceMoved, 'a surface registration did not move the surface rows').toContain(
      'surface.ids',
    )
    expect(surfaceMoved, 'a surface registration was counted as chrome').not.toContain('chrome.ids')
  })

  it('iterates the table in the order PANEL_IDS declares, which is what lets it iterate a table at all', () => {
    // `chromePanels` used to walk `PANEL_IDS`; over a supplied table it walks
    // the table's own keys, and the docblock's claim that `PANEL_IDS` "is the
    // iteration order every consumer inherits" is only true if the two agree.
    // The existing pair-witness above asserts the two *sets* are equal; this
    // asserts the order, which is the half the substitution rests on.
    expect(Object.keys(PANELS), 'PANELS is declared in a different order from PANEL_IDS').toEqual([
      ...PANEL_IDS,
    ])
  })
})

describe('a registration whose key comes off the prototype chain', () => {
  // E8 / R-l, on the registration path rather than on the lookup path. The
  // suite above covers "an inherited name is not a panel"; these cover the
  // other direction, which only exists once a table can be supplied: a table
  // that really does own one of those keys must be read as owning it, and the
  // two spellings that silently do nothing must not be the ones used.

  /**
   * `PanelInfo<string>`, and that is not a style choice — it is the whole
   * reason {@link PanelInfo} took a parameter.
   *
   * C-4 measured, for `operations.ts`, that a property literally called
   * `constructor` gets **no contextual type** from `Record<string, …>`:
   * `Object.prototype.constructor` is in the index signature's apparent type
   * and shadows it, so a literal in the value widens and stops satisfying the
   * entry type — vitest green, `svelte-check` red. Re-derived here at
   * TypeScript 5.9.3, with two corrections worth carrying:
   *
   * - It is **not** about `constructor`. `toString`, `valueOf`,
   *   `hasOwnProperty` and the computed `['constructor']` form all widen
   *   identically; a key no prototype declares does not. Five of five.
   * - It fires **only on a field whose type is narrower than its widened
   *   literal** — a string-literal union. `Record<string, PanelInfo>` under a
   *   `constructor` key gives `Type 'string' is not assignable to type
   *   'PanelId'`; the same literal under `PanelInfo<string>`, whose `panel` is
   *   a plain `string`, is clean. Plain `string` and `boolean` fields never
   *   trip it, which is why the probes that only varied the key found nothing.
   *
   * So this fixture does not need C-4's separate-annotation workaround — it
   * needs the type parameter, which it has for an unrelated reason. Both
   * spellings were planted and `npm run typecheck` run on each.
   */
  const INHERITED_ENTRY: PanelInfo<string> = { ...DUMMY, panel: 'constructor' }

  it('resolves a panel actually registered under an inherited name', () => {
    // `Object.hasOwn` is what makes this answerable at all: `in` cannot tell a
    // registered `constructor` from the one every object has, and a bare index
    // cannot tell either of them from `undefined`.
    const table: PanelTable = { ...PANELS, constructor: INHERITED_ENTRY }
    expect(panelInfo('constructor', table)?.label, 'an own `constructor` key was read as inherited')
      .toBe(DUMMY.label)
    expect(chromePanels(table), 'an own `constructor` key is invisible to the derivation')
      .toContain('constructor')
  })

  it('still refuses the inherited one when nobody registered it', () => {
    // The null half, over a *supplied* table rather than over `PANELS`: the
    // widening must not have introduced a reader that trusts its argument's
    // prototype.
    const table: PanelTable = { ...PANELS }
    for (const name of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']) {
      expect(panelInfo(name, table), name).toBeUndefined()
      expect(chromePanels(table), name).not.toContain(name)
    }
  })

  it('registers __proto__ as a property rather than as a prototype', () => {
    // C-8's measurement, and the reason this is written with a computed key:
    // the literal `__proto__:` form *sets the prototype* instead of creating a
    // property, so the naive fixture is an empty table and the test passes for
    // the wrong reason. Both spellings are built here and compared, so the
    // trap is asserted rather than avoided.
    const computed: PanelTable = { ...PANELS, ['__proto__']: { ...DUMMY, panel: '__proto__' } }
    expect(Object.hasOwn(computed, '__proto__'), 'the computed key did not create a property')
      .toBe(true)
    expect(panelInfo('__proto__', computed)?.panel).toBe('__proto__')
    expect(unregisteredPanels(
      { id: 'p', label: 'P', slots: { left: ['__proto__'], centre: [], right: [], bottom: [] } },
      computed,
    )).toEqual([])
  })
})
