/**
 * Lawful, and invisible to the pre-change cone walk twice over: its name is
 * camelCase and it quotes its import of the shared mechanism with `"` rather
 * than `'`. Either alone defeated `/from '\.\/([a-z]+)\.js'/`.
 */
import { lastParam, normaliseParam } from "./query.js"

export function storeMode(search: string): string {
  return normaliseParam(lastParam(search, 'store') ?? '')
}
