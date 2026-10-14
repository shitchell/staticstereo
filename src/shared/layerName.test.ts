import { describe, expect, it } from 'vitest'
import { layerName } from './layerName.js'
import type { Layer } from '../core/types.js'

/**
 * One sample per layer variant, keyed by the discriminator, so that adding a
 * variant to `Layer` is a compile error *here* as well as in `layerName`
 * itself — a new kind of layer with no derived name would otherwise be
 * discovered by a user staring at a blank row in the panel.
 */
const SAMPLES: Record<Layer['type'], Layer> = {
  text: { type: 'text', text: 'HELLO' },
  image: { type: 'image', src: 'art/ball.png' },
  gif: { type: 'gif', src: 'https://example.com/anim/spin.gif' },
  shape: { type: 'shape', shape: 'circle', r: 10 },
  draw: { type: 'draw', fn: './plugins/spiral.js' },
}

describe('layerName', () => {
  it('prefers the explicit name, for every variant', () => {
    for (const layer of Object.values(SAMPLES)) {
      expect(layerName({ ...layer, name: 'Renamed' })).toBe('Renamed')
    }
  })

  it('derives a name from the content when there is none, for every variant', () => {
    expect(layerName(SAMPLES.text)).toBe('HELLO')
    // The basename, not the path: what distinguishes two image layers is the
    // file, and the directory is the part they usually share.
    expect(layerName(SAMPLES.image)).toBe('ball.png')
    expect(layerName(SAMPLES.gif)).toBe('spin.gif')
    expect(layerName(SAMPLES.shape)).toBe('circle')
    expect(layerName(SAMPLES.draw)).toBe('spiral.js')
  })

  it('falls back to the layer type when the content yields nothing', () => {
    // Reachable: the site validator accepts `text: ""`, and a `src` ending in
    // a slash has no basename. A blank row names nothing at all, so the type
    // is the last thing left that is still true about the layer.
    expect(layerName({ type: 'text', text: '' })).toBe('text')
    expect(layerName({ type: 'image', src: 'art/' })).toBe('image')
  })

  it('does not truncate, because length is the panel\'s problem', () => {
    const long = 'A'.repeat(500)
    expect(layerName({ type: 'text', text: long })).toBe(long)
  })
})
