/**
 * The CSS generic font families, and a test that can tell a glyph from a prop.
 *
 * ## The bug this file exists for
 *
 * `core` asks for `sans-serif` (`raster.ts`'s `DEFAULT_FONT_FAMILY`), which is
 * correct CSS. `@napi-rs/canvas` maps no generic family at all, and an unmatched
 * family does not fail — it silently renders the **first registered family**,
 * which on a stock Debian fontconfig is `D050000L`, the URW ZapfDingbats clone.
 * `stst still --text HELLO`, the headline one-liner in the README, therefore
 * shipped five dingbats.
 *
 * ## Why "some ink was drawn" could not catch it
 *
 * `canvas.test.ts` already asserted that `fillText` with `40px sans-serif`
 * marks more than 50 pixels. It did, in abundance, in the wrong alphabet. Ink
 * counts cannot see this: measured here, the dingbat fallback puts *more* ink on
 * the canvas than DejaVu Sans does for the same string.
 *
 * **The discriminator that works is relative advance width.** A substitute font
 * standing in for Latin text has advances uncorrelated with Latin letter
 * widths — the dingbat fallback is very nearly monospaced (`I` 74.07px, `W`
 * 69.84px at 90px), so `WWW` comes out *narrower* than `III`. Every real Latin
 * sans has the opposite and much larger relation. Measured ink-extent ratios,
 * `WWW` ÷ `III`:
 *
 * | family                       | 90px  | 240px |
 * |------------------------------|-------|-------|
 * | the unresolved fallback       | 0.944 | 0.946 |
 * | DejaVu Sans                   | 4.210 | 4.193 |
 * | Liberation Sans               | 4.322 | 4.346 |
 * | Noto Sans                     | 2.929 | 2.938 |
 *
 * A threshold of 2 separates those by a factor of 1.5 on the tight side and 4.5
 * on the loose one, and the quantity is scale-invariant, which is why the same
 * number works at both sizes.
 *
 * ## Why the negative control is synthetic and not "the same thing unresolved"
 *
 * The obvious control — measure the ratio with the generic forced through
 * unresolved and assert it is low — **is a test of the runner's fontconfig, not
 * of this code.** It passes here only because this machine's first registered
 * family happens to be a dingbat font; a runner whose first family is a real
 * sans would render `sans-serif` correctly by luck and the assertion would fail
 * on correct code. That exact mistake was already made once in this repo
 * (`metamorphic.real.test.ts` pinned a 900-vs-bold ratio that passed locally and
 * failed in CI), so it is not made again here.
 *
 * What *is* asserted instead is machine-independent in both directions:
 *
 *  1. the resolved path clears the threshold (real Latin glyphs), and
 *  2. a **synthetic** uniform-advance rendering — one equal box per character,
 *     drawn with no font involved, which is what substitute rendering looks
 *     like — falls below it.
 *
 * (2) is the proof the metric is not vacuous, and it cannot be invalidated by
 * anyone's font stack. The unresolved measurement is still taken, and
 * *reported*, so the evidence stays visible in CI output without being
 * load-bearing.
 */
import { describe, expect, it } from 'vitest'
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import { nodeCanvas, resolveFontGenerics, CSS_GENERIC_FAMILIES } from './canvas.js'
import { rasterDepth } from '../core/raster.js'
import { report } from '../core/testing/metamorphic.js'
import type { Scene } from '../core/types.js'

const canvas = nodeCanvas()

/**
 * The ratio a real Latin rendering must clear.
 *
 * Calibrated, not derived: the narrowest real family measured here is Noto Sans
 * at 2.93 and the widest substitute rendering is 1.0 (a perfect monospace), so
 * 2 is the round number in the middle of a gap that spans a factor of three.
 */
const LATIN_RATIO = 2

/* --------------------------------------------------------------- metric */

/**
 * Horizontal extent of the ink in a depth map, in samples.
 *
 * Extent and not ink *count*: count does not discriminate. Measured, the
 * dingbat fallback draws 1.93× more ink for `WWW` than for `III` and DejaVu Sans
 * 3.69× — overlapping ranges once a third family is involved — while the
 * extents differ by 0.944 against 4.210.
 *
 * Thresholded at half the peak, matching `site/legibility.ts`'s `INK_FRACTION`,
 * so the antialiasing fringe does not add a pixel per side to a narrow stem.
 */
function inkExtent(depth: ArrayLike<number>, w: number, h: number): number {
  let peak = 0
  for (let i = 0; i < depth.length; i++) if (depth[i]! > peak) peak = depth[i]!
  if (peak <= 0) return 0
  const t = peak * 0.5
  let lo = Infinity
  let hi = -Infinity
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (depth[y * w + x]! >= t) {
        if (x < lo) lo = x
        if (x > hi) hi = x
      }
    }
  }
  return hi < lo ? 0 : hi - lo + 1
}

/** Ink extent of `text` rendered through the real pipeline: core → adapter. */
async function extentOf(text: string, size: number, font?: string): Promise<number> {
  const w = Math.round(size * 2.5 * text.length) + 80
  const h = Math.round(size * 2.5)
  const scene: Scene = {
    size: [w, h],
    layers: [{ type: 'text', text, size, at: [20, 20], ...(font ? { font } : {}) }],
  }
  const depth = await rasterDepth(scene, 0, canvas)
  return inkExtent(depth, w, h)
}

/** `WWW` ÷ `III` — near 1 for any substitute, ≥ 2.9 for real Latin glyphs. */
async function widthRatio(size: number, font?: string): Promise<number> {
  const narrow = await extentOf('III', size, font)
  const wide = await extentOf('WWW', size, font)
  expect(narrow).toBeGreaterThan(0)
  return wide / narrow
}

/* ------------------------------------------------------- the environment */

describe('the environment this fix is for', () => {
  it('has no family named after any CSS generic', () => {
    const installed = new Set(GlobalFonts.families.map(f => f.family))
    const present = CSS_GENERIC_FAMILIES.filter(g => installed.has(g) || GlobalFonts.has(g))
    report('installed concrete families', GlobalFonts.families.length)
    report('CSS generics present as real families', present.length === 0 ? 'none' : present.join(', '))
    // If this ever fails the premise has changed, not the code: a host that
    // really has a family called "sans-serif" needs no resolution at all.
    expect(present).toEqual([])
    expect(GlobalFonts.families.length).toBeGreaterThan(0)
  })

  it('silently substitutes rather than failing, which is why this was invisible', () => {
    // The mechanism, measured rather than asserted from the docs: an unknown
    // family and a generic produce *identical* metrics, because both land on
    // whatever family happens to be registered first.
    const ctx = createCanvas(10, 10).getContext('2d')
    ctx.font = '90px sans-serif'
    const generic = ctx.measureText('HELLO').width
    ctx.font = '90px NoSuchFamilyExistsAnywhere'
    const unknown = ctx.measureText('HELLO').width
    report('raw @napi-rs/canvas HELLO width: generic vs unknown family',
      `${generic.toFixed(2)} vs ${unknown.toFixed(2)}`)
    expect(generic).toBeCloseTo(unknown, 6)
  })
})

/* ------------------------------------------------------------ the parser */

describe('resolveFontGenerics', () => {
  const sans = resolveFontGenerics('48px sans-serif').replace(/^48px /, '')

  it('resolves to a family this machine actually has', () => {
    report('sans-serif resolves to', sans)
    expect(GlobalFonts.has(sans)).toBe(true)
    expect(sans).not.toBe('sans-serif')
  })

  it('resolves each generic to an installed family', () => {
    const rows: string[] = []
    for (const g of CSS_GENERIC_FAMILIES) {
      const family = resolveFontGenerics(`48px ${g}`).replace(/^48px /, '')
      rows.push(`${g}→${family}`)
      expect(GlobalFonts.has(family)).toBe(true)
    }
    report('generic resolution', rows.join(' '))
  })

  it('keeps the rest of the shorthand intact', () => {
    expect(resolveFontGenerics('bold 240px sans-serif')).toBe(`bold 240px ${sans}`)
    expect(resolveFontGenerics('italic 900 12pt sans-serif')).toBe(`italic 900 12pt ${sans}`)
    expect(resolveFontGenerics('small-caps bold 2em sans-serif')).toBe(`small-caps bold 2em ${sans}`)
  })

  it('finds the size even when a weight also looks like a number', () => {
    // `700 48px sans-serif` — the discriminator is the unit, not the position.
    expect(resolveFontGenerics('700 48px sans-serif')).toBe(`700 48px ${sans}`)
    expect(resolveFontGenerics('700 48px Georgia')).toBe('700 48px Georgia')
  })

  it('handles a line-height in all four spellings', () => {
    for (const size of ['48px/1.2', '48px / 1.2', '48px /1.2', '48px/ 1.2']) {
      expect(resolveFontGenerics(`bold ${size} sans-serif`)).toBe(`bold ${size} ${sans}`)
    }
  })

  it('accepts an absolute-size keyword as the size', () => {
    expect(resolveFontGenerics('bold x-large sans-serif')).toBe(`bold x-large ${sans}`)
  })

  it('leaves concrete families alone', () => {
    expect(resolveFontGenerics('240px DejaVu Sans')).toBe('240px DejaVu Sans')
    expect(resolveFontGenerics('bold 48px "Comic Sans MS"')).toBe('bold 48px "Comic Sans MS"')
    // Not installed here, and still not this function's business: resolving a
    // generic is a different job from substituting for a missing family.
    expect(resolveFontGenerics('48px Helvetica Neue')).toBe('48px Helvetica Neue')
  })

  it('rewrites only the generic entries of a comma-separated list', () => {
    expect(resolveFontGenerics('bold 240px "Some Font", sans-serif'))
      .toBe(`bold 240px "Some Font", ${sans}`)
    expect(resolveFontGenerics('48px Georgia, serif'))
      .toBe(`48px Georgia, ${resolveFontGenerics('48px serif').replace(/^48px /, '')}`)
    expect(resolveFontGenerics("48px 'My, Font', monospace, Georgia"))
      .toBe(`48px 'My, Font', ${resolveFontGenerics('48px monospace').replace(/^48px /, '')}, Georgia`)
  })

  it('keeps the author\'s own family first, so the real fallback order survives', () => {
    const out = resolveFontGenerics('48px "Some Font", sans-serif')
    expect(out.indexOf('Some Font')).toBeLessThan(out.indexOf(sans))
  })

  it('is case-insensitive on the keyword and preserves surrounding spacing', () => {
    expect(resolveFontGenerics('48px SANS-SERIF')).toBe(`48px ${sans}`)
    expect(resolveFontGenerics('48px   Sans-Serif')).toBe(`48px ${sans}`)
  })

  it('does not rewrite a QUOTED generic, because CSS says that is a family name', () => {
    // `"serif"` requests a font literally called serif. Honouring the quotes is
    // what keeps this function a CSS implementation rather than a guess.
    expect(resolveFontGenerics('48px "sans-serif"')).toBe('48px "sans-serif"')
    expect(resolveFontGenerics("48px 'monospace'")).toBe("48px 'monospace'")
  })

  it('passes through anything that is not a font shorthand', () => {
    // CSS ignores an invalid `font` value; so does this, rather than guessing.
    for (const bad of ['', 'sans-serif', 'bold', 'inherit', 'Georgia, sans-serif']) {
      expect(resolveFontGenerics(bad)).toBe(bad)
    }
  })
})

/* ---------------------------------------------------------- the contexts */

describe('nodeCanvas font resolution', () => {
  it('rewrites the generic on assignment and reports what will render', () => {
    const ctx = canvas.make(10, 10)
    ctx.font = '90px sans-serif'
    report('ctx.font after assigning "90px sans-serif"', ctx.font)
    expect(ctx.font).not.toContain('sans-serif')
    expect(GlobalFonts.has(ctx.font.replace(/^90px /, ''))).toBe(true)
  })

  it('leaves a raw @napi-rs/canvas context untouched', () => {
    // The interception is per-surface, not a prototype patch, so nothing else
    // in the process changes behaviour.
    const raw = createCanvas(10, 10).getContext('2d')
    raw.font = '90px sans-serif'
    expect(raw.font).toBe('90px sans-serif')
  })

  it('throws, naming the generic and the escape hatch, when nothing resolves', () => {
    // The failure mode that replaces silent dingbats, reached by handing the
    // resolver a host with no fonts at all. `GlobalFonts.has` is declared
    // non-writable AND non-configurable, so it cannot be stubbed — hence the
    // injected predicate rather than a spy.
    const bare = () => false
    expect(() => resolveFontGenerics('48px sans-serif', bare)).toThrow(/sans-serif/)
    expect(() => resolveFontGenerics('48px sans-serif', bare)).toThrow(/DejaVu Sans/)
    expect(() => resolveFontGenerics('48px sans-serif', bare)).toThrow(/Liberation Sans/)
    expect(() => resolveFontGenerics('48px sans-serif', bare)).toThrow(/"font"/)
    // Every generic, so none of them can keep a silent fallback.
    for (const g of CSS_GENERIC_FAMILIES) {
      expect(() => resolveFontGenerics(`48px ${g}`, bare)).toThrow(new RegExp(g))
    }
    // ...and the empty host really was the only thing stopping it.
    expect(() => resolveFontGenerics('48px sans-serif')).not.toThrow()
  })
})

/* ------------------------------------------------------- the real thing */

describe('the default text layer renders Latin glyphs, not a substitute', () => {
  it('WWW is far wider than III through the default font', async () => {
    // THE regression test. `rasterDepth` with no `font` on the layer is exactly
    // what `stst still --text HELLO` does, so this fails the moment core's
    // generic stops being resolved.
    for (const size of [90, 240]) {
      const ratio = await widthRatio(size)
      report(`default font, ${size}px: WWW/III ink extent`, ratio.toFixed(3))
      expect(ratio).toBeGreaterThanOrEqual(LATIN_RATIO)
    }
  })

  it('and so does an explicitly named concrete family, as the upper control', async () => {
    const ratio = await widthRatio(90, 'DejaVu Sans')
    report('DejaVu Sans, 90px: WWW/III ink extent', ratio.toFixed(3))
    expect(ratio).toBeGreaterThanOrEqual(LATIN_RATIO)
  })

  it('rejects a uniform-advance rendering, which is what a substitute looks like',
    async () => {
      // THE PROOF THE METRIC IS NOT VACUOUS, and it involves no font at all:
      // one equal box per character, which is the limiting case of substitute
      // rendering. If the threshold could not see this it could not see the
      // bug either. Machine-independent by construction — see the file header
      // for why the unresolved generic itself is NOT asserted on.
      const boxes = async (text: string): Promise<number> => {
        const size = 90
        const w = size * text.length + 80
        const h = size * 2
        const ctx = canvas.make(w, h)
        ctx.fillStyle = '#ffffff'
        for (let i = 0; i < text.length; i++) {
          ctx.fillRect(20 + i * size, 20, Math.round(size * 0.72), size)
        }
        const px = ctx.getImageData(0, 0, w, h).data
        const depth = new Float32Array(w * h)
        for (let i = 0; i < depth.length; i++) depth[i] = px[i * 4 + 3]! / 255
        return inkExtent(depth, w, h)
      }
      const ratio = await boxes('WWW') / await boxes('III')
      report('synthetic equal-advance boxes: WWW/III ink extent', ratio.toFixed(3))
      expect(ratio).toBeLessThan(LATIN_RATIO)
    })

  it('reports — but does not assert — the unresolved generic, for the record',
    async () => {
      // Measured through a raw context so nothing here is resolved. On this
      // machine it is 0.944 against the resolved 4.210, which is the whole bug
      // in two numbers. NOT asserted: see the file header.
      const extent = (text: string): number => {
        const size = 90
        const w = size * 3 * text.length + 80
        const h = size * 3
        const ctx = createCanvas(w, h).getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.textBaseline = 'top'
        ctx.font = `${size}px sans-serif`
        ctx.fillText(text, 20, 20)
        const px = ctx.getImageData(0, 0, w, h).data
        const depth = new Float32Array(w * h)
        for (let i = 0; i < depth.length; i++) depth[i] = px[i * 4 + 3]! / 255
        return inkExtent(depth, w, h)
      }
      const unresolved = extent('WWW') / extent('III')
      const resolved = await widthRatio(90)
      report('WWW/III ink extent: unresolved generic → resolved',
        `${unresolved.toFixed(3)} → ${resolved.toFixed(3)}`)
      expect(Number.isFinite(unresolved)).toBe(true)
    })
})
