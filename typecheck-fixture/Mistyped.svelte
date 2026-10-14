<script lang="ts">
  /**
   * The paired control for `npm run typecheck`.
   *
   * A type-checker that cannot be *shown* to fail over `.svelte` is a null
   * measurement: `tsc` with a `declare module '*.svelte'` ambient shim exits 0
   * on this very file without ever opening it, which is the failure this
   * fixture exists to make visible. `site/typecheck-fixture.test.ts` runs the
   * project's own `typecheck` command against this directory and asserts a
   * non-zero exit that *names this file* — so "it names the file" is the half
   * that a shim cannot fake.
   *
   * ## Why it lives outside `src/` and `site/`
   *
   * `tsconfig.typecheck.json`'s `include` is `["src", "site"]` and its
   * `exclude` is deliberately `[]` so that test files are on the typecheck
   * surface. A deliberately-broken file anywhere under those two roots would
   * make `npm run typecheck` red forever, and the only ways out would be to
   * add an exclusion — re-opening the hole this fixture guards, one path at a
   * time — or to stop committing the control at all. A sibling root directory
   * with its own tsconfig is outside both `include`s by construction, needs no
   * exclusion to stay that way, and is reachable only by pointing the checker
   * at it on purpose.
   *
   * The error below must stay a plain assignment mismatch rather than
   * anything Svelte-specific: it is checking that the *TypeScript* surface
   * inside a component is checked, which is the part `tsc` silently drops.
   */
  const deliberatelyMistyped: number = 'this is a type error on purpose'
</script>

<span>{deliberatelyMistyped}</span>
