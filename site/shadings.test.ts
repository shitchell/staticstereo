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
 * ## The registration test, and the half of it that needed a reader
 *
 * Criterion 3 — *a dummy entry appears without touching another file* — is
 * discharged at the foot of this file. C-5 left it writable and it was:
 * {@link ShadingTable} is keyed by `string`, and `shadingInfo`,
 * `resolveShading`, `defaultShadingInfo` and `auditShadings` all take a
 * `table`, so a dummy registered into a copy is **found** by every one of
 * them with no production edit at all.
 *
 * **Found is not offered, and that is the whole of what was missing.** Plan
 * §9: *"a registration test must assert that the thing a consumer does is now
 * possible — not that the entry can be found."* What design §5.2's consumer
 * does is *offer* the shadings — the depth view "carries a shading", and
 * {@link ShadingInfo.label} exists to be "a menu entry, a radio label, a
 * legend heading". No reader answered that question: its answer was
 * {@link SHADING_IDS}, a static declaration no table can move, so a
 * registered shading was reachable only by a caller who already knew its
 * name. {@link offeredShadings} answers it from the table, and
 * {@link absentShading} gained the `table` parameter its four neighbours
 * already had so that the census below can move its rows from the other side.
 *
 * **What a real registration costs, measured rather than argued.** Planted as
 * a shipped member — the union, the roster and the entry, which the
 * `AssertNever` pair makes one indivisible edit — and it is `shadings.ts`
 * alone, typecheck clean, with exactly one file red and both of its failures
 * saying the same thing: design §5.2 does not declare it. Add the design row
 * and the suite is green. So §11 row 6's *"one registration"* holds for code
 * and costs a row in `docs/plans/2026-10-13-editor-design.md` beside it,
 * which is this registry's upstream being an upstream rather than a comment.
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
  offeredShadings,
  resolveShading,
  shadingInfo,
} from './shadings.js'
import type { AbsentShading, ShadingInfo, ShadingTable } from './shadings.js'

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
    // The entry is annotated separately because reading it that way is
    // clearer, and **not** because it has to be: the `constructor`-key
    // widening C-4 met needs the entry type to carry a string-literal-union
    // field, and `ShadingInfo` carries none — every field is `string`,
    // `boolean` or an interface. Measured here at TypeScript 5.9.3 /
    // svelte-check 4.7.6: the bare `constructor:` key with the value written
    // inline is **0 errors**, so a reader budgeting a workaround for this
    // table is budgeting for a hazard it does not have. C-10 lost four probe
    // rounds to exactly that, and the correction is that the trigger is the
    // field's type and not the key.
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

/**
 * This module's own source, read as the independent list of its readers.
 *
 * The census below is a list of questions somebody typed, so on its own it
 * cannot see a question that stops being asked: a label set computed by the
 * same function on both sides of a diff loses a deleted row from both sides
 * at once. C-11 measured that, and the answer is a list derived from
 * something the census does not control — here `shadings.ts`' own
 * `export function` lines.
 */
const MODULE = fileURLToPath(new URL('./shadings.ts', import.meta.url))

/**
 * A shading nobody has registered, in the form a registration takes.
 *
 * Deliberately not one of design §5.2's four: a dummy drawn from the shipped
 * roster would be answered for by the shipped registry, and every assertion
 * below would be green over a reader that ignored its table entirely. Its
 * reason is as long as a real entry's because `auditShadings` demands one —
 * a dummy the audit rejects would prove the audit works and leave the
 * registration unproven.
 */
const DUMMY: ShadingInfo = {
  shading: 'sepia',
  label: 'Sepia',
  reason:
    'A fixture and not a proposal. A registration test needs an entry design §5.2 does not ' +
    'declare, so that the entry appearing cannot be the shipped registry answering in its ' +
    'place. If a sepia shading is ever argued for it belongs in `SHADINGS` with its reason ' +
    'quoted from the design, and this fixture should then be renamed to a name nobody wants.',
  shipped: false,
}

/** The shipped registry plus one entry, which is the whole of a registration. */
const REGISTERED: ShadingTable = { ...SHADINGS, [DUMMY.shading]: DUMMY }

/**
 * The names a consumer can arrive holding, derived rather than listed.
 *
 * Every registered shading, the dummy, every name the design has already
 * decided against, and the inherited names E8 covers — so the census asks
 * each reader about a name it should answer for, a name it should not, and a
 * name whose answer lives in the other table.
 */
const PROBED: readonly string[] = [
  ...DESIGNED.ids,
  DUMMY.shading,
  ...Object.keys(ABSENT_SHADINGS),
  ...INHERITED,
]

/** Every table a reader in this module reads, so the census can move any of them. */
interface ShadingInputs {
  readonly table: ShadingTable
  readonly absences: Readonly<Record<string, AbsentShading>>
}

/** One question and the answer this module gives it. */
type CensusRow = readonly [label: string, answer: string]

/**
 * Every question this module answers, with its answer, sorted by question.
 *
 * The instrument for the negative half of criterion 3. *"A dummy entry
 * appears without touching another file"* is a claim that **nothing else
 * moved**, and §6.5a says a null measurement is worth only what its control
 * is worth, so the rows are diffed across the registration and the moved ones
 * counted. A row's label names the reader that produced it, which is what
 * lets the check below compare the label set against the module's exports
 * instead of against itself.
 *
 * Both tables are parameters. An input the census cannot vary is a row that
 * cannot move, and a row that cannot move is a declaration rather than a
 * measurement — C-10's finding, and the reason `absentShading` now takes the
 * table its neighbours take.
 */
function censusOfShadings({ table, absences }: ShadingInputs): readonly CensusRow[] {
  const rows: CensusRow[] = [
    ['offeredShadings', offeredShadings(table).map(info => `${info.shading}:${info.label}`).join(' ')],
    ['defaultShadingInfo', defaultShadingInfo(table)?.shading ?? 'nothing'],
    ['auditShadings', auditShadings(table, DESIGNED.ids).join(' · ') || 'no complaints'],
    ['resolveShading(undefined)', resolveShading(undefined, table)],
  ]

  for (const name of PROBED) {
    rows.push([`shadingInfo(${name})`, shadingInfo(name, table)?.label ?? 'nothing'])
    rows.push([`resolveShading(${name})`, resolveShading(name, table)])
    rows.push([`absentShading(${name})`, absentShading(name, absences)?.disposition ?? 'nothing'])
  }

  return [...rows].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
}

/**
 * The questions whose answer differs between two censuses, by label.
 *
 * **The label check runs ahead of the diff, and what it buys here is a true
 * failure rather than a red one.** C-9 kept it so that a question which vanished could not
 * read as an answer that did not change; the callers below pin the moved
 * labels by name, so a vanished row is red either way. Planted: drop the
 * check and let one row disappear from the larger census, and the positional
 * diff misaligns and names sixteen rows as moved, none of which did. A
 * measurement that reddens while naming the wrong subject is the one a
 * reader believes.
 */
function movedBetween(before: readonly CensusRow[], after: readonly CensusRow[]): readonly string[] {
  expect(after.map(row => row[0])).toEqual(before.map(row => row[0]))
  return after.filter((row, i) => row[1] !== before[i]![1]).map(row => row[0]).sort()
}

describe('registering a shading is an edit to the table and to nothing else', () => {
  it('offers the dummy, which is what a picker reads and a lookup is not', () => {
    // Criterion 3's "appears", read as plan §9 requires: the consumer of
    // design §5.2 offers the shadings, so a shading that is registered and
    // not offered has not appeared — it is merely reachable by a caller who
    // already knows its name.
    const offered = offeredShadings(REGISTERED)
    expect(offered.map(info => info.shading)).toContain(DUMMY.shading)
    expect(offered.find(info => info.shading === DUMMY.shading)).toEqual(DUMMY)
  })

  it('reads the table it is handed and not the module, so a table of one offers one', () => {
    // The control on the assertion above, and the one that fails over a
    // reader backed by `SHADING_IDS`: that reader is green on `REGISTERED`
    // only by accident of the spread, and answers four entries here.
    expect(offeredShadings({ [DUMMY.shading]: DUMMY })).toEqual([DUMMY])
  })

  it('hands the dummy to every reader that takes a table', () => {
    expect(shadingInfo(DUMMY.shading, REGISTERED)).toEqual(DUMMY)
    expect(resolveShading(DUMMY.shading, REGISTERED)).toBe(DUMMY.shading)
    expect(auditShadings(REGISTERED, DESIGNED.ids)).toEqual([])
  })

  it('offers it to nobody who did not register it, so the fixture is not a shipped name', () => {
    expect(offeredShadings().map(info => info.shading)).not.toContain(DUMMY.shading)
    expect(shadingInfo(DUMMY.shading)).toBeUndefined()
    expect(resolveShading(DUMMY.shading)).toBe(DEFAULT_SHADING)
    expect(SHADING_IDS).not.toContain(DUMMY.shading)
  })

  it('registers into a registry that already has entries, counted from the design roster', () => {
    // The vacuity floor, and it is not a number: §I-1's defect is a check
    // quantified over an empty set, and "one more than the design declares"
    // is the one honest way to say how many were there without typing it.
    expect(DESIGNED.ids.length).toBeGreaterThan(1)
    expect(offeredShadings()).toHaveLength(DESIGNED.ids.length)
    expect(offeredShadings(REGISTERED)).toHaveLength(DESIGNED.ids.length + 1)
  })

  it('moves exactly the answers that name the dummy, and moves no label', () => {
    // §11 row 6 budgets a shading at one registration. This converts that
    // budget from a claim into a count of moved answers: the two readers a
    // name is asked of, plus what the view offers. The label set is asserted
    // equal ahead of the diff, so a question that stopped being answerable
    // cannot read as an answer that did not change.
    const moved = movedBetween(
      censusOfShadings({ table: SHADINGS, absences: ABSENT_SHADINGS }),
      censusOfShadings({ table: REGISTERED, absences: ABSENT_SHADINGS }),
    )
    expect(moved).toEqual([
      'offeredShadings',
      `resolveShading(${DUMMY.shading})`,
      `shadingInfo(${DUMMY.shading})`,
    ].sort())
  })

  it('sees the other table move, so the rows that held still were measured', () => {
    // C-10's P12, which is the half this idiom loses if it is skipped: the
    // census claims the absence table did not move under a registration, and
    // a row that cannot move whatever you do is an unchecked declaration
    // rather than a measurement. Moving it from the other side is the proof
    // that its stillness above meant something.
    const argued: AbsentShading = {
      name: DUMMY.shading,
      disposition: 'refused',
      reason: DUMMY.reason,
    }
    const moved = movedBetween(
      censusOfShadings({ table: SHADINGS, absences: ABSENT_SHADINGS }),
      censusOfShadings({ table: SHADINGS, absences: { ...ABSENT_SHADINGS, [argued.name]: argued } }),
    )
    expect(moved).toEqual([`absentShading(${DUMMY.shading})`])
  })

  it('asks every reader this module exports, read from the source rather than from itself', () => {
    // The census cannot notice a question it stopped asking, because the
    // label set is computed by the same function on both sides of the diff.
    // `shadings.ts`' own export list is the independent side: delete a row
    // above and this is what says so.
    const exported = [...readFileSync(MODULE, 'utf8').matchAll(/^export function (\w+)/gm)]
      .map(match => match[1]!)
    expect(exported.length, 'a module with no readers is not what this is parsing')
      .toBeGreaterThan(1)

    const labels = censusOfShadings({ table: SHADINGS, absences: ABSENT_SHADINGS }).map(row => row[0])
    for (const reader of exported) {
      expect(labels.some(label => label === reader || label.startsWith(`${reader}(`)), reader).toBe(true)
    }
  })
})

describe('what the view offers is what the lookup resolves', () => {
  /**
   * E8 / R-l in the form the enumerating reader meets it, which is not the
   * form the lookups meet.
   *
   * `Object.prototype`'s members are non-enumerable, so they never reach a
   * picker by themselves; what does reach one is a table that inherits from
   * another table. `{ __proto__: SHADINGS, … }` is a plausible spelling of
   * "the registry plus one more" and it is the wrong one — `shadingInfo` is
   * `Object.hasOwn` and refuses an inherited name, so any reader that listed
   * those names would put rows in the menu that select nothing.
   *
   * Built with `Object.create` rather than the `__proto__:` literal because
   * the two spellings are not interchangeable: C-8 measured that the literal
   * sets the prototype while the computed key declares an own property, and
   * both halves are wanted here.
   */
  const chained: ShadingTable = Object.assign(
    Object.create(SHADINGS) as Record<string, ShadingInfo>,
    { [DUMMY.shading]: DUMMY },
  )

  /** A table that genuinely declares prototype member names as its own keys. */
  const oddlyKeyed: ShadingTable = {
    ['__proto__']: { ...DUMMY, shading: '__proto__', label: 'Oddly named' },
    ['constructor']: { ...DUMMY, shading: 'constructor', label: 'Also oddly named' },
  }

  it('offers only what a table owns, not what it inherits', () => {
    expect(offeredShadings(chained).map(info => info.shading)).toEqual([DUMMY.shading])
    for (const id of SHADING_IDS) {
      expect(shadingInfo(id, chained), id).toBeUndefined()
    }
  })

  it('offers an entry genuinely keyed by a prototype member name', () => {
    // The other direction, and the one that proves the reader is `hasOwn`
    // rather than a blocklist of names: a table is free to key an entry by a
    // name the prototype also has, and that entry is a shading like any other.
    expect(offeredShadings(oddlyKeyed).map(info => info.shading).sort())
      .toEqual(['__proto__', 'constructor'])
  })

  it('offers exactly the entries the lookup resolves, over every shape of table', () => {
    // The property that makes the two readers one decision rather than two:
    // a row the picker offers and the lookup refuses is a menu entry that
    // selects nothing, and a row the lookup resolves and the picker omits is
    // the registration failing to appear.
    const shapes: readonly (readonly [string, ShadingTable])[] = [
      ['shipped', SHADINGS],
      ['registered', REGISTERED],
      ['inheriting', chained],
      ['oddly keyed', oddlyKeyed],
      ['empty', {}],
    ]
    for (const [name, table] of shapes) {
      const offered = offeredShadings(table)
      for (const info of offered) {
        expect(shadingInfo(info.shading, table), `${name}/${info.shading}`).toEqual(info)
      }
      expect(offered.map(info => info.shading).sort(), name).toEqual(Object.keys(table).sort())
    }
  })

  it('keeps the order the table declares, which is an argument somebody made', () => {
    // `SHADING_IDS` is ordered by how much each shading interprets, and
    // `shadings.ts` records why that ordering was chosen over the design
    // table's. A reader that sorted its answer would discard it, and a
    // registration appends rather than reorders.
    expect(offeredShadings().map(info => info.shading)).toEqual([...SHADING_IDS])
    expect(offeredShadings(REGISTERED).map(info => info.shading))
      .toEqual([...SHADING_IDS, DUMMY.shading])
  })
})
