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

### 1.2i The orchestrator is subject to the same shift change, and this plan forgot to say so

§1.2a mandated a ledger and a clean hand-off for tier 1 and said nothing about tier 0 —
an omission the repo owner caught, not the orchestrator. The role that holds every
standing ruling, every open escalation and every cross-phase decision is the one with no
succession document.

So: **`docs/plans/2026-10-14-orchestrator-handover.md` is the orchestrator's ledger**, it
is committed rather than scratchpad-resident (§1.2a's own rule — the scratchpad does not
survive the session), and it is updated at every state change. It carries the phase state
with evidence, the live agents, the standing rulings a successor would otherwise
re-litigate, the practice that has accreted beyond §1.3, and **the orchestrator's own
list of errors**, in the same convention imposed on every PM.

That last section is not ceremony. Ten orchestrator errors are recorded there, every one
caught by an agent below rather than by the orchestrator, and **every one was a claim a
single command would have settled, skipped because it felt too small.** That is §1.2e,
unchanged, applying to the tier that wrote it.

### 1.2j Provenance errors are a distinct class from fabrications, and they are harder to see

PM-SHELL-4 reported three errors and called them *"one error in three costumes"*: it
paraphrased a mechanism two documents already specified and invented a stricter third; it
relayed a worker's count as fact **inside the very sentence telling workers not to trust
counts**; and it added a correct, measured row to a table headed *"verbatim from the
execution plan"*, which cost a worker a `git log -S` across every branch to discover the
plan never contained it.

> "Every one was right in content and wrong about where it came from."

That is a different failure from §1.2c. A fabrication is false and a measurement refutes
it. A **provenance error is true**, so no measurement refutes it — what it corrupts is
the reader's ability to tell what is settled from what is proposed, and the cost lands on
whoever tries to trace it. §1.2h says mark relayed reasoning as relayed; this is the
inverse and equally binding: **never present your own reasoning as someone else's
authority.** A table headed "verbatim" contains only verbatim.

Both PMs who hit this were the ones enforcing §1.2h on everyone else.

### 1.2k Risk-proportionate guards: throw where a wrong answer ruins the artifact

A fourth `SMOOTH_MODES` member was planted: **typecheck 0**, one membership test red, and
the test named *"is total"* **passed and could not fail** — a declared return type plus a
fall-through chain cannot distinguish "has a policy" from "fell through". Third vacuous
assertion of the phase and the first in a merged file.

The accepted fix is a compile-time `AssertNever` `default:` arm that **returns the
existing fallback policy rather than throwing** — zero runtime change, reddens nothing.
The reasoning generalises:

> A wrong layout ruins the artifact; a wrong resampling hint costs a soft frame.

So guard *everything* at compile time, and reserve runtime throwing for the registries
where a wrong answer destroys output. A registry whose worst case is cosmetic should fail
loudly to the compiler and quietly to the user.

### 1.2l The source prohibition is the most-violated rule here, and the violations that *work* are the dangerous ones

**Three of five P3 shifts have crossed it.** One recorded a single `grep` as a
fabrication-class error and noted it was not even faster. One crossed it and **did not
record it**. One ran `git grep` over `site/` and reported it precisely because **it
returned a useful result** — which is the dangerous case, since a shortcut that works is
the one that gets taken again.

That rate means the pressure is structural, not a run of careless agents. The cause is
specific: **a PM between tasks has no live worker to ask** (§1.2g), so the choice looks
like "one `grep`" against "spawn an entire worker for one fact". The second feels absurd
and is correct.

So, stated plainly: **dispatching a worker to answer one question is a normal, cheap,
expected act.** It is not overhead and it is not an admission of failure. A one-question
survey worker costs less than a PM whose context now holds source it cannot unsee, and
far less than the fabrications that follow from a half-answer. If a PM finds itself
reaching for `grep`, that is the signal to dispatch.

### 1.2m Anything claiming to quote a document gets diffed against the document

Three defects in one shift, all in briefs and none in the code: a number that two required
documents disagreed on for an entire cluster (one had been corrected, nobody propagated it
back); a copied table that was **five rows short and carried one row the source has never
contained**; and a trap row that was wrong twice, the first correction costing a worker
four probe rounds.

A brief that says "verbatim" or "from §9" is making a checkable claim, and the check is
one diff. Run it on everything that claims to quote, not on the one you suspect — the PM
that found these ran it on `§9` alone and said so: *"everything else claiming to quote a
document is unchecked."*

This is §1.2j's cousin. A provenance error says *whose* a true thing is; a quote drift
says a thing is *verbatim* when it is not.

### 1.2n A brief points at a document the reader may not have

The plan is required reading for workers **from their own working tree**, and tier 0
amends it mid-phase. Those two facts are incompatible: a worker on a branch cut before an
amendment reads a stale rule and does not know it. This has now bitten twice in
consecutive shifts — both times the amended sections were the ones the brief specifically
told the agent to read, and one of them was a rule it was required to apply.

The receiving agent's `git log --oneline -1 main` has caught it **six times out of six**
and is cheap, so it stays. But the real fix is upstream of that:

- **A brief carries the content of anything added mid-phase, inline**, not a section
  number. A pointer is only safe for text that predates the branch.
- **Tier 0 batches amendments** and prefers phase boundaries. Eleven separate doc commits
  during one phase is recorded as orchestrator error 11 for a different reason and is the
  same root cause.

### 1.2o Verify the instrument, including your own

A PM diagnosed two of its own errors as one: *"I checked the output and not the
instrument."* It printed a verification command whose `sed` range swallowed part of what
it was meant to count, returning 38 rows against 33; and it wrote "two for two says you
should expect to find something" — a prediction from n=2, in the imperative voice the rest
of its brief reserved for measurements.

§6.5a already says a null measurement needs a paired control. This is the same obligation
turned inward: **the command you hand someone is itself an instrument, and a wrong one
reports confidently.** Run your own check against a case you know the answer to before
you ship it in a brief.

### 1.2p An audit is an instrument, and a relayed claim never leaves its label

Two from one shift, same root.

A PM repairing a document from an auditor's report **corrected its own auditor twice and
rejected two of its claims** — and recorded why that mattered: *"had I repaired from its
report unchecked I'd have introduced defects into the document I was fixing."* §1.2o says
verify your instrument; an audit is one. A report of defects is a set of claims, not a
work order.

And the sharper form of §1.2h: a PM received a false claim **inside a block it had itself
labelled "relayed, unverified"**, then restated it in its own voice without the label. Its
own diagnosis is the rule: *"a PM can't check that one, so the fix isn't 'verify it' — it's
never to repeat a relayed claim outside its label."* The label travels with the claim or
the claim does not travel.

### 1.2q `ps` is the PM-legal way to ask whether a worker is alive

When this PM was terminated mid-shift and resumed, the obvious inference was that its
in-flight worker had been orphaned. It **measured instead** — `ps` plus time-separated
sampling showed a live plant/revert loop around a stable deliverable — and did not
dispatch, because *"dispatching a worker there would have put two agents inside one
cycle."*

`ps` reads process state, not source, so it is inside the tier's boundary, and no shift
had used it. Use it before concluding a worker is gone, for the same reason §1.2b says a
task-notification is not a termination.

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
git merge main                                            # conflict ⇒ STOP, escalate
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

**Preamble, binding on every phase.** Design §12 excludes Svelte component DOM from
testing.

**Corrected 2026-10-15.** This read "No tier in this system has a browser", and a P1/P7
survey worker measured it false of this host: `/snap/bin/chromium`, `Xvfb`, and a
populated `~/.cache/ms-playwright` are all present — including `chromium-1234`, the exact
build `site/playerplan.test.ts:776` already names. The true statement is narrower: **the
default test harness has no browser, and a phase wanting one must fund a harness and say
so.** The wide reading had already caused a criterion to be deferred on it. A browser is
available to any phase the orchestrator funds it for; it is not available by default, and
CI must be shown to have it before anything depends on it. **Every criterion below must be restated by
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
7. CLI and site produce identical bytes for one scene — **by construction, not by the
   coincidence of two zlib wrappers agreeing on a default.**

   **Rewritten 2026-10-15 on measurement.** The survey measured
   `CompressionStream('deflate-raw')` byte-identical between Node 22.14.0 and Chromium 151
   across 9 fixtures with paired controls — **but Firefox 153 emits +59% and WebKit 26
   emits 10.7×**, differing at byte 0 or 1. All four round-trip exactly. Nothing guarantees
   the Node/Chromium agreement: the Streams spec fixes no level, strategy, `memLevel` or
   `windowBits`, and they agree only because both wrap zlib at default 6. The original
   criterion was therefore satisfiable today and would have silently stopped being true.

   **Ruling: the container is written with `method:'store'`**, which `writeZip` already
   supports. This makes the criterion hold **by construction in every engine**, needs no
   browser in the suite, and removes a whole class of escalation. The cost is file size,
   and it is close to nothing in practice because **a `.stst` is overwhelmingly already-
   compressed image data** — baked masks and original sources are PNG/GIF, where deflate
   buys ~0%; only `scene.json` and the manifest are compressible and both are small.

   **MEASURED 2026-10-15, and the reasoning above was wrong in the direction that matters.**
   "A `.stst` is overwhelmingly already-compressed image data, where deflate buys ~0%" is
   **right about photos and wrong about masks.** On a photo PNG deflate buys *less than
   zero* — 2,234,956 stored against 2,235,641 deflated, stored-block framing being overhead
   on incompressible input. But `scene.json`, `manifest.json` and **the baked masks** still
   deflate **18–65%**, cross-checked across five PNG encoders. Design §6.1 makes silhouette
   masks **the primary import path**, so the compressible files are the common case, not the
   exotic one — **the cost is concentrated exactly where I argued it would not be.**

   Measured against a threshold **stated before measuring** (material = ≥5% relative): the
   representative fixture (4 text/shape layers + photo + logo + 3-frame GIF + baked masks,
   2.44 MB) is **+4,777 B, +0.195% — not material.** But **case E, eight flat-graphic PNGs
   and no photo: 107,724 → 137,279, +29,555 B, +27.4%.** Absolute cost across the whole
   sweep is bounded at +478 B to +8,892 B except there. **Escalated to Shaun**, because the
   threshold was pre-registered and crossed, and moving a threshold after seeing the number
   is the failure this project spends its time policing.

   **This is conditional on measurement, not on the above reasoning being right.** A worker
   measures the stored-versus-deflated size of a representative multi-layer scene with a
   real imported PNG. If the delta is material, that is an escalation **to Shaun** carrying
   the numbers, because trading file size for engine-independence is a product decision.
   Narrowing to Chromium-family was rejected: the site is a public static page and the
   player is designed to be embedded in other people's pages.
8. A purity guard for `src/shared/`. There is none today, and both P1 and P7 put
   browser-reachable code there.

   **Measured hole, 2026-10-15:** the guard as shipped **cannot see a new, unbuilt
   `src/shared/` module**, because its roster comes from `dist/shared/*.js`. Paired control
   over the same file and the same import, varying only whether `dist/shared/zzzLeak.js`
   exists: **13 passed (blind) → 2 failed (sighted).** That is exactly the class of file
   the rest of P1 and all of P5 will add. The roster must come from the source tree minus
   the `tsconfig` excludes, keeping the pairing assertion as a cross-check.
9. **A `.stst` round-trips a multi-frame / GIF layer.** *(Added 2026-10-15.)* This is
   R17's own stated motivation — *"that would also save the multi-frame / gif layer if i
   want to share the full editable project"* — and **no criterion covered it**. The
   container's scope limit is currently recorded only in a test comment, and §9's last row
   says a note is not a sensor.
10. **The site reads a `.stst`, not only the CLI.** *(Added 2026-10-15.)* R17 is
    *"someone else can import"*, and design §6.2's own argument is that a one-sided format
    "would be the first asymmetry in an architecture that is otherwise one core with a CLI
    and a site at parity." In the surveying worker's words: **the criteria encode the
    asymmetry they were written to prevent.** Scope here is the *shared reader being
    browser-reachable and exercised by site-side code*; the import **UI** is P5's (R19).

**Criteria 9 and 10 are plan §3's lesson firing for the second time in this phase** — a
phase can pass its own gate with a design item simply missing, because the criteria list
is derived from the plan rather than from the design or from the requirement.

### P7 — Perception module · PM-SHARED · design §10

1. `src/shared/perception.ts` — `encodableDepths`, `quantisationStep`, `collidingPairs`,
   `fusionComfort`, **`legibilityOf` / `describeLegibility`**, `depthStops`,
   `cardboarding`. *(Named `strokeLegibility` until 2026-10-15; the moved rule was required
   to move **unchanged**, so the criterion is renamed to the code and not the reverse.)*
2. **Graded** functions return quantities **and** a grade; a caller wanting numbers never
   reads the grade. *Rescoped 2026-10-15:* it read "each returns", which design §10.1's own
   title contradicts — *"objective, no perception involved"* — and `encodableDepths` is
   `sepFar − sepNear + 1`, arithmetic over the encoder. **Forcing a grade onto an objective
   count invents the subjective score R22 obligation 4 forbids.**
3. **`fusionComfort` keys on the budget, not `sepNear`.** Pinned: fires at
   `sepFar:140, sepNear:78` (budget 62), silent at `100/80` (budget 20).
4. `encodableDepths` reports stage capacity. *Amended 2026-10-15:* it also demanded the
   `linked` dead strips, and the module declined **on a measurement** — the strips fall
   entirely inside the plate margins, which `plate.ts` already defines as columns nothing
   may be composed in. Widening a bare `number` into a shape, breaking a seam P4 will
   consume, to restate a guarantee that already exists, is machinery. **Closed as satisfied-by-`plate.ts`, conditional on a sensor** — but **not the sensor
   this sentence originally specified, which is false at any odd `sepFar`.** It read
   *"assert the strip width equals the margin width"*. Measured: `marginsFor` gives
   `ceil(sepFar/2)` both sides, while the encoder's skip test gives left
   **`floor(sepFar/2)`**, right `ceil(sepFar/2)`. At the default 110 both are 55 and an
   equality passes; **at 111 the left strip is 55 against a margin of 56.** An implementer
   handed the original sentence writes an equality, watches it pass, and ships a sensor
   that is green only because nobody swept an odd separation.

   **The property the closure actually rests on is containment**, which holds for every
   `sepFar ≥ 2` by `floor ≤ ceil`: the strips fall *inside* the margins. Assert
   containment, swept over odd and even `sepFar` including the `sepFar = 2` floor, with
   both sides derived from shipped code and neither written out; and assert tightness as
   `ceil − floor ≤ 1` with that expression recorded, so widening the slack is a visible
   change of claim rather than a passing test. Note also there are **two** strip widths —
   dead-for-all-depths reaches only `floor(sepNear/2)` — so a sensor written against
   "capacity 0" compares 46 to 55 and reddens immediately.
5. Today's legibility rule moves in with **no threshold change**. The wrapper shape of
   criterion 2 is the permitted change; the numbers are not. *Clarified 2026-10-15:* a
   verdict **string** is not a number, so design §10.3's weakening ("lead with quantities")
   **does** land here. The branch currently ships advice the 2026-10-12 findings call
   *worse than silence* — **but not for the reason this sentence gave, and the sentence was
   wrong in four documents at once.** It read "it tells the author to widen the budget,
   which does nothing for legibility and makes fusion harder." The shipped string says
   **"raise `sepNear` to *shrink* the budget"**, which makes fusion *easier*. The advice is
   bad because it **trades away depth range and buys nothing for legibility** — the
   threshold is an absolute stroke width — while the string advertises the cost. The fix is
   therefore **to remove the `sepNear` trade from both the `illegible` and the `tight`
   branch**, not to invert a direction. An implementer told "stop saying widen" will read
   the string, see *shrink*, and reasonably conclude the brief is stale.
   `src/shared/perception.ts`'s `fusionComfort` docblock has since copied the wrong
   sentence in, roughly 80 lines above code that says the reverse, so **the module
   contradicts itself in its own comments** and that is part of this task. `site/legibility.test.ts:228-229` **requires** that
   wrong advice and will redden; **that is the test doing its job** — update it with the
   reason recorded. `src/shared/perception.test.ts:163-166`'s comment, which says this
   phase may not change the verdict text, is superseded and must be amended in place.
6. No perceptual **threshold** inlined outside this file, against a named list fixed
   before dispatch — including `src/node/canvas.generics.test.ts:107`'s `peak * 0.5`,
   whose own comment at `:99` says it matches `INK_FRACTION`. The fix is to import the
   constant.
7. **R22 obligation 2 has a sensor:** no perception function throws on any `StereoOpts`,
   the inverted case included. Honoured today and unwitnessed — it is the stated reason
   `collidingPairs` takes `(scene, stereo)` rather than calling the throwing
   `resolveStereo`.
8. **R22 obligation 4 has a sensor:** no perception signature takes a subjective
   parameter. Neither obligation mapped to any criterion, which is plan §3's own lesson
   live — a phase can pass its gate with a design item simply missing.

   *(Corrected 2026-10-16 — orchestrator error 28.* This paragraph used to end with
   *"**Scoped to a named list** — the survey worker enumerates candidate **constants** … because
   'is this constant perceptual?' is otherwise unjudgeable."* **That sentence belongs to
   criterion 6, which is the constants criterion; criterion 8 is about parameters**, and
   criterion 6 already carries its own named-list wording. A reader scoping criterion 8 from
   this paragraph scoped the wrong thing. Found by a verifier reading both criteria against
   each other.)*

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
3. One registration test per registry. **Seven more tasks.** This is what makes R7
   falsifiable.

   **Amended mid-phase, because the original wording was measured false.** It read "a
   dummy entry appears without touching another file", and a real registration on three
   registries demonstrably *does* touch another file. The PM declined to reinterpret it in
   a ledger, correctly — that is tier-0 work — so: **"without touching another file" was
   always the wrong property.** §11's goal is that adding a thing costs *a bounded,
   declared edit*, not zero edits. The property to assert is:

   > adding an entry costs one declaration, and **everything else that must change is named
   > by the compiler** rather than discovered at runtime or missed.

   `FIT_MODES` already satisfies that in its stronger form (§7's E2 ruling), and a
   registration test that passes on *appears* rather than on *a consumer can now use it*
   satisfies neither.
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

    **Ruled 2026-10-15: this is a review criterion, not a predicate**, and a PM was right
    to say so rather than force one. "A disposition table exists and is right" is a
    judgement about a document. Its **testable shadow** is the deliberate teardown
    tripwires: each must go red on teardown and each must be dispositioned by name in the
    table. The standing "a criterion may ship unmet only with a sensor" is not in tension —
    this criterion is documentary by nature, not unmet.

    **The file list above is short.** A P3b survey found six more, and two are tripwires
    planted on purpose: `site/views.test.ts` (recorded in §9 — *"the note **is** the
    test"*) and `site/keybindings.test.ts`, which was not recorded anywhere. Also
    **`src/node/canvas.vendored.test.ts`, which reads `site/index.html` and will throw
    ENOENT on teardown, with a hand-written count beside it that becomes false.** It is
    named by no phase. **Ruled: it is P3b's**, by the principle that the phase whose change
    breaks a file owns the repair. P3b may touch that one file in `src/node/` **and no
    other** — `canvas.generics.test.ts` in the same directory belongs to P1/P7, which has
    been told so.
    The disposition table is committed to `docs/`.
11. **R2/R8 architecture test**: a second `LayoutConfig` plus a visibility set yields a
    reduced editor with no second app and no code outside the layout module.

    **Restated 2026-10-15, because "no code outside the layout module" is a statement about
    a diff and §7's preamble makes that an escalation before any worker is spawned.** The
    predicate, accepted from the P3b survey: *a reduced editor is expressible as a
    `LayoutConfig` plus a visibility set, and **every existing consumer is total over that
    pair**, asserted on a constructed second instance.* Added by the orchestrator: **the
    test constructs that second instance inline and adds no module** — which is the
    checkable residue of "no second app", and keeps the diff clause honest without asking a
    predicate to describe a diff.

    **The visibility set is a third value**, not a field on `LayoutConfig` and never the
    specs argument of `unmountedControls`. `CONTROLS` stays complete and visibility sets
    select from it; a filtered registry would fail criterion 6, which is already met.

**`CONTROLS` is complete; visibility sets select from it.** A filtered registry would fail
criterion 6.

### P3a's five carried findings — open, by name

Restated out of a session-scoped ledger so they survive it. Items 4 and 5 are conventions
for P4 to adopt, not merged files to reopen.

1. **`REPEATS` is hand-written in four unguarded places** — `src/core/anim/presets.ts:93`,
   `src/cli/scene.ts:130`, `site/scene.ts:38`, and an inline union at
   `src/core/types.ts:276`. Pre-existing. A fifth site, `params.ts:491-500`, is **this
   phase's and is correct** — it writes the vocabulary out deliberately, because spreading
   the upstream constant would compare a constant with itself. The hazard is visibility:
   `src/cli/scene.ts:126-129` carries an `AssertNever` pair *immediately above* the
   unguarded `REPEATS`, which hides the asymmetry by adjacency.
2. **`TRACK_KEYS`' over-permissive direction is wholly unsensored** — `src/cli/scene.ts:113`
   and `:435`, nowhere else, zero test mentions. An extra name that is not a `Track` key is
   accepted with nothing able to see it. Pre-existing.
3. **Criterion 14** — `site/dist.test.ts:1430`'s `toHaveLength(7)`. **Eight** modules are
   absent from `EDITOR_ONLY_MODULES`, not the three on record. **Inherited** (pre-branch-point
   at `773cc32`) and **P3b's**. Nothing leaks: none of the eight is imported by `main.ts`
   or `player.ts`.
4. **Absence-table convention divergence** — `REFUSED_*{key,reason}` versus
   `ABSENT_*{disposition}`. **`ABSENT_* + disposition` should win**: `refused` proved to be
   one of three dispositions actually needed. Paired with it, five readers take a defaulted
   `table` parameter and five do not — **taking it should win**, because the four without
   it are exactly the four with no control over "the absences did not move under a
   registration."
5. **`*_IDS` means two opposite things** — `as const` tuples tied by `AssertNever` in
   `PANEL_IDS`, `SHADING_IDS`, `VIEW_IDS`, `BINDING_IDS`, `DEPTH_SOURCE_IDS`; derived
   `readonly string[]` in `CONTROL_IDS` and `OPERATION_IDS`. Same suffix, opposite
   provenance, **in the phase that spent itself on provenance.**

### P3 criteria 12–20 and ruling E14 — written down for the first time, 2026-10-15

**These were adopted in a message and never committed to any document.** A PM found it:
criteria 12–20 — including criterion 13, which had already cost two tasks, and 17, 18 and
20, which are the whole of cluster D — **have no text in any tier-0 document**, and
neither does E14, the ruling that created task C-18, which two briefs nonetheless quoted
as "verbatim". This is orchestrator error 15.

Reconstructed below from the orchestrator's own rulings. **Two are marked unreconstructed
and the owning PM must restate them from its ledger before cluster D dispatches against
them** — writing down a criterion I cannot state exactly would be the §1.2j error on top
of this one.

**Corrected 2026-10-15 after the first attempt was audited: five of nine rows were
defective and one criterion had vanished entirely.** See error 16 below the table.

| # | Criterion |
|---|---|
| **12** | `Scene`'s own-key guard. **MET and verified — `05aeb26`.** |
| **13** | `KEYBINDINGS` exists as a registry **and carries its registration test** (§11 table row 5). Both clauses: R-ac rules criterion 3 is one registration test per registry *"plus `KEYBINDINGS` for criterion 13"*, so the test is part of 13 by explicit ruling — **drop it and C-16's `101c342` is unbudgeted by any criterion.** **MET — `5fc8fc8` + `101c342`.** |
| **14** | `dist.test.ts`'s no-editor-code check **has teeth, shown with the measured paired control**. P3b's. Plan P2.10 flagged it as "a tautology until P3 exists… re-verified as a P3 criterion" and no criterion received it. **The criterion stands. Its cited live instance is withdrawn as measurably false — 2026-10-15, orchestrator error 21.** It claimed `toHaveLength(7)` was missing three modules (later relayed as eight) that nothing reddened. Measured: the hand list is **exactly correct today, 7 of 7**; the "eight" are P3a registry modules reachable from **neither** bundle, and planting them **reddens** the suite, because the *presence* half of the control catches a needle that is in no bundle. A survey then planted a real leak and the check **failed by name** — so it already has teeth, and part of this criterion is already discharged. What remains is real but different: **the list is hand-written and will rot** as the shell adds modules, so derive it or cross-check it against a derivation; and the needles must be **extended to the editor shell's own modules and the presence half re-run against the new bundle** once teardown lands. |
| **15** | **The hash projection coalesces on a microtask: N mutations in one tick ⇒ one write.** P3b's. |
| **16** | The centre slot admits nothing above the canvas in flow (design §8.3's sub-pixel measurement). P3b's. |
| **17** | `ease`, `repeat`, `start` and `duration` are declared as parameter descriptors — **and `push`'s non-uniform `easeOut` is expressible.** The second clause is decisive: *a descriptor scheme that cannot express a per-verb default override has not met criterion 17.* Without it the criterion is satisfied by adding four descriptors and going green. **MET, both clauses — `a9cd1c1`.** |
| **18** | `CONTROLS` is **derived** from the guarded rosters — never enumerated. **Do not conflate with the withdrawn criterion-3 wording.** **MET — `9bf104d`.** |
| **19** | **R13 and R4 are recorded as *partially* closed by P3.** Status `ruled`, discharged by R-e. This is a **conflict** between plan §3 and design §13/§15, not a gap — **not store-side, not buildable, and not P3b's.** (Criterion **8** *is* the store-side one, and both mention R13 — **PM-SHELL-9's inference as to how the orchestrator confused them, labelled as its inference, not established.**) |
| **21** | **No module-level mutable scene state survives outside the store**, with a sensor. *(Added 2026-10-15.)* Design §3.4 says "one scene store as the single source of truth" and **criterion 8 cannot falsify it**: a store shipped *beside* the surviving module-level state satisfies criterion 8 literally, and teardown is a separate criterion, so the gap is reachable rather than theoretical. Raised by a P3b survey under plan §3's instruction to diff the design against the criteria. |
| **20** | `ParamShape` expresses a **number-or-token union**, **and the resolver yields a number input *plus* a token picker for it.** The resolver half is what D-5 exists for; without it a worker reading this table finds no criterion for D-5 at all, and D-6 loses the clause saying what the type change is *for*. **MET, both halves — `a414a63` + `1047aa5`.** |

**The generalisation from three correction passes, and it governs how this table is
audited.** The defect count went five rows, then three items, then two stale statuses —
and **every defect across all three passes was a dropped clause or a dropped label. Not
once a wrong fact.** Nobody wrote anything false about this system; every loss was
*subtractive*. That is exactly what diffing and row-counting cannot see.

> **In this phase's documents the failure mode is omission, so an audit must be a
> completeness check against a deeper source — never a consistency check between peers.**

**Error 16, recorded here because the lesson is in the shape of it.** The first attempt
put criterion 14's content in row 15, which deleted the real criterion 15. The result had
**nine numbered rows, no gap in the sequence, and internal consistency** — so a quote-diff
returned clean, counting rows returned nine, and both checks passed. A document written to
cure an absence produced a better-hidden one. It was found only because a PM checked all
nine rows against its ledger after two of the three it was asked to check came back wrong.

**Ruling E14**, also previously unwritten: a fourth `SMOOTH_MODES` member was planted and
typechecked **0** while the test named *"is total"* passed and could not fail. The fix is a
compile-time `AssertNever` `default:` arm that **returns the existing fallback rather than
throwing** — zero runtime change. Paired with a sweep of other registries sharing the
shape. Landed at `2a44191`; the sweep found **three more** (`DepthView`, `Legibility`,
`FitLimit`, the last in live non-orphaned code) and those are open.

### P3b rulings, 2026-10-15 — seven escalations from SPIKE-1 and cluster A

**SPIKE-1 was a throwaway spike that paid for itself many times over.** It mounted one real
panel against the real store, committed nothing, and found five things wrong with the
obvious way to build cluster F — **four of them invisible to every instrument this repo
owns.** Dispatching F without these rulings would have shipped green and wrong.

**ESC-7 — R6 is not reachable through the current `Action` union. New criterion 22.**
**17 of 63 controls have a keyed `Action`; 46 do not** — every `layer.*.at`/`.depth`/`.name`,
all `layer.shape.*`, all `image/gif.src|mode|mask`, and **all 11 `preset.*`**. Their only
write path is rebuilding the whole scene, which the store must not own. **Criterion 6 is MET
and structurally cannot see this**: it proves a spec is *reachable*, not that a value is
*writable*, and R6 says *"ensure the strong editor exposes every control."*

> **Criterion 22: every `CONTROLS` entry is *writable*, not merely reachable — and a
> wrong-typed write fails to compile.**

The second clause is not decoration. SPIKE-1 measured that **a computed `string` key erases
the field type**: `{type:'stereo', patch:{[key]: Number(raw)}}` compiles clean where the
literal form errors, so a generic renderer can write a number into a boolean or an enum with
nothing to stop it — SPIKE-1's own code had the bug and compiled. A path-addressed action
that reintroduces that hole satisfies the first clause and fails the criterion.

**This is P3b's and it is a prerequisite for cluster F**, because the `Action` union is the
store's API and P4, P5 and P6 all build on it; settling it later means rework across three
phases.

**ESC-8 — the test tier cannot see cluster F's real failure modes. Ruled: thin components
plus a minimal DOM tier, and close the warnings hole.** SPIKE-1 measured: no DOM tier exists
(`jsdom` and `happy-dom` absent, `mount()` unrunnable by any test); **`$effect` is stripped
from SSR output**; `render()` is **lazy**, so a side-effect assertion after it measures
nothing and reports green; and `$state(store.state())` **forks state in the browser**,
breaking the store's identity guarantee, **while SSR reports the same answer for the correct
and the incorrect spelling.** That last one is the worst kind: the tier does not merely miss
the bug, it actively cannot distinguish the two.

Three-part ruling:
1. **Standing architecture rule: a Svelte component is a thin binding and holds no logic
   that could fail a test.** Everything testable lives in a plain module. This is what the
   store, `hashprojection.ts` and `transport.ts` already do, and it serves R7 directly.
2. **Fund a minimal DOM tier** (`jsdom`) for the residue rule 1 cannot cover — principally
   the store-identity guarantee, which lives in the binding itself and so cannot be moved
   out of it. **If `mount()` cannot be made to run, that is an escalation, not a workaround.**
   **Design §12 is amended by this**, having previously excluded Svelte component DOM
   wholesale.
3. **`npm run typecheck` is fail-open on Svelte warnings** — 8 × `state_referenced_locally`,
   Svelte saying *the panel will never re-render*, and the gate exits **0**. Close it. Measure
   the repo-wide warning count first, because this may redden existing code, and **do not
   touch `--output`** while editing that script (see §9's row on the duplicated flag).
   **Playwright is deliberately not funded here.** This host has chromium and Xvfb, but CI
   does not have them demonstrated and a 94s suite is not worth risking yet. Revisit for P4,
   where pixels are the subject.

**ESC-9 — narrow `dist.test.ts`'s `@napi-rs` grep. Granted, P3b owns the file.** It is a raw
`text.includes` over built files, so it reddens on a **doc string** in `controlspec.ts` — not
a purity defect, and **F-2 cannot be green until it is narrowed.** Its parse-failure and its
real-regression modes are also *the same assertion*, which is the harness defect again: fix
both halves.

**ESC-10 — chrome: ruled (a), `applyChrome` from an effect.** Option (c), hand-written markup
beside a separate `ChromeNode` tree, is **excluded**: a parallel description makes criterion
16 a check that cannot see, and SPIKE-1's warning stands — *"if F-2 is specified as 'write
the shell in Svelte markup', it has chosen (c) without anyone deciding to."* Option (b), a
recursive Svelte renderer over `ChromeNode`, works and was built with a paired control, but
it is **a second renderer of the tree** — the thing `chromedom.ts`'s header names as not to
build — and **it already diverged twice in a spike**. (a) keeps one renderer and one
description, and the ESC-8 DOM tier is what makes an effect testable.

**ESC-11 — F-2 ↔ criterion 10 entry ordering. Ruled: decouple, do not sequence.**
`vite.site.config.ts` has `root:'site'` and no explicit input, so **`site/index.html` is the
only path into the bundle — and it is the file teardown deletes.** Rather than ordering two
clusters around an implicit dependency, **give the config an explicit input, and that edit
belongs to F, not G.** G may not delete `index.html` until it has landed. An ordering
constraint that exists in no document is how a phase discovers it the hard way.

**ESC-12 — an unrenderable scene reaches the URL. Ruled: the projection does not filter.**
`reduce` accepts combinations that do not render, so a share link can carry a scene the
canvas refuses to draw. **A filter in `hashprojection.ts` would be the wrong cure**: the hash
is a *projection of the store* (criterion 8), and a projection that silently drops states
stops round-tripping — reload would hand you a different scene than you had, with nothing
said. The honest shape is the one the owner already specified for perceptual limits:

> *"write such diagnostic functions at the model layer, only ever use diagnostics around
> perceptibility / interprability for the purposes of warning at the View layer"*

So: **the projection round-trips faithfully, and an unrenderable scene is surfaced by a
model-layer diagnostic warning at the view layer.** The diagnostic is **P4's**, with the
rest of them. Recorded here because it is user-visible and was raised, not decided, by A-2.

**Criterion 15 is sharpened, not widened — A-3's distinction, adopted.** N mutations in one
tick produce **at most** one write: a tick whose mutations cancel leaves the projection
unmoved, and writing anyway would reinstate the per-tick `replaceState` cost that
`main.ts:683-684` exists to avoid. The rule is **a write happens exactly when the projection
moved across the tick**, both arms tested.

**And criterion 15 gains a second clause, because the module half is not the user-visible
half.** *The editor's URL actually coalesces* is unwitnessed until the composition root
exists, **and the choice of queue is cluster F/G's to get wrong** — today there is neither a
criterion nor a sensor on that side, which the standing "a gap ships only with a sensor" rule
forbids. F/G owns it.

**Carried from A-2, for criterion 14's owner:** `hashprojection.ts` is in neither bundle
today, so `EDITOR_ONLY_MODULES` correctly omits it — **and the day cluster G wires the
browser adapter it becomes editor-only, and the list lives in three places, one unguarded.**
That is the second confirmed instance of the rot D-1 exists to fix; SPIKE-1 observed a third,
where six modules became editor-only under a real consumer and `toHaveLength(7)` **stayed
green and silent.**

### P3b, shift 2 — criterion 23, and a sensor that made the right architecture detectable

**Criterion 9 is DONE** (`bf5eb1a`, `760f353`), joining 8 and 15. Two escalations ratified:
C-1's rewrite of a merged P2 test, which the `seek` ruling forces — if out-of-range and
in-the-final-gap are one `snapLoopTime` fold then `seek(…, 2.5)` must be frame 6 *and* frame
23, which is a contradiction and not a choice of convention — and C-2's minimal
`hashprojection.test.ts` edit. **Zero test removals across the entire phase**; C-1 went 7 →
15 assertions and preserved the superseded rows beside the new ones, which is better than
§6.4 requires.

> **Criterion 23: the playhead does not drift when playback resumes.** `{type:'time'}` and
> `{type:'frame'}` carry no `nowMs`, so **during playback** the playhead resumes advanced by
> the elapsed interval and a drag compounds it. **Paused — the scrubber's real case — it is
> exact, and asserted across five clocks.** The fix gives those arms a `nowMs`, which is a
> `main.ts` edit and therefore **cluster F/G's.**

*(Added 2026-10-15. It was carried as a note and owned by no criterion, and a recorded note
is not a sensor — §9's last row, applied to the phase that keeps citing it.)*

**The shift's most transferable finding, and it is an argument for front-loading sensors.**
C-2 chose to put `TransportState` *inside* `UiState` rather than beside it, and its first
reason is stronger than its conclusion: a second field written by `store.ts` would sit
**outside the expression `state()` returns**, so **A-4's duplication guard would have been
silent over exactly the code that task added.** A guard built two tasks earlier is what made
the right architecture the *detectable* one. A sensor that only fires on code written after
it is still worth building before the code exists — the ordering is the whole value.

**Also measured:** one of C-2's plants showed **A-4's guard fires on action tags it was never
told about**, which is the difference between a guard that generalises and one that happens
to work. That distinction is worth asking of every guard this phase ships.

**Known weakness shipped knowingly:** the clock sensor's name list is hand-written
(`Date`, `performance`, four schedulers, `process`). Paired control, zero hits across the
21-file closure — **but a novel clock spelling passes it**, and C-2 could not derive the list
from anything. It is the hand-written-list shape §9 warns about, accepted because no
derivation exists, and recorded so nobody reads the green as total.

### Criterion 22 — the two rulings its adoption forced, 2026-10-16

The salvaged H-1 work was adopted at `24392c3` with **fourteen claims, each with a named
mutation, grep-confirmed in the real file and its verdict quoted.** `git diff b27a315 HEAD`
is empty: content brought across, the salvage branch **not** merged.

**The erasure is genuinely solved, and the proof is a control rather than a claim.**
`SetAction` is a **mapped type distributed over control id → the model's own field type**, so
each member pairs one literal `control` with one concrete `value` type and there is no fresh
object literal for an index signature to widen. Severing that correlation turns **exactly six
of eleven `@ts-expect-error` directives "unused"** — precisely the six value-type claims —
while the five structural ones still bite. So the wall is neither inert nor double-counted.
This answers the question SPIKE-1 left open and that H-1 was permitted to fail.

**Ruling 1 — clause 1 is MET over 52 of 63, and the residue is accepted with a condition.**
The other eleven are the preset family. The gap is **derived and sensored**:
`unwritableControls()` names them and the partition asserts
`CONTROL_IDS.length === WRITABLE_CONTROL_IDS.length + residue.length`, which reddens the day
a registry control grows without a write path. **A sensored residue is not a hidden gap, so
it discharges criterion 22** — but it does **not**, by itself, discharge **R6**, which says
the strong editor exposes *every* control.

The resolution is already in the standing rulings: **bundles are UI macros writing an `Anim`
array at attach time, not registry entries**, forced by `PresetFn` returning a single
`Track`. A preset is therefore **applied, not set** — it is a different mechanism by design,
not a missing one. **Condition: R6 is discharged for the residue only when the
preset-application path exists and is itself exercised and sensored.** That path is cluster
F/G's. **It must not be dropped on the grounds that criterion 22 passed** — the criterion
passing is exactly what would make it invisible.

**Ruling 2 — clause 2 is true of the `set` path and false of the `Action` union. Tripwire
now, remove later.** The legacy keyed arms survive because `main.ts` consumes them, so
`{type:'stereo', patch:{[key]: Number(raw)}}` **still compiles clean with nothing watching
it.** A declared gap with no sensor is what this phase's own standing rule forbids, so
"accept it as a note" is excluded. Of the remaining two, **do both, in this order**:

1. **Tripwire the known hole now**, on this repo's own *the note **is** the test* precedent —
   the same shape as `site/views.test.ts` depending on `site/index.html` so that teardown
   reddens it **by design**.
2. **Sequence the actual removal after G-3 deletes `main.ts`**, at which point the legacy
   arms lose their only consumer and the tripwire retires with them.

**H-2's scope follows from this and should be settled before it dispatches**: its harness
pins clause 2 **for the `set` path**, and the tripwire — not the harness — covers the legacy
hole until G-3. A harness pinning a clause that is only half true would pin the wrong thing.

**One claim in the adoption has no runtime RED and H-1b said so unprompted:**
`hashprojection.test.ts`'s mapped `SAMPLES` table leaves vitest at 34 passed when the `set`
row is removed — **only the compiler sees it.** Recorded rather than smoothed over.

### P7 rulings from V-4, 2026-10-16

**The `cardboarding` contradiction is settled: the roster is wrong and the module is right.**
`perceptionRoster.ts:189` declares it `graded`; `perception.ts:1175` says *"Objective and
ungraded."* V-4 measured which survives: a one-line strengthening of the witness —
**`graded` ⇒ the answer owns a `grade` field** — reddens **exactly one row of thirteen**, and
it is `cardboarding`. `fusionComfort` and `legibilityOf` both carry a literal `grade`;
`cardboarding` does not. **Ruled: reclassify `cardboarding` as `objective`, and adopt the
one-line strengthening**, because without it the table is not a sensor on the classification
at all.

**That second half is the substantive finding and it is worse than the contradiction.** V-4
censused all thirteen return shapes against the ratchet:

| direction | detectable |
|---|---|
| `graded → objective` | **0 of 13** |
| `objective → graded`, scalar/string return | 9 of 13 |
| `objective → graded`, object-with-a-number return | **blind** (`measureInk`) |

So the `AssertNever` pair is a real ratchet on **membership** — it cannot go short, proved —
and **no sensor at all on the value**. The file's own docblock is accurate about this and
nobody overclaimed; the gap was simply open. **Criterion 2 is not violated under either
declaration** — `cardboarding` returns a verdict plus three quantities — so the defect is
that `Grading`'s two values had no operative difference, not that a row broke a criterion.

**Criterion 6's "against a named list fixed before dispatch" is discharged by something
stronger, and the clause is retired.** No list artefact was ever recorded; the ledger carries
it as an open question. But V-4 ran an **independent census** instead and found every
`runLengths` threshold outside `perception.ts`: four in `metamorphic.real.test.ts` (all
`ABSOLUTE_INK_DEPTH`), `canvas.vendored.test.ts:113` (P3b's, known-open), and
`src/core/metamorphic.test.ts:706` — which it then **measured to be a separator, not a
threshold**, by changing `0.5` to `0.01` over a binary 0/1 map and watching the value stay
byte-identical. **An exhaustive census beats a list fixed in advance**, because the list can
be wrong and the census is checkable. Criterion 6 is **MET on the substantive property, by
measurement.**

**The §6.5a control that matters, reproduced exactly.** With the forbidden fix applied
(`runLengths` made peak-relative) against the **pre-commit** file: `14 passed` and **all 21
`[measured]` values byte-identical** — blind by pass/fail *and* by value. Against **HEAD**'s
file, the same mutation reddens and moves a measurement `487 vs 0 → 487 vs 487`. **So the
standing ruling against importing `INK_FRACTION` there is vindicated and the commit closed a
real blind spot.** Both halves named, as the rule requires.

### P3b shift 3 — criterion 22 complete, and the budget everyone cited was one sample

**Landed:** `24392c3` the write path (adopted with RED attributed per claim) · `f8d931b` its
clause-2 sensor · `5f11f93` six blind sensors closed. **Criteria 8, 9, 15 and 22 done.**
Outstanding: 7, 10, 11, 14, 15b, 16, 21, 23.

**The "94s CI budget" was one sample of a varying quantity and every brief on this phase
cited it, the orchestrator's included.** Measured instead of quoted: a 93s job of which
`npm test` is **53s**, typecheck 6s, builds 4s — and **`apt-get install ffmpeg` 25s**. The
last four runs span **93–108s**. **A quarter of the "budget" is apt, and it already varies
by 15s**, so a figure cited to three significant figures was never that precise. The fourth
harness landed against the real measurement, and **whole-suite wall-clock does not move at
all**: summed test time rises 32s while the new file's 27s runs inside an existing harness's
48s shadow. **Cite a measured range, and say what the number is made of.**

**The cheaper route was refuted by one table row, and the refutation is worth keeping.** The
PM proposed extending the eleven `@ts-expect-error` rows rather than building H-2's harness.
**A directive is lexical and cannot be generated from `WRITABLE_CONTROL_IDS`**, so the wall
covers **8 controls and 44 have no clause-2 coverage at all.** Erasing `SceneValues` to
`unknown` — four controls losing exactly the correlation clause 2 forbids — leaves the wall
**green at typecheck exit 0** while the generated sweep reddens 52 → 48 and names all four.
**The two are complementary, not duplicative.**

**Ruled: a PM may append a measured correction beside a tier-0 paragraph it has disproved.**
R-1's +25-line block in this document stands. It **preserves** C-2's original paragraph
rather than replacing it, which is §9's *correct beside the quote, never inside*; the
substance is required because C-2's rationale names the wrong mechanism; and the code is
independent of it, since the in-code `CLOCKS` docblock carries the full version. **The
boundary: append beside, never rewrite or delete, always flag it in the report.** Routing
every measured correction through tier 0 is how error 15 happened — the orchestrator adopted
nine criteria in messages and wrote none of them down.

**The debt, and it is the largest on the phase: none of the three commits has been verified
by anyone who did not write it, and the three have never been run together.** A gate run is
owed — serialised, announced, by a runner who implemented none of it. The arithmetic
suggests 83 files / ~1967; **that is arithmetic, not a measurement**, and §6.3 compares
against the branch's own baseline.

**Latent and unmeasured, in two *merged* files:** both pre-existing harnesses unescape
machine messages with `replace(/\\(.)/g,'$1')`, which **turns `\n` into a literal `n`** and
welds a nested diagnostic's two lines together. H-2 maps escapes explicitly and did not touch
theirs. **Nobody has audited whether either asserts across a line join.**

**The pattern above any individual finding.** Four instruments this phase trusted for
multiple shifts turned out blind: the skip glyph, `build` as evidence about `site/` types,
`build:site` against three of four builtin spellings, and the `@ts-expect-error` wall over 44
of 52 controls. **Each was caught only when someone planted a control against an instrument
nobody had ever watched fire.**

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
| the suite is *N* tests | **Never carry the number.** It was 855, then 862, and is now 1881 across 80 files. The *lesson* is intact and is the only durable part: counts move with ffmpeg/tsc availability and with build freshness, so **build first or suites skip silently** — and compare against the branch's own recorded baseline, never a figure from a document. |
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
| scenes can be serialised | ~~There is no scene writer. Only a parser.~~ **This row is false and was measured false 49 commits ago; it survived that refutation, which is why it is struck rather than deleted.** There are **three** production `Scene`→text sites. A row that has survived one refutation will survive another unless amended. |
| `rotate` is in degrees | `Transform.rotate` is **radians** (`ctx.rotate` takes radians); `shape.start`/`end` are **degrees**. Design §9.1 cites this exact collision. |
| the canvas shows the stage | It shows the **plate**. Hit-testing crosses scene → plate → backing-store (×`noiseScale`) → device (×snap ÷ dpr). |
| `sans-serif` resolves everywhere | It resolved to dingbats in `@napi-rs/canvas` for a day. |
| the plate can be cropped to the stage | Margins are the fusion partners of the stage's edge columns. |
| a shell pipeline is not an instrument | It is, and it needs a control like any other. **`sort` silently broke `comm` twice in a single shift and returned a false clean** — the same `LC_ALL=C` defect already in this table, recurring because the entry reads as a warning rather than as a required control. The fix that worked: run the comparison against a pair whose answer you already know, in the same invocation, before trusting the real one. §6.5a does not stop at test code. |
| the avoidance is not worth reporting | **Where the damage would be undetectable afterwards, the avoidance *is* the result.** A repair stepped around a comment that quotes a ruling verbatim: every other item that round was "a false sentence, fix it", and this one looked identical from a distance while requiring the opposite action. Nobody would have caught the damage later, **because a rewritten quote reads as a correct quote.** Report a deliberately avoided trap as a finding, not as silence. |
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
| `git diff -U0` shows what the task changed | Not for a file the task **created** — an untracked file has no diff, so the check silently measures nothing. Grep the file, not the diff. |
| a grep proves the change was comment-only | It samples **line shapes**, not semantics. The structural proof is to transpile every changed file at `HEAD` and in the working tree with `removeComments: true` and diff the outputs. **But it has three blind spots and one of them is live in this repo** — see the row below before relying on it. |
| the transpile-diff answers "did this change what the suite proves" | **It does not, here.** Three blind spots, measured by the reviewer that reproduced the instrument independently: (1) **directive comments are invisible** — `removeComments` strips `@ts-expect-error`, `@ts-ignore`, `@__PURE__` and `eslint-disable`, so deleting one is a typecheck or tree-shaking change the instrument calls IDENTICAL; close it with a repo-wide census of each. (2) It is single-file and type-blind. (3) **🚩 This repo has tests that read source text, comments included** — `site/query.test.ts:170` walks raw files for an import regex, and `site/controlspec.test.ts:124` filters ids by whether the *whole text* of `controlspec.ts` contains the quoted id. A comment edit moves those. Close it by diffing the quoted-token set and planting a control; the reviewer did, and the planted `// planted: 'layer.text.at'` was duly reported. |
| `--reporter=json` gives me per-file timings | **Not for `beforeAll`-heavy files.** It reported **27 ms** for a file the default reporter reports at **41,531 ms**, because the spawns live in `beforeAll` and the JSON reporter's per-file span covers only the tests. A **1500× error**, and exactly how a concurrency budget gets built on sand. The JSON reporter remains correct for *counts*. |
| `build:site` catches a Node builtin in shared code | **It does not — it is fail-open.** `import 'node:fs'` in `src/shared/` leaves `build:site` at **exit 0** with "has been externalized for browser compatibility". The build is not a purity sensor; only a guard that reads the source is. `build.rollupOptions.onwarn` flips it to exit 1 with no false positives (`resolve.builtins` does **not** exist in the pinned Vite 5.4.21). **Two corrections to this row as first written:** the configs are at the **repo root** and there are **two** of them, so it is not "a `site/` change"; and the two sensors are **not complementary** — for a dependency reaching `node:fs` one file deep from a shared module outside the bundle graph, `build`, `build:site` *with the option planted*, and the suite were **all measured green.** The Vite option sees only the bundle graph; the purity guard reads only each package's entry module. **Both blind simultaneously, over exactly the P1 files.** |
| a count from the survey is still the count | Not if your own phase has been committing. A PM relayed "five pre-existing reddened specifiers"; measured, it is **nine of fourteen**, and **the four it missed are its own branch's new modules.** The survey predated them. Ask whether your own commits have moved the number before you relay it. |
| compressing two true statements is safe | It is the commonest scope error in this build, named by the PM that made it four times in one shift: *"I compress two true statements into one sentence that is wider than either."* Each half is true, the join is the PM's, and nothing downstream can tell which part came from where. |
| two independent workers agreeing is a measurement | It is not. Two surveys independently reported `src/shared/` as eight source files, and this row used to say flatly "it is **seven**". **Corrected 2026-10-15: both numbers are right under different predicates** — seven top-level modules, eight non-test source files — so the row demonstrating the trap had fallen into it. **Cite the predicate, never the number.** The original point survives intact: agreement between two unverified reports is one unverified report. |
| a label in a brief names something findable | **Not if it only ever lived in two contexts.** A census across 418 commits and every ref found exactly one of nine escalation labels. Worse, an unhyphenated family of the same letters-and-digits *does* exist in the tree from a different phase — a mapping assembled from those hits would have been **internally consistent, nine rows deep, and wrong.** When labels die, **renumber from content and never speak of the old labels again**; a plausible wrong mapping is the hardest kind to catch. |
| `git log -S'X'` searches for X | It searches for X as a **substring**. `-S'E-7'` returns three commits, two of them from `IEEE-754`. Use `--pickaxe-regex` with `\b`. |
| a tier-0 cross-reference is a stale pointer, so let it wait | **Not in a document whose section numbers are the dispatch interface.** §9's taxonomy says a stale pointer costs a `grep` and nothing silently passes — true of code, false of a plan that PMs are briefed to read *by section number*. Those get fixed on sight. |
| my control proves the diff works | **It proves the instrument functions, not that it pointed at *your* change.** A worker nearly shipped 14 inadmissible nulls on that distinction, and it retroactively marks three earlier commits' second-half evidence as true-but-vacuous. A control must be able to see the specific change under test, not merely to see *something*. |
| a sha in the record resolves | Two on record for a met criterion — `f3b9a1c` and `9c2d84e` — **do not exist in this repository.** A sha is checkable in one command and these were not. |
| the gate's instrument and the branch's instrument are the same kind of thing | **`git log <ref>` takes a ref; `npm test` takes a working directory.** They look interchangeable and are not. The orchestrator ran P3a's gate in a worktree checked out on `main` and got **60/1358** — the baseline, a figure already in the record. **A wrong answer that matches something already written down is the hardest kind to catch.** |
| "the sweep found three" means there are three | C-18's own warning, and its scope reached no durable document while its results did. The five axes it swept: `as const` tuple rosters (13 present) · inline literal unions in struct fields (3 found) · **discriminated-union tag rosters, the shape `OPERATIONS` has**, of which it measured exactly one rather than leave the axis unnamed · rosters declared in `src/` that P2 consumes · **`.svelte` files — axis *empty*, not skipped.** Without the scope, the next sweep cannot tell what was covered, and empty-vs-skipped is invisible once the list is gone. |
| recency is authority | **"Better than what it replaced" is not "verified."** A PM rewrote a ledger row on a reviewer's authority before the gate runner reported, then named it as a fabrication: *"recording a worker's finding as settled because it was the most recent one I heard is the same error as taking a handover's count."* |
| a line number in a fix instruction is current | **It is stale on arrival if anything else in the same change touches the file above it.** A repair was handed `370` and `267-287` for two stale citations; both had been computed against a tree that still contained an orphan line the *same repair* was folding. The true answers were `369` and `267-286`. The worker folded first, recomputed, and said so: *"had I written them as given, I'd have re-introduced the exact defect class this repair exists to remove."* **Order the edits so the numbers are computed last, or hand over the predicate, not the number.** |
| naming a citation defect by one location is unambiguous | It is not — **a citation has two addresses**, the line the pointer *sits on* and the line it *points at*, and only one of them is stale. Relayed as `types.ts:475 → 370` the location reads as the target, and the worker nearly declined both items as fabrications: nothing cites `types.ts:475`, and a 226-line file cannot contain `267-287`. Say which number is wrong and in which file. |
| inserting lines is safe if nothing above the cited line moves | Only for citations *into* the lines above. A repair inserted **below** a heavily-cited line — correctly protecting nine citations — and broke **two pointers aiming further down the same file**. Inserting into a file breaks citations *into that file from elsewhere*; sweep for them. The worker understood the hazard well enough to make its own new comment immune, and still did not sweep. |
| grep the sentence to find every instance | **Search the claim-shape, not the sentence.** A disproved claim had three known sites; a fourth said the same false thing **in entirely different words** and survived four separate agents grepping for the slogan. A claim restated is a claim; a string match finds only the restatements that kept the string. |
| a wrong statement in a comment should be corrected | **Not if the comment is a verbatim quote of a ruling.** Editing it falsifies the record of what was ruled rather than fixing an error — the ruling itself is the thing being preserved, right or wrong. Correct it *beside* the quote, never inside it. |
| warning the next reader about your own error class is an admission | It is the **cheapest available fix for it.** A PM that had widened one relayed claim's scope told the next worker to check the *scope* of every relayed claim, not just its wording — and that worker found **a second instance in the same brief within the hour**, a true typecheck claim glossed into a coverage claim the source never made. Declare your failure modes downstream; they are caught by whoever is looking for them. |
| the quote is verbatim, so the claim is the source's | **The words can be the source's and the scope still yours.** A worker measured that its own test file stayed silent when the growth was planted **through a mocked module graph**; its PM wrote into the next brief that *"wiring through the existing roster reddens nothing — that path is measured."* It was wired for real and **five tests reddened, three of them the original worker's.** The quote was accurate; the *set it was claimed over* was the PM's own and unlabelled. A quote-diff cannot catch this. |
| consistency with my own earlier ruling supports this one | It is **the cheapest justification available to you**, which is a reason to distrust it. A PM flagged exactly this about its own routing decision: *"I argued it from consistency with a scope refusal I had already made — consistency with my own earlier call is the cheapest justification available to me and I reached for it first."* |
| the document is updated | Check the body, not the summary. One PM twice corrected a document's header and left its body contradicting it — in one case under a header it had just written saying the opposite. **Assume a touched document is correct at the top and stale further down.** |
| an absence claim needs less checking than a presence claim | The reverse. *"An absence claim is exactly as unverified as a presence claim, and more seductive, because it asks you to **add** rather than to skip."* A PM relayed "the baseline row is missing"; it was present. And the orchestrator, told nine criteria were absent, added them — and five of the nine were wrong. |
| the quote-diff came back clean, so the documents agree | **A diff compares two written things and is blind to what was never written.** Nine criteria and a ruling existed only in agent messages; §9 and §2 diffed 37/37 and 11/11, mutation-controlled, and reported clean throughout — because both sides were equally silent. Quote-diffing catches drift; only reading the *consumer* against the *source* catches absence. Ask "what does this brief rely on that no document contains?" |
| a grep census is a census | One used repeatedly in this phase finds **9 of 13** rosters where a parse finds 13 of 13, **and does not report the miss**. A 30% blind spot reporting clean is the fail-open shape again, this time in the phase's own tooling. Where the compiler can be the instrument, make it the instrument. |
| "I diffed it and it is clean" | Clean **on which axis?** A document declared clean by one PM was re-run on all axes by the next and yielded a quote containing a clause that exists nowhere, an altered "verbatim" quote with an inserted clause, a spliced first-person quote the record does not support, a dropped load-bearing opening sentence, and a deliverable routed to a later cluster in as many words and never delivered. A clean verdict that names no axis is a partial check wearing a complete one's clothes. |
| a clean diff means the document matches | Only for whatever you diffed. One PM diffed a table's **row keys**, reported clean, and said it had not checked bodies; the next diffed bodies and found **four rows grown a sentence the source never contained, one row missing, and two sentences deleted from a "verbatim" block**. A partial check that reports clean is worse than none, because the next reader believes it. |
| a conclusion recorded in four documents is settled | Four documents carried "C-13 and C-14 have prose upstreams with no executable equivalent". The premise was true and **the conclusion had been spent two clusters earlier** — the acceptance had already been taken, in the very files their successors were sent to extend. A conclusion propagates; the thing that spent it does not. |
| "registered" means the entry appears | Not necessarily. Two consecutive registration tests passed on **appears** rather than on **register**: a dummy reached a function's return value and was invisible to every reader, and another reached an info lookup while being invisible to the only question the consumer asks. A registration test must assert that the thing a *consumer* does is now possible — not that the entry can be found. |
| a cross-phase note will be read when it matters | Make the note **be** the test. P3a deliberately left `site/views.test.ts` depending on `site/index.html`, so P3b's teardown turns it red *by design* with a message naming the teardown. Its author's framing: *"the HTML dependency is not a cost I tolerated — it is the deliverable; §9 says a note is not a sensor, so the note **is** the test."* |
| a test that pins prose is stable | Not if the prose churns. A `site/` test began reddening on `docs/` edits because the orchestrator lands doc commits on `main` mid-phase. Discriminate upstreams **by churn** — a design document that has not moved all branch is a different risk from a plan amended four times — and **where the upstream is executable, execute it; parse only prose.** |
| `grep -c '↓'` counts skipped tests | **Control attached 2026-10-16, as this table now requires of itself.** GATE-P3b-1 built a throwaway file with two `it.skip`s, watched the summary line fire — `1 passed | 2 skipped (3)` — and confirmed `grep -c '↓'` returns **0** on that same genuinely-2-skipped output. The row below was previously asserted without one. **It returns 0 on a genuine 22-skipped run.** Every *"0 skipped, verified positively by `↓`"* on P3b verified nothing. **Corrected 2026-10-16, because the first version of this row was itself wrong — orchestrator error 30.** It added *"and `grep -c 'skipped'` can too"*, which is **false**: measured over four real logs, `grep -c 'skipped'` returns **2, 2, 3** on runs with 22, 22 and 26 skips and **0** on a zero-skip run. It discriminates correctly. The error was misreading a relayed *"gives 0 vs 4"* as *sometimes-0-when-it-should-be-4*, when it meant **0 at baseline, 4 on the skipped run** — the instrument working. **But it is a presence detector, not a counter**: those 2/2/3 are matching *lines*, not skipped tests. **Use vitest's summary line**, which answers both questions — `Tests 1349 passed \| 22 skipped (1371)`, so a parenthetical total equal to the passed count is positive proof of zero and an unequal one names the number. |
| an agent's last transcript line is the frontier of its work | **It is a statement of intent, not a record of state.** A PM read a killed agent's final self-instruction — *"Now extend the parser cross-check…"* — as the thing left undone, and briefed its replacement accordingly. The work had **already been finished**; the line was written *before* doing it. The adopting worker added no code there and verified instead. **Reasoning backwards from a last line infers a frontier that was never claimed** — ask whether the work after it exists rather than assuming the transcript stops where the work did. |
| `npm run build` gives you a clean `dist/` | **It does not clean it.** A verifier contaminated its own run this way and caught it: a stale planted file left **4 reds where a wiped rebuild gives 2**, and the spurious extra red was *"emits no test file and no testing/ helper into dist/shared"* — which **reads exactly like a genuine finding**. Anyone planting into `src/shared/testing/**` must `rm -rf dist dist-site` first. A gate runner that rebuilds over a dirty tree can report a defect that does not exist, in the vocabulary of one that does. |
| a test that derives its expectations from the constant is the robust kind | **It is robust against intentional change and blind to the constant moving at all** — which is the opposite of what you want from a *threshold* witness. Measured: `INK_FRACTION` 0.5 → 0.9 and `TIGHT_MULTIPLE` 2 → 3 each leave `src/shared/perception.test.ts` at **21 passed**, because every one of its boundary tests derives its budgets from the module's own constants. The only sensor that sees either move is the file that uses **literal** budgets. **The sharpest part: a docblock amended specifically to avoid a stale assertion now cites that derivation as its proof** — *"what witnesses that is … every one of which derives its budgets from the module's own constants"* — so **the cited mechanism is precisely the reason the claim fails.** Invariant 4 says assert on structure not values; a threshold is the narrow exception, and **every threshold needs at least one literal-pinned witness** or nothing can see it change. |
| a plant quoted in a brief is a measurement | **It is a measurement with an expiry date, and the commit that expires it is usually one of your own.** A verifier's plant was quoted verbatim into a later brief; by the time it ran, `24392c3` had changed the types out from under it — and it failed **toward** *"the hole is closed"*, which is the direction nobody checks. **Re-establish a quoted plant against the current tree before trusting its verdict**, especially a reassuring one. |
| a nonzero skip count means the same thing wherever you see it | **Two alarms in this repo mean opposite things.** A `beforeAll` rejection in any of the four `svelte-check` harnesses reports as **"N skipped" plus a file failure** — not fail-open, but the phase simultaneously teaches that a nonzero skip count is the alarm for a *stale or unreadable* run. Read the file-level result alongside the count; the count alone cannot tell you which alarm fired. |
| two deltas measured against the same baseline can be added | **Not if they were measured in parallel worktrees.** Two P3b commits were each measured in a separate worktree **against the same `24392c3` baseline**, so neither observed the other's presence — one recorded "after 83 / 1963", the other "after 82 / 1959", and **their deltas do not compose.** The branch therefore had **no recorded baseline covering its own tip**, not because nobody wrote one down but because parallel measurement structurally cannot produce one. **The recorded baseline is the common base they shared**, and the gate compares against that and reports the observed delta. A runner that reconciles toward the summed prediction is the worst outcome available: if the observed total differs, the sum was never evidence. |
| `rm -rf dist dist-site` wipes the built output | **It misses `dist-player/`, which `build:site` also emits and four test files read.** GATE-P3b-1 checked rather than assumed and found the manual wipe is **right for the wrong reason**: both Vite configs set `emptyOutDir: true` explicitly, so Vite empties its own outputs despite the outDir sitting outside `root` — where the default is *not* to empty. **Only `tsc`'s `dist/` genuinely needs the manual wipe; the `dist-site` half is redundant.** The runner then turned the rule on itself in `UNCERTAIN`: *"that reading is source inspection, not a measurement — I did not plant a file in `dist-player/` and confirm it was gone."* **The wipe is not ceremonial** — that run found `dist/` (576K) and `dist-site/` (192K) already present before it started. |
| a gate runner should fix what it finds | **A gate runner that repairs the thing it is measuring has destroyed the measurement.** PM-SHELL-P3b-4's wording, adopted as a standing rule. It generalises past gate runners: it is why a verifier does not fix what it verifies, and why "it fixes nothing" belongs in the brief above any individual check in the list. A repaired tree cannot answer the question the run was asked. |
| isolated worktrees make verification unsafe | **They do not — the distinction is causal claim versus count.** A verifier asserts *"mutate X, this named test reddens; revert, it greens"*, which is tree-local and composes across trees perfectly well. A **count** is a statement about a whole tree, and two trees are not the same tree. So: **verify in isolated worktrees freely; take whole-suite counts only from the serialised gate run in the primary worktree**, and label any count a verifier emits incidentally as tree-local and non-composable. **And record the sha each verifier ran at — it must be the gate's sha or a descendant**, or "verified" and "gated" describe different trees while both reports read clean. That is error 19's shape: a gate run against the wrong worktree returned a *plausible* number already in the record. |
| a §9 row is a measurement | **It is a relayed claim like any other, and this table's framing hides that.** "Each already cost a correction" reads as *measured*, but **a row is a sentence a tier-0 agent wrote from a worker's report** — so every omission and compression failure that governs relayed claims governs rows too, and the row arrives wearing the table's authority. Demonstrated: the skip-instrument row recorded `grep -c 'skipped'` as blind when the relayed *"0 vs 4"* meant **0 at baseline, 4 on the skipped run** — the instrument *working*. **Subtractive again**, which is the pattern across every correction pass on this project: not once a wrong fact, always a dropped clause or label. **So: a row that records an instrument as blind must carry the control that showed it blind**, or the next reader cannot tell which direction the number ran. PM-SHELL-P3b-4's generalisation, and it earned it by logging its own error beside mine — *"the row being wrong is not why I was wrong; four real logs were sitting on disk and I reasoned from a row instead of running the control over them."* **The existing rows have NOT been audited against this requirement.** |
| a sha in a brief is unambiguous | **It is unambiguous and it is stale.** Two agents an hour apart were briefed with shas that had moved before they read them. The lesson is **not** "re-check shas before dispatching" — that does not scale against a `main` that moves every few minutes. **Every sha in a brief needs its resolution procedure attached**, the way §6's merge step does. The gate brief carried one — *verify it rather than trusting me; if the count is nonzero, merge* — and the agent resolved and continued. The audit brief carried a bare assertion, so the agent could only flag it and stop. **A sha is a claim; the procedure is what makes it checkable.** This supersedes the weaker §6 practice "brief with a sha, never a section number alone". |
| a fix task always has a RED available | **Not when the fix is behaviour-neutral, and that is exactly when a worker will manufacture one.** An audit proved a proposed correction neutral over *every current assertion*, then flagged the consequence: *"a worker sent to 'fix this' and told to produce a failing test first will either find none and conclude the fix is unnecessary, or manufacture a fake one."* Both outcomes are bad and the second is worse. **Where no RED exists, the brief must say so and name what the real RED is** — here, a round-trip test on the helper, which first requires *extracting and exporting* an inline arrow so there is a function to test at all. **That extraction is the substance of the task; the one-line fix is not.** |
| a null measurement is a null measurement | **A null proved over all possible inputs is a different artefact from a null sampled over the ones you thought of.** AUDIT-UNESCAPE-1 did not test eight diagnostics and generalise: it proved from source that the formatter always emits its newline followed by `≥2 spaces` and that the templates contain no newlines, so a weld *always* carries that signature — making all nine real assertions immune **for any possible diagnostic**. Paired with both controls (one spanning a join, one matching only the weld) firing in the same invocation. **Prefer a message-independent null; when you can only sample, say which it is.** |
| a guard scoped to a syntactic region catches the thing it names | **Move the subject out of the region and the guard goes quiet.** `conditional` scopes its reachability scan to the write's *immediate enclosing function*; hoisting the write into a helper arrow and calling that arrow conditionally takes all three halves silent — **build 0, build:site 0, typecheck 0, 83 files / 1967 passed / 0 skipped.** The plant used was the commit's own dormant guard, its load-bearing proof that the check was not a restatement. **And the authors had already solved this, one guard over:** `store.test.ts:1036` reads *"The same duplicate moved behind a helper … is the cheapest way to satisfy a guard scoped to the literal `dispatch` body. It must not be a way out, so the check is over the module and keyed on the write."* They carried that to `undelegated` and not to `conditional`. **Tenth instance of the signature defect, inside the commit written to remove the ninth.** The generalisation is the new part: **the fix is usually already present on a sibling guard, and nobody thinks to re-apply it.** |
| a control proves the feature works | **Only in the position the control exercises it.** `isGlobalRoot` is an identifier-equality check, so `(globalThis as any).Date.now()` — **the idiomatic TypeScript spelling, the one a real evasion would be written in** — walks straight past it, along with four other cast and non-null forms, all measured invisible at 25/25 green. The suite's own control uses `(globalThis['Date'] as DateConstructor).now()`, where the cast wraps the **element access** and leaves `globalThis` a bare identifier. **So the cast is exercised in the one position where it does not break the sensor.** Two parentheses defeat the fix. **Vary the position, not just the presence.** Note the direction: the declared residue was *understated*, not overstated — none of the five needs a type checker, and all five are a one-line parser fix. |
| `main...HEAD` is the way to scope a phase review | **Three dots is right for the *diff* and wrong for the *count*.** `git diff main...HEAD` gives the branch's changes since the merge-base, which is what you want. `git rev-list --count main...HEAD` gives the **symmetric difference** — the branch's commits *plus every commit `main` has gained since the merge-base* — so on this project, where tier 0 lands docs commits continuously, it roughly **doubles**: measured **58** against the true **30**. A reviewer handed the three-dot form as a general instruction reported 54 and had to re-derive it. **Diff with three dots; count with two.** Orchestrator error 31, and it shipped *inside the correction for error 27*, which was also a commit count. |
| `npm run build:site` typechecks `site/` | **It does not, and neither does `npm run build` — so every "build 0, build:site 0" is two null readings, not one.** Measured: a planted `const x: number = 'not a number'` in `site/controls.ts`, grep-confirmed present, leaves **`build` exit 0 and `build:site` exit 0**; only `npm run typecheck` exits 1 and names it. **This widens the earlier row, which named only `npm run build`, and the widening is in the dangerous direction — `build:site` is the one that *sounds* like it covers `site/`.** Both builds have been cited as evidence across multiple shifts on this phase. **Only `typecheck` is evidence about `site/` types.** |
| a recorded note is a sensor | It is not. A note tells whoever reads it; nothing makes them read it. Where a gap is accepted, convert the note into a test that goes red the day someone crosses it. |
| `build:site` catches a Node builtin leaking into the browser bundle | **It catches one spelling of four.** `await import('node:fs')` on a *reachable* path in `site/fonts.ts` exits **0** with a warning, and the needle **ships** — found in `dist-site/assets/index-*.js` with a dedicated `__vite-browser-external-*.js` chunk emitted, which also defeats the constant-folding trap because the code is genuinely there. **So a real awaited code path that throws in a browser ships green.** The complement is the actionable half: inside `src/shared/` the purity guard catches **all three** import forms, so **the hole is `site/*.ts`, which nothing guards at all.** |
| a planted needle proves the bundle check can see | Only if the needle survives the build. A P3b survey's first plant was **constant-folded away by Rollup**, so the check reported green over a bundle the needle had never reached — a paired control that silently measured nothing. **A plant is inadmissible as a control until it is confirmed present in the built artifact**, by grep, before the check is run. Instance eight of "a check that cannot see reports fine". |
| a standing ruling in the handover was ruled | Not necessarily. "`seek` clamps to the last frame" sat in §4 under *do not re-litigate* for a week. It entered in the handover's **own birth commit**, and the P2 record it purported to settle says the opposite — *"Nothing pins `seek`… P3 must decide"*. It was the orchestrator's inference, formatted as an inheritance, and a PM correctly refused to build on it. **A ruling's authority is the measurement or the decision behind it; `git log -S` finds that in one command.** Where a §4 entry cannot be traced to one, it is a proposal. |
| the suite measures the code | It measures the code **in the environment you ran it in**, and every tier of this system runs inside the same agent harness. `svelte-check` 4.7.6 picks its output format in `getOutputFormat()`: an explicit `--output` wins, **otherwise it returns `machine` if `process.env.CLAUDECODE === '1'` and `human-verbose` if not.** Two gate harnesses spawned it with `{...process.env}` and parsed for a `COMPLETED` line that only machine format emits. So the suite was green for **every agent that ever ran it** and red on the only machine that ships — `main` was broken for nine hours and eight commits, and no tier could have seen it, because the blindness was in the thing all of them shared. **When a test spawns a child, strip the harness's variables and pin every format the child would otherwise decide by sniffing its environment.** |
| a failing `expect` inside a child-process callback fails the test | It escapes as an **uncaught exception**, the promise never settles, and the suite sits out the full timeout. This is why the red CI run took **10m45s** against a 43s local suite — `beforeAll` burned 300s and 600s timeouts reporting a verdict it already had at 8 seconds, and the duration was read as "the runner is slow" rather than "the harness hung". **Async harnesses `reject`; they do not `throw` from a callback.** |
| the last `--output` wins | Not under `mri`, which collects a repeated flag into an **array** — `outputFormats.includes([...])` is then false and the format **silently reverts to human**. `--output human --output machine` emits no `COMPLETED` line. A duplicated flag that degrades instead of erroring is the fail-open shape in argument parsing. |
| pinning the format in the root `typecheck` script is the clean fix | **It would reintroduce the bug**, and this is only visible by combining two workers who never read each other. The audit worker proposed it as the root fix and escalated, reasoning that svelte-check's "last-wins" would become load-bearing. The fix worker had already **measured that there is no last-wins**: the harnesses *append* `--output machine` to the script's tokens, so a root pin yields a **duplicated flag**, `mri` collects it into an array, and the format **silently reverts to human** — exactly the nine-hour failure, restored by the change intended to prevent it. **Do not make this change.** If the root pin is ever wanted, the harnesses must *replace* the token rather than append it. Neither worker was wrong; the hazard lived in the join. |

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
