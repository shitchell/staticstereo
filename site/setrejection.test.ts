import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WRITABLE_CONTROL_IDS, unwritableControls } from './controls.js'
import { CONTROL_IDS } from './controlspec.js'

/**
 * Criterion 22's **second clause**, swept: *a wrong-typed write fails to
 * compile*, asked once per writable control instead of eleven times by hand.
 *
 * ## Scope: the `set` path and nothing else. Read this before trusting a green run.
 *
 * Criterion 22's second clause is **true of the `set` path and false of the
 * `Action` union as a whole**, and tier 0 ruled it so on 2026-10-16. The legacy
 * keyed arms — `{type:'stereo', patch}` and the six others — survive because
 * `main.ts` consumes them, and `{type:'stereo', patch:{[key]: Number(raw)}}`
 * **still compiles clean**: a computed `string` key erases the field type, which
 * is the exact hole SPIKE-1 measured and the reason the criterion has a second
 * clause at all.
 *
 * **This file cannot see that hole and is not trying to.** It sweeps
 * {@link WRITABLE_CONTROL_IDS} through `SetAction` and says nothing whatever
 * about the other arms. A reader who finds this green and concludes the union
 * is safe has drawn a conclusion the instrument does not support. The legacy
 * hole is covered by a separate tripwire, and the arms themselves are removed
 * when **cluster G's G-3 deletes `main.ts`** and they lose their only consumer;
 * the tripwire retires with them.
 *
 * ## What the `@ts-expect-error` wall in `controls.test.ts` cannot see
 *
 * That wall is the cheaper instrument and it stays: eleven rows riding
 * `npm run typecheck`, spawning nothing, and `controls.test.ts`'s own docblock
 * explains why a directive is a sound compile-time sensor. It is not duplicated
 * here. **The gap is that a directive is lexical**, so the wall is a
 * hand-written sample of eleven writes over **eight** controls — §9's *"a
 * hand-written list of the places that do X"* in its most defensible form, but
 * still a sample. A sweep over a roster is not expressible with directives: you
 * cannot generate an `@ts-expect-error` from `WRITABLE_CONTROL_IDS`.
 *
 * Measured rather than argued, with the same gate this file spawns, in a copied
 * tree, one mutation at a time:
 *
 * | mutation to `site/controls.ts`                    | the wall | this sweep |
 * |---------------------------------------------------|----------|------------|
 * | `value: ControlValues[K]` → `value: unknown`        | **red** (6 of 11 directives unused) | red (52 → 0) |
 * | `value: ControlValues[K]` → the whole value union   | **red** (the same six) | red (52 → 0) |
 * | `SceneValues` maps every scene key to `unknown`     | **GREEN** | red (52 → 48) |
 * | `layer.*.at` alone maps to `unknown`                | **GREEN** | red (52 → 48) |
 *
 * The last two rows are the whole justification for this file. The wall names
 * eight controls; a value type widened on any of the other **44** is invisible
 * to it, and widening is not a hypothetical shape — it is exactly what the
 * eleven `preset.*` controls already are in the model, which is why they are
 * declared residue rather than swept.
 *
 * ## How the probe makes "wrong-typed" derivable
 *
 * A sweep needs a value that is wrong for *this* control without anyone writing
 * one per control. `Exclude<AnyControlValue, ControlValues[K]>` is that value:
 * the union of every other control's value type, with this control's own
 * removed. Two properties make it the right probe rather than a clever one:
 *
 *  - It is wrong **for this control specifically**, so it tests the id ↔ value
 *    correlation and not merely "the field is typed at all". A first attempt
 *    used a `symbol`, which every control rejects — and which therefore stays
 *    red under a correlation severed to the whole value union, reporting the
 *    criterion met over a type that had lost it.
 *  - It **degenerates to `never` exactly when the correlation breaks.** If
 *    `ControlValues[K]` stops depending on `K`, `Exclude` subtracts the whole
 *    union from itself, `never` is assignable to everything, and the error
 *    count falls to zero. The sensor's failure mode is the criterion's.
 *
 * The paired half, {@link §6.5a}, is the same 52 writes with
 * `ControlValues[K]` itself as the value: without it this file is satisfied by
 * a `SetAction` that rejects everything, including `SetAction = never`.
 *
 * ## The four conditions a fourth `svelte-check` harness was cleared on
 *
 * The standing assessment is that no P3b task needs one; it was withdrawn for
 * this task specifically, on four conditions, each of which is a bug this
 * project has already paid for.
 *
 *  1. **`CLAUDECODE` is deleted from the child's environment** — see
 *     {@link MACHINE_OUTPUT}. The deletion is the half that matters.
 *  2. **`--output machine` is pinned on this spawn and never in the root
 *     script** — see {@link typecheckCommand}, which asserts the script has not
 *     grown one, because the flag is *appended* and a duplicate silently
 *     reverts the format to human.
 *  3. **{@link runGate} `reject`s and never `throw`s from a callback.** A
 *     failing `expect` inside `child.on('close')` does not fail the test, it
 *     hangs it: the promise never settles and `beforeAll` burns its timeout.
 *  4. **Parse failure and criterion-not-met are distinguishable assertions.**
 *     Three failure classes are kept apart here with three messages — the gate
 *     did not run or could not be read (`runGate`'s rejection); the copied tree
 *     or the plant was not what this file assumed, so nothing was measured (the
 *     first `describe`); and the criterion is not met (the last two).
 *
 * ## The cost, stated rather than hidden
 *
 * **One** gate run, not two. The accepting sweep and the rejecting sweep are
 * two files in one tree, so a single checker pass returns both verdicts and
 * attributes each error by filename. Measured at ~8–13s, against a suite whose
 * critical path is `bindingregistration.test.ts` at ~47s, so it is paid out of
 * slack rather than added to the end — the whole-suite wall-clock figures
 * before and after are in this file's commit message, which is where they
 * survive.
 */

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}

/** Where the gate's own config lives, relative to a tree root. */
const GATE_TSCONFIG = 'tsconfig.typecheck.json'

/**
 * The two generated files, named so a collision is impossible to introduce by
 * accident and detected if one ever is — see the first `describe`.
 */
const REJECTING = 'setrejection.plant.wrong.ts'
const ACCEPTING = 'setrejection.plant.right.ts'

/**
 * A deliberate error at the end of the **accepting** plant.
 *
 * Without it that file's evidence is an absence — zero errors — and an absence
 * is indistinguishable from a file the checker never opened. §9: *"a plant is
 * inadmissible as a control until it is confirmed present"*, and the confirming
 * instrument has to be the one reading the verdict, not a separate `existsSync`
 * that proves only that this process wrote a file. The sentinel is the one
 * error the accepting plant is allowed to have, and its absence is reported as
 * a measurement failure rather than as a met criterion.
 */
const SENTINEL_LINE = "export const SETREJECTION_SENTINEL: number = 'not-a-number'"
const SENTINEL_MESSAGE = "Type 'string' is not assignable to type 'number'."

/**
 * The checker's output format, pinned on the command line rather than inherited.
 *
 * `svelte-check` 4.7.6 picks its format in `getOutputFormat()`: an explicit
 * `--output` wins, and with none the choice is
 * `process.env.CLAUDECODE === '1' ? 'machine' : 'human-verbose'`. Two harnesses
 * spawned the checker with `{...process.env}`, so **the suite's output format
 * was decided by whether it was being run from inside Claude Code** — every
 * agent saw a `COMPLETED` line, the CI runner saw none, and `main` was broken
 * for nine hours with no tier able to see it by running the suite.
 *
 * The child's environment also has `CLAUDECODE` deleted, and **that half is
 * what makes this self-guarding rather than merely correct**: with the ambient
 * switch gone, deleting this flag reddens the suite everywhere instead of only
 * where nobody was looking.
 */
const MACHINE_OUTPUT = ['--output', 'machine'] as const

interface GateError {
  /** The file, as the checker spelled it — tree-relative. */
  readonly file: string
  readonly line: number
  readonly message: string
}

interface GateResult {
  readonly errors: readonly GateError[]
  /** `COMPLETED <n> FILES` — the size of the surface the claim is over. */
  readonly filesChecked: number
  /** `COMPLETED … <n> ERRORS`, read from the checker rather than counted here. */
  readonly errorCount: number
  readonly raw: string
}

/**
 * Undo the machine format's escaping.
 *
 * `svelte-check`'s machine format wraps each message in quotes and
 * backslash-escapes what is inside, **including the newlines of a nested
 * TypeScript diagnostic** — and the interesting part of every error this file
 * reads lives on the second line (`Types of property 'value' are
 * incompatible.`). The obvious `replace(/\\(.)/g, '$1')` turns `\n` into a
 * literal `n`, which silently welds two lines together and breaks any assertion
 * that spans the join. Mapped explicitly instead.
 */
function unescapeMachineMessage(text: string): string {
  return text.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c))
}

/**
 * The project's own `typecheck` command, as tokens.
 *
 * Derived from `package.json` rather than spelled out, for the reason
 * `typecheck-gate.test.ts` records: a hand-written copy keeps passing on the
 * day somebody changes the real one, and the real one is what the phase gate
 * reads `$?` from.
 */
function typecheckCommand(): readonly string[] {
  const script = PKG.scripts.typecheck
  expect(script, 'package.json has no "typecheck" script').toBeTypeOf('string')
  // Tokens are handed to the process directly, so a script that grew a pipe or
  // a redirect would be mangled rather than composed.
  expect(script, 'typecheck must stay a single command — see comment')
    .not.toMatch(/[&|;><]/)
  const tokens = script!.trim().split(/\s+/)
  expect(
    tokens.some(t => t.endsWith(GATE_TSCONFIG)),
    `typecheck must name ${GATE_TSCONFIG}`,
  ).toBe(true)
  // ...and it must leave `--output` to the harness. A repeated `--output` is
  // NOT "last wins": `svelte-check` parses argv with mri, which collects a
  // duplicated flag into an array, `outputFormats.includes()` then fails on the
  // array, and the format **silently reverts to human** — which is the
  // nine-hour CI failure, restored by the change intended to prevent it. This
  // harness appends the flag like the other two, so a root pin has to be a red
  // test here rather than a silent return to that bug.
  expect(
    tokens.some(t => t === '--output' || t.startsWith('--output=')),
    'typecheck must not pin --output; this harness pins it — see MACHINE_OUTPUT',
  ).toBe(false)
  return tokens
}

/**
 * The gate's configs are commented JSON, which `JSON.parse` refuses.
 *
 * Deliberately crude and only ever used on files this repo wrote: it strips
 * `//` to end of line and does not understand a `//` inside a string. Every
 * path it yields is checked with `existsSync` immediately afterwards, so a
 * mis-strip is a failed assertion rather than a quiet wrong answer.
 */
function stripJsonComments(text: string): string {
  return text.replace(/^\s*\/\/.*$/gm, '')
}

/**
 * A throwaway tree the gate can be pointed at.
 *
 * The plants have to land in a real `site/` beside the real `controls.ts` for
 * the measurement to be about this repo rather than about a fixture, and
 * writing them into the live tree for the ~10s a gate run takes would race
 * every other test file — vitest runs files in parallel workers and a dozen of
 * them import `controls.ts`. `src/` and `node_modules` are symlinked because
 * nothing here plants into either.
 */
function makeTree(): string {
  const tree = mkdtempSync(join(tmpdir(), 'stst-setrejection-'))
  symlinkSync(join(ROOT, 'node_modules'), join(tree, 'node_modules'))
  symlinkSync(join(ROOT, 'src'), join(tree, 'src'))
  cpSync(join(ROOT, 'package.json'), join(tree, 'package.json'))
  for (const name of readdirSync(ROOT)) {
    if (name.startsWith('tsconfig') && name.endsWith('.json')) {
      cpSync(join(ROOT, name), join(tree, name))
    }
  }
  cpSync(join(ROOT, 'site'), join(tree, 'site'), { recursive: true })

  // Soundness: every claim below is only as wide as the surface the checker
  // opened. If the gate config grew an `include` the copy does not contain, the
  // surface would silently shrink and the sweep would silently weaken.
  const gate = readFileSync(join(tree, GATE_TSCONFIG), 'utf8')
  for (const entry of JSON.parse(stripJsonComments(gate)).include as string[]) {
    expect(existsSync(join(tree, entry)), `gate includes "${entry}", copy has no such path`)
      .toBe(true)
  }
  return tree
}

/**
 * The generated sweep, one write per writable control.
 *
 * Nothing here is hand-written source: the rows are produced from
 * {@link WRITABLE_CONTROL_IDS} at run time, so a control that joins the
 * registry joins the sweep in the same breath and there is no list to go stale.
 * `index` is emitted for exactly the `layer.*` controls because `SetAction`
 * requires it there and refuses it on the singletons — getting that wrong would
 * make every row an error for the wrong reason, which is why the accepting
 * plant is the paired half rather than an optional extra.
 */
function generatePlant(valueFn: 'acceptedFor' | 'rejectedFor'): string {
  const rows = WRITABLE_CONTROL_IDS.map((id) => {
    const address = id.startsWith('layer.') ? ', index: 0' : ''
    return `  ({ type: 'set', control: '${id}', value: ${valueFn}<'${id}'>()${address} } satisfies SetAction),`
  })
  return [
    '// GENERATED by site/setrejection.test.ts. Never committed; written into a',
    '// throwaway tree for one `svelte-check` run and deleted with it.',
    "import type { ControlValues, SetAction, WritableControlId } from './controls.js'",
    '',
    '/** Every writable control\'s value type, flattened. */',
    'type AnyControlValue = ControlValues[WritableControlId]',
    '',
    '/** The model\'s own type for this control — the accepting probe. */',
    'declare function acceptedFor<K extends WritableControlId>(): ControlValues[K]',
    '',
    '/**',
    ' * A value that is wrong for THIS control: every other control\'s value type,',
    ' * with this one\'s removed. Collapses to `never` — and so to zero errors —',
    ' * exactly when `ControlValues[K]` stops depending on `K`.',
    ' */',
    'declare function rejectedFor<K extends WritableControlId>():',
    '  Exclude<AnyControlValue, ControlValues[K]>',
    '',
    'export const PLANT: readonly unknown[] = [',
    ...rows,
    ']',
    '',
  ].join('\n')
}

/** Run the project's own type gate over a tree and read what it named. */
function runGate(tree: string): Promise<GateResult> {
  const [cmd, ...args] = typecheckCommand()
  return new Promise((resolve, reject) => {
    // `node_modules/.bin` on PATH is what `npm run` does; going through `npx`
    // risks a network fetch for a committed devDependency. Annotated rather
    // than inferred: the inferred shape of the spread has `PATH` as a required
    // property with no index signature, and `delete` is only legal on an
    // optional one.
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `${join(ROOT, 'node_modules', '.bin')}:${process.env.PATH}`,
    }
    // The ambient format switch, removed so the format is decided here and in
    // exactly one place — see `MACHINE_OUTPUT`.
    delete env.CLAUDECODE
    const child = spawn(cmd!, [...args, ...MACHINE_OUTPUT], { cwd: tree, env })
    let raw = ''
    child.stdout.on('data', (d: Buffer) => { raw += d.toString() })
    child.stderr.on('data', (d: Buffer) => { raw += d.toString() })
    child.on('error', reject)
    child.on('close', (code, signal) => {
      const errors = [...raw.matchAll(/^\d+ ERROR "([^"]+)" (\d+):\d+ "((?:[^"\\]|\\.)*)"$/gm)]
        .map(m => ({
          file: m[1]!,
          line: Number(m[2]),
          message: unescapeMachineMessage(m[3]!),
        }))
      const completed = /^\d+ COMPLETED (\d+) FILES (\d+) ERRORS/m.exec(raw)
      if (completed === null) {
        // A format this file cannot read must not look like a clean run. Two
        // things this failure has to get right, both learned the expensive way:
        // it must say which of two **opposite** diagnoses applies — "the
        // checker did not run, or printed something this file cannot parse" is
        // not "the compiler declined to reject a wrong-typed write" — and it
        // must REJECT rather than throw into this callback, because a throw
        // here escapes as an uncaught exception, the promise never settles, and
        // `beforeAll` sits until its timeout.
        reject(new Error(
          'the type gate emitted no machine-format COMPLETED line, so it did not run or '
          + 'could not be read. This is NOT a wrong-typed write that compiled: criterion 22\'s '
          + `second clause was never measured. exit=${code} signal=${signal} tree=${tree}\n${raw}`,
        ))
        return
      }
      resolve({
        errors,
        filesChecked: Number(completed[1]),
        errorCount: Number(completed[2]),
        raw,
      })
    })
  })
}

let tree: string
let gate: GateResult

beforeAll(async () => {
  tree = makeTree()
  writeFileSync(join(tree, 'site', REJECTING), generatePlant('rejectedFor'))
  writeFileSync(
    join(tree, 'site', ACCEPTING),
    `${generatePlant('acceptedFor')}\n${SENTINEL_LINE}\n`,
  )
  gate = await runGate(tree)
}, 300_000)

afterAll(() => {
  if (tree !== undefined) rmSync(tree, { recursive: true, force: true })
})

/** Errors the checker attributed to one of the two plants. */
function errorsIn(name: string): readonly GateError[] {
  return gate.errors.filter(e => e.file === `site/${name}`)
}

describe('the measurement happened at all — setup, not criterion', () => {
  /**
   * Kept apart from the criterion assertions on purpose. Everything in this
   * block failing means *this file measured nothing*; everything in the two
   * blocks below failing means *the criterion is not met*. One assertion
   * covering both is the defect that made four CI failures indistinguishable
   * from a broken parser for nine hours.
   */
  it('generates files that collide with nothing already in site/', () => {
    for (const name of [REJECTING, ACCEPTING]) {
      expect(
        existsSync(join(ROOT, 'site', name)),
        `site/${name} exists in the real tree; the generated plant would overwrite it`,
      ).toBe(false)
    }
  })

  it('opened the accepting plant, witnessed by its sentinel error', () => {
    // The accepting plant's evidence is an ABSENCE of errors, and an absence is
    // indistinguishable from a file the checker never opened. The sentinel is
    // the plant confirmed present *by the instrument reading the verdict*,
    // which is the only form of confirmation §9 accepts.
    const sentinel = errorsIn(ACCEPTING).filter(e => e.message.includes(SENTINEL_MESSAGE))
    expect(
      sentinel.length,
      `the sentinel error is missing from site/${ACCEPTING}, so the gate never checked the `
      + 'generated plant and the clean result below measures nothing. '
      + `filesChecked=${gate.filesChecked}\n${gate.raw}`,
    ).toBe(1)
  })

  it('found a tree that was clean apart from the two plants', () => {
    // If the copied tree already had errors, every count below is about
    // something other than the plant. Reported as a measurement failure with
    // the offending files named, never as a criterion verdict.
    const strays = gate.errors.filter(e => e.file !== `site/${REJECTING}` && e.file !== `site/${ACCEPTING}`)
    expect(
      [...new Set(strays.map(e => `${e.file}:${e.line}`))],
      'the copied tree was not clean before the plant, so nothing below is about the plant',
    ).toEqual([])
  })

  it('swept the whole registry less the declared residue', () => {
    // Derived from the instruments, never from a number written down: a survey
    // paragraph once gave a control population of 64 using two arity
    // conventions at once, where the answer is 63 under one and 68 under the
    // other. The partition itself is `controls.test.ts`'s claim and is not
    // re-proved here; what this asserts is the *population this file swept*.
    expect(WRITABLE_CONTROL_IDS.length + unwritableControls().length)
      .toBe(CONTROL_IDS.length)
    // ...and the residue really is out of this sweep's reach rather than
    // forgotten. `Preset` is an open bag of `unknown`, so a preset parameter has
    // no wrong-typed write to refuse and a compile-error sensor would report
    // that gap GREEN. See `unwritableControls` for the full argument.
    expect(unwritableControls().length).toBeGreaterThan(0)
    for (const entry of unwritableControls()) {
      expect(WRITABLE_CONTROL_IDS as readonly string[]).not.toContain(entry.control)
    }
  })
})

describe('criterion 22, second clause — every writable control rejects a wrong-typed write', () => {
  /**
   * The sweep. `@ts-expect-error` can state this for a control somebody typed
   * out; it cannot state it for a roster, because a directive is lexical. This
   * is the half of clause 2 that had no sensor.
   */
  it('names every one of the controls, so none compiled', () => {
    const rejected = new Set<string>()
    for (const error of errorsIn(REJECTING)) {
      // Attributed out of the message rather than by line arithmetic: the
      // message quotes the offending object literal, `control` included, so a
      // generator whose row numbering drifted cannot silently map an error onto
      // the wrong control.
      const named = /control: "([^"]+)"/.exec(error.message)
      if (named !== null) rejected.add(named[1]!)
    }
    const compiled = WRITABLE_CONTROL_IDS.filter(id => !rejected.has(id))
    expect(
      compiled,
      `${compiled.length} of ${WRITABLE_CONTROL_IDS.length} controls accepted a value of an `
      + 'unrelated type, so a generic renderer can write a number into a boolean for these '
      + 'ids with nothing to stop it',
    ).toEqual([])
    // One error per control and no more: a row that produced two errors would
    // let a control with none hide behind the total.
    expect(errorsIn(REJECTING)).toHaveLength(WRITABLE_CONTROL_IDS.length)
  })

  it('rejects them for the value\'s type and not for some other reason', () => {
    // The claim an `@ts-expect-error` structurally cannot make. A directive is
    // satisfied by ANY error on the line below it, so a wall of them stays
    // green over a tree where `SetAction` was deleted, a control id was
    // renamed, or the import broke — every row still errors, for reasons that
    // have nothing to do with the criterion. Reading the message is the only
    // way to tell "the value's type was refused" from "something was wrong
    // here", and it is the second reason this harness exists.
    const notAboutTheValue = errorsIn(REJECTING)
      .filter(e => !e.message.includes("Types of property 'value' are incompatible"))
      .map(e => `${e.line}: ${e.message.split('\n')[0]}`)
    expect(
      notAboutTheValue,
      'these errors are not about the value\'s type, so the sweep above is green for the '
      + 'wrong reason',
    ).toEqual([])
  })
})

describe('§6.5a — the paired half: every well-typed write still compiles', () => {
  /**
   * Without this the file is satisfied by a `SetAction` that rejects
   * everything, up to and including `SetAction = never` — an instrument with no
   * failure mode, reporting a criterion met because nothing can be written at
   * all. The same 52 rows, the same generator, one gate run, the only
   * difference being the probe.
   */
  it('accepts all of them, leaving only the sentinel', () => {
    const rejected = errorsIn(ACCEPTING)
      .filter(e => !e.message.includes(SENTINEL_MESSAGE))
      .map(e => `${e.line}: ${e.message.split('\n')[0]}`)
    expect(
      rejected,
      'a well-typed write was refused, so the rejection above does not distinguish a '
      + 'wrong-typed write from any write',
    ).toEqual([])
  })

  it('measured both plants over one surface, so the two halves are the same size', () => {
    // Guards the pairing: the accepting and rejecting sweeps are two files in
    // ONE checker pass precisely so that no difference between them can be an
    // artefact of two differently-configured runs. The surface is the whole
    // project plus the two plants, derived from the tree rather than pinned —
    // a literal here would be stale by the next commit.
    const onDisk = readdirSync(join(ROOT, 'site')).filter(n => n.endsWith('.ts')).length
    expect(gate.filesChecked, gate.raw).toBeGreaterThan(onDisk)
    expect(gate.errorCount).toBe(gate.errors.length)
  })
})
