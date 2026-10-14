import {
  CHANNELS,
  CUBIC_BEZIER_SYNTAX,
  EASINGS,
  PRESETS,
  isEasing,
  resolveStereo,
  STEREO_KEYS,
} from '../src/core/index.js'
import type { AssertNever, Channel } from '../src/core/index.js'
import type { Anim, Key, Layer, MaskSource, Scene, StereoOpts, Track } from '../src/core/types.js'

/**
 * Validate an untrusted scene — one that arrived from `location.hash` or from
 * the page's own JSON editor.
 *
 * The governing rule is **be exactly as permissive as `core`, and no more.**
 *
 * - Where core already rejects a value with a good message (a non-integer
 *   `noiseScale`, `sepNear >= sepFar`), the check is *delegated* to core by
 *   calling `resolveStereo`. Re-implementing those bounds here would create two
 *   sources of truth that drift, and the drift is invisible: the site would
 *   start refusing scenes `stst` renders happily, or vice versa.
 * - Where core instead throws *late* — `compilePreset` on an unknown `kind`
 *   fails from inside the rasteriser, four frames deep, on the first render —
 *   the check is made here, up front, naming the field path.
 * - Where core only *clamps* (a `depth` outside 0..1), this validator says
 *   nothing. Being stricter than core would mean a scene the CLI accepts fails
 *   to load from a link, which is a worse failure than a clamp.
 *
 * Errors carry a field path (`layers[2].anim`) because the input is frequently
 * hand-written and the author needs to know *where*, not just *what*.
 */

const LAYER_TYPES = ['text', 'image', 'gif', 'shape'] as const
const MODES = ['silhouette', 'heightmap'] as const
const LOOPS = ['loop', 'once', 'pingpong'] as const
const REPEATS = ['once', 'loop', 'pingpong'] as const
/**
 * What may appear in a keyframe: every animatable channel plus `t`, the
 * keyframe's own time, which is not a `Transform` channel.
 *
 * Derived from `CHANNELS`, like the CLI's `KEY_CHANNELS`, rather than written
 * out: the list this validator used to carry had fallen behind and omitted
 * `rotateX`/`rotateY`. Spelling it out again here would re-create the drift
 * one layer down — now in the *rejection* path, where it would refuse a scene
 * the CLI and the rasteriser both handle.
 */
const KEY_CHANNELS = ['t', ...CHANNELS] as const
type KeyChannel = typeof KEY_CHANNELS[number]
// The guard, not the spread, is what keeps this honest: it fails the build if
// anyone writes the list out again, in either direction. Mirrors
// `src/cli/scene.ts`, which has carried this pair since `69b2f4a` while this
// file never had it. The asymmetry mattered: measured by replacing the spread
// above with the drifted list it used to be, `npm run typecheck` exited 0 and
// only `npm test` objected — so the one validator reachable from a shared link
// was the one where the drift could reach a reviewer's eyes last.
type _NoKeyChannelMissing = AssertNever<Exclude<Channel, KeyChannel>>
type _NoKeyChannelExtra = AssertNever<Exclude<KeyChannel, Channel | 't'>>


function fail(message: string): never {
  throw new Error(message)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function requireString(v: unknown, path: string): string {
  if (typeof v !== 'string' || v === '') fail(`${path} must be a non-empty string`)
  return v
}

function requireFinite(v: unknown, path: string): number {
  if (!finite(v)) fail(`${path} must be a finite number, got ${JSON.stringify(v)}`)
  return v
}

function requirePositive(v: unknown, path: string): number {
  const n = requireFinite(v, path)
  if (n <= 0) {
    // Design §4.1: fps: 0 and duration: 0 are rejected rather than honoured,
    // because honouring one while substituting a default for the other would
    // be two opposite readings of the same malformed input.
    fail(`${path} must be greater than 0, got ${n}`)
  }
  return n
}

function requireOneOf<T extends string>(
  v: unknown, allowed: readonly T[], path: string,
): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    fail(`${path} must be one of ${allowed.join(', ')}, got ${JSON.stringify(v)}`)
  }
  return v as T
}

function requirePair(v: unknown, path: string): [number, number] {
  if (!Array.isArray(v) || v.length !== 2 || !finite(v[0]) || !finite(v[1])) {
    fail(`${path} must be a pair of numbers [x, y], got ${JSON.stringify(v)}`)
  }
  return [v[0] as number, v[1] as number]
}

function requireSize(v: unknown): [number, number] {
  if (
    !Array.isArray(v) || v.length !== 2 ||
    !Number.isInteger(v[0]) || !Number.isInteger(v[1]) ||
    (v[0] as number) < 1 || (v[1] as number) < 1
  ) {
    fail(
      `scene.size must be a pair of positive whole pixel counts, got ` +
      `${JSON.stringify(v)}`,
    )
  }
  return [v[0] as number, v[1] as number]
}

function validateStereo(v: unknown): Partial<StereoOpts> {
  if (!isRecord(v)) fail(`scene.stereo must be an object, got ${JSON.stringify(v)}`)
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(v)) {
    if (!(STEREO_KEYS as readonly string[]).includes(key)) {
      fail(
        `scene.stereo has no setting "${key}" — valid: ` +
        `${STEREO_KEYS.join(', ')}`,
      )
    }
    const value = v[key]
    if (key === 'cross') {
      if (typeof value !== 'boolean') fail(`scene.stereo.cross must be true or false`)
    } else if (key === 'algorithm') {
      // Which names are valid is `resolveStereo`'s to say — it is called at
      // the end of validation, so a bad name is still rejected by load time.
      if (typeof value !== 'string') {
        fail(`scene.stereo.algorithm must be an encoder name, got ${JSON.stringify(value)}`)
      }
    } else {
      requireFinite(value, `scene.stereo.${key}`)
    }
    out[key] = value
  }
  return out as Partial<StereoOpts>
}

function validateMask(v: unknown, path: string): MaskSource {
  if (v === 'alpha') return 'alpha'
  if (isRecord(v) && finite(v['luma'])) return { luma: v['luma'] }
  fail(`${path} must be "alpha" or {luma: <number>}, got ${JSON.stringify(v)}`)
}

function validateKey(v: unknown, path: string): Key {
  if (!isRecord(v)) fail(`${path} must be an object, got ${JSON.stringify(v)}`)
  requireFinite(v['t'], `${path}.t`)
  // A misspelled channel is REJECTED, not dropped. The loop below copies what
  // it recognises, so without this check `rotatX: 5` would leave the scene
  // valid, the value gone and the layer still on screen rendering something
  // subtly wrong — while the CLI named the key and refused the same file. The
  // wording deliberately matches `unknownKeys()` in `src/cli/scene.ts`, down
  // to listing the valid keys sorted, so the two read as one product.
  //
  // Scoped to keyframes on purpose. Unknown-key parity for layers, tracks and
  // scene keys is a much larger job; half of it delivered quietly would teach
  // authors that the site catches typos and leave them wrong about where.
  for (const field of Object.keys(v)) {
    if (!(KEY_CHANNELS as readonly string[]).includes(field)) {
      fail(
        `unknown keyframe channel "${field}" at ${path} — valid keys: ` +
        `${[...KEY_CHANNELS].sort().join(', ')}`,
      )
    }
  }
  const key: Record<string, unknown> = { t: v['t'] }
  // Looping over `CHANNELS` rather than a list written out here, because this
  // validator **rebuilds** the key instead of checking it: anything the loop
  // does not copy is not rejected, it is silently discarded, and the layer
  // renders motionless on that channel with no error raised anywhere. The
  // inline list this replaces had missed `rotateX`/`rotateY` since they were
  // added, so a shared link animating a flip arrived as a still.
  for (const field of CHANNELS) {
    if (v[field] !== undefined) key[field] = requireFinite(v[field], `${path}.${field}`)
  }
  return key as Key
}

function validateTrack(v: Record<string, unknown>, path: string): Track {
  const keys = v['keys']
  if (!Array.isArray(keys) || keys.length === 0) {
    fail(`${path}.keys must be a non-empty array of keyframes`)
  }
  const track: Track = { keys: keys.map((k, i) => validateKey(k, `${path}.keys[${i}]`)) }
  if (v['ease'] !== undefined) {
    const ease = v['ease']
    // `isEasing`, not `ease in EASINGS`: the record holds the five named
    // curves and `Easing` is now wider than that. The message names the other
    // form too — a list of five curve names no longer describes what is
    // accepted, and without it an author is told that a valid
    // `cubic-bezier(...)` is invalid.
    if (!isEasing(ease)) {
      fail(
        `${path}.ease must be one of ${Object.keys(EASINGS).join(', ')}, or ` +
        `${CUBIC_BEZIER_SYNTAX}, got ${JSON.stringify(ease)}`,
      )
    }
    // No cast: `fail()` returns `never` and `isEasing` is a type predicate,
    // so `ease` is already `Easing` here. Spelling it out again would assert
    // what the guard proves, and would keep asserting it if the guard were
    // later weakened.
    track.ease = ease
  }
  if (v['repeat'] !== undefined) track.repeat = requireOneOf(v['repeat'], REPEATS, `${path}.repeat`)
  if (v['start'] !== undefined) track.start = requireFinite(v['start'], `${path}.start`)
  if (v['duration'] !== undefined) track.duration = requirePositive(v['duration'], `${path}.duration`)
  return track
}

function validateAnimOne(v: unknown, path: string): Track | Record<string, unknown> {
  if (!isRecord(v)) fail(`${path} must be an animator object, got ${JSON.stringify(v)}`)
  if ('keys' in v) return validateTrack(v, path)
  if ('kind' in v) {
    const kind = v['kind']
    // `Object.hasOwn`, **not** `kind in PRESETS`: `in` walks the prototype
    // chain, `PRESETS` is a plain object literal, and `'constructor' in PRESETS`
    // is `true`. So this validator accepted `anim: {kind: "constructor"}` from a
    // hash and handed it on, where `compilePreset`'s own guard was bypassed the
    // same way and returned a non-`Track` with nothing thrown — a shared link
    // that renders a still and explains nothing. Same defect, same fix, as
    // `parseFit` in `site/fit.ts`, which records the reasoning at length.
    if (typeof kind !== 'string' || !Object.hasOwn(PRESETS, kind)) {
      // core's `compilePreset` produces this message too, but only once a frame
      // is actually rendered — from inside the rasteriser, with no field path.
      // Catching it here is the difference between "layers[1].anim: unknown
      // animation preset" and a stack trace on first paint.
      fail(
        `${path}: unknown animation preset ${JSON.stringify(kind)} — valid kinds: ` +
        `${Object.keys(PRESETS).sort().join(', ')}`,
      )
    }
    // Preset params are checked by the preset itself (core's readers reject
    // garbage rather than falling back), and the registry is open, so copying
    // the bag through is correct: a per-preset schema here would have to be
    // kept in step with every new preset.
    return { ...v }
  }
  fail(
    `${path} must be either a preset ({kind: "move", ...}) or a keyframe ` +
    `track ({keys: [...]}), got ${JSON.stringify(v)}`,
  )
}

function validateAnim(v: unknown, path: string): Anim {
  if (Array.isArray(v)) {
    return v.map((a, i) => validateAnimOne(a, `${path}[${i}]`)) as Anim
  }
  return validateAnimOne(v, path) as Anim
}

function validateLayer(v: unknown, path: string): Layer {
  if (!isRecord(v)) fail(`${path} must be an object, got ${JSON.stringify(v)}`)

  const type = v['type']
  if (type === 'draw') {
    // Design §9.5: this is an open design question, not a missing loader. Say
    // so, so that nobody reports it as a bug or "fixes" it with a dynamic
    // import that cannot work in a static bundle.
    fail(
      `${path}: layer type "draw" is not supported. It names a module path, and ` +
      `resolving one inside a static bundle is not possible — there is no ` +
      `filesystem and no bundler entry for it. The loader seam is an open design ` +
      `question (design §9.5), not an oversight.`,
    )
  }
  const kind = requireOneOf(type, LAYER_TYPES, `${path}.type`)

  // **This is the silent drop.** Everything below copies field by field, so a
  // key this function does not name — `rotatX`, `apacity`, a field from a
  // newer scene format — is not rejected, it simply does not survive the
  // rebuild, and the scene loads looking almost right. The CLI refuses the
  // same file by name (`unknownKeys()` in `src/cli/scene.ts`).
  //
  // That asymmetry is deliberate and the reasoning is recorded in full on the
  // unknown-channel check in `validateKey` above: unknown-key parity was
  // delivered for **keyframe channels only**, because half of it delivered
  // quietly would teach authors that the site catches typos and leave them
  // wrong about where. Read that note before widening or narrowing this.
  const base: Record<string, unknown> = { type: kind }
  // Identity first, and copied rather than invented (design §4.1). On this
  // side the hash *is* the scene: a field this rebuild forgets is not ignored,
  // it is destroyed on every round trip through the URL, and a lost `id`
  // orphans every reference to the layer with no other copy to restore from.
  // Minting one here would be the opposite failure — a legacy link would come
  // back with an id it never had, so assignment stays with the editor's
  // mutation path.
  if (v['id'] !== undefined) base['id'] = requireString(v['id'], `${path}.id`)
  if (v['name'] !== undefined) base['name'] = requireString(v['name'], `${path}.name`)
  if (v['depth'] !== undefined) base['depth'] = requireFinite(v['depth'], `${path}.depth`)
  if (v['at'] !== undefined) base['at'] = requirePair(v['at'], `${path}.at`)
  if (v['anim'] !== undefined) base['anim'] = validateAnim(v['anim'], `${path}.anim`)

  switch (kind) {
    case 'text': {
      if (typeof v['text'] !== 'string') {
        fail(`${path}.text must be a string, got ${JSON.stringify(v['text'])}`)
      }
      base['text'] = v['text']
      if (v['size'] !== undefined) base['size'] = requirePositive(v['size'], `${path}.size`)
      if (v['font'] !== undefined) base['font'] = requireString(v['font'], `${path}.font`)
      if (v['weight'] !== undefined) base['weight'] = requireString(v['weight'], `${path}.weight`)
      break
    }
    case 'image':
    case 'gif': {
      base['src'] = requireString(v['src'], `${path}.src`)
      if (v['mode'] !== undefined) base['mode'] = requireOneOf(v['mode'], MODES, `${path}.mode`)
      if (v['mask'] !== undefined) base['mask'] = validateMask(v['mask'], `${path}.mask`)
      if (kind === 'gif' && v['loop'] !== undefined) {
        base['loop'] = requireOneOf(v['loop'], LOOPS, `${path}.loop`)
      }
      break
    }
    case 'shape': {
      const shape = requireOneOf(v['shape'], ['circle', 'rect'] as const, `${path}.shape`)
      base['shape'] = shape
      if (shape === 'circle') {
        base['r'] = requirePositive(v['r'], `${path}.r`)
        // Wedge bounds in degrees, for a pie slice (pacman). Both or neither:
        // core throws on one alone, and since this builder copies field by
        // field, omitting them here would SILENTLY DROP a wedge rather than
        // reject it — the scene would render a full disc and look like the
        // renderer ignoring the file.
        if (v['start'] !== undefined || v['end'] !== undefined) {
          base['start'] = requireFinite(v['start'], `${path}.start`)
          base['end'] = requireFinite(v['end'], `${path}.end`)
        }
      } else {
        base['w'] = requirePositive(v['w'], `${path}.w`)
        base['h'] = requirePositive(v['h'], `${path}.h`)
      }
      break
    }
  }

  return base as unknown as Layer
}

/**
 * Turn an untrusted value into a `Scene`, or throw with a field path.
 *
 * The result is a fresh object built field by field — never the input, and
 * never a shallow spread of it. Two reasons: an unknown top-level key is
 * dropped rather than carried into the render, and nothing the page later
 * mutates can write back into a value that may still be referenced by whatever
 * decoded it.
 */
export function validateScene(value: unknown): Scene {
  if (!isRecord(value)) {
    fail(`a scene must be a JSON object, got ${JSON.stringify(value)}`)
  }

  const scene: Scene = {
    size: requireSize(value['size']),
    layers: [],
  }

  if (value['fps'] !== undefined) scene.fps = requirePositive(value['fps'], 'scene.fps')
  if (value['duration'] !== undefined) {
    scene.duration = requirePositive(value['duration'], 'scene.duration')
  }
  if (value['freezeNoise'] !== undefined) {
    if (typeof value['freezeNoise'] !== 'boolean') {
      fail(`scene.freezeNoise must be true or false, got ${JSON.stringify(value['freezeNoise'])}`)
    }
    scene.freezeNoise = value['freezeNoise']
  }
  if (value['stereo'] !== undefined) scene.stereo = validateStereo(value['stereo'])

  const layers = value['layers']
  if (!Array.isArray(layers)) {
    fail(`scene.layers must be an array, got ${JSON.stringify(layers)}`)
  }
  scene.layers = layers.map((l, i) => validateLayer(l, `layers[${i}]`))

  // Delegated, not duplicated: this is what rejects sepNear >= sepFar, a
  // fractional noiseScale and a negative depthBlur, with core's own wording.
  resolveStereo(scene)

  return scene
}
