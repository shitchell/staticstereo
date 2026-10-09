import { describe, expect, it } from 'vitest'
import { webCanvas } from './canvas.js'
import {
  dispose2Gif, gifDataUrl, keepGif, solid3Gif,
} from '../shared/testing/gifFixtures.js'

/**
 * What this file can and cannot cover, stated plainly.
 *
 * `OffscreenCanvas` and `createImageBitmap` do not exist under node, and jsdom
 * and happy-dom do not rasterise, so **the drawing path of this adapter is not
 * tested anywhere** — `make` and `loadImage`'s decode are verified only by the
 * fact that they are a direct forward to the platform API, and would need a
 * real browser to assert on pixels. That is why `src/web/canvas.ts` is kept
 * free of logic: everything with behaviour worth asserting lives in
 * `src/shared/`, which does run here.
 *
 * Two things *are* genuinely testable under node and are tested below:
 *
 *  - `loadGif`, in full, because GIF decoding touches no canvas at all. A
 *    `data:` URL stands in for the network, which node's fetch handles.
 *  - the diagnostics for a missing platform API, precisely *because* node is an
 *    environment where it is missing — the native failure is a bare
 *    `OffscreenCanvas is not defined`, which tells a caller nothing.
 *
 * No mock canvas: a stub of `OffscreenCanvas` would only assert that this file
 * calls the methods this file calls.
 */

/** The four RGBA bytes at (x, y) of a width-`w` buffer. */
function px(rgba: ArrayLike<number>, w: number, x: number, y: number): number[] {
  const o = (y * w + x) * 4
  return [rgba[o]!, rgba[o + 1]!, rgba[o + 2]!, rgba[o + 3]!]
}

describe('webCanvas().make', () => {
  it('rejects a bad size before it touches the platform at all', () => {
    expect(() => webCanvas().make(0, 10)).toThrow(/bad size 0x10/)
    expect(() => webCanvas().make(-1, 10)).toThrow(/bad size/)
    expect(() => webCanvas().make(Number.NaN, 10)).toThrow(/bad size/)
  })

  it('explains itself when OffscreenCanvas is missing, naming the Node adapter', () => {
    // Under node this is the real code path, and the message is the whole
    // product of it: "OffscreenCanvas is not defined" sends a reader hunting
    // through their bundler config instead of their import.
    const err = (() => { try { webCanvas().make(4, 4); return null } catch (e) { return e as Error } })()
    expect(err).toBeInstanceOf(Error)
    expect(err!.message).toMatch(/OffscreenCanvas/)
    expect(err!.message).toMatch(/nodeCanvas|staticstereo\/node/)
  })
})

describe('webCanvas().loadImage', () => {
  it('rejects with the missing-API diagnosis, naming the source', async () => {
    const err = await webCanvas().loadImage('data:image/png;base64,iVBORw0KGgo=')
      .then(() => null, (e: unknown) => e as Error)
    expect(err).toBeInstanceOf(Error)
    expect(err!.message).toMatch(/createImageBitmap|OffscreenCanvas/)
    expect(err!.message).toMatch(/nodeCanvas|staticstereo\/node/)
  })
})

describe('webCanvas().loadGif', () => {
  it('decodes a fetched GIF: screen size, frame count, and 10ms-unit delays', async () => {
    const g = await webCanvas().loadGif(gifDataUrl(solid3Gif()))
    expect(g.width).toBe(4)
    expect(g.height).toBe(4)
    expect(g.frames).toHaveLength(3)
    for (const f of g.frames) expect(f.delayMs).toBe(80)
  })

  it('returns the same frames the Node adapter does, disposal model included', async () => {
    // The adapters must agree frame-for-frame — they share one decoder, and
    // this is the assertion that the web side is actually wired to it.
    const bleed = await webCanvas().loadGif(gifDataUrl(dispose2Gif()))
    expect(px(bleed.frames[1]!.rgba, 4, 0, 0)).toEqual([0, 255, 0, 255])
    expect(px(bleed.frames[1]!.rgba, 4, 3, 3)).toEqual([0, 0, 0, 0])

    const kept = await webCanvas().loadGif(gifDataUrl(keepGif()))
    expect(px(kept.frames[1]!.rgba, 4, 0, 0)).toEqual([0, 255, 0, 255])
    expect(px(kept.frames[1]!.rgba, 4, 3, 3)).toEqual([255, 0, 0, 255])
  })

  it('rejects with a message naming the source when the bytes are not a GIF', async () => {
    const notAGif = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
    await expect(webCanvas().loadGif(notAGif)).rejects.toThrow(/decode GIF/i)
    await expect(webCanvas().loadGif(notAGif)).rejects.toThrow(/data:image\/png/)
  })

  it('rejects with a message naming the source when the fetch fails', async () => {
    await expect(webCanvas().loadGif('data:;base64,@@@@')).rejects.toThrow(/read GIF/i)
  })

  it('reports a non-OK HTTP status rather than decoding an error page', async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response('nope', { status: 404, statusText: 'Not Found' })) as typeof fetch
    try {
      await expect(webCanvas().loadGif('https://example.invalid/a.gif'))
        .rejects.toThrow(/404/)
    } finally {
      globalThis.fetch = original
    }
  })
})
