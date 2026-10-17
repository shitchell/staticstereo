import { beforeAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { EXTERNALIZED_PHRASE, externalizedImportGuard } from './buildguard.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * The rot canary for `site/buildguard.ts`, and the §6.5a paired control for it.
 *
 * ## Why every assertion here runs a real `vite build`
 *
 * The guard's entire contract is **the English prose of a dependency's warning
 * message**: vite carries the importer nowhere else — `id`, `ids`, `importer`,
 * `exporter`, `loc` and `frame` are all `undefined` for this warning — so the
 * guard regexes an absolute path out of a sentence. A unit test against a
 * hand-written warning object would therefore assert that the guard agrees with
 * *what we believed vite emits*, which is two hand-written lists cross-checked
 * against each other and is a defect already recorded on this phase. It would
 * stay green through the exact upgrade it exists to catch.
 *
 * So the fixture is a real tree and the subject is a real `vite build`, run with
 * **the repository's real `vite.site.config.ts` and `vite.player.config.ts`**,
 * copied in unmodified. That is deliberate and is the second thing this file
 * buys: deleting `onwarn` from either config reddens this, which reading the
 * config can never do.
 *
 * ## The fixture is a scratch tree, never this repository
 *
 * Planting into the real `site/main.ts` and reverting in a `finally` was the
 * obvious shape and is rejected: a test run killed between the two leaves the
 * plant on disk, and the next measurement silently builds on it. This phase has
 * already lost one measurement that way. A `mkdtemp` tree with `node_modules`
 * symlinked costs about a second per build and cannot do that.
 *
 * The fixture's sources are minimal rather than a copy of `site/` — the subject
 * is the guard, not the application, and a canary that fails because somebody
 * broke `main.ts` is a canary nobody will trust. It *must* nonetheless live
 * under the scratch root's `site/` and `src/`, because importer scope is the
 * whole mechanism: a fixture anywhere else would be read as third-party, pass
 * through, and exit 0 — a canary that is green for the wrong reason.
 *
 * ## Runtime
 *
 * Measured ~1.1s per build, seven builds, so roughly 8s added to a ~53s suite.
 * It runs in the default suite; it is not worth a separate gate at that price,
 * and a canary that runs somewhere other than where everyone looks is most of
 * the way to not existing.
 */

/** Grep the token, never the planted content: prose about `node:os` is everywhere. */
const MARKER = 'ZZGUARDCANARY'

const VITE_BIN = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')

interface Build { status: number | null; output: string }

/**
 * A scratch project: the real configs and the real guard, a `src/` so the
 * guard's root self-check is satisfied, and whatever entries a test writes.
 */
function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'stst-buildguard-'))
  mkdirSync(join(dir, 'site'))
  mkdirSync(join(dir, 'src'))
  /**
   * A real directory of per-package symlinks, **not one symlink to
   * `node_modules` itself.** Resolution must find the same vite, the same
   * svelte plugin and the same `@napi-rs/canvas` this repo pins, so the links
   * are necessary — but `@sveltejs/vite-plugin-svelte` writes
   * `node_modules/.vite/_svelte_metadata.json` relative to the project it is
   * building, and through a whole-tree symlink that lands in **this
   * repository's** `node_modules`. Measured: a fixture build rewrote it where a
   * real `npm run build:page` did not. Harmless as far as anything here can
   * tell, and still a test reaching outside its scratch tree to mutate shared
   * state, which is not a property worth having to re-reason about later.
   * Per-package links keep `.vite` inside the fixture.
   */
  const modules = join(dir, 'node_modules')
  mkdirSync(modules)
  for (const pkg of readdirSync(join(ROOT, 'node_modules'))) {
    if (pkg === '.vite') continue
    symlinkSync(join(ROOT, 'node_modules', pkg), join(modules, pkg))
  }
  for (const f of ['package.json', 'vite.site.config.ts', 'vite.player.config.ts']) {
    writeFileSync(join(dir, f), readFileSync(join(ROOT, f)))
  }
  writeFileSync(join(dir, 'site', 'buildguard.ts'), readFileSync(join(ROOT, 'site', 'buildguard.ts')))
  writeFileSync(join(dir, 'src', 'placeholder.ts'), `export const ${MARKER} = 1\n`)
  return dir
}

function entry(dir: string, name: 'main' | 'player', body: string): void {
  const html = name === 'main' ? 'index.html' : 'player.html'
  writeFileSync(
    join(dir, 'site', html),
    `<!doctype html><html><body><script type="module" src="./${name}.ts"></script></body></html>\n`,
  )
  writeFileSync(join(dir, 'site', `${name}.ts`), body)
}

/**
 * `NODE_ENV` is pinned, and that is not hygiene — it decides whether there is
 * anything to measure at all.
 *
 * **Measured, and it cost an afternoon:** vite only externalizes a node builtin
 * — and so only emits the warning this entire guard reads — when
 * `process.env.NODE_ENV` is `production` or unset. Set it to anything else and
 * the identical plant builds at **exit 0 with no warning of any kind**, because
 * vite substitutes a throwing `Proxy` instead of the empty object and does it
 * silently. **Vitest sets `NODE_ENV=test` in its own process**, so a spawn that
 * inherited the environment measured a vite that never warns, and every row
 * below was red for a reason that had nothing to do with the guard.
 *
 * That is this repository's recorded lesson arriving through the front door:
 * "an inherited environment is a large, unenumerated, unversioned input to
 * every child process, and no test that uses one can state what it actually
 * ran" (`src/shared/testing/spawnEnv.ts`). Here it would have been worse than
 * usual — had any row asserted exit **0**, it would have passed in CI, passed
 * locally, and been measuring a vite with the sensor switched off.
 *
 * Inherited rather than constructed, because unlike `src/shared/`'s spawns this
 * one needs a working toolchain environment and no minimal set has been
 * measured sufficient for vite and esbuild. The one variable measured to change
 * the outcome is overridden explicitly, and the "dependency importer" row below
 * is the live sentinel for the rest: it asserts an externalization warning was
 * actually produced, so an environment in which vite stops warning reddens that
 * row instead of quietly making every other row vacuous.
 */
function build(dir: string, config: 'site' | 'player', nodeEnv = 'production'): Build {
  const r = spawnSync(process.execPath, [VITE_BIN, 'build', '--config', `vite.${config}.config.ts`], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: nodeEnv },
  })
  return { status: r.status, output: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/** Both entries always exist, so a config under test never fails for a missing file. */
function clean(dir: string): void {
  entry(dir, 'main', `export const ${MARKER}_main = 1\n`)
  entry(dir, 'player', `export const ${MARKER}_player = 1\n`)
}

describe('the externalized-import guard, measured by real builds', () => {
  let dir = ''
  beforeAll(() => {
    dir = fixture()
    return () => rmSync(dir, { recursive: true, force: true })
  })

  it('is silent on a clean fixture, so every red below is the plant and not the harness', () => {
    // The null half of the paired control, and it runs first on purpose. Without
    // it, "the build exits 1" is also satisfied by a fixture that never built.
    clean(dir)
    const site = build(dir, 'site')
    expect(site.status, site.output).toBe(0)
    const player = build(dir, 'player')
    expect(player.status, player.output).toBe(0)
  }, 60_000)

  it('fails the SITE build on a default node import, which builds clean without it', () => {
    // The headline. `import os from 'node:os'` + a top-level use so nothing is
    // tree-shaken: measured at exit 0 before this guard existed, with the value
    // live in `dist-site/assets/index-*.js` and NO `node:os` anywhere in the
    // output — vite inlines an empty module, so there is nothing for
    // `site/dist.test.ts` to find. This is the only sensor that sees it.
    clean(dir)
    entry(dir, 'main', `import m from 'node:os'\n;(globalThis as Record<string, unknown>).${MARKER} = Object.keys(m).length\n`)
    const { status, output } = build(dir, 'site')
    expect(status, output).toBe(1)
    expect(output).toContain('externalizedImportGuard')
    // Named, not just non-zero: a build that died for any other reason also
    // exits 1, and the importer is the thing the regex had to recover.
    expect(output).toContain('node:os')
    expect(output).toContain(join(dir, 'site', 'main.ts'))
  }, 60_000)

  it('fails the PLAYER build on the same import — it is embedded in pages we never see', () => {
    // Measured to behave identically to the site on every form tried. The player
    // is the half a stranger puts in an `<iframe src>` (R14), so an unguarded
    // player config would be the one shipping an empty object.
    clean(dir)
    entry(dir, 'player', `import m from 'node:os'\n;(globalThis as Record<string, unknown>).${MARKER} = Object.keys(m).length\n`)
    const { status, output } = build(dir, 'player')
    expect(status, output).toBe(1)
    expect(output).toContain('externalizedImportGuard')
    expect(output).toContain(join(dir, 'site', 'player.ts'))
  }, 60_000)

  it('fails on a BARE specifier too, which is how node_modules spells it and how `fs` is spelled', () => {
    // Clause (c), and the trap it exists for: the `node_modules` warnings that
    // must NOT fail name `os`, `path`, `util`, `fs`, `stream`, `url`, `https`,
    // `http`, `child_process` — all unprefixed. Anyone scoping this guard from
    // the phrase "node: builtin" writes a matcher that misses every one of them,
    // and misses a first-party `import fs from 'fs'` as well. The guard reads no
    // specifier pattern at all, which is why this passes for free; the row is
    // here so that adding one later is a red test.
    clean(dir)
    entry(dir, 'main', `import m from 'os'\n;(globalThis as Record<string, unknown>).${MARKER} = Object.keys(m).length\n`)
    const { status, output } = build(dir, 'site')
    expect(status, output).toBe(1)
    expect(output).toContain('externalizedImportGuard')
  }, 60_000)

  it('does NOT fail when a dependency is the importer — the warning is real and not ours', () => {
    // Hazard 2, constructed rather than derived. `@napi-rs/canvas` is already a
    // direct dependency and `geometry.js` imports `util`; the warning is
    // identical in code, plugin and shape to a real offender's, and the importer
    // is the ONLY thing that separates them. A guard keyed on the specifier
    // reddens the build over somebody else's dependency.
    clean(dir)
    entry(dir, 'main', `import '@napi-rs/canvas/geometry.js'\nexport const ${MARKER} = 1\n`)
    const { status, output } = build(dir, 'site')
    expect(status, output).toBe(0)
    // ...and it was genuinely externalized, so this row is not vacuous: without
    // this, a day on which @napi-rs stops importing `util` turns the assertion
    // above into "a clean build exits 0", which proves nothing about scoping.
    expect(output, 'no module was externalized at all, so this control is vacuous')
      .toContain(EXTERNALIZED_PHRASE)
  }, 60_000)

  it('STILL fails on a nonexistent package — the guard must not eat vite\'s own errors', () => {
    /**
     * Hazard 1, and the reason clause (b) is non-negotiable. Vite does:
     *
     * ```js
     * if (userOnWarn) { userOnWarn(warning, viteWarn) } else { viteWarn(warning) }
     * ```
     *
     * and its warning filtering *and* its `UNRESOLVED_IMPORT` → throw both live
     * inside `viteWarn` — the `defaultHandler` argument. Measured both ways with
     * this exact plant: forwarding exits 1, swallowing exits **0 and ships the
     * phantom package as a bare import** (seen in `dist-site/assets/index-*.js`).
     * So the cheapest wrong action on this guard is not deleting it — it is
     * writing it the way one writes a handler first, `if (matches) throw; return`,
     * which closes the node-builtin hole and silently opens a
     * missing-dependency one behind a green gate.
     */
    clean(dir)
    entry(dir, 'main', `import m from '${MARKER.toLowerCase()}-no-such-package'\nexport const x = m\n`)
    const { status, output } = build(dir, 'site')
    expect(status, output).toBe(1)
    // Vite's error, NOT the guard's. If this ever reads `externalizedImportGuard`
    // the guard has started answering for a warning that is not its business.
    expect(output).toContain('failed to resolve import')
    expect(output, 'the guard answered for an unresolved import, which is vite\'s job')
      .not.toContain('externalizedImportGuard')
  }, 60_000)

  it('is BLIND outside a production build, and that boundary is pinned rather than discovered', () => {
    /**
     * The guard's limit, written down because it was found by accident and the
     * next person should not have to find it the same way.
     *
     * With `NODE_ENV` set to anything but `production`, vite does not externalize
     * the builtin and emits **no warning at all** — so `onwarn` never fires and
     * this guard cannot see a thing. The plant builds at exit 0.
     *
     * What makes that acceptable rather than a hole is the other half, asserted
     * here: in that mode vite substitutes a **throwing `Proxy`**, not the empty
     * object. So the dangerous artifact and the sensor appear together — the
     * silent `{}` that this guard exists to catch is produced *only* in the mode
     * where the warning is also produced. Outside it the failure is loud at
     * runtime instead of silent, which needs no build-time guard.
     *
     * `npm run build:site` is unaffected: `vite build` is production by default
     * and CI sets no `NODE_ENV`. A developer with `NODE_ENV=development`
     * exported in their shell gets a build this guard does not police — hence
     * this row, so that a vite change which made dev mode emit `{}` as well
     * would redden here instead of silently reopening the hole.
     */
    clean(dir)
    entry(dir, 'main', `import m from 'node:os'\n;(globalThis as Record<string, unknown>).${MARKER} = Object.keys(m).length\n`)
    const { status, output } = build(dir, 'site', 'development')
    expect(status, output).toBe(0)
    expect(output, 'vite warned in development mode after all — the guard could now cover it')
      .not.toContain(EXTERNALIZED_PHRASE)
    // The compensating property. If this stops holding, the silent-{} hole has
    // reopened in a mode nothing watches.
    const bundle = readdirSync(join(dir, 'dist-site', 'assets'))
      .filter(f => f.endsWith('.js'))
      .map(f => readFileSync(join(dir, 'dist-site', 'assets', f), 'utf8'))
      .join('\n')
    expect(bundle, 'the non-production build no longer emits a throwing stub for node:os')
      .toContain('Cannot access "node:os')
  }, 60_000)

  it('forwards the warnings vite suppresses, which a Svelte component makes 32 of', () => {
    /**
     * Hazard 3, and the measurement that makes it urgent rather than theoretical.
     *
     * A user `onwarn` receives warnings vite deliberately filters out —
     * `CIRCULAR_DEPENDENCY` and `THIS_IS_UNDEFINED` are on its `warningIgnoreList`,
     * and the filtering lives inside `defaultHandler`. On the repository's tree
     * **as it is today** the guard sees exactly **zero** warnings on either
     * entry, so a clean build establishes nothing about what it does with one.
     *
     * The instant a `.svelte` file enters the graph — which is the whole point of
     * this phase — that number goes to **32**, every one of them a
     * `CIRCULAR_DEPENDENCY` inside `node_modules/svelte/src/internal/client/`.
     * Measured by instrumenting the handler and importing `site/SvelteSmoke.svelte`
     * from `site/main.ts`: 32 warnings, build exit 0. A handler that threw on
     * anything it did not recognise would therefore pass every test written
     * against today's tree and break on the phase's first component.
     */
    clean(dir)
    writeFileSync(
      join(dir, 'site', `${MARKER}.svelte`),
      '<script lang="ts">let n: number = 1</script>\n<p>{n}</p>\n',
    )
    entry(dir, 'main', `import C from './${MARKER}.svelte'\n;(globalThis as Record<string, unknown>).${MARKER} = C\n`)
    const { status, output } = build(dir, 'site')
    expect(status, output).toBe(0)
  }, 60_000)
})

describe('what the guard does when it can no longer read vite', () => {
  /**
   * CONDITION A. These two rows are the only ones in this file that call the
   * handler directly, and the fixture they use is **extracted from a real
   * build's output above** rather than written here — that is the difference
   * between a control and a self-fulfilling one.
   *
   * The property: a warning that carries {@link EXTERNALIZED_PHRASE} but whose
   * importer cannot be recovered is an **error**, never a pass-through. The
   * failure mode that matters for a regex over English prose is not a false
   * positive — it is the matcher silently ceasing to match, and a guard that has
   * gone quiet is indistinguishable from a clean build.
   */
  let real = ''
  beforeAll(() => {
    const dir = fixture()
    try {
      clean(dir)
      entry(dir, 'main', `import '@napi-rs/canvas/geometry.js'\nexport const ${MARKER} = 1\n`)
      const { output } = build(dir, 'site')
      real = /Module "[^"]+" has been externalized[^\n]*/.exec(output)?.[0] ?? ''
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  /**
   * Shared by the three attribution rows, so every arm in every one of them is
   * the **same real sentence** with **one clause** varied. A per-test helper
   * would let one row's substitution rot while the others kept passing.
   */
  const withImporter = (path: string): string => {
    const swapped = real.replace(/imported by "[^"]+"/, `imported by "${path}"`)
    expect(swapped, `the importer clause was not substituted for ${path}, so this arm is vacuous`)
      .not.toBe(real)
    return swapped
  }

  /**
   * Call the handler and record what it did. Note what is NOT here: the
   * message is built by the caller, outside the `try`, so a failing
   * non-vacuity assertion escapes as a test failure instead of being caught
   * and read as the throw the arm was testing for.
   */
  const run = (message: string): { threw: boolean; forwarded: boolean; why: string } => {
    let forwarded = false
    let error: unknown
    try {
      externalizedImportGuard(ROOT)({ message }, () => { forwarded = true })
    } catch (e) {
      error = e
    }
    return { threw: error !== undefined, forwarded, why: error instanceof Error ? error.message : '' }
  }

  const outcome = ({ threw, forwarded }: { threw: boolean; forwarded: boolean }) => ({ threw, forwarded })
  const THREW = { threw: true, forwarded: false }
  const FORWARDED = { threw: false, forwarded: true }

  it('captured a real externalized-module message, so the two rows below are not fiction', () => {
    expect(real, 'no externalized-module warning was captured from a real build').not.toBe('')
    expect(real).toContain(EXTERNALIZED_PHRASE)
    expect(real).toMatch(/imported by "/)
  })

  it('errors when the importer cannot be read out of the message', () => {
    // The real sentence with only its `imported by` clause removed — i.e. exactly
    // what a vite reword that dropped or renamed that clause would hand us.
    const reworded = real.replace(/, imported by "[^"]+"/, '')
    expect(reworded, 'the clause was not removed, so this asserts nothing').not.toBe(real)
    expect(() => externalizedImportGuard(ROOT)({ message: reworded }, () => {
      throw new Error('passed through to defaultHandler instead of failing closed')
    })).toThrow(/could not be read out of vite's message/)
  })

  it('fails closed on an importer it cannot PLACE, not only on one it cannot READ', () => {
    /**
     * The other half of "vite reworded the sentence", and the half the first
     * version of this guard did not cover. The row above varies the *clause
     * structure*; this one varies the **path form**, which is the same reword
     * arriving through a different field.
     *
     * The hole it pins: containment (`startsWith(join(root, dir) + sep)`) is a
     * question about an **absolute** path and answers `false` for every
     * relative one. A `false` there used to mean *"not ours — forward it"*, so
     * a vite that spelled the importer relative to the project root would route
     * every first-party offender down the third-party path and the guard would
     * report nothing. **Fail-open, in the exact direction this file exists to
     * prevent: UNDECIDABLE is not THEIRS.**
     *
     * All four arms run in **one invocation** off **one** substitution helper,
     * so a harness that silently stopped substituting cannot let an arm pass by
     * accident — it breaks every arm at once. Two of them are known-answer
     * controls and two are discriminating:
     *
     * - `absolute` already threw before this row existed — the control that
     *   says the probe is wired to a working guard.
     * - `relative` is the subject: it forwarded silently, and must now throw.
     * - `absoluteDependency` is the **real** captured message, untouched, and
     *   `relativeDependency` is the same warning under the hypothesised reword.
     *   Both must still **forward**. A fix that makes everything fail closed
     *   breaks the build on `@napi-rs/canvas`, which is a direct dependency and
     *   emits this warning today — so these two are what separate a fix from a
     *   blanket `throw`, and the `node_modules` rejection is what carries them.
     */
    expect(real, 'the captured dependency warning names no node_modules path, so the two dependency arms below prove nothing')
      .toContain(`${sep}node_modules${sep}`)
    const arms = {
      absolute: run(withImporter(join(ROOT, 'site', 'main.ts'))),
      relative: run(withImporter(join('site', 'main.ts'))),
      relativeDependency: run(withImporter(join('node_modules', '@napi-rs', 'canvas', 'geometry.js'))),
      absoluteDependency: run(real),
    }
    expect({
      absolute: outcome(arms.absolute),
      relative: outcome(arms.relative),
      relativeDependency: outcome(arms.relativeDependency),
      absoluteDependency: outcome(arms.absoluteDependency),
    }).toEqual({
      absolute: THREW,
      relative: THREW,
      relativeDependency: FORWARDED,
      absoluteDependency: FORWARDED,
    })
    // Named, not merely non-zero: the two throwing arms must throw for
    // *different* reasons, or the relative arm could be passing because the
    // guard mistook it for a first-party file it had placed.
    expect(arms.relative.why, 'the relative arm threw, but not as an unplaceable importer')
      .toMatch(/could not be placed/)
    expect(arms.absolute.why, 'the absolute first-party arm stopped naming the offending import')
      .toMatch(/which vite externalized/)
  })

  it('forwards a real path from outside the project, and fails closed on one that only LOOKS like a path', () => {
    /**
     * The sibling defect, found by a PM reading the first repair's own residue
     * statement back at it — and it is the identical reasoning error one branch
     * over, which is §9's *"each miss was inside the commit written to remove
     * the previous one"* arriving exactly on schedule.
     *
     * The first repair said: a relative importer cannot be placed, so it is
     * UNDECIDABLE rather than THEIRS. It then left this: `isAbsolute()` says
     * true for `/@fs/…` and `/virtual:…`, containment says false, and the code
     * concluded **THEIRS with no evidence that it is theirs.** Same error, same
     * direction, same silence.
     *
     * `fsUrl` is the one that makes it concrete rather than theoretical, and it
     * is **worse than the bug already fixed**: `/@fs/` + an absolute path is
     * vite's own spelling for a real file, so that arm is **a first-party
     * source file, spelled by vite, forwarded silently.** Not a hypothetical
     * convention somebody might invent.
     *
     * **The fix is not a prefix list.** Enumerating `/@fs/`, `/virtual:`, `\0`
     * is precisely the enumeration-complete repair §9 records three times on
     * this phase, each defeated by one more form. The question is *"is this
     * string a file I can find"*, and the filesystem answers it for free: a
     * real importer is a real file vite has just read, and no virtual id of any
     * convention — invented today or in a future vite — exists on disk.
     *
     * `outsideReal` is the discriminating control and it is the whole reason
     * this is not a blanket throw: a genuine module outside the project and
     * outside `node_modules` (a linked package, a monorepo sibling) is a real
     * file, is provably not under `site/` or `src/`, and **must still forward.**
     */
    const outside = mkdtempSync(join(tmpdir(), 'stst-outside-'))
    try {
      const realFileOutside = join(outside, `${MARKER}.js`)
      writeFileSync(realFileOutside, `export const ${MARKER} = 1\n`)
      // Non-vacuity, both directions: the control arm proves nothing unless the
      // file is really there, and the two subject arms prove nothing unless
      // their ids are really absent.
      expect(existsSync(realFileOutside), 'the control file was not created, so the forwarding arm is vacuous').toBe(true)
      expect(outside.split(sep), 'the scratch dir sits under a node_modules, so the control forwards for the wrong reason')
        .not.toContain('node_modules')
      const fsUrl = `/@fs${join(ROOT, 'site', 'main.ts')}`
      const virtualId = `/virtual:${MARKER}`
      for (const id of [fsUrl, virtualId]) {
        expect(existsSync(id), `${id} exists on disk, so it is not the absolute-looking non-path this arm needs`).toBe(false)
      }
      const arms = {
        outsideReal: run(withImporter(realFileOutside)),
        fsUrl: run(withImporter(fsUrl)),
        virtualId: run(withImporter(virtualId)),
      }
      expect({
        outsideReal: outcome(arms.outsideReal),
        fsUrl: outcome(arms.fsUrl),
        virtualId: outcome(arms.virtualId),
      }).toEqual({
        outsideReal: FORWARDED,
        fsUrl: THREW,
        virtualId: THREW,
      })
      // Named, not merely non-zero: both subject arms must throw as
      // *unplaceable*, not as a first-party offender the guard thinks it placed.
      for (const arm of [arms.fsUrl, arms.virtualId]) {
        expect(arm.why, 'it threw, but not as an importer the guard could not place').toMatch(/could not be placed/)
      }
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('fails closed on a rollup virtual id, and that is CHOSEN rather than tolerated', () => {
    /**
     * Pinned because it is a decision, not an accident, and a decision with no
     * test is one refactor from being reverted by somebody who reads it as a
     * bug. **Do not "fix" this to forward.**
     *
     * A `\0`-prefixed id is rollup's convention for a module that exists only
     * inside a plugin. It is genuinely unattributable — there is no file and so
     * no answer to *"is this ours"* — so failing closed on it **is** tier 0's
     * condition being applied, not a new surface bolted beside it. Carving it
     * out would re-create the defect this whole file was sent to remove: a
     * predicate narrower than the condition, with the carve-out justified by
     * somebody judging the case harmless.
     *
     * The cost if it ever fires is a loud build failure naming the id, which is
     * the direction this project has ruled for every time: a wrong `throw` is
     * fixed the same afternoon, a wrong forward is found a phase later.
     *
     * `dependency` is the control in the same invocation — if this row ever
     * passes because *everything* throws, that arm says so.
     */
    const virtualModule = `\0rollup-virtual:${MARKER}`
    expect(virtualModule.startsWith('\0'), 'the NUL prefix is gone, so this is not a rollup virtual id').toBe(true)
    const arms = {
      virtualModule: run(withImporter(virtualModule)),
      dependency: run(real),
    }
    expect({
      virtualModule: outcome(arms.virtualModule),
      dependency: outcome(arms.dependency),
    }).toEqual({
      virtualModule: THREW,
      dependency: FORWARDED,
    })
    expect(arms.virtualModule.why, 'the virtual id threw for some other reason than being unplaceable')
      .toMatch(/could not be placed/)
  })

  it('errors when its root does not hold site/ and src/, instead of passing everything through', () => {
    // A wrong root makes every importer look third-party, so the guard would
    // forward forever and report nothing — silent blindness, from a plausible
    // mistake at the single call site in each config.
    expect(() => externalizedImportGuard(join(tmpdir(), `${MARKER}-not-a-project`))(
      { message: real },
      () => {},
    )).toThrow(/contains no site or src directory/)
  })
})

describe('the version whose prose this guard is a contract with', () => {
  it('pins vite exactly, because a caret range can reword the message on any install', () => {
    /**
     * CONDITION B. The guard matches on a sentence emitted by vite. A caret
     * range lets that sentence change under us during an unrelated `npm
     * install`, and the symptom would be the guard going quiet rather than
     * anything going red — which is why the pin is asserted and not merely
     * written down. The canary above is the other half: it would catch the
     * reword after the fact, and this stops the reword arriving unasked.
     */
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>
      '//vite'?: string
    }
    const declared = pkg.devDependencies.vite
    expect(declared, 'package.json declares no vite').toBeTypeOf('string')
    expect(declared, 'vite must be pinned exactly — see site/buildguard.ts')
      .toMatch(/^\d+\.\d+\.\d+$/)
    // The reason, asserted rather than trusted. `package.json` admits no
    // comments, so the note is a sibling key — and a bare pin whose reason has
    // been tidied away is a pin the next person widens in good faith. This is
    // the only mechanism available that makes removing it cost something.
    expect(pkg['//vite'], 'the note explaining why vite is pinned exactly has been removed')
      .toMatch(/externalized/)
  })
})
