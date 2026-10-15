/**
 * `KEYBINDINGS`: the one binding design §5.1 names, and the vocabulary a
 * second one costs one entry in.
 *
 * Design §11 row 5 budgets *"keybindings — a map — one entry"*, and §11 says
 * why that gets a test rather than a comment: *"without that, 'moving a panel
 * costs a declaration' is unverified until the first time it is false."*
 *
 * **What each guard in this file actually guards**, because the registry has
 * two halves and only one of them is derived (C-3's §9 trap row: *"a guard
 * derived from the roster it guards proves only that the derivation ran
 * twice"*):
 *
 * - **The chrome set is derived** from `panels.ts`' {@link chromePanels}.
 *   Asserting it equals `chromePanels()` would be the derivation running
 *   twice, so this file does not. What it asserts instead is a *relation* that
 *   can fail: the hidden set is a **non-empty strict subset** of the panels, so
 *   a registry that hides nothing and a registry that hides the canvas too are
 *   both red. That relation is a fact about `panels.ts`, not about this file.
 * - **The chord, the caption and the typing rule are declared here**, and are
 *   checked against upstreams that are not this module: design §5.1's sentence,
 *   `site/main.ts`' `event.key` comparison, and `site/index.html`'s `<kbd>`.
 *
 * **The upstreams are parsed, and each parser has its own vacuity control.**
 * C-5's rule: a parser that returns nothing makes every assertion below it
 * vacuous, so each one here refuses to answer rather than answering nothing,
 * and a test drives that refusal.
 *
 * **E13's cost is taken deliberately.** A `site/` test now reddens on an edit
 * to `docs/`. For this registry the coupling *is* the deliverable — §5.1's one
 * sentence is the registry's entire reason to exist at P3a — and C-6 measured
 * the design doc's churn on this branch at **0** against the execution plan's
 * 3, so the cheap upstream is the one being read.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PANELS, PANEL_IDS, chromePanels, panelInfo } from './panels.js'
import {
  ABSENT_BINDINGS,
  BINDING_DISPOSITIONS,
  BINDING_IDS,
  CHROME_BINDING,
  CHROME_BINDING_PROVENANCE,
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
} from './keybindings.js'
import type { AbsentBinding, KeyBinding, KeyBindingTable } from './keybindings.js'

const from = (relative: string): string => fileURLToPath(new URL(`../${relative}`, import.meta.url))

const DESIGN = 'docs/plans/2026-10-13-editor-design.md'
const SHELL = 'site/main.ts'
const MARKUP = 'site/index.html'

/**
 * Design §5.1's sentence, or a refusal.
 *
 * The *whole* floor for this registry: §5.1 names exactly one keybinding and
 * no other section names any, so a registry with no binding that hides chrome
 * is a registry with nothing in it that anybody asked for. Returning the
 * sentence rather than a boolean is what lets the vacuity control below see
 * the difference between "absent" and "found nothing".
 */
function chromeSentence(markdown: string): string {
  const found = markdown.match(/One key hides all chrome\./)
  if (found === null) {
    throw new Error(`${DESIGN} no longer contains design §5.1's "One key hides all chrome."`)
  }
  return found[0]
}

/**
 * The key values `site/main.ts` compares a `KeyboardEvent.key` against.
 *
 * The shipped half of this registry, read out of the shell rather than
 * restated here. `main.ts` is **not** importable from a test — it is DOM
 * wiring with module-level side effects — so this is a source parse and not
 * C-7's "execute the executable upstream". Saying so is cheaper than
 * pretending the weaker instrument is the stronger one.
 */
function comparedKeys(source: string): readonly string[] {
  const found = [...source.matchAll(/\bevent\.key\s*[!=]==\s*'([^']*)'/g)].map(match => match[1]!)
  if (found.length === 0) {
    throw new Error(`${SHELL} no longer compares event.key against any key`)
  }
  return [...new Set(found)].sort()
}

/** The key captions `site/index.html` prints in a `<kbd>`, deduplicated. */
function kbdCaptions(html: string): readonly string[] {
  const found = [...html.matchAll(/<kbd>([^<]*)<\/kbd>/g)].map(match => match[1]!.trim())
  if (found.length === 0) throw new Error(`${MARKUP} no longer prints any <kbd>`)
  return [...new Set(found)].sort()
}

const DESIGNED = chromeSentence(readFileSync(from(DESIGN), 'utf8'))
const SHELL_KEYS = comparedKeys(readFileSync(from(SHELL), 'utf8'))
const CAPTIONS = kbdCaptions(readFileSync(from(MARKUP), 'utf8'))

/** The roster parsers, by the path {@link CHROME_BINDING_PROVENANCE} records for each. */
const ROSTER_PARSERS: Readonly<Record<string, (text: string) => unknown>> = {
  [DESIGN]: chromeSentence,
  [SHELL]: comparedKeys,
  [MARKUP]: kbdCaptions,
}

const INHERITED = ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']

/** A well-formed entry, so a fixture can say what is wrong with it in one field. */
function entry(over: Partial<KeyBinding> & { readonly binding: string }): KeyBinding {
  return {
    key: 'z',
    modifiers: [],
    caption: 'Z',
    label: 'A binding',
    reason: 'A fixture, so the audit has something well-formed to complain about one field of.',
    hides: [],
    whileTyping: false,
    ...over,
  }
}

const CHROME = chromePanels()
const PANELS_ALL = [...PANEL_IDS]

describe('the chrome binding exists because design §5.1 names it', () => {
  it('still has the sentence the registry is floored on', () => {
    expect(DESIGNED).toBe('One key hides all chrome.')
  })

  it('refuses to answer when the sentence is gone, rather than answering nothing', () => {
    expect(() => chromeSentence('## 5.1 Layout\n\nTwo sidebars and a dock.\n'))
      .toThrow(/One key hides all chrome/)
  })

  it('registers a binding for it, resolved through the registry and not named inline', () => {
    const info = chromeBindingInfo()
    expect(info, 'design §5.1 names one keybinding and the registry has no entry for it')
      .toBeDefined()
    expect(info!.binding).toBe(CHROME_BINDING)
  })

  it('declares that binding a key, rather than leaving it to a handler', () => {
    const info = chromeBindingInfo()!
    expect(info.key.length, 'a binding with no key is a key hidden in a handler').toBeGreaterThan(0)
    expect(chordId(info).length).toBeGreaterThan(0)
  })

  it('is a floor that can see a registry with no chrome binding', () => {
    const complaints = auditKeybindings({}, CHROME, PANELS_ALL)
    expect(complaints.join(' | ')).toMatch(/hides all chrome/)
  })
})

describe('what it hides comes from panels.ts, not from a list typed here', () => {
  it('reaches the upstream symbol this registry exists on top of', () => {
    // C-6's one line: when a registry's reason to exist is one upstream
    // symbol, assert the symbol is still there. A renamed or deleted
    // `chromePanels` is a compile error, but `npm run typecheck` is the only
    // leg that sees a compile error — this is the leg `npm test` has.
    expect(typeof chromePanels).toBe('function')
  })

  it('hides some panels and not all of them, which is a fact about PANELS', () => {
    // The relation, not the restatement. `hiddenChrome()` and `chromePanels()`
    // being equal is the derivation running twice and is not asserted; that
    // this set is a **non-empty strict subset** of the panels is a property of
    // `panels.ts` that can fail in both directions — every panel marked chrome
    // leaves nothing on screen, none marked chrome leaves the key inert.
    const hidden = hiddenChrome()
    expect(hidden.length, 'a key that hides nothing is not "one key hides all chrome"')
      .toBeGreaterThan(0)
    expect(hidden.length, 'hiding every panel leaves nothing for the author to fuse')
      .toBeLessThan(PANEL_IDS.length)
  })

  it('leaves exactly the panels PANELS does not call chrome', () => {
    const kept = PANEL_IDS.filter(panel => !hiddenChrome().includes(panel))
    expect(kept.length).toBeGreaterThan(0)
    for (const panel of kept) {
      expect(PANELS[panel].chrome, `${panel} is chrome and survives the key that hides chrome`)
        .toBe(false)
    }
  })

  it('names only panels that are registered', () => {
    for (const panel of hiddenChrome()) {
      expect(panelInfo(panel), `${panel} is hidden and is not a registered panel`).toBeDefined()
    }
  })

  it('is what the registered binding carries, so the entry is the derivation', () => {
    expect([...chromeBindingInfo()!.hides].sort()).toEqual([...hiddenChrome()].sort())
  })

  it('is an audit that can see a binding hiding a panel nobody registered', () => {
    const table: KeyBindingTable = {
      rogue: entry({ binding: 'rogue', hides: ['nonesuch'] }),
      [CHROME_BINDING]: KEYBINDINGS[CHROME_BINDING],
    }
    expect(auditKeybindings(table, CHROME, PANELS_ALL).join(' | ')).toMatch(/nonesuch/)
  })

  it('is an audit that can see a binding hiding every panel there is', () => {
    const table: KeyBindingTable = {
      [CHROME_BINDING]: entry({ binding: CHROME_BINDING, hides: PANELS_ALL }),
    }
    expect(auditKeybindings(table, CHROME, PANELS_ALL).join(' | ')).toMatch(/every panel/)
  })

  it('is an audit that can see a binding hiding one panel twice', () => {
    const twice = [...CHROME, CHROME[0]!]
    const table: KeyBindingTable = {
      [CHROME_BINDING]: entry({ binding: CHROME_BINDING, hides: twice }),
    }
    expect(auditKeybindings(table, CHROME, PANELS_ALL).join(' | ')).toMatch(/twice/)
  })
})

describe('BINDING_IDS', () => {
  it('is the runtime witness for the compile-time binding pair', () => {
    // §F-6's pairing rule: the `AssertNever` pair in the module is enforced by
    // `npm run typecheck` alone, so without this the guard is invisible to
    // `npm test` and therefore to the gate's test leg.
    expect([...BINDING_IDS].sort()).toEqual(Object.keys(KEYBINDINGS).sort())
  })

  it('names each binding exactly once', () => {
    // A `readonly BindingId[]` admits a member written twice and `Exclude` is
    // set-valued, so neither the annotation nor the pair can see a duplicate.
    // The same clause `SLOTS`, `PANEL_IDS`, `CONTROL_IDS`, `OPERATION_SUBJECTS`,
    // `SHADING_IDS` and `VIEW_IDS` carry, for `LAYER_KEYS`' reason at `22572ea`.
    const repeated = BINDING_IDS.filter((id, i, all) => all.indexOf(id) !== i)
    expect(repeated, 'a binding listed twice is a binding dispatched twice').toEqual([])
  })

  it('resolves every id through the reader', () => {
    for (const id of BINDING_IDS) {
      expect(bindingInfo(id), `${id} is listed and does not resolve`).toBeDefined()
      expect(bindingInfo(id)!.binding, `${id} does not carry its own key`).toBe(id)
    }
  })
})

describe('a chord is modifiers plus a key, and its spelling is canonical', () => {
  it('is the runtime witness for the compile-time modifier pair', () => {
    expect([...MODIFIERS].sort()).toEqual(['alt', 'ctrl', 'meta', 'shift'])
  })

  it('names each modifier exactly once', () => {
    const repeated = MODIFIERS.filter((m, i, all) => all.indexOf(m) !== i)
    expect(repeated).toEqual([])
  })

  it('spells a bare key as the key', () => {
    expect(chordId({ key: 'Escape', modifiers: [] })).toBe('Escape')
  })

  it('drives every modifier, so the vocabulary has a runtime consumer', () => {
    for (const modifier of MODIFIERS) {
      expect(chordId({ key: 'k', modifiers: [modifier] })).toBe(`${modifier}+k`)
    }
  })

  it('does not depend on the order the modifiers were written in', () => {
    // The property conflict detection rests on: two entries that declare the
    // same chord in a different order are **one** chord, and a comparison that
    // did not normalise would report them as two and let one of them never
    // fire.
    const a = chordId({ key: 'z', modifiers: ['shift', 'ctrl'] })
    const b = chordId({ key: 'z', modifiers: ['ctrl', 'shift'] })
    expect(a).toBe(b)
  })

  it('is an ordering that could have differed, so the test above is not 0 === 0', () => {
    expect(chordId({ key: 'z', modifiers: ['shift', 'ctrl'] })).toBe('ctrl+shift+z')
  })

  it('ignores a modifier declared twice', () => {
    expect(chordId({ key: 'z', modifiers: ['alt', 'alt'] })).toBe('alt+z')
  })

  it('keeps a modifier nobody recognises rather than dropping it silently', () => {
    // Dropping it would make `hyper+z` and `z` the same chord and hide a
    // conflict; the audit is what complains about the name.
    expect(chordId({ key: 'z', modifiers: ['hyper'] })).toBe('hyper+z')
  })

  it('is an audit that can see a modifier nobody recognises', () => {
    const table: KeyBindingTable = {
      [CHROME_BINDING]: KEYBINDINGS[CHROME_BINDING],
      odd: entry({ binding: 'odd', modifiers: ['hyper'] }),
    }
    expect(auditKeybindings(table, CHROME, PANELS_ALL).join(' | ')).toMatch(/hyper/)
  })

  it('finds the shipped bindings by the chord they declare', () => {
    for (const id of BINDING_IDS) {
      const info = KEYBINDINGS[id]
      expect(bindingForChord(chordId(info))?.binding, `${id} is not reachable by its own chord`)
        .toBe(id)
    }
  })

  it('answers undefined for a chord nothing is bound to', () => {
    expect(bindingForChord('ctrl+alt+shift+meta+F19')).toBeUndefined()
  })
})

describe('two bindings cannot claim one chord', () => {
  it('ships no conflict', () => {
    expect(conflictingChords(KEYBINDINGS)).toEqual([])
  })

  it('sees two entries in ONE table claiming one chord', () => {
    // B-4's `LAYER_KEYS` defect in the shape this registry has it: the record
    // is keyed by **binding id**, so two ids carrying the same `key` collide on
    // a field the record cannot see. Set-valued membership over the ids is
    // blind to it, and the symptom is one of the two commands silently never
    // firing — whichever the dispatcher reaches second.
    const table: KeyBindingTable = {
      first: entry({ binding: 'first', key: 'q' }),
      second: entry({ binding: 'second', key: 'q' }),
    }
    expect(conflictingChords(table)).toEqual(['q'])
  })

  it('sees two TABLES claiming one chord, which is how a later phase collides', () => {
    const mine: KeyBindingTable = { mine: entry({ binding: 'mine', key: 'q' }) }
    const theirs: KeyBindingTable = { theirs: entry({ binding: 'theirs', key: 'q' }) }
    expect(conflictingChords(mine, theirs)).toEqual(['q'])
  })

  it('sees a conflict written with the modifiers in a different order', () => {
    const table: KeyBindingTable = {
      first: entry({ binding: 'first', key: 'q', modifiers: ['ctrl', 'shift'] }),
      second: entry({ binding: 'second', key: 'q', modifiers: ['shift', 'ctrl'] }),
    }
    expect(conflictingChords(table)).toEqual(['ctrl+shift+q'])
  })

  it('does not call two different chords a conflict', () => {
    const table: KeyBindingTable = {
      first: entry({ binding: 'first', key: 'q' }),
      second: entry({ binding: 'second', key: 'q', modifiers: ['ctrl'] }),
    }
    expect(conflictingChords(table)).toEqual([])
  })

  it('does not report an inherited name as a conflict', () => {
    // The prototype chain reaching a **comparison** rather than a lookup
    // (C-6's). A `key in seen` over a plain object would answer `true` for
    // `'constructor'` and invent a conflict that is not there.
    const value: KeyBinding = entry({ binding: 'odd', key: 'constructor' })
    const table: KeyBindingTable = { odd: value }
    expect(conflictingChords(table)).toEqual([])
  })

  it('is an audit that can see a conflict', () => {
    const table: KeyBindingTable = {
      [CHROME_BINDING]: KEYBINDINGS[CHROME_BINDING],
      clash: entry({ binding: 'clash', key: KEYBINDINGS[CHROME_BINDING].key }),
    }
    expect(auditKeybindings(table, CHROME, PANELS_ALL).join(' | ')).toMatch(/more than one binding/)
  })
})

describe('composeKeybindings, which is how a later phase adds one', () => {
  it('merges disjoint tables without editing either', () => {
    const extra: KeyBindingTable = { nudge: entry({ binding: 'nudge', key: 'ArrowLeft' }) }
    const merged = composeKeybindings(KEYBINDINGS, extra)
    expect(Object.keys(merged).sort()).toEqual([...BINDING_IDS, 'nudge'].sort())
  })

  it('throws on a chord collision, naming the chord', () => {
    const clash: KeyBindingTable = {
      clash: entry({ binding: 'clash', key: KEYBINDINGS[CHROME_BINDING].key }),
    }
    expect(() => composeKeybindings(KEYBINDINGS, clash))
      .toThrow(new RegExp(KEYBINDINGS[CHROME_BINDING].key))
  })

  it('throws on a duplicate binding id, which a record would silently overwrite', () => {
    const shadow: KeyBindingTable = {
      [CHROME_BINDING]: entry({ binding: CHROME_BINDING, key: 'F9' }),
    }
    expect(() => composeKeybindings(KEYBINDINGS, shadow)).toThrow(new RegExp(CHROME_BINDING))
  })

  it('keeps a binding id of __proto__ as an own property', () => {
    // The hazard the brief names and the one with no wrong value to notice:
    // `merged['__proto__'] = x` on a `{}` accumulator invokes the inherited
    // setter, so the entry **vanishes** and the accumulator's prototype is
    // replaced. An absence, not a wrong answer.
    // A **computed** key, because the literal `__proto__:` form in an object
    // literal sets the prototype instead of creating a property — the fixture
    // would otherwise be empty and the test would pass for the wrong reason.
    const value: KeyBinding = entry({ binding: '__proto__', key: 'F8' })
    const odd: KeyBindingTable = { ['__proto__']: value }
    const merged = composeKeybindings(odd)
    expect(Object.keys(merged)).toEqual(['__proto__'])
    expect(Object.hasOwn(merged, '__proto__')).toBe(true)
    expect(bindingInfo('__proto__', merged)?.key).toBe('F8')
  })

  it('is a hazard that is real, demonstrated on the accumulator it avoids', () => {
    // The paired control for the test above: the same write onto a `{}`
    // accumulator, so "it kept the entry" is evidence that something could
    // have been lost and was seen.
    const naive: Record<string, unknown> = {}
    naive['__proto__'] = { key: 'F8' }
    expect(Object.keys(naive), 'a {} accumulator silently loses a __proto__ entry').toEqual([])
  })
})

describe('every lookup refuses the prototype chain', () => {
  it('answers undefined for an inherited member, on every reader', () => {
    // `site/chromedom.ts:189` was the sixth live instance of this idiom (E8 /
    // R-l) and C-2 closed it. This registry is the one where it is reachable
    // from **real input** rather than hypothetically: a chord is built from a
    // `KeyboardEvent.key`, which a user — or a stuck keyboard, or a page that
    // dispatches a synthetic event — chooses, not us.
    for (const name of INHERITED) {
      expect(bindingInfo(name), `bindingInfo('${name}')`).toBeUndefined()
      expect(bindingForChord(name), `bindingForChord('${name}')`).toBeUndefined()
      expect(absentBinding(name), `absentBinding('${name}')`).toBeUndefined()
    }
  })

  it('still refuses one on a spread copy, which is the shape the shell will hold', () => {
    // C-4's refinement. A null-prototype table makes `'constructor' in table`
    // already `false`, so `in` *looks* fine until the one line of shell code
    // that hands the chain back — `{...KEYBINDINGS}` — runs. The guard has to
    // be at the reader for the copy to be covered too.
    const copy = { ...KEYBINDINGS }
    for (const name of INHERITED) {
      expect(bindingInfo(name, copy), `bindingInfo('${name}', {...KEYBINDINGS})`).toBeUndefined()
      expect(bindingForChord(name, copy)).toBeUndefined()
    }
  })

  it('resolves a binding genuinely named for an inherited member', () => {
    // The guard must not be a reader that answers `undefined` to everything.
    // The value is annotated separately because a property literally named
    // `constructor` gets **no contextual type** from a `Record<string, T>` —
    // `Object.prototype.constructor` shadows the index signature — so the
    // inline form is green under vitest and red under `svelte-check` (§9).
    const value: KeyBinding = entry({ binding: 'constructor', key: 'F7' })
    const table: KeyBindingTable = { constructor: value }
    expect(bindingInfo('constructor', table)?.key).toBe('F7')
    expect(bindingForChord('F7', table)?.binding).toBe('constructor')
  })
})

describe('Escape is the gesture the product already ships', () => {
  it('is the key the shell compares against', () => {
    const shown = KEYBINDINGS['show-chrome']
    expect(SHELL_KEYS, `${SHELL} no longer compares against ${shown.key}`).toContain(shown.key)
  })

  it('found real comparisons, so the check above is not against nothing', () => {
    expect(SHELL_KEYS.length).toBeGreaterThan(0)
  })

  it('refuses to answer when the shell stops comparing, which is what the teardown does', () => {
    expect(() => comparedKeys('export function main(): void {}\n')).toThrow(/event\.key/)
  })

  it('is the caption the page already prints', () => {
    expect(CAPTIONS, `${MARKUP} no longer prints this caption`)
      .toContain(KEYBINDINGS['show-chrome'].caption)
  })

  it('found real captions, so the check above is not against nothing', () => {
    expect(CAPTIONS.length).toBeGreaterThan(0)
  })

  it('refuses to answer when the page prints no key at all', () => {
    expect(() => kbdCaptions('<p>no keys here</p>')).toThrow(/<kbd>/)
  })

  it('reads every roster the provenance records, by the path it records', () => {
    // C-5's rule: record the upstream as data and resolve it in the test, so a
    // rename upstream reddens this file with no production import. The
    // teardown deleting `site/index.html` and `site/main.ts` is then a red
    // test naming the file rather than a binding quietly leaving the product.
    for (const roster of CHROME_BINDING_PROVENANCE.rosters) {
      const parse = ROSTER_PARSERS[roster.file]
      expect(parse, `no parser for the recorded roster ${roster.file}`).toBeDefined()
      expect(() => parse!(readFileSync(from(roster.file), 'utf8'))).not.toThrow()
      expect(roster.what.length, `${roster.file} is recorded with no description`)
        .toBeGreaterThan(0)
    }
  })

  it('records no roster this file does not read, and reads none it does not record', () => {
    expect(CHROME_BINDING_PROVENANCE.rosters.map(r => r.file).sort())
      .toEqual(Object.keys(ROSTER_PARSERS).sort())
  })

  it('says what the bindings are and what would lose them', () => {
    expect(CHROME_BINDING_PROVENANCE.lostWithout.length).toBeGreaterThan(0)
    expect(CHROME_BINDING_PROVENANCE.ruling).toMatch(/hides all chrome/)
  })
})

describe('every binding carries its recorded reason', () => {
  it('passes the audit against the vocabulary panels.ts states', () => {
    expect(auditKeybindings(KEYBINDINGS, CHROME, PANELS_ALL)).toEqual([])
  })

  it('reads complaints on an empty registry, which is what makes the audit non-vacuous', () => {
    // C-3's vacuity control, and it is not a formality: its emptied-registry
    // plant caught survey §I-1's exact defect inside its own test file, an
    // assertion passing as `0 === 0`.
    expect(auditKeybindings({}, CHROME, PANELS_ALL).length).toBeGreaterThan(0)
  })

  it('argues for each binding rather than labelling it', () => {
    for (const id of BINDING_IDS) {
      const info = KEYBINDINGS[id]
      expect(info.reason.length, `${id} has no recorded reason (§2.3)`).toBeGreaterThan(40)
      expect(info.label.length, `${id} has no human-facing name`).toBeGreaterThan(0)
      expect(info.caption.length, `${id} has no caption to print in a <kbd>`).toBeGreaterThan(0)
    }
  })

  it('sees a binding registered under a key its entry does not know', () => {
    const table: KeyBindingTable = { wrong: entry({ binding: 'right' }) }
    expect(auditKeybindings(table, CHROME, PANELS_ALL).join(' | ')).toMatch(/does not know/)
  })

  it('sees a binding with no recorded reason', () => {
    const table: KeyBindingTable = { bare: entry({ binding: 'bare', reason: '  ' }) }
    expect(auditKeybindings(table, CHROME, PANELS_ALL).join(' | ')).toMatch(/recorded reason/)
  })

  it('sees a binding with no label and one with no caption', () => {
    const table: KeyBindingTable = {
      mute: entry({ binding: 'mute', label: '' }),
      silent: entry({ binding: 'silent', caption: ' ' }),
    }
    const complaints = auditKeybindings(table, CHROME, PANELS_ALL).join(' | ')
    expect(complaints).toMatch(/no label/)
    expect(complaints).toMatch(/no caption/)
  })

  it('sees a binding with no key, which is a key hidden in a handler', () => {
    const table: KeyBindingTable = { ghost: entry({ binding: 'ghost', key: '' }) }
    expect(auditKeybindings(table, CHROME, PANELS_ALL).join(' | ')).toMatch(/no key/)
  })

  it('records, for every binding, whether it fires while a text field has focus', () => {
    // A declaration and not dispatch: the shell reads it. Both entries say
    // `false` today, and saying that here is cheaper than inventing a third
    // binding so that `true` has an occupant — there is no binding the design
    // names that should fire mid-word.
    for (const id of BINDING_IDS) {
      expect(typeof KEYBINDINGS[id].whileTyping).toBe('boolean')
    }
    expect(BINDING_IDS.every(id => !KEYBINDINGS[id].whileTyping)).toBe(true)
  })
})

describe('the keys this registry has already decided against', () => {
  it('records a disposition and a reason for each, because the absence is the decision', () => {
    for (const [name, absent] of Object.entries(ABSENT_BINDINGS)) {
      expect(absent.name, `${name} does not carry its own key`).toBe(name)
      expect(BINDING_DISPOSITIONS as readonly string[], `${name} has an unknown disposition`)
        .toContain(absent.disposition)
      expect(absent.reason.length, `${name} is listed with no argument`).toBeGreaterThan(40)
    }
  })

  it('is the runtime witness for the disposition pair, and uses every member', () => {
    expect([...BINDING_DISPOSITIONS].sort()).toEqual(['deferred', 'elsewhere', 'refused'])
    const used = new Set(Object.values(ABSENT_BINDINGS).map(a => a.disposition))
    for (const disposition of BINDING_DISPOSITIONS) {
      expect([...used], `nothing is filed as ${disposition}, so the vocabulary is wider than the facts`)
        .toContain(disposition)
    }
  })

  it('names an owner for everything it does not simply refuse, and only those', () => {
    for (const absent of Object.values(ABSENT_BINDINGS)) {
      if (absent.disposition === 'refused') {
        expect(absent.ownedBy, `${absent.name} is refused and names an owner`).toBeUndefined()
      } else {
        expect(absent.ownedBy?.length, `${absent.name} is not refused and names no owner`)
          .toBeGreaterThan(0)
      }
    }
  })

  it('names nothing the registry also binds', () => {
    const bound = new Set(BINDING_IDS.map(id => chordId(KEYBINDINGS[id])))
    for (const name of Object.keys(ABSENT_BINDINGS)) {
      expect(bound.has(name), `${name} is both absent and bound`).toBe(false)
    }
  })

  it('is a disjointness check that can see an overlap', () => {
    const bound = new Set(BINDING_IDS.map(id => chordId(KEYBINDINGS[id])))
    expect(bound.has(chordId(KEYBINDINGS[CHROME_BINDING]))).toBe(true)
  })

  it('refuses the prototype chain, and resolves a name it has actually considered', () => {
    const considered = Object.keys(ABSENT_BINDINGS)
    expect(considered.length).toBeGreaterThan(0)
    const resolved: AbsentBinding | undefined = absentBinding(considered[0]!)
    expect(resolved?.name).toBe(considered[0])
  })
})
