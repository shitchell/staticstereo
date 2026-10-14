/**
 * Lawful: it reads `location.search`, so it is subject to the cone assertion,
 * and it reaches the mechanism only through a camelCase specifier and a
 * `.svelte` specifier — neither of which the pre-change walk could resolve.
 * The pre-change sweep therefore accuses this file of handling a query string
 * from outside the cone, which it does not.
 */
import { storeMode } from './editorStore.js'
import { panelMode } from "./EditorPanel.svelte"

export function shellMode(): string {
  return panelMode(location.search) ?? storeMode(location.search)
}
