/**
 * A drift sensor over this validator's hand-written key rosters.
 *
 * `scene.ts` carries three lists nothing derives and nothing guards —
 * `SCENE_KEYS` (:103), `LAYER_TYPES` (:104) and `BASE_LAYER_KEYS` /
 * `TYPE_LAYER_KEYS` (:105-112). Eleven lines below them `KEY_CHANNELS` is
 * derived from `CHANNELS` and carries an `AssertNever` pair, and its docblock
 * records why: the hand-written list it replaced "had fallen a release behind
 * `CHANNELS` and omitted `rotateX`/`rotateY`, so the CLI rejected by name two
 * channels `evalTrack` interpolates — a scene the renderer handles perfectly
 * well refused to load." That is the exact failure the other three lists are
 * still open to, and until now **no test went red the day they drifted.**
 * §9's last trap: a recorded note is not a sensor.
 *
 * ## This is a sensor, deliberately not a rewiring
 *
 * The obvious fix is to make `scene.ts` consume `SCENE_KEYS` and `LAYER_KEYS`
 * from core and delete its copies. That is a change to a validator's
 * accept/reject behaviour in a merged phase's file, and the two validators
 * **differ on purpose** — this one errors on an unknown key, `site/scene.ts`
 * silently drops it — so it is not a change to make as a side effect of adding
 * a guard. Nothing here imports anything new into `scene.ts` or alters what it
 * accepts. It only *reads* what the validator already says about itself.
 *
 * ## How a black-box test reads a module-private list
 *
 * `unknownKeys()` (`scene.ts:235-250`) does not merely reject the offending
 * key, it **enumerates the allowed ones**: `… — valid keys: anim, at, depth,
 * …`. That is a product decision with its own recorded rationale ("a typo'd
 * key is the one error class a validator can catch that nothing downstream
 * ever will"), so the rosters are observable from outside without exporting
 * them. Feeding one deliberately impossible key per variant and parsing the
 * clause back out recovers each list exactly, in both directions: a key core
 * has and the validator does not, *and* a key the validator has and core does
 * not.
 *
 * The cost is that this file is coupled to the wording of two messages, and
 * that cost is real: **nothing else in the repo pins the "— valid keys:"
 * clause.** `grep -rn 'valid keys' src/ site/ --include='*.test.ts'` finds no
 * assertion on it, so rewording `unknownKeys()` reddens this file alone and
 * the sensor has to be re-fitted rather than merely re-read.
 *
 * It is still the right trade, for two reasons. The clause is load-bearing
 * product rather than incidental phrasing — `site/scene.ts:155-160` records
 * copying it "down to listing the valid keys sorted, so the two read as one
 * product" — so it is not a string that moves quietly. And {@link rosterFrom}
 * **throws** rather than returning `[]` when the clause is absent, so a
 * reworded message is a loud failure naming the message it could not read,
 * never a sensor that reports clean over a list it stopped being able to see.
 */
import { describe, expect, it } from 'vitest'
import { LAYER_KEYS, SCENE_KEYS } from '../core/index.js'
import { validateScene } from './scene.js'

/**
 * A key no scene will ever legitimately carry, used to provoke the rejection
 * that carries the roster. Spelled to be obviously synthetic: if it ever
 * appears in a real message the probe, not the validator, is what is wrong.
 */
const PROBE = '__drift_probe__'

/** The clause `unknownKeys()` appends. The sensor's entire coupling surface. */
const VALID_KEYS = ' — valid keys: '

/** What `validateLayer` appends instead, for an unrecognised `type`. */
const EXPECTED_ONE_OF = ' — expected one of: '

/**
 * The allowed-key list a rejection enumerates, sorted.
 *
 * Throws rather than returning `[]` when the clause is absent. A sensor whose
 * failure mode is "found nothing, therefore nothing disagrees" is a sensor
 * that reports clean after the message it reads has been reworded away.
 */
function rosterFrom(message: string, marker: string): readonly string[] {
  const at = message.indexOf(marker)
  if (at < 0) {
    throw new Error(
      `cannot read a roster out of this rejection: no "${marker.trim()}" clause in ` +
      `${JSON.stringify(message)}. Either the message was reworded — in which case ` +
      `fix this file, the roster is still unguarded — or the validator rejected the ` +
      `probe for some earlier reason and never reached the key check.`,
    )
  }
  const listed = message.slice(at + marker.length)
  if (listed === '') throw new Error(`empty roster in ${JSON.stringify(message)}`)
  return listed.split(', ').sort()
}

/** The rejection text for a scene, layer or type the validator refuses. */
function rejection(value: unknown): string {
  try {
    validateScene(value, 'probe')
  } catch (err) {
    return (err as Error).message
  }
  throw new Error(
    `the validator ACCEPTED ${JSON.stringify(value)}. The probe is supposed to be ` +
    `impossible, so this is the unknown-key check having gone away, not a pass.`,
  )
}

/** A minimal scene carrying one layer, enough to reach `validateLayer`. */
function withLayer(layer: Record<string, unknown>): Record<string, unknown> {
  return { size: [10, 10], layers: [layer] }
}

/**
 * Each key on one side and not the other, prefixed with which side is missing
 * it. A plain function over plain inputs so the control below can drive it
 * with a roster that *is* wrong — without it nothing would notice this
 * collapsing to `() => []`.
 */
function disagreements(
  where: string, cli: readonly string[], core: readonly string[],
): string[] {
  const inCli = new Set(cli)
  const inCore = new Set(core)
  const out: string[] = []
  for (const k of inCore) if (!inCli.has(k)) out.push(`${where}: "${k}" is in core, not in src/cli/scene.ts`)
  for (const k of inCli) if (!inCore.has(k)) out.push(`${where}: "${k}" is in src/cli/scene.ts, not in core`)
  return out.sort()
}

describe('src/cli/scene.ts has not drifted from core', () => {
  it("its scene-key roster is exactly core's SCENE_KEYS", () => {
    expect(
      disagreements('scene', rosterFrom(rejection({ [PROBE]: 1 }), VALID_KEYS), SCENE_KEYS),
      'the CLI rejects a scene key core says is valid, or accepts one core has never heard ' +
      'of. Both are silent today: the CLI refuses a file the renderer handles, or passes a ' +
      'typo straight through.',
    ).toEqual([])
  })

  it('its per-variant layer rosters are exactly LAYER_KEYS, for every variant', () => {
    // Driven by `Object.keys(LAYER_KEYS)`, which the `Record<Layer['type'], …>`
    // in `types.ts` forces to be total over the union — so a sixth variant is
    // probed here without this file being edited, rather than being a case
    // somebody remembered to add.
    const found = Object.keys(LAYER_KEYS).flatMap(variant => disagreements(
      variant,
      rosterFrom(rejection(withLayer({ type: variant, [PROBE]: 1 })), VALID_KEYS),
      LAYER_KEYS[variant as keyof typeof LAYER_KEYS],
    ))
    expect(
      found,
      'a field on a Layer variant that this validator will reject by name, or a key it ' +
      'accepts that no variant has. The first refuses a scene the rasteriser renders.',
    ).toEqual([])
  })

  it('it recognises every layer variant, including the one the browser refuses', () => {
    // `draw` is where the two validators legitimately part: `site/scene.ts:268`
    // refuses it citing design §9.5, and this one accepts it —
    // `src/cli/scene.ts:356`, `src/core/raster.ts:386` and
    // `src/shared/layerName.ts:73` all still handle it. That difference is
    // encoded as an expectation here rather than tolerated as noise: the CLI's
    // list must be the whole union, and losing `draw` from it is a regression
    // this reddens on.
    const types = rosterFrom(
      rejection(withLayer({ type: PROBE })), EXPECTED_ONE_OF,
    )
    expect(disagreements('layer type', types, Object.keys(LAYER_KEYS))).toEqual([])
    expect(types).toContain('draw')
  })

  it('would say so — the same comparison over a roster made wrong on purpose', () => {
    // The paired control (§6.5a). Pinned exactly rather than merely non-empty:
    // "found something" is also satisfied by a predicate that has rotted into
    // matching everything, and the untouched keys are here to be the ones it
    // must *not* name.
    const wrong = [...LAYER_KEYS.shape.filter(k => k !== 'start'), 'glow'].sort()
    expect(disagreements('shape', wrong, LAYER_KEYS.shape)).toEqual([
      'shape: "glow" is in src/cli/scene.ts, not in core',
      'shape: "start" is in core, not in src/cli/scene.ts',
    ])
  })

  it('would say so — the parser refuses to read a roster out of a reworded message', () => {
    // The other half of the control. If `unknownKeys()` stops enumerating, or
    // the probe starts being rejected by an earlier check, every assertion
    // above would otherwise compare `[]` with `[]` and pass.
    expect(() => rosterFrom('probe: unknown scene key "x"', VALID_KEYS))
      .toThrow(/no "— valid keys:" clause/)
    expect(() => rosterFrom(`probe: unknown scene key "x"${VALID_KEYS}`, VALID_KEYS))
      .toThrow(/empty roster/)
  })

  it('would say so — the probe being accepted is a failure, not a pass', () => {
    // `rejection()` throws when the validator does not. Without this, deleting
    // `unknownKeys()` outright would make every test above error rather than
    // silently pass — but only by accident, and this pins it on purpose.
    expect(() => rejection({ size: [10, 10], layers: [] }))
      .toThrow(/the validator ACCEPTED/)
  })
})
