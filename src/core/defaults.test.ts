/**
 * `DEFAULT_STEREO`, pinned **behaviourally**.
 *
 * `render.test.ts`'s "resolveStereo fills every field from DEFAULT_STEREO" is a
 * restatement of the literals in `types.ts`: it reads the same object the
 * implementation reads, so it is green whatever those literals say, and green
 * whether or not any of them reaches the encoder. An audit found `algorithm`
 * had been effectively unpinned for exactly that reason — the one place it was
 * asserted was a copy of the constant it came from.
 *
 * So every field is pinned here by what it *does* instead, in one shape:
 *
 * 1. A render with no `stereo:` block at all must be **byte-identical** to a
 *    render with that one field written out explicitly at its default value.
 *    That is what proves the default travels from `DEFAULT_STEREO` through
 *    `resolveStereo`, the margin calculation and the encoder literal in
 *    `renderFrame` and into the pixels. A field that is dropped on the way
 *    cannot pass this, because the explicit spelling would be dropped too —
 *    *and* the default half of the comparison fixes the value, so changing a
 *    default without touching this file turns it red.
 * 2. The same render must **differ** from one with that field set to some other
 *    valid value. That is what proves the field has an effect at all, and it is
 *    what stops (1) from being satisfiable by a field nothing reads.
 *
 * The pairs live in {@link PINS}, whose type is a mapped type over
 * {@link StereoKey}: a field added to `StereoOpts` is a compile error here
 * until it is pinned, the same mechanism `STEREO_KEYS` uses in `types.ts`.
 *
 * The scene is deliberately small but not degenerate — it needs a hard depth
 * step for `depthBlur` to have anything to soften, and depth that is neither
 * all background nor all foreground for `cross` to invert into something
 * different. It renders on `fakeCanvas`, so no native canvas is involved.
 */
import { describe, expect, it } from 'vitest'
import { renderFrame, stillTime } from './render.js'
import { fakeCanvas } from './testing/fakeCanvas.js'
import { report } from './testing/metamorphic.js'
import { STEREO_KEYS } from './types.js'
import type { Scene, StereoKey, StereoOpts } from './types.js'

/**
 * A scene with **no `stereo:` block**, so every setting comes from
 * `DEFAULT_STEREO`. 200px of stage at the shipped `sepFar` is a 310px plate at
 * the default encoder; the slab's two edges are the depth steps.
 */
const BASE: Scene = {
  size: [200, 8],
  layers: [{ type: 'shape', shape: 'rect', at: [60, 0], w: 90, h: 8, depth: 1 }],
}

/** `[the default, something else valid]` for one field. */
type Pins = { readonly [K in StereoKey]: readonly [StereoOpts[K], StereoOpts[K]] }

/**
 * The defaults, written out as literals rather than read from
 * `DEFAULT_STEREO` — that is the whole point. Read from the constant, the
 * comparisons below would hold for any value it happened to contain.
 *
 * The second member only has to be valid and different; `resolveStereo`
 * rejects `sepNear >= sepFar`, a non-integer `noiseScale`, a negative
 * `depthBlur` and an unknown `algorithm`, so these stay inside those bounds.
 */
const PINS: Pins = {
  sepFar: [110, 120],
  sepNear: [92, 60],
  noiseScale: [2, 1],
  depthBlur: [0, 3],
  cross: [false, true],
  seed: [0, 1],
  // 'linked' as of 2026-10-09; see DEFAULT_STEREO's own comment for the
  // measurement and the blinded comparison behind it.
  algorithm: ['linked', 'shift'],
}

function withField(key: StereoKey, value: unknown): Scene {
  return { ...BASE, stereo: { [key]: value } as Partial<StereoOpts> }
}

/**
 * Everything a frame of this scene can differ in, as one comparable string.
 *
 * The dimensions are in it because two of the pinned fields change them rather
 * than only the pixels: margins are `marginsFor(sepFar, algorithm)` (§10.3) and
 * `noiseScale` multiplies the whole plate. Comparing pixel buffers alone would
 * have made "differs" throw on a length mismatch instead of reporting one.
 */
async function signature(scene: Scene): Promise<string> {
  const frame = await renderFrame(scene, stillTime(scene), fakeCanvas())
  return `${frame.width}x${frame.height}+${frame.stage.x}:${frame.pixels.join(',')}`
}

/** Just the emitted geometry, for the dimensions survey below. */
async function dimensions(scene: Scene): Promise<string> {
  const frame = await renderFrame(scene, stillTime(scene), fakeCanvas())
  return `${frame.width}x${frame.height}+${frame.stage.x}`
}

describe('DEFAULT_STEREO is pinned by behaviour, not by restating its literals', () => {
  it('pins every field STEREO_KEYS names, with two distinct values each', () => {
    // The mapped type already makes a missing or misspelled key a compile
    // error. This is the runtime half, so the failure names the field.
    expect(Object.keys(PINS).sort()).toEqual([...STEREO_KEYS].sort())
    for (const key of STEREO_KEYS) {
      expect(PINS[key][0], `${key}: the two pinned values must differ`)
        .not.toEqual(PINS[key][1])
    }
  })

  it.each(STEREO_KEYS)(
    '%s: the default reaches the encoder, and the field changes the output',
    async key => {
      const [dflt, other] = PINS[key]
      const defaults = await signature(BASE)

      // (1) The default is wired through: naming it explicitly changes nothing.
      // Red if DEFAULT_STEREO[key] is no longer `dflt`, and red if the field is
      // dropped somewhere between the scene and the encoder.
      expect(
        await signature(withField(key, dflt)),
        `${key}: a render with no stereo block must equal one with ` +
        `${key}: ${JSON.stringify(dflt)} — either the default moved or it ` +
        `never reaches the encoder`,
      ).toBe(defaults)

      // (2) The field does something, so (1) is not vacuous.
      expect(
        await signature(withField(key, other)),
        `${key}: ${JSON.stringify(other)} rendered the same bytes as the ` +
        `default ${JSON.stringify(dflt)} — the field has no effect here`,
      ).not.toBe(defaults)
    },
  )

  // Recorded because it is easy to assume otherwise, and because it is why
  // `signature` carries the dimensions. Margins come from
  // `marginsFor(sepFar, algorithm)` and `noiseScale` scales the plate, so
  // exactly those three resize the emitted grid.
  //
  // `cross` does NOT, despite inverting depth: `sep(z)` still ranges over
  // `[sepNear, sepFar]` and the margin is sized from the worst case over
  // depth, which is what makes `cross` need no special case in `marginsFor`.
  // It changes every pixel and not one dimension.
  it('records which fields move the plate and which only repaint it', async () => {
    const base = await dimensions(BASE)
    const moved: StereoKey[] = []
    const rows: string[] = []
    for (const key of STEREO_KEYS) {
      const got = await dimensions(withField(key, PINS[key][1]))
      if (got !== base) moved.push(key)
      rows.push(`${key}=${JSON.stringify(PINS[key][1])} → ${got}`)
    }
    report(`plate at the defaults: ${base}`, rows.join(' | '))
    expect(moved).toEqual(['sepFar', 'noiseScale', 'algorithm'])
  })
})
