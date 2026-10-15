/**
 * The runtime witness for `site/layout.ts`'s four `AssertNever` pairs, and the
 * registry's own unit tests.
 *
 * ## Why a runtime witness at all
 *
 * The pairs in `layout.ts` are enforced by `npm run typecheck` alone — vitest
 * does not type-check — so without something here the whole guard is invisible
 * to `npm test` and therefore to the gate's test leg. `anim/track.ts:204-208`
 * records this for `SUMMED_CHANNELS` and `src/core/layerkeys.test.ts` is the
 * nearer precedent; this file is the same pairing for the layout registry.
 *
 * ## The vacuity floor is a containment, not a number
 *
 * Every claim below of the form "every slot …" or "every mounted panel …" is
 * universally quantified and therefore vacuously true over an empty registry,
 * which is the defect `src/svelte-free.test.ts:194-235` had to fix after a
 * literal floor of 160 specifiers was overtaken by its own sibling commits.
 * The floors here are the shape that file settled on: **two populations
 * measured on the same run, one of which structurally contains the other.**
 * `mountedPanels(DEFAULT_LAYOUT)` must strictly contain the panels of the
 * centre slot alone, which cannot be satisfied by a sweep that collapsed to
 * zero, that lost its root, or that only ever looked at one slot.
 *
 * No count in this file was typed from a measurement.
 */
import { describe, expect, it } from 'vitest'
import {
  CENTRE_SLOT,
  DEFAULT_LAYOUT,
  REFUSED_PLACEMENTS,
  SLOTS,
  SLOT_FLOWS,
  SLOT_INFO,
  duplicatePanelIds,
  mountedPanels,
  panelsIn,
  refusedPlacement,
  slotInfo,
} from './layout.js'
import type { DefaultPanelId, LayoutConfig, SlotId } from './layout.js'

/**
 * A second layout, which is the whole point of design §11's architecture test:
 * *"simple mode later (R2) must be a different `LayoutConfig` plus a visibility
 * set, not a second app."*
 *
 * It lives here rather than in `layout.ts` because simple mode is criterion 11
 * and belongs to P3b; what P3a owes is a *shape* a second instance can be
 * built in, and the only honest proof of that is building one. It is
 * deliberately different along all three axes a real second layout would move:
 * a different panel-id vocabulary (narrower, which is what the generic
 * parameter is for), a slot left **empty**, and a different centre.
 *
 * The empty `bottom` is load-bearing: "every slot mounts something" is a
 * property of `DEFAULT_LAYOUT`, not of the type, and if the type forbade an
 * empty slot then simple mode — which has no timeline — would need a second
 * type rather than a second value.
 */
const SIMPLE_LAYOUT: LayoutConfig<'layers' | 'canvas' | 'inspector'> = {
  id: 'simple',
  label: 'Simple',
  slots: {
    left: ['layers'],
    centre: ['canvas'],
    right: ['inspector'],
    bottom: [],
  },
}

/** Members of `a` that are also in `b`. Used in both directions, so it is one function. */
function overlap(a: readonly string[], b: readonly string[]): string[] {
  return a.filter(x => b.includes(x)).sort()
}

describe('SLOTS', () => {
  it('is the runtime witness for the compile-time slot pair', () => {
    // `layout.ts`'s `_NoSlotMissing`/`_NoSlotExtra` tie the `SlotId` union to
    // this tuple, and nothing in `npm test` can read a type. What it can read
    // is the two things the compiler forced to track it: the tuple itself, and
    // the keys of the two records annotated `Record<SlotId, …>`. A slot
    // deleted from the tuple and from the union together is a clean typecheck
    // and is caught here, because `SLOT_INFO` and the default layout would
    // then be short a key only if they moved too.
    const declared = [...SLOTS].sort()
    expect(Object.keys(SLOT_INFO).sort(), 'SLOT_INFO is keyed by SlotId').toEqual(declared)
    expect(
      Object.keys(DEFAULT_LAYOUT.slots).sort(),
      'the default layout is keyed by SlotId',
    ).toEqual(declared)
  })

  it('names each slot exactly once', () => {
    // `readonly SlotId[]` admits a member written twice and `Exclude` is
    // set-valued, so neither the annotation nor the `AssertNever` pair can see
    // a duplicate — the same hole `LAYER_KEYS` had until `22572ea` and
    // `SCENE_KEYS` until `05aeb26`. This is the third instance of that shape in
    // this phase. Here the symptom is a slot rendered twice, which in a layout
    // means the same panels mounted twice and the second copy getting the
    // events.
    const repeated = SLOTS.filter((s, i, all) => all.indexOf(s) !== i)
    expect(repeated, 'a slot listed twice is a slot rendered twice').toEqual([])
  })

  it('gives every slot an entry that knows its own key, its flow and a reason', () => {
    // The floor for this loop is the pair-witness above: `SLOT_INFO`'s keys are
    // `SLOTS`, so an empty `SLOTS` is already red there rather than silently
    // passing here.
    for (const slot of SLOTS) {
      const info = SLOT_INFO[slot]
      expect(info.slot, `${slot} does not carry its own key`).toBe(slot)
      expect(SLOT_FLOWS, `${slot} has a flow outside SLOT_FLOWS`).toContain(info.flow)
      expect(info.description.length, `${slot} has no recorded reason`).toBeGreaterThan(0)
    }
  })
})

describe('the default layout', () => {
  it('mounts at least one panel in every slot', () => {
    // Design §5.1 assigns all four: left = layers, centre = canvas + depth
    // strip, right = inspector, bottom = timeline. An empty slot is lawful in
    // the type (see SIMPLE_LAYOUT) and is a defect in *this* value.
    for (const slot of SLOTS) {
      expect(panelsIn(DEFAULT_LAYOUT, slot), `${slot} mounts nothing`).not.toEqual([])
    }
  })

  it('mounts each panel in exactly one slot', () => {
    // Criterion 6's shape, one registry early: "resolves to exactly one
    // mounted panel" is false the moment an id appears in two slots, and
    // `Record<SlotId, readonly P[]>` cannot see it. The symptom is two live
    // copies of one panel, of which only one is wired.
    expect(
      duplicatePanelIds(DEFAULT_LAYOUT),
      'a panel mounted in two slots is two live copies, of which one gets the events',
    ).toEqual([])
  })

  it('looked at more than one slot, so the two claims above are not vacuous', () => {
    // The derived floor. Both sides are measured on this run from the registry
    // itself; neither is a number anyone typed, which is the defect §9 names
    // ("a numeric floor chosen from today's count is not a check") and which
    // `src/svelte-free.test.ts` was reworked to avoid after a literal was
    // overtaken inside its own cluster.
    //
    // The containment is structural: `mountedPanels` walks every slot, and the
    // centre is one of them, so the whole sweep must contain the centre's own
    // panels for any layout whatever. Strictly longer is what rules out the
    // three ways the sweep could be wrong and still look clean:
    //
    // - **collapsed to nothing** — `0 > 0` fails, and so does `0 > 2`.
    // - **reading one slot only** — the two populations coincide, so the strict
    //   inequality fails. A pair of raw counts handles this worst; two sets
    //   handle it best.
    // - **the centre reduced to a bare canvas** — design §5.3 puts the depth
    //   strip in the centre with it, so a centre of one panel takes the mounted
    //   total down to the slot count and this goes red. That is the regression
    //   worth catching: the depth strip is the half of the centre that has
    //   nowhere else to go, because §5.1 forbids anything above the canvas.
    const all = mountedPanels(DEFAULT_LAYOUT)
    const centre = panelsIn(DEFAULT_LAYOUT, CENTRE_SLOT)
    expect(
      all,
      'the sweep over every slot does not contain the centre slot alone, so it lost its root',
    ).toEqual(expect.arrayContaining([...centre]))
    expect(
      all.length,
      'every slot together mounts no more than the centre does alone, so either the sweep ' +
      'reads one slot or the centre has lost the depth strip (§5.3)',
    ).toBeGreaterThan(centre.length)
    expect(
      all.length,
      'the layout mounts no more panels than it has slots, so no slot holds a pair and the ' +
      'centre is a bare canvas',
    ).toBeGreaterThan(SLOTS.length)
  })
})

describe('every lookup refuses the prototype chain', () => {
  // E8 / R-l. `Object.hasOwn` and not a bare index: `SLOT_INFO['constructor']`
  // on a plain object literal is the `Object` function, which is not
  // `undefined`, so an unguarded reader hands back a `SlotInfo` whose every
  // field is `undefined` and whose `.description` interpolates into prose. P0b
  // closed this in five registries; `site/chromedom.ts:189` is still a live
  // sixth, which is not this task's file to touch.
  const INHERITED = ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']

  it('answers undefined for an inherited member, on every table', () => {
    for (const name of INHERITED) {
      expect(slotInfo(name), name).toBeUndefined()
      expect(refusedPlacement(name), name).toBeUndefined()
      expect(panelsIn(DEFAULT_LAYOUT, name), name).toEqual([])
    }
  })

  it('is a guard and not a function that answers undefined to everything', () => {
    // §6.5a: the nulls above are evidence only because the same three readers,
    // asked for something real, answer. Without this the whole describe is
    // satisfied by `return undefined`.
    for (const slot of SLOTS) {
      expect(slotInfo(slot), slot).toBeDefined()
      expect(panelsIn(DEFAULT_LAYOUT, slot), slot).not.toEqual([])
    }
    for (const placement of Object.keys(REFUSED_PLACEMENTS)) {
      expect(refusedPlacement(placement), placement).toBeDefined()
    }
  })
})

describe('a second LayoutConfig', () => {
  it('is the same type, and every reader works over it unchanged', () => {
    // Criterion 11's groundwork, not criterion 11. What is being proved is
    // narrow and is the thing a second app would disprove: the default layout
    // holds no privileged position in this module — it is one value, and the
    // four readers are closed over `LayoutConfig<P>` rather than over it.
    expect(Object.keys(SIMPLE_LAYOUT.slots).sort()).toEqual([...SLOTS].sort())
    expect(duplicatePanelIds(SIMPLE_LAYOUT)).toEqual([])
    expect(panelsIn(SIMPLE_LAYOUT, CENTRE_SLOT)).toEqual(['canvas'])
    expect(panelsIn(SIMPLE_LAYOUT, 'constructor')).toEqual([])
  })

  it('may leave a slot empty, which is why the type does not require one', () => {
    // Simple mode has no timeline. If "every slot mounts something" were a
    // property of the *type*, this layout could not be written and R2 would
    // need a second type — which is one step from the second app §11 forbids.
    expect(panelsIn(SIMPLE_LAYOUT, 'bottom')).toEqual([])
    expect(mountedPanels(SIMPLE_LAYOUT).length).toBeLessThan(
      mountedPanels(DEFAULT_LAYOUT).length,
    )
  })

  it('draws from the same panel vocabulary, narrowed', () => {
    // The generic parameter is what makes this checkable: `SIMPLE_LAYOUT` is a
    // `LayoutConfig<'layers'|'canvas'|'inspector'>`, so naming a panel outside
    // that set is a compile error in *this file* rather than a runtime
    // surprise. A visibility set (§11) is the other half and is P3b's.
    const simple = new Set<string>(mountedPanels(SIMPLE_LAYOUT))
    const full = new Set<string>(mountedPanels(DEFAULT_LAYOUT))
    expect([...simple].filter(p => !full.has(p)), 'simple mode invented a panel').toEqual([])
    expect(simple.size, 'simple mode is not narrower than the default').toBeLessThan(full.size)
  })
})

describe('the placements design §5.1 refused', () => {
  it('records a reason for each, because the absence is the decision', () => {
    // §9: "a recorded note is not a sensor". These two refusals are the whole
    // content of §5.1's second paragraph, and a comment would be deleted by
    // the first person who wanted a toolbar. As an exported table with a test
    // over it, re-adding the placement means deleting an assertion.
    const named = Object.keys(REFUSED_PLACEMENTS)
    expect(named.length, 'nothing is refused, so this table is decorative').toBeGreaterThan(0)
    for (const key of named) {
      const refusal = refusedPlacement(key)
      expect(refusal?.placement, key).toBe(key)
      expect(refusal?.reason.length ?? 0, `${key} is refused with no reason`).toBeGreaterThan(0)
    }
  })

  it('refuses nothing it also offers', () => {
    expect(
      overlap(SLOTS, Object.keys(REFUSED_PLACEMENTS)),
      'a placement is both a slot and refused, so one of the two is stale',
    ).toEqual([])
  })

  it('is a disjointness check that can see an overlap', () => {
    // The control for the null above (§6.5a). `overlap` is the same function.
    expect(overlap(SLOTS, ['left', 'top'])).toEqual(['left'])
  })

  it('has no flow that puts a slot above the centre canvas', () => {
    // Design §5.1, and it is measured rather than stylistic: "the §8.3
    // sub-pixel constraint applies here too … anything added above it in flow
    // moves its device-pixel origin. View switcher and shading controls are
    // absolutely positioned or placed below." That becomes criterion 16 in
    // P3b; this is not the enforcement of it, it is the declaration it will be
    // enforced against.
    //
    // The literal is deliberate and is the one place in this file where naming
    // a string is the point: `'before'` is the *refused spelling*, exactly as
    // `REJECTED_FIT_MODES` is keyed by `'cover'`. The day somebody adds it to
    // the union this goes red and has to be argued with.
    expect(SLOT_FLOWS, 'a slot that precedes the canvas in flow moves its origin').not.toContain(
      'before',
    )
    for (const slot of SLOTS) {
      expect(SLOT_FLOWS, slot).toContain(SLOT_INFO[slot].flow)
    }
  })
})

/**
 * ## Criterion 3 — the registration test. Plan §7 P3.3 and design §11 row 1.
 *
 * Plan §7 P3.3: *"One registration test per registry — a dummy entry appears
 * without touching another file."* Design §11 row 1 names the registry and its
 * budget — *"Panel placement | `LayoutConfig` naming slots → panel ids | a
 * declaration"* — and §11 says why it has to be a test rather than a claim:
 * *"without that, 'moving a panel costs a declaration' is unverified until the
 * first time it is false."*
 *
 * ### The unit of registration here is a PLACEMENT, not a slot
 *
 * §11 row 1 budgets **panel placement**, and the mechanism it names is
 * `LayoutConfig` — so the dummy entry is a panel id mounted into a slot of a
 * layout, and the readers that must show it are the three that take the layout:
 * {@link panelsIn}, {@link mountedPanels}, {@link duplicatePanelIds}.
 * {@link slotInfo} is not this registry's reader at all — it reads
 * {@link SLOT_INFO}, which is the *slot* roster, total over a closed union, and
 * adding to it is a compile error rather than a registration. The two are
 * different registries in one module and only the first is criterion 3's.
 *
 * ### The negative is the deliverable, so it is measured and not asserted
 *
 * "Without touching another file" is a claim that nothing *else* had to move,
 * and a test that only checks the dummy appeared has not looked at the "else".
 * {@link census} is the instrument: every question this module can be asked,
 * as sorted `[label, value]` rows — the layout-dependent readers and the
 * module-level declarations side by side. A registration is then a *diff*, and
 * the budget is the number of labels it moves.
 *
 * §6.5a: a null is evidence only if the same instrument can be turned non-null,
 * and **both halves have to be named** — the reddened test and the moved
 * measurement. Both are here and both are asserted, which is the point: this
 * repo carries ~126 `report()` / `[measured]` lines that print and assert
 * nothing, and a census that only printed would be one more of them. The two
 * controls are `can see a registration that costs more than one label` (the
 * moved-measurement half, which moves four labels where the null moves two) and
 * `a placement in an undeclared slot does not appear` (the reddened-test half,
 * which shows "appears" discriminates).
 *
 * **And the suite-wide corpus is not a third half — measured, not assumed.**
 * Breaking `mountedPanels` to read the centre slot alone reddens 11 tests
 * across three files and leaves all 126 of the suite's `[measured]` lines
 * **byte-identical** (`LC_ALL=C sort`, labels included). So nothing printed by
 * the suite witnesses this module, and any future claim here of the form
 * "nothing in the suite sees X" has to be carried by reddened tests, not by
 * reading the measured output. The three files that plant reaches are this one,
 * `panels.test.ts` and `controlspec.test.ts` — `panels.ts` and `controlspec.ts`
 * are the only importers of this module, which is the fan-out "without touching
 * another file" is a claim about.
 */
describe('registering a dummy placement', () => {
  /**
   * The dummy. A panel id nothing declares, which is the whole point: `PANELS`
   * may be a superset of what a layout mounts (see `layout.ts`'s header), so a
   * layout is written over whatever vocabulary its author has and this file is
   * its author.
   */
  const DUMMY = 'dummy-panel'
  type DummyId = DefaultPanelId | typeof DUMMY

  /**
   * The default layout widened to admit the dummy — one annotation, and it is
   * the only thing the registration costs outside the `slots` member itself.
   * Nothing is copied: this is `DEFAULT_LAYOUT`, so a drift in the real value
   * reaches every assertion below.
   */
  const BASE: LayoutConfig<DummyId> = DEFAULT_LAYOUT

  /**
   * One registration: the dummy mounted into one slot.
   *
   * Written as a function rather than a literal so the runtime half below can
   * drive it over **every** declared slot instead of sampling one. The
   * `Record<SlotId, …>` copy-then-assign is safe here for the reason the panel
   * side is not — `SlotId` is a closed union, so no key can be `'__proto__'`,
   * whereas `P extends string` is open, which is why `duplicatePanelIds` needs
   * a `Set` and not a `{}` accumulator.
   */
  function register<P extends string>(
    layout: LayoutConfig<P>,
    slot: SlotId,
    panel: P,
  ): LayoutConfig<P> {
    const slots: Record<SlotId, readonly P[]> = { ...layout.slots }
    slots[slot] = [...layout.slots[slot], panel]
    return { ...layout, slots }
  }

  /**
   * Every question this module answers, as sorted labelled rows.
   *
   * Values are digests rather than the objects themselves: a `SlotInfo` row
   * carries `flow|resize|description.length` and not the prose. That keeps this
   * a structural comparison (§2.4) — nothing here is pinned against a number
   * anyone typed, only against the *same* census taken on the same run — and it
   * keeps a failure diff readable.
   */
  function census(layout: LayoutConfig<string>): readonly (readonly [string, string])[] {
    const rows: (readonly [string, string])[] = []
    for (const slot of SLOTS) {
      rows.push([`layout.slots.${slot}`, JSON.stringify([...panelsIn(layout, slot)])])
      const info = slotInfo(slot)
      rows.push([
        `SLOT_INFO.${slot}`,
        `${info?.flow}|${info?.resize}|${info?.description.length}`,
      ])
    }
    rows.push(['layout.mounted', JSON.stringify([...mountedPanels(layout)])])
    rows.push(['layout.duplicates', JSON.stringify([...duplicatePanelIds(layout)])])
    rows.push(['SLOTS', JSON.stringify([...SLOTS])])
    rows.push(['SLOT_FLOWS', JSON.stringify([...SLOT_FLOWS])])
    rows.push(['CENTRE_SLOT', CENTRE_SLOT])
    for (const placement of Object.keys(REFUSED_PLACEMENTS).sort()) {
      const refusal = refusedPlacement(placement)
      rows.push([
        `REFUSED_PLACEMENTS.${placement}`,
        `${refusal?.placement}|${refusal?.reason.length}`,
      ])
    }
    return rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  }

  /**
   * The labels whose value differs between two censuses, sorted.
   *
   * Sorted **with** their labels, because §6.5a says raw order is unstable and
   * a positional diff of two sweeps is a comparison of the sweeps' iteration
   * order as much as of their contents.
   */
  function movedLabels(
    before: readonly (readonly [string, string])[],
    after: readonly (readonly [string, string])[],
  ): string[] {
    const was = new Map(before.map(([label, value]) => [label, value]))
    return after
      .filter(([label, value]) => was.get(label) !== value)
      .map(([label]) => label)
      .sort()
  }

  it('appears through every reader that takes a layout', () => {
    // The positive half. `panelsIn` is the direct read, `mountedPanels` is the
    // derived sweep that every consumer of "which panels are up" inherits, and
    // a registration that reached the first but not the second would be a panel
    // declared into a slot and dropped by the only list anything walks.
    const registered = register(BASE, 'right', DUMMY)
    expect(panelsIn(registered, 'right'), 'the slot does not mount it').toContain(DUMMY)
    expect(mountedPanels(registered), 'the derived sweep dropped it').toContain(DUMMY)
    expect(
      duplicatePanelIds(registered),
      'one registration is reported as a duplicate',
    ).toEqual([])
  })

  it('costs exactly the labels it mounts into, and moves nothing else', () => {
    // §11 row 1's budget, as a measurement rather than a claim. Two labels move:
    // the slot that was registered into, and the derived sweep that contains it.
    // Everything else this module can be asked — the slot roster, the flows, the
    // centre, the refusal table — is held still by the same instrument on the
    // same run, which is what "without touching another file" means when the
    // other files do not exist yet to be touched.
    const before = census(BASE)
    const after = census(register(BASE, 'right', DUMMY))
    expect(
      after.map(([label]) => label),
      'the census asked a different set of questions the second time, so a label that '
      + 'vanished would read as unchanged',
    ).toEqual(before.map(([label]) => label))
    expect(
      movedLabels(before, after),
      'a registration moved something other than the slot it was written into',
    ).toEqual(['layout.mounted', 'layout.slots.right'])
  })

  it('can see a registration that costs more than one slot — §6.5a, the moved half', () => {
    // The control for the null above, and it is the half that is easy to skip:
    // naming "re-run the mutation" reproduces a reddened test and not a moved
    // measurement. Here the measurement itself moves. The same census over a
    // dummy written into two slots moves four labels, not two, and one of them
    // is `layout.duplicates` — so the instrument is not blind to the extra cost,
    // and the two-label answer above is a reading rather than a floor.
    const before = census(BASE)
    const twice = register(register(BASE, 'right', DUMMY), 'left', DUMMY)
    const moved = movedLabels(before, census(twice))
    expect(moved, 'the census cannot see a second placement').toEqual([
      'layout.duplicates',
      'layout.mounted',
      'layout.slots.left',
      'layout.slots.right',
    ])
    expect(
      moved.length,
      'two placements move no more labels than one, so the census is not counting them',
    ).toBeGreaterThan(movedLabels(before, census(register(BASE, 'right', DUMMY))).length)
  })

  it('does not appear in a slot nobody declared — §6.5a, the reddened half', () => {
    // The control for "appears": without it, `toContain` would be satisfied by a
    // reader that answers yes to everything. A placement in an undeclared slot
    // is the mutation that must *not* land, and it is the honest boundary of
    // §11 row 1's budget — one declaration buys a placement into a slot that
    // exists; a new slot costs the `SlotId` union, the `SLOTS` tuple, a
    // `SLOT_INFO` entry and a key in every layout, which is four declarations
    // (all of them, still, in this one file).
    //
    // The cast is the control's entire content. The compiler already refuses
    // this placement — `slots` is `Record<SlotId, …>` — and that refusal is half
    // the guard; the cast exists only to ask whether the runtime half refuses it
    // too, which it must, because `mountedPanels` walks `SLOTS` and not the
    // object's own keys. `'top'` rather than an invented name because
    // `REFUSED_PLACEMENTS` already records the argument against it.
    const refusedSlot = 'top'
    expect(
      refusedPlacement(refusedSlot),
      'the slot this control uses is not one the module has refused',
    ).toBeDefined()
    const openSlots: Record<string, readonly string[]> = {
      ...BASE.slots,
      [refusedSlot]: [DUMMY],
    }
    const smuggled = { ...BASE, slots: openSlots } as unknown as LayoutConfig<string>
    expect(
      mountedPanels(smuggled),
      'a placement in an undeclared slot reached the sweep, so the slot roster is not the '
      + 'vocabulary a layout is written over',
    ).not.toContain(DUMMY)
    expect(
      movedLabels(census(BASE), census(smuggled)),
      'an undeclared slot moved a measurement, so the budget above is not the budget',
    ).toEqual([])
  })

  it('is live in every declared slot, not just the one the test picked', () => {
    // The runtime half (survey §F-6). The `Record<SlotId, readonly P[]>`
    // annotation is enforced by `npm run typecheck` alone, so nothing in
    // `npm test` can read it; what `npm test` can do is drive a registration
    // through every member of the tuple the compiler was tracking and watch the
    // same two labels move each time. That is "once added there it is live
    // everywhere" as propagation rather than as a sample of one.
    for (const slot of SLOTS) {
      const registered = register(BASE, slot, DUMMY)
      expect(panelsIn(registered, slot), slot).toContain(DUMMY)
      expect(mountedPanels(registered), slot).toContain(DUMMY)
      expect(movedLabels(census(BASE), census(registered)), slot).toEqual(
        ['layout.mounted', `layout.slots.${slot}`].sort(),
      )
    }
  })

  it('asked more questions than the registration moved, so the null is not vacuous', () => {
    // The vacuity floor, derived — nothing here is a number anyone typed, which
    // is §9's trap row ("a numeric floor chosen from today's count is a check")
    // and the defect that overtook a literal floor of 160 inside its own cluster
    // on this branch. Two populations measured on the same run, one structurally
    // containing the other, which is the shape this file already settled on.
    //
    // Three ways the null above could be satisfied while meaning nothing, and
    // the floor rules out each:
    //
    // - **a census of nothing** — then no label moves and `[]` equals `[]`.
    // - **a census of only the slot that moved** — then "moves nothing else" is
    //   a statement about an empty else.
    // - **a census that never left the layout** — then the module-level
    //   declarations, which are the thing "without touching another file" is
    //   about, were never asked.
    const before = census(BASE)
    const labels = before.map(([label]) => label)
    const moved = movedLabels(before, census(register(BASE, 'right', DUMMY)))
    const held = labels.filter(label => !moved.includes(label))

    expect(
      held,
      'the census has no label it held still, so "nothing else moved" is about nothing',
    ).toEqual(expect.arrayContaining(SLOTS.filter(s => s !== 'right').map(s => `layout.slots.${s}`)))
    expect(
      held.length,
      'the census holds no more still than the slot table alone, so it never asked the '
      + 'module-level declarations a registration is claimed not to touch',
    ).toBeGreaterThan(SLOTS.length)
    expect(
      labels.length,
      'the census asked no more than it held still, so nothing moved and the instrument is dead',
    ).toBeGreaterThan(held.length)
  })
})

describe('a registered placement and the prototype chain', () => {
  // E8 / R-l, in the direction a registration test is the one that can reach:
  // the existing `every lookup refuses the prototype chain` block covers slot
  // *keys*, which is the lookup side. A panel **id** is the other side, and it
  // is open — `LayoutConfig<P extends string>` — so an author may register one
  // of these names and the registry must carry it as data rather than resolve
  // it as an inherited member.
  const INHERITED_IDS = ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']

  const PROTO_LAYOUT: LayoutConfig<string> = {
    ...DEFAULT_LAYOUT,
    slots: { ...DEFAULT_LAYOUT.slots, right: INHERITED_IDS },
  }

  it('carries an inherited name as a panel id, in order and without loss', () => {
    expect(panelsIn(PROTO_LAYOUT, 'right')).toEqual(INHERITED_IDS)
    expect(mountedPanels(PROTO_LAYOUT)).toEqual(expect.arrayContaining(INHERITED_IDS))
  })

  it('keeps the id space and the slot space apart', () => {
    // Registering a panel called `'constructor'` must not make `'constructor'`
    // answer as a *slot*. The two namespaces meet nowhere, and the way they
    // would meet is a reader that indexed `slots` with an id.
    for (const name of INHERITED_IDS) {
      expect(panelsIn(PROTO_LAYOUT, name), name).toEqual([])
      expect(slotInfo(name), name).toBeUndefined()
    }
  })

  it('sees `__proto__` registered twice as a duplicate', () => {
    // The live hazard, and the reason `duplicatePanelIds` is a `Set` and not a
    // `{}` accumulator. `seen['__proto__'] = true` on a plain object **silently
    // loses the entry and corrupts the prototype** — there is no wrong value to
    // notice, only an absence — so the natural refactor would report no
    // duplicate for the one id whose duplication is hardest to see by eye.
    const twice: LayoutConfig<string> = {
      ...DEFAULT_LAYOUT,
      slots: { ...DEFAULT_LAYOUT.slots, left: ['__proto__'], right: ['__proto__'] },
    }
    expect(duplicatePanelIds(twice)).toEqual(['__proto__'])
  })

  it('is why a fixture keyed by one of these names must use a computed key', () => {
    // C-8's measurement, re-derived here rather than cited, because every
    // registration test in this cluster writes a fixture of this shape and the
    // naive form passes for the wrong reason: a literal `__proto__:` key **sets
    // the prototype** and creates no property, so the fixture is empty and the
    // test is green over nothing. This assertion is the thing that goes red the
    // day somebody "tidies" a computed key back to a literal one.
    expect(Object.hasOwn({ __proto__: { mounted: true } }, '__proto__')).toBe(false)
    expect(Object.hasOwn({ ['__proto__']: { mounted: true } }, '__proto__')).toBe(true)
  })
})
