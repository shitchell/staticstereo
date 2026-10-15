---
title: Orchestrator handover — state, standing rulings, and what I got wrong
description: The tier-0 equivalent of a PM ledger — everything a successor orchestrator needs to take over the editor rewrite without re-litigating settled decisions or inheriting unverified narration
status: live; update at every state change
date: 2026-10-14
tags: [orchestration, handover, state, staticstereo, editor]
---

# Orchestrator handover

**Read this before acting.** It is the tier-0 counterpart of a PM's ledger, and it exists
because the execution plan mandated shift-change discipline for tier 1 and omitted it for
tier 0 — an omission the repo owner caught, not the orchestrator.

The same rule that governs a PM handover governs this one: **treat everything here as
claims to verify, not facts to inherit.** §1.2c is about PMs confabulating, but the
orchestrator has produced its own list (§5 below) and nothing structural prevents more.

---

## 1. First acts for a successor

1. `git log --oneline -5` on `main`, and `git worktree list`. Three commands, inside §1.3's
   exception. Do not take §2's state table on trust.
2. Read `docs/plans/2026-10-14-editor-execution-plan.md` §1 **entirely**. It has grown to
   fourteen subsections and every one past §1.2 was paid for by a failure.
3. Message each live agent in §3 and ask for a §5.4 report. **A task-notification is not a
   termination** (§1.2b) — an agent that has gone quiet may be mid-supervision.
4. Read §5 of this document before trusting anything in §4.

---

## 2. State

**`main` is the only branch that matters. Everything else is a phase branch.**

| Phase | State | Evidence |
|---|---|---|
| **P0** scene model | **merged** | gate re-run by orchestrator; 51 files / 972 passed |
| **P2** player | **merged** | 60 files / 1333; zero files under `src/` |
| **P0b** endpoints | **merged** | 60 files / 1356; freshness verified positively |
| fractional-viewport fix | **merged** | 60 files / 1358 |
| **P3a** shell, additive half | **in progress** | cluster C **15/16**; **75 files / 1765**, fifteen tasks with no numeric floor |
| **P3b** store, shell, teardown | not started | depends on P3a |
| **P1** `.stst` · **P7** perception | **not started, unblocked** | both depend only on P0 |
| **P4** canvas · **P6** timeline · **P5** assets · **P8** polish | not started | see plan §3 |

**CI is green on GitHub's runner and reproduces local numbers exactly.** Pages is
deployed; `/staticstereo/player/` resolves as a *directory* URL, which is what closes R14.

**Requirements closed:** R9, R10 (P0) · R14, R15, R16, R20, R21 (P2) · R17, R18, R19, R22
remain open with P1/P7 · R2, R3, R4, R6, R7, R8, R13 are P3's.

---

## 3. Live agents

**PM-SHELL-4** owns P3a. Three predecessors stood down cleanly at cluster boundaries; the
chain of handovers is in `scratchpad/P3-LEDGER.md`, which **is session-scoped and will not
survive** — if P3a is still open when you take over, your first act is to have its PM
restate the ledger's handover block into a report, because you cannot read it.

**P1 and P7 are unblocked and unlaunched.** The cap is two concurrent PMs. Launch them when
P3a closes, or sooner if you can hold three report streams.

---

## 4. Standing rulings — do not re-litigate

Each of these cost a round trip. A successor that reopens one is spending it twice.

**Scope and sequencing**
- Backwards compatibility is **void**. The owner: *"no one else is using this."* Any
  decision resting on it is to be reviewed, not honoured.
- P3 is split: additive half (toolchain, guards, registries, descriptors) then teardown
  half. The additive half merges green alone and unblocks P4 early. **Nothing renders
  until P3b's cluster F**, and the owner has explicitly accepted that.
- P8 (polish) closes no requirement. Cut it without ceremony.

**Model**
- `Transform` carries three rotations; `flip` is sugar over `rotateY: π`. Under orthographic
  projection `rotateX`/`rotateY` are a cosine scale on the opposite axis. The same type is
  correct once the rasteriser transforms depth — that is the designed flex point.
- Validators **preserve** layer ids and never mint them. Minting belongs to the editor's
  mutation path.
- Bundles are **UI macros** writing an `Anim` array at attach time, not registry entries —
  forced by `PresetFn` returning a single `Track`.
- Depth lives on **luminance**; alpha stays the mask. One channel cannot answer both "is
  this pixel in the layer" and "how near is it".
- The preset golden **stays**, against an earlier sentence calling it one-shot. Its
  exception to "assert on structure" is narrowed in plan §2.4.
- `seek` clamps to the last frame; playback wrap is a separate operation.

**Process**
- For `FIT_MODES`, a **compile error beats runtime registration** — it serves §11 better.
- Five `AssertNever` pairs over `Layer`, not four: `draw` is a variant.
- A phase may ship a criterion unmet **only with a sensor**, never with a note.
- `svelte-check` replaces `tsc` behind `npm run typecheck`, so §6's gate keeps its meaning.
- **A criterion already satisfied by an earlier phase is labelled, not re-witnessed.**
  Criterion 5 (by P0) and `FIT_MODES` (by P2's own tests, including the converse plant)
  both qualify. Duplicating an existing witness yields a test that cannot fail for a new
  reason.
- `DEPTH_SOURCES` stays where it shipped. Its recorded rationale said "orthogonal to both"
  and the measured relation is *orthogonal to `SHADINGS`, subordinate to `VIEWS`* — the
  conclusion holds, the sentence does not. Never re-cite the sentence.
- **Guard at compile time always; throw at runtime only where a wrong answer ruins the
  artifact.** See plan §1.2k.

---

## 5. What the orchestrator got wrong

Same convention imposed on every PM. All were caught by an agent below, not by the
orchestrator.

| # | Error | Caught by |
|---|---|---|
| 1 | Gave estimated stage-share percentages as measured figures | a worker re-measured |
| 2 | Read a task-notification as a termination; spawned a **duplicate PM onto a live branch** | the successor PM refused to dispatch and escalated |
| 3 | Committed docs into a PM's phase branch three times, not noticing the worktree was on it | a verifier saw a "concurrent writer" |
| 4 | Replaced a dangling pointer with a procedure **weaker than the one it replaced** | a verifier measured both halves |
| 5 | Ordered a tripwire in the wrong shape — hand-written sets that go stale silently | the verifier proposed the coupling instead |
| 6 | Wrote "the reviewer's verification" in a phase with six verifier clusters; it became "your verification" one hop later and nearly made a real measurement imaginary | the misattributed verifier refused the credit |
| 7 | "main is `9586eb4` — your E4 is fixed there" seeded a PM's false docs-only inference about a four-commit range | the PM caught it, then reported it |
| 8 | Claimed perfect-fit and whole-device-pixels contend; they never do | the fix worker measured |
| 9 | Hypothesised the fractional-viewport bug was in the fit arithmetic; it was in the measurement, one layer up | the fix worker refuted both my hypothesis and the bug report |
| 10 | Split P3 so nothing renders until P3b without weighing the owner's visibility | surfaced only by asking him |
| 11 | Landed eleven separate doc commits on `main` mid-phase, making a `site/` test redden on `docs/` edits and forcing three branch merges | two workers measured the churn |
| 12 | Briefed a PM to read plan sections **that were not in its checkout** — `main` had moved and its branch had not. **Recurred immediately on the next shift**, with the amended sections again being the ones the brief named, one of them a rule the PM was required to apply | the receiving agent's `git log --oneline -1 main`, now six for six |
| 13 | Wrote criterion 3 as "a dummy appears **without touching another file**" — measured false for a real registration on three registries. A PM correctly refused to reinterpret it in a ledger | C-13, C-14, C-15 measured it; the PM escalated rather than deciding |

**The pattern is uniform and matches what every PM reported about itself: each was a claim
a single command would have settled, skipped because it felt too small.** §1.2e is as
binding on tier 0 as on tier 1.

---

## 6. Practice beyond §1.3

- **Spot-check before merging and before standing a PM down.** `git log` against claimed
  shas, plus an independent gate run. Every merge so far reproduced exactly; the value is
  that it would not have, silently, if something were wrong.
- **Primary sources beat relayed ones.** The agent mesh is broken — workers cannot reach
  their PMs — so worker reports route to the orchestrator directly. That accident has been
  load-bearing: most significant findings arrived as primary evidence rather than PM
  summary.
- **Name the agent and the finding id when relaying a verification.** See error 6.
- **Do not rule on an item you cannot name.** Two PMs have asked for approval of
  criteria identified only by a local label; the correct response is to ask what it is.
- **Record decisions in commit messages.** They are the durable record; the scratchpad is
  not, and a committed source file must never cite it.
- **Brief with a sha, never a section number alone.** Error 12: a PM was told to read
  plan sections its branch did not contain. Hand over `main`'s sha and the instruction to
  check it; the receiving agent's `git log --oneline -1 main` has caught this five times
  out of five.
- **Dispatching a worker to answer one question is normal and cheap.** Say so explicitly
  in PM briefs — three of five shifts crossed the source prohibition, and the cause is a
  PM between tasks with nobody to ask (plan §1.2l).
- **Keep the live `STATUS.md` board** in the scratchpad for the owner — open questions at
  the top. It is his catch-up surface and he reads the last message of a turn, so blocking
  questions go there *and* at the end of the turn.
