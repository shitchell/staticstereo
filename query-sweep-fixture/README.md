# `query-sweep-fixture/` — the paired control for `site/query.test.ts`'s sweeps

Five files that a **working** sweep must report and a **blind** one must miss. They are
read as text by `site/query.test.ts` and are never imported, compiled, bundled or
typechecked: nothing here is on `tsconfig.typecheck.json`'s `include` (`["src","site"]`),
on `tsconfig.json`'s (`["src"]`), in either vite config's module graph, or in vitest's
collection glob.

It lives in a sibling root directory rather than under `site/` for the same two reasons
`typecheck-fixture/` does, plus one of its own:

- a deliberately-broken file under `site/` would have to be excluded from the real
  sweeps one path at a time, re-opening the hole the sweeps exist to close;
- **`site/dist.test.ts`'s freshness check is mtime-based over `site/` and `src/`**, so a
  fixture under `site/` would mark both dist directories stale and silently skip 24 of
  its 32 registering tests on every local run;
- the planted module here is a *working fourth query parser*. Under `site/` it would be
  a fourth copy of the policy in fact, not only in the sweep's eyes.

| file | what it is there to be |
|---|---|
| `query.ts` | the shared mechanism, carrying the three idioms the policy sweep looks for |
| `editorStore.ts` | lawful: camelCase name, imports the mechanism with **double quotes** |
| `EditorPanel.svelte` | lawful: a `.svelte` module that imports the mechanism |
| `editorShell.ts` | lawful: reaches the mechanism only through a camelCase and a `.svelte` specifier |
| `StrayPanel.svelte` | **the violation**: a fourth parser and a second boolean table in a component |

`StrayPanel.svelte` is the plant. A sweep that cannot open a `.svelte` file reports
`query.ts` alone for all three idioms — a clean bill of health over a directory that
contains a fourth parser — and that null is what the control test pins.
