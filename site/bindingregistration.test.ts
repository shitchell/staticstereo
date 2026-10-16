import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PANEL_IDS, chromePanels } from './panels.js'
import {
  ABSENT_BINDINGS,
  BINDING_DISPOSITIONS,
  BINDING_IDS,
  CHROME_BINDING,
  KEYBINDINGS,
  MODIFIERS,
  absentBinding,
  auditKeybindings,
  bindingForChord,
  bindingInfo,
  chordId,
  chromeBindingInfo,
  composeKeybindings,
  conflictingChords,
  hiddenChrome,
  offeredBindings,
} from './keybindings.js'
import type { AbsentBinding, KeyBinding, KeyBindingTable } from './keybindings.js'

/**
 * `KEYBINDINGS`' registration test — design §11 row 5, plan §7 P3.3 item 3.
 *
 * ## The criterion this file is written against, and it was amended mid-phase
 *
 * Plan §7 P3.3 item 3 withdrew *"a dummy entry appears without touching
 * another file"* as *"always the wrong property"* and replaced it with:
 *
 * > adding an entry costs one declaration, and **everything else that must
 * > change is named by the compiler** rather than discovered at runtime or
 * > missed.
 *
 * *(`docs/plans/2026-10-13-editor-design.md:1176` still carries the withdrawn
 * sentence, because `c5e27f8` amended the execution plan alone. That is a stale
 * **assertion** in the sense of §9's row, not a stale pointer, and it is
 * reported rather than edited here — a `site/` test does not get to amend a
 * tier-0 document. Nothing in this file pins that sentence; the one design
 * sentence this registry does pin is §5.1's, in `keybindings.test.ts`, and §5.1
 * is untouched by the amendment.)*
 *
 * ## This registry has TWO registration doors and they answer differently
 *
 * That is the finding, and it is why the file is in two halves.
 *
 * - **In-module.** A further member of {@link BindingId} costs the union, the
 *   {@link BINDING_IDS} roster and the {@link KEYBINDINGS} entry — and **every
 *   one of them is named by the compiler**: the `AssertNever` pair names the
 *   roster, the `Record<BindingId, KeyBinding>` annotation names the missing
 *   entry. The cost does not leave the file. That is the amended criterion in
 *   its strong form, and the gate harness at the bottom of this file is what
 *   makes it visible to `npm test` — an `AssertNever` is enforced by
 *   `npm run typecheck` alone (§F-6), so without a spawned gate the whole
 *   claim is invisible to the leg the phase gate reads.
 * - **Out-of-module, through {@link composeKeybindings}.** This is the door
 *   §11 row 5 actually budgets — its mechanism column says *"a map"*, not
 *   *"`KEYBINDINGS` registry"*, and its cost column says **"one entry"** — a
 *   word no other row in that table uses. `keybindings.ts`' header names the
 *   callers by phase: *"P4 wants the arrows and `Delete`, P6 wants the
 *   transport keys and P3b wants undo; each lands as a `KeyBindingTable` in its
 *   own module and the shell composes."* Through that door **the compiler names
 *   nothing, because nothing else has to change** — and before this file the
 *   registry had no reader that could tell a consumer the entry was there.
 *
 * ## The gap, which is the same gap four consecutive tasks found
 *
 * §9: *"'registered' means the entry appears — not necessarily."* The question
 * to ask is **what does a consumer enumerate**, and for this registry the
 * consumer is named in the entry type's own docblocks: {@link KeyBinding.label}
 * is *"a help panel row, a menu item"* and {@link KeyBinding.caption} is *"what
 * to print in a `<kbd>`"*. A help panel enumerates.
 *
 * Every reader C-8 shipped answers a question you must already know the answer
 * to — `bindingInfo` wants an id, `bindingForChord` wants a chord. The only
 * enumerating answer in the module was {@link BINDING_IDS}, **an `as const`
 * tuple no registration can move**, which is `SHADINGS`' `SHADING_IDS` and
 * `VIEWS`' `VIEW_IDS` wearing another name. So a binding composed in by P4 was
 * reachable only by a caller who already knew its name, and invisible to the
 * one question the design says the consumer asks.
 *
 * {@link offeredBindings} is that reader, and {@link absentBinding} gained the
 * table parameter it lacked — without it the absence census row cannot move
 * whatever you do, which makes it an unchecked declaration (C-13's finding;
 * C-14 found two such rows left by C-6).
 *
 * ## Why a new file rather than an extension of `keybindings.test.ts`
 *
 * The gate harness spawns `svelte-check` over throwaway trees and costs
 * seconds, not milliseconds. Keeping it out of `keybindings.test.ts` keeps
 * C-8's fast assertions fast, and keeps the invariant against reformatting a
 * file this task was not asked to change.
 */

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

/* ------------------------------------------------------------------ *
 * The fixtures, and a guard that derives whether they are free.
 * ------------------------------------------------------------------ */

/**
 * The binding id this file registers.
 *
 * **Not free to choose, and two predecessors paid for assuming it was.** C-13's
 * first plant used `sepia`, which collided with its own `DUMMY` and reddened
 * four tests for reasons unrelated to the registration; C-7 measured with
 * `fill`, which is already an unknown-value fixture in `fit.test.ts`, and
 * because C-7 only ran `typecheck` the collision was invisible to it and would
 * have reddened two merged-phase tests the moment anyone ran the suite. The
 * guard below is derived rather than a list, for §9's reason: a list of
 * spellings in use goes stale the day somebody adds a fixture.
 */
const DUMMY = 'cycle-view'

/** The chord it claims. A function key, because every bare letter is cheap to collide with. */
const DUMMY_KEY = 'F13'

/** The chord {@link ABSENT_BINDINGS} is probed with, so the absence census has a row that can move. */
const ABSENT_DUMMY = 'F14'

const CHROME = chromePanels()
const PANELS_ALL = [...PANEL_IDS]

/** A well-formed entry, so a fixture can be wrong in exactly one field. */
function entry(over: Partial<KeyBinding> & { readonly binding: string }): KeyBinding {
  return {
    key: DUMMY_KEY,
    modifiers: [],
    caption: 'F13',
    label: 'Cycle the view',
    reason:
      'Registered by bindingregistration.test.ts to measure what §11 row 5\'s "one entry" costs.',
    hides: [],
    whileTyping: false,
    ...over,
  }
}

/** The registration itself: one declaration, in a table this module does not own. */
const REGISTERED: KeyBindingTable = { [DUMMY]: entry({ binding: DUMMY }) }

/** The same shape for the absence table, so its reader's seam is exercised too. */
const REGISTERED_ABSENCE: Readonly<Record<string, AbsentBinding>> = {
  [ABSENT_DUMMY]: {
    name: ABSENT_DUMMY,
    disposition: 'deferred',
    reason:
      'Registered by bindingregistration.test.ts so the absence census has a row a registration '
      + 'can move. Without the table parameter it could not move whatever this file did.',
    ownedBy: 'bindingregistration.test.ts',
  },
}

describe('the fixtures collide with nothing in play', () => {
  /**
   * Derived from every roster this registry reads and from the text of the test
   * files a plant can disturb — not from a list typed here. C-14 recommended
   * it, C-15 built it and it caught C-7's trap on the first try.
   */
  it('is a spelling no roster and no neighbouring fixture already uses', () => {
    const taken = new Set<string>([
      ...BINDING_IDS,
      ...Object.keys(KEYBINDINGS),
      ...Object.keys(ABSENT_BINDINGS),
      ...MODIFIERS,
      ...PANEL_IDS,
      ...BINDING_DISPOSITIONS,
    ])
    for (const info of Object.values(KEYBINDINGS)) {
      taken.add(info.key)
      taken.add(info.caption)
      taken.add(chordId(info))
    }
    // The two test files a plant in this registry can redden. `panels.test.ts`
    // is in the set because `keybindings.ts` imports `chromePanels` from it,
    // which is this sub-cluster's only production import edge.
    for (const file of ['keybindings.test.ts', 'panels.test.ts']) {
      const text = readFileSync(join(ROOT, 'site', file), 'utf8')
      for (const m of text.matchAll(/'([A-Za-z][A-Za-z0-9-]*)'/g)) taken.add(m[1]!)
    }
    // Not vacuous: the set really does hold the spellings a collision would be
    // with, including both halves of the shipped registry.
    expect(taken.has('hide-chrome')).toBe(true)
    expect(taken.has('Escape')).toBe(true)
    expect(taken.has('Tab')).toBe(true)
    for (const fixture of [DUMMY, DUMMY_KEY, ABSENT_DUMMY]) {
      expect(taken.has(fixture), `"${fixture}" is already a spelling in play`).toBe(false)
    }
  })
})

/* ------------------------------------------------------------------ *
 * The out-of-module door: one entry, and a consumer can use it.
 * ------------------------------------------------------------------ */

describe('registering through composeKeybindings costs one entry (design §11 row 5)', () => {
  const merged = composeKeybindings(KEYBINDINGS, REGISTERED)

  it('puts the binding on the menu a consumer enumerates, not merely in the table', () => {
    // §9: *"a registration test must assert that the thing a consumer does is
    // now possible — not that the entry can be found."* The thing the consumer
    // does is enumerate: `KeyBinding.label` is "a help panel row, a menu item".
    expect(offeredBindings(merged).map(b => b.binding)).toContain(DUMMY)
    const offered = offeredBindings(merged).find(b => b.binding === DUMMY)!
    expect(offered.label, 'a help panel row with no label is not a menu item').toBe('Cycle the view')
    expect(offered.caption, 'a <kbd> with nothing to print in it').toBe('F13')
  })

  it('is not on the menu before it is registered, so the test above can fail', () => {
    expect(offeredBindings(KEYBINDINGS).map(b => b.binding)).not.toContain(DUMMY)
  })

  it('leaves BINDING_IDS where it was, which is why the reader was needed', () => {
    // The paired control for the whole file. `BINDING_IDS` is an `as const`
    // tuple: the module's only enumerating answer before this task, and one no
    // registration through the shipped door can move. A consumer reading it
    // would offer the author a menu with the new binding missing, and nothing
    // anywhere would be red.
    expect([...BINDING_IDS]).not.toContain(DUMMY)
    expect(offeredBindings(merged).length).toBeGreaterThan(BINDING_IDS.length)
  })

  it('is reachable by the chord a keydown handler holds', () => {
    expect(bindingForChord(DUMMY_KEY, merged)?.binding).toBe(DUMMY)
  })

  it('passes the audit, so the registration is complete rather than merely present', () => {
    expect(auditKeybindings(merged, CHROME, PANELS_ALL)).toEqual([])
  })

  it('costs nothing in the shipped table, which is what "its own module" means', () => {
    expect(Object.keys(KEYBINDINGS).sort()).toEqual([...BINDING_IDS].sort())
  })
})

describe('the absence table registers the same way, through the same kind of seam', () => {
  const absence = { ...ABSENT_BINDINGS, ...REGISTERED_ABSENCE }

  it('resolves a chord argued against in a table this module does not own', () => {
    expect(absentBinding(ABSENT_DUMMY, absence)?.disposition).toBe('deferred')
  })

  it('does not resolve it from the shipped table, so the row above can move', () => {
    expect(absentBinding(ABSENT_DUMMY)).toBeUndefined()
  })

  it('still refuses the prototype chain on the widened reader', () => {
    for (const name of ['constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
      expect(absentBinding(name, absence), `absentBinding('${name}', table)`).toBeUndefined()
    }
    expect(absentBinding('__proto__', absence)).toBeUndefined()
  })
})

/* ------------------------------------------------------------------ *
 * The enumerator, and the shape the prototype clause takes for one.
 * ------------------------------------------------------------------ */

describe('the enumerator cannot offer a row the lookup would refuse', () => {
  /**
   * C-13's finding, confirmed by C-14 and structural rather than tested-for:
   * `Object.prototype`'s members are **non-enumerable**, so the lookup hazard
   * does not transfer to an enumerator. What bites an enumerator is a table
   * built on another table, where `for…in` offers rows the lookup then refuses.
   * {@link offeredBindings} is defined in terms of {@link bindingInfo}, which
   * makes the divergence impossible rather than merely absent — and these
   * plants are what show the two readers actually agree.
   */
  it('offers only own entries of a table built on another table', () => {
    const inherited: KeyBindingTable = Object.create(KEYBINDINGS) as KeyBindingTable
    const own = { ...inherited, [DUMMY]: entry({ binding: DUMMY }) }
    Object.setPrototypeOf(own, KEYBINDINGS)
    expect(offeredBindings(own).map(b => b.binding)).toEqual([DUMMY])
    // ...and the lookup agrees, which is the property being asserted.
    expect(bindingInfo(CHROME_BINDING, own)).toBeUndefined()
  })

  it('is not a reader that answers with nothing, which would pass the test above', () => {
    expect(offeredBindings(KEYBINDINGS).length).toBe(BINDING_IDS.length)
  })

  it('offers a binding genuinely named for an inherited member', () => {
    // A **computed** key for `__proto__`: the literal `__proto__:` form sets
    // the prototype instead of creating a property, so the naive fixture is
    // empty and the test passes for the wrong reason (C-8's measurement).
    // The values are annotated separately because a property named
    // `constructor` gets no contextual type from a `Record<string, T>`.
    const odd: KeyBinding = entry({ binding: 'constructor' })
    const odder: KeyBinding = entry({ binding: '__proto__', key: 'F15', caption: 'F15' })
    const table: KeyBindingTable = { constructor: odd, ['__proto__']: odder }
    expect(offeredBindings(table).map(b => b.binding).sort()).toEqual(['__proto__', 'constructor'])
  })
})

/* ------------------------------------------------------------------ *
 * The census: what moved, what did not, and who could have moved it.
 * ------------------------------------------------------------------ */

/**
 * Every question this module answers from a table, as sorted `[label, value]`.
 *
 * C-9's idiom, parameterised on **both** tables for C-13's reason: without the
 * absence table as a parameter its row cannot move whatever the registration
 * does, which makes it an unchecked declaration rather than a measurement.
 */
/** A reader's answer, or the first line of its refusal. See the census row that uses it. */
function refusalOr(answer: () => string): string {
  try {
    return answer()
  } catch (error) {
    return `refused: ${(error as Error).message.split('.')[0]!}`
  }
}

function census(
  table: KeyBindingTable,
  absence: Readonly<Record<string, AbsentBinding>>,
): readonly (readonly [string, string])[] {
  const offered = offeredBindings(table)
  const rows: (readonly [string, string])[] = [
    ['offeredBindings/ids', offered.map(b => b.binding).sort().join(',')],
    ['offeredBindings/count', String(offered.length)],
    ['offeredBindings/captions', offered.map(b => b.caption).sort().join(',')],
    ['bindingInfo/dummy', String(bindingInfo(DUMMY, table)?.key)],
    ['bindingInfo/chrome', String(bindingInfo(CHROME_BINDING, table)?.key)],
    ['bindingForChord/dummy', String(bindingForChord(DUMMY_KEY, table)?.binding)],
    [
      'bindingForChord/chrome',
      String(bindingForChord(chordId(KEYBINDINGS[CHROME_BINDING]), table)?.binding),
    ],
    ['chromeBindingInfo/binding', String(chromeBindingInfo(table)?.binding)],
    ['conflictingChords/chords', conflictingChords(table).join(',')],
    // Recorded as a refusal rather than allowed to throw, because
    // `composeKeybindings` is the one reader whose answer to a malformed table
    // is an exception. A census row that aborts the census measures nothing
    // about the other twelve rows, and the refusal is itself an answer that a
    // registration can move.
    ['composeKeybindings/ids', refusalOr(() => Object.keys(composeKeybindings(table)).sort().join(','))],
    ['auditKeybindings/complaints', String(auditKeybindings(table, CHROME, PANELS_ALL).length)],
    ['absentBinding/dummy', String(absentBinding(ABSENT_DUMMY, absence)?.disposition)],
    ['absentBinding/shipped', String(absentBinding('Tab', absence)?.disposition)],
    // **Declared, not measured** — C-11's honest form for a row with no mover.
    // `hiddenChrome()` reads `panels.ts` directly and takes no parameter, so no
    // registration in *this* registry can move it. It is in the census because
    // it is a question the module answers, and it is labelled here so that the
    // gap is a recorded fact rather than a silent one. The thing that *does*
    // move it is a change in `panels.ts`, measured in `keybindings.test.ts`.
    ['hiddenChrome/count — declared, not measured', String(hiddenChrome().length)],
  ]
  return [...rows].sort((a, b) => (a[0] < b[0] ? -1 : 1))
}

const labelsOf = (rows: readonly (readonly [string, string])[]): readonly string[] =>
  rows.map(([label]) => label)

const movedBetween = (
  before: readonly (readonly [string, string])[],
  after: readonly (readonly [string, string])[],
): readonly string[] =>
  before.filter((row, i) => row[1] !== after[i]![1]).map(([label]) => label)

/**
 * The exported readers that take a table, parsed out of the module's source.
 *
 * C-11's idiom and the only thing in three censuses that catches a row
 * **deleted** from the census: a label set computed by the same function on
 * both sides cannot see a row that vanished from both. Derived from the thing
 * that makes a function one of these — a table in its parameter list — rather
 * than from an enumeration somebody typed.
 */
function tableReadersInSource(): readonly string[] {
  const source = readFileSync(join(ROOT, 'site', 'keybindings.ts'), 'utf8')
  const found = [...source.matchAll(/^export function (\w+)\(([\s\S]*?)\)(?=:)/gm)]
    .filter(m => /KeyBindingTable|ABSENT_BINDINGS/.test(m[2]!))
    .map(m => m[1]!)
  if (found.length === 0) {
    throw new Error('keybindings.ts declares no exported reader that takes a table')
  }
  return found.sort()
}

describe('the census says what a registration moves, and what it does not', () => {
  const before = census(KEYBINDINGS, ABSENT_BINDINGS)
  const afterBinding = census(composeKeybindings(KEYBINDINGS, REGISTERED), ABSENT_BINDINGS)
  const afterAbsence = census(KEYBINDINGS, { ...ABSENT_BINDINGS, ...REGISTERED_ABSENCE })

  it('exercises every exported reader that takes a table', () => {
    // The vacuity floor, derived as two populations on one run where one
    // structurally contains the other: the census's label prefixes against the
    // module's own parsed signatures. No number is typed, and a reader added to
    // `keybindings.ts` tomorrow and left out of this census is red here.
    const prefixes = new Set(labelsOf(before).map(label => label.split('/')[0]!))
    const readers = tableReadersInSource()
    expect(readers.length, 'the parse found no readers, so the check below is vacuous')
      .toBeGreaterThan(0)
    for (const reader of readers) {
      expect([...prefixes], `${reader} takes a table and has no census row`).toContain(reader)
    }
  })

  it('refuses to answer when the module can no longer be parsed, rather than answering nothing', () => {
    // C-5's rule, applied to this file's own instrument: a parser that returns
    // nothing makes everything below it vacuous, so it must refuse instead.
    expect(() => {
      const found = [...'export const NOTHING = 1\n'.matchAll(/^export function (\w+)\(/gm)]
      if (found.length === 0) throw new Error('declares no exported reader that takes a table')
      return found
    }).toThrow(/no exported reader/)
  })

  it('keeps the label set identical across the registration', () => {
    // Asserted before the value diff. Without it a vanished label misaligns the
    // positional comparison and names rows as moved that did not move.
    expect(labelsOf(afterBinding)).toEqual(labelsOf(before))
    expect(labelsOf(afterAbsence)).toEqual(labelsOf(before))
  })

  it('moves exactly the rows a binding registration should move', () => {
    expect(movedBetween(before, afterBinding)).toEqual([
      'bindingForChord/dummy',
      'bindingInfo/dummy',
      'composeKeybindings/ids',
      'offeredBindings/captions',
      'offeredBindings/count',
      'offeredBindings/ids',
    ])
  })

  it('moves exactly one row for an absence registration, and it is a different row', () => {
    expect(movedBetween(before, afterAbsence)).toEqual(['absentBinding/dummy'])
  })

  it('gives every row that did not move a mover from the other side', () => {
    // C-10's P12, which it called the most valuable thing in its report: a row
    // that is *not supposed* to move under a registration is unfalsifiable
    // unless something else can move it. Each of these is a second control.
    const onlyDummy: KeyBindingTable = { [DUMMY]: entry({ binding: DUMMY }) }
    const clashing: KeyBindingTable = {
      ...KEYBINDINGS,
      [DUMMY]: entry({ binding: DUMMY, key: KEYBINDINGS[CHROME_BINDING].key }),
    }
    const malformed: KeyBindingTable = { ...KEYBINDINGS, [DUMMY]: entry({ binding: 'elsewhere' }) }
    const withoutTab = Object.fromEntries(
      Object.entries(ABSENT_BINDINGS).filter(([name]) => name !== 'Tab'),
    )
    expect(movedBetween(before, census(onlyDummy, ABSENT_BINDINGS)))
      .toContain('chromeBindingInfo/binding')
    expect(movedBetween(before, census(onlyDummy, ABSENT_BINDINGS)))
      .toContain('bindingForChord/chrome')
    expect(movedBetween(before, census(onlyDummy, ABSENT_BINDINGS)))
      .toContain('bindingInfo/chrome')
    expect(movedBetween(before, census(clashing, ABSENT_BINDINGS)))
      .toContain('conflictingChords/chords')
    expect(movedBetween(before, census(malformed, ABSENT_BINDINGS)))
      .toContain('auditKeybindings/complaints')
    expect(movedBetween(before, census(KEYBINDINGS, withoutTab)))
      .toContain('absentBinding/shipped')
  })

  it('leaves exactly one row with no mover, and it is the one labelled as such', () => {
    // The honest complement of the test above. If a second row ever loses its
    // mover, this is red and whoever added it has to say so in the label.
    const movable = new Set<string>()
    const onlyDummy: KeyBindingTable = { [DUMMY]: entry({ binding: DUMMY }) }
    const clashing: KeyBindingTable = {
      ...KEYBINDINGS,
      [DUMMY]: entry({ binding: DUMMY, key: KEYBINDINGS[CHROME_BINDING].key }),
    }
    const malformed: KeyBindingTable = { ...KEYBINDINGS, [DUMMY]: entry({ binding: 'elsewhere' }) }
    const withoutTab = Object.fromEntries(
      Object.entries(ABSENT_BINDINGS).filter(([name]) => name !== 'Tab'),
    )
    for (const moved of [
      movedBetween(before, afterBinding),
      movedBetween(before, afterAbsence),
      movedBetween(before, census(onlyDummy, ABSENT_BINDINGS)),
      movedBetween(before, census(clashing, ABSENT_BINDINGS)),
      movedBetween(before, census(malformed, ABSENT_BINDINGS)),
      movedBetween(before, census(KEYBINDINGS, withoutTab)),
    ]) {
      for (const label of moved) movable.add(label)
    }
    const unmoved = labelsOf(before).filter(label => !movable.has(label))
    expect(unmoved).toEqual(['hiddenChrome/count — declared, not measured'])
  })
})

/* ------------------------------------------------------------------ *
 * The in-module door: what the compiler names, measured by spawning it.
 * ------------------------------------------------------------------ */

/**
 * C-15's harness, reused with its structure and its D5 discipline intact, and
 * extended by one plant.
 *
 * **What the extra plant is for, and it is the half C-15 did not need.** For
 * `FIT_MODES` the incomplete registration already named a second file, so the
 * gate was visibly able to name one. Here it is **not**: every error a
 * `KEYBINDINGS` registration produces is in `keybindings.ts`. So
 * *"no second file was needed"* would be indistinguishable from *"the
 * instrument cannot see a second file"* — a null measurement with no control,
 * which §6.5a forbids. The `coupledConsumer` plant supplies the control: it
 * adds a file that is total over `BindingId`, and the gate names it. That also
 * answers plan item 8's open question from the only side that can be measured
 * here: **a registration would cost a named edit in another file exactly when
 * that file is type-coupled to the roster, and nothing else would be named.**
 */

const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}

const GATE_TSCONFIG = 'tsconfig.typecheck.json'

/**
 * The checker's output format, pinned on the command line rather than inherited.
 *
 * `svelte-check` 4.7.6 picks its format in `getOutputFormat()`, and with no
 * `--output` flag the choice is
 * `process.env.CLAUDECODE === '1' ? 'machine' : 'human-verbose'`. `runGate`
 * hands the child `...process.env`, so the format was being decided by whether
 * the suite happened to run from inside Claude Code — green locally, and on a
 * GitHub runner the human format that carries no `COMPLETED` line at all. That
 * is what held `main`'s CI red, and undeployed, for nine hours. `CLAUDECODE`
 * is deleted from the child's environment for the other half of it: with the
 * ambient switch gone, dropping this flag reddens the suite everywhere rather
 * than only where nobody was watching. Full account in
 * `site/fitregistration.test.ts`'s `MACHINE_OUTPUT`.
 */
const MACHINE_OUTPUT = ['--output', 'machine'] as const

/** The file the coupled-consumer control plants, named so a failure says what it was. */
const CONSUMER_FILE = 'bindingconsumerplant.ts'

interface GateResult {
  /** Distinct files the checker named, as it spelled them. */
  readonly files: readonly string[]
  /** Every message, so an assertion can say which error it wanted. */
  readonly messages: readonly string[]
  /** `COMPLETED <n> FILES` — the size of the surface the claim is over. */
  readonly filesChecked: number
  /** `COMPLETED … <n> ERRORS`, read from the checker rather than counted here. */
  readonly errorCount: number
  readonly raw: string
}

/**
 * The project's own `typecheck` command, as tokens.
 *
 * Derived from `package.json` for `typecheck-gate.test.ts`'s recorded reason: a
 * hand-written copy keeps passing on the day somebody changes the real one, and
 * the real one is what the phase gate reads `$?` from.
 */
function typecheckCommand(): readonly string[] {
  const script = PKG.scripts.typecheck
  expect(script, 'package.json has no "typecheck" script').toBeTypeOf('string')
  expect(script, 'typecheck must stay a single command — see comment').not.toMatch(/[&|;><]/)
  const tokens = script!.trim().split(/\s+/)
  expect(
    tokens.some(t => t.endsWith(GATE_TSCONFIG)),
    `typecheck must name ${GATE_TSCONFIG}`,
  ).toBe(true)
  // And must leave `--output` to the harness: a repeated `--output` is not
  // "last wins". mri collects the duplicate into an array, svelte-check's
  // `outputFormats.includes()` fails on it, and the format silently reverts to
  // human — measured at 4.7.6. See `MACHINE_OUTPUT`.
  expect(
    tokens.some(t => t === '--output' || t.startsWith('--output=')),
    'typecheck must not pin --output; this harness pins it — see MACHINE_OUTPUT',
  ).toBe(false)
  return tokens
}

/** The gate's configs are commented JSON, which `JSON.parse` refuses. */
function stripJsonComments(text: string): string {
  return text.replace(/^\s*\/\/.*$/gm, '')
}

/**
 * A throwaway tree the gate can be pointed at.
 *
 * `site/` is copied because it is what gets planted; `src/` and `node_modules`
 * are symlinked. Editing the real files in place for the seconds a gate run
 * takes would race every other test file — vitest runs them in parallel
 * workers, and several import `keybindings.ts`.
 */
function makeTree(): string {
  const tree = mkdtempSync(join(tmpdir(), 'stst-binding-registration-'))
  symlinkSync(join(ROOT, 'node_modules'), join(tree, 'node_modules'))
  symlinkSync(join(ROOT, 'src'), join(tree, 'src'))
  cpSync(join(ROOT, 'package.json'), join(tree, 'package.json'))
  for (const name of readdirSync(ROOT)) {
    if (name.startsWith('tsconfig') && name.endsWith('.json')) {
      cpSync(join(ROOT, name), join(tree, name))
    }
  }
  cpSync(join(ROOT, 'site'), join(tree, 'site'), { recursive: true })

  // Soundness: the claim is "no OTHER file needed editing", and that is only as
  // wide as the surface the checker opened. A gate config that grew an
  // `include` the copy does not contain would silently shrink the surface.
  const gate = readFileSync(join(tree, GATE_TSCONFIG), 'utf8')
  for (const dir of JSON.parse(stripJsonComments(gate)).include as string[]) {
    expect(existsSync(join(tree, dir)), `gate includes "${dir}", copy has no such path`).toBe(true)
  }
  return tree
}

/**
 * Apply one substitution, and fail if it did not land.
 *
 * The whole harness is a null measurement without this. A plant whose pattern
 * stopped matching produces an unplanted tree, the gate reports zero errors,
 * and the propagation test goes **green for the wrong reason**.
 */
function substitute(text: string, pattern: RegExp, replacement: string, what: string): string {
  const matches = text.match(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`))
  expect(matches?.length, `plant "${what}" matched ${matches?.length ?? 0} times, wanted 1`).toBe(1)
  return text.replace(pattern, replacement)
}

/** Add the member to the union, and nothing else. */
function plantUnion(tree: string): void {
  const path = join(tree, 'site', 'keybindings.ts')
  writeFileSync(
    path,
    substitute(
      readFileSync(path, 'utf8'),
      /^(export type BindingId = .*)$/m,
      `$1 | '${DUMMY}'`,
      'BindingId union member',
    ),
  )
}

/** List it in the roster, which is what the `AssertNever` pair's error asks for. */
function plantRoster(tree: string): void {
  const path = join(tree, 'site', 'keybindings.ts')
  writeFileSync(
    path,
    substitute(
      readFileSync(path, 'utf8'),
      /^(export const BINDING_IDS = \[[^\]]*)\] as const$/m,
      `$1, '${DUMMY}'] as const`,
      'BINDING_IDS roster member',
    ),
  )
}

/** Write the entry, which is what the annotation's error asks for. */
function plantEntry(tree: string): void {
  const path = join(tree, 'site', 'keybindings.ts')
  writeFileSync(
    path,
    substitute(
      readFileSync(path, 'utf8'),
      // Deliberately blind to the ANNOTATION and matched only on the opening of
      // the literal, C-15's D2: pinning `Record<BindingId, KeyBinding>` here
      // would make the registry's totality a premise of the harness instead of
      // something the first test measures.
      /^(export const KEYBINDINGS:[^=]*= \{)$/m,
      `$1\n  '${DUMMY}': {\n    binding: '${DUMMY}',\n    key: '${DUMMY_KEY}',\n`
        + `    modifiers: [],\n    caption: 'F13',\n    label: 'Cycle the view',\n`
        + `    reason: 'Planted by bindingregistration.test.ts to measure a registration.',\n`
        + `    hides: [],\n    whileTyping: false,\n  },`,
      'KEYBINDINGS entry',
    ),
  )
}

/**
 * Add a second file that is total over `BindingId` — the control for the
 * negative. Written into the tree rather than committed, because committing it
 * would add a real coupling the repository does not have and does not want.
 */
function plantCoupledConsumer(tree: string): void {
  writeFileSync(
    join(tree, 'site', CONSUMER_FILE),
    "import type { BindingId } from './keybindings.js'\n\n"
      + 'export const HELP_ORDER: Record<BindingId, number> = {\n'
      + "  'hide-chrome': 0,\n  'show-chrome': 1,\n}\n",
  )
}

/** Run the project's own type gate over a tree and read what it named. */
function runGate(tree: string): Promise<GateResult> {
  const [cmd, ...args] = typecheckCommand()
  return new Promise((resolve, reject) => {
    // Annotated rather than inferred: the inferred spread has `PATH` required
    // and no index signature, and `delete` is only legal on an optional one.
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `${join(ROOT, 'node_modules', '.bin')}:${process.env.PATH}`,
    }
    // The ambient format switch, removed so the format is decided in exactly
    // one place — see `MACHINE_OUTPUT`.
    delete env.CLAUDECODE
    const child = spawn(cmd!, [...args, ...MACHINE_OUTPUT], { cwd: tree, env })
    let raw = ''
    child.stdout.on('data', (d: Buffer) => { raw += d.toString() })
    child.stderr.on('data', (d: Buffer) => { raw += d.toString() })
    child.on('error', reject)
    child.on('close', (code, signal) => {
      const errors = [...raw.matchAll(/^\d+ ERROR "([^"]+)" \d+:\d+ "((?:[^"\\]|\\.)*)"$/gm)]
        .map(m => ({ file: m[1]!, message: m[2]!.replace(/\\(.)/g, '$1') }))
      const completed = /^\d+ COMPLETED (\d+) FILES (\d+) ERRORS/m.exec(raw)
      if (completed === null) {
        // C-15's D5, and the single most important line in the harness: a
        // format this file cannot read must not look like a clean run.
        //
        // Two corrections to how it said so. It must name which of two
        // **opposite** diagnoses applies — "the checker did not run, or
        // printed something unparseable" is not "the compiler declined to
        // report the error the criterion needs", and an `expect` on a null
        // match reported both as `expected null not to be null`. And it must
        // reject rather than throw into this callback: the throw escaped as an
        // uncaught exception, the promise never settled, and `beforeAll` sat
        // out its full 600s timeout — which is the whole of CI's 10m45s.
        reject(new Error(
          'the type gate emitted no machine-format COMPLETED line, so it did not run or '
          + 'could not be read. This is NOT a missing compiler error: the criterion was '
          + `never measured. exit=${code} signal=${signal} tree=${tree}\n${raw}`,
        ))
        return
      }
      resolve({
        files: [...new Set(errors.map(e => e.file))].sort(),
        messages: errors.map(e => e.message),
        filesChecked: Number(completed![1]),
        errorCount: Number(completed![2]),
        raw,
      })
    })
  })
}

/** The states the in-module registration passes through, measured in one pass. */
const PLANTS = {
  /**
   * The union alone — an incomplete registration, and deliberately so.
   *
   * The intermediate state (union + roster, entry still missing) is **not**
   * measured, and the omission is a cost decision rather than an oversight:
   * each gate run is ~9s of the suite's wall time, and this plant's two errors
   * already name both mechanisms separately, by message. What the dropped run
   * would have added is the *order* they clear in, which no claim here rests on.
   */
  unionOnly: [plantUnion],
  /** The whole registration. */
  complete: [plantUnion, plantRoster, plantEntry],
  /** The complete registration, plus a file type-coupled to the roster. */
  coupledConsumer: [plantUnion, plantRoster, plantEntry, plantCoupledConsumer],
} as const

type PlantName = keyof typeof PLANTS

const trees: string[] = []
let gate: Record<PlantName, GateResult>

/**
 * **Sequential, and that is a measured decision rather than a style.**
 *
 * C-15 issues its three gate runs concurrently and says so, which is right for
 * a file in isolation. A *second* harness in the same suite is not in
 * isolation: with `site/fitregistration.test.ts`' three and
 * `site/typecheck-gate.test.ts`' two already in flight, four more concurrent
 * `svelte-check` processes over a 446-file surface **timed out
 * `src/node/metamorphic.real.test.ts`' 5s `linked` case**, a merged-phase test
 * that takes ~3.1s unloaded. Awaiting them one at a time caps this file's
 * contribution at one process and costs no measurable wall time, because the
 * concurrent form was contending for the same cores anyway.
 *
 * The transferable half, for whoever adds a third harness: **the cost of this
 * instrument is peak CPU, not its own duration**, and the thing it breaks is
 * somebody else's timeout.
 */
beforeAll(async () => {
  const names = Object.keys(PLANTS) as PlantName[]
  const results: GateResult[] = []
  for (const name of names) {
    const tree = makeTree()
    trees.push(tree)
    for (const plant of PLANTS[name]) plant(tree)
    results.push(await runGate(tree))
  }
  gate = Object.fromEntries(names.map((n, i) => [n, results[i]!])) as Record<PlantName, GateResult>
}, 600_000)

afterAll(() => {
  for (const tree of trees) rmSync(tree, { recursive: true, force: true })
})

describe('adding a binding in-module is a compile error naming each missing edit', () => {
  it('names the roster and the registry while the registration is incomplete', () => {
    expect(gate.unionOnly.files, gate.unionOnly.raw).toEqual(['site/keybindings.ts'])
    expect(gate.unionOnly.errorCount).toBe(2)
    // The `AssertNever` pair by its observable consequence rather than by its
    // spelling, and the annotation by its own message. These two errors ARE
    // the mechanism §11 row 5's budget turns on.
    expect(gate.unionOnly.messages.join('\n')).toContain("does not satisfy the constraint 'never'")
    expect(gate.unionOnly.messages.join('\n')).toContain(`Property '"${DUMMY}"' is missing`)
  })

  it('leaves the whole type-check surface clean once the entry is written', () => {
    expect(gate.complete.errorCount, gate.complete.raw).toBe(0)
    expect(gate.complete.files).toEqual([])
  })

  it('measured the same surface in every state, so "nothing else" is one size', () => {
    const sizes = new Set([gate.unionOnly.filesChecked, gate.complete.filesChecked])
    expect(sizes.size, JSON.stringify([...sizes])).toBe(1)
    // ...and the surface is the whole project rather than a corner of it.
    // Derived from the tree: a literal here would be stale by the next commit.
    const onDisk = readdirSync(join(ROOT, 'site')).filter(n => n.endsWith('.ts')).length
    expect([...sizes][0]!).toBeGreaterThan(onDisk)
  })
})

describe('the clean surface is a measurement, not a blind spot (§6.5a control)', () => {
  /**
   * The paired control the negative above needs. Without it, *"no second file
   * was needed"* and *"this instrument cannot name a second file"* produce the
   * same output — and for this registry, unlike `FIT_MODES`, no plant in the
   * sequence above ever names one.
   */
  it('names a second file the moment one is type-coupled to the roster', () => {
    expect(gate.coupledConsumer.files, gate.coupledConsumer.raw).toEqual([`site/${CONSUMER_FILE}`])
    expect(gate.coupledConsumer.errorCount).toBe(1)
    expect(gate.coupledConsumer.messages[0]).toContain(`Property '"${DUMMY}"' is missing`)
  })

  it('checked one more file than the uncoupled runs, so the control really was added', () => {
    expect(gate.coupledConsumer.filesChecked).toBe(gate.complete.filesChecked + 1)
  })

  it('has no such consumer in the real tree, which is why the surface above is clean', () => {
    // The control is planted rather than committed. Asserting the real tree has
    // none keeps the two claims from drifting apart: if somebody adds a file
    // total over `BindingId` tomorrow, the registration cost changes and this
    // is the test that says so.
    const all = readdirSync(join(ROOT, 'site')).filter(name => name.endsWith('.ts'))
    const importers = all
      .filter(name => name !== 'keybindings.ts')
      .filter(name =>
        /from '\.\/keybindings\.js'/.test(readFileSync(join(ROOT, 'site', name), 'utf8')))
    // Not vacuous: the scan does find this file and C-8's, so an empty
    // production list below is a fact about the tree and not a broken scan.
    expect(importers, 'the importer scan found nothing at all').toContain('keybindings.test.ts')
    expect(importers).toContain('bindingregistration.test.ts')
    expect(
      importers.filter(name => !name.endsWith('.test.ts')),
      'keybindings.ts has gained a production importer, so the registration cost may have changed',
    ).toEqual([])
  })
})
