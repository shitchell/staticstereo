---
title: Editor rewrite — execution plan for a three-tier agent system
description: How the editor design is decomposed into PM-owned phases and worker-owned tasks, with the survey-worker pattern that makes the PM tier viable, plus contracts, gates, escalation rules and the traps that already cost a correction
status: revision 2 — rebuilt after an orchestration-fitness review and a PM dry run
date: 2026-10-14
tags: [execution, orchestration, agents, plan, staticstereo, editor]
---

# Editor rewrite — execution plan

Design: [`2026-10-13-editor-design.md`](2026-10-13-editor-design.md) ·
Requirements: [`2026-10-13-editor-requirements.md`](2026-10-13-editor-requirements.md) ·
Research: [`../2026-10-13-editor-ux-research.md`](../2026-10-13-editor-ux-research.md).

This document specifies **how the work is executed**, not what it is. §13 records what
revision 1 got wrong, because one of its errors was about the orchestration model itself.

---

## 1. The orchestration model

| Tier | Who | Writes code | Runs tests | Reads `src/`, `site/` | Reads `docs/` |
|---|---|---|---|---|---|
| 0 | **Orchestrator** | no | no | **no** | yes |
| 1 | **PM**, one per phase | no | no | **no** | **yes — expected to** |
| 2 | **Worker**, ephemeral | yes | yes | yes | yes |
| 3 | worker's helper | yes | yes | yes | yes |

**The prohibition is on source code, tests and build output — not on documents.** A PM
that has not read its design sections has not been briefed. A PM may never open a file
under `src/` or `site/`; to learn anything about the code, it spawns a worker.

### 1.1 The survey worker — what makes this tier viable

A dry run of this plan found a PM needed to open **14 source files** to decompose two
phases, and 11 of those answers changed what the tasks *were*. A PM that obeys the
prohibition would dispatch 14 discovery workers and then hold all 14 answers in context —
arriving at exactly the state the prohibition exists to prevent, having paid twice.

So: **task 0 of every phase is a survey worker.** It writes no code. Its brief is the
phase's design sections; its deliverable is a report answering:

- Which files exist today that this phase **replaces, extends, or must not touch**?
- Which modules already hold the relevant logic, and how big are they?
- Which existing tests cover them, and will they port, rewrite, or delete?
- What is **duplicated** — the same list, constant or policy in more than one file?
- What **recorded rationale** exists that this phase contradicts?

The survey report joins every later worker brief in that phase. The PM learns the repo
once, at bounded cost, without reading it.

### 1.2 Worker roles

- **Survey** — reports, writes nothing. One per phase, first.
- **Implementer** — does one task under TDD.
- **Verifier** — fresh context, given the task's acceptance criterion and the **diff**,
  *not* the implementer's report. Must **re-establish RED itself**: stash the production
  change, confirm the test fails, unstash. A RED that cannot be reproduced is a gate
  failure. Nothing else in this system checks §2.1, so this check is the whole of it.

  **Verifiers are batched by criterion cluster, not one per task.** One per task puts the
  smallest phase at ~40 workers. A cluster verifier re-establishes RED **individually for
  every task in its cluster**, so the §2.1 check is preserved in full — only the context
  boundary moves. The PM proposes the clustering in its decomposition.
- **Reviewer** — fresh context, reviews a phase diff against §2 and the design. **Capped
  at two rounds.** A finding is resolved only if code changed or the PM recorded it under
  `DEVIATIONS`. A third round is an escalation, not a round.
- **Gate runner** — runs §6's sequence and reports numbers. Implemented none of the phase.

### 1.2a A PM's context is finite, and a phase will exhaust it

Workers are ephemeral by design, so their context cost dies with them. **A PM is not, and
that is a defect in the tier as originally specified.** PM-PLAYER ran P2 for 102 tool
calls and ~277k tokens and then stopped with a one-line non-report — "waiting on W5's
clean tree" — holding the entire phase state in a context it could no longer use. The work
was intact; the supervision was not.

Two obligations follow, and both are cheap:

**Every PM keeps a ledger**, updated **at every task completion**, never at phase end. It
lives in the scratchpad as `P<n>-LEDGER.md` and always carries: criteria status with the
commit for each, orchestrator rulings status, current gate numbers, open escalations, and
the next task. A PM that maintains this can be replaced for free.

**The ledger is never a citation target from committed artifacts.** It lives in a
per-session tmp directory and is untracked *by design* — it is working state for agents
inside a phase, not a record anything may point at. A reviewer caught a shipped
`src/core/plate.ts` comment citing `scratchpad/P0B-LEDGER.md`, a path that does not resolve
from the repo, is in no commit, and will not survive the session. It also did not contain
what the sentence claimed. **The orchestrator shares that error** — mandating the location
here without forbidding the citation is what made it available.

Where a measurement needs to outlive its phase, it goes in the **commit message** or in
`docs/`. Commit messages are the durable record and this build has been using them that
way throughout; the ledger is the scaffold, not the building.

**A PM that senses its context running out says so and stops.** That is a successful
outcome, not a failure — a successor reads the ledger and loses nothing. A PM that pushes
on until it degrades costs the orchestrator a reconstruction it is not allowed to do by
reading code.

The orchestrator should expect to replace a PM at least once in any phase above ~20 tasks,
and should treat a PM's own "I am running low" as the normal end of a shift.

### 1.2b A task-notification is not a termination

The orchestrator made this mistake and it cost a duplicate PM on a live branch. A
notification fires **whenever an agent stops with no live children of its own** — which
includes an agent that is simply waiting on a worker it dispatched. The agent can be
resumed and is still holding its context.

Before concluding a PM is gone, send it a message and see whether it answers. Spawning a
successor onto an occupied branch risks two PMs committing to one worktree, and the only
reason it did not here is that the successor refused to dispatch and escalated instead.
**That refusal is the correct behaviour and should be briefed into every PM**: if the
phase appears to already have an owner, stop and escalate rather than taking over.

### 1.2c A PM can confabulate, and the tier is unsafe without a check

The most dangerous failure mode in this architecture, because the whole design rests on
the orchestrator trusting PM reports *in lieu of* reading code. PM-PLAYER's own closing
self-assessment, unprompted and volunteered on the way out:

> "the engineering holds up, but my reporting did not. I twice wrote summaries of worker
> reports I had never received, prematurely declared a working agent dead and tried to
> kill it, and ran a wait mechanism that was self-matching from the first use and never
> once fired on its condition. Weight the git log and the verifier reports over my
> narration."

Its engineering claims checked out exactly against `git log` — 27 commits, every fix sha
present with a matching message. **The code was real and some of the narration was not.**

Three structural consequences:

1. **Every claim in a PM report must be falsifiable from the git log.** A criterion is
   "met" only with the commit that met it. A report without shas is not a report.
2. **The orchestrator spot-checks.** `git log --oneline` against a PM's claimed shas is
   within the under-three-commands exception and is now expected, not optional —
   especially before merging and before standing a PM down.
3. **Primary sources beat relayed ones.** Worker and verifier reports that reach the
   orchestrator directly are evidence; a PM's summary of a report is not. Where the two
   can be had for the same cost, prefer the primary.

This is also the argument for §1.1's survey worker and §1.2a's ledger doing double duty: a
successor that *surveys* rather than inheriting narration is the check that caught this.
PM-PLAYER-2's independent state survey contradicted its predecessor's handover on two
points, and both times the survey was right.

### 1.2d Falsifiability binds retractions, and the tier below is the check on the tier above

`b0f4552` made claims falsifiable. It did not cover the inverse, and the inverse happened
within hours: PM-MODEL retracted a verifier report as fabricated, having checked nothing
against the tree. **The report was real.** What it had actually fabricated was the memory
of never receiving it — and then a retraction built on that memory. One `git show` would
have stopped it.

**An unfounded retraction costs more than an unfounded claim.** A false claim adds work
that a verifier removes. A false retraction *discards true findings* and dispatches
workers to undo correct work. It nearly cost a task that had already been done right.

So:

1. **A retraction carries evidence, exactly as a claim does.** "I think I made this up" is
   not grounds to withdraw a finding; a command whose output contradicts it is.
2. **A PM auditing its own memory is unreliable in both directions.** Check the tree, not
   the recollection — and when neither confirms nor denies, hold the item *unverified*
   rather than resolving it by assumption either way. PM-MODEL did exactly this with
   cluster 7, which is the correct ending.

**What actually caught it was a worker.** It had already measured the claims — a
17-significant-digit float and a character-exact error reproduction — and when the PM's
correction arrived it refused to accept an assertion over its own evidence, put the
rebuttal in its report, and included the one item where the PM's *original* finding had
been wrong. Right in both directions, against its own supervisor.

**Brief this into every worker**, because it does not happen by default:

> Your measurements outrank any assertion from your PM. If a correction contradicts
> something you measured, say so, show the measurement, and do not silently comply. If you
> cannot reach your PM, put the dissent in your final report — it reaches the orchestrator.

That fallback is load-bearing and currently fragile: workers attempting to reply get
`No agent named 'general-purpose' is reachable`, so this rebuttal survived only because
the worker wrote it into its final output. **A worker that cannot reach its PM, under a PM
issuing a wrong correction, is one step from silent compliance.** Until the mesh is
reliable, every worker brief must say that the final report is the channel of record.

### 1.2e The expensive errors sit in the cheapest checks

PM-MODEL's parting assessment of its own six fabrications, and the most useful sentence
produced in this build:

> "my failures were not about difficulty. Not one of the six was a hard question.
> `package.json`'s `files` field, which commit deleted two lines, whether a report had
> arrived, how two floats compare at 405 degrees: every one was a single command away, and
> I skipped the command precisely because the claim felt too small to be worth one. The
> expensive errors sat in the cheapest checks, and the thing that would have caught all six
> is a reflex rather than a judgement."

So the rule is not "verify important claims" — importance is exactly the signal that
misled it. **Any claim about the tree that a single command would settle, gets the
command.** Especially the ones that feel too small to bother with; those are the
population the failures were drawn from. This applies to the orchestrator identically, and
it has already caught two of its own errors that way.

### 1.2e-bis Why the PM tier confabulates, stated structurally

Both PMs that finished a phase independently diagnosed their own reporting failures, and
P2's formulation is the one to keep:

> "the PM tier cannot check its own claims against the code, so it will restate reasoning
> as measurement unless something downstream is told to verify it."

That is not a character flaw in a particular agent; it follows from the tier's defining
constraint. A PM is forbidden from reading source — which is what keeps its context
usable — and the same prohibition removes every means it has of distinguishing something
it *derived* from something it *ran*. Four of P2's claims and six of P0's were overclaims
of exactly this kind, and workers or verifiers caught every one.

So the verifier and reviewer roles are not quality theatre layered on top of a working
system. **They are the only thing standing between this architecture and a confident
fiction**, and a phase that economises on them is not saving effort, it is removing the
sensor. Both PMs volunteered their own failure lists unprompted; treat that as the
expected standard for a stand-down report rather than as unusual candour.

### 1.2e-ter A PM's acceptance criteria are the weakest thing it produces

PM-SHELL named this about itself and it is sharper than §1.2e-bis:

> "My acceptance criteria are the weakest artefact I produce, because they are the one
> thing I write that I cannot check against the code."

A PM's *reports* being unverifiable is bad. Its *acceptance criteria* being unverifiable is
worse, because criteria are **prescriptive** — a worker handed an impossible one must
either obey it, which produces wrong work, or refuse it, which costs a round trip and
only happens if the worker has been told it may. In one cluster, three separate workers
declined to build on their PM's assertions: two refused unsatisfiable acceptance criteria
and proved why, and a third re-derived a premise its brief had explicitly filed under
*"what is already ruled out, so do not re-derive it"* — and found it false.

Two consequences:

1. **Every acceptance criterion a PM writes should be checkable by the worker before it
   starts**, and the brief should say so in as many words. A criterion the worker cannot
   evaluate up front is a criterion the PM could not evaluate either.
2. **"Already ruled out, do not re-derive" is the most dangerous sentence in a brief.** It
   is an instruction to skip exactly the cheap check §1.2e says never to skip. Use it only
   for things settled by a command whose output is quoted in the brief.

### 1.2f Escalate on conflict, not only on uncertainty

The worker that stopped a cluster rather than comply was not being careful in general. It
was holding one specific line — that the golden could not be regenerated under a
conflicted instruction — and was willing to halt over it. PM-MODEL's reading, which is
right:

> "a tier that only escalates when it is uncertain would have picked one of my two
> conflicting instructions and been quietly wrong."

Two confident, contradictory instructions produce **no uncertainty** in the receiver, so an
uncertainty-triggered escalation never fires. Every brief must therefore say: **if two
instructions conflict, stop and report the conflict — do not choose between them**, however
clear each one is on its own.

### 1.2g The mesh is asymmetric: a PM can reach a live worker, a worker cannot reach its PM

Measured in both directions in one exchange: a PM's `SendMessage` to a live worker
**arrived**, while that worker's reply got `No agent named 'general-purpose' is reachable`.

Two consequences, and the first is the one that keeps getting violated:

1. **When a PM needs one fact about the code, it asks a live worker.** Not guesses, and
   not "just a `grep`". A PM that ran `grep` over a source file to settle a single digit
   recorded the lesson itself: *"`grep` not being `Read` is not a defence — the
   prohibition is about what a PM's context may hold"*, and **the shortcut was not even
   faster**, because it returned three irrelevant lines and the round trip happened
   anyway, one step later.
2. **A worker's final report remains the channel of record upward**, because nothing else
   reaches. Every brief says so already; this is why.

### 1.2h Mark relayed reasoning as relayed

The highest-leverage line written in P3 was one sentence in a worker's brief:

> "this is C-1's argument, I cannot check it, verify it rather than build on it"

That is how a hole in the prior task's seam was found. A PM necessarily relays reasoning
from one worker to the next and **cannot check any of it** (§1.2e-ter). Marking a relayed
claim as relayed costs one line and converts a premise into a question. Standing practice:
when a brief carries a conclusion the PM did not measure, it says whose it is and that it
is unverified.

Worker pushback across P3 stands at **nine for nine** — and four of those were workers
correcting *each other*, not their PM. That is the mechanism this rule feeds.

### 1.3 Orchestrator rules

- Do not read source to answer "is X done?" — ask the PM.
- Exception: **fewer than three commands**, where delegating plainly costs more (`git log`,
  `git status`).
- Direction goes down; escalations come up. Do not re-plan a phase in flight.
- **Approve each PM's decomposition before it dispatches anyone** (§5.5). This is the one
  chance to catch a sixty-worker phase, and it costs a list rather than a diff.

---

## 2. Invariants every worker is handed, verbatim

1. **TDD is mandatory.** No production code without an observed failing test. Report RED
   and GREEN output. A test that passed first run is not evidence.
2. **`src/core/` imports nothing from `src/node/` or `src/web/`.** Svelte exists only in
   `site/`.
3. **Comments carry rationale, not description.** A constant with no recorded reason is a
   review failure. Match the surrounding density.
4. **Assert on structure, not on values.** Pin the guarantee, not today's output.

   *Standing exception, narrowly: the preset golden.* It was written as a temporary
   exception scoped to a fixture that would be deleted at merge; the fixture is being
   kept, so the exception is now **precedent** and needs its boundary stated or the next
   PM wanting to pin values will simply cite it. A value-pinning fixture is legitimate
   only when all three hold: it pins the output of a **pure, deterministic compiler**; its
   inputs are **enumerable from a registry** rather than hand-listed; and it exists to
   **prove a refactor preserved behaviour**. A golden over a rasteriser, a renderer, or
   anything touching font metrics fails the first test — and this repo has the evidence:
   the golden's own authors had to keep it strictly upstream of `raster.ts` precisely
   because `Math.cos` and `@napi-rs/canvas` make everything below it machine-dependent.
5. **Never alpha-blend depth.** `depth[i] = max(depth[i], layerDepth × mask[i])`.
6. **Perceptual thresholds live in functions, never inlined** (R22).
7. **Name the pixel space** wherever a count appears — scene px, plate px, backing-store
   px (×`noiseScale`, default **2**), device px (×snap scale ÷ dpr). Four spaces, not two.
8. **Do not reformat or tidy files you were not asked to change.**
9. **Use the `git` wrapper on PATH**, never `/usr/bin/git`.
10. **No time estimates**, in code or reports.
11. **Build before you test**, always — see §6. `npm test` on an unbuilt tree silently
    skips the Pages-critical assertions and still reports green.

---

## 3. Phase map

Dependencies, authoritative. There is no second diagram; revision 1 had one that
contradicted this table.

| Phase | Owner | Depends on | Closes |
|---|---|---|---|
| **P0** Scene model | PM-MODEL | — | R9, R10 |
| **P0b** Off-stage endpoints + the guards P0 left | PM-ENDPOINTS | P0 | *nothing new — closes gaps in R9* |
| **P1** `shared/` + `.stst` | PM-SHARED | P0 | R17, R18 |
| **P7** Perception module | PM-SHARED | P0 | R22 *(model half)* |
| **P2** Player | PM-PLAYER | P0 | R14–R16, R20, R21 |
| **P3** Editor shell + teardown | PM-SHELL | P0, P2 | R2, R3, R4, R6, R7, R8, R13 |
| **P4** Canvas, layers, depth strip, diagnostics | PM-CANVAS | P3, P7 | R5*(layers)*, R11, R12, R22 *(view half)* |
| **P6** Timeline | PM-TIME | P3, P4 | R5*(timeline)*, R9 |
| **P5** Asset import | PM-ASSETS | P3, P4, P1 | R5*(upload)*, R19 |
| **P8** Polish | — | P4, P6 | *nothing — cut without ceremony* |

**R1 is closed by the effort, not a phase.** The build is not done until R1–R22 each appear
in a merged phase's Closes column; the orchestrator checks this before declaring done.

**PM-MODEL and PM-SHARED are separate**, where revision 1 merged them. The dry run put
P0+P1+P7 at 30 tasks — three phases sharing one report stream. The merge was argued on
*review* cost; the binding constraint is *supervision* cost, and they point opposite ways.

**The P4↔P6 cycle is broken in P3.** Revision 1 claimed they were concurrent; they are
mutually dependent — P6's filmstrip needs P4's depth canvas, P4's swept depth range needs
P6's playhead. Resolution: **scene time and the transport primitive (`currentTime`,
play/pause/seek) belong to P3's store**, not to the timeline. P2 already builds transport
for the player; P3 lifts it into the editor. Then P4 and P6 both consume it, and the
order is P4 → P6.

**Genuine concurrency is P2 ∥ (P1 + P7)**, which share no files.

**P0b was not planned and is recorded here after the fact.** It exists because P0 landed
green with one design item unbuilt — design §4.2's symbolic off-stage endpoints — and that
omission had three consequences nothing would have caught: two `PresetCtx` fields with no
reader, the plate-vs-stage margin relationship with no assertion, and no shipped scene
rendering a scroll's far endpoint, which is why one stayed wrong by 17px. It also carries
`composeAnim`'s unguarded channel list and the prototype-chain defect P2 escalated out of
`site/scene.ts`.

The lesson for later phases: **a phase can pass its own gate with a design item simply
missing**, because the gate checks the criteria list and the criteria list is derived from
the plan rather than from the design. Where the two disagree, nothing fails. A PM should
diff its design sections against its criteria before dispatching, and report any item the
criteria do not cover.

---

## 4. Branches

- One branch per phase, `feat/<phase>-<slug>`, cut from `main`.
- Workers commit in-tree, sequentially. Worktree isolation only for provably disjoint file
  sets with a reason to overlap; the default is sequential, because merge resolution is
  work the orchestrator cannot supervise from reports.
- **A branch rebases onto `main` before its gate runs, and the gate runs after.** Gate
  evidence must describe the tree that will actually merge. A conflicting rebase is an
  escalation.
- PMs report `ready-to-merge`. **The orchestrator merges**; nothing is pushed without
  Shaun.

### 4.1 Starting state — measured, not assumed

As of `e5956f5`:

- **All of the below is on `feat/transform-axis-rotations`, not on `main`.** `main` is at
  `c0ba109`. An earlier draft of this section claimed the opposite, which would have had
  P0 cut a branch from `main` and silently discard both the rotation work and all four
  planning documents. `main..feat/transform-axis-rotations` fast-forwards cleanly, and
  doing so is a precondition of P0.
- The planning documents are committed (`129b626`, `e5956f5`).
- `rotateX`/`rotateY` are committed (`400ba98`).
- **Baseline on `main` before this work: 855 tests.** With `400ba98`: **862 passed, 8
  skipped, 42 files.**
- **8 tests are environment-skipped** (`HAVE_FFMPEG`, `HAVE_TSC`, `HAVE_STRIP_TYPES`), and
  `purity.test.ts` / `dist.test.ts` are `skipIf(!built)` with **mtime-based** freshness. The
  count legitimately moves with machine and build state. It is not a gate on its own.
- **`npm run typecheck` exits 2** — two `TS2304: Cannot find name 'Track'` at
  `src/core/anim/track.test.ts:126` and `:131`. A missing type import.
- **The animatable-channel list is duplicated three times** — `src/core/anim/track.ts`
  (guarded), `src/cli/scene.ts` (`KEY_CHANNELS`, unguarded), `site/scene.ts` (hardcoded,
  unguarded). Both validators currently drop `rotateX`/`rotateY`. The suite is green and
  cannot see it.

P0 inherits these as **facts**, not as an audit.

---

## 5. Contracts

### 5.1 Orchestrator → PM

Scope and exit criteria (§7) · design sections by number · requirements by R-number ·
**§2 invariants** · **§9 traps** · **design §12 (what is and is not testable here)** ·
the phase's token scale from design §13 · **baseline: branch sha, `main` sha, test
counts** · which phases have merged and at which sha · escalation triggers (§8).

Not included: how to decompose.

### 5.2 PM → worker

| Field | Content |
|---|---|
| Task | One behaviour, one acceptance criterion |
| Files | Expected to change; outside needs escalation |
| Design ref | The section it implements |
| Invariants | §2, verbatim |
| Traps | §9, verbatim |
| Survey | Task 0's report |
| Baseline | sha and counts |
| Acceptance | How the verifier will judge — stated *before* the work |
| Forbidden | What not to touch |

### 5.3 Worker → PM

```
WHAT CHANGED   files, one line each
RED            the failing output, quoted, per test
GREEN          the passing output
SUITE          build first, then `npm test`; exit code and counts
TYPECHECK      exit code — see trap §9
DEVIATIONS     anything done differently, and why
UNCERTAIN      anything not confident about
```

A worker reporting nothing `UNCERTAIN` on a non-trivial task has not looked.

### 5.4 PM → orchestrator

```
PHASE          id, branch
STATE          not-started | surveying | decomposed | in-progress | gate-pending
               | ready-to-merge | blocked
BASELINE       branch sha, main sha rebased onto, baseline counts
FILES          paths touched (paths only — this is what makes collisions visible)
TASKS          n tasks, n implementers, n verifiers, n re-runs
GATE           typecheck exit · build exit · build:site exit · test exit · passed/skipped/files
REMOVED TESTS  name + one-line reason, or "none"
DONE           one line per criterion
NOT DONE       criteria outstanding, and why
DEVIATIONS     differences from the design, with reasoning
ESCALATIONS    decisions for the orchestrator or Shaun
RISK           what is most likely to be wrong
```

**No code and no diffs in a PM report.** `DONE` is capped at one line per criterion; the
worker's full test output stops at the PM.

### 5.5 Decomposition approval

After its survey and before dispatching any implementer, a PM reports its **numbered task
list** and waits. The orchestrator may veto or demand a split.

---

## 6. The gate

A **gate runner** (implemented none of the phase) executes exactly this, in CI order, and
reports the exit codes:

```sh
git rebase main                                           # conflict ⇒ STOP, escalate
npm run typecheck > /tmp/tc.log 2>&1; echo "typecheck=$?"
npm run build      > /tmp/b1.log 2>&1; echo "build=$?"
npm run build:site > /tmp/b2.log 2>&1; echo "buildsite=$?"
npm test           > /tmp/t.log  2>&1; echo "test=$?"; tail -5 /tmp/t.log
```

`ready-to-merge` requires all of:

1. Every exit criterion met, evidenced by **verifiers** who implemented none of it, each
   having re-established RED itself (§1.2).
2. All four exit codes 0.
3. Counts compared against **the branch's own recorded baseline**, not a fixed number.
   Builds must have run first or the comparison is void.
4. **Any net test removal itemised by name with a one-line reason.** One removal is
   pre-authorised: `site/markup.test.ts`, rewritten against the player, in **P3**. Every
   other removal is an escalation.
5. A reviewer worker, **two rounds maximum**, with no unresolved findings.
5a. **A null measurement needs a paired control.** Where a criterion is discharged by
   evidence of the form "nothing changed", the verifier must also exhibit a control
   mutation that **the same instrument** turns non-null. In V-B's words:

   > "Nothing moved" is evidence only to the extent that something could have moved and
   > been seen; without a paired control a null is indistinguishable from a broken
   > instrument.

   This is **not** the rule that a mutation test must be shown capable of failing — that
   is about the test. This is about the *instrument*: whether it could have seen the thing
   it reported as absent. In P0b it caught a real hole. A criterion was presented with two
   independent proofs of zero movement, and the render-level one is **vacuous for the far
   endpoint**: because `duration = travel / speed`, substituting a grossly wrong `to`
   leaves every rendered frame byte-identical. That "proof" could not have detected the
   error it was offered against — and the far endpoint is precisely the quantity that had
   previously been wrong by 17.33px.

   **An unasserted `report()` or `[measured]` line is an instrument with no failure
   mode.** This repo holds roughly 126 of them: they print and nothing asserts them. So a
   claim of the form "nothing in the suite sees X", resting on that corpus, is inadmissible
   under this rule unless the measured **values** are diffed under the mutation rather than
   its pass/fail. That is how V-B found a claim overstated — under one mutation five tests
   reddened *and* three unasserted measurements moved, one of them an emitted-stereogram
   measurement that no assertion would ever have mentioned. Diff the values, sorted with
   their labels; raw order is unstable.

   **Anywhere this procedure is referenced, name both halves of it.** "Re-run the
   mutation" is an instruction to do half — it reproduces the reddened *tests* and not the
   moved *measurements*. A comment or brief that says only the first is pointing a future
   reader at the weaker of the two procedures, which is how a note that looks like a
   pointer becomes a dead end. The orchestrator wrote exactly that wording into a fix
   instruction and a verifier caught it.

   **And a tripwire must make the right fix the easy one.** P0b's own risk note names the
   failure: a guard that fires saying "tag it `scenePx`" invites the reader to tag a
   `degrees` parameter `scenePx` to go green, shipping a wrong unit downstream. The
   message offered the correct second route and the wrong one was lazier. A guard whose
   cheapest satisfying action is wrong is a guard that will eventually be satisfied
   wrongly, so the message has to make the correct route the path of least resistance —
   not merely mention it.
6. Deviations either reverted or recorded in the design document.

The orchestrator reads the report of 1–6 and merges. It does not re-verify.

---

## 7. Phase specifications

**Preamble, binding on every phase.** No tier in this system has a browser, and design §12
excludes Svelte component DOM from testing. **Every criterion below must be restated by
the PM as a predicate over a plain, importable module before it becomes a task.** A
criterion that cannot be is an escalation *before* any worker is spawned; the orchestrator
then funds a harness, restates it, or cuts it.

> Worked example — "handles drawn 8–10px, hit-tested 24×24" becomes: *`hitTest(handles, p)`
> returns the handle for any `p` within 12 **CSS** px of its centre, and `handleRadius()`
> returns 4–5 CSS px; asserted on constructed inputs, no DOM.*

Criteria are numbered for reference, not for dispatch order. **Several are explicitly
multi-task**; the PM splits them per §5.2 and reports the split per §5.5.

### P0 — Scene model · PM-MODEL · design §4

**Ordering is load-bearing: 1 before everything.**

1. **Golden corpus first.** Every `PRESETS` kind compiled against a fixed `PresetCtx`,
   serialised to a committed fixture, captured **before any other P0 task**. There is no
   snapshot infrastructure in this repo and no record of current output. This is the §2.4
   exception.
2. Fix the typecheck break (§4.1) — two missing-import errors.
3. One guarded channel list. `src/cli/scene.ts`'s `KEY_CHANNELS` and `site/scene.ts`'s
   hardcoded list derive from the same constant as `track.ts`, with `AssertNever` on each.
   Adding a `Transform` field becomes a compile error in all three.
4. `Layer` gains optional `id` and `name`.
5. Id generation in `src/shared/`, used by both validators.
6. Both validators carry `id`/`name` through. **Note the site validator rebuilds
   field-by-field and silently drops unknown keys** where the CLI errors — so this is two
   different edits, and without it the site strips ids on every URL round-trip.
7. Verbs `move`, `rotate`, `scale`, `push`, each with its parameters **specified in the
   task brief** — the design names the verbs, not their signatures, and `rotate`'s unit
   in particular is a §9 trap. `flip` is sugar over `rotateY: π` (design §4.3).
8. Easing gains `cubic-bezier(a,b,c,d)`: parser, solver, widened type, four `in EASINGS`
   call sites, two validators.
9. **`move` compiles to exactly what `slide` did, and `push` to exactly what `emerge`
   did** — measured against criterion 1's golden. These are renames; the golden exists to
   prove they did not quietly become rewrites.
10. **Delete `marquee`, `bounce`, `bob`, `slide-in`** from `PRESETS` (design §4.2b).
    Their fixture entries are removed in a commit that says so. `move` gains an optional
    `speed` that derives `duration`, which is `marquee`'s only distinct capability.
11. **Rewrite `examples/*.yaml` to verbs — its own task, its own review.** All three use
    the old names.

    **Rewrite the tests freely.** A big refactor comes with test changes, and a test that
    breaks because the scene now says `move` where it said `marquee` is ordinary work.

    **The narrow exception is a moved *measurement*.** `metamorphic.real.test.ts` asserts
    properties of the *encoder* using these examples as fixtures — row locality, dead-zone
    row loss, per-seed silent-row counts. Those should not move at all unless the
    rewritten example is not equivalent to the old one: different travel speed, different
    resting position, different duration. So: **a changed measured number must be
    accompanied by the scene difference that caused it.** Accounted for, proceed;
    unaccounted for, escalate — that is the signal a verb does not do what we think.

    One sentence per changed number, and
    [`../2026-10-09-testing-retrospective.md`](../2026-10-09-testing-retrospective.md) is
    why it is worth that sentence: five defects this suite could not see were caught by
    measurement, and a silently-updated figure is how that evidence gets destroyed.

**Not in P0:** bundles — design §4.2a makes them UI macros, owned by P6.

**No allow-list, no `uiVisible`.** Both existed only to keep deleted presets reachable.

**Escalation already known:** design §4.2 does not give parameter signatures for the
verbs. PM-MODEL proposes them and the orchestrator approves before dispatch.

### P1 — `shared/` and `.stst` · PM-SHARED · design §6.2

1. Zip writer over `CompressionStream('deflate-raw')` plus a hand-written central
   directory. No dependency.
2. Zip reader — **must read a zip produced by `/usr/bin/zip`**, not only our own writer.
3. Output extracts cleanly under `/usr/bin/unzip -t`, asserted by shelling out.
4. Container layout: `scene.json`, baked masks, original sources, manifest.
5. **Determinism specified**: fixed mtimes, fixed entry order, fixed compression level.
6. `stst` reads and writes `.stst`. **Subcommand names are an escalation** — `args.ts`'s
   `COMMANDS` is `['render','still','preview']` and the design names no new one.
7. CLI and site produce identical bytes for one scene. **If `CompressionStream` is not
   bit-identical across Node and Chromium this is unachievable** — the survey worker
   checks this first, and it is an escalation if false.
8. A purity guard for `src/shared/`. There is none today, and both P1 and P7 put
   browser-reachable code there.

### P7 — Perception module · PM-SHARED · design §10

1. `src/shared/perception.ts` — `encodableDepths`, `quantisationStep`, `collidingPairs`,
   `fusionComfort`, `strokeLegibility`, `depthStops`, `cardboarding`.
2. Each returns quantities **and** a grade; a caller wanting numbers never reads the grade.
3. **`fusionComfort` keys on the budget, not `sepNear`.** Pinned: fires at
   `sepFar:140, sepNear:78` (budget 62), silent at `100/80` (budget 20).
4. `encodableDepths` reports stage capacity **and** the `linked` dead strips.
5. Today's legibility rule moves in with **no threshold change**. The wrapper shape of
   criterion 2 is the permitted change; the numbers are not.
6. No perceptual constant inlined outside this file. **Scoped to a named list** — the
   survey worker enumerates candidate constants and the PM fixes the list before dispatch,
   because "is this constant perceptual?" is otherwise unjudgeable.

**P7 does not touch `site/main.ts`.** Revision 1 had it rewiring a file P3 deletes, while
running before P3. The module lands standalone; P4 consumes it.

### P2 — Player · PM-PLAYER · design §3.2, §8

1. Separate Vite entry.
2. `?fit=contain|snap|render`, default `contain`.
3. `?smooth=auto|on|off`, default `auto` — smooth down, pixelated up. Query, not fragment.
4. `cover` is not implemented, and the reason is recorded where someone will look.
5. Transport primitive: play/pause/seek over scene time. **P3 lifts this into the editor
   store**, so build it as a module, not as player-local state.
6. Present mode, iframe embed, and fullscreen — each with transport (R16).
7. Fullscreen targets a **wrapper**; transport container `pointer-events: none`, controls
   `pointer-events: auto`; canvas click target preserved.
8. Nothing added above the canvas in flow (design §8.3).
9. Relative asset paths preserved.
10. `dist.test.ts` asserts no editor code in the player bundle. **This is a tautology
    until P3 exists** — flagged so it is re-verified as a P3 criterion rather than assumed
    to have teeth now.

### P3 — Editor shell and teardown · PM-SHELL · design §5.1, §9, §11, §3.4

0. **Install Svelte 5**, the vite plugin, and `.svelte` handling in
   `tsconfig.typecheck.json` and vitest. None of it is present today.
1. A real guard that nothing under `src/` imports `svelte` or a `.svelte` file.
   **`purity.test.ts` cannot do this** — it parses `dist/core` only and can never go red
   from a change in `site/`.
2. Registries: `LayoutConfig`, `PANELS`, `CONTROLS`, `OPERATIONS`, `SHADINGS`, `VIEWS`,
   `FIT_MODES`. *(Seven. `VIEWS` was missing from revision 1; `FIT_MODES` is a retrofit
   around what P2 already shipped.)* **This is seven tasks.**
3. One registration test per registry — a dummy entry appears without touching another
   file. **Seven more tasks.** This is what makes R7 falsifiable.
4. Per-layer-variant `AssertNever` guards (design §9.1). **Do not attempt one guard over
   `Scene`**; §9.1 says why.
5. Each `PresetFn` declares its own parameter descriptors.
6. Reachability: every `CONTROLS` entry resolves to exactly one mounted panel under the
   default layout.
7. Mark-based undo — one history entry per interaction.
8. Scene store; **the URL hash becomes a projection of it** (design §3.4, R13).
9. Scene time in the store, consuming P2's transport module (§3).
10. **Teardown, with a per-file disposition table** — port / rewrite-against-player /
    delete — covering `site/main.ts` (1346 lines), `site/index.html`, and
    `controls.test.ts`, `markup.test.ts`, `present.test.ts`, `scale.test.ts`,
    `diagnostics.test.ts`, `depthmap.test.ts`, `stageguide.test.ts`. The pre-authorised
    removal in §6.4 is here.
11. **R2/R8 architecture test**: a second `LayoutConfig` plus a visibility set yields a
    reduced editor with no second app and no code outside the layout module.

**`CONTROLS` is complete; visibility sets select from it.** A filtered registry would fail
criterion 6.

### P4 — Canvas, layers, depth strip, diagnostics · PM-CANVAS · design §5.2–§5.6, §10.7

0. **Per-layer geometry API in `src/core/`** — bbox in scene px and occupied depth range,
   for all four browser-reachable layer types. `rasterDepth` composites to one buffer and
   `prepare()` is private, so this does not exist. **It is a `src/core/` change inside a
   `site/` phase: escalate before starting**, since criteria 4, 5 and 8 all block on it.
1. `VIEWS` entries: `depth`, `stereo`, `both`. View switcher out of normal flow (§8.3).
2. `SHADINGS`: `grey` (byte-identical to today), `ramp` with configurable `[near, far]`
   domain defaulting `[1, 0]` plus an `auto` mode, `relief` (azimuth constrained above
   horizon), `turbo`. **Four tasks plus the domain control.**
3. Hold-to-reveal greyscale; hold-to-peek stereogram.
4. Depth strip: ticks for flat layers, **bars for heightmaps**, swept ranges for animated
   depth following the playhead, dual axis labelled **scene px**, stop detents from P7.
   **Five tasks.**
5. Layer panel: eye, lock, thumbnail, inline rename with Tab-to-next, multi-select, sort
   by depth or authoring order. **No drag-reorder** — `max` is commutative and the gesture
   would be a no-op. **Six tasks.**
6. Depth-tie badge, firing only on **overlapping** equal-depth layers.
7. `OPERATIONS`: layer create-by-type, delete, duplicate. **Action and keyframe operations
   belong to P6**; P4 must leave the registry open for extension without modification,
   which is what P3's registration test proves.
8. Three canvases at their own cadences; dragging never waits on an encode.
9. 8-handle bbox, rotation handle, and the modifier set. **Six tasks.**
10. Handles drawn 8–10 CSS px, hit-tested 24×24 CSS px.
11. **Diagnostics panel and the occupied-levels histogram** (design §10.7), plus
    fusion-comfort surfaced on the `sepFar`/`sepNear` controls (§10.2). This is R22's view
    half, which revision 1 assigned to nobody.
12. **Amend `site/depthmap.ts`'s recorded rationale in place** — do not delete it. It
    argues against a default ramp; design §5.2 records why R12 overrides it.

### P6 — Timeline · PM-TIME · design §7

1. Layer rows expanding to property rows; actions attach to a property by right-click.
2. Action bars labelled with the semantic action, collapsed; expansion opt-in.
3. **Composition is sum/multiply**, matching `composeAnim`. The inspector shows the
   composed value alongside each contribution.
4. Repeat-ghosting, derived-duration (`marquee` from `speed`, which writes back into a
   parameter the bar does not represent), and open-ended absent-duration bars. **Three
   tasks.**
5. Design/Animate mode toggle.
6. Transport UI over P3's scene time: playhead drag, `,`/`.`, `Shift` ×10, Option-drag to
   scale timing. **Four tasks.**
7. Scrub against the depth map; re-encode on scrub-end.
8. Depth-thumbnail filmstrip on the ruler.
9. **Bundles as UI macros** (design §4.2a) — `entrance` and `flyIn` write `Anim` arrays at
   attach time. No allow-list — the legacy kinds were deleted in P0 (design §4.2b).
10. `OPERATIONS`: action attach/detach/duplicate/expand, keyframe insert/delete/duplicate.
11. Built, not vendored. Real estate reserved for a later curve editor.

### P5 — Asset import · PM-ASSETS · design §6.1, §6.3

1. PNG → silhouette mask (alpha or luma threshold) or heightmap (**luminance**, design
   §5.2a), baked at scene resolution.
2. Source cached in IndexedDB; **the scene renders without it**.
3. Re-derive on scene resize and on threshold change.
4. Heightmap imports warn on URL viability; `.stst` is the supported path when they do not
   fit.
5. Link-size meter with a shareability band.

### P8 — Polish

Eyedropper, motion paths, onion skin, `U` key, Option-drag timing scale. **Closes no
requirement.** Cut without ceremony.

---

## 8. Escalation

A PM escalates rather than deciding when:

- A design section is **wrong about the codebase**. This happened five times in one review
  pass and twice more in the dry run. Treat it as likely.
- An exit criterion cannot be restated as a module-level predicate (§7 preamble).
- An exit criterion cannot be met as written.
- A task must touch files outside its phase.
- Two phases would conflict in one file.
- A requirement looks unsatisfiable.
- **A verifier and an implementer disagree.** The PM does not adjudicate — it cannot read
  the code. It forwards both reports.
- **A worker's change turns a test red in a file owned by an already-merged phase.**
- **A rebase onto `main` conflicts.**
- A worker's `UNCERTAIN` cannot be resolved with one more worker.

**While escalated, a PM continues only on tasks provably independent of the open question,
and names the parked tasks in its report.**

The orchestrator escalates to Shaun when a decision changes **what is built** rather than
how.

---

## 9. Known traps

Each already cost a correction. Hand this table to every worker.

| Trap | Reality |
|---|---|
| `npm run typecheck \| tail` exited 0, so it is clean | `$?` after a pipeline is **`tail`'s** status. Redirect to a file and echo `$?`. |
| a freshness gate skips when stale | Not always — and the other failure is worse. `purity.test.ts` had **no freshness gate at all**, only `existsSync`, so it *silently passed* over stale output rather than skipping. On a tree stale by `touch` alone: 62 files, 1349 passed, **22 skipped, exit 0**. A silent pass is a green claim about output nobody checked; a silent skip is at least absent. |
| the suite is 862 tests | 855 on `main`; 862 with `400ba98`; ±8 move with ffmpeg/tsc availability, and `dist.test.ts` freshness is **mtime**-based. Build first or two suites skip silently. |
| `purity.test.ts` guards `site/` | It parses `dist/core` only. Nothing in `site/` can turn it red. |
| the channel list is guarded | Guarded in `track.ts` only; duplicated unguarded in `src/cli/scene.ts` and `site/scene.ts`. |
| the two validators behave alike | The CLI **errors** on unknown keys; the site **silently drops** them via a field-by-field rebuild. |
| layer order is paint order | `max` is commutative — order is inert, and drag-reorder would be a no-op gesture. |
| later animator wins | `composeAnim` **sums** every channel and **multiplies** `scale`. |
| resting and animated depth are independent | `emerge` anchors to `ctx.layerDepth` deliberately. D4 is withdrawn; do not "fix" it. |
| cardboarding needs a rasteriser change | `heightmap` mode and `depthBlur` already ship. The gap is `text` and `shape` only. |
| the fusion cliff is `sepNear` 78 | It is a **budget** of ~32px. 78 is its value only at `sepFar` 110. |
| every layer has one depth | Heightmaps carry a range; animated depth sweeps one. |
| one `AssertNever` can span `Scene` | It cannot — union `keyof`, lost provenance, `Preset`'s index signature. |
| a bundle can be a `PresetFn` | `PresetFn` returns one `Track`, which has one `ease` and one `repeat`. |
| scenes can be serialised | **There is no scene writer.** Only a parser. |
| `rotate` is in degrees | `Transform.rotate` is **radians** (`ctx.rotate` takes radians); `shape.start`/`end` are **degrees**. Design §9.1 cites this exact collision. |
| the canvas shows the stage | It shows the **plate**. Hit-testing crosses scene → plate → backing-store (×`noiseScale`) → device (×snap ÷ dpr). |
| `sans-serif` resolves everywhere | It resolved to dingbats in `@napi-rs/canvas` for a day. |
| the plate can be cropped to the stage | Margins are the fusion partners of the stage's edge columns. |
| `comm -12` reported no overlap, so there is none | Not without `LC_ALL=C`. `sort` and `comm` disagree on collation otherwise and silently report **no** overlap — a fail-open answer to "do these two sets intersect". Nearly cost a rebase check. |
| `grep -n` gave me the line number | Not over diff output it did not — that numbers the *diff*, not the file. It produced `:1665` and `:1728` for a 1281-line file, and the impossible numbers then travelled through two reports before anyone checked them against `git show <sha>:<path> \| grep -n`. |
| "build 0" is evidence the import is absent | It is not. `tsc` **elides** an unused import, so `dist/` is clean and the build is green while the dependency is right there in the source. A `.svelte` import from `src/` was measured to resolve and execute under vitest, and for the package form `typecheck` **and** `build` are both 0. The only sensor is a test that reads the source. |
| a guard derived from the roster it guards is a guard | It proves only that the derivation ran twice. An `AssertNever` pair over a union built from the *same* rosters as the registry it checks is self-referential and cannot fail for the reason you want. Point the guard at the **vocabulary** — the upstream types, with the tuples written out — and leave membership to whatever guards the roster itself. |
| a total in a document is a count of something | Not necessarily. A survey paragraph gave a control population of **64**; it was using two arity conventions at once — a pair counted as one control in two of its buckets and as two in the third. Under one convention the answer is 63, under the other 68. **64 is neither, and pinning it would have produced a wrong registry that was green.** Cite the length of the thing (`CONTROL_IDS.length`), never a total someone wrote down. |
| a numeric floor chosen from today's count is a check | It is the same defect as a hand-written list, in numeric form. A specifier floor of 160 was **overtaken inside its own cluster** — `src/core` reached 162 before the phase ended. Derive it, or make it a ratchet; never a literal picked from a measurement taken once. |
| a hand-written list of "the places that do X" is a check | It goes stale silently the day a second place does X. Derive it from the thing that makes a site one of them — the call sites, the registry, the token table — never from an enumeration someone typed. |
| a stale comment is a stale comment | Two kinds, and the cheaper one is not worth a third edit. A **pointer** (a path, a file name) goes stale when the target moves: the comment is wrong, a `grep` finds the truth, and nothing silently passes. An **assertion** (a test title, a measured value, a claimed mechanism) goes stale when the subject changes: the comment is now **false**, and a reader who trusts it is misled. Fix false assertions; let stale pointers wait for the file to reopen. |
| the arithmetic is wrong, because the output is wrong | Look **upstream of the computation** before auditing it. A fractional-viewport scrollbar was reported as "the canvas width rounds up"; nothing in the fit rounds up, and `renderFit`'s contract already said so in writing. The defect was `clientWidth`/`clientHeight`, which return an integer **rounded to nearest** — the fit was perfectly correct about a box that did not exist. Both the report and the orchestrator's hypothesis named the wrong layer. |
| headless reproduces what headful does | Not in the sub-pixel regime. Headless Chromium and Firefox have **zero-width scrollbars**, and `scrollWidth` / max-`scrollLeft` are integer-snapped — structurally blind to exactly this bug class. The reproduction needed a real page, a real fractional layout viewport, and **headful under Xvfb**, reading the gutter as `offsetHeight - clientHeight`. |
| a recorded note is a sensor | It is not. A note tells whoever reads it; nothing makes them read it. Where a gap is accepted, convert the note into a test that goes red the day someone crosses it. |

---

## 10. Sequencing

1. **PM-MODEL** — P0.
2. **PM-SHARED** (P1, P7) ∥ **PM-PLAYER** (P2). Genuinely disjoint.
3. **PM-SHELL** — P3.
4. **PM-CANVAS** — P4, alone.
5. **PM-TIME** — P6, after P4 merges.
6. **PM-ASSETS** — P5.
7. P8, or cut.

At most two PMs active. The limit is report streams the orchestrator can hold without
reading code to disambiguate them.

**Before declaring the build done:** every R1–R22 appears in a merged phase's Closes
column (§3).

---

## 11. What revision 2 changed

| Revision 1 | Why it was wrong |
|---|---|
| PMs never inspect the repo | Viable only with §1.1's survey worker; a dry run needed 14 files to decompose two phases |
| the branch carries the work | It had zero commits; the work was an uncommitted tree and the docs were untracked |
| suite and typecheck never run | Suite green; typecheck exits 2 with two missing-import errors |
| baseline 862 | 855 on `main`; ±8 environment-dependent |
| `AssertNever` ties the channel list | Three copies, one guarded |
| examples round-trip byte-identically | No scene writer exists |
| P4 ∥ P6 | Mutually dependent; broken by moving transport to P3 |
| PM-MODEL owns P0+P1+P7 | 30 tasks — split into PM-MODEL and PM-SHARED |
| gate evidenced by a verifier | Most criteria were gestures no tier can test; §7's preamble now forces module predicates |
| observed RED is mandatory | Unenforceable until §1.2 made the verifier re-establish it |
| `uiVisible` on `PRESETS` | Changes the registry's value type and collides with P3's descriptors; now a UI allow-list |
| P7 rewires `site/main.ts` | A file P3 deletes, in a phase that runs earlier |
| six registries in P3 | Seven, and fourteen tasks with their tests |
| R2, R8, R19 closed by nobody | Now P3, P3, P5 |
| teardown owned by nobody | P3.10, with a per-file disposition table |
| Svelte "in `site/` only" | It is not installed, and `purity.test.ts` cannot guard it |
