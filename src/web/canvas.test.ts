import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { interceptFont, resolveWebFont, vendoredFontAvailable, webCanvas } from './canvas.js'
import { VENDORED_FAMILY } from '../shared/fontspec.js'
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

/* ====================================================================== */
/* THE VENDORED FACE                                                      */
/* ====================================================================== */

/**
 * `resolveWebFont` is the one piece of real logic this adapter has, and it is
 * testable here because it is pure once the availability probe is injected.
 *
 * What cannot be tested under node is the thing that matters most — that the
 * browser actually rasterises the vendored outlines — so that is verified
 * against a real headless Chromium instead, and the agreement with the Node
 * adapter is recorded in the README. What is pinned here is the decision table:
 * which requests get retargeted, which are left to the engine, and what happens
 * when the face has not loaded.
 */
describe('resolveWebFont', () => {
  const yes = (): boolean => true
  const no = (): boolean => false

  it('points sans-serif at the vendored family once it is loaded', () => {
    expect(resolveWebFont('90px sans-serif', yes)).toBe(`90px ${VENDORED_FAMILY}`)
    expect(resolveWebFont('bold 90px sans-serif', yes)).toBe(`bold 90px ${VENDORED_FAMILY}`)
    expect(resolveWebFont('900 48px/1.2 sans-serif', yes)).toBe(`900 48px/1.2 ${VENDORED_FAMILY}`)
    expect(resolveWebFont('48px SANS-SERIF', yes)).toBe(`48px ${VENDORED_FAMILY}`)
  })

  it('leaves the request alone while the face is still loading', () => {
    // The degradation that matters: `fillText` in a declared-but-unloaded
    // family silently draws a fallback, so until `FontFaceSet.check` says yes
    // the honest thing is the engine's own sans-serif — which is what this page
    // used before the font was vendored.
    expect(resolveWebFont('90px sans-serif', no)).toBe('90px sans-serif')
  })

  it('leaves every other generic to the engine, which knows its own host', () => {
    // Unlike @napi-rs/canvas, a browser maps all of these correctly. Nothing in
    // this project measures serif or monospace, and vendoring a face per
    // generic would be another 60 KB each for a request no scene makes.
    for (const g of ['serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'emoji']) {
      expect(resolveWebFont(`90px ${g}`, yes)).toBe(`90px ${g}`)
    }
  })

  it('keeps an author-named family first, so their own fallback order survives', () => {
    expect(resolveWebFont('90px "Comic Sans MS", sans-serif', yes))
      .toBe(`90px "Comic Sans MS", ${VENDORED_FAMILY}`)
    expect(resolveWebFont('90px Georgia', yes)).toBe('90px Georgia')
    // A quoted generic is a family name per CSS, not a keyword.
    expect(resolveWebFont('90px "sans-serif"', yes)).toBe('90px "sans-serif"')
  })

  it('passes through anything that is not a font shorthand', () => {
    for (const bad of ['', 'sans-serif', 'bold', 'inherit']) {
      expect(resolveWebFont(bad, yes)).toBe(bad)
    }
  })
})

describe('vendoredFontAvailable', () => {
  it('is false under node, where there is no FontFaceSet at all', () => {
    // Not a degenerate case: it is the proof that the probe fails closed. A
    // probe that threw here would break `make()` on any runtime without
    // `document.fonts`, and one that returned true would retarget every
    // request at a family that does not exist.
    expect(typeof document).toBe('undefined')
    expect(vendoredFontAvailable()).toBe(false)
  })
})

describe('interceptFont', () => {
  /**
   * A stand-in for a 2D context: a `font` accessor **on the prototype**, which
   * is the shape the real interception depends on.
   *
   * Not a mock of a canvas — nothing here pretends to rasterise. It is the
   * minimum object for which "shadow the prototype's accessor with an own one
   * that rewrites on the way in and reports the stored value on the way out"
   * is a meaningful statement.
   */
  function fakeContext(): { font: string; stored: () => string } {
    let stored = '10px sans-serif'
    const proto = {
      get font(): string { return stored },
      set font(v: string) { stored = v },
    }
    const ctx = Object.create(proto) as { font: string; stored: () => string }
    ctx.stored = () => stored
    return ctx
  }

  it('rewrites on assignment and reports what will actually render', () => {
    const ctx = fakeContext()
    // The availability probe is false under node, so force the branch the
    // browser takes by naming the family the way core never would.
    interceptFont(ctx)
    ctx.font = '90px Georgia'
    expect(ctx.stored()).toBe('90px Georgia')
    expect(ctx.font).toBe('90px Georgia')
    // And the getter is the *stored* value, not an echo of the request: the
    // whole point of reporting the resolved font is that `ctx.font` answers
    // "what will render" rather than "what did I ask for".
    ;(Object.getPrototypeOf(ctx) as { font: string }).font = '1px Mutated'
    expect(ctx.font).toBe('1px Mutated')
  })

  it('leaves every other member native, which is why it is an accessor and not a wrapper', () => {
    const ctx = fakeContext() as unknown as Record<string, unknown>
    const before = Object.getPrototypeOf(ctx) as object
    interceptFont(ctx)
    expect(Object.getPrototypeOf(ctx)).toBe(before)
    expect(Object.getOwnPropertyNames(ctx)).toContain('font')
  })

  it('does nothing at all when there is no accessor to shadow', () => {
    // A plain data property: `make()` must still return a usable context, with
    // the platform's own generic mapping, rather than throwing. The Node
    // adapter deliberately throws in the same situation; here the degradation
    // is a correct rendering in the engine's own sans.
    const plain = { font: '10px sans-serif' }
    expect(() => interceptFont(plain)).not.toThrow()
    plain.font = '90px sans-serif'
    expect(plain.font).toBe('90px sans-serif')
  })

  it('is actually called by make(), which no runtime here can reach', async () => {
    // **A source assertion, and the reason is a mutation that survived.**
    // `make()` needs OffscreenCanvas, so under node its body cannot be
    // executed at all — deleting `interceptFont(ctx)` from it left the whole
    // suite green while every text layer in the browser silently rendered in
    // the engine's own sans instead of the vendored face. Same technique, and
    // the same justification, as `site/markup.test.ts`: grep the source when
    // the contract is unreachable, and pin the regex so it cannot quietly
    // match nothing.
    const src = await readFile(new URL('./canvas.ts', import.meta.url), 'utf8')
    const body = /make\(w: number, h: number\): Ctx2D \{([\s\S]*?)\n    \},/.exec(src)?.[1]
    expect(body, 'the make() body regex matched nothing').toBeDefined()
    expect(body).toContain('interceptFont(ctx)')
    expect(body!.indexOf('interceptFont(ctx)'))
      .toBeLessThan(body!.indexOf('return asCtx2D(ctx)'))
  })
})
