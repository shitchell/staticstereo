import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The `index.html` ⇄ `main.ts` element contract, checked as text.
 *
 * `main.ts` is the one module in `site/` with no unit tests, because
 * `OffscreenCanvas` does not exist under node and jsdom does not rasterise
 * (design §9.12). But its single likeliest failure is not a drawing failure at
 * all — it is **drift between the markup and the code**, and that needs no DOM
 * to detect: `main.ts` resolves roughly forty ids through `el()`, which throws
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
    // assertions below into `expect([]).toEqual([])`.
    expect(referenced.size).toBeGreaterThan(30)
    expect(declared.size).toBeGreaterThan(30)
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

describe('the markup keeps the promises the page cannot test in node', () => {
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
