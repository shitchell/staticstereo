import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Criterion 16.4, editor side: **CSS must not reorder what the element tree
 * got right.**
 *
 * Design §5.1: *"The §8.3 sub-pixel constraint applies here too, and revision 1
 * applied it only to the player. The editor's own canvas is what the author
 * fuses while working, so anything added above it in flow moves its
 * device-pixel origin."* §8.3 binds the editor as well as the player, and the
 * measurement it rests on is already taken — 13 device px of edge-row
 * disagreement becoming 445 at dpr 1.5 — with *"the sensitivity is to the exact
 * sub-pixel and is not something to tune."* Nothing here re-measures it; §8.3
 * forecloses that. What is enforced is the structural rule derived from it.
 *
 * ## Why this file exists when `chromedom.test.ts` already sweeps for `order:`
 *
 * It does, and it is armed, and it loops `PLAYER_SHEETS` — the sheets the
 * **player** entry links. `site/playerchrome.ts` says so about itself: *"the
 * same cannot be said of P3, which lifts this player into the editor shell
 * where the shell's own sheet **is** in the same document and is not one of
 * the sheets the greps above read."* Measured before this file was written,
 * two independent nets:
 *
 *  - An armed case-insensitive grep over `site/markup.test.ts` for
 *    `order:|reverse|flex-direction|8\.3|sub-pixel|above the canvas` returned
 *    **one** hit — `/border:\s*0/` at `:452`, a near-miss, not a sweep —
 *    against a control of 17 occurrences of "css" in the same file.
 *  - A repo-wide grep for readers of `styles.css` and, separately, for any
 *    `order:`/reverse CSS predicate in any `*.test.ts`: the only such predicate
 *    in the repository is `chromedom.test.ts`'s, and the only readers of the
 *    editor sheet are `markup.test.ts` (markup rules) and `fonts.test.ts`
 *    (`@font-face` blocks). Neither looks at ordering.
 *
 * So the editor's stylesheet was swept by nothing for reordering. That is what
 * this file is.
 *
 * ## The boundary, stated rather than left to be discovered
 *
 * **This is a text sweep over CSS source, and it does not see the box model.**
 * It is the same instrument as the player's and inherits the same hole, which
 * `playerchrome.ts:407` documents under the heading *"§8.3 IS NOT ENFORCED.
 * Read this before trusting the green suite."*
 *
 * Re-measured here against this sheet (`EXP-16-PADDING-REPLAY`): the canonical
 * §8.3 defect — a `padding-top: 0.5px` plus a `::before { content: ""; display:
 * block }` on the canvas's own wrapper, *"a fractional-offset block box sitting
 * directly above the canvas, which is the precise thing whose measurement took
 * edge-row disagreement from 13 device px to 445"* — planted in
 * `site/styles.css`, **does not redden this file.** Both rows below stay green,
 * because neither `padding` nor a pseudo-element box is an ordering
 * declaration. The result is recorded here rather than in a report because a
 * guard that silently misses the canonical defect while appearing to enforce
 * §8.3 is worse than no guard: it is what makes the next reader stop checking.
 *
 * What is enforced: no declaration in any sheet the editor entry links can
 * paint a box above the canvas that the element tree placed below it. What is
 * not: the box model, which has no sensor in this phase on either side.
 */

/* --------------------------- every sheet the editor page actually loads */

const ENTRY_NAME = 'index.html'
const ENTRY_HTML = readFileSync(new URL(`./${ENTRY_NAME}`, import.meta.url), 'utf8')

/**
 * A linked `href` that is a plain sibling of the entry, which is the only
 * shape this file can read off disk. A CDN href, a protocol-relative `//`, or
 * a sheet moved into `site/css/` is **reported by name** below rather than
 * thrown as a collection-time `ENOENT` that takes the whole file down.
 */
const SIBLING_SHEET = /^\.\/([\w.-]+\.css)$/

/**
 * Discovered from the entry, never hand-written.
 *
 * Naming `styles.css` here would be correct today and silently wrong the day
 * the shell links a second sheet — which is the row this repo keeps
 * re-learning, and the exact hole `playerpage.css` sat in until
 * `chromedom.test.ts` stopped hard-coding one name.
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

const LINKED_HREFS = linkedStylesheets(ENTRY_HTML)
const SHEET_NAMES = LINKED_HREFS.map(href => SIBLING_SHEET.exec(href)?.[1])
const UNREADABLE_HREFS = LINKED_HREFS.filter((_, i) => SHEET_NAMES[i] === undefined)

/** Each linked sheet: its filename, its text, and its text with comments stripped. */
const EDITOR_SHEETS = SHEET_NAMES.filter((n): n is string => n !== undefined).map(name => {
  const text = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
  return { name, text, code: text.replace(/\/\*[\s\S]*?\*\//g, '') }
})

interface Rule { readonly selector: string; readonly body: string }

function rulesOf(css: string): Rule[] {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, selector, body]) => ({ selector: selector!.trim(), body: body! }))
}

/** Does this stylesheet contain an `order` declaration? `border:` must not match. */
function hasOrderProperty(css: string): boolean {
  return rulesOf(css).some(r => /(?:^|[;{\s])order\s*:/i.test(r.body))
}

/**
 * Does it reverse a flex or grid axis?
 *
 * Over-approximating, and measured so rather than assumed: `animation-direction:
 * reverse` trips this, and an animation direction is not a layout axis. It is
 * left over-strict on purpose. The predicate is byte-identical to the player's
 * by the assertion at the foot of this file, so narrowing it here would make
 * the two copies disagree — which is a worse failure than a false positive on
 * a property this sheet does not use today. If the editor ever needs a
 * reversed animation, widen **both** copies in one commit.
 */
function hasReversedAxis(css: string): boolean {
  return rulesOf(css).some(r => /\b[a-z-]*(?:direction|flow)\s*:[^;]*\breverse\b/i.test(r.body))
}

describe('the editor stylesheets under test are the ones the page loads', () => {
  it('discovered them from the entry, rather than matching nothing and passing', () => {
    // Ahead of the floor so a dropped sheet is reported as a dropped sheet and
    // not as a count that came out short.
    expect(
      UNREADABLE_HREFS,
      `${ENTRY_NAME} links a stylesheet this file cannot read off disk, so it is linked but ` +
      'not swept — move it back beside the entry, or teach this helper to reach it',
    ).toEqual([])
    expect(EDITOR_SHEETS).toHaveLength(LINKED_HREFS.length)
    /*
     * The vacuity floor, and the load-bearing assertion of the file: every
     * sweep below is a loop over `EDITOR_SHEETS`, so a parser that found
     * nothing would prove every absence at once.
     *
     * It is also this file's teardown sensor, and that is deliberate. P3b
     * rewrites `site/index.html` into a Svelte shell; `vite.site.config.ts`
     * has no `build.rollupOptions.input`, so that file must keep existing as
     * the entry or `build:site` fails outright. If the shell moves its CSS
     * into a JS-side `import './x.css'` and drops the `<link>`, this file
     * does not quietly start proving nothing — it reds here and says the
     * subject moved. A guard whose subject can vanish must notice.
     */
    expect(
      LINKED_HREFS.length,
      `${ENTRY_NAME} links no stylesheet, so every sweep below is vacuous. If the shell now ` +
      'imports its CSS from JS, this file needs the bundler-side sheet, not a silent pass',
    ).toBeGreaterThanOrEqual(1)
    for (const sheet of EDITOR_SHEETS) {
      expect(sheet.code.length, sheet.name).toBeGreaterThan(50)
    }
    // Positive control: the parser really does read `rel`, and really does
    // find a sheet it has never been told about.
    expect(
      linkedStylesheets(
        '<link rel="preload" href="./a.css"><link href="./invented-tomorrow.css" rel="stylesheet">',
      ),
    ).toEqual(['./invented-tomorrow.css'])
    // ...and the sibling test really does separate the readable from the rest.
    expect(SIBLING_SHEET.exec('./styles.css')?.[1]).toBe('styles.css')
    for (const href of ['https://cdn.example/x.css', '//cdn.example/x.css', './css/x.css']) {
      expect(SIBLING_SHEET.test(href), href).toBe(false)
    }
  })
})

describe('the editor sheet never reorders the canvas out of document order', () => {
  /**
   * The hazard in this sheet specifically. `.view` holds a `figcaption` and
   * then the canvas; `styles.css:207-211` already records why the hint went
   * *below* the canvas rather than into that caption — *"the caption's height
   * sets the canvas's device y origin, that origin is fractional at fractional
   * devicePixelRatio, and moving it makes the canvas's edge-row rasterisation
   * measurably worse."* One `order:` on the caption, or one `column-reverse`
   * on `.view`, moves a box above the canvas with the markup untouched, and
   * every structural assertion in the repo stays green.
   */
  it('contains no order property anywhere', () => {
    for (const sheet of EDITOR_SHEETS) {
      expect(
        hasOrderProperty(sheet.code),
        `${sheet.name} declares \`order\`, which can paint a box above the canvas that the ` +
        'markup placed below it — design §5.1/§8.3 forbid it on the editor side too',
      ).toBe(false)
    }
    // Positive controls, including the near-miss that must NOT trip it.
    expect(hasOrderProperty(`.a { order: -1 }`)).toBe(true)
    expect(hasOrderProperty(`.a { color: red; order:2; }`)).toBe(true)
    expect(hasOrderProperty(`.a { border: 1px solid }`)).toBe(false)
  })

  it('reverses no flex or grid axis anywhere', () => {
    for (const sheet of EDITOR_SHEETS) {
      expect(
        hasReversedAxis(sheet.code),
        `${sheet.name} reverses a flex or grid axis, which puts the last child first on ` +
        'screen with the markup untouched — design §5.1/§8.3 forbid it on the editor side too',
      ).toBe(false)
    }
    expect(hasReversedAxis(`.a { flex-direction: column-reverse }`)).toBe(true)
    expect(hasReversedAxis(`.a { flex-flow: row-reverse wrap }`)).toBe(true)
    expect(hasReversedAxis(`.a { grid-auto-flow: column }`)).toBe(false)
  })
})

/* ------------------------------------------- the copy, and its agreement */

/**
 * `rulesOf`, `hasOrderProperty` and `hasReversedAxis` are **defined twice** —
 * here and in `chromedom.test.ts`, where they sweep the player's sheets.
 *
 * ## Why a copy and not a shared module
 *
 * Both ways of actually sharing were already costed and rejected by
 * measurement in `transport.test.ts:106-116`, for the same pair of reasons,
 * and nothing about this pair of files changes either:
 *
 *  - **A non-test `site/` module.** Anything under `site/` not ending
 *    `.test.ts` enters `dist.test.ts`'s freshness source set, so editing a
 *    test helper would mark both built directories stale and silently skip
 *    every Pages-critical assertion until the next build.
 *  - **Importing the other `.test.ts`.** A test file's `describe`s register
 *    into whichever suite imports it, so `chromedom.test.ts`'s assertions
 *    would run twice and the suite count would stop meaning what it says.
 *
 * So the duplication stays and the *agreement* is asserted, which is the thing
 * that was actually missing. The failure it is for is not hypothetical: the
 * player's predicates have already been widened once each (the `[;{\s]`
 * boundary that lets `border:` through, and `[a-z-]*(?:direction|flow)` that
 * reaches `flex-flow` and `grid-auto-flow`). The widening that gets done in
 * one file is the one this reds on. A behavioural check on probe inputs would
 * not: it passes against a divergent copy until the day the two actually
 * disagree.
 *
 * Whitespace is normalised so a rewrap is not a failure; comments are stripped
 * because the two docblocks differ deliberately.
 */
describe('the reordering predicate is one predicate, even though it is written twice', () => {
  const PREDICATES = ['rulesOf', 'hasOrderProperty', 'hasReversedAxis'] as const

  const predicateSource = (file: string, name: string): string => {
    const code = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    const block = new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}\\n`).exec(code)?.[0] ?? ''
    return block.replace(/\s+/g, ' ').trim()
  }

  it.each(PREDICATES)('%s is byte-identical in both files, wrapping aside', name => {
    const copies: readonly (readonly [string, string])[] = [
      ['editorsheet.test.ts', predicateSource('editorsheet.test.ts', name)],
      ['chromedom.test.ts', predicateSource('chromedom.test.ts', name)],
    ]
    // Vacuity floor, and the load-bearing half: an extraction that matched
    // nothing in both files would return two empty strings and compare them
    // happily. Named per file so the failure says which copy moved.
    for (const [file, text] of copies) {
      expect(text.length, `${file}: \`${name}\` was not found — it was renamed or moved`)
        .toBeGreaterThan(60)
      expect(text, file).toContain(`function ${name}`)
    }
    expect(copies[0]![1], 'the two copies of the reordering predicate have drifted')
      .toBe(copies[1]![1])
  })
})
