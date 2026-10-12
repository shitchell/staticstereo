import { VENDORED_FAMILY, VENDORED_WEIGHTS } from '../src/shared/fontspec.js'

/**
 * Load the vendored face before anything is rasterised.
 *
 * **Why this exists at all.** `@font-face` in `site/styles.css` *declares* the
 * family; it does not load it. A browser loads a declared face lazily, when
 * some DOM text needs it — and canvas text is not DOM text, so nothing on this
 * page ever triggers it. `ctx.fillText` with a declared-but-unloaded family
 * does not wait and does not fail: it silently draws in a fallback face. That
 * is the same shape of bug as the dingbats (`src/node/canvas.ts`), one layer
 * up, and it would be invisible — the picture would simply be measured wrong.
 *
 * So the load is explicit, it is awaited before the first paint, and
 * `src/web/canvas.ts` independently refuses to retarget `sans-serif` until
 * `FontFaceSet.check` says the face is really usable. Two gates, because the
 * failure is silent and this project has been bitten by exactly that twice.
 *
 * **Every weight, eagerly.** `document.fonts.load` resolves per weight, and
 * the weight a scene uses can change at any keystroke in the Weight control or
 * the scene JSON. Loading on demand would mean the first frame after each
 * change is drawn in the wrong face. Three files, ~62 KB total, once.
 */

/** The shorthand `FontFaceSet.load` needs: a weight, a size, and the family. */
function faceSpec(weight: number): string {
  return `${weight} 16px "${VENDORED_FAMILY}"`
}

export interface FontLoadResult {
  /** Is the family usable for canvas text now? */
  ready: boolean
  /** Weights that loaded. */
  loaded: readonly number[]
  /** Why not, when `ready` is false. */
  problem?: string
}

/**
 * Await the vendored weights. Resolves either way — never rejects.
 *
 * A font that fails to load is a degradation (the engine's own sans, which is
 * what this page used before the files were vendored), not a reason to leave
 * the visitor with a blank page. The caller surfaces the problem; the render
 * proceeds.
 */
export async function loadVendoredFont(
  fonts: FontFaceSet | undefined = typeof document === 'undefined' ? undefined : document.fonts,
): Promise<FontLoadResult> {
  if (!fonts || typeof fonts.load !== 'function') {
    return {
      ready: false,
      loaded: [],
      problem: 'this browser exposes no document.fonts, so a webfont cannot be ' +
        'loaded for canvas use; text will render in the browser\'s own sans-serif',
    }
  }

  const loaded: number[] = []
  const failures: string[] = []
  await Promise.all(VENDORED_WEIGHTS.map(async weight => {
    try {
      const faces = await fonts.load(faceSpec(weight))
      // An **empty array is a failure**, and the one that actually happens: the
      // promise resolves rather than rejecting when no declared face matches
      // the request, so a typo in the @font-face family name or a 404 on the
      // woff2 looks exactly like success to anyone who only awaits it.
      if (faces.length === 0) failures.push(`${weight}: no @font-face matched`)
      else loaded.push(weight)
    } catch (err) {
      failures.push(`${weight}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }))

  const ready = typeof fonts.check === 'function'
    ? fonts.check(faceSpec(400))
    : loaded.length > 0
  loaded.sort((a, b) => a - b)
  if (ready && failures.length === 0) return { ready, loaded }
  return {
    ready,
    loaded,
    problem:
      `the vendored font "${VENDORED_FAMILY}" did not fully load ` +
      `(${failures.join('; ') || 'FontFaceSet.check still reports it unusable'}). ` +
      `Text renders in this browser's own sans-serif instead, so the legibility ` +
      `panel will not agree with the stroke table in the README.`,
  }
}
