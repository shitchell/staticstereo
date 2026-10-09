/**
 * Scene loading, validation, and the two scenes the CLI builds itself.
 *
 * **Error quality is the product here.** A scene file is user-authored data, so
 * every rejection has to name the field it is rejecting and what was expected
 * — `scene.yaml: unknown layer type "txt" at layers[0].type — expected one of
 * …`, never a `TypeError` from four frames deep in the rasteriser. The
 * validator is therefore exhaustive rather than defensive: unknown keys are
 * errors, because a silently ignored `freeznoise:` or `sized:` is how an author
 * concludes the generator is broken.
 *
 * Where a lower layer already explains a problem better than the CLI could —
 * `resolveStereo` on `sepNear >= sepFar`, the preset registry on an unknown
 * `kind` — this file **propagates that message** and only adds the field path.
 * It does not paraphrase it.
 *
 * YAML is parsed by the `yaml` package rather than a hand-rolled subset. The
 * scene format is small, but the *input* is arbitrary user YAML — comments,
 * quoting, block vs flow, anchors — and a subset parser silently mis-reading a
 * valid file is the worst failure available here. It is also CLI-only: `core`
 * stays dependency-free (`purity.test.ts` enforces it), so nothing in this file
 * can reach the browser bundle.
 */
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { EASINGS, PRESETS, compilePreset, resolveStereo } from '../core/index.js'
import type { Layer, Scene } from '../core/index.js'
import { UsageError } from './args.js'
import type { CliArgs } from './args.js'

/* ------------------------------------------------------------------ parsing */

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** A short human description of a value, for "got …" clauses. */
function describe(v: unknown): string {
  if (v === null) return 'null'
  if (v === undefined) return 'nothing'
  if (Array.isArray(v)) return `an array (${JSON.stringify(v).slice(0, 40)})`
  if (typeof v === 'object') return 'an object'
  return JSON.stringify(v)
}

/**
 * Parse a scene file's text into raw data. JSON goes through the same path:
 * YAML 1.2 is a JSON superset, and `yaml` handles tab-indented JSON (which
 * YAML forbids for block indentation) because it is all flow context.
 */
export function parseSceneText(text: string, label: string): unknown {
  if (text.trim() === '') {
    throw new Error(`${label} is empty — a scene needs at least "size" and "layers"`)
  }

  let value: unknown
  try {
    value = parseYaml(text)
  } catch (err) {
    // `yaml` reports "… at line 4, column 1:" plus the offending line and a
    // caret, which is strictly better than anything constructed from here.
    throw new Error(`${label} is not valid YAML or JSON: ${(err as Error).message}`,
      { cause: err })
  }

  if (!isObj(value)) {
    throw new Error(
      `${label} must be a mapping with "size" and "layers" at the top level, ` +
      `got ${describe(value)}`,
    )
  }
  return value
}

/** Read, parse, and validate a scene file. */
export async function loadScene(path: string): Promise<Scene> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') throw new Error(`scene file not found: "${path}"`)
    if (code === 'EISDIR') throw new Error(`"${path}" is a directory, not a scene file`)
    throw new Error(`could not read scene file "${path}": ${(err as Error).message}`,
      { cause: err })
  }
  const label = basename(path)
  return validateScene(parseSceneText(text, label), label)
}

/* --------------------------------------------------------------- validation */

const SCENE_KEYS = ['size', 'fps', 'duration', 'stereo', 'freezeNoise', 'layers'] as const
const STEREO_KEYS = ['sepFar', 'sepNear', 'noiseScale', 'depthBlur', 'cross', 'seed'] as const
const LAYER_TYPES = ['text', 'image', 'gif', 'shape', 'draw'] as const
const BASE_LAYER_KEYS = ['type', 'depth', 'at', 'anim'] as const
const TYPE_LAYER_KEYS: Record<string, readonly string[]> = {
  text: ['text', 'size', 'font', 'weight'],
  image: ['src', 'mode', 'mask'],
  gif: ['src', 'loop', 'mode', 'mask'],
  shape: ['shape', 'r', 'w', 'h', 'start', 'end'],
  draw: ['fn'],
}
const TRACK_KEYS = ['keys', 'ease', 'repeat', 'start', 'duration'] as const
const KEY_CHANNELS = ['t', 'x', 'y', 'depth', 'scale', 'rotate'] as const
const REPEATS = ['once', 'loop', 'pingpong'] as const

/**
 * Validate raw scene data and hand back a typed `Scene`.
 *
 * `label` prefixes every message, so the user is told *which* file is wrong
 * when a scene is loaded from disk.
 */
export function validateScene(value: unknown, label: string): Scene {
  const fail = (msg: string): never => {
    throw new Error(`${label}: ${msg}`)
  }

  if (!isObj(value)) return fail(`a scene must be a mapping with "size" and "layers", got ${describe(value)}`)
  unknownKeys(value, SCENE_KEYS, k => `unknown scene key "${k}"`, fail)

  /* ---- size */
  const rawSize = value['size']
  if (rawSize === undefined) {
    fail('"size" is required — [width, height] in px, e.g. size: [800, 450]')
  }
  if (
    !Array.isArray(rawSize) || rawSize.length !== 2 ||
    !rawSize.every(n => typeof n === 'number' && Number.isInteger(n) && n > 0)
  ) {
    fail(`"size" must be [width, height] as two positive integers, got ${describe(rawSize)}`)
  }
  const size = rawSize as [number, number]

  /* ---- timing (design §4.1: 0 is rejected, not reinterpreted) */
  const timing = (name: 'fps' | 'duration'): number | undefined => {
    const v = value[name]
    if (v === undefined) return undefined
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      fail(
        `"${name}" must be a positive number, got ${describe(v)}. ` +
        `${name}: 0 is rejected rather than reinterpreted — omit both fps and ` +
        `duration for a still.`,
      )
    }
    return v as number
  }
  const fps = timing('fps')
  const duration = timing('duration')

  /* ---- freezeNoise */
  const freeze = value['freezeNoise']
  if (freeze !== undefined && typeof freeze !== 'boolean') {
    fail(`"freezeNoise" must be a boolean (true or false), got ${describe(freeze)}`)
  }

  /* ---- stereo */
  let stereo: Scene['stereo']
  const rawStereo = value['stereo']
  if (rawStereo !== undefined) {
    if (!isObj(rawStereo)) fail(`"stereo" must be a mapping of stereo settings, got ${describe(rawStereo)}`)
    const s = rawStereo as Record<string, unknown>
    unknownKeys(s, STEREO_KEYS, k => `unknown setting "stereo.${k}"`, fail)
    for (const k of STEREO_KEYS) {
      const v = s[k]
      if (v === undefined) continue
      if (k === 'cross') {
        if (typeof v !== 'boolean') fail(`stereo.cross must be a boolean, got ${describe(v)}`)
      } else if (typeof v !== 'number' || !Number.isFinite(v)) {
        fail(`stereo.${k} must be a finite number, got ${describe(v)}`)
      }
    }
    stereo = s as Scene['stereo']
  }

  /* ---- layers */
  const rawLayers = value['layers']
  if (rawLayers === undefined) {
    fail('"layers" is required — an array of layers (use [] for a bare dot field)')
  }
  if (!Array.isArray(rawLayers)) {
    fail(`"layers" must be an array of layers, got ${describe(rawLayers)}`)
  }
  const layers = (rawLayers as unknown[]).map((l, i) => validateLayer(l, `layers[${i}]`, fail))

  const scene: Scene = { size, layers }
  if (fps !== undefined) scene.fps = fps
  if (duration !== undefined) scene.duration = duration
  if (typeof freeze === 'boolean') scene.freezeNoise = freeze
  if (stereo !== undefined) scene.stereo = stereo

  // Semantic stereo checks live in `resolveStereo`, whose messages explain the
  // consequence ("the gap between them is the entire depth budget"). Propagate
  // them with the file name attached rather than restating them worse.
  try {
    resolveStereo(scene)
  } catch (err) {
    fail((err as Error).message)
  }

  return scene
}

/**
 * Reject keys outside `allowed`, listing the valid ones.
 *
 * `head` builds the sentence opener for the offending key, so each caller can
 * say where it was found — a typo'd key is the one error class a validator can
 * catch that nothing downstream ever will.
 */
function unknownKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  head: (key: string) => string,
  fail: (msg: string) => never,
): void {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) {
      fail(`${head(k)} — valid keys: ${[...allowed].sort().join(', ')}`)
    }
  }
}

function validateLayer(
  raw: unknown, path: string, fail: (msg: string) => never,
): Layer {
  if (!isObj(raw)) fail(`${path} must be a mapping describing one layer, got ${describe(raw)}`)
  const l = raw as Record<string, unknown>

  const type = l['type']
  if (typeof type !== 'string' || !(LAYER_TYPES as readonly string[]).includes(type)) {
    fail(
      `unknown layer type ${describe(type)} at ${path}.type — expected one of: ` +
      `${[...LAYER_TYPES].sort().join(', ')}`,
    )
  }
  const kind = type as (typeof LAYER_TYPES)[number]
  unknownKeys(
    l, [...BASE_LAYER_KEYS, ...TYPE_LAYER_KEYS[kind]!],
    k => `unknown key "${k}" at ${path}, which is a "${kind}" layer`, fail,
  )

  /* ---- shared layer fields */
  const depth = l['depth']
  if (depth !== undefined) {
    if (typeof depth !== 'number' || !Number.isFinite(depth) || depth < 0 || depth > 1) {
      fail(
        `${path}.depth must be a number between 0 and 1 ` +
        `(0 = background, 1 = nearest to the viewer), got ${describe(depth)}`,
      )
    }
  }

  const at = l['at']
  if (at !== undefined) {
    if (
      !Array.isArray(at) || at.length !== 2 ||
      !at.every(n => typeof n === 'number' && Number.isFinite(n))
    ) {
      fail(`${path}.at must be [x, y] in px, got ${describe(at)}`)
    }
  }

  if (l['anim'] !== undefined) validateAnim(l['anim'], `${path}.anim`, fail)

  /* ---- per type */
  const str = (name: string, hint: string): void => {
    const v = l[name]
    if (typeof v !== 'string' || v === '') {
      fail(`${path}.${name} must be a non-empty string (${hint}), got ${describe(v)}`)
    }
  }
  const positive = (name: string, hint: string): void => {
    const v = l[name]
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      fail(`${path}.${name} must be a positive number (${hint}), got ${describe(v)}`)
    }
  }
  const oneOf = (name: string, allowed: readonly string[], required: boolean): void => {
    const v = l[name]
    if (v === undefined && !required) return
    if (typeof v !== 'string' || !allowed.includes(v)) {
      fail(
        `${path}.${name} must be one of: ${allowed.map(a => `"${a}"`).join(', ')}, ` +
        `got ${describe(v)}`,
      )
    }
  }

  switch (kind) {
    case 'text':
      str('text', 'quote it if it looks like a number')
      if (l['size'] !== undefined) positive('size', 'type size in px')
      if (l['font'] !== undefined) str('font', 'a CSS font family')
      if (l['weight'] !== undefined) str('weight', 'e.g. bold')
      break
    case 'image':
      str('src', 'a path or URL')
      oneOf('mode', ['silhouette', 'heightmap'], false)
      validateMask(l['mask'], path, fail)
      break
    case 'gif':
      str('src', 'a path or URL')
      oneOf('mode', ['silhouette', 'heightmap'], false)
      oneOf('loop', REPEATS, false)
      validateMask(l['mask'], path, fail)
      break
    case 'shape':
      oneOf('shape', ['circle', 'rect'], true)
      if (l['shape'] === 'circle') positive('r', "the circle's radius in px")
      else {
        positive('w', 'width in px')
        positive('h', 'height in px')
      }
      break
    case 'draw':
      str('fn', 'a module path')
      break
  }

  return l as unknown as Layer
}

function validateMask(
  mask: unknown, path: string, fail: (msg: string) => never,
): void {
  if (mask === undefined) return
  if (mask === 'alpha') return
  if (isObj(mask) && Object.keys(mask).length === 1 && typeof mask['luma'] === 'number') {
    const t = mask['luma']
    if (!Number.isFinite(t) || t < 0 || t > 1) {
      fail(`${path}.mask.luma must be a brightness threshold between 0 and 1, got ${describe(t)}`)
    }
    return
  }
  fail(
    `${path}.mask must be "alpha" or {luma: <0..1>}, got ${describe(mask)}`,
  )
}

/** One animator, or a list of them. */
function validateAnim(raw: unknown, path: string, fail: (msg: string) => never): void {
  if (Array.isArray(raw)) {
    raw.forEach((item, i) => validateAnimItem(item, `${path}[${i}]`, fail))
    return
  }
  validateAnimItem(raw, path, fail)
}

function validateAnimItem(raw: unknown, path: string, fail: (msg: string) => never): void {
  if (!isObj(raw)) {
    fail(`${path} must be a preset ({kind: ...}) or a track ({keys: [...]}), got ${describe(raw)}`)
  }
  const a = raw as Record<string, unknown>

  if (a['kind'] !== undefined) {
    const kind = a['kind']
    if (typeof kind !== 'string') {
      fail(`${path}.kind must be a preset name, got ${describe(kind)}`)
    }
    if (!(kind as string in PRESETS)) {
      // Harvest the registry's own message — it lists the valid kinds and is
      // the single source of truth for what they are.
      try {
        compilePreset({ kind: kind as string }, {
          sceneW: 1, sceneH: 1, contentW: 1, contentH: 1, layerDepth: 1,
        })
      } catch (err) {
        fail(`${path}: ${(err as Error).message}`)
      }
      fail(`${path}: unknown animation preset ${describe(kind)}`)
    }
    // Preset parameters are open-ended by design (`[param: string]: unknown`),
    // so there is nothing further to check without a per-preset schema.
    return
  }

  if (a['keys'] === undefined) {
    fail(
      `${path} must be a preset ({kind: marquee, ...}) or a keyframe track ` +
      `({keys: [...]}), but it has neither "kind" nor "keys"`,
    )
  }

  unknownKeys(a, TRACK_KEYS, k => `unknown track key "${k}" at ${path}`, fail)

  const keys = a['keys']
  if (!Array.isArray(keys) || keys.length === 0) {
    fail(`${path}.keys must be a non-empty array of keyframes, got ${describe(keys)}`)
  }
  ;(keys as unknown[]).forEach((k, i) => {
    const kp = `${path}.keys[${i}]`
    if (!isObj(k)) fail(`${kp} must be a mapping like {t: 0, x: 100}, got ${describe(k)}`)
    const key = k as Record<string, unknown>
    unknownKeys(key, KEY_CHANNELS, c => `unknown keyframe channel "${c}" at ${kp}`, fail)
    if (typeof key['t'] !== 'number' || !Number.isFinite(key['t'])) {
      fail(`${kp}.t must be a number (the keyframe's time, 0..1 within the track), got ${describe(key['t'])}`)
    }
    for (const ch of KEY_CHANNELS) {
      if (ch === 't' || key[ch] === undefined) continue
      if (typeof key[ch] !== 'number' || !Number.isFinite(key[ch])) {
        fail(`${kp}.${ch} must be a number, got ${describe(key[ch])}`)
      }
    }
  })

  if (a['ease'] !== undefined && !(typeof a['ease'] === 'string' && a['ease'] in EASINGS)) {
    fail(
      `${path}.ease must be one of: ${Object.keys(EASINGS).sort().join(', ')} — ` +
      `got ${describe(a['ease'])}`,
    )
  }
  if (a['repeat'] !== undefined &&
      !(typeof a['repeat'] === 'string' && (REPEATS as readonly string[]).includes(a['repeat']))) {
    fail(`${path}.repeat must be one of: ${REPEATS.join(', ')} — got ${describe(a['repeat'])}`)
  }
  for (const name of ['start', 'duration'] as const) {
    const v = a[name]
    if (v === undefined) continue
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      fail(`${path}.${name} must be a non-negative number of seconds, got ${describe(v)}`)
    }
  }
}

/* ------------------------------------------------------- the --text scene */

/**
 * Font family for `--text`, pinned onto the layer rather than left to the
 * rasteriser's default — the width measured here and the font the rasteriser
 * draws with have to be the same string, or the centring below is wrong by
 * whatever the two defaults differ by.
 */
export const TEXT_FONT_FAMILY = 'sans-serif'
/** Default canvas for `--text`, matching the design doc's example scene. */
export const TEXT_SCENE_SIZE: readonly [number, number] = [800, 450]
/** Default type size for `--text`, also from the design doc's example. */
export const TEXT_FONT_SIZE = 90

/** Measure rendered text width. Injected so this module needs no canvas. */
export type MeasureText = (text: string, font: string) => number

/**
 * Build the one-layer scene behind `stst still --text HELLO`.
 *
 * **It supplies its own `at`, centred.** Design §3 defaults `at` to `[0, 0]`
 * for text layers and says so deliberately: `marquee` and `slide-in` compute
 * off-frame positions as `-contentW` / `+sceneW`, which are only off-frame if
 * the layer's own origin is the top-left corner. That default is right for
 * scene files and wrong for a one-shot still, which would render in the corner.
 * So the centring lives *here*, in the CLI, where there are no presets to break
 * — and `--at` still overrides it.
 *
 * The type is also shrunk to fit when it would overflow the canvas, but only
 * when the size was *not* given explicitly: `--font-size 200` is an
 * instruction, not a suggestion.
 *
 * Vertically this centres the **em box** (`(h - size) / 2`), not the glyph ink,
 * so capitals sit slightly below the optical centre — measured at 41px above
 * and 28px below for "HELLO" at 86px on a 120px canvas. Fixing that needs
 * `actualBoundingBoxAscent`, which `Ctx2D` deliberately does not expose
 * (design §2 keeps the canvas seam narrow), so the choice is em-box centring
 * or a magic cap-height constant. Em-box centring at least means the same
 * `at` for every string.
 */
export function textScene(args: CliArgs, measure: MeasureText): Scene {
  const text = args.text ?? ''
  const [w, h] = args.size ?? TEXT_SCENE_SIZE
  const fontOf = (size: number): string => `${size}px ${TEXT_FONT_FAMILY}`

  let size = args.fontSize ?? TEXT_FONT_SIZE
  let width = measure(text, fontOf(size))

  if (args.fontSize === undefined) {
    const fit = w * 0.9
    if (width > fit && width > 0) {
      size = Math.max(6, Math.floor((size * fit) / width))
      width = measure(text, fontOf(size))
    }
  }

  const layer: Layer = {
    type: 'text',
    text,
    size,
    font: TEXT_FONT_FAMILY,
    at: args.at ?? [Math.round((w - width) / 2), Math.round((h - size) / 2)],
  }
  if (args.depth !== undefined) layer.depth = args.depth

  // Validated like any other scene, so `--depth 5` or `--size 0x0` is reported
  // in the same words a scene file would get.
  return validateScene({ size: [w, h], layers: [layer] }, '--text scene')
}

/* ------------------------------------------------------------- overrides */

/**
 * Apply the command line's overrides to a loaded scene, returning a new scene.
 *
 * Only flags that were actually given are applied — `args.stereo` is a
 * `Partial`, so a scene's own `seed` survives unless `--seed` was passed.
 */
export function applyOverrides(scene: Scene, args: CliArgs): Scene {
  const next: Scene = { ...scene }

  if (Object.keys(args.stereo).length > 0) {
    next.stereo = { ...scene.stereo, ...args.stereo }
  }
  if (args.fps !== undefined) next.fps = args.fps
  if (args.duration !== undefined) next.duration = args.duration
  if (args.freezeNoise !== undefined) next.freezeNoise = args.freezeNoise

  if (args.at !== undefined) {
    if (scene.layers.length !== 1) {
      throw new UsageError(
        `--at places one layer, but the scene has ${scene.layers.length} layers, ` +
        `so which one is ambiguous — set "at" on the layer you mean in the scene file`,
      )
    }
    const layer = scene.layers[0]!
    next.layers = [{ ...layer, at: args.at }]
  }

  // Re-checked after merging: `--sep-near 200` has to fail here, before a
  // single frame is rendered, with resolveStereo's own explanation.
  resolveStereo(next)
  return next
}
