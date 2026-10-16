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

1. `git log --oneline -5` on `main`, **and `git rev-list --count HEAD..main`**, and
   `git worktree list`. Do not take §2's state table on trust. The hash alone is not the
   check — a briefing with a *correct* hash and a stale derived "0 behind" reads as fully
   verified and is not. That has now been caught nine times out of nine.
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
| **P3a** shell, additive half | **merged** `7cd5599` | 80 files / 1881 / 0 skipped, typecheck 0 over 451, freshness positive. **Criteria 0, 1, 2, 3, 4, 5, 6, 12, 13, 17, 18, 20 met — twelve, not ten.** +523 tests, zero removals |
| **P3b** store, undo, scene time, teardown | **in progress, fourth PM (PM-SHELL-P3b-4) live · GATE GREEN** | **`f84b5da` — four local exit codes 0 AND `ci` green on GitHub (run `38858032393`, draft PR #3).** `Test Files 83 passed (83)` · `Tests 1967 passed (1967)` · 0 skipped. **"Zero removals" is WITHDRAWN as established — see error 34.** The gate's evidence for it was a count delta, which cannot supply names; a name-set census is being run now, and the claim stands or falls on that. Corroborating checks unaffected by this are a TypeScript-parsed title census and V-SENSORS' independent `+4` measurement in one worktree. **The predicted 83/1967 was confirmed by measurement and never used as the baseline** — the comparison ran against the recorded `24392c3` 82/1955/0, and CI re-running on a fresh checkout on a different machine returned byte-identical counts, which is the strongest disconfirmation available for a number that matches something already written down. Two verifiers (V-22, V-SENSORS) now running, pinned to `f84b5da`. Earlier row, for history: `feat/p3b-store` @ `c0a6b36`. **Criteria 8, 9, 15 and 22 done**; 9 verified by V-BC, 22 adopted at `24392c3` with fourteen mutation-backed claims. Gate 82 files / **1955 passed / 0 skipped**, four exit codes 0, typecheck clean **with and without `CLAUDECODE` stripped**. **Never seen by CI.** Outstanding: 7, 10, 11, 14, 15b, 16, 21, 23 |
| **P1** `.stst` · **P7** perception | **MERGED `da0e4a9` (PR #4, gated `e72e7ce`)** | **Closes R17, R18, R22 (model half).** Four exit codes 0 · **96 files / 2130 passed / 0 skipped** · CI `38882243266` success at the **byte-equal** gated sha · census 3 removals all named, all from `b3e7601`, both guards shown on all six census files. All seven §6 requirements met. **Requirement 1 is a RELAY, stated not implied** — 78 commits from V-5's pin to the gated sha, 4 touching `src/`/`site/`, and `9439c11` postdates every verifier, its RED re-established by the gate runner, which is the best available substitute and not the same thing. **Carried open: NOT-COVERED 6** (`deflate`/`CompressionStream` has no production consumer — parked against case E, Shaun's) · `vitest list` is collection-only so *"zero removals"* is **not** *"nothing was hollowed out"* · criterion 5's sensor is proven not-blind, **not proven exhaustive** |
| **P1 (superseded row)** `.stst` · **P7** perception | **in progress, fourth PM (PM-SHARED-4) live** | `feat/p1p7-shared` @ `b3e7601`. **All 13 implementation tasks complete.** **Three of four verifier clusters returned all-MET**; V-4 running. Baseline **96 files / 2110 passed / 0 skipped** — reproduced **three times independently**, and zero net test removals established by **three different instruments**. Remaining: V-4, five named findings, a reviewer at two rounds, a gate runner, and a green `ci` run. **Scope the *diff* with `main...HEAD` (three dots) and the *count* with `main..HEAD` (two) — see errors 27 and 31.** Three dots on a count gives the symmetric difference and roughly doubles it while `main` keeps moving |
| **P4** canvas · **P6** timeline · **P5** assets · **P8** polish | not started | see plan §3 |

**CI IS RED AND HAS BEEN SINCE `7cd5599`, THE P3a MERGE — nine hours and eight commits.**
*(Discovered 2026-10-15 only because the owner asked about the deploy pipeline. Orchestrator
error 24.)* This paragraph previously read "CI is green on GitHub's runner and reproduces
local numbers exactly", which was true when written and never re-checked after P3a.

Both the `ci` and `pages` workflows fail at the **same `npm test` step**, so `pages` is not
a separate problem — **the site has not deployed since `7cd5599`**, and `/staticstereo/`
serves the pre-P3a build. The last green run was `71c3c44e`.

Four P3a registration harnesses fail, all identically:
`site/fitregistration.test.ts:303` (×3) and `site/bindingregistration.test.ts:692`, each
with **"could not read the checker's COMPLETED line"**. The harnesses copy the project to a
temp workspace, plant a dummy registry entry, run `svelte-check`, and parse its output; on
CI that output arrives in **human** format with no `COMPLETED` line.

**The criterion is working and the parser is not.** The planted `tile` mode makes the
compiler name `FIT_MODES` *and* `planFit`'s `AssertNever`; the planted `cycle-view` makes it
name both `keybindings.ts` guards. That is exactly what the registration tests exist to
prove. Any fix that weakens the criterion is the wrong fix.

Eliminated cheaply, do not re-measure: **not a version skew** (`svelte-check` is 4.7.6 in
both a passing worktree and a fresh `npm ci`, and `package-lock.json` pins it), and **not
the `CI` env var** (machine format either way, non-TTY). Leading hypothesis, unconfirmed:
the temp workspace has no `node_modules`, so `svelte-check` resolves to a different binary
there — warm npx cache locally, cold on the runner. Competing: contention or a timeout, CI
taking **10m45s** against a 43s local suite on a 2-core runner, in a repo that already
records four concurrent `svelte-check` harnesses timing out a merged-phase test.

**FIXED and merged — `2524fa4`, PR #1, merge `57f1e15`.** CI run **38803799211** green in
**94s** against 10m45s red, 80 files / 1881 passed / 0 skipped, local and CI counts
agreeing exactly.

**The root cause was none of the three hypotheses above, including both of the
orchestrator's.** `svelte-check` 4.7.6's `getOutputFormat()` takes an explicit `--output`
first, **then falls back to `machine` if `process.env.CLAUDECODE === '1'` and
`human-verbose` otherwise.** Both harnesses spawned the checker with `{...process.env}`, so
**the output format was decided by whether the suite happened to be running inside Claude
Code.** Every agent on this project got machine format and a `COMPLETED` line; the runner
got human-verbose and none. The fix pins `--output machine` *and* deletes `CLAUDECODE` from
the child's environment — the second half is what matters, because with the ambient switch
gone, removing the flag now reddens the suite **everywhere** rather than only on CI.

It also explains the 10m45s, which had been read as runner slowness: the failing `expect`
sat inside the `child.on('close')` callback, so it escaped as an uncaught exception, the
promise never settled, and `beforeAll` ran out 300s and 600s timeouts reporting a verdict
it already had at 8 seconds.

**One `pages` run is red and the site is nonetheless correct — read this before reacting.**
*(2026-10-15.)* `pages` failed on `5dca775` with **"No artifacts named github-pages were
found"**, in a run whose own upload step logged success — artifact ID `12009955142`, 191628
bytes. A `gh run rerun --failed` reproduced it exactly.

**The site is current regardless, and this is checkable rather than hopeful:** `cc88b4b`
deployed successfully 35 seconds earlier, and `git diff cc88b4b 5dca775 -- . ':(exclude)docs'`
is **empty** — the two trees build identically, so the deployed bytes are the right bytes.
Both URLs return 200.

**Not a concurrency defect.** `pages.yml:30` already carries `concurrency: {group: pages,
cancel-in-progress: false}`, the setting GitHub recommends for Pages, so the second run
queued rather than clashed. Five of the six most recent `pages` runs succeeded; the failure
sits on a docs-only commit.

**RESOLVED — the probe came back green.** The next commit, `6a72c3f`, ran `pages` and `ci`
to **success** and its deployment reports `state=success`. So the `5dca775` failure was
**isolated to that run** — a transient in GitHub's artifact API, not a workflow defect — and
nothing needs fixing. **The workflow is sound; do not change it on the strength of that one
red.**

The method is the part worth keeping. A re-run of a failed run is a *weaker* probe than a
fresh run, because `actions/deploy-pages` has known attempt-scoping behaviour, so the
reproduction on re-run was not the evidence it appeared to be. The disjunction was written
down **before** the probe — green ⇒ isolated, red ⇒ a real defect blocking every merge —
rather than after, specifically so the five surrounding greens and a visibly correct site
could not be read backwards into the comfortable conclusion. That is the exact reasoning
error that left `main` red for nine hours.

**`pages` green on the merge commit, measured not inferred.** Both `ci` and `pages` are green on the merge
commit `57f1e15`, the deployment advanced to `ab6ca789`, and **`/staticstereo/` and
`/staticstereo/player/` both return 200** — so R14 is re-witnessed in production as a
*directory* URL rather than by an assertion about build output. The worker flagged `pages`
as inference because it has no `pull_request` trigger and it could only prove `ci`; it was
right to flag it and the inference held.

**AUDITED, 2026-10-15 — null result, and the null is load-bearing because it carries a
control.** Seven full-gate arms (ambient · no-`CLAUDE*` · `env -i` minimal · CI-like · under
a pty · `NODE_ENV=production` · no-system-fonts), comparing exit codes, counts **and
per-file identities**, plus sha256 of all 78 build artifacts across three environments.
**Six arms identical to ambient in every respect; artifacts byte-identical.** All of
`node_modules` grepped for agent-harness sniffs: exactly four hits, of which only
`svelte-check`'s is behavioural and the rest select ANSI escapes.

**The control that makes the null admissible:** the historical defect was *reinstated* in
`site/fitregistration.test.ts` and measured — green under ambient, **red under `env -i`**,
with the 5 tests reported as *skipped* rather than failed because the throw is in
`beforeAll`. The nine hours, reproduced on demand and caught by the method. Reverted,
tree verified clean.

**Carried findings, none of which can produce a wrong answer:**
- **`npm run typecheck` is itself still ambient-switched** — machine format for every agent,
  human-verbose for CI. Nothing parses it, so it is cosmetic; but it means **every agent on
  this project reads a different typecheck log than the runner emits**, which is the
  perception gap that let the nine hours run.
- **`site/typecheck-gate.test.ts` inherits the full environment unpinned** — and was measured
  robust under **all four** formats svelte-check can choose, since it asserts on exit status
  and a filename substring. Robust, not lucky. No RED is available for it, so invariant 1
  forbids changing it.
- **`UPDATE_PRESET_GOLDEN` was the only read in the repo that could turn red into green —
  FIXED, `9312529`.** And it was **not theoretical**, as this bullet originally called it: a
  worker corrupted one recorded value in the committed fixture and measured the flagged run
  going **green, exit 0, five passed**, on a known-bad fixture. It is now a *write* mode
  rather than a *pass* mode — the run rewrites the fixture **and fails**, saying so. The
  worker went one step past the shape asked for, and the step matters: the fixture is
  snapshotted **before** the write and every comparison reads the prior copy, so the
  regenerating run diffs against what it is replacing. Otherwise the four comparison tests
  sit vacuously green inside the red run and a reader scanning "4 passed, 1 failed" takes
  them for evidence.
- **A deliberate host dependence exists and is documented**: `DISABLE_SYSTEM_FONTS_LOAD=1`
  reddens 4 tests in 2 files, one of which is a *positive control* whose comment says it
  exists so the file cannot "pass while blind". `sans-serif` still resolves from the
  vendored face, so production text is safe; only `serif`/`monospace` throw.

**Not swept, stated so the census reports its own blind spots:** non-Linux hosts, other Node
versions, a clean `npm ci` per arm, `npx` offline, individual test *names* (per-file counts
only), and `node_modules` exhaustively. And **`HOME` was not scrubbed** in the minimal arm,
so anything reading `~/.config`, `~/.cache` or fontconfig user dirs was never isolated — a
hermetic `HOME` is the obvious next experiment and was not run.

R14 is unaffected as a *requirement* — `/staticstereo/player/` resolved as a directory URL
when it was last deployed — but **it is not currently witnessed in production** and must be
re-confirmed once `pages` is green again.

**Requirements closed:** R9, R10 (P0) · R14, R15, R16, R20, R21 (P2) · R17, R18 and R22 remain open with P1/P7; **R19 is P5's** per plan §3 · R2, R3, R4, R6, R7, R8, R13 are P3's.

---

## 2b. P1/P7 — requirement 1 is NOT satisfied at HEAD. Ruled 2026-10-16.

**All four verifier clusters ran against `b3e7601`. Seventeen commits have touched `src/` or
`site/` since** — confirmed by the orchestrator's own `rev-list`, against a census that said
ten, because the set **grows while the phase works.** So `05a7d2e`'s sentence — *"every
criterion MET with evidence from a verifier that implemented none of it"* — **is true of the
tree the verifiers saw and is stated about the tree at HEAD, and they are different trees.**

**Worse, and the reason this is not merely bookkeeping: a verifier passed a criterion over
prose.** Criterion 10's witness at `6531698^` was two `*`-prefixed docblock mentions of
`src/cli/scene.ts` and **no import of it**. Verified by the orchestrator: `grep -c` returns
**2**, and `grep -E "^\s*import .*cli/scene"` returns **nothing**. **A raw count would have
let me refute the PM; the cheap check — does the file *import* what the claim compares
against? — settles it.** The gap was then found by a *reviewer* and fixed by an
*implementer*, so **criterion 10's only real RED was established by the person who wrote the
fix**, which is precisely what requirement 1 forbids.

**V-2 has no report at all** — one sentence in `7fda4b0`, no criterion named, and the phrase
*"RED re-established"* never appears for it, where it appears explicitly for V-1 and V-3.
Its caution is kept verbatim: *"I cannot distinguish 'V-2 did measure RED and nobody wrote
it down' from 'V-2 did not.' The honest statement is that the record does not support the
claim, not that the claim is false."*

**RULED: V-5 at full scope — option (a), the more expensive one.** Six criteria whose
current sensor is shaped by an unverified commit (**P1-7, P1-8, P1-10, P7-2, P7-5, P7-6**),
the new arity guard at `819101d`, everything I-J2 and I-K2 landed, **and criteria 4, 6 and
10 re-established from scratch.** The cheaper option — carrying V-2's gap as a recorded hole
— was rejected because **V-2 is not merely unevidenced, it is known to have failed once, in
the specific way a control must not.** "4 and 6 are probably fine" is inference from absence
about an instrument that demonstrably passed over prose.

**The gate runner's brief says requirement 1 is "already satisfied — do not re-run this."
That is false and must be corrected before it runs.**

**Criterion 25 is reassigned to P3b**, which owns `site/`. It was open with no verifier, no
sensor and no owner, and it is a guard over `site/*.ts` imports — not P1/P7's surface.
P1/P7's gate report records it as **open and owned elsewhere**, not open and unowned.

**Two structural notes, neither blocking, both recorded because the shape recurs:** P7-6's
clause was retired **by V-4 itself** — a verifier amending the criterion it was sent to
check, well-measured and ratified at `94226e5` but worth naming. And P7-8's implementing
commit predates its own correction by a day, with **the verifier that found the error being
the one that passed the criterion.**

---

## 2a. THE SESSION IS OUT OF SUBAGENTS — read this first

**RESOLVED — the cap does not carry across a session restart.** *(2026-10-16.)* The
2026-10-15 session exhausted its subagent pool at 200/200, the built-in default, and
**both live PMs could dispatch nothing.** Shaun stopped and resumed the session; the
counter reset and dispatches have worked since. **A later PM re-tested it rather than
inheriting this paragraph** — by dispatching a worker that does real work, not a probe —
and it spawned. **Do not inherit "BLOCKED" from this section; it is history.** The scratchpad
id is shared across the restart but the task-session id is not, which is the likely
mechanism. Raising `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` before a long session is still
worth doing: this one burned 200 agents.

**Nothing is lost and nothing is half-done.** Both PMs stood down at clean boundaries with
clean working trees, and the session's scratchpad artefacts — which would have died with it
— are committed under **`docs/plans/handover/`**, with a README explaining that they are
**frozen snapshots, outranked by this document and by commit messages.**

**A third PM was killed mid-shift by an expired login, and left 782 green but unverified
insertions.** Salvaged to **`salvage/p3b-criterion-22`** (`b27a315`, pushed) rather than
onto the phase branch, which stays clean at `febb020`. Measured by the orchestrator on the
tree as found: typecheck 0 over 455, build 0, build:site 0, test 0, **82 files / 1955
passed / 0 skipped**, +7 tests over `62696ae`.

**Recovered after the PM was resumed from its transcript, and it corrects this entry twice.**
First: **verification is NOT owed on A-4, C-1 and C-2 — V-BC completed before the kill** and
its report simply never reached the orchestrator. RED was re-established individually for
all three, every plant into the real modules, grep-confirmed and built before any verdict
was read. **Criterion 9 first half MET, second half MET WITH FINDINGS, criterion 8's A-4
clause MET WITH FINDINGS.** The 134M worktree removed as "stale" was V-BC's, and it was
correctly empty **by design** — it committed nothing and archived to the scratchpad.

Second: **"most of H-2" overstates it.** H-1's brief forbade building H-2's sensor but
authorised a plant-and-revert compile demonstration for its own acceptance criterion, so the
salvage is most likely **H-1 plus its own demonstration**. **H-2's approved fourth
`svelte-check` harness is a separate artifact** with four mandatory conditions (strip
`CLAUDECODE`; pin `--output machine` on its own spawn, never the root script; `reject` never
`throw` from a callback; parse-failure and criterion-not-met distinguishable) plus a
wall-clock re-measure against the 94s budget.

**Three V-BC findings to hold.** **A-4's duplication guard has a measured hole** —
reassignment defeats `undelegated`, tag-free selection defeats `tagsNamed`, and both at once
ship invisible at test 0 / typecheck 0, so `store.test.ts:277`'s "fails closed" claim is
**false** for that case. **Criterion 9's vacuity floor lives in a different test from the arm
it floors** — replacing `snapTime`'s whole body with a constant reddens 14 tests and *not*
the agreement arm. And **C-2's clock-sensor weakness was correctly flagged but wrongly
diagnosed**: not the hand-written-list shape but **member-name suppression** —
`globalThis.Date.now()` evades a roster `Date` is already on, so extending the roster cures
nothing.

**On the salvage, now evidenced rather than inferred.** **RED was observed** — two distinct
RED states recovered from the killed agent's transcript, `6 failed | 44 passed` and
`1 failed | 49 passed`, GREEN progressing 50 → 51 and the suite 1948 → 1954. **But RED
observed is not RED attributed**: no per-claim ledger survives, which is exactly what the
missing report would have carried. **The compile-rejection wall has been seen to fail** —
`typecheck=1` six times against `typecheck=0` four times, with `1 ERRORS` and `2 ERRORS`
lines — so it is not an unexercised assertion. **The residue is derived, not asserted**: the
partition is total over `CONTROL_IDS.length` measured at 63, membership is checked against a
registry-derived set, and there is **no `startsWith('preset.')` and no literal `'preset.*'`
anywhere** — it also obeyed the arity trap by citing the length rather than pinning a
written-down total. **And it was definitively mid-flight**: the agent's last output is an
instruction to itself to extend the parser cross-check.

**The adoptable path is one task, not a rebuild:** a worker reads the salvage diff,
re-establishes RED per claim, finishes the parser cross-check, and reports the mechanism —
**how the computed-string-key erasure was avoided is still unknown**, and `TS2322 ×32` is
consistent with a shape that preserves field types without being proof of one.

**Superseded inference, kept because it was wrong in a way worth seeing** — from added
exports and test titles only it read as **H-1 and most of H-2, criterion 22**: `WritableControlId`, `SetAction`,
`WRITABLE_CONTROL_IDS`, `unwritableControls`, a writable/residue partition over
`CONTROL_IDS`, and a second-clause pair asserting a wrong-typed write fails to compile.
**If that reading holds, it answers the question briefed as permitted-to-fail** — H-1 was
explicitly allowed to return *"this shape cannot be typed in TypeScript"*, because SPIKE-1
had measured the counter-example and nobody had measured a solution.

**Nothing about it is established.** No RED was observed by anyone, so every new test needs
its RED re-established individually; "the residue is exactly the preset family" is an
unchecked claim about 46 of 63 controls; a worker killed mid-flight can leave a coherent,
passing, **half-scoped** tree; and a fails-to-compile assertion that cannot be made to
compile-and-fail is the paired-control problem in its purest form. **Adopt it through a
verifier that implemented none of it, or discard it and rebuild — discarding is a
legitimate outcome, not a waste.**

A stale 134M agent worktree under `.claude/worktrees/` was checked for unique commits and
uncommitted work (**none**) and removed.

**The next three actions, in order:**
1. **P1/P7: dispatch verifier clusters V-2 and V-4.** Briefs are written and ready as
   `docs/plans/handover/BRIEF-V2.md` and `BRIEF-V4.md`, with
   `VERIFIER-COMMON-BRIEF.md` as the shared preamble — all three already carry the two
   completed verifiers' cross-cluster findings as binding addenda. Then the five findings
   below, a reviewer at two rounds, a gate runner, and a push with a green `ci` run.
2. **P3b: continue cluster H.** Task definitions are `git show 62696ae` (authoritative;
   the copy in `handover/` is not). Verification is still owed on A-4, C-1 and C-2.
3. **Shaun owes a ruling on case E** (+27.4% stored on flat-graphic projects). The
   container format is frozen until then.

**P1/P7's five verifier findings that are work, not notes:**
- **`cardboarding` is declared `graded` in the roster and "Objective and ungraded" in the
  module**, with a *passing* test titled `reports quantities and no grade`. If the roster is
  right, **P7 criterion 2 is violated.**
- **The `GRADING` ratchet is blind in the objective direction** — flipping either
  `cardboarding` or `fusionComfort` to `objective` reddens nothing. **That is how the above
  ships green.**
- **`src/shared/purity.test.ts:505-507` is false.** A mis-pathed `rootDir` and a moved
  `outDir` both leave it 15/15 green, and 23/23 with the freshness file it delegates to.
  **Both guards certify a `dist/` that `tsc` no longer writes.**
- **Criterion 7's guard tests the fixture, not the construction.** Content-dependent method
  selection in `writeStst` leaves 421 tests green — the exact class the criterion exists to
  remove. Met by code today, unprotected against rot.
- **The third purity hop is live next door.** `src/core/purity.test.ts` has no closure
  assertion, so `shared → core → core/testing → typescript` is green on an unbuilt tree.
  Criterion 8 is scoped to `src/shared/` and **is MET**; **ruled: the neighbour is in
  scope** — it is the same defect one file over, removed for `src/shared` by this phase and
  left standing, and *"a conclusion propagates; the thing that spent it does not."*

**And a new instrument failure worth a §9 row:** a shell glob **silently no-opped a
mutation and both arms reported green** — a false null that would have confirmed a commit
for the wrong reason. **Apply mutations from patch files, never from a glob.**

---

## 3. Live agents

**Both slots are full, launched 2026-10-15 from `c4f4b7f`.** The cap is two.

- **PM-SHELL-P3b — STOOD DOWN 2026-10-15 at a clean boundary, cluster A complete.**
  `feat/p3b-store` at `ceaa3b0`. **Criteria 8 and 15 are DONE** (store `cf4b119`, hash
  projection `7cb2704`, microtask coalescing `ceaa3b0`); gate 82 files / 1929 passed / 0
  skipped, four exit codes 0 — **local only, never run on CI.** **Zero verifiers, zero
  reviewers, zero gate runs** on this phase: four implementer reports and a survey, all
  internally rigorous, with no independent re-establishment of RED. Its own summary of
  itself: *worker pushback fifteen for fifteen, and every single thing it got wrong was
  caught below it.* A successor's first dispatch is **V-A**, which has never run. Its scope
  was **eight criteria**: 7 (mark-based undo), 8 (store, hash as projection), 9 (scene time
  over P2's transport), 10 (teardown with a per-file disposition table), 11 (the R2/R8
  architecture test), 14 (`dist.test.ts` has teeth, with the paired control), 15 (the hash
  projection coalesces on a microtask), 16 (nothing above the canvas in flow). Criteria
  0–6, 12, 13, 17, 18 and 20 were closed by P3a; **19 is ruled discharged.** Told to stay
  out of `src/shared/`, `src/node/canvas.generics.test.ts`, `src/cli/` and
  `site/legibility.test.ts`. **Critical path: P4, P5 and P6 all wait on it**, and its
  cluster F is the first thing that renders.
  **Shift 2 (PM-SHELL-P3b-2) also stood down cleanly**, at `760f353` — **criterion 9 DONE**,
  82 files / 1948 passed / 0 skipped, four exit codes 0, **local only; CI has never seen this
  branch.** Verification is owed on **A-4, C-1 and C-2** (V-A covered only A-1/A-2/A-3) and
  must not drop. **Seven proposed tasks — `D-0, T-1, H-1, H-2, F-0a, F-0b, G-5` — exist in
  no document**; the PM has been asked to write them into its ledger *and a commit message*
  rather than have the orchestrator reconstruct them, which is how error 16 deleted a
  criterion. Two stale facts for any inherited brief: `controls.ts` no longer aliases
  `snap = snapTime`, and the survey's `transport.ts` line count (274) is wrong — it is 318.
  Scope is now **eleven**, after criterion 21 (store as single source of truth), criterion
  22 (every control *writable*, not merely reachable — ESC-7) and criterion 23 (no playhead
  drift on resume). Unblocked and ready: B-1,
  B-2, C-1, C-2, D-1, E-1, E-2. All seven of its open escalations are **ruled** in plan §7's
  "P3b rulings" block.
- **PM-SHARED-3** — branch `feat/p1p7-shared`, worktree `…/staticstereo-p1p7`. Third PM on
  the phase. Six implementation tasks in the order the outgoing PM recommended:
  ZIP64/data-descriptor **refusal** assertions · criterion 4's strip-width sensor ·
  criteria 7 and 8 sensors · criterion 6's one edit at
  `src/node/canvas.generics.test.ts:106` (**not `:107`, which the criterion says**) · CLI
  wiring, **the phase's only `src/cli/` touch and its only collision surface** · criterion
  7 cross-runtime · the `illegible` reword. Then **four verifier clusters, a reviewer and a
  gate runner — none of which has ever run on this phase.** Briefed explicitly that its
  branch is three `docs/` commits behind `main` and that it must read the planning
  documents from `main`, not from its checkout.

**Baseline measured by the orchestrator on `c4f4b7f`, in the primary worktree, builds
before tests:** typecheck 0 over 451 files · build 0 · build:site 0 · test 0 ·
**80 files / 1881 passed / 0 skipped**, reproducing P3a's merge numbers exactly. The first
attempt returned 127/0/1/1 from the `-main` worktree and was an **instrument failure, not a
regression** — that worktree's `node_modules` predated P3a's Svelte install. It has since
been reinstalled so tier-0 gate runs work there.

P3a merged after **eleven** PM shifts, each a clean boundary; P1/P7's second PM stood down
with its handover written into its report rather than into the scratchpad, because the
scratchpad does not survive and a successor cannot read it. Every ledger those phases
produced is **already gone or will be** — everything load-bearing from them is in `docs/`
or in a commit message.

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
- **`seek` and `snapTime` must agree, and both clamp.** *(Re-grounded 2026-10-15 — see
  error 22. The previous wording, "`seek` clamps to the last frame; playback wrap is a
  separate operation", was an orchestrator inference written in this document's own birth
  commit, and P2's handoff record says the opposite: "Nothing pins `seek`, so a flip either
  way is unguarded — P3 must decide which the editor's scrubber calls." A PM refused to
  build on it and was right to.)*

  Decided now, on merits, for the first time. P2 measured the two disagreeing in the final
  inter-frame gap: on a 2 s 12 fps scene `seek(…, 1.99)` anchors at **frame 0** while
  `snapTime(…, 1.99)` gives **1.9167**, and they agree again at 1.95. Two functions that
  both answer "which frame is at time *t*" must not disagree for any *t* — that, not the
  endpoint convention, is the invariant worth pinning, and it is assert-on-structure rather
  than a value pin: **∀t, `seek` and `snapTime` select the same frame.** Both clamp, because
  an editor scrubber dragged past the end parks at the end; a playhead that teleports to
  zero is a bug in every timeline tool anyone has used. **Playback wrap remains a separate
  operation** — looping is `repeat`, which acts on advance, not on frame selection.

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
| 23 | Wrote a criterion as *"assert the strip width equals the margin width"* — **true only at even `sepFar`.** `floor` versus `ceil`: at 111 the left strip is 55 against a margin of 56. An implementer would have written the equality, watched it pass at the default 110, and shipped a sensor green only because nobody swept an odd number | the PM refused to dispatch the sentence and proved it with a sweep |
| 22 | **Recorded my own inference as a standing ruling** — "`seek` clamps to the last frame" — in §4, under *do not re-litigate*, in this document's **birth commit**, when the P2 record it claimed to settle says "P3 must decide". A ruling with no decision and no measurement behind it, wearing the format of an inheritance | the PM declined to build two tasks on it and asked for the provenance |
| 21 | **Relayed a finding whose premise was measurably false, twice, with two different wrong counts** — "three modules absent from `toHaveLength(7)`, none reddens it", then "eight". The list is 7 of 7 correct; the eight are in neither bundle and planting them *reddens* the suite; and the check already had teeth. I propagated a P3a finding into two tier-0 documents without ever asking whether a single command would settle it | the PM's survey planted all three cases |
| 42 | **Wrote "three independent measurements converge" about three readings of source.** One method applied three times is blind in whatever way the method is blind, and **a worker had already flagged exactly this about its own result** — *"agreement between two reports, not two measurements of different kinds"* — before I wrote the stronger claim. **Convergence is reassuring; it is not corroboration.** The plant control that would make it a measurement is still outstanding, and the docs rule stays open until it lands | the PM corrected the framing, citing its own worker's caution |
| 41 | **Corrected error 40 with a reader set of eight; it is three.** My instrument was `grep -rln "docs/"`, which **matches comments** — five of the eight reference `docs/` only in prose, and two have **no `fs` import at all.** So the correction committed **the same compression one level down**: *"this file mentions the path"* is true, *"therefore it reads it"* is false. **It also caused a departing PM to disavow a commit whose safe-list was CORRECT**, on the strength of my wrong set. **And an over-wide blame set is not the safe side** — it invites a real branch defect to be waved off as the orchestrator's docs commit | PM-SHARED-5 opened every candidate file |
| 40 | **Briefed every PM that a "docs-only" divergence is safe to merge. Measured false — eight test files parse `docs/`**, four of them the design document, which I amended by +70/−4 at `a8f9edd` while two phases were merging `main` on that rule. **I checked the path prefix, not whether anything reads the path:** *"everything is under `docs/`"* is true, *"therefore no test can see it"* is false, **and I briefed the join as a verification.** Nothing broke — both gates were green afterwards — but every merge made on that rule was made blind | a verifier measured it against its own PM's merge |
| 39 | **Quoted a CI budget band as a constraint — again — and it was wrong again.** 94s became "93–108s with apt 19–25s" after error 29; the next run measured **117s with apt at 31s**, outside the corrected band. **Error 29's shape recurring inside error 29's own correction.** The fix is not a third band: **stop quoting a performance figure as a constraint at all.** Say what it is made of and have the runner measure it — any band from four samples is a sample | the PM logged it against itself rather than absorbing it |
| 38 | **Briefed a PM to "watch for their clearance requests and grant one at a time" — requests that §1.2g makes structurally impossible to deliver.** A worker had already received `No agent named … is reachable` twice, in a document I had read. Waiting was a deadlock, not a protocol; the fix is to **push the decision**, which the PM did unprompted. **And I launched that successor into the primary worktree while its predecessor was still committing there**, having taken a handover commit as proof of stand-down — two PMs writing one tree, which resolved benignly by luck rather than by design | the PM pushed the decision and reported the near-divergence against itself |
| 37 | **Ratified a task premise that was false, and wrote a §9 row that reassured where it should have warned.** ESC-9's *"the check reddens on a doc string"* is wrong — comments are stripped, a docblock never reddened it, and the offender is a **runtime string literal** minification must keep, so the clause was already true and the natural fix **would have gone green and fixed nothing.** Separately my §9 row said the `node:fs` needle **ships and is findable**; measured, vite rewrites it and the text is **absent from every byte**, so the old check passed 34/34 over a bundle carrying a live builtin import. **Both point the same way — toward believing a check works** | the worker refuted the premise of its own task |
| 36 | **Inferred which finding each orphaned file belonged to, from the file set, and reported it as observation** — "the file set reads as I-J (F1 in `perception.ts`)". **F1 was already committed at `2ab76ab`.** My discard-and-redo recommendation would have **reverted good committed work to re-watch a RED for a change already made correctly.** `git log` was one command. The PM nearly accepted it *because it was plausible and matched what it remembered briefing* | the PM checked the log instead of the mapping |
| 35 | **Read a 44-line dirty tree as "ordinary interrupted work, not corruption" on the strength of its line count** — and it contained a **live un-reverted rot plant** changing a real perception function's signature *and* arithmetic. **Behaviour-neutral at every call site, so nothing would have reddened and it would have passed the gate.** I had the diffstat and did not look at the diff | the PM read the content |
| 34 | **Accepted "zero removals" from a gate report that named no instrument for it, and wrote it into the state table as established.** Its evidence was a count delta — +1 file, +12 tests — which **cannot** establish the claim, since +12 is equally consistent with fifteen added and three removed. §6.4 asks for names. I had just spent the evening routing a defect about a *silently unarmed* census and did not ask the prior question: **was there a census at all?** | the sibling PM re-read the gate report rather than its memory of it |
| 33 | **Let seven reviewer findings live only in chat.** Round 1 routed to me **twice** because the mesh dropped it in both directions; I read it both times, acted on parts in messages, and **wrote none of it into a document.** F1 is a shipped user-facing string contradicting the design in two places with a sensor blind to the difference, and it **survived two full review rounds without reaching a decision-maker.** This is error 15 exactly — the one that cost nine criteria and produced five wrong reconstructions when rebuilt from memory. **Now transcribed, not summarised, in `docs/plans/2026-10-16-p1p7-review-findings.md`** | the reviewer flagged it against itself while closing round 2 |
| 32 | **Wrote a branch-point rule with the range direction backwards** — *"if `main..HEAD` touches `src/`, `site/`, config or tests, stop and escalate"*. That range is **the branch's own work**, which is supposed to touch `src/`; measured 39 commits over 46 files, so the rule fires on every healthy feature branch. The direction carrying the risk is **`HEAD..main`**. **The project has now had this rule wrong four times** — three in a worker boilerplate, once from me | the PM measured both directions instead of obeying one |
| 31 | **Told reviewers to scope with `main...HEAD`, three dots — right for the diff, wrong for the count.** `rev-list --count` over three dots is the **symmetric difference**, so it adds every commit `main` gained since the merge-base: measured **58** against the true **30**. A reviewer reported 54 and re-derived it rather than quoting me. **It shipped inside the correction for error 27, which was itself a commit count** — I fixed a wrong count by handing out a command that produces a different wrong count, and both numbers were plausible | the reviewer re-derived instead of quoting |
| 30 | **Misread a relayed "gives 0 vs 4" as evidence an instrument was blind, and wrote that into §9 as fact** — where it meant the opposite: 0 at baseline, 4 on the skipped run, i.e. the instrument discriminating correctly. A PM then applied my false row faithfully, concluded a committed document was defective, declined to cite it to workers, and flagged a landed commit's evidence as resting on an unshown instrument. **All three conclusions were sound reasoning from a premise I got wrong.** Measured over four real logs: `grep -c 'skipped'` gives 2, 2, 3 on 22/22/26-skip runs and 0 on a zero-skip run | caught by re-measuring my own row when a PM acted on it |
| 29 | **Quoted "94s" as the CI budget in brief after brief, when it was a single sample of a quantity that varies 93–108s** — and a quarter of which is `apt-get install ffmpeg`, not the suite at all. I cited a three-significant-figure number for a thing I had measured once and never decomposed, and every PM inherited it | H-2 measured the job's composition instead of quoting mine |
| 28 | **Attached criterion 6's "scoped to a named list … is this *constant* perceptual?" sentence to criterion 8**, which is about *parameters*, not constants — and criterion 6 already carried its own copy. A reader scoping criterion 8 from that paragraph scoped the wrong criterion entirely | a verifier read the two criteria against each other |
| 27 | **Recorded P1/P7 as "13 commits" in this document; the branch is 26 non-merge commits and 2 merges.** The figure named a merge as the phase's base, so **twelve criterion-bearing commits sit *below* it** — every P1 criterion 1/2/3/4/5/8 and P7 criterion 1/2/3/4 commit. **A reviewer or gate runner scoping to that range would have skipped the entire evidence base for eight criteria** and reported clean. One `git rev-list --count --no-merges main..HEAD` settles it, which is why it is the §1.2e shape exactly; I have now run it and confirm 26/2. No completed measurement is contaminated — all three verifier clusters independently used merge-base `69abca9`. **The whole-phase range is `main...HEAD`, three dots** | the PM re-derived the range instead of inheriting it, after relaying it once |
| 26 | Told three workers that `site/legibility.test.ts:228`'s `toMatch(/sepNear/)` "**requires** the wrong advice and will redden — that is the test doing its job". **It could never have seen the change**: the verdict line prints `(sepFar 110 − sepNear 92)`, so the regex matches the *quantities*, not the advice. Half the sensor I promised three briefs was inert | the implementer measured the regex against the real string |
| 25 | **Corrected the findings document's §2 and not its §5** — leaving the identical reversed mechanism standing in **the bullet design §10.3 and criterion 5 actually cite.** A partial fix that reads as a complete one, which is the §9 row on partial checks, committed inside the correction for it. Also asserted "deflate buys ~0% on already-compressed image data": true of photos, **false of the baked masks, which deflate 18–65% and are the primary import path** | the implementer read §5 rather than trusting that §2's fix was the whole of it |
| 24 | **Merged P3a on a green *local* gate and never looked at CI**, then pushed eight docs commits onto a red `main` over nine hours without once checking. §6's own practice says "spot-check before merging… plus an independent gate run", and I read "independent" as *a second run by me* rather than *a different machine*. The owner found it, not the orchestrator — the same way §1.2a's missing tier-0 ledger was found | the owner asked what was wrong with the deploy pipeline |
| 20 | **Applied four ruling edits with string replacements carrying no assertion; two silently no-opped — then asserted all four were landed in a commit message.** §1.2o committed by the tier that wrote it: an edit instrument used without a control, and the false claim put into the durable record | the PM read the file rather than the commit |
| 19 | Ran P3a's verification gate **against the wrong worktree** and got the baseline back — `git log <branch>` names a ref, `npm test` runs whatever is checked out. It returned 60/1358, a *plausible* number already in the record | caught on re-reading my own output before reporting it |
| 18 | Relayed a citation defect as `file:line → newline`, collapsing the **location of the citation** with the **target it points at** — the worker nearly declined both items as fabrications, since nothing cites the location and a 226-line file cannot contain the cited range. Also relayed "four-word orphan" for a one-word one | the repair worker swept every citation into its own edited files |
| 17 | **On the third pass at the same table, dropped a clause from criterion 13** — its registration test, which R-ac makes part of it by explicit ruling, leaving a landed commit unbudgeted by any criterion. Also promoted a PM's labelled *inference* to established fact, inside the document that carries the rule against doing so | the PM re-audited all nine rows again |
| 16 | **Reconstructed those nine criteria wrongly: five rows defective, and criterion 15 deleted** by putting criterion 14's content in its row. Nine rows, no gap, internally consistent — quote-diff clean, row count nine, both checks pass. A cure for an absence that produced a better-hidden absence | the PM checked all nine against its ledger after two of the three I asked about came back wrong |
| 15 | **Adopted criteria 12–20 and ruling E14 in a message and never wrote them into any document.** Three of them are what cluster D is aimed at; one had already cost two tasks; two briefs quoted E14 as "verbatim". Invisible to the quote-diff rule, because a diff is blind to what was never written | the PM asked what its criteria said and found they said nothing |
| 14 | Amended criterion 3 in the execution plan and **not in the design document**, leaving two tier-0 documents in conflict for a whole sub-cluster — in a phase whose idiom parses the design document | the PM read both and reported it rather than editing |
| 13 | Wrote criterion 3 as "a dummy appears **without touching another file**" — measured false for a real registration on three registries. A PM correctly refused to reinterpret it in a ledger | C-13, C-14, C-15 measured it; the PM escalated rather than deciding |

**Across three correction passes on one table the defect was *always* a dropped clause or
label and *never* a wrong fact** — so for tier-0 documents the audit must be a
completeness check against a deeper source, not a consistency check between peers.

**The pattern is uniform and matches what every PM reported about itself: each was a claim
a single command would have settled, skipped because it felt too small.** §1.2e is as
binding on tier 0 as on tier 1.

---

## 5d. Criterion 5's tight branch — ruled 2026-10-16

**Criterion 5 names two branches; only one is witnessed.** V-5 planted the forbidden string
into the **`tight`** branch and got **ten files green with all 128 `[measured]` values
byte-identical** — blind by pass/fail and by value. Both anti-advice assertions run on the
*illegible* fixture only.

**RULED: the sensor goes in `src/shared/perception.test.ts`, NOT `site/legibility.test.ts`** —
and the reason is **durability**, not only the ownership contention both PMs raised:

1. **`site/` is under teardown and P3b owns it.** A new criterion sensor placed in a file
   that teardown may rewrite or delete is **placed where it can be lost.** Neither option as
   offered accounts for that, and it is the decisive point.
2. **The criterion is about the perception module's verdict strings — the model layer.**
   `site/legibility.ts` is now a bare `export *` shim; **asserting on the model asserts on
   the real subject** rather than on a re-export.
3. It touches no contested file, so no ownership ruling is needed at all.

**Sequencing approved, and it is NOT the V-2 inversion.** V-5 has **already established the
RED itself** — plant documented, full green across ten files recorded, 128 values unmoved —
**as a verifier that implemented none of it.** An implementer now only has to build a sensor
that catches **V-5's already-documented plant**, which is verification-then-implementation
in the right order. **It must reproduce V-5's plant first, confirm green (the bug), add the
assertion, confirm red, revert, rebuild, confirm green** — the rebuild because
`site/dist.test.ts`'s freshness guard is mtime-based and stays red after a bare revert.

**Option (c), merging with it as a recorded gap, is refused.** The criterion names both
branches explicitly, and *"a phase passes its own gate with a design item simply missing"*
has now happened **four times** on this phase.

**Carried, not blocking: criterion 7 is discharged by there being only one writer**, not by
a two-sided comparison — **none exists or could today.** That is a statement about the
future rather than a defect now, **but the criterion's wording invites a reader to believe a
comparison exists**, and if P5 adds a site-side writer that does not call `writeStst`,
nothing in the repo would notice. **Reword it rather than leave it.**

## 5c. `166b6da`'s removal — ratification wording, 2026-10-16

**Ratified, but NOT in the words I was about to use.** I escalated this as *"replace-in-place,
not a coverage loss"*; V-D0b measured that wrong. **Use this wording verbatim, which is
V-D0b's:**

> **replace-in-place with two declared real-reference coverage losses (computed specifier;
> non-script emitted file), both inside the file's stated boundary, traded for one
> real-reference gain (externalised builtin)**

**Measured, needle grep-confirmed in the artifact before each verdict:** a non-foldable
`await import(location.hash.slice(1) || '@napi-rs/canvas')` — **old exit 1, new 37 passed
exit 0, silent**, over a bundle literally containing the call. And a real import inside
`dist-site/index.html` — **old exit 1 naming the offender, new silent**, because the file is
not a script chunk and is never visited. **Against one genuine gain**, the externalised
builtin, old 34-passed-exit-0 → new exit 1.

**`166b6da` stands — repair, not revert.** It closes a real hole and **declares both losses
accurately under its own BOUNDARY heading.** Its *summary* sentence does not, and a
ratification quotes the summary — see §9's new row.

**Two follow-ups fold into S-2, not a separate task**, since both are *the fix was
enumeration-complete, not class-complete*:
- **Restore coverage for the computed-specifier and non-script-file classes**, and **pin the
  emitted extension set** — *"both builds emit only css html js woff2"* exists **only in
  prose**, which is the unpinned premise underneath the second loss.
- **The `__vite-browser-external` gap must get a real sensor, and the fix is this table's own
  pattern: make the note be the test.** Assert the stub name is present in the build output,
  so a vite upgrade that renames it **reddens loudly** instead of going silent. Two lines.
  **I am not accepting an unsensored gap here** — the standing ruling is that a gap ships
  with a sensor, never a note, and this one currently ships with a note that calls itself a
  sensor.

**Settled and closed: `dist-player` is wholly pre-existing and NOT created by `166b6da`.**
The deleted test ran over `dist-site` only and the player block is **byte-identical before
and after** (md5 `b04bfab3…`). The ownership question is answered; the player gap stays
queued as pre-existing P3b work.

## 5b. Live cross-phase handoff — the builtin-spelling matrix, split 2026-10-16

**A §9 row of mine is unverified and load-bearing:** *"`build:site` catches one spelling of
four"* has **never been reproduced**. Its only provenance is a relayed verifier result in
`7fda4b0` — and **`02e8e27` has already overturned the other half of that same commit's
bundle claim** (the needle *"ships and is findable"* → measured **absent from every byte**).
**One half of a two-claim paragraph is confirmed false and the other has never been
checked.** The four spellings are never enumerated and the caught one is never named.

**A single 16-cell matrix settles it:** plant each of `import 'node:fs'`,
`import * as fs from 'node:fs'`, `await import('node:fs')`, `require('node:fs')` in **(a)** a
reachable `site/*.ts` path and **(b)** `src/shared/*.ts`, build **with and without**
`build.rollupOptions.onwarn`, record the exit code per cell.

**RULED: split by ownership.**
- **The `site/*.ts` half is P3b's** and needs no authorisation. It closes P3b's own queue
  item — the player bundle has **no `@napi-rs`/`node:` specifier check at all**, which is
  pre-existing and ~5 lines to add once the matrix says which spellings matter.
- **The `src/shared/*.ts` half is P1/P7's, AFTER its gate.** It is the *complement* claim —
  *"inside `src/shared/` the purity guard catches all three import forms"* — a different
  instrument, separably measurable. **Not now:** V-5 is live in `src/shared/container.ts`,
  and two agents planting in one directory is exactly how a plant survived a crash into a
  tree that looked finished.

**Until both halves land, treat the "one spelling of four" row as unverified** and do not
build a task on it — which is the trap the row itself now warns about.

## 5a. Live handoffs to unstarted phases

- **P4 — a one-token defect in merged code.** `site/playerplan.ts:504` keys on the *mode
  name*, not the plan kind, so a re-render-kind mode skips `scaleScene` **with the suite
  green**. Latent today because `render` is the only such mode; it bites the moment a
  second one is added. Confirmed by measurement, not inferred.
- **P4 — `site/depthmap.ts`'s recorded rationale** still argues against a default colour
  ramp; P4 owns amending it in place (plan §7 P4.12).
- **P4 — `UNIVERSAL_PARAMS` ships with no consumer.** D-3's four descriptors are correct,
  tested and **unreachable from `CONTROLS`**. The honest wiring needs a new `MODEL_ROSTERS`
  field with two upstreams plus a `ControlRosters` widening, deliberately reddening five
  tests — a cross-file population change the PM routed out of cluster D rather than repeat
  a scope error it had already refused. **It said plainly it would not pretend that makes
  it fine, and it must appear in the gate report.**
- **P4/P5 — layer retype silently drops data.** `gif`→`image` **loads and drops `loop`**,
  measured. The recorded hazard's mechanism was also wrong: 10 of 12 retypes are refused
  by *the missing required key of the target*, not by leftover keys.
- **No compile-time sensor exists for `MODEL_ROSTERS` provenance.** Re-pointing it at
  hand-written copies left the **entire suite and the entire type gate green**, and
  `ControlRosters` is loosely typed on purpose, so a worker correctly declined to
  manufacture one.
- **P3a-merged files, not P1/P7's to touch:** `18` is inlined in shipped prose at
  `site/controlspec.ts:522,539` and `site/index.html:223,224,299` — the **only perceptual
  threshold that reached production**, and the only one that will rot.
- **Unmeasured, and the design may be overstating it:** `depthBlur ≥ 1` is the smallest
  radius anyone tried, not a measured boundary — (0, 1) is unmeasured and currently
  reported as cardboarded. And **whether a blurred edge cures cardboarding at all is the
  design's claim, not a measurement**: a Gaussian leaves a slab's interior exactly flat
  and slopes only a ~3·radius band at the silhouette. Design §10.5's cure paragraph needs
  a calibration round before that boolean is surfaced anywhere louder than a diagnostics
  line.
- **`rotateX`/`rotateY` have no sensor and none could be built.** `types.ts:212` records
  that they do not read as depth *yet* and names the rasteriser change that would make
  them a third relief mechanism; when it lands, nothing in `cardboarding` reddens by
  itself. The implementer tried, failed, and said so — the standing "a criterion may ship
  unmet only with a sensor" meeting a case where no sensor exists.
- **Toolchain, owned by neither phase:** `build.rollupOptions.onwarn` would flip
  `build:site`'s builtin fail-open to exit 1, verified at the pinned Vite 5.4.21. Two
  configs, both at the repo root. **It does not complement the purity guard** — both were
  measured blind simultaneously over exactly the P1 files.
- **Open from E14's sweep:** three more P2 rosters share the `SMOOTH_MODES` defect —
  `DepthView`, `Legibility`, `FitLimit`, the last in live non-orphaned code.
- **P3b — criterion 14 / `EDITOR_ONLY_MODULES`: WITHDRAWN as measurably false**, 2026-10-15.
  This said three cluster-C modules were absent from a hand-written `toHaveLength(7)` list
  and none reddened it; §7 then relayed it as eight. Both are wrong. The list is **7 of 7
  correct today**; the "eight" are P3a registry modules in **neither** bundle, and planting
  them **reddens** the suite. A real leak plant made the check **fail by name**. The live
  hazards that survive are the hand-written list's capacity to rot, and extending the
  needles to the shell's own modules after teardown. See orchestrator error 21.
- **P3b owns `src/node/canvas.vendored.test.ts`.** It reads `site/index.html`, will throw
  ENOENT on teardown, and is named by no phase. P3b may touch that file and **no other** in
  `src/node/`; `canvas.generics.test.ts` is P1/P7's and both PMs have been told so.
- **A freshness flake is open and unreproduced.** One `vitest list --json` run read a
  freshly-built tree as stale and **withdrew 20 Pages-critical assertions**; three further
  attempts could not reproduce it. Not dismissed — if a gate ever reports a count low by
  roughly twenty, suspect this before suspecting the branch.
- **Fleet load produces false reds, and the amplifier is not what it looks like — FIXED,
  `9312529`.** Six `sweep()`-driven tests in `src/node/metamorphic.real.test.ts` ran on
  vitest's 5s default; under two live PMs a plain full run went red on two of them (5226 ms,
  5191 ms) and the *immediately following identical run* was green. Solo the same tests are
  338–932 ms. Raised to 20s, with the precedent test in `src/node/encode.test.ts` raised
  20s → 60s after it was measured timing out at 20064 ms and finishing in 11562 ms minutes
  later on the same box.

  **The counter-intuitive measurement, and it validates the gate-serialisation ruling:**
  a deliberate 14-process CPU burst pushed the heaviest test only to 4079 ms and never broke
  5s. **Load average is not the amplifier — vitest's own worker fan-out inside a full run
  is.** A single file run alone on a loaded box is far safer than the same file inside
  `npm test`. So workers running single files are fine; it is concurrent *full suites* that
  must not overlap.

  **The 4079 ms figure is EXPIRED and must not be used for sizing — 2026-10-16.** It
  describes a test that has since been superseded. GATE-P3b-1 observed the heaviest
  individual test at **15,515 ms**, and the four `svelte-check` harnesses at **133.7s of
  201.2s summed test time (66%)**, which is consistent with the ">60%" above but is a
  different world from a 4-second test against a 5-second timeout. **Anyone sizing a fifth
  harness against 4079 ms is sizing against a number with no referent.**

  **The raise costs real regression sensitivity and both comments say so:** a 5× encoder
  slowdown would no longer redden these six, and nothing else in the suite watches their
  runtime. Getting that back needs a separate perf assertion — a timeout cannot be both a
  deadline and a performance guard on a shared box.
- **Operational:** the suite is ~43s and three harnesses spawning `svelte-check` are >60%
  of it. A fourth must be re-measured before it lands — four concurrent processes have
  already timed out a merged-phase test.

## 6. Practice beyond §1.3

- **Spot-check before merging and before standing a PM down.** `git log` against claimed
  shas, plus an independent gate run. Every merge so far reproduced exactly; the value is
  that it would not have, silently, if something were wrong.
- **A smooth PM report is not reassuring — it is unexamined.** PM-SHELL-P3b-4's
  consequence of the restatement habit, and it inverts how a report should be read: *"the
  common case is safe, so a smooth report is precisely what a PM coasting on restatements
  produces. All five defects in my own briefs this shift surfaced because a worker went to
  the source, not because anything looked wrong. **Nothing looked wrong.**"* So **the signal
  to want from a PM is not an absence of corrections but a steady supply of them**, and a
  shift that produces none deserves more scrutiny than one that produces several. Every
  error on this project — thirty-one at tier 0, nineteen-plus at tier 1 — was caught from
  below, and **not one was caught by something looking wrong from above.**
- **An absence claim from a zero-result instrument is the most seductive failure there
  is.** The orchestrator grepped five phrases out of a verified commit body, got zero hits
  on two, and was a step from reporting a complete record as missing content — **minutes
  after committing the row that an absence claim is exactly as unverified as a presence
  claim, and more seductive because it asks you to add rather than to skip.** The row was
  minutes old and it fired on its author. **A zero-hit search is a claim about your
  instrument before it is a claim about the artefact.**
- **A local gate is not the gate. Check CI after every merge to `main`, before doing
  anything else.** `gh run list --limit 3` is one command. Error 24: P3a merged on a green
  local run and left `main` red for nine hours and eight commits, with the deploy stopped
  the whole time. **"Independent gate run" means a different machine, not a second run by
  me** — a local re-run shares every environmental assumption with the run it is checking,
  which is the definition of an instrument that cannot see. This repo's whole history of
  machine-dependent defects says the runner is the instrument that matters.
- **Primary sources beat relayed ones.** The agent mesh is broken — workers cannot reach
  their PMs — so worker reports route to the orchestrator directly. That accident has been
  load-bearing: most significant findings arrived as primary evidence rather than PM
  summary.
- **Name the agent and the finding id when relaying a verification.** See error 6.
- **Do not rule on an item you cannot name.** Two PMs have asked for approval of
  criteria identified only by a local label; the correct response is to ask what it is.
- **Record decisions in commit messages.** They are the durable record; the scratchpad is
  not, and a committed source file must never cite it.
- **Brief with a sha, and attach the sha's resolution procedure.** Error 12: a PM was told
  to read plan sections its branch did not contain. **Refined 2026-10-16, because the sha
  alone proved insufficient twice in one hour** — `main` moves every few minutes while
  agents are being written briefs, so both the gate runner and an audit worker read shas
  that had already moved. The one that carried *"verify it rather than trusting me; if the
  count is nonzero, merge"* resolved and continued; the one carrying a bare assertion could
  only flag it and stop. **A sha is a claim; the procedure is what makes it checkable.**
  The receiving agent's own `git log --oneline -1 main` has now caught this **seven times
  out of seven**.
- **Dispatching a worker to answer one question is normal and cheap.** Say so explicitly
  in PM briefs — three of five shifts crossed the source prohibition, and the cause is a
  PM between tasks with nobody to ask (plan §1.2l).
- **Keep the live `STATUS.md` board** in the scratchpad for the owner — open questions at
  the top. It is his catch-up surface and he reads the last message of a turn, so blocking
  questions go there *and* at the end of the turn.
