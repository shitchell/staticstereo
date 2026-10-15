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
 * ## Not in this file
 *
 * The registration test — *a dummy entry appears without touching another
 * file* — is C-14's, for **both** lists. {@link ViewTable} and
 * {@link DepthSourceTable} being keyed by `string`, and every reader taking a
 * `table` parameter, is what makes it writable.
 *
 * `site/index.html`, `site/controls.ts` and `site/depthmap.ts` are **read** here
 * and not modified.
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
  resolveDepthSource,
  viewInfo,
  viewsShowing,
} from './views.js'
import type { DepthSourceInfo, DepthSourceTable, ViewInfo, ViewTable } from './views.js'

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
function viewsFromDesign(markdown: string): DesignViews {
  const sentence = /\*\*([A-Za-z]+) views\*\*[^\n]*?as a registry:([^\n]*)/.exec(markdown)
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
const DESIGNED = viewsFromDesign(readFileSync(from(DESIGN), 'utf8'))
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
