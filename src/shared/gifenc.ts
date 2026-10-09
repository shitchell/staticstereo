import * as gifencModule from 'gifenc'

/**
 * gifenc interop, in one place, for both adapters.
 *
 * This looks like paranoia and is not — the module's shape genuinely inverts
 * depending on who resolved it, because its package.json offers an esbuild CJS
 * bundle as `main` and an ESM bundle as `module`, with no `exports` map:
 *
 * |                              | node (CJS `main`)        | vite/esbuild (ESM `module`) |
 * |------------------------------|--------------------------|-----------------------------|
 * | `import g from 'gifenc'`     | the namespace object     | `GIFEncoder`, the function  |
 * | `import { quantize } from …` | SyntaxError at link time | works                       |
 * | `import * as ns from …`      | `{ default: namespace }` | full namespace              |
 *
 * (The named-import failure is because the CJS bundle installs its exports as
 * `Object.defineProperty` getters, which node's cjs-module-lexer cannot see.)
 *
 * So no single import form is correct everywhere, and this module is loaded
 * both ways: directly by node for the CLI, and through a bundler by the test
 * suite and the browser build. A namespace import plus one probe for a function
 * that only exists on the real API is the only form that survives both.
 *
 * **Keep this file free of relative imports.** `gifenc.test.ts` pins the node
 * half of the hazard by handing this file straight to node, which is only
 * possible while it imports nothing but packages: node's type stripping does
 * not rewrite a `./x.js` specifier to `./x.ts`. There is a test for that too.
 */
const gifenc = ((m: unknown): typeof gifencModule.default =>
  typeof (m as { quantize?: unknown }).quantize === 'function'
    ? (m as typeof gifencModule.default)
    : (m as { default: typeof gifencModule.default }).default
)(gifencModule)

export const { GIFEncoder, quantize, applyPalette } = gifenc

/** Black and white, in gifenc's `[r, g, b]` palette shape. */
export const BW_PALETTE: number[][] = [[0, 0, 0], [255, 255, 255]]

/**
 * A 2-entry palette for an RGBA buffer — the exact palette for a stereogram,
 * whose pixels are binary black and white.
 *
 * `quantize` returns FEWER entries than asked when the input has fewer colours,
 * and a *global* palette of one colour flattens every later frame to that
 * colour. Measured: `quantize(allBlack, 2)` -> `[[0, 0, 0]]`, so a fade-in whose
 * first frame is blank would otherwise encode as an all-black animation.
 */
export function twoColourPalette(rgba: Uint8Array | Uint8ClampedArray): number[][] {
  const found = quantize(rgba, 2)
  return found.length >= 2 ? found : BW_PALETTE
}
