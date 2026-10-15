# P3b — standing worker boilerplate

Every P3b worker brief points here. This file is **scratchpad, session-scoped, untracked**.
Never cite it from a commit message, a comment, or any committed artifact — it does not
resolve from the repo and will not survive the session (execution plan §1.2a).

---

## 0. First act, before anything else

Run `git log --oneline -1 main`, `git log --oneline -1 HEAD`, and
`git merge-base --is-ancestor 69abca9 HEAD`. This check has caught a stale-checkout
briefing **six times out of six**.

**The one hard requirement: `69abca9` must be an ancestor of HEAD.** It rewrote criteria
10, 11 and 14, added criterion 21, and added rows to §9; a tree without it carries
superseded text. If it is absent, **stop and report**.

**Being behind `main` is normal and is not a reason to stop.** Tier 0 lands doc commits on
`main` continuously, so a literal "HEAD must equal main" deadlocks the phase — *an earlier
version of this file said exactly that, and A-2 correctly overrode it.*

**Ask the question with the right instrument. This rule has now been wrong twice and been
overridden by a worker both times.**

```sh
git log --oneline HEAD..main          # commits on main that you do not have
```

**Empty output means there is no divergence at all — stop asking and proceed.** If it is
non-empty, classify with

```sh
git diff --name-only HEAD...main      # THREE dots: merge-base → main
```

**Classify by intersection with YOUR scope, not by directory.** Stop if the divergence
touches a file **you** will edit, a file your tests read, or a config or build script.
Anything else — including a `.test.ts` change in a directory you are not touching — is a
**baseline** event, not a stop: note that your counts will move, and proceed.

> **A-4's correction, adopted.** The previous threshold stopped on *any* `src/` change.
> A-4 hit it over three `.test.ts` files from the concurrent phase, provably disjoint from
> its three in-scope files, **tried to escalate, and found the mesh one-way** — so "stop
> and report" with no reachable recipient meant delivering nothing. It measured the
> divergence and proceeded, correctly. A stop condition that fires on work that cannot
> affect you, in a system where the stop cannot be communicated upward, is a deadlock
> wearing a guard's clothes. **This §0 rule has now been wrong three times running and a
> worker has overridden it every time; treat the version you are reading as probably still
> wrong somewhere and say so if you find where.**

> ⚠️ **Never use two-dot `git diff HEAD..main` for this.** It is a *tree* diff, not a
> commit range, so it lists **your own branch's additions** as though `main` were missing
> them. V-A ran it on a current tree and got four `site/` files — a literal STOP on a
> branch with zero divergence. The two-dot form says "stop" for **every branch in this
> project that has ever added a file**, which is every branch the check exists to guard.
> Its failure is fail-*closed*, so it does not ship a wrong answer; it deadlocks instead,
> which is the same defect the previous version of this rule had.

Either way, read any §9 rows added since your branch point; they are added mid-phase and
they bind you.

Worktree: `/home/guy/code/git/github.com/shitchell/staticstereo`, branch `feat/p3b-store`.
**Do not touch the sibling worktrees** `-main`, `-p1p7`, `-p2`.

**Use the `git` wrapper on PATH**, never `/usr/bin/git`.

### Shift 3 state — read this, it supersedes counts elsewhere in this file

- HEAD is **`febb020`** (a clean merge of `main` @ `ba433a0`, docs-only: three files under
  `docs/`). `69abca9` is an ancestor. `62696ae` — the empty commit whose 243-line message
  defines the eight remaining tasks — is an ancestor and **is the authority on your task's
  definition**. Read it with `git log -1 --format=%B 62696ae`.
- **Baseline, measured post-merge at `febb020` by V-BC: 82 files / 1948 passed /
  0 skipped**, `build` 0, `build:site` 0, `typecheck` 0 (0 errors, 0 warnings). Identical
  to the pre-merge figure — the merge is docs-only and moved nothing.
  **None of this has ever been seen by CI.** Four local exit codes are not the gate.

### ⚠️ `grep -c '↓'` DOES NOT DETECT SKIPS. Every prior use of it on this phase verified nothing.

This file told you to verify "0 skipped" positively by grepping for `↓`. **That instrument
is blind** and V-BC measured it with a complete paired control: on a genuine 22-skipped run
(`tsc` built but not `build:site`), `grep -c '↓'` returned **0**. The working instrument is
`grep -c 'skipped'` — **0** at baseline, **4** on the same 22-skipped run.

**Use `grep -c 'skipped'`.** And note what this is: instance nine of *a check that cannot
see reports fine*, committed **by the brief that warns about it**, and inherited unexamined
through two shifts. If an instrument you were handed has never been shown to fire, it has
not been shown to work — including the ones in this file.
- **Two facts that are stale in older briefs and in the survey:**
  `site/transport.ts` is **318** lines, not 274 (the survey's figure predates this phase's
  own commits — §9's own row). And **`site/controls.ts` no longer aliases
  `snap = snapTime`**; C-2 removed the dead alias and pointed the record at `snapTime`'s
  own docblock.

---

## 1. The paragraph that outranks your brief

> Your measurements outrank any assertion from your PM, **including its acceptance
> criteria** — the one artefact a PM cannot check against the code. Refuse an unsatisfiable
> criterion and prove why. If you cannot reach your PM, your final report is the channel of
> record; the mesh is unreliable, assume it.

This is not a courtesy. Worker pushback in this build is **nineteen for nineteen**, five of
those against a PM's own briefs, and two verifier-proposed designs in a row were corrected
by the implementers that built them. Your PM is forbidden from reading source and therefore
cannot check its own acceptance criteria against the code.

**Escalate on conflict, not only on uncertainty.** If two instructions conflict, stop and
report the conflict — do not choose between them, however clear each one is on its own.
Two confident contradictory instructions produce no uncertainty in the receiver, so an
uncertainty-triggered escalation never fires.

**A correction from your PM is a claim, not a work order.** If it contradicts something you
measured, say so, show the measurement, and do not silently comply.

---

## 2. Invariants (execution plan §2, verbatim)

1. **TDD is mandatory.** No production code without an observed failing test. Report RED
   and GREEN output. A test that passed first run is not evidence.
2. **`src/core/` imports nothing from `src/node/` or `src/web/`.** Svelte exists only in
   `site/`.
3. **Comments carry rationale, not description.** A constant with no recorded reason is a
   review failure. Match the surrounding density.
4. **Assert on structure, not on values.** Pin the guarantee, not today's output.
   *(The one standing exception is the preset golden; its boundary is in plan §2.4 and it
   does not extend to anything P3b owns.)*
5. **Never alpha-blend depth.** `depth[i] = max(depth[i], layerDepth × mask[i])`.
6. **Perceptual thresholds live in functions, never inlined** (R22).
7. **Name the pixel space** wherever a count appears — scene px, plate px, backing-store px
   (×`noiseScale`, default **2**), device px (×snap scale ÷ dpr). Four spaces, not two.
8. **Do not reformat or tidy files you were not asked to change.**
9. **Use the `git` wrapper on PATH**, never `/usr/bin/git`.
10. **No time estimates**, in code or reports.
11. **Build before you test**, always. `npm test` on an unbuilt tree silently skips the
    Pages-critical assertions and still reports green.

---

## 3. Required reading, from your own tree

All of this predates the branch point, so these pointers are safe.

- `docs/plans/2026-10-14-editor-execution-plan.md`:
  - **§9 "Known traps" — every row, required.** Each one already cost a correction. Do not
    skim it. **Find it by heading, never by line number**: `grep -n '^## 9\. Known traps'`.

    **This file deliberately states no row count.** It carried one through four versions
    and it was wrong every time — "68 rows" when there were 66, "grown to 70" when there
    were 68, then 68 when A-3 measured 71 in-tree and 72 on `main`. Tier 0 adds rows
    mid-phase, so any number written here is stale on arrival, and a hand-maintained count
    in a file nobody owns is precisely §9's *"a hand-written list of the places that do X"*
    trap committed by the file that warns you about it. **Count them yourself if you need
    the number; otherwise read to the end of the table.**

    Rows are added *during* this phase, including out of its own findings. **Read any that
    postdate your branch point** — `git diff HEAD..main -- docs/plans/2026-10-14-editor-execution-plan.md`
    will show them.
  - §2 invariants (lines 456–485) — reproduced above, read the source anyway.
  - §6 the gate (lines 644–711), especially **§6.5a's paired control**.
  - §7 preamble (lines 714–728) and the P3 spec (lines 862–987).
- `docs/plans/2026-10-13-editor-design.md` — the sections your task brief names.
- `docs/plans/2026-10-13-editor-requirements.md` — the R-numbers your task brief names.

---

## 4. The project's dominant failure mode

**A check that cannot see reports "fine."** Seven instances so far: a deny-list that failed
open; an mtime gate that skipped silently; `comm` without `LC_ALL=C`; a freshness gate with
no gate in it at all; `build:site` externalising a Node builtin at exit 0; `--reporter=json`
under-reporting a `beforeAll` by 1500×; and a grep census that missed 4 of 13 and said
nothing.

**Ask of every instrument: could it have seen the thing it says is absent?**

**Where a criterion is discharged by "nothing changed", gate §6.5a requires a paired
control** — a mutation the *same instrument* turns non-null. **Name both halves whenever you
reference it.** "Re-run the mutation" is an instruction to do half: it reproduces the
reddened *tests* and not the moved *measurements*. This repo holds ~126 unasserted
`report()`/`[measured]` lines that no assertion will ever mention, so a null resting on them
is inadmissible unless the measured **values** are diffed under the mutation as well as its
pass/fail. **Diff the values sorted with their labels; raw order is unstable.**

And: **a control must be able to see the specific change under test, not merely to see
something.** A worker nearly shipped 14 inadmissible nulls on that distinction.

**Two §9 rows added 2026-10-15 out of this phase's own survey — both are yours to obey:**

- *"a planted needle proves the bundle check can see"* — **only if the needle survives the
  build.** P3b's survey planted one that Rollup **constant-folded away**, so the check
  reported green over a bundle the needle never reached: a paired control that silently
  measured nothing. **A plant is inadmissible as a control until it is confirmed present in
  the built artifact, by grep, before the check is run.** Instance eight of "a check that
  cannot see reports fine".
- *"a standing ruling in the handover was ruled"* — **not necessarily.** "`seek` clamps to
  the last frame" sat under *do not re-litigate* for a week; it entered in the handover's
  own birth commit and the record it purported to settle says the opposite. It was an
  inference formatted as an inheritance, and a PM correctly refused to build on it.
  **A ruling's authority is the measurement or the decision behind it, and `git log -S`
  finds that in one command.** Where a §4 entry cannot be traced to one, it is a proposal.

**The second failure mode is omission, not falsehood.** Across three correction passes on
one tier-0 table, every defect was a dropped clause or a dropped label and **not once a
wrong fact**. Diffing and row-counting are blind to it. Audit as a completeness check
against a deeper source, never a consistency check between peers.

---

## 5. Report format (plan §5.3)

```
WHAT CHANGED   files, one line each
RED            the failing output, quoted, per test
GREEN          the passing output
SUITE          build first, then `npm test`; exit code and counts
TYPECHECK      exit code — redirect to a file and echo $?, never pipe to tail
DEVIATIONS     anything done differently, and why
UNCERTAIN      anything not confident about
```

**A worker reporting nothing `UNCERTAIN` on a non-trivial task has not looked.**

Your report reaches the orchestrator as well as your PM. Write it to stand alone; do not
rely on your PM's summary of it existing.

---

## 6. P3b-specific standing constraints

- **Out of bounds — owned by the concurrent P1/P7 phase on `feat/p1p7-shared`:**
  `src/shared/`, `src/node/canvas.generics.test.ts`, `src/cli/`, `site/legibility.test.ts`.
  If your task needs one of these, **stop and escalate** — it is not yours to resolve.
  **One exception, ruled 2026-10-15: `src/node/canvas.vendored.test.ts` IS P3b's** — it
  reads `site/index.html` and the teardown breaks it, and the phase whose change breaks a
  file owns the repair. **That one file in `src/node/` and no other.**
  `canvas.generics.test.ts` sits beside it and P1/P7 is editing it this shift.
- **Do not run a gate without telling the PM first.** Gate runs are serialised against
  P1/P7 by orchestrator ruling. Ordinary `npm test` during a task is fine; the §6 sequence
  is not. Two surveys running concurrently already contaminated a wall-clock measurement,
  and four concurrent `svelte-check` processes have timed out a merged-phase test.

### CI is GREEN — and the reason it was red is the most important thing in this file

**Superseded 2026-10-15.** An earlier version of this file said `main`'s CI was red and
told you not to touch two files. **That is fixed and merged** (`57f1e15`); `ci` and `pages`
are both green and the site deployed. Merge `main` freely. The two harnesses are no longer
off-limits for the CI reason — ordinary care applies, nothing special.

**The root cause is why you are reading this.** `svelte-check` 4.7.6's `getOutputFormat()`
takes an explicit `--output` first, then falls back to **`machine` if
`process.env.CLAUDECODE === '1'`** and `human-verbose` otherwise. Both harnesses spawned
the checker with `{...process.env}`.

> **The suite's output format was decided by whether it was being run from inside Claude
> Code.** Every agent on this project — every worker, every verifier, every PM, the
> orchestrator — got machine format and a `COMPLETED` line. The CI runner got
> human-verbose and none. `main` was broken for nine hours and **no tier of this system
> could have seen it by running the suite**, because the blindness was in the thing all of
> them share.

Three rules follow, and they bind anything you build that spawns a process:

1. **Strip the agent harness's environment when you spawn a child, and pin anything the
   child would otherwise decide by sniffing its environment.** The fix pinned
   `--output machine` *and* deleted `CLAUDECODE`, and **the deletion is the half that
   matters**: with the ambient switch gone, removing the flag now reddens the suite
   *everywhere* instead of only on CI. That is "make the right fix the easy one" applied
   to an instrument — see §6.5a's tripwire paragraph.
2. **A failing `expect` inside a `child.on('close')` callback does not fail the test — it
   hangs it.** It escapes as an uncaught exception, the promise never settles, and
   `beforeAll` burns its full timeout. **Async harnesses `reject`; they never `throw` from
   a callback.** This single bug was the entire explanation for CI's 10m45s; the verdict
   was available at 8 seconds.
3. **There is no 15× slowdown and no concurrency crisis.** Green CI is **94 seconds**. The
   earlier "assume a quarter of your parallelism" guidance is **withdrawn** — do not
   serialise anything or contort a design on account of it.

**Generalise rule 1 beyond `svelte-check`.** Any behaviour in this repo that varies with
the environment is, by construction, invisible to every agent working on it. If your task
touches something environment-sensitive, say so in `UNCERTAIN`.

### No new `svelte-check` harness without clearing it with the PM first

Three already exist and are >60% of summed test time, and a fourth is **unmeasured** —
so measure before you land one. **The old reason for this rule is withdrawn**: the
"four concurrent processes timed out a merged-phase test" story was the hanging-promise
bug above, not contention, and green CI runs in 94s. The budget is far larger than this
file previously implied. The rule survives on the weaker and still-valid ground that an
unmeasured addition to the slowest third of the suite should be measured, not assumed.
**PM's assessment,
which you may refute: no P3b task needs one.** Criterion 11's predicate is plain values,
criterion 14 is a module-graph walk plus a bundle grep, criterion 16 is
`flowViolations` over constructed `ChromeNode` trees, criterion 21 is a source scan.
**If you believe your task needs a harness that spawns `svelte-check`, stop and tell the
PM before building it**, and expect to be asked for a wall-clock re-measurement of the
whole suite, local and CI, before it lands.

**Withdrawn for H-2 specifically, 2026-10-15.** A criterion whose clause is *a wrong-typed
write fails to compile* needs exactly what the three existing registration harnesses do —
plant, run `svelte-check`, parse. A fourth harness is **approved in principle for H-2** on
four conditions, all mandatory: it **strips `CLAUDECODE` from the child environment**; it
**pins `--output machine`** on its own spawn (never in the root script — see §9's
duplicated-flag row); it **`reject`s rather than `throw`s from any callback**; and its
**parse-failure path and its criterion-not-met path are distinguishable assertions with
distinguishable messages.** **Measure whole-suite wall-clock before and after and report
both.** Green CI is **94 seconds** and that is the budget.

### If you build any harness that parses another tool's output

**Its "I could not read the output" path and its "the criterion is not met" path must be
distinguishable assertions.** The four CI failures above are precisely this defect: one
assertion covers both, so a broken parser and a real regression are indistinguishable, and
the harness reported the product broken when the product was fine. A harness that cannot
tell you *which* failure happened has told you almost nothing.
- **A browser is available on this host if a phase funds a harness** — `/snap/bin/chromium`,
  `Xvfb` and a populated `~/.cache/ms-playwright` are present (plan §7 preamble, corrected
  2026-10-15). The *default* harness has none. **P3b has funded no browser harness and
  needs none**; every P3b criterion has a non-DOM formulation. Do not reach for one.
- **Net test removal:** exactly one is pre-authorised for this phase —
  `site/markup.test.ts`, rewritten against the player. **Every other net removal is an
  escalation**, itemised by name with a one-line reason.
- **`CONTROLS` is complete; visibility sets select from it.** A filtered registry would
  fail criterion 6, which P3a already met. Do not break it.
- **Not P3b's, route around them rather than into them:** `UNIVERSAL_PARAMS`' wiring and its
  `MODEL_ROSTERS`/`ControlRosters` change (P4's); `site/playerplan.ts:504`'s one-token
  defect (P4's); `site/depthmap.ts`'s recorded rationale (P4's); P3a's carried findings 1
  and 2 — `REPEATS` hand-written in four unguarded places, and `TRACK_KEYS`' unsensored
  over-permissive direction — which are pre-existing and live in `src/cli/`, which P1/P7
  owns this week.
- **Suite timing is a live constraint.** The suite is ~43s and three harnesses spawning
  `svelte-check` are >60% of it. **A fourth must be re-measured before it lands** — four
  concurrent such processes have already timed out a merged-phase test.
- **Guard at compile time always; throw at runtime only where a wrong answer ruins the
  artifact** (plan §1.2k). A registry whose worst case is cosmetic should fail loudly to
  the compiler and quietly to the user.
- **A phase may ship a criterion unmet only with a sensor, never with a note.** A note tells
  whoever reads it; nothing makes them read it. Where a gap is accepted, convert the note
  into a test that goes red the day someone crosses it.

---

## 7. If you are a verifier — four things, each one paid for by somebody

Beyond the standard duty (fresh context, judge the diff against the acceptance criterion,
**re-establish RED yourself for every task in your cluster individually**, never from the
implementer's report):

1. **Rebuild inside every mutation.** `npm test` on a stale tree silently withdraws the
   Pages-critical assertions. V-A ran once on a stale tree and got **22 skipped**; it
   found it immediately only because the gate is loud now. If you stash, mutate, or
   revert anything, **build again before you measure**, or your staleness gets
   misattributed to the mutation.
2. **Diff the measured values, not only pass/fail.** This repo holds ~126 unasserted
   `report()` / `[measured]` lines — instruments with no failure mode — so a null that
   rests on them is **inadmissible** unless the measured *values* are diffed under the
   mutation too. Diff them `LC_ALL=C`-sorted with their labels; raw order is unstable, and
   run a known-different control pair through the same pipeline in the same invocation.
3. **Never spawn a child with `{...process.env}`.** `svelte-check` picks its output format
   by sniffing `CLAUDECODE`, so every agent on this project saw `machine` and the CI runner
   saw `human-verbose`. That is the nine-hour bug. Strip the harness's variables and pin
   anything the child would otherwise decide from its environment.
4. **A plant is inadmissible as a control until it is confirmed present in the built
   artifact.** Rollup constant-folded one away and the check went green over a bundle the
   needle never reached. Grep the artifact *before* you read the check's verdict.

### If you are handed an isolated worktree — two things V-BC paid for

1. **Verify what commit it was cut from; do not trust the brief.** V-BC was told its
   worktree would be at `febb020` on this phase's branch. **It was cut from `main`**, and
   `62696ae` was not an ancestor. V-BC checked, found it, and `git reset --hard`ed onto the
   right commit inside its own throwaway branch. Had it trusted the brief it would have
   verified the wrong tree and reported confidently.
2. **Do NOT symlink `node_modules` from a worktree someone else is working in.**
   V-BC was told to try this first and **refused, correctly**: `node_modules/.vite/vitest/results.json`
   is rewritten by every `npm test`, so a symlink would have had this verifier writing into
   a live implementer's tree. Use `cp -al`, then break the hardlinks on the write-prone
   directories (`rm -rf` the `.vite` cache; `cp -a` the rest) and confirm separate inodes.
   Verify `package.json` and `package-lock.json` are unchanged in both trees afterwards.

### `npm run build` does not typecheck `site/` — measured, and it changes what "build 0" means

V-BC planted a `ReferenceError` in `site/controls.ts` (a missing import) and
`tsc -p tsconfig.json` still exited **0**. Only `npm run typecheck` covers `site/`.
**Every "build 0" recorded on this phase says nothing whatever about `site/` types.** If
your evidence for a `site/` change rests on a build exit code, it rests on nothing.

And: **a control must be able to see the specific change under test, not merely to see
something.** A worker nearly shipped 14 inadmissible nulls on that distinction.
