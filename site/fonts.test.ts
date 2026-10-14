import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadVendoredFont } from './fonts.js'
import {
  VENDORED_FAMILY, VENDORED_WEIGHTS, vendoredFontPath,
} from '../src/shared/fontspec.js'

/**
 * The browser half of "both adapters rasterise the same face".
 *
 * Two separable claims, and neither needs a browser:
 *
 * 1. **Each page's stylesheet really declares the vendored files**, one
 *    `@font-face` per weight, under the same family name `src/web/canvas.ts`
 *    retargets `sans-serif` to, pointing at files that exist. A typo in the
 *    family name is the failure this guards: everything keeps working, the page
 *    silently renders in the engine's own sans, and the legibility panel quietly
 *    disagrees with `stst` again — the exact bug the vendoring was for.
 * 2. **`loadVendoredFont` treats a non-loading face as a failure.** The trap is
 *    that `FontFaceSet.load` *resolves* — with an empty array — when no
 *    declared face matches, so `await document.fonts.load(...)` is not evidence
 *    that anything loaded. A `FontFaceSet` is a plain object interface, so a
 *    stub is honest here in a way a stubbed canvas would not be: the thing
 *    under test is this module's reading of the result, not the platform's
 *    font machinery.
 *
 * What is *not* here: whether the glyphs the browser rasterises match the ones
 * `@napi-rs/canvas` rasterises. That needs a real engine, and it is measured
 * against a headless Chromium with the numbers recorded in the README.
 */

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

/**
 * Every stylesheet that has to declare the faces, because every *document*
 * that has to display them loads one of these and nothing else.
 *
 * `playerpage.css` is a forced duplicate of `styles.css`'s three rules — its
 * own header records why (the player "shares nothing" with the editor sheet by
 * design, and a shared partial would mean editing `styles.css`, which this
 * phase may not touch). A duplicate is exactly the thing that drifts, so both
 * copies are read here rather than only the editor's.
 *
 * This is also the **only** place either sheet's face list is tied to
 * {@link VENDORED_WEIGHTS}. `site/dist.test.ts`'s player font checks cannot do
 * it: vite emits a woff2 *because* a stylesheet referenced it, so a deleted
 * `@font-face` disappears from the emitted files and from the emitted CSS
 * together and every equality there still holds. Measured: with the `900`
 * block deleted from `playerpage.css` and the player rebuilt, `dist-player/`
 * carried `inter-400` and `inter-700`, the emitted sheet referenced exactly
 * those two, and the suite reported **1329 passed / 0 failed**. Read off the
 * sources rather than off a build so it is not gated on one either.
 */
const SHEETS = ['site/styles.css', 'site/playerpage.css'] as const

/** Every `@font-face { … }` block in the stylesheet, as its raw body. */
function fontFaceBlocks(text: string): string[] {
  return [...text.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => m[1]!)
}

function declaration(block: string, property: string): string | undefined {
  const m = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i').exec(block)
  return m?.[1]?.trim()
}

describe.each(SHEETS)('%s declares the vendored face', sheet => {
  const blocks = fontFaceBlocks(readFileSync(join(ROOT, sheet), 'utf8'))

  it('has exactly one @font-face per vendored weight', () => {
    // The vacuity guard for everything below: a regex that matched nothing
    // would make every assertion in this file pass.
    expect(blocks.length).toBe(VENDORED_WEIGHTS.length)
  })

  it('names the family the web adapter retargets sans-serif to', () => {
    for (const block of blocks) {
      const family = declaration(block, 'font-family')
      // Quoted, because the name contains a space. Compared after stripping
      // quotes so the test does not pin the quote style.
      expect(family?.replace(/["']/g, '')).toBe(VENDORED_FAMILY)
    }
  })

  it('points each weight at the woff2 that exists in assets/fonts', () => {
    const rows: string[] = []
    for (const weight of VENDORED_WEIGHTS) {
      const block = blocks.find(b => declaration(b, 'font-weight') === String(weight))
      expect(block, `no @font-face for weight ${weight}`).toBeDefined()
      const src = declaration(block!, 'src')!
      const url = /url\(\s*["']?([^"')]+)/.exec(src)?.[1]
      expect(url, `weight ${weight} has no url()`).toBeDefined()
      // Relative, never root-relative: a GitHub project Page serves from
      // /staticstereo/. `site/dist.test.ts` asserts the same of the built CSS.
      expect(url!.startsWith('/')).toBe(false)
      expect(url!.endsWith(vendoredFontPath(weight, 'woff2').replace('assets/fonts/', '')))
        .toBe(true)
      // Resolved against the *sheet's own* directory and not against a
      // hard-coded `site/`: a `url()` in CSS is relative to the stylesheet, so
      // a sheet added one directory deeper has to be checked where it lives.
      const onDisk = resolve(ROOT, dirname(sheet), url!)
      expect(existsSync(onDisk), onDisk).toBe(true)
      rows.push(`${weight}=${statSync(onDisk).size}B`)
      expect(src).toContain('woff2')
    }
    // The byte cost a visitor pays, in the test output, so it cannot drift
    // unnoticed behind a passing assertion.
    expect(rows).toHaveLength(VENDORED_WEIGHTS.length)
  })

  it('blocks rather than swaps, because a fallback frame is a wrong measurement', () => {
    // `swap` would paint text in a fallback face first. The thing being painted
    // is a stereogram graded on stroke width, so that frame's depth map is
    // wrong and looks identical to a correct one.
    for (const block of blocks) {
      expect(declaration(block, 'font-display')).toBe('block')
    }
  })
})

describe('loadVendoredFont', () => {
  /** A `FontFaceSet` stub: records requests, answers from a fixed face list. */
  function fakeFonts(
    present: readonly number[], opts: { checkFails?: boolean; throwOn?: number } = {},
  ) {
    const asked: string[] = []
    const set = {
      asked,
      load: async (spec: string) => {
        asked.push(spec)
        const weight = Number(/^(\d+)/.exec(spec)?.[1] ?? 400)
        if (opts.throwOn === weight) throw new Error(`network error for ${weight}`)
        // The trap: an unmatched request resolves with an EMPTY array.
        return present.includes(weight) ? [{ family: VENDORED_FAMILY }] : []
      },
      check: () => !opts.checkFails && present.length > 0,
    }
    return set as unknown as FontFaceSet & { asked: string[] }
  }

  it('asks for every declared weight, not just the one the scene uses', async () => {
    // A scene's weight changes on any keystroke in the Weight control; loading
    // on demand would draw the first frame after each change in the wrong face.
    const fonts = fakeFonts(VENDORED_WEIGHTS)
    const result = await loadVendoredFont(fonts)
    expect(result.ready).toBe(true)
    expect(result.problem).toBeUndefined()
    expect(result.loaded).toEqual([...VENDORED_WEIGHTS])
    for (const weight of VENDORED_WEIGHTS) {
      expect(fonts.asked.some(s => s.startsWith(`${weight} `))).toBe(true)
      expect(fonts.asked.some(s => s.includes(VENDORED_FAMILY))).toBe(true)
    }
  })

  it('treats an EMPTY load result as a failure, which is the actual trap', async () => {
    // `FontFaceSet.load` resolves rather than rejecting when no @font-face
    // matches, so a typo in the family name or a 404 on the woff2 looks exactly
    // like success to anyone who only awaits the promise.
    const result = await loadVendoredFont(fakeFonts([400]))
    expect(result.loaded).toEqual([400])
    expect(result.problem).toMatch(/700: no @font-face matched/)
    expect(result.problem).toMatch(/900: no @font-face matched/)
    expect(result.problem).toMatch(/README/)
  })

  it('reports a throwing load without rejecting, so the page still renders', async () => {
    const result = await loadVendoredFont(fakeFonts(VENDORED_WEIGHTS, { throwOn: 900 }))
    expect(result.problem).toMatch(/900: network error/)
    expect(result.loaded).toEqual([400, 700])
  })

  it('believes FontFaceSet.check over its own bookkeeping', async () => {
    // Every weight "loaded" and the face is still unusable. `check` is the
    // platform's own answer to "can a canvas draw with this", and it is the one
    // `src/web/canvas.ts` consults before retargeting anything, so this module
    // must not claim ready when it says no.
    const result = await loadVendoredFont(fakeFonts(VENDORED_WEIGHTS, { checkFails: true }))
    expect(result.ready).toBe(false)
    expect(result.problem).toMatch(/unusable/)
  })

  it('degrades, with an explanation, where there is no FontFaceSet at all', async () => {
    const result = await loadVendoredFont(undefined)
    expect(result.ready).toBe(false)
    expect(result.loaded).toEqual([])
    expect(result.problem).toMatch(/document\.fonts/)
  })
})
