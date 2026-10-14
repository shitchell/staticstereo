/**
 * The structural operations: creating a layer, deleting one, duplicating one.
 *
 * Design §5.6 is the whole rationale and is worth quoting, because it explains
 * why this is a second registry rather than four more `CONTROLS` entries:
 * *"Revision 1 had no account of how a layer is created, which is the first
 * item in R5 and the first thing a user does. A path-keyed control registry
 * cannot express it: adding a layer is a structural mutation on a
 * discriminated union, and the author must choose a variant before any control
 * applies."* Design §11 row 4 then budgets a structural operation at **one
 * registration**, and §11 says why that budget gets a test rather than a
 * comment: *"without that, 'moving a panel costs a declaration' is unverified
 * until the first time it is false."*
 *
 * ## What P3a ships, and what is merely vacant
 *
 * §5.6 lists three tiers — layer, action, keyframe — and plan §7 P4.7 splits
 * them: *"action and keyframe operations belong to P6; P4 adds layer ops."*
 * So two of the three tiers are **empty here and that is not a refusal**.
 * {@link SUBJECT_INFO} records the difference per tier and
 * `operations.test.ts` turns the record into a sensor, because §9's last trap
 * is that *"a recorded note is not a sensor: a note tells whoever reads it,
 * nothing makes them read it."*
 *
 * The absences that *are* refusals — layer reordering, `draw`, undo-as-an-
 * operation — are in {@link ABSENT_OPERATIONS} with the argument against each,
 * which is C-1's convention: *"a comment above the registry is deleted by
 * whoever adds the entry; a table with a test over it has to be argued with."*
 *
 * ## Staying open for a kind that does not exist yet
 *
 * Plan §7 P4.7 again: *"P4 must leave the registry open for extension without
 * modification."* The failure mode is a shape that only admits layer
 * operations, so that P6 adding a keyframe operation has to *edit* this file
 * rather than *extend* it. Three decisions here are what prevent that, and
 * each one cost something:
 *
 * - **{@link OperationSubject} already names all three tiers**, not only the
 *   one P3a populates. A union of one would have to be widened by P6.
 * - **{@link Operation.verb} is a `string`, not a union.** §5.6's three tiers
 *   do not share a verb vocabulary — the action tier has *attach*, *detach*
 *   and *expand*, the keyframe tier has *insert at playhead* — so any closed
 *   verb type is the layer tier's, and a later tier would have to add to it.
 *   {@link LAYER_VERBS} closes the layer tier's verbs instead, which is the
 *   scope where closing one is free.
 * - **{@link Operation.target} is optional and untyped.** "Attach to a
 *   property" needs a target before a property type exists.
 *
 * And the composition door is {@link composeOperations}: a later tier declares
 * its own table in its own module and the shell composes, so the edit lands in
 * the consumer rather than here. That is the stronger of the two readings of
 * "without modification"; the weaker one — design §11's *one registration*,
 * which explicitly budgets an edit *in* the registry — is what C-12's
 * registration test covers.
 *
 * ## Room for an undo mark, which does not exist yet either
 *
 * §5.6's last line: *"each operation declares its own undo mark (§3.4), so
 * 'add layer' is one history entry."* Survey §G-4 measured that there is **no
 * undo, no redo, no mark concept and no history stack** in the codebase today.
 * Mark-based undo is criterion 7 and belongs to P3b. {@link Operation.mark} is
 * the room left for it — the openness question pointed at *time* instead of at
 * kind, because a shape with nowhere to put a mark forces P3b to change this
 * registry rather than extend it.
 *
 * ## The creatable set is the validator's answer, never the number four
 *
 * Ruling R-q. `site/scene.ts:268` refuses `type: 'draw'` in the browser,
 * quoting design §9.5. Writing `['text', 'image', 'gif', 'shape']` here would
 * be four correct names today and a silent lie the day that refusal moves in
 * either direction, so the fan-out is driven by
 * {@link browserReachableLayerTypes}, which asks `validateScene` with one
 * minimal specimen per variant. C-3 built that probe for `CONTROLS` and
 * exported it; a second copy here would be §9's *"hand-written list of the
 * places that do X"* in its most literal form.
 *
 * What this module declares independently is {@link CREATE_NOTES}, which is
 * **total over `Layer['type']` by annotation** — so a sixth variant is a
 * compile error here and the only honest fix is to say what creating one
 * means. That is the guard pointed at the vocabulary rather than at the roster
 * it guards: §9's trap is that *"a guard derived from the roster it guards
 * proves only that the derivation ran twice."*
 *
 * ## There is no barrel
 *
 * Same reason `panels.ts` and `controlspec.ts` record: a barrel is a second
 * place every registry has to be registered, which is exactly the cost §11
 * budgets at one. Consumers import `./operations.js` directly, which also
 * keeps this module inside `site/query.test.ts`'s cone walk — that walk sees
 * only a `./<lowercase>` specifier in a flat `site/`.
 */
import type { AssertNever } from '../src/core/index.js'
import type { Layer } from '../src/core/types.js'
import { browserReachableLayerTypes } from './controlspec.js'

/** One `Layer` variant's discriminant. Local for the reason `controlspec.ts` records. */
type LayerType = Layer['type']

/**
 * Which tier of the model an operation mutates.
 *
 * All three of design §5.6's tiers, declared now although P3a populates only
 * the first. Declaring the vocabulary up front is the cheap half of staying
 * open: P6 writing a keyframe operation needs `subject: 'keyframe'` to be a
 * legal value, and widening a union is an edit to this file.
 *
 * A fourth tier would be a §5.6 amendment and not a registration, which is
 * the line this union draws deliberately. The thing that must stay open is
 * the *verb* — see {@link Operation.verb} — because that is where the three
 * tiers genuinely disagree.
 *
 * Declared as a union **and** as {@link OPERATION_SUBJECTS}, tied by the pair
 * below, for `panels.ts`' reason: neither declaration is derived from the
 * other, so the pair is a real guard rather than a tautology.
 */
export type OperationSubject = 'layer' | 'action' | 'keyframe'

/**
 * The tiers, in design §5.6's own order — the order of containment, since an
 * action lives on a layer and a keyframe lives in an action. This is the
 * iteration order every consumer of the registry inherits.
 */
export const OPERATION_SUBJECTS = ['layer', 'action', 'keyframe'] as const

type _NoSubjectMissing = AssertNever<Exclude<OperationSubject, typeof OPERATION_SUBJECTS[number]>>
type _NoSubjectExtra = AssertNever<Exclude<typeof OPERATION_SUBJECTS[number], OperationSubject>>

/** What {@link SUBJECT_INFO} records about one tier. */
export interface SubjectInfo {
  /** The tier's own key, so an entry carries its name when passed around alone. */
  readonly subject: OperationSubject
  /** Human-facing name — a menu section header, or a grouping in a command palette. */
  readonly label: string
  /**
   * Whether this registry carries operations for the tier **today**.
   *
   * Not a capability and not a toggle: it is the claim that makes the two
   * empty tiers legible as *vacancies* rather than as refusals, and
   * `operations.test.ts` checks it against the registry's actual contents on
   * every run. Flipping it without adding the operations is red, and adding
   * the operations without flipping it is red.
   */
  readonly populated: boolean
  /** Why the tier exists, and which phase fills it. */
  readonly reason: string
}

/**
 * The three tiers, with the phase that owns each.
 *
 * `Record<OperationSubject, …>` by annotation, which is what lets
 * `operations.test.ts` witness the `AssertNever` pair above at run time:
 * vitest cannot read a type, but it can read the keys the compiler forced to
 * track one.
 */
export const SUBJECT_INFO: Record<OperationSubject, SubjectInfo> = {
  layer: {
    subject: 'layer',
    label: 'Layer',
    populated: true,
    reason:
      'Design §5.6: create by type, delete, duplicate. Plan §7 P4.7 assigns the layer tier to ' +
      'P4 and P3a ships the registry it registers into. Creation is the first item in R5 and ' +
      'the first thing a user does, which is why this tier is the one that cannot wait.',
  },
  action: {
    subject: 'action',
    label: 'Action',
    populated: false,
    reason:
      'Design §5.6: attach to a layer, attach to a property (§7.2), detach, duplicate, expand ' +
      '(§7.1). **A vacancy, not a refusal** — plan §7 P4.7: "action and keyframe operations ' +
      'belong to P6". The tier is named here so P6 registers into a vocabulary that already ' +
      'admits it rather than widening one.',
  },
  keyframe: {
    subject: 'keyframe',
    label: 'Keyframe',
    populated: false,
    reason:
      'Design §5.6: insert at playhead, delete, duplicate. A vacancy for the same reason as the ' +
      'action tier, and it arrives with the same phase. Its verbs are the clearest evidence ' +
      'that a closed verb union would be wrong: "insert at playhead" has no reading on a layer.',
  },
}

/**
 * The verbs the **layer** tier has, and only that tier.
 *
 * Closing this is free in a way that closing {@link Operation.verb} is not:
 * design §5.6 gives the layer tier exactly three verbs, and a fourth is a
 * design change rather than a registration. The other two tiers get no such
 * union, because §5.6 gives them verbs — *attach*, *detach*, *expand*,
 * *insert at playhead* — that have no reading here, and a union spanning all
 * three would be the thing P6 has to edit.
 *
 * Declared twice and tied by the pair below, `panels.ts`' idiom.
 */
export type LayerVerb = 'create' | 'delete' | 'duplicate'

/** The layer verbs, in the order an author meets them. See {@link LayerVerb}. */
export const LAYER_VERBS = ['create', 'delete', 'duplicate'] as const

type _NoLayerVerbMissing = AssertNever<Exclude<LayerVerb, typeof LAYER_VERBS[number]>>
type _NoLayerVerbExtra = AssertNever<Exclude<typeof LAYER_VERBS[number], LayerVerb>>

/** What the registry records about one structural operation. */
export interface Operation {
  /**
   * The operation's id, `subject.verb` or `subject.verb.target`.
   *
   * Mirrors the key, as `PanelInfo.panel` and `FitModeInfo.mode` do: a
   * registry hands out values, and a value that does not know its own name
   * forces every caller to carry the pair.
   *
   * **Spelling.** R-y gives kebab-case to a segment somebody *coins*
   * (`attach-to-property`); a segment read from the model keeps the model's
   * spelling, because transliterating a path into the model breaks the only
   * thing the id is for. Every create operation's last segment is a
   * `Layer['type']`, so it is the model's.
   */
  readonly id: string
  /** Which tier the operation mutates. */
  readonly subject: OperationSubject
  /**
   * What it does to that tier.
   *
   * **A `string` and not a union, and this is the decision that keeps the
   * registry open.** Design §5.6's three tiers do not share a verb
   * vocabulary, so any closed type here would be the layer tier's three —
   * and P6 registering `insert-at-playhead` would have to widen it, which is
   * precisely the *modification* plan §7 P4.7 says the registry must not
   * require. {@link LAYER_VERBS} closes the layer tier's verbs at the scope
   * where closing them costs a later phase nothing.
   */
  readonly verb: string
  /**
   * What the verb acts on, when the verb alone does not say.
   *
   * Present on create-by-type, where it is the `Layer['type']` being created
   * and the reason §5.6 says *"the author must choose a variant before any
   * control applies"*. Absent on `delete` and `duplicate`, which act on
   * whatever is selected.
   *
   * Optional and typed `string` rather than `LayerType` so that the action
   * tier's "attach to a property" is expressible before a property-path type
   * exists. Narrowing it to the layer tier's needs would close the registry
   * against §5.6's own second tier.
   */
  readonly target?: string
  /** Human-facing name — a menu entry, a command-palette row, a toolbar tooltip. */
  readonly label: string
  /**
   * The single history entry this operation flushes, as the author reads it.
   *
   * Design §5.6: *"each operation declares its own undo mark (§3.4), so 'add
   * layer' is one history entry."* §3.4: *"changes accumulate until a mark
   * flushes them as one entry, so a whole drag or slider sweep is one undo."*
   *
   * **Nothing consumes this yet**, and survey §G-4 measured why: there is no
   * undo, no redo, no mark concept and no history stack in the codebase
   * today. Mark-based undo is criterion 7 and belongs to P3b. The field is
   * here because the alternative is P3b editing this registry to add it, and
   * an operation whose undo behaviour is decided elsewhere is an operation
   * whose "one history entry" guarantee lives in whichever call site
   * remembered.
   *
   * Separate from {@link label} although the two frequently coincide: a
   * toolbar may show "Text" where the history has to say "Add text layer",
   * and they diverge in the other direction too — several operations can
   * share a label in context and must not share a mark.
   */
  readonly mark: string
  /** Why this operation exists, in prose a reviewer can check against design §5.6. */
  readonly reason: string
}

/**
 * A registry of operations, keyed by id.
 *
 * Keyed by `string` rather than by a union of ids, which is the difference
 * between this registry and `PANELS`. There is no `OperationId` type and
 * there deliberately cannot be one: a union of ids is a list of every
 * operation that will ever exist, declared in this file, which is the exact
 * artefact plan §7 P4.7 forbids. The typed door is the *shape* of an entry;
 * membership is open.
 */
export type OperationTable = Readonly<Record<string, Operation>>

/**
 * What creating a layer of each variant means, one line per variant.
 *
 * **Total over `Layer['type']` by annotation, and that is the point rather
 * than tidiness.** A sixth variant added to the model is a compile error
 * here, and the only honest fix is to say what creating one means — which is
 * the question §5.6 says the author has to answer before any control applies.
 * It is **not** a list of creatable variants: `draw` has a note and gets no
 * operation, because what is creatable is whatever
 * {@link browserReachableLayerTypes} says the validator will load.
 *
 * This is the guard C-3's §9 trap row asks for — *"a guard derived from the
 * roster it guards proves only that the derivation ran twice"* — pointed at
 * the **upstream vocabulary**, `Layer['type']`, which nothing in this file
 * derives. The membership guard for the fan-out is the validator, one module
 * over, and restating it here would make this registry look guarded in a
 * second, emptier way.
 */
const CREATE_NOTES: Record<LayerType, string> = {
  text: 'A text layer needs only its string — `size`, `font` and `weight` fall back to the ' +
    'rasteriser\'s defaults. The cheapest layer to make and the one R5 asks for first.',
  image: 'An image layer requires `src`, and there is nothing sensible to invent for it: on this ' +
    'side the hash *is* the scene, so a src is frequently an inlined asset rather than a path. ' +
    'The operation exists so that PNG import (§6.1) has a structural mutation to perform; it is ' +
    'not a menu entry that yields a usable layer unaided.',
  gif: 'A GIF layer is `image` plus `loop`, and a separate operation rather than a mode of one ' +
    'because the model discriminates on `type` — §5.6\'s "the author must choose a variant ' +
    'before any control applies" is about exactly this choice.',
  shape: 'A shape layer requires `shape`, which decides whether `r` or `w`/`h` applies, so ' +
    'creating one already carries a second decision. `start`/`end` are **degrees** and `circle` ' +
    'only — design §9.1 item 2 names that collision, and an operation that creates a `rect` ' +
    'with wedge bounds set would be building a scene core throws on.',
  draw: 'No operation is derived, and the exclusion is not this table\'s. `site/scene.ts:268` ' +
    'refuses `type: "draw"` in the browser — it names a module path, and resolving one inside a ' +
    'static bundle is not possible. Design §9.5 records the loader seam as an open question ' +
    'rather than a missing loader (R-q). The note is here because this table is total over ' +
    '`Layer[\'type\']`: it answers "what would creating one mean", and today the answer is ' +
    '"nothing the browser can load". `REFUSED_LAYER_VARIANTS` in `controlspec.ts` is the ' +
    'recorded refusal and `operations.test.ts` checks this registry against it.',
}

/** The reason an operation carries when nobody wrote one for its target. */
const UNRECORDED_REASON =
  'No reason has been recorded for creating a layer of this variant. See `CREATE_NOTES`.'

/**
 * Every layer variant the model declares, measured.
 *
 * The key set of {@link CREATE_NOTES}, which is total over `Layer['type']` by
 * annotation — so this is the model's own variant count read at run time
 * rather than a number typed into a test. It is what makes "the creatable set
 * is a *strict* subset of the variants" a derived floor rather than a literal:
 * the day `draw` becomes creatable the strictness fails and somebody has to
 * argue, and the day a sixth variant lands the bound moves with it.
 */
export function layerVariants(): readonly string[] {
  return Object.keys(CREATE_NOTES)
}

/**
 * The layer tier's operations for a given set of creatable variants.
 *
 * A function over a roster rather than a constant, for `deriveControls`'
 * three reasons and they all apply here: the vacuity control (§6.5a) has to
 * drive the same instrument to zero, the prototype-chain control has to hand
 * it a roster member called `constructor`, and the `draw` control has to show
 * that the refusal travelling through is the *validator's* and not this
 * module declining to emit. A constant computed at module scope answers none
 * of those. {@link OPERATIONS} is this function applied to
 * {@link browserReachableLayerTypes}.
 *
 * **`Object.hasOwn` and not `notes[variant]`.** The notes are a plain object
 * literal keyed by variant name, so an unguarded read answers with the
 * `Object` **function** for a roster containing `'constructor'`, and the
 * operation would then ship carrying a reason of `undefined` — sailing past
 * {@link unrecordedOperations}, which looks for a word and not for a falsy
 * value. Same reading of E8 / R-l that `controlspec.ts`'s `specFor` records,
 * and the same fix P0b used in five registries.
 *
 * The result has a **null prototype**, so an id of `__proto__` becomes an own
 * property instead of silently reassigning the prototype. That is a property
 * of this object and not of the registry, which is why the readers below
 * still use `Object.hasOwn`: a caller is free to spread this into a plain
 * object and hand the chain back.
 */
export function deriveLayerOperations(creatable: readonly string[]): OperationTable {
  const table: Record<string, Operation> = Object.create(null) as Record<string, Operation>

  for (const variant of creatable) {
    const id = `layer.create.${variant}`
    table[id] = {
      id,
      subject: 'layer',
      verb: 'create',
      target: variant,
      label: `Add ${variant} layer`,
      mark: `Add ${variant} layer`,
      reason: Object.hasOwn(CREATE_NOTES, variant)
        ? CREATE_NOTES[variant as LayerType]
        : UNRECORDED_REASON,
    }
  }

  table['layer.delete'] = {
    id: 'layer.delete',
    subject: 'layer',
    verb: 'delete',
    label: 'Delete layer',
    mark: 'Delete layer',
    reason:
      'Design §5.6. Not per-variant: it acts on the selection, and the model does not care which ' +
      'variant is leaving. One history entry, because a multi-select delete the author made in ' +
      'one gesture has to undo in one (§3.4).',
  }

  table['layer.duplicate'] = {
    id: 'layer.duplicate',
    subject: 'layer',
    verb: 'duplicate',
    label: 'Duplicate layer',
    mark: 'Duplicate layer',
    reason:
      'Design §5.6. The copy needs a fresh `id` — design §4.1 makes layer identity stable and ' +
      'assigned on first mutation, so duplicating without minting one gives two layers the ' +
      'selection cannot tell apart. Not per-variant for `delete`\'s reason.',
  }

  return Object.freeze(table)
}

/**
 * The structural operations the editor has.
 *
 * The layer tier, with its create fan-out driven by the validator. The two
 * empty tiers are {@link SUBJECT_INFO}'s business; see this file's header for
 * why their emptiness is a vacancy rather than a refusal.
 */
export const OPERATIONS: OperationTable = deriveLayerOperations(browserReachableLayerTypes())

/**
 * The operation ids, in derivation order.
 *
 * Creates first, in the validator's own answer order, then the verbs that act
 * on a selection — the order a menu would list them and the one every
 * consumer inherits. Not sorted, because alphabetical would interleave
 * `layer.create.gif` and `layer.delete` for no reader's benefit.
 */
export const OPERATION_IDS: readonly string[] = Object.keys(OPERATIONS)

/**
 * What this operation is, or `undefined` if it is not one.
 *
 * `id` is a `string` and not a union on purpose — there is no union, see
 * {@link OperationTable} — so every caller is in the position `panelInfo`'s
 * untrusted callers are in: holding a name that came from a `data-` attribute
 * on a menu item, a stored keybinding target, or a URL.
 *
 * **`Object.hasOwn`, not a bare index and not `in`.** The shipped table has a
 * null prototype, so `'constructor' in OPERATIONS` is already `false` — but
 * that is a property of *that object*, and the first `{...OPERATIONS,
 * ...extra}` in the shell hands the chain straight back. The guard that
 * survives composition is the one at the reader. E8 / R-l, and the same fix
 * P0b used in five registries and C-2 used to close the sixth live instance
 * at `site/chromedom.ts:189`.
 *
 * `table` is a parameter so that the composed registry (see
 * {@link composeOperations}) is read by the same function. A second reader
 * per tier would mean the registry had not stayed open, only moved the edit.
 */
export function operationInfo(id: string, table: OperationTable = OPERATIONS): Operation | undefined {
  if (!Object.hasOwn(table, id)) return undefined
  return table[id]
}

/**
 * The create operations in a table, in order.
 *
 * Derived by verb rather than by id prefix: an id is a spelling and a verb is
 * the claim, and the two would drift the first time a tier coined an id shape
 * of its own.
 */
export function createOperations(table: OperationTable = OPERATIONS): readonly Operation[] {
  return Object.values(table).filter(op => op.verb === 'create')
}

/**
 * The operations in a table whose reason is the placeholder.
 *
 * C-3's trade, adopted: *prefer a partial table plus a loud runtime sensor
 * over a total `Record`*. {@link CREATE_NOTES} is total over the model's
 * variants, so the only way to reach the placeholder is a creatable variant
 * the model does not declare — and the type system cannot distinguish
 * "partial by design" from "partial by accident", which is why the sensor is
 * at run time rather than in the annotation.
 *
 * Returns ids rather than throwing: the caller deciding what to do about an
 * operation with no recorded reason is the one with the context, and this is
 * also the reader the prototype-chain control drives.
 */
export function unrecordedOperations(table: OperationTable = OPERATIONS): readonly string[] {
  return Object.values(table)
    .filter(op => op.reason === UNRECORDED_REASON)
    .map(op => op.id)
    .sort()
}

/**
 * The ids more than one of these tables claims, sorted and deduplicated.
 *
 * Separate from {@link composeOperations} so that a caller can ask before it
 * commits, and so that the throw below has something to name. The same split
 * `duplicateControlIds` and `duplicatePanelIds` make.
 */
export function duplicateOperationIds(...tables: readonly OperationTable[]): readonly string[] {
  const seen = new Set<string>()
  const clashed = new Set<string>()
  for (const table of tables) {
    for (const id of Object.keys(table)) {
      if (seen.has(id)) clashed.add(id)
      seen.add(id)
    }
  }
  return [...clashed].sort()
}

/**
 * One registry from several tables, so a later tier extends rather than edits.
 *
 * **This is the open door, and the reason it is a function.** Plan §7 P4.7
 * requires the registry to stay *"open for extension without modification"*.
 * P6's keyframe operations live in P6's own module as an
 * {@link OperationTable}; the shell composes. No type here widens, no union
 * here grows, and no entry here moves — the edit lands in the consumer, which
 * is the one place a new capability has to be wired anyway.
 *
 * **It throws on a collision**, which is the opposite of
 * `unregisteredPanels`' choice and for a stated reason: a layout can arrive
 * from a stored preference and the caller has to decide what to do about it,
 * whereas two tables are **code**. A record cannot report a collision on its
 * own — the second write overwrites the first and the registry is quietly one
 * operation short with nothing left to inspect — so a shadowed operation is a
 * menu entry that silently does something else, and there is no caller-side
 * recovery worth offering.
 *
 * Built onto a null prototype for {@link deriveLayerOperations}' reason: an
 * id of `__proto__` must become an own property rather than reassign the
 * prototype of the registry under construction.
 */
export function composeOperations(...tables: readonly OperationTable[]): OperationTable {
  const clashed = duplicateOperationIds(...tables)
  if (clashed.length > 0) {
    throw new Error(
      `operation id declared by more than one table: ${clashed.join(', ')}. ` +
      `A record cannot report a collision — the second registration would silently shadow the ` +
      `first, leaving a menu entry that does something else.`,
    )
  }

  const merged: Record<string, Operation> = Object.create(null) as Record<string, Operation>
  for (const table of tables) {
    for (const id of Object.keys(table)) {
      merged[id] = table[id]!
    }
  }
  return Object.freeze(merged)
}

/**
 * Whether an absent operation is argued against or merely not here yet.
 *
 * The distinction C-1's `REFUSED_PLACEMENTS` did not need and this table
 * does: §5.6's two unpopulated tiers are arriving in P6, while layer
 * reordering is refused on a measured argument. Conflating them is how a
 * deferred feature gets quietly reclassified as a rejected one by whoever
 * reads the table next — and the other way round, which is worse, because a
 * refusal filed as a vacancy is a settled argument somebody re-opens by
 * implementing it.
 */
export type OperationDisposition = 'refused' | 'deferred'

/** The dispositions. See {@link OperationDisposition}. */
export const OPERATION_DISPOSITIONS = ['refused', 'deferred'] as const

type _NoDispositionMissing =
  AssertNever<Exclude<OperationDisposition, typeof OPERATION_DISPOSITIONS[number]>>
type _NoDispositionExtra =
  AssertNever<Exclude<typeof OPERATION_DISPOSITIONS[number], OperationDisposition>>

/** What {@link ABSENT_OPERATIONS} records about an operation that is not registered. */
export interface AbsentOperation {
  /** The operation someone might ask for. Mirrors the key, as {@link Operation.id} does. */
  readonly operation: string
  /** Argued against, or not here yet. See {@link OperationDisposition}. */
  readonly disposition: OperationDisposition
  /** Why, in prose a human can be shown. */
  readonly reason: string
}

/**
 * Structural operations that are understood, will be asked for, and are not
 * registered — with what each absence actually is.
 *
 * A registry records decisions by **listing**, and several of this design's
 * decisions are **absences**, which is the one thing a list cannot record.
 * C-1's convention, now the cluster's: *"a comment above the registry is
 * deleted by whoever adds the entry; a table with a test over it has to be
 * argued with."* Same mechanism as `layout.ts`'s `REFUSED_PLACEMENTS`,
 * `panels.ts`' `REFUSED_PANELS`, `controlspec.ts`'s
 * `REFUSED_LAYER_VARIANTS` and `fit.ts`'s `REJECTED_FIT_MODES`.
 *
 * The two **tier-wide** vacancies — the action and keyframe tiers — are not
 * here. They are in {@link SUBJECT_INFO}, because a tier is not an operation
 * and listing one here would need a name nobody has coined.
 *
 * Keyed by `string` rather than by an id type, for `REFUSED_PANELS`' reason:
 * the whole point is to answer for names that are not operations.
 */
export const ABSENT_OPERATIONS: Record<string, AbsentOperation> = {
  'layer.reorder': {
    operation: 'layer.reorder',
    disposition: 'refused',
    reason:
      'Design §5.4, and it is recorded there as a correction to revision 1: "Drag-reorder is not ' +
      'adopted … `raster.ts` composites with `depth[i] = max(depth[i], layerDepth × mask[i])`. ' +
      '`max` is commutative, so permuting `scene.layers` produces a byte-identical depth map — ' +
      'the layer list is a set, not a stack." Plan §9 carries the same row. A reorder operation ' +
      'would therefore be a gesture with a mark, a history entry and no effect on the render, ' +
      'which is worse than its absence: the author would learn that order matters. The layer ' +
      'panel sorts by depth instead, with authoring order available as an alternative sort.',
  },
  'layer.create.draw': {
    operation: 'layer.create.draw',
    disposition: 'refused',
    reason:
      'Ruling R-q. `site/scene.ts:268` refuses `type: "draw"` in the browser, quoting design ' +
      '§9.5: it names a module path, and resolving one inside a static bundle is not possible. ' +
      'Creating one would build a layer the author cannot reload from their own link. **The ' +
      'refusal is not enforced by this entry** — `OPERATIONS` is derived from the validator, so ' +
      'the day that refusal lifts the operation appears and `operations.test.ts` goes red here ' +
      'instead, which is the right way round: a hardcoded exclusion would be a silent lie and ' +
      'this is an argument with a sensor on it.',
  },
  undo: {
    operation: 'undo',
    disposition: 'refused',
    reason:
      'History is a property *of* operations here, not an operation. Design §5.6: "each ' +
      'operation declares its own undo mark (§3.4), so \'add layer\' is one history entry." An ' +
      '`undo` entry in this registry would have to declare a mark for undoing, and the registry ' +
      'would then be describing its own history mechanism in the vocabulary that mechanism ' +
      'consumes. Undo is a transport over the mark stream (criterion 7, P3b); it belongs to ' +
      '`KEYBINDINGS` and the store, not here.',
  },
  'layer.group': {
    operation: 'layer.group',
    disposition: 'deferred',
    reason:
      'Design §5.4: "Grouping and filtering are deferred. When grouping lands it must be plain ' +
      'folders that do not change the render context — AE\'s \'precomp hell\' is the ' +
      'counter-example." A vacancy and not a refusal: the design says when, and says what shape ' +
      'it has to take when it arrives. Recorded so that whoever implements it inherits the ' +
      'constraint rather than rediscovering it.',
  },
  'layer.retype': {
    operation: 'layer.retype',
    disposition: 'deferred',
    reason:
      'Converting an existing layer between variants, which is **neither** create-by-type nor ' +
      'the `layer.<variant>.type` control, and is owned by no registry today. The control is a ' +
      'real control — `type` is in every scene file and R6 is about every authorable key — but ' +
      'a generated enum widget over it would let an author switch `text` → `shape` and leave ' +
      '`text`, `size`, `font` and `weight` set with no `shape` key, which `site/scene.ts` ' +
      'refuses on load. So the overlap between the two registries hides a third mechanism: a ' +
      'migration that drops the old variant\'s keys and supplies the new one\'s required ones. ' +
      'Deferred rather than refused — nobody has argued against it, it simply has no owner. ' +
      'Raised by C-4; design §9.3 and P4\'s widget work are where it lands.',
  },
}

/**
 * Why this operation is not registered, if it is one we have considered.
 *
 * Returns `undefined` for an operation that exists and for a name nobody has
 * considered — an unknown operation has no recorded reason to give, and
 * inventing one is a generic message any caller can write for itself. The
 * same split `refusedPanel`, `refusedPlacement` and `refusedLayerVariant`
 * make.
 *
 * `Object.hasOwn` again, and here the table really is a plain object literal
 * with `Object.prototype` behind it: a bare index answers with the `Object`
 * function for `absentOperation('constructor')`, which is truthy, so the
 * caller shows a refusal whose operation, disposition and reason are all
 * `undefined`. A visibly wrong answer is recoverable; well-formed prose that
 * explains nothing is not.
 */
export function absentOperation(operation: string): AbsentOperation | undefined {
  if (!Object.hasOwn(ABSENT_OPERATIONS, operation)) return undefined
  return ABSENT_OPERATIONS[operation]
}
