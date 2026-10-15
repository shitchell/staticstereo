<script lang="ts">
  /**
   * The toolchain probe. **Not a UI component** — no page imports it and
   * nothing mounts it; its only consumer is
   * `site/svelte-toolchain.test.ts`, which needs a real `.svelte` file to put
   * through the compiler.
   *
   * Because no page imports it, it is **not in the site build's module
   * graph**, so `npm run build:site` compiles it only in the sense that the
   * plugin is registered and the extension is handled. Putting it in the
   * graph means importing it from `site/main.ts`, which P3b owns and P3a must
   * not touch. That half was measured rather than committed — see the commit
   * that added this file.
   *
   * Three things about it are deliberate:
   *
   *  - **`$props()` is a Svelte 5 rune.** A Svelte 4 compiler reads `$props`
   *    as a store auto-subscription and errors on the call, so a build that
   *    succeeds here is evidence the installed compiler is 5.x and not merely
   *    "some Svelte". The probe therefore pins the *major* the design asks for
   *    (design §3.1, execution plan P3 criterion 0), not just the file type.
   *  - **`lang="ts"` is load-bearing.** Every component this editor will grow
   *    is TypeScript, and TS inside a `.svelte` script block is a *separate*
   *    capability from compiling `.svelte` at all. It turns out Svelte 5
   *    strips types itself with no preprocessor configured (see
   *    `vitest.config.ts`), but that is a measurement, and a probe that did
   *    not use `lang="ts"` would have left it unmeasured until the first real
   *    component was written.
   *  - **The annotation on `$props()` is the thing being stripped.** It is
   *    type-only syntax, so if types were *not* being erased the generated
   *    module would carry `: { label?: string }` into JavaScript and fail to
   *    parse — loudly, at import, rather than silently shipping.
   *
   * Delete this file and its test when a real component carries the same
   * evidence — i.e. when some committed component is compiled by both the
   * site build and a vitest run.
   */
  let { label = 'svelte toolchain' }: { label?: string } = $props()
</script>

<span>{label}</span>
