import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSceneText, validateScene as validateCli } from '../cli/scene.js'
import { validateScene as validateSite } from '../../site/scene.js'
import { writeScene } from './sceneWrite.js'
import type { Scene } from '../core/types.js'

/**
 * The three committed examples, by name rather than by `readdirSync`.
 *
 * Deliberately not derived from the directory listing: a fourth example added
 * later should make whoever adds it decide whether it belongs in this
 * measurement, and a glob would enrol it silently. The §9 trap about
 * hand-written lists is about lists that answer "where does X happen"; this is
 * a fixture roster, and the failure mode of it going stale is a test that
 * covers less than it could, not one that reports a false clean.
 */
const EXAMPLES = ['bouncing-ball.yaml', 'pacman.yaml', 'scrolling-text.yaml'] as const

/** The same YAML, parsed fresh, so neither validator can see the other's object. */
function parsed(name: string): unknown {
  return parseSceneText(readFileSync(`examples/${name}`, 'utf8'), name)
}

/**
 * Deep-rebuild `v` with every object's keys inserted in reverse order.
 *
 * Reverse rather than random: a shuffle that happened to be the identity would
 * turn this control into a tautology on some runs, and a test that passes for
 * the wrong reason intermittently is worse than one that never runs.
 */
function reinserted(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(reinserted)
  if (typeof v !== 'object' || v === null) return v
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(v).reverse()) out[k] = reinserted((v as Record<string, unknown>)[k])
  return out
}

describe('writeScene', () => {
  it('writes the same bytes for a scene the CLI validated and one the site validated', () => {
    for (const name of EXAMPLES) {
      const viaCli = writeScene(validateCli(parsed(name), name))
      const viaSite = writeScene(validateSite(parsed(name)))
      expect(viaSite, name).toBe(viaCli)
    }
  })

  it('writes the same bytes however the caller inserted the keys', () => {
    for (const name of EXAMPLES) {
      const straight = writeScene(validateCli(parsed(name), name))
      const shuffled = writeScene(validateCli(reinserted(parsed(name)), name))
      expect(shuffled, name).toBe(straight)
    }
  })

  /**
   * The canonical order, written out rather than derived.
   *
   * §9: "a guard derived from the roster it guards is a guard — it proves only
   * that the derivation ran twice." Every other test here would stay green if
   * `SCENE_KEYS` or `LAYER_KEYS` were silently reordered, because the writer
   * and the expectation would move together. This one would not. It is the
   * reason §2.4 ("assert on structure, not values") is not the governing rule
   * for this file: the declared byte output *is* the structure being pinned,
   * and there is no way to state it except as bytes.
   *
   * Input order below is deliberately hostile — scene keys, stereo keys, layer
   * keys and track keys are each handed in out of order.
   */
  it('writes the key order declared here, not the one it was handed', () => {
    const scene = {
      layers: [{
        anim: { repeat: 'loop', keys: [{ x: 5, t: 0 }, { t: 1, x: 10 }], ease: 'easeIn' },
        at: [10, 20],
        depth: 0.5,
        name: 'wedge',
        id: 'L1',
        end: 300,
        start: 30,
        r: 20,
        shape: 'circle',
        type: 'shape',
      }],
      freezeNoise: true,
      stereo: { sepNear: 90, sepFar: 110 },
      duration: 2,
      fps: 12,
      size: [320, 200],
    } as unknown as Scene

    expect(writeScene(scene)).toBe(`{
  "size": [
    320,
    200
  ],
  "fps": 12,
  "duration": 2,
  "stereo": {
    "sepFar": 110,
    "sepNear": 90
  },
  "freezeNoise": true,
  "layers": [
    {
      "type": "shape",
      "shape": "circle",
      "r": 20,
      "start": 30,
      "end": 300,
      "id": "L1",
      "name": "wedge",
      "depth": 0.5,
      "at": [
        10,
        20
      ],
      "anim": {
        "keys": [
          {
            "t": 0,
            "x": 5
          },
          {
            "t": 1,
            "x": 10
          }
        ],
        "ease": "easeIn",
        "repeat": "loop"
      }
    }
  ]
}
`)
  })

  /**
   * The other two asset variants, and the only path with a nested rostered
   * object: `mask`.
   *
   * Added after the writer was green rather than before it, because the gap it
   * closes was found by measuring the corpus rather than by reading the brief:
   * none of the three committed examples contains a `stereo`, `freezeNoise`,
   * `mask`, `id` or `name`, or an `image` or `gif` layer at all. The
   * CLI-vs-site test therefore proves less about this writer than its name
   * suggests, and the mask branch had no sensor whatsoever. Its evidence is the
   * planted mutations recorded in the commit message, not a RED-first run.
   */
  it('writes image and gif layers, and the nested mask object, in roster order', () => {
    const scene = {
      size: [4, 4],
      layers: [
        { mask: { luma: 0.5 }, mode: 'heightmap', src: 'logo.png', type: 'image', name: 'Logo', depth: 0.2 },
        { loop: 'pingpong', type: 'gif', src: 'walk.gif', mask: 'alpha', id: 'G1' },
      ],
    } as unknown as Scene

    expect(writeScene(scene)).toBe(`{
  "size": [
    4,
    4
  ],
  "layers": [
    {
      "type": "image",
      "src": "logo.png",
      "mode": "heightmap",
      "mask": {
        "luma": 0.5
      },
      "name": "Logo",
      "depth": 0.2
    },
    {
      "type": "gif",
      "src": "walk.gif",
      "loop": "pingpong",
      "mask": "alpha",
      "id": "G1"
    }
  ]
}
`)
  })

  it('throws on an unrostered key inside a mask rather than dropping it', () => {
    const scene = {
      size: [4, 4],
      layers: [{ type: 'image', src: 'logo.png', mask: { luma: 0.5, lumen: 0.9 } }],
    } as unknown as Scene
    expect(() => writeScene(scene)).toThrow(/lumen/)
  })

  /**
   * Preset params are an open bag (`Preset`'s index signature, the §9 row about
   * why no single `AssertNever` spans `Scene`), so no roster can order them and
   * sorting is the only order that is a decision rather than an accident.
   */
  it('orders preset params, which no roster can cover', () => {
    const of = (anim: unknown): string => writeScene({
      size: [10, 10],
      layers: [{ type: 'shape', shape: 'circle', r: 1, anim }],
    } as unknown as Scene)

    const a = of({ kind: 'move', to: [1, 2], from: [0, 0], ease: 'easeIn' })
    const b = of({ ease: 'easeIn', from: [0, 0], to: [1, 2], kind: 'move' })
    expect(b).toBe(a)
    expect(a).toContain('"kind": "move"')
    expect(a.indexOf('"kind"')).toBeLessThan(a.indexOf('"ease"'))
    expect(a.indexOf('"ease"')).toBeLessThan(a.indexOf('"from"'))
    expect(a.indexOf('"from"')).toBeLessThan(a.indexOf('"to"'))
  })

  /**
   * The failure mode this writer must not have is the site validator's: a key
   * it does not recognise vanishing from the saved project with nothing said.
   * On a rostered object an unknown key is a throw, because the cheapest wrong
   * repair — dropping it — is the one that destroys the user's file.
   */
  it('throws on a key no roster covers rather than dropping it', () => {
    const scene = {
      size: [10, 10],
      layers: [{ type: 'shape', shape: 'circle', r: 1, rotatX: 5 }],
    } as unknown as Scene
    expect(() => writeScene(scene)).toThrow(/rotatX/)
  })

  it('loses nothing: the text reparses deep-equal to the scene it was given', () => {
    for (const name of EXAMPLES) {
      const scene = validateCli(parsed(name), name)
      expect(JSON.parse(writeScene(scene)), name).toEqual(scene)
    }
  })
})
