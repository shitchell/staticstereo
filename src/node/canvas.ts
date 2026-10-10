import { GlobalFonts, createCanvas, loadImage as skLoadImage } from '@napi-rs/canvas'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type {
  CanvasLike, Ctx2D, DecodedGif, DecodedImage,
} from '../core/canvaslike.js'
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
 */

/**
 * Preference order per generic. Verified against `GlobalFonts.has` on this
 * machine: of the sans list `DejaVu Sans`, `Liberation Sans` and `Noto Sans` are
 * present and `Arial`/`Helvetica` are not; same pattern for serif and mono. The
 * absent names are kept because they are what a macOS or Windows host has, and
 * a candidate that is missing costs one `has()` call.
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
const SANS = ['DejaVu Sans', 'Liberation Sans', 'Noto Sans', 'Arial', 'Helvetica'] as const
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

const fontIsInstalled: InstalledPredicate = family => GlobalFonts.has(family)

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

interface Token {
  readonly text: string
  /** Index of the first character after the token. */
  readonly end: number
}

/**
 * Whitespace-separated tokens, with a quoted run kept whole.
 *
 * Only enough of a CSS tokeniser to find where the family list starts. A comma
 * is its own token so that `48px Foo,bar` cannot be mistaken for one family.
 */
function tokenize(s: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < s.length) {
    const c = s[i]!
    if (/\s/.test(c)) { i++; continue }
    if (c === ',') { out.push({ text: ',', end: i + 1 }); i++; continue }
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < s.length && s[j] !== c) j += s[j] === '\\' ? 2 : 1
      j = Math.min(j + 1, s.length)
      out.push({ text: s.slice(i, j), end: j })
      i = j
      continue
    }
    let j = i
    while (j < s.length && !/[\s,"']/.test(s[j]!)) j++
    out.push({ text: s.slice(i, j), end: j })
    i = j
  }
  return out
}

/** `<absolute-size>` and `<relative-size>` keywords, which need no unit. */
const SIZE_KEYWORDS = new Set([
  'xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large',
  'xxx-large', 'smaller', 'larger',
])

const LENGTH_RE = new RegExp(
  '^[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?' +
  '(?:px|pt|pc|in|cm|mm|q|em|rem|ex|ch|ic|cap|lh|rlh|vw|vh|vi|vb|vmin|vmax|%)$',
  'i',
)

/**
 * Is this token the shorthand's `<font-size>`?
 *
 * The discriminator against `<font-weight>` is the unit: `700` is a weight and
 * `700px` is a size, so scanning left to right for the first *dimensioned*
 * number finds the size even in `700 48px sans-serif`. A `/ <line-height>` may
 * be glued on, so only the part before the first `/` is tested.
 */
function isSizeToken(text: string): boolean {
  const core = text.split('/')[0]!
  return core === '0' || LENGTH_RE.test(core) || SIZE_KEYWORDS.has(core.toLowerCase())
}

/**
 * Index into `font` where the `<font-family>` list begins, or `-1`.
 *
 * Per the shorthand grammar the family list is everything after the size and
 * its optional `/ <line-height>`. Returning `-1` for anything without a size
 * means an unparseable value is passed through untouched rather than guessed
 * at — CSS ignores an invalid `font` shorthand, and so should this.
 */
function familyListStart(font: string): number {
  const tokens = tokenize(font)
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i]!.text === ',') return -1  // a comma before any size: not a shorthand
    if (!isSizeToken(tokens[i]!.text)) continue
    let last = i
    // `48px/1.2` is already whole; `48px / 1.2` and `48px /1.2` and `48px/ 1.2`
    // are not. Skip whatever the line-height occupies.
    if (!tokens[i]!.text.includes('/')) {
      const next = tokens[i + 1]
      if (next?.text === '/') last = i + 2
      else if (next?.text.startsWith('/')) last = i + 1
    } else if (tokens[i]!.text.endsWith('/')) {
      last = i + 1
    }
    const family = tokens[last + 1]
    return family === undefined ? -1 : tokens[last]!.end
  }
  return -1
}

/** Top-level (quote-aware) comma split of a family list. */
function splitFamilies(list: string): string[] {
  const out: string[] = []
  let start = 0
  let quote = ''
  for (let i = 0; i < list.length; i++) {
    const c = list[i]!
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = ''
    } else if (c === '"' || c === "'") {
      quote = c
    } else if (c === ',') {
      out.push(list.slice(start, i))
      start = i + 1
    }
  }
  out.push(list.slice(start))
  return out
}

/**
 * Rewrite every CSS generic family in a `font` shorthand to an installed one.
 *
 * Only the generic *tokens* move: `bold 240px "Some Font", sans-serif` becomes
 * `bold 240px "Some Font", DejaVu Sans`, leaving the author's own family first
 * in the list so the real fallback order survives. A **quoted** entry is never
 * rewritten even if it spells a generic, because CSS says a quoted name is a
 * family name — `"serif"` requests a font literally called serif.
 *
 * Exported for its own test: the parsing is where this can go wrong quietly,
 * and it is pure, so it should be tested without a canvas.
 */
export function resolveFontGenerics(
  font: string, installed: InstalledPredicate = fontIsInstalled,
): string {
  const start = familyListStart(font)
  if (start < 0) return font
  const families = splitFamilies(font.slice(start)).map(raw => {
    const entry = raw.trim()
    if (entry === '' || entry.startsWith('"') || entry.startsWith("'")) return entry
    const key = entry.replace(/\s+/g, ' ').toLowerCase()
    const candidates = GENERIC_FAMILIES[key]
    return candidates === undefined ? entry : resolveGeneric(key, candidates, installed)
  })
  return `${font.slice(0, start).trim()} ${families.join(', ')}`
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
