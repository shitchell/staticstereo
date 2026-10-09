import { describe, it, expect } from 'vitest'
import {
  DEFAULT_FPS,
  frameTimes,
  isStill,
  renderFrame,
  renderFrames,
  resolveStereo,
  sceneFps,
  stillTime,
} from './render.js'
import type { Frame } from './render.js'
import { dominantPeriod, rowOf } from './analysis.js'
import { createRasterCache } from './raster.js'
import { FAKE_CHAR_ASPECT, fakeCanvas, rgbaImage } from './testing/fakeCanvas.js'
import type { CanvasLike } from './canvaslike.js'
import type { Scene, StereoOpts } from './types.js'

/**
 * Small stereo settings so the whole suite stays fast while leaving room for a
 * real measurement: `dominantPeriod` needs at least MIN_OVERLAP (16) samples
 * beyond the period it is testing.
 */
const SEP = { sepFar: 30, sepNear: 20 }
const W = 240
const H = 24
/** Left edge of the flat slab, in scene pixels. */
const SLAB_X = 80

/**
 * Measurement windows, in *scene* pixels (scaled by noiseScale at use).
 *
 * BG stops well short of the slab edge on purpose. `depthBlur` ramps the depth
 * step over the few pixels before it, which moves `sep` off `sepFar` there —
 * correct behaviour (that ramp is the whole point of §2.2) but not an exact
 * wallpaper repeat, so an exact-score assertion has to stay clear of it.
 */
const BG: [number, number] = [0, 60]
const SLAB: [number, number] = [120, 240]

function slabScene(extra: Partial<Scene> = {}, stereo: Partial<StereoOpts> = {}): Scene {
  return {
    size: [W, H],
    stereo: { ...SEP, noiseScale: 1, seed: 7, ...stereo },
    layers: [
      { type: 'shape', shape: 'rect', at: [SLAB_X, 0], w: W - SLAB_X, h: H, depth: 1 },
    ],
    ...extra,
  }
}

/**
 * Measure the horizontal repeat period over a window of the rendered frame.
 *
 * `x0`/`x1` are scene pixels; the frame is `noiseScale` times wider, so the
 * window scales with it. That is deliberate: the same window expressed in
 * scene space must yield `period × noiseScale` for every noiseScale, which is
 * exactly the "applied once" property under test.
 */
function periodIn(
  frame: Frame,
  n: number,
  [x0, x1]: [number, number],
  row = Math.floor(H / 2),
): { period: number; score: number; samples: number } {
  const line = rowOf(frame.pixels, frame.width, row * n)
  return dominantPeriod(line.slice(x0 * n, x1 * n), 4, Math.round(SEP.sepFar * n * 1.3))
}

/** A CanvasLike that counts the calls the cache is supposed to eliminate. */
function countingCanvas(opts: Parameters<typeof fakeCanvas>[0] = {}) {
  const base = fakeCanvas(opts)
  const counts = { loads: 0, frames: 0 }
  const canvas: CanvasLike = {
    // One `make` per rasterDepth call, i.e. one per rendered frame.
    make: (w, h) => {
      counts.frames++
      return base.make(w, h)
    },
    loadImage: src => {
      counts.loads++
      return base.loadImage(src)
    },
    loadGif: src => base.loadGif(src),
  }
  return { canvas, counts }
}

describe('timing policy (design §4.1)', () => {
  it('treats a scene with neither fps nor duration as a still at the midpoint', () => {
    const scene = slabScene()
    expect(isStill(scene)).toBe(true)
    // Never 0: a zero-width window pins every track at its t=0 pose, which for
    // `marquee` is off-screen, so the still would render completely empty.
    expect(stillTime(scene)).toBe(0.5)
    expect(frameTimes(scene)).toEqual([0.5])
  })

  it('yields 24 frames for fps 12 over 2 seconds, excluding the endpoint', () => {
    const times = frameTimes(slabScene({ fps: 12, duration: 2 }))
    expect(times).toHaveLength(24)
    expect(times[0]).toBe(0)
    expect(times[23]).toBeCloseTo(23 / 12, 10)
    // t = duration would duplicate t = 0 for anything looping, so the last
    // frame sits one interval short of the end.
    expect(times[23]).toBeLessThan(2)
  })

  it('animates over the default 1 second when fps is given without duration', () => {
    expect(frameTimes(slabScene({ fps: 12 }))).toHaveLength(12)
  })

  it('animates at the default fps when duration is given without fps', () => {
    expect(sceneFps(slabScene({ duration: 2 }))).toBe(DEFAULT_FPS)
    expect(frameTimes(slabScene({ duration: 2 }))).toHaveLength(2 * DEFAULT_FPS)
  })

  it('treats an explicit duration of 0 as 1 second rather than honouring it', () => {
    expect(frameTimes(slabScene({ fps: 12, duration: 0 }))).toHaveLength(12)
  })

  it('falls back to a still for a non-positive fps when there is no duration either', () => {
    expect(frameTimes(slabScene({ fps: 0 }))).toEqual([0.5])
    expect(frameTimes(slabScene({ fps: -5 }))).toEqual([0.5])
    expect(frameTimes(slabScene({ fps: Number.NaN }))).toEqual([0.5])
  })

  it('treats a non-positive fps as unspecified when a duration is given', () => {
    // Deliberately symmetric with `duration: 0`, which §4.1 replaces with 1s
    // rather than honouring. Honouring `fps: 0` as "one still frame" while
    // refusing to honour `duration: 0` would be two opposite readings of the
    // same malformed input in the same function.
    for (const fps of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(frameTimes(slabScene({ fps, duration: 2 })), `fps ${fps}`)
        .toHaveLength(2 * DEFAULT_FPS)
    }
  })

  it('returns strictly increasing times', () => {
    const times = frameTimes(slabScene({ fps: 12, duration: 2 }))
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThan(times[i - 1]!)
  })
})

describe('resolveStereo', () => {
  it('fills every field from DEFAULT_STEREO', () => {
    const o = resolveStereo({ size: [W, H], layers: [] })
    expect(o.sepFar).toBe(110)
    expect(o.sepNear).toBe(92)
    expect(o.noiseScale).toBe(2)
    expect(o.depthBlur).toBe(0)   // off by default; see types.ts for why
    expect(o.cross).toBe(false)
    expect(o.seed).toBe(0)
    expect(o.algorithm).toBe('shift')   // the new encoder is opt-in
  })

  it('lets the scene override individual fields', () => {
    const o = resolveStereo(slabScene({}, { depthBlur: 0, cross: true }))
    expect(o.sepFar).toBe(SEP.sepFar)
    expect(o.depthBlur).toBe(0)
    expect(o.cross).toBe(true)
  })

  it('rejects a non-integer noiseScale, which would mis-size the output buffer', () => {
    expect(() => resolveStereo(slabScene({}, { noiseScale: 1.5 }))).toThrow(/noiseScale/)
    expect(() => resolveStereo(slabScene({}, { noiseScale: 0 }))).toThrow(/noiseScale/)
  })

  it('rejects sepNear >= sepFar, which encodes no depth at all', () => {
    expect(() => resolveStereo(slabScene({}, { sepNear: 30 }))).toThrow(/sepNear/)
    expect(() => resolveStereo(slabScene({}, { sepNear: 40 }))).toThrow(/sepNear/)
  })

  it('rejects a negative depthBlur', () => {
    expect(() => resolveStereo(slabScene({}, { depthBlur: -1 }))).toThrow(/depthBlur/)
  })

  it('accepts a known algorithm and rejects an unknown one', () => {
    expect(resolveStereo(slabScene({}, { algorithm: 'linked' })).algorithm).toBe('linked')
    // Cast: the point of the check is the value arriving from a scene file,
    // which TypeScript never saw.
    expect(() => resolveStereo(
      slabScene({}, { algorithm: 'thimbleby' as 'linked' }),
    )).toThrow(/algorithm/)
  })
})

describe('renderFrame', () => {
  // The pipeline hands the encoder an explicit five-field literal, so a new
  // encoder option is exactly the kind of thing that compiles while being
  // dropped. Measured end to end instead: the two encoders must produce
  // different frames, and both must still encode the depth.
  it('threads stereo.algorithm through to the encoder', async () => {
    const shift = await renderFrame(slabScene({}, { algorithm: 'shift' }), 0, fakeCanvas())
    const linked = await renderFrame(slabScene({}, { algorithm: 'linked' }), 0, fakeCanvas())
    expect(Array.from(linked.pixels)).not.toEqual(Array.from(shift.pixels))

    for (const frame of [shift, linked]) {
      expect(periodIn(frame, 1, SLAB).period).toBe(SEP.sepNear)
      expect(periodIn(frame, 1, BG).period).toBe(SEP.sepFar)
    }
  })

  /**
   * THE END-TO-END CHECK.
   *
   * "It rendered without throwing" proves nothing about a stereogram. The
   * repeat period *is* the encoded depth, and it is also the only thing that
   * catches a forgotten or doubled `upscale`: a missing one measures `sepFar`
   * where this expects `sepFar × noiseScale`, a doubled one measures
   * `sepFar × noiseScale²`.
   */
  for (const n of [1, 2, 3]) {
    it(`measures sepNear/sepFar x noiseScale with noiseScale ${n}`, async () => {
      const frame = await renderFrame(slabScene({}, { noiseScale: n }), 0, fakeCanvas())

      expect(frame.width).toBe(W * n)
      expect(frame.height).toBe(H * n)
      expect(frame.pixels).toHaveLength(W * n * H * n)

      const inside = periodIn(frame, n, SLAB)
      expect(inside.period).toBe(SEP.sepNear * n)
      expect(inside.score).toBe(1)

      const outside = periodIn(frame, n, BG)
      expect(outside.period).toBe(SEP.sepFar * n)
      expect(outside.score).toBe(1)

      expect(inside.period).toBeLessThan(outside.period)
    })
  }

  it('emits a two-value dot field', async () => {
    const frame = await renderFrame(slabScene(), 0, fakeCanvas())
    expect([...new Set(frame.pixels)].sort((a, b) => a - b)).toEqual([0, 255])
  })

  it('is deterministic for the same scene and time', async () => {
    const a = await renderFrame(slabScene(), 0.25, fakeCanvas())
    const b = await renderFrame(slabScene(), 0.25, fakeCanvas())
    expect(Array.from(a.pixels)).toEqual(Array.from(b.pixels))
  })

  it('changes with the stereo seed', async () => {
    const a = await renderFrame(slabScene({}, { seed: 1 }), 0, fakeCanvas())
    const b = await renderFrame(slabScene({}, { seed: 2 }), 0, fakeCanvas())
    expect(Array.from(a.pixels)).not.toEqual(Array.from(b.pixels))
  })

  it('applies depthBlur between compositing and encoding (design §2.2)', async () => {
    const sharp = await renderFrame(slabScene({}, { depthBlur: 0 }), 0, fakeCanvas())
    const soft = await renderFrame(slabScene({}, { depthBlur: 3 }), 0, fakeCanvas())

    // If the pipeline ignored depthBlur these would be byte-identical: same
    // seed, same depth map, same encoder.
    expect(Array.from(soft.pixels)).not.toEqual(Array.from(sharp.pixels))

    // Softening the step must not disturb the signal away from the step.
    expect(periodIn(sharp, 1, SLAB).period).toBe(SEP.sepNear)
    expect(periodIn(soft, 1, SLAB).period).toBe(SEP.sepNear)
    expect(periodIn(sharp, 1, BG).period).toBe(SEP.sepFar)
    expect(periodIn(soft, 1, BG).period).toBe(SEP.sepFar)
  })

  it('honours cross-eyed inversion', async () => {
    const frame = await renderFrame(slabScene({}, { cross: true }), 0, fakeCanvas())
    // Inverted: the slab now reads as the *far* surface and the background near.
    expect(periodIn(frame, 1, SLAB).period).toBe(SEP.sepFar)
    expect(periodIn(frame, 1, BG).period).toBe(SEP.sepNear)
  })

  it('propagates a rasteriser error rather than rendering an empty frame', async () => {
    const scene: Scene = { size: [0, 10], layers: [] }
    await expect(renderFrame(scene, 0, fakeCanvas())).rejects.toThrow(/scene.size/)
  })
})

describe('freezeNoise', () => {
  /** A slab parked in the right-hand third, sliding 40px over the scene. */
  function movingScene(freezeNoise?: boolean): Scene {
    return {
      size: [W, H],
      fps: 12,
      duration: 1,
      freezeNoise,
      stereo: { ...SEP, noiseScale: 1, seed: 11 },
      layers: [
        {
          type: 'shape',
          shape: 'rect',
          at: [160, 0],
          w: 40,
          h: H,
          depth: 1,
          anim: { keys: [{ t: 0, x: 0 }, { t: 1, x: 40 }] },
        },
      ],
    }
  }

  /**
   * A window left of everything the layer can touch. SIRDS dependencies run
   * strictly leftward, so this region is the dot field and nothing else.
   */
  const bgRow = (f: Frame) => rowOf(f.pixels, f.width, H / 2).slice(0, 140)

  async function render(freezeNoise?: boolean): Promise<Frame[]> {
    const out: Frame[] = []
    for await (const f of renderFrames(movingScene(freezeNoise), fakeCanvas())) out.push(f)
    return out
  }

  it('shares one dot field across frames when true, while the layer still moves', async () => {
    const frames = await render(true)
    expect(frames).toHaveLength(12)
    expect(bgRow(frames[5]!)).toEqual(bgRow(frames[0]!))
    // ...and it is still an animation, not 12 copies of one frame.
    expect(Array.from(frames[5]!.pixels)).not.toEqual(Array.from(frames[0]!.pixels))
  })

  it('re-randomises the dot field per frame by default', async () => {
    const frames = await render(undefined)
    expect(bgRow(frames[5]!)).not.toEqual(bgRow(frames[0]!))
  })

  it('re-randomises when explicitly false', async () => {
    const frames = await render(false)
    expect(bgRow(frames[5]!)).not.toEqual(bgRow(frames[0]!))
  })

  it('stays deterministic per sample time even while re-randomising', async () => {
    // The per-frame field is derived from the sample time, not from a hidden
    // counter, so renderFrame remains a pure function of (scene, seconds).
    const a = await renderFrame(movingScene(false), 5 / 12, fakeCanvas())
    const b = await renderFrame(movingScene(false), 5 / 12, fakeCanvas())
    expect(Array.from(a.pixels)).toEqual(Array.from(b.pixels))
    const [frames] = [await render(false)]
    expect(Array.from(frames[5]!.pixels)).toEqual(Array.from(a.pixels))
  })
})

describe('renderFrames', () => {
  const dot = rgbaImage(4, 4, () => [255, 255, 255, 255])

  function imageScene(extra: Partial<Scene> = {}): Scene {
    return {
      size: [W, H],
      stereo: { ...SEP, noiseScale: 1, seed: 5 },
      layers: [{ type: 'image', src: 'dot.png', at: [100, 10], depth: 1 }],
      ...extra,
    }
  }

  it('yields one frame per frameTimes entry, tagged with index and time', async () => {
    const scene = imageScene({ fps: 12, duration: 0.5 })
    const times = frameTimes(scene)
    const got: { index: number; seconds: number }[] = []
    for await (const f of renderFrames(scene, fakeCanvas({ images: { 'dot.png': dot } }))) {
      got.push({ index: f.index, seconds: f.seconds })
      expect(f.width).toBe(W)
      expect(f.height).toBe(H)
    }
    expect(got.map(g => g.index)).toEqual(times.map((_, i) => i))
    expect(got.map(g => g.seconds)).toEqual(times)
  })

  it('renders a still scene as a single frame at the midpoint', async () => {
    const scene = imageScene()
    const got: number[] = []
    for await (const f of renderFrames(scene, fakeCanvas({ images: { 'dot.png': dot } }))) {
      got.push(f.seconds)
    }
    expect(got).toEqual([stillTime(scene)])
  })

  it('decodes each asset once across the whole sequence', async () => {
    const { canvas, counts } = countingCanvas({ images: { 'dot.png': dot } })
    const scene = imageScene({ fps: 12, duration: 0.5 })
    for await (const _f of renderFrames(scene, canvas)) void _f
    expect(counts.frames).toBe(6)
    // The point of threading one RasterCache through: without it this is 6.
    expect(counts.loads).toBe(1)
  })

  it('re-decodes per call when the caller renders frames individually', async () => {
    const { canvas, counts } = countingCanvas({ images: { 'dot.png': dot } })
    const scene = imageScene({ fps: 12, duration: 0.5 })
    for (const t of frameTimes(scene)) await renderFrame(scene, t, canvas)
    // Documents the cost the shared cache exists to avoid, so the assertion
    // above is testing something real.
    expect(counts.loads).toBe(6)
  })

  it('reuses a caller-supplied cache across separate calls', async () => {
    const { canvas, counts } = countingCanvas({ images: { 'dot.png': dot } })
    const scene = imageScene({ fps: 12, duration: 0.5 })
    const cache = createRasterCache()
    for (const t of frameTimes(scene)) await renderFrame(scene, t, canvas, cache)
    expect(counts.loads).toBe(1)
  })

  it('renders lazily rather than materialising the whole animation', async () => {
    const { canvas, counts } = countingCanvas({ images: { 'dot.png': dot } })
    const scene = imageScene({ fps: 24, duration: 2 }) // 48 frames
    expect(frameTimes(scene)).toHaveLength(48)
    let seen = 0
    for await (const _f of renderFrames(scene, canvas)) {
      void _f
      if (++seen === 2) break
    }
    expect(counts.frames).toBe(2)
  })
})

describe('a still of a marquee scene (design §4.1)', () => {
  const TEXT = 'HELLO123'
  const SIZE = 16
  /** The fake canvas's own metric, so the expectation tracks the fake. */
  const contentW = TEXT.length * SIZE * FAKE_CHAR_ASPECT
  /** Pick a speed that makes the marquee's own window exactly 1s, the still's. */
  const speed = W + contentW

  const scene: Scene = {
    size: [W, H],
    stereo: { ...SEP, noiseScale: 1, seed: 3 },
    layers: [
      { type: 'text', text: TEXT, size: SIZE, depth: 1, anim: { kind: 'marquee', speed } },
    ],
  }

  /** Where the text sits at u = 0.5, with a margin clear of the blurred edges. */
  const x0 = W - (W + contentW) * 0.5
  const band: [number, number] = [Math.ceil(x0) + 12, Math.floor(x0 + contentW) - 12]
  const textRow = 8 // text is drawn from the top, so it spans y in [0, 16)

  it('samples the midpoint and finds the text', async () => {
    expect(frameTimes(scene)).toEqual([0.5])
    const frame = await renderFrame(scene, stillTime(scene), fakeCanvas())
    const measured = dominantPeriod(
      rowOf(frame.pixels, frame.width, textRow).slice(band[0], band[1]),
      4,
      Math.round(SEP.sepFar * 1.1),
    )
    expect(measured.period).toBe(SEP.sepNear)
    expect(measured.score).toBe(1)
  })

  it('would render completely empty at t = 0, which is why the midpoint is the default', async () => {
    const frame = await renderFrame(scene, 0, fakeCanvas())
    const measured = dominantPeriod(
      rowOf(frame.pixels, frame.width, textRow).slice(band[0], band[1]),
      4,
      Math.round(SEP.sepFar * 1.1),
    )
    // Pure background: the marquee's t=0 pose is fully off the right edge.
    expect(measured.period).toBe(SEP.sepFar)
    expect(measured.score).toBe(1)
  })
})
