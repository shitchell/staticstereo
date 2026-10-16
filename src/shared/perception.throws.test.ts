import { describe, expect, it } from 'vitest'
import { DEFAULT_STEREO, resolveStereo } from '../core/index.js'
import type { Scene, SirdsAlgorithm, StereoOpts } from '../core/types.js'
import { PERCEPTION_FUNCTIONS, callWith } from './testing/perceptionRoster.js'

/**
 * **P7 criterion 7** (R22 obligation 2): no perception function throws **on any
 * `StereoOpts`**, the inverted case included.
 *
 * Honoured today and unwitnessed. It is the stated reason `collidingPairs` and
 * `cardboarding` take `(scene, stereo)` rather than calling `resolveStereo`,
 * which throws at `src/core/render.ts:121-127` on `sepNear >= sepFar` —
 * precisely the configuration obligation 2 forbids the model from refusing. So
 * the property is load-bearing for two signatures and was visible nowhere.
 *
 * ## The qualifier is the sensor
 *
 * *"on any `StereoOpts`"* is not decoration, and a sensor written as "no
 * perception function throws" would **contradict two assertions already in the
 * suite**: `perception.test.ts`'s `refuses an index the scene does not have`
 * (`soloLayerScene`) and `site/legibility.test.ts`'s `refuses a fraction
 * outside (0, 1]` (`measureInk`). Those two throws are deliberate, neither
 * function takes a `StereoOpts`, and neither assertion is weakened here.
 *
 * So the **only** axis that varies is the stereo. Every other argument comes
 * from `perceptionRoster.ts`'s `argumentFor` and is valid. The sweep therefore
 * says nothing about `measureInk`'s dimension guard or `soloLayerScene`'s index
 * guard — and must not.
 *
 * The roster is shared with `perception.contract.test.ts` for the reason §9
 * gives about hand-written lists: a function added to the module is classified
 * there or the gate fails, and once classified it is swept here automatically.
 * A sensor with its own list of "the functions that take a `StereoOpts`" would
 * go stale green the first time a tenth one was written.
 *
 * ## What the numeric space is, and what it deliberately is not
 *
 * Every numeric field is swept without restriction — inverted, zero, negative,
 * fractional, subnormal, enormous, and non-finite. All of them are
 * *type*-reachable and all of them are the module's declared responsibility:
 * `perception.ts` commits in as many words to taking an unvalidated
 * `StereoOpts`, one it "will be handed by an editor control mid-edit".
 *
 * `algorithm` is **not** swept over invalid strings. The field is a union, an
 * unknown name is reachable only through a cast, and a sensor over inputs the
 * type system already excludes is machinery. Both valid names are swept,
 * because `marginsFor` dispatches on one of them and a perception function
 * could grow the same dispatch.
 *
 * ## The control, and why it is not optional (§6.5a)
 *
 * A sweep whose verdict is "nothing threw" is the repo's dominant failure mode
 * waiting to happen — a check that cannot see reports fine. {@link countThrows}
 * is therefore run twice over the **same case stream**: once over the module,
 * where the count must be 0, and once over `resolveStereo`, where it must not
 * be. The control is not a contrivance picked to make the instrument look
 * alive; it is the exact function the module is structured to avoid calling.
 */

/**
 * The numeric values swept exhaustively, before any random case.
 *
 * Every regime the module's own code distinguishes, and nothing chosen for
 * being today's output: `sepAt`'s floor of 2 and the values either side of it;
 * both parities, because `marginsFor` and the encoder's skip test round
 * differently on odd separations; the shipped 110/92 and the two `fusionComfort`
 * pins; zero and negative, which invert the budget; fractions, which defeat the
 * closed form; the three non-finites, which every comparison in the module is
 * written to fall through; and the four magnitude extremes, where arithmetic
 * stops being exact.
 */
const VALUES: readonly number[] = [
  0, -0, 1, -1, 2, -2, 3, 18, 22, 32, 78, 92, 93, 110, 111, 140,
  0.5, -0.5, 110.5, 92.3,
  Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY,
  Number.EPSILON, Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE,
  Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 1e-300, 1e300,
]

const ALGORITHMS: readonly SirdsAlgorithm[] = ['shift', 'linked']
const CROSS: readonly boolean[] = [false, true]

/**
 * How many random cases follow the exhaustive ones.
 *
 * **The exhaustive part is not a sample and is not sized by this number.**
 * Every boundary the module's branches turn on is in {@link VALUES} and is
 * swept one field at a time, then pairwise across the separations and across
 * the scalings: 5,921 cases before a single random one. What the random part
 * adds is the only coverage of *four* unusual values at once, which no product
 * of two fields reaches.
 *
 * **Sized against a measurement rather than a guess.** The whole file runs in
 * 2.9 s — 105,921 cases × 13 functions, 1.38 M calls, plus the control's
 * 105,921 — against a 48 s suite, so this is not where the budget goes and it
 * was not trimmed on runtime grounds. 20,000 was measured first at 0.7 s and
 * found nothing this does not; the larger number is kept because the cost is
 * known and the coverage is the only thing it buys.
 */
const RANDOM_CASES = 100000

/**
 * A fixed-seed generator, so a failure reproduces.
 *
 * Mulberry32, written out rather than imported from `core/rng.ts`: that
 * generator is the *product*, its stream is pinned by `rng.test.ts`, and a test
 * that consumed it would couple this sweep's case list to a file whose output
 * is deliberately frozen. Nothing here needs a good generator — it needs a
 * *reproducible* one.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const RANDOM_SEED = 20261015

/** Every `StereoOpts` the sweep visits, exhaustive part first. */
function* cases(): Generator<StereoOpts> {
  const base = DEFAULT_STEREO
  const inverted: StereoOpts = { ...base, sepFar: 92, sepNear: 110 }

  // One field at a time, so a failure has the smallest possible witness.
  for (const v of VALUES) {
    yield { ...base, sepFar: v }
    yield { ...base, sepNear: v }
    yield { ...base, noiseScale: v }
    yield { ...base, depthBlur: v }
    yield { ...base, seed: v }
  }

  // The separation pair exhaustively, which is the axis every function reads.
  for (const algorithm of ALGORITHMS) {
    for (const cross of CROSS) {
      for (const sepFar of VALUES) {
        for (const sepNear of VALUES) {
          yield { ...base, sepFar, sepNear, cross, algorithm }
        }
      }
    }
  }

  // The scaling pair exhaustively, at both a normal and an inverted separation
  // pair — `cardboarding` reads `depthBlur` and nothing else reads `noiseScale`
  // at all, which is itself the claim design §10.6 makes.
  for (const from of [base, inverted]) {
    for (const noiseScale of VALUES) {
      for (const depthBlur of VALUES) {
        yield { ...from, noiseScale, depthBlur }
      }
    }
  }

  // The four-way combinations the products above cannot reach.
  const rand = mulberry32(RANDOM_SEED)
  const pick = (): number => {
    const r = rand()
    if (r < 0.6) return VALUES[Math.floor(rand() * VALUES.length)]!
    // A magnitude anywhere in the double's exponent range, signed. The module
    // divides, subtracts and rounds; the places that stop being exact are at
    // the ends of that range and nowhere a hand-picked list would land.
    return (rand() < 0.5 ? -1 : 1) * rand() * Math.pow(10, Math.floor(rand() * 600) - 300)
  }
  for (let i = 0; i < RANDOM_CASES; i++) {
    yield {
      sepFar: pick(), sepNear: pick(), noiseScale: pick(), depthBlur: pick(),
      seed: pick(),
      cross: rand() < 0.5,
      algorithm: ALGORITHMS[Math.floor(rand() * ALGORITHMS.length)]!,
    }
  }
}

/** The first case that made `call` throw, with the throw, or `undefined`. */
function firstThrow(
  call: (stereo: StereoOpts) => unknown,
): { stereo: StereoOpts; error: unknown } | undefined {
  for (const stereo of cases()) {
    try {
      call(stereo)
    } catch (error) {
      return { stereo, error }
    }
  }
  return undefined
}

/** How many cases made `call` throw. The instrument, used on both sides. */
function countThrows(call: (stereo: StereoOpts) => unknown): { threw: number; total: number } {
  let threw = 0
  let total = 0
  for (const stereo of cases()) {
    total++
    try {
      call(stereo)
    } catch {
      threw++
    }
  }
  return { threw, total }
}

describe('no perception function throws on any StereoOpts', () => {
  it.each(PERCEPTION_FUNCTIONS)('%s is advisory, not a validator', name => {
    // R22 obligation 2, per function so a failure names the one that broke it.
    // `firstThrow` rather than a count, because the useful artefact of a red
    // run is the smallest `StereoOpts` that did it — and with a fixed seed the
    // random part of the stream reproduces exactly.
    const found = firstThrow(stereo => callWith(name, stereo))
    expect(
      found && `${name} threw on ${JSON.stringify(found.stereo)}: ${String(found.error)}`,
    ).toBeUndefined()
  })

  it('swept every function over a stream that is not empty', () => {
    // The vacuity floor. A generator that yielded nothing would make every
    // assertion above pass, which is the shape of defect this repo has found
    // eight times. The count is asserted as a lower bound rather than pinned,
    // because pinning it would make `VALUES` unextendable without editing a
    // number that means nothing.
    const { total } = countThrows(() => undefined)
    expect(total).toBeGreaterThan(RANDOM_CASES)
    expect(PERCEPTION_FUNCTIONS.length).toBeGreaterThan(0)
  })

  it('would see a throw — the same stream, pointed at the function it avoids', () => {
    // §6.5a's paired control, and the mutation half is not planted: it is
    // `resolveStereo`, the real function `collidingPairs` and `cardboarding`
    // are shaped to avoid calling. If this stream could not reach a throwing
    // configuration, the sweep above would be measuring nothing.
    //
    // Both halves are named: the null result is "the module threw on 0 of N",
    // the moved result is "resolveStereo threw on most of the same N".
    const scene = (stereo: StereoOpts): Scene => ({ size: [320, 180], layers: [], stereo })
    const control = countThrows(stereo => resolveStereo(scene(stereo)))
    expect(control.threw).toBeGreaterThan(0)
    // Not merely non-zero: the inverted pair alone is most of the stream, so an
    // instrument that only caught a handful would be catching something else.
    expect(control.threw / control.total).toBeGreaterThan(0.5)
  })
})
