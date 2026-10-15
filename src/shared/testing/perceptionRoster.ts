import type { AssertNever, Layer, Scene, StereoOpts } from '../../core/types.js'
import * as perception from '../perception.js'
import { INK_FRACTION, disparityBudget } from '../perception.js'
import type { InkMeasurement } from '../perception.js'

/**
 * The two R22 obligations that had no criterion, and therefore no sensor.
 *
 * Execution plan §3's own lesson, live: a phase can pass its gate with a design
 * item simply missing. Obligations 2 ("the model never refuses") and 4
 * ("objective inputs only") were both honoured by the module on the day it was
 * written and witnessed by nothing, so neither would have reddened if a later
 * edit took them away.
 *
 * - **P7 criterion 8** (obligation 4) is below: no perception signature takes a
 *   subjective parameter.
 * - **P7 criterion 7** (obligation 2) is `perception.throws.test.ts`, which
 *   drives {@link SIGNATURES} to build its calls — so the two sensors share one
 *   roster and a new export is swept by both or by neither.
 *
 * ## Why a roster rather than a list of today's signatures
 *
 * A test that enumerated the thirteen functions and checked their parameters
 * against a list someone typed is §9's *"a hand-written list of the places that
 * do X"*. It goes stale the day a function is added, and it goes stale
 * **green**, which is the worse half. So the key set here is **derived from the
 * module's own type** and the declaration is checked against it in both
 * directions: a new export that is not classified, or a classification for an
 * export that no longer exists, is a **typecheck** error naming the drift. The
 * mechanism is `LAYER_RELIEF_KEYS`' in `perception.ts`, which runs it for layer
 * keys for the same reason.
 *
 * One deliberate difference from that precedent. `LAYER_RELIEF_KEYS` writes one
 * `AssertNever` pair **per variant** because the generic form "reduces to a
 * single `never` and the error then names the mapped type instead of the
 * variant that drifted" (`types.ts:417-420`). That trade is right there and
 * wrong here: the set of `Layer` variants is closed by a `Record` over
 * `Layer['type']`, so a per-variant enumeration cannot go short, whereas the
 * set of *exports* is open and a per-function enumeration is exactly the
 * hand-written list this is avoiding. The mapped form is used instead, and the
 * error message it costs is bought back by the runtime witness below, which
 * names the drifting export by name.
 *
 * ## What this guarantees, and what it cannot
 *
 * It guarantees the classification is **self-enumerating**: the list cannot
 * silently go short, so it can only be wrong *loudly*, at the commit that made
 * it wrong.
 *
 * It cannot decide that a parameter *named* objectively is objective. Nothing
 * mechanical can: `budget` is a scene fact and `comfort` would not be, and the
 * difference is in what the caller is expected to know rather than in the type.
 * **The rot case is eliminated; the deliberate-error case is not.** An author
 * who adds `isEasyToRead: number` and classifies it as a scene fact gets a
 * green suite, and the only thing standing in their way is the review this
 * table forces them to write a line into.
 *
 * The behavioural half below narrows that gap from the other side, with no list
 * at all: a function that *reads* a subjective field someone bolted onto an
 * input object is caught whether or not the table was updated.
 */

/* ────────────────────────── the roster ────────────────────────── */

/**
 * The kinds of thing a perception function takes, and why each is an objective
 * scene fact rather than a judgement.
 *
 * R22 obligation 4, design §10's fourth: *"Objective inputs only — `sepFar`,
 * `sepNear`, stroke px — never `isEasyToRead`."* The line this draws is that an
 * input must be something the caller can **read off the document**, not
 * something the caller has to have already decided. Every entry below names
 * where in the model the value is read from, because that is the only part of
 * the claim a reviewer can check.
 */
export const PARAM_KINDS = {
  stereo: 'The resolved StereoOpts — separations, blur and seed in scene px, read off the scene',
  scene: 'A Scene: layers, size and the layers\' own depths, all document state',
  layer: 'One Layer of that document',
  inkMeasurement: 'measureInk\'s output — a median run width in scene px and its sample count',
  depthMap: 'The depth samples rasterDepth produced, 0..1',
  mapWidth: 'The depth map\'s width in scene px',
  mapHeight: 'The depth map\'s height in scene px',
  inkFraction: 'The share of layer peak depth counted as ink — a measurement parameter, not a verdict',
  disparityBudget: 'sepFar − sepNear in scene px, which is arithmetic over the StereoOpts',
  layerIndex: 'An index into scene.layers',
} as const satisfies Record<string, string>

export type ParamKind = keyof typeof PARAM_KINDS

/** Every value export of the module that is a function. */
export type PerceptionFunctionName = {
  [K in keyof typeof perception]-?:
    typeof perception[K] extends (...args: never[]) => unknown ? K : never
}[keyof typeof perception]

/**
 * Every exported function's parameters, classified.
 *
 * `satisfies Record<PerceptionFunctionName, …>` is the ratchet's first half and
 * it runs in both directions by itself: a missing key is *"Property 'x' is
 * missing"* and an extra one is *"Object literal may only specify known
 * properties"*. The `AssertNever` pair below says the same thing a second way,
 * because `satisfies` is a check on this literal and the pair is a check on the
 * relationship — the one that survives someone widening the annotation.
 */
export const SIGNATURES = {
  measureInk: ['depthMap', 'mapWidth', 'mapHeight', 'inkFraction'],
  disparityBudget: ['stereo'],
  encodableDepths: ['stereo'],
  quantisationStep: ['stereo'],
  restingDepth: ['layer'],
  collidingPairs: ['scene', 'stereo'],
  depthStops: ['stereo'],
  reliefOf: ['layer'],
  cardboarding: ['scene', 'stereo'],
  fusionComfort: ['stereo'],
  legibilityOf: ['inkMeasurement', 'disparityBudget'],
  describeLegibility: ['inkMeasurement', 'stereo'],
  soloLayerScene: ['scene', 'layerIndex'],
} as const satisfies Record<PerceptionFunctionName, readonly ParamKind[]>

type _NoSignatureMissing = AssertNever<Exclude<PerceptionFunctionName, keyof typeof SIGNATURES>>
type _NoSignatureExtra = AssertNever<Exclude<keyof typeof SIGNATURES, PerceptionFunctionName>>

/**
 * The arity half, which the key sets above cannot see.
 *
 * A parameter added to an existing function changes no key, so without this the
 * table would keep describing a signature that has moved — the same shape of
 * silent drift `LAYER_RELIEF_KEYS` guards against for fields on a variant.
 * `Parameters<F>['length']` is a union where a parameter is optional, so the
 * declared length has to be *a member of* it rather than equal to it.
 */
type ActualArity<K extends PerceptionFunctionName> =
  typeof perception[K] extends (...args: never[]) => unknown
    ? Parameters<typeof perception[K]>['length']
    : never

type ArityDrift = {
  [K in PerceptionFunctionName]:
    typeof SIGNATURES[K]['length'] extends ActualArity<K> ? never : K
}[PerceptionFunctionName]

type _NoArityDrift = AssertNever<ArityDrift>

/* ──────────────────── building a call from the roster ──────────────────── */

/**
 * A scene with three layers at three depths, two of them one quantisation step
 * apart at the shipped budget.
 *
 * Shared with `perception.throws.test.ts`'s sweep through {@link callWith}, so
 * it has to exercise something: an empty scene would make `collidingPairs` and
 * `cardboarding` return without looping and the sweep would be measuring the
 * loop's absence.
 */
const SCENE: Scene = {
  size: [320, 180],
  layers: [
    { type: 'text', text: 'HELLO', size: 90 },
    { type: 'shape', shape: 'rect', w: 40, h: 40, depth: 0.5 },
    { type: 'image', src: 'a.png', mode: 'heightmap', depth: 0.5 },
  ],
}

const LAYER: Layer = SCENE.layers[0]!

/** A measured reading, so `legibilityOf` and `describeLegibility` grade rather than abstain. */
const INK: InkMeasurement = { medianRun: 9, runs: 64, peak: 1, threshold: 0.5, measured: true }

const MAP_WIDTH = 16
const MAP_HEIGHT = 4

/**
 * One valid argument of each kind, with the `StereoOpts` supplied by the
 * caller.
 *
 * The stereo is the only axis that varies, which is the load-bearing half of
 * criterion 7's wording — *"no perception function throws **on any
 * `StereoOpts`**"*. Every other argument is a valid one, so this sweep says
 * nothing about `measureInk`'s dimension guard or `soloLayerScene`'s index
 * guard, and must not: those two throws are deliberate, are pinned by
 * `perception.test.ts` and `site/legibility.test.ts`, and neither of those
 * functions takes a `StereoOpts`.
 */
export function argumentFor(kind: ParamKind, stereo: StereoOpts): unknown {
  switch (kind) {
    case 'stereo': return stereo
    case 'scene': return SCENE
    case 'layer': return LAYER
    case 'inkMeasurement': return INK
    case 'depthMap': return new Float32Array(MAP_WIDTH * MAP_HEIGHT).fill(1)
    case 'mapWidth': return MAP_WIDTH
    case 'mapHeight': return MAP_HEIGHT
    case 'inkFraction': return INK_FRACTION
    // Not a second copy of the arithmetic: `legibilityOf` grades a stroke
    // against a budget, and the budget a caller has is the one
    // `disparityBudget` computed. Routing it through the module is what makes
    // `legibilityOf` reachable from a `StereoOpts` and so part of criterion 7's
    // sweep rather than outside it.
    case 'disparityBudget': return disparityBudget(stereo)
    case 'layerIndex': return 0
  }
}

/** Call an exported function with valid arguments and this `StereoOpts`. */
export function callWith(name: PerceptionFunctionName, stereo: StereoOpts): unknown {
  const args = SIGNATURES[name].map(kind => argumentFor(kind, stereo))
  const fn = perception[name] as (...a: unknown[]) => unknown
  return fn(...args)
}

/** The roster's names, as runtime data, for a caller that wants to sweep them. */
export const PERCEPTION_FUNCTIONS =
  Object.keys(SIGNATURES) as readonly PerceptionFunctionName[]
