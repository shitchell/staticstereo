import { GlobalFonts, createCanvas, loadImage as skLoadImage } from '@napi-rs/canvas'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type {
  CanvasLike, Ctx2D, DecodedGif, DecodedImage,
} from '../core/canvaslike.js'
import {
  VENDORED_FAMILY, VENDORED_WEIGHTS, rewriteFontFamilies, vendoredFontPath,
} from '../shared/fontspec.js'
import { decodeGif } from '../shared/gif.js'
import { anyTransparent } from '../shared/pixels.js'

/**
 * The Node implementation of `CanvasLike`, over `@napi-rs/canvas`.
 *
 * Nothing in `src/core/` may import this file; the dependency runs one way, with
 * the adapter handed *into* core as a parameter.
 */

/**
 * `SKRSContext2D` satisfies `Ctx2D` at runtime but not by assignability: its
 * `fillStyle` is `string | CanvasGradient | CanvasPattern` and its
 * `textBaseline` is the full six-value DOM union, and mutable properties are
 * invariant in TypeScript. `Ctx2D` deliberately narrows both, so a real context
 * is a *supertype* on those two members and the compiler rejects the assignment
 * in either direction. Narrowing the surface area core may touch is the whole
 * point of `Ctx2D`, so the cast stays here, in one place, rather than being
 * paid for by widening the interface.
 *
 * The `canvas.test.ts` suite exercises every `Ctx2D` member against the real
 * context so this cast cannot silently become untrue.
 */
function asCtx2D(ctx: unknown): Ctx2D {
  return ctx as Ctx2D
}

/* ===================================================================== */
/* CSS GENERIC FONT FAMILIES                                             */
/* ===================================================================== */

/**
 * **`@napi-rs/canvas` maps no CSS generic family, and the fallback is silent.**
 *
 * `core` sets `font` to `48px sans-serif` by default (`raster.ts`'s
 * `DEFAULT_FONT_FAMILY`), which is correct CSS and works in the browser. Here it
 * does not resolve at all: measured on this machine, `GlobalFonts.families`
 * lists 269 concrete families and `sans-serif`, `serif` and `monospace` are all
 * absent, with `GlobalFonts.has('sans-serif') === false`. An unmatched family
 * does not fail — it falls through to the *first registered family*, which on a
 * stock Debian fontconfig is `D050000L` (the URW ZapfDingbats clone). Measured:
 * `90px sans-serif`, `90px D050000L` and `90px ThisFontDoesNotExist123` all
 * return byte-identical metrics (`III` 222.21px, `WWW` 209.52px), and
 * `stst still --text HELLO` rendered five dingbats.
 *
 * So this is not tofu in the `.notdef`-box sense; it is worse, because dingbats
 * look deliberate. It is also invisible to any "some ink was drawn" assertion:
 * ink was drawn, in abundance, in the wrong alphabet. The discriminator that
 * does see it is in `canvas.generics.test.ts` — under the dingbat fallback
 * `WWW` is *narrower* than `III` (ratio 0.94), whereas with real Latin glyphs it
 * is 3.35× wider.
 *
 * **Why the resolution lives here and not in `core`.** Which concrete families
 * exist is a property of the host, and `core` may not know about the host:
 * `purity.test.ts` forbids `src/core/` from importing anything non-relative, and
 * a browser has its own, correct generic mapping that this table must not
 * override. So `core` keeps asking for `sans-serif` — the right request — and
 * the adapter answers it, in the same file as the one other documented
 * platform quirk.
 *
 * **Why resolving to a system family was not enough.** It fixed the dingbats
 * and left two problems. The face was still a property of the host — DejaVu
 * Sans here, something else on a macOS or CI runner, and the README's stroke
 * table is only true of one of them. And the browser resolves the same generic
 * by its own rules, measured as Liberation Sans in Chromium on this machine, so
 * the site's legibility panel and `stst` reported different numbers for the
 * same scene and neither was wrong. The fix for both is to stop asking the host:
 * `assets/fonts/inter-{400,700,900}.ttf` are vendored into the repository,
 * registered here under {@link VENDORED_FAMILY}, and put **first** in the sans
 * chain, with the system families kept behind them as the degradation path. The
 * browser declares the same three files, under the same family name, via
 * `@font-face` in `site/styles.css`. See `assets/fonts/PROVENANCE.txt`.
 */

/* ===================================================================== */
/* THE VENDORED FACE                                                     */
/* ===================================================================== */

/**
 * What one attempt to register `assets/fonts/inter-*.ttf` produced.
 *
 * Exported because it is the only honest answer to "which face am I looking
 * at?", and because `canvas.vendored.test.ts` has to be able to tell the
 * vendored face from a system fallback — the two differ by 20–30% on every
 * stroke measurement this project makes, so a test that cannot distinguish them
 * is a test that passes while the font layer is broken. Which is the failure
 * this whole file is a monument to.
 */
export interface VendoredFont {
  readonly family: string
  /** `GlobalFonts.has(family)` after registering — the authoritative answer. */
  readonly registered: boolean
  /** Absolute paths, in registration order. */
  readonly files: readonly string[]
  /** Weights `GlobalFonts` reports for the family; `[]` when unregistered. */
  readonly weights: readonly number[]
  /** Per-file reasons, when something went wrong. Empty on success. */
  readonly problems: readonly string[]
}

let attempt: VendoredFont | undefined

/**
 * Register the vendored face, once per process, and report what happened.
 *
 * **Lazy rather than at module load.** Importing this adapter must not have
 * side effects for a caller who only wants `loadGif`, and the laziness is also
 * what makes the ordering safe: every path that resolves a generic family goes
 * through {@link fontIsInstalled}, which calls this first, so the registration
 * cannot lose a race with the resolution that depends on it.
 *
 * **It degrades, it does not throw.** A missing or corrupt file leaves the
 * system chain below as the answer for `sans-serif`, which is what this adapter
 * did before the files existed — worse-looking output, not dingbats, because
 * the generic still resolves to *something installed*. A throw here would turn
 * a cosmetic regression into a dead CLI. One `process.emitWarning` is the
 * compromise: silence is what let the dingbats ship for a whole day.
 */
function registerVendoredFont(): VendoredFont {
  const root = new URL('../../', import.meta.url)
  const files = VENDORED_WEIGHTS.map(w =>
    fileURLToPath(new URL(vendoredFontPath(w, 'ttf'), root)))
  const problems: string[] = []
  for (const path of files) {
    let key: unknown = null
    try {
      key = GlobalFonts.registerFromPath(path, VENDORED_FAMILY)
    } catch (err) {
      problems.push(`${path}: ${describeCause(err)}`)
      continue
    }
    // `registerFromPath` returns null for a missing file and for a file that is
    // not a font; measured, it throws for neither.
    if (key === null) problems.push(`${path}: @napi-rs/canvas refused the file`)
  }

  const registered = GlobalFonts.has(VENDORED_FAMILY)
  const weights = registered
    ? (GlobalFonts.families.find(f => f.family === VENDORED_FAMILY)?.styles ?? [])
      .map(s => s.weight)
    : []

  if (!registered) {
    process.emitWarning(
      `staticstereo: could not register the vendored font family ` +
      `"${VENDORED_FAMILY}" from ${files.join(', ')}` +
      `${problems.length > 0 ? ` (${problems.join('; ')})` : ''}. ` +
      `Text will be drawn with whichever system sans is installed instead, so ` +
      `measurements will not match the stroke table in the README and the ` +
      `browser build will not agree with this one.`,
    )
  }
  return { family: VENDORED_FAMILY, registered, files, weights, problems }
}

/** The one registration attempt, memoised. Safe to call on every lookup. */
export function vendoredFont(): VendoredFont {
  attempt ??= registerVendoredFont()
  return attempt
}

/**
 * Preference order per generic. **The vendored face is first**, which is the
 * point of vendoring it: the face is then a property of this repository rather
 * than of the host, and the browser resolves the same generic to the same
 * family (see `src/web/canvas.ts`), so the site's legibility panel and `stst`
 * stop measuring different fonts for the same scene.
 *
 * The system families stay behind it as the degradation path. Verified against
 * `GlobalFonts.has` on this machine: of the sans list `DejaVu Sans`,
 * `Liberation Sans` and `Noto Sans` are present and `Arial`/`Helvetica` are
 * not; same pattern for serif and mono. The absent names are kept because they
 * are what a macOS or Windows host has, and a candidate that is missing costs
 * one `has()` call.
 *
 * Serif and monospace are deliberately **not** vendored. Nothing in this
 * project measures them, nobody has reported them, and a face per generic is
 * another 174 KB each for a request no scene in the repository makes.
 *
 * `cursive`, `fantasy`, `emoji` and `math` have **no safe concrete substitute**,
 * so they degrade onto the sans or serif list. That is a choice rather than a
 * measurement, and the reasoning is worth writing down because the obvious
 * alternative is worse: `Noto Color Emoji` *is* installed here and mapping
 * `emoji` to it would be the "faithful" answer, but it carries no Latin
 * coverage at all, so `font: emoji` with the word HELLO in it would render
 * unreadable boxes — reintroducing, for one generic, exactly the failure this
 * block exists to remove. An author who genuinely wants an emoji or a script
 * face can name it: `font: 'Noto Color Emoji'` is passed through untouched.
 * Readable text in the wrong voice beats unreadable text, and beats an error
 * for a request that is satisfiable.
 */
const SANS = [
  VENDORED_FAMILY, 'DejaVu Sans', 'Liberation Sans', 'Noto Sans', 'Arial', 'Helvetica',
] as const
const SERIF = ['DejaVu Serif', 'Liberation Serif', 'Noto Serif', 'Times New Roman'] as const
const MONO = ['DejaVu Sans Mono', 'Liberation Mono', 'Noto Sans Mono', 'Courier New'] as const

const GENERIC_FAMILIES: Readonly<Record<string, readonly string[]>> = {
  'sans-serif': SANS,
  'serif': SERIF,
  'monospace': MONO,
  'system-ui': SANS,
  'ui-sans-serif': SANS,
  'ui-serif': SERIF,
  'ui-monospace': MONO,
  'ui-rounded': SANS,
  'cursive': SANS,
  'fantasy': SANS,
  'emoji': SANS,
  'math': SERIF,
}

/** The generic keywords this adapter rewrites, for error messages and tests. */
export const CSS_GENERIC_FAMILIES: readonly string[] = Object.keys(GENERIC_FAMILIES)

/**
 * "Is this family installed?" — `GlobalFonts.has` in production.
 *
 * A parameter rather than a direct call for exactly one reason: `GlobalFonts`
 * declares `has` as non-writable *and* non-configurable, so it cannot be
 * stubbed, spied or redefined, and the no-candidate-resolves branch would
 * otherwise be untestable on any machine that has DejaVu. An unreachable
 * `throw` is a `throw` nobody has read, and this one carries the whole
 * diagnosis.
 */
export type InstalledPredicate = (family: string) => boolean

/**
 * The production predicate, which is also where the vendored face gets
 * registered — see {@link vendoredFont} for why the two are the same call.
 */
const fontIsInstalled: InstalledPredicate = family => {
  vendoredFont()
  return GlobalFonts.has(family)
}

/**
 * First installed candidate for a generic, or a thrown error naming the list.
 *
 * **Throwing is the point.** The pre-fix behaviour was to render dingbats and
 * report success, which is unfixable from the outside: the author sees garbage
 * and has no reason to suspect the font layer. An error that names the generic,
 * every family that was tried, and the escape hatch (`font:` on the layer) is
 * strictly better than any silent substitute.
 */
function resolveGeneric(
  generic: string, candidates: readonly string[], installed: InstalledPredicate,
): string {
  for (const family of candidates) {
    if (installed(family)) return family
  }
  const present = GlobalFonts.families.map(f => f.family)
  const sample = present.slice(0, 6).join(', ')
  throw new Error(
    `cannot resolve the CSS generic font family "${generic}": @napi-rs/canvas ` +
    `maps no generic families, and none of the concrete candidates is ` +
    `installed on this machine (tried ${candidates.join(', ')}). ` +
    `Set a text layer's "font" to a family that is installed — ` +
    `${present.length} are installed${sample ? `, e.g. ${sample}` : ''}. ` +
    `Leaving the generic unresolved would silently render the first ` +
    `registered family instead, which is how this used to ship dingbats.`,
  )
}

/**
 * Rewrite every CSS generic family in a `font` shorthand to an installed one.
 *
 * The parsing — finding the `<font-family>` list inside a `font` shorthand and
 * splitting it — lives in `src/shared/fontspec.ts`, because the web adapter
 * performs the same rewrite and two copies of a CSS tokeniser is two things to
 * get wrong. What stays here is the part that is Node's alone: the candidate
 * lists, the `GlobalFonts` lookup, and the throw.
 *
 * Exported for its own test: the parsing is where this can go wrong quietly,
 * and it is pure, so it should be tested without a canvas.
 */
export function resolveFontGenerics(
  font: string, installed: InstalledPredicate = fontIsInstalled,
): string {
  return rewriteFontFamilies(font, key => {
    const candidates = GENERIC_FAMILIES[key]
    return candidates === undefined ? undefined : resolveGeneric(key, candidates, installed)
  })
}

/**
 * Shadow `font` on one context so assignments pass through the resolver.
 *
 * An own accessor on the instance rather than a wrapper object or a `Proxy`:
 * every other member stays the native one, so no method loses its receiver and
 * the `Ctx2D` surface cannot drift out of sync with what the real context
 * supports. The getter reports the *resolved* value — what will actually render
 * — rather than echoing the request back.
 */
function interceptFont(ctx: object): void {
  const proto = Object.getPrototypeOf(ctx) as object
  const desc = Object.getOwnPropertyDescriptor(proto, 'font')
  if (typeof desc?.get !== 'function' || typeof desc.set !== 'function') {
    throw new Error(
      'nodeCanvas: @napi-rs/canvas no longer exposes "font" as an accessor on ' +
      'CanvasRenderingContext2D.prototype, so CSS generic families can no ' +
      'longer be resolved here. See the generic-family block in ' +
      'src/node/canvas.ts.',
    )
  }
  const get = desc.get
  const set = desc.set
  Object.defineProperty(ctx, 'font', {
    configurable: true,
    enumerable: true,
    get: () => get.call(ctx) as string,
    set: (value: string) => { set.call(ctx, resolveFontGenerics(String(value))) },
  })
}

/** Bytes for a local path, a `file:` URL, an `http(s)` URL, or a data URL. */
async function readBytes(src: string): Promise<Uint8Array> {
  if (/^https?:/i.test(src) || /^data:/i.test(src)) {
    const res = await fetch(src)
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    return new Uint8Array(await res.arrayBuffer())
  }
  if (src.startsWith('file:')) return readFile(fileURLToPath(src))
  return readFile(src)
}

function describeCause(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export function nodeCanvas(): CanvasLike {
  return {
    make(w: number, h: number): Ctx2D {
      if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
        throw new Error(`nodeCanvas.make: bad size ${w}x${h}; both must be >= 1`)
      }
      // **Register before the surface exists, not when a generic is resolved.**
      // Found by measurement, and it is the dingbat bug wearing a different
      // hat: a layer that names the vendored family *concretely*
      // (`font: "Staticstereo Sans"`) never touches `resolveFontGenerics`, so
      // nothing triggered the registration and `@napi-rs/canvas` fell through
      // to the first registered family — measured, `90px Staticstereo Sans`
      // returned 367.47px for HELLO, the URW Dingbats advance, instead of
      // 289.03px. Worse, it is *sticky*: the resolution is cached per context
      // per font string, so registering afterwards did not repair that
      // context — a later `90px sans-serif` resolved to the same string, hit
      // the poisoned entry and still measured 367.47.
      //
      // Doing it here closes both halves, because no context can be handed out
      // before the family exists. It is still lazy in the sense that matters:
      // importing this module has no side effect, and a caller who never draws
      // never pays. The call on the resolution path stays as well — belt and
      // braces for anyone holding a `Ctx2D` from somewhere else.
      vendoredFont()
      const canvas = createCanvas(Math.round(w), Math.round(h))
      const ctx = canvas.getContext('2d')
      // Every surface core can draw text on goes through the generic-family
      // resolver. Done per context rather than once on the prototype so that a
      // caller who uses `@napi-rs/canvas` directly keeps its own semantics.
      interceptFont(ctx)
      return asCtx2D(ctx)
    },

    async loadImage(src: string): Promise<DecodedImage> {
      let img
      try {
        img = await skLoadImage(src)
      } catch (err) {
        throw new Error(`failed to load image "${src}": ${describeCause(err)}`,
          { cause: err })
      }
      const width = img.naturalWidth || img.width
      const height = img.naturalHeight || img.height
      if (width < 1 || height < 1) {
        throw new Error(`failed to load image "${src}": decoded to ${width}x${height}`)
      }

      // `Image` exposes no pixels, so the only way to answer `hasAlpha` is to
      // rasterise once. It matters: the rasteriser picks silhouette vs heightmap
      // mode off this flag, so guessing would silently change how every image
      // renders. One decode per layer, at load time, is the right price.
      const probe = createCanvas(width, height)
      const pctx = probe.getContext('2d')
      pctx.drawImage(img, 0, 0)
      const hasAlpha = anyTransparent(pctx.getImageData(0, 0, width, height).data)

      return { width, height, handle: img, hasAlpha }
    },

    async loadGif(src: string): Promise<DecodedGif> {
      let bytes: Uint8Array
      try {
        bytes = await readBytes(src)
      } catch (err) {
        throw new Error(`failed to read GIF "${src}": ${describeCause(err)}`,
          { cause: err })
      }

      // The decode itself — including the disposal model, which is where all
      // the subtlety is — is shared with the web adapter. See
      // `src/shared/gif.ts`; `omggif` is dependency-free and isomorphic, so a
      // second copy would only be a second thing to get wrong.
      return decodeGif(bytes, src)
    },
  }
}
