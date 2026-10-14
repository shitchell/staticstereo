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
import type { LayoutConfig } from './layout.js'

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
