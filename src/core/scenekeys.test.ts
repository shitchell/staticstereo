/**
 * The runtime witness for `SCENE_KEYS` and its `AssertNever` pair.
 *
 * The pair in `types.ts` is enforced by `npm run typecheck` alone — vitest does
 * not type-check — so without something here the guard is invisible to
 * `npm test`, exactly as `anim/track.ts:204-208` records for `SUMMED_CHANNELS`
 * and `layerkeys.test.ts` repeats for `LAYER_KEYS`. That is why the roster is
 * exported rather than module-private.
 *
 * ## How a *runtime* test can witness a *type*
 *
 * It cannot read the type, so it reads something the compiler forces to track
 * the type instead. `FULLY_POPULATED` is annotated `Required<Scene>`, which
 * strips every `?` and so makes a key added to `Scene` a missing-property
 * error here. `Object.keys()` then makes that compile-forced set observable at
 * runtime. It is *not* a hand-written list of "the keys a scene has" (§9: such
 * a list goes stale silently) — it cannot be written any other way and compile.
 *
 * Add `bleed?: number` to `Scene` and the sequence is: `types.ts`'s
 * `_NoSceneKeyMissing` fails typecheck; fix the roster and this file still
 * fails typecheck for a missing property; supply it and the test below is
 * already green because both sides moved together. Fix only one of the two and
 * `npm test` is what goes red.
 *
 * `Scene` is a plain interface, not a discriminated union, so this needs none
 * of `layerkeys.test.ts`'s `LayerOf` machinery — `keyof Scene` is simply
 * correct here. That difference is the whole reason design §9.1 can adopt a
 * guard over `Scene`'s **own keys** while refusing one over `Scene`'s **path
 * tree**: the six keys are flat, the tree below them is the union.
 */
import { describe, expect, it } from 'vitest'
import { SCENE_KEYS } from './types.js'
import type { Scene } from './types.js'

/**
 * One scene carrying **every** key `Scene` admits.
 *
 * Values are the cheapest thing of the right type; nothing reads them, only
 * `Object.keys`. In particular this is not a *valid* scene and is not meant to
 * be — `resolveStereo` never sees it, and a scene with no layers is legal
 * anyway (a bare dot field).
 */
const FULLY_POPULATED: Required<Scene> = {
  size: [800, 450],
  fps: 30,
  duration: 2,
  stereo: {},
  freezeNoise: false,
  layers: [],
}

/**
 * Each key on one side of the comparison and not the other, prefixed with
 * which side is missing it.
 *
 * Extracted as a plain function over plain inputs so the paired control below
 * can drive it with a roster that *is* wrong. On a correct tree the assertion
 * in the first test never reaches its failing branch, and without the control
 * nothing would notice this collapsing to `() => []`.
 */
function disagreements(roster: readonly string[], scene: object): string[] {
  const declared = new Set(roster)
  const actual = new Set(Object.keys(scene))
  const out: string[] = []
  for (const key of actual) if (!declared.has(key)) out.push(`${key} is on Scene, not in SCENE_KEYS`)
  for (const key of declared) if (!actual.has(key)) out.push(`${key} is in SCENE_KEYS, not on Scene`)
  return out.sort()
}

describe('SCENE_KEYS', () => {
  it('lists exactly the keys Scene admits', () => {
    expect(
      disagreements(SCENE_KEYS, FULLY_POPULATED),
      'the roster and the type have drifted apart. A key on the type but not in the roster ' +
      'is a control the editor will never offer (R6); a key in the roster but not on the ' +
      'type is a control bound to nothing.',
    ).toEqual([])
  })

  it('carries each key exactly once', () => {
    // `Exclude` is set-valued, so the guards in `types.ts` are blind to a key
    // written twice — and a duplicate in a roster the editor iterates is a
    // control rendered twice, which is the kind of defect that gets blamed on
    // the layout.
    expect([...SCENE_KEYS].sort()).toEqual([...new Set(SCENE_KEYS)].sort())
  })

  it('would say so — the same predicate over a roster made wrong on purpose', () => {
    // The paired control (§6.5a). Pinned exactly rather than merely non-empty:
    // "found something" is also satisfied by a predicate that has rotted into
    // matching everything, and the four untouched keys are here to be the ones
    // it must *not* name.
    const wrong = [...SCENE_KEYS.filter(k => k !== 'freezeNoise'), 'bleed']
    expect(disagreements(wrong, FULLY_POPULATED)).toEqual([
      'bleed is in SCENE_KEYS, not on Scene',
      'freezeNoise is on Scene, not in SCENE_KEYS',
    ])
  })
})
