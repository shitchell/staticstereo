/**
 * The runtime witness for `site/operations.ts`'s three `AssertNever` pairs, the
 * registry's own unit tests, and the demonstration that a later phase can add
 * an operation of a kind P3a does not ship.
 *
 * ## Why a runtime witness at all
 *
 * Survey §F-6's pairing rule, the same one `site/layout.test.ts`,
 * `site/panels.test.ts` and `site/controlspec.test.ts` exist to satisfy:
 * `npm run typecheck` is the only thing that enforces an `AssertNever`, vitest
 * does not type-check, so a registry guarded only that way is invisible to
 * `npm test` and therefore to the gate's test leg. `anim/track.ts:204-208`
 * records it for `SUMMED_CHANNELS`.
 *
 * ## The floors are two populations, not numbers
 *
 * §9's trap: *"a numeric floor chosen from today's count is not a check — a
 * specifier floor of 160 was overtaken inside its own cluster."* That happened
 * on this branch. So every floor here is a relation between two populations
 * measured on the same run, and at least one of them is read from a different
 * module:
 *
 * | floor | what collapses it |
 * |---|---|
 * | create targets **equal** `browserReachableLayerTypes()` | nothing, unless `site/scene.ts` also changes its mind |
 * | create targets **⊂ strictly** {@link layerVariants} | `draw` becoming creatable |
 * | create targets **non-empty** | the validator refusing everything |
 * | `OPERATION_IDS.length` = targets + non-create verbs | a verb losing its operation |
 *
 * None of those is a number anyone typed, and `deriveLayerOperations([])` is
 * driven through the same assertions below to show the instrument can read
 * zero — survey §I-1's defect, which `controlspec.test.ts` caught inside its
 * own file on first use.
 */
import { describe, expect, it } from 'vitest'
import {
  ABSENT_OPERATIONS,
  LAYER_VERBS,
  OPERATIONS,
  OPERATION_DISPOSITIONS,
  OPERATION_IDS,
  OPERATION_SUBJECTS,
  SUBJECT_INFO,
  absentOperation,
  composeOperations,
  createOperations,
  deriveLayerOperations,
  duplicateOperationIds,
  layerVariants,
  operationInfo,
  unrecordedOperations,
} from './operations.js'
import type { Operation, OperationTable } from './operations.js'
import { CONTROL_IDS, browserReachableLayerTypes, refusedLayerVariant } from './controlspec.js'

/**
 * A table of a kind this registry does not ship, standing in for P6's own
 * module.
 *
 * Design §5.6 lists three tiers and plan §7 P4.7 assigns two of them to P6:
 * *"action and keyframe operations belong to P6; P4 adds layer ops."* This is
 * what one of those looks like, written here rather than in `operations.ts`,
 * because the claim under test is that writing it **takes no edit to
 * `operations.ts`**.
 *
 * **The absence of a cast is half the proof, and it is a compile-time half.**
 * There is no `as OperationTable` and no `as const` below: the literal is
 * annotated and therefore checked. `verb` is `'insert-at-playhead'`, a word
 * `operations.ts` never names, and it compiles because {@link Operation.verb}
 * is deliberately a `string` rather than a union — the one field whose
 * openness decides whether a later tier can be written at all. Closing it
 * would turn this fixture into a compile error, which is the regression this
 * file is standing against.
 *
 * It is *not* C-12's registration test. That test's job is design §11's budget
 * — a dummy entry appears without touching another file — and it owns the
 * ordinary case. This is the narrower claim C-4 owes: an operation of a
 * **kind** that does not exist yet is expressible, composable and resolvable.
 */
const KEYFRAME_OPERATIONS: OperationTable = {
  'keyframe.insert': {
    id: 'keyframe.insert',
    subject: 'keyframe',
    verb: 'insert-at-playhead',
    label: 'Insert keyframe',
    mark: 'Insert keyframe',
    reason: 'Design §5.6, keyframe tier. A fixture, not a registration.',
  },
  'keyframe.duplicate': {
    id: 'keyframe.duplicate',
    subject: 'keyframe',
    verb: 'duplicate',
    label: 'Duplicate keyframe',
    mark: 'Duplicate keyframe',
    reason: 'Design §5.6, keyframe tier. A fixture, not a registration.',
  },
}

/** An action-tier fixture, for the same reason and with its own verb vocabulary. */
const ACTION_OPERATIONS: OperationTable = {
  'action.attach.property': {
    id: 'action.attach.property',
    subject: 'action',
    verb: 'attach-to-property',
    label: 'Attach to property',
    mark: 'Attach action',
    reason: 'Design §5.6, action tier (§7.2). A fixture, not a registration.',
  },
}

/** Members of `a` that are also in `b`. Used in both directions, so it is one function. */
function overlap(a: readonly string[], b: readonly string[]): string[] {
  return a.filter(x => b.includes(x)).sort()
}

/** The variant each create operation targets, sorted. */
function createTargets(table: OperationTable = OPERATIONS): string[] {
  return createOperations(table)
    .map(op => op.target ?? '')
    .sort()
}

describe('OPERATION_SUBJECTS', () => {
  it('is the runtime witness for the compile-time subject pair', () => {
    // `operations.ts`'s `_NoSubjectMissing`/`_NoSubjectExtra` tie the
    // `OperationSubject` union to this tuple, and nothing in `npm test` can
    // read a type. What it can read is the thing the compiler forced to track
    // it: the keys of the record annotated `Record<OperationSubject, …>`.
    expect(Object.keys(SUBJECT_INFO).sort(), 'SUBJECT_INFO is keyed by OperationSubject')
      .toEqual([...OPERATION_SUBJECTS].sort())
  })

  it('names each subject exactly once', () => {
    // `readonly OperationSubject[]` admits a member written twice and
    // `Exclude` is set-valued, so neither the annotation nor the pair can see
    // a duplicate. Fifth instance of that hole in this phase — `SCENE_KEYS`
    // at `05aeb26`, `LAYER_KEYS` at `22572ea`, `SLOTS` at `4a75928`,
    // `PANEL_IDS` at `7dedb7d`, and here.
    const repeated = OPERATION_SUBJECTS.filter((s, i, all) => all.indexOf(s) !== i)
    expect(repeated, 'a subject listed twice is a tier iterated twice').toEqual([])
  })

  it('records, for each subject, whether it carries operations today and why', () => {
    for (const subject of OPERATION_SUBJECTS) {
      const info = SUBJECT_INFO[subject]
      expect(info.subject, `${subject} does not carry its own key`).toBe(subject)
      expect(info.label.length, `${subject} has no human-facing name`).toBeGreaterThan(0)
      expect(info.reason.length, `${subject} has no recorded reason`).toBeGreaterThan(0)
    }
  })

  it('agrees with the registry about which tiers are populated', () => {
    // §9's last trap: *"a recorded note is not a sensor. A note tells whoever
    // reads it; nothing makes them read it. Where a gap is accepted, convert
    // the note into a test that goes red the day someone crosses it."*
    //
    // `populated` is that conversion. The action and keyframe tiers are
    // **vacancies, not refusals** — design §5.6 lists all three and plan §7
    // P4.7 assigns two of them to P6 — and the difference matters: a refusal
    // is argued with, a vacancy is filled. This goes red in both directions:
    // when P6 lands keyframe operations without flipping the flag, and if the
    // layer tier were ever emptied.
    const occupied = new Set(Object.values(OPERATIONS).map(op => op.subject))
    for (const subject of OPERATION_SUBJECTS) {
      expect(occupied.has(subject), `${subject}: populated says ${SUBJECT_INFO[subject].populated}`)
        .toBe(SUBJECT_INFO[subject].populated)
    }
    expect([...occupied].sort(), 'P3a ships the layer tier and only the layer tier')
      .toEqual(['layer'])
  })
})

describe('the layer operations', () => {
  it('derives one create operation per layer variant the validator will load', () => {
    // Acceptance criterion (b), and the reason this registry carries no four.
    // Two populations measured on this run: the create targets, from this
    // module's derivation, and `browserReachableLayerTypes()`, which asks
    // `site/scene.ts`'s validator with one minimal specimen per variant. The
    // day the validator changes its mind in either direction, this is red —
    // which a literal `['text', 'image', 'gif', 'shape']` could never be.
    expect(createTargets(), 'the creatable set has drifted from the validator')
      .toEqual([...browserReachableLayerTypes()].sort())
  })

  it('creates a strict, non-empty subset of the variants the model declares', () => {
    // The floor, and both bounds are derived. `layerVariants()` is the key set
    // of a table annotated `Record<Layer['type'], …>`, so it is the model's
    // own variant count measured at run time rather than a number typed here.
    //
    // **Non-empty** rules out a validator that refuses everything, which would
    // make the equality above `[] === []`. **Strict** is the `draw` exclusion
    // read as a floor: the day `site/scene.ts` stops refusing `draw` this goes
    // red and somebody has to argue, rather than the editor quietly offering
    // to create a layer the browser will not load.
    const targets = createTargets()
    const variants = layerVariants()
    expect(variants, 'a create operation targets a variant the model does not declare')
      .toEqual(expect.arrayContaining(targets))
    expect(targets.length, 'the validator loads nothing, so the equality above is vacuous')
      .toBeGreaterThan(0)
    expect(targets.length, 'every variant is creatable, so nothing is excluded any more')
      .toBeLessThan(variants.length)
  })

  it('carries one operation per non-create verb on top of the create fan-out', () => {
    // Derived from `LAYER_VERBS`, not from today's six. `delete` and
    // `duplicate` act on a selection and are not per-variant, so the count is
    // the fan-out plus one each — and a verb that lost its operation is red
    // here rather than silently missing from a menu.
    const targets = createTargets()
    expect(OPERATION_IDS.length, 'the registry is not the fan-out plus the other verbs')
      .toBe(targets.length + LAYER_VERBS.length - 1)
    expect(OPERATION_IDS.length, 'there is nothing but create operations')
      .toBeGreaterThan(targets.length)
  })

  it('uses exactly the layer verbs it declares, in both directions', () => {
    // The runtime witness for the `LayerVerb` pair. Closed in both directions
    // for the reason `query.test.ts:320` records about `BOOLEAN_SPELLINGS`: a
    // one-way loop catches a verb the derivation lost and a count catches
    // neither, so the key comparison is what catches one it gained.
    const used = new Set(Object.values(OPERATIONS).map(op => op.verb))
    expect([...used].sort()).toEqual([...LAYER_VERBS].sort())
  })

  it('gives every operation a key it knows, a tier, a verb, a name and a reason', () => {
    // §2.3: *"a constant with no recorded reason is a review failure."* This
    // registry is a list of names, which is the shape where that bites
    // hardest — and in this repo it is also how a list goes stale silently.
    for (const id of OPERATION_IDS) {
      const op = OPERATIONS[id]!
      expect(op.id, `${id} does not carry its own key`).toBe(id)
      expect(OPERATION_SUBJECTS, `${id} names a tier nobody declared`).toContain(op.subject)
      expect(op.verb.length, `${id} has no verb`).toBeGreaterThan(0)
      expect(op.label.length, `${id} has no human-facing name`).toBeGreaterThan(0)
      expect(op.reason.length, `${id} has no recorded reason`).toBeGreaterThan(0)
    }
  })

  it('declares an undo mark on every operation, so §3.4 has somewhere to write', () => {
    // Design §5.6's last line: *"each operation declares its own undo mark
    // (§3.4), so 'add layer' is one history entry."* Survey §G-4 measured that
    // there is **no undo, no redo, no mark concept and no history stack** in
    // the codebase today — three hits for those words and all three are prose.
    // Mark-based undo is criterion 7 and belongs to P3b.
    //
    // So this is the openness question pointed at *time* rather than at kind:
    // if the operation shape had no room for a mark, P3b would have to change
    // this registry rather than extend it. The field is here now, unused, and
    // this test is what stops it being tidied away before its consumer exists.
    for (const id of OPERATION_IDS) {
      expect(OPERATIONS[id]!.mark.length, `${id} declares no undo mark`).toBeGreaterThan(0)
    }
  })

  it('gives each operation a distinct mark, so the history says which one it was', () => {
    // The mark is what the author reads in the history list. Two operations
    // sharing one make "Undo add text layer" ambiguous about which of them it
    // undoes. Derived from the registry rather than counted, and asserted over
    // the shipped table only — a composed table is P3b's to check, and
    // constraining P6's marks from here would be this registry closing itself
    // against the tier it is supposed to stay open for.
    const marks = Object.values(OPERATIONS).map(op => op.mark)
    const repeated = marks.filter((m, i, all) => all.indexOf(m) !== i)
    expect(repeated, 'two operations flush one history entry under the same name').toEqual([])
  })

  it('spells a coined segment kebab-case and a model segment the model\'s way', () => {
    // R-y as C-3 narrowed it: kebab-case governs a segment somebody *coins*;
    // a derived segment keeps the model's spelling, because transliterating a
    // path into the model breaks the only thing the id is for. Every create
    // operation's last segment is read from `Layer['type']`, so it is the
    // model's — and the ids are `subject.verb` or `subject.verb.target` with
    // no other invention in them.
    for (const op of createOperations()) {
      expect(op.id, `${op.id} is not subject.verb.target`)
        .toBe(`${op.subject}.${op.verb}.${op.target}`)
    }
    for (const id of OPERATION_IDS) {
      expect(id, `${id} is not lowercase`).toBe(id.toLowerCase())
      expect(id, `${id} has a segment that is neither coined nor a model key`)
        .toMatch(/^[a-z]+(\.[a-z-]+){1,2}$/)
    }
  })
})

describe('the draw exclusion is the validator\'s, not the number four', () => {
  it('derives no operation for a variant the validator refuses', () => {
    // The partition, read from `controlspec.ts`'s `REFUSED_LAYER_VARIANTS`
    // rather than restated here. §9: *"a hand-written list of the places that
    // do X goes stale silently the day a second place does X"* — and a second
    // copy of the refused set in this file is exactly that list.
    for (const variant of layerVariants()) {
      const refusal = refusedLayerVariant(variant)
      if (refusal === undefined) continue
      expect(createTargets(), `${variant} is refused and has a create operation`)
        .not.toContain(variant)
      expect(refusal.reason.length, `${variant} is refused with no reason`).toBeGreaterThan(0)
    }
  })

  it('leaves no variant uncreatable without a recorded reason somewhere', () => {
    // **Added after a plant went green that should not have.** Dropping
    // `'gif'` from `site/scene.ts`'s `LAYER_TYPES` reddened nothing in this
    // file: the equality against the validator moved with it (correctly —
    // operations follow the validator), the strict-subset floor still held at
    // 3 < 5, and the refusal loop above skips a variant with no recorded
    // refusal. The editor would have silently lost "Add gif layer".
    //
    // `controlspec.test.ts`'s partition does catch it, and so does
    // `scene.test.ts` — but a sensor in another module is not a sensor this
    // registry can be read against. This is the operations-level half: every
    // variant the model declares either has a create operation or has its
    // absence recorded, here or in the table C-3 owns. The two tables are
    // both consulted because the absence can legitimately live in either —
    // `REFUSED_LAYER_VARIANTS` says "no controls", `ABSENT_OPERATIONS` says
    // "no operation", and `draw` is the one variant that is both.
    const creatable = new Set(createTargets())
    for (const variant of layerVariants()) {
      if (creatable.has(variant)) continue
      const recorded =
        refusedLayerVariant(variant) !== undefined ||
        absentOperation(`layer.create.${variant}`) !== undefined
      expect(recorded, `${variant} cannot be created and nobody recorded why`).toBe(true)
    }
  })

  it('would derive one the day the validator stopped refusing', () => {
    // §6.5a's other half, and the thing that makes the null above evidence:
    // the derivation is handed the refused variant directly and produces the
    // operation. So the absence of `layer.create.draw` is the *validator's*
    // answer travelling through, and not this module declining to emit it.
    //
    // Hand-written here because the point is to drive the instrument with an
    // input the real roster does not contain — the control, not the case.
    const asIfReachable = deriveLayerOperations(['draw'])
    expect(createTargets(asIfReachable)).toEqual(['draw'])
    expect(asIfReachable['layer.create.draw']).toBeDefined()
  })

  it('names a reachable variant it has no recorded reason for, rather than shipping it quietly', () => {
    // C-3's third principle, adopted: *prefer a partial table plus a loud
    // runtime sensor over a total `Record`.* The per-variant notes **are**
    // total over `Layer['type']`, so an invented variant cannot have one — and
    // the type system cannot distinguish "partial by design" from "partial by
    // accident", so the sensor has to be at run time.
    expect(unrecordedOperations(), 'the shipped registry has an operation with no reason')
      .toEqual([])
    const invented = deriveLayerOperations(['sculpture'])
    expect(unrecordedOperations(invented), 'an unknown variant shipped a reason nobody wrote')
      .toEqual(['layer.create.sculpture'])
  })

  it('reads zero, which is what makes every loop above non-vacuous', () => {
    // Survey §I-1's defect, driven deliberately. `controlspec.test.ts`'s
    // emptied-registry plant caught exactly this inside its own file — a test
    // named "names the controls a layout strands" passing as `0 === 0`, in a
    // file written by someone briefed on vacuity twice.
    const empty = deriveLayerOperations([])
    expect(createOperations(empty), 'an empty roster still produced create operations')
      .toEqual([])
    expect(createOperations().length, 'the real registry is empty too, so nothing above is a check')
      .toBeGreaterThan(0)
  })
})

describe('the registry stays open for a kind that does not exist yet', () => {
  it('composes a tier this module does not ship, without this module changing', () => {
    // Acceptance criterion (a). Plan §7 P4.7: *"P4 must leave the registry
    // open for extension without modification."* The failure mode designed
    // against is a shape that only admits layer operations, so that P6 adding
    // a keyframe operation has to *edit* this registry rather than extend it.
    //
    // Three things had to be true for the fixtures at the top of this file to
    // be writable, and all three are decisions in `operations.ts`:
    // `OperationSubject` already names all three of §5.6's tiers; `verb` is a
    // `string`, not a union of the layer tier's three; and `target` is
    // optional and untyped, so "attach to a property" is expressible without
    // a property type existing yet.
    const composed = composeOperations(OPERATIONS, ACTION_OPERATIONS, KEYFRAME_OPERATIONS)
    expect(Object.keys(composed).sort()).toEqual(
      [...OPERATION_IDS, ...Object.keys(ACTION_OPERATIONS), ...Object.keys(KEYFRAME_OPERATIONS)]
        .sort(),
    )
    expect(
      Object.keys(composed).length,
      'composition dropped or merged a table',
    ).toBe(OPERATION_IDS.length + 3)
  })

  it('resolves every tier through the one reader', () => {
    // A registry that composes but needs a second lookup per tier has not
    // stayed open, it has moved the edit. One reader, parameterised by table.
    const composed = composeOperations(OPERATIONS, KEYFRAME_OPERATIONS)
    expect(operationInfo('keyframe.insert', composed)?.subject).toBe('keyframe')
    expect(operationInfo('layer.duplicate', composed)?.subject).toBe('layer')
    expect(operationInfo('keyframe.insert'), 'the shipped table leaked a P6 entry').toBeUndefined()
  })

  it('leaves the shipped tier untouched by what is composed over it', () => {
    const composed = composeOperations(OPERATIONS, KEYFRAME_OPERATIONS)
    for (const id of OPERATION_IDS) {
      expect(composed[id], id).toEqual(OPERATIONS[id])
    }
  })

  it('refuses to compose two tables that claim the same id', () => {
    // A record cannot report a collision: the second write overwrites the
    // first and the registry is quietly one operation short with nothing left
    // to inspect. `controlspec.ts` records the same defect, closed five times
    // in this phase.
    //
    // A throw and not a returned list, which is the opposite of
    // `unregisteredPanels`' choice and for the stated reason: a layout can
    // arrive from a stored preference and the caller has to decide what to do
    // about it, whereas two tables are **code**, and a shadowed operation is a
    // menu entry that silently does something else.
    const clash: OperationTable = {
      'layer.delete': {
        id: 'layer.delete',
        subject: 'layer',
        verb: 'delete',
        label: 'Delete, differently',
        mark: 'Delete, differently',
        reason: 'A collision fixture.',
      },
    }
    expect(() => composeOperations(OPERATIONS, clash)).toThrow(/layer\.delete/)
    expect(duplicateOperationIds(OPERATIONS, clash)).toEqual(['layer.delete'])
  })

  it('is a collision check that reports none when there is none', () => {
    // §6.5a: the throw above is evidence only because the same check passes
    // the tables that do not collide.
    expect(duplicateOperationIds(OPERATIONS, KEYFRAME_OPERATIONS, ACTION_OPERATIONS)).toEqual([])
  })
})

describe('every lookup refuses the prototype chain', () => {
  // E8 / R-l. P0b closed this idiom in five registries out of a 15-registry
  // audit; `site/chromedom.ts:189` was a live sixth until C-2 closed it at
  // `fb974d3`. A registry keyed by operation id is exactly this shape: the id
  // reaches the reader from a `data-` attribute on a menu item, a stored
  // keybinding target, or a URL.
  const INHERITED = ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']

  it('answers undefined for an inherited member, on every table', () => {
    for (const name of INHERITED) {
      expect(operationInfo(name), name).toBeUndefined()
      expect(absentOperation(name), name).toBeUndefined()
    }
  })

  it('still refuses one on a copy of the registry that has a prototype again', () => {
    // **The live reading, and the reason `Object.hasOwn` is in the reader
    // rather than only in the construction.** `OPERATIONS` is built with a
    // null prototype, so `'constructor' in OPERATIONS` is already `false` —
    // and that safety is a property of *this object*, which any later
    // `{...OPERATIONS, ...extra}` in the shell silently undoes. The spread
    // below is that shell, one line of it, and the guard that survives it is
    // the one at the reader.
    const spread: OperationTable = { ...OPERATIONS }
    for (const name of INHERITED) {
      expect(operationInfo(name, spread), name).toBeUndefined()
    }
  })

  it('resolves an operation genuinely named for an inherited member', () => {
    // The sharpest form: a table that really does declare `constructor` as an
    // id must resolve to *that operation*, not to the `Object` function and
    // not to `undefined`. A reader that answered `undefined` to every
    // inherited spelling by name-matching would pass the two tests above and
    // fail this one.
    //
    // **The entry is annotated separately, and that is not a style choice.**
    // A property literally called `constructor` gets **no contextual type**
    // from `Record<string, Operation>`: `Object.prototype.constructor` is in
    // the index signature's apparent type and shadows it, so `subject:
    // 'layer'` widens to `string` and the literal stops satisfying
    // {@link Operation}. Measured both spellings — `constructor:` and the
    // computed `['constructor']:` — and both fail; only annotating the value
    // works. Worth knowing because it is the §F-6 pairing rule arriving from
    // the other side: vitest ran this file **34/34 green** while
    // `svelte-check` reported `Type 'string' is not assignable to type
    // 'OperationSubject'`. The prototype chain reaches the *type* system
    // here, not only the lookup.
    const oddEntry: Operation = {
      id: 'constructor',
      subject: 'layer',
      verb: 'delete',
      label: 'Oddly named',
      mark: 'Oddly named',
      reason: 'A prototype-chain fixture.',
    }
    const odd: OperationTable = { ['constructor']: oddEntry }
    expect(operationInfo('constructor', odd)?.label).toBe('Oddly named')
    expect(composeOperations(OPERATIONS, odd)['constructor']?.label).toBe('Oddly named')
  })

  it('composes an id of __proto__ into an own property, not into a prototype', () => {
    // The hazard the null-prototype accumulator in `composeOperations` exists
    // for, converted from a docblock claim into a sensor — §9: *"a recorded
    // note is not a sensor."*
    //
    // `merged[id] = op` with `id === '__proto__'` on an ordinary `{}` does
    // **not** create a property: it invokes `Object.prototype`'s `__proto__`
    // setter and reassigns the accumulator's prototype. The operation
    // vanishes, `Object.keys` never sees it, and the registry is silently one
    // entry short with a corrupted prototype — which is strictly worse than
    // the `constructor` case above, because there is no wrong value to
    // notice, only an absence.
    //
    // The source table is built with `defineProperty` for the same reason the
    // entry above is annotated separately: written as a literal, `__proto__:`
    // is the setter too.
    const op: Operation = {
      id: '__proto__',
      subject: 'layer',
      verb: 'delete',
      label: 'Oddly named',
      mark: 'Oddly named',
      reason: 'A prototype-chain fixture.',
    }
    const odd = Object.defineProperty({}, '__proto__', {
      value: op,
      enumerable: true,
      writable: true,
      configurable: true,
    }) as OperationTable
    expect(Object.keys(odd), 'the fixture itself did not get an own property').toEqual(['__proto__'])

    const composed = composeOperations(OPERATIONS, odd)
    expect(Object.keys(composed), 'composition lost the entry to the prototype setter')
      .toContain('__proto__')
    expect(operationInfo('__proto__', composed)?.label).toBe('Oddly named')
  })

  it('is a guard and not a function that answers undefined to everything', () => {
    // §6.5a: the nulls above are evidence only because the same readers, asked
    // for something real, answer.
    for (const id of OPERATION_IDS) {
      expect(operationInfo(id), id).toBeDefined()
    }
    for (const name of Object.keys(ABSENT_OPERATIONS)) {
      expect(absentOperation(name), name).toBeDefined()
    }
  })

  it('does not derive an operation from an inherited roster member', () => {
    // The derivation's own door. `deriveLayerOperations` reads a per-variant
    // note out of a table keyed by variant name, so an unguarded `notes[v]`
    // answers with the `Object` function for a roster containing
    // `'constructor'` — and the operation would ship carrying a reason of
    // `undefined`, sailing straight past `unrecordedOperations`, which looks
    // for a word and not for a falsy value. Exactly the shape `controlspec.ts`
    // records for `specFor`.
    const polluted = deriveLayerOperations(['constructor'])
    expect(unrecordedOperations(polluted)).toEqual(['layer.create.constructor'])
    expect(polluted['layer.create.constructor']?.reason.length).toBeGreaterThan(0)
  })
})

describe('creation by type and the `type` control are different mechanisms', () => {
  it('keeps both, because they answer different questions', () => {
    // Acceptance criterion (c), as a sensor rather than a note — §9: *"a
    // recorded note is not a sensor."*
    //
    // `layer.<variant>.type` is registered in `CONTROLS` for every reachable
    // variant, and `layer.create.<variant>` is registered here for the same
    // set. That looks like a duplication and is not. The control edits
    // `layer.type` on a layer that **already exists**; the operation brings
    // one **into existence**. Design §5.6 is explicit about why the second
    // cannot be the first: *"a path-keyed control registry cannot express it:
    // adding a layer is a structural mutation on a discriminated union, and
    // the author must choose a variant before any control applies."*
    //
    // Removing the `CONTROLS` entry would break R6 — `type` is in every scene
    // file and is authorable — and would need a hand-written subtraction in a
    // registry that exists in order not to have one.
    //
    // This goes red if either half disappears, which is the point: whoever
    // deletes one has to come here and argue with the other.
    const typeControls = CONTROL_IDS.filter(id => id.startsWith('layer.') && id.endsWith('.type'))
    const targets = createTargets()
    expect(typeControls.length, 'the `type` control vanished from CONTROLS').toBeGreaterThan(0)
    expect(targets.length, 'create-by-type vanished from OPERATIONS').toBeGreaterThan(0)
    expect(
      typeControls.map(id => id.split('.')[1]).sort(),
      'the two mechanisms cover different variant sets, so one of them is stale',
    ).toEqual(targets)
  })

  it('records that converting an existing layer is neither of them', () => {
    // The trap the overlap actually hides, and the finding this task is
    // reporting upward. A generated enum widget over `layer.type` would let
    // an author switch `text` → `shape` and produce a scene with `text`,
    // `size`, `font` and `weight` still set and no `shape` key at all —
    // which `site/scene.ts` refuses on load. So the *third* mechanism, the
    // one that migrates a layer between variants, is owned by neither
    // registry today. Recorded as deferred rather than refused, because it is
    // an arriving-later and not an argued-against.
    const retype = absentOperation('layer.retype')
    expect(retype?.disposition).toBe('deferred')
    expect(retype?.reason.length ?? 0).toBeGreaterThan(0)
  })
})

describe('the operations the design has already decided against', () => {
  it('records a reason and a disposition for each, because the absence is the decision', () => {
    // C-1's convention, now the cluster's: *"a registry records decisions by
    // listing, and an absence is the one thing a list cannot record … a
    // comment above the registry is deleted by whoever adds the entry; a
    // table with a test over it has to be argued with."*
    const named = Object.keys(ABSENT_OPERATIONS)
    expect(named.length, 'nothing is absent, so this table is decorative').toBeGreaterThan(0)
    for (const key of named) {
      const absence = absentOperation(key)
      expect(absence?.operation, key).toBe(key)
      expect(absence?.reason.length ?? 0, `${key} is absent with no reason`).toBeGreaterThan(0)
      expect(OPERATION_DISPOSITIONS, `${key} has an undeclared disposition`)
        .toContain(absence?.disposition)
    }
  })

  it('is the runtime witness for the disposition pair, and uses both members', () => {
    // A refusal is argued with; a vacancy is filled. Conflating them is how a
    // deferred feature gets quietly reclassified as a rejected one by whoever
    // reads the table next. Both members must be in use or one of them is
    // dead vocabulary that nobody will notice has stopped meaning anything.
    const used = new Set(Object.values(ABSENT_OPERATIONS).map(a => a.disposition))
    expect([...used].sort()).toEqual([...OPERATION_DISPOSITIONS].sort())
  })

  it('names nothing it also registers', () => {
    expect(
      overlap(OPERATION_IDS, Object.keys(ABSENT_OPERATIONS)),
      'an operation is both registered and recorded absent, so one of the two is stale',
    ).toEqual([])
  })

  it('is a disjointness check that can see an overlap', () => {
    // The control for the null above (§6.5a). `overlap` is the same function.
    expect(overlap(OPERATION_IDS, ['layer.delete', 'layer.reorder'])).toEqual(['layer.delete'])
  })

  it('declares no placement, no visibility and no key', () => {
    // Three absences in the *shape*, which is where C-1's "make it
    // unrepresentable" half applies. An `Operation` that named its own panel
    // would make moving it cost an edit here and in `LayoutConfig`, which is
    // the pair of things design §11's first two rows exist to prevent. One
    // that declared its own visibility would break §11's completeness rule
    // one registry over from where C-2 and C-3 both declined it. One that
    // carried its own keystroke would make `KEYBINDINGS` (§11 row 5, C-8) a
    // second place every operation is registered.
    for (const id of OPERATION_IDS) {
      const fields = Object.keys(OPERATIONS[id]!)
      expect(fields, `${id} declares its own placement`).not.toContain('panel')
      expect(fields, `${id} declares its own visibility`).not.toContain('visible')
      expect(fields, `${id} declares its own keystroke`).not.toContain('key')
    }
  })
})

describe('the Operation shape', () => {
  it('is readable as a plain value without the registry', () => {
    // A registry hands out values, and a value that does not know its own name
    // forces every caller to carry the pair. Same reason `FitModeInfo.mode`
    // and `PanelInfo.panel` duplicate their keys.
    const one: Operation | undefined = operationInfo('layer.duplicate')
    expect(one?.id).toBe('layer.duplicate')
    expect(one?.subject).toBe('layer')
    expect(one?.verb).toBe('duplicate')
  })
})
