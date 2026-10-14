import { describe, expect, it } from 'vitest'
import { EXAMPLES } from './examples.js'
import { validateScene } from './scene.js'
import { VERBS, animators } from '../src/core/testing/verbs.js'
import type { Preset } from '../src/core/types.js'

/**
 * The editor's starter scenes, swept the way `src/cli/examples.test.ts`
 * sweeps `examples/*.yaml` — the same vocabulary, from the same module.
 *
 * Nothing imported `EXAMPLES` before this file. The scenes were migrated off
 * `marquee` and `bounce` by hand, and a missed one would have shipped as a
 * "load this example" button that throws on first paint: `main.ts` hands the
 * picked scene straight to `setScene`, so the unknown kind surfaces from
 * inside the rasteriser on first render, not as a validation error. 954 tests
 * would not have caught it, and one of the five *was* wrong in a way they did
 * not catch — the SCROLL endpoint, which no longer matched its own text.
 */
const CASES = EXAMPLES.map(ex => [ex.id, ex] as const)

describe('the editor starter scenes', () => {
  it('finds some, so the sweeps below are not vacuous', () => {
    // `it.each([])` registers nothing and reports green, so an `EXAMPLES` that
    // lost its entries to a bad merge would silently take both sweeps with it.
    // The CLI sweep carries the same guard for the same reason.
    expect(CASES.length).toBeGreaterThan(0)
  })

  it.each(CASES)('%s survives the validator the shared-link path uses', (_id, ex) => {
    // The picker does not validate, but the hash does: every scene the editor
    // shares comes back through `validateScene`, which **rebuilds** a scene
    // field by field and silently drops what it does not recognise. A starter
    // scene it rejects is one that cannot survive being shared.
    expect(() => validateScene(ex.scene)).not.toThrow()
  })

  it.each(CASES)('%s animates only with the approved verbs', (id, ex) => {
    // Not redundant with the check above, which asks `kind in PRESETS` and so
    // agrees with whatever the registry holds. This asks the design question:
    // is the kind one of the five §4.2b settled on. Registering a sixth verb
    // would quietly make the validator accept an example that teaches it.
    for (const [i, layer] of ex.scene.layers.entries()) {
      for (const a of animators(layer.anim)) {
        if ('keys' in a) continue
        expect(VERBS, `${id} layers[${i}]`).toContain((a as Preset).kind)
      }
    }
  })
})
