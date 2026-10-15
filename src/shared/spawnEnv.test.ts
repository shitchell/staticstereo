import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CHILD_ENV } from './testing/spawnEnv.js'

/**
 * No test under `src/shared/` may hand a child process an inherited
 * environment.
 *
 * ## Why this is a guard and not a convention
 *
 * `main`'s CI was red for nine hours because `svelte-check` 4.7.6 picks its
 * output format from `process.env.CLAUDECODE` when `--output` is absent, and
 * the harnesses spawned it with `{...process.env}`. Every agent working on
 * this project got one format; the runner got the other. **No tier of the
 * system could have caught it by running the suite**, because the blindness
 * was in the thing all of them share. (Relayed via PM-SHARED-3; the
 * `svelte-check` half is not re-measured here and those harnesses are owned
 * elsewhere, fixed at `57f1e15`.)
 *
 * `testing/spawnEnv.ts` holds the constructed environment and the paired
 * control showing that none of the tools we spawn actually branches on the
 * variable. That file is the *reasoning*. This file is the *sensor*: §9's last
 * row is that a note is not a sensor, and a helper nobody is obliged to use is
 * a note. Nothing stops the next spawn being added with an inherited
 * environment except something that goes red when it is.
 *
 * ## Why a source census, and how it is kept from failing open
 *
 * There is no runtime hook — `spawnSync` is a direct import, and a test that
 * monkey-patched `node:child_process` would be asserting against its own
 * patch. So the instrument reads the sources. §9 records a grep census that
 * **missed 4 of 13 and said nothing**, so this one is built to fail closed in
 * three ways:
 *
 * 1. It asserts the file list is non-empty and names the files it found, so a
 *    walk that silently matched nothing is a failure rather than a pass.
 * 2. It counts spawn **call sites**, not mentions, and compares against
 *    `CHILD_ENV` mentions in the same file. A call site added without one
 *    moves the count.
 * 3. The test below plants a call site and shows the count moving, which is
 *    the §6.5a control: without it, "every file balances" is a null that a
 *    regex matching nothing would also produce.
 *
 * The cheapest way to satisfy this guard is to add `env: CHILD_ENV` to the new
 * spawn, which is also the correct fix — a guard whose lazy satisfying action
 * is the wrong one gets satisfied wrongly.
 */

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Anything in `node:child_process` that starts a process, as a **call** —
 * `name(`, not the bare word. These files discuss `spawnSync` and
 * `execFileSync` in prose constantly (the `execFileSync`-throws argument is
 * quoted in four of them), and a census that counted mentions would be
 * measuring the comments.
 */
const SPAWN_CALL = /\b(?:spawnSync|spawn|execFileSync|execFile|execSync|exec|fork)\s*\(|\bpromisify\s*\(\s*(?:execFile|exec|spawn)\b/g

/** Every `.test.ts` under `src/shared/`, recursively. */
function testFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, e.name)
    if (e.isDirectory()) out.push(...testFiles(path))
    else if (e.name.endsWith('.test.ts')) out.push(path)
  }
  return out.sort()
}

/**
 * Strip line and block comments before counting.
 *
 * Crude on purpose: it does not understand strings, so a `//` inside a string
 * literal would eat the rest of that line. That direction is safe — it can
 * only *hide* a call site, which makes the count too low and the guard
 * complain. It cannot invent one.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function callSites(source: string): number {
  return (code(source).match(SPAWN_CALL) ?? []).length
}

/**
 * This file, which the census must skip, and the only file it skips.
 *
 * Not a convenience. The control below plants `spawnSync('/usr/bin/true', [])`
 * inside a **string literal**, and `code()` deliberately does not parse
 * strings — the first run of this guard duly reported `spawnEnv.test.ts` as a
 * file with an unbalanced spawn, which is the instrument working and reading
 * its own control. Skipping by name rather than teaching the stripper about
 * strings keeps the stripper's one-directional safety property (it can hide a
 * call site, never invent one); teaching it to parse strings would be the
 * place a real spawn could go missing.
 *
 * The exclusion is asserted to be exactly this one file, so it cannot quietly
 * grow into the escape hatch that makes the census fail open.
 */
const CENSUS_SKIPS = ['spawnEnv.test.ts']

/**
 * `CHILD_ENV` mentions **outside the import statement**.
 *
 * The exclusion is the difference between a tight guard and one that fails
 * open, and it was found by the control below rather than by thinking about
 * it: counting the import as a mention gives every file one free unaccompanied
 * spawn, because `N` call sites would be satisfied by the import plus `N-1`
 * uses. A guard that tolerates exactly one of the thing it forbids is the
 * shape §9 keeps recording.
 */
function envMentions(source: string): number {
  return (code(source).replace(/^import\b.*$/gm, '').match(/\bCHILD_ENV\b/g) ?? []).length
}

describe('child processes started from src/shared/ get a constructed environment', () => {
  const files = testFiles(HERE)

  it('found test files to census at all, so a silent empty walk is not a pass', () => {
    // §9: "a check that cannot see reports fine." A roster that came back
    // empty — wrong directory, renamed suffix — would make every assertion
    // below vacuously true, and this is the only place that can say so.
    expect(files.length).toBeGreaterThan(10)
    expect(files.map(f => relative(HERE, f))).toContain('zip.test.ts')
    expect(files.map(f => relative(HERE, f))).toContain('containerRead.test.ts')
  })

  it('passes CHILD_ENV at every spawn call site, in every file that has one', () => {
    expect(CENSUS_SKIPS).toEqual(['spawnEnv.test.ts'])

    const spawning = files
      .map(f => ({ name: relative(HERE, f), source: readFileSync(f, 'utf8') }))
      .filter(f => !CENSUS_SKIPS.includes(f.name))
      .map(f => ({ name: f.name, sites: callSites(f.source), envs: envMentions(f.source) }))
      .filter(f => f.sites > 0)

    // The census must have found the spawning files we know exist. Written out
    // rather than derived: a list built from the same walk the assertion uses
    // would prove only that the derivation ran twice (§9).
    expect(spawning.map(f => f.name).sort()).toEqual([
      'container.test.ts', 'containerRead.test.ts', 'gifenc.test.ts',
      'zip.test.ts', 'zipRead.test.ts',
    ])

    // One `CHILD_ENV` per call site, at least. More is fine — a file may name
    // it in a helper's signature as well as at the call — fewer means a spawn
    // somewhere in that file is still taking whatever the harness had.
    for (const f of spawning) {
      expect(f.envs, `${f.name}: ${f.sites} spawn call sites, ${f.envs} CHILD_ENV mentions`)
        .toBeGreaterThanOrEqual(f.sites)
    }
  })

  it('counts a planted spawn, which is what makes the balance above mean anything', () => {
    // The control (§6.5a), both halves. The assertion above is a null —
    // "nothing is out of balance" — and a null is indistinguishable from a
    // regex that matches nothing. Plant one call site in a copy of a real
    // file's text and the same counter must move by exactly one, with no
    // matching `CHILD_ENV`, which is the shape the guard is meant to catch.
    const real = readFileSync(join(HERE, 'zip.test.ts'), 'utf8')
    const planted = `${real}\nconst _leak = spawnSync('/usr/bin/true', [])\n`
    expect(callSites(planted)).toBe(callSites(real) + 1)
    expect(envMentions(planted)).toBe(envMentions(real))

    // Stated as the **deficit moving**, not as the predicate flipping on this
    // particular file. A file carries one `CHILD_ENV` for the import plus one
    // per call site, so a real file has slack and planting one spawn into it
    // does not necessarily cross the line — asserting that it did would have
    // made this control depend on `zip.test.ts`'s current spawn count, which
    // is not the property. What must hold is that an unaccompanied spawn
    // always costs exactly one, wherever it lands.
    const deficit = (s: string): number => callSites(s) - envMentions(s)
    expect(deficit(planted)).toBe(deficit(real) + 1)

    // And the predicate itself flipping, on a file built to sit exactly at
    // the balance point — the shape the guard exists to reject.
    const balanced = "import { CHILD_ENV } from './testing/spawnEnv.js'\nspawnSync('a', [], { env: CHILD_ENV })\n"
    expect(envMentions(balanced)).toBeGreaterThanOrEqual(callSites(balanced))
    const leaking = `${balanced}spawnSync('b', [])\n`
    expect(envMentions(leaking)).toBeLessThan(callSites(leaking))

    // And the other direction: prose about `spawnSync` must not count, or the
    // census is measuring the comments rather than the code. These files argue
    // about `execFileSync` at length in four separate docblocks.
    const prose = '// spawnSync is better than execFileSync here\n/* execFile( in a block */\n'
    expect(callSites(prose)).toBe(0)
  })

  it('declares an environment that names every variable it passes', () => {
    // `CHILD_ENV` is the thing under discussion, so its shape is pinned rather
    // than left to whatever the helper happens to export. Written out, not
    // read from the module: changing the constant must be a deliberate edit in
    // two places, for the reason `container.test.ts` gives about the media
    // type — an expectation taken from the module's own value moves with it.
    expect(Object.keys(CHILD_ENV).sort()).toEqual(['LC_ALL', 'PATH', 'TMPDIR'])
    expect(CHILD_ENV['LC_ALL']).toBe('C')
    expect(CHILD_ENV['PATH']).toBe('/usr/bin:/bin')
    // `TMPDIR` is the one value that legitimately varies by machine, so it is
    // checked as a property rather than as a string.
    expect(CHILD_ENV['TMPDIR']).toBeTruthy()

    // Nothing from the harness leaked in. `CLAUDECODE` is the specific
    // variable that cost nine hours of red CI, so it is named; the general
    // claim is the key list above, which admits no fourth entry.
    expect(CHILD_ENV).not.toHaveProperty('CLAUDECODE')
  })
})
