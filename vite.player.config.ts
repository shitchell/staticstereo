import { defineConfig } from 'vite'

/**
 * The **player** build: `site/player.html` → `dist-player/`.
 *
 * ## Why a sibling config and not a second entry in `vite.site.config.ts`
 *
 * The same discipline that config's own header states — "these two must never
 * become one script" — applied one level down. Two reasons, and the second is
 * the one with teeth:
 *
 *  1. The two outputs have different lifetimes and different consumers. The
 *     site is a page a visitor browses; the player is a component other people
 *     embed in pages we will never see (R14) and that P3 lifts into the editor
 *     shell. A single config that grew a `rollupOptions.input` map would make
 *     every build option — `base`, `target`, `sourcemap`, later a library
 *     mode — a shared decision for two artifacts that have no reason to agree.
 *  2. **"The player bundle" has to be a well-defined set of files.** With two
 *     entries code-split into one directory, a shared chunk belongs to both
 *     and `site/dist.test.ts`'s "no editor code in the player bundle" check
 *     has nothing to point at: the editor's reducer could sit in a chunk the
 *     player also loads and every grep over "the player's files" would be
 *     either wrong or meaningless. Separate `outDir`s make the set exact —
 *     every file under `dist-player/` is the player's, by construction.
 *
 * The cost is one duplicated chunk of `src/core` across the two directories.
 * That is accepted: it is bytes on a deploy, against an assertion that would
 * otherwise be unstateable.
 *
 * ## Both directories are built by `npm run build:site`
 *
 * Not by a `build:player` script of its own. The CI gate runs `typecheck`,
 * `build`, `build:site`, `test` and nothing else, and `dist.test.ts`'s
 * freshness gate treats an absent or stale directory as *not built* rather
 * than as a failure — so a player left to a script CI never calls would make
 * every player assertion skip silently while the suite reported green. The
 * assertion that never ran reads exactly like the one that passed.
 */
export default defineConfig({
  root: 'site',

  /**
   * The single most important line in this file, for the same reason it is in
   * `vite.site.config.ts` — and one more.
   *
   * A GitHub project Page is served from `/<repo>/`, so an absolute
   * `/assets/player.js` resolves against the *user* site root and 404s in
   * production while working perfectly on localhost: the worst failure mode
   * available, because the thing that proves the build is fine is also the
   * thing that cannot see the bug. For the player there is no deployment on
   * which the absolute form is right at all — it is loaded as an `<iframe
   * src>` from pages on hosts we will never see (R14).
   *
   * Observed, not assumed: removing this line makes `dist-player/player.html`
   * reference `/assets/player-<hash>.js` and `/assets/player-<hash>.css`, and
   * the emitted stylesheet reference the three woff2 files the same way.
   * `site/dist.test.ts` asserts all of that against the built output.
   */
  base: './',

  build: {
    outDir: '../dist-player',
    emptyOutDir: true,
    rollupOptions: { input: 'site/player.html' },
    // Matches `vite.site.config.ts` and tsconfig: the renderer needs
    // OffscreenCanvas, which postdates anything that would want ES5.
    target: 'es2022',
    sourcemap: false,
  },
})
