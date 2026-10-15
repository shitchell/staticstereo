import { CHANNELS, LAYER_KEYS, SCENE_KEYS, STEREO_KEYS } from '../core/index.js'
import type { AssertNever, Key, MaskSource, Scene, Track } from '../core/types.js'

/**
 * The canonical text form of a `Scene` — what `.stst` carries as `scene.json`.
 *
 * ## Why this module exists
 *
 * `JSON.stringify` walks an object's keys in insertion order, so two scenes
 * that are equal as values serialise to different bytes whenever they were
 * *built* differently. The two validators build them differently, and it was
 * measured rather than assumed: for all three of `examples/*.yaml`,
 * `src/cli/scene.ts` and `site/scene.ts` produce identical key *sets* and
 * identical lengths and diverge at byte 44–45. `src/cli/scene.ts`'s
 * `validateLayer` validates in place and hands the parsed object back, so a
 * layer's key order is whatever the YAML author typed; `site/scene.ts`'s
 * rebuilds field by field into its own order. Neither is wrong; they simply
 * cannot agree except by accident.
 *
 * The scene *level* happens to agree today — both construct `{size, layers}`
 * and then attach the optionals — and this writer overrides that too. An
 * agreement between two independently written constructors that nothing guards
 * is an accident that holds until someone reorders either one.
 *
 * **The fix is here and not in either validator.** The CLI's pass-through and
 * the site's rebuild are each load-bearing for their own reasons (the CLI
 * rejects unknown keys by name, the site deliberately drops them — see the
 * long note on `validateLayer` in `site/scene.ts`), and changing either would
 * ripple into tests owned by merged phases. Imposing the order at the point of
 * *writing* leaves both alone.
 *
 * ## The order is declared, not discovered
 *
 * It comes from the three `as const` rosters P3a pinned to their types with
 * `AssertNever` pairs — {@link SCENE_KEYS}, {@link LAYER_KEYS} and
 * {@link STEREO_KEYS} — plus the three declared below for the levels `core`
 * has no roster for. Deriving from the rosters rather than hand-typing a
 * fourth list means a key added to `Scene` or to a `Layer` variant is a
 * compile error at the roster, not a field this writer silently stops
 * emitting.
 *
 * `sceneWrite.test.ts` writes one expected order out in full rather than
 * deriving it, because a test that derives its expectation from the same
 * roster the writer uses cannot fail for the reason it exists.
 *
 * ## Why the output is indented
 *
 * Design §6.2 chose a real zip over a bespoke container specifically so that
 * "anyone can `unzip` it and read `scene.json`", and unindented JSON is not
 * read, it is piped through `jq`. The indenting is `JSON.stringify`'s own
 * rather than a bespoke emitter: ECMA-262 specifies the gap behaviour and
 * number-to-string conversion exactly, so cross-engine byte identity — P1
 * criterion 7, the whole point — rests on the spec rather than on formatting
 * code of mine. A bespoke emitter that kept `[320, 200]` on one line would buy
 * prettier output at the cost of the one property this module is for.
 *
 * Trailing newline so the extracted file is POSIX text.
 */
export function writeScene(scene: Scene): string {
  return `${JSON.stringify(canonicalScene(scene), null, 2)}\n`
}

/* ------------------------------------------------------------------ rosters
 *
 * Three levels below `Layer` have no roster in `src/core/types.ts`. These are
 * declared here rather than added there because `core`'s rosters exist to feed
 * an editor that generates a control per field, and these do not — nothing
 * generates controls for a keyframe. What they share with `core`'s is the
 * mechanism: each is pinned to its type by an `AssertNever` pair, so a field
 * added to `Track` or to `Transform` is a COMPILE error here rather than a
 * field this writer quietly stops emitting.
 *
 * Note that the pairs point at the upstream *types* (`Track`, `Key`,
 * `MaskSource`), not at other rosters. A guard derived from the roster it
 * guards proves only that the derivation ran twice.
 */

/** Keyframes first because they are the substance; the modifiers follow. */
const TRACK_KEYS = ['keys', 'ease', 'repeat', 'start', 'duration'] as const
type _NoTrackKeyMissing = AssertNever<Exclude<keyof Track, typeof TRACK_KEYS[number]>>
type _NoTrackKeyExtra = AssertNever<Exclude<typeof TRACK_KEYS[number], keyof Track>>

/**
 * `t` then the channels, in `CHANNELS` order.
 *
 * Spread from `CHANNELS` exactly as both validators' `KEY_CHANNELS` are, so a
 * new channel orders itself. The two validators each build this same tuple and
 * neither exports it anywhere `src/shared/` may import from — the CLI's copy
 * lives in `src/cli/`, which browser-reachable code cannot reach.
 */
const KEY_KEYS = ['t', ...CHANNELS] as const
type _NoKeyKeyMissing = AssertNever<Exclude<keyof Key, typeof KEY_KEYS[number]>>
type _NoKeyKeyExtra = AssertNever<Exclude<typeof KEY_KEYS[number], keyof Key>>

/** The object half of `MaskSource`; the `'alpha'` half is a bare string. */
type LumaMask = Exclude<MaskSource, string>
const MASK_KEYS = ['luma'] as const
type _NoMaskKeyMissing = AssertNever<Exclude<keyof LumaMask, typeof MASK_KEYS[number]>>
type _NoMaskKeyExtra = AssertNever<Exclude<typeof MASK_KEYS[number], keyof LumaMask>>

/* ------------------------------------------------------------------- walker */

type Bag = Record<string, unknown>

function requireBag(v: unknown, where: string): Bag {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error(`writeScene: ${where} must be an object, got ${JSON.stringify(v)}`)
  }
  return v as Bag
}

/**
 * Rebuild `v` with its keys in `roster` order, refusing any key not on it.
 *
 * **Refusing, not dropping.** Dropping is what `site/scene.ts` does on load,
 * where it is a considered trade-off; doing it here would mean a key silently
 * absent from a saved project file, which is the user's work destroyed with
 * nothing said. The message therefore names the roster to extend rather than
 * the key to delete — a guard whose cheapest satisfying action is the wrong
 * one gets satisfied wrongly.
 *
 * `undefined` values are skipped, which is what `JSON.stringify` would have
 * done with them anyway: it keeps "absent" and "present but undefined"
 * indistinguishable in the output, so the two validators' differing habits
 * about which they produce cannot reach the bytes.
 */
function inRosterOrder(v: Bag, roster: readonly string[], where: string): Bag {
  const known = new Set<string>(roster)
  for (const k of Object.keys(v)) {
    if (!known.has(k)) {
      throw new Error(
        `writeScene: ${where} has the key "${k}", which is not in its key roster ` +
        `(${roster.join(', ')}). Writing it would need "${k}" added to that roster — ` +
        `it is not dropped here, because a key missing from a saved .stst is the ` +
        `author's work gone with no error raised.`,
      )
    }
  }
  const out: Bag = {}
  for (const k of roster) if (v[k] !== undefined) out[k] = v[k]
  return out
}

/**
 * Order an open-ended value: objects by sorted key, arrays elementwise.
 *
 * Only reachable from preset parameter bags, which are the one place no roster
 * can exist — `Preset` is `{kind: string} & {[param: string]: unknown}`, the
 * index signature design §9.1 names as one of the three reasons a single guard
 * cannot span `Scene`. Sorting is therefore the only order here that is a
 * decision rather than an accident of how the bag was built.
 *
 * Bare `.sort()`, never `localeCompare`: the default comparator is UTF-16
 * code-unit order and is locale-independent, which is the same property
 * `LC_ALL=C` buys a shell pipeline. A locale-aware sort here would make the
 * bytes depend on the machine, which is precisely what this module exists to
 * prevent.
 */
function inSortedOrder(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(inSortedOrder)
  if (typeof v !== 'object' || v === null) return v
  const src = v as Bag
  const out: Bag = {}
  for (const k of Object.keys(src).sort()) {
    if (src[k] !== undefined) out[k] = inSortedOrder(src[k])
  }
  return out
}

function canonicalScene(scene: Scene): Bag {
  const out = inRosterOrder(requireBag(scene, 'the scene'), SCENE_KEYS, 'the scene')

  if (out['stereo'] !== undefined) {
    out['stereo'] = inRosterOrder(
      requireBag(out['stereo'], 'scene.stereo'), STEREO_KEYS, 'scene.stereo',
    )
  }

  const layers = out['layers']
  if (!Array.isArray(layers)) {
    throw new Error(`writeScene: scene.layers must be an array, got ${JSON.stringify(layers)}`)
  }
  out['layers'] = layers.map((l, i) => canonicalLayer(l, `layers[${i}]`))

  return out
}

function canonicalLayer(v: unknown, where: string): Bag {
  const l = requireBag(v, where)
  const type = l['type']
  const roster = (LAYER_KEYS as Record<string, readonly string[] | undefined>)[String(type)]
  if (roster === undefined) {
    throw new Error(
      `writeScene: ${where}.type is ${JSON.stringify(type)}, which has no key roster — ` +
      `valid types: ${Object.keys(LAYER_KEYS).sort().join(', ')}`,
    )
  }
  const out = inRosterOrder(l, roster, `${where}, a "${String(type)}" layer`)

  // `'alpha'` is a bare string and has no keys to order.
  if (out['mask'] !== undefined && typeof out['mask'] !== 'string') {
    out['mask'] = inRosterOrder(
      requireBag(out['mask'], `${where}.mask`), MASK_KEYS, `${where}.mask`,
    )
  }
  if (out['anim'] !== undefined) out['anim'] = canonicalAnim(out['anim'], `${where}.anim`)

  return out
}

function canonicalAnim(v: unknown, where: string): unknown {
  if (Array.isArray(v)) return v.map((a, i) => canonicalAnimOne(a, `${where}[${i}]`))
  return canonicalAnimOne(v, where)
}

/**
 * `keys` first, then `kind` — the same discrimination, in the same order, as
 * `validateAnimOne` in `site/scene.ts` and `validateAnimItem` in
 * `src/cli/scene.ts`. Deliberately the same order: a bag carrying both would
 * otherwise be written as one shape and read back as the other.
 */
function canonicalAnimOne(v: unknown, where: string): Bag {
  const a = requireBag(v, where)

  if ('keys' in a) {
    const out = inRosterOrder(a, TRACK_KEYS, `${where}, a keyframe track`)
    const keys = out['keys']
    if (!Array.isArray(keys)) {
      throw new Error(`writeScene: ${where}.keys must be an array, got ${JSON.stringify(keys)}`)
    }
    out['keys'] = keys.map((k, i) => inRosterOrder(
      requireBag(k, `${where}.keys[${i}]`), KEY_KEYS, `${where}.keys[${i}]`,
    ))
    return out
  }

  if ('kind' in a) {
    // `kind` leads because it is the only key the type names; everything after
    // it is the open bag, and `inSortedOrder` owns that.
    const out: Bag = { kind: a['kind'] }
    for (const k of Object.keys(a).sort()) {
      if (k !== 'kind' && a[k] !== undefined) out[k] = inSortedOrder(a[k])
    }
    return out
  }

  throw new Error(
    `writeScene: ${where} is neither a keyframe track (no "keys") nor a preset ` +
    `(no "kind"), got ${JSON.stringify(v)}`,
  )
}
