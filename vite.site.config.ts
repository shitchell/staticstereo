import { defineConfig } from 'vite'

/**
 * The static-site build. **Separate from `npm run build`**, which is `tsc` and
 * produces the published package in `dist/`; these two must never become one
 * script, because `tsc -p tsconfig.json` deliberately does not see `site/` (its
 * `files: ["dist"]` would otherwise publish the page's source).
 *
 * Vite is the bundler. It was already present as an indirect dependency —
 * vitest resolves every import in this repo through it — so the site build and
 * the test suite now share one resolver and one TypeScript transform. That
 * matters more than it sounds: `src/` uses `node16` module resolution and so
 * writes `./render.js` for a file that is `render.ts` on disk, and a bundler
 * that did not perform that same remap would fail on every import in `core`.
 * Choosing anything else here would mean the suite exercising one resolution
 * and production another, which is the shape of the `gifenc` trap this project
 * already has scars from.
 */
export default defineConfig({
  root: 'site',

  /**
   * The single most important line in this file.
   *
   * A GitHub project Page is served from `/<repo>/`, so an absolute
   * `/assets/main.js` resolves against the *user* site root and 404s in
   * production while working perfectly on localhost. `'./'` makes every emitted
   * URL relative to the document. `site/dist.test.ts` asserts it against the
   * built output rather than trusting this comment.
   */
  base: './',

  build: {
    outDir: '../dist-site',
    emptyOutDir: true,
    // Matches tsconfig's target. The site has no legacy-browser story: it needs
    // OffscreenCanvas, which postdates anything that would want ES5.
    target: 'es2022',
    // Off by default: the bundle is small and a source map triples the deploy
    // for no benefit to a visitor. `npm run build:site -- --sourcemap` when
    // actually debugging the deployed page.
    sourcemap: false,
  },
})
