// Not line-anchored on `from`, so `src/web/index.test.ts`'s `specifiersOf`
// reports nothing for this file. The AST walk reports it.
export async function load(): Promise<unknown> {
  const module = await import('./App.svelte')
  return module
}
