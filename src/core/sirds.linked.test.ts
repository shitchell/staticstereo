/**
 * Comparative measurements between the two encoders.
 *
 * These are not unit tests of either algorithm's parts; they are the
 * measurements that decide whether `'linked'` is worth having at all, pinned so
 * a regression in either encoder shows up as a number rather than as a
 * "streaky" render three weeks later.
 *
 * Everything here diffs a rendered frame against an **object-free control** at
 * the same seed, or measures an *equality structure* directly. Both are
 * necessary and neither is sufficient:
 *
 * - A pixel diff finds where an object left a mark. By eye there is nothing to
 *   see — the frame is noise either way.
 * - `dominantPeriod` finds the encoded depth, but it is blind to the ghost:
 *   design §2.3 records that the band right of a near shape measures `sepFar`
 *   at score 1.000, "indistinguishable from clean background". It is. What it
 *   is *not* indistinguishable from is background at the `sepNear` offset, and
 *   `agreement()` below measures exactly that — see `ghosts downstream`, which
 *   contradicts §2.3's conclusion that no measurement in this repo can see the
 *   artifact.
 */
import { describe, it, expect } from 'vitest'
import { sirdsFromDepth } from './sirds.js'
import type { SirdsAlgorithm, SirdsOpts } from './types.js'

const SEP = { sepFar: 110, sepNear: 92 }

function opts(algorithm: SirdsAlgorithm, over: Partial<SirdsOpts> = {}): SirdsOpts {
  return { ...SEP, cross: false, seed: 7, algorithm, ...over }
}

/** Depth map with one flat near slab spanning `[x0, x1)`. `x1 <= x0` = empty. */
function slabDepth(w: number, h: number, x0: number, x1: number): Float32Array {
  const d = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) d[y * w + x] = 1
  return d
}

/** Fraction of pixels in the column band `[x0, x1)` that differ. */
function bandDiff(
  a: Uint8Array, b: Uint8Array, w: number, h: number, x0: number, x1: number,
): number {
  let n = 0
  for (let y = 0; y < h; y++) {
    for (let x = x0; x < x1; x++) if (a[y * w + x] !== b[y * w + x]) n++
  }
  return n / (h * (x1 - x0))
}

/** Per-200px-band difference from an object-free control. */
function bands(a: Uint8Array, b: Uint8Array, w: number, h: number): number[] {
  const out: number[] = []
  for (let x = 0; x < w; x += 200) out.push(bandDiff(a, b, w, h, x, Math.min(x + 200, w)))
  return out
}

/**
 * Fraction of `off`-separated pixel pairs in `[x0, x1)` that agree.
 *
 * 1.0 is a perfect wallpaper at that offset; 0.5 is chance for a binary field.
 * This is the statistic that sees the ghost: a region that still measures a
 * clean `sepFar` period can carry a `sepNear` agreement well above chance,
 * which is a near surface's signature sitting in what should be background.
 */
function agreement(
  img: Uint8Array, w: number, h: number, x0: number, x1: number, off: number,
): number {
  let n = 0, ok = 0
  for (let y = 0; y < h; y++) {
    for (let x = x0; x + off < x1; x++) {
      n++
      if (img[y * w + x] === img[y * w + x + off]) ok++
    }
  }
  return ok / n
}

/**
 * Columns where `x` and `x + off` are equal in **every** row.
 *
 * For a slab (identical in every row) a chance agreement across h rows is
 * `2^-h`, so with h = 24 this is effectively the set of columns the encoder
 * genuinely constrained at that offset — directly or transitively.
 */
function linkedColumns(img: Uint8Array, w: number, h: number, off: number): number[] {
  const out: number[] = []
  for (let x = 0; x + off < w; x++) {
    let all = true
    for (let y = 0; y < h && all; y++) if (img[y * w + x] !== img[y * w + x + off]) all = false
    if (all) out.push(x)
  }
  return out
}

describe('contamination downstream of a near object', () => {
  const W = 1600, H = 40

  function measure(algorithm: SirdsAlgorithm, x0: number, x1: number): number[] {
    const o = opts(algorithm)
    const control = sirdsFromDepth(slabDepth(W, H, 0, 0), W, H, o)
    const withSlab = sirdsFromDepth(slabDepth(W, H, x0, x1), W, H, o)
    return bands(withSlab, control, W, H)
  }

  /*
   * MEASURED, 1600x40, sepFar 110 / sepNear 92, seed 7, 200px bands, fraction
   * of pixels differing from an object-free control:
   *
   *   shift  slab@150-350 : .123 .487 .484 .485 .485 .483 .483 .487
   *   shift  slab@1250-1450: .000 .000 .000 .000 .000 .000 .366 .487
   *   linked slab@150-350 : .495 .264 .003 .007 .007 .007 .007 .003
   *   linked slab@1250-1450: .496 .498 .497 .496 .499 .498 .499 .012
   *
   * Downstream of a left-hand object the two differ by ~70x (0.0067 vs 0.485).
   * The mirror image is real and is not hidden: `linked` rewrites the colours
   * of everything *upstream* instead. `ghosts downstream` below is the test
   * that says why those two are not equally bad.
   */
  // DOCUMENTS THE BUG `'linked'` EXISTS TO FIX.
  it('shift rewrites the whole frame downstream of the slab', () => {
    const b = measure('shift', 150, 350)
    for (let i = 3; i < b.length; i++) expect(b[i]!).toBeGreaterThan(0.4)
  })

  it('shift leaves the region upstream of the slab untouched', () => {
    const b = measure('shift', 1250, 1450)
    for (let i = 0; i < 5; i++) expect(b[i]!).toBe(0)
  })

  // THE DECISIVE TEST. The colouring pass of the linked encoder walks right to
  // left and only ever reads `same[x] > x`, so a pixel's value depends
  // exclusively on pixels to its right and a near object cannot rewrite
  // anything downstream of itself. The residue is not zero: merging two
  // equivalence classes gives both of them the colour of whichever had the
  // right-most member, so one class per merge changes everywhere. Measured at
  // 0.003–0.007 per band against shift's 0.483–0.487; the 0.05 threshold is an
  // order of magnitude above what was measured and two below shift.
  it('linked leaves everything downstream of the slab near-pristine', () => {
    const b = measure('linked', 150, 350)
    for (let i = 3; i < b.length; i++) expect(b[i]!).toBeLessThan(0.05)
  })

  it('linked beats shift by a wide margin in every downstream band', () => {
    const shift = measure('shift', 150, 350)
    const linked = measure('linked', 150, 350)
    for (let i = 3; i < shift.length; i++) {
      expect(linked[i]!).toBeLessThan(shift[i]! / 10)
    }
  })

  // The honest half of the finding, asserted rather than mentioned: the linked
  // encoder's dependency direction is reversed, so an object DOES rewrite
  // colours upstream of itself, wholesale.
  it('linked rewrites colours upstream of the slab instead', () => {
    const b = measure('linked', 1250, 1450)
    for (let i = 0; i < 5; i++) expect(b[i]!).toBeGreaterThan(0.4)
  })
})

describe('ghosts downstream', () => {
  const W = 1600, H = 40

  /*
   * MEASURED agreement at offset 110 / offset 92, same frames as above:
   *
   *   shift  slab@150-350, bands 400..1600 : 1.000 / 0.587
   *   linked slab@150-350, bands 400..1600 : 1.000 / 0.500
   *   linked slab@1250-1450, bands 0..1200 : 1.000 / 0.501
   *
   * Both encoders leave a perfect sepFar wallpaper downstream, exactly as
   * design §2.3 found. But the shift encoder also leaves a sepNear agreement
   * of 0.587 — about 11 standard errors above chance — because it replicates a
   * patch of near-period content every sepFar px to the right edge. That is
   * the ghost, and it IS monocularly measurable after all. The linked
   * encoder's downstream sepNear agreement is 0.500: chance, i.e. no ghost.
   */
  it('shift leaves a near-period ghost in the far background downstream', () => {
    const img = sirdsFromDepth(slabDepth(W, H, 150, 350), W, H, opts('shift'))
    expect(agreement(img, W, H, 400, W, SEP.sepFar)).toBe(1)
    expect(agreement(img, W, H, 400, W, SEP.sepNear)).toBeGreaterThan(0.55)
  })

  it('linked leaves the downstream background at chance', () => {
    const img = sirdsFromDepth(slabDepth(W, H, 150, 350), W, H, opts('linked'))
    expect(agreement(img, W, H, 400, W, SEP.sepFar)).toBe(1)
    expect(agreement(img, W, H, 400, W, SEP.sepNear)).toBeLessThan(0.52)
  })

  // This is what makes the linked encoder's upstream colour churn acceptable:
  // the structure a viewer fuses is untouched there. Every sepFar pair still
  // matches and the sepNear offset is at chance, so it is still background —
  // recoloured background, which is to say: noise, which is what it was.
  it('linked keeps the upstream background structurally intact', () => {
    const img = sirdsFromDepth(slabDepth(W, H, 1250, 1450), W, H, opts('linked'))
    expect(agreement(img, W, H, 0, 1200, SEP.sepFar)).toBe(1)
    expect(agreement(img, W, H, 0, 1200, SEP.sepNear)).toBeLessThan(0.52)
  })
})

describe('edge dead zones', () => {
  const W = 640, H = 24
  const HALF_NEAR = SEP.sepNear >> 1   // 46

  /**
   * How much of a near slab's depth survives encoding, per edge position.
   *
   * For `'linked'` a pixel diff against a control cannot answer this — it
   * rewrites colours upstream of the object wholesale, so almost every column
   * "differs". The structural probe is the right instrument: a near surface is
   * encoded at column `c` iff `(c - sep/2, c + sep/2)` ended up constrained.
   */
  function encodedCentres(algorithm: SirdsAlgorithm, x0: number, x1: number): number[] {
    const img = sirdsFromDepth(slabDepth(W, H, x0, x1), W, H, opts(algorithm))
    const half = algorithm === 'linked' ? HALF_NEAR : 0
    return linkedColumns(img, W, H, SEP.sepNear)
      .map(x => x + half)
      .filter(c => c >= x0 && c < x1)
  }

  /*
   * MEASURED, 640x24, 120px slab, `'linked'`, encoded centres of 120:
   *
   *   geo   0..119 -> centres  46..119   ( 74)   left  dead zone 46 = sepNear/2
   *   geo  20..139 -> centres  46..139   ( 94)
   *   geo  46..165 -> centres  46..165   (120)   nothing lost
   *   geo 260..379 -> centres 260..379   (120)
   *   geo 500..619 -> centres 500..593   ( 94)
   *   geo 520..639 -> centres 520..593   ( 74)   right dead zone 46 = sepNear/2
   *
   * So the dead zone IS symmetric, `sep(z)/2` at each edge, as predicted. The
   * worst case over depth is `ceil(sepFar/2)` = 55 px per side, since a
   * background column's own pair is 110 wide.
   */
  it('linked drops exactly the centres within sepNear/2 of the left edge', () => {
    expect(encodedCentres('linked', 0, 120)[0]).toBe(HALF_NEAR)
    expect(encodedCentres('linked', 20, 140)[0]).toBe(HALF_NEAR)
    expect(encodedCentres('linked', HALF_NEAR, HALF_NEAR + 120)[0]).toBe(HALF_NEAR)
  })

  it('linked drops exactly the centres within sepNear/2 of the right edge', () => {
    const last = (a: number[]): number => a[a.length - 1]!
    expect(last(encodedCentres('linked', 520, 640))).toBe(W - 1 - HALF_NEAR)
    expect(last(encodedCentres('linked', 500, 620))).toBe(W - 1 - HALF_NEAR)
  })

  it('linked loses nothing once the object clears both margins', () => {
    expect(encodedCentres('linked', 260, 380)).toHaveLength(120)
  })

  // REGRESSION WITNESS for the shift encoder, not an endorsement. Shaun hit
  // this with a ball at x=80, which fused as a crescent: the depth of every
  // column with `x < sep(x)` is computed and then discarded, because there is
  // no source column to copy from. Asymmetric — the right edge loses nothing.
  it('shift discards object depth for every column left of its own sep', () => {
    const o = opts('shift')
    const control = sirdsFromDepth(slabDepth(W, H, 0, 0), W, H, o)
    const img = sirdsFromDepth(slabDepth(W, H, 20, 140), W, H, o)
    let first = -1
    for (let x = 0; x < W && first < 0; x++) {
      if (bandDiff(img, control, W, H, x, x + 1) > 0) first = x
    }
    // 92 = sepNear: inside the slab sep is 92, so column 92 is the first with
    // a source. Columns 20..91 of the object encode nothing at all.
    expect(first).toBe(SEP.sepNear)

    // The right edge, by contrast, is fine.
    const right = sirdsFromDepth(slabDepth(W, H, 500, 620), W, H, o)
    expect(bandDiff(right, control, W, H, 500, 501)).toBeGreaterThan(0)
  })
})

/**
 * Hidden-surface removal, mutation-tested — and the one place the occlusion
 * *slope* is pinned rather than merely exercised.
 *
 * The derivation in `sirds.ts` gives `z_t = z + 2t/R` for the depth at which a
 * surface `t` columns away grazes the sightline, with `R = sepFar - sepNear`.
 * Two numbers follow from it, and both are checked here:
 *
 * - A near plane occludes only out to `t` where `z_t` reaches 1, i.e. `R/2`
 *   columns. **At the shipped 18px budget that is 9 columns**, so HSR barely
 *   fires: a far pair still reaches 46px into a near surface. That is
 *   geometrically right — 18px of disparity is a very thin plate hovering just
 *   in front of the background — but it means the default budget is nearly
 *   insensitive to this check, and that is worth knowing before concluding
 *   that HSR is what makes this encoder better. (It is not; the dependency
 *   direction is.)
 * - A far pair centred `d` columns from a near surface penetrates it by
 *   `floor(sepFar/2) - d` and survives only while `d >= ceil(R/2)`, so the
 *   deepest surviving penetration is exactly
 *   `floor(sepFar/2) - ceil(R/2)`.
 *
 * Measured, 800x24, slab [300,500), sepFar 110, `deepest` = the deepest column
 * inside the slab reached by a surviving `sepFar` link:
 *
 *     sepNear   R    bound   measured   surviving links
 *        92    18      46       46           47
 *        70    40      35       35           36
 *        60    50      30       30           31
 *        40    70      20       20           21
 *        30    80      15       15           16
 *        20    90      10       10           11
 *
 * The bound is asserted as an **equality** across that whole range, which is
 * what makes the slope itself testable: halving it (the paper's
 * `2(2 - mu·z)t/(mu·E)` rather than this `2t/R`) cuts every penetrating link
 * and `measured` collapses to 0.
 */
describe('hidden-surface removal', () => {
  const W = 800, H = 24, C1 = 300, C2 = 500
  const BUDGETS = [92, 70, 60, 40, 30, 20]

  function frame(sepNear: number): Uint8Array {
    return sirdsFromDepth(
      slabDepth(W, H, C1, C2), W, H, opts('linked', { sepNear }),
    )
  }

  // Goes RED if the visibility check is disabled (the far wallpaper then
  // reaches floor(sepFar/2) - 1 px into the slab at every budget), if it is
  // inverted, or if the 2t/R slope is wrong by any factor.
  it.each(BUDGETS)('cuts far pairs a near surface occludes (sepNear %i)', sepNear => {
    const img = frame(sepNear)
    const intruding = linkedColumns(img, W, H, SEP.sepFar)
      .filter(x => x + SEP.sepFar >= C1 && x + SEP.sepFar < C2)
      .map(x => x + SEP.sepFar - C1)
    const deepest = intruding.length === 0 ? 0 : Math.max(...intruding)
    expect(deepest).toBe(
      Math.floor(SEP.sepFar / 2) - Math.ceil((SEP.sepFar - sepNear) / 2),
    )
  })

  // The companion assertion, and the reason the test above cannot be satisfied
  // by cutting everything: goes RED if the check is inverted (`return false`,
  // or the `>=` flipped to `<=`), which deletes the object instead.
  it.each(BUDGETS)('keeps every pair the near surface needs (sepNear %i)', sepNear => {
    const img = frame(sepNear)
    const centres = linkedColumns(img, W, H, sepNear)
      .map(x => x + (sepNear >> 1))
      .filter(c => c >= C1 && c < C2)
    expect(centres).toHaveLength(C2 - C1)
  })
})
