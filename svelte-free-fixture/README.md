# `svelte-free-fixture/` — the paired control for `src/svelte-free.test.ts`

Seven files: **six** that a working scan must report, and one — `clean.ts` — that it must
**not**. A blind scan misses some of the six; a scan that has rotted from parsing into
grepping names the seventh as well, and both failures are pinned exactly rather than as
"found something". They are read
as text by `src/svelte-free.test.ts` and are never imported, compiled, bundled or
typechecked: nothing here is on `tsconfig.typecheck.json`'s `include` (`["src","site"]`),
on `tsconfig.json`'s (`["src"]`), in either vite config's module graph (both are rooted at
`site/`), in vitest's collection glob (`src/**/*.test.ts`, `site/**/*.test.ts`), or in
`package.json`'s `files` (`["dist","assets"]`). No test walks the repository root, so a
new top-level directory is invisible to everything but the test that names it.

It lives in a sibling root directory rather than under `src/`, for the same reason
`typecheck-fixture/` and `query-sweep-fixture/` do, plus the one that is specific to this
guard:

- a deliberately-violating file under `src/` would have to be excluded from the real scan
  one path at a time, re-opening the hole the scan exists to close — and the exclusion
  would then be the thing nothing checks;
- `tsconfig.typecheck.json`'s `exclude: []` is deliberate, so there is nowhere inside
  `src/` or `site/` to put a file the type gate is meant not to open;
- **the whole subject here is "no Svelte under `src/`".** A fixture placed under `src/`
  would be the violation in fact and not only in the scan's eyes, and the invariant would
  be false while the test asserting it was green.

| file | what it is there to be |
|---|---|
| `clean.ts` | lawful, and the one the scan must **not** name: it mentions Svelte in a comment and in a string literal, so a regression from parsing to grepping shows up as an extra entry |
| `App.svelte` | the component the two relative imports point at, and the file the component clause must find |
| `bare.ts` | the package itself, `import { mount } from 'svelte'` |
| `subpath.ts` | a subpath, `import { writable } from 'svelte/store'` |
| `component.ts` | a static component import, `import App from './App.svelte'` |
| `dynamic.ts` | `await import('./App.svelte')` — invisible to a line-anchored `from '…'` regex |
| `required.ts` | `require('svelte')` — invisible to the same regex |

The last two are the discriminating cases. `src/web/index.test.ts`'s `specifiersOf` is two
line-anchored `matchAll`s over `from '…'` and bare `import '…'`, and it reports neither of
them; the AST walk this fixture controls reports both. That is why `src/svelte-free.test.ts`
reuses `importSpecifiers` instead of writing a regex.

It reuses it from **`src/core/testing/imports.ts`**, and specifically **not** from
`src/core/purity.test.ts`, where the function was originally written and where its
self-tests still live. (An earlier revision of this file said the opposite. It was wrong,
and the reason it is wrong is the same reason `imports.ts` exists at all.) Importing a
`.test.ts` registers that file's top-level `describe`s into whichever suite imports it, so
pointing at `purity.test.js` runs its whole suite a second time under
`svelte-free.test.ts`'s name — measured, **14 tests reported where 6 were written**. That
is not merely noisy: a second, silently-renamed copy of another file's assertions is
exactly the kind of count nobody reconciles. `src/core/testing/` is also excluded from
`tsconfig.json`'s build, so the shared helper cannot reach `dist/` — `purity.test.ts`
asserts that no emitted path has a `testing` segment, which a `src/testing/` would have
turned red.
