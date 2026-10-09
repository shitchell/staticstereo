/**
 * The compile-time half of the `SirdsOpts` / `StereoOpts` seam.
 *
 * Design §8 round 2 item 6 records a bug and §9 item 8 records its fix: the
 * encoder silently ignored `noiseScale`, `SirdsOpts` was introduced as a
 * narrower type so the mistake could not be made, the claim that the compiler
 * would reject it turned out to be false (excess-property checking fires only
 * on fresh object literals, so a `StereoOpts` *variable* stayed assignable),
 * and `?: never` members were added to make the wider type genuinely
 * unassignable. §9 item 8 says "the leak probe now fails with TS2345".
 *
 * **There was no committed probe.** The guarantee was verified once by hand and
 * then rested on two `?: never` lines that read like decoration and that any
 * tidy-up would delete. This file is the probe, and it is the only defect in
 * `docs/2026-10-09-predicting-stereogram-defects.md` that a compiler can catch
 * on its own.
 *
 * Both halves are load-bearing and verified in both directions:
 *
 * - The `@ts-expect-error` fails `npm run typecheck` with TS2578 ("Unused
 *   '@ts-expect-error' directive") the moment either `?: never` member is
 *   removed from `SirdsOpts`. Measured by removing them.
 * - The runtime assertion is why the compile-time guard matters: it shows the
 *   dropped field has *no effect whatsoever* on the encoder, so the call that
 *   compiled was not merely untidy, it was a silent no-op.
 *
 * Note vitest does not type-check, so the first half is enforced by
 * `tsconfig.typecheck.json` (which includes `*.test.ts`) and not by `vitest
 * run`. Deleting the typecheck step from CI would disarm it.
 */
import { describe, it, expect } from 'vitest'
import { sirdsFromDepth } from './sirds.js'
import { DEFAULT_STEREO } from './types.js'
import type { SirdsOpts, StereoOpts } from './types.js'

const W = 240
const H = 8

/** Flat near slab, wide enough that the encoder has something to encode. */
function slab(): Float32Array {
  const d = new Float32Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 100; x < 180; x++) d[y * W + x] = 1
  return d
}

const base: SirdsOpts = { sepFar: 110, sepNear: 92, cross: false, seed: 7 }

/**
 * A `SirdsOpts` widened by exactly one pipeline field, as a named type so the
 * value is a *variable* rather than a fresh object literal. That distinction is
 * the whole bug: excess-property checking only ever looked at the literal.
 *
 * One alias per field, so each `?: never` member is pinned on its own. A single
 * probe against the whole of `StereoOpts` is satisfied by either guard
 * surviving, which would let a tidy-up delete one of them unnoticed.
 */
type Widened<K extends string> = Omit<SirdsOpts, 'noiseScale' | 'depthBlur'> &
  Record<K, number>

describe('SirdsOpts rejects the pipeline-only fields', () => {
  it('rejects an options object carrying noiseScale', () => {
    const wide: Widened<'noiseScale'> = { ...base, noiseScale: 4 }
    // @ts-expect-error `noiseScale?: never` must make this unassignable.
    const leak = (): Uint8Array => sirdsFromDepth(slab(), W, H, wide)
    expect(typeof leak).toBe('function')
  })

  it('rejects an options object carrying depthBlur', () => {
    const wide: Widened<'depthBlur'> = { ...base, depthBlur: 3 }
    // @ts-expect-error `depthBlur?: never` must make this unassignable.
    const leak = (): Uint8Array => sirdsFromDepth(slab(), W, H, wide)
    expect(typeof leak).toBe('function')
  })

  it('does not accept a resolved StereoOpts', () => {
    const stereo: StereoOpts = DEFAULT_STEREO
    // @ts-expect-error — this is the exact call that compiled clean while
    // silently dropping noiseScale and depthBlur. The two probes above pin the
    // individual guards; this one pins the call shape the pipeline would
    // actually have written.
    const leak = (): Uint8Array => sirdsFromDepth(slab(), W, H, stereo)
    expect(typeof leak).toBe('function')
  })

  it('ignores noiseScale at runtime, which is why the type must reject it', () => {
    // Cast through `unknown` to get past the guard deliberately: the point is
    // to show what the rejected call would have done.
    const sneaked = { ...base, noiseScale: 4 } as unknown as SirdsOpts
    expect(Array.from(sirdsFromDepth(slab(), W, H, sneaked)))
      .toEqual(Array.from(sirdsFromDepth(slab(), W, H, base)))
  })

  it('ignores depthBlur at runtime for the same reason', () => {
    const sneaked = { ...base, depthBlur: 3 } as unknown as SirdsOpts
    expect(Array.from(sirdsFromDepth(slab(), W, H, sneaked)))
      .toEqual(Array.from(sirdsFromDepth(slab(), W, H, base)))
  })
})
