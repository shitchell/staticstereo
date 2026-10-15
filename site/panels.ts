/**
 * Which panels the editor has: the registry, and what each one is for.
 *
 * Design §11 row 2 budgets *"which panels exist"* at **one registration**, and
 * that is only true if there is exactly one place to register one. §11 also
 * says why this registry gets a test rather than a comment: *"without that,
 * 'moving a panel costs a declaration' is unverified until the first time it
 * is false."*
 *
 * ## One registration, and what that rules out
 *
 * Adding a panel costs **one entry in {@link PANELS} plus its name in
 * {@link PANEL_IDS} and {@link PanelId}** — three spellings in this file, which
 * the two `AssertNever` pairs below force to agree, and nothing anywhere else.
 * In particular the tie to `layout.ts` is **one-directional**: a registered
 * panel that no layout mounts is lawful, because the alternative — requiring
 * every registered panel to appear in the default layout — would make adding a
 * panel cost a second declaration in a second file and §11 row 2 would be
 * false the day it shipped.
 *
 * The other direction *is* an error, and it is design §9.2's realistic
 * regression read backwards: a layout slot naming a panel nobody registered.
 * {@link PanelId} must therefore contain every id `DEFAULT_LAYOUT` mounts, and
 * `_EveryMountedPanelRegistered` below is that, at compile time.
 *
 * ## What a `PanelInfo` deliberately does NOT say
 *
 * **Where it goes.** §11's first two rows are two mechanisms: placement is
 * `LayoutConfig`'s, existence is this registry's. A `slot` field here would
 * make moving a panel cost an edit in both, which is exactly what both rows
 * exist to prevent, and it would make a second layout incoherent — the panel
 * would assert a placement the other layout contradicts.
 *
 * **Whether it is shown.** §11: *"`CONTROLS` is complete; visibility is
 * layered over it. Revision 1 said simple mode would use 'a filtered
 * `CONTROLS` set', which contradicts §9's completeness requirement. The
 * registry stays complete — that is R6 — and per-mode visibility sets select
 * from it."* The same argument applies one registry up. The moment a panel can
 * declare itself hidden in some mode, `PANELS` stops being the complete list
 * of panels that exist, and §11's architecture test — simple mode is *"a
 * different `LayoutConfig` plus a visibility set, not a second app"* — loses
 * the half that keeps it honest.
 *
 * {@link PanelInfo.chrome} is neither of those and the distinction is worth
 * stating, because it is the one somebody will get wrong. It records what a
 * panel *is* — chrome, or the surface being authored — not whether it is
 * currently on screen. Design §5.1's "one key hides all chrome" needs that
 * classification from somewhere, and the only alternative is a hand-written
 * list of panels to hide, which is the thing §9 names: *"a hand-written list
 * of the places that do X goes stale silently the day a second place does X."*
 *
 * ## There is no barrel, deliberately
 *
 * A barrel would be a second place every registry has to be registered, which
 * is precisely the cost §11 budgets at one. Consumers import `./panels.js` and
 * `./layout.js` directly. (It also keeps both modules inside
 * `site/query.test.ts`'s cone walk, which only sees `./<lowercase>.js`.)
 */
import type { AssertNever } from '../src/core/index.js'
import type { DefaultPanelId, LayoutConfig } from './layout.js'
import { mountedPanels } from './layout.js'

/**
 * Every panel the editor has.
 *
 * Declared as a union **and** as {@link PANEL_IDS}, with the `AssertNever` pair
 * below tying them together, for the reason `anim/track.ts:204-208` records for
 * `SUMMED_CHANNELS`: the compile-time guard is enforced by `npm run typecheck`
 * alone, so the tuple is what lets `npm test` witness it. Neither declaration
 * is derived from the other, or the pair would be a tautology.
 *
 * `depth-strip` is hyphenated and the others are not, matching
 * `layout.ts`'s `DefaultPanelId`: these are ids, and the strip's name in
 * design §5.3 is two words. Multi-word registry ids are kebab-case throughout
 * this cluster.
 */
export type PanelId = 'layers' | 'canvas' | 'depth-strip' | 'inspector' | 'timeline'

/**
 * The panels, in the order a reader of the shell meets them.
 *
 * Left, then the centre's pair in the order §5.3 stacks them, then right, then
 * the dock — the reading order of design §5.1's own sentence. The order is not
 * placement: `LayoutConfig` decides that, and this tuple deliberately cannot.
 * It is the iteration order every consumer of this registry inherits, so it is
 * worth being the one a human would expect rather than alphabetical.
 */
export const PANEL_IDS = ['layers', 'canvas', 'depth-strip', 'inspector', 'timeline'] as const

type _NoPanelMissing = AssertNever<Exclude<PanelId, typeof PANEL_IDS[number]>>
type _NoPanelExtra = AssertNever<Exclude<typeof PANEL_IDS[number], PanelId>>

/**
 * Every panel the default layout mounts is registered here.
 *
 * **One-directional, and that asymmetry is the design.** `Exclude` in this
 * direction says `DefaultPanelId ⊆ PanelId`, so a slot naming a panel nobody
 * registered is a compile error — design §9.2's *"spec written, assigned to a
 * panel no layout slots"*, read from the layout's side. The reverse inclusion
 * is **not** asserted, because a registry that may not exceed one layout is a
 * registry you cannot add to without editing that layout, and §11 row 2 budgets
 * one registration.
 *
 * The chain is worth stating once, because it crosses a module: `layout.ts`'s
 * own `_NoPanelIdUnmounted`/`_NoPanelIdUndeclared` pair already pins
 * {@link DefaultPanelId} *equal* to the ids `DEFAULT_LAYOUT` mounts, so tying
 * to the union here is the same as tying to the value, without this module
 * having to read a value's type.
 *
 * It covers exactly one layout, which is all a compiler can do for a type whose
 * panel vocabulary is a parameter. {@link PanelLayout} is the opt-in door for a
 * second one and {@link unregisteredPanels} is the total runtime answer; see
 * both.
 */
type _EveryMountedPanelRegistered = AssertNever<Exclude<DefaultPanelId, PanelId>>

/**
 * What {@link PANELS} records about one panel.
 *
 * Parameterised on the id's type, defaulting to {@link PanelId} so that every
 * existing reference means exactly what it meant before. The parameter exists
 * for {@link PanelTable}: the shipped registry's entries carry a `PanelId` and
 * must keep doing so — a typo'd `panel` field is a compile error and that is
 * worth more than anything below — while a second table, which by construction
 * holds an id this module has not declared, has no `PanelId` to carry.
 */
export interface PanelInfo<P extends string = PanelId> {
  /** The panel's own id, so an entry carries its key when passed around alone. */
  readonly panel: P
  /** Human-facing name — a panel header, or a row in whatever offers the choice. */
  readonly label: string
  /**
   * Whether design §5.1's "one key hides all chrome" hides this panel.
   *
   * `false` for the surface the author is actually fusing, `true` for
   * everything arranged around it. Not a visibility *state* — see this file's
   * header for why that would be the wrong thing to put in this registry — but
   * a fact about what the panel is, which is what the key needs in order to
   * stop being a hand-written list of panel names somewhere else.
   */
  readonly chrome: boolean
  /** Why this panel exists and what it is for, in prose a reviewer can check against §5. */
  readonly description: string
}

/**
 * The editor's panels, keyed by id, with the reason each one exists.
 *
 * A record rather than an array of entries for the reason `FIT_MODES`,
 * `SMOOTH_MODES` and `SLOT_INFO` are records: §11 budgets a registry at one
 * registration to move, and that is only true of an object literal keyed by
 * name. The `panel` field duplicates the key deliberately, as `FitModeInfo.mode`
 * does — a registry hands out values, and a value that does not know its own
 * name forces every caller to carry the pair.
 *
 * `as const satisfies` rather than a plain annotation, following
 * `src/core/types.ts:415`: `satisfies` still proves the record total over
 * {@link PanelId} in both directions, and `as const` leaves the type
 * remembering which members are present so a later consumer can narrow on one.
 */
export const PANELS = {
  layers: {
    panel: 'layers',
    label: 'Layers',
    chrome: true,
    description:
      'The layer list (§5.4): eye, lock, thumbnail, name, multi-select, double-click to ' +
      'rename. Sorted by depth by default rather than by authoring order, because ' +
      "`raster.ts` composites with `max` and `max` is commutative — the layer list is a set, " +
      'not a stack, so authoring order carries no render meaning to display.',
  },
  canvas: {
    panel: 'canvas',
    label: 'Canvas',
    chrome: false,
    description:
      'The surface the author fuses while working (§3.3: depth, overlay and stereogram ' +
      'canvases at three cadences). The one panel that is not chrome, because §5.1\'s "one ' +
      'key hides all chrome" exists to leave exactly this on screen.',
  },
  'depth-strip': {
    panel: 'depth-strip',
    label: 'Depth strip',
    chrome: true,
    description:
      'The horizontal elevation beneath the canvas (§5.3), far left to near right: a tick per ' +
      'layer, a bar for a heightmap\'s range, a swept range for an animated depth. A panel of ' +
      'its own and not part of the inspector, because it is the one depth read that is about ' +
      'every layer at once rather than about the selection.',
  },
  inspector: {
    panel: 'inspector',
    label: 'Inspector',
    chrome: true,
    description:
      'The controls for whatever is selected — where §9.3\'s generated widgets land. It is ' +
      'the floor that guarantees R6 ("every control is exposed"), not the intended primary ' +
      'surface: anything that deserves a spatial instrument gets one and loses its widget.',
  },
  timeline: {
    panel: 'timeline',
    label: 'Timeline',
    chrome: true,
    description:
      'One view with property rows (§7.3) and the transport over it (§7.4). Its track area is ' +
      'laid out so a value-graph mode can replace it in place (§7.6) — that is a toggle of ' +
      'this panel, which is why there is no second panel for it; see {@link REFUSED_PANELS}.',
  },
} as const satisfies Record<PanelId, PanelInfo>

/**
 * A table of panels, keyed by id.
 *
 * Keyed by `string` and not by {@link PanelId}, which is what every reader
 * below takes, and the reason is the one `keybindings.ts`' `KeyBindingTable`
 * records for the same shape: *"a registration test must be able to register
 * an entry without editing this file."* Design §11 row 2 budgets a panel at
 * **one registration**, and that budget is a claim about readers being total
 * over whatever is registered — a reader that can only ever read {@link PANELS}
 * can be shown to agree with today's five panels and nothing more.
 *
 * `OperationTable`, `ShadingTable` and `ViewTable` are the same door in the
 * same cluster. **There is no second table in production and this type is not
 * an invitation to write one**: §11's completeness rule — *"the registry stays
 * complete … and per-mode visibility sets select from it"* — says a reduced
 * editor is a different `LayoutConfig` plus a visibility set, never a second
 * `PANELS`. The *shipped* registry is still total over {@link PanelId} by the
 * `satisfies` above, which is the half that keeps that true.
 */
export type PanelTable<P extends string = string> = Readonly<Record<P, PanelInfo<P>>>

/**
 * What this panel is, or `undefined` if it is not a panel.
 *
 * `panel` is a `string` and not a {@link PanelId} on purpose: the typed door is
 * `PANELS[id]`, which needs no function, so the only callers this is for are
 * the ones holding a name that came from somewhere unchecked — a stored
 * preference, a `data-` attribute, a URL.
 *
 * **`Object.hasOwn`, not a bare index and not `in`.** `PANELS` is an object
 * literal, so `PANELS['constructor']` is the `Object` **function**, which is
 * not `undefined` and would be handed back typed as a `PanelInfo`; the caller
 * then reads `.label` off it, gets `undefined`, and interpolates the word into
 * a panel header. Same idiom and same fix as `fit.ts`'s `parseFit`,
 * `layout.ts`'s `slotInfo` and the five registries P0b closed (E8 / R-l).
 *
 * `table` defaults to {@link PANELS} and no caller in production passes one;
 * see {@link PanelTable} for why it is there. `Object.hasOwn` is read over the
 * *argument*, so a supplied table gets the same guarantee the shipped one does.
 */
export function panelInfo(panel: string, table: PanelTable = PANELS): PanelInfo<string> | undefined {
  if (!Object.hasOwn(table, panel)) return undefined
  return table[panel]
}

/**
 * The panels design §5.1's "one key hides all chrome" hides.
 *
 * Derived from the registry rather than written down beside it, because §9's
 * trap is that *"a hand-written list of the places that do X goes stale
 * silently the day a second place does X"* — and here the symptom is a panel
 * added next year that stays on screen in the one mode whose entire purpose is
 * that nothing is.
 *
 * A function and not a derived constant so that the key's own module (the
 * `KEYBINDINGS` registry) imports a reader rather than a snapshot; a constant
 * computed at module load is the same list, taken once, and this registry is
 * the kind of thing a later phase will want to filter.
 *
 * **The roster is the table's own keys and not {@link PANEL_IDS}**, which is
 * the one behavioural change the `table` parameter forces. For the default
 * argument the two are the same list in the same order — `PANELS` is an object
 * literal, so `Object.keys` is declaration order — and this module's test pins
 * that against `PANEL_IDS` **in order** rather than only as a set, because the
 * substitution is what rests on it. `Object.keys` is own-keys-only, so the
 * prototype chain is excluded here by construction rather than by a guard
 * somebody could drop.
 */
export function chromePanels(table: PanelTable = PANELS): readonly string[] {
  return Object.keys(table).filter(panel => table[panel]!.chrome)
}

/**
 * A layout that can only name panels this registry declares.
 *
 * **The hole this closes, stated plainly.** `LayoutConfig<P extends string>` is
 * generic in its panel vocabulary, which is what makes a second layout cheap
 * (§11's architecture test) — but `extends string` means a *second* layout can
 * be written over any vocabulary at all, and `_EveryMountedPanelRegistered`
 * above ties only `DEFAULT_LAYOUT`. So the compile-time guarantee that a slot
 * names a registered panel covers exactly one value, and the next layout
 * somebody writes gets nothing.
 *
 * `PanelLayout` is the door for that author: same type, same readers, bounded
 * vocabulary. `PanelLayout<'layers'|'canvas'|'inspector'>` is a layout that
 * cannot mention a timeline *and* cannot invent a panel. It is opt-in rather
 * than a change to `LayoutConfig` because `layout.ts` must not import this
 * module — the dependency runs one way, and reversing it to tighten a default
 * would make the two registries circular.
 *
 * It is not a complete answer, which is why {@link unregisteredPanels} exists:
 * a layout assembled at run time from a stored preference has no static
 * vocabulary to bound.
 */
export type PanelLayout<P extends PanelId = PanelId> = LayoutConfig<P>

/**
 * The panels this layout mounts that nobody registered, sorted and deduplicated.
 *
 * The runtime half of "a slot cannot name a panel that does not exist", and the
 * total one: it holds for every layout, including one built at run time, which
 * is the case neither `_EveryMountedPanelRegistered` nor {@link PanelLayout}
 * can reach. Design §9.2's point is exactly this — *"type-level exhaustiveness
 * proves a declaration exists, not that a user can reach it"*.
 *
 * `Object.hasOwn` rather than `in`, and here the prototype chain is the live
 * case rather than a formality: `'constructor' in PANELS` is `true`, so a
 * layout mounting `'constructor'` would pass this check with `in`, and the
 * shell would go on to build a panel out of the `Object` function.
 *
 * Returns ids rather than throwing, because the caller that has a layout from
 * an untrusted source is the one that needs to decide — drop the slot, warn, or
 * refuse to load — and a throw takes that choice away.
 *
 * `table` defaults to {@link PANELS}; see {@link PanelTable}. It is the reader
 * where the parameter earns the most, because it is the one that spans two
 * modules: it is how a registration here can be shown to change what a layout
 * from `layout.ts` reports, with `layout.ts` unedited.
 */
export function unregisteredPanels<P extends string>(
  layout: LayoutConfig<P>,
  table: PanelTable = PANELS,
): readonly string[] {
  const unknown = new Set<string>()
  for (const panel of mountedPanels(layout)) {
    if (!Object.hasOwn(table, panel)) unknown.add(panel)
  }
  return [...unknown].sort()
}

/** What {@link REFUSED_PANELS} records about a panel we will not register. */
export interface RefusedPanel {
  /** The panel someone might ask for. Mirrors the key, as {@link PanelInfo} does. */
  readonly panel: string
  /** Why it is not offered, in prose a human can be shown. */
  readonly reason: string
}

/**
 * Panels that are understood, will be asked for, and are deliberately not
 * registered.
 *
 * A registry records decisions by listing, and an absence is the one thing a
 * list cannot record. §9's last trap is *"a recorded note is not a sensor"*:
 * both of these decisions are currently one sentence in the design, and the
 * failure mode is not that somebody disagrees with them — it is that nobody
 * encounters them. A comment above {@link PANELS} is deleted by whoever adds
 * the panel; a table with a test over it has to be argued with. Same mechanism
 * and same reason as `layout.ts`'s `REFUSED_PLACEMENTS` and `fit.ts`'s
 * `REJECTED_FIT_MODES`.
 *
 * Keyed by `string` rather than by {@link PanelId}, for `REJECTED_FIT_MODES`'s
 * reason: the whole point is to answer for names that are *not* panels.
 */
export const REFUSED_PANELS: Record<string, RefusedPanel> = {
  'graph-editor': {
    panel: 'graph-editor',
    reason:
      'Design §7.6, on the research\'s own phrasing: AE\'s graph editor is "a toggle of the ' +
      'same real estate, not a separate panel", and Spine shipped without curves until v4. ' +
      "The timeline's track area is laid out so a value-graph mode can replace it in place " +
      'later — "not built; the space is reserved so it is a toggle and not a layout change". ' +
      'Registering it as a panel is precisely the layout change that reservation exists to ' +
      'avoid, and it would also need a slot, which means taking space from the canvas or ' +
      'from the dock the timeline is already in. §7.6 also records what has to land with it ' +
      "when it does: Blender's Normalize / Stacked view, because our five properties are " +
      'depth 0..1, x/y in px and rotate in degrees and are not co-plottable.',
  },
  'simple-inspector': {
    panel: 'simple-inspector',
    reason:
      'A cut-down second inspector for simple mode (R2). Design §11 rules this out twice over: ' +
      'its architecture test is that "simple mode later (R2) must be a different ' +
      '`LayoutConfig` plus a visibility set, not a second app", and its completeness rule is ' +
      'that "the registry stays complete — that is R6 — and per-mode visibility sets select ' +
      'from it". A mode-specific duplicate of a panel is both halves going wrong at once: two ' +
      'inspectors are two places a new control has to be exposed, so R6 is violated the first ' +
      'time somebody adds one to the full inspector only — which is the exact failure R3 ' +
      'complains about in the current editor.',
  },
}

/**
 * Why this panel is not registered, if it is one we have refused.
 *
 * Returns `undefined` for a panel that exists and for a name nobody has
 * considered — an unknown panel has no recorded reason to give, and inventing
 * one is a generic message any caller can write for itself. The same split
 * `fitNotice` and `refusedPlacement` make, for the same reason.
 *
 * `Object.hasOwn` again, and this is the reading where the unguarded form is
 * *worst*: a bare index answers with `Object` for `refusedPanel('constructor')`,
 * which is truthy, so the caller shows a refusal whose panel and reason are
 * both `undefined`. A wrong answer is at least visible; well-formed prose that
 * explains nothing is not.
 */
export function refusedPanel(panel: string): RefusedPanel | undefined {
  if (!Object.hasOwn(REFUSED_PANELS, panel)) return undefined
  return REFUSED_PANELS[panel]
}
