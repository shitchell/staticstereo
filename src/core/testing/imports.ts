/**
 * Every module specifier in a source text, parsed rather than grepped.
 *
 * Lifted out of `src/core/purity.test.ts`, which is where it was written and
 * where its self-tests still live. It moved for one measured reason: a `.test.ts`
 * file's top-level `describe`s register into whichever suite **imports** it, so
 * `src/svelte-free.test.ts` importing the function from there ran all eight of
 * `purity.test.ts`'s tests a second time under `svelte-free.test.ts`'s name —
 * 14 reported where 6 were written. `site/transport.test.ts` records the same
 * hazard as its reason for duplicating a predicate instead of sharing one; a
 * non-test module is the third way, and the one that costs nothing here.
 *
 * Under `src/core/testing/` so it cannot reach `dist/`: `tsconfig.json` excludes
 * `src/core/testing/**` from the build, and `purity.test.ts` asserts that no
 * path segment `testing` is ever emitted. `src/testing/` would have been
 * emitted and would have turned that assertion red. The directory is already
 * the repo's de-facto shared test-helper home — `metamorphic.ts` here is
 * imported from `src/node/`, `src/cli/` and `site/`.
 *
 * **This parses; it does not grep**, and that is the whole value. The plan
 * originally said to grep `dist/core` for `@napi-rs`, which was wrong in both
 * directions and both were verified by building: there are four `@napi-rs`
 * occurrences in `dist/core` and every one is a word in a docblock, so the grep
 * fails on correct code; and the one real leak was `vitest`, which the grep
 * would never have found. Comments and string literals are not imports, and
 * only a parser knows the difference.
 */
import * as ts from 'typescript'

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
