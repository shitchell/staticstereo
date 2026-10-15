<script lang="ts" module>
  /**
   * Lawful: a `.svelte` module that declares a parameter and reaches the
   * shared mechanism directly. It is here so the control can show the cone
   * walk crossing a component rather than stopping at one.
   */
  import { lastParam } from './query.js'

  export const PANEL_PARAM = 'panel'

  export function panelMode(search: string): string | undefined {
    return lastParam(search, PANEL_PARAM)
  }
</script>

<span>{PANEL_PARAM}</span>
