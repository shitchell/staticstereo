/**
 * Lawful. The scan must walk this file, parse imports out of it, and name it
 * nowhere — which is the half of the control that a predicate rotted into
 * matching everything would fail.
 *
 * It mentions svelte here, in a comment, and once more below in a string
 * literal. Neither is an import, and only a parser knows that: the grep this
 * guard deliberately is not would report this file twice.
 */
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

export const NOTE = 'the editor is built with svelte, and lives in site/'

export function read(dir: string, name: string): string {
  return readFileSync(join(dir, name), 'utf8')
}
