import { defineConfig } from 'vitest/config'

/**
 * `site/` is included as well as `src/`: the static site's pure logic (the URL
 * hash codec, the untrusted-scene validator, the control reducer, the
 * diagnostics readout) is ordinary unit-testable code and lives outside `src`
 * only so that `tsc -p tsconfig.json` never emits it into `dist`, which
 * `files: ["dist"]` would publish.
 */
export default defineConfig({
  test: { include: ['src/**/*.test.ts', 'site/**/*.test.ts'] },
})
