/**
 * `SHADINGS`, and the three things a four-name registry can get wrong.
 *
 * **It can go stale.** Four names with no upstream is the shape §9 calls a
 * hand-written list, and the usual answer — derive it — has no codebase
 * roster to derive from: survey §I-2 **[M]** measured design §5.2's
 * membership as *"fully determined"*, and there is no `Shading` in the model.
 * So the upstream used here is **design §5.2's own table**, parsed out of
 * `docs/plans/2026-10-13-editor-design.md`. A fifth row in the design, a
 * member dropped here, or a default moved in either place is red. That is
 * also the vacuity floor, and it is deliberately not a number: §9's trap is
 * that *"a numeric floor chosen from today's count is a check — it is not. A
 * specifier floor of 160 was overtaken inside its own cluster."* A floor of
 * `>= 4` would have passed an empty rename of every member.
 *
 * **It can be vacuous.** C-3's emptied-registry plant found survey §I-1's
 * exact defect inside C-3's own test file, so the plant is here too:
 * `auditShadings` is the instrument, the control drives it with `{}`, and the
 * parser gets its own control because a parser that silently returns no rows
 * is the same defect one level up.
 *
 * **It can answer for `constructor`.** E8 / R-l. Every reader is driven with
 * the inherited names, on the registry, on a spread copy of it, and on a
 * table that genuinely declares one as an own property.
 *
 * ## Not in this file
 *
 * The registration test — *a dummy entry appears without touching another
 * file* — is C-13's and belongs to criterion 3. {@link ShadingTable} being
 * keyed by `string` and every reader taking a `table` parameter is what makes
 * it writable.
 *
 * `site/depthmap.ts` is **read** here, through a namespace import, and is not
 * modified: design §5.2's amendment to its recorded rationale is plan §7
 * P4.12's, not this task's.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as depthmap from './depthmap.js'
import {
  ABSENT_SHADINGS,
  DEFAULT_CONTEST,
  DEFAULT_SHADING,
  SHADINGS,
  SHADING_DISPOSITIONS,
  SHADING_IDS,
  absentShading,
  auditShadings,
  defaultShadingInfo,
  resolveShading,
  shadingInfo,
} from './shadings.js'
import type { ShadingInfo, ShadingTable } from './shadings.js'

/**
 * The design document, which is this registry's upstream roster.
 *
 * Resolved from `import.meta.url` rather than from the process's working
 * directory, so the test says which file it means wherever vitest is invoked
 * from. Missing or moved is a hard read error, which is the right failure:
 * the roster having moved is exactly the condition this file exists to
 * notice.
 */
const DESIGN = fileURLToPath(new URL('../docs/plans/2026-10-13-editor-design.md', import.meta.url))

/** What design §5.2's table says the shadings are. */
interface DesignShadings {
  readonly ids: readonly string[]
  readonly chosen: string
}

/**
 * Design §5.2's four-row table, read as a roster.
 *
 * **Throws rather than returning nothing.** A parser that answers `[]` when
 * it cannot find the table is a fail-open answer to "does the registry match
 * the design" — every set comparison below would then be comparing against
 * an empty roster and the `auditShadings` call would have nothing to demand.
 * That is survey §I-1's defect moved one level up, which is why the controls
 * below drive each of the three throws.
 *
 * The first cell is stripped of backticks and of any bold run, so
 * `` | `ramp` **(default)** | `` reads as `ramp`; the `(default)` marker is
 * read off the *unstripped* cell, which is how {@link DEFAULT_SHADING} gets
 * an upstream too rather than being a second literal nothing ties down.
 */
function shadingsFromDesign(markdown: string): DesignShadings {
  const lines = markdown.split('\n')
  const header = lines.findIndex(line => /^\|\s*shading\s*\|\s*what\s*\|\s*$/.test(line))
  if (header === -1) {
    throw new Error('design §5.2\'s shading table is not where this test looks for it')
  }

  const ids: string[] = []
  let chosen: string | undefined
  for (let i = header + 2; i < lines.length; i++) {
    const line = lines[i]!
    if (!line.startsWith('|')) break
    const cell = line.split('|')[1] ?? ''
    const id = cell.replace(/\*\*.*?\*\*/g, '').replace(/`/g, '').trim()
    if (id === '') continue
    ids.push(id)
    if (cell.includes('(default)')) chosen = id
  }

  if (ids.length === 0) throw new Error('design §5.2\'s shading table has a header and no rows')
  if (chosen === undefined) throw new Error('design §5.2\'s shading table marks no row (default)')
  return { ids, chosen }
}

/** The roster as the shipped design states it. */
const DESIGNED = shadingsFromDesign(readFileSync(DESIGN, 'utf8'))

/**
 * The modules a {@link ShadingInfo.implementedBy} may name, by specifier.
 *
 * A map and not a dynamic import, so a specifier nobody wired up is a named
 * failure rather than a resolution error, and so the recorded string is the
 * thing under test. C-4's convention: *"a sensor in another module is not a
 * sensor this registry can be read against"* — the point of resolving the
 * claim here is that renaming `depthToRgba` reddens **this** file.
 */
const IMPLEMENTING_MODULES: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  './depthmap.js': depthmap,
}

/** The inherited names a registry must never answer for. E8 / R-l. */
const INHERITED = ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']

describe('the membership comes from design §5.2, not from this file', () => {
  it('registers exactly the shadings the design table declares', () => {
    // Set equality in both directions. A floor would catch a deletion and
    // miss a rename; this catches both, and it catches the design gaining a
    // row that nobody registered — which is the direction a registry with a
    // closed membership actually rots in.
    expect([...SHADING_IDS].sort()).toEqual([...DESIGNED.ids].sort())
  })

  it('takes its default from the row the design marks, not from a second literal', () => {
    expect(DEFAULT_SHADING).toBe(DESIGNED.chosen)
  })

  it('found a real table, so the comparison above is not against nothing', () => {
    // The vacuity floor on the roster itself: §I-1's defect is a check
    // universally quantified over an empty set, and the set here is the
    // parse. Several rows and a marked default, derived — not four.
    expect(DESIGNED.ids.length).toBeGreaterThan(1)
    expect(DESIGNED.ids).toContain(DESIGNED.chosen)
    expect(new Set(DESIGNED.ids).size).toBe(DESIGNED.ids.length)
  })

  it('reads as many rows as the table has, rather than as many as today', () => {
    // The control that keeps the parser honest about tomorrow: a parser that
    // stopped at four would agree with the registry forever. Five synthetic
    // rows must read as five.
    const five = [
      '| shading | what |',
      '|---|---|',
      '| `a` **(default)** | one |',
      '| `b` | two |',
      '| `c` | three |',
      '| `d` | four |',
      '| `e` | five |',
      '',
      'prose after the table',
    ].join('\n')
    expect(shadingsFromDesign(five)).toEqual({ ids: ['a', 'b', 'c', 'd', 'e'], chosen: 'a' })
  })

  it('refuses to answer when the table is not there, instead of answering nothing', () => {
    expect(() => shadingsFromDesign('# a document with no such table\n'))
      .toThrow(/is not where this test looks for it/)
  })

  it('refuses to answer when the table has no rows', () => {
    expect(() => shadingsFromDesign('| shading | what |\n|---|---|\n\nprose\n'))
      .toThrow(/a header and no rows/)
  })

  it('refuses to answer when no row is marked as the default', () => {
    expect(() => shadingsFromDesign('| shading | what |\n|---|---|\n| `a` | one |\n'))
      .toThrow(/marks no row \(default\)/)
  })
})

describe('SHADING_IDS', () => {
  it('is the runtime witness for the compile-time shading pair', () => {
    // §F-6: `AssertNever` is enforced by `npm run typecheck` alone, so
    // without this the pair in `shadings.ts` is invisible to `npm test` and
    // therefore to the gate's test leg. The registry is total over `Shading`
    // by annotation, so its key set is the union read at run time.
    expect([...SHADING_IDS].sort()).toEqual(Object.keys(SHADINGS).sort())
  })

  it('names each shading exactly once', () => {
    expect(new Set(SHADING_IDS).size).toBe(SHADING_IDS.length)
  })

  it('resolves every id through the reader', () => {
    for (const id of SHADING_IDS) {
      expect(shadingInfo(id)?.shading, id).toBe(id)
    }
  })
})

describe('the default is a config value and not a position', () => {
  it('does not sit at the head of the list, so SHADING_IDS[0] cannot stand in for it', () => {
    // The whole criterion in one line. Design §5.2's own table lists `ramp`
    // first *because* it is the default; copying that order would have made
    // the two expressions agree by accident, and the next reader to reach for
    // the shorter one would have turned the default back into a position
    // without a single test noticing.
    expect(SHADING_IDS[0]).not.toBe(DEFAULT_SHADING)
  })

  it('names a registered shading, which the annotation makes unrepresentable to get wrong', () => {
    // `DEFAULT_SHADING: Shading` means a name that is not a shading is a
    // compile error rather than a caught mistake — but `npm run typecheck`
    // is the only thing that enforces it, so this is the runtime half of the
    // §F-6 pairing applied to the default.
    expect(SHADING_IDS).toContain(DEFAULT_SHADING)
    expect(defaultShadingInfo()?.shading).toBe(DEFAULT_SHADING)
  })

  it('is what an absent preference resolves to', () => {
    expect(resolveShading(undefined)).toBe(DEFAULT_SHADING)
  })

  it('is what an unreadable preference resolves to, rather than an error', () => {
    for (const nonsense of ['', 'Ramp', ' ramp', 'rainbow', 'jet']) {
      expect(resolveShading(nonsense), nonsense).toBe(DEFAULT_SHADING)
    }
  })

  it('steps aside for a preference that names a shading, which is what "by preference" means', () => {
    // Design §5.2: "reversible by preference rather than by code". This is
    // the path that costs no edit at all, which is why the one-token edit to
    // `DEFAULT_SHADING` can afford to also cost an update to the contest.
    for (const id of SHADING_IDS) {
      expect(resolveShading(id), id).toBe(id)
    }
  })

  it('is a fallback and not a function that answers the default to everything', () => {
    // The control on the two assertions above: both would pass if
    // `resolveShading` ignored its argument, and both would pass if it echoed
    // it. Neither is true.
    expect(resolveShading('relief')).not.toBe(DEFAULT_SHADING)
    expect(resolveShading('rainbow')).not.toBe('rainbow')
  })
})

describe('the conflict over the default, not just its outcome', () => {
  it('records which shading won and ties it to the shipped default', () => {
    // Design §5.2 requires the conflict to survive: "R12 wins, and the
    // conflict is recorded rather than silently resolved." Flipping
    // `DEFAULT_SHADING` and leaving this alone is red here, which is the only
    // way the record cannot be destroyed by the one-token edit.
    expect(DEFAULT_CONTEST.chosen).toBe(DEFAULT_SHADING)
  })

  it('records which shading lost, and it is a different registered one', () => {
    expect(DEFAULT_CONTEST.contender).not.toBe(DEFAULT_CONTEST.chosen)
    expect(SHADING_IDS).toContain(DEFAULT_CONTEST.contender)
  })

  it('keeps the losing argument, which is the half a bare default destroys', () => {
    // Asserted separately from the winner's case: a record that carried only
    // `chosenBecause` would read as a rationale rather than as a contest, and
    // the research finding the design says was outranked would be gone.
    expect(DEFAULT_CONTEST.contenderBecause.length).toBeGreaterThan(80)
    expect(DEFAULT_CONTEST.chosenBecause.length).toBeGreaterThan(80)
    expect(DEFAULT_CONTEST.resolvedBy.length).toBeGreaterThan(80)
  })

  it('names the loser in the losing argument, so the two cannot drift apart', () => {
    expect(DEFAULT_CONTEST.contenderBecause.toLowerCase()).toContain(DEFAULT_CONTEST.contender)
  })
})

describe('every shading carries its recorded reason', () => {
  it('passes the audit against the design\'s own roster', () => {
    // §2.3: a constant with no recorded reason is a review failure, and four
    // bare names would be four of them. The audit is also where the
    // key-mirroring, the shipped claim and the hillshade's guard rail are
    // enforced, so one call covers the per-entry contract.
    expect(auditShadings(SHADINGS, DESIGNED.ids)).toEqual([])
  })

  it('quotes the design rather than paraphrasing it, per entry', () => {
    // Not a length floor dressed up: each entry has to say something a
    // reviewer can check against §5.2, and the shortest honest version of
    // that is longer than a label.
    for (const id of SHADING_IDS) {
      expect(shadingInfo(id)!.reason.length, id).toBeGreaterThan(120)
      expect(shadingInfo(id)!.label.trim(), id).not.toBe('')
    }
  })

  it('reads zero complaints on a registry that has entries, which is what makes it non-vacuous', () => {
    // C-3's plant, which caught survey §I-1's defect inside C-3's own test
    // file: the audit above is a loop, and a loop over nothing is green. An
    // empty registry must fail it, once per demanded shading.
    const complaints = auditShadings({}, DESIGNED.ids)
    expect(complaints).toHaveLength(DESIGNED.ids.length)
    for (const id of DESIGNED.ids) {
      expect(complaints.join(' '), id).toContain(`no entry for \`${id}\``)
    }
  })

  it('sees an entry registered under a key it does not know', () => {
    const misfiled: ShadingTable = { ...SHADINGS, grey: { ...SHADINGS.grey, shading: 'gray' } }
    expect(auditShadings(misfiled, DESIGNED.ids).join(' ')).toContain('does not know')
  })

  it('sees an entry with no recorded reason', () => {
    const mute: ShadingTable = { ...SHADINGS, turbo: { ...SHADINGS.turbo, reason: '   ' } }
    expect(auditShadings(mute, DESIGNED.ids).join(' ')).toContain('no recorded reason')
  })

  it('sees a hillshade lit from on or below the horizon', () => {
    // Design §5.2a: "relief azimuth is constrained above the horizon or the
    // surface inverts." Recorded as a range on the data rather than left to
    // whichever widget P4 writes, because a constraint that lives in a widget
    // is a constraint the second widget does not have.
    for (const altitudeDeg of [0, -45, 91]) {
      const flat: ShadingTable = {
        ...SHADINGS,
        relief: { ...SHADINGS.relief, light: { azimuthDeg: 315, altitudeDeg } },
      }
      expect(auditShadings(flat, DESIGNED.ids).join(' '), `${altitudeDeg}`)
        .toContain('above the horizon')
    }
  })

  it('sees an azimuth that is not a compass bearing', () => {
    const spun: ShadingTable = {
      ...SHADINGS,
      relief: { ...SHADINGS.relief, light: { azimuthDeg: 400, altitudeDeg: 45 } },
    }
    expect(auditShadings(spun, DESIGNED.ids).join(' ')).toContain('not a compass bearing')
  })
})

describe('the hillshade\'s light', () => {
  it('is 315° azimuth and 45° altitude, in degrees, as design §5.2 states', () => {
    // §9's standing trap: `Transform.rotate` is radians while `shape.start`
    // and `shape.end` are degrees, and design §9.1 cites that collision. The
    // field names carry the unit so a renderer that takes radians cannot read
    // these as if they were.
    expect(SHADINGS.relief.light).toEqual({ azimuthDeg: 315, altitudeDeg: 45 })
  })

  it('recruits the light-from-above prior, which is what puts it above the horizon', () => {
    expect(SHADINGS.relief.light!.altitudeDeg).toBeGreaterThan(0)
    expect(SHADINGS.relief.light!.altitudeDeg).toBeLessThanOrEqual(90)
  })

  it('is carried by the hillshade and by nothing that is a LUT', () => {
    // A light on a two-point ramp would be meaningless, and a light absent
    // from the hillshade would leave P4 to invent the numbers. Both
    // directions, so neither drifts.
    const lit = SHADING_IDS.filter(id => SHADINGS[id].light !== undefined)
    expect(lit).toEqual(['relief'])
  })
})

describe('what ships today, as a claim that goes red when it stops being true', () => {
  it('names an implementation for exactly the shadings that claim to ship', () => {
    // C-4's convention: a recorded claim about today's population is only
    // worth writing down if something reddens when reality outgrows it *and*
    // when the claim is flipped early. Both directions are in `auditShadings`
    // and this is the witness over the shipped registry.
    const claiming = SHADING_IDS.filter(id => SHADINGS[id].shipped)
    const naming = SHADING_IDS.filter(id => SHADINGS[id].implementedBy !== undefined)
    expect(claiming).toEqual(naming)
  })

  it('is non-vacuous in both directions: something ships and something does not', () => {
    // Without this the pair above is green on a registry where nothing ships
    // and green on one where everything does — the same `0 === 0` defect,
    // one level over.
    expect(SHADING_IDS.filter(id => SHADINGS[id].shipped).length).toBeGreaterThan(0)
    expect(SHADING_IDS.filter(id => !SHADINGS[id].shipped).length).toBeGreaterThan(0)
  })

  it('resolves every named implementation to an export that is really there', () => {
    // The sensor pointed at the upstream module. `grey` claims
    // `depthmap.ts`'s `depthToRgba`, and plan §7 P4.2 requires that mapping
    // stay "byte-identical to today"; if it is renamed or removed, this
    // registry stops describing anything and says so here rather than
    // shipping a claim about a function nobody has.
    for (const id of SHADING_IDS) {
      const claim = SHADINGS[id].implementedBy
      if (claim === undefined) continue
      const namespace = IMPLEMENTING_MODULES[claim.module]
      expect(namespace, `${id} names an unwired module: ${claim.module}`).toBeDefined()
      expect(Object.keys(namespace!), `${id} → ${claim.module}`).toContain(claim.export)
      expect(typeof namespace![claim.export], `${id} → ${claim.export}`).toBe('function')
    }
  })

  it('is a resolution check that can see a name that is not there', () => {
    // The control on the loop above: it would be green over a registry that
    // named nothing, and green over one whose names were nonsense if the
    // lookup itself were broken.
    expect(Object.keys(IMPLEMENTING_MODULES['./depthmap.js']!)).not.toContain('depthToRgbaa')
    expect(Object.keys(IMPLEMENTING_MODULES['./depthmap.js']!)).toContain('depthToRgba')
  })
})

describe('every lookup refuses the prototype chain', () => {
  /**
   * E8 / R-l. `SHADINGS` is a plain object literal — it has to be, since the
   * `Record<Shading, ShadingInfo>` annotation that makes a fifth member a
   * compile error is only available on one — so `SHADINGS['constructor']` is
   * the `Object` function and `'toString' in SHADINGS` is `true`. The guard
   * is `Object.hasOwn` at every reader, which is also the only guard that
   * survives the `{...SHADINGS}` the shell will write.
   *
   * There is no composition accumulator here to corrupt, because this
   * registry has no `composeShadings` — see `shadings.ts`' header for why a
   * closed membership does not need one. The hazard C-4 recorded, a
   * `merged['__proto__'] = x` silently losing an entry, therefore has no site
   * in this module; what is tested instead is that a table which genuinely
   * declares one of these names as an own property still resolves.
   */
  it('answers undefined for an inherited member', () => {
    for (const name of INHERITED) {
      expect(shadingInfo(name), name).toBeUndefined()
      expect(absentShading(name), name).toBeUndefined()
    }
  })

  it('still refuses one on a spread copy, which is the shape the shell will hold', () => {
    const copy: ShadingTable = { ...SHADINGS }
    for (const name of INHERITED) {
      expect(shadingInfo(name, copy), name).toBeUndefined()
    }
  })

  it('falls back to the default rather than honouring an inherited name as a preference', () => {
    // The sharpest consequence: without the guard, a stored preference of
    // `constructor` would resolve to `constructor`, and the view would ask
    // for a shading whose entry is the `Object` function.
    for (const name of INHERITED) {
      expect(resolveShading(name), name).toBe(DEFAULT_SHADING)
    }
  })

  it('resolves a shading genuinely named for an inherited member', () => {
    // The other half, and the one that proves the guard is `hasOwn` and not a
    // blocklist of five words.
    //
    // A property literally called `constructor` gets **no contextual type**
    // from `Record<string, ShadingInfo>`, because `Object.prototype.
    // constructor` shadows the index signature — so the entry is annotated
    // separately. C-4 measured both spellings failing and vitest running
    // green while `svelte-check` reported the error; this is the shape that
    // typechecks.
    const oddEntry: ShadingInfo = {
      shading: 'constructor',
      label: 'Oddly named',
      reason: 'A fixture: a table is free to key an entry by a name the prototype also has.',
      shipped: false,
    }
    const odd: ShadingTable = { ['constructor']: oddEntry }
    expect(shadingInfo('constructor', odd)?.label).toBe('Oddly named')
    expect(resolveShading('constructor', odd)).toBe('constructor')
  })

  it('resolves one keyed __proto__ as an own property, not as a prototype', () => {
    // The composition hazard's cousin. `{ __proto__: x }` in a literal
    // reassigns the prototype and declares nothing; the computed form below
    // declares an own property. A reader using `in` would agree with both and
    // could not tell them apart.
    const entry: ShadingInfo = {
      shading: '__proto__',
      label: 'Also oddly named',
      reason: 'A fixture: the computed key form declares an own property rather than a prototype.',
      shipped: false,
    }
    const odd: ShadingTable = { ['__proto__']: entry }
    expect(Object.hasOwn(odd, '__proto__')).toBe(true)
    expect(shadingInfo('__proto__', odd)?.label).toBe('Also oddly named')
  })

  it('is a guard and not a function that answers undefined to everything', () => {
    // The control: all four assertions above pass over a reader that always
    // returns `undefined`.
    expect(shadingInfo(DEFAULT_SHADING)).toBeDefined()
    expect(absentShading('jet')).toBeDefined()
  })
})

describe('the shadings the design has already decided against', () => {
  it('records a disposition and a reason for each, because the absence is the decision', () => {
    for (const [name, absent] of Object.entries(ABSENT_SHADINGS)) {
      expect(absent.name, name).toBe(name)
      expect(SHADING_DISPOSITIONS, name).toContain(absent.disposition)
      expect(absent.reason.length, name).toBeGreaterThan(120)
    }
  })

  it('is the runtime witness for the disposition pair, and uses both members', () => {
    // §F-6 again, and C-4's refinement: a two-member union with one member
    // unused is a distinction nobody has had to make. Both are in use, so
    // the split is load-bearing rather than aspirational.
    const used = new Set(Object.values(ABSENT_SHADINGS).map(absent => absent.disposition))
    expect([...used].sort()).toEqual([...SHADING_DISPOSITIONS].sort())
  })

  it('names the owner of everything it files as owned elsewhere, and only those', () => {
    // A refusal filed as somebody else's problem is a settled argument that
    // somebody else reopens — C-4's reason for splitting the two. The owner
    // field is what makes the difference checkable rather than editorial.
    for (const absent of Object.values(ABSENT_SHADINGS)) {
      if (absent.disposition === 'elsewhere') {
        expect(absent.ownedBy, absent.name).toBeDefined()
        expect(absent.ownedBy!.length, absent.name).toBeGreaterThan(10)
      } else {
        expect(absent.ownedBy, absent.name).toBeUndefined()
      }
    }
  })

  it('refuses the rainbow, which is the one the registry would otherwise be asked for', () => {
    // The only pure refusal here, and it is the reason `turbo` is in the
    // registry at all: design §5.2a's "a custom ramp must be monotonic in
    // luminance or depth ordering becomes unreadable".
    expect(absentShading('jet')?.disposition).toBe('refused')
  })

  it('names nothing it also registers', () => {
    for (const id of SHADING_IDS) {
      expect(absentShading(id), id).toBeUndefined()
    }
  })

  it('is a disjointness check that can see an overlap', () => {
    // The control: the loop above passes over an empty absence table and over
    // a registry of one.
    expect(Object.keys(ABSENT_SHADINGS).length).toBeGreaterThan(1)
    expect(absentShading(Object.keys(ABSENT_SHADINGS)[0]!)).toBeDefined()
  })

  it('records no shading as merely pending, because none is', () => {
    // Stated as a test rather than as a comment, per §9: "a recorded note is
    // not a sensor". Survey §I-2 **[M]** measured §5.2's membership as fully
    // determined, so a `SHADINGS` entry that has not been written does not
    // exist — everything absent is either argued against or belongs to
    // another mechanism. The day that stops being true, the design table
    // gains a row and the first test in this file goes red, which is where
    // the decision belongs.
    expect([...SHADING_DISPOSITIONS]).not.toContain('deferred')
  })
})

describe('the ShadingInfo shape', () => {
  it('is readable as a plain value without the registry', () => {
    // §2.4, assert on structure: an entry handed to a menu renderer must
    // carry everything that renderer needs, so that nothing has to reach back
    // into the table to find out what it is holding.
    const info = shadingInfo(DEFAULT_SHADING)!
    expect(Object.keys(info).sort()).toEqual(['label', 'reason', 'shading', 'shipped'])
  })

  it('carries the optional fields only where the design gives them', () => {
    expect(Object.keys(SHADINGS.relief).sort())
      .toEqual(['label', 'light', 'reason', 'shading', 'shipped'])
    expect(Object.keys(SHADINGS.grey).sort())
      .toEqual(['implementedBy', 'label', 'reason', 'shading', 'shipped'])
  })
})
