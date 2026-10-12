import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateScene } from './scene.js'

/**
 * The `index.html` ⇄ `main.ts` element contract, checked as text.
 *
 * `main.ts` is the one module in `site/` with no unit tests, because
 * `OffscreenCanvas` does not exist under node and jsdom does not rasterise
 * (design §9.12). But its single likeliest failure is not a drawing failure at
 * all — it is **drift between the markup and the code**, and that needs no DOM
 * to detect: `main.ts` resolves four dozen ids through `el()`, which throws
 * `site/index.html is missing #x` and leaves the page as an error banner.
 * Renaming an id in one file and not the other is a one-character mistake that
 * breaks the entire page, and until this file existed nothing caught it.
 *
 * Both directions are checked, because they fail differently:
 *
 * - **An id in `main.ts` with no element** is a dead page. `el()` names it, but
 *   only once a browser has loaded it.
 * - **An element with no reference in `main.ts`** is a silent one: a control
 *   that renders, accepts input, and is wired to nothing. The "Band to x" field
 *   behaving as decoration would look exactly like a working field.
 *
 * Grepping source is a blunt instrument and is used here on purpose, following
 * `src/core/purity.test.ts` and `site/dist.test.ts`: the alternative is
 * exporting the id list from `main.ts` so a test can import it, which moves the
 * single source of truth *away* from the markup and would still not prove the
 * markup agrees. The regexes are pinned by the vacuity guard below, so a
 * refactor that changes the call shape fails loudly rather than matching
 * nothing and passing.
 */

const SITE = resolve(fileURLToPath(new URL('.', import.meta.url)))
const html = readFileSync(join(SITE, 'index.html'), 'utf8')
const main = readFileSync(join(SITE, 'main.ts'), 'utf8')

/** Ids `main.ts` looks up: `el<HTMLInputElement>('sepFar')`. */
const referenced = new Set(
  [...main.matchAll(/\bel<[^>]*>\(\s*'([^']+)'\s*\)/g)].map(m => m[1]!),
)

/** Ids the markup defines. */
const declared = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]!))

describe('the markup and main.ts agree about element ids', () => {
  it('found enough of both to be a real check, not a vacuous one', () => {
    // Without this, a regex that silently stopped matching would turn both
    // assertions below into `expect([]).toEqual([])`. The floor tracks the
    // real count (46 as of the type controls) with slack to delete a panel
    // without having to edit a test.
    expect(referenced.size).toBeGreaterThan(40)
    expect(declared.size).toBeGreaterThan(40)
  })

  it('declares every id main.ts resolves through el()', () => {
    const missing = [...referenced].filter(id => !declared.has(id)).sort()
    expect(missing).toEqual([])
  })

  it('wires up every id the markup declares', () => {
    // `el()` is not the only consumer: `showError` looks up #error directly so
    // that a failure *while collecting* the rest can still be reported, and
    // `<output for="scrub">` / `<select id="depth-view">` are referenced by
    // other attributes. So an id is "wired" if it appears anywhere in main.ts.
    const orphans = [...declared].filter(id => !main.includes(`'${id}'`)).sort()
    expect(orphans).toEqual([])
  })

  it('references no id twice from el(), which would mean two names for one node', () => {
    const all = [...main.matchAll(/\bel<[^>]*>\(\s*'([^']+)'\s*\)/g)].map(m => m[1]!)
    expect(all.length).toBe(referenced.size)
  })
})

/**
 * The font-weight dropdown, which `main.ts` builds from a literal rather than
 * from markup — so the id check above cannot see it at all.
 *
 * It is worth a check of its own because the two ends are in different files
 * and only one of them is typed: every value the dropdown can produce is
 * dispatched into a scene, and `validateScene` is the thing that has to accept
 * it. An option whose value the validator rejects would produce a control that
 * turns the page into an error banner when clicked.
 */
const weights = [...main.matchAll(/^\s*\['([^']*)',\s*'[^']*'\],$/gm)].map(m => m[1]!)

describe('the font-weight options main.ts offers', () => {
  it('found the list, rather than matching nothing and passing', () => {
    expect(weights.length).toBeGreaterThanOrEqual(3)
    expect(weights).toContain('')
  })

  it('offers exactly one way to say "unspecified"', () => {
    // `''` is mapped to `undefined` by the change handler, which the reducer
    // treats as a removal. A second blank-ish option (a literal "normal"
    // masquerading as the default, say) would give two spellings for one state
    // and the control would read back the wrong one.
    expect(weights.filter(w => w.trim() === '')).toEqual([''])
  })

  it('offers only weights the scene validator accepts', () => {
    for (const weight of weights) {
      if (weight === '') continue
      expect(() => validateScene({
        size: [64, 32],
        layers: [{ type: 'text', text: 'A', weight }],
      }), `weight ${JSON.stringify(weight)}`).not.toThrow()
    }
  })

  it('does not imply a heavier weight always helps', () => {
    // **This assertion survived a change in the underlying fact, and the fact is
    // what moved.** It used to rest on there being no 900 face anywhere: DejaVu
    // Sans, Liberation Sans and Noto Sans all declare only 400 and 700,
    // Chromium rendered `900` byte-identically to `bold` in every one of them,
    // and `@napi-rs/canvas` synthesised it at +13-25%. (An earlier version of
    // this comment blamed a "real 900 face" on GitHub's runner for the +15%
    // there; it was synthesis on a different silent font fallback — see §9 of
    // docs/2026-10-09-testing-retrospective.md.)
    //
    // The vendored face *does* declare a real 900, so "may be identical to
    // bold" is no longer the honest hedge. The hedge that replaces it is
    // narrower and checkable: the face is a webfont, and if it does not load the
    // page falls back to the engine's own sans and the collapse returns. So the
    // label must still be conditional, and the page must still name the
    // condition in prose — which is what is asserted, rather than any particular
    // claim about font stacks.
    const nine = main.match(/^\s*\['900',\s*'([^']*)'\],$/m)
    expect(nine?.[1], 'the 900 option needs a hedged label').toMatch(/if|may|might|when/i)
    expect(html).toMatch(/is a request, not a\s+guarantee/)
    // And the condition itself, not just the hedge.
    expect(html).toMatch(/fails to load/)
  })
})

describe('the markup keeps the promises the page cannot test in node', () => {
  it('disables the type controls for a non-text layer instead of hiding them', () => {
    // The panel must not reflow as the layer dropdown changes, or the control
    // under the pointer moves. Nothing else can check this: there is no DOM
    // here, and the symptom is a layout jump rather than a wrong value.
    expect(main).toMatch(/ui\.textSize\.disabled\s*=/)
    expect(main).toMatch(/ui\.textWeight\.disabled\s*=/)
    expect(main).not.toMatch(/ui\.text(Size|Weight)\.hidden/)
  })

  it('gives a disabled control a visible treatment, so "disabled" reads as deliberate', () => {
    // Disabling without styling looks identical to a field that is simply
    // ignoring input — which is the exact complaint the markup.test header
    // records about a control wired to nothing.
    const css = readFileSync(join(SITE, 'styles.css'), 'utf8')
    expect(css).toMatch(/input:disabled[\s\S]{0,40}select:disabled\s*\{[^}]*opacity/)
  })

  it('loads main.ts and styles.css by a relative path', () => {
    // The built output is checked by dist.test.ts; this is the source-side
    // guard, so `npm test` catches it without a build. A GitHub project Page is
    // served from a subpath, where a leading slash resolves to the user site
    // root.
    for (const ref of [...html.matchAll(/(?:src|href)="([^"]*)"/g)].map(m => m[1]!)) {
      if (/^https?:/.test(ref)) continue
      expect(ref, `${ref} must be document-relative`).toMatch(/^\.\//)
    }
  })

  /**
   * **The display scale, pinned at the source level.**
   *
   * `site/scale.test.ts` proves the arithmetic and proves what non-integer
   * scaling does to a plate. Neither can see whether the page *applies* it —
   * that needs a browser, and the 96-case headless sweep that does it is not
   * part of `npm test`. So the two halves that connect the arithmetic to the
   * pixels are pinned here, the same way the font load is above.
   *
   * Both are one-line deletions that leave every other test in the repo green,
   * and both put the original defect straight back.
   */
  it('sets the canvas width from JS, rather than leaving it to CSS', () => {
    expect(main).toMatch(/ui\.stereoCanvas\.style\.width\s*=/)
    expect(main).toMatch(/ui\.stereoCanvas\.style\.height\s*=/)
    expect(main).toContain('viewLayout(')
  })

  it('never gives the stereogram canvas a percentage width', () => {
    // `canvas { width: 100% }` plus `image-rendering: pixelated` IS the bug:
    // an arbitrary non-integer nearest-neighbour ratio, and below 1:1 it drops
    // source columns outright. Measured at 0.39x on the default scene before
    // the fix. A percentage width must never come back for this element.
    // Comments are stripped FIRST, and that is not tidiness. The docblock above
    // the rule quotes `canvas { width: 100% }` as the thing that went wrong, so
    // a regex run over the raw file matches prose, finds braces inside it, and
    // mis-parses every rule after it. The first version of this test did
    // exactly that: it passed with `width: 100%` restored on the live rule,
    // because its "did the regex match anything" guard was satisfied by comment
    // text. Hence the explicit `#stereo-canvas` guard below rather than a count.
    const css = readFileSync(join(SITE, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map(([, selector, body]) => ({ selector: selector!.trim(), body: body! }))
    const stereo = rules.filter(r => /(^|[\s,])(canvas|#stereo-canvas)([\s,]|$)/.test(r.selector))
    expect(
      stereo.map(r => r.selector),
      'neither the generic canvas rule nor #stereo-canvas was found — the regex is broken',
    ).toContain('#stereo-canvas')
    const offenders = stereo.filter(r => /\bwidth:\s*[\d.]+%/.test(r.body)).map(r => r.selector)
    expect(offenders).toEqual([])
  })

  it('lets an over-wide plate scroll, and lets .stacked actually stack', () => {
    // The two halves of "never downscale". If the scroller stops scrolling,
    // the columns past the edge are not shrunk — they are unreachable, which
    // is worse. If `.stacked` keeps two columns, the row/column decision
    // computed in `scale.ts` has nowhere to land.
    const css = readFileSync(join(SITE, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = Object.fromEntries(
      [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, s, b]) => [s!.trim(), b!]),
    )
    expect(Object.keys(rules), 'the rule regex matched nothing').toContain('.canvas-scroll')
    expect(rules['.canvas-scroll']).toMatch(/overflow-x:\s*(auto|scroll)/)
    expect(rules['.views.stacked']).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/)
  })

  it('re-snaps the scale when the window or the devicePixelRatio moves', () => {
    // An integer scale chosen once is wrong the moment the window is dragged
    // or the page moves to a monitor with a different scale factor, and the
    // second of those fires no resize event at all.
    expect(main).toMatch(/addEventListener\('resize', invalidateDisplayScale\)/)
    expect(main).toMatch(/matchMedia\(`\(resolution: \$\{dpr\}dppx\)`\)/)
    expect(main).toMatch(/new ResizeObserver\(/)
  })

  it('declares the licence the package declares', () => {
    // Design §9.4 was settled as WTFPL after an earlier MIT. Three files say
    // so and they are easy to change in ones and twos.
    const pkg = JSON.parse(
      readFileSync(join(SITE, '..', 'package.json'), 'utf8'),
    ) as { license: string }
    expect(pkg.license).toBe('WTFPL')
    expect(html).toContain(pkg.license)
    expect(readFileSync(join(SITE, '..', 'LICENSE'), 'utf8'))
      .toContain('DO WHAT THE FUCK YOU WANT TO')
  })
})

/**
 * **Presentation mode's structural promises, checked against the real markup.**
 *
 * `?present=1` is defined by what it *removes*, and "removes" is a claim about
 * every element on the page — which makes a hand-written list of hidden
 * selectors exactly the wrong thing to assert, because the way it fails is by
 * going out of date when a panel is added. So the list is **derived**: the
 * children of `<body>`, of `<main>`, of `.views` and of the stereo figure are
 * read out of `index.html`, and each one has to be either hidden by a
 * `html.presenting … { display: none }` rule or on an explicit keep-list with a
 * reason. Adding a section to the page fails this test until someone decides
 * which it is.
 *
 * The indentation-based child extraction is blunt and is guarded: every slice
 * asserts it found the children it is about to check, so a reformat that breaks
 * the regex fails loudly instead of checking nothing. `index.html` is
 * hand-maintained with consistent two-space indentation, and this is cheaper
 * and more legible than pulling in an HTML parser for one file.
 *
 * What this file *cannot* see is whether the plate is actually scaled correctly
 * once everything is hidden. That needs a browser, and the evidence is the
 * run-length screenshot measurement in the task report.
 */

const lines = html.split('\n')

/** Opening tags at exactly `indent` spaces, between `from` and `to`. */
function childrenAt(indent: number, from: number, to: number): string[] {
  const pad = ' '.repeat(indent)
  const out: string[] = []
  for (let i = from; i < to; i++) {
    const line = lines[i]!
    if (!line.startsWith(`${pad}<`) || line.startsWith(`${pad}</`)) continue
    if (line[indent + 1] === '!') continue
    if (line.slice(0, indent).trim() !== '') continue
    const tag = /^<([a-z][a-z0-9]*)/.exec(line.slice(indent))
    if (tag) out.push(line.slice(indent))
  }
  return out
}

function lineOf(needle: string): number {
  const i = lines.findIndex(l => l.includes(needle))
  expect(i, `index.html no longer contains ${JSON.stringify(needle)}`).toBeGreaterThan(-1)
  return i
}

function closeAt(indent: number, tag: string, from: number): number {
  const needle = `${' '.repeat(indent)}</${tag}>`
  const i = lines.findIndex((l, n) => n > from && l === needle)
  expect(i, `no </${tag}> at indent ${indent} after line ${from}`).toBeGreaterThan(from)
  return i
}

/** `['p', '#error', '.banner']` for `<p class="banner" id="error" …>`. */
function tokensOf(openTag: string): string[] {
  const tag = /^<([a-z][a-z0-9]*)/.exec(openTag)![1]!
  const id = /\bid="([^"]+)"/.exec(openTag)?.[1]
  const classes = (/\bclass="([^"]+)"/.exec(openTag)?.[1] ?? '').split(/\s+/).filter(Boolean)
  return [tag, ...(id === undefined ? [] : [`#${id}`]), ...classes.map(c => `.${c}`)]
}

const cssText = readFileSync(join(SITE, 'styles.css'), 'utf8')
const cssRules = [...cssText.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, body]) => ({ selector: selector!.trim(), body: body! }))

/** Selectors hidden by a `html.presenting … { display: none }` rule. */
const presentingHidden = cssRules
  .filter(r => r.selector.includes('.presenting') && /display:\s*none/.test(r.body))
  .flatMap(r => r.selector.split(','))
  .map(s => s.trim().replace(/^html\.presenting\s*/, ''))
  .filter(s => s !== '')

/** The rightmost compound of a selector — the element the rule actually hides. */
const hiddenSubjects = new Set(presentingHidden.map(s => s.split(/\s*>\s*|\s+/).pop()!))

function isHidden(openTag: string): boolean {
  return tokensOf(openTag).some(t => hiddenSubjects.has(t))
}

describe('presentation mode shows only the stereo canvas', () => {
  it('found the hide rules, rather than matching nothing and passing', () => {
    expect(presentingHidden.length).toBeGreaterThanOrEqual(5)
    expect(hiddenSubjects.has('.panels')).toBe(true)
  })

  it('hides with display:none, never with visibility or opacity', () => {
    // Not cosmetic. A merely-invisible control still takes layout space (so it
    // still constrains the stage), is still in the accessibility tree, and is
    // still FOCUSABLE — which would leave a keyboard user tabbing through two
    // dozen sliders they cannot see, in a mode whose only exit is one key.
    const presenting = cssRules.filter(r => r.selector.includes('.presenting'))
    expect(presenting.length).toBeGreaterThanOrEqual(5)
    for (const rule of presenting) {
      expect(rule.body, rule.selector).not.toMatch(/visibility:\s*hidden/)
      expect(rule.body, rule.selector).not.toMatch(/opacity:\s*0/)
    }
  })

  /**
   * Things presentation mode deliberately keeps, with the reason each one is
   * not a panel. Anything else on the page has to be hidden.
   */
  const KEEP: Record<string, string> = {
    main: 'the ancestor of the canvas',
    script: 'not rendered',
    '#error': 'a failure report, not chrome — repositioned, never hidden',
    '#present-hint': 'the only way out of the mode',
    '.views': 'the ancestor of the stereo figure',
    '.stereo-view': 'the figure holding the canvas',
    '#canvas-scroll': 'the stage itself',
  }

  const accounted = (openTag: string): boolean =>
    isHidden(openTag) || tokensOf(openTag).some(t => t in KEEP)

  it('accounts for every direct child of <body>', () => {
    const open = lineOf('  <body>')
    const children = childrenAt(4, open, closeAt(2, 'body', open))
    expect(children.length).toBeGreaterThanOrEqual(5)
    expect(children.filter(c => !accounted(c))).toEqual([])
  })

  it('accounts for every direct child of <main>', () => {
    const open = lineOf('    <main>')
    const children = childrenAt(6, open, closeAt(4, 'main', open))
    expect(children.length).toBeGreaterThanOrEqual(3)
    expect(children.filter(c => !accounted(c))).toEqual([])
  })

  it('hides the depth map, and keeps only the stereo figure', () => {
    const open = lineOf('<section class="views"')
    const children = childrenAt(8, open, closeAt(6, 'section', open))
    expect(children.length).toBe(2)
    expect(children.filter(c => !accounted(c))).toEqual([])
    // Specifically: the depth panel is hidden, not merely not-promoted.
    expect(children.filter(c => isHidden(c)).map(tokensOf).flat()).toContain('.depth-view')
  })

  it('strips the stereo figure down to the canvas — no caption, no notes', () => {
    const open = lineOf('<figure class="view stereo-view">')
    const children = childrenAt(10, open, closeAt(8, 'figure', open))
    expect(children.length).toBeGreaterThanOrEqual(4)
    expect(children.filter(c => !accounted(c))).toEqual([])
    // And the one that survives is the scroller, not something else.
    const kept = children.filter(c => !isHidden(c)).map(tokensOf)
    expect(kept).toHaveLength(1)
    expect(kept[0]).toContain('#canvas-scroll')
  })

  it('sizes the presented canvas from JS with the both-axes snap', () => {
    // The height constraint is the whole difference from the normal view, and
    // `fitScale` is the only thing in the repo that applies it. Deleting the
    // branch leaves every other test green.
    expect(main).toContain('fitScale(')
    expect(main).toMatch(/availableHeight:\s*availableHeight|availableHeight,/)
    expect(main).toMatch(/ui\.canvasScroll\.clientHeight/)
    expect(main).toMatch(/ui\.canvasScroll\.clientWidth/)
  })

  it('writes the centring offset itself rather than trusting margin: auto', () => {
    // `margin: auto` lands the plate on half the remainder, which is a
    // FRACTIONAL device origin for half of all viewport widths — measured at a
    // 3825x2160 viewport, dpr 1.5, as 109910 of 6300000 device pixels wrong, in
    // 74 columns spaced 2 x scale apart. That is the unequal-run defect, not an
    // edge artifact. Deleting either of these two lines restores it and leaves
    // every other test in the repo green.
    expect(main).toMatch(/ui\.canvasWrap\.style\.marginLeft\s*=\s*`\$\{fit\.offsetX\}px`/)
    expect(main).toMatch(/ui\.canvasWrap\.style\.marginTop\s*=\s*`\$\{fit\.offsetY\}px`/)
    // ...and clears them again, or the normal view inherits the last indent.
    expect(main).toMatch(/ui\.canvasWrap\.style\.marginLeft\s*=\s*''/)
    expect(main).toMatch(/ui\.canvasWrap\.style\.marginTop\s*=\s*''/)
  })

  it('never lets CSS do the scaling in this mode either', () => {
    // The same defect as `canvas { width: 100% }`, wearing presentation
    // clothes: `object-fit: contain`, `max-width: 100%`, `width: 100vw` and
    // `height: 100%` on the canvas would each fit the plate to the viewport at
    // an arbitrary fractional ratio, in a stylesheet where no unit test could
    // see it. Checked over every presenting rule, because the canvas is a
    // descendant of all of them.
    for (const rule of cssRules.filter(r => r.selector.includes('.presenting'))) {
      expect(rule.body, rule.selector).not.toMatch(/object-fit/)
      expect(rule.body, rule.selector).not.toMatch(/(width|height):\s*[\d.]+(%|vw|vh|vmin|vmax)/)
    }
  })

  it('lets an over-large plate scroll from its true left edge', () => {
    // Centring an overflowing flex item with `justify-content` pushes its
    // leading edge outside the scrollport, and a scroller cannot scroll back
    // past its origin — so those columns are not shrunk, they are unreachable.
    // Auto margins collapse to 0 when there is no spare space, which is the
    // whole reason they are used instead.
    const stage = cssRules.find(r => /\.presenting\s+#canvas-scroll$/.test(r.selector))
    expect(stage, 'the presenting stage rule was not found').toBeDefined()
    expect(stage!.body).toMatch(/overflow:\s*auto/)
    expect(stage!.body).not.toMatch(/justify-content/)
    const wrap = cssRules.find(r => /\.presenting\s+\.canvas-wrap$/.test(r.selector))
    expect(wrap, 'the presenting wrap rule was not found').toBeDefined()
    expect(wrap!.body).toMatch(/margin:\s*auto/)
    // A flex item defaults to shrinking, and the automatic minimum size that
    // would normally stop it does NOT apply to an item with `overflow: hidden`
    // — which this wrapper has. Without `flex: none` the plate gets clipped.
    expect(wrap!.body).toMatch(/flex:\s*none/)
    // And the border comes off: 2 CSS px the fit arithmetic was not told about
    // is the `box-sizing` trap one layer out.
    expect(wrap!.body).toMatch(/border:\s*0/)
  })

  it('re-snaps on a fullscreen change, not only on resize', () => {
    // `requestFullscreen` changes the viewport without a conventional resize
    // event in some engines, and the stage's height is now an input to the
    // scale — so a missed re-snap is a wrong integer, not a cosmetic lag.
    expect(main).toMatch(/addEventListener\('fullscreenchange'/)
    expect(main).toMatch(/\.observe\(ui\.canvasScroll\)/)
  })

  it('offers one key out, and drops the parameter on the way', () => {
    // Without this the visitor who fullscreens the page is stuck with it.
    expect(main).toMatch(/event\.key !== 'Escape'/)
    expect(main).toContain('presentUrl(location, presenting)')
    expect(main).toContain('history.replaceState')
    // The hint names the key, in the markup rather than only in a comment.
    expect(html).toMatch(/<kbd>Esc<\/kbd>/)
  })

  it('keeps the flag out of the fragment', () => {
    // `site/present.test.ts` proves the round trip with a real scene; this is
    // the structural half — `main.ts` must never assemble a hash itself, which
    // is the one way the flag could end up where `parseSceneHash` would choke
    // on it.
    const calls = [...main.matchAll(/history\.replaceState\([^)]*\)/g)].map(m => m[0]).sort()
    expect(calls, 'the replaceState regex matched nothing').toEqual([
      "history.replaceState(null, '', hash)",
      "history.replaceState(null, '', url)",
    ])
    // The first writes a fragment built by nothing but the scene codec…
    expect(main).toContain('const hash = `#${encodeSceneHash(state.scene)}`')
    // …and the second delegates to `presentUrl`, which concatenates
    // `location.hash` verbatim and is unit-tested against a real scene.
    expect(main).toContain('const url = presentUrl(location, presenting)')
  })

  it('leaves the scene, playback and the raster cache alone', () => {
    // "This is a view mode, nothing more." The two things that would break it
    // are stopping playback and dropping the cache, which is what `setScene`
    // does and what entering a mode must not.
    const body = /function setPresenting\(on: boolean\): void \{([\s\S]*?)\n\}/.exec(main)?.[1]
    expect(body, 'the setPresenting() body regex matched nothing').toBeDefined()
    expect(body).not.toMatch(/playing\s*=/)
    expect(body).not.toMatch(/createRasterCache|setScene|syncHash|initialState/)
  })
})

describe('the vendored webfont is loaded before anything is drawn', () => {
  /**
   * **Two source assertions, for a contract no test here can execute.**
   *
   * `main.ts` has no unit tests on purpose — `OffscreenCanvas` does not exist
   * under node and jsdom does not rasterise — and the failure being guarded is
   * silent in the worst way: `fillText` in a declared-but-unloaded family draws
   * in a fallback face without complaint, so a frame rendered before the font
   * arrives has a *wrong depth map* that looks exactly like a correct one, and
   * the legibility panel measures it and reports a number.
   *
   * Deleting either half — the `startFontLoad()` in `boot()` or the
   * `await fontReady` at the top of `paint()` — leaves every test in the repo
   * green. So they are pinned the same way the element ids above are, with the
   * same justification, and the regexes are guarded against matching nothing.
   */
  it('boot() starts the load', () => {
    const boot = /function boot\(\): void \{([\s\S]*?)\n\}/.exec(main)?.[1]
    expect(boot, 'the boot() body regex matched nothing').toBeDefined()
    expect(boot).toContain('startFontLoad()')
  })

  it('paint() awaits it before it rasterises, and before anything else', () => {
    const paint = /async function paint\(\): Promise<void> \{([\s\S]*?)\n\}/.exec(main)?.[1]
    expect(paint, 'the paint() body regex matched nothing').toBeDefined()
    expect(paint).toContain('await fontReady')
    // First statement, not merely present: awaiting it after the first
    // `rasterDepth` would still draw one frame in the wrong face.
    expect(paint!.trimStart().startsWith('await fontReady')).toBe(true)
  })
})
