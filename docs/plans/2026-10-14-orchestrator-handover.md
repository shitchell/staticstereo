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
| **P3b** store, undo, scene time, teardown | **in progress, PM-SHELL-P3b live** | branch `feat/p3b-store` cut from `main` at `c4f4b7f`; baseline re-measured 80/1881/0 skipped, four exit codes 0 |
| **P1** `.stst` · **P7** perception | **in progress, PM-SHARED-3 live** | 14 commits on `feat/p1p7-shared`, **3 behind `main` (docs only)**; **92 files / 2037 passed**, four exit codes 0 — *as reported by the outgoing PM and not re-verified by anyone*. Every function P7 criterion 1 names exists. **No verifier, reviewer or gate runner has ever run** — §6 needs all of them, and that is the bulk of the remaining work |
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
  Scope is now **ten**, after criterion 21 (store as single source of truth) and criterion
  22 (every control *writable*, not merely reachable — ESC-7). Unblocked and ready: B-1,
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
