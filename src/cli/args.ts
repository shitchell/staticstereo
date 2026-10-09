/**
 * `stst` argument parsing. **Pure** — nothing here touches the filesystem, the
 * clock, or `process`, so the whole CLI surface is unit-testable without
 * writing a byte.
 *
 * Two rules shape most of what follows:
 *
 * - **An absent flag stays absent.** Every override lands in a `Partial`, never
 *   as a default, because a default injected here would silently overrule the
 *   scene file's own value — the opposite of "flags override the scene".
 * - **A flag that cannot work is an error, not a no-op.** `--fps` on `still`,
 *   `--crf` on a GIF, `--at` on a multi-layer scene: each one is a request the
 *   command cannot honour, and silently dropping it is how a user concludes the
 *   generator is broken.
 */
import { SIRDS_ALGORITHMS } from '../core/index.js'
import type { SirdsAlgorithm, StereoOpts } from '../core/index.js'

/**
 * A mistake in the command line itself, as opposed to a bad scene or a failed
 * render. Exits 2 so scripts can tell "you typed it wrong" from "it did not
 * work".
 */
export class UsageError extends Error {
  readonly exitCode = 2
  constructor(message: string) {
    super(message)
    this.name = 'UsageError'
  }
}

export const COMMANDS = ['render', 'still', 'preview'] as const
export type Command = (typeof COMMANDS)[number]

export const FORMATS = ['gif', 'mp4', 'png'] as const
export type Format = (typeof FORMATS)[number]

/** Lossy-capable ffmpeg knobs, passed straight through to `writeMp4`. */
export interface Mp4Overrides {
  qp?: number
  crf?: number
  pixFmt?: string
  ffmpegPath?: string
}

export interface CliArgs {
  command: Command
  /** Scene file path, when one was given positionally. */
  scene?: string
  /** `--text`: build a one-layer text scene instead of loading a file. */
  text?: string
  output?: string
  /** Dump the rasterised depth map here as a PNG. */
  depthMap?: string

  /* scene-level overrides — all absent unless the flag was given */
  fps?: number
  duration?: number
  freezeNoise?: boolean
  stereo: Partial<StereoOpts>

  /* placement and sampling */
  at?: [number, number]
  /** `still` only: which instant to sample, in seconds. */
  atTime?: number

  /* `--text` scene construction */
  size?: [number, number]
  fontSize?: number
  depth?: number

  mp4: Mp4Overrides
  /** `preview` only: hand the rendered file to the platform viewer. */
  open: boolean
  quiet: boolean
}

export type ParseResult =
  | { kind: 'run'; args: CliArgs }
  | { kind: 'help' }
  | { kind: 'version' }

export const HELP = `stst — Static on the Stereo: animated autostereogram generator

Usage:
  stst render <scene> -o out.{gif,mp4,png}   render every frame of a scene
  stst still  <scene> -o out.png             render one frame (scene midpoint)
  stst still  --text HELLO -o out.png        ...without writing a scene file
  stst preview <scene>                       render to a temp file and measure it

Scene source:
  <scene>                  a .yaml or .json scene file
  --text <string>          build a one-layer text scene instead
  --size <WxH>             scene size for --text (default 800x450)
  --font-size <px>         type size for --text (default 90, shrunk to fit)
  --depth <0..1>           layer depth for --text (default 1, nearest)
  --at <x,y>               place the layer; overrides the scene's own \`at\`

Output:
  -o, --output <path>      .gif, .mp4, or .png (a PNG sequence when animated)
  --depth-map <path.png>   also dump the depth map — a stereogram cannot be
                           debugged by eye, so this is how you tell an
                           authoring bug from an encoding one
  -q, --quiet              print nothing but errors

Timing (override the scene file):
  --fps <n>                frames per second
  --duration <seconds>     animation length
  --at-time <seconds>      which instant \`still\` samples (default: midpoint)

Stereo (override the scene file):
  --sep-far <px>           background repeat period (default 110)
  --sep-near <px>          nearest-surface repeat period (default 92)
  --noise-scale <n>        nearest-neighbour dot size (default 2)
  --depth-blur <px>        depth-edge softening (default 0, i.e. off)
  --seed <n>               dot-field seed
  --algorithm <name>       encoder: shift (default) or linked. shift copies
                           each pixel from sep px back, which smears a near
                           object's content to the right edge; linked is
                           Thimbleby-Inglis-Witten constrained pairs with
                           hidden-surface removal, which does not
  --cross / --no-cross     invert depth for cross-eyed viewing
  --freeze-noise           reuse one dot field for every frame
  --no-freeze-noise        re-randomise every frame (the default)

MP4 (lossless by default: -c:v libx264 -qp 0 -pix_fmt yuv444p):
  --qp <n> / --crf <n>     quantiser; anything but 0 is lossy and warns
  --pix-fmt <fmt>          pixel format; subsampled chroma is lossy and warns
  --ffmpeg <path>          ffmpeg binary (default: ffmpeg, on PATH)

Other:
  --open                   preview only: open the result in a viewer
  -h, --help / -V, --version
`

/** Map an output path's extension to an encoder. */
export function outputFormat(path: string): Format {
  const dot = path.lastIndexOf('.')
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (dot < 0 || dot < slash + 2) {
    throw new UsageError(
      `output path "${path}" has no extension, so there is nothing to pick an ` +
      `encoder from — use .gif, .mp4, or .png`,
    )
  }
  const ext = path.slice(dot + 1).toLowerCase()
  if ((FORMATS as readonly string[]).includes(ext)) return ext as Format
  throw new UsageError(
    `unsupported output extension ".${ext}" — use .gif, .mp4, or .png`,
  )
}

/* ------------------------------------------------------------------ parsing */

/**
 * Flags that take no value. `--help`/`--version` are deliberately absent: they
 * short-circuit inside the loop before this is consulted.
 */
const FLAGS = new Set([
  '--cross', '--no-cross', '--freeze-noise', '--no-freeze-noise',
  '--open', '--quiet', '-q',
])

/** Flags that take a value. `-o` is the one short alias worth having. */
const VALUED = new Set([
  '-o', '--output', '--text', '--depth-map', '--size', '--font-size', '--depth',
  '--at', '--at-time', '--fps', '--duration',
  '--sep-far', '--sep-near', '--noise-scale', '--depth-blur', '--seed',
  '--algorithm',
  '--qp', '--crf', '--pix-fmt', '--ffmpeg',
])

function num(flag: string, raw: string): number {
  const v = Number(raw)
  if (!Number.isFinite(v)) {
    throw new UsageError(`option "${flag}" expects a number, got "${raw}"`)
  }
  return v
}

/**
 * Parse an encoder name.
 *
 * Rejected here rather than left to `resolveStereo`, because a mistyped
 * `--algorithm linkd` is a command-line mistake and should exit 2 with the
 * valid names listed, not surface as a scene error.
 */
function algorithm(flag: string, raw: string): SirdsAlgorithm {
  if ((SIRDS_ALGORITHMS as readonly string[]).includes(raw)) return raw as SirdsAlgorithm
  throw new UsageError(
    `option "${flag}" expects one of: ${SIRDS_ALGORITHMS.join(', ')} — got "${raw}"`,
  )
}

/** Parse an `x,y` or `WxH` pair. */
function pair(flag: string, raw: string, shape: string): [number, number] {
  const parts = raw.split(/[,x]/)
  if (parts.length !== 2) {
    throw new UsageError(`option "${flag}" expects "${shape}", got "${raw}"`)
  }
  return [num(flag, parts[0]!), num(flag, parts[1]!)]
}

/**
 * Parse `process.argv.slice(2)`.
 *
 * @throws {UsageError} with a message naming the offending token.
 */
export function parseArgs(argv: readonly string[]): ParseResult {
  if (argv.length === 0) return { kind: 'help' }

  const args: CliArgs = {
    command: 'render',
    stereo: {},
    mp4: {},
    open: false,
    quiet: false,
  }

  let command: Command | undefined
  const positional: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!

    if (!token.startsWith('-')) {
      if (!command) {
        if (!(COMMANDS as readonly string[]).includes(token)) {
          throw new UsageError(
            `unknown command "${token}" — expected one of: ${COMMANDS.join(', ')}`,
          )
        }
        command = token as Command
      } else {
        positional.push(token)
      }
      continue
    }

    // --flag=value is one token; everything else takes the next one.
    const eq = token.indexOf('=')
    const flag = eq > 1 ? token.slice(0, eq) : token
    const inline = eq > 1 ? token.slice(eq + 1) : undefined

    // Answered mid-loop rather than by a pre-scan, so `stst render --help`
    // explains itself *and* `--text --help` stays a literal string: a pre-scan
    // cannot tell a flag from a flag's value.
    if (flag === '--help' || flag === '-h') return { kind: 'help' }
    if (flag === '--version' || flag === '-V') return { kind: 'version' }

    if (FLAGS.has(flag)) {
      if (inline !== undefined) {
        throw new UsageError(`option "${flag}" takes no value, got "${inline}"`)
      }
      switch (flag) {
        case '--cross': args.stereo.cross = true; break
        case '--no-cross': args.stereo.cross = false; break
        case '--freeze-noise': args.freezeNoise = true; break
        case '--no-freeze-noise': args.freezeNoise = false; break
        case '--open': args.open = true; break
        default: args.quiet = true; break   // --quiet / -q
      }
      continue
    }

    if (!VALUED.has(flag)) {
      throw new UsageError(`unknown option "${flag}" — see "stst --help"`)
    }

    const value = inline ?? argv[++i]
    if (value === undefined) {
      throw new UsageError(`option "${flag}" needs a value`)
    }

    switch (flag) {
      case '-o': case '--output': args.output = value; break
      case '--text': args.text = value; break
      case '--depth-map': args.depthMap = value; break
      case '--size': args.size = pair(flag, value, 'WxH'); break
      case '--at': args.at = pair(flag, value, 'x,y'); break
      case '--font-size': args.fontSize = num(flag, value); break
      case '--depth': args.depth = num(flag, value); break
      case '--at-time': args.atTime = num(flag, value); break
      case '--fps': args.fps = num(flag, value); break
      case '--duration': args.duration = num(flag, value); break
      case '--sep-far': args.stereo.sepFar = num(flag, value); break
      case '--sep-near': args.stereo.sepNear = num(flag, value); break
      case '--noise-scale': args.stereo.noiseScale = num(flag, value); break
      case '--depth-blur': args.stereo.depthBlur = num(flag, value); break
      case '--seed': args.stereo.seed = num(flag, value); break
      case '--algorithm': args.stereo.algorithm = algorithm(flag, value); break
      case '--qp': args.mp4.qp = num(flag, value); break
      case '--crf': args.mp4.crf = num(flag, value); break
      case '--pix-fmt': args.mp4.pixFmt = value; break
      default: args.mp4.ffmpegPath = value; break   // --ffmpeg
    }
  }

  if (!command) {
    throw new UsageError(
      `missing command — expected one of: ${COMMANDS.join(', ')}. See "stst --help".`,
    )
  }
  args.command = command
  args.scene = positional[0]
  if (positional.length > 1) {
    throw new UsageError(
      `unexpected argument "${positional[1]!}" — ${command} takes at most one scene file`,
    )
  }

  check(args)
  return { kind: 'run', args }
}

/**
 * Cross-flag coherence. Separate from the token loop because every rule here is
 * about a *combination*, and a rule nobody can see is a rule nobody obeys.
 */
function check(args: CliArgs): void {
  const { command } = args

  if (args.scene !== undefined && args.text !== undefined) {
    throw new UsageError(
      `pass either a scene file or --text, not both (got "${args.scene}" and --text)`,
    )
  }
  if (args.scene === undefined && args.text === undefined) {
    throw new UsageError(
      `${command} needs a scene source: either a scene file or --text. ` +
      `e.g. "stst ${command} scene.yaml${command === 'preview' ? '' : ' -o out.gif'}" ` +
      `or "stst still --text HELLO -o out.png"`,
    )
  }

  if (args.output === undefined) {
    if (command !== 'preview') {
      throw new UsageError(
        `${command} needs an output path: -o / --output ` +
        `(${command === 'still' ? 'out.png' : 'out.gif, out.mp4, or out.png'})`,
      )
    }
  } else {
    const format = outputFormat(args.output)
    if (command === 'still' && format !== 'png') {
      throw new UsageError(
        `stst still writes a single image, so its output must be a .png — ` +
        `got ".${format}". For an animation use "stst render".`,
      )
    }
    if (format !== 'mp4') {
      for (const flag of ['qp', 'crf', 'pixFmt', 'ffmpegPath'] as const) {
        if (args.mp4[flag] !== undefined) {
          throw new UsageError(
            `option "--${FLAG_OF[flag]}" only applies to MP4 output, but the ` +
            `output is a .${format}`,
          )
        }
      }
    }
  }

  if (args.atTime !== undefined && command !== 'still') {
    throw new UsageError(
      `option "--at-time" picks the single instant to sample, so it only ` +
      `applies to "stst still" — ${command} uses the scene's own timing`,
    )
  }
  if (args.fps !== undefined && command === 'still') {
    throw new UsageError(
      `option "--fps" has no effect on "stst still", which renders one frame; ` +
      `use --at-time to choose which, or "stst render" for a sequence`,
    )
  }
  if (args.open && command !== 'preview') {
    throw new UsageError(`option "--open" only applies to "stst preview"`)
  }
}

const FLAG_OF = { qp: 'qp', crf: 'crf', pixFmt: 'pix-fmt', ffmpegPath: 'ffmpeg' } as const
