<script lang="ts" module>
  /**
   * THE PLANT. A fourth query parser and a second boolean-spelling table, in a
   * component, importing nothing. Every detector in `site/query.test.ts` should
   * have something to say about it: three policy idioms, an `X_PARAM`
   * declaration, a `location.search` read, and no path to the mechanism.
   *
   * The pre-change sweep says nothing about it at all, because it cannot open a
   * file whose name does not end in `.ts`.
   */
  export const STRAY_PARAM = 'stray'

  const STRAY_BOOLEANS: Record<string, boolean> = {
    '1': true, 'true': true, 'yes': true, 'on': true,
    '0': false, 'false': false, 'no': false, 'off': false,
  }

  export function strayFlag(search: string): boolean | undefined {
    const values = new URLSearchParams(search).getAll(STRAY_PARAM)
    const last = values.at(-1)
    return last === undefined ? undefined : STRAY_BOOLEANS[last.trim().toLowerCase()]
  }

  const open = strayFlag(location.search) ?? false
</script>

<span>{open}</span>
