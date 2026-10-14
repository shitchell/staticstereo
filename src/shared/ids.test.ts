import { describe, expect, it } from 'vitest'
import { newLayerId } from './ids.js'

/**
 * 10 000 draws is far more layers than any scene will hold. It is chosen so
 * that a generator short enough to collide *in practice* fails here rather
 * than in a user's undo history: the probability that this run collides with
 * the chosen length is ~4e-11 (see `ids.ts`), so a failure is a defect in the
 * generator and never bad luck.
 */
const DRAWS = 10_000

describe('newLayerId', () => {
  it('draws base64url ids, of one length, pairwise distinct across 10 000 draws', () => {
    const ids = Array.from({ length: DRAWS }, () => newLayerId())

    // base64url, so an id survives a URL hash, a YAML scalar and a CSS
    // selector untouched — the three places a layer id ends up.
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]+$/)

    // One length for all of them, not one *particular* length: the guarantee
    // is that ids are fixed-width (so they align in a panel and never need
    // escaping), not that they are 10 characters today.
    expect(new Set(ids.map(id => id.length)).size).toBe(1)

    expect(new Set(ids).size).toBe(DRAWS)
  })
})
