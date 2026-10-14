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
import type { PanelLayout } from './panels.js'
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
    // see a duplicate. This is the fourth instance of that hole in this phase —
    // `SCENE_KEYS` at `05aeb26`, `LAYER_KEYS` at `22572ea`, `SLOTS` at
    // `4a75928`, and here — and the shape is the same every time: the type is
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
