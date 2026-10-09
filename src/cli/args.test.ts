import { describe, it, expect } from 'vitest'
import { HELP, UsageError, outputFormat, parseArgs } from './args.js'
import type { CliArgs } from './args.js'

/** `parseArgs` takes argv *after* node and the script, i.e. `process.argv.slice(2)`. */
function argv(line: string): string[] {
  return line.split(' ').filter(Boolean)
}

function parse(line: string | string[]): CliArgs {
  const r = parseArgs(typeof line === 'string' ? argv(line) : line)
  if (r.kind !== 'run') throw new Error(`expected a runnable parse, got "${r.kind}"`)
  return r.args
}

/** Assert the line is rejected as a usage error and hand back the message. */
function reject(line: string | string[]): string {
  try {
    parseArgs(typeof line === 'string' ? argv(line) : line)
  } catch (err) {
    expect(err).toBeInstanceOf(UsageError)
    return (err as Error).message
  }
  throw new Error(`expected "${String(line)}" to be rejected, but it parsed`)
}

const RENDER = 'render scene.yaml -o out.gif'

describe('parseArgs — commands', () => {
  it('shows help for no arguments at all', () => {
    expect(parseArgs([]).kind).toBe('help')
  })

  it('shows help for --help and -h', () => {
    expect(parseArgs(['--help']).kind).toBe('help')
    expect(parseArgs(['-h']).kind).toBe('help')
  })

  it('answers --help even when it follows a command', () => {
    expect(parseArgs(['render', 'scene.yaml', '--help']).kind).toBe('help')
  })

  it('does not mistake a flag *value* for --help', () => {
    // A pre-scan over argv cannot tell `--text --help` (a literal string) from
    // a request for help, and would print usage instead of rendering.
    const a = parse(['still', '--text', '--help', '-o', 'out.png'])
    expect(a.text).toBe('--help')
  })

  it('reports the version for --version and -V', () => {
    expect(parseArgs(['--version']).kind).toBe('version')
    expect(parseArgs(['-V']).kind).toBe('version')
  })

  it('accepts the three documented commands', () => {
    expect(parse(RENDER).command).toBe('render')
    expect(parse('still scene.yaml -o out.png').command).toBe('still')
    expect(parse('preview scene.yaml').command).toBe('preview')
  })

  it('names the valid commands when given an unknown one', () => {
    const msg = reject('rndr scene.yaml -o out.gif')
    expect(msg).toMatch(/unknown command "rndr"/)
    expect(msg).toMatch(/render/)
    expect(msg).toMatch(/still/)
    expect(msg).toMatch(/preview/)
  })

  it('rejects options with no command', () => {
    expect(reject('-o out.gif')).toMatch(/missing command/i)
  })

  it('rejects a second positional argument by name', () => {
    expect(reject('render a.yaml b.yaml -o out.gif')).toMatch(/unexpected argument "b\.yaml"/)
  })

  it('documents all three commands in the help text', () => {
    expect(HELP).toMatch(/stst render/)
    expect(HELP).toMatch(/stst still/)
    expect(HELP).toMatch(/stst preview/)
  })
})

describe('parseArgs — scene source', () => {
  it('takes a scene file positionally', () => {
    const a = parse(RENDER)
    expect(a.scene).toBe('scene.yaml')
    expect(a.text).toBeUndefined()
  })

  it('takes --text instead of a scene file', () => {
    const a = parse(['still', '--text', 'HELLO WORLD', '-o', 'out.png'])
    expect(a.text).toBe('HELLO WORLD')
    expect(a.scene).toBeUndefined()
  })

  it('refuses both a scene file and --text, naming the conflict', () => {
    const msg = reject('still scene.yaml --text HELLO -o out.png')
    expect(msg).toMatch(/--text/)
    expect(msg).toMatch(/scene file/)
  })

  it('refuses neither, and says how to supply one', () => {
    const msg = reject('render -o out.gif')
    expect(msg).toMatch(/scene file/)
    expect(msg).toMatch(/--text/)
  })
})

describe('parseArgs — output', () => {
  it('accepts -o and --output and --output=', () => {
    expect(parse('render scene.yaml -o out.gif').output).toBe('out.gif')
    expect(parse('render scene.yaml --output out.gif').output).toBe('out.gif')
    expect(parse('render scene.yaml --output=out.gif').output).toBe('out.gif')
  })

  it('requires an output path for render, naming the flag', () => {
    const msg = reject('render scene.yaml')
    expect(msg).toMatch(/-o/)
    expect(msg).toMatch(/output/i)
  })

  it('requires an output path for still', () => {
    expect(reject('still scene.yaml')).toMatch(/output/i)
  })

  it('does not require one for preview', () => {
    expect(parse('preview scene.yaml').output).toBeUndefined()
  })

  it('rejects a non-PNG output for still, since it writes one image', () => {
    const msg = reject('still scene.yaml -o out.gif')
    expect(msg).toMatch(/still/)
    expect(msg).toMatch(/\.png/)
  })
})

describe('outputFormat', () => {
  it('maps the three documented extensions', () => {
    expect(outputFormat('a/b/out.gif')).toBe('gif')
    expect(outputFormat('out.mp4')).toBe('mp4')
    expect(outputFormat('out.png')).toBe('png')
  })

  it('is case-insensitive', () => {
    expect(outputFormat('OUT.GIF')).toBe('gif')
  })

  it('names the supported extensions when given another', () => {
    let msg = ''
    try { outputFormat('out.webm') } catch (err) { msg = (err as Error).message }
    expect(msg).toMatch(/\.webm/)
    expect(msg).toMatch(/\.gif/)
    expect(msg).toMatch(/\.mp4/)
    expect(msg).toMatch(/\.png/)
  })

  it('rejects a path with no extension', () => {
    let msg = ''
    try { outputFormat('out') } catch (err) { msg = (err as Error).message }
    expect(msg).toMatch(/extension/)
  })
})

describe('parseArgs — stereo overrides', () => {
  it('collects every stereo flag', () => {
    const a = parse(
      `${RENDER} --sep-far 120 --sep-near 100 --noise-scale 3 --seed 9 --depth-blur 0 --cross`,
    )
    expect(a.stereo).toEqual({
      sepFar: 120, sepNear: 100, noiseScale: 3, seed: 9, depthBlur: 0, cross: true,
    })
  })

  it('leaves absent flags *absent*, so the scene file still decides', () => {
    // The whole point of `Partial<StereoOpts>`: a default injected here would
    // silently override the scene's own stereo block.
    expect(parse(RENDER).stereo).toEqual({})
  })

  it('accepts --no-cross as an explicit false', () => {
    expect(parse(`${RENDER} --no-cross`).stereo.cross).toBe(false)
  })

  it('accepts negative and fractional numbers', () => {
    const a = parse(`${RENDER} --seed -1 --depth-blur 1.5`)
    expect(a.stereo.seed).toBe(-1)
    expect(a.stereo.depthBlur).toBe(1.5)
  })

  it('keeps freezeNoise on the scene, not in stereo (it is a Scene field)', () => {
    const a = parse(`${RENDER} --freeze-noise`)
    expect(a.freezeNoise).toBe(true)
    expect(a.stereo).toEqual({})
    expect(parse(`${RENDER} --no-freeze-noise`).freezeNoise).toBe(false)
    expect(parse(RENDER).freezeNoise).toBeUndefined()
  })

  it('names the option and the bad value for a non-numeric argument', () => {
    const msg = reject(`${RENDER} --sep-far wide`)
    expect(msg).toMatch(/--sep-far/)
    expect(msg).toMatch(/"wide"/)
    expect(msg).toMatch(/number/)
  })

  it('names the option when its value is missing', () => {
    expect(reject(`${RENDER} --seed`)).toMatch(/--seed.*value/)
  })

  it('parses --algorithm, and leaves it absent when not given', () => {
    expect(parse(`${RENDER} --algorithm linked`).stereo.algorithm).toBe('linked')
    expect(parse(`${RENDER} --algorithm shift`).stereo.algorithm).toBe('shift')
    expect(parse(RENDER).stereo.algorithm).toBeUndefined()
  })

  // A mistyped encoder name has to be a usage error (exit 2) with the valid
  // names listed. Accepting it and falling back to the default is how a user
  // concludes the second encoder does nothing.
  it('rejects an unknown algorithm by name, listing the valid ones', () => {
    const msg = reject(`${RENDER} --algorithm linkd`)
    expect(msg).toMatch(/--algorithm/)
    expect(msg).toMatch(/"linkd"/)
    expect(msg).toMatch(/shift, linked/)
  })
})

describe('parseArgs — placement and timing', () => {
  it('parses --at as x,y', () => {
    expect(parse(`${RENDER} --at 40,50`).at).toEqual([40, 50])
    expect(parse(`${RENDER} --at -10,20`).at).toEqual([-10, 20])
  })

  it('explains the expected shape of --at', () => {
    const msg = reject(`${RENDER} --at 40`)
    expect(msg).toMatch(/--at/)
    expect(msg).toMatch(/x,y/)
  })

  it('parses --size as WxH or W,H', () => {
    expect(parse(`${RENDER} --size 800x450`).size).toEqual([800, 450])
    expect(parse(`${RENDER} --size 800,450`).size).toEqual([800, 450])
  })

  it('parses --fps and --duration as scene overrides', () => {
    const a = parse(`${RENDER} --fps 25 --duration 2`)
    expect(a.fps).toBe(25)
    expect(a.duration).toBe(2)
  })

  it('takes --at-time for still', () => {
    expect(parse('still scene.yaml -o out.png --at-time 1.5').atTime).toBe(1.5)
  })

  it('refuses --at-time for render, naming the command it belongs to', () => {
    const msg = reject(`${RENDER} --at-time 1.5`)
    expect(msg).toMatch(/--at-time/)
    expect(msg).toMatch(/still/)
  })

  it('refuses --fps for still, which renders one frame', () => {
    const msg = reject('still scene.yaml -o out.png --fps 25')
    expect(msg).toMatch(/--fps/)
    expect(msg).toMatch(/still/)
  })

  it('takes --font-size and --depth for a --text scene', () => {
    const a = parse(['still', '--text', 'HI', '-o', 'o.png', '--font-size', '120', '--depth', '0.6'])
    expect(a.fontSize).toBe(120)
    expect(a.depth).toBe(0.6)
  })
})

describe('parseArgs — mp4 passthrough', () => {
  it('collects the codec overrides', () => {
    const a = parse('render scene.yaml -o out.mp4 --crf 28 --pix-fmt yuv420p --ffmpeg /bin/ff')
    expect(a.mp4).toEqual({ crf: 28, pixFmt: 'yuv420p', ffmpegPath: '/bin/ff' })
  })

  it('leaves mp4 overrides empty by default, so the lossless default stands', () => {
    expect(parse('render scene.yaml -o out.mp4').mp4).toEqual({})
  })

  it('refuses codec flags when the output is not an MP4', () => {
    const msg = reject(`${RENDER} --crf 28`)
    expect(msg).toMatch(/--crf/)
    expect(msg).toMatch(/mp4/i)
  })
})

describe('parseArgs — misc', () => {
  it('names an unknown option', () => {
    const msg = reject(`${RENDER} --sepfar 120`)
    expect(msg).toMatch(/unknown option "--sepfar"/)
  })

  it('names an unknown short option', () => {
    expect(reject(`${RENDER} -x`)).toMatch(/unknown option "-x"/)
  })

  it('takes --quiet and -q', () => {
    expect(parse(`${RENDER} --quiet`).quiet).toBe(true)
    expect(parse(`${RENDER} -q`).quiet).toBe(true)
    expect(parse(RENDER).quiet).toBe(false)
  })

  it('takes --open for preview only', () => {
    expect(parse('preview scene.yaml --open').open).toBe(true)
    expect(parse('preview scene.yaml').open).toBe(false)
    expect(reject(`${RENDER} --open`)).toMatch(/--open.*preview/)
  })

  it('takes --depth-map on any command', () => {
    expect(parse(`${RENDER} --depth-map d.png`).depthMap).toBe('d.png')
    expect(parse('preview scene.yaml --depth-map d.png').depthMap).toBe('d.png')
  })
})
