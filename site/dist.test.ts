import { describe, expect, it } from 'vitest'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CLASS_CONTROL,
  CLASS_PLATE,
  CLASS_TRANSPORT,
  CLASS_WRAPPER,
  PLAYER_STYLESHEET,
} from './chromedom.js'

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

/**
 * The source entry and the emitted entry have **different names on purpose**,
 * and the two constants exist so that neither can be mistaken for the other.
 *
 * `site/index.html` is already the editor's entry under the shared
 * `root: 'site'`, so the player's source cannot be called `index.html`. But
 * the *emitted* name is what a URL resolves to, and a static host answers a
 * bare directory URL with `index.html` and with nothing else. Published at
 * `dist-site/player/`, an entry called `player.html` means
 * `/staticstereo/player/` is a 404 — and that bare directory URL is precisely
 * what a human writes into an `<iframe src>`, which is R14's whole purpose.
 * `vite.player.config.ts` closes the gap by renaming the emitted document.
 */
const PLAYER_SOURCE_ENTRY = 'player.html'
const PLAYER_ENTRY = 'index.html'

/**
 * "Did the player build at all", keyed on *any* emitted document rather than
 * on the entry's name — and that distinction is load-bearing rather than
 * defensive.
 *
 * Every block below is `skipIf(!freshPlayer)`. If this flag asked for
 * `index.html` by name, then a regression that renamed the emitted entry back
 * would make the player look *unbuilt*, skip every assertion that exists to
 * catch it, and report green with a trailing "skipped because dist-player is
 * absent". The entry's name is therefore an assertion ("emits its entry as the
 * directory index", below) and never a gate. The phase has already lost one
 * suite to a silent skip — `1130 passed | 20 skipped`, with every
 * Pages-critical check not running — and that is the shape it took.
 */
const builtPlayer =
  existsSync(DIST_PLAYER) && filesUnder(DIST_PLAYER).some(f => f.endsWith('.html'))

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
  const entry = join(DIST_PLAYER, PLAYER_ENTRY)
  // Read defensively rather than at describe-collection time: if the entry is
  // emitted under another name the assertion below is the diagnosis, and a
  // bare ENOENT thrown while collecting this file would bury it.
  const html = freshPlayer && existsSync(entry) ? readFileSync(entry, 'utf8') : ''
  const files = freshPlayer ? filesUnder(DIST_PLAYER) : []

  it('emits its entry as the directory index, not as a named page', () => {
    // The cheap half of the pair whose expensive half is the served-URL block
    // further down. Cheap, but not redundant: this one names the mechanism, so
    // a config change that renames the emitted document fails here with the
    // reason attached rather than only as a 404 three hundred lines later.
    const documents = files.filter(f => f.endsWith('.html')).map(f => relative(DIST_PLAYER, f))
    expect(documents, 'the player build emitted no HTML at all').not.toEqual([])
    expect(
      documents,
      `the player's entry must be emitted as ${PLAYER_ENTRY}: a static host answers the ` +
      `bare directory URL /staticstereo/${PLAYER_DEPLOY_DIR}/ with the directory index and ` +
      `with nothing else, and that URL is the one an embedder writes into an iframe (R14)`,
    ).toContain(PLAYER_ENTRY)
  })

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
    // Deliberately only a floor, and labelled as one. "Some stylesheet" is
    // satisfied by `playerpage.css` alone, so dropping `player.css` — the
    // sheet that gives the transport its `pointer-events` and the wrapper its
    // positioning context — left this green while shipping a control strip
    // that ate every click aimed at the plate. The claim this test used to be
    // mistaken for is asserted properly in the two blocks that follow.
    expect(local.some(r => r.endsWith('.css'))).toBe(true)
  })

  it('emitted the chrome rules, so the sheet is in the BUILD and not just linked', () => {
    /**
     * The strong half of the pair, and the one that survives a rename: it
     * does not care which file the rules came from or what the emitted bundle
     * is called, only that the bytes which make the transport click-through
     * reached the deploy.
     *
     * Measured, which is why it exists: deleting the `player.css` link from
     * `site/player.html` and rebuilding left the entire suite green — 1145
     * passed — with the emitted stylesheet containing **zero**
     * `pointer-events` declarations and none of the `stst-` selectors. What
     * that ships is design §8.2's corrected mistake restored in full: a strip
     * spanning the plate that eats every click aimed at it, and a wrapper
     * that is no longer the overlaid transport's containing block. The only
     * visible symptom is a plate that stopped responding.
     */
    const css = files.filter(f => f.endsWith('.css')).map(f => readFileSync(f, 'utf8')).join('\n')
    expect(css.length, 'no stylesheet was emitted at all').toBeGreaterThan(200)
    for (const cls of [CLASS_WRAPPER, CLASS_PLATE, CLASS_TRANSPORT, CLASS_CONTROL]) {
      expect(css, `.${cls} appears in no emitted stylesheet`).toContain(`.${cls}`)
    }
    // The two declarations the whole arrangement rests on, read out of the
    // deployed bytes rather than out of the source sheet `chromedom.test.ts`
    // reads. Minification-tolerant: it is the selector, a brace, and the
    // declaration, with whatever whitespace esbuild left behind.
    expect(css).toMatch(
      new RegExp(`\\.${CLASS_TRANSPORT}[^{}]*\\{[^}]*pointer-events\\s*:\\s*none`),
    )
    expect(css).toMatch(
      new RegExp(`\\.${CLASS_CONTROL}[^{}]*\\{[^}]*pointer-events\\s*:\\s*auto`),
    )
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

/**
 * The source half of the stylesheet pair, and it needs no build — which is
 * the point of stating it separately. The built check above proves the rules
 * reached the deploy; this proves the *entry* asks for the sheet the renderer
 * names, so the two artifacts cannot drift apart by a rename on either side.
 *
 * `PLAYER_STYLESHEET` is imported rather than typed, so a renamed sheet is a
 * one-line edit in `chromedom.ts` and not a hunt through test files.
 */
describe('the player entry links the renderer’s own stylesheet', () => {
  it('references the file PLAYER_STYLESHEET names', () => {
    const entry = readFileSync(join(ROOT, 'site', PLAYER_SOURCE_ENTRY), 'utf8')
    const refs = assetRefs(entry)
    // Vacuity floor: an entry that referenced nothing, or a regex that
    // stopped matching, must not read as a pass.
    expect(refs.length, 'no asset references found in the entry at all').toBeGreaterThan(1)
    expect(
      refs,
      `site/${PLAYER_SOURCE_ENTRY} does not link ${PLAYER_STYLESHEET}, so the transport ships ` +
      `without its pointer-events and eats every click aimed at the plate (design §8.2)`,
    ).toContain(`./${PLAYER_STYLESHEET}`)
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
/*  the player has a URL, and it is a directory URL                       */
/* ===================================================================== */

/**
 * The subpath a GitHub **project** Page is served from — `<user>.github.io/<repo>/`.
 * Hard-coded rather than derived: it is a fact about the deployment, and the
 * point of the block below is to resolve references against the real prefix
 * rather than against a root the production site never has.
 */
const PAGES_BASE_PATH = '/staticstereo'

/**
 * A static host, in as few rules as it takes to be the one rule that matters.
 *
 * Everything above this point resolves references by joining paths, which
 * cannot see the defect R14 was actually left open by: a path join is happy to
 * find `dist-site/player/player.html` on disk, and a browser asking for
 * `/staticstereo/player/` is not. The gap between "the file is there" and "the
 * URL answers" is the whole of this block, so it is served rather than joined.
 *
 * The directory rule — a path ending in `/` is answered with `index.html`
 * inside it, or with a 404 — is the behaviour of GitHub Pages and of every
 * other static host, and it is deliberately the *only* convenience modelled
 * here. In particular there is **no** `/dir` → `/dir/` redirect: real hosts do
 * issue one, modelling it would make this suite pass for a reason it had not
 * checked, and the slash-terminated form is the one an embed should carry
 * anyway. An embedder who writes the slashless form gets the host's redirect,
 * which is not ours to assert.
 */
interface StaticHost {
  readonly origin: string
  close(): Promise<void>
}

async function serveUploadRoot(root: string, mountedAt: string): Promise<StaticHost> {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://host').pathname)
    const inMount = path === mountedAt || path.startsWith(`${mountedAt}/`)
    // Outside the project's subpath there is nothing at all — which is exactly
    // why an absolute `/assets/...` reference 404s in production while working
    // perfectly on a localhost dev server rooted at `/`.
    if (!inMount) return void res.writeHead(404).end()

    const rest = path.slice(mountedAt.length)
    const file = resolve(root, `.${rest.endsWith('/') || rest === '' ? `${rest}/index.html` : rest}`)
    if (!file.startsWith(resolve(root))) return void res.writeHead(403).end()
    if (!existsSync(file) || statSync(file).isDirectory()) return void res.writeHead(404).end()
    res.writeHead(200).end(readFileSync(file))
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>(done => server.close(() => done())),
  }
}

describe.skipIf(!freshPlayer)('the player answers at the bare directory URL (R14)', () => {
  /**
   * R14's deliverable is not a bundle, it is a URL a stranger can put in an
   * `<iframe src>`. For most of this phase the bundle was correct and the URL
   * did not exist: the entry was emitted as `player.html`, the deploy nested it
   * at `dist-site/player/`, and `/staticstereo/player/` returned a 404 while
   * every assertion in this file — including the nested-path one directly
   * above, which re-resolves each reference at the deploy depth — stayed green.
   * They were all asking whether the files resolve *relative to the document*,
   * and the document was unreachable.
   *
   * So this block asks the other question, the only way it can be asked
   * honestly: stand the deployed tree up behind a static host at the subpath
   * Pages serves it from, request the directory, and follow every reference the
   * response makes as a *URL* resolved against the request's URL rather than as
   * a path joined onto a directory.
   */
  it('serves the player document, its script, its stylesheets and its fonts', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'stst-url-'))
    try {
      const uploadRoot = join(scratch, 'dist-site')
      mkdirSync(uploadRoot, { recursive: true })
      // The deploy, as `.github/workflows/pages.yml` performs it.
      cpSync(DIST_PLAYER, join(uploadRoot, PLAYER_DEPLOY_DIR), { recursive: true })

      const host = await serveUploadRoot(uploadRoot, PAGES_BASE_PATH)
      try {
        const dirUrl = `${host.origin}${PAGES_BASE_PATH}/${PLAYER_DEPLOY_DIR}/`
        const res = await fetch(dirUrl)
        expect(
          res.status,
          `${PAGES_BASE_PATH}/${PLAYER_DEPLOY_DIR}/ does not answer. The player is built, ` +
          `tested and deployed, and the URL an embedder writes into an iframe is a 404 — ` +
          `which is what an entry emitted under any name but ${PLAYER_ENTRY} produces`,
        ).toBe(200)

        const html = await res.text()
        // Not "a document": *the player's* document. A directory index that
        // happened to be the editor, or a host error page, would satisfy a
        // bare 200 and satisfy nothing else. These two ids are the contract
        // `site/player.ts` resolves by `getElementById` and throws without.
        expect(html).toContain('id="player"')
        expect(html).toContain('id="notices"')

        const refs = assetRefs(html).filter(ref => !isExternal(ref))
        expect(refs.length, 'the served document references nothing').toBeGreaterThan(1)

        const sheetUrls: string[] = []
        let scripts = 0
        for (const ref of refs) {
          const url = new URL(ref, dirUrl)
          const asset = await fetch(url)
          expect(asset.status, `${ref} → ${url.pathname}`).toBe(200)
          if (ref.endsWith('.js')) scripts += 1
          if (ref.endsWith('.css')) sheetUrls.push(url.href)
        }
        expect(scripts, 'no script was served, so the page is inert').toBeGreaterThan(0)
        expect(sheetUrls.length, 'no stylesheet was served').toBeGreaterThan(0)

        // The fonts are a directory deeper again and resolved against the
        // *stylesheet's* URL, not the document's — the one hop the HTML half
        // structurally cannot see.
        let fonts = 0
        for (const sheetUrl of sheetUrls) {
          const css = await (await fetch(sheetUrl)).text()
          for (const match of css.matchAll(/url\(\s*['"]?([^'")]+)/g)) {
            const ref = match[1]!
            if (isExternal(ref)) continue
            const url = new URL(ref, sheetUrl)
            expect((await fetch(url)).status, `${sheetUrl}: ${ref}`).toBe(200)
            if (ref.endsWith('.woff2')) fonts += 1
          }
        }
        expect(fonts, 'the three vendored weights are not reachable from the served sheet')
          .toBe(3)

        // The positive control, and it is the production failure mode rather
        // than a synthetic one: take a reference the host just served and ask
        // for its absolute form, the spelling `base: './'` exists to prevent.
        // It must 404 — if it did not, this host would be rooted at `/` like a
        // dev server and every 200 above would prove nothing about Pages.
        const script = refs.find(ref => ref.endsWith('.js'))!
        const absolute = new URL(script.replace(/^\.\//, '/'), host.origin)
        expect(
          (await fetch(absolute)).status,
          `${absolute.pathname} was served, so this host is not modelling a project subpath`,
        ).toBe(404)
        // ...and a name that was never emitted, so a host answering 200 to
        // everything cannot pass either.
        expect((await fetch(new URL('definitely-not-emitted.js', dirUrl))).status).toBe(404)
      } finally {
        await host.close()
      }
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
 * Every one was checked for uniqueness by grepping the whole repository, and
 * the honest statement of the result is narrower than the one this docblock
 * used to make. It said each needle "occurs in its own editor-only module
 * and at most in that module's test, and nowhere else". That is true of six
 * of the eight; `STATIC ON THE STEREO` also appears in
 * `examples/scrolling-text.yaml` and in `docs/plans/`'s design document.
 *
 * The assertions are unaffected and no needle needs replacing: what matters
 * is not that a literal is unique in the repository but that it is unique in
 * what gets **bundled**, and neither a YAML example nor a planning document
 * is an input to either vite build. The claim was simply broader than the
 * fact, which is worth correcting rather than leaving for the next person to
 * discover and distrust.
 *
 * Identifiers were deliberately avoided — they are renamed by minification —
 * which is why the needles are prose fragments rather than function names,
 * even where the fragment names a function inside a message.
 *
 * ## Tree-shaking, and why each needle is in a *principal* export
 *
 * A string-literal grep proves the **function holding the literal** did not
 * reach the bundle, which is weaker than "the module did not": rollup drops
 * the rest of a module when one export is imported. Measured, while this was
 * being written: planting `import { periodWindow } from './diagnostics.js'`
 * in `site/player.ts` left `describeReadout`'s prose out of `dist-player/`
 * entirely, so a needle taken from that function would have missed a real
 * leak. Each needle below therefore sits in the argument guard, or the body,
 * of an export the editor actually imports the module *for* — `readSegment`,
 * `measureInk`, `stageGuideStyle`, `depthToRgba`, `reduce`.
 *
 * **A module-level constant does not qualify, and this file used to say it
 * did.** The mitigation above originally read "either in a module-level
 * constant (`examples.ts`, `controls.ts`) or in the argument guard of …",
 * which is wrong in exactly the way it was trying to guard against: rollup
 * shakes an unreferenced constant away precisely as it shakes an unreferenced
 * function away. Measured — plant `import { reduce } from './controls.js'`
 * in `site/player.ts`, use it, and rebuild: the editor's whole reducer is in
 * `dist-player/`, `CUSTOM_TRACK`'s `(custom track)` is **not** (nothing
 * reachable from `reduce` refers to it; only `presetNote` and `site/main.ts`
 * do), and the suite reports 50 files, 1147 passed. The criterion named the
 * reducer by name and the needle meant to cover it covered `presetNote`
 * instead. `(custom track)` is kept — it is still a true statement about the
 * preset notes — and `set an animator`, which is inside `reduce`'s own
 * `layerAnim` arm, is what covers the reducer.
 *
 * The same limitation applies to the `yuv444p` probe above and is inherent to
 * the technique, not to this list: a needle proves something about the
 * *function holding it*, so it has to be chosen from the code you actually
 * mean to exclude, and "the module it lives in" is not a safe proxy.
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
  // `CUSTOM_TRACK`, the sentinel `presetNote` prints for a hand-written
  // track. NOT the reducer's — that attribution was the error the docblock
  // above records, and it is the needle below that covers `reduce`. Kept
  // because it is still true of `presetNote`, which the player also has no
  // business carrying.
  { needle: '(custom track)', source: 'site/controls.ts' },
  // `reduce`'s own `layerAnim` arm — the third argument of its `requireLayer`
  // call, so it is inside the editor reducer's body rather than merely in the
  // same file. This is the needle the criterion actually asked for.
  // `controls.ts` also re-exports the frame grid, which the player *does*
  // need — it gets it from `site/transport.ts` instead, and this is what
  // proves it did not take the reducer along with it.
  { needle: 'set an animator', source: 'site/controls.ts' },
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
    expect(EDITOR_NEEDLES.length).toBeGreaterThanOrEqual(8)
    // Needles are distinct, which is what the source-uniqueness check used to
    // stand in for. It is no longer the same statement: `controls.ts` now
    // carries two, one for `presetNote` and one for `reduce`, because a
    // needle covers the *function* holding it rather than the module. So the
    // two claims are made separately — no duplicate needles, and still a
    // needle for every editor-only module.
    expect(new Set(EDITOR_NEEDLES.map(n => n.needle)).size).toBe(EDITOR_NEEDLES.length)
    expect(new Set(EDITOR_NEEDLES.map(n => n.source)).size).toBeGreaterThanOrEqual(7)
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
