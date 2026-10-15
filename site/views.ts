/**
 * The editor's two display axes: **which canvas** you are looking at, and
 * **which depth buffer** the depth canvas draws.
 *
 * Design §5.2 opens with the first: *"**Three views** (R11) as a registry:
 * `depth` · `stereo` · `both`."* Plan §7 P4.1 names the same three and assigns
 * their implementation to P4. P3a ships the keys; **P4 ships the pixels** and
 * the view switcher — which design §5.1 requires be placed out of normal flow,
 * because *"anything added above it in flow moves its device-pixel origin"*.
 *
 * ## There are three axes here, not two, and this file holds two of them
 *
 * `SHADINGS` (`./shadings.ts`) is the third: which LUT the depth canvas is
 * drawn with. The separation is design §5.2a's — *"the model stores a scalar,
 * the view renders it however reads best"* — and it is why none of the three
 * can be folded into the others: every combination of (which canvas, which
 * buffer, which LUT) is a meaningful editor state, so a single list would have
 * to be their product.
 *
 * ## `DEPTH_SOURCES` is here because ruling R-p put it here
 *
 * The second axis already ships, unregistered: `site/index.html`'s
 * `#depth-view` select and `site/controls.ts`' `DepthView` union offer
 * `composited | encoded`, and `site/main.ts` reads them as
 * `state.depthView === 'encoded' ? blurDepth(depth, w, h, stereo.depthBlur) :
 * depth` — the depth map **before** versus **after** `depthBlur`. Survey §I-2
 * **[M]** measured it as a third axis orthogonal to both `VIEWS` and
 * `SHADINGS`, and said *"PM-SHELL must decide where it lands, or it is dropped
 * silently by the teardown."*
 *
 * R-p is that it lands here. {@link DEPTH_SOURCE_PROVENANCE} records the
 * ruling as data rather than as a comment, because §9's last trap is that *"a
 * recorded note is a sensor — it is not"*: the rosters it names are **read** by
 * `views.test.ts`, so deleting `site/index.html` in the teardown reddens a test
 * instead of quietly removing an axis. The ruling is reversible and says so
 * (`rulingReversible`); what is not reversible by accident is the axis
 * vanishing.
 *
 * ## The two lists are visibly two
 *
 * {@link View} and {@link DepthSource} are **disjoint string-literal unions**,
 * so `view: 'encoded'` does not typecheck at all — the collapse this file
 * exists to prevent is unrepresentable rather than caught. For the string path,
 * where a name arrives from a stored preference or a `data-` attribute,
 * {@link viewInfo} answers `undefined` for a depth source and
 * {@link axisOverlap} is the runtime witness that the two key sets are
 * disjoint. The test adds the measurement that makes "orthogonal" more than a
 * word: the depth canvas is shown by **more than one** view and by **not all**
 * of them, which is false of any folding of the two lists into one.
 *
 * ## Membership is declared here and derived upstream
 *
 * C-3's §9 trap row is that *"a guard derived from the roster it guards proves
 * only that the derivation ran twice"*. Both lists here are **declared** —
 * there is no `View` or `DepthSource` in the model — so each local pair of
 * declarations is tied together by an {@link AssertNever} pair, and
 * *membership* is left to an upstream that is not this file:
 *
 * - `VIEWS` ⟵ design §5.2's sentence, parsed by the test, numeral and all.
 * - `DEPTH_SOURCES` ⟵ `site/index.html` and `site/controls.ts`, parsed by the
 *   test and recorded here in {@link DEPTH_SOURCE_PROVENANCE}.
 *
 * {@link CanvasKind} gets the same treatment from the page's own `<canvas>`
 * ids, so {@link ViewInfo.shows} names surfaces the editor has rather than
 * words this file made up.
 *
 * Both registries are total over their unions **by annotation**, which is
 * C-4's reading of survey §F-6's pairing rule: point the compile-time guard at
 * something with content in it, so a new member is an error whose only honest
 * fix is to write down why it exists. The annotation is available only on an
 * object literal, so `Object.prototype` stays behind both tables and
 * `Object.hasOwn` at every reader is genuinely load-bearing (E8 / R-l) rather
 * than belt-and-braces.
 *
 * ## Each axis has a picker, and it was not always true
 *
 * Plan §9: *"a registration test must assert that the thing a consumer does
 * is now possible — not that the entry can be found."* Both lists failed that
 * at first, and **not equally**, which is the one thing a file holding two
 * registries can measure that eight files holding one cannot. `VIEWS` had
 * {@link viewsShowing} — an enumerating reader, but of a different question
 * than the switcher's. `DEPTH_SOURCES` had **no enumerating reader at all**:
 * every one of its readers was a lookup, so a source registered into a table
 * copy was reachable only by a caller that already knew its name, and the
 * `#depth-view` select's only question — what is on the menu — had no answer
 * but {@link DEPTH_SOURCE_IDS}, a static declaration no registration can
 * move. {@link offeredViews} and {@link offeredDepthSources} are that answer,
 * each written in terms of its own lookup.
 *
 * ## No barrel, and no view with a default
 *
 * No barrel, for the reason `panels.ts`, `controlspec.ts`, `operations.ts` and
 * `shadings.ts` record: a barrel is a second place every registry has to be
 * registered, which is the cost design §11 budgets at one. A direct
 * `./views.js` import also keeps this module inside `site/query.test.ts`'s cone
 * walk, which resolves only a relative specifier with no `/` in it.
 *
 * **There is no `DEFAULT_VIEW`, and that is a measurement.** Design §5.2 marks
 * one of the four shadings `(default)` and marks none of the three views; plan
 * §7 P4.1 names the three and no default either. C-5's convention — order the
 * ids so the default is not at index 0 — therefore has nothing to bite here,
 * and inventing a default so that it would is the opposite of what the
 * convention is for. `views.test.ts` asserts the absence against the design
 * rather than leaving it to this paragraph, so the day a default is marked
 * upstream the question reopens loudly. {@link DEFAULT_DEPTH_SOURCE} *does*
 * exist, because two upstreams already pick one.
 */
import type { AssertNever } from '../src/core/index.js'

/**
 * The drawing surfaces the editor has.
 *
 * Not a word this file invented: `site/index.html` has exactly
 * `#stereo-canvas` and `#depth-canvas`, and `views.test.ts` reads the page's
 * own ids and requires this list to equal them. That matters because
 * {@link ViewInfo.shows} is the content the compile-time guard is pointed at —
 * a vocabulary nobody checks would let a view claim to show a surface that
 * does not exist.
 */
export type CanvasKind = 'stereo' | 'depth'

/** The canvases, in the order `index.html` lays them out. See {@link CanvasKind}. */
export const CANVAS_KINDS = ['stereo', 'depth'] as const

type _NoCanvasMissing = AssertNever<Exclude<CanvasKind, typeof CANVAS_KINDS[number]>>
type _NoCanvasExtra = AssertNever<Exclude<typeof CANVAS_KINDS[number], CanvasKind>>

/**
 * Which canvas the editor is showing.
 *
 * Declared as a union **and** as {@link VIEW_IDS}, tied by the pair below, for
 * `panels.ts`' reason: neither declaration is derived from the other, so the
 * pair is a real guard rather than a restatement. Membership is checked
 * against design §5.2 by `views.test.ts`, which is the guard that survives
 * someone editing both at once.
 *
 * **Deliberately disjoint from {@link DepthSource}.** The two axes sit in one
 * file so a reader meets them together; keeping their unions disjoint is what
 * makes `view: 'encoded'` a compile error rather than a bug report.
 */
export type View = 'depth' | 'stereo' | 'both'

/**
 * The views, in design §5.2's own order.
 *
 * **Copying the design's order is safe here and would not have been in
 * `shadings.ts`.** C-5 deliberately reordered `SHADING_IDS` away from the
 * design's table so that `SHADING_IDS[0]` could not become an accidental
 * synonym for `DEFAULT_SHADING`. This list has no default to collide with —
 * see this module's header — so that hazard does not exist, and inventing a
 * different order would be a decision with no argument behind it. Saying so is
 * cheaper than a test that cannot fail.
 */
export const VIEW_IDS = ['depth', 'stereo', 'both'] as const

type _NoViewMissing = AssertNever<Exclude<View, typeof VIEW_IDS[number]>>
type _NoViewExtra = AssertNever<Exclude<typeof VIEW_IDS[number], View>>

/** What the registry records about one view. */
export interface ViewInfo {
  /**
   * The view's key.
   *
   * Mirrors the key, as `PanelInfo.panel`, `FitModeInfo.mode`, `Operation.id`
   * and `ShadingInfo.shading` do: a registry hands out values, and a value
   * that does not know its own name forces every caller to carry the pair.
   * Typed `string` and not {@link View} so a registration test can declare an
   * entry without widening the union; the mirroring is checked at run time
   * instead, over every table a reader is handed.
   */
  readonly view: string
  /** Human-facing name — a switcher label, a menu entry, a keybinding caption. */
  readonly label: string
  /**
   * Why this view exists, in design §5.2's and §5.1's own terms.
   *
   * §2.3: a constant with no recorded reason is a review failure, and three
   * bare names would be exactly that.
   */
  readonly reason: string
  /**
   * The canvases this view shows. See {@link CanvasKind}.
   *
   * This is the registry's actual content and the reason its compile-time
   * guard asks for more than a comma: a fourth view has to say what it puts on
   * screen. Typed `readonly string[]` rather than `readonly CanvasKind[]` for
   * {@link ViewInfo.view}'s reason — a registration test must be able to name
   * a surface without widening {@link CanvasKind} — and checked against the
   * page's own canvases by {@link auditViews}.
   */
  readonly shows: readonly string[]
}

/**
 * A table of views, keyed by name.
 *
 * Keyed by `string` and not by {@link View}, which is what every reader takes.
 * Two reasons, both load-bearing: a caller holding a name out of a stored
 * preference, a `data-` attribute or a link has a `string` and not a union
 * member, and a registration test must be able to register an entry without
 * editing this file's union. The *shipped* registry is still total over the
 * union — see {@link VIEWS}.
 */
export type ViewTable = Readonly<Record<string, ViewInfo>>

/**
 * The views.
 *
 * `Record<View, ViewInfo>` **by annotation**, and that is the registry's
 * compile-time guard: a fourth member of {@link View} is an error here whose
 * only honest fix is to say which canvases it shows and why it exists. A
 * `Record<string, …>` would have accepted the widened union in silence.
 *
 * It is a plain object literal, so `Object.prototype` is behind it and
 * `VIEWS['constructor']` answers with the `Object` function. That is
 * **deliberate and not an oversight**: the annotation above is only available
 * on a literal, and the guard that survives a `{...VIEWS}` in the shell is the
 * one at the reader anyway (E8 / R-l). Every reader below uses
 * `Object.hasOwn`.
 */
export const VIEWS: Record<View, ViewInfo> = {
  depth: {
    view: 'depth',
    label: 'Depth',
    reason:
      'The scalar field on its own, which is the only view in which an author can see what they ' +
      'are actually editing: design §5.2a calls greyscale "the identity mapping of a scalar field ' +
      'onto a visual", and `index.html` already says why the page keeps a depth panel at all — ' +
      '"if the stereogram looks wrong, check whether the depth map looks wrong too." It is the ' +
      'view `SHADINGS` and `DEPTH_SOURCES` both qualify, and the only one of the three that is ' +
      'legible without fusing anything.',
    shows: ['depth'],
  },
  stereo: {
    view: 'stereo',
    label: 'Stereogram',
    reason:
      'The output, alone and at its largest. Design §5.1 requires the editor\'s own canvas to be ' +
      'the thing the author fuses while working, and §8.3\'s sub-pixel constraint is why that ' +
      'needs its own view rather than a bigger pane: "anything added above it in flow moves its ' +
      'device-pixel origin", so the view that removes everything else is the one in which the ' +
      'fusion the author is judging is the fusion the viewer will get.',
    shows: ['stereo'],
  },
  both: {
    view: 'both',
    label: 'Both',
    reason:
      'Depth and stereogram side by side — today\'s editor, which has no switcher and shows both ' +
      'figures at once (`section.views` in `site/index.html`). It is a view and not the absence ' +
      'of one, because the comparison is the work: a stereogram is unreadable as a picture, so ' +
      'the only way to attribute a defect to the depth map rather than to the encoder is to have ' +
      'both on screen. Keeping it registered is also what stops the view switcher from being a ' +
      'regression on the day it ships.',
    shows: ['stereo', 'depth'],
  },
}

/* ------------------------------------------------------------------ *
 * The second axis. Ruling R-p.
 * ------------------------------------------------------------------ */

/**
 * Where in the depth pipeline a buffer is read, relative to `depthBlur`.
 *
 * Two points and not a number, because the axis is a *choice between stages*
 * and not a blur radius — the radius is `stereo.depthBlur`, a control the
 * editor already has. Naming the stages is what lets {@link auditDepthSources}
 * notice the one way this axis dies quietly: every member reading the same
 * point, which is a control that cannot change the picture.
 */
export type DepthStage = 'before' | 'after'

/** The pipeline points a depth source may read. See {@link DepthStage}. */
export const DEPTH_STAGES = ['before', 'after'] as const

type _NoStageMissing = AssertNever<Exclude<DepthStage, typeof DEPTH_STAGES[number]>>
type _NoStageExtra = AssertNever<Exclude<typeof DEPTH_STAGES[number], DepthStage>>

/**
 * Which depth buffer the depth canvas draws.
 *
 * **Not a view, and the names are the reason this file is careful.** Today's
 * `site/controls.ts` calls this union `DepthView`, which is exactly the
 * collision this task's criterion is about — a reader who meets `DepthView`
 * and `VIEWS` in the same session has every reason to think `encoded` is a
 * view. It is renamed here, and {@link View} and {@link DepthSource} are kept
 * disjoint so the mistake does not compile.
 */
export type DepthSource = 'composited' | 'encoded'

/**
 * The depth sources.
 *
 * **Ordered so that `DEPTH_SOURCE_IDS[0]` is not {@link DEFAULT_DEPTH_SOURCE}**
 * — C-5's convention, and with two members that is the order's entire job, so
 * it is stated rather than dressed up as a semantic ordering. Had the default
 * sat first, the shorter expression would be a correct-by-accident spelling of
 * it and the next reader would turn the default back into a position.
 * `views.test.ts` asserts the non-coincidence, so the protection is a sensor
 * and not this paragraph.
 */
export const DEPTH_SOURCE_IDS = ['encoded', 'composited'] as const

type _NoDepthSourceMissing = AssertNever<Exclude<DepthSource, typeof DEPTH_SOURCE_IDS[number]>>
type _NoDepthSourceExtra = AssertNever<Exclude<typeof DEPTH_SOURCE_IDS[number], DepthSource>>

/**
 * The shipped default, as a value.
 *
 * `DEFAULT_FIT`, `DEFAULT_SMOOTH` and `DEFAULT_SHADING`'s idiom, and the
 * annotation is the point: a default naming a source that does not exist is
 * not expressible. Unlike those three it is not a fresh decision — two
 * upstreams already make it, and `views.test.ts` reads both: `site/controls.ts`
 * initialises its reducer with `depthView: 'composited'`, and
 * `site/index.html` lists `composited` first, which is what a `<select>` with
 * no `selected` attribute resolves to. They agreeing is itself worth a test;
 * the editor is wrong today if they do not.
 */
export const DEFAULT_DEPTH_SOURCE: DepthSource = 'composited'

/** What the registry records about one depth source. */
export interface DepthSourceInfo {
  /** The source's key. Mirrors the key, as {@link ViewInfo.view} does, and for the same reason. */
  readonly source: string
  /** Human-facing name — the `#depth-view` option today, a switcher label after P4. */
  readonly label: string
  /** Why this source exists, in the page's and the model's own terms. §2.3. */
  readonly reason: string
  /**
   * Which side of `depthBlur` this buffer is read from. See {@link DepthStage}.
   *
   * Typed {@link DepthStage} and not `string`, unlike the key mirrors above:
   * a registration test registering a source still has to say where in the
   * pipeline it reads, because a source that does not is not a member of this
   * axis at all — it is a second axis wearing this one's name.
   */
  readonly stage: DepthStage
}

/**
 * A table of depth sources, keyed by name. Keyed by `string` for
 * {@link ViewTable}'s reasons.
 */
export type DepthSourceTable = Readonly<Record<string, DepthSourceInfo>>

/**
 * The depth sources: the depth map before and after `depthBlur`.
 *
 * `Record<DepthSource, DepthSourceInfo>` by annotation, for {@link VIEWS}'
 * reason, and a plain object literal for the same deliberate reason.
 */
export const DEPTH_SOURCES: Record<DepthSource, DepthSourceInfo> = {
  composited: {
    source: 'composited',
    label: 'As composited',
    reason:
      'The depth map as the scene composites it, before `depthBlur` touches it: `site/main.ts` ' +
      'reads this branch as the raw `depth` buffer. It is what the author authored, so it is the ' +
      'one that answers "is my depth map right?" without the encoder\'s own smoothing in the way ' +
      '— and it is the default for that reason, in both places that pick one today.',
    stage: 'before',
  },
  encoded: {
    source: 'encoded',
    label: 'As encoded',
    reason:
      'The depth map the encoder actually reads, after `blurDepth(depth, w, h, stereo.depthBlur)`. ' +
      'It answers a different question from `composited` — "is what I authored what the ' +
      'stereogram was built from?" — and the two are byte-identical until `depthBlur` is raised, ' +
      'which `site/index.html` records as the reason its caption refuses to promise a blur: "a ' +
      'label promising a blur that is not there would read as a broken panel."',
    stage: 'after',
  },
}

/** One upstream roster a registry is derived from. See {@link AxisProvenance}. */
export interface AxisRoster {
  /** Path from the repository root, exactly as the test reads it. */
  readonly file: string
  /** What in that file is the roster, in enough detail to find it after a reformat. */
  readonly what: string
}

/** What a registry records about where it came from and what would lose it. */
export interface AxisProvenance {
  /** What the axis is, in one sentence. */
  readonly axis: string
  /** The `StereoOpts` key the axis is entirely about, checked against `STEREO_KEYS`. */
  readonly axisKey: string
  /** The upstreams it is derived from. Resolved and parsed by `views.test.ts`. */
  readonly rosters: readonly AxisRoster[]
  /** What happens without this registry. */
  readonly lostWithout: string
  /** The ruling that put it here, quoted. */
  readonly ruling: string
  /** Whether that ruling is held open deliberately. */
  readonly rulingReversible: boolean
}

/**
 * Where {@link DEPTH_SOURCES} came from, and what it is for.
 *
 * **This is the half of R-p that a comment cannot carry.** §9's last trap is
 * that *"a recorded note is a sensor — it is not. A note tells whoever reads
 * it; nothing makes them read it."* {@link rosters} is therefore data:
 * `views.test.ts` resolves each recorded path, parses it, and requires it to
 * agree with {@link DEPTH_SOURCE_IDS}. So the teardown deleting
 * `site/index.html` is a red test naming the file, rather than an axis
 * quietly leaving the product — which is the exact failure survey §I-2
 * predicted when it wrote *"PM-SHELL must decide where it lands, or it is
 * dropped silently by the teardown."*
 *
 * **When that red arrives, it is working.** `site/controls.ts` is orphaned by
 * the teardown rather than deleted (its own tests keep passing), so the fix is
 * to drop the deleted file from {@link rosters} and keep the one that
 * survives. At that point this registry *is* the roster, which is the whole
 * point of having written it down.
 */
export const DEPTH_SOURCE_PROVENANCE: AxisProvenance = {
  axis:
    'Which depth buffer the depth canvas draws: the composited scalar field, or the blurred one ' +
    'the encoder actually reads. Pre- versus post-`depthBlur`.',
  axisKey: 'depthBlur',
  rosters: [
    { file: 'site/index.html', what: 'the `#depth-view` select\'s option values' },
    { file: 'site/controls.ts', what: 'the `DepthView` union, and the reducer\'s initial state' },
  ],
  lostWithout:
    'The axis ships today with no registry behind it, so the teardown — which deletes ' +
    '`site/index.html` and `site/main.ts` — would remove the only places it is written down and ' +
    'nothing in `npm test` would notice an editor that had quietly lost a control.',
  ruling:
    'Ruling R-p (PM-SHELL-2\'s): today\'s `composited | encoded` axis is "a third axis orthogonal ' +
    'to both `VIEWS` and `SHADINGS`" (survey §I-2, §F-11), and it "ships in C-6\'s file as a ' +
    'guarded `DEPTH_SOURCES` member list in the `SMOOTH_MODES` shape, with no `CONTROLS` entry ' +
    'required of P3a. Without this it is dropped silently by the teardown." The reason it is not ' +
    'an eighth registry of its own is that making it one would change this cluster\'s acceptance ' +
    'criteria from seven registries to eight on a PM\'s say-so, which is scope the PM tier does ' +
    'not own.',
  rulingReversible: true,
}

/* ------------------------------------------------------------------ *
 * Readers. `Object.hasOwn` at every one of them — E8 / R-l.
 * ------------------------------------------------------------------ */

/**
 * What this view is, or `undefined` if it is not one.
 *
 * **`Object.hasOwn`, not a bare index and not `in`.** {@link VIEWS} is a plain
 * object literal, so `VIEWS['constructor']` is the `Object` function and
 * `'toString' in VIEWS` is `true`; a caller holding a name from a stored
 * preference would be handed a value whose `label` and `reason` are both
 * `undefined`, which renders as a blank switcher row rather than as a crash.
 *
 * `table` is a parameter so that a copy — the `{...VIEWS}` the shell will
 * eventually write, or a registration test's table — is read by this same
 * function rather than by a second reader written for the occasion.
 */
export function viewInfo(view: string, table: ViewTable = VIEWS): ViewInfo | undefined {
  if (!Object.hasOwn(table, view)) return undefined
  return table[view]
}

/**
 * What this depth source is, or `undefined` if it is not one.
 *
 * Deliberately refuses a {@link View} name, which is criterion (a)'s runtime
 * half: the compile-time half is that the two unions are disjoint, and this is
 * the guard for the path where the name is a `string`.
 */
export function depthSourceInfo(
  source: string,
  table: DepthSourceTable = DEPTH_SOURCES,
): DepthSourceInfo | undefined {
  if (!Object.hasOwn(table, source)) return undefined
  return table[source]
}

/**
 * The depth source a stored preference selects, falling back to the default.
 *
 * Falls back rather than throwing, which is `parseFit`'s trade for `parseFit`'s
 * reason: an unreadable preference should cost the author a default view, not
 * an error page. It does **not** normalise case or trim — `fit.ts` and
 * `smooth.ts` take that from `query.ts`, which owns the one copy of that
 * policy, and a second normaliser here would be the drift `query.test.ts`
 * exists to catch.
 */
export function resolveDepthSource(
  preference: string | undefined,
  table: DepthSourceTable = DEPTH_SOURCES,
): string {
  if (preference === undefined) return DEFAULT_DEPTH_SOURCE
  return Object.hasOwn(table, preference) ? preference : DEFAULT_DEPTH_SOURCE
}

/**
 * The default's own entry, resolved through the registry.
 *
 * The runtime half of §F-6's pairing rule for the default: the annotation on
 * {@link DEFAULT_DEPTH_SOURCE} is enforced by `npm run typecheck` alone, so
 * without something that reads it at run time the guarantee is invisible to
 * `npm test` and therefore to the gate's test leg.
 */
export function defaultDepthSourceInfo(
  table: DepthSourceTable = DEPTH_SOURCES,
): DepthSourceInfo | undefined {
  return depthSourceInfo(DEFAULT_DEPTH_SOURCE, table)
}

/**
 * The views a switcher offers, in the order the table declares them.
 *
 * **This is the question design §5.2's consumer actually asks, and until it
 * existed nothing answered it from a table.** A view switcher needs the
 * roster *and* each entry's label; {@link VIEW_IDS} is a static declaration
 * no registration can move, and {@link viewsShowing} answers a different
 * question — which views put a given canvas on screen — and answers it with
 * bare names. So a view registered into a table copy was reachable only by a
 * caller that already knew its name, which plan §9 is explicit is *not* what
 * "the entry appears" means.
 *
 * **Defined in terms of {@link viewInfo}, which is the point and not a
 * flourish.** A row a picker offers and the lookup refuses is a menu entry
 * that selects nothing; a row the lookup resolves and the picker omits is a
 * registration that did not appear. Going through the lookup makes both
 * unrepresentable rather than merely tested — and the hazard is real for an
 * enumerating reader in a way it is not for a lookup: `Object.prototype`'s
 * members are non-enumerable and never reach a picker by themselves, but
 * `Object.create(VIEWS)`'s inherited entries *are* surfaced by `for…in` while
 * `Object.hasOwn` refuses them.
 */
export function offeredViews(table: ViewTable = VIEWS): readonly ViewInfo[] {
  const offered: ViewInfo[] = []
  for (const name of Object.keys(table)) {
    const info = viewInfo(name, table)
    if (info !== undefined) offered.push(info)
  }
  return offered
}

/**
 * The depth sources a switcher offers, in the order the table declares them.
 *
 * {@link offeredViews}' reason, and this axis needed it more: **every shipped
 * reader of {@link DEPTH_SOURCES} was a lookup**, so there was no enumerating
 * consumer at all — not even the partial one {@link viewsShowing} gives the
 * other axis. The `#depth-view` select is the consumer and "what is on the
 * menu" is its only question.
 *
 * The table's order and {@link DEPTH_SOURCE_IDS}' order deliberately differ —
 * the ids avoid putting the default at index 0, the table is written in the
 * page's own order — so a picker must read the table and not the id list.
 * `views.test.ts` pins this answer against `index.html`'s option order.
 */
export function offeredDepthSources(
  table: DepthSourceTable = DEPTH_SOURCES,
): readonly DepthSourceInfo[] {
  const offered: DepthSourceInfo[] = []
  for (const name of Object.keys(table)) {
    const info = depthSourceInfo(name, table)
    if (info !== undefined) offered.push(info)
  }
  return offered
}

/**
 * The views that put a given canvas on screen.
 *
 * The question the other two axes ask of this one: `SHADINGS` and
 * {@link DEPTH_SOURCES} both qualify the depth canvas, so whether they are
 * live is "does the current view show `depth`". Answering it from the registry
 * rather than from a `=== 'depth' || === 'both'` in the shell is what keeps a
 * fourth view from silently losing its depth controls.
 *
 * Reads each entry through {@link viewInfo} rather than indexing the table,
 * so this module has **one** decision about what a table contains instead of
 * two that can drift, and the `table[view]!` the previous form needed is
 * gone. It still answers with the **keys** and not with
 * {@link ViewInfo.view}: a table whose mirror disagrees with its key is
 * `auditViews`' complaint to make, not this reader's to paper over.
 */
export function viewsShowing(canvas: string, table: ViewTable = VIEWS): readonly string[] {
  return Object.keys(table).filter(view => viewInfo(view, table)?.shows.includes(canvas) === true)
}

/**
 * The names both axes claim, which must be none.
 *
 * The runtime witness for this task's own criterion. The compile-time half —
 * {@link View} and {@link DepthSource} being disjoint unions — covers every
 * typed path; this covers the tables, which are keyed by `string` precisely so
 * that a registration test can widen them.
 *
 * `Object.keys` on the left and `Object.hasOwn` on the right, never
 * `key in sources`: `'constructor' in DEPTH_SOURCES` is `true`, so a naive
 * comparison would report a false overlap for any table that happens to key an
 * entry by an inherited name. That is the prototype chain reaching a
 * *comparison* rather than a lookup, and it is tested.
 */
export function axisOverlap(
  views: ViewTable = VIEWS,
  sources: DepthSourceTable = DEPTH_SOURCES,
): readonly string[] {
  return Object.keys(views).filter(name => Object.hasOwn(sources, name))
}

/* ------------------------------------------------------------------ *
 * Audits. The instruments the vacuity controls drive to zero.
 * ------------------------------------------------------------------ */

/**
 * Everything wrong with a table of views, as sentences, or empty.
 *
 * **This exists so that the vacuity control has an instrument to drive.**
 * Survey §I-1 measured that a universally-quantified registry check is
 * vacuously true at zero entries, and §9 adds that *"a numeric floor chosen
 * from today's count is a check — it is not"*. Neither floor here is a number:
 * `required` is design §5.2's sentence and `canvases` is `index.html`'s own
 * `<canvas>` ids, both supplied by the test from upstream.
 *
 * Returns complaints rather than throwing, for `auditShadings`' reason: the
 * caller is the one with the context to decide what an incomplete table means,
 * and a thrown error reports only the first thing wrong.
 */
export function auditViews(
  table: ViewTable,
  requiredViews: readonly string[],
  canvases: readonly string[],
): readonly string[] {
  const complaints: string[] = []

  for (const required of requiredViews) {
    if (!Object.hasOwn(table, required)) complaints.push(`no entry for \`${required}\``)
  }

  for (const [key, info] of Object.entries(table)) {
    if (info.view !== key) {
      complaints.push(`\`${key}\` is registered under a key its entry does not know (\`${info.view}\`)`)
    }
    if (info.label.trim() === '') complaints.push(`\`${key}\` has no label`)
    if (info.reason.trim() === '') complaints.push(`\`${key}\` has no recorded reason`)
    if (info.shows.length === 0) complaints.push(`\`${key}\` shows no canvas, so it is not a view`)
    if (new Set(info.shows).size !== info.shows.length) {
      complaints.push(`\`${key}\` names a canvas twice`)
    }
    for (const canvas of info.shows) {
      if (!canvases.includes(canvas)) {
        complaints.push(`\`${key}\` shows \`${canvas}\`, and the page has no such canvas`)
      }
    }
  }

  // The other direction, and the one a per-entry loop cannot reach: a surface
  // the editor has that no view puts on screen is a canvas the author can
  // never look at, which is how a view registry silently loses a pane.
  for (const canvas of canvases) {
    if (viewsShowing(canvas, table).length === 0) complaints.push(`no view shows \`${canvas}\``)
  }

  return complaints
}

/**
 * Everything wrong with a table of depth sources, as sentences, or empty.
 *
 * Same contract as {@link auditViews}, and one complaint it does not share:
 * an axis whose members all read the same point in the pipeline. That is the
 * way this registry dies without anything else noticing — two names for one
 * buffer is a control that cannot change the picture — and it is checkable
 * only over the whole table.
 */
export function auditDepthSources(
  table: DepthSourceTable,
  requiredSources: readonly string[],
): readonly string[] {
  const complaints: string[] = []

  for (const required of requiredSources) {
    if (!Object.hasOwn(table, required)) complaints.push(`no entry for \`${required}\``)
  }

  const entries = Object.entries(table)
  for (const [key, info] of entries) {
    if (info.source !== key) {
      complaints.push(`\`${key}\` is registered under a key its entry does not know (\`${info.source}\`)`)
    }
    if (info.label.trim() === '') complaints.push(`\`${key}\` has no label`)
    if (info.reason.trim() === '') complaints.push(`\`${key}\` has no recorded reason`)
  }

  if (entries.length > 1 && new Set(entries.map(([, info]) => info.stage)).size === 1) {
    complaints.push('every depth source reads the same point in the pipeline, so the axis distinguishes nothing')
  }

  return complaints
}

/* ------------------------------------------------------------------ *
 * The absences, which are decisions a list cannot record by listing.
 * ------------------------------------------------------------------ */

/**
 * Whether an absent name is argued against or owned by something else.
 *
 * **Two members and no `deferred`, and that is a finding rather than an
 * oversight.** C-4's `OperationDisposition` needed one because design §5.6
 * names three tiers and P3a populates one. Neither list here has a pending
 * member: design §5.2 and plan §7 P4.1 state `VIEWS`' membership in full, and
 * `DEPTH_SOURCES`' membership is whatever the page offers today. What *is*
 * open is the **status** of ruling R-p — whether this becomes a registry of
 * its own — and that is a fact about the ruling, recorded as
 * {@link AxisProvenance.rulingReversible}, not as a vacancy. Inventing a
 * vacancy to fill the slot would put a name nobody has argued for into a table
 * whose whole job is to record arguments.
 *
 * Shared by both lists because both lists genuinely have both dispositions,
 * which `views.test.ts` checks rather than assumes.
 */
export type AxisDisposition = 'refused' | 'elsewhere'

/** The dispositions. See {@link AxisDisposition}. */
export const AXIS_DISPOSITIONS = ['refused', 'elsewhere'] as const

type _NoDispositionMissing =
  AssertNever<Exclude<AxisDisposition, typeof AXIS_DISPOSITIONS[number]>>
type _NoDispositionExtra =
  AssertNever<Exclude<typeof AXIS_DISPOSITIONS[number], AxisDisposition>>

/** What {@link ABSENT_VIEWS} and {@link ABSENT_DEPTH_SOURCES} record about a name they do not register. */
export interface AbsentMember {
  /** The name someone might ask for. Mirrors the key, as {@link ViewInfo.view} does. */
  readonly name: string
  /** Argued against, or owned elsewhere. See {@link AxisDisposition}. */
  readonly disposition: AxisDisposition
  /** Why, in prose a reviewer can check against the design or the code. */
  readonly reason: string
  /** For an `elsewhere`, the mechanism that owns it. Absent on a refusal. */
  readonly ownedBy?: string
}

/**
 * A table of absent members, keyed by name.
 *
 * Keyed by `string` for {@link ViewTable}'s reasons, and a parameter on both
 * absence readers for one more: a census that cannot vary a table has a row
 * that cannot move whatever it does, which makes *"the absence table did not
 * move under a registration"* an unchecked declaration rather than a
 * measurement. C-10's finding, and the reason these two readers now take the
 * table their eight neighbours already took.
 */
export type AbsentTable = Readonly<Record<string, AbsentMember>>

/**
 * Views that are understood, will be asked for, and are not registered.
 *
 * A registry records decisions by **listing**, and several of this axis'
 * decisions are **absences**, which is the one thing a list cannot record.
 * C-1's convention, now the cluster's: *"a comment above the registry is
 * deleted by whoever adds the entry; a table with a test over it has to be
 * argued with."* Same mechanism as `layout.ts`' `REFUSED_PLACEMENTS`,
 * `panels.ts`' `REFUSED_PANELS`, `controlspec.ts`' `REFUSED_LAYER_VARIANTS`,
 * `fit.ts`' `REJECTED_FIT_MODES`, `operations.ts`' `ABSENT_OPERATIONS` and
 * `shadings.ts`' `ABSENT_SHADINGS`.
 *
 * **Four entries and not more.** Each is here because it is a name a
 * reasonable person would try to add to {@link VIEWS}, which is the test for
 * membership of this table; a table that answers for everything adjacent stops
 * being a record of decisions and becomes a second copy of the design.
 */
export const ABSENT_VIEWS: Record<string, AbsentMember> = {
  anaglyph: {
    name: 'anaglyph',
    disposition: 'refused',
    reason:
      'The first thing anybody asks a stereo tool for, and it has no inputs here. This renderer ' +
      'produces a **single image**: `src/core/sirds.ts`\'s `sirdsFromDepth` is documented as ' +
      '"@returns row-major greyscale, length w*h, values 0 or 255", and an autostereogram encodes ' +
      'both eyes into one picture by construction — there is no left/right pair anywhere in the ' +
      'pipeline to tint red and cyan. An anaglyph would be a second renderer, not a second view ' +
      'of this one, so registering it would promise a canvas nothing can draw.',
  },
  encoded: {
    name: 'encoded',
    disposition: 'elsewhere',
    reason:
      'A depth **source**, not a view: it says which buffer the depth canvas draws, not which ' +
      'canvas you are looking at. This is the confusion ruling R-p exists to prevent and the one ' +
      'today\'s naming invites, since `site/controls.ts` calls the union `DepthView`. Every ' +
      'combination of the two axes is meaningful — `stereo` with a depth source selected is the ' +
      'state you return from — so folding them together would cost a state and buy nothing.',
    ownedBy: 'DEPTH_SOURCES, in this file — ruling R-p',
  },
  relief: {
    name: 'relief',
    disposition: 'elsewhere',
    reason:
      'A shading, and the one that looks most like a different rendering rather than a different ' +
      'mapping — design §5.2 calls it a "hillshade, azimuth 315° / altitude 45°", computed from ' +
      'the neighbourhood instead of from the value. It is still a LUT-shaped choice *within* the ' +
      'depth canvas, which is the axis `SHADINGS` owns; §5.2a\'s separation is that "the model ' +
      'stores a scalar, the view renders it however reads best", and which canvas is on screen is ' +
      'upstream of how it is rendered.',
    ownedBy: '`SHADINGS` — `site/shadings.ts`, design §5.2',
  },
  present: {
    name: 'present',
    disposition: 'elsewhere',
    reason:
      'Presentation mode hides chrome; it does not change which canvas is shown. Design §5.1: ' +
      '"One key hides all chrome", and the flag already ships as `site/present.ts`\'s `?present=1` ' +
      'with the player honouring it. Registering it as a view would make every view two views and ' +
      'put a URL-level flag inside a per-pane selection, which is the cross-product mistake ' +
      '`ABSENT_SHADINGS.auto` records from the other direction.',
    ownedBy: '`site/present.ts` and `KEYBINDINGS` — design §5.1',
  },
}

/**
 * Depth sources that are understood, will be asked for, and are not registered.
 *
 * Two entries, and one of them is the mirror of `ABSENT_VIEWS.encoded`: the
 * two-axis claim should be legible from either corner, or the next reader only
 * meets half of it.
 */
export const ABSENT_DEPTH_SOURCES: Record<string, AbsentMember> = {
  stereo: {
    name: 'stereo',
    disposition: 'elsewhere',
    reason:
      'A view, not a depth source. There is no "stereo depth buffer" — the stereogram is what the ' +
      'depth map is encoded *into*, by `src/core/sirds.ts`, so asking for it here is asking the ' +
      'depth canvas to draw something that is not a depth map. The mirror of ' +
      '`ABSENT_VIEWS.encoded`, recorded so the separation reads the same from both sides.',
    ownedBy: '`VIEWS`, in this file — design §5.2',
  },
  blurred: {
    name: 'blurred',
    disposition: 'refused',
    reason:
      'A second name for `encoded`, and `site/index.html` already refused it in writing, in the ' +
      'caption above the select this registry is derived from: "Not labelled \'blurred\': ' +
      'depthBlur defaults to 0, so these two views are byte-identical until it is raised, and a ' +
      'label promising a blur that is not there would read as a broken panel." Two names for one ' +
      'buffer is also the exact shape `auditDepthSources` complains about — an axis whose members ' +
      'read the same point in the pipeline distinguishes nothing.',
  },
}

/**
 * Why this view is not registered, if it is one we have considered.
 *
 * Returns `undefined` for a view that exists and for a name nobody has
 * considered — an unknown name has no recorded reason to give, and inventing
 * one is a generic message any caller can write for itself. The same split
 * `refusedPanel`, `refusedPlacement`, `refusedLayerVariant`, `absentOperation`
 * and `absentShading` make.
 */
export function absentView(name: string, table: AbsentTable = ABSENT_VIEWS): AbsentMember | undefined {
  if (!Object.hasOwn(table, name)) return undefined
  return table[name]
}

/** Why this depth source is not registered, if it is one we have considered. See {@link absentView}. */
export function absentDepthSource(
  name: string,
  table: AbsentTable = ABSENT_DEPTH_SOURCES,
): AbsentMember | undefined {
  if (!Object.hasOwn(table, name)) return undefined
  return table[name]
}
