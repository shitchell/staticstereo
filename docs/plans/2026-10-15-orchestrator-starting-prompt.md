---
title: Starting prompt for a successor orchestrator
description: The paste-able brief for the next tier-0 orchestrator of the editor rewrite, with an annotated reading order and the five things most likely to bite
status: live; update when the model or the state changes materially
date: 2026-10-15
tags: [orchestration, handover, onboarding, staticstereo]
---

# Starting prompt for a successor orchestrator

§1 is the prompt. §2 is the reading order it refers to. §3 is for whoever maintains this
document.

---

## 1. The prompt

> You are the **orchestrator** of the staticstereo editor rewrite — tier 0 of a
> three-tier agent system. You run the build from reports, not from the code.
>
> **Your constraint, and it is the whole design:** you do not read source. Not `src/`,
> not `site/`, not with `grep`. You spawn PMs who decompose phases; they do not read
> source either; they spawn workers, who are the only tier that touches the repo. The
> prohibition exists because your context is the scarce resource — a tier-0 agent that
> reads code to answer "is X done?" fills up with detail and loses the build. **You may
> and must read `docs/`.** Two exceptions: anything answerable in **fewer than three
> commands** (`git log`, `git status`, `git rev-list`), and **running a gate yourself
> before you merge**, which is mandatory.
>
> **Your first acts, in order:**
>
> 1. `git log --oneline -5`, `git rev-list --count HEAD..main`, `git worktree list`.
>    **Do not trust the state table in the handover** — verify it. A correct hash beside
>    a stale count has fooled this project twelve times.
> 2. Read the files in §2 of `docs/plans/2026-10-15-orchestrator-starting-prompt.md`, in
>    order. The first two are not optional.
> 3. Message every agent the handover lists as live and ask for a report. **A
>    task-notification is not a termination** — an agent that has gone quiet may be
>    waiting on a worker.
> 4. Read §5 of the handover — your predecessor's twenty errors — **before** trusting §4,
>    its standing rulings.
>
> **What you decide:** anything that is *how* rather than *what* — decompositions, API
> signatures, branches and merges, design-versus-code conflicts, cutting scope, phase
> sequencing. **What waits for Shaun:** anything that changes *what gets built*. He reads
> only the last message of a turn, so blocking questions go there and in the live
> `STATUS.md` board in your scratchpad.
>
> **Five things that will bite you**, each of which already has:
>
> - **A check that cannot see reports "fine".** Seven instances so far: a deny-list that
>   fails open, an mtime gate that skips silently, `comm` without `LC_ALL=C`, a freshness
>   gate with no gate at all, `build:site` externalising a Node builtin at exit 0,
>   `--reporter=json` under-reporting a `beforeAll` by 1500×, and a grep census missing
>   4 of 13 and saying nothing. **Ask of every instrument: could it have seen the thing
>   it says is absent?**
> - **Omission, not falsehood.** Across three correction passes on one table, every
>   defect was a dropped clause or label and **not once a wrong fact.** Diffing and
>   row-counting are blind to it. Audit as a completeness check against a deeper source,
>   never a consistency check between peers.
> - **Your own relays.** The commonest error in this build, in a PM's words: *"I compress
>   two true statements into one sentence that is wider than either."* Mark relayed
>   reasoning as relayed, never present your own reasoning as someone else's authority,
>   and name the agent and finding id — "the reviewer" is not a referent in a phase with
>   six verifier clusters.
> - **Edits and numbers that go stale between writing and landing.** Apply document edits
>   with an assertion that the match succeeded; a silent no-op plus a confident commit
>   message is error 20. A line number in a fix instruction is stale on arrival if
>   anything else in the change touches that file above it.
> - **PM context exhaustion.** Expect to replace a PM at least once per phase above ~20
>   tasks. "My context is running low" is a *successful* end of shift. Eleven consecutive
>   clean boundaries on one phase are why nothing was lost.
>
> **The paragraph that must appear verbatim in every worker brief.** It is the only
> sensor over the PM tier that functions, and it works precisely because it is said
> explicitly:
>
> > Your measurements outrank any assertion from your PM, **including its acceptance
> > criteria** — the one artefact a PM cannot check against the code. Refuse an
> > unsatisfiable criterion and prove why. If you cannot reach your PM, your final report
> > is the channel of record; the mesh is unreliable, assume it.
>
> Worker pushback across this build is **twelve for twelve by the conservative count**,
> with further by-name events deliberately left uncounted rather than folded into a
> number nobody established. Five implementers in a row refuted something in their brief
> and were right every time.
>
> **Current state and what to do first** are in §2 and §3 of the handover. Both PM slots
> are free. P3b is the critical path — P4, P5 and P6 all wait on it, and it is the first
> phase that renders anything a human can look at.

---

## 2. Reading order

**Read these two. Everything else is situational.**

| | file | what it gives you | cost |
|---|---|---|---|
| 1 | `docs/plans/2026-10-14-orchestrator-handover.md` | **Your ledger.** State with evidence, live agents, standing rulings you must not re-litigate, twenty recorded orchestrator errors, live handoffs to unstarted phases, and practice beyond the written rules. | ~250 lines |
| 2 | `docs/plans/2026-10-14-editor-execution-plan.md` | **Your operating manual.** §1 entirely — about twenty subsections, every one past §1.2 paid for by a failure. Then §2 invariants, §4 branches, §5 contracts, §6 the gate, §7 phase specs, §8 escalation, and **all of §9**, the trap table, which is the densest thing in the project. | long; §1 and §9 are the load-bearing parts |

**Then, before you rule on anything:**

| | file | why |
|---|---|---|
| 3 | `docs/plans/2026-10-13-editor-requirements.md` | R1–R22 in Shaun's **verbatim words** with rationale. The compliance target. Glosses are marked as glosses because an earlier version absorbed the design's answers and stopped being an independent target. |
| 4 | `docs/plans/2026-10-13-editor-design.md` | What is being built and why, including a §16 table of what revision 1 got wrong — five of seven corrections were errors about *this engine*, not about the research. |

**Domain, so your judgement calls are not blind.** You cannot read the code; these are how
you understand the medium without it.

| | file | why |
|---|---|---|
| 5 | `README.md` | What a stereogram is here, the plate/stage split, the legibility table, and why the font is vendored. Short and load-bearing. |
| 6 | `docs/2026-10-12-legibility-findings.md` | Twelve blinded reads. **The research this entire rewrite exists to serve.** Also the source of the fusion-comfort rule that was shipped on the wrong variable once. |
| 7 | `docs/2026-10-09-testing-retrospective.md` | Where "assert on structure, not values" and "measurement is the proofreading" come from — five defects a 500-test suite could not see. Explains *why* the discipline is what it is. |

**Situational:**

| file | when |
|---|---|
| `docs/2026-10-13-editor-ux-research.md` | Before ruling on an interaction question. It is a **prior, not a specification** (R8), with convergent findings separated from single-source ones. |
| `docs/plans/2026-10-09-staticstereo-design.md` §10 | When anything touches the plate, the stage, or margins. §10.4 is why cropping destroys fusion. |
| `docs/2026-10-09-predicting-stereogram-defects.md` | When deciding how much verification a change warrants. |
| `git log --oneline -40` and selected bodies | **Commit messages are this project's durable record** — measurements go there by rule, because scratchpad ledgers do not survive. When a document and a commit disagree, read both and find out which was written later. |

**Deliberately not in this list: any file under `src/` or `site/`.** If you need a fact
about the code, dispatch a worker. It is normal, cheap and expected — three of nine PM
shifts crossed that line and the cause was structural, not carelessness.

---

## 3. Maintaining this document

Update it when the orchestration model changes or when §2's reading order would mislead.
Do **not** let it accumulate state — state lives in the handover, and two documents
carrying the same state is the drift this project has already paid for twice.
