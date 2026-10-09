import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as web from './index.js'

/**
 * The web adapter's one hard constraint is what it may *import*.
 *
 * Everything else about this directory can be fixed later; a `node:` builtin
 * or `@napi-rs/canvas` reaching the browser bundle cannot — it breaks the
 * published site at build time or, worse, ships a polyfilled shim of the thing
 * the adapter exists to replace. `package.json`'s `exports` map keeps
 * `staticstereo/node` out of a browser build, but nothing stops this directory
 * from importing it directly, so assert it.
 *
 * Same technique as the `dist/core` purity test: parse import specifiers rather
 * than grep the text, because every one of these names also appears in prose in
 * a docblock.
 */

const HERE = dirname(fileURLToPath(import.meta.url))

/** Browser-safe dependencies. Both are dependency-free and isomorphic. */
const ALLOWED_PACKAGES = new Set(['gifenc', 'omggif'])

function specifiersOf(src: string): string[] {
  return [
    ...src.matchAll(/^\s*(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/gm),
    ...src.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm),
  ].map(m => m[1]!)
}

/** Every module reachable from `entry` by relative import, transitively. */
async function reachable(entry: string): Promise<Map<string, string[]>> {
  const seen = new Map<string, string[]>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    // `node16` resolution means specifiers say `.js`; the source is `.ts`.
    const src = await readFile(file.replace(/\.js$/, '.ts'), 'utf8')
    const specs = specifiersOf(src)
    seen.set(file, specs)
    for (const s of specs) {
      if (s.startsWith('.')) queue.push(resolve(dirname(file), s))
    }
  }
  return seen
}

describe('the web entry point', () => {
  it('exports the adapter and its encoders', () => {
    expect(typeof web.webCanvas).toBe('function')
    expect(typeof web.gifBytes).toBe('function')
    expect(typeof web.gifBlob).toBe('function')
    expect(typeof web.pngBlob).toBe('function')
  })

  it('imports nothing that cannot run in a browser', async () => {
    const graph = await reachable(resolve(HERE, 'index.js'))
    const offenders: string[] = []
    for (const [file, specs] of graph) {
      for (const s of specs) {
        if (s.startsWith('.')) continue
        if (ALLOWED_PACKAGES.has(s)) continue
        offenders.push(`${file}: ${s}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('reaches shared and core but never src/node', async () => {
    // A positive control: if the graph walk silently found nothing, the
    // assertion above would pass for the wrong reason.
    const files = [...(await reachable(resolve(HERE, 'index.js'))).keys()]
    expect(files.length).toBeGreaterThan(3)
    expect(files.some(f => f.includes('/shared/'))).toBe(true)
    expect(files.some(f => f.includes('/node/'))).toBe(false)
  })
})
