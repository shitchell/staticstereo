import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
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
const fresh =
  built &&
  newestMtime(filesUnder(DIST)) >=
    newestMtime([
      join(ROOT, 'vite.site.config.ts'),
      // Test files are excluded: editing an assertion does not invalidate a
      // bundle, and including them would make this file invalidate itself.
      ...filesUnder(join(ROOT, 'site')).filter(p => !p.endsWith('.test.ts')),
      ...filesUnder(join(ROOT, 'src')).filter(p => !p.endsWith('.test.ts')),
    ])

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
