import { describe, expect, it } from 'vitest'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Assertions about the **built** site, mirroring `src/core/purity.test.ts`.
 *
 * Two classes of failure are being guarded, and both are invisible in
 * development:
 *
 * 1. **An absolute asset path.** A GitHub project Page is served from
 *    `/staticstereo/`, so `/assets/index.js` resolves against the user site
 *    root. It works on localhost and 404s in production, which is the worst
 *    available failure mode: the thing that proves the build is fine is also
 *    the thing that cannot see the bug.
 * 2. **Node-only code reaching the browser bundle.** `src/core/purity.test.ts`
 *    proves `dist/core` imports nothing non-relative, and `src/web/index.test.ts`
 *    proves the web adapter's source graph is browser-safe, but neither looks at
 *    what the *site* entry pulls in — the site could import `staticstereo/node`
 *    directly and both would stay green.
 *
 * The leak probe greps for `yuv444p` rather than for `@napi-rs`. That is on
 * purpose and it is the lesson `purity.test.ts` records: `@napi-rs` appears in
 * prose in several `core` docblocks, so matching it depends on the minifier
 * having stripped comments — a true-today, silently-wrong-tomorrow test.
 * `yuv444p` is a string *literal*, it exists only in `src/node/encode.ts` and
 * `src/cli/args.ts`, and it survives minification, so its absence is real
 * evidence and its presence would be a real leak. The `@napi-rs` and `node:`
 * checks are kept as well, but as the weaker belt to that braces.
 */

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const DIST = join(ROOT, 'dist-site')
const built = existsSync(join(DIST, 'index.html'))

/**
 * The player's own output directory, built by `vite.player.config.ts`.
 *
 * **A sibling directory, not a second rollup entry into `dist-site/`.** With
 * two entries code-split into one directory "the player bundle" stops being a
 * well-defined set of files — a shared chunk belongs to both — and the
 * no-editor-code assertion below would have nothing to point at. Two
 * directories make the set exact: every file under here is the player's.
 */
const DIST_PLAYER = join(ROOT, 'dist-player')
const PLAYER_ENTRY = 'player.html'
const builtPlayer = existsSync(join(DIST_PLAYER, PLAYER_ENTRY))

function filesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...filesUnder(path))
    else out.push(path)
  }
  return out
}

function newestMtime(paths: string[]): number {
  let newest = 0
  for (const path of paths) newest = Math.max(newest, statSync(path).mtimeMs)
  return newest
}

/**
 * Existing output is only evidence if it was built from the *current* sources.
 *
 * A failed `vite build` leaves the previous good `dist-site/` on disk, so every
 * grep below keeps passing against a bundle that no longer corresponds to
 * anything. That is not hypothetical: adding `import { nodeCanvas } from
 * '../src/node/index.js'` to `site/main.ts` makes the build exit 1 (rollup
 * reaches the native `skia.*.node` binary and reports `Unexpected character
 * '\u{7f}'`) — and this file was observed reporting "7 passed" for that exact
 * tree, because it was reading the output of the build *before* it.
 *
 * A stale tree is therefore treated as *not built* rather than as a failure,
 * matching the policy below that `vitest run` on a clean checkout is green.
 * The real enforcement is CI, which builds immediately before testing.
 */
function newerThanSources(dir: string, config: string): boolean {
  return (
    newestMtime(filesUnder(dir)) >=
    newestMtime([
      join(ROOT, config),
      // Test files are excluded: editing an assertion does not invalidate a
      // bundle, and including them would make this file invalidate itself.
      ...filesUnder(join(ROOT, 'site')).filter(p => !p.endsWith('.test.ts')),
      ...filesUnder(join(ROOT, 'src')).filter(p => !p.endsWith('.test.ts')),
    ])
  )
}

const fresh = built && newerThanSources(DIST, 'vite.site.config.ts')

/**
 * The same gate for the player, and it has to be the same *kind* of gate.
 *
 * The player directory is the one a mistake hides in most easily: if
 * `npm run build:site` built only `dist-site/`, this would be absent or stale
 * on every machine, every block below would skip, and the suite would still
 * report green — a no-editor-code check that never ran reads exactly like one
 * that passed. That is why `build:site` builds both rather than leaving the
 * player to a script CI never calls, and why the skip message below names
 * `dist-player` specifically: a silent skip has to be legible in the output.
 */
const freshPlayer = builtPlayer && newerThanSources(DIST_PLAYER, 'vite.player.config.ts')

/** Every `src=` / `href=` value in the document. */
function assetRefs(html: string): string[] {
  return [...html.matchAll(/(?:src|href)="([^"]*)"/g)].map(m => m[1]!)
}

const isExternal = (ref: string): boolean =>
  /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|mailto:)/i.test(ref)

describe.skipIf(!fresh)('the built site', () => {
  const html = fresh ? readFileSync(join(DIST, 'index.html'), 'utf8') : ''
  const files = fresh ? filesUnder(DIST) : []

  it('references no asset by an absolute path', () => {
    const absolute = assetRefs(html).filter(ref => ref.startsWith('/'))
    expect(absolute).toEqual([])
  })

  it('resolves every local asset reference to a file that exists', () => {
    // Necessary as well as the rule above: `base: './'` could be right and the
    // reference still broken, and a bare `assets/x.js` with no `./` would pass
    // the absolute-path check while being relative to the wrong thing once the
    // page is served from a directory URL without a trailing slash.
    const local = assetRefs(html).filter(ref => !isExternal(ref))
    expect(local.length).toBeGreaterThan(0)
    const missing = local.filter(ref => {
      if (!ref.startsWith('./')) return true
      return !existsSync(join(DIST, ref.slice(2)))
    })
    expect(missing).toEqual([])
  })

  it('references at least one script and one stylesheet, so the greps are not vacuous', () => {
    const local = assetRefs(html).filter(ref => !isExternal(ref))
    expect(local.some(r => r.endsWith('.js'))).toBe(true)
    expect(local.some(r => r.endsWith('.css'))).toBe(true)
  })

  it('uses no root-relative URL in its CSS either', () => {
    for (const file of files.filter(f => f.endsWith('.css'))) {
      const urls = [...readFileSync(file, 'utf8').matchAll(/url\(\s*['"]?([^'")]+)/g)]
        .map(m => m[1]!)
        .filter(u => u.startsWith('/'))
      expect(urls, relative(ROOT, file)).toEqual([])
    }
  })

  it('contains no code from src/node or src/cli', () => {
    const leaks = files.filter(f => readFileSync(f, 'utf8').includes('yuv444p'))
    expect(leaks.map(f => relative(ROOT, f))).toEqual([])
  })

  it('contains no reference to @napi-rs or a node: builtin', () => {
    const offenders: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const needle of ['@napi-rs', 'node:fs', 'node:path', 'node:child_process', 'node:url']) {
        if (text.includes(needle)) offenders.push(`${relative(ROOT, file)}: ${needle}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('bundled the vendored woff2 for every weight, with a relative url', () => {
    // The site's whole claim to agreeing with `stst` rests on these three
    // files reaching the deploy. `site/fonts.test.ts` proves the @font-face
    // rules name them; this proves vite emitted them and rewrote the urls
    // *relatively*, which the generic root-relative check above cannot see
    // because it would also pass for a stylesheet with no url() at all.
    const woff2 = files.filter(f => f.endsWith('.woff2'))
    expect(woff2).toHaveLength(3)
    const bytes = woff2.reduce((a, f) => a + statSync(f).size, 0)
    // Reported as an assertion with room, not pinned: the number is the tax a
    // visitor pays, and it should fail loudly if a font upgrade triples it.
    expect(bytes).toBeGreaterThan(30_000)
    expect(bytes).toBeLessThan(120_000)

    const cssText = files.filter(f => f.endsWith('.css'))
      .map(f => readFileSync(f, 'utf8')).join('\n')
    const urls = [...cssText.matchAll(/url\(\s*['"]?([^'")]+)/g)].map(m => m[1]!)
      .filter(u => u.endsWith('.woff2'))
    expect(urls).toHaveLength(3)
    for (const url of urls) {
      expect(url.startsWith('./')).toBe(true)
      expect(existsSync(join(DIST, 'assets', url.slice(2)))).toBe(true)
    }
  })

  it('really did bundle core and the GIF encoder', () => {
    // The positive control for every grep above. Without it a build that
    // emitted an empty bundle would pass all of them.
    const js = files.filter(f => f.endsWith('.js'))
    expect(js.length).toBeGreaterThan(0)
    const text = js.map(f => readFileSync(f, 'utf8')).join('\n')
    expect(text.length).toBeGreaterThan(10_000)
    // resolveStereo's own wording — proves `src/core` is in there.
    expect(text).toContain('depth budget')
    // The gifenc interop shim's probe target — proves the encoder is in there
    // and that the shim, not a raw default import, is what reached the bundle.
    expect(text).toContain('applyPalette')
    expect(js.some(f => statSync(f).size > 10_000)).toBe(true)
  })
})

/* ===================================================================== */
/*  the player bundle                                                     */
/* ===================================================================== */

describe.skipIf(!freshPlayer)('the built player', () => {
  const html = freshPlayer ? readFileSync(join(DIST_PLAYER, PLAYER_ENTRY), 'utf8') : ''
  const files = freshPlayer ? filesUnder(DIST_PLAYER) : []

  it('references no asset by an absolute path', () => {
    // Same reason as the site, and the player needs it more: it is designed to
    // be loaded as an `<iframe src>` from a page on a host we will never see
    // (R14), so there is no deployment path on which a leading slash is right.
    const absolute = assetRefs(html).filter(ref => ref.startsWith('/'))
    expect(absolute).toEqual([])
  })

  it('resolves every local asset reference to a file that exists', () => {
    const local = assetRefs(html).filter(ref => !isExternal(ref))
    expect(local.length).toBeGreaterThan(0)
    const missing = local.filter(ref => {
      if (!ref.startsWith('./')) return true
      return !existsSync(join(DIST_PLAYER, ref.slice(2)))
    })
    expect(missing).toEqual([])
  })

  it('references a script and a stylesheet, so the greps are not vacuous', () => {
    const local = assetRefs(html).filter(ref => !isExternal(ref))
    expect(local.some(r => r.endsWith('.js'))).toBe(true)
    // The stylesheet half is not decoration: `site/player.css` is what gives
    // the transport its `pointer-events` and the wrapper its positioning
    // context, and a build that dropped it would still render a plate.
    expect(local.some(r => r.endsWith('.css'))).toBe(true)
  })

  it('uses no root-relative URL in its CSS either', () => {
    for (const file of files.filter(f => f.endsWith('.css'))) {
      const urls = [...readFileSync(file, 'utf8').matchAll(/url\(\s*['"]?([^'")]+)/g)]
        .map(m => m[1]!)
        .filter(u => u.startsWith('/'))
      expect(urls, relative(ROOT, file)).toEqual([])
    }
  })

  it('emitted a non-trivial script, so an empty build cannot pass', () => {
    // The positive control for every grep above, and the floor the acceptance
    // criterion asks for: a failed or empty build leaves an HTML file that
    // satisfies all four checks above by containing nothing to violate them.
    const js = files.filter(f => f.endsWith('.js'))
    expect(js.length).toBeGreaterThan(0)
    const text = js.map(f => readFileSync(f, 'utf8')).join('\n')
    expect(text.length).toBeGreaterThan(10_000)
    // `resolveStereo`'s own wording — the player really did bundle `src/core`,
    // which is the only thing that can draw a plate.
    expect(text).toContain('depth budget')
  })

  it('contains no code from src/node or src/cli', () => {
    const leaks = files.filter(f => readFileSync(f, 'utf8').includes('yuv444p'))
    expect(leaks.map(f => relative(ROOT, f))).toEqual([])
  })
})

/* ===================================================================== */
/*  deployment: a built player that reaches no URL has not shipped        */
/* ===================================================================== */

/**
 * Everything above proves the player *builds* correctly. Nothing above proves
 * it is ever *published*, and for most of this phase it was not: `build:site`
 * emitted `dist-site/` and `dist-player/`, every assertion in this file ran
 * against both, and `.github/workflows/pages.yml` uploaded only the first. A
 * component whose stated purpose is to be loaded as an `<iframe src>` by a
 * host we will never see (R14) existed at no URL at all, with the whole suite
 * green — the exact shape of failure this file exists to catch, one level up
 * from the bundle.
 *
 * GitHub Pages publishes exactly one artifact, so the player has to be nested
 * inside the site's directory rather than uploaded beside it. The two checks
 * below are the two halves of that being true: the workflow does the nesting,
 * and the nesting does not break the player.
 */
const WORKFLOW = join(ROOT, '.github', 'workflows', 'pages.yml')
/** Where the workflow is required to put the player, relative to the upload root. */
const PLAYER_DEPLOY_DIR = 'player'

describe('the Pages workflow publishes the player, not only the page', () => {
  const workflow = readFileSync(WORKFLOW, 'utf8')
  /** Every `run:` command in the workflow, as one string each. */
  const runs = [...workflow.matchAll(/^[\s-]*run:\s*(.+)$/gm)].map(m => m[1]!.trim())

  it('parsed the workflow, rather than matching nothing and passing', () => {
    // The vacuity floor. Every assertion below is a search over `runs`, and a
    // regex that stopped matching would make the *ordering* check below pass
    // for the worst possible reason.
    expect(runs.length).toBeGreaterThanOrEqual(5)
    expect(runs).toContain('npm test')
    expect(runs).toContain('npm run build:site')
  })

  it('uploads exactly one directory, so nesting is the only way the player ships', () => {
    // Stated as an assertion rather than as prose because it is the premise of
    // the next one: if a second artifact ever became possible, nesting would
    // stop being forced and this whole block would be arguing for a
    // constraint that no longer exists.
    const paths = [...workflow.matchAll(/^\s*path:\s*(\S+)\s*$/gm)].map(m => m[1]!)
    expect(paths).toEqual(['dist-site'])
  })

  it('copies the player output underneath that directory', () => {
    // Matched on the two path operands and not on `cp -r`: `rsync`, `mv`, or a
    // `mkdir -p` first are all equally correct, and a guard that pins one
    // spelling of a copy would go red for a change that fixed nothing.
    const nesting = runs.filter(
      r => r.includes('dist-player') && r.includes(`dist-site/${PLAYER_DEPLOY_DIR}`),
    )
    expect(
      nesting,
      'no step in pages.yml puts dist-player/ inside dist-site/, so the player is built, ' +
      'tested, and then published at no URL',
    ).not.toEqual([])
  })

  it('does the nesting after the suite, which is not a matter of taste', () => {
    // `dist-site/` is asserted above to carry exactly three woff2 files. The
    // player ships the same three, so a copy that happened before `npm test`
    // would make it six and turn a correct build red — and, less visibly, it
    // would break the premise the no-editor-code check rests on, that every
    // file under the player's directory is the player's by construction.
    const index = (needle: string): number => runs.findIndex(r => r.includes(needle))
    const suite = index('npm test')
    const nest = index(`dist-site/${PLAYER_DEPLOY_DIR}`)
    expect(suite).toBeGreaterThanOrEqual(0)
    expect(nest).toBeGreaterThan(suite)
    // ...and the upload is a `uses:`, not a `run:`, so it is located in the
    // raw text instead.
    expect(workflow.indexOf('upload-pages-artifact')).toBeGreaterThan(
      workflow.indexOf(`dist-site/${PLAYER_DEPLOY_DIR}`),
    )
  })
})

describe.skipIf(!freshPlayer)('the player still resolves once nested a directory deeper', () => {
  /**
   * `base: './'` is what makes the nesting safe, and this is the assertion
   * that makes "safe" a measurement rather than a belief. The flat checks
   * above resolve `./assets/x.js` against `dist-player/`; published, the same
   * reference resolves against `dist-site/player/`. Those agree only because
   * every reference is relative to its own document, which is exactly the
   * property an absolute path destroys — so the test materialises the real
   * deployed layout and re-resolves against it.
   */
  it('resolves every local reference, in the HTML and in the CSS, at the deploy path', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'stst-pages-'))
    try {
      const uploadRoot = join(scratch, 'dist-site')
      const deployed = join(uploadRoot, PLAYER_DEPLOY_DIR)
      cpSync(DIST_PLAYER, deployed, { recursive: true })

      const html = readFileSync(join(deployed, PLAYER_ENTRY), 'utf8')
      const local = assetRefs(html).filter(ref => !isExternal(ref))
      expect(local.length).toBeGreaterThan(0)
      const missing = local.filter(
        ref => !ref.startsWith('./') || !existsSync(join(deployed, ref.slice(2))),
      )
      expect(missing, 'references that do not resolve under dist-site/player/').toEqual([])

      // The CSS half, which the HTML half cannot see: the woff2 urls were
      // rewritten by vite relative to the *stylesheet*, one directory deeper
      // again. A root-relative rewrite here would 404 under the subpath while
      // every reference in the document still resolved.
      const sheets = filesUnder(deployed).filter(f => f.endsWith('.css'))
      expect(sheets.length).toBeGreaterThan(0)
      const urls: string[] = []
      for (const sheet of sheets) {
        for (const match of readFileSync(sheet, 'utf8').matchAll(/url\(\s*['"]?([^'")]+)/g)) {
          const url = match[1]!
          if (isExternal(url)) continue
          urls.push(url)
          expect(existsSync(resolve(dirname(sheet), url)), `${relative(deployed, sheet)}: ${url}`)
            .toBe(true)
        }
      }
      expect(urls.length, 'no url() found — the fonts stopped being referenced').toBe(3)

      // The positive control, run at the nested path so it proves the
      // predicate *there*: an absolute reference is caught rather than
      // silently resolved against the scratch root.
      const absolute = ['/assets/player.js', 'assets/player.js'].filter(
        ref => !ref.startsWith('./') || !existsSync(join(deployed, ref.slice(2))),
      )
      expect(absolute).toHaveLength(2)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})

/* ===================================================================== */
/*  no editor code in the player bundle (design §3.2, R14)                */
/* ===================================================================== */

/**
 * A string-literal grep, in the spirit of the `yuv444p` probe above — and for
 * exactly its recorded reason. `purity.test.ts` chose `yuv444p` over `@napi-rs`
 * because the latter "appears in prose in several `core` docblocks", so
 * matching it only works while the minifier happens to strip comments: true
 * today, silently wrong tomorrow. Each needle below is therefore a **runtime
 * string literal** — an error message, a label, a caption — that esbuild
 * carries into the bundle verbatim and that a comment rewrite cannot forge.
 *
 * Every one was checked for uniqueness by grepping all of `src/` and `site/`:
 * it occurs in its own editor-only module and at most in that module's test,
 * and nowhere else. Identifiers were deliberately avoided — they are renamed
 * by minification — which is why the needles are prose fragments rather than
 * function names, even where the fragment names a function inside a message.
 *
 * ## Tree-shaking, and why each needle is in a *principal* export
 *
 * A string-literal grep proves the **function holding the literal** did not
 * reach the bundle, which is weaker than "the module did not": rollup drops
 * the rest of a module when one export is imported. Measured, while this was
 * being written: planting `import { periodWindow } from './diagnostics.js'`
 * in `site/player.ts` left `describeReadout`'s prose out of `dist-player/`
 * entirely, so a needle taken from that function would have missed a real
 * leak. Each needle below therefore sits either in a module-level constant
 * (`examples.ts`, `controls.ts`) or in the argument guard of the export the
 * editor actually imports the module *for* — `readSegment`, `measureInk`,
 * `stageGuideStyle`, `depthToRgba`. The same limitation applies to the
 * `yuv444p` probe above and is inherent to the technique, not to this list.
 *
 * ## Two-sided, and the second side is not optional
 *
 * A bare absence check passes when the grep itself is broken — a changed
 * extension filter, a directory that moved, a needle that no longer exists
 * anywhere. The presence half against `dist-site/` is the positive control for
 * the machinery, and it is free: `npm run build:site` builds both directories
 * in one command, so the editor bundle is always there to be matched.
 *
 * ## The limitation, stated here because it is a P3 criterion
 *
 * This tests against **today's** editor — `site/main.ts` and the modules it
 * pulls in — and today that editor is real, imported by `dist-site/`'s entry,
 * and genuinely absent from the player's, so the check bites. It does **not**
 * test against P3's Svelte editor, which does not exist yet. When P3 lands,
 * two things must happen or this file quietly becomes the tautology the
 * execution plan warned it would be:
 *
 *  1. extend {@link EDITOR_NEEDLES} with literals from the Svelte editor's own
 *     components and store — not from the modules below, which P3 deletes; and
 *  2. re-run the **presence** half against whatever the editor bundle becomes,
 *     since a renamed output directory or an inlined entry would make every
 *     needle absent from both sides and turn the absence half green for the
 *     worst possible reason.
 */
interface EditorNeedle {
  /** The literal to grep for. */
  readonly needle: string
  /** The editor-only module it lives in, for the failure message. */
  readonly source: string
}

const EDITOR_NEEDLES: readonly EditorNeedle[] = [
  // `drawStereo`'s context guard. The player has its own canvas and its own
  // wording, so this sentence belongs to the editor alone.
  { needle: 'the stereogram canvas has no 2d context', source: 'site/main.ts' },
  // `depthToRgba`'s buffer-size guard. The depth panel is the editor's whole
  // debugging story and the player must not carry it.
  { needle: 'depthToRgba: a ', source: 'site/depthmap.ts' },
  // `readSegment`'s row-bounds guard — the diagnostics band's entry point.
  { needle: 'is outside a frame of height', source: 'site/diagnostics.ts' },
  // `measureInk`'s argument guard.
  { needle: 'measureInk: the ink fraction must be in (0, 1], got', source: 'site/legibility.ts' },
  // `stageGuideStyle`'s degenerate-frame guard.
  { needle: 'stageGuideStyle: the frame has no area (', source: 'site/stageguide.ts' },
  // The caption of one of the bundled examples — the example gallery is an
  // authoring affordance with no meaning in an embed.
  { needle: 'STATIC ON THE STEREO', source: 'site/examples.ts' },
  // `CUSTOM_TRACK`, the editor reducer's sentinel for a hand-written track.
  // `controls.ts` also re-exports the frame grid, which the player *does*
  // need — it gets it from `site/transport.ts` instead, and this needle is
  // what proves it did not take the reducer along with it.
  { needle: '(custom track)', source: 'site/controls.ts' },
]

/** Which files under `dir` contain `needle`, as repo-relative paths. */
function filesContaining(dir: string, needle: string): string[] {
  return filesUnder(dir)
    .filter(f => readFileSync(f, 'utf8').includes(needle))
    .map(f => relative(ROOT, f))
}

describe.skipIf(!fresh || !freshPlayer)('the player ships no editor code', () => {
  it('has enough needles to be worth asserting', () => {
    // The vacuity floor. Every assertion below is a `for` over this list, so
    // an empty or accidentally-filtered list would pass all of them in
    // silence. The floor is the real count, with no slack: a needle deleted
    // because its message was reworded has to be replaced, not dropped.
    expect(EDITOR_NEEDLES.length).toBeGreaterThanOrEqual(7)
    expect(new Set(EDITOR_NEEDLES.map(n => n.source)).size).toBe(EDITOR_NEEDLES.length)
  })

  it('finds every needle in the editor bundle — the grep works', () => {
    for (const { needle, source } of EDITOR_NEEDLES) {
      expect(
        filesContaining(DIST, needle),
        `${JSON.stringify(needle)} (${source}) is in no file under dist-site/, so the ` +
        `absence check for it proves nothing — the literal was reworded, or the editor ` +
        `bundle no longer contains ${source}`,
      ).not.toEqual([])
    }
  })

  it('finds none of them in the player bundle', () => {
    for (const { needle, source } of EDITOR_NEEDLES) {
      expect(
        filesContaining(DIST_PLAYER, needle),
        `${JSON.stringify(needle)} reached the player bundle, so ${source} is in it. ` +
        `An embedded stereogram must not ship a timeline editor (R14, design §3.2).`,
      ).toEqual([])
    }
  })

  it('would catch a planted needle in the player directory', () => {
    // The positive control for the *absence* half, which is the half that can
    // pass for the wrong reason: a predicate that reads the wrong directory,
    // or filters every file out, reports "clean" forever. So plant a file in
    // the real output directory, with the real needle, and require the real
    // predicate to see it.
    const planted = join(DIST_PLAYER, '__planted-editor-needle.js')
    const needle = EDITOR_NEEDLES[0]!.needle
    try {
      writeFileSync(planted, `console.log(${JSON.stringify(needle)})\n`)
      expect(filesContaining(DIST_PLAYER, needle))
        .toContain(relative(ROOT, planted))
    } finally {
      rmSync(planted, { force: true })
    }
    // ...and it is gone again, so the directory this suite asserts over is
    // exactly the one the build produced.
    expect(filesContaining(DIST_PLAYER, needle)).toEqual([])
  })
})

if (!freshPlayer) {
  it(
    builtPlayer
      ? 'skipped the built-player checks because dist-player is older than site/ or src/'
      : 'skipped the built-player checks because dist-player is absent',
    () => {
      // Same policy as `dist-site` below: a clean checkout is green, and CI —
      // which runs `npm run build:site`, the script that builds *both*
      // directories — is where these actually gate.
      expect(freshPlayer).toBe(false)
    },
  )
}

if (!fresh) {
  it(
    built
      ? 'skipped the built-site checks because dist-site is older than site/ or src/'
      : 'skipped the built-site checks because dist-site is absent',
    () => {
      // Not a failure: `vitest run` on a clean checkout must be green. Run
      // `npm run build:site` first to exercise the checks above — CI does
      // exactly that, which is the only place they are actually enforced.
      expect(fresh).toBe(false)
    },
  )
}
