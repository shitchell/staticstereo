import { svelte } from '@sveltejs/vite-plugin-svelte'
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
  /**
   * The editor becomes a Svelte 5 app (design §3.1, §3.2); this is the half of
   * that which the *build* needs. The test runner needs its own copy — see
   * `vitest.config.ts`, which this file shares nothing with.
   *
   * **It is registered here and deliberately not in `vite.player.config.ts`.**
   * Svelte exists only in the editor (design §3.2: "the editor imports the
   * player, never the reverse"), and `dist.test.ts` asserts the player bundle
   * carries no editor code. A plugin the player build does not have is the
   * cheapest possible enforcement of that: a `.svelte` import reached from
   * `site/player.ts` does not degrade, it fails the build.
   *
   * **It does not change what this build builds.** There is still no
   * `build.rollupOptions.input` here, so the entry is vite's default
   * `<root>/index.html` — i.e. `site/index.html` — exactly as before. Checked
   * by comparing the emitted file set of `dist-site/` across the change: six
   * files, same names modulo content hash. The plugin only adds a transform
   * for an extension nothing in the graph uses yet.
   */
  plugins: [svelte()],

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
