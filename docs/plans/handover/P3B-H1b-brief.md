# H-1b — adopt the orphaned criterion-22 work, and attribute its RED

**You are an implementer.** PM: `PM-SHELL-P3b-3`. Branch `feat/p3b-store`, worktree
`/home/guy/code/git/github.com/shitchell/staticstereo`. You own that worktree.

**A predecessor (H-1) was killed mid-task by an expired session login — not by any fault
in its work.** It left 782 uncommitted insertions across four files. Tier 0 gated the tree
exactly as found, parked it on a salvage branch, and left the phase branch clean. **Your
job is to make that work adoptable, or to find out that it is not.**

## 0. The subject and what "adopt" means

- **Subject: `salvage/p3b-criterion-22` at `b27a315`.**
- **`feat/p3b-store` is clean at `febb020`.**
- **Adoption means landing the work on the phase branch. It does NOT mean merging the
  salvage branch.** The salvage branch is a parking space, not a lineage. Bring the
  content across, under TDD, with RED attributed — and commit it to `feat/p3b-store` with
  a message that records what you established and what you could not.

Tier 0's gate of the salvage tree, as found: **typecheck 0 over 455 files, build 0,
build:site 0, test 0, 82 files / 1955 passed / 0 skipped** — seven tests above the branch
baseline. **It is green. Green and unattributable is not the same as done**, and that
distinction is the whole of this task.

## 1. Read first, in this order

1. `/tmp/claude-1000/-home-guy-code-git-github-com-shitchell-staticstereo/8b54946b-39f3-4e41-bb67-886b9d8bd96a/scratchpad/P3B-WORKER-BOILERPLATE.md`
   — **all of it.**
2. **`git log -1 --format=%B 62696ae`** — the empty commit whose 243-line body defines
   this phase's remaining tasks. Your predecessor's block is **`H-1`**, and **it is the
   authority on what criterion 22 requires.** Read it before you read any code.
3. `…/scratchpad/P3B-H1-brief.md` — the brief H-1 was working from. **Its acceptance
   criteria are your acceptance criteria**, with the additions in §4 below.
4. `…/scratchpad/P3B-SURVEY-S1.md` — phase survey, S-1's measurements, taken before this
   phase committed. Counts in it have moved.
5. From your own tree: execution plan **§2 invariants**, **§9 "Known traps" — every row,
   by heading** (`grep -n '^## 9\. Known traps'`), **§6 including §6.5a**, and §7's
   **"P3b rulings, 2026-10-15"** — **ESC-7 created criterion 22 and is your charter.**

## 2. The paragraph that outranks this brief

> Your measurements outrank any assertion from your PM, **including its acceptance
> criteria** — the one artefact a PM cannot check against the code. Refuse an unsatisfiable
> criterion and prove why. If you cannot reach your PM, your final report is the channel of
> record; the mesh is unreliable, assume it.

**Escalate on conflict, not only on uncertainty.** Worker pushback on this phase is
**twenty-one for twenty-one.**

## 3. What I recovered, and exactly how far it can be trusted

**H-1 never filed a report.** Everything below I recovered from the dead agent's
transcript by bounded grep — match counts and short spans only. **I have not read the
salvage diff and I may not.** So this is evidence about *what happened*, not about *what
the code is*. **Verify every line of it against the branch; where it disagrees with your
measurement, yours wins and say so.**

**RED was observed. RED was not attributed.** Two distinct states, each appearing four
times across runs:

```
FAIL  site/controls.test.ts     Tests  6 failed | 44 passed
FAIL  site/controls.test.ts     Tests  1 failed | 49 passed
FAIL  site/store.test.ts        (twice)
```

GREEN progression 50 → 51 passed; full suite 1948 → 1954 → (tier 0 measured) 1955.

**The compile wall was driven red and back:**

```
typecheck=1  ×6        typecheck=0  ×4
COMPLETED 455 FILES 0 ERRORS 0 WARNINGS
COMPLETED 455 FILES 1 ERRORS 0 WARNINGS
COMPLETED 455 FILES 2 ERRORS 0 WARNINGS
TS2322 ×32    TS2741 ×4    TS2820 ×2    TS6059 ×2
```

**Shape evidence, all of it to be re-verified by you:**

```
CONTROL_IDS.length = 63                                  (H-1's own measurement)
expect(CONTROL_IDS.length).toBe(WRITABLE_CONTROL_IDS.length + residue.length)
expect(residue.map(e => e.control).sort()).toEqual([...fromRegistry].sort())
expect(residue.length).toBeGreaterThan(0)
```

No `startsWith('preset.')` and no literal `'preset.*'` id string appears anywhere in the
transcript — consistent with the residue being **derived from the registry** rather than
hand-listed. Exported names seen: `WritableControlId`, `SetAction`,
`WRITABLE_CONTROL_IDS`, `BROWSER_LAYER_VARIANTS`, `unwritableControls`.

## 4. Your four deliverables

### (a) Re-establish RED per claim — the thing nobody can do from the record

This is the task's centre. For **each** behavioural claim the salvage work makes, stash or
revert the production half, observe the specific failure, and restore. A test that passed
first run is not evidence (invariant 1), and **a suite that goes from 1948 to 1955 tells
you seven tests exist, not that any of them can fail.**

Two cautions earned on this phase:
- **A collection error is not an admissible RED.** An absent or inert module makes vitest
  fail to *collect*, a different failure from the one the test claims. Plant inside an
  executed function, not at module scope.
- **Grep-confirm every plant present in the real file before you read any verdict**, and
  **rebuild inside every mutation** — a stale tree silently withdraws assertions and still
  reports green.

Where a claim's RED **cannot** be re-established, say so by name. That is a finding about
the salvage, not a failure of yours, and it is more valuable than a green suite.

### (b) Finish the parser cross-check — quote from the dead agent itself

The last thing H-1 wrote, mid-stride, was an instruction to itself:

> **"Now extend the parser cross-check in `store.test.ts` to resolve the named union
> member."**

That is where it was cut off. Finish it. The parser cross-check is one of **three
instruments that redden by design** when the `Action` union grows — the other two are a
sample table in `site/store.test.ts` and a mapped table in `site/hashprojection.test.ts`
(brief says `:144`; V-BC measured the table at `:153`). **Classify each, never suppress.**
Say in your report what each did and why your treatment of it is correct rather than
convenient.

### (c) Report the mechanism — and a negative answer is a success

**How was the computed-string-key type erasure avoided?**

SPIKE-1 measured that `{type:'stereo', patch:{[key]: Number(raw)}}` **compiles clean**
where the literal form errors, so a generic renderer can write a number into a boolean or
an enum with nothing to stop it. SPIKE-1's own code had the bug and compiled. **A
path-addressed action that reintroduces that hole satisfies criterion 22's first clause
and fails the criterion.**

`TS2322 ×32` is an assignment-type rejection and is **consistent with** a type-preserving
shape. **It is not proof of one.** Establish the mechanism and state it plainly.

> **If it turns out the erasure is papered over rather than solved, that is a successful
> finding and it ends the task.** Report it with the measurement, and do not repair it
> under this brief — that would be a design decision nobody has approved.

### (d) Verify the sweep is total, and that it can fail

`expect(CONTROL_IDS.length).toBe(WRITABLE_CONTROL_IDS.length + residue.length)` is a
totality assertion and it is the right shape. Check two things about it:

1. **It is derived, not asserted.** `CONTROL_IDS.length` measured by the instrument, never
   a number anyone wrote down. §9: a survey once gave a control population of 64 using two
   arity conventions at once, where the answer is 63 under one and 68 under the other, and
   pinning 64 would have produced a wrong registry that was green.
2. **It has a vacuity floor that bites.** Make an entry unwritable and show the sweep
   reddens. A partition that is total by construction cannot catch anything, and a residue
   whose membership is derived from the same source as the thing it partitions is §9's
   *"a guard derived from the roster it guards"* — it proves only that the derivation ran
   twice. Say which side of that line this lands on.

## 5. Out of scope

- **This is not H-2.** The criterion-22 *sensor* — a `svelte-check` harness that plants a
  wrong-typed write, runs the checker and parses the result — is a separate approved task
  with four mandatory conditions. **Do not build it.** A plant-and-revert demonstration
  that `npm run typecheck` exits non-zero with a named error is in scope and is what
  deliverable (c) needs; a standing fourth harness is not.
- **No new `svelte-check`-spawning harness** without clearing it with me first. Three
  exist and are >60% of summed test time; green CI is 94s and that is the budget.
- **Owned by the concurrent P1/P7 phase, stop and escalate:** `src/shared/`, `src/cli/`,
  `src/node/canvas.generics.test.ts`, `site/legibility.test.ts`.
- **`site/typecheck-gate.test.ts`** — no RED is available for it; invariant 1 forbids
  changing it.
- Do not reformat or tidy files you were not asked to change.

## 6. Two measured facts that change how you check your own work

1. **`npm run build` does not typecheck `site/`.** V-BC planted a `ReferenceError` in
   `site/controls.ts` and `tsc -p tsconfig.json` still exited **0**. Only
   `npm run typecheck` covers your files. **Every "build 0" on this phase says nothing
   about `site/` types** — and your criterion is a compile-time one, so this matters more
   to you than to anyone.
2. **`grep -c '↓'` does not detect skipped tests.** Measured: **0** on a genuine
   22-skipped run. **Check vitest's summary line instead** — it names skips explicitly
   when they exist (`Tests 1349 passed | 22 skipped (1371)`), so **a parenthetical total
   equal to the passed count is positive proof of zero.** Check the summary, never a glyph.

Also: **A-4's duplication guard watches the store for second implementations of a reducer
arm, and V-BC measured a hole in it** — a reassignment plus a tag-free selection evades
both halves at once and ships at test 0 / typecheck 0. A separate task (R-1) will close it.
**Do not lean on that guard as a complete sensor over the code you are landing**, and if
your work needs the guard to change shape, stop and tell me rather than widening it.

## 7. Operating notes

- **Build before you test, always.** `npm test` on an unbuilt tree silently withdraws the
  Pages-critical assertions and still reports green.
- `npm run typecheck | tail` is not a check; `$?` is `tail`'s. Redirect and echo `$?`.
- Run your key typecheck **both with and without `CLAUDECODE` stripped**, and report both.
  `svelte-check` returns `machine` format when `CLAUDECODE === '1'` and `human-verbose`
  otherwise; a format revert fails **open**, toward green, so a clean result from inside
  the agent harness is the least trustworthy kind.
- **Baseline: `febb020`, 82 files / 1948 passed / 0 skipped**, build 0, build:site 0,
  typecheck 0 (0 errors, 0 warnings). The salvage gated at 1955.
- A timeout-shaped red gets re-run alone before you report it; say that you did.
- **Zero net test removals.** One is pre-authorised in this phase and it is
  `site/markup.test.ts`, which is not yours.
- Use the `git` wrapper on PATH, never `/usr/bin/git`.
- **Commit to `feat/p3b-store`.** Record in the commit message what RED you attributed,
  what you could not, and the mechanism answer — **the scratchpad does not survive the
  session and commit messages are this project's durable record.** Credit the predecessor's
  work as recovered from `b27a315`.

## 8. Report — plan §5.3

```
WHAT CHANGED / RED / GREEN / SUITE / TYPECHECK / DEVIATIONS / UNCERTAIN
```

Lead with **RED, per claim, attributed** — that is what this task exists for. Then the
mechanism answer.

**Nothing `UNCERTAIN` on a non-trivial task means you have not looked.** Your report
reaches the orchestrator as well as me; write it to stand alone, because my summary of it
is not evidence and the last one was lost.
