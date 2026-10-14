import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { loadScene } from './scene.js'
// The vocabulary and the `Anim` flattener moved to `core/testing` when the
// site's starter scenes got a sweep of their own (`site/examples.test.ts`):
// two corpora checking two copies of the list is how one of them drifts.
import { VERBS, animators } from '../core/testing/verbs.js'
import type { Layer, Preset } from '../core/types.js'

const EXAMPLES = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../examples')

describe('the shipped example scenes', () => {
  const files = readdirSync(EXAMPLES).filter(f => f.endsWith('.yaml')).sort()

  it('finds some, so the sweeps below are not vacuous', () => {
    // `readdirSync` on a directory that moved returns nothing and every
    // `it.each` over it silently disappears. The suite would stay green with
    // no examples checked at all.
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('%s loads through the real validator', async file => {
    // Nothing else in the suite parses `pacman.yaml` except by rendering it in
    // `metamorphic.real.test.ts`, which is skipped when `@napi-rs/canvas` is
    // unavailable. A scene file that stopped parsing could ship.
    await expect(loadScene(resolve(EXAMPLES, file))).resolves.toBeTruthy()
  })

  it.each(files)('%s animates only with the approved verbs', async file => {
    // The examples are the project's worked documentation, so a kind that
    // exists only for backwards compatibility teaches it as current. They are
    // also what `metamorphic.real.test.ts` measures, which is why they must be
    // moved off a retiring kind *before* it is deleted rather than with it:
    // the two changes are separable and only one of them is allowed to move a
    // measured number.
    //
    // A raw keyframe track is not a lesser citizen here. `Anim` is
    // `Track | Preset | (Track | Preset)[]`, and §4.2b makes the presets UI
    // templates that emit ordinary `Anim`; a literal track is what such a
    // template would write.
    const scene = await loadScene(resolve(EXAMPLES, file))
    for (const [i, layer] of (scene.layers as Layer[]).entries()) {
      for (const a of animators(layer.anim)) {
        if ('keys' in a) continue
        expect(VERBS, `${file} layers[${i}]`).toContain((a as Preset).kind)
      }
    }
  })
})
