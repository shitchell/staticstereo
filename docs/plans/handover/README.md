---
title: Session-scoped PM artefacts, frozen 2026-10-15
description: Ledgers, surveys and worker briefs rescued from a session scratchpad before it died — read-only snapshots, not live documents
status: frozen; do not edit, do not treat as current state
date: 2026-10-15
tags: [handover, orchestration, staticstereo, snapshot]
---

# Frozen PM artefacts — read this before using anything here

These eight files were written by PMs and workers into a **session scratchpad**, which does
not survive its session. They were committed at the point the session exhausted its
subagent pool (200/200) and could dispatch nothing further, because a fresh session gets a
different scratchpad and these would otherwise have been lost.

## They are snapshots. Three rules.

1. **Do not edit them.** They are a record of what two phases knew at one moment.
2. **Do not treat them as current state.** State lives in
   `docs/plans/2026-10-14-orchestrator-handover.md`. Rulings live in
   `docs/plans/2026-10-14-editor-execution-plan.md`. **Where either disagrees with a file
   here, the file here is wrong** — it was frozen earlier.
3. **Commit messages outrank all of them.** Both phases put everything load-bearing into
   commit bodies by rule, precisely because scratchpads die. `62696ae` is the clearest
   example: an empty commit whose 243-line body *is* P3b's task definitions.

**Committing these creates exactly the drift hazard this project has already paid for
twice — two documents carrying the same state.** The frontmatter says `frozen` and this
section says why; that is the mitigation. If they start getting cited as current, delete
them. Their value is the *reasoning* and the *briefs*, not the status tables.

## What each one is

| file | what it is | still useful because |
|---|---|---|
| `P3B-SURVEY-S1.md` | P3b's survey digest | *"~25 agents' worth of repo facts"* — the highest-leverage artefact either phase produced. **Caveat: its `transport.ts` line count (274) is wrong; it is 318.** |
| `P3B-TASKS-DEF.md` | P3b's eight remaining task definitions | A copy. **`git show 62696ae` is the authority**; this file says so itself. |
| `P3B-LEDGER.md` | P3b's running ledger across three shifts | Escalations with their reasoning, and every carry-forward. |
| `P3B-WORKER-BOILERPLATE.md` | The text every P3b worker received | Its §0 branch-point rule **has been wrong three times running** — reconstruct it, do not inherit it. **Its skip-instrument section is *correct* and was wrongly impugned**: a §9 row claimed `grep -c 'skipped'` was blind too, which was orchestrator error 30; the boilerplate's `grep -c 'skipped'` guidance measures sound. Prefer vitest's summary line anyway — it counts, where grep only detects. |
| `P1P7-LEDGER.md` | P1/P7's ledger across four shifts | The case-E measurements, the thirteen refutations, and the full open-hazard list. |
| `VERIFIER-COMMON-BRIEF.md` | The common verifier brief for P1/P7 | **Directly reusable.** Carries both completed verifiers' cross-cluster findings as binding addenda. |
| `BRIEF-V2.md`, `BRIEF-V4.md` | The two undispatched verifier clusters | **Ready to dispatch as written** in a fresh session. This is the next action on P1/P7. |

## Why the session stopped

The subagent pool hit its per-session cap of **200**, which is the built-in default — no
`CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` is set in the environment or in
`~/.claude/settings.json`. Both live PMs are therefore unable to dispatch. A fresh session,
or that variable raised, resumes everything; nothing is lost and no work is in an
inconsistent state, because both PMs stood down at clean boundaries with working trees
clean.
