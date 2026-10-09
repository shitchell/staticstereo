import { describe, it, expect } from 'vitest'
import { rasterDepth } from './raster.js'
import { fakeCanvas, rgbaImage, FAKE_CHAR_ASPECT } from './testing/fakeCanvas.js'
import type { Scene } from './types.js'

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

describe('rasterDepth text measurement', () => {
  const CHARS = 100
  const SIZE = 10
  const CONTENT_W = CHARS * SIZE * FAKE_CHAR_ASPECT // 600px of text in a 40px frame

  /**
   * `marquee` travels from +sceneW to -contentW. Both assertions below fail if
   * `contentW` is not a real `measureText` result: with contentW = 0 the travel
   * collapses to 40px and the midpoint leaves the left 20 columns empty instead
   * of covered.
   */
  function marqueeScene(): Scene {
    return {
      size: [40, 10],
      duration: 1,
      layers: [
        {
          type: 'text', text: 'X'.repeat(CHARS), size: SIZE, at: [0, 0], depth: 1,
          // speed chosen so the preset's derived duration is exactly 1s
          anim: { kind: 'marquee', speed: 40 + CONTENT_W },
        },
      ],
    }
  }

  it('spans the whole frame mid-travel when the text is wider than the scene', async () => {
    const d = await rasterDepth(marqueeScene(), 0.5, fakeCanvas())
    for (const v of d) expect(v).toBeCloseTo(1, 6)
  })

  it('carries over-wide text off the left edge by its measured width', async () => {
    // u = 0.98 -> x = 40 - 0.98 * 640 = -587.2, so the text spans [-587.2, 12.8)
    const d = await rasterDepth(marqueeScene(), 0.98, fakeCanvas())
    expect(at(d, 40, 12, 5)).toBeCloseTo(1, 6)
    expect(at(d, 40, 13, 5)).toBe(0)
    expect(at(d, 40, 39, 5)).toBe(0)
  })
})

describe('rasterDepth scene duration', () => {
  function slideScene(duration?: number): Scene {
    return {
      size: [80, 2],
      ...(duration === undefined ? {} : { duration }),
      layers: [
        {
          type: 'shape', shape: 'rect', at: [0, 0], w: 4, h: 2, depth: 1,
          anim: { kind: 'slide', from: [0, 0], to: [40, 0] },
        },
      ],
    }
  }

  // Design §4.1: a zero-width window pins every track at its t=0 pose (or, for
  // `repeat: 'once'`, at its end pose) — which for `marquee` renders nothing at
  // all. An absent duration therefore means 1 second, never 0.
  it('treats an absent duration as 1 second', async () => {
    const d = await rasterDepth(slideScene(), 0.5, fakeCanvas())
    expect(at(d, 80, 20, 0)).toBeCloseTo(1, 6) // halfway through a 1s slide
    expect(at(d, 80, 0, 0)).toBe(0)
    expect(at(d, 80, 40, 0)).toBe(0) // where a zero-duration scene would pin it
  })

  it('treats an explicit duration of 0 as 1 second too', async () => {
    const d = await rasterDepth(slideScene(0), 0.5, fakeCanvas())
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
