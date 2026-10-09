/**
 * Plate / stage / margin geometry, and the one thing it exists to fix.
 *
 * The margin table in {@link marginsFor} is a *measurement*, not a derivation
 * (design §10.3 — the symmetric-margin argument that used to be there has been
 * retracted). So the tests here are in two halves:
 *
 * 1. The arithmetic: the table, the plate width, edge extension. Cheap, exact.
 * 2. **The dead zone, closed.** An object flush against the stage's left edge
 *    must be *fully* encoded. That is the entire point of the split, and it is
 *    measured with `coherentColumns` — no width floor, false-positive rate
 *    `2^-h` per column — against the same object encoded without padding, which
 *    is what keeps the probe from being vacuous.
 */
import { describe, expect, it } from 'vitest'
import { marginsFor, padDepth, plateLayoutOf, scaleRect, sceneMargins } from './plate.js'
import type { Margins } from './plate.js'
import { sirdsFromDepth } from './sirds.js'
import { coherentColumns, report, slabDepth } from './testing/metamorphic.js'
import { DEFAULT_STEREO } from './types.js'
import type { Scene, SirdsAlgorithm, SirdsOpts } from './types.js'

const SEP_FAR = DEFAULT_STEREO.sepFar   // 110
const SEP_NEAR = DEFAULT_STEREO.sepNear // 92
const ALGORITHMS: readonly SirdsAlgorithm[] = ['shift', 'linked']

/**
 * Where each encoder puts a feature's signal relative to the depth columns that
 * asked for it. Pinned independently in `metamorphic.test.ts`'s "coherent
 * column offset is exact".
 */
const SIGNAL_OFFSET: Record<SirdsAlgorithm, number> = {
  shift: -SEP_NEAR,
  linked: -(SEP_NEAR >> 1),
}

function opts(algorithm: SirdsAlgorithm, seed = 7): SirdsOpts {
  return { sepFar: SEP_FAR, sepNear: SEP_NEAR, cross: false, seed, algorithm }
}

describe('marginsFor (design §10.3)', () => {
  it('is left-heavy for shift and symmetric for linked', () => {
    // The measured table, spelled out. `shift` scans left to right and has no
    // source column for x < sep, so it loses sepFar on the left and nothing on
    // the right; `linked` centres its pairs and loses sepFar/2 per side.
    expect(marginsFor(110, 'shift')).toEqual({ left: 110, right: 55 })
    expect(marginsFor(110, 'linked')).toEqual({ left: 55, right: 55 })
  })

  it('rounds the half-margin up, so an odd sepFar never under-pads', () => {
    expect(marginsFor(111, 'shift')).toEqual({ left: 111, right: 56 })
    expect(marginsFor(111, 'linked')).toEqual({ left: 56, right: 56 })
  })

  it('sizes from sepFar and not sepNear, because sep(z) reaches sepFar', () => {
    // Not a tautology about the implementation: it is the reason `cross` needs
    // no special case. Inverting depth puts an authored near object at z=0,
    // where sep is sepFar, so a sepNear-sized margin would clip exactly the
    // scenes that opt into cross-eyed viewing.
    expect(marginsFor(200, 'shift').left).toBe(200)
    expect(marginsFor(200, 'linked').left).toBe(100)
  })

  it('rejects a sepFar that cannot produce an integer margin', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, 1, -110]) {
      expect(() => marginsFor(bad, 'shift'), `sepFar ${bad}`).toThrow(/sepFar/)
    }
  })
})

describe('plateLayoutOf', () => {
  const scene = (stereo?: Partial<Scene['stereo']>): Scene =>
    ({ size: [800, 300], stereo: stereo as Scene['stereo'], layers: [] })

  it('reports stage, margins and plate in scene pixels', () => {
    expect(plateLayoutOf(scene())).toEqual({
      margins: { left: 110, right: 55 },
      stage: { x: 110, y: 0, width: 800, height: 300 },
      plate: { width: 965, height: 300 },
    })
  })

  it('keeps the height identical — margins are x-only (§10.2)', () => {
    for (const algorithm of ALGORITHMS) {
      const l = plateLayoutOf(scene({ algorithm }))
      expect(l.plate.height, algorithm).toBe(l.stage.height)
      expect(l.stage.y, algorithm).toBe(0)
    }
  })

  it('narrows the plate under linked, because its dead zone is symmetric', () => {
    expect(plateLayoutOf(scene({ algorithm: 'linked' })).plate.width).toBe(910)
  })

  it('tracks a scene-level sepFar override', () => {
    expect(plateLayoutOf(scene({ sepFar: 40, sepNear: 30 })).plate.width).toBe(800 + 40 + 20)
  })

  it('sceneMargins and plateLayoutOf agree', () => {
    expect(sceneMargins(scene({ algorithm: 'linked' }))).toEqual(
      plateLayoutOf(scene({ algorithm: 'linked' })).margins,
    )
  })

  it('scaleRect maps scene px to output px', () => {
    expect(scaleRect(plateLayoutOf(scene()).stage, 2))
      .toEqual({ x: 220, y: 0, width: 1600, height: 600 })
  })
})

describe('padDepth', () => {
  /** A 4x2 ramp whose first and last columns are distinct from everything. */
  function ramp(): Float32Array {
    return new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8])
  }

  it('edge-extends: the margins replicate the first and last stage column', () => {
    const out = padDepth(ramp(), 4, 2, { left: 3, right: 2 })
    expect(Array.from(out.subarray(0, 9)).map(v => Number(v.toFixed(1))))
      .toEqual([0.1, 0.1, 0.1, 0.1, 0.2, 0.3, 0.4, 0.4, 0.4])
    expect(Array.from(out.subarray(9)).map(v => Number(v.toFixed(1))))
      .toEqual([0.5, 0.5, 0.5, 0.5, 0.6, 0.7, 0.8, 0.8, 0.8])
  })

  it('introduces no new depth discontinuity, which zero-fill would', () => {
    // The property, stated so it fails for zero-fill regardless of the fixture:
    // the biggest jump between adjacent columns of the plate must equal the
    // biggest jump already present in the stage. Zero-filling a stage whose
    // edge column is 1.0 manufactures a 1.0 step at the stage boundary — a hard
    // depth cliff at exactly the place the margins exist to protect.
    const w = 6, h = 1
    const stage = new Float32Array([1, 1, 0.5, 0.5, 1, 1])
    const plate = padDepth(stage, w, h, { left: 4, right: 4 })
    const biggestJump = (a: Float32Array): number => {
      let worst = 0
      for (let i = 1; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i]! - a[i - 1]!))
      return worst
    }
    expect(biggestJump(plate)).toBeCloseTo(biggestJump(stage), 6)
    expect(biggestJump(plate)).toBeCloseTo(0.5, 6)
  })

  it('returns a fresh buffer even for zero margins', () => {
    const src = ramp()
    const out = padDepth(src, 4, 2, { left: 0, right: 0 })
    expect(Array.from(out)).toEqual(Array.from(src))
    out[0] = 99
    expect(src[0]).toBeCloseTo(0.1, 6)
  })

  it('rejects a size or margin it cannot honour', () => {
    expect(() => padDepth(ramp(), 4, 3, { left: 1, right: 1 })).toThrow(/8 samples|needs/)
    expect(() => padDepth(ramp(), 0, 2, { left: 1, right: 1 })).toThrow(/positive integers/)
    expect(() => padDepth(ramp(), 4, 2, { left: -1, right: 1 })).toThrow(/non-negative/)
    expect(() => padDepth(ramp(), 4, 2, { left: 1.5, right: 1 })).toThrow(/non-negative integers/)
  })
})

/* ====================================================================== */
/* THE DEAD ZONE, CLOSED                                                  */
/* ====================================================================== */

/**
 * How many of a stage slab's own columns reach the output.
 *
 * Measured on the plate with `coherentColumns`: the columns where
 * `img[x] === img[x + sepNear]` in **every** row, which is the field a fused
 * viewer resolves. A stage column `x` is encoded iff the signal column
 * `margins.left + x + SIGNAL_OFFSET` is coherent. `h = 24` puts the
 * false-positive rate at `2^-24` per column.
 */
function encodedStageColumns(
  algorithm: SirdsAlgorithm,
  stageW: number,
  h: number,
  slab: readonly [number, number],
  margins: Margins,
): number {
  const stage = slabDepth(stageW, h, slab[0], slab[1])
  const plateW = margins.left + stageW + margins.right
  const img = sirdsFromDepth(padDepth(stage, stageW, h, margins), plateW, h, opts(algorithm))
  const cols = coherentColumns(img, plateW, h, SEP_NEAR)
  let hit = 0
  for (let x = slab[0]; x < slab[1]; x++) {
    const probe = margins.left + x + SIGNAL_OFFSET[algorithm]
    if (probe >= 0 && probe < plateW && cols[probe] === 1) hit++
  }
  return hit
}

describe('the left-edge dead zone', () => {
  const STAGE_W = 800
  const H = 24
  const SLAB: readonly [number, number] = [0, 120]
  const NONE: Margins = { left: 0, right: 0 }

  it.each(ALGORITHMS)(
    '%s: a 120px slab at stage x=0 loses columns with no margins — the probe is not vacuous',
    algorithm => {
      // The "before" measurement, kept as an assertion rather than a comment so
      // that a future encoder change which closes the dead zone on its own
      // turns this red and the margins can then be reconsidered.
      const got = encodedStageColumns(algorithm, STAGE_W, H, SLAB, NONE)
      report(`${algorithm} unpadded: stage columns encoded`, `${got}/${SLAB[1]}`)
      expect(got).toBeLessThan(SLAB[1])
    },
  )

  it.each(ALGORITHMS)(
    '%s: the same slab is fully encoded once the stage is inset by its margins',
    algorithm => {
      const margins = marginsFor(SEP_FAR, algorithm)
      const got = encodedStageColumns(algorithm, STAGE_W, H, SLAB, margins)
      report(`${algorithm} padded (${margins.left}/${margins.right}): stage columns encoded`,
        `${got}/${SLAB[1]}`)
      expect(got).toBe(SLAB[1])
    },
  )

  it.each(ALGORITHMS)('%s: so is a slab flush against the stage\'s RIGHT edge', algorithm => {
    const margins = marginsFor(SEP_FAR, algorithm)
    const slab: readonly [number, number] = [STAGE_W - 120, STAGE_W]
    const got = encodedStageColumns(algorithm, STAGE_W, H, slab, margins)
    report(`${algorithm} padded: right-edge stage columns encoded`, `${got}/120`)
    expect(got).toBe(120)
  })

  // Recorded because it contradicts design §10.3's justification for one of the
  // four numbers in its own table. `shift` pairs are `(x - sep, x)`, so no
  // depth at the right-hand edge is ever dropped and the right margin earns
  // nothing a monocular measurement can see — it is there for the fusion
  // fringe, which is perceptual. `linked` needs it: its pairs are centred, so
  // the right-hand `sep/2` columns have no in-range partner.
  it('shift needs no right margin to encode its right edge; linked does', () => {
    const slab: readonly [number, number] = [STAGE_W - 120, STAGE_W]
    const shiftNoRight = encodedStageColumns(
      'shift', STAGE_W, H, slab, { left: SEP_FAR, right: 0 })
    const linkedNoRight = encodedStageColumns(
      'linked', STAGE_W, H, slab, { left: Math.ceil(SEP_FAR / 2), right: 0 })
    report('right-edge columns encoded with right margin 0 (shift/linked)',
      `${shiftNoRight}/120 vs ${linkedNoRight}/120`)
    expect(shiftNoRight).toBe(120)
    expect(linkedNoRight).toBeLessThan(120)
  })

  // The behavioural consequence of edge extension, as opposed to the
  // arithmetic one `padDepth`'s own tests pin.
  //
  // A stage that is uniformly near must encode as a plate that is uniformly
  // near: the padding may not invent a surface. Edge extension satisfies that
  // — every pairable column of the plate is coherent at sepNear. Zero-fill does
  // not: measured, it drops to exactly the stage's own width (800 of 873 under
  // `shift`), because it has planted a far plane either side of the authored
  // near one and a viewer sees a cliff at the stage boundary that nobody
  // composed. This is the measurement behind §10.3's "edge-extend, do not
  // zero-fill"; it is the one the unit tests above cannot make.
  it.each(ALGORITHMS)('%s: a uniformly near stage encodes as a uniformly near PLATE', algorithm => {
    const stageW = 800, h = 24
    const margins = marginsFor(SEP_FAR, algorithm)
    const plateW = margins.left + stageW + margins.right
    const near = slabDepth(stageW, h, 0, stageW)
    const img = sirdsFromDepth(padDepth(near, stageW, h, margins), plateW, h, opts(algorithm))
    const hits = [...coherentColumns(img, plateW, h, SEP_NEAR)].filter(Boolean).length
    // `coherentColumns` leaves the last `off` columns unset: there is no pair
    // there. Everything else must be coherent.
    report(`${algorithm} coherent columns over the whole plate`, `${hits}/${plateW - SEP_NEAR}`)
    expect(hits).toBe(plateW - SEP_NEAR)
    expect(hits).toBeGreaterThan(stageW)
  })

  // Where the percept lands, which is the question margins do NOT answer and
  // which decides which encoder an author should prefer now that both are
  // padded. A pair `(P, P+sep)` fuses to one point seen at `P + sep/2`:
  // `linked` links `(x - sep/2, x + sep/2)` so the percept of stage column x is
  // at stage column x, while `shift` links `(x - sep, x)` so its percept sits
  // `sep/2` to the LEFT of the column that asked for it — 46..55px of
  // whole-image displacement into the left margin, at the shipped defaults.
  it('linked registers a percept at the authored column; shift displaces it left', () => {
    const margins = { shift: marginsFor(SEP_FAR, 'shift'), linked: marginsFor(SEP_FAR, 'linked') }
    const rows: string[] = []
    for (const algorithm of ALGORITHMS) {
      const m = margins[algorithm]
      // Signal column of stage x, plus half a separation = the percept centre.
      const perceptOfStageX = (x: number) =>
        m.left + x + SIGNAL_OFFSET[algorithm] + SEP_NEAR / 2 - m.left
      rows.push(`${algorithm}: stage 0 → ${perceptOfStageX(0)}, stage 400 → ${perceptOfStageX(400)}`)
    }
    report('percept position in stage coordinates', rows.join(' | '))
    const shiftError = SIGNAL_OFFSET.shift + SEP_NEAR / 2
    const linkedError = SIGNAL_OFFSET.linked + SEP_NEAR / 2
    expect(linkedError).toBe(0)
    expect(shiftError).toBe(-SEP_NEAR / 2)
  })
})
