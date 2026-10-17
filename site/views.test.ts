/**
 * `VIEWS` and `DEPTH_SOURCES` — two axes, and the three ways a pair of small
 * registries can be wrong about being two.
 *
 * **They can go stale.** Neither list has a roster in the model, so §9's answer
 * — derive it — has to reach outside this directory. Each one does, and to a
 * different place, because the two are not in the same position:
 *
 * - `VIEWS` has a *sentence*: design §5.2, *"**Three views** (R11) as a
 *   registry: `depth` · `stereo` · `both`."* That sentence is parsed here, and
 *   so is the numeral in it — a design that says "Three" and lists four is a
 *   defect in the upstream, and this file is where it surfaces.
 * - `DEPTH_SOURCES` has something better: a **live upstream in the code**, in
 *   two places that must agree — `site/index.html`'s `#depth-view` select and
 *   `site/controls.ts`'s `DepthView` union. Those are the artefacts ruling R-p
 *   exists to keep, so the derivation reads the thing being preserved rather
 *   than a sentence about it.
 *
 * Each parser **throws** rather than answering nothing, and each throw has a
 * control, because a parser that returns `[]` when it cannot find its roster
 * moves survey §I-1's vacuity defect one level up and takes every comparison
 * below it with it. Each also has a synthetic over-long roster proving it reads
 * as many members as exist rather than as many as today has.
 *
 * **They can be vacuous.** C-3's emptied-registry plant found §I-1's exact
 * defect inside C-3's own test file. `auditViews` and `auditDepthSources` are
 * the instruments and `{}` is the control for both.
 *
 * **They can quietly become one axis.** That is this task's own criterion and
 * the reason the two lists share a file. `View` and `DepthSource` are disjoint
 * string-literal unions, so `view: 'encoded'` does not compile; the runtime
 * half is {@link axisOverlap} plus the non-degeneracy test below — the depth
 * source is observable under *more than one* view and *not under all of them*,
 * which is false of any collapse of the two into a single list.
 *
 * ## The cost this file carries, stated
 *
 * It reddens on an edit to **three files it does not own**:
 * `docs/plans/2026-10-13-editor-design.md`, `site/index.html` and
 * `site/controls.ts`. That is deliberate and it is the cheaper half of the
 * trade — a roster that can move without anything noticing is not a roster. The
 * failure is loud and the fix is one line.
 *
 * **The teardown will trip it, and that is ruling R-p working.** P3b deletes
 * `site/index.html`; when it does, the `#depth-view` parse throws by name.
 * R-p's whole reason for existing is that this axis is *"dropped silently by
 * the teardown"* without somewhere to land, and §9 is blunt that *"a recorded
 * note is a sensor — it is not."* So the note is this test. Whoever does the
 * teardown removes the deleted file from
 * {@link DEPTH_SOURCE_PROVENANCE}`.rosters` and keeps the one that survives:
 * `site/controls.ts` is orphaned by the teardown, not deleted.
 *
 * ## The registration test, and why the two lists did not get the same one
 *
 * C-6 reserved this in writing and was right about the hard half and wrong
 * about one detail, which is worth keeping because the detail is the task:
 * *"{@link ViewTable} and {@link DepthSourceTable} being keyed by `string`,
 * and **every reader taking a `table` parameter**, is what makes it writable."*
 * Eight readers did; `absentView` and `absentDepthSource` did **not**, and a
 * table a census cannot vary is a row that cannot move. Both now take one.
 *
 * The larger finding is that the two lists were **not** in the same position,
 * which is the thing only a task holding both can see. Plan §9: *"a
 * registration test must assert that the thing a consumer does is now possible
 * — not that the entry can be found."* So: what does each axis' consumer
 * **enumerate**?
 *
 * - For `VIEWS`, one enumerating question was already answered from a table —
 *   {@link viewsShowing}, which is how the other two axes ask whether they are
 *   live. The switcher's own question, *which views are there to offer*, was
 *   not: the only answer was {@link VIEW_IDS}, a static declaration no
 *   registration can move.
 * - For `DEPTH_SOURCES` **nothing** enumerated a table. Every reader was a
 *   lookup, so a registered source was reachable only by a caller that already
 *   knew its name — `SHADINGS`' gap exactly, and the whole of it.
 *
 * {@link offeredViews} and {@link offeredDepthSources} are that half, each
 * defined in terms of its own lookup so that a row a picker offers and the
 * lookup refuses cannot exist. `site/index.html`, `site/controls.ts` and
 * `site/depthmap.ts` are **read** here and not modified.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { STEREO_KEYS } from '../src/core/types.js'
import * as views from './views.js'
import {
  ABSENT_DEPTH_SOURCES,
  ABSENT_VIEWS,
  AXIS_DISPOSITIONS,
  CANVAS_KINDS,
  DEFAULT_DEPTH_SOURCE,
  DEPTH_SOURCES,
  DEPTH_SOURCE_IDS,
  DEPTH_SOURCE_PROVENANCE,
  DEPTH_STAGES,
  VIEWS,
  VIEW_IDS,
  absentDepthSource,
  absentView,
  auditDepthSources,
  auditViews,
  axisOverlap,
  defaultDepthSourceInfo,
  depthSourceInfo,
  offeredDepthSources,
  offeredViews,
  resolveDepthSource,
  viewInfo,
  viewsShowing,
} from './views.js'
import type {
  AbsentMember,
  AbsentTable,
  DepthSourceInfo,
  DepthSourceTable,
  ViewInfo,
  ViewTable,
} from './views.js'

/** Resolved from `import.meta.url`, so the test names the file it means wherever vitest runs. */
const from = (relative: string): string => fileURLToPath(new URL(`../${relative}`, import.meta.url))

const DESIGN = 'docs/plans/2026-10-13-editor-design.md'
const MARKUP = 'site/index.html'
const REDUCER = 'site/controls.ts'

/* ------------------------------------------------------------------ *
 * The three parsers. Each throws; each throw has a control below.
 * ------------------------------------------------------------------ */

/** What design §5.2's views sentence says. */
interface DesignViews {
  readonly ids: readonly string[]
  /** The count the sentence writes out in words, so the two can be compared. */
  readonly written: number
  /** Whether the sentence marks one view as the default. Today: `false`. */
  readonly marksDefault: boolean
}

/**
 * The numerals a design sentence may count with.
 *
 * Declared rather than computed: §9's trap is that *"a total in a document is
 * a count of something — not necessarily"*, and the point of reading the word
 * at all is to check it against the list, not to trust it.
 */
const NUMERALS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
}

/**
 * Design §5.2's views sentence, read as a roster.
 *
 * The ids come from the backticked run after the colon; the numeral comes from
 * the bold word before `views`. Both, because they are two independent claims
 * the same sentence makes and the design is free to get them out of step.
 */
/**
 * The anchor, written once.
 *
 * Shared by {@link viewsFromDesign} and by its uniqueness check rather than
 * typed twice: two copies of a pattern drift, and a uniqueness check counting
 * a *different* sentence from the one the reader resolves answers `1` forever
 * while the reader is reading something else.
 */
const VIEWS_SENTENCE = /\*\*([A-Za-z]+) views\*\*[^\n]*?as a registry:([^\n]*)/

/**
 * How many sentences in the document match {@link VIEWS_SENTENCE}.
 *
 * **Uniqueness and not presence**, because `RegExp.exec` answers with the
 * first match scanning from the top: a second "**N views** … as a registry:"
 * line inserted **above** §5.2's silently replaces it as this registry's
 * upstream, and if the two lines read alike every assertion below is unmoved.
 * Re-running this file after a docs edit then shows only that the document
 * moved without breaking the parse — never *where* it moved.
 *
 * **A number rather than a throw**, because {@link viewsFromDesign} is called
 * at module scope: throwing there yields `Tests  no tests`, which is zero
 * failures to a count-based reading and a whole-file deletion to a name-set
 * census. An `it` over a number fails by name.
 */
function viewsSentenceCount(markdown: string): number {
  return [...markdown.matchAll(new RegExp(VIEWS_SENTENCE.source, 'g'))].length
}

function viewsFromDesign(markdown: string): DesignViews {
  const sentence = VIEWS_SENTENCE.exec(markdown)
  if (sentence === null) {
    throw new Error('design §5.2\'s views sentence is not where this test looks for it')
  }
  const ids = [...sentence[2]!.matchAll(/`([^`]+)`/g)].map(match => match[1]!)
  if (ids.length === 0) throw new Error('design §5.2\'s views sentence names no views')
  const written = NUMERALS[sentence[1]!.toLowerCase()]
  if (written === undefined) {
    throw new Error(`design §5.2 counts the views as "${sentence[1]}", which is not a numeral this test can read`)
  }
  return { ids, written, marksDefault: sentence[2]!.includes('(default)') }
}

/** What `site/index.html` offers today. */
interface MarkupRoster {
  readonly sources: readonly string[]
  /** The option a browser selects with no author input: the first one. */
  readonly first: string
  readonly canvases: readonly string[]
}

/**
 * `site/index.html`'s `#depth-view` select and its canvases, read as rosters.
 *
 * The canvases are read by id suffix rather than by counting `<canvas>` tags,
 * so the name a view records in {@link ViewInfo.shows} is the page's own name
 * for that surface and not a position.
 */
function rosterFromMarkup(html: string): MarkupRoster {
  const select = /<select id="depth-view"[^>]*>([\s\S]*?)<\/select>/.exec(html)
  if (select === null) {
    throw new Error('site/index.html has no `#depth-view` select — see this file\'s note on the teardown')
  }
  const sources = [...select[1]!.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]!)
  if (sources.length === 0) throw new Error('site/index.html\'s `#depth-view` select offers no options')
  const canvases = [...html.matchAll(/<canvas id="([a-z]+)-canvas"/g)].map(match => match[1]!)
  if (canvases.length === 0) throw new Error('site/index.html has no `<canvas id="…-canvas">`')
  return { sources, first: sources[0]!, canvases }
}

/** What `site/controls.ts` declares today. */
interface ReducerRoster {
  readonly ids: readonly string[]
  /** The value the reducer's initial state holds. */
  readonly initial: string
}

/** `site/controls.ts`'s `DepthView` union and the value its initial state picks. */
function rosterFromReducer(source: string): ReducerRoster {
  const union = /export type DepthView = ([^\n]+)/.exec(source)
  if (union === null) throw new Error('site/controls.ts no longer declares a `DepthView` union')
  const ids = [...union[1]!.matchAll(/'([^']+)'/g)].map(match => match[1]!)
  if (ids.length === 0) throw new Error('site/controls.ts\'s `DepthView` union names no members')
  const initials = [...source.matchAll(/\bdepthView:\s*'([^']+)'/g)].map(match => match[1]!)
  if (initials.length === 0) throw new Error('site/controls.ts sets no initial `depthView`')
  if (new Set(initials).size > 1) {
    throw new Error(`site/controls.ts sets ${new Set(initials).size} different initial \`depthView\` values`)
  }
  return { ids, initial: initials[0]! }
}

/** The rosters as the shipped tree states them. */
/** Read once, because the uniqueness check is a statement about the same bytes the reader parsed. */
const DESIGN_TEXT = readFileSync(from(DESIGN), 'utf8')

const DESIGNED = viewsFromDesign(DESIGN_TEXT)
const MARKED_UP = rosterFromMarkup(readFileSync(from(MARKUP), 'utf8'))
const REDUCED = rosterFromReducer(readFileSync(from(REDUCER), 'utf8'))

/**
 * The parser each recorded roster is read by, keyed by the recorded path.
 *
 * A map and not a dispatch on the file extension, so a path recorded in
 * {@link DEPTH_SOURCE_PROVENANCE} that nobody wired up is a **named** failure
 * rather than a silently skipped entry. C-5's convention for
 * `implementedBy`, applied to a roster instead of to an implementation.
 */
const ROSTER_PARSERS: Readonly<Record<string, (text: string) => readonly string[]>> = {
  [MARKUP]: text => rosterFromMarkup(text).sources,
  [REDUCER]: text => rosterFromReducer(text).ids,
}

/** The inherited names a registry must never answer for. E8 / R-l. */
const INHERITED = ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']

describe('the views come from design §5.2, not from this file', () => {
  it('registers exactly the views the design sentence names', () => {
    // Set equality in both directions: a deletion here, a rename in either
    // place, and a fourth view in the design that nobody registered. A floor
    // of `>= 3` would catch only the first.
    expect([...VIEW_IDS].sort()).toEqual([...DESIGNED.ids].sort())
  })

  it('found a real sentence, so the comparison above is not against nothing', () => {
    expect(DESIGNED.ids.length).toBeGreaterThan(1)
    expect(new Set(DESIGNED.ids).size).toBe(DESIGNED.ids.length)
  })

  it('agrees with the count the design writes out in words', () => {
    // The sensor pointed at the upstream rather than at this file: the design
    // states the membership twice, once as a numeral and once as a list, and
    // a reader who trusts the numeral and a reader who trusts the list get
    // different answers the moment they disagree. §9: "a total in a document
    // is a count of something — not necessarily."
    expect(DESIGNED.ids).toHaveLength(DESIGNED.written)
  })

  it('reads as many views as the sentence names, rather than as many as today', () => {
    // The control that keeps the parser honest about tomorrow: a parser that
    // stopped at three would agree with the registry forever.
    const five = 'prose\n\n**Five views** (R11) as a registry: `a` · `b` · `c` · `d` · `e`.\n\nmore prose\n'
    expect(viewsFromDesign(five)).toEqual({ ids: ['a', 'b', 'c', 'd', 'e'], written: 5, marksDefault: false })
  })

  it('refuses to answer when the sentence is not there, instead of answering nothing', () => {
    expect(() => viewsFromDesign('# a document with no such sentence\n'))
      .toThrow(/is not where this test looks for it/)
  })

  it('refuses to answer when the sentence names no views', () => {
    expect(() => viewsFromDesign('**Three views** (R11) as a registry: see below.\n'))
      .toThrow(/names no views/)
  })

  it('refuses to answer when it cannot read the count the sentence writes', () => {
    expect(() => viewsFromDesign('**Several views** (R11) as a registry: `a` · `b`.\n'))
      .toThrow(/not a numeral this test can read/)
  })

  it('states the sentence exactly once, so the match this file took is the only one there was', () => {
    // Presence is asserted above and is the weaker half. `exec` returns the
    // FIRST match from the top of the file, so a second views sentence placed
    // anywhere ABOVE §5.2's quietly becomes this registry's upstream — and if
    // the two read alike, `ids`, `written` and `marksDefault` are all
    // unchanged and nothing else in this file can notice. Exactly-once is what
    // turns first-match-wins from an unstated preference into a decision the
    // suite enforces.
    expect(
      viewsSentenceCount(DESIGN_TEXT),
      `${DESIGN} states a views registry sentence more than once; whichever copy is higher silently becomes this registry's upstream`,
    ).toBe(1)
  })

  it('is a count that can see a second sentence, so the check above is not 1 === 1', () => {
    // The vacuity control, aimed at the counter rather than at the parser: a
    // counter hard-wired to 1 would agree with the document forever, which is
    // the shape of the defect it exists to catch.
    const twice = '**Three views** (R11) as a registry: `a` · `b` · `c`.\n\nprose\n\n'
      + '**Three views** (R11) as a registry: `a` · `b` · `c`.\n'
    expect(viewsSentenceCount(twice)).toBe(2)
    expect(viewsSentenceCount('# a document with no such sentence\n')).toBe(0)
  })
})

describe('the canvases come from the page, not from a word this file invented', () => {
  it('names exactly the canvases index.html has', () => {
    expect([...CANVAS_KINDS].sort()).toEqual([...MARKED_UP.canvases].sort())
  })

  it('found real canvases, so the comparison above is not against nothing', () => {
    expect(MARKED_UP.canvases.length).toBeGreaterThan(1)
    expect(new Set(MARKED_UP.canvases).size).toBe(MARKED_UP.canvases.length)
  })

  it('refuses to answer when the page has no canvases', () => {
    expect(() => rosterFromMarkup('<select id="depth-view"><option value="a"></select>'))
      .toThrow(/has no `<canvas/)
  })
})

describe('VIEW_IDS', () => {
  it('is the runtime witness for the compile-time view pair', () => {
    // §F-6: `AssertNever` is enforced by `npm run typecheck` alone, so without
    // this the pair in `views.ts` is invisible to `npm test` and therefore to
    // the gate's test leg.
    expect([...VIEW_IDS].sort()).toEqual(Object.keys(VIEWS).sort())
  })

  it('names each view exactly once', () => {
    expect(new Set(VIEW_IDS).size).toBe(VIEW_IDS.length)
  })

  it('resolves every id through the reader', () => {
    for (const id of VIEW_IDS) expect(viewInfo(id), id).toBeDefined()
  })
})

describe('VIEWS has no default, and that is measured rather than assumed', () => {
  it('ships no DEFAULT_VIEW, because the design marks none', () => {
    // C-5's convention — order the ids so the default is not at index 0 — does
    // not apply to this list, and the honest thing is to say so with a sensor
    // rather than to invent a default so the convention has something to bite.
    // Both halves: the module declares none, and the upstream marks none.
    expect(Object.keys(views)).not.toContain('DEFAULT_VIEW')
    expect(DESIGNED.marksDefault).toBe(false)
  })

  it('is a check that could see a marked default', () => {
    // The control. Without it the assertion above is "a document does not
    // contain a string", which is green over a parser that never looks.
    const marked = '**Two views** (R11) as a registry: `a` **(default)** · `b`.\n'
    expect(viewsFromDesign(marked).marksDefault).toBe(true)
    expect(Object.keys(views)).toContain('DEFAULT_DEPTH_SOURCE')
  })
})

describe('what each view shows', () => {
  it('shows only canvases the page has, and covers all of them', () => {
    // The content the compile-time pair is pointed at: `Record<View, ViewInfo>`
    // by annotation means a fourth view is a compile error whose only honest
    // fix is to say which canvas it shows and why it exists. Both directions
    // here, so a canvas nobody can reach is as red as a view showing one that
    // does not exist.
    expect(auditViews(VIEWS, DESIGNED.ids, MARKED_UP.canvases)).toEqual([])
  })

  it('has one view per single canvas and one that shows them all', () => {
    // The structural claim design §5.2 is actually making, asserted as
    // structure rather than as the three names: every canvas is reachable
    // alone, and exactly one view is the union.
    const alone = VIEW_IDS.filter(id => VIEWS[id].shows.length === 1)
    const every = VIEW_IDS.filter(id => VIEWS[id].shows.length === CANVAS_KINDS.length)
    expect(alone).toHaveLength(CANVAS_KINDS.length)
    expect(every).toHaveLength(1)
    expect(new Set(alone.flatMap(id => [...VIEWS[id].shows]))).toEqual(new Set(CANVAS_KINDS))
  })

  it('answers which views show a given canvas', () => {
    for (const canvas of CANVAS_KINDS) {
      expect(viewsShowing(canvas).length, canvas).toBeGreaterThan(0)
    }
  })

  it('is a lookup that can see a canvas nobody shows', () => {
    // The control on the loop above, which would pass over a function that
    // answered every id to everything as readily as over a correct one.
    const blinkered: ViewTable = { ...VIEWS, both: { ...VIEWS.both, shows: ['depth'] } }
    expect(viewsShowing('stereo', blinkered)).toEqual(['stereo'])
    expect(viewsShowing('nothing-is-called-this')).toEqual([])
  })
})

describe('the depth sources come from the page the teardown deletes', () => {
  it('registers exactly the sources the #depth-view select offers', () => {
    expect([...DEPTH_SOURCE_IDS].sort()).toEqual([...MARKED_UP.sources].sort())
  })

  it('registers exactly the members controls.ts declares', () => {
    // The second upstream. Two rosters and not one, because the page and the
    // reducer are free to drift apart — `markup.test.ts` exists for that class
    // of defect — and a registry that matched only one of them would be a
    // third opinion rather than a record.
    expect([...DEPTH_SOURCE_IDS].sort()).toEqual([...REDUCED.ids].sort())
  })

  it('reads every roster DEPTH_SOURCE_PROVENANCE records, by the path it records', () => {
    // C-5's convention: record the claim as data and resolve it in the test,
    // so a file that moves reddens here rather than leaving a registry quietly
    // citing a path nobody has. This is also the teardown's tripwire.
    expect(DEPTH_SOURCE_PROVENANCE.rosters.length).toBeGreaterThan(1)
    for (const roster of DEPTH_SOURCE_PROVENANCE.rosters) {
      const parse = ROSTER_PARSERS[roster.file]
      expect(parse, `no parser is wired up for ${roster.file}`).toBeDefined()
      expect([...parse!(readFileSync(from(roster.file), 'utf8'))].sort(), roster.file)
        .toEqual([...DEPTH_SOURCE_IDS].sort())
    }
  })

  it('found real rosters, so the comparisons above are not against nothing', () => {
    expect(MARKED_UP.sources.length).toBeGreaterThan(1)
    expect(REDUCED.ids.length).toBeGreaterThan(1)
  })

  it('reads as many options as the select has, rather than as many as today', () => {
    const four = [
      '<select id="depth-view" aria-label="x">',
      '<option value="a">A</option>',
      '<option value="b">B</option>',
      '<option value="c">C</option>',
      '<option value="d">D</option>',
      '</select>',
      '<canvas id="only-canvas"></canvas>',
    ].join('\n')
    expect(rosterFromMarkup(four).sources).toEqual(['a', 'b', 'c', 'd'])
  })

  it('reads as many union members as the union has, rather than as many as today', () => {
    const four = 'export type DepthView = \'a\' | \'b\' | \'c\' | \'d\'\nconst s = { depthView: \'a\' }\n'
    expect(rosterFromReducer(four)).toEqual({ ids: ['a', 'b', 'c', 'd'], initial: 'a' })
  })

  it('refuses to answer when the select is gone, which is what the teardown does', () => {
    expect(() => rosterFromMarkup('<main>no select here</main>'))
      .toThrow(/has no `#depth-view` select/)
  })

  it('refuses to answer when the select offers nothing', () => {
    expect(() => rosterFromMarkup('<select id="depth-view"></select>'))
      .toThrow(/offers no options/)
  })

  it('refuses to answer when the reducer no longer declares the union', () => {
    expect(() => rosterFromReducer('export type Something = \'a\'\n')).toThrow(/no longer declares/)
  })

  it('refuses to answer when the union names nothing', () => {
    expect(() => rosterFromReducer('export type DepthView = string\n')).toThrow(/names no members/)
  })

  it('refuses to answer when the reducer picks no initial value', () => {
    expect(() => rosterFromReducer('export type DepthView = \'a\' | \'b\'\n')).toThrow(/sets no initial/)
  })

  it('refuses to answer when the reducer picks two different initial values', () => {
    const two = 'export type DepthView = \'a\' | \'b\'\nconst x = { depthView: \'a\' }\nconst y = { depthView: \'b\' }\n'
    expect(() => rosterFromReducer(two)).toThrow(/2 different initial/)
  })
})

describe('the default depth source is the one the page and the reducer already pick', () => {
  it('is what the reducer\'s initial state holds', () => {
    expect(DEFAULT_DEPTH_SOURCE).toBe(REDUCED.initial)
  })

  it('is the option a browser selects with no author input', () => {
    // The second, independent witness: a `<select>` with no `selected`
    // attribute resolves to its first option, so the page and the reducer are
    // two separate statements of the same default and this catches them
    // disagreeing — which is a real bug in the editor, not only in this list.
    expect(DEFAULT_DEPTH_SOURCE).toBe(MARKED_UP.first)
  })

  it('does not sit at the head of the list, so DEPTH_SOURCE_IDS[0] cannot stand in for it', () => {
    // C-5's convention, and here it is the whole reason the order is what it
    // is: with two members any order puts the default at one end, so the order
    // has exactly one job and this is the sensor for it.
    expect(DEPTH_SOURCE_IDS[0]).not.toBe(DEFAULT_DEPTH_SOURCE)
    expect([...DEPTH_SOURCE_IDS]).toContain(DEFAULT_DEPTH_SOURCE)
  })

  it('is what an absent or unreadable preference resolves to', () => {
    expect(resolveDepthSource(undefined)).toBe(DEFAULT_DEPTH_SOURCE)
    expect(resolveDepthSource('as-composited')).toBe(DEFAULT_DEPTH_SOURCE)
    expect(defaultDepthSourceInfo()?.source).toBe(DEFAULT_DEPTH_SOURCE)
  })

  it('steps aside for a preference that names a source, and is not a constant function', () => {
    const other = DEPTH_SOURCE_IDS.find(id => id !== DEFAULT_DEPTH_SOURCE)!
    expect(resolveDepthSource(other)).toBe(other)
  })
})

describe('DEPTH_SOURCE_IDS', () => {
  it('is the runtime witness for the compile-time source pair', () => {
    expect([...DEPTH_SOURCE_IDS].sort()).toEqual(Object.keys(DEPTH_SOURCES).sort())
  })

  it('names each source exactly once, and resolves every id through the reader', () => {
    expect(new Set(DEPTH_SOURCE_IDS).size).toBe(DEPTH_SOURCE_IDS.length)
    for (const id of DEPTH_SOURCE_IDS) expect(depthSourceInfo(id), id).toBeDefined()
  })
})

describe('the axis is about depthBlur, and depthBlur is still in the model', () => {
  it('names a stereo key that the model actually guards', () => {
    // C-4's convention 6: plant against the UPSTREAM module. `DEPTH_SOURCES`
    // is nothing but "before or after `depthBlur`", so if `depthBlur` left
    // `StereoOpts` this registry would be describing a stage nobody computes —
    // and `STEREO_KEYS` is itself `AssertNever`-guarded in `src/core/types.ts`,
    // so this reads the model's own roster rather than a word.
    expect([...STEREO_KEYS]).toContain(DEPTH_SOURCE_PROVENANCE.axisKey)
  })

  it('is a check that can see a key the model does not have', () => {
    expect([...STEREO_KEYS]).not.toContain('depthBlurr')
  })

  it('reads one source before the blur and one after, so the axis distinguishes something', () => {
    const stages = DEPTH_SOURCE_IDS.map(id => DEPTH_SOURCES[id].stage)
    expect(new Set(stages).size).toBe(DEPTH_STAGES.length)
    expect([...DEPTH_STAGES].sort()).toEqual([...new Set(stages)].sort())
  })

  it('is the runtime witness for the compile-time stage pair', () => {
    for (const id of DEPTH_SOURCE_IDS) {
      expect([...DEPTH_STAGES], id).toContain(DEPTH_SOURCES[id].stage)
    }
    expect(new Set(DEPTH_STAGES).size).toBe(DEPTH_STAGES.length)
  })
})

describe('the two lists are two axes, not two halves of one union', () => {
  it('shares no name between them', () => {
    expect(axisOverlap()).toEqual([])
  })

  it('is an overlap check that can see an overlap', () => {
    // The control. Without it "they do not overlap" is green over a function
    // that returns `[]` unconditionally, which is the whole defect §6.5a's
    // paired-control rule exists for.
    const clash: ViewTable = { ...VIEWS, encoded: { ...VIEWS.depth, view: 'encoded' } }
    expect(axisOverlap(clash)).toEqual(['encoded'])
  })

  it('does not report an inherited name as an overlap', () => {
    // The prototype chain reaching a *comparison* rather than a lookup: a
    // naive `key in other` would report every own key of one table as shared,
    // because `'constructor' in DEPTH_SOURCES` is `true`.
    const oddView: ViewInfo = {
      view: 'constructor',
      label: 'Oddly named',
      reason: 'A fixture: a table is free to key an entry by a name the prototype also has.',
      shows: ['depth'],
    }
    expect(axisOverlap({ ['constructor']: oddView })).toEqual([])
  })

  it('refuses a depth source as a view, and a view as a depth source', () => {
    // Criterion (a)'s runtime half. The compile-time half is that `View` and
    // `DepthSource` are disjoint string-literal unions, so `view: 'encoded'`
    // is not expressible at all — this is the guard for the string path, where
    // a name arrives from a stored preference or a `data-` attribute.
    for (const id of DEPTH_SOURCE_IDS) expect(viewInfo(id), id).toBeUndefined()
    for (const id of VIEW_IDS) expect(depthSourceInfo(id), id).toBeUndefined()
  })

  it('leaves the depth source observable under several views but not under all of them', () => {
    // The non-degeneracy that makes "orthogonal" a measurement rather than a
    // word. If the two lists were really one axis — if `composited` and
    // `encoded` were simply two more views — then each depth source would *be*
    // a view and exactly one view would show the depth canvas. More than one
    // does, and not all of them do, so the product is strictly larger than
    // either list and neither can be folded into the other.
    const showing = viewsShowing('depth')
    expect(showing.length).toBeGreaterThan(1)
    expect(showing.length).toBeLessThan(VIEW_IDS.length)
    expect(VIEW_IDS.length * DEPTH_SOURCE_IDS.length)
      .toBeGreaterThan(VIEW_IDS.length + DEPTH_SOURCE_IDS.length)
  })
})

describe('every member of both lists carries its recorded reason', () => {
  it('passes both audits against the rosters their upstreams state', () => {
    expect(auditViews(VIEWS, DESIGNED.ids, MARKED_UP.canvases)).toEqual([])
    expect(auditDepthSources(DEPTH_SOURCES, MARKED_UP.sources)).toEqual([])
  })

  it('argues for each name rather than labelling it', () => {
    // §2.3: a constant with no recorded reason is a review failure, and five
    // bare names would be exactly that.
    for (const id of VIEW_IDS) {
      expect(VIEWS[id].reason.length, id).toBeGreaterThan(120)
      expect(VIEWS[id].label.trim(), id).not.toBe('')
    }
    for (const id of DEPTH_SOURCE_IDS) {
      expect(DEPTH_SOURCES[id].reason.length, id).toBeGreaterThan(120)
      expect(DEPTH_SOURCES[id].label.trim(), id).not.toBe('')
    }
  })

  it('reads complaints on an empty registry, which is what makes the audits non-vacuous', () => {
    // C-3's plant, which caught survey §I-1's defect inside C-3's own test
    // file: an audit is a loop, and a loop over nothing is green.
    const noViews = auditViews({}, DESIGNED.ids, MARKED_UP.canvases)
    for (const id of DESIGNED.ids) expect(noViews.join(' '), id).toContain(`no entry for \`${id}\``)
    // One per demanded view, plus one per canvas nothing shows.
    expect(noViews).toHaveLength(DESIGNED.ids.length + MARKED_UP.canvases.length)

    const noSources = auditDepthSources({}, MARKED_UP.sources)
    expect(noSources).toHaveLength(MARKED_UP.sources.length)
    for (const id of MARKED_UP.sources) {
      expect(noSources.join(' '), id).toContain(`no entry for \`${id}\``)
    }
  })

  it('sees a view registered under a key its entry does not know', () => {
    const misfiled: ViewTable = { ...VIEWS, both: { ...VIEWS.both, view: 'all' } }
    expect(auditViews(misfiled, DESIGNED.ids, MARKED_UP.canvases).join(' ')).toContain('does not know')
  })

  it('sees a view with no recorded reason', () => {
    const mute: ViewTable = { ...VIEWS, depth: { ...VIEWS.depth, reason: '  ' } }
    expect(auditViews(mute, DESIGNED.ids, MARKED_UP.canvases).join(' ')).toContain('no recorded reason')
  })

  it('sees a view showing a canvas the page does not have', () => {
    const ghost: ViewTable = { ...VIEWS, depth: { ...VIEWS.depth, shows: ['anaglyph'] } }
    expect(auditViews(ghost, DESIGNED.ids, MARKED_UP.canvases).join(' ')).toContain('no such canvas')
  })

  it('sees a canvas the page has that no view shows', () => {
    // The direction a per-entry loop cannot reach, and the one that makes the
    // view registry a cover of the editor's surfaces rather than a list.
    const lost: ViewTable = {
      ...VIEWS,
      depth: { ...VIEWS.depth, shows: ['stereo'] },
      both: { ...VIEWS.both, shows: ['stereo'] },
    }
    expect(auditViews(lost, DESIGNED.ids, MARKED_UP.canvases).join(' ')).toContain('no view shows `depth`')
  })

  it('sees a view that shows nothing', () => {
    const blank: ViewTable = { ...VIEWS, stereo: { ...VIEWS.stereo, shows: [] } }
    expect(auditViews(blank, DESIGNED.ids, MARKED_UP.canvases).join(' ')).toContain('shows no canvas')
  })

  it('sees a depth source registered under a key its entry does not know', () => {
    const misfiled: DepthSourceTable = {
      ...DEPTH_SOURCES,
      encoded: { ...DEPTH_SOURCES.encoded, source: 'blurred' },
    }
    expect(auditDepthSources(misfiled, MARKED_UP.sources).join(' ')).toContain('does not know')
  })

  it('sees an axis whose members all read the same point in the pipeline', () => {
    // The collapse this registry would die of quietly: two names for one
    // buffer is an axis that distinguishes nothing, and the page would offer a
    // control that does not change the picture.
    const same: DepthSourceTable = {
      ...DEPTH_SOURCES,
      encoded: { ...DEPTH_SOURCES.encoded, stage: DEPTH_SOURCES.composited.stage },
    }
    expect(auditDepthSources(same, MARKED_UP.sources).join(' ')).toContain('reads the same point')
  })

  it('sees a depth source with no recorded reason', () => {
    const mute: DepthSourceTable = {
      ...DEPTH_SOURCES,
      composited: { ...DEPTH_SOURCES.composited, reason: '' },
    }
    expect(auditDepthSources(mute, MARKED_UP.sources).join(' ')).toContain('no recorded reason')
  })
})

describe('every lookup refuses the prototype chain', () => {
  /**
   * E8 / R-l. Both registries are plain object literals — they have to be,
   * since the `Record<View, ViewInfo>` and `Record<DepthSource,
   * DepthSourceInfo>` annotations that make a new member a compile error are
   * only available on a literal — so `VIEWS['constructor']` is the `Object`
   * function and `'toString' in DEPTH_SOURCES` is `true`. The guard is
   * `Object.hasOwn` at every reader, which is also the only guard that
   * survives the `{...VIEWS}` the shell will write.
   *
   * There is no composition accumulator in this module, so C-4's
   * `merged['__proto__'] = x` hazard has no site here; what stands in for it
   * is {@link axisOverlap}, which compares two tables and is driven with an
   * own-property `constructor` above.
   */
  it('answers undefined for an inherited member, on every reader', () => {
    for (const name of INHERITED) {
      expect(viewInfo(name), name).toBeUndefined()
      expect(depthSourceInfo(name), name).toBeUndefined()
      expect(absentView(name), name).toBeUndefined()
      expect(absentDepthSource(name), name).toBeUndefined()
      expect(viewsShowing(name), name).toEqual([])
    }
  })

  it('still refuses one on a spread copy, which is the shape the shell will hold', () => {
    const viewCopy: ViewTable = { ...VIEWS }
    const sourceCopy: DepthSourceTable = { ...DEPTH_SOURCES }
    for (const name of INHERITED) {
      expect(viewInfo(name, viewCopy), name).toBeUndefined()
      expect(depthSourceInfo(name, sourceCopy), name).toBeUndefined()
    }
  })

  it('falls back to the default rather than honouring an inherited name as a preference', () => {
    for (const name of INHERITED) {
      expect(resolveDepthSource(name), name).toBe(DEFAULT_DEPTH_SOURCE)
    }
  })

  it('resolves a member genuinely named for an inherited member', () => {
    // The other half, and the one that proves the guard is `hasOwn` and not a
    // blocklist of five words.
    //
    // A property literally called `constructor` gets **no contextual type**
    // from `Record<string, …>`, because `Object.prototype.constructor` shadows
    // the index signature — so the entry is annotated separately. C-4 measured
    // vitest running green while `svelte-check` reported the error.
    const oddView: ViewInfo = {
      view: 'constructor',
      label: 'Oddly named',
      reason: 'A fixture: a table is free to key an entry by a name the prototype also has.',
      shows: ['depth'],
    }
    const oddSource: DepthSourceInfo = {
      source: '__proto__',
      label: 'Also oddly named',
      reason: 'A fixture: the computed key form declares an own property rather than a prototype.',
      stage: 'before',
    }
    expect(viewInfo('constructor', { ['constructor']: oddView })?.label).toBe('Oddly named')
    expect(Object.hasOwn({ ['__proto__']: oddSource }, '__proto__')).toBe(true)
    expect(depthSourceInfo('__proto__', { ['__proto__']: oddSource })?.label).toBe('Also oddly named')
    expect(resolveDepthSource('__proto__', { ['__proto__']: oddSource })).toBe('__proto__')
  })

  it('is a guard and not a reader that answers undefined to everything', () => {
    expect(viewInfo(VIEW_IDS[0])).toBeDefined()
    expect(depthSourceInfo(DEFAULT_DEPTH_SOURCE)).toBeDefined()
    expect(absentView('anaglyph')).toBeDefined()
    expect(absentDepthSource('stereo')).toBeDefined()
  })
})

describe('the names these two lists have already decided against', () => {
  it('records a disposition and a reason for each, because the absence is the decision', () => {
    for (const [name, absent] of [...Object.entries(ABSENT_VIEWS), ...Object.entries(ABSENT_DEPTH_SOURCES)]) {
      expect(absent.name, name).toBe(name)
      expect(AXIS_DISPOSITIONS, name).toContain(absent.disposition)
      expect(absent.reason.length, name).toBeGreaterThan(120)
    }
  })

  it('is the runtime witness for the disposition pair, and uses both members', () => {
    const used = new Set(
      [...Object.values(ABSENT_VIEWS), ...Object.values(ABSENT_DEPTH_SOURCES)].map(a => a.disposition),
    )
    expect([...used].sort()).toEqual([...AXIS_DISPOSITIONS].sort())
  })

  it('records nothing as merely pending, because no member is', () => {
    // C-5's finding, re-measured for these two lists rather than inherited.
    // Design §5.2 and plan §7 P4.1 both state `VIEWS`' membership in full, and
    // `DEPTH_SOURCES`' membership is whatever the page offers today — so
    // neither list has a member that is *coming*. What is genuinely pending is
    // the *status* of R-p, which is a fact about the ruling and is recorded as
    // `DEPTH_SOURCE_PROVENANCE.rulingReversible`, not as a vacancy.
    expect([...AXIS_DISPOSITIONS]).not.toContain('deferred')
    expect(DEPTH_SOURCE_PROVENANCE.rulingReversible).toBe(true)
  })

  it('names the owner of everything it files as owned elsewhere, and only those', () => {
    for (const absent of [...Object.values(ABSENT_VIEWS), ...Object.values(ABSENT_DEPTH_SOURCES)]) {
      if (absent.disposition === 'elsewhere') {
        expect(absent.ownedBy, absent.name).toBeDefined()
      } else {
        expect(absent.ownedBy, absent.name).toBeUndefined()
      }
    }
  })

  it('files each list\'s members under the other list, from both sides', () => {
    // The symmetry that makes the two-axis claim legible from either corner,
    // and the counterpart of `ABSENT_SHADINGS.composited`, which C-5 filed
    // against this very ruling.
    expect(absentView('encoded')?.ownedBy).toContain('DEPTH_SOURCES')
    expect(absentDepthSource('stereo')?.ownedBy).toContain('VIEWS')
  })

  it('names nothing either list also registers', () => {
    for (const name of Object.keys(ABSENT_VIEWS)) expect([...VIEW_IDS], name).not.toContain(name)
    for (const name of Object.keys(ABSENT_DEPTH_SOURCES)) {
      expect([...DEPTH_SOURCE_IDS], name).not.toContain(name)
    }
  })

  it('is a disjointness check that can see an overlap', () => {
    expect([...VIEW_IDS]).toContain('depth')
    expect(Object.keys(ABSENT_VIEWS)).not.toContain('depth')
  })
})

describe('R-p, recorded as data rather than as a note', () => {
  it('says what the axis is and what would lose it', () => {
    // §9: "a recorded note is a sensor — it is not." Criterion (c): the record
    // has to say what `DEPTH_SOURCES` is *for*, which is that the teardown
    // would otherwise drop the axis silently.
    expect(DEPTH_SOURCE_PROVENANCE.axis.length).toBeGreaterThan(40)
    expect(DEPTH_SOURCE_PROVENANCE.lostWithout).toMatch(/teardown/)
    expect(DEPTH_SOURCE_PROVENANCE.ruling.length).toBeGreaterThan(120)
  })

  it('records every roster it is derived from, and no roster it is not', () => {
    expect(DEPTH_SOURCE_PROVENANCE.rosters.map(r => r.file).sort()).toEqual([MARKUP, REDUCER].sort())
    for (const roster of DEPTH_SOURCE_PROVENANCE.rosters) {
      expect(roster.what.trim(), roster.file).not.toBe('')
    }
  })
})

/* ------------------------------------------------------------------ *
 * Criterion 3, twice. `views.ts` is read as its own export list below.
 * ------------------------------------------------------------------ */

/**
 * This module's own source, read as the independent list of its readers.
 *
 * The census below is a list of questions somebody typed, so on its own it
 * cannot see a question that stops being asked: a label set computed by the
 * same function on both sides of a diff loses a deleted row from both sides
 * at once. C-11 measured that, and the answer is a list derived from
 * something the census does not control — here `views.ts`' own
 * `export function` lines.
 */
const MODULE = from('site/views.ts')

/**
 * A view nobody has registered, in the form a registration takes.
 *
 * **Named so that no real registration can collide with it**, which is not a
 * stylistic choice: C-13's dummy was `sepia`, its own real-registration plant
 * registered `sepia` for real, and four tests reddened on the name rather
 * than on the cost it was measuring. The test below asserts the
 * non-collision, because a fixture name is exactly the kind of thing a
 * docblock records and nothing enforces.
 *
 * `shows` names a canvas the page really has and `reason` is as long as a
 * real entry's, because {@link auditViews} demands both — a dummy the audit
 * rejects would prove the audit works and leave the registration unproven.
 */
const DUMMY_VIEW: ViewInfo = {
  view: 'fixture-view',
  label: 'A fixture',
  reason:
    'A fixture and not a proposal. A registration test needs an entry design §5.2 does not ' +
    'declare, so that the entry appearing cannot be the shipped registry answering in its ' +
    'place. Its name is hyphenated and says what it is, so that a view genuinely argued for ' +
    'in the design can never be spelled the same way and redden these tests for the wrong reason.',
  shows: ['depth'],
}

/**
 * A depth source nobody has registered. {@link DUMMY_VIEW}'s reasoning.
 *
 * `stage` is `after`, which is deliberate: a dummy reading a stage no shipped
 * source reads would make {@link auditDepthSources}' degeneracy complaint
 * change its answer for a reason that is not the registration.
 */
const DUMMY_SOURCE: DepthSourceInfo = {
  source: 'fixture-source',
  label: 'A fixture',
  reason:
    'A fixture and not a proposal. The `#depth-view` select does not offer it and ' +
    '`site/controls.ts` does not declare it, which is what makes it register rather than ' +
    'resolve: an entry drawn from either upstream would be answered for by the shipped table ' +
    'and every assertion below would be green over a reader that ignored the table it is handed.',
  stage: 'after',
}

/** The shipped registry plus one entry, which is the whole of a registration. */
const REGISTERED_VIEWS: ViewTable = { ...VIEWS, [DUMMY_VIEW.view]: DUMMY_VIEW }
const REGISTERED_SOURCES: DepthSourceTable = { ...DEPTH_SOURCES, [DUMMY_SOURCE.source]: DUMMY_SOURCE }

/**
 * The names a consumer can arrive holding, derived rather than listed.
 *
 * Every name either upstream states, both fixtures, every name either list has
 * already decided against, and the inherited names E8 covers — so the census
 * asks each reader about a name it should answer for, a name it should not,
 * and a name whose answer lives in the *other* axis' table.
 */
const PROBED: readonly string[] = [
  ...DESIGNED.ids,
  ...MARKED_UP.sources,
  DUMMY_VIEW.view,
  DUMMY_SOURCE.source,
  ...Object.keys(ABSENT_VIEWS),
  ...Object.keys(ABSENT_DEPTH_SOURCES),
  ...INHERITED,
]

/**
 * Every table a reader in this module reads, so the census can move any of them.
 *
 * **Four, and the two absence tables are here because of C-10's P12**: a row
 * the census cannot vary is a row that cannot move whatever you do, which
 * makes "it did not move under a registration" an unchecked declaration
 * rather than a measurement. That is what `absentView` and `absentDepthSource`
 * were widened for.
 */
interface AxisInputs {
  readonly views: ViewTable
  readonly sources: DepthSourceTable
  readonly absentViews: AbsentTable
  readonly absentSources: AbsentTable
}

/** The shipped tree, as the census reads it. */
const SHIPPED: AxisInputs = {
  views: VIEWS,
  sources: DEPTH_SOURCES,
  absentViews: ABSENT_VIEWS,
  absentSources: ABSENT_DEPTH_SOURCES,
}

/** One question and the answer this module gives it. */
type CensusRow = readonly [label: string, answer: string]

/**
 * Every question this module answers, with its answer, sorted by question.
 *
 * The instrument for the negative half of criterion 3. *"A dummy entry appears
 * without touching another file"* is a claim that **nothing else moved**, and
 * §6.5a says a null measurement is worth only what its control is worth, so
 * the rows are diffed across each registration and the moved ones counted.
 *
 * **One census over both axes, which is this file's reason for existing.** The
 * claim the two lists are two — not two halves of one — predicts that
 * registering a view moves no answer about a depth source and the reverse, and
 * that is a prediction only a census spanning both can be wrong about.
 */
function censusOfAxes({ views, sources, absentViews, absentSources }: AxisInputs): readonly CensusRow[] {
  const rows: CensusRow[] = [
    ['offeredViews', offeredViews(views).map(info => `${info.view}:${info.label}`).join(' ')],
    ['offeredDepthSources', offeredDepthSources(sources).map(info => `${info.source}:${info.label}`).join(' ')],
    ['axisOverlap', axisOverlap(views, sources).join(' ') || 'none'],
    ['auditViews', auditViews(views, DESIGNED.ids, MARKED_UP.canvases).join(' · ') || 'no complaints'],
    ['auditDepthSources', auditDepthSources(sources, MARKED_UP.sources).join(' · ') || 'no complaints'],
    ['defaultDepthSourceInfo', defaultDepthSourceInfo(sources)?.source ?? 'nothing'],
    ['resolveDepthSource(undefined)', resolveDepthSource(undefined, sources)],
  ]

  for (const canvas of MARKED_UP.canvases) {
    rows.push([`viewsShowing(${canvas})`, [...viewsShowing(canvas, views)].sort().join(' ') || 'nothing'])
  }

  for (const name of PROBED) {
    rows.push([`viewInfo(${name})`, viewInfo(name, views)?.label ?? 'nothing'])
    rows.push([`depthSourceInfo(${name})`, depthSourceInfo(name, sources)?.label ?? 'nothing'])
    rows.push([`resolveDepthSource(${name})`, resolveDepthSource(name, sources)])
    rows.push([`absentView(${name})`, absentView(name, absentViews)?.disposition ?? 'nothing'])
    rows.push([`absentDepthSource(${name})`, absentDepthSource(name, absentSources)?.disposition ?? 'nothing'])
  }

  return [...rows].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
}

/**
 * The questions whose answer differs between two censuses, by label.
 *
 * **The label check runs ahead of the diff, and here it earns its place on the
 * message rather than on the outcome** — C-13's narrowing of C-9's claim, and
 * it holds for this file too, because every caller below pins the moved labels
 * by name. Without the check, a row that vanished misaligns the positional
 * diff and names a long list of rows as moved, none of which did.
 */
function movedBetween(before: readonly CensusRow[], after: readonly CensusRow[]): readonly string[] {
  expect(after.map(row => row[0])).toEqual(before.map(row => row[0]))
  return after.filter((row, i) => row[1] !== before[i]![1]).map(row => row[0]).sort()
}

describe('the fixtures collide with nothing, which is a sensor and not a docblock', () => {
  it('names two fixtures neither list, neither absence table and neither upstream claims', () => {
    // C-13 lost four tests to a dummy that its own real-registration plant
    // then registered for real, and left this guard unbuilt deliberately
    // because it had already paid for it. It is one test, it is derived from
    // every roster in play rather than from a list, and it is cheaper than
    // reading four red tests that are not about what they say they are about.
    const taken = new Set([
      ...VIEW_IDS,
      ...DEPTH_SOURCE_IDS,
      ...CANVAS_KINDS,
      ...DESIGNED.ids,
      ...MARKED_UP.sources,
      ...MARKED_UP.canvases,
      ...REDUCED.ids,
      ...Object.keys(ABSENT_VIEWS),
      ...Object.keys(ABSENT_DEPTH_SOURCES),
      ...INHERITED,
    ])
    expect(taken.size, 'a guard against an empty set is not a guard').toBeGreaterThan(5)
    expect([...taken]).not.toContain(DUMMY_VIEW.view)
    expect([...taken]).not.toContain(DUMMY_SOURCE.source)
    expect(DUMMY_VIEW.view).not.toBe(DUMMY_SOURCE.source)
  })
})

describe('registering a view is an edit to the table and to nothing else', () => {
  it('offers the dummy, which is what a switcher reads and a lookup is not', () => {
    // Criterion 3's "appears", read as §9 requires: design §5.2's consumer
    // offers the views, so a view that is registered and not offered has not
    // appeared — it is merely reachable by a caller who already knows its
    // name. `VIEW_IDS` is a static declaration no registration can move,
    // which is the shape `SHADINGS` was caught in.
    const offered = offeredViews(REGISTERED_VIEWS)
    expect(offered.map(info => info.view)).toContain(DUMMY_VIEW.view)
    expect(offered.find(info => info.view === DUMMY_VIEW.view)).toEqual(DUMMY_VIEW)
  })

  it('reads the table it is handed and not the module, so a table of one offers one', () => {
    // The control on the assertion above, and the one that fails over a
    // reader backed by `VIEW_IDS`: that reader is green on `REGISTERED_VIEWS`
    // only by accident of the spread, and answers three entries here.
    expect(offeredViews({ [DUMMY_VIEW.view]: DUMMY_VIEW })).toEqual([DUMMY_VIEW])
  })

  it('hands the dummy to every view reader that takes a table', () => {
    expect(viewInfo(DUMMY_VIEW.view, REGISTERED_VIEWS)).toEqual(DUMMY_VIEW)
    expect(viewsShowing('depth', REGISTERED_VIEWS)).toContain(DUMMY_VIEW.view)
    expect(auditViews(REGISTERED_VIEWS, DESIGNED.ids, MARKED_UP.canvases)).toEqual([])
  })

  it('offers it to nobody who did not register it, so the fixture is not a shipped name', () => {
    expect(offeredViews().map(info => info.view)).not.toContain(DUMMY_VIEW.view)
    expect(viewInfo(DUMMY_VIEW.view)).toBeUndefined()
    expect(viewsShowing('depth')).not.toContain(DUMMY_VIEW.view)
    expect([...VIEW_IDS]).not.toContain(DUMMY_VIEW.view)
  })

  it('registers into a registry that already has entries, counted from the design roster', () => {
    // The vacuity floor, and it is not a number: §I-1's defect is a check
    // quantified over an empty set, and "one more than the design declares"
    // is the one honest way to say how many were there without typing it.
    expect(DESIGNED.ids.length).toBeGreaterThan(1)
    expect(offeredViews()).toHaveLength(DESIGNED.ids.length)
    expect(offeredViews(REGISTERED_VIEWS)).toHaveLength(DESIGNED.ids.length + 1)
    expect(offeredViews({})).toEqual([])
  })

  it('moves exactly the answers that name the dummy, and no answer about the other axis', () => {
    // `VIEWS` has no design §11 row and therefore no budget column, so there
    // is no document to check this against — which makes the census the
    // statement of the budget rather than a check on one. What it says: a
    // registration moves what the switcher offers, the lookup for that one
    // name, and the canvas question for the canvas the entry shows. Nothing
    // on the depth-source axis moves at all, which is the two-axis claim
    // stated as a measurement instead of as prose.
    const moved = movedBetween(censusOfAxes(SHIPPED), censusOfAxes({ ...SHIPPED, views: REGISTERED_VIEWS }))
    expect(moved).toEqual([
      'offeredViews',
      `viewInfo(${DUMMY_VIEW.view})`,
      'viewsShowing(depth)',
    ].sort())
  })

  it('sees the absent-views table move, so the rows that held still were measured', () => {
    // C-10's P12. The census claims the absence table did not move under a
    // registration; a row that cannot move whatever you do is an unchecked
    // declaration. Moving it from the other side is the proof that its
    // stillness above meant something — and it is only possible because
    // `absentView` was widened to take the table.
    const argued: AbsentMember = {
      name: DUMMY_VIEW.view,
      disposition: 'refused',
      reason: DUMMY_VIEW.reason,
    }
    const moved = movedBetween(
      censusOfAxes(SHIPPED),
      censusOfAxes({ ...SHIPPED, absentViews: { ...ABSENT_VIEWS, [argued.name]: argued } }),
    )
    expect(moved).toEqual([`absentView(${DUMMY_VIEW.view})`])
  })
})

describe('registering a depth source is an edit to the table and to nothing else', () => {
  it('offers the dummy, which is the question nothing in this module answered', () => {
    // The half `DEPTH_SOURCES` was missing outright, where `VIEWS` was missing
    // only part of it: every shipped depth-source reader was a lookup, so a
    // registered source was invisible to the one question the `#depth-view`
    // select asks — what is on the menu.
    const offered = offeredDepthSources(REGISTERED_SOURCES)
    expect(offered.map(info => info.source)).toContain(DUMMY_SOURCE.source)
    expect(offered.find(info => info.source === DUMMY_SOURCE.source)).toEqual(DUMMY_SOURCE)
  })

  it('reads the table it is handed and not the module, so a table of one offers one', () => {
    expect(offeredDepthSources({ [DUMMY_SOURCE.source]: DUMMY_SOURCE })).toEqual([DUMMY_SOURCE])
  })

  it('hands the dummy to every depth-source reader that takes a table', () => {
    expect(depthSourceInfo(DUMMY_SOURCE.source, REGISTERED_SOURCES)).toEqual(DUMMY_SOURCE)
    expect(resolveDepthSource(DUMMY_SOURCE.source, REGISTERED_SOURCES)).toBe(DUMMY_SOURCE.source)
    expect(auditDepthSources(REGISTERED_SOURCES, MARKED_UP.sources)).toEqual([])
  })

  it('offers it to nobody who did not register it, so the fixture is not a shipped name', () => {
    expect(offeredDepthSources().map(info => info.source)).not.toContain(DUMMY_SOURCE.source)
    expect(depthSourceInfo(DUMMY_SOURCE.source)).toBeUndefined()
    expect(resolveDepthSource(DUMMY_SOURCE.source)).toBe(DEFAULT_DEPTH_SOURCE)
    expect([...DEPTH_SOURCE_IDS]).not.toContain(DUMMY_SOURCE.source)
  })

  it('registers into a registry that already has entries, counted from the page roster', () => {
    // The floor derived from this axis' own upstream rather than from the
    // design sentence: `DEPTH_SOURCES` is derived from what the page offers,
    // and a floor read from the other list's upstream would be a number in
    // disguise.
    expect(MARKED_UP.sources.length).toBeGreaterThan(1)
    expect(offeredDepthSources()).toHaveLength(MARKED_UP.sources.length)
    expect(offeredDepthSources(REGISTERED_SOURCES)).toHaveLength(MARKED_UP.sources.length + 1)
    expect(offeredDepthSources({})).toEqual([])
  })

  it('moves exactly the answers that name the dummy, and no answer about the other axis', () => {
    const moved = movedBetween(censusOfAxes(SHIPPED), censusOfAxes({ ...SHIPPED, sources: REGISTERED_SOURCES }))
    expect(moved).toEqual([
      'offeredDepthSources',
      `depthSourceInfo(${DUMMY_SOURCE.source})`,
      `resolveDepthSource(${DUMMY_SOURCE.source})`,
    ].sort())
  })

  it('sees the absent-sources table move, so the rows that held still were measured', () => {
    const argued: AbsentMember = {
      name: DUMMY_SOURCE.source,
      disposition: 'refused',
      reason: DUMMY_SOURCE.reason,
    }
    const moved = movedBetween(
      censusOfAxes(SHIPPED),
      censusOfAxes({ ...SHIPPED, absentSources: { ...ABSENT_DEPTH_SOURCES, [argued.name]: argued } }),
    )
    expect(moved).toEqual([`absentDepthSource(${DUMMY_SOURCE.source})`])
  })

  it('does not become a view by being registered, which is the collapse this file watches for', () => {
    // The one cross-axis answer that *should* move, and the control on the two
    // "no answer about the other axis" assertions above: those are green over
    // a census blind to the other table, and this is not.
    const clash: DepthSourceTable = { ...DEPTH_SOURCES, depth: { ...DEPTH_SOURCES.encoded, source: 'depth' } }
    const moved = movedBetween(censusOfAxes(SHIPPED), censusOfAxes({ ...SHIPPED, sources: clash }))
    expect(moved).toContain('axisOverlap')
    expect(axisOverlap(VIEWS, clash)).toEqual(['depth'])
  })
})

describe('the census asks every question this module answers', () => {
  it('covers every reader views.ts exports, read from the source rather than from itself', () => {
    // The census cannot notice a question it stopped asking, because the label
    // set is computed by the same function on both sides of the diff. C-11's
    // answer: an independent list. `views.ts`' own export list is it — delete
    // a row from the census above and this is what says so.
    const exported = [...readFileSync(MODULE, 'utf8').matchAll(/^export function (\w+)/gm)]
      .map(match => match[1]!)
    expect(exported.length, 'a module with no readers is not what this is parsing')
      .toBeGreaterThan(1)

    const labels = censusOfAxes(SHIPPED).map(row => row[0])
    for (const reader of exported) {
      expect(labels.some(label => label === reader || label.startsWith(`${reader}(`)), reader).toBe(true)
    }
  })
})

describe('what each picker offers is what its own lookup resolves', () => {
  /**
   * E8 / R-l in the form an **enumerating** reader meets it, which is not the
   * form the lookups meet.
   *
   * `Object.prototype`'s members are non-enumerable, so they never reach a
   * picker by themselves and the lookups' hazard does not transfer. What does
   * reach one is a table that inherits from another table: `Object.create`'s
   * inherited entries are surfaced by `for…in` and refused by
   * `Object.hasOwn`, so a picker written the obvious way would put rows in the
   * menu that select nothing. Defining each picker in terms of its own lookup
   * is what makes that unrepresentable rather than merely tested.
   *
   * Built with `Object.create` rather than the `__proto__:` literal because
   * the two spellings are not interchangeable: C-8 measured that the literal
   * sets the prototype while the computed key declares an own property, and
   * both halves are wanted here.
   */
  const chainedViews: ViewTable = Object.assign(
    Object.create(VIEWS) as Record<string, ViewInfo>,
    { [DUMMY_VIEW.view]: DUMMY_VIEW },
  )
  const chainedSources: DepthSourceTable = Object.assign(
    Object.create(DEPTH_SOURCES) as Record<string, DepthSourceInfo>,
    { [DUMMY_SOURCE.source]: DUMMY_SOURCE },
  )

  /**
   * Tables that genuinely declare prototype member names as their own keys.
   *
   * **Written as a spread of an annotated value, and that is load-bearing
   * rather than terse.** C-10 and C-11 measured that an object literal keyed
   * by one of the `Object` interface's seven declared members widens the
   * value's fields, and that it bites only where the field's type is narrower
   * than its widened literal — `DepthSourceInfo.stage` is exactly such a
   * field. Measured here on these two types: a *fresh* literal under
   * `['constructor']` is `Type 'string' is not assignable to type
   * 'DepthStage'`; the same value **spread from an annotated const is clean**,
   * because the field's type then comes from the annotation and not from
   * literal inference. That is a cure neither of those two
   * measurements names, alongside `satisfies` and `as const`, and the reason rewriting these two fixtures as plain literals
   * would be a typecheck error `npm test` cannot see.
   */
  const oddlyKeyedViews: ViewTable = {
    ['__proto__']: { ...DUMMY_VIEW, view: '__proto__', label: 'Oddly named' },
    ['constructor']: { ...DUMMY_VIEW, view: 'constructor', label: 'Also oddly named' },
  }
  const oddlyKeyedSources: DepthSourceTable = {
    ['__proto__']: { ...DUMMY_SOURCE, source: '__proto__', label: 'Oddly named' },
    ['constructor']: { ...DUMMY_SOURCE, source: 'constructor', label: 'Also oddly named' },
  }

  it('offers only what a table owns, not what it inherits', () => {
    expect(offeredViews(chainedViews).map(info => info.view)).toEqual([DUMMY_VIEW.view])
    expect(offeredDepthSources(chainedSources).map(info => info.source)).toEqual([DUMMY_SOURCE.source])
    for (const id of VIEW_IDS) expect(viewInfo(id, chainedViews), id).toBeUndefined()
    for (const id of DEPTH_SOURCE_IDS) expect(depthSourceInfo(id, chainedSources), id).toBeUndefined()
  })

  it('does not let an inherited entry reach the canvas question either', () => {
    // `viewsShowing` is the module's other enumerating reader, and it was the
    // one already answering from a table before this task. It is defined in
    // terms of the same picker, so it inherits the property rather than
    // restating it — and this is the sensor for that.
    expect(viewsShowing('depth', chainedViews)).toEqual([DUMMY_VIEW.view])
  })

  it('offers entries genuinely keyed by a prototype member name', () => {
    // The other direction, and the one that proves each reader is `hasOwn`
    // rather than a blocklist of names: a table is free to key an entry by a
    // name the prototype also has, and that entry is a member like any other.
    expect(offeredViews(oddlyKeyedViews).map(info => info.view).sort())
      .toEqual(['__proto__', 'constructor'])
    expect(offeredDepthSources(oddlyKeyedSources).map(info => info.source).sort())
      .toEqual(['__proto__', 'constructor'])
  })

  it('offers exactly the entries the lookup resolves, over every shape of table', () => {
    // The property that makes picker and lookup one decision rather than two:
    // a row the picker offers and the lookup refuses is a menu entry that
    // selects nothing, and a row the lookup resolves and the picker omits is
    // the registration failing to appear.
    const viewShapes: readonly (readonly [string, ViewTable])[] = [
      ['shipped', VIEWS],
      ['registered', REGISTERED_VIEWS],
      ['inheriting', chainedViews],
      ['oddly keyed', oddlyKeyedViews],
      ['empty', {}],
    ]
    for (const [name, table] of viewShapes) {
      const offered = offeredViews(table)
      for (const info of offered) {
        expect(viewInfo(info.view, table), `${name}/${info.view}`).toEqual(info)
      }
      expect(offered.map(info => info.view).sort(), name).toEqual(Object.keys(table).sort())
    }

    const sourceShapes: readonly (readonly [string, DepthSourceTable])[] = [
      ['shipped', DEPTH_SOURCES],
      ['registered', REGISTERED_SOURCES],
      ['inheriting', chainedSources],
      ['oddly keyed', oddlyKeyedSources],
      ['empty', {}],
    ]
    for (const [name, table] of sourceShapes) {
      const offered = offeredDepthSources(table)
      for (const info of offered) {
        expect(depthSourceInfo(info.source, table), `${name}/${info.source}`).toEqual(info)
      }
      expect(offered.map(info => info.source).sort(), name).toEqual(Object.keys(table).sort())
    }
  })

  it('keeps the order each table declares, which is an argument somebody made', () => {
    // A picker that sorted its answer would discard an ordering somebody
    // argued for, and a registration appends rather than reorders.
    //
    // **The two lists do not take their order from the same place, and that
    // is a finding rather than an inconsistency.** `VIEW_IDS` copies design
    // §5.2's order deliberately, and the table is written in the same order,
    // so the picker and the id list agree. `DEPTH_SOURCE_IDS` deliberately
    // does *not* — C-5's convention puts the default away from index 0 — while
    // the **table** is written in the page's order, which is the order the
    // `#depth-view` select offers and therefore the only order a picker may
    // use. So the depth-source picker is pinned against the page's roster and
    // not against `DEPTH_SOURCE_IDS`, and the two orders disagreeing is
    // asserted rather than left for a reader to trip over.
    expect(offeredViews().map(info => info.view)).toEqual([...VIEW_IDS])
    expect(offeredViews(REGISTERED_VIEWS).map(info => info.view)).toEqual([...VIEW_IDS, DUMMY_VIEW.view])

    expect(offeredDepthSources().map(info => info.source)).toEqual([...MARKED_UP.sources])
    expect(offeredDepthSources(REGISTERED_SOURCES).map(info => info.source))
      .toEqual([...MARKED_UP.sources, DUMMY_SOURCE.source])
    expect([...DEPTH_SOURCE_IDS]).not.toEqual([...MARKED_UP.sources])
  })
})
