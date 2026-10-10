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
    // What a numbered weight buys is the RASTERISER's call, not our code's and
    // not really the font stack's: DejaVu Sans, Liberation Sans and Noto Sans
    // all declare only 400 and 700, Chromium renders `900` byte-identically to
    // `bold` in every one of them, and `@napi-rs/canvas` synthesises it at
    // +13–25%. (The earlier version of this comment blamed a "real 900 face" on
    // GitHub's runner for the +15% there; it was synthesis on a different
    // silent font fallback — see §9 of
    // docs/2026-10-09-testing-retrospective.md.) So a numbered weight has to be
    // labelled as conditional, and the page has to say so in prose too.
    const nine = main.match(/^\s*\['900',\s*'([^']*)'\],$/m)
    expect(nine?.[1], 'the 900 option needs a hedged label').toMatch(/if|may|might|when/i)
    expect(html).toMatch(/is a request, not a guarantee/)
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
