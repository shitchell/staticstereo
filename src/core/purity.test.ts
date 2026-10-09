/**
 * `dist/core` must import nothing but its own relative files.
 *
 * That is the only thing keeping the browser bundle clean: core reaches the
 * platform through the injected `CanvasLike`, so a single non-relative
 * specifier in here means `@napi-rs/canvas` (or `node:fs`, or a test runner)
 * has been pulled into a bundle that cannot have it.
 *
 * **This test parses; it does not grep.** The plan originally said to grep
 * `dist/core` for `@napi-rs`, which was wrong in both directions and both were
 * verified by building: there are four `@napi-rs` occurrences in `dist/core`
 * and every one is a word in a docblock, so the grep fails on correct code;
 * and the one real leak was `vitest` (the build used to compile `*.test.ts`
 * into `dist`), which the grep would never have found. Comments and string
 * literals are not imports, and only a parser knows the difference — hence the
 * TypeScript compiler API below, and the self-test that pins both failure
 * modes without needing a build.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ts from 'typescript'

/** Anchored to this file, not to cwd, so the test is invocation-independent. */
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')
const DIST = join(ROOT, 'dist')
const DIST_CORE = join(DIST, 'core')

/**
 * Every module specifier in `text`, from any form that creates a dependency:
 * static import/export-from, bare side-effect import, `import type`, the
 * `import('x').T` type form d.ts files emit, dynamic `import()`, and
 * `require()`.
 */
export function importSpecifiers(text: string, kind: ts.ScriptKind): string[] {
  const sf = ts.createSourceFile('x', text, ts.ScriptTarget.ES2022, true, kind)
  const out: string[] = []
  const add = (node: ts.Node | undefined): void => {
    if (node && ts.isStringLiteralLike(node)) out.push(node.text)
  }
  const walk = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier)
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) add(node.moduleReference.expression)
    } else if (ts.isImportTypeNode(node)) {
      if (ts.isLiteralTypeNode(node.argument)) add(node.argument.literal)
    } else if (ts.isCallExpression(node)) {
      const dynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword
      const required = ts.isIdentifier(node.expression) && node.expression.text === 'require'
      if (dynamic || required) add(node.arguments[0])
    }
    ts.forEachChild(node, walk)
  }
  walk(sf)
  return out
}

function filesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...filesUnder(path))
    else out.push(path)
  }
  return out
}

const kindOf = (path: string): ts.ScriptKind =>
  path.endsWith('.d.ts') || path.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS

describe('importSpecifiers', () => {
  it('ignores module names that are only mentioned in comments', () => {
    const text = [
      '/**',
      ' * Node injects an adapter over `@napi-rs/canvas`; the browser one over',
      ' * OffscreenCanvas. See node:fs for the loader.',
      ' */',
      "// import { x } from 'vitest'",
      "import { y } from './other.js'",
      'export const note = "requires @napi-rs/canvas at runtime"',
    ].join('\n')
    expect(importSpecifiers(text, ts.ScriptKind.TS)).toEqual(['./other.js'])
  })

  it('finds every form that creates a real dependency', () => {
    const text = [
      "import a from 'alpha'",
      "import 'beta'",
      "import type { C } from 'gamma'",
      "export { d } from 'delta'",
      "export * from 'epsilon'",
      "const z: import('zeta').Z = null as never",
      "await import('eta')",
      "require('theta')",
    ].join('\n')
    expect(importSpecifiers(text, ts.ScriptKind.TS).sort()).toEqual([
      'alpha', 'beta', 'delta', 'epsilon', 'eta', 'gamma', 'theta', 'zeta',
    ])
  })
})

const built = existsSync(DIST_CORE)

describe.skipIf(!built)('dist/core purity', () => {
  it('imports nothing non-relative', () => {
    const files = filesUnder(DIST_CORE)
    const leaks: string[] = []
    let total = 0
    for (const file of files) {
      if (!/\.(js|mjs|cjs|d\.ts)$/.test(file)) continue
      for (const spec of importSpecifiers(readFileSync(file, 'utf8'), kindOf(file))) {
        total++
        if (!spec.startsWith('.')) leaks.push(`${relative(ROOT, file)} imports ${spec}`)
      }
    }
    // Guard against a vacuous pass: a parser that found nothing would also
    // report no leaks, and that is exactly how a purity test rots.
    expect(total).toBeGreaterThan(10)
    expect(leaks).toEqual([])
  })

  it('does not reach outside core even by relative path', () => {
    // "Every specifier is relative" is necessary but not sufficient, and the
    // gap is now reachable: `src/shared/` exists and `src/node/` imports from
    // it, so a future `../shared/frames.js` in core would satisfy the rule
    // above while pulling whatever `shared` depends on into the browser bundle.
    const escapes: string[] = []
    for (const file of filesUnder(DIST_CORE)) {
      if (!/\.(js|mjs|cjs|d\.ts)$/.test(file)) continue
      for (const spec of importSpecifiers(readFileSync(file, 'utf8'), kindOf(file))) {
        if (!spec.startsWith('.')) continue
        const target = resolve(dirname(file), spec)
        if (!target.startsWith(DIST_CORE + sep)) {
          escapes.push(`${relative(ROOT, file)} imports ${spec}`)
        }
      }
    }
    expect(escapes).toEqual([])
  })

  it('emits no test files into dist', () => {
    const tests = filesUnder(DIST)
      .filter(f => /\.test\.(js|d\.ts)$/.test(f))
      .map(f => relative(ROOT, f))
    // `files: ["dist"]` would publish these, and they import vitest.
    expect(tests).toEqual([])
  })

  it('emits no test-only helpers into dist', () => {
    const helpers = filesUnder(DIST)
      .filter(f => f.includes(`${join('core', 'testing')}`))
      .map(f => relative(ROOT, f))
    expect(helpers).toEqual([])
  })
})

if (!built) {
  it('skipped the dist/core purity checks because dist is absent', () => {
    // Deliberately not a failure: `npx vitest run` on a clean checkout must be
    // green. `npm run build` first to exercise the checks above.
    expect(built).toBe(false)
  })
}
