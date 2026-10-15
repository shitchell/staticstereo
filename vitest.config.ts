import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

/**
 * `site/` is included as well as `src/`: the static site's pure logic (the URL
 * hash codec, the untrusted-scene validator, the control reducer, the
 * diagnostics readout) is ordinary unit-testable code and lives outside `src`
 * only so that `tsc -p tsconfig.json` never emits it into `dist`, which
 * `files: ["dist"]` would publish.
 *
 * ## The Svelte plugin is here as well as in `vite.site.config.ts`
 *
 * This file shares nothing with the two build configs — a vitest run loads
 * neither of them — so a component that compiles in the build would be
 * unreachable from a test unless the plugin is registered twice. The duplicate
 * is the price of the split, and `site/svelte-toolchain.test.ts` is what makes
 * the omission of either copy observable instead of silent.
 *
 * `environment` stays unset (vitest's default `node`): design §12 excludes
 * Svelte component DOM from testing, so nothing here mounts a component and no
 * browser environment is needed. Under `node`, vite transforms test modules
 * through its SSR pipeline and the plugin compiles components with
 * `generate: 'server'`, which still runs the real compiler — the property
 * criterion 0 is about.
 *
 * ## No `vitePreprocess()`, and that is measured rather than assumed
 *
 * The plugin exports one, and every third-party recipe passes it. It is not
 * needed: Svelte 5's own compiler strips TypeScript out of `<script lang="ts">`
 * natively. Checked by transforming `site/SvelteSmoke.svelte` — which is
 * `lang="ts"` with a type annotation — through this plugin with no
 * preprocessor and reading the output: the annotation is gone and the module
 * evaluates. Configuration that does nothing is configuration nobody can later
 * tell is load-bearing, so it is left out.
 *
 * The one thing that would bring it back: Svelte's native stripper erases
 * types, it does not *emit* for them, so TS constructs that compile to runtime
 * code — `enum`, `namespace`, constructor parameter properties — are rejected
 * rather than transformed. A component needing one of those needs
 * `vitePreprocess()` (esbuild) here and in `vite.site.config.ts` both.
 */
export default defineConfig({
  plugins: [svelte()],
  test: { include: ['src/**/*.test.ts', 'site/**/*.test.ts'] },
})
