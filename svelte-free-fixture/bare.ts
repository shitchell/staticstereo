// The package itself. Resolvable, typed, and silent under both `tsc` and
// `svelte-check` — which is why the type gate cannot be the guard here.
import { mount } from 'svelte'

export const start = mount
