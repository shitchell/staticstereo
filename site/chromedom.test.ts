import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CLASS_CONTROL,
  CLASS_PLATE,
  CLASS_TRANSPORT,
  CLASS_WRAPPER,
  PLAYER_STYLESHEET,
  PLAY_LABEL,
  ROLE_RENDERING,
  playLabelFor,
  positionFor,
  primaryClassOf,
  renderingFor,
} from './chromedom.js'
import * as chrome from './playerchrome.js'
import { CONTROL_PREFIX, FRAMING_NAMES, chromeSpec, isControlRole, nodesOf } from './playerchrome.js'
import type { Flow } from './playerchrome.js'

/**
 * The renderer and its stylesheet, checked the only way this repo can check
 * them: as text and as pure functions.
 *
 * There is no jsdom and no happy-dom here, and design §12 excludes component
 * DOM from testing outright — so `applyChrome`'s `createElement` calls are not
 * exercised. That is a deliberate hole and it is not the interesting one. The
 * interesting one is **drift between the two artifacts**: the chrome tree says
 * `pointer-events: none` on the transport and `auto` on each control, and the
 * stylesheet says it again in CSS. Two statements of one rule is two chances
 * to change only one of them, and the failure is invisible — a control strip
 * that eats every click aimed at the plate looks exactly like a plate that
 * stopped responding.
 *
 * W6 (`playerchrome.ts`) also recorded a hole it could not close from inside a
 * module with no CSS vocabulary:
 *
 * > "`flowViolations` says nothing about `display`, `grid`/`flex` ordering, or
 * > `order:`. A CSS `order` property or a column-reverse container could
 * > reintroduce the displacement with a perfectly conformant tree."
 *
 * That is closed here, directly, because §8.3's measurement — 13 device px of
 * edge-row disagreement becoming 445 at dpr 1.5 — is about the canvas's
 * **realised** position, not its position in the markup. A conformant tree
 * rendered through `order: 1` is displaced exactly as much as a bad tree.
 *
 * Every grep below carries a vacuity floor and a **positive control**: the
 * same predicate is run against a fixture containing the forbidden text and
 * must reject it. Without that, a regex that silently stopped matching would
 * prove every absence at once — the mistake `dist.test.ts` records about
 * grepping for a name that also appears in prose.
 */

const SOURCE = readFileSync(new URL('./chromedom.ts', import.meta.url), 'utf8')

/**
 * The module's source with every comment removed.
 *
 * Load-bearing, not tidiness: the docblocks below argue about `framing`,
 * `absolute` and `order:` **by name**, and a grep for a forbidden identifier
 * that matches the prose explaining why it is forbidden proves nothing. The
 * floor keeps the stripping itself honest.
 */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** The stylesheet, read through the module so the path cannot drift. */
const CSS_PATH = new URL(`./${PLAYER_STYLESHEET}`, import.meta.url)
const CSS = readFileSync(CSS_PATH, 'utf8')

/** The stylesheet with comments stripped — same reason, same trap. */
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '')

/* ---------------------------------- every sheet the player page actually loads */

/**
 * **One stylesheet is not the set of stylesheets.**
 *
 * Everything below used to read `PLAYER_STYLESHEET` and nothing else, which
 * was true when it was written and stopped being true when `playerpage.css`
 * was added. The consequence was precise rather than theoretical: that second
 * sheet is the one that sets `body { display: flex; flex-direction: column }`,
 * so the single file a `column-reverse` edit would plausibly be made in was
 * exactly the file the reordering greps did not read — and `order:`, a
 * reversed axis and a stray `pointer-events` would all have stayed green in
 * it.
 *
 * Discovered from the entry, not hard-coded, and that distinction is the
 * whole fix. Naming `playerpage.css` here would repair today's instance and
 * leave the mechanism exactly as fragile for the third sheet, which is the
 * same mistake one iteration later.
 */
function linkedStylesheets(html: string): string[] {
  return [...html.matchAll(/<link\b([^>]*)>/g)]
    .map(m => m[1]!)
    // Attribute order is not fixed by anything, so `rel` and `href` are
    // matched independently rather than in one positional pattern.
    .filter(attrs => /\brel\s*=\s*["']stylesheet["']/i.test(attrs))
    .map(attrs => /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1])
    .filter((href): href is string => href !== undefined)
}

const ENTRY_HTML = readFileSync(new URL('./player.html', import.meta.url), 'utf8')

/**
 * A linked `href` that is a plain sibling of the entry, which is the only
 * shape this file can read off disk.
 *
 * The discovery above used to strip a leading `./` and hand whatever was left
 * straight to `readFileSync`, at module scope. That is fine for the two sheets
 * the entry links today and illegible for anything else: a CDN href, a
 * protocol-relative `//`, or a sheet moved into `site/css/` would each become
 * an **ENOENT thrown while collecting this file**, taking all of
 * `chromedom.test.ts` down with a stack trace about a missing path rather than
 * one named failure saying which href it could not read. `site/dist.test.ts`
 * already keeps an `isExternal` helper for exactly this; this file had none.
 */
const SIBLING_SHEET = /^\.\/([\w.-]+\.css)$/

const LINKED_HREFS = linkedStylesheets(ENTRY_HTML)
/** The ones read below, and the ones that could not be — reported, never thrown. */
const SHEET_NAMES = LINKED_HREFS.map(href => SIBLING_SHEET.exec(href)?.[1])
const UNREADABLE_HREFS = LINKED_HREFS.filter((_, i) => SHEET_NAMES[i] === undefined)

/** Each linked sheet: its filename, its text, and its text with comments stripped. */
const PLAYER_SHEETS = SHEET_NAMES.filter((n): n is string => n !== undefined).map(name => {
  const text = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
  return { name, text, code: text.replace(/\/\*[\s\S]*?\*\//g, '') }
})

describe('the stylesheets under test are the ones the page loads', () => {
  it('discovered them from the entry, rather than matching nothing and passing', () => {
    // First, because it is the diagnosis: every sheet the entry links was in
    // fact read. An href this file cannot resolve is a named failure here
    // rather than a collection-time ENOENT, and it is a failure rather than a
    // skip — a sheet that is linked and not swept is a sheet with no guard on
    // it, which is precisely the hole `playerpage.css` sat in before the
    // sweeps were widened. Ahead of the floor below so that the dropped sheet
    // is reported as a dropped sheet, not as a count that came out short.
    expect(
      UNREADABLE_HREFS,
      'the entry links a stylesheet this file cannot read off disk, so it is linked but ' +
      'not swept — move it back beside the entry, or teach this helper to reach it',
    ).toEqual([])
    expect(PLAYER_SHEETS).toHaveLength(LINKED_HREFS.length)
    // The vacuity floor, and it is the load-bearing assertion of this block:
    // every sweep that follows is a loop over `PLAYER_SHEETS`, so a parser
    // that found nothing would prove every absence at once.
    expect(PLAYER_SHEETS.length).toBeGreaterThanOrEqual(2)
    expect(PLAYER_SHEETS.map(s => s.name)).toContain(PLAYER_STYLESHEET)
    for (const sheet of PLAYER_SHEETS) {
      expect(sheet.code.length, sheet.name).toBeGreaterThan(50)
    }
    // Positive control: the parser really does read `rel`, and really does
    // find a sheet it has never been told about.
    expect(
      linkedStylesheets(
        '<link rel="preload" href="./a.css"><link href="./invented-tomorrow.css" rel="stylesheet">',
      ),
    ).toEqual(['./invented-tomorrow.css'])
    // ...and the sibling test really does separate the readable from the rest,
    // instead of letting the three shapes above reach `readFileSync`.
    expect(SIBLING_SHEET.exec('./player.css')?.[1]).toBe('player.css')
    for (const href of ['https://cdn.example/x.css', '//cdn.example/x.css', './css/x.css']) {
      expect(SIBLING_SHEET.test(href), href).toBe(false)
    }
  })
})

interface Rule { readonly selector: string; readonly body: string }

function rulesOf(css: string): Rule[] {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, selector, body]) => ({ selector: selector!.trim(), body: body! }))
}

/** Every `selector → value` pair that declares `prop`, across the sheet. */
function declarationsOf(css: string, prop: string): { selector: string; value: string }[] {
  const out: { selector: string; value: string }[] = []
  for (const rule of rulesOf(css)) {
    const match = new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;]+)`, 'i').exec(rule.body)
    if (match) out.push({ selector: rule.selector, value: match[1]!.trim() })
  }
  return out
}

/* -------------------------------------------------- the applier's coverage */

/**
 * The prefix that marks an export of `playerchrome.ts` as a structural role.
 *
 * A naming convention is doing load-bearing work here, which is worth saying
 * out loud rather than leaving implicit: the module has no runtime marker for
 * "this is a role", so the name is the marker, and a role exported under some
 * other name is invisible to everything below.
 */
const ROLE_EXPORT_PREFIX = 'ROLE_'

/** Is this export of `playerchrome.ts` one of the roles the applier must handle? */
function isRoleExport(name: string): boolean {
  return name.startsWith(ROLE_EXPORT_PREFIX)
}

/**
 * The role constants, read out of `playerchrome.ts`'s **runtime exports**.
 *
 * Still deliberately not a hand-kept list — the point is unchanged: a role
 * added to `playerchrome.ts` tomorrow, by somebody who never opens this file,
 * is covered or else fails, so the enumeration has to find constants that do
 * not yet exist.
 *
 * **But not from the source text, which is how it used to work and which had
 * a syntactic hole.** The regex was `/^export const (ROLE_[A-Z_]+)\s*=/gm`.
 * Measured: `export const ROLE_CAPTION = 'caption'` is caught (2 failed, 18
 * passed, correctly), and `export const ROLE_CAPTION: string = 'caption'` —
 * the same declaration with a type annotation — leaves this file at **20
 * passed** with an unhandled structural role in existence. A `export { … as
 * ROLE_X }` re-export and a `satisfies` clause defeat it the same way, and
 * widening the regex to allow an annotation closes only the first of the
 * three.
 *
 * The module namespace has no such holes: however the constant is spelled,
 * declared, annotated or re-exported, it is a key of `chrome` at runtime.
 *
 * Filtered on the **name** and only then checked for string-ness, not
 * filtered on both: a `ROLE_`-named export that is not a string is a mistake
 * worth a red test, and a predicate that required `typeof value === 'string'`
 * would silently drop it instead.
 *
 * The string check is **a test and not a step of this map**, which it used to
 * be. An `expect` at module scope throws while vitest is *collecting*, so a
 * `ROLE_`-named non-string aborted this entire file — twenty-odd assertions
 * replaced by one stack trace — where the docblock's argument only ever asked
 * for one red test naming the export. The red was real and far less legible
 * than the prose implied.
 */
const ROLES = Object.entries(chrome as unknown as Record<string, unknown>)
  .filter(([name]) => isRoleExport(name))
  .map(([name, value]) => [name, value as string] as const)

const ROLE_NAMES = ROLES.map(([name]) => name)

/**
 * Every `ROLE_`-named declaration in `playerchrome.ts`'s **source text**.
 *
 * Deliberately the old, holed regex — it misses a type annotation, an
 * `export { … as ROLE_X }` re-export and a `satisfies` clause, which is why
 * the enumeration above reads the runtime namespace instead. It is kept as a
 * **cross-check in one direction only**: whatever the source plainly declares
 * must appear in the namespace enumeration. The reverse does not hold and must
 * not be asserted, because the namespace is legitimately a superset — that
 * superset is the entire point of the change.
 *
 * This replaces `expect(ROLE_NAMES).toEqual(Object.keys(chrome).filter(isRoleExport))`,
 * which was the same expression over the same object with the same predicate
 * on both sides and so could not fail for any input. Its stated purpose — "the
 * live namespace really is the source, not a list typed here" — is worth
 * having; it just was not what the line asserted.
 */
const ROLE_NAMES_IN_SOURCE = [
  ...readFileSync(new URL('./playerchrome.ts', import.meta.url), 'utf8')
    .matchAll(/^export const (ROLE_[A-Z_]+)\s*[:=]/gm),
].map(m => m[1]!)

describe('every role the chrome module can produce has a renderer arm', () => {
  it('found the role constants, rather than matching nothing and passing', () => {
    // A floor at today's real count (wrapper, canvas, transport, play, seek,
    // fullscreen), and a floor is all it is. This comment used to say the
    // count was tracked "with no slack upward", which `toBeGreaterThanOrEqual`
    // does not say and never said: a role *added* does not trip this.
    //
    // Nor should it. What makes an added role safe is the two checks below,
    // which require it to have an explicit renderer arm — a stronger
    // statement than any count, and the reason the exact-count version was
    // not worth having. The direction this does catch is the other one: a
    // role deleted, or an enumeration that quietly stopped enumerating.
    expect(ROLE_NAMES.length).toBeGreaterThanOrEqual(6)
    expect(ROLE_NAMES).toContain('ROLE_CANVAS')
    expect(ROLE_NAMES).toContain('ROLE_TRANSPORT')
  })

  it('exports every one of them as a string constant', () => {
    // Its own test rather than a step of the `ROLES` map, where it was an
    // `expect` at module scope: that throws during collection, so one
    // misdeclared export took this whole file down with a stack trace instead
    // of failing here, by name.
    for (const [name, value] of ROLES) {
      expect(typeof value, `${name} is not a string constant`).toBe('string')
    }
    expect(ROLES.length).toBeGreaterThanOrEqual(6)
  })

  it('enumerates by name from the namespace, so no declaration syntax hides a role', () => {
    // The positive control for the enumeration itself. A synthetic namespace
    // cannot express the case that motivated the change — a type annotation
    // is gone by runtime, which is exactly why reading the namespace fixes
    // it — so what is asserted here is the predicate's discrimination: it
    // takes a `ROLE_`-named export it has never heard of, and it does not
    // take the module's other string constant.
    const pretend = { ROLE_CAPTION: 'caption', CONTROL_PREFIX: 'control:', nodesOf: () => [] }
    expect(Object.keys(pretend).filter(isRoleExport)).toEqual(['ROLE_CAPTION'])
    // ...and the enumeration really does come from the module rather than from
    // a list typed in this file. Cross-checked against the source text, in one
    // direction: every `ROLE_` the source plainly declares has to be in it.
    //
    // One direction, because the namespace is legitimately a *superset* — the
    // source regex misses an annotated declaration, a renamed re-export and a
    // `satisfies` clause, which is the whole reason the enumeration stopped
    // being a regex. Asserting equality would re-impose the holes it exists to
    // avoid.
    //
    // This line replaces `toEqual(Object.keys(chrome).filter(isRoleExport))`,
    // which was `ROLE_NAMES`' own definition spelled out again and so could
    // not fail for any input.
    expect(ROLE_NAMES_IN_SOURCE.length, 'the source scan found no roles').toBeGreaterThanOrEqual(6)
    for (const declared of ROLE_NAMES_IN_SOURCE) {
      expect(
        ROLE_NAMES,
        `${declared} is declared in playerchrome.ts and is not in the enumeration`,
      ).toContain(declared)
    }

    // And the other direction, restored and widened. `ed46a23` deleted
    // `expect(ROLE_NAMES).not.toContain('CONTROL_PREFIX')` from this block
    // alongside the tautology on the line above it, without replacement and
    // without mention — its message says "replace a tautological control",
    // singular, and that line was not the tautology.
    //
    // It is not subsumed by the `pretend` object above, which is what made the
    // deletion look harmless. That control proves `isRoleExport` rejects the
    // *name* `CONTROL_PREFIX`; this proves the thing actually filtered — the
    // live namespace — contains no such entry. The two come apart the moment
    // `ROLES`' filter stops being `isRoleExport`, and the docblock above names
    // the exact change somebody would plausibly make: filtering on
    // `typeof value === 'string'` instead of on the name. Measured: make that
    // substitution and the synthetic control still passes while this reds.
    //
    // Widened from the one hand-named exclusion to the claim it was an
    // instance of, so a second non-role export does not need remembering.
    const nonRoleExports = Object.keys(chrome).filter(name => !isRoleExport(name))
    expect(nonRoleExports.length, 'the module exports nothing but roles, so this is vacuous')
      .toBeGreaterThan(0)
    // `CONTROL_PREFIX` stays named: it is the module's other string constant
    // and so the near-miss the predicate exists to exclude, which is why it
    // was the one written out in the first place.
    expect(nonRoleExports, 'CONTROL_PREFIX is no longer an export of the module').toContain(
      'CONTROL_PREFIX',
    )
    for (const name of nonRoleExports) {
      expect(ROLE_NAMES, `${name} is not a role and is in the role enumeration`)
        .not.toContain(name)
    }
  })

  it('renders each of them, with at least one class and no duplicates', () => {
    const seen = new Set<string>()
    for (const [name, role] of ROLES) {
      const rendering = renderingFor(role)
      expect(rendering.classes.length, name).toBeGreaterThanOrEqual(1)
      for (const cls of rendering.classes) expect(cls, name).toMatch(/^[a-z][a-z0-9-]*$/)
      // Two roles rendering to the same primary class would make the role map
      // ambiguous and the CSS unable to tell them apart.
      const primary = primaryClassOf(role)
      if (!isControlRole(role)) {
        expect(seen.has(primary), `${name} reuses .${primary}`).toBe(false)
        seen.add(primary)
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(3)
  })

  it('gives every non-control role an EXPLICIT arm, so a new one cannot default', () => {
    // The whole mechanism: a role added to `playerchrome.ts` without an entry
    // here is not quietly rendered as a bare `<div>`, it is a red test.
    for (const [name, role] of ROLES) {
      if (isControlRole(role)) continue
      expect(Object.keys(ROLE_RENDERING), name).toContain(role)
    }
    expect(() => renderingFor('invented-tomorrow')).toThrow(/unknown chrome role/)
  })

  it('covers a control that does not exist yet, by prefix', () => {
    // Deliberate, and the opposite of the rule above: `playerchrome.ts`'s
    // `CONTROL_PREFIX` docblock records that a hand-kept list would let a
    // control added next year inherit the container's `pointer-events: none`
    // and be unclickable with every test green. So the prefix is the arm.
    const invented = `${CONTROL_PREFIX}invented-tomorrow`
    expect(renderingFor(invented).classes).toContain(CLASS_CONTROL)
    expect(primaryClassOf(invented)).toBe(CLASS_CONTROL)
    // ...but a role whose name would not survive as a CSS class is refused
    // rather than emitted as a broken selector.
    expect(() => renderingFor(`${CONTROL_PREFIX}Not A Class`)).toThrow(/class/)
  })

  it('gives the two tag-ambiguous controls the attributes their tag needs', () => {
    // The tree says `tag: 'input'` and stops there, because it is not allowed
    // to know what a tag resolves to. An `<input>` with no `type` is a TEXT
    // BOX, which is a silent failure where a scrubber belongs.
    expect(ROLE_RENDERING[chrome.ROLE_SEEK]?.attrs?.['type']).toBe('range')
    expect(ROLE_RENDERING[chrome.ROLE_PLAY]?.attrs?.['type']).toBe('button')
    for (const role of [chrome.ROLE_PLAY, chrome.ROLE_SEEK, chrome.ROLE_FULLSCREEN]) {
      expect(ROLE_RENDERING[role]?.attrs?.['aria-label'], role).toBeTruthy()
    }
  })
})

/* ------------------------------------- the one label that changes with state */

describe('the visible play/pause label is this module’s, not the shell’s', () => {
  /**
   * `site/player.ts`'s comment-stripped source. Stripped for the reason every
   * grep in this repo strips: the shell's docblocks are free to discuss the
   * labels in prose, and a pattern that matched the explanation would prove
   * nothing.
   */
  const SHELL = readFileSync(new URL('./player.ts', import.meta.url), 'utf8')
  const SHELL_CODE = SHELL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('answers for both transport states, distinctly', () => {
    expect(playLabelFor(true)).toBe(PLAY_LABEL.playing)
    expect(playLabelFor(false)).toBe(PLAY_LABEL.paused)
    // Distinct, which is the whole content of a play/pause label: a control
    // that reads the same in both states tells the viewer nothing about which
    // one they are in, and R16 names this control specifically.
    expect(playLabelFor(true)).not.toBe(playLabelFor(false))
    for (const [state, label] of Object.entries(PLAY_LABEL)) {
      expect(label.length, state).toBeGreaterThan(0)
    }
    expect(Object.keys(PLAY_LABEL)).toHaveLength(2)
  })

  it('and the shell spells neither label itself', () => {
    // Every other label in the player comes from `ROLE_RENDERING` — the
    // `aria-label`s, the `type` attributes. This one was chosen in
    // `site/player.ts` instead, inline: `textContent = playing ? 'Pause' :
    // 'Play'`. That put the player's only state-dependent user-visible string
    // in the one file no test in this repo can reach, since the environment is
    // plain node and design §12 excludes component DOM from testing outright.
    //
    // It also splits the two names for one control across two files. The
    // accessible name is "Play or pause" exactly because it covers both states
    // and so never changes; the visible label is the half that does, and a
    // second table nobody can see is how the two drift apart.
    //
    // The needles are read out of `PLAY_LABEL` rather than typed, so renaming
    // a label does not quietly disarm this.
    expect(SHELL_CODE.length, 'the comment strip ate site/player.ts').toBeGreaterThan(5_000)
    expect(SHELL_CODE).toContain('ROLE_PLAY')
    for (const label of Object.values(PLAY_LABEL)) {
      for (const quote of ["'", '"', '`']) {
        expect(SHELL_CODE, `site/player.ts spells ${quote}${label}${quote} itself`)
          .not.toContain(`${quote}${label}${quote}`)
      }
    }
    // Vacuity floor in the other direction: the shell must still be setting
    // the label, or "it does not spell them" is satisfied by not having one.
    expect(SHELL_CODE).toContain('playLabelFor')
    // Positive control: the needles really do find the literal they ban.
    expect(`e.textContent = p ? '${PLAY_LABEL.playing}' : '${PLAY_LABEL.paused}'`)
      .toContain(`'${PLAY_LABEL.playing}'`)
  })
})

/* ------------------------------------------------- the applier holds no policy */

/** Errors unless its argument is `never` — the repo's exhaustiveness idiom. */
type AssertNever<T extends never> = T
const EVERY_FLOW = ['flow', 'absolute', 'fixed'] as const satisfies readonly Flow[]
type _NoFlowMissing = AssertNever<Exclude<Flow, typeof EVERY_FLOW[number]>>

describe('the applier reads the tree and decides nothing', () => {
  it('stripped the comments without eating the file', () => {
    expect(CODE.length).toBeGreaterThan(400)
    expect(CODE).toContain('export function applyChrome')
  })

  it('maps every flow value, and only to a CSS position', () => {
    expect(positionFor('absolute')).toBe('absolute')
    expect(positionFor('fixed')).toBe('fixed')
    // Exhaustive by the type-level guard above AND by the loop, which is what
    // catches a value added to `Flow` and mapped to `undefined`.
    for (const flow of EVERY_FLOW) expect(typeof positionFor(flow), flow).toBe('string')
  })

  /**
   * **`flow` is a non-claim, and it has to be.**
   *
   * `Flow` has three members because only the in-flow/out-of-flow distinction
   * is load-bearing: `playerchrome.ts` records that `relative` displaces
   * exactly as `static` does, which is why neither is offered. So `'flow'`
   * says "I am in my parent's flow" and says **nothing** about `position` —
   * and writing `static` for it would be saying something, loudly, inline,
   * where nothing can override it.
   *
   * The casualty would be the wrapper. It is a `'flow'` node, and the
   * stylesheet gives it `position: relative` because the overlaid transport is
   * `absolute` and not `fixed` *precisely* so that its containing block is the
   * wrapper — the element `requestFullscreen` is handed — rather than the
   * viewport, which stops being the same rectangle the moment the player is an
   * `<iframe>` in a scrolled page. An inline `static` on the wrapper silently
   * reparents every overlaid transport to the initial containing block.
   */
  it('does not overwrite the wrapper’s positioning context', () => {
    expect(positionFor('flow')).toBe('')
    for (const framing of FRAMING_NAMES) {
      const wrapper = chromeSpec(framing)
      expect(positionFor(wrapper.flow), framing).toBe('')
    }
    // ...and the stylesheet is the thing that does claim it, so the pair is
    // asserted here rather than left to two files that never mention it.
    expect(
      declarationsOf(CSS_CODE, 'position').map(d => `${d.selector}:${d.value}`),
    ).toContain(`.${CLASS_WRAPPER}:relative`)
  })

  it('never mentions a framing, which is where that conditional belongs', () => {
    // The line between the two modules, asserted. A `if (framing === …)` here
    // would be a second place deciding what `playerchrome.ts` already decided,
    // and the two would disagree the first time one of them was edited.
    expect(CODE).not.toMatch(/\bframing\b/)
    expect(CODE).not.toMatch(/chromeSpec/)
    for (const framing of FRAMING_NAMES) {
      expect(CODE, framing).not.toMatch(new RegExp(`['"\`]${framing}['"\`]`))
    }
  })

  it('takes position and pointer-events from the node, not from a literal', () => {
    expect(CODE).toMatch(/node\.flow/)
    expect(CODE).toMatch(/node\.pointerEvents/)
    expect(CODE).toMatch(/node\.tag/)
    // Every CSS position literal lives inside `positionFor`'s mapping and
    // nowhere else, so a hard-coded one in the walk — the shape a "just this
    // once" special case takes — is a red test.
    const mapping = /export function positionFor\(flow: Flow\): string \{([\s\S]*?)\n\}/.exec(CODE)?.[1]
    expect(mapping, 'the positionFor body regex matched nothing').toBeDefined()
    expect(mapping).toMatch(/'absolute'/)
    expect(CODE.replace(mapping!, '')).not.toMatch(/'(static|absolute|fixed)'/)
  })
})

/* ------------------------------------------- the stylesheet agrees with the tree */

/** Every node of every framing that has an opinion about `pointer-events`. */
const OPINIONATED = FRAMING_NAMES.flatMap(framing =>
  nodesOf(chromeSpec(framing))
    .filter(n => n.pointerEvents !== undefined)
    .map(n => [framing, n] as const),
)

describe('the stylesheet says the same thing the tree says', () => {
  it('found rules and nodes, rather than matching nothing and passing', () => {
    expect(rulesOf(CSS_CODE).length).toBeGreaterThanOrEqual(4)
    expect(OPINIONATED.length).toBeGreaterThanOrEqual(8)
  })

  it('declares pointer-events for the transport and the controls, and agrees', () => {
    // Across every linked sheet, not only the component's: a second sheet
    // with an opinion about `.stst-transport` is exactly the "two artifacts
    // claim one property and specificity decides" problem, and reading one
    // file is what makes it invisible.
    const declared = new Map(
      PLAYER_SHEETS.flatMap(s => declarationsOf(s.code, 'pointer-events'))
        .map(d => [d.selector, d.value]),
    )
    expect(declared.get(`.${CLASS_TRANSPORT}`)).toBe('none')
    expect(declared.get(`.${CLASS_CONTROL}`)).toBe('auto')
    // ...and the tree's own value for every node, in every framing, matches
    // the rule that will govern it. This is the drift check: edit either
    // artifact alone and this goes red.
    for (const [framing, node] of OPINIONATED) {
      expect(declared.get(`.${primaryClassOf(node.role)}`), `${framing} ${node.role}`)
        .toBe(node.pointerEvents)
    }
  })

  it('declares pointer-events nowhere else, so nothing can shadow the canvas', () => {
    // A strip spanning the plate that ate every click aimed at it is design
    // §8.2's corrected mistake; a third rule setting `pointer-events: none` on
    // an ancestor would restore it with the tree still perfectly conformant.
    const selectors = PLAYER_SHEETS
      .flatMap(s => declarationsOf(s.code, 'pointer-events').map(d => `${s.name} ${d.selector}`))
      .sort()
    expect(selectors).toEqual(
      [`${PLAYER_STYLESHEET} .${CLASS_CONTROL}`, `${PLAYER_STYLESHEET} .${CLASS_TRANSPORT}`].sort(),
    )
    // Positive control: the predicate really does see an extra declaration.
    expect(
      declarationsOf(`${CSS_CODE}\n.${CLASS_WRAPPER} { pointer-events: none }`, 'pointer-events')
        .map(d => d.selector),
    ).toContain(`.${CLASS_WRAPPER}`)
  })

  it('never positions the transport, because the tree does that at apply time', () => {
    // The inversion is deliberate and it is one-way: `flow` is a field of
    // `ChromeNode` and `applyChrome` writes it into `style.position`, so a
    // stylesheet rule claiming the same property would win or lose depending
    // on specificity and nobody could say which from reading either file.
    for (const rule of rulesOf(CSS_CODE)) {
      if (!rule.selector.includes(CLASS_TRANSPORT)) continue
      expect(rule.body, rule.selector).not.toMatch(/position:\s*(absolute|fixed)/)
    }
    // Positive control.
    const planted = `.${CLASS_TRANSPORT} { position: absolute }`
    expect(
      rulesOf(planted).some(r => /position:\s*(absolute|fixed)/.test(r.body)),
    ).toBe(true)
  })
})

/* ------------------------------------------------- the W6 hole, closed in CSS */

/** Does this stylesheet contain an `order` declaration? `border:` must not match. */
function hasOrderProperty(css: string): boolean {
  return rulesOf(css).some(r => /(?:^|[;{\s])order\s*:/i.test(r.body))
}

/** Does it reverse a flex or grid axis? */
function hasReversedAxis(css: string): boolean {
  return rulesOf(css).some(r => /\b[a-z-]*(?:direction|flow)\s*:[^;]*\breverse\b/i.test(r.body))
}

describe('no CSS reordering, because §8.3 is about the realised position', () => {
  /**
   * **The hole W6 could not close.** `flowViolations` proves no in-flow box
   * precedes the canvas **in the tree**. CSS can undo that without touching
   * the tree: `order: -1` on the transport, or `flex-direction: column-reverse`
   * on the wrapper, puts the strip above the plate on screen while every
   * structural test stays green. The measurement that forbids it —
   * 13 device px of edge-row disagreement becoming 445 at dpr 1.5, and "the
   * sensitivity is to the exact sub-pixel and is not something to tune" — is
   * about where the canvas ends up, not about where it is written.
   */
  it('contains no order property anywhere', () => {
    // "Anywhere" means every sheet the page loads. `playerpage.css` is the
    // one that makes the body a flex column, so it is the one an `order:` on
    // `#player` or `#notices` would most naturally be written in — and until
    // this loop it was the one sheet not read.
    for (const sheet of PLAYER_SHEETS) {
      expect(hasOrderProperty(sheet.code), sheet.name).toBe(false)
    }
    // Positive controls, including the near-miss that must NOT trip it.
    expect(hasOrderProperty(`.a { order: -1 }`)).toBe(true)
    expect(hasOrderProperty(`.a { color: red; order:2; }`)).toBe(true)
    expect(hasOrderProperty(`.a { border: 1px solid }`)).toBe(false)
  })

  it('reverses no flex or grid axis anywhere', () => {
    for (const sheet of PLAYER_SHEETS) {
      expect(hasReversedAxis(sheet.code), sheet.name).toBe(false)
    }
    expect(hasReversedAxis(`.a { flex-direction: column-reverse }`)).toBe(true)
    expect(hasReversedAxis(`.a { flex-flow: row-reverse wrap }`)).toBe(true)
    expect(hasReversedAxis(`.a { grid-auto-flow: column }`)).toBe(false)
  })

  it('and the comment saying why is in the stylesheet, not only in this test', () => {
    // The grep above is stripped of comments, so the sheet is free to use the
    // forbidden words in prose — and it must, or the next person to want a
    // toolbar above the plate has only a failing test to go on.
    expect(CSS).toMatch(/order/)
    expect(CSS).toMatch(/445/)
  })
})

/* ------------------------------- the scaling defect must not come back in CSS */

describe('the stylesheet never scales the plate', () => {
  it('leaves image-rendering to the plan', () => {
    // `playerPlan` chooses it per container from `?smooth=` and the display
    // scale; a stylesheet claiming it too would win on some paths and the page
    // would smooth a dot field with nothing to say so.
    expect(declarationsOf(CSS_CODE, 'image-rendering')).toEqual([])
    expect(declarationsOf(`.${CLASS_PLATE} { image-rendering: pixelated }`, 'image-rendering'))
      .toHaveLength(1)
  })

  it('gives the plate no percentage or viewport size', () => {
    // `canvas { width: 100% }` plus `image-rendering: pixelated` IS the
    // original defect: an arbitrary non-integer nearest-neighbour ratio that
    // drops source columns outright below 1:1. The fit arithmetic writes
    // `style.width` itself; CSS must not have a second opinion.
    const plate = rulesOf(CSS_CODE).filter(r => r.selector.includes(CLASS_PLATE))
    expect(plate.length, 'no plate rule found — the selector drifted').toBeGreaterThanOrEqual(1)
    for (const rule of plate) {
      expect(rule.body, rule.selector).not.toMatch(/(width|height):\s*[\d.]+(%|vw|vh|vmin|vmax)/)
      expect(rule.body, rule.selector).not.toMatch(/object-fit/)
    }
    expect(
      rulesOf(`.${CLASS_PLATE} { width: 100% }`)
        .some(r => /(width|height):\s*[\d.]+%/.test(r.body)),
    ).toBe(true)
  })

  it('is referenced by a name the module owns, not by a path typed twice', () => {
    expect(PLAYER_STYLESHEET).toMatch(/\.css$/)
    expect(CSS.length).toBeGreaterThan(200)
  })
})
