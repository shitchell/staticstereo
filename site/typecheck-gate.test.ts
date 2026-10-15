import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}

/** The config `npm run typecheck` points at; the gate's real surface. */
const GATE_TSCONFIG = 'tsconfig.typecheck.json'

/**
 * The fixture's config, which includes only `typecheck-fixture/` — a
 * directory outside `tsconfig.typecheck.json`'s `["src", "site"]`, so the
 * deliberately-broken component in it cannot redden the gate. See
 * `typecheck-fixture/Mistyped.svelte` for why that separation is structural
 * rather than an exclusion.
 */
const FIXTURE_TSCONFIG = './typecheck-fixture/tsconfig.json'

/** The file the checker must name. Not a count, not an exit code alone. */
const FIXTURE_FILE = 'Mistyped.svelte'

/**
 * The project's own `typecheck` command, re-pointed at the fixture.
 *
 * Derived from `package.json` rather than spelled out here, because a
 * hand-written copy of the command would keep passing on the day somebody
 * changes the real one — which is precisely the regression this file exists
 * to catch. `tsc` cannot see inside a `.svelte` file at all (measured: it
 * does not appear in `tsc --listFilesOnly`), so a revert of the script to
 * `tsc -p …` makes this run report TS18003 "No inputs were found" instead of
 * the planted error, and the "names the fixture" assertion below goes red.
 */
function typecheckCommandAgainst(tsconfig: string): readonly string[] {
  const script = PKG.scripts.typecheck
  expect(script, 'package.json has no "typecheck" script').toBeTypeOf('string')
  // Split and substitute rather than run through a shell: the tokens are
  // handed straight to the process, so a script that grew `&&`, a pipe or a
  // redirect would be silently mangled instead of composed. Assert it has
  // none, so growing one is a red test and a deliberate decision — CI and
  // the phase gate both read `$?` from this one script name.
  expect(script, 'typecheck must stay a single command — see comment')
    .not.toMatch(/[&|;><]/)
  const tokens = script!.trim().split(/\s+/)
  const hits = tokens.filter(t => t.endsWith(GATE_TSCONFIG))
  expect(hits, `typecheck must name ${GATE_TSCONFIG} exactly once`).toHaveLength(1)
  return tokens.map(t => (t.endsWith(GATE_TSCONFIG) ? tsconfig : t))
}

function run(argv: readonly string[]): { status: number | null; output: string } {
  const [cmd, ...args] = argv
  // `node_modules/.bin` on PATH is what `npm run` itself does; going through
  // `npx` instead risks a network fetch for a package that is a committed
  // devDependency.
  const r = spawnSync(cmd!, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${join(ROOT, 'node_modules', '.bin')}:${process.env.PATH}` },
  })
  return { status: r.status, output: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('the typecheck gate can see inside a .svelte file', () => {
  // ~2.4s measured for the fixture's one-file config (the whole-tree gate run
  // is ~6.5s); the 5s default left no headroom on a loaded machine.
  it('reports the planted error in the fixture component, by name', () => {
    const { status, output } = run(typecheckCommandAgainst(FIXTURE_TSCONFIG))
    // Both halves matter. A non-zero exit alone is satisfied by a checker that
    // failed to find any input at all, and a checker that cannot be shown to
    // fail is a null measurement: with a `declare module '*.svelte'` ambient
    // shim, `tsc` exits 0 over this exact fixture without ever opening it.
    expect(status, `expected a non-zero exit\n${output}`).not.toBe(0)
    expect(output).toContain(FIXTURE_FILE)
  }, 60_000)

  it('is clean on the real surface, so the fixture is not leaking into it', () => {
    const { status, output } = run(typecheckCommandAgainst(`./${GATE_TSCONFIG}`))
    expect(status, output).toBe(0)
    expect(output).not.toContain(FIXTURE_FILE)
  }, 120_000)
})

describe('what the gate stops enforcing if `module` changes', () => {
  /**
   * `svelte-check` honours this repo's `moduleResolution`, `lib`, `strict` and
   * `noUncheckedIndexedAccess` — each proven with a planted violation — but it
   * substitutes its own ESM module kind for `module`. Measured: a config
   * identical to `tsconfig.typecheck.json` except `"module": "commonjs"` makes
   * `tsc` report 27 × TS1343 (`import.meta`) and 1 × TS1378 (top-level await),
   * and makes `svelte-check` report nothing at all.
   *
   * Under an ESM module kind that difference has an empty error set, which is
   * why replacing `tsc` with `svelte-check` lost no coverage here. Switching
   * `module` to a CommonJS kind would silently un-enforce it over `site/`,
   * which `npm run build`'s `tsconfig.json` does not cover. A note would not
   * catch that; this does.
   */
  it('keeps `module` on an ESM kind, which is the condition that made the swap safe', () => {
    const tsconfig = readFileSync(join(ROOT, 'tsconfig.json'), 'utf8')
    const module = /"module"\s*:\s*"([^"]+)"/.exec(tsconfig)?.[1]
    expect(module, 'tsconfig.json declares no `module`').toBeTypeOf('string')
    expect(['node16', 'nodenext', 'es2022', 'esnext']).toContain(module!.toLowerCase())
  })
})
