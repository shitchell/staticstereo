/**
 * The fixture's stand-in for `site/query.ts`: the one place the three policy
 * idioms are allowed to appear. It carries all three so that the control test
 * can distinguish "the sweep found the mechanism and nothing else" from "the
 * sweep found nothing", which is the vacuity the real sweep floors against.
 */
export function searchParams(search: string): URLSearchParams {
  return new URLSearchParams(search)
}

export function lastParam(search: string, name: string): string | undefined {
  return searchParams(search).getAll(name).at(-1)
}

export function normaliseParam(value: string): string {
  return value.trim().toLowerCase()
}
