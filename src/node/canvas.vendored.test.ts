/**
 * Is the **vendored** face what gets drawn, or did we fall back to the system?
 *
 * ## Why this file is separate from `canvas.generics.test.ts`
 *
 * That file proves the generic `sans-serif` resolves to *something with Latin
 * glyphs* — the fix for the dingbats. It would pass just as happily if the
 * vendored registration silently failed and DejaVu Sans answered instead,
 * because DejaVu has Latin glyphs too. That is exactly the shape of the bug
 * this project keeps rediscovering: a check that cannot tell correct from
 * nearly-correct reports success while the font layer is wrong.
 *
 * So the assertions here are about **identity**, and the discriminator is
 * metric. Choosing that discriminator took measuring, and the obvious ones are
 * too weak to use:
 *
 * | probe, 100px            | vendored | DejaVu | Liberation | Noto   |
 * |-------------------------|----------|--------|------------|--------|
 * | `HELLO` advance         |  321.14  | 324.95 |   327.93   | 310.60 |
 * | median stroke 150 bold  |      24  |     29 |       22   |     24 |
 * | `III` advance           |   80.57  |  88.48 |    83.35   | 101.70 |
 * | `iiiii` advance         |  121.09  | 138.92 |   111.08   | 129.00 |
 *
 * `HELLO` puts DejaVu only 1.2% away, and the project's own stroke statistic
 * cannot tell the vendored face from Noto Sans *at all* at 150px bold — both
 * report 24. A test built on either would be a coin toss. The narrow glyphs are
 * what separate the faces: over `III`, `iiiii` and the digits, the *closest*
 * system family is 3.5% away and the furthest 26%, so a 3% threshold has at
 * least a 1.15× margin on the tight side and is nowhere near rounding noise.
 * Hence the probe set below, and the matrix is reported in full so the margin
 * stays visible rather than being implied by a pass.
 *
 * ## What is asserted versus what is reported
 *
 * Absolute widths are **reported**, never asserted: they are properties of the
 * vendored file, and pinning one here would duplicate the README's table in a
 * place that fails on a font upgrade for no reason. What is asserted is
 * everything that must be true for the vendoring to be doing its job at all:
 *
 *  - the three files registered, under one family, with three *distinct*
 *    weights — the point of choosing a face with a real 900;
 *  - `sans-serif` resolves to that family and not to a system one;
 *  - the resolved face measures *differently* from every system candidate, so
 *    we know which one we got;
 *  - 900 draws measurably heavier than bold, which the old system chain could
 *    not deliver because it declared only 400 and 700;
 *  - and the fallback still works: with the vendored family reported absent,
 *    resolution lands on the system chain rather than throwing or returning the
 *    generic unresolved.
 *
 * The last one is the mutation test made permanent. The others fail if the
 * `assets/fonts/` files go missing, get replaced by a different face, or stop
 * being registered before the first resolution.
 */
import { describe, expect, it } from 'vitest'
import { GlobalFonts } from '@napi-rs/canvas'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nodeCanvas, resolveFontGenerics, vendoredFont } from './canvas.js'
import { VENDORED_FAMILY, VENDORED_WEIGHTS, vendoredFontPath } from '../shared/fontspec.js'
import { rasterDepth } from '../core/raster.js'
import { DEFAULT_STEREO } from '../core/types.js'
import { TEXT_FONT_SIZE, TEXT_FONT_WEIGHT } from '../cli/scene.js'
import { median, report, runLengths } from '../core/testing/metamorphic.js'
import type { Scene } from '../core/types.js'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')
const canvas = nodeCanvas()

/**
 * `sans-serif`, resolved at **module load**, before any test has run.
 *
 * **This line exists because a mutation survived without it.** Deleting the
 * `vendoredFont()` call from the production `installed` predicate — i.e.
 * removing the only thing that guarantees the registration happens *before* the
 * first resolution that depends on it — broke nothing: the `registration`
 * block below calls `vendoredFont()` explicitly, and vitest runs it before the
 * resolution tests, so the suite was registering the font on the font's behalf
 * and then congratulating it.
 *
 * Captured here instead, where nothing in this file has run yet, so the only
 * thing that can have registered the family is the adapter itself. Importing
 * `./canvas.js` must not be enough on its own either — the registration is
 * deliberately lazy so that a caller who only wants `loadGif` pays nothing —
 * which is exactly why the trigger has to sit on the resolution path.
 *
 * It assumes vitest's default per-file isolation (`pool: 'forks'`,
 * `isolate: true`): in a shared process another file could have registered the
 * family first and this probe would go quiet. That is a property of the runner
 * rather than of the code, so it is stated rather than guarded.
 */
const RESOLVED_AT_IMPORT = resolveFontGenerics('90px sans-serif')

/** Advance width of a string, measured through the adapter core draws on. */
function advance(text: string, font: string): number {
  const ctx = canvas.make(1, 1)
  ctx.font = font
  return ctx.measureText(text).width
}

/** The project's own stroke statistic, on a real rasterisation. */
async function strokeMedian(
  text: string, size: number, weight: string, family?: string,
): Promise<number> {
  const w = Math.round(size * 0.9 * text.length) + 80
  const h = Math.round(size * 1.8)
  const scene: Scene = {
    size: [w, h],
    layers: [{ type: 'text', text, size, weight, at: [20, 10], ...(family ? { font: family } : {}) }],
  }
  const depth = await rasterDepth(scene, 0, canvas)
  return median(runLengths(depth, w, h, 0.5))
}

/* ------------------------------------------------------- the files exist */

describe('the vendored font files', () => {
  it('are in the repository, with their licence, for every declared weight', () => {
    const rows: string[] = []
    for (const weight of VENDORED_WEIGHTS) {
      for (const ext of ['ttf', 'woff2'] as const) {
        const path = resolve(ROOT, vendoredFontPath(weight, ext))
        expect(existsSync(path), path).toBe(true)
        rows.push(`${weight}.${ext}=${statSync(path).size}`)
      }
    }
    // The OFL requires the licence to travel with the font. A missing OFL.txt
    // is a licence violation, not a cosmetic omission, so it is asserted.
    expect(existsSync(resolve(ROOT, 'assets/fonts/OFL.txt'))).toBe(true)
    report('vendored font bytes', rows.join(' '))
  })

  it('are inside the published package, which "files" has to say explicitly', () => {
    // **A mutation survived without this.** `package.json`'s `files` is an
    // allowlist: with only `["dist"]` in it, `npm pack` ships the adapter and
    // not the fonts, so every install warns on first render and silently falls
    // back to the host's sans. Nothing else in the suite looks at the published
    // tarball's shape, and the repository itself stays green either way.
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as
      { files?: string[] }
    const files = pkg.files ?? []
    report('package.json files', files.join(', '))
    const covers = (path: string): boolean =>
      files.some(entry => path === entry || path.startsWith(`${entry}/`))
    for (const weight of VENDORED_WEIGHTS) {
      expect(covers(vendoredFontPath(weight, 'ttf')), `${weight} not published`).toBe(true)
    }
    expect(covers('assets/fonts/OFL.txt')).toBe(true)
  })

  it('are never fetched from a font CDN, at build time or run time', () => {
    // The requirement in one assertion: a build that reaches the network is a
    // build that breaks offline. Checked on the source rather than by watching
    // the network, because a passing network test proves nothing about a
    // machine that has no network.
    //
    // Narrow on purpose: both adapters *do* call `fetch`, for `type: image`
    // and `type: gif` layers whose `src` is a URL, and that is the author's
    // choice rather than a hidden dependency. What must not appear is a
    // reference to a font host — the url() in styles.css is relative, which
    // `site/dist.test.ts` separately asserts of the built bundle.
    const HOSTS = /fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit|cdn\.jsdelivr|unpkg\.com|raw\.githubusercontent\.com/
    const offenders = [
      'src/node/canvas.ts', 'src/web/canvas.ts', 'src/shared/fontspec.ts',
      'site/fonts.ts', 'site/styles.css', 'site/index.html',
      'vite.site.config.ts', 'package.json',
    ].filter(f => HOSTS.test(readFileSync(resolve(ROOT, f), 'utf8')))
    report('files checked for a font-CDN reference', 8)
    expect(offenders).toEqual([])
  })
})

/* ---------------------------------------------------------- registration */

describe('registration', () => {
  it('registered every weight under one family', () => {
    const v = vendoredFont()
    report('vendored font registration', JSON.stringify(v))
    expect(v.problems).toEqual([])
    expect(v.registered).toBe(true)
    expect(v.family).toBe(VENDORED_FAMILY)
    expect(GlobalFonts.has(VENDORED_FAMILY)).toBe(true)
  })

  it('exposes three DISTINCT weights, which is why a real 900 was chosen', () => {
    // The system chain could not do this. DejaVu Sans, Liberation Sans and Noto
    // Sans each declare exactly 400 and 700, so `weight: 900` was synthesised
    // by the rasteriser — which is why one test comparing 900 to bold passed on
    // one machine and failed on another, and why Chromium rendered 900
    // byte-identically to bold while @napi-rs/canvas did not.
    const v = vendoredFont()
    expect([...v.weights].sort((a, b) => a - b)).toEqual([...VENDORED_WEIGHTS])
    for (const system of ['DejaVu Sans', 'Liberation Sans', 'Noto Sans']) {
      if (!GlobalFonts.has(system)) continue
      const weights = (GlobalFonts.families.find(f => f.family === system)?.styles ?? [])
        .map(s => s.weight)
      report(`${system} declares weights`, weights.join(','))
      expect(weights).not.toContain(900)
    }
  })

  it('is memoised, so the registration cannot lose a race with a resolution', () => {
    expect(vendoredFont()).toBe(vendoredFont())
    // And the ordering it guarantees: resolving the generic, which is what
    // `ctx.font = '90px sans-serif'` does, must already see the family.
    expect(resolveFontGenerics('90px sans-serif')).toBe(`90px ${VENDORED_FAMILY}`)
  })

  // Reads `dist/`, so it follows the same policy as `src/core/purity.test.ts`
  // and `site/dist.test.ts`: skipped rather than failed on an unbuilt checkout,
  // because `vitest run` on a clean clone has to be green. CI builds first.
  it.skipIf(!existsSync(resolve(ROOT, 'dist/node/canvas.js')))(
    'happens before a context is handed out, not when a generic is resolved', async () => {
    // **A measured defect, and the dingbat bug wearing a different hat.** A
    // layer naming the vendored family *concretely* never calls
    // `resolveFontGenerics`, so with the registration hung off the resolution
    // path alone nothing triggered it: `90px Staticstereo Sans` measured
    // 367.47px for HELLO — the URW Dingbats advance — against the vendored
    // face's 289.03px. And it was sticky, because `@napi-rs/canvas` caches the
    // font-string → typeface resolution per context: a later `90px sans-serif`
    // resolved to the identical string, hit the poisoned entry, and still
    // measured dingbats.
    //
    // Asserted in a FRESH process, because the whole point is what happens
    // before anything else has registered the family. `vendoredFont()` is
    // memoised per process, so an in-process version of this test can only
    // ever pass.
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const probe = [
      `const {nodeCanvas} = await import(${JSON.stringify(resolve(ROOT, 'dist/node/canvas.js'))});`,
      `const c = nodeCanvas().make(1, 1);`,
      // The first and only font ever set on this context, and it is concrete.
      `c.font = '90px ${VENDORED_FAMILY}';`,
      `process.stdout.write(String(c.measureText('HELLO').width));`,
    ].join('')
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', probe])
    const fresh = Number(stdout)
    const here = advance('HELLO', `90px ${VENDORED_FAMILY}`)
    report('HELLO at 90px, vendored family named concretely in a fresh process', fresh)
    expect(Number.isFinite(fresh)).toBe(true)
    expect(fresh).toBeCloseTo(here, 2)
  })

  it('happens on the resolution path itself, not because a test asked for it', () => {
    // See RESOLVED_AT_IMPORT. The assertion above is satisfied by this very
    // describe block having called `vendoredFont()` first; this one is not.
    report('sans-serif resolved before any test ran', RESOLVED_AT_IMPORT)
    expect(RESOLVED_AT_IMPORT).toBe(`90px ${VENDORED_FAMILY}`)
  })
})

/* ------------------------------------------------- it is the face in use */

describe('the vendored face is what renders, not a system fallback', () => {
  it('is what the default text layer resolves to', () => {
    const ctx = canvas.make(1, 1)
    ctx.font = '90px sans-serif'
    // The getter reports the resolved value — what will actually render.
    expect(ctx.font).toBe(`90px ${VENDORED_FAMILY}`)
  })

  it('measures differently from every system candidate, so we know which we got', () => {
    // Narrow glyphs, where faces differ most; see the table in the header for
    // why `HELLO` and the stroke median are not enough on their own.
    const PROBES = ['III', 'iiiii', '1234567890']
    const SYSTEM = ['DejaVu Sans', 'Liberation Sans', 'Noto Sans']
    const MARGIN = 0.03

    const mine = PROBES.map(p => advance(p, '100px sans-serif'))
    const rows = [`${VENDORED_FAMILY}: ${mine.map(w => w.toFixed(2)).join('/')}`]
    let compared = 0
    for (const family of SYSTEM) {
      if (!GlobalFonts.has(family)) continue
      const theirs = PROBES.map(p => advance(p, `100px ${family}`))
      const worst = Math.max(...theirs.map((w, i) => Math.abs(w - mine[i]!) / mine[i]!))
      rows.push(`${family}: ${theirs.map(w => w.toFixed(2)).join('/')} ` +
        `(furthest ${(worst * 100).toFixed(1)}%)`)
      compared++
      expect(worst, family).toBeGreaterThan(MARGIN)
    }
    report(`advance of ${PROBES.join('/')} at 100px`, rows.join(' | '))
    // The positive control: if no system family were installed, the loop above
    // would assert nothing and this file would pass while blind.
    expect(compared).toBeGreaterThan(0)
  })

  it('and the difference survives the whole pipeline, not just measureText', async () => {
    // Against DejaVu Sans specifically, because that is the family the system
    // chain picks on this host — i.e. this is the comparison between what
    // renders now and what rendered before the fonts were vendored. It is also
    // the weaker of the two discriminators: Noto Sans would tie at 24.
    const vendored = await strokeMedian('STATIC', 150, 'bold')
    const dejavu = await strokeMedian('STATIC', 150, 'bold', 'DejaVu Sans')
    report('median stroke, 150px bold: vendored vs DejaVu Sans', `${vendored} vs ${dejavu}`)
    expect(Math.abs(vendored - dejavu)).toBeGreaterThanOrEqual(2)
  })
})

/* ----------------------------------------------------- the real 900 face */

describe('a real 900 face', () => {
  it('draws measurably heavier than bold through this rasteriser', async () => {
    // Reported as a ratio and asserted only as an inequality with a margin,
    // because the ratio is a property of the vendored file. What must not be
    // true again is 900 == bold, which is what a synthesised weight on a
    // two-weight family gave Chromium.
    const rows: string[] = []
    for (const size of [90, 240]) {
      const bold = await strokeMedian('STATIC', size, 'bold')
      const nine = await strokeMedian('STATIC', size, '900')
      rows.push(`${size}: ${bold}→${nine} (+${Math.round((nine / bold - 1) * 100)}%)`)
      expect(nine).toBeGreaterThan(bold)
    }
    report('median stroke, bold → 900', rows.join(' '))
  })

  it('advances differently at every declared weight, so none of them collapse', () => {
    const widths = VENDORED_WEIGHTS.map(w => advance('HELLO', `${w} 90px sans-serif`))
    report('HELLO advance at 90px by weight',
      VENDORED_WEIGHTS.map((w, i) => `${w}=${widths[i]!.toFixed(2)}`).join(' '))
    expect(new Set(widths).size).toBe(VENDORED_WEIGHTS.length)
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]!).toBeGreaterThan(widths[i - 1]!)
    }
  })
})

/* ------------------------------------------- the two load-bearing numbers */

describe('the numbers the CLI defaults and the README rest on', () => {
  // **The only absolutes pinned anywhere in the suite**, and pinned here rather
  // than in `metamorphic.real.test.ts` because this is the file that knows which
  // face is being measured. Before the font was vendored a pinned stroke width
  // was a test of the runner's fontconfig; now it is a test of three files in
  // this repository, which is a thing a test may legitimately assert.
  //
  // They are pinned because two documented claims depend on them and both have
  // been wrong before:
  //
  //  - `TEXT_FONT_WEIGHT = 'bold'` was approved on the understanding that 90px
  //    bold measures ~18px, i.e. exactly the default disparity budget. **It does
  //    not** — that was DejaVu Sans, the heaviest system fallback. Through the
  //    vendored face it is 14px, still under the budget, and the README and the
  //    `TEXT_FONT_WEIGHT` docblock now say so. If a font upgrade moves it across
  //    18px the documentation becomes wrong, which is what this catches.
  //  - `--font-weight 900` is the lever offered instead, so 90px at 900 clearing
  //    the budget is the one promise the CLI's help text makes about legibility.
  const BUDGET = DEFAULT_STEREO.sepFar - DEFAULT_STEREO.sepNear

  it('90px bold is BELOW the 18px budget, which is why bold alone is not the fix', async () => {
    const bold = await strokeMedian('HELLO', TEXT_FONT_SIZE, TEXT_FONT_WEIGHT)
    const regular = await strokeMedian('HELLO', TEXT_FONT_SIZE, 'normal')
    report(`"HELLO" at ${TEXT_FONT_SIZE}px, budget ${BUDGET}px`,
      `normal=${regular} ${TEXT_FONT_WEIGHT}=${bold}`)
    expect(BUDGET).toBe(18)
    expect(regular).toBe(9)
    expect(bold).toBe(14)
    expect(bold).toBeLessThan(BUDGET)
    // It is still a large improvement on the regular default it replaced, which
    // is the case for making the change at all.
    expect(bold / regular).toBeGreaterThan(1.5)
  })

  it('90px at 900 CLEARS the budget, which is the lever the help text offers', async () => {
    const nine = await strokeMedian('HELLO', TEXT_FONT_SIZE, '900')
    report(`"HELLO" at ${TEXT_FONT_SIZE}px/900 vs budget ${BUDGET}px`, nine)
    expect(nine).toBe(19)
    expect(nine).toBeGreaterThan(BUDGET)
  })
})

/* ------------------------------------------------------- the degradation */

describe('when the vendored face is unavailable', () => {
  it('falls back to the system chain rather than to the generic or a throw', () => {
    // The requirement, as a test: a registration failure must degrade to what
    // this adapter did before the fonts were vendored, not back to dingbats.
    // Reached by telling the resolver the vendored family is not installed —
    // `GlobalFonts.has` is non-writable AND non-configurable, so the injected
    // predicate is the only way to reach this branch on a machine where the
    // registration works.
    const noVendor = (family: string): boolean =>
      family !== VENDORED_FAMILY && GlobalFonts.has(family)
    const resolved = resolveFontGenerics('90px sans-serif', noVendor)
    report('sans-serif without the vendored family', resolved)
    expect(resolved).not.toContain(VENDORED_FAMILY)
    expect(resolved).not.toContain('sans-serif')
    expect(GlobalFonts.has(resolved.replace(/^90px /, ''))).toBe(true)
  })

  it('still throws when NOTHING resolves, so the dingbat path stays closed', () => {
    expect(() => resolveFontGenerics('90px sans-serif', () => false))
      .toThrow(new RegExp(VENDORED_FAMILY))
  })
})
