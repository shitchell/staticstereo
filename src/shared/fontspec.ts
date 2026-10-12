/**
 * The vendored face, and just enough of a CSS `font` parser to retarget it.
 *
 * **Why this is shared and not per-adapter.** `core` sets `ctx.font` to
 * `48px sans-serif` (`raster.ts`'s `DEFAULT_FONT_FAMILY`) and must keep doing
 * so: which concrete families exist is a property of the host, and
 * `purity.test.ts` forbids `core` from knowing anything about the host. So each
 * adapter answers the generic itself — and if the two answer it differently,
 * the site's legibility panel and `stst` measure different faces for the same
 * scene, which is exactly the disagreement this project already documented and
 * could not fix while the answer was "whatever the host happens to have".
 *
 * Both adapters therefore resolve `sans-serif` to {@link VENDORED_FAMILY}, and
 * the *parsing* that finds the family list inside a `font` shorthand lives here
 * so there is one implementation of it rather than two that drift. This file
 * imports nothing — it is as safe in a browser bundle as in `core`.
 *
 * What this file does **not** do is decide the fallback chain. Node's chain is
 * `GlobalFonts`-dependent and throws when nothing resolves; the browser's is
 * the engine's own and must not be overridden. Those stay in the adapters.
 */

/**
 * The family name both adapters register the vendored files under.
 *
 * **Not "Inter", deliberately**, even though that is what these files are. Two
 * reasons, and the second is the one that matters:
 *
 *  1. The 900 instance's own family name is `Inter Black`, because static RIBBI
 *     naming carries four styles per family and no more. Registering the three
 *     files under one name of our own is what makes them one family with three
 *     weights — verified: `GlobalFonts.families` reports
 *     `[{weight:400},{weight:700},{weight:900}]` for this family.
 *  2. A host may have its own Inter installed, at a different version, with
 *     different metrics. If the vendored registration silently failed we would
 *     then measure that one and call it success. Under a name no font vendor
 *     ships, "is the vendored face in use?" has a yes-or-no answer, and
 *     `canvas.vendored.test.ts` asks it.
 */
export const VENDORED_FAMILY = 'Staticstereo Sans'

/**
 * The weights shipped, in `assets/fonts/inter-<weight>.{ttf,woff2}`.
 *
 * 400/700/900 and not a finer ramp: those are the three CSS keywords an author
 * actually reaches for (`normal`, `bold`, and the heaviest thing available),
 * each extra weight costs ~58 KB of TTF and ~21 KB of WOFF2, and a request for
 * 500 resolves to the nearest of these rather than failing. 900 earns its place
 * by being a **real face** — the previous system-font chain declared only
 * 400 and 700, so `weight: 900` was synthesised by the rasteriser, which is why
 * one test comparing 900 to bold behaved differently on two machines.
 */
export const VENDORED_WEIGHTS = [400, 700, 900] as const

/** `assets/fonts/inter-400.ttf`, … — relative to the repository root. */
export function vendoredFontPath(weight: number, ext: 'ttf' | 'woff2'): string {
  return `assets/fonts/inter-${weight}.${ext}`
}

/* ===================================================================== */
/* THE `font` SHORTHAND                                                  */
/* ===================================================================== */

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
 * How one unquoted family name is rewritten. `undefined` leaves it alone.
 *
 * Receives the name normalised to lower case with runs of whitespace collapsed,
 * because that is the form a generic keyword has to be recognised in
 * (`SANS-SERIF` and `Sans-Serif` are the same keyword).
 */
export type FamilyRewrite = (normalised: string) => string | undefined

/**
 * Rewrite families inside a `font` shorthand, leaving everything else alone.
 *
 * Only the family *tokens* move: `bold 240px "Some Font", sans-serif` becomes
 * `bold 240px "Some Font", Staticstereo Sans`, keeping the author's own family
 * first so the real fallback order survives. A **quoted** entry is never
 * rewritten even if it spells a generic, because CSS says a quoted name is a
 * family name — `"serif"` requests a font literally called serif.
 *
 * Pure, and exported for its own test: the parsing is where this can go wrong
 * quietly, and it needs no canvas to check.
 */
export function rewriteFontFamilies(font: string, rewrite: FamilyRewrite): string {
  const start = familyListStart(font)
  if (start < 0) return font
  const families = splitFamilies(font.slice(start)).map(raw => {
    const entry = raw.trim()
    if (entry === '' || entry.startsWith('"') || entry.startsWith("'")) return entry
    const replacement = rewrite(entry.replace(/\s+/g, ' ').toLowerCase())
    return replacement === undefined ? entry : replacement
  })
  return `${font.slice(0, start).trim()} ${families.join(', ')}`
}
