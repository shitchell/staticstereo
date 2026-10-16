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
import {
  CHANNELS,
  CUBIC_BEZIER_SYNTAX,
  EASINGS,
  PRESETS,
  compilePreset,
  isEasing,
  resolveStereo,
  STEREO_KEYS,
} from '../core/index.js'
import type { AssertNever, Channel, Layer, Scene } from '../core/index.js'
import { readStst } from '../shared/containerRead.js'
import type { StstArchive } from '../shared/containerRead.js'
import type { StstMember } from '../shared/container.js'
import { PROJECT_EXT, UsageError } from './args.js'
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

/* ------------------------------------------------------------- .stst input */

/*
 * Dispatch is on the **extension** — `PROJECT_EXT`, defined in `args.ts`
 * beside `outputFormat` because that is already the module that maps an
 * extension to a meaning — and deliberately not a sniff of the first two
 * bytes. A sniffing loader opens a mislabelled file without ever telling the
 * author the name is wrong, and it makes "which reader ran" a function of the
 * content: the same input-dependence `container.ts` refuses when it picks
 * `'store'` unconditionally rather than from the bytes.
 */

/**
 * A `.stst` read whole: the scene plus everything else the archive carried.
 *
 * Shaped so the members can go straight back into `writeStst`, which is what
 * makes `--save-project` over a `.stst` input lossless. See
 * {@link loadProject}.
 */
export interface LoadedProject {
  readonly scene: Scene
  /**
   * Masks then sources, in the archive's own order. **Empty for a `.yaml` or
   * `.json` scene** — a scene file carries no members, which is a different
   * statement from "the members were not read" and is why this is `[]` rather
   * than optional.
   */
  readonly members: readonly StstMember[]
}

/**
 * Read a scene source: a `.yaml`/`.json` scene file, or a `.stst` project.
 *
 * ## Why there are two entry points and not one
 *
 * `loadScene` returns a `Scene`, and a `.stst` holds masks and sources as
 * well. Reading a project through a `Scene`-shaped door therefore discards
 * everything but `scene.json`, and `zipRead.ts`'s own rationale (plan §1.2k)
 * is written against exactly that hazard: *a `.stst` is the user's project, so
 * a silently mis-read one destroys work that exists nowhere else.*
 *
 * **The decision, recorded rather than implied by silence.** The render path
 * can legitimately ignore members *today* — nothing in `src/core` consumes a
 * baked mask out of a container, and `renderFrame` takes a `Scene` — so
 * `loadScene` dropping them costs a renderer nothing. That alone would have
 * justified a one-line extension branch. It is **not** what makes the loss
 * safe, because the read is only half of criterion 6: the same phase adds
 * `--save-project`, and
 *
 * ```
 * stst render project.stst -o out.gif --save-project project.stst
 * ```
 *
 * would then read a project, drop its masks and sources, and write the
 * remainder back over the original. That is the destroy-the-only-copy failure,
 * reached without anybody doing anything unusual.
 *
 * So the loss is **removed rather than announced**. `loadProject` is what the
 * CLI calls, it hands back the whole archive, and `index.ts` carries
 * `members` into `writeStst`, which makes the round-trip lossless *by
 * construction*. A warning on the read would have been the other option and is
 * weaker twice over: it fires on every render of a project with an imported
 * image, where nothing is wrong, and §9's standing row says a recorded note is
 * not a sensor — a warning is a note with a timestamp.
 *
 * `loadScene` stays, with its original signature, for the callers that really
 * do only want a scene (`examples.test.ts`, `metamorphic.real.test.ts`).
 */
export async function loadProject(path: string): Promise<LoadedProject> {
  const bytes = await readSource(path)
  const label = basename(path)

  if (!label.toLowerCase().endsWith(PROJECT_EXT)) {
    return { scene: validateScene(parseSceneText(bytes.toString('utf8'), label), label), members: [] }
  }

  let archive: StstArchive
  try {
    archive = await readStst(new Uint8Array(bytes))
  } catch (err) {
    // Prefixed with the file name for the reason every other message in this
    // file is: the reader is handed one archive and says ".stst manifest.json
    // …", and the user may have passed three paths.
    throw new Error(`${label}: ${(err as Error).message}`, { cause: err })
  }

  // Re-validated here, and `containerRead.ts`'s docblock is what asks for it:
  // its own check is "shape and key rosters, not values — a `depth` of
  // `"banana"` passes here and is caught by whichever validator the caller
  // feeds the scene to next." This is that validator. Skipping it would let a
  // project file reach the rasteriser as a `TypeError` four frames down, which
  // is the failure the top of this file exists to prevent for `.yaml`.
  return { scene: validateScene(archive.scene, label), members: archive.members }
}

/** Read, parse, and validate a scene file. */
export async function loadScene(path: string): Promise<Scene> {
  return (await loadProject(path)).scene
}

/**
 * Read the bytes, turning Node's error codes into sentences.
 *
 * Bytes rather than a string because a `.stst` is a zip: decoding it as UTF-8
 * first would corrupt it, and lossily, so the container reader would be handed
 * replacement characters and report a malformed archive instead of a
 * misnamed one.
 */
async function readSource(path: string): Promise<Buffer> {
  try {
    return await readFile(path)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') throw new Error(`scene file not found: "${path}"`)
    if (code === 'EISDIR') throw new Error(`"${path}" is a directory, not a scene file`)
    throw new Error(`could not read scene file "${path}": ${(err as Error).message}`,
      { cause: err })
  }
}

/* --------------------------------------------------------------- validation */

const SCENE_KEYS = ['size', 'fps', 'duration', 'stereo', 'freezeNoise', 'layers'] as const
const LAYER_TYPES = ['text', 'image', 'gif', 'shape', 'draw'] as const
const BASE_LAYER_KEYS = ['type', 'id', 'name', 'depth', 'at', 'anim'] as const
const TYPE_LAYER_KEYS: Record<string, readonly string[]> = {
  text: ['text', 'size', 'font', 'weight'],
  image: ['src', 'mode', 'mask'],
  gif: ['src', 'loop', 'mode', 'mask'],
  shape: ['shape', 'r', 'w', 'h', 'start', 'end'],
  draw: ['fn'],
}
const TRACK_KEYS = ['keys', 'ease', 'repeat', 'start', 'duration'] as const
/**
 * What may appear in a keyframe: the animatable channels plus `t`, which is
 * the keyframe's own time and so is not a `Transform` channel.
 *
 * Derived rather than written out. The hand-written list this replaces had
 * fallen a release behind `CHANNELS` and omitted `rotateX`/`rotateY`, so the
 * CLI rejected by name two channels `evalTrack` interpolates — a scene the
 * renderer handles perfectly well refused to load. Exported for the test that
 * pins the derivation.
 */
export const KEY_CHANNELS = ['t', ...CHANNELS] as const
type KeyChannel = typeof KEY_CHANNELS[number]
// The guard, not the spread, is what keeps this honest: it fails the build if
// anyone writes the list out again, in either direction.
type _NoKeyChannelMissing = AssertNever<Exclude<Channel, KeyChannel>>
type _NoKeyChannelExtra = AssertNever<Exclude<KeyChannel, Channel | 't'>>
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
      } else if (k === 'algorithm') {
        // The *value* check is delegated to `resolveStereo` below, which owns
        // the list; only the type is wrong-shaped enough to catch here.
        if (typeof v !== 'string') {
          fail(`stereo.algorithm must be a string naming an encoder, got ${describe(v)}`)
        }
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

  /* ---- identity (design §4.1)
   *
   * Checked, but never supplied: this validator hands the raw object back cast
   * to `Layer`, so an `id: 5` left unchecked would be a `string` the type
   * system believes in. Nothing mints one here — a scene loaded and written
   * back unchanged must stay byte-identical, so id assignment belongs to the
   * editor's mutation path, where there is an actual edit to attach it to. */
  if (l['id'] !== undefined) str('id', 'a stable layer id')
  if (l['name'] !== undefined) str('name', 'a display name for the layer')

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
    // `Object.hasOwn`, not `kind in PRESETS`: `PRESETS` is an object literal,
    // so `in` answered `true` for the dozen keys on `Object.prototype` and
    // `{kind: constructor}` passed validation — a scene accepted whose `kind`
    // names no preset, which is the one outcome this file exists to prevent.
    // Third site of the same idiom; `src/core/anim/presets.ts`' `PRESETS`
    // docblock records the other two and why the guard, not the type, is what
    // makes the registry's wide `Record<string, …>` safe at each lookup.
    if (!Object.hasOwn(PRESETS, kind as string)) {
      // Harvest the registry's own message — it lists the valid kinds and is
      // the single source of truth for what they are.
      try {
        // Values are irrelevant: this call exists only to make the registry
        // throw its own "unknown preset" message, which lists the valid kinds.
        compilePreset({ kind: kind as string }, {
          sceneW: 1, sceneH: 1, contentW: 1, contentH: 1, layerDepth: 1,
          marginLeft: 0, marginRight: 0,
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
      `${path} must be a preset ({kind: move, ...}) or a keyframe track ` +
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

  // `isEasing`, not `ease in EASINGS`: the record holds the five named curves
  // and `Easing` is now wider than that. The message has to name the other
  // form as well, because a list of five curve names no longer describes what
  // is accepted — left alone it would tell an author that a perfectly valid
  // `cubic-bezier(...)` is invalid, and offer five alternatives that are not
  // what they asked for.
  if (a['ease'] !== undefined && !isEasing(a['ease'])) {
    fail(
      `${path}.ease must be one of: ${Object.keys(EASINGS).sort().join(', ')} — ` +
      `or ${CUBIC_BEZIER_SYNTAX} — got ${describe(a['ease'])}`,
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
 *
 * It stays the CSS generic. `@napi-rs/canvas` maps no generic family and
 * silently substitutes the first registered one, so `src/node/canvas.ts`
 * resolves it to a concrete installed family on assignment — and because
 * `measurer()` in `index.ts` measures through the same injected `CanvasLike`,
 * both sides of the centring see the same resolution. Hardcoding a family here
 * instead would be wrong on every host but one.
 *
 * Since the fonts were vendored that resolution lands on `VENDORED_FAMILY`
 * (`assets/fonts/inter-*.ttf`) rather than on whatever system sans happens to
 * be installed, so the width measured here is now reproducible across hosts —
 * but the reason this stays a generic is unchanged: naming the vendored family
 * here would hardcode the adapter's answer into the CLI and break the day a
 * registration fails and the system chain takes over.
 */
export const TEXT_FONT_FAMILY = 'sans-serif'
/** Default canvas for `--text`, matching the design doc's example scene. */
export const TEXT_SCENE_SIZE: readonly [number, number] = [800, 450]
/** Default type size for `--text`, also from the design doc's example. */
export const TEXT_FONT_SIZE = 90

/**
 * Default weight for `--text`. **Bold, not normal**, and not for taste.
 *
 * The project's one hard legibility rule is that a feature narrower than
 * `sepFar - sepNear` carries no unambiguous disparity and cannot be fused at
 * all. That budget is 18px at the defaults. Measured through the vendored face
 * at this size, the median stroke is 9px regular and 14px bold — so the regular
 * default produced a headline one-liner (`stst still --text HELLO`) that nobody
 * could see, and bold is a 56% improvement for free.
 *
 * **It is still not enough, and that should be said plainly here rather than
 * only in the README.** 14px is below the 18px budget, so `--text` at its
 * defaults is *less* illegible, not legible. What clears the budget at 90px is
 * `--font-weight 900` (19px), which the vendored face can honour because it
 * ships a real 900; before vendoring, `900` was a weight the rasteriser faked
 * and the browser ignored. Raising the size works too — bold reaches 19px at
 * 120px type.
 *
 * Why bold is the default rather than 900: bold is what an author means by
 * "heavy text", every face has one, and 900 at 90px is heavy enough to look
 * like a deliberate style choice rather than a readable default. The honest
 * summary is that no weight at 90px is comfortable, and the budget — not the
 * type — is the reason.
 */
export const TEXT_FONT_WEIGHT = 'bold'

/** Measure rendered text width. Injected so this module needs no canvas. */
export type MeasureText = (text: string, font: string) => number

/**
 * Build the one-layer scene behind `stst still --text HELLO`.
 *
 * **It supplies its own `at`, centred.** Design §3 defaults `at` to `[0, 0]`
 * for text layers and says so deliberately: an off-frame pose is written as
 * `-contentW` / `+sceneW`, which is only off-frame if the layer's own origin
 * is the top-left corner. (The two presets that computed those, `marquee` and
 * `slide-in`, are gone under §4.2b, but the convention they relied on is
 * load-bearing still, and its consumer is now on the production path:
 * `move`'s symbolic off-stage endpoints resolve to those same quantities, and
 * `raster.ts` applies the result to the `x`/`y` channel on top of the layer's
 * own `at` — so an origin that is *not* the top-left corner leaves a layer
 * `at`px short of off-frame rather than at it. P0b tokenised
 * `examples/scrolling-text.yaml`, so there is no hand-written scroll left in
 * the repo to carry the convention by example; that is why the reason is
 * recorded here rather than pointed at.) That default is right for scene
 * files and wrong for a one-shot still, which would render in the corner. So the
 * centring lives *here*, in the CLI — and `--at` still overrides it.
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
  const weight = args.fontWeight ?? TEXT_FONT_WEIGHT
  // **Assembled exactly the way `raster.ts` assembles it** — weight, then size,
  // then family, joined by single spaces — because the two strings have to
  // measure the same. They did not when the weight was added here and left out
  // of the measurement: bold is 2–4% wider than regular at the same size, so
  // the centring was off by half of that and the shrink-to-fit let an over-wide
  // string overflow. A fragile dependency made face-independent by construction
  // rather than by a tolerance.
  const fontOf = (size: number): string =>
    [weight, `${size}px`, TEXT_FONT_FAMILY].filter(Boolean).join(' ')

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
    weight,
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
