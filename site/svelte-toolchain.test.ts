import { describe, expect, it } from 'vitest'

import SvelteSmoke from './SvelteSmoke.svelte'

/**
 * Criterion 0 of P3, as a predicate over an importable module: **a Svelte 5
 * component compiles under this repo's toolchain and is reachable from a
 * vitest run.**
 *
 * ## Why this is a test and not just "the install went fine"
 *
 * An install has no observable behaviour to assert on — "a package is in
 * `node_modules`" is not a property of this codebase. What *is* observable is
 * that `./SvelteSmoke.svelte` resolves and compiles. Before the plugin existed
 * this file could not even be collected: vitest's esbuild transform reads a
 * `.svelte` file as JavaScript and dies on the first `<`.
 *
 * ## Why `typeof === 'function'` and not "the import did not throw"
 *
 * A `.svelte` file is not JavaScript. Its bytes are markup. So the two
 * failure modes that matter are distinguished by the *shape* of the default
 * export, not by whether an exception escaped:
 *
 *  - **Resolved but not compiled** — some loader handed back the file's text,
 *    or an empty/stub module (this is what a `?raw`-style rule, or a
 *    `declare module '*.svelte'` ambient shim on the type side, buys you). The
 *    default export is then a string, an object, or `undefined`.
 *  - **Compiled** — the Svelte compiler turned the markup into a component
 *    function. Only a compiler can produce a *callable* from those bytes.
 *
 * Asserting "it is a function" is therefore the cheapest assertion that no
 * non-compiling resolution can satisfy. It is specifically *not* a DOM test:
 * design §12 excludes Svelte component DOM from testing, and nothing here
 * instantiates, renders or mounts anything — this tier has no browser.
 *
 * ## Why the arity is checked too
 *
 * A Svelte component function is generated with a fixed signature by the
 * compiler, never zero-arg: client output is `($$anchor, $$props)` and server
 * output is `($$payload, $$props)`. A hand-written or accidentally-shimmed
 * `() => {}` default export would pass the `typeof` check and fail this one,
 * which is what keeps the pair honest if someone later "fixes" a red import
 * by stubbing it.
 */
describe('the Svelte toolchain', () => {
  it('compiles a .svelte file into a component function, not into text', () => {
    expect(typeof SvelteSmoke).toBe('function')
  })

  it('produces the compiler-generated signature, so a stub cannot stand in', () => {
    expect((SvelteSmoke as unknown as (...args: unknown[]) => unknown).length).toBeGreaterThan(0)
  })
})
