import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { externalizedImportGuard } from './site/buildguard.js'

/**
 * The **player** build: `site/player.html` → `dist-player/index.html`.
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
 * `build:player` exists as a script (`package.json`) and is what `build:site`
 * delegates to, but **nothing in CI ever calls it directly**: the gate runs
 * `typecheck`, `build`, `build:site`, `test` and nothing else. That is the
 * property with teeth, because `dist.test.ts`'s freshness gate treats an
 * absent or stale directory as *not built* rather than as a failure — so a
 * player reachable only through a script CI never calls would make every
 * player assertion skip silently while the suite reported green. The assertion
 * that never ran reads exactly like the one that passed.
 *
 * ## The entry is emitted as `index.html`, and the source cannot be
 *
 * The player's deliverable is not a bundle, it is a URL a stranger pastes into
 * an `<iframe src>` (R14) — and that URL is the bare directory
 * `/staticstereo/player/`, because the deploy nests this whole directory under
 * the site's (`.github/workflows/pages.yml`). A static host answers a bare
 * directory URL with `index.html` inside it and with nothing else, so an entry
 * emitted as `player.html` is an entry at no usable URL: built, tested,
 * deployed, 404. That was the state of this file until now, and the relative
 * paths `base: './'` guarantees were all correct the whole time — they say
 * where a reference resolves *from the document*, and said nothing about
 * whether the document was reachable.
 *
 * The obvious fix — rename the source to `site/index.html` — is unavailable:
 * `root` is `site`, and `site/index.html` is already the **editor's** entry.
 * So the source keeps its distinguishing name and the *output* is renamed, by
 * {@link directoryIndexEntry} below.
 *
 * ## P3: DO NOT RENAME `site/player.html`, even once that collision is gone
 *
 * P3 lifts the player into the editor shell and reworks `site/index.html`, so
 * the collision above stops being a reason and the rename starts looking like
 * tidying up. It is not: **the output is already `index.html`**, and the
 * source name is this plugin's `from` operand
 * (`directoryIndexEntry('player.html', 'index.html')`). Renaming the source
 * leaves that argument naming a file the bundle no longer contains, and the
 * plugin then does what it is written to do — it **throws**, with "no
 * player.html in the bundle". The build fails rather than silently 404ing,
 * which is the right failure, but it is a build failure whose cause is two
 * files away from its message. One line of warning here, or a confusing
 * afternoon there.
 */

/**
 * Emit the single HTML entry as `index.html` whatever the source is called.
 *
 * Done here, in the build, and deliberately **not** as an `mv` in the deploy
 * workflow. A rename at upload time is a second place where the build's idea
 * of the artifact and the deploy's can disagree — and two places disagreeing
 * is the entire cause of the defect this plugin fixes. Keeping it in the
 * config means `dist-player/` is already the thing that gets published, so
 * every assertion `site/dist.test.ts` makes about the built directory is an
 * assertion about the deployed one.
 *
 * Vite names an HTML output after its input path relative to `root`, with no
 * option to override it: `entryFileNames` governs JS chunks, and the document
 * is emitted as an asset. Renaming the emitted asset is therefore the whole
 * mechanism. It is safe because the name changes but the *depth* does not —
 * both names sit at the top of `dist-player/`, so every `./assets/...`
 * reference `base: './'` produced resolves identically from either.
 *
 * `enforce: 'post'` so this runs after vite's own `vite:build-html`, which is
 * what rewrites the document's references and emits it under the source name.
 * The throw is not defensive padding: if a vite upgrade changed the emitted
 * name, silently doing nothing here would restore the 404 with the suite's
 * production half green.
 */
function directoryIndexEntry(from: string, to: string): Plugin {
  return {
    name: 'staticstereo:directory-index-entry',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const emitted = bundle[from]
      if (!emitted) {
        throw new Error(
          `directoryIndexEntry: no ${from} in the bundle, so the player entry was not ` +
          `renamed to ${to} and the deploy's directory URL will 404. Emitted: ` +
          `${Object.keys(bundle).join(', ')}`,
        )
      }
      if (bundle[to]) {
        throw new Error(`directoryIndexEntry: ${to} already exists; refusing to overwrite it`)
      }
      delete bundle[from]
      emitted.fileName = to
      bundle[to] = emitted
    },
  }
}

export default defineConfig({
  plugins: [directoryIndexEntry('player.html', 'index.html')],

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
   * Observed, not assumed: removing this line makes the emitted entry
   * reference `/assets/player-<hash>.js` and `/assets/player-<hash>.css`, and
   * the emitted stylesheet reference the three woff2 files the same way.
   * `site/dist.test.ts` asserts all of that against the built output.
   */
  base: './',

  build: {
    outDir: '../dist-player',
    emptyOutDir: true,
    /**
     * `onwarn` is the same guard `vite.site.config.ts` installs, and it is here
     * for a measured reason rather than for symmetry: **the player behaves
     * identically to the site on every import form tested** — separate plants,
     * separate builds. A static node import in `site/player.ts` builds to exit
     * 0 and leaves no trace in `dist-player/` exactly as it does for the editor,
     * so the entry that is embedded in other people's pages (R14) would be the
     * one shipping an empty object if only the site config were guarded.
     *
     * See `site/buildguard.ts`. In particular the handler must forward to
     * `defaultHandler` on every non-matching path, or this config quietly loses
     * the missing-dependency failure it has today.
     */
    rollupOptions: {
      input: 'site/player.html',
      onwarn: externalizedImportGuard(dirname(fileURLToPath(import.meta.url))),
    },
    // Matches `vite.site.config.ts` and tsconfig: the renderer needs
    // OffscreenCanvas, which postdates anything that would want ES5.
    target: 'es2022',
    sourcemap: false,
  },
})
