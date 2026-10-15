/**
 * Where the editor's panels go: slots, and which panel ids each slot mounts.
 *
 * Design §11 row 1 budgets panel placement at **"a declaration"** to move, and
 * that is only true if the placement *is* a declaration — one value, in one
 * module, that nothing else has to be edited alongside. §11 also says why
 * every registry here gets a test: *"without that, 'moving a panel costs a
 * declaration' is unverified until the first time it is false."*
 *
 * ## The four slots, and the rationale for each
 *
 * Design §5.1, verbatim: *"Two fixed, width-draggable sidebars and a bottom
 * dock. No floating panels: nobody in this class ships free docking, and
 * Photopea — also one developer — gets most of the feel from fold/unfold
 * columns with a grab bar. Left = layers · Centre = canvas + depth strip ·
 * Right = inspector · Bottom = timeline."*
 *
 * The per-slot reasons live on {@link SLOT_INFO}'s entries rather than here,
 * because a list of names with no recorded reason per name is how a list goes
 * stale silently — somebody moves one and nothing says what it cost.
 *
 * ## There is no top slot, and that is the §8.3 constraint, not an omission
 *
 * Design §5.1 again, and this one is measured rather than stylistic: *"The
 * §8.3 sub-pixel constraint applies here too, and revision 1 applied it only
 * to the player. The editor's own canvas is what the author fuses while
 * working, so anything added above it in flow moves its device-pixel origin.
 * View switcher and shading controls are absolutely positioned or placed
 * below."*
 *
 * So the absence of a top slot is load-bearing, and an absence is the one
 * thing a registry cannot record by listing. Two mechanisms carry it instead:
 * {@link SlotFlow} has no member meaning *before the canvas*, so a slot that
 * precedes it cannot be described; and {@link REFUSED_PLACEMENTS} names the
 * placement that will be asked for, with the reason, so re-adding it means
 * deleting an argument rather than merely typing a word.
 *
 * ## What is deliberately NOT in `LayoutConfig`
 *
 * **Visibility.** Design §11: *"`CONTROLS` is complete; visibility is layered
 * over it. Revision 1 said simple mode would use 'a filtered `CONTROLS` set',
 * which contradicts §9's completeness requirement. The registry stays complete
 * — that is R6 — and per-mode visibility sets select from it."* Its
 * architecture test is *"simple mode later (R2) must be a different
 * `LayoutConfig` **plus a visibility set**, not a second app"* — two things,
 * and folding the second into the first is how the registry stops being
 * complete.
 *
 * **Sidebar widths.** The sidebars are width-draggable, which makes a width a
 * value the author moves at run time, not a declaration. A default width is a
 * real decision and belongs with whatever owns the drag; putting it here would
 * mean a layout changes identity when someone grabs a divider.
 *
 * ## The seam with `PANELS`
 *
 * This module names panel **ids**; the `PANELS` registry declares the panels
 * themselves. {@link LayoutConfig} is generic in its panel-id type precisely so
 * the two can be tied without either owning the other: a layout is written over
 * whatever vocabulary its author has, and `PANELS` can be a **superset** of
 * what the default layout mounts, which is what keeps design §11 row 2's "one
 * registration" true. The tie worth adding in `PANELS`'s own module is the
 * one-directional pair `AssertNever<Exclude<DefaultPanelId, PanelId>>` — a
 * layout slot naming a panel nobody registered is then a compile error, which
 * design §9.2 calls the realistic regression ("spec written, assigned to a
 * panel no layout slots").
 */
import type { AssertNever } from '../src/core/index.js'

/**
 * The slots a panel can be placed in.
 *
 * Declared as a union **and** as {@link SLOTS}, with the `AssertNever` pair
 * below tying them together, for the reason `anim/track.ts:204-208` records
 * for `SUMMED_CHANNELS`: the compile-time guard is enforced by
 * `npm run typecheck` alone, so the tuple is what lets `npm test` witness it.
 * Neither declaration is derived from the other, or the pair would be a
 * tautology.
 */
export type SlotId = 'left' | 'centre' | 'right' | 'bottom'

/**
 * The slots, in the order a reader of the shell meets them.
 *
 * Left to right, then the dock underneath — the same order design §5.1 writes
 * them in. The order is not layout: CSS decides that. It is the iteration
 * order every consumer of this registry inherits, so it is worth being the one
 * a human would expect rather than alphabetical.
 */
export const SLOTS = ['left', 'centre', 'right', 'bottom'] as const

type _NoSlotMissing = AssertNever<Exclude<SlotId, typeof SLOTS[number]>>
type _NoSlotExtra = AssertNever<Exclude<typeof SLOTS[number], SlotId>>

/**
 * The slot holding the canvas the author fuses while working.
 *
 * Named once, because two different things need a referent for it and neither
 * should spell it: design §5.1's sub-pixel constraint is *about this slot*
 * ("anything added above **it** in flow"), and the vacuity floor in
 * `layout.test.ts` needs a sub-population it can prove the whole sweep
 * contains.
 */
export const CENTRE_SLOT: SlotId = 'centre'

/**
 * Where a slot sits relative to the centre canvas in the document's flow.
 *
 * Two members, and the missing third is the point. There is no `'before'`,
 * because design §5.1 rules out anything above the canvas in flow — it moves
 * the canvas's device-pixel origin, and §8.3's measurement is that a canvas
 * off the device-pixel grid resamples the noise field the whole stereogram is
 * encoded in. Adding a `'before'` member is therefore the cheapest possible
 * way to describe a layout that cannot be built, which is why the union is
 * where the constraint is recorded rather than in a comment.
 *
 * `'beside'` is a sibling in the same row — a sidebar does not displace the
 * canvas vertically, so the constraint has nothing to say about it.
 */
export type SlotFlow = 'beside' | 'after'

/** The runtime witness for {@link SlotFlow}. Same pairing as {@link SLOTS}. */
export const SLOT_FLOWS = ['beside', 'after'] as const

type _NoFlowMissing = AssertNever<Exclude<SlotFlow, typeof SLOT_FLOWS[number]>>
type _NoFlowExtra = AssertNever<Exclude<typeof SLOT_FLOWS[number], SlotFlow>>

/** What {@link SLOT_INFO} records about one slot. */
export interface SlotInfo {
  /** The slot's own name, so an entry carries its key when passed around alone. */
  readonly slot: SlotId
  /** Where it sits relative to the centre canvas in flow. See {@link SlotFlow}. */
  readonly flow: SlotFlow
  /**
   * Whether the author can drag this slot's size.
   *
   * `'width'` for the two sidebars, per design §5.1's "width-draggable". The
   * bottom dock's height is **not** stated there, so it is `'none'` until
   * somebody decides it rather than being inferred from the sidebars — a dock
   * that silently became resizable because a registry guessed would be a
   * decision nobody made.
   */
  readonly resize: 'width' | 'none'
  /** Why this slot exists and what it is for, in prose a reviewer can check against §5.1. */
  readonly description: string
}

/**
 * The slots, keyed by name, with the reason each one exists.
 *
 * A record rather than an array of entries for the reason `FIT_MODES` and
 * `SMOOTH_MODES` are records: design §11 budgets a registry at one
 * registration to move, and that is only true of an object literal keyed by
 * name. The `slot` field duplicates the key deliberately, as `FitModeInfo.mode`
 * does — a registry hands out values, and a value that does not know its own
 * name forces every caller to carry the pair.
 *
 * Exported rather than module-private so `layout.test.ts` can witness the
 * `AssertNever` pairs at run time; see this file's header.
 */
export const SLOT_INFO: Record<SlotId, SlotInfo> = {
  left: {
    slot: 'left',
    flow: 'beside',
    resize: 'width',
    description:
      'Layers. A fixed, width-draggable sidebar rather than a floating palette: design §5.1 ' +
      'records that nobody in this class ships free docking, and Photopea — also one ' +
      'developer — gets most of the feel from fold/unfold columns with a grab bar.',
  },
  centre: {
    slot: 'centre',
    flow: 'beside',
    resize: 'none',
    description:
      'The canvas and the depth strip (§5.3). Takes whatever the sidebars leave, and is not ' +
      'itself draggable, because it is the surface the author fuses: its size follows from ' +
      'the others rather than being a third thing to keep consistent with them.',
  },
  right: {
    slot: 'right',
    flow: 'beside',
    resize: 'width',
    description:
      'The inspector — the controls for whatever is selected. Opposite the layer list so the ' +
      'canvas sits between the thing being chosen and the thing being edited.',
  },
  bottom: {
    slot: 'bottom',
    flow: 'after',
    resize: 'none',
    description:
      'The timeline (§7.3). Below the canvas and not above it: design §5.1 applies §8.3 to ' +
      "the editor, and anything above the canvas in flow moves the canvas's device-pixel " +
      'origin. A full-width dock also matches what the timeline is — one axis shared by ' +
      'every layer, rather than a property of the selection.',
  },
}

/**
 * The panel ids {@link DEFAULT_LAYOUT} mounts.
 *
 * Exactly design §5.1's assignment, as a union, so that a slot naming
 * something else is a compile error here and `PANELS` can tie to it
 * one-directionally (see this file's header). The `AssertNever` pair below
 * keeps the union and the layout from drifting in either direction: an id
 * declared and never mounted is as much a defect as one mounted and never
 * declared, since the first is a panel the default layout silently drops.
 *
 * `depth-strip` is hyphenated and the others are not, which is not a style
 * slip: these are ids, and the strip's name in §5.3 is two words.
 */
export type DefaultPanelId = 'layers' | 'canvas' | 'depth-strip' | 'inspector' | 'timeline'

/**
 * One arrangement of panels into slots.
 *
 * **Generic in the panel-id type**, and that is the single most load-bearing
 * decision in this module. Design §11's architecture test is that simple mode
 * must be *"a different `LayoutConfig` plus a visibility set, not a second
 * app"*, so a second instance has to be cheap — and a second instance over a
 * *narrower* vocabulary has to be cheap too, because a simple mode that could
 * still name the timeline would have given up the compile-time half of what it
 * is for. `LayoutConfig<'layers'|'canvas'|'inspector'>` is a layout that
 * cannot mention a timeline.
 *
 * The default `P extends string = string` exists so a consumer that genuinely
 * does not care — a renderer walking slots — can write `LayoutConfig` without
 * a parameter and still be total over the slots.
 *
 * **A slot may mount zero panels, or several.** Several, because §5.1 puts the
 * canvas and the depth strip in the same slot. Zero, because simple mode has
 * no timeline, and if the type demanded a panel per slot then R2 would need a
 * second *type* rather than a second value — one step from the second app §11
 * forbids. "Every slot mounts something" is therefore a property asserted of
 * `DEFAULT_LAYOUT` in the tests, not of every layout.
 */
export interface LayoutConfig<P extends string = string> {
  /** Stable key — what a preference or a URL would store. Never shown. */
  readonly id: string
  /** Human-facing name, for whatever offers the choice. */
  readonly label: string
  /**
   * Which panels each slot mounts, in mount order.
   *
   * Total over {@link SlotId} by annotation, so adding a slot is a compile
   * error in every layout rather than a slot that silently renders nothing.
   * That is the "one declaration" §11 budgets, paid once per layout.
   */
  readonly slots: Readonly<Record<SlotId, readonly P[]>>
}

/**
 * The editor's default arrangement — design §5.1's, exactly.
 *
 * `as const satisfies` rather than a plain annotation, following
 * `src/core/types.ts:415`: the annotation alone would widen the arrays to
 * `readonly DefaultPanelId[]` and the pair below could then prove nothing,
 * because the type would no longer remember *which* ids are mounted.
 */
export const DEFAULT_LAYOUT = {
  id: 'full',
  label: 'Full',
  slots: {
    left: ['layers'],
    centre: ['canvas', 'depth-strip'],
    right: ['inspector'],
    bottom: ['timeline'],
  },
} as const satisfies LayoutConfig<DefaultPanelId>

/** The ids the default layout actually mounts, read back off the value. */
type MountedByDefault = typeof DEFAULT_LAYOUT.slots[SlotId][number]

type _NoPanelIdUnmounted = AssertNever<Exclude<DefaultPanelId, MountedByDefault>>
type _NoPanelIdUndeclared = AssertNever<Exclude<MountedByDefault, DefaultPanelId>>

/**
 * What this slot mounts in this layout, or nothing if there is no such slot.
 *
 * `slot` is a `string` and not a `SlotId` on purpose: the typed door is
 * `layout.slots[slot]`, which needs no function, so the only callers this is
 * for are the ones holding a slot name that came from somewhere unchecked — a
 * stored preference, a `data-` attribute, a URL. For them the honest answer to
 * an unrecognised slot is "nothing is mounted there", which is also true, and
 * it keeps the function total.
 *
 * **`Object.hasOwn`, not a bare index.** `layout.slots` is an object literal,
 * so a bare `layout.slots['constructor']` is the `Object` **function**, which
 * is not `undefined` and would be returned here typed as an array of panel
 * ids; the first consumer to `for…of` it gets nothing and the second to read
 * `.length` gets `1`. Same idiom and same fix as `fit.ts`'s `parseFit`,
 * `smooth.ts`'s `parseSmooth` and the five registries P0b closed — and
 * `site/chromedom.ts:189` is still a live instance of it, which is not this
 * module's to fix.
 */
export function panelsIn<P extends string>(
  layout: LayoutConfig<P>,
  slot: string,
): readonly P[] {
  if (!Object.hasOwn(layout.slots, slot)) return []
  return layout.slots[slot as SlotId] ?? []
}

/**
 * Every panel this layout mounts, in slot order then mount order.
 *
 * The derived view of the registry, so that "which panels are up" is read off
 * the layout rather than tracked beside it. Criterion 6 ("every `CONTROLS`
 * entry resolves to exactly one mounted panel under the default layout") is a
 * statement about this list, which is why it exists before anything consumes
 * it.
 */
export function mountedPanels<P extends string>(layout: LayoutConfig<P>): readonly P[] {
  return SLOTS.flatMap(slot => [...panelsIn(layout, slot)])
}

/**
 * The panel ids this layout mounts more than once, sorted and deduplicated.
 *
 * `readonly P[]` admits a member written twice, and `Exclude` is set-valued,
 * so neither the `Record` annotation nor any `AssertNever` pair in this file
 * can see a duplicate. The same hole `SCENE_KEYS` had at `05aeb26` and
 * `LAYER_KEYS` at `22572ea`, closed by hand here for the same reason — and the
 * shape is the same each time: the type is set-valued and the value is a list.
 *
 * The symptom is specific to a layout and worse than a duplicate key: a panel
 * mounted in two slots is two live instances of one panel, and only one of
 * them is wired to anything, so the author edits in the copy that does nothing.
 *
 * A function rather than an assertion so a second layout gets it too — simple
 * mode is exactly where a copy-pasted slot would land.
 */
export function duplicatePanelIds<P extends string>(layout: LayoutConfig<P>): readonly P[] {
  const seen = new Set<P>()
  const twice = new Set<P>()
  for (const panel of mountedPanels(layout)) {
    if (seen.has(panel)) twice.add(panel)
    seen.add(panel)
  }
  return [...twice].sort()
}

/**
 * What this slot is for, or `undefined` if it is not a slot.
 *
 * Guarded with `Object.hasOwn` for {@link panelsIn}'s reason, and that reason
 * is sharper here: an inherited answer is the `Object` function, so an
 * unguarded caller reading `.description` off it gets `undefined` and
 * interpolates the word into a tooltip.
 */
export function slotInfo(slot: string): SlotInfo | undefined {
  if (!Object.hasOwn(SLOT_INFO, slot)) return undefined
  return SLOT_INFO[slot as SlotId]
}

/** What {@link REFUSED_PLACEMENTS} records about a placement we will not offer. */
export interface RefusedPlacement {
  /** The placement someone might ask for. Mirrors the key, as {@link SlotInfo} does. */
  readonly placement: string
  /** Why it is not offered, in prose a human can be shown. */
  readonly reason: string
}

/**
 * Placements that are understood, will be asked for, and are deliberately not
 * offered.
 *
 * This exists because §9's last trap is *"a recorded note is not a sensor"*.
 * Both of these decisions are currently one sentence in design §5.1, and the
 * failure mode is not that somebody disagrees with them — it is that nobody
 * encounters them. A comment above `SLOTS` is deleted by whoever adds the
 * toolbar; a table with a test over it has to be argued with.
 *
 * Keyed by `string` rather than by {@link SlotId}, for `REJECTED_FIT_MODES`'s
 * reason: the whole point is to answer for names that are *not* slots.
 */
export const REFUSED_PLACEMENTS: Record<string, RefusedPlacement> = {
  top: {
    placement: 'top',
    reason:
      'A top slot puts chrome above the canvas in flow, and design §5.1 applies §8.3 to the ' +
      "editor for this: anything above the canvas moves its device-pixel origin, and a canvas " +
      'off the device-pixel grid resamples the noise field the stereogram is encoded in — the ' +
      'author would be fusing a picture the viewer never sees. §5.1 names the two things that ' +
      'wanted to go there, the view switcher and the shading controls, and places them ' +
      'absolutely or below instead.',
  },
  floating: {
    placement: 'floating',
    reason:
      'Free docking. Design §5.1: "No floating panels: nobody in this class ships free ' +
      'docking, and Photopea — also one developer — gets most of the feel from fold/unfold ' +
      'columns with a grab bar." R7\'s flexibility is served by §11\'s registries — moving a ' +
      'panel costs a declaration — rather than by letting the author drag it, which is a ' +
      'window manager with persistence, hit-testing and z-order for one developer to own.',
  },
}

/**
 * Why this placement is not offered, if it is one we have refused.
 *
 * Returns `undefined` for a slot that exists and for a name nobody has
 * considered — an unknown placement has no recorded reason to give, and
 * inventing one is a generic message any caller can write for itself. The
 * same split `fitNotice` makes, for the same reason.
 *
 * `Object.hasOwn` again, and this is the reading where the unguarded form was
 * *worst* in `fit.ts`: a bare index answers with `Object` for
 * `refusedPlacement('constructor')`, which is truthy, so the caller shows a
 * refusal notice whose placement and reason are both `undefined`. A wrong
 * answer is at least visible; well-formed prose that explains nothing is not.
 */
export function refusedPlacement(placement: string): RefusedPlacement | undefined {
  if (!Object.hasOwn(REFUSED_PLACEMENTS, placement)) return undefined
  return REFUSED_PLACEMENTS[placement]
}
