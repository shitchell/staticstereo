# H-2 — the criterion-22 sensor, scoped to the `set` path

**You are an implementer.** PM: `PM-SHELL-P3b-3`. Branch `feat/p3b-store`, worktree
`/home/guy/code/git/github.com/shitchell/staticstereo`. **You own the primary worktree.**
A second implementer (R-1) is live in a **separate** worktree on its own branch; it may
touch `site/controls.test.ts`, so note anything you change there and say so.

## 0. Read first, in this order

1. **`git log -1 --format=%B 62696ae`** — the empty commit whose 243-line body defines
   this phase's remaining tasks. **Your block is `H-2` and it is the authority.**
2. **`git log -1 --format=%B 24392c3`** — H-1b's adoption commit. **This is your subject.**
   It landed `SetAction`, `WRITABLE_CONTROL_IDS`, `BROWSER_LAYER_VARIANTS`,
   `unwritableControls()`, `applySet`, the `'set'` reducer arm, and an eleven-row
   `@ts-expect-error` rejection wall with a compiling paired control.
3. `/tmp/claude-1000/-home-guy-code-git-github-com-shitchell-staticstereo/8b54946b-39f3-4e41-bb67-886b9d8bd96a/scratchpad/P3B-WORKER-BOILERPLATE.md`
   — **all of it.** A committed copy is at `docs/plans/handover/P3B-WORKER-BOILERPLATE.md`.
4. From your own tree: execution plan **§2 invariants**, **§9 "Known traps" — every row,
   by heading** (several rows are about the exact harness you are building), **§6 including
   §6.5a**, and §7's **"P3b rulings, 2026-10-15"** — ESC-7 created criterion 22.

## 1. The paragraph that outranks this brief

> Your measurements outrank any assertion from your PM, **including its acceptance
> criteria** — the one artefact a PM cannot check against the code. Refuse an unsatisfiable
> criterion and prove why. If you cannot reach your PM, your final report is the channel of
> record; the mesh is unreliable, assume it.

**Escalate on conflict, not only on uncertainty.** Worker pushback on this phase is
**twenty-two for twenty-two.**

## 2. The task, as committed at `62696ae`

```
H-2 — the criterion-22 sensor (second clause)

  Serves    Criterion 22. Depends on H-1.
  Files     A test file; possibly a new harness.
  Accept    (1) A sweep DERIVED FROM CONTROL_IDS — never a hand-written list —
                asserting every entry is writable. Cite the length of the thing,
                never a total someone wrote down: a survey paragraph once gave a
                control population of 64 using two arity conventions at once,
                where the answer is 63 under one and 68 under the other, and
                pinning 64 would have produced a wrong registry that was green.
            (2) A wrong-typed write FAILS TO COMPILE, demonstrated by a plant.
            (3) A vacuity floor: the sweep is shown to redden when an entry is
                made unwritable.
  Harness   Clause (2) is the exact shape the three existing registration
            harnesses implement — plant, run svelte-check, parse — so H-2
            PROBABLY NEEDS A FOURTH, against the standing assessment that no
            P3b task does. That assessment is hereby withdrawn for H-2
            specifically. A fourth must be cleared with the PM, wall-clock
            re-measured before it lands, and it must strip CLAUDECODE from the
            child environment, pin --output machine, reject rather than throw
            from any callback, and keep its parse-failure and
            criterion-not-met paths as distinguishable assertions.
  Refusable If H-1 returns that the type-level half is not expressible, clause
            (2) has no subject and H-2 must be restated or cut.
```

**H-1 did not return that.** The type-level half is expressible and was built; the refusal
condition did not fire.

## 3. What `24392c3` already discharges — do not rebuild it

H-1b measured all of this. It is **relayed, not mine** — verify before relying on it.

- **Clause (1) exists and is derived.** `CONTROL_IDS.length` **63** =
  `WRITABLE_CONTROL_IDS.length` **52** + residue **11**, no duplicates, no number written
  down in the assertion. It is **not** total by construction: adding a control to
  `MODEL_ROSTERS` that the writable derivation does not pick up reddens it (62 vs 63).
- **Clause (3) exists and bites in both directions** — dropping an id from the writable
  set and adding one to the registry both redden.
- **The eleven-entry residue is the preset family and is ruled ACCEPTED** by tier 0:
  bundles are UI macros writing an `Anim` array at attach time, forced by `PresetFn`
  returning a single `Track`, so **a preset is applied, not set** — a different mechanism
  by design, not a missing one. **Criterion 22 clause 1 is MET at 52 of 63.**
- **Clause (2) exists as an eleven-row `@ts-expect-error` wall** riding `npm run typecheck`,
  with a compiling paired control. H-1b proved it is not inert: severing the
  id-to-value-type correlation turns **exactly six of eleven** directives into *"Unused
  '@ts-expect-error' directive"* — the six value-type claims — while the five structural
  ones still bite.

## 4. So what are you actually for

**Your job is the sensor, not the criterion.** The wall at `24392c3` proves the rejection
*in the tree as it stands*. What does not yet exist is an instrument that **plants a
wrong-typed write, runs the checker, and parses the verdict** — the shape the three
existing registration harnesses implement, and the thing that keeps proving it as the
union changes.

**Your scope is clause 2 for the `set` path only.** Ruled by tier 0, and the reason is
sharp: criterion 22's clause 2 is **true of the `set` path and false of the `Action` union
as a whole** — the legacy keyed arms survive because `main.ts` consumes them, and
`{type:'stereo', patch:{[key]: Number(raw)}}` still compiles clean. **That hole is covered
by a tripwire in R-1's scope and by G-3's removal of `main.ts`. It is not yours, and a
harness that pinned the clause as if it were union-wide would pin the wrong thing.**

**Say so explicitly in the harness's own docblock** — that it covers the `set` path and
why the rest is deliberately out of its sight, with a pointer to G-3. A future reader
finding a green criterion-22 harness must not conclude the union is safe.

## 5. The four mandatory harness conditions, and the one measurement that can veto it

If you build a fourth `svelte-check`-spawning harness, **all four are mandatory**:

1. **Strip `CLAUDECODE` from the child environment.** `svelte-check` 4.7.6's
   `getOutputFormat()` takes an explicit `--output` first, then falls back to `machine` if
   `process.env.CLAUDECODE === '1'` and `human-verbose` otherwise. Two harnesses spawned
   with `{...process.env}`, so **the suite's output format was decided by whether it was
   run from inside Claude Code** — every agent saw a `COMPLETED` line, the CI runner saw
   none, and `main` was broken for nine hours with no tier able to see it. **The deletion
   is the half that matters**: with the ambient switch gone, removing the flag reddens the
   suite everywhere instead of only on CI.
2. **Pin `--output machine` on your own spawn — NEVER in the root `typecheck` script.**
   The existing harnesses *append* the flag to the script's tokens, so a root pin yields a
   **duplicated** flag; `mri` collects a repeated flag into an array,
   `outputFormats.includes([...])` is false, and the format **silently reverts to human**.
   That is the nine-hour failure, restored by the change intended to prevent it.
3. **`reject`, never `throw`, from any callback.** A failing `expect` inside a
   `child.on('close')` callback does not fail the test — **it hangs it.** It escapes as an
   uncaught exception, the promise never settles, and `beforeAll` burns its full timeout.
   That single bug was the entire explanation for a 10m45s CI run whose verdict was
   available at 8 seconds.
4. **Parse-failure and criterion-not-met are distinguishable assertions with
   distinguishable messages.** One assertion covering both is why four CI failures were
   indistinguishable from a broken parser. A harness that cannot tell you *which* failure
   happened has told you almost nothing.

**And the veto.** The three existing harnesses — `typecheck-gate`, `fitregistration`,
`bindingregistration` — are **>60% of summed test time**, and whether a fourth fits is
**unmeasured**; nobody has ever planted one. **Measure whole-suite wall-clock before and
after and report both numbers.** Green CI is **94 seconds** and that is the budget.

> **If the harness blows the budget, say so and do not land it.** Report the measurement
> and what a cheaper instrument would cost instead. That is a successful outcome. The
> standing assessment was withdrawn *for H-2 specifically* on the strength of the clause
> needing it — not on the strength of a fourth harness being free.

**Note the live alternative before you commit to a harness.** `24392c3`'s eleven
`@ts-expect-error` rows already ride `npm run typecheck` and spawn nothing. If you judge
that extending that mechanism discharges clause 2 as well as a harness would, at a
fraction of the cost, **argue it and I will take it** — the task is the sensor, not the
subprocess. §1.2k: guard at compile time always; the harness is justified only by what the
directives cannot see. **Tell me which that is.**

## 6. Forbidden

- **`site/typecheck-gate.test.ts`** — measured robust under all four output formats, no RED
  is available for it, invariant 1 forbids changing it.
- **Do not touch `--output` in the root `typecheck` script**, for the reason in §5.2.
- **Do not fix the legacy union hole.** Ruled G-3-or-later; R-1 owns its tripwire.
- **Owned by the concurrent P1/P7 phase, stop and escalate:** `src/shared/`, `src/cli/`,
  `src/node/canvas.generics.test.ts`, `site/legibility.test.ts`.
- **Zero net test removals.** One is pre-authorised in this phase and it is
  `site/markup.test.ts`, which is not yours.
- Do not reformat or tidy files you were not asked to change.

## 7. Two measured facts that change how you check your own work

1. **`npm run build` does not typecheck `site/`.** A planted `ReferenceError` in
   `site/controls.ts` left `tsc -p tsconfig.json` at exit **0**. Only `npm run typecheck`
   covers `site/` — and your criterion is a compile-time one, so this matters more to you
   than to anyone. **Every "build 0" on this phase says nothing about `site/` types.**
2. **`grep -c '↓'` does not detect skipped tests** — 0 on a genuine 22-skipped run.
   **Check vitest's summary line**: it names skips explicitly when they exist, so **a
   parenthetical total equal to the passed count is positive proof of zero.**

Also: **A-4's duplication guard has a measured hole and `'set'` just widened the literal
surface it operates over.** R-1 is closing both. **Do not lean on that guard**, and if
your work needs it to change shape, stop and tell me rather than widening it yourself.

## 8. Operating notes

- **Build before you test, always**, and rebuild inside every mutation.
- `npm run typecheck | tail` is not a check; `$?` is `tail`'s. Redirect and echo `$?`.
- Run your key typecheck **both with and without `CLAUDECODE` stripped** and report both.
  A format revert fails **open**, toward green.
- **Baseline: 82 files / 1955 passed / 0 skipped** at `24392c3`, four exit codes 0. The
  tree has since merged `main` (docs-only). Measure your own starting point.
- A timeout-shaped red gets re-run alone before you report it; say that you did.
- Use the `git` wrapper on PATH, never `/usr/bin/git`. Commit to `feat/p3b-store`, and
  record the wall-clock numbers in the commit message — **the scratchpad does not survive
  the session and commit messages are this project's durable record.**

## 9. Report — plan §5.3

```
WHAT CHANGED / RED / GREEN / SUITE / TYPECHECK / DEVIATIONS / UNCERTAIN
```

**Lead with the wall-clock measurement, before and after**, then RED. **Nothing
`UNCERTAIN` on a non-trivial task means you have not looked.** Your report reaches the
orchestrator as well as me; write it to stand alone, because a predecessor's was lost and
its evidence had to be recovered from a dead transcript.
