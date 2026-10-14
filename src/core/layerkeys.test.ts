/**
 * The runtime witness for `LAYER_KEYS` and its five `AssertNever` pairs.
 *
 * The pairs in `types.ts` are enforced by `npm run typecheck` alone — vitest
 * does not type-check — so without something here the whole guard is invisible
 * to `npm test`, exactly as `anim/track.ts:204-208` records for
 * `SUMMED_CHANNELS`. That is why the roster is exported rather than
 * module-private.
 *
 * ## How a *runtime* test can witness a *type*
 *
 * It cannot read the type, so it reads something the compiler forces to track
 * the type instead. `FULLY_POPULATED` is annotated
 * `{ [T in Layer['type']]: Required<LayerOf<T>> }`, which makes it
 *
 * - **total over the variants** — a sixth member of the union is a missing
 *   property here, and
 * - **total over each variant's keys** — `Required<>` strips the `?`, so every
 *   optional key must be supplied with a value.
 *
 * So the samples are not a hand-written list of "the keys a layer has"
 * (§9: such a list goes stale silently). They are compile-forced to be exactly
 * that set, and `Object.keys()` then makes the set observable at runtime. Add
 * `glow?: number` to the `shape` variant and the sequence is: `types.ts`'s
 * `_NoShapeLayerKeyMissing` fails typecheck; fix the roster and this file still
 * fails typecheck for a missing property; supply it and the test below is
 * already green because both sides moved together. Fix only one of the two and
 * `npm test` is what goes red.
 *
 * Note the samples are deliberately *not* `as const`: the literal types are
 * worthless here (nothing reads the values) and a `readonly [0, 0]` is not
 * assignable to `at?: [number, number]`, so the annotation that does the work
 * would have had to be weakened to accept it.
 */
import { describe, expect, it } from 'vitest'
import { LAYER_KEYS } from './types.js'
import type { Layer, LayerKey, LayerOf } from './types.js'

/**
 * One sample per variant carrying **every** key that variant admits.
 *
 * Values are the cheapest thing of the right type; nothing reads them, only
 * `Object.keys`. `mode`/`mask`/`loop`/`shape` take one arbitrary member of
 * their closed sets for the same reason.
 */
const FULLY_POPULATED: { [T in Layer['type']]: Required<LayerOf<T>> } = {
  text: {
    type: 'text', text: 'HELLO', size: 64, font: 'Inter', weight: '700',
    id: 'l1', name: 'title', depth: 1, at: [0, 0], anim: { keys: [] },
  },
  image: {
    type: 'image', src: 'art/ball.png', mode: 'silhouette', mask: 'alpha',
    id: 'l2', name: 'ball', depth: 1, at: [0, 0], anim: { keys: [] },
  },
  gif: {
    type: 'gif', src: 'art/spin.gif', loop: 'loop', mode: 'silhouette', mask: 'alpha',
    id: 'l3', name: 'spin', depth: 1, at: [0, 0], anim: { keys: [] },
  },
  shape: {
    type: 'shape', shape: 'circle', r: 10, w: 20, h: 20, start: 0, end: 90,
    id: 'l4', name: 'pac', depth: 1, at: [0, 0], anim: { keys: [] },
  },
  draw: {
    type: 'draw', fn: './plugins/spiral.js',
    id: 'l5', name: 'spiral', depth: 1, at: [0, 0], anim: { keys: [] },
  },
}

type Roster = Record<string, readonly string[]>
type Samples = Record<string, object>

/**
 * `<variant>.<key>` for every key on one side of the comparison and not the
 * other, prefixed with which side is missing it.
 *
 * Extracted as a plain function over plain inputs so the paired control below
 * can drive it with a roster that *is* wrong. On a correct tree the assertion
 * in the first test never reaches its failing branch, and without the control
 * nothing would notice this collapsing to `() => []`.
 */
function disagreements(roster: Roster, samples: Samples): string[] {
  const out: string[] = []
  for (const variant of new Set([...Object.keys(roster), ...Object.keys(samples)])) {
    const declared = new Set(roster[variant] ?? [])
    const actual = new Set(Object.keys(samples[variant] ?? {}))
    for (const key of actual) if (!declared.has(key)) out.push(`${variant}.${key} is on the type, not in LAYER_KEYS`)
    for (const key of declared) if (!actual.has(key)) out.push(`${variant}.${key} is in LAYER_KEYS, not on the type`)
  }
  return out.sort()
}

describe('LAYER_KEYS', () => {
  it('lists exactly the keys each Layer variant admits', () => {
    expect(
      disagreements(LAYER_KEYS, FULLY_POPULATED),
      'the roster and the type have drifted apart. A key on the type but not in the roster ' +
      'is a control the editor will never offer (R6); a key in the roster but not on the ' +
      'type is a control bound to nothing.',
    ).toEqual([])
  })

  it('covers every variant of the union, including the one the browser refuses', () => {
    // `draw` is rejected by `site/scene.ts:268`, so an editor-side list would
    // have four entries. This one is over `Layer['type']` and must have five
    // or the `Record` is not exhaustive — the two counts are about different
    // things and both are right. Derived from the compile-forced samples
    // rather than typed out here, so it cannot disagree with the union.
    expect(Object.keys(LAYER_KEYS).sort()).toEqual(Object.keys(FULLY_POPULATED).sort())
    expect(Object.keys(LAYER_KEYS)).toContain('draw')
  })

  it('would say so — the same predicate over a roster made wrong on purpose', () => {
    // The paired control (§6.5a). Pinned exactly rather than merely non-empty:
    // "found something" is also satisfied by a predicate that has rotted into
    // matching everything, and `text` is here to be the variant it must *not*
    // name.
    const wrong: Roster = {
      ...(LAYER_KEYS as unknown as Roster),
      shape: LAYER_KEYS.shape.filter(k => k !== 'start'),
      draw: [...LAYER_KEYS.draw, 'glow'],
    }
    expect(disagreements(wrong, FULLY_POPULATED)).toEqual([
      'draw.glow is in LAYER_KEYS, not on the type',
      'shape.start is on the type, not in LAYER_KEYS',
    ])
  })
})

/**
 * Not a duplicate of the above: that one proves the roster matches the type,
 * this proves the roster is not vacuous in the way a `Record` cannot catch —
 * every variant carries the five keys `LayerBase` contributes plus its own
 * discriminant, so an entry reduced to `[]` is visible even though `readonly
 * LayerKey[]` admits the empty array.
 */
describe('LAYER_KEYS entries', () => {
  it('each carry the discriminant and the base keys', () => {
    const base: readonly LayerKey[] = ['type', 'id', 'name', 'depth', 'at', 'anim']
    for (const [variant, keys] of Object.entries(LAYER_KEYS)) {
      expect(base.filter(k => !(keys as readonly string[]).includes(k)), variant).toEqual([])
    }
  })
})
