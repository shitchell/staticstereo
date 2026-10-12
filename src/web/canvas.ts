import type {
  CanvasLike, Ctx2D, DecodedGif, DecodedImage,
} from '../core/canvaslike.js'
import { VENDORED_FAMILY, rewriteFontFamilies } from '../shared/fontspec.js'
import { decodeGif } from '../shared/gif.js'
import { anyTransparent } from '../shared/pixels.js'

/**
 * The browser implementation of `CanvasLike`, over `OffscreenCanvas`.
 *
 * Nothing in `src/core/` may import this file; the dependency runs one way,
 * with the adapter handed *into* core as a parameter. Nothing here may import
 * `src/node/` or a `node:` builtin either — `index.test.ts` asserts that, since
 * a stray builtin is what would break the published site's bundle.
 *
 * **This file is deliberately thin.** `OffscreenCanvas` does not exist under
 * node and jsdom/happy-dom do not rasterise, so nothing in the drawing path can
 * be tested without a browser. The response to that is architectural rather
 * than a mock: every piece with behaviour worth asserting — the GIF disposal
 * model, the gifenc interop shim, the 2-colour palette guard, the alpha probe —
 * lives in `src/shared/`, where it runs under node and is tested. What is left
 * here is argument checking, platform forwarding, and error messages.
 */

/**
 * `OffscreenCanvasRenderingContext2D` satisfies `Ctx2D` at runtime but not by
 * assignability: its `fillStyle` is `string | CanvasGradient | CanvasPattern`
 * and its `textBaseline` is the full six-value DOM union, and mutable properties
 * are invariant in TypeScript. `Ctx2D` deliberately narrows both, so a real
 * context is a *supertype* on those two members and the compiler rejects the
 * assignment in either direction. Narrowing the surface area core may touch is
 * the whole point of `Ctx2D`, so the cast stays here, in one place, rather than
 * being paid for by widening the interface. (Design §2: one cast per adapter,
 * accepted.)
 *
 * The compensating control for the Node adapter is a test that exercises every
 * `Ctx2D` member against the real context. **The web adapter has no such test**
 * — it cannot have one outside a browser — so the cast here is backed only by
 * the DOM spec being the same API the Node binding imitates.
 */
function asCtx2D(ctx: unknown): Ctx2D {
  return ctx as Ctx2D
}

/**
 * Why a hand-written message instead of letting the platform throw.
 *
 * The native failure is `ReferenceError: OffscreenCanvas is not defined`, which
 * sends the reader into their bundler config. The actual cause is almost always
 * one of two import mistakes — using `staticstereo/web` from node, or from a
 * runtime without the API — so say that, and name the fix.
 */
function missingApi(where: string, api: string, instead: string): Error {
  return new Error(
    `${where}: ${api} is not available in this environment. The web adapter ` +
    `needs a browser or worker that implements it; under node use ${instead} ` +
    `from "staticstereo/node" instead.`,
  )
}

function requireOffscreenCanvas(where: string, instead: string): void {
  if (typeof OffscreenCanvas === 'undefined') {
    throw missingApi(where, 'OffscreenCanvas', instead)
  }
}

function describeCause(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

/* ===================================================================== */
/* THE VENDORED FACE                                                     */
/* ===================================================================== */

/**
 * Point `sans-serif` at the vendored face, so this adapter and the Node one
 * rasterise the same outlines.
 *
 * **Unlike Node, the browser's own generic mapping is correct**, so there is
 * nothing to fix here — there is something to *agree* on. `core` asks for
 * `sans-serif`; Chromium answered that with Liberation Sans on the machine
 * this was measured on while the Node adapter answered DejaVu Sans, and the
 * site's legibility panel therefore disagreed with `stst` by 10–25% on every
 * stroke width. Rewriting the generic to {@link VENDORED_FAMILY} — the
 * `@font-face` family `site/styles.css` declares over
 * `assets/fonts/inter-*.woff2`, byte-identical in `glyf` and `hmtx` to the
 * TTFs Node registers — removes the disagreement at its source.
 *
 * **Only `sans-serif`, and only when the face is really there.** The other
 * generics are left to the engine, which knows its own host. And a webfont that
 * has not finished loading is not usable from a canvas: `fillText` with an
 * unavailable family falls back silently, which is the same class of failure as
 * the dingbats. So availability is checked rather than assumed, through
 * `FontFaceSet.check`, and when the answer is no the generic is passed through
 * untouched and the engine's own sans is used — today's behaviour, not a
 * regression. `site/fonts.ts` is what makes the answer become yes.
 *
 * Cached once it turns true, because a loaded font cannot unload and `check`
 * is then called on every `ctx.font` assignment, i.e. once per text layer per
 * frame.
 */
let vendoredAvailable = false

function fontSet(): FontFaceSet | undefined {
  // `document.fonts` on a page, `self.fonts` in a worker — both are
  // `FontFaceSet`, and OffscreenCanvas is reachable from either.
  if (typeof document !== 'undefined' && document.fonts) return document.fonts
  const scope = globalThis as { fonts?: FontFaceSet }
  return scope.fonts
}

/** Is the vendored family loaded and usable for canvas text right now? */
export function vendoredFontAvailable(): boolean {
  if (vendoredAvailable) return true
  const fonts = fontSet()
  if (!fonts || typeof fonts.check !== 'function') return false
  try {
    // A size is mandatory in the shorthand `check` parses; 16px is arbitrary
    // and does not affect the answer, which is per family and weight.
    vendoredAvailable = fonts.check(`16px "${VENDORED_FAMILY}"`)
  } catch {
    // An invalid shorthand throws per spec. Quoted family plus a size cannot
    // be invalid, but a non-conforming engine must degrade, not break drawing.
    vendoredAvailable = false
  }
  return vendoredAvailable
}

/** The rewrite applied to every `font` assignment on a context from here. */
export function resolveWebFont(
  font: string, available: () => boolean = vendoredFontAvailable,
): string {
  return rewriteFontFamilies(font, key =>
    key === 'sans-serif' && available() ? VENDORED_FAMILY : undefined)
}

/**
 * Shadow `font` on one context so assignments pass through the rewrite.
 *
 * Same technique and the same reasoning as the Node adapter's `interceptFont`:
 * an own accessor on the instance, so every other member stays native and no
 * method loses its receiver. Unlike Node's, this one **cannot throw** when the
 * accessor is missing — a browser without `font` on its 2D context prototype
 * does not exist, and the fallback (leave the property alone) is a correct
 * rendering in the engine's own sans rather than a dead page.
 *
 * **Exported only because it is otherwise untestable.** `make()` needs
 * `OffscreenCanvas`, which node does not have, so deleting the call to this
 * function from `make()` broke no test — a mutation that survived. The
 * mechanism is now exercised against a stand-in object carrying a `font`
 * accessor on its prototype (`canvas.test.ts`), and the *call site* is pinned
 * by a source assertion in the same file, in the manner `site/markup.test.ts`
 * and `src/core/purity.test.ts` already use for contracts no runtime here can
 * reach.
 */
export function interceptFont(ctx: object): void {
  const proto = Object.getPrototypeOf(ctx) as object
  const desc = Object.getOwnPropertyDescriptor(proto, 'font')
  if (typeof desc?.get !== 'function' || typeof desc.set !== 'function') return
  const get = desc.get
  const set = desc.set
  Object.defineProperty(ctx, 'font', {
    configurable: true,
    enumerable: true,
    get: () => get.call(ctx) as string,
    set: (value: string) => { set.call(ctx, resolveWebFont(String(value))) },
  })
}

/**
 * Bytes for any URL the platform can fetch: `http(s):`, `data:`, `blob:`, or a
 * site-relative path.
 *
 * Unlike the Node adapter there is no filesystem fallback — a bare path is a
 * URL relative to the document, which is what a browser caller means by it.
 * Cross-origin sources need CORS headers, as for any `fetch`.
 */
async function fetchOk(src: string): Promise<Response> {
  const res = await fetch(src)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  return res
}

export function webCanvas(): CanvasLike {
  return {
    make(w: number, h: number): Ctx2D {
      if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
        throw new Error(`webCanvas.make: bad size ${w}x${h}; both must be >= 1`)
      }
      requireOffscreenCanvas('webCanvas.make', 'nodeCanvas()')
      const canvas = new OffscreenCanvas(Math.round(w), Math.round(h))
      // The rasteriser reads every surface back with `getImageData`, once per
      // frame, which is exactly the access pattern this hint exists for: it
      // keeps the backing store on the CPU instead of round-tripping the GPU.
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        throw new Error(
          `webCanvas.make: OffscreenCanvas.getContext("2d") returned null for ` +
          `${w}x${h}. The surface was refused — usually too large, or the ` +
          `canvas was already claimed by another context type.`,
        )
      }
      // Every surface core can draw text on goes through the generic rewrite.
      // Per context rather than once on the prototype, so a caller using
      // OffscreenCanvas directly keeps the platform's own semantics.
      interceptFont(ctx)
      return asCtx2D(ctx)
    },

    async loadImage(src: string): Promise<DecodedImage> {
      if (typeof createImageBitmap === 'undefined') {
        throw missingApi(`webCanvas.loadImage("${src}")`, 'createImageBitmap',
          'nodeCanvas()')
      }
      requireOffscreenCanvas(`webCanvas.loadImage("${src}")`, 'nodeCanvas()')

      let bitmap: ImageBitmap
      try {
        // The response's own Blob, not a byte copy: it carries the server's
        // Content-Type, and the browser decodes it off-thread.
        bitmap = await createImageBitmap(await (await fetchOk(src)).blob())
      } catch (err) {
        throw new Error(`failed to load image "${src}": ${describeCause(err)}`,
          { cause: err })
      }

      const { width, height } = bitmap
      if (width < 1 || height < 1) {
        throw new Error(`failed to load image "${src}": decoded to ${width}x${height}`)
      }

      // An ImageBitmap exposes no pixels, so the only way to answer `hasAlpha`
      // is to rasterise once. It matters: the rasteriser picks silhouette vs
      // heightmap mode off this flag, so guessing would silently change how
      // every image renders. One decode per layer, at load time, is the right
      // price — and `RasterCache` means it happens once per render, not once
      // per frame.
      const probe = new OffscreenCanvas(width, height)
      const pctx = probe.getContext('2d', { willReadFrequently: true })
      if (!pctx) {
        throw new Error(
          `failed to load image "${src}": could not get a 2d context to probe ` +
          `its alpha channel`,
        )
      }
      pctx.drawImage(bitmap, 0, 0)
      const hasAlpha = anyTransparent(pctx.getImageData(0, 0, width, height).data)

      // Known gap, deliberately not papered over here: an `ImageBitmap` holds
      // decoded pixels until `close()` or GC, and `DecodedImage` has nowhere to
      // put a disposer — `CanvasLike` has no teardown hook, and inventing one
      // unilaterally would widen the seam the design (§2) keeps narrow. For the
      // current callers this is bounded: layers are decoded once per render and
      // held by `RasterCache` for its lifetime. A long-lived page that swaps
      // scenes repeatedly will want an explicit release on the interface.
      return { width, height, handle: bitmap, hasAlpha }
    },

    /**
     * Decode an animated GIF. Touches no canvas at all — `omggif` is pure
     * JavaScript over the bytes — so this is the one method of the web adapter
     * that is fully covered by the test suite.
     *
     * `createImageBitmap` cannot be used instead: it decodes a single frame and
     * discards the timing, which is the whole point of a GIF layer.
     */
    async loadGif(src: string): Promise<DecodedGif> {
      let bytes: Uint8Array
      try {
        bytes = new Uint8Array(await (await fetchOk(src)).arrayBuffer())
      } catch (err) {
        throw new Error(`failed to read GIF "${src}": ${describeCause(err)}`,
          { cause: err })
      }
      return decodeGif(bytes, src)
    },
  }
}
