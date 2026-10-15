import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BOOLEAN_SPELLINGS,
  booleanSpelling,
  lastParam,
  normaliseParam,
  searchParams,
} from './query.js'
import { PRESENT_PARAM, isPresenting } from './present.js'
import { SMOOTH_PARAM, parseSmooth } from './smooth.js'
import { DEFAULT_FIT, FIT_PARAM, parseFit } from './fit.js'

/**
 * The one query-string parse policy, and the assertion that there is only one
 * of it.
 *
 * ## Why this module exists at all
 *
 * `present.ts`, `fit.ts` and `smooth.ts` each independently implemented
 * last-of-repeated-wins, the optional leading `?`, trim-and-lowercase, and a
 * table of the words a human types for a boolean. **The prototype-chain defect
 * fixed in the commit before this one existed in two of them because the idiom
 * had been copied**, which is this repo's signature recorded defect — the
 * animatable-channel list, written in three files and guarded in one, with both
 * site validators silently dropping channels as a result.
 *
 * So the tests below come in two kinds, and the second kind is the point:
 * behaviour of the shared mechanism, and then **a sweep proving each spelling
 * of the policy occurs in exactly one module.** A refactor that leaves a copy
 * standing has not fixed the thing that went wrong.
 */

const SITE = fileURLToPath(new URL('.', import.meta.url))

/**
 * The paired control's directory. Five files, read as text and never imported,
 * holding one planted violation among four lawful modules. Argued in
 * `query-sweep-fixture/README.md`; the short version is that the plant is a
 * *working* fourth parser, so under `site/` it would be the thing this file
 * exists to forbid, and a non-test file under `site/` also marks both dist
 * directories stale and silently skips 24 of `dist.test.ts`'s 32 tests.
 */
const FIXTURE = fileURLToPath(new URL('../query-sweep-fixture/', import.meta.url))

/**
 * How a sweep recognises a module and the modules it imports.
 *
 * Both halves are parameters rather than literals for one reason: the control
 * at the bottom of this file has to run **the same walker** under the
 * pre-change spellings and the current ones. A second copy of the walker
 * written to be blind would be a copy of the thing this whole file exists to
 * forbid, and it would drift away from the real sweep the first time either
 * changed.
 */
interface Spelling {
  /** For the failure message, so a red control says which sweep was wrong. */
  readonly what: string
  readonly isModule: (fileName: string) => boolean
  readonly importsIn: (source: string) => readonly string[]
}

/**
 * The spellings in force.
 *
 * **`.svelte` counts as a module.** It did not, and `siteModules` filtered
 * `.endsWith('.ts')`, so a component could hold a fourth query parser, a
 * second boolean-spelling table, a fourth `X_PARAM` and a `location.search`
 * read, and every sweep in this file would report a clean directory. Measured,
 * not argued: with such a component committed in `site/`, this file passed
 * 21/21 and the whole suite passed 1363/1363 after a rebuild.
 *
 * **An import is recognised whatever quotes it, whatever its casing, and
 * whether it names a `.js` or a `.svelte` file.** The pattern was
 * `/from '\.\/([a-z]+)\.js'/`, which cannot see `"./store.js"`,
 * `'./editorStore.js'` or `'./EditorPanel.svelte'` — all three shapes the
 * editor shell is made of. That defect runs the *other* way from the one
 * above: a narrower pattern can only make the cone smaller, so it cannot hide
 * a violation, it falsely accuses lawful modules of handling a query string
 * from outside the cone. A guard that cries wolf at correct code is a guard
 * someone eventually deletes, which is why it is fixed here rather than noted.
 *
 * **A specifier containing `/` is still deliberately unresolvable.** The names
 * {@link siteModules} returns are relative to `site/`, so `./b.js` read inside
 * `site/sub/a.ts` would resolve to the wrong module; excluding `/` keeps a
 * subdirectory a decision somebody has to make deliberately, which is the
 * behaviour {@link siteModules}'s docblock records and not this task's to
 * revisit.
 */
const SWEEP: Spelling = {
  what: 'every extension, casing and quoting',
  isModule: name => !name.endsWith('.test.ts') && (name.endsWith('.ts') || name.endsWith('.svelte')),
  importsIn: source =>
    [...source.matchAll(/\bfrom\s+['"]\.\/([^'"/]+)['"]/g)].flatMap(match => {
      const specifier = match[1]!
      // `.js` because this repo's `moduleResolution` is `node16`, so a
      // TypeScript module is always imported under its emitted name; a
      // `.svelte` module is imported under its own.
      if (specifier.endsWith('.js')) return [`${specifier.slice(0, -'.js'.length)}.ts`]
      if (specifier.endsWith('.svelte')) return [specifier]
      return []
    }),
}

/**
 * The spellings as they stood before `SWEEP` replaced them, kept because a
 * null measurement is evidence only to the extent that something could have
 * been seen. The control at the bottom runs both over the fixture and pins the
 * difference, so "the sweep covers `.svelte` now" is a measured delta rather
 * than an assertion. Deleting this makes that test vacuous rather than red,
 * which is the failure mode it is here to prevent.
 */
const BLIND: Spelling = {
  what: '.ts only, single-quoted all-lowercase ./name.js imports',
  isModule: name => name.endsWith('.ts') && !name.endsWith('.test.ts'),
  importsIn: source => [...source.matchAll(/from '\.\/([a-z]+)\.js'/g)].map(m => `${m[1]!}.ts`),
}

/**
 * The words a human types for true and false, declared here rather than counted.
 *
 * The table's size used to be floored with `toBeGreaterThan(6)` against eight
 * entries, which tolerated losing one in silence: dropping `'on'` left that
 * floor green and was caught only by a separate test that happened to name the
 * word. A count cannot police a vocabulary — these two lists can, and they are
 * the same two lists the "covers both vocabularies it replaced" test already
 * enumerated, so this is the declaration that test was implicitly making.
 *
 * `present.ts` had `FALSY = ['0','false','no','off']`; `smooth.ts` had
 * `ALIASES = {1,true,yes → on; 0,false,no → off}`. Same words, two shapes, two
 * files, with `on` and `off` in one and not the other. The union is here, once.
 */
const TRUE_WORDS = ['1', 'true', 'yes', 'on']
const FALSE_WORDS = ['0', 'false', 'no', 'off']

/**
 * Every non-test module in `site/`, which is the population every sweep here
 * covers.
 *
 * **Recursive**, which it was not. It was a flat `readdirSync` filtered to
 * `.ts`, so a future `site/player/*.ts` would have fallen outside the swept
 * population with no warning at all: the `> 10` module floor (22 today) cannot
 * detect a module it never looked at, and a fourth parser in a subdirectory
 * would have passed every test in this file. `site/` is flat today, so this is
 * a no-op now and a guard the day it stops being one.
 *
 * Names are returned relative to `site/`, so a module in a subdirectory shows
 * up as `player/foo.ts` — which is what the sweeps report and what
 * {@link importsOf} then fails to resolve, making the cone test red rather than
 * quietly admitting it. That is the intended direction: a subdirectory is a
 * decision somebody should have to make deliberately.
 *
 * **Which extensions count is {@link Spelling}'s to say**, not this function's,
 * so the control can run this same walk under the pre-change filter.
 */
function siteModules(dir = SITE, prefix = '', spelling: Spelling = SWEEP): readonly string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const name = `${prefix}${entry.name}`
    if (entry.isDirectory()) out.push(...siteModules(join(dir, entry.name), `${name}/`, spelling))
    else if (spelling.isModule(entry.name)) out.push(name)
  }
  return out.sort()
}

/** The `site/` modules `name` imports, by its own relative specifiers. */
function importsOf(name: string, root = SITE, spelling: Spelling = SWEEP): readonly string[] {
  return spelling.importsIn(readFileSync(join(root, name), 'utf8'))
}

/**
 * Every `site/` module that reaches `query.ts` by some chain of imports.
 *
 * A fixed point rather than one pass: the chain is three deep today
 * (`player.ts` → `playerplan.ts` → `fit.ts` → `query.ts`) and nothing caps it.
 */
function queryCone(root = SITE, spelling: Spelling = SWEEP): ReadonlySet<string> {
  const cone = new Set<string>(['query.ts'])
  for (let growing = true; growing; ) {
    growing = false
    for (const name of siteModules(root, '', spelling)) {
      if (cone.has(name)) continue
      if (importsOf(name, root, spelling).some(dep => cone.has(dep))) {
        cone.add(name)
        growing = true
      }
    }
  }
  return cone
}

/**
 * The two ways a module is detected as handling a query string, extracted so
 * the control runs the detectors themselves and not a restatement of them.
 *
 * Both are about the module's *interface* rather than its body — see the
 * cone test's docblock, which is where the choice is argued.
 */
function queryHandlers(
  root = SITE,
  spelling: Spelling = SWEEP,
): { readonly declared: readonly string[]; readonly readers: readonly string[] } {
  const declared: string[] = []
  const readers: string[] = []
  for (const name of siteModules(root, '', spelling)) {
    const source = readFileSync(join(root, name), 'utf8')
    if (/export const [A-Z0-9_]+_PARAM\b/.test(source)) declared.push(name)
    // Backtick-quoted `location.search` is prose; every module here names it
    // in a docblock, and only some of them read it.
    if (/(?<!`)location\.search/.test(source)) readers.push(name)
  }
  return { declared, readers }
}

/** Every module whose source writes one spelling of the parse policy. */
function policyHolders(
  pattern: RegExp,
  root = SITE,
  spelling: Spelling = SWEEP,
): readonly string[] {
  return siteModules(root, '', spelling).filter(name =>
    pattern.test(readFileSync(join(root, name), 'utf8')),
  )
}

describe('searchParams', () => {
  /**
   * These pin the function's **contract** — what a caller may hand it — and not
   * the body that upholds it. That distinction was earned: the body used to
   * strip a leading `?` by hand, justified by a false claim that
   * `URLSearchParams` would otherwise read `?present=1` as a parameter named
   * `?present`. It would not; the WHATWG string constructor strips one leading
   * `?` itself. All three assertions below stayed green when the strip was
   * deleted, because all three were always true of `URLSearchParams` alone.
   *
   * They are kept rather than deleted with the strip, because the tolerance is
   * a promise this module makes to `present.ts`, `fit.ts` and `smooth.ts`
   * regardless of who implements it — a hand-rolled reader, a `.replace(/^\?/,
   * '')`, a split on `&` — and any of those spellings getting it wrong fails
   * here. What they cannot do is detect a redundant line, which is exactly what
   * that line was.
   */
  it('reads a location.search with or without its leading ?', () => {
    expect(searchParams('?a=1').get('a')).toBe('1')
    expect(searchParams('a=1').get('a')).toBe('1')
  })

  it('reads an empty query as no parameters at all', () => {
    // `''` is what `location.search` is on a URL with no query, and `'?'` is
    // what a browser leaves behind when the last parameter is removed.
    expect([...searchParams('')]).toEqual([])
    expect([...searchParams('?')]).toEqual([])
  })

  it('consumes only the first ?, so a ? inside a value survives', () => {
    expect(searchParams('?a=?').get('a')).toBe('?')
  })
})

describe('lastParam', () => {
  it('is undefined for a parameter that was never given', () => {
    expect(lastParam('', 'fit')).toBeUndefined()
    expect(lastParam('?', 'fit')).toBeUndefined()
    expect(lastParam('?other=1', 'fit')).toBeUndefined()
  })

  it('reads a bare parameter as the empty string, not as absent', () => {
    // The distinction every caller then interprets for itself: `present` reads
    // a bare flag as on, `smooth` reads it as its default. Collapsing the two
    // here would take that choice away from them.
    expect(lastParam('?fit', 'fit')).toBe('')
    expect(lastParam('?fit=', 'fit')).toBe('')
  })

  it('takes the last of a repeat, so the later assignment wins', () => {
    expect(lastParam('?fit=a&fit=b', 'fit')).toBe('b')
    expect(lastParam('?fit=b&fit=a', 'fit')).toBe('a')
    expect(lastParam('?a=1&fit=x&b=2&fit=y', 'fit')).toBe('y')
  })

  it('is not fooled by a parameter that merely contains the name', () => {
    expect(lastParam('?unfit=1', 'fit')).toBeUndefined()
    expect(lastParam('?fitmode=1', 'fit')).toBeUndefined()
    expect(lastParam('?x=fit=1', 'fit')).toBeUndefined()
  })

  it('decodes percent-escapes and + the way a query string means them', () => {
    expect(lastParam('?fit=%20render%20', 'fit')).toBe(' render ')
    expect(lastParam('?note=a+b', 'note')).toBe('a b')
  })
})

describe('normaliseParam', () => {
  it('trims and lowercases, which is what a hand-typed embed URL needs', () => {
    expect(normaliseParam(' Render ')).toBe('render')
    expect(normaliseParam('SNAP')).toBe('snap')
    expect(normaliseParam('off')).toBe('off')
  })

  it('leaves a value that needs nothing done to it alone', () => {
    expect(normaliseParam('')).toBe('')
    expect(normaliseParam('contain')).toBe('contain')
  })
})

describe('BOOLEAN_SPELLINGS', () => {
  it('is a Map, so the prototype chain cannot answer for it', () => {
    // Not a record. The defect fixed one commit ago was a lookup that walked
    // `Object.prototype`; a `Map` has no such chain to walk, so this table
    // cannot acquire that defect however it is read.
    expect(BOOLEAN_SPELLINGS).toBeInstanceOf(Map)
    for (const name of ['constructor', '__proto__', 'toString', 'valueOf']) {
      expect(booleanSpelling(name), name).toBeUndefined()
    }
  })

  it('covers both vocabularies it replaced, in both directions and no further', () => {
    // Driven off the declared word lists, and closed in BOTH directions: the
    // loops catch a spelling the merge lost, and the key comparison catches one
    // it gained. A count could do neither — `size > 6` against eight entries
    // stayed green when `'on'` was dropped.
    for (const yes of TRUE_WORDS) {
      expect(booleanSpelling(yes), yes).toBe(true)
    }
    for (const no of FALSE_WORDS) {
      expect(booleanSpelling(no), no).toBe(false)
    }
    expect([...BOOLEAN_SPELLINGS.keys()].sort())
      .toEqual([...TRUE_WORDS, ...FALSE_WORDS].sort())
  })

  it('is undefined for anything else, including a bare flag', () => {
    // Three answers, not two: a caller has to be able to tell "the author said
    // no" from "the author said something I cannot read", because those get
    // different treatment — `present` reads an unreadable value as on and a
    // bare flag as on, while `smooth` falls back on both.
    for (const value of ['', 'maybe', '2', 'auto', 'ON ', 'Yes']) {
      expect(booleanSpelling(value), value).toBeUndefined()
    }
  })

  it('expects its caller to have normalised, and says so by not doing it', () => {
    // Deliberate: the table is keyed by the normalised spelling, and a lookup
    // that quietly normalised would let a caller skip `normaliseParam` for the
    // boolean path and not for its own vocabulary — which is how `?fit=SNAP`
    // and `?fit=COVER` would come to disagree about case.
    expect(booleanSpelling('TRUE')).toBeUndefined()
    expect(booleanSpelling(normaliseParam('TRUE'))).toBe(true)
  })
})

describe('both boolean parsers honour the one table', () => {
  /**
   * **The cross-check that was impossible while there were two tables.**
   *
   * Driven off `BOOLEAN_SPELLINGS` itself, so adding a spelling that only one
   * parser honours goes red here, and so does re-introducing a local table in
   * either parser and drifting it. That drift is exactly what shipped before:
   * `?smooth=off` meant off while `?smooth=false` meant `auto`, because the two
   * files had picked different subsets of the same six words.
   */
  it('agrees with isPresenting on every spelling in the table', () => {
    // The table is exactly the declared vocabulary, not merely "more than six
    // words". A floor of `> 6` against eight entries tolerated losing one in
    // silence: dropping `'on'` kept it green.
    expect(BOOLEAN_SPELLINGS.size).toBe(TRUE_WORDS.length + FALSE_WORDS.length)
    for (const [spelling, meaning] of BOOLEAN_SPELLINGS) {
      expect(isPresenting(`?${PRESENT_PARAM}=${spelling}`), spelling).toBe(meaning)
    }
  })

  it('agrees with parseSmooth on every spelling in the table', () => {
    for (const [spelling, meaning] of BOOLEAN_SPELLINGS) {
      expect(parseSmooth(`?${SMOOTH_PARAM}=${spelling}`), spelling).toBe(meaning ? 'on' : 'off')
    }
  })

  it('leaves fit alone, because fit is not a boolean', () => {
    // The vocabulary is shared between the two parameters that have one. `fit`
    // is a three-way enum with no boolean reading, so every spelling in the
    // table is an unknown value to it and falls back — which is the proof that
    // sharing the table did not leak it into every parser in the directory.
    //
    // `DEFAULT_FIT` and not the literal `'contain'`, which stood here. The
    // guarantee is "it falls back to the default", not "it answers contain";
    // the adjacent assertions in this file and in `fit.test.ts` already read
    // the constant, so the literal was inconsistent as well as value-pinned.
    for (const [spelling] of BOOLEAN_SPELLINGS) {
      expect(parseFit(`?${FIT_PARAM}=${spelling}`), spelling).toBe(DEFAULT_FIT)
    }
  })
})

/**
 * **Three patterns and not four.** `startsWith('?')` was the fourth, and it
 * is gone because the thing it pinned was not a decision: `URLSearchParams`
 * strips one leading `?` itself, so all three parsers' copies of the strip —
 * and the copy this module inherited from them — were no-ops. Deleting the
 * strip left every behaviour test in this file green and reddened only this
 * sweep, which is the precise signature of a line that exists because a sweep
 * asserts someone wrote it. Argued at `query.ts`'s `searchParams`.
 *
 * At module scope rather than inside the describe below, so the control group
 * at the bottom sweeps **these** patterns and not a transcription of them.
 */
const POLICY: readonly { readonly what: string; readonly pattern: RegExp }[] = [
  { what: 'constructing the parser', pattern: /new URLSearchParams\(/ },
  { what: 'last-of-repeated-wins', pattern: /\.getAll\(/ },
  { what: 'trim-and-lowercase', pattern: /\.trim\(\)\.toLowerCase\(\)/ },
]

describe('exactly one copy of the parse policy', () => {
  /**
   * Source-text assertions, the house technique for a claim no unit test can
   * make, with a vacuity floor on each pattern: `query.ts` must be among the
   * hits, so a pattern that silently stopped matching — a renamed helper, a
   * reformatted call — fails here rather than passing with a count of zero.
   *
   * Each pattern is code-only by construction (a call, a `new`), not a word
   * that could turn up in prose.
   *
   * ## What this sweep does NOT catch, measured
   *
   * **Its false positive**, which was the only hazard recorded here: a docblock
   * that literally writes `new URLSearchParams(`. It would be legible as one.
   *
   * **Its false negative**, which is the one that matters and was missing. A
   * verifier added a fourth parser spelling every one of the shared decisions
   * differently — `search.replace(/^\?/, '')` for the leading `?`, `new
   * URL(…).searchParams` instead of `new URLSearchParams(`,
   * `[...params.entries()].filter(…).pop()` instead of `.getAll(`, and
   * `.toLowerCase().trim()` in the reverse order — and this file passed
   * **20/20**. The sweep did not see it, and no enumeration of idioms can: the
   * patterns are the spellings this repo happens to use, and a copy is free to
   * pick others.
   *
   * So the claim these three patterns support is the narrow one — *they catch
   * the three idioms as written in this repo today* — and the broad one is
   * carried by the next test instead, which is closed over **modules** rather
   * than over spellings. That one is also not complete, in a different and
   * stated direction. The three patterns themselves are at module scope, so
   * the control group at the bottom of this file sweeps the same ones.
   */

  it('is not vacuous: there are several modules to be wrong in', () => {
    const modules = siteModules()
    expect(modules.length).toBeGreaterThan(10)
    expect(modules).toContain('query.ts')
    expect(modules).toContain('present.ts')
    expect(modules).toContain('fit.ts')
    expect(modules).toContain('smooth.ts')
  })

  it('writes each spelling of the policy in query.ts and nowhere else', () => {
    for (const { what, pattern } of POLICY) {
      // The floor and the claim in one: query.ts has it, and it is alone.
      expect(policyHolders(pattern), what).toEqual(['query.ts'])
    }
  })

  /**
   * **The half an idiom sweep cannot do, closed over modules instead.**
   *
   * The sweep above enumerates spellings, and a verifier walked straight
   * through it with a fourth parser that used four different ones. This test
   * enumerates **modules**: anything in `site/` that handles a query string at
   * all must sit inside `query.ts`'s own import cone, so a new reader has to
   * reach the shared mechanism to be legal, whatever idiom it would have
   * reached for. That is a property of the dependency graph and no choice of
   * `replace` over `slice` can dodge it.
   *
   * "Handles a query string" is detected two ways, both chosen because they are
   * about the module's *interface* rather than its body — the thing a copy
   * cannot respell and still be a copy:
   *
   * - it **declares a parameter name** (`export const X_PARAM`), which is what
   *   a fourth parameter looks like from outside; or
   * - it **reads `location.search`** as code, which is what a module that
   *   skipped the parsers entirely looks like.
   *
   * **The stated limitation.** This is closed over modules, so a *second copy
   * inside the cone* — a hand-rolled reader added to `fit.ts`, which already
   * imports `query.js` — satisfies it. That case is the idiom sweep's job, and
   * the idiom sweep is incomplete. Between the two, what is actually guaranteed
   * is: no query parsing outside the cone, and none of the three idioms this
   * repo writes anywhere but here. Neither is "there can never be a fourth
   * copy", and nothing in this file should be read as claiming it.
   */
  it('leaves no module outside query.ts’s import cone handling a query string', () => {
    const cone = queryCone()
    // Floors on the cone itself: it is real, and it is not simply every module
    // in the directory, which would make membership no constraint at all.
    expect(cone).toContain('query.ts')
    expect(cone.size).toBeGreaterThan(5)
    expect(cone.size).toBeLessThan(siteModules().length)

    const { declared, readers } = queryHandlers()
    // Both detectors are live. The declaring modules are pinned by name because
    // they are this page's whole parameter vocabulary; the readers are pinned
    // by a count, because which module holds the DOM is another phase's choice.
    //
    // The equality stands as P2 wrote it, and is now sighted: `declared` is
    // computed over a population that includes `.svelte`, so a component
    // declaring a fourth parameter reddens it where it used to be unseen.
    // It was *not* loosened to a superset, and the hand-written list was not
    // replaced by a derived one. Both were considered and both lose a case this
    // catches: the derivation available — "the modules that import `query.ts`
    // directly", which is exactly `fit, present, smooth` today — goes green on a
    // fourth parameter declared in a module that lawfully imports the
    // mechanism, and that is the case this list is for. The cost is real and
    // stays: a legitimate new `X_PARAM` in a later phase reddens a merged
    // phase's test, and whoever adds one must update this line deliberately.
    // The ⊆ half of that derivation is additive, so it is asserted below.
    expect(declared).toEqual(['fit.ts', 'present.ts', 'smooth.ts'])
    expect(readers.length, 'modules reading location.search').toBeGreaterThan(0)

    for (const name of new Set([...declared, ...readers])) {
      expect(cone.has(name), `${name} handles a query string from outside the cone`).toBe(true)
    }
  })

  /**
   * **The half of the hand-written list that can be derived, derived.**
   *
   * `declared` is pinned above against three names somebody typed, which is
   * this repo's recorded trap: a list of "the places that do X" goes stale the
   * day a fourth one appears. One direction of it needs no list at all — a
   * module that declares a parameter must import `query.ts` **directly**, not
   * merely reach it through the cone — and that is strictly more than the cone
   * test asks, because the cone admits a module three hops away.
   *
   * Only the ⊆ direction. The ⊇ direction ("every direct importer declares a
   * parameter") is false of any component that merely *calls* `lastParam`, and
   * the editor shell will be full of those; asserting it would manufacture the
   * same false alarm this commit is removing from the cone walk.
   */
  it('has every parameter-declaring module importing query.ts directly', () => {
    const direct = siteModules().filter(name => importsOf(name).includes('query.ts'))
    // Vacuity floor: the import detector resolved something, and not everything.
    expect(direct.length, 'direct importers of query.ts').toBeGreaterThan(0)
    expect(direct.length).toBeLessThan(siteModules().length)

    for (const name of queryHandlers().declared) {
      expect(direct, `${name} declares a parameter without importing query.ts`).toContain(name)
    }
  })

  it('has every boolean parser reading the table rather than its own', () => {
    // The table is the half a regex cannot police — the spellings are ordinary
    // words — so it is pinned by import instead: a parser that grew a second
    // copy would have no reason to keep importing the first.
    //
    // Policing it by text was measured and rejected rather than assumed
    // impossible: counting the eight declared words as quoted literals per
    // module gives `query.ts` 8 and `smooth.ts` 5, so any threshold that
    // isolates the table sits one word from a false positive — and `smooth.ts`'s
    // five are its own `SmoothMode` values (`'on' | 'off'`), not a table at all.
    // A "complete vocabulary" detector has no threshold but would have missed
    // the actual historical defect, which was two files holding different
    // *subsets* of the same words.
    //
    // Either quote. A module is no less an importer for writing `"`, and this
    // file's other single-quote-only pattern was the bug it is fixing.
    for (const name of ['present.ts', 'smooth.ts']) {
      const source = readFileSync(join(SITE, name), 'utf8')
      expect(source, name).toMatch(/from ['"]\.\/query\.js['"]/)
      expect(source, name).toMatch(/booleanSpelling/)
    }
  })
})

/**
 * **The paired control: what the sweeps above could not see, and now can.**
 *
 * Every test in this group runs the *same* walker, the *same* idiom patterns
 * and the *same* two detectors over `query-sweep-fixture/`, once under
 * {@link SWEEP} and once under {@link BLIND} — the spellings in force before
 * this group was written. The fixture holds one planted violation among four
 * lawful modules, so each test states a delta rather than a null: "the sweep
 * covers `.svelte`" is not evidence, "the sweep reports a fourth parser the
 * old filter called a clean directory" is.
 *
 * Reproducing this group is **half** the procedure. The other half is the
 * measurement it was derived from, which no committed test can hold because it
 * requires the violation to be live in `site/`: copy
 * `query-sweep-fixture/StrayPanel.svelte` into `site/`, rebuild, and run the
 * whole suite. Before this commit that was **62 files / 1363 passed / 0
 * skipped, exit 0** with a working fourth query parser in the directory, and
 * `site/query.test.ts` alone was **21/21**. The reddened tests are the visible
 * half; those two numbers are the moved measurement.
 */
describe('the sweeps see a module whatever its extension, casing or quoting', () => {
  /** The one file in the fixture that every detector should have something to say about. */
  const PLANT = 'StrayPanel.svelte'

  it('is not vacuous: the fixture has lawful modules as well as the plant', () => {
    // Floors in both directions. Without the lawful four, "the blind sweep saw
    // nothing" would be true of an empty directory; without the plant, there is
    // nothing for the sighted sweep to find.
    const modules = siteModules(FIXTURE)
    expect(modules).toEqual([
      'EditorPanel.svelte',
      PLANT,
      'editorShell.ts',
      'editorStore.ts',
      'query.ts',
    ])
    expect(siteModules(FIXTURE, '', BLIND), BLIND.what).not.toContain(PLANT)
  })

  it('finds the fourth parser planted in a component, which was a clean bill of health', () => {
    for (const { what, pattern } of POLICY) {
      // The blind sweep's answer is the dangerous one: not an error, but
      // `['query.ts']` — exactly what it reports over a directory with no
      // fourth parser in it at all.
      expect(policyHolders(pattern, FIXTURE, BLIND), `${what}, ${BLIND.what}`).toEqual(['query.ts'])
      expect(policyHolders(pattern, FIXTURE), what).toEqual([PLANT, 'query.ts'])
    }
  })

  it('finds the parameter and the location.search read inside that component', () => {
    // The second boolean-spelling table in the plant is caught through these
    // two detectors and the idiom sweep, not by anything that reads the table:
    // see the boolean-parser test above for why a word sweep was rejected.
    expect(queryHandlers(FIXTURE, BLIND).declared, BLIND.what).toEqual([])
    expect(queryHandlers(FIXTURE).declared).toEqual(['EditorPanel.svelte', PLANT])
    expect(queryHandlers(FIXTURE, BLIND).readers, BLIND.what).toEqual(['editorShell.ts'])
    expect(queryHandlers(FIXTURE).readers).toEqual([PLANT, 'editorShell.ts'])
  })

  it('puts the plant outside the cone and the lawful modules inside it', () => {
    const cone = queryCone(FIXTURE)
    for (const lawful of ['EditorPanel.svelte', 'editorShell.ts', 'editorStore.ts']) {
      expect(cone.has(lawful), `${lawful} reaches the mechanism`).toBe(true)
    }
    expect(cone.has(PLANT), `${PLANT} reaches the mechanism`).toBe(false)
  })

  it('resolved none of those three import shapes before, and accused a lawful module', () => {
    // The import defect runs the opposite way from the extension defect: a
    // narrower pattern can only shrink the cone, so it hides no violation — it
    // convicts correct code. All three shapes below are the editor shell's
    // ordinary vocabulary, and the blind walk resolves none of them, leaving a
    // cone of one and `editorShell.ts` accused of handling a query string from
    // outside a cone it is two hops inside.
    const blindCone = queryCone(FIXTURE, BLIND)
    expect([...blindCone], BLIND.what).toEqual(['query.ts'])
    expect(queryHandlers(FIXTURE, BLIND).readers.every(name => blindCone.has(name))).toBe(false)

    expect(importsOf('editorStore.ts', FIXTURE, BLIND), 'double-quoted').toEqual([])
    expect(importsOf('editorStore.ts', FIXTURE)).toEqual(['query.ts'])
    expect(importsOf('editorShell.ts', FIXTURE, BLIND), 'camelCase and .svelte').toEqual([])
    expect(importsOf('editorShell.ts', FIXTURE)).toEqual(['editorStore.ts', 'EditorPanel.svelte'])
  })
})
