// A subpath. `=== 'svelte'` alone would miss it, and the store is the import a
// shell reaches for first.
import { writable } from 'svelte/store'

export const scene = writable(null)
