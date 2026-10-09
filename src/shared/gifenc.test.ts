import { describe, expect, it } from 'vitest'
import { execFile, spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { GifReader } from 'omggif'
import {
  BW_PALETTE, GIFEncoder, applyPalette, quantize, twoColourPalette,
} from './gifenc.js'

const run = promisify(execFile)

/** Can this node run a `.ts` file directly? Needed to test node's resolution. */
const HAVE_STRIP_TYPES = spawnSync(process.execPath, [
  '--experimental-strip-types', '--no-warnings', '--input-type=module', '--eval', 'void 0',
], { stdio: 'ignore' }).status === 0

const W = 8, H = 8

/** Deterministic binary dot field — the real payload shape, not a flat colour. */
function dotsRgba(seed: number): Uint8Array {
  let s = (seed >>> 0) || 1
  const rgba = new Uint8Array(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    s = (s * 1103515245 + 12345) >>> 0
    const v = s / 4294967296 < 0.5 ? 0 : 255
    rgba[i * 4] = v
    rgba[i * 4 + 1] = v
    rgba[i * 4 + 2] = v
    rgba[i * 4 + 3] = 255
  }
  return rgba
}

function blackRgba(): Uint8Array {
  const rgba = new Uint8Array(W * H * 4)
  for (let i = 0; i < W * H; i++) rgba[i * 4 + 3] = 255
  return rgba
}

describe('the gifenc shim', () => {
  it('resolves the real API under whichever resolver loaded this module', () => {
    expect(typeof GIFEncoder).toBe('function')
    expect(typeof quantize).toBe('function')
    expect(typeof applyPalette).toBe('function')
  })

  it('exposes a different module shape to node than to the bundler the tests run under', async () => {
    // This is why the shim exists, and why it cannot be replaced with a plain
    // default or named import: the module's shape inverts between resolvers,
    // and vitest only ever exercises one of them (vite resolves the ESM
    // `module` field). A node-correct import would stay green here while the
    // CLI broke, and vice versa.
    const probe = `
      import * as ns from 'gifenc'
      process.stdout.write(JSON.stringify({
        nsKeys: Object.keys(ns),
        nsQuantize: typeof ns.quantize,
        defaultQuantize: typeof ns.default?.quantize,
      }))
    `
    const { stdout } = await run(process.execPath, ['--input-type=module', '--eval', probe],
      { cwd: process.cwd() })
    const node = JSON.parse(stdout) as {
      nsKeys: string[]; nsQuantize: string; defaultQuantize: string
    }

    // Under node (CJS `main`) the whole API hides behind `default`...
    expect(node.nsKeys).toEqual(['default'])
    expect(node.nsQuantize).toBe('undefined')
    expect(node.defaultQuantize).toBe('function')

    // ...while under vite (ESM `module`) it is the other way round, and
    // `default` is GIFEncoder itself rather than the namespace.
    const vite = await import('gifenc')
    expect(typeof (vite as unknown as { quantize?: unknown }).quantize).toBe('function')
    expect(typeof vite.default).toBe('function')
  })

  it.skipIf(!HAVE_STRIP_TYPES)('resolves to a working API when node loads this file', async () => {
    // The half of the hazard vitest can never cover. `gifenc.ts` is imported
    // straight by node here, which is only possible because it has no relative
    // imports (pinned by the next test) — node's type stripping does not
    // rewrite a `./x.js` specifier to `./x.ts`.
    const self = new URL('./gifenc.ts', import.meta.url).href
    const probe = `
      import { GIFEncoder, applyPalette, twoColourPalette } from ${JSON.stringify(self)}
      const rgba = new Uint8Array(${W * H * 4})
      for (let i = 0; i < ${W * H}; i++) {
        const v = i % 3 ? 255 : 0
        rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255
      }
      const palette = twoColourPalette(rgba)
      const enc = GIFEncoder()
      enc.writeFrame(applyPalette(rgba, palette), ${W}, ${H}, { palette, delay: 100 })
      enc.finish()
      process.stdout.write(Buffer.from(enc.bytes()).toString('base64'))
    `
    const { stdout } = await run(process.execPath,
      ['--experimental-strip-types', '--no-warnings', '--input-type=module', '--eval', probe],
      { cwd: process.cwd() })
    const r = new GifReader(new Uint8Array(Buffer.from(stdout, 'base64')))
    expect(r.numFrames()).toBe(1)
    expect(r.frameInfo(0).palette_size).toBe(2)
  })

  it('has no relative imports, so node can load it without a build step', async () => {
    // Not style policing: the test above is the ONLY thing pinning the node
    // half of the dual-package hazard, and it works by handing this file to
    // node directly. Add a `./something.js` import here and that test dies
    // with ERR_MODULE_NOT_FOUND — which is easy to "fix" by deleting it, and
    // then nothing catches a node-broken import again.
    const src = await readFile(fileURLToPath(new URL('./gifenc.ts', import.meta.url)), 'utf8')
    const specifiers = [...src.matchAll(/^\s*(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/gm)]
      .map(m => m[1]!)
    expect(specifiers.filter(s => s.startsWith('.'))).toEqual([])
  })
})

describe('twoColourPalette', () => {
  it('returns the two colours of a dot field', () => {
    const p = twoColourPalette(dotsRgba(1))
    expect(p).toHaveLength(2)
    expect(p.map(c => c[0]).sort((a, b) => a! - b!)).toEqual([0, 255])
  })

  it('still returns two entries when the frame has only one colour', () => {
    // Measured: quantize(allBlack, 2) -> [[0,0,0]]. Taken as a global palette
    // that collapses every later frame to black — silent total data loss.
    expect(quantize(blackRgba(), 2)).toHaveLength(1)
    expect(twoColourPalette(blackRgba())).toEqual(BW_PALETTE)
  })

  it('round-trips a dot field exactly through applyPalette', () => {
    const rgba = dotsRgba(2)
    const palette = twoColourPalette(rgba)
    const index = applyPalette(rgba, palette)
    for (let i = 0; i < W * H; i++) {
      expect(palette[index[i]!]![0]).toBe(rgba[i * 4])
    }
  })
})
