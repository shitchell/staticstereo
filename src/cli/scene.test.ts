import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from './args.js'
import type { CliArgs } from './args.js'
import {
  TEXT_FONT_FAMILY,
  applyOverrides,
  loadScene,
  parseSceneText,
  textScene,
  validateScene,
} from './scene.js'
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
      '  - {type: text, text: HELLO, size: 90, depth: 0.6, anim: {kind: marquee, speed: 60}}\n' +
      '  - {type: image, src: ball.png, depth: 1.0, anim: {kind: bounce, height: 200}}\n' +
      '  - {type: gif, src: walk.gif, loop: loop, depth: 1.0, anim: {kind: slide-in, from: left}}\n' +
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
      'size: [40, 20]\nlayers:\n  - {type: text, text: HI, anim: {kind: marque}}\n',
    )
    expect(msg).toMatch(/layers\[0\]\.anim/)
    // The registry's own wording, listing the valid kinds — not a replacement.
    expect(msg).toMatch(/unknown animation preset "marque"/)
    expect(msg).toMatch(/marquee/)
  })

  it('accepts a raw track and a list of animators', () => {
    const s = check(
      'size: [40, 20]\nlayers:\n' +
      '  - {type: text, text: HI, anim: [{kind: marquee}, {keys: [{t: 0, y: 0}, {t: 1, y: 5}]}]}\n',
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
    expect(checkFails(
      'size: [40, 20]\nlayers:\n  - {type: text, text: HI, anim: {keys: [{t: 0}], repeat: yes}}\n',
    )).toMatch(/repeat/)
  })

  it('rejects an animator that is neither a preset nor a track', () => {
    const msg = checkFails('size: [40, 20]\nlayers:\n  - {type: text, text: HI, anim: {x: 1}}\n')
    expect(msg).toMatch(/anim/)
    expect(msg).toMatch(/kind|keys/)
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

describe('textScene', () => {
  /** A stand-in for canvas text metrics: width scales with the px size in `font`. */
  const measure = (text: string, font: string): number => {
    const px = Number(/^(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 0)
    return text.length * px * 0.6
  }

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

  it('centres the text instead of leaving it in the top-left corner', () => {
    // Design §3: `at` defaults to [0,0] for text layers, which the presets need
    // but which would render `stst still --text HELLO` in the corner.
    const s = build(['--text', 'HELLO'])
    const layer = s.layers[0]!
    if (layer.type !== 'text') throw new Error('unreachable')
    const [w, h] = s.size
    const size = layer.size!
    const expectedX = Math.round((w - measure('HELLO', `${size}px ${TEXT_FONT_FAMILY}`)) / 2)
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
    const width = measure(layer.text, `${layer.size!}px ${TEXT_FONT_FAMILY}`)
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
