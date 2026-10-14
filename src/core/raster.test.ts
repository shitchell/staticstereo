import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { PRESETS } from './anim/index.js'
import type { PresetCtx } from './anim/index.js'
import { marginsFor, plateLayoutOf } from './plate.js'
import { rasterDepth } from './raster.js'
import { fakeCanvas, rgbaImage, FAKE_CHAR_ASPECT } from './testing/fakeCanvas.js'
import type { FakeCanvas } from './testing/fakeCanvas.js'
import type { Scene, Track } from './types.js'

/** Grey ramp as an opaque image: luminance of a grey pixel is v/255. */
function greys(values: number[], alpha = 255) {
  return rgbaImage(values.length, 1, x => {
    const v = values[x]!
    return [v, v, v, alpha]
  })
}

function at(d: Float32Array, w: number, x: number, y: number): number {
  return d[y * w + x]!
}

describe('rasterDepth compositing', () => {
  /**
   * THE REGRESSION TEST (design §2.1, §6).
   *
   * The fixture matters: two *fully opaque* overlapping layers cannot catch an
   * alpha-blend regression, because with mask = 1 everywhere `out*(1-m) + d*m`
   * and `max(out, d*m)` agree. The bug only shows where the near layer's mask
   * is fractional, so the near layer here is an image whose right half has
   * alpha 128 — mask 0.5 at depth 1.0 over a layer at 0.6.
   *
   *   max:   max(0.6, 1.0 * 0.5) = 0.6   ← correct, no surface invented
   *   blend: 0.6 * 0.5 + 1.0 * 0.5 = 0.8 ← a surface floating in empty space
   *
   * The masks are otherwise exact (0 or 1) on purpose. On a real antialiasing
   * canvas a near layer's own edge ramp puts a 1px band of legitimately
   * intermediate depths along an overlap boundary — 16 such pixels, including
   * 0.769 and 0.780, for a 4px circle at 1.0 over a slab at 0.6 — so the
   * "nothing in (0.65, 0.95)" assertion is only meaningful over mask interiors.
   * What is forbidden is a whole region reading 0.8, which is what blending
   * produces and what this fixture isolates.
   */
  it('never blends two overlapping depths into an intermediate value', async () => {
    const canvas = fakeCanvas({
      images: {
        'half.png': rgbaImage(40, 10, x => [255, 255, 255, x < 20 ? 255 : 128]),
      },
    })
    const scene: Scene = {
      size: [40, 10],
      layers: [
        { type: 'shape', shape: 'rect', at: [0, 0], w: 40, h: 10, depth: 0.6 },
        { type: 'image', src: 'half.png', at: [0, 0], depth: 1.0 },
      ],
    }
    const d = await rasterDepth(scene, 0, canvas)

    const band = Array.from(d).filter(v => v > 0.65 && v < 0.95)
    expect(band).toEqual([])

    for (const v of d) {
      const ok = Math.abs(v - 0.6) < 1e-6 || Math.abs(v - 1.0) < 1e-6
      expect(ok, `unexpected depth ${v}; every pixel must be 0.6 or 1.0`).toBe(true)
    }
    expect(at(d, 40, 5, 5)).toBeCloseTo(1.0, 6) // opaque half: near layer wins
    expect(at(d, 40, 30, 5)).toBeCloseTo(0.6, 6) // half-alpha half: far layer wins
  })

  it('does not let a later far layer bury an earlier near one', async () => {
    const scene: Scene = {
      size: [8, 4],
      layers: [
        { type: 'shape', shape: 'rect', at: [0, 0], w: 8, h: 4, depth: 1.0 },
        { type: 'shape', shape: 'rect', at: [0, 0], w: 8, h: 4, depth: 0.6 },
      ],
    }
    const d = await rasterDepth(scene, 0, fakeCanvas())
    for (const v of d) expect(v).toBeCloseTo(1.0, 6)
  })

  it('returns background 0 where no layer draws', async () => {
    const scene: Scene = {
      size: [8, 4],
      layers: [{ type: 'shape', shape: 'rect', at: [0, 0], w: 4, h: 4, depth: 1 }],
    }
    const d = await rasterDepth(scene, 0, fakeCanvas())
    expect(d).toHaveLength(32)
    expect(at(d, 8, 0, 0)).toBeCloseTo(1, 6)
    expect(at(d, 8, 4, 0)).toBe(0)
    expect(at(d, 8, 7, 3)).toBe(0)
  })
})

describe('rasterDepth depth offsets', () => {
  it('clamps depth into [0,1] after animator depth offsets', async () => {
    const scene: Scene = {
      size: [4, 1],
      layers: [
        {
          type: 'shape', shape: 'rect', at: [0, 0], w: 4, h: 1, depth: 1,
          anim: { keys: [{ t: 0, depth: 0.5 }] },
        },
      ],
    }
    const d = await rasterDepth(scene, 0, fakeCanvas())
    for (const v of d) expect(v).toBeCloseTo(1, 6)
  })

  it('clamps a negative depth offset to 0 rather than going below background', async () => {
    const scene: Scene = {
      size: [4, 1],
      layers: [
        {
          type: 'shape', shape: 'rect', at: [0, 0], w: 4, h: 1, depth: 0.6,
          anim: { keys: [{ t: 0, depth: -1 }] },
        },
      ],
    }
    const d = await rasterDepth(scene, 0, fakeCanvas())
    for (const v of d) expect(v).toBe(0)
  })

  it('adds the animator depth offset to the layer base depth', async () => {
    const scene: Scene = {
      size: [4, 1],
      layers: [
        {
          type: 'shape', shape: 'rect', at: [0, 0], w: 4, h: 1, depth: 0.2,
          anim: { keys: [{ t: 0, depth: 0.5 }] },
        },
      ],
    }
    const d = await rasterDepth(scene, 0, fakeCanvas())
    for (const v of d) expect(v).toBeCloseTo(0.7, 6)
  })
})

describe('rasterDepth image to depth', () => {
  it('places a silhouette layer at one flat depth regardless of its luminance', async () => {
    // Alpha present -> auto silhouette. The varying greys must NOT reach depth.
    const spec = rgbaImage(4, 1, x => {
      const v = [64, 128, 200, 255][x]!
      return [v, v, v, x === 2 ? 0 : 255]
    })
    const canvas = fakeCanvas({ images: { 'sil.png': spec } })
    const scene: Scene = {
      size: [4, 1],
      layers: [{ type: 'image', src: 'sil.png', at: [0, 0], depth: 0.8 }],
    }
    const d = await rasterDepth(scene, 0, canvas)
    expect(Array.from(d).map(v => Number(v.toFixed(6)))).toEqual([0.8, 0.8, 0, 0.8])
  })

  it('maps luminance to depth in heightmap mode', async () => {
    const canvas = fakeCanvas({ images: { 'relief.png': greys([0, 64, 128, 255]) } })
    const scene: Scene = {
      size: [4, 1],
      layers: [{ type: 'image', src: 'relief.png', at: [0, 0] }], // opaque -> auto heightmap
    }
    const d = await rasterDepth(scene, 0, canvas)
    expect(at(d, 4, 0, 0)).toBeCloseTo(0, 5)
    expect(at(d, 4, 1, 0)).toBeCloseTo(64 / 255, 5)
    expect(at(d, 4, 2, 0)).toBeCloseTo(128 / 255, 5)
    expect(at(d, 4, 3, 0)).toBeCloseTo(1, 5)
  })

  it('thresholds brightness for opaque artwork given mask: {luma}', async () => {
    const canvas = fakeCanvas({ images: { 'logo.png': greys([0, 100, 200, 255]) } })
    const scene: Scene = {
      size: [4, 1],
      // No `mode`: a mask source only makes sense for a silhouette, so supplying
      // one selects silhouette even though the art is fully opaque. Without this
      // an opaque logo would fall through to heightmap and ignore `mask`.
      layers: [{ type: 'image', src: 'logo.png', at: [0, 0], depth: 0.9, mask: { luma: 0.5 } }],
    }
    const d = await rasterDepth(scene, 0, canvas)
    expect(Array.from(d).map(v => Number(v.toFixed(6)))).toEqual([0, 0, 0.9, 0.9])
  })

  it('lets an explicit mode override alpha auto-detection', async () => {
    const withAlpha = rgbaImage(4, 1, x => {
      const v = [0, 64, 128, 255][x]!
      return [v, v, v, 255 - x] // alpha < 255 somewhere -> would auto-detect silhouette
    })
    const canvas = fakeCanvas({ images: { 'a.png': withAlpha, 'b.png': greys([0, 64, 128, 255]) } })

    const asHeight = await rasterDepth(
      { size: [4, 1], layers: [{ type: 'image', src: 'a.png', at: [0, 0], mode: 'heightmap' }] },
      0, canvas,
    )
    expect(asHeight[1]).toBeGreaterThan(0)
    expect(asHeight[1]).toBeLessThan(asHeight[2]!)

    const asSilhouette = await rasterDepth(
      { size: [4, 1], layers: [{ type: 'image', src: 'b.png', at: [0, 0], depth: 0.7, mode: 'silhouette' }] },
      0, canvas,
    )
    for (const v of asSilhouette) expect(v).toBeCloseTo(0.7, 6)
  })
})

describe('rasterDepth layer transform', () => {
  it('applies the composed animator transform to layer position', async () => {
    const scene: Scene = {
      size: [20, 2],
      layers: [
        {
          type: 'shape', shape: 'rect', at: [0, 0], w: 4, h: 2, depth: 1,
          anim: { keys: [{ t: 0, x: 10 }] },
        },
      ],
    }
    const d = await rasterDepth(scene, 0, fakeCanvas())
    expect(at(d, 20, 0, 0)).toBe(0)
    expect(at(d, 20, 9, 0)).toBe(0)
    expect(at(d, 20, 10, 0)).toBeCloseTo(1, 6)
    expect(at(d, 20, 13, 0)).toBeCloseTo(1, 6)
    expect(at(d, 20, 14, 0)).toBe(0)
  })

  it('composes two animators additively', async () => {
    const scene: Scene = {
      size: [20, 2],
      layers: [
        {
          type: 'shape', shape: 'rect', at: [2, 0], w: 2, h: 2, depth: 1,
          anim: [{ keys: [{ t: 0, x: 4 }] }, { keys: [{ t: 0, x: 6 }] }],
        },
      ],
    }
    const d = await rasterDepth(scene, 0, fakeCanvas())
    expect(at(d, 20, 11, 0)).toBe(0)
    expect(at(d, 20, 12, 0)).toBeCloseTo(1, 6) // 2 + 4 + 6
    expect(at(d, 20, 13, 0)).toBeCloseTo(1, 6)
    expect(at(d, 20, 14, 0)).toBe(0)
  })

  it('applies scale about the layer anchor', async () => {
    const scene: Scene = {
      size: [20, 4],
      layers: [
        {
          type: 'shape', shape: 'rect', at: [0, 0], w: 4, h: 2, depth: 1,
          anim: { keys: [{ t: 0, scale: 2 }] },
        },
      ],
    }
    const d = await rasterDepth(scene, 0, fakeCanvas())
    expect(at(d, 20, 7, 3)).toBeCloseTo(1, 6)
    expect(at(d, 20, 8, 3)).toBe(0)
  })

  it('centres a circle on its `at`, defaulting to the scene centre', async () => {
    const scene: Scene = {
      size: [9, 9],
      layers: [{ type: 'shape', shape: 'circle', r: 2, depth: 1 }],
    }
    const d = await rasterDepth(scene, 0, fakeCanvas())
    expect(at(d, 9, 4, 4)).toBeCloseTo(1, 6)
    expect(at(d, 9, 0, 0)).toBe(0)
    expect(at(d, 9, 8, 8)).toBe(0)
  })
})

/**
 * Drawing and travel for a string wider than the stage — **and no longer the
 * measurement**, which is the next suite's job.
 *
 * This used to drive a `marquee`, whose endpoints the preset derived from the
 * `measureText` result the rasteriser puts in `PresetCtx.contentW`; a
 * rasteriser that stopped measuring therefore produced a visibly different
 * depth map here. §4.2b deleted `marquee` and `slide-in`, the only consumers
 * of `contentW`/`contentH`/`marginLeft`/`marginRight`, and the animator below
 * became a `move` with the endpoints written out as constants. The assertions
 * did not change and neither did the test count, so nothing marked the loss:
 * **measured at the time, forcing `contentW` to 0 in `raster.ts` left the
 * whole suite green. It no longer does.** The `rasterDepth preset context`
 * suite below closed that hole, and the same mutation now exits 1 — two
 * failures for `contentW = 0 * measureText(...)`, three if the `measureText`
 * call itself is dropped, all of them in that suite and none of them here.
 *
 * It is kept rather than rewritten because what it still asserts is real and
 * otherwise uncovered — glyphs drawn across a travel that starts and ends off
 * the stage cover the frame at mid-travel and clear it on schedule — but it
 * stands in for nothing else. `rasterDepth preset context` below witnesses
 * the measurement itself.
 */
describe('rasterDepth over-wide text geometry', () => {
  const CHARS = 100
  const SIZE = 10
  const STAGE_W = 40
  const CONTENT_W = CHARS * SIZE * FAKE_CHAR_ASPECT // 600px of text in a 40px stage

  /**
   * A small explicit `sepFar` so the plate margins are small, readable numbers
   * rather than the shipped 110/55 against a 40px stage.
   */
  const SEP_FAR = 10
  const MARGINS = marginsFor(SEP_FAR, 'shift') // { left: 10, right: 5 }

  /**
   * The endpoints the deleted `marquee` computed: `+sceneW + marginRight` to
   * `-(contentW + marginLeft)` (design §10.5). Written out as a `move` rather
   * than derived by a preset, because no preset derives them any more.
   */
  const FROM = STAGE_W + MARGINS.right
  const TO = -(CONTENT_W + MARGINS.left)
  const TRAVEL = FROM - TO

  function scrollScene(): Scene {
    return {
      size: [STAGE_W, 10],
      duration: 1,
      stereo: { sepFar: SEP_FAR, sepNear: 5 },
      layers: [
        {
          type: 'text', text: 'X'.repeat(CHARS), size: SIZE, at: [0, 0], depth: 1,
          // speed chosen so the derived duration is exactly 1s
          anim: {
            kind: 'move', from: [FROM, 0], to: [TO, 0], speed: TRAVEL, repeat: 'loop',
          },
        },
      ],
    }
  }

  it('spans the whole frame mid-travel when the text is wider than the scene', async () => {
    const d = await rasterDepth(scrollScene(), 0.5, fakeCanvas())
    for (const v of d) expect(v).toBeCloseTo(1, 6)
  })

  // "by its content width", not "by its *measured* width": `CONTENT_W` is a
  // constant here, and the rasteriser's own measurement is witnessed below.
  it('carries over-wide text off the left edge by its content width', async () => {
    // Sampled at whatever u puts the text's right edge at stage x = 12.8, so
    // the expectation stays on the column it was written for while the travel
    // itself is derived from the geometry.
    const u = (FROM - (12.8 - CONTENT_W)) / TRAVEL
    const d = await rasterDepth(scrollScene(), u, fakeCanvas())
    expect(at(d, STAGE_W, 12, 5)).toBeCloseTo(1, 6)
    expect(at(d, STAGE_W, 13, 5)).toBe(0)
    expect(at(d, STAGE_W, 39, 5)).toBe(0)
  })

  // Deliberately NOT tested here: that the travel ends off the *plate*.
  // `rasterDepth` returns a stage-sized depth map, so no assertion on an
  // untranslated frame can distinguish "parked in the left margin" from
  // "gone" — the margin columns do not exist yet at this stage of the
  // pipeline. `TO` above could not have carried it in any case: it is
  // recomputed from `CHARS` rather than measured, so pinning it would pin
  // this file's own arithmetic.
  //
  // **It is tested now, and not here.** `move's off-frame endpoints against
  // the plate`, below, asserts it against `PRESETS.move` with an `offLeft`
  // token — a registered verb computing the endpoint from the rasteriser's
  // own `measureText` result, which is what makes the assertion about shipped
  // behaviour rather than about a formula written in a test. That carrier did
  // not exist while `marquee` and `slide-in` were the only consumers, and its
  // absence is the whole reason this gap stood. It escapes the stage-sized-map
  // limitation by sliding the layer's resting origin right by a derived amount
  // and reading *where* the trailing edge lands, rather than by asserting that
  // a frame is empty — emptiness is also what a gross over-measurement
  // produces, and that is exactly how the old witness passed while measuring
  // nothing.
  //
  // (The verb was deleted by `9c2e924`. An earlier note here cited `b727dfa`,
  // which carries the same message and stat but is a pre-rebase twin and is
  // **not** an ancestor of `main` — settled with `git merge-base
  // --is-ancestor`, both ways, rather than by reading the message.)
})

/* ================================================== the compile context */

/**
 * What the rasteriser measures, and what it hands a preset.
 *
 * `rasterDepth` builds one `PresetCtx` per layer per frame (`raster.ts`): it
 * calls `measureText` for a text layer and puts the answer in `contentW`, and
 * it derives `marginLeft`/`marginRight` from the scene's own stereo settings
 * via `sceneMargins`. Both are live code on every frame of every scene.
 *
 * **The consumer came back, and these tests are still the producer's.**
 * `marquee` and `slide-in` read four of these fields and §4.2b deleted them,
 * which left `push`'s `layerDepth` as the only field any registered verb read
 * — measured at the time, forcing `contentW` to 0 or swapping the two margins
 * left all 51 files green. `move`'s symbolic endpoints read the other six, so
 * the production path has a consumer again and the suite that exercises it is
 * `move's off-frame endpoints against the plate`. These tests stay, and stay
 * probe-based, because they pin the producer *independently* of whatever the
 * registry happens to contain: a verb-side assertion can only ever say that
 * the endpoint and the glyphs agree, and that is a weaker claim than this
 * one's "the number handed over is the canvas's own answer for this string
 * under this font".
 *
 * **Why a test-local preset is the right seam.** `PRESETS` is the registry
 * `compilePreset` looks up by name at call time, so registering an entry is
 * exactly how `marquee` saw this context and exactly how P6's UI templates
 * will see it. The alternative is a new export from `raster.ts` — `prepare()`
 * is private and `rasterDepth` composites every layer into one buffer before a
 * caller sees anything — and a new seam into the rasteriser is a core API
 * decision that is not this task's to take.
 *
 * **Still not asserted *here*: that an off-frame endpoint lands off the
 * plate.** The reason is unchanged — the probe's endpoint would be arithmetic
 * written in this file, so pinning it would witness the test rather than the
 * rasteriser. What changed is that a registered verb computes one: `move`
 * resolves `offLeft`/`offRight` out of this very context, so the assertion
 * finally has a shipped carrier and lives in `move's off-frame endpoints
 * against the plate` below. What is asserted here remains the input side: the
 * measurement, the margins, and that the three add up to the plate the
 * renderer pads to.
 */
describe('rasterDepth preset context', () => {
  /**
   * A name no scene would use. Registered per test and deleted after, because
   * `PRESETS` is the live registry and `anim/presets.test.ts` asserts its exact
   * key set.
   */
  const PROBE = '__raster-ctx-probe'

  /** A one-key track that poses nothing: the default, for the ctx-only tests. */
  const STILL: Track = { keys: [{ t: 0 }], ease: 'linear', repeat: 'once' }

  /** Every context the rasteriser built, in layer order. */
  let seen: PresetCtx[] = []
  /** What the probe compiles to. Replaced by the tests that need a pose. */
  let emit: (ctx: PresetCtx) => Track = () => STILL

  beforeEach(() => {
    seen = []
    emit = () => STILL
    PRESETS[PROBE] = (_p, ctx) => {
      // Copied, not referenced: the rasteriser is free to reuse or mutate the
      // object it passes, and a test holding a live reference would assert on
      // whatever the last layer left behind.
      seen.push({ ...ctx })
      return emit(ctx)
    }
  })

  afterEach(() => {
    delete PRESETS[PROBE]
  })

  const STAGE: [number, number] = [200, 40]

  interface TextSpec {
    text: string
    size?: number
    weight?: string
    font?: string
  }

  function probeScene(spec: TextSpec, stereo?: Scene['stereo']): Scene {
    return {
      size: STAGE,
      duration: 1,
      ...(stereo === undefined ? {} : { stereo }),
      layers: [{ type: 'text', ...spec, at: [0, 0], depth: 1, anim: { kind: PROBE } }],
    }
  }

  async function ctxFor(scene: Scene): Promise<PresetCtx> {
    const before = seen.length
    await rasterDepth(scene, 0, fakeCanvas())
    // Guards every assertion below: a probe that never ran would make `seen`
    // stale and the margin comparisons would silently re-read an older layer.
    expect(seen.length).toBe(before + 1)
    return seen[seen.length - 1]!
  }

  describe('text measurement', () => {
    /**
     * One use of the font by the rasteriser. `width` is `measureText`'s answer
     * and is 0 for a fill, which returns nothing.
     */
    interface FontUse {
      readonly op: 'measure' | 'fill'
      readonly text: string
      readonly font: string
      readonly width: number
    }

    /**
     * A `fakeCanvas` that records every `measureText`/`fillText` call together
     * with the font set on the context at the time.
     *
     * Wrapping the *injected* canvas is what makes the call itself observable:
     * `contentW` alone cannot tell "measured this string under this font" from
     * "measured something else that happens to be the same width", and a stale
     * font is the failure mode here rather than a missing measurement.
     */
    function measuringCanvas(into: FontUse[]): FakeCanvas {
      const inner = fakeCanvas()
      return {
        ...inner,
        make(w, h) {
          const ctx = inner.make(w, h)
          const measure = ctx.measureText.bind(ctx)
          const fill = ctx.fillText.bind(ctx)
          ctx.measureText = text => {
            const m = measure(text)
            into.push({ op: 'measure', text, font: ctx.font, width: m.width })
            return m
          }
          ctx.fillText = (text, x, y) => {
            into.push({ op: 'fill', text, font: ctx.font, width: 0 })
            fill(text, x, y)
          }
          return ctx
        },
      }
    }

    function only(uses: readonly FontUse[], op: FontUse['op']): FontUse {
      const hits = uses.filter(u => u.op === op)
      expect(hits).toHaveLength(1)
      return hits[0]!
    }

    it('measures the layer text under the same font it draws it with', async () => {
      const uses: FontUse[] = []
      await rasterDepth(
        probeScene({ text: 'ABCDE', size: 20, weight: 'bold', font: 'serif' }),
        0,
        measuringCanvas(uses),
      )
      // The layer's own string, not a stand-in: measuring anything else is
      // measuring the wrong layer.
      expect(only(uses, 'measure').text).toBe('ABCDE')
      // The font the glyphs are drawn with. Measuring before assigning `font`
      // would measure under whatever face the context last held — a wrong
      // answer rather than a missing one, which is why the two are compared
      // instead of the measurement being checked on its own.
      expect(only(uses, 'measure').font).toBe(only(uses, 'fill').font)
      // And that font is the layer's whole spec, so none of the three fields a
      // scene can set is dropped on the way to the metrics.
      for (const part of ['bold', '20px', 'serif']) {
        expect(only(uses, 'measure').font).toContain(part)
      }
    })

    it('hands the measurement to presets as contentW, with the type size as contentH', async () => {
      const uses: FontUse[] = []
      await rasterDepth(probeScene({ text: 'ABCDE', size: 20 }), 0, measuringCanvas(uses))
      const measured = only(uses, 'measure').width
      expect(measured).toBeGreaterThan(0) // the fixture is not vacuous
      expect(seen).toHaveLength(1)
      // The canvas's answer, not a recomputation of it: a rasteriser that
      // estimated the width from the character count would agree with this
      // fake and disagree with every real face.
      expect(seen[0]!.contentW).toBe(measured)
      // `contentH` is the type size, deliberately — the em box, not an ink
      // extent the metrics do not report.
      expect(seen[0]!.contentH).toBe(20)
      expect(seen[0]!.sceneW).toBe(STAGE[0])
      expect(seen[0]!.sceneH).toBe(STAGE[1])
    })

    it('puts the measurement where a text layer is drawn, in both directions', async () => {
      // The probe parks the layer at `+contentW`. That is an off-frame endpoint
      // with its sign flipped: the quantity under test is the measurement, so
      // the pose *is* the measurement, and the first painted column must be it.
      emit = ctx => ({ keys: [{ t: 0, x: ctx.contentW }], ease: 'linear', repeat: 'once' })
      const cases: TextSpec[] = [
        { text: 'XX', size: 10 },
        { text: 'XXXX', size: 10 }, // twice the content
        { text: 'XX', size: 30 },   // three times the type size
      ]
      const offsets: number[] = []
      for (const spec of cases) {
        const uses: FontUse[] = []
        const d = await rasterDepth(probeScene(spec), 0, measuringCanvas(uses))
        const where = `${spec.text}@${spec.size}`
        // Exact and two-sided: an under-measurement moves the glyphs left of
        // the column the measurement names and an over-measurement right of
        // it, so a factor in either direction fails. The old `marquee` witness
        // could not do this — it sampled two columns either side of a boundary,
        // so a gross over-measurement pushed the text clear of both and passed.
        expect(firstPaintedColumn(d, STAGE[0]), where).toBe(only(uses, 'measure').width)
        offsets.push(firstPaintedColumn(d, STAGE[0]))
      }
      // Non-vacuous: three distinct places, so the assertion above cannot be
      // satisfied by any constant. The ratios are the content and type-size
      // ratios, which is the guarantee — geometry scales with the measurement.
      expect(new Set(offsets).size).toBe(cases.length)
      expect(offsets[1]).toBe(2 * offsets[0]!)
      expect(offsets[2]).toBe(3 * offsets[0]!)
    })
  })

  /**
   * The margins, which are the half of this context with a history.
   *
   * The plate/stage split exists because the edge columns were got wrong once,
   * and design §10.4 records that cropping the margins destroys fusion at
   * exactly the edges they were added to rescue. The arithmetic table lives in
   * `plate.test.ts`; what is pinned here is that the *rasteriser* hands a
   * preset the margins this scene's plate is actually padded to, so an
   * off-frame pose is expressed against the image that gets emitted.
   */
  describe('plate margins', () => {
    const SEP_FAR = 40 // even, so the halving below is exact

    function scene(s?: Scene['stereo']): Scene {
      return probeScene({ text: 'X' }, s)
    }

    it('is left-heavy under shift and symmetric under linked', async () => {
      const shift = await ctxFor(scene({ sepFar: SEP_FAR, sepNear: 20, algorithm: 'shift' }))
      const linked = await ctxFor(scene({ sepFar: SEP_FAR, sepNear: 20, algorithm: 'linked' }))
      // Stated as the two encoders' dead zones rather than as four numbers:
      // `shift` computes `out[x] = out[x - sep(x)]` and has no source column
      // for `x < sep`, so it loses `sepFar` on the left and nothing on the
      // right; `linked` constrains the centred pair `(x - sep/2, x + sep/2)`
      // and loses `sepFar/2` on each side. Both are swept with a probe in
      // `metamorphic.test.ts`, and the arithmetic is `plate.test.ts`'s table.
      expect(linked.marginLeft).toBe(linked.marginRight)
      expect(shift.marginLeft).toBeGreaterThan(shift.marginRight)
      expect(shift.marginLeft).toBe(2 * shift.marginRight)
      expect(shift.marginRight).toBe(linked.marginRight)
      expect(shift.marginLeft).toBeGreaterThan(linked.marginLeft)
    })

    it('defaults to the symmetric pair, because the default encoder is linked', async () => {
      // The trap, and it has caught a worker on this phase: a scene with no
      // `stereo` block takes `DEFAULT_STEREO.algorithm`, which is `linked`, so
      // the shipped margins are `{55, 55}`. The asymmetric `{110, 55}` is
      // `shift`'s row — a reader who assumes it is reading the wrong encoder.
      const bare = await ctxFor(scene())
      const linked = await ctxFor(scene({ algorithm: 'linked' }))
      const shift = await ctxFor(scene({ algorithm: 'shift' }))
      expect(bare.marginLeft).toBe(bare.marginRight)
      expect(bare.marginLeft).toBe(linked.marginLeft)
      expect(bare.marginRight).toBe(linked.marginRight)
      expect(bare.marginLeft).not.toBe(shift.marginLeft)
    })

    it('tracks the scene\'s own sepFar, not the shipped default', async () => {
      const narrow = await ctxFor(scene({ sepFar: SEP_FAR / 2, sepNear: 10 }))
      const wide = await ctxFor(scene({ sepFar: SEP_FAR, sepNear: 20 }))
      // A margin covers the worst case over depth, which is `sepFar`, so
      // doubling it doubles both strips. A rasteriser reading `DEFAULT_STEREO`
      // instead of the scene would hand both of these the same pair.
      expect(wide.marginLeft).toBe(2 * narrow.marginLeft)
      expect(wide.marginRight).toBe(2 * narrow.marginRight)
    })

    it('hands over the margins the plate is padded to: plate = stage + left + right', async () => {
      for (const algorithm of ['shift', 'linked'] as const) {
        const s = scene({ sepFar: SEP_FAR, sepNear: 20, algorithm })
        const ctx = await ctxFor(s)
        const layout = plateLayoutOf(s)
        expect(ctx.marginLeft, algorithm).toBe(layout.margins.left)
        expect(ctx.marginRight, algorithm).toBe(layout.margins.right)
        // §10: the whole reason a preset is given the margins is so that
        // "off-frame" can mean off the emitted image rather than off the
        // sub-rectangle composited into. The depth map stays stage-sized, so
        // this identity is the only place the two can be checked against each
        // other before `render.ts` pads.
        expect(ctx.marginLeft + ctx.sceneW + ctx.marginRight, algorithm)
          .toBe(layout.plate.width)
        expect(ctx.sceneH, algorithm).toBe(layout.plate.height)
      }
    })
  })
})

/** Leftmost column of the depth map with anything drawn in it, or -1. */
function firstPaintedColumn(d: Float32Array, w: number): number {
  const h = d.length / w
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) if (d[y * w + x]! > 0) return x
  }
  return -1
}

/** Rightmost column of the depth map with anything drawn in it, or -1. */
function lastPaintedColumn(d: Float32Array, w: number): number {
  const h = d.length / w
  for (let x = w - 1; x >= 0; x--) {
    for (let y = 0; y < h; y++) if (d[y * w + x]! > 0) return x
  }
  return -1
}

/* ========================= off-frame endpoints, on the shipped path */

/**
 * `move`'s symbolic endpoints, against the plate they are supposed to clear.
 *
 * **Which half of the chain this is.** `rasterDepth preset context > text
 * measurement` above witnesses `measureText → contentW → drawn position`. It
 * does so through a probe preset, which is the right seam for that question
 * because the question is about the *producer*. The half it cannot reach is the
 * consumer: that an **off-frame endpoint** is computed from that same
 * measurement. That suite's own header records why it could not make the
 * claim — no registered verb computed such an endpoint, so the only way to
 * write the assertion was against a preset defined in this file, which would
 * have pinned the test's own arithmetic. `move` computes one now, from
 * `PresetCtx`, so these tests go through `PRESETS.move` with a token rather
 * than a preset defined here.
 *
 * **The term this describe does not know is `contentW`, and that is the
 * load-bearing one.** Every expectation below is derived from the width the
 * *canvas* measured — `frameOf` hands it back — never from
 * `PresetCtx.contentW`. An expectation read off the context would move with a
 * mutated `contentW` and cancel instead of failing, which is how the deleted
 * `marquee` witness stayed green at 12345.678.
 *
 * It does know the margin term and the sign, and a claim that stood here that
 * it knew neither was wrong. Three of the four tests slide `at[0]` by
 * `layout.margins.left` (two of them plus an `overlap`), which lands where it
 * is asserted to only if the endpoint is `−(contentW + marginLeft)`. Measured
 * against this file: dropping `marginLeft` from `offLeft` reddens 3 of the 4,
 * and flipping `offLeft`'s sign reddens all 4.
 *
 * **Why an empty frame cannot be the whole witness, and why `at` is the
 * instrument.** The depth map is stage-sized (`raster.ts` composites
 * `scene.size`; `render.ts` pads afterwards by edge-extending it), so "parked
 * in the left margin" and "gone entirely" are the same picture: nothing
 * painted. Emptiness is therefore satisfied by *any* over-measurement, however
 * gross — which is exactly how the deleted `marquee` witness stayed green with
 * `contentW` forced to 12345.678, and the trap `text measurement`'s own
 * comment describes. So the layer's resting origin is slid right by a derived
 * amount and the assertion reads *where* the trailing edge lands:
 * `at[0] = marginLeft + overlap` puts the string's trailing edge `overlap`
 * columns inside the stage **iff** the endpoint was computed from the width the
 * glyphs are actually drawn at. Under-measure and the whole string slides right
 * so its leading edge enters the stage; over-measure and it leaves the map
 * entirely. Both fail, and neither can be absorbed by sampling either side of a
 * boundary, because the boundary's position is the reading.
 */
describe('move\'s off-frame endpoints against the plate', () => {
  /**
   * Odd `sepFar`, so `shift` gives `{left: 13, right: 7}`: coprime, and
   * deliberately **not** a 2:1 pair. The shipped default is `{110, 55}`, where
   * `left === 2 × right`, and a sibling task found a live assertion that passed
   * only because that made two different sums equal. Here, reading either
   * margin where the other belongs moves every number below.
   */
  const SEP_FAR = 13
  const STEREO: Scene['stereo'] = { sepFar: SEP_FAR, sepNear: 5, algorithm: 'shift' }

  /**
   * 6 characters at 11px measures 39.6 stage px on the fake's metrics. Chosen
   * so that no two quantities in the context can be swapped for each other
   * without a number here moving: it is non-integral, it is not a multiple of
   * either margin, and it differs from `sceneW` (50), `sceneH` (12) and
   * `contentH` (11). The four candidate sums a wrong formula would produce —
   * `contentW + marginLeft` 52.6, `contentW + marginRight` 46.6,
   * `sceneW + marginLeft` 63, `sceneW + marginRight` 57 — are **pairwise
   * distinct**, which is the property that matters: no one wrong formula can
   * satisfy two of the expectations below, so a formula error cannot hide by
   * landing on a second test's target. ("None is the negation of another" stood
   * here, which is trivially true of four positive numbers and bought nothing.
   * The sign is caught by the positional assertions naming a column —
   * flipping `offLeft`'s sign reddens all four tests — not by anything about
   * these sums.)
   */
  const TEXT = 'STATIC'
  const SIZE = 11
  const STAGE: [number, number] = [50, 12]

  interface Frame {
    readonly depth: Float32Array
    /** What the rasteriser's own `measureText` returned for this layer. */
    readonly measured: number
  }

  /**
   * One frame, plus the width the rasteriser measured while producing it.
   *
   * The width is taken from the **canvas**, not from `PresetCtx.contentW`, and
   * that is load-bearing rather than incidental. The expectations below are
   * derived from this number, so reading it out of the context would make a
   * mutated `contentW` move the test's own target along with the behaviour
   * under test, and the mutation would cancel instead of failing. The canvas is
   * the one source a bad `contentW` cannot reach. That the two agree is
   * `text measurement`'s assertion, not this one's.
   */
  async function frameOf(scene: Scene, seconds: number): Promise<Frame> {
    const widths: number[] = []
    const inner = fakeCanvas()
    const canvas: FakeCanvas = {
      ...inner,
      make(w, h) {
        const ctx = inner.make(w, h)
        const measure = ctx.measureText.bind(ctx)
        ctx.measureText = text => {
          const m = measure(text)
          widths.push(m.width)
          return m
        }
        return ctx
      },
    }
    const depth = await rasterDepth(scene, seconds, canvas)
    // One text layer, so exactly one measurement. A second would mean the
    // expectations below are derived from some other layer's width, and a
    // zeroth would mean they are derived from nothing.
    expect(widths).toHaveLength(1)
    expect(widths[0]).toBeGreaterThan(0)
    return { depth, measured: widths[0]! }
  }

  /**
   * The string held at its far endpoint, with its resting origin slid right by
   * `shift` stage px.
   *
   * `to` is left at its default and the frame is taken at t = 0, so the pose is
   * `from` exactly — there is no interpolation, easing or clamping between the
   * token and the drawn position for a failure to hide in. The scroll that does
   * involve time is the suite below.
   */
  function parked(shift: number): Scene {
    return {
      size: STAGE,
      duration: 1,
      stereo: STEREO,
      layers: [{
        type: 'text', text: TEXT, size: SIZE, at: [shift, 0], depth: 1,
        anim: { kind: 'move', from: ['offLeft', 0] },
      }],
    }
  }

  it('puts the string off the plate, not merely off the stage', async () => {
    const layout = plateLayoutOf(parked(0))
    // Two poses, and the second is the one with content. Clearing the *stage*
    // would only require the endpoint to be `−contentW`; what `offLeft` claims
    // is a further `marginLeft` px of clearance, so sliding the entire layer
    // right by exactly the left margin must still paint nothing. An endpoint
    // that had dropped the margin term fails on `shift = marginLeft` while
    // passing on `shift = 0`, which is the error this second sample exists for.
    // `plateLayoutOf` supplies the margin, so the pair is the shipped geometry
    // rather than a number written here.
    for (const shift of [0, layout.margins.left]) {
      const { depth } = await frameOf(parked(shift), 0)
      expect(firstPaintedColumn(depth, STAGE[0]), `slid right by ${shift}`).toBe(-1)
    }
    // Both samples above are empty frames, and emptiness is satisfied by *any*
    // over-measurement however gross — so on its own this test is one-sided in
    // exactly the way the header describes. A third sample closes it: slide the
    // layer right by the whole endpoint, `marginLeft + measured`, and the
    // string's leading edge lands on column 0, so it must paint. The shift is
    // derived from the width the rasteriser measured rather than written here,
    // which is what makes this the sample an over-measured `contentW` takes
    // *off* the map instead of further off it — `12345.678` reddens this line
    // and neither line above.
    const probe = await frameOf(parked(0), 0)
    const arrived = await frameOf(parked(layout.margins.left + probe.measured), 0)
    expect(firstPaintedColumn(arrived.depth, STAGE[0]), 'slid right by the endpoint')
      .toBeGreaterThanOrEqual(0)
  })

  it('computes that endpoint from the measured width, in both directions', async () => {
    const layout = plateLayoutOf(parked(0))
    const probe = await frameOf(parked(0), 0)
    // Derived from the measurement rather than chosen: a quarter and a half of
    // the string are each strictly inside it, so the leading edge stays off the
    // left of the stage and the first painted column is 0, and each is strictly
    // inside the stage, so the trailing edge is a column that exists. Two
    // values rather than one because a single sample is exact but vacuous — the
    // two name different trailing columns, so no constant pose satisfies both.
    const overlaps = [Math.floor(probe.measured / 4), Math.floor(probe.measured / 2)]
    const trailing: number[] = []
    for (const overlap of overlaps) {
      const where = `overlap ${overlap}`
      expect(overlap, where).toBeGreaterThan(0)
      expect(overlap, where).toBeLessThan(probe.measured)
      expect(overlap, where).toBeLessThan(STAGE[0])
      const { depth } = await frameOf(parked(layout.margins.left + overlap), 0)
      // The two sides. `toBe(0)` fails when the endpoint is too far right,
      // because the string's leading edge then sits inside the stage; the
      // trailing column fails when it is too far right *or* too far left, and
      // reads -1 when the string has left the map altogether.
      expect(firstPaintedColumn(depth, STAGE[0]), where).toBe(0)
      expect(lastPaintedColumn(depth, STAGE[0]), where).toBe(overlap - 1)
      trailing.push(lastPaintedColumn(depth, STAGE[0]))
    }
    expect(new Set(trailing).size).toBe(overlaps.length)
  })

  /**
   * A scroll whose scene duration actually reaches the far endpoint.
   *
   * **No shipped scene does.** Measured over the three corpora, through
   * `compilePreset` on the width the real `measureText` returns — derived
   * duration against the scene's own `duration` — `examples/scrolling-text.yaml`
   * runs 17.0025s against 6 (2.83×), `site/examples.ts`'s SCROLL 11.7021s
   * against 6 (1.95×), and the README's 19.9838s against 4 (5.00×). The far
   * endpoint of a scroll has therefore never been rendered anywhere in this
   * repo, which is how one of those endpoints stayed wrong by 17.33px over
   * several commits with nothing red and nothing visibly bad in the output.
   *
   * **Recompute before citing these; the README's figure has already gone
   * stale once, inside this phase.** It read 21.6667s (5.42×) here, which is
   * `1300 / 60` — right for the endpoints the README spelled out by hand,
   * `from: [900, 0]` to `to: [-400, 0]`. `90412b6` then rewrote that scene to
   * use the tokens, moving its travel to `(sceneW + marginRight) +
   * (contentW + marginLeft)` = `855 + 344.03` ≈ 1199, i.e. 19.9838s; this
   * comment predated that commit by thirteen minutes and did not follow it.
   * The other two figures survived their own rewrites (`110f4c0`, `83b78e9`)
   * only because those swaps were byte-identical — each file's literals were
   * already what the tokens resolve to, which the README's were not. The
   * conclusion is insensitive to all of this: the *smallest* of the three
   * ratios is 1.95×, so every shipped scroll would have to roughly halve its
   * travel or double its duration before any of them reached an endpoint.
   *
   * This is a fixture rather than an edit to `examples/scrolling-text.yaml`
   * deliberately: that file's measured numbers feed
   * `node/metamorphic.real.test.ts`, which `report()`s them to stdout rather
   * than asserting them, so changing its `duration` or `speed` would move
   * numbers that nothing would flag.
   */
  describe('a scroll that reaches its far endpoint', () => {
    const DURATION = 2
    /**
     * Chosen so the derived duration (travel ÷ speed, 1.37s here) is comfortably
     * *inside* the scene's 2s rather than outside it. Every shipped scroll has
     * this the other way round, and that inversion is the defect: the last
     * frame of the scene is then a frame mid-travel, so no frame exists in
     * which the endpoint is the pose.
     */
    const SPEED = 80

    /** Head off the right of the plate, tail off the left of it. */
    function scrolling(shift: number): Scene {
      return {
        size: STAGE,
        duration: DURATION,
        stereo: STEREO,
        layers: [{
          type: 'text', text: TEXT, size: SIZE, at: [shift, 0], depth: 1,
          // `repeat` is left at `move`'s default `once`, which clamps at the
          // last key. A `loop` — what all three shipped scrolls use — passes
          // through the far endpoint at a single instant and holds it never, so
          // there is no frame of a looping scroll in which the endpoint is the
          // pose, whatever its duration.
          anim: { kind: 'move', from: ['offRight', 0], to: ['offLeft', 0], speed: SPEED },
        }],
      }
    }

    it('enters the frame, crosses it and leaves it within the scene', async () => {
      const start = await frameOf(scrolling(0), 0)
      const mid = await frameOf(scrolling(0), DURATION / 2)
      const end = await frameOf(scrolling(0), DURATION)
      // Non-vacuity for the endpoint assertions: a scroll that never reached
      // the stage at all would satisfy both of the empty frames trivially.
      expect(firstPaintedColumn(start.depth, STAGE[0])).toBe(-1)
      expect(firstPaintedColumn(mid.depth, STAGE[0])).toBeGreaterThanOrEqual(0)
      expect(firstPaintedColumn(end.depth, STAGE[0])).toBe(-1)
    })

    it('arrives at the measured endpoint rather than somewhere off-frame', async () => {
      const layout = plateLayoutOf(scrolling(0))
      const probe = await frameOf(scrolling(0), 0)
      const overlap = Math.floor(probe.measured / 4)
      const { depth } = await frameOf(scrolling(layout.margins.left + overlap), DURATION)
      // This is what the empty frame above cannot say. Position under a
      // constant speed is `from − speed × t`, so the last frame of a scene
      // whose duration *undershoots* the travel is also off the plate and also
      // paints nothing. Only the clamp at t = 1 puts the string at the endpoint
      // itself, and only a pose read against the plate's left edge can tell the
      // two apart: a scroll still in flight here would be a further ~50px left
      // and paint nothing, where an arrived one shows exactly `overlap`
      // columns.
      expect(firstPaintedColumn(depth, STAGE[0])).toBe(0)
      expect(lastPaintedColumn(depth, STAGE[0])).toBe(overlap - 1)
    })
  })
})

describe('rasterDepth scene duration', () => {
  function moveScene(duration?: number): Scene {
    return {
      size: [80, 2],
      ...(duration === undefined ? {} : { duration }),
      layers: [
        {
          type: 'shape', shape: 'rect', at: [0, 0], w: 4, h: 2, depth: 1,
          anim: { kind: 'move', from: [0, 0], to: [40, 0] },
        },
      ],
    }
  }

  // Design §4.1: a zero-width window pins every track at its t=0 pose (or, for
  // `repeat: 'once'`, at its end pose) — which for a scroll that starts
  // off-plate renders nothing at all. An absent duration therefore means 1
  // second, never 0.
  it('treats an absent duration as 1 second', async () => {
    const d = await rasterDepth(moveScene(), 0.5, fakeCanvas())
    expect(at(d, 80, 20, 0)).toBeCloseTo(1, 6) // halfway through a 1s move
    expect(at(d, 80, 0, 0)).toBe(0)
    expect(at(d, 80, 40, 0)).toBe(0) // where a zero-duration scene would pin it
  })

  it('treats an explicit duration of 0 as 1 second too', async () => {
    const d = await rasterDepth(moveScene(0), 0.5, fakeCanvas())
    expect(at(d, 80, 20, 0)).toBeCloseTo(1, 6)
    expect(at(d, 80, 40, 0)).toBe(0)
  })
})

describe('rasterDepth gif frames', () => {
  /** Three 3x1 frames; frame k is opaque only in column k. 100ms each. */
  function walk() {
    return {
      width: 3,
      height: 1,
      frames: [0, 1, 2].map(k => ({
        rgba: rgbaImage(3, 1, x => [255, 255, 255, x === k ? 255 : 0]).rgba,
        delayMs: 100,
      })),
    }
  }

  async function litColumn(loop: 'loop' | 'once' | 'pingpong', seconds: number): Promise<number> {
    const canvas = fakeCanvas({ gifs: { 'walk.gif': walk() } })
    const scene: Scene = {
      size: [3, 1],
      duration: 1,
      layers: [{ type: 'gif', src: 'walk.gif', loop, at: [0, 0], depth: 1 }],
    }
    const d = await rasterDepth(scene, seconds, canvas)
    const lit = Array.from(d).flatMap((v, i) => (v > 0.5 ? [i] : []))
    expect(lit).toHaveLength(1)
    return lit[0]!
  }

  it('selects the gif frame from its own delays', async () => {
    expect(await litColumn('loop', 0)).toBe(0)
    expect(await litColumn('loop', 0.15)).toBe(1)
    expect(await litColumn('loop', 0.25)).toBe(2)
  })

  it('wraps in loop mode', async () => {
    expect(await litColumn('loop', 0.35)).toBe(0) // 350ms mod 300ms = 50ms
    expect(await litColumn('loop', 30.05)).toBe(0) // 100 whole cycles + 50ms
    expect(await litColumn('loop', 30.15)).toBe(1)
  })

  it('holds the last frame in once mode', async () => {
    expect(await litColumn('once', 0.35)).toBe(2)
    expect(await litColumn('once', 10)).toBe(2)
  })

  it('reflects without repeating the turning frames in pingpong mode', async () => {
    expect(await litColumn('pingpong', 0.05)).toBe(0)
    expect(await litColumn('pingpong', 0.15)).toBe(1)
    expect(await litColumn('pingpong', 0.25)).toBe(2)
    expect(await litColumn('pingpong', 0.35)).toBe(1) // back down, frame 2 held once
    expect(await litColumn('pingpong', 0.45)).toBe(0)
  })

  it('runs the gif clock underneath the layer animator', async () => {
    // At t=0.5s the walk cycle is on frame 2 (500ms mod the 300ms cycle = 200ms,
    // its column 2) *and* the sprite has been translated 2px right by the layer
    // animator, so the lit pixel is at x = 4. Two independent clocks.
    const canvas = fakeCanvas({ gifs: { 'walk.gif': walk() } })
    const scene: Scene = {
      size: [8, 1],
      duration: 1,
      layers: [
        {
          type: 'gif', src: 'walk.gif', at: [0, 0], depth: 1,
          anim: { keys: [{ t: 0, x: 0 }, { t: 1, x: 4 }] },
        },
      ],
    }
    const d = await rasterDepth(scene, 0.5, canvas)
    const lit = Array.from(d).flatMap((v, i) => (v > 0.5 ? [i] : []))
    expect(lit).toEqual([4]) // frame 2 (column 2) + 2px of animator translation
  })
})

describe('rasterDepth diagnostics', () => {
  it('refuses a draw layer rather than guessing a module loader', async () => {
    const scene: Scene = { size: [4, 1], layers: [{ type: 'draw', fn: './custom.mjs' }] }
    await expect(rasterDepth(scene, 0, fakeCanvas())).rejects.toThrow(/draw/i)
  })

  it('names the missing dimension instead of drawing nothing', async () => {
    const rect: Scene = { size: [4, 1], layers: [{ type: 'shape', shape: 'rect', depth: 1 }] }
    await expect(rasterDepth(rect, 0, fakeCanvas())).rejects.toThrow(/"w" and "h"/)
    const circle: Scene = { size: [4, 1], layers: [{ type: 'shape', shape: 'circle', depth: 1 }] }
    await expect(rasterDepth(circle, 0, fakeCanvas())).rejects.toThrow(/"r"/)
  })

  it('draws a layer that is partly off-canvas without throwing', async () => {
    const scene: Scene = {
      size: [4, 2],
      layers: [{ type: 'shape', shape: 'rect', at: [-2, -1], w: 4, h: 2, depth: 1 }],
    }
    const d = await rasterDepth(scene, 0, fakeCanvas())
    expect(at(d, 4, 0, 0)).toBeCloseTo(1, 6)
    expect(at(d, 4, 3, 1)).toBe(0)
  })
})

describe('rasterDepth gif mode resolution', () => {
  /** One opaque 3x1 frame with luminance 0 / 128 / 255 across the row. */
  function opaqueRamp() {
    const lum = [0, 128, 255]
    return {
      width: 3,
      height: 1,
      frames: [{
        rgba: rgbaImage(3, 1, x => {
          const v = lum[x]!
          return [v, v, v, 255]
        }).rgba,
        delayMs: 100,
      }],
    }
  }

  /** One frame, half transparent — hasAlpha is true. */
  function cutout() {
    return {
      width: 4,
      height: 1,
      frames: [{
        rgba: rgbaImage(4, 1, x => [255, 255, 255, x < 2 ? 255 : 0]).rgba,
        delayMs: 100,
      }],
    }
  }

  async function depths(
    gif: ReturnType<typeof opaqueRamp> | ReturnType<typeof cutout>,
    layer: Record<string, unknown>,
  ): Promise<number[]> {
    const canvas = fakeCanvas({ gifs: { 'g.gif': gif } })
    const scene: Scene = {
      size: [gif.width, 1],
      duration: 1,
      layers: [{ type: 'gif', src: 'g.gif', at: [0, 0], depth: 1, ...layer } as never],
    }
    return Array.from(await rasterDepth(scene, 0, canvas))
  }

  // An opaque GIF previously hardcoded silhouette, so it flattened to its
  // bounding rectangle and heightmap was not expressible at all. GIF layers now
  // resolve mode exactly like still images (design §3.1).
  it('reads an opaque gif as a heightmap by default', async () => {
    const d = await depths(opaqueRamp(), {})
    expect(d[0]!).toBeCloseTo(0, 2)
    expect(d[1]!).toBeGreaterThan(0.4)
    expect(d[1]!).toBeLessThan(0.6)
    expect(d[2]!).toBeCloseTo(1, 2)
  })

  it('honours an explicit silhouette mode on an opaque gif', async () => {
    const d = await depths(opaqueRamp(), { mode: 'silhouette' })
    for (const v of d) expect(v).toBeCloseTo(1, 5)
  })

  it('honours a luma mask on an opaque gif', async () => {
    const d = await depths(opaqueRamp(), { mask: { luma: 0.4 } })
    expect(d[0]!).toBeCloseTo(0, 5)
    expect(d[2]!).toBeCloseTo(1, 5)
  })

  // Regression guard: the change must not alter transparent GIFs, which are
  // the common case and were already correct.
  it('still treats a gif with alpha as a flat silhouette', async () => {
    const d = await depths(cutout(), {})
    expect(d[0]!).toBeCloseTo(1, 5)
    expect(d[1]!).toBeCloseTo(1, 5)
    expect(d[2]!).toBeCloseTo(0, 5)
    expect(d[3]!).toBeCloseTo(0, 5)
  })
})

describe('rasterDepth circle wedges (pacman)', () => {
  const R = 18, CX = 20, CY = 20

  async function depthAt(
    layer: Record<string, unknown>,
    probes: [number, number][],
  ): Promise<number[]> {
    const canvas = fakeCanvas({})
    const scene: Scene = {
      size: [40, 40],
      layers: [{ type: 'shape', shape: 'circle', r: R, at: [CX, CY], depth: 1, ...layer } as never],
    }
    const d = await rasterDepth(scene, 0, canvas)
    return probes.map(([x, y]) => d[y * 40 + x]!)
  }

  // Angles in degrees clockwise from 3 o'clock. Probe points sit 12px from the
  // centre, well inside r=18, one per cardinal direction.
  const RIGHT: [number, number] = [CX + 12, CY]
  const LEFT: [number, number] = [CX - 12, CY]
  const UP: [number, number] = [CX, CY - 12]
  const DOWN: [number, number] = [CX, CY + 12]

  it('fills every direction when start/end are omitted', async () => {
    const [r, l, u, dn] = await depthAt({}, [RIGHT, LEFT, UP, DOWN])
    for (const v of [r, l, u, dn]) expect(v).toBeCloseTo(1, 5)
  })

  // THE POINT OF THE FEATURE. A pacman is a circle with a bite taken out, and
  // a wedge is the only thing standing between this scene format and the shape
  // that started the project. If the angles were ignored, the mouth would fill
  // and this test would fail — which is exactly what it is for.
  it('leaves the mouth empty for a rightward-facing pacman', async () => {
    const [r, l, u, dn] = await depthAt({ start: 40, end: 320 }, [RIGHT, LEFT, UP, DOWN])
    expect(r).toBeCloseTo(0, 5)      // inside the 80-degree mouth
    expect(l).toBeCloseTo(1, 5)
    expect(u).toBeCloseTo(1, 5)
    expect(dn).toBeCloseTo(1, 5)
  })

  it('points the mouth wherever the angles say', async () => {
    // Mouth facing down: 45..135 degrees is the open span, so the wedge is
    // the complement, 135..405.
    const [r, l, u, dn] = await depthAt({ start: 135, end: 405 }, [RIGHT, LEFT, UP, DOWN])
    expect(dn).toBeCloseTo(0, 5)
    expect(r).toBeCloseTo(1, 5)
    expect(l).toBeCloseTo(1, 5)
    expect(u).toBeCloseTo(1, 5)
  })

  it('handles a wedge spanning the angle seam', async () => {
    // -30..30 crosses 0; a naive implementation splits this into two pieces.
    const [r, l] = await depthAt({ start: -30, end: 30 }, [RIGHT, LEFT])
    expect(r).toBeCloseTo(1, 5)
    expect(l).toBeCloseTo(0, 5)
  })

  it('rejects start without end, naming both and the way out', async () => {
    await expect(depthAt({ start: 40 }, [RIGHT])).rejects.toThrow(
      /"start" and "end" must be given together.*omit both for a full circle/s,
    )
    await expect(depthAt({ end: 320 }, [RIGHT])).rejects.toThrow(/given together/)
  })

  it('rejects a non-increasing or non-finite span', async () => {
    await expect(depthAt({ start: 320, end: 40 }, [RIGHT])).rejects.toThrow(
      /"end" \(40\) must be greater than "start" \(320\)/,
    )
    await expect(depthAt({ start: 0, end: Number.NaN }, [RIGHT])).rejects.toThrow(/finite degrees/)
  })
})

describe('axis rotations under an orthographic projection', () => {
  /**
   * A rect is drawn from its `at` origin rightward, so it is asymmetric about
   * that origin — which is what makes it a usable mirror fixture. At x=20 in a
   * 40-wide frame it covers 20..29; mirrored about its own origin it must
   * cover 10..19 and nothing else.
   */
  const slab = (anim?: unknown): Scene => ({
    size: [40, 10],
    layers: [
      { type: 'shape', shape: 'rect', at: [20, 0], w: 10, h: 10, depth: 1, ...(anim ? { anim } : {}) } as never,
    ],
  })

  it('rotateY = pi mirrors the layer about its own origin', async () => {
    const d = await rasterDepth(slab({ keys: [{ t: 0, rotateY: Math.PI }] }), 0, fakeCanvas())
    expect(at(d, 40, 15, 5)).toBeCloseTo(1, 6)
    expect(at(d, 40, 25, 5)).toBeCloseTo(0, 6)
  })

  it('leaves the layer unmirrored at rotateY = 0', async () => {
    const d = await rasterDepth(slab(), 0, fakeCanvas())
    expect(at(d, 40, 25, 5)).toBeCloseTo(1, 6)
    expect(at(d, 40, 15, 5)).toBeCloseTo(0, 6)
  })

  it('rotateY = pi/2 turns the layer edge-on, so nothing is drawn', async () => {
    const d = await rasterDepth(slab({ keys: [{ t: 0, rotateY: Math.PI / 2 }] }), 0, fakeCanvas())
    expect(Array.from(d).every(v => v === 0)).toBe(true)
  })
})
