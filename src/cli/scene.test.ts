import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from './args.js'
import type { CliArgs } from './args.js'
import {
  KEY_CHANNELS,
  TEXT_FONT_FAMILY,
  TEXT_FONT_WEIGHT,
  applyOverrides,
  loadProject,
  loadScene,
  parseSceneText,
  textScene,
  validateScene,
} from './scene.js'
import { writeStst } from '../shared/container.js'
import type { StstMember } from '../shared/container.js'
import { PRESETS } from '../core/anim/presets.js'
import { CHANNELS } from '../core/index.js'
import type { Scene } from '../core/index.js'

/** The smallest scene that is actually valid, as a YAML string. */
const MINIMAL = 'size: [40, 20]\nlayers: []\n'

function args(line: string[]): CliArgs {
  const r = parseArgs(line)
  if (r.kind !== 'run') throw new Error(`expected a runnable parse, got "${r.kind}"`)
  return r.args
}

/** Assert the input is rejected and hand back the message. */
function reject(fn: () => unknown): string {
  try {
    fn()
  } catch (err) {
    const msg = (err as Error).message
    // Error quality is the deliverable: no internal/TypeScript-shaped noise.
    expect(msg).not.toMatch(/undefined is not|Cannot read propert|is not a function/)
    return msg
  }
  throw new Error('expected a rejection, but the call succeeded')
}

/** Validate a scene given as YAML, so the tests read like scene files. */
function check(yaml: string): Scene {
  return validateScene(parseSceneText(yaml, 'scene.yaml'), 'scene.yaml')
}

function checkFails(yaml: string): string {
  return reject(() => check(yaml))
}

describe('parseSceneText', () => {
  it('parses YAML, including the design doc flow-mapping style', () => {
    const v = parseSceneText(
      'size: [800, 450]\nfps: 12\nduration: 4\n' +
      'layers:\n  - {type: text, text: HELLO, size: 90, depth: 0.6}\n',
      'scene.yaml',
    ) as Scene
    expect(v.size).toEqual([800, 450])
    expect(v.layers).toHaveLength(1)
  })

  it('parses JSON through the same path (YAML 1.2 is a JSON superset)', () => {
    const v = parseSceneText('{"size": [40, 20], "layers": []}', 'scene.json') as Scene
    expect(v.size).toEqual([40, 20])
  })

  it('parses tab-indented JSON, which YAML forbids for block indentation', () => {
    const v = parseSceneText('{\n\t"size": [40, 20],\n\t"layers": []\n}', 's.json') as Scene
    expect(v.size).toEqual([40, 20])
  })

  it('reports a syntax error with the file and the line, not a stack', () => {
    const msg = reject(() => parseSceneText('size: [40, 20]\nlayers:\n  - {type: text\n', 'bad.yaml'))
    expect(msg).toMatch(/bad\.yaml/)
    expect(msg).toMatch(/line 3|line 4/)
    expect(msg).not.toMatch(/\bat \w+ \(/)   // no stack frames
  })

  it('rejects an empty file by name', () => {
    expect(reject(() => parseSceneText('', 'empty.yaml'))).toMatch(/empty\.yaml.*empty/)
  })

  it('rejects a top level that is not a mapping, saying what one looks like', () => {
    const msg = reject(() => parseSceneText('- size: [40, 20]\n', 'list.yaml'))
    expect(msg).toMatch(/mapping|object/)
    expect(msg).toMatch(/size/)
  })
})

describe('validateScene — scene fields', () => {
  it('accepts a minimal scene', () => {
    expect(check(MINIMAL).size).toEqual([40, 20])
  })

  it('accepts the design doc example scene', () => {
    const s = check(
      'size: [800, 450]\nfps: 12\nduration: 4\nfreezeNoise: false\n' +
      'stereo: {sepFar: 110, sepNear: 92, noiseScale: 2, depthBlur: 1, cross: false, seed: 7}\n' +
      'layers:\n' +
      // The design doc wrote these three as `marquee`, `bounce` and
      // `slide-in`; §4.2b deleted all three, so they are spelled with the
      // verbs and the raw track they were sugar for.
      '  - {type: text, text: HELLO, size: 90, depth: 0.6, ' +
      'anim: {kind: move, from: [855, 0], to: [-600, 0], speed: 60, repeat: loop}}\n' +
      '  - {type: image, src: ball.png, depth: 1.0, anim: ' +
      '{keys: [{t: 0, y: 0}, {t: 0.5, y: -200}, {t: 1, y: 0}], ease: easeOutBounce, repeat: loop}}\n' +
      '  - {type: gif, src: walk.gif, loop: loop, depth: 1.0, ' +
      'anim: {kind: move, from: [-300, 0], to: [0, 0], ease: easeOut}}\n' +
      '  - {type: shape, shape: circle, at: [400, 225], r: 40, depth: 0.8}\n',
    )
    expect(s.layers).toHaveLength(4)
  })

  it('names scene.size when it is missing', () => {
    const msg = checkFails('layers: []\n')
    expect(msg).toMatch(/size/)
    expect(msg).toMatch(/width.*height|\[width, height\]/)
  })

  it('names scene.size when it is not two positive integers', () => {
    expect(checkFails('size: 800\nlayers: []\n')).toMatch(/size/)
    expect(checkFails('size: [800]\nlayers: []\n')).toMatch(/size/)
    expect(checkFails('size: [800, 0]\nlayers: []\n')).toMatch(/size/)
    expect(checkFails('size: [800, 4.5]\nlayers: []\n')).toMatch(/size.*integer|integer.*size/s)
  })

  it('names scene.layers when it is missing or not a list', () => {
    expect(checkFails('size: [40, 20]\n')).toMatch(/layers/)
    expect(checkFails('size: [40, 20]\nlayers: hello\n')).toMatch(/layers.*(array|list)/)
  })

  it('rejects fps: 0 and duration: 0, explaining the still policy', () => {
    const fps = checkFails('size: [40, 20]\nfps: 0\nlayers: []\n')
    expect(fps).toMatch(/fps/)
    expect(fps).toMatch(/still|omit/)
    expect(checkFails('size: [40, 20]\nduration: 0\nlayers: []\n')).toMatch(/duration/)
    expect(checkFails('size: [40, 20]\nfps: -1\nlayers: []\n')).toMatch(/fps/)
  })

  it('names an unknown top-level key and lists the valid ones', () => {
    const msg = checkFails('size: [40, 20]\nlayers: []\nfreeznoise: true\n')
    expect(msg).toMatch(/freeznoise/)
    expect(msg).toMatch(/freezeNoise/)
  })

  it('names an unknown stereo key', () => {
    const msg = checkFails('size: [40, 20]\nlayers: []\nstereo: {sepfar: 120}\n')
    expect(msg).toMatch(/stereo\.sepfar|"sepfar"/)
    expect(msg).toMatch(/sepFar/)
  })

  it('propagates resolveStereo for sepNear >= sepFar rather than replacing it', () => {
    const msg = checkFails('size: [40, 20]\nlayers: []\nstereo: {sepFar: 90, sepNear: 92}\n')
    expect(msg).toMatch(/sepNear/)
    expect(msg).toMatch(/sepFar/)
    // resolveStereo's own explanation, which is better than anything the CLI
    // could invent, so it must survive.
    expect(msg).toMatch(/depth budget|flat plane/)
  })

  it('propagates resolveStereo for a fractional noiseScale', () => {
    const msg = checkFails('size: [40, 20]\nlayers: []\nstereo: {noiseScale: 0.5}\n')
    expect(msg).toMatch(/noiseScale/)
    expect(msg).toMatch(/integer/)
  })

  // The allowlist is per-key, so a key the encoder genuinely supports is
  // rejected by name until it is added to it — i.e. a valid scene fails to
  // load. Both halves are pinned: the name is accepted, a typo is not.
  it('accepts stereo.algorithm in a scene file', () => {
    expect(validateScene(
      { size: [40, 20], layers: [], stereo: { algorithm: 'linked' } }, 's',
    ).stereo).toEqual({ algorithm: 'linked' })
  })

  it('propagates resolveStereo for an unknown algorithm name', () => {
    const msg = checkFails('size: [40, 20]\nlayers: []\nstereo: {algorithm: linkd}\n')
    expect(msg).toMatch(/algorithm/)
    expect(msg).toMatch(/shift, linked/)
  })

  it('rejects a non-string algorithm', () => {
    expect(checkFails('size: [40, 20]\nlayers: []\nstereo: {algorithm: 3}\n'))
      .toMatch(/algorithm.*string/)
  })

  it('rejects freezeNoise that is not a boolean', () => {
    expect(checkFails('size: [40, 20]\nlayers: []\nfreezeNoise: yes please\n'))
      .toMatch(/freezeNoise.*boolean/)
  })
})

describe('validateScene — layers', () => {
  it('names the layer index and lists the valid types for an unknown type', () => {
    const msg = checkFails('size: [40, 20]\nlayers:\n  - {type: txt, text: HI}\n')
    expect(msg).toMatch(/layers\[0\]\.type/)
    expect(msg).toMatch(/"txt"/)
    for (const t of ['text', 'image', 'gif', 'shape', 'draw']) expect(msg).toMatch(t)
  })

  it('names the offending layer by index, not just the first', () => {
    const msg = checkFails(
      'size: [40, 20]\nlayers:\n  - {type: text, text: HI}\n  - {type: nope}\n',
    )
    expect(msg).toMatch(/layers\[1\]/)
  })

  it('requires type at all', () => {
    expect(checkFails('size: [40, 20]\nlayers:\n  - {text: HI}\n'))
      .toMatch(/layers\[0\]\.type/)
  })

  it('names the missing field for each layer type', () => {
    expect(checkFails('size: [40, 20]\nlayers:\n  - {type: text}\n'))
      .toMatch(/layers\[0\]\.text/)
    expect(checkFails('size: [40, 20]\nlayers:\n  - {type: image}\n'))
      .toMatch(/layers\[0\]\.src/)
    expect(checkFails('size: [40, 20]\nlayers:\n  - {type: gif}\n'))
      .toMatch(/layers\[0\]\.src/)
    expect(checkFails('size: [40, 20]\nlayers:\n  - {type: draw}\n'))
      .toMatch(/layers\[0\]\.fn/)
  })

  it('names the shape dimension a shape layer is missing', () => {
    expect(checkFails('size: [40, 20]\nlayers:\n  - {type: shape, shape: circle}\n'))
      .toMatch(/layers\[0\]\.r/)
    expect(checkFails('size: [40, 20]\nlayers:\n  - {type: shape, shape: rect, w: 10}\n'))
      .toMatch(/layers\[0\]\.h/)
    const msg = checkFails('size: [40, 20]\nlayers:\n  - {type: shape, shape: blob, r: 4}\n')
    expect(msg).toMatch(/layers\[0\]\.shape/)
    expect(msg).toMatch(/circle/)
    expect(msg).toMatch(/rect/)
  })

  it('names an unknown layer key', () => {
    const msg = checkFails('size: [40, 20]\nlayers:\n  - {type: text, text: HI, sized: 90}\n')
    expect(msg).toMatch(/layers\[0\]/)
    expect(msg).toMatch(/sized/)
  })

  // Design §4.1. Both fields are optional, so every scene written before they
  // existed stays valid; and the validator carries them rather than minting
  // one, because an id invented at load time would make opening an untouched
  // legacy scene and saving it back a diff — the exact churn stable identity
  // exists to prevent. Minting belongs to the editor's mutation path.
  it('carries a layer id and name through, and mints neither', () => {
    const scene = check(
      'size: [40, 20]\nlayers:\n  - {type: text, text: HI, id: k3Qp, name: greeting}\n',
    )
    expect(scene.layers[0]).toMatchObject({ id: 'k3Qp', name: 'greeting' })

    const bare = check('size: [40, 20]\nlayers:\n  - {type: text, text: HI}\n')
    expect(bare.layers[0]).not.toHaveProperty('id')
    expect(bare.layers[0]).not.toHaveProperty('name')

    // Both are typed `string`, and this validator hands its input back cast to
    // `Layer`, so an unchecked field would be a lie the type system cannot see.
    expect(checkFails('size: [40, 20]\nlayers:\n  - {type: text, text: HI, id: 5}\n'))
      .toMatch(/layers\[0\]\.id/)
    expect(checkFails('size: [40, 20]\nlayers:\n  - {type: text, text: HI, name: []}\n'))
      .toMatch(/layers\[0\]\.name/)
  })

  it('names a bad at, depth, or mask', () => {
    expect(checkFails('size: [40, 20]\nlayers:\n  - {type: text, text: HI, at: 4}\n'))
      .toMatch(/layers\[0\]\.at.*\[x, y\]|\[x, y\].*layers\[0\]\.at/s)
    const depth = checkFails('size: [40, 20]\nlayers:\n  - {type: text, text: HI, depth: 255}\n')
    expect(depth).toMatch(/layers\[0\]\.depth/)
    expect(depth).toMatch(/0.*1/)
    expect(checkFails('size: [40, 20]\nlayers:\n  - {type: image, src: a.png, mode: bump}\n'))
      .toMatch(/layers\[0\]\.mode.*silhouette|silhouette.*layers\[0\]\.mode/s)
  })

  it('propagates the preset registry error for an unknown anim kind, with the path', () => {
    const msg = checkFails(
      'size: [40, 20]\nlayers:\n  - {type: text, text: HI, anim: {kind: mvoe}}\n',
    )
    expect(msg).toMatch(/layers\[0\]\.anim/)
    // The registry's own wording, listing the valid kinds — not a replacement.
    expect(msg).toMatch(/unknown animation preset "mvoe"/)
    // Swept over the registry rather than naming one kind: a list that names
    // a single kind is how this test survived `marquee` being deleted in a
    // state where it no longer proved anything.
    for (const kind of Object.keys(PRESETS)) expect(msg).toMatch(kind)
  })

  it('rejects an inherited Object.prototype key as a preset kind, by name', () => {
    // `kind in PRESETS` consulted the prototype chain, so all four of these
    // *passed* validation — the one outcome this file exists to prevent. Core's
    // `compilePreset` is guarded, so no wrong render followed; what remained is
    // a validator accepting a scene whose `kind` names no preset, silently.
    //
    // Pinned per key rather than as one "a weird key" case, because the
    // plausible wrong fixes split on exactly this: `typeof PRESETS[kind] ===
    // 'function'` rejects `__proto__` (an object) and still accepts
    // `constructor`, since `Object.prototype.constructor` *is* a function.
    for (const kind of ['constructor', '__proto__', 'toString', 'valueOf']) {
      const msg = checkFails(
        `size: [40, 20]\nlayers:\n  - {type: text, text: HI, anim: {kind: ${kind}}}\n`,
      )
      expect(msg).toMatch(/layers\[0\]\.anim/)
      expect(msg).toMatch(`unknown animation preset "${kind}"`)
      for (const valid of Object.keys(PRESETS)) expect(msg).toMatch(valid)
    }

    // The other direction, which a guard is just as able to get wrong:
    // `typeof PRESETS[kind] === 'object'` rejects the four above *and* every
    // real preset, a `PresetFn` being a function. Swept over the registry so a
    // verb added later is covered without this test being revisited.
    for (const kind of Object.keys(PRESETS)) {
      check(`size: [40, 20]\nlayers:\n  - {type: text, text: HI, anim: {kind: ${kind}}}\n`)
    }
  })

  it('accepts a raw track and a list of animators', () => {
    const s = check(
      'size: [40, 20]\nlayers:\n' +
      '  - {type: text, text: HI, anim: [{kind: move}, {keys: [{t: 0, y: 0}, {t: 1, y: 5}]}]}\n',
    )
    expect(s.layers).toHaveLength(1)
  })

  it('names a malformed track', () => {
    expect(checkFails('size: [40, 20]\nlayers:\n  - {type: text, text: HI, anim: {keys: []}}\n'))
      .toMatch(/anim.*keys/s)
    expect(checkFails(
      'size: [40, 20]\nlayers:\n  - {type: text, text: HI, anim: {keys: [{x: 1}]}}\n',
    )).toMatch(/keys\[0\]\.t/)
    expect(checkFails(
      'size: [40, 20]\nlayers:\n  - {type: text, text: HI, anim: {keys: [{t: 0}], ease: snap}}\n',
    )).toMatch(/ease.*linear|linear.*ease/s)
    // The list of named curves no longer describes what is accepted, so the
    // message has to name the other form too — otherwise it tells an author
    // their valid easing is invalid and offers five curves that are not it.
    expect(checkFails(
      'size: [40, 20]\nlayers:\n  - {type: text, text: HI, anim: {keys: [{t: 0}], ease: snap}}\n',
    )).toMatch(/cubic-bezier/)
    expect(checkFails(
      'size: [40, 20]\nlayers:\n  - {type: text, text: HI, anim: {keys: [{t: 0}], repeat: yes}}\n',
    )).toMatch(/repeat/)
  })

  it('accepts a cubic-bezier ease on a track and on a preset', () => {
    // Both validators and `overrides()` tested `ease in EASINGS`, which
    // rejects every bezier string. This is the CLI half of the acceptance:
    // the same scene must pass through `site/scene.ts` too.
    const yaml =
      'size: [40, 20]\nlayers:\n' +
      '  - {type: text, text: A, anim: {keys: [{t: 0}, {t: 1, x: 5}], ' +
      'ease: "cubic-bezier(.17,.67,.83,.67)"}}\n' +
      '  - {type: text, text: B, anim: {kind: scale, ease: "cubic-bezier(0, 0, 1, 1)"}}\n'
    const scene = check(yaml)
    const track = scene.layers[0]!.anim as { ease: string }
    expect(track.ease).toBe('cubic-bezier(.17,.67,.83,.67)')
  })

  it('still rejects a malformed or out-of-range cubic-bezier', () => {
    // Accepting the prefix and nothing else would push the failure into the
    // solver, which throws from inside the render loop with no file or path
    // to name — the one thing a scene validator exists to prevent.
    for (const ease of [
      'cubic-bezier(0,0,1)', 'cubic-bezier(a,b,c,d)', 'cubic-bezier(2,0,1,1)',
    ]) {
      expect(checkFails(
        `size: [40, 20]\nlayers:\n  - {type: text, text: HI, anim: {keys: [{t: 0}], ease: "${ease}"}}\n`,
      ), ease).toMatch(/ease/)
    }
  })

  it('rejects an animator that is neither a preset nor a track', () => {
    const msg = checkFails('size: [40, 20]\nlayers:\n  - {type: text, text: HI, anim: {x: 1}}\n')
    expect(msg).toMatch(/anim/)
    expect(msg).toMatch(/kind|keys/)
  })

  // `KEY_CHANNELS` was a hand-written copy of the channel list that predated
  // `rotateX`/`rotateY`, so the CLI rejected as unknown two channels the
  // animator interpolates perfectly well. Deriving it from `CHANNELS` is what
  // makes that class of drift impossible, so the test pins the derivation as
  // well as the symptom.
  it('accepts every animatable channel in a keyframe, including the axis rotations', () => {
    const s = check(
      'size: [40, 20]\nlayers:\n' +
      '  - {type: text, text: HI, anim: {keys: [{t: 0, rotateX: 0, rotateY: 0}, {t: 1, rotateX: 1, rotateY: 2}]}}\n',
    )
    expect(s.layers).toHaveLength(1)
  })

  it('derives its keyframe channels from CHANNELS, plus the keyframe time', () => {
    expect(new Set(KEY_CHANNELS)).toEqual(new Set(['t', ...CHANNELS]))
  })
})

describe('loadScene', () => {
  it('reads and validates a file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'stst-scene-'))
    const path = join(dir, 'scene.yaml')
    await writeFile(path, MINIMAL)
    expect((await loadScene(path)).size).toEqual([40, 20])
  })

  it('says the file is missing rather than leaking ENOENT', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'stst-scene-'))
    const path = join(dir, 'nope.yaml')
    const msg = await loadScene(path).then(() => '', (err: Error) => err.message)
    expect(msg).toMatch(/not found/)
    expect(msg).toMatch(/nope\.yaml/)
    expect(msg).not.toMatch(/ENOENT/)
  })

  it('names the file in a validation error', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'stst-scene-'))
    const path = join(dir, 'broken.yaml')
    await writeFile(path, 'layers: []\n')
    const msg = await loadScene(path).then(() => '', (err: Error) => err.message)
    expect(msg).toMatch(/broken\.yaml/)
    expect(msg).toMatch(/size/)
  })
})

/* ------------------------------------------------------------------- .stst */

/**
 * P1 criterion 6's read half: `stst render project.stst` has to work, which
 * means the loader dispatches on the extension.
 *
 * These build their fixtures with the real {@link writeStst} rather than with
 * a checked-in archive. A golden `.stst` would pin the container's bytes in a
 * second place — `src/shared/container.test.ts` already owns that — and would
 * go stale against the writer silently, which is the one failure the format's
 * own determinism argument is written against.
 */
describe('loadScene and loadProject over a .stst', () => {
  const SCENE: Scene = {
    size: [40, 20],
    layers: [{ type: 'text', text: 'HI', depth: 0.5 }],
  }

  async function writeArchive(
    name: string,
    scene: Scene = SCENE,
    members: StstMember[] = [],
  ): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'stst-project-'))
    const path = join(dir, name)
    await writeFile(path, await writeStst(scene, members))
    return path
  }

  it('reads the scene out of a .stst written by writeStst', async () => {
    const path = await writeArchive('project.stst')
    const scene = await loadScene(path)
    expect(scene.size).toEqual([40, 20])
    expect(scene.layers).toHaveLength(1)
  })

  /**
   * The loss `loadScene` takes is **recoverable**, which is the whole reason
   * the two entry points exist — see the decision recorded in `scene.ts`.
   */
  it('loadProject hands back the members loadScene drops', async () => {
    const members: StstMember[] = [
      { name: 'logo.png', role: 'mask', data: new Uint8Array([1, 2, 3]) },
      { name: 'logo.png', role: 'source', data: new Uint8Array([4, 5]) },
    ]
    const path = await writeArchive('project.stst', SCENE, members)

    const project = await loadProject(path)
    expect(project.scene.size).toEqual([40, 20])
    expect(project.members.map(m => `${m.role}:${m.name}`))
      .toEqual(['mask:logo.png', 'source:logo.png'])
    expect([...project.members[0]!.data]).toEqual([1, 2, 3])

    // And the same file through `loadScene` keeps nothing — stated as an
    // assertion rather than left to the signature, because it is the
    // difference the two functions exist to make.
    expect(Object.keys(await loadScene(path))).not.toContain('members')
  })

  /** A scene file is never a project, so its members are empty, not absent. */
  it('loadProject reads a plain .yaml too, with no members', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'stst-project-'))
    const path = join(dir, 'scene.yaml')
    await writeFile(path, MINIMAL)
    const project = await loadProject(path)
    expect(project.scene.size).toEqual([40, 20])
    expect(project.members).toEqual([])
  })

  /**
   * `containerRead.ts`'s own docblock says its check is "shape and key
   * rosters, not values — a `depth` of `"banana"` passes here and is caught by
   * whichever validator the caller feeds the scene to next." This is that
   * next validator, and this test is the sensor that it is actually run: a
   * `.stst` reaching the rasteriser unvalidated is how a project file turns
   * into a `TypeError` four frames down.
   */
  it('puts a .stst scene through the CLI validator, not only the container reader', async () => {
    const path = await writeArchive(
      'bad.stst',
      { size: [40, 20], layers: [{ type: 'text', text: 'HI', depth: 'banana' as unknown as number }] },
    )
    const msg = await loadScene(path).then(() => '', (err: Error) => err.message)
    expect(msg).toMatch(/bad\.stst/)
    expect(msg).toMatch(/layers\[0\]\.depth/)
    expect(msg).not.toMatch(/undefined is not|Cannot read propert/)
  })

  /**
   * Dispatch is on the **extension**, matching `outputFormat`, and the pair
   * below is what pins that rather than a sniff of the first bytes. A sniffing
   * loader would quietly open a mislabelled file and give the author no reason
   * to fix the name; it would also make "which reader ran" depend on content,
   * which is the input-dependence `container.ts` refuses for the same reason.
   */
  it('dispatches on the extension and not on the bytes, in both directions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'stst-project-'))

    const zipNamedYaml = join(dir, 'actually-a-zip.yaml')
    await writeFile(zipNamedYaml, await writeStst(SCENE, []))
    const asYaml = await loadScene(zipNamedYaml).then(() => '', (err: Error) => err.message)
    expect(asYaml).toMatch(/actually-a-zip\.yaml/)
    expect(asYaml).toMatch(/valid YAML or JSON/)

    const yamlNamedStst = join(dir, 'actually-yaml.stst')
    await writeFile(yamlNamedStst, MINIMAL)
    const asStst = await loadScene(yamlNamedStst).then(() => '', (err: Error) => err.message)
    expect(asStst).toMatch(/actually-yaml\.stst/)
    // The container reader's message, not the YAML parser's. Asserted by the
    // *absence* of the YAML wording rather than the presence of "zip": the
    // file name itself ends in `.stst`, so any match on the word would be
    // satisfied by the label this loader prepends and would measure nothing.
    expect(asStst).not.toMatch(/valid YAML or JSON/)
    expect(asStst).toMatch(/not a zip archive/)
  })

  it('matches the extension case-insensitively, as outputFormat does', async () => {
    const path = await writeArchive('PROJECT.STST')
    expect((await loadScene(path)).size).toEqual([40, 20])
  })

  it('says a missing .stst is missing, in the same words as a missing scene', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'stst-project-'))
    const msg = await loadScene(join(dir, 'nope.stst')).then(() => '', (err: Error) => err.message)
    expect(msg).toMatch(/not found/)
    expect(msg).toMatch(/nope\.stst/)
    expect(msg).not.toMatch(/ENOENT/)
  })
})

describe('textScene', () => {
  /**
   * A stand-in for canvas text metrics: width scales with the px size in
   * `font`, and **with the weight**, because a heavier face really is wider.
   *
   * The weight sensitivity is not decoration. This stub used to match `px` only
   * at the *start* of the string, so the day `textScene` began emitting
   * `bold 90px sans-serif` it silently measured 0 — a stub that cannot parse
   * what the code under test produces reports a pass for a broken centring.
   * Keeping it weight-aware is what makes the assertions below able to see a
   * weight that is dropped from the measurement but kept on the layer.
   */
  const measure = (text: string, font: string): number => {
    const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 0)
    const heavier = /^bold\b/.test(font) ? 1.1 : /^900\b/.test(font) ? 1.2 : 1
    return text.length * px * 0.6 * heavier
  }

  /** The `font` shorthand `textScene` is expected to measure with. */
  const fontOf = (size: number, weight: string = TEXT_FONT_WEIGHT): string =>
    `${weight} ${size}px ${TEXT_FONT_FAMILY}`

  const build = (line: string[]): Scene =>
    textScene(args(['still', ...line, '-o', 'out.png']), measure)

  it('is a still: it names neither fps nor duration', () => {
    const s = build(['--text', 'HELLO'])
    expect(s.fps).toBeUndefined()
    expect(s.duration).toBeUndefined()
  })

  it('is one text layer with the font family pinned', () => {
    const s = build(['--text', 'HELLO'])
    expect(s.layers).toHaveLength(1)
    const layer = s.layers[0]!
    expect(layer.type).toBe('text')
    if (layer.type !== 'text') throw new Error('unreachable')
    expect(layer.text).toBe('HELLO')
    // Pinned so the measurement here and the raster's own font string agree.
    expect(layer.font).toBe(TEXT_FONT_FAMILY)
  })

  it('defaults to bold, because the regular default is unfusable', () => {
    // Not a style preference: 90px regular measures a 9px median stroke against
    // an 18px disparity budget, so the headline one-liner rendered something
    // nobody can fuse. See TEXT_FONT_WEIGHT.
    const layer = build(['--text', 'HELLO']).layers[0]!
    if (layer.type !== 'text') throw new Error('unreachable')
    expect(layer.weight).toBe('bold')
    expect(TEXT_FONT_WEIGHT).toBe('bold')
  })

  it('lets --font-weight override the default', () => {
    for (const w of ['normal', '900', 'lighter']) {
      const layer = build(['--text', 'HELLO', '--font-weight', w]).layers[0]!
      if (layer.type !== 'text') throw new Error('unreachable')
      expect(layer.weight).toBe(w)
    }
  })

  it('measures with the weight it puts on the layer, so the centring matches', () => {
    // The fragile dependency, pinned: `raster.ts` draws with
    // `<weight> <size>px <family>`, and if the width measured here came from a
    // different string the layer would be centred for a face it is not drawn
    // in. Bold is ~2-4% wider than regular at 90px through the real rasteriser,
    // which on an 800px canvas is several pixels of mis-centring.
    const bold = build(['--text', 'HELLO'])
    const regular = build(['--text', 'HELLO', '--font-weight', 'normal'])
    const xOf = (s: Scene): number => s.layers[0]!.at![0]
    expect(xOf(bold)).toBeLessThan(xOf(regular))
    const size = (bold.layers[0] as { size: number }).size
    expect(xOf(bold)).toBe(Math.round((bold.size[0] - measure('HELLO', fontOf(size))) / 2))
    expect(xOf(regular))
      .toBe(Math.round((regular.size[0] - measure('HELLO', fontOf(size, 'normal'))) / 2))
  })

  it('centres the text instead of leaving it in the top-left corner', () => {
    // Design §3: `at` defaults to [0,0] for text layers, which the presets need
    // but which would render `stst still --text HELLO` in the corner.
    const s = build(['--text', 'HELLO'])
    const layer = s.layers[0]!
    if (layer.type !== 'text') throw new Error('unreachable')
    const [w, h] = s.size
    const size = layer.size!
    const expectedX = Math.round((w - measure('HELLO', fontOf(size))) / 2)
    expect(layer.at).toEqual([expectedX, Math.round((h - size) / 2)])
    expect(layer.at![0]).toBeGreaterThan(0)
    expect(layer.at![1]).toBeGreaterThan(0)
  })

  it('lets --at override the centring', () => {
    const s = build(['--text', 'HELLO', '--at', '7,9'])
    expect(s.layers[0]!.at).toEqual([7, 9])
  })

  it('honours --size, --font-size and --depth', () => {
    const s = build(['--text', 'HI', '--size', '320x240', '--font-size', '40', '--depth', '0.6'])
    expect(s.size).toEqual([320, 240])
    const layer = s.layers[0]!
    if (layer.type !== 'text') throw new Error('unreachable')
    expect(layer.size).toBe(40)
    expect(layer.depth).toBe(0.6)
  })

  it('shrinks the type rather than running a long string off the canvas', () => {
    const long = build(['--text', 'A VERY LONG PHRASE INDEED'])
    const layer = long.layers[0]!
    if (layer.type !== 'text') throw new Error('unreachable')
    const width = measure(layer.text, fontOf(layer.size!))
    expect(width).toBeLessThanOrEqual(long.size[0])
    expect(layer.at![0]).toBeGreaterThanOrEqual(0)
  })

  it('does not shrink type that already fits', () => {
    const short = build(['--text', 'HI'])
    const sized = build(['--text', 'HI', '--font-size', '90'])
    expect((short.layers[0] as { size?: number }).size)
      .toBe((sized.layers[0] as { size?: number }).size)
  })
})

describe('applyOverrides', () => {
  const base = (): Scene => ({
    size: [40, 20],
    fps: 10,
    duration: 2,
    stereo: { sepFar: 100, sepNear: 80, seed: 3 },
    layers: [{ type: 'shape', shape: 'rect', w: 10, h: 10 }],
  })

  const over = (line: string[]): Scene =>
    applyOverrides(base(), args(['render', 'scene.yaml', '-o', 'out.gif', ...line]))

  it('merges stereo flags over the scene, leaving untouched fields alone', () => {
    const s = over(['--sep-far', '120', '--seed', '9'])
    expect(s.stereo).toEqual({ sepFar: 120, sepNear: 80, seed: 9 })
  })

  it('overrides fps, duration and freezeNoise', () => {
    const s = over(['--fps', '25', '--duration', '4', '--freeze-noise'])
    expect(s.fps).toBe(25)
    expect(s.duration).toBe(4)
    expect(s.freezeNoise).toBe(true)
  })

  it('changes nothing when no flags are given', () => {
    expect(over([])).toEqual(base())
  })

  it('never mutates the scene it was given', () => {
    const scene = base()
    const before = structuredClone(scene)
    applyOverrides(scene, args(['render', 's.yaml', '-o', 'o.gif', '--sep-far', '120']))
    expect(scene).toEqual(before)
  })

  it('validates the merged stereo, so a bad override fails before rendering', () => {
    const msg = reject(() => over(['--sep-near', '200']))
    expect(msg).toMatch(/sepNear/)
    expect(msg).toMatch(/depth budget|flat plane/)
  })

  it('applies --at to a single-layer scene', () => {
    expect(over(['--at', '5,6']).layers[0]!.at).toEqual([5, 6])
  })

  it('refuses --at on a multi-layer scene, naming the ambiguity', () => {
    const scene = base()
    scene.layers.push({ type: 'shape', shape: 'rect', w: 5, h: 5 })
    const msg = reject(() =>
      applyOverrides(scene, args(['render', 's.yaml', '-o', 'o.gif', '--at', '5,6'])))
    expect(msg).toMatch(/--at/)
    expect(msg).toMatch(/2 layers/)
  })
})
