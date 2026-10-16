---
title: P1/P7 gate report
description: The gate runs for the .stst and perception phases — four exit codes, counts, census, CI, and the open items the merge inherited
status: MERGED at `da0e4a9` on the re-gate at `e72e7ce`. The body below describes the FIRST gate at `5801cfe`; the appendix supersedes its numbers. Items under "carried open past the merge" were NOT closed by it.
date: 2026-10-16
tags: [gate, staticstereo, p1, p7]
---

# P1/P7 gate report

**Why this document exists.** The gate runner's report is the artefact the orchestrator
merges on, and it existed only in a chat message. This phase has already paid for that
once: seven reviewer findings reached the orchestrator **twice** and were written into no
document, which is recorded as orchestrator error 33 and is error 15's exact shape. A
report that is read and not committed has not been recorded.

---

## The run

| | |
|---|---|
| gated sha | **`5801cfe`** |
| pre-merge sha | `80e43af` |
| `main` merged | `6f288f9` |
| census merge-base | `69abca9`, taken **before** the merge |
| worktree | `…/staticstereo-p1p7`, `feat/p1p7-shared` |

**Step 0 clean.** `git status --porcelain` and `git diff --stat HEAD` both empty; no stray
`true`; no `src/` tsc emissions; stash empty. **All three dist directories were present
and wiped** — 844K + 188K + 148K. The two-directory habit would have left `dist-player/`,
which four test files read.

**Merge CLEAN.** `ort` strategy, one auto-merged file (`src/node/metamorphic.real.test.ts`),
pre-checked with `git merge-tree --write-tree`.

### Exit codes — each from its own `echo $?`, each redirected, never piped

| step | exit | evidence |
|---|---|---|
| `npm run typecheck` | **0** | `COMPLETED 476 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS` |
| `npm run build` | **0** | |
| `npm run build:site` | **0** | 6 files to `dist-site/`, 6 to `dist-player/` |
| `npm test` | **0** | stamped run, below |

**`typecheck` is the ONLY evidence about `site/` types.** This branch touches
`site/legibility.ts`, `site/legibility.test.ts` and `site/project.test.ts`. A planted type
error in a `site/` file leaves **both** builds at exit 0. So "build 0, build:site 0" is
**one null reported twice** and is not counted as corroboration.

### Counts

Stamp and summary line came out of the same invocation, so no later edit can make them
disagree:

```
5801cfe
feat/p1p7-shared
/home/guy/code/git/github.com/shitchell/staticstereo-p1p7
...
 Test Files  96 passed (96)
      Tests  2129 passed (2129)
   Duration  55.86s
```

**Skipped = 0**, read from the summary line and never from a glyph — `grep -c '↓'` returns
0 on a genuine 22-skipped run. The parenthetical equalling the passed count is the positive
proof.

Baseline `96 / 2110 / 0` at `b3e7601` → 2128 at `6531698` → **the merge adds the one new
`it(…)` in `src/core/anim/presets.golden.test.ts`** → 2129. Files stayed 96, as derived.

### The count matched the prediction exactly, which is the alarm

`2128 + 1 = 2129` was predicted before the run. A match is the hardest case to clear, not
agreement — a wrong answer matching something already written down is the hardest kind to
catch. **Three disconfirmations, none of which is the arithmetic:**

1. **sha, branch and `pwd` stamped by the same shell** that produced the counts.
2. **CI, a different machine, the same sha, the same figures** — 96 / 2129.
3. **A separate instrument reconciles.** `vitest list` on the merged tree *unbuilt*
   collects **2103** names; the build-state delta measured independently at the pre-merge
   tip is **26** names gated on `dist*` presence. 2103 + 26 = 2129.

---

## Census — three names disappeared, and only a merge-base census can see them

**Instrument:** `vitest list`, **plain text, `--json` never invoked**. Every census file
guarded with `test -s` before use. Diffed with `LC_ALL=C sort` + `LC_ALL=C comm`.

**Fidelity control, run before any number was trusted.** Scratch worktree, detached,
`node_modules` **copied** (not symlinked, not `cp -al`). No dependency drift between
merge-base, tip and `main`. Census at the **primary tip in scratch** vs census at the
**primary tip in the primary worktree**: **`diff` exit 0, byte-identical, 2102 names.** The
scratch harness is faithful. *Measure the instrument against a known-common point before
believing what it says about the unknown one.*

> **⚠ An instrument hazard in neither brief: `vitest list` output depends on BUILD STATE.**
> The first comparison disagreed by **26** names — `site/dist.test.ts`'s built-site and
> built-player suites, both purity suites' `dist/` suites, and
> `src/node/canvas.vendored.test.ts`'s `it.skipIf(!existsSync('dist/node/canvas.js'))`.
> **A census taken before a build and compared against one taken after reports 26 phantom
> additions.** Both censuses here were unbuilt.

**§6.5a paired control.** In the scratch tree at the merge-base, **both** halves planted:
one row deleted from an `it.each([...])` table, and one plain `it()` renamed. The census
reported **exactly** the two removals and the one addition. The total moved 1857 → 1856 —
**net −1 for two removals**, so a count-only check would have hidden the rename. Both
plants reverted.

**Result**, merge-base `69abca9` (1857) → tip `5801cfe` (2103), both unbuilt: **3 removed,
249 added.** All three in `site/legibility.test.ts`, **all three from `b3e7601`**:

| removed name | disposition |
|---|---|
| `disparityBudget > shrinks as sepNear rises — the trade the warning has to offer` | **retitle** → `shrinks as sepNear rises` |
| `legibilityOf > needs TIGHT_MULTIPLE budgets to grade clear` | **retitle** → `…to grade clear, and says where that is` |
| `describeLegibility > offers widening sepNear as well as enlarging the text` | **deleted**, replaced by two new cases, authorised by criterion 5 |

**The §6.4 correction is vindicated empirically: `b3e7601` predates the branch's own last
gate, so a baseline anchored there could not have seen any of these.** Four independent
instruments now agree on the triage.

---

## `yuv444p` — CLOSED, and the answer is that the probe is BLIND

The review's top-ranked NOT-COVERED item, and the one inference the reviewer could not
execute because confirming it needs a build.

On a freshly built tree the needle is **absent** from both `dist-site/` and `dist-player/`,
so today's green is honest. The real question was whether the probe *could* see a leak:

| arm | plant into `site/main.ts` | `build:site` | leak ships? | `yuv444p` found? |
|---|---|---|---|---|
| control | none | 0 | — | absent (`UsageError` also absent) |
| A | `import { writePng } from '../src/node/encode.js'` | **1** | no bundle emitted | n/a |
| **B** | `import { outputFormat } from '../src/cli/args.js'` | **0** | **YES** | **ABSENT** |
| C | `import { HELP } from '../src/cli/args.js'` | 0 | yes | present |

**Arm B is the finding. A genuine `src/cli` leak reaches `dist-site/assets/index-*.js` with
`build:site` at exit 0, and `site/dist.test.ts` stays green over it.** That the leak landed
is a **positive control, not an assumption**: `UsageError` is in the arm-B bundle and absent
from the clean one.

**Arm C proves the machinery works, so the limit is *reach*, not mechanism.** `yuv444p`
lives only in `HELP` (`src/cli/args.ts:167`) and `LOSSLESS_MP4` (`src/node/encode.ts:128`),
both **module-level constants**, and rollup shakes an unreferenced constant away.
**`site/dist.test.ts:1286`'s own docblock already says this** — *"the same limitation
applies to the `yuv444p` probe above"* — **and nobody had run it.**

> **Arm A's sting, and it is the part to carry.** A `src/node` leak **kills the build**, so
> `dist-site/` is never emitted, `fresh` is false, and those assertions **SKIP rather than
> FAIL. A leak severe enough to break the build makes its own detector go quiet.**

Not fixed, test untouched. This is a second independent demonstration of the known hole
that **`build:site` catches one import spelling of four and nothing guards `site/*.ts`**.

---

## CI

**Run `38880192733`** · workflow `ci` · event `pull_request` · **SUCCESS** · 1m43s ·
PR **#4** · <https://github.com/shitchell/staticstereo/actions/runs/38880192733>

**Head sha `5801cfee79d0b23119994ccfdad6a4130f994521` — equal to the gated sha, verified via
`gh run list --json headSha`, not assumed.** *"Verified and gated describing different trees
while both reports read clean"* is a recorded failure on this project.

A **push alone produced nothing** — `ci` is `on: push: branches: [main]` plus
`pull_request`, so a branch push matches neither trigger. The PR produced the run.
`pages` did not run on this branch.

CI's own figures: `96 passed (96)`, `2129 passed (2129)`, and
`svelte-check found 0 errors and 0 warnings` — **note the human-verbose wording against the
agent's machine format, so the `CLAUDECODE` divergence is still live and requirement 7 is
still doing real work.**

---

## `ready-to-merge`

| # | requirement | status |
|---|---|---|
| 1 | criteria met, evidenced by verifiers who implemented none of it | **MET** — V-5, see caveat |
| 2 | all four exit codes 0 | **MET** |
| 3 | counts against the branch's own recorded baseline | **MET** |
| 4 | net removals itemised, with instrument and control | **MET** — 3 named, all triaged |
| 5 | reviewer, two rounds, no unresolved findings | **PENDING the criterion 5 sensor** |
| 6 | deviations reverted or recorded | **MET** — `a8f9edd` |
| 7 | a green `ci` run on the branch via PR | **MET** — `38880192733` |

**Requirement 1's caveat, stated rather than smoothed.** V-5 verified all eight criteria at
pin **`26d1f2d`**; the gate ran at `5801cfe`, **two commits later** (`9312529`, `2524fa4`,
both test-harness fixes, neither in V-5's scope). The four earlier clusters verified
`b3e7601`, **seventeen commits** before the gated tree, which is why V-5 existed.

> **The structural lesson, which is not a defect: a verification tier pinned to a sha is
> always closing a gap that is already reopening.** A pin is *necessary* — a verifier must
> know what it measured — and it *guarantees* the result describes a past tree. The
> consequence: **the gate, not the verifier, speaks for the tip**, and a verifier's scope
> must be stated as *"at sha X"*, never *"on this branch."*

**Requirement 5's single open item.** P7 criterion 5 says *"remove the `sepNear` trade from
**both** the `illegible` and the `tight` branch."* The code does both; **only the
`illegible` half is witnessed.** V-5 planted the forbidden advice into the `tight` branch
and ten test files stayed green with **all 128 unasserted `[measured]` values
byte-identical** — blind by pass/fail *and* by value. Both existing anti-advice assertions
run on the illegible fixture only.

> **The row this earns: "the criterion has an assertion, so it has a sensor" is FALSE.**
> The assertion can be real and **aimed at the wrong fixture.** This is the mirror of the
> `site/project.test.ts` failure — *there, prose was mistaken for an assertion; here, a real
> assertion is aimed at the wrong input.* **Check which fixture each clause is witnessed on,
> not whether an assertion exists.**

---

## Open — carried, not resolved

**Three with wording that must not be compressed.**

- **The CLI/site value axis is UNSCOPED, with a floor of five.** Five container-reachable
  disagreements are pinned, and **five is what one probe covered, not a census.** The pins
  are **hand-listed with no enumeration mechanism**, so the suite **goes short *green* when
  a sixth appears** — the failure is silent and in the safe-looking direction. *"Five known
  disagreements"* loses the entire finding, which is about the absence of a mechanism.
- **Criterion 24 — CLOSED-WITH-RECORD.** Not an open finding; do not re-raise.
- **Criterion 25 — OPEN and OWNED ELSEWHERE (P3b, which owns `site/`).** R22 obligation 1
  has no criterion and no sensor. Measured citations: ob.2 nine, ob.4 three, ob.3 one,
  **ob.1 zero.** Nothing guards `site/*.ts` imports while this phase made
  `site/legibility.ts` a bare `export *`. *Reported as routed, because a reassignment that
  appears in no report is indistinguishable from a drop.*

**With Shaun.**

- **Case E — an all-flat-graphics `.stst` is +27.4% stored.** A **pre-registered threshold
  that was crossed**, sitting underneath a criterion marked MET. **The container format is
  frozen; do not recommend changing it.** It must keep appearing: a crossed threshold that
  stops being mentioned has been silently accepted, and nobody has to decide anything for
  that to happen.
- **The raw-bytes baked-mask hazard: +782 KB, +14,092%. P5 must be told before it bakes
  anything.**

**Criterion 7 — reworded rather than left, because the wording misleads.** It names two
producers and **one exists.** There is no site-side `.stst` writer; the write UI is P5's.
"Identical bytes" is discharged **by there being only one writer**, not by a two-sided
comparison — **none exists or could today.** Not a defect now, but **if P5 adds a
site-side writer that bypasses `writeStst`, nothing in the repository would notice.**
Criterion 10's *"browser-reachable"* half is likewise met by construction, not by a shipped
bundle.

**Others.**

- `18` inlined in prose at `site/controlspec.ts:522,539` and `site/index.html:223,224,299`
  — P3a-merged, excluded from P7 criterion 6 by ruling.
- `src/node/canvas.vendored.test.ts:113` — the third `runLengths(…, 0.5)` site. **P3b's.**
- `src/shared/zipRead.ts:268` — *"No producer we target reaches this branch"* (CP437),
  unverified, plus **six** further refusal paths reached by no test. Whether defensive dead
  branches need sensors is **unruled**.
- **`main`'s own harness fix still spreads `...process.env`** — a deny-list of one variable
  — plus six unaudited spawn sites in `src/node/` and `src/cli/`.
- **Six of eight perception functions have no production caller** — only `measureInk` and
  `describeLegibility`. A seam error (wrong unit, wrong argument order) stays undetectable
  until **P4** wires them.
- `depthBlur ≥ 1` is the **smallest radius tried, not a measured boundary**; whether a
  blurred edge cures cardboarding at all is the **design's claim, not a measurement**.
- **`"will not fuse however long you stare"`** is refuted verbatim by findings §1 and
  survives in **six** places. A *threshold* claim needing its own measuring round.
- Documentation gaps under the §10.6 amendment, **not deviations**: `restingDepth`'s
  docblock silent on units; `measureInk`'s `peak`/`threshold` normalised on both sides.
- **Observations, not defects:** P7-6's clause was retired **by V-4 itself**, and P7-8's
  verifier both found the error in its own criterion and passed it. A control with a degree
  of freedom is worth naming once.

### Findings-document disposition — every item

Against `docs/plans/2026-10-16-p1p7-review-findings.md`. **Verified in the file** where
marked; matched **by commit subject only** where marked.

| item | disposition |
|---|---|
| **F1** `${separation} px` names no pixel space | **FIXED, verified in file** — `2ab76ab`. The document still calls F1's fix *"unrun"*; **it is run and green.** |
| **F2** arity guard blind to an optional parameter | **CLOSED** — `819101d`, re-verified by V-5 with an independent plant |
| **F3, F4** pointer rot | fix commits present (`769cdb6`, `b6cf101`); **targets not re-walked** |
| **F5** | fixed `8d02868` · **F9** `f352b99`, not re-checked against the finding |
| **F6** *"verdict plus three quantities"* | **FIXED, verified in file** — now reads *"a verdict plus **two** quantities"* |
| **F7** `toBeGreaterThan(20)` underived | **MATERIALLY CHANGED, arguably still open.** The derivation is now written above it — shortest reason 27 chars, longest 310, median ~70, *"clears the nearest row by 7 characters — a 1.35× margin, and thin"*. **The magic number remains; its lack of rationale does not.** The finding was "no recorded derivation", so it is discharged — but the literal is still a literal. |
| **F8** zip signature constants | fixed `768c163`; **not re-verified** |
| round 2 — wrong sha at `purity.test.ts:60` | fixed `ae5a713` |
| round 2 — `container.test.ts:462`'s `400_000` floor | documented `615473a` |
| round 2 — `perception.stops.test.ts` "8 of 20" | **not a defect, a skim trap.** Correctly left alone |
| NOT-COVERED **1** `yuv444p` | **CLOSED BY THE GATE, as a negative finding** — see above |
| NOT-COVERED **2** | → criterion 25, open, **P3b's** |
| NOT-COVERED **3** | closed `819101d` |
| NOT-COVERED **4** | → criterion 24, **closed-with-record** |
| NOT-COVERED **5** §10.6 | resolved `a8f9edd`. **The document's round-1 table still says "three symbols deviate" and is refuted** |
| NOT-COVERED **6** | **OPEN AND UNMEASURED.** The writer's `deflate` path — `CompressionStream`, design §6.2's *named* mechanism — **has no production consumer and is test-only.** Nobody has measured this |
| NOT-COVERED **7** | → the unscoped value axis, carried above |

**Still standing: roughly 25 relayed claims that no one has verified.**

### Docs merges are not inert

**"Docs-only, therefore safe" is not a check.** Tests parse `docs/` files at runtime. The
merge changed **15** `docs/` paths; **exactly one** is in the runtime reader set.

**The reader set — three files, one document:**

| reader | call |
|---|---|
| `site/keybindings.test.ts:106` | `chromeSentence(readFileSync(from(DESIGN), 'utf8'))` |
| `site/views.test.ts:222` | `viewsFromDesign(readFileSync(from(DESIGN), 'utf8'))` |
| `site/shadings.test.ts:137` | `shadingsFromDesign(readFileSync(DESIGN, 'utf8'))` |

all reading `docs/plans/2026-10-13-editor-design.md`. **All three green.**

Five other test files reference `docs/` **only in comments** — `bindingregistration`,
`markup`, `dist`, `legibility`, `types.seam` — and the last two have **no `fs` import at
all**. The rule is **a read call whose argument resolves under `docs/`, NOT the string
`docs/` appearing in a file.**

> **⚠ The named set can go stale SILENTLY, which corrects an earlier claim that it would go
> stale loudly.** `site/keybindings.ts:662` holds a roster entry
> `file: 'docs/plans/2026-10-13-editor-design.md'`, consumed via
> `readFileSync(from(roster.file))`. **A reader can therefore be added by a roster edit that
> puts no `docs/` literal into any test file.**

> **⚠ And a literal-grep over a docs diff is a check that cannot see.**
> `site/shadings.test.ts` reads rows from a **content-matched** header until the first
> non-`|` line, so **adding a row to design §5.2's shading table changes what it reads while
> none of the test's anchor literals appear in the diff.** The sound check is **to re-run the
> three readers, not to grep the diff.**

---

## Uncertain — carried verbatim; a gate reporting nothing uncertain has not looked

1. **Requirement 1 rests on a RELAY, and the gate says so itself.** 17 commits sat between
   the previously-verified tree and the gated one; one verifier is recorded as having
   passed criterion 10 over docblock prose; V-2 has no report at all. V-5 closed the gap —
   **but the gate runner never saw V-5's report.** Its brief said report PENDING; a mid-run
   message from the PM superseded that with V-5's return. The runner reported the
   reclassification *and* its inability to corroborate it, which is the correct behaviour:
   **if this merges on requirement 1, it merges on V-5's word and on the PM's relay of it,
   not on the gate's measurement.** What the gate *did* measure itself: the delta is 17
   commits, `26d1f2d` is an ancestor of the gated sha, and the two commits behind V-5's pin
   are the two harness fixes the merge brought, both covered by the green run and by CI.
1b. **V-5's worktree vanished mid-run.** `wt-v5` at `26d1f2d` was in `git worktree list`
   when the gate started and absent when it finished. The gate removed only its own
   `wt-gate`. Consistent with V-5 finishing and cleaning up — **not verified, and another
   cause is not excluded.**
2. **`main` moved after the gate ran.** `origin/main` reached `3e65a9a`, **7 commits** past
   the `6f288f9` merged. Measured, not inferred from "docs-only": they touch only the
   execution plan and the orchestrator handover, **neither in the runtime reader set.** But
   **the PR's merge-base is no longer `main`'s tip, and CI tested `5801cfe`.**
3. **It was not independently verified that the implementer commits after `b3e7601` were
   measured sequentially in-tree** rather than in parallel against a shared base. The single
   post-merge `npm test` on one tree is the authority and says 2129; the intermediate deltas
   are not certified to compose.
4. **Requirement 5 could not be checked by the gate** — it was asserted, with no artefact to
   measure against.
5. **F3, F4, F8 and the units gap were matched by COMMIT SUBJECT, not by reading the fixed
   lines.** F1, F6 and F7 were verified in the file.
6. **`vitest list` is collection-only.** It imports test files and registers
   `describe`/`it` but **never runs a body or a hook. A test whose NAME survives while its
   BODY is gutted is invisible to the census.** The suite run is the only sensor for that,
   and it is a different question from removal. **"Zero removals" must not be read as
   "nothing was hollowed out."**
7. **Arm B proves the `yuv444p` probe is blind to ONE leak shape; it does not enumerate
   which others it would miss.** One import of one export was planted. The general claim —
   *a needle only covers the function or constant holding it* — is the test file's own, not
   something measured exhaustively.
7b. **The `src/node` half of the yuv444p question is OPEN.** The same tree-shaking argument
   applies to `LOSSLESS_MP4` in `src/node/encode.ts`, but **arm A could not reach it —
   the build dies first on `@napi-rs`'s native binary.** No `src/node` leak was constructed
   that both *builds* and *avoids* the native binary, so **whether a buildable `src/node`
   leak exists that the probe would miss is unanswered**, not answered in the negative.
7c. **`npm run build` does not clean `dist/`.** Every number here depends on the step-0
   wipe having been complete. All three directories were verified gone before the merge.
8. **Two gate→PM messages failed to send** (`No agent named … is reachable`). The report was
   treated as the channel of record, which is why it is committed here.

---

# Appendix — gate RE-RUN at `e72e7ce`

**The report above describes the first gate, at `5801cfe`. This appendix supersedes its
numbers.** A re-run was required because `9439c11` added criterion 5's tight-branch sensor
after that gate, moving the count.

| | |
|---|---|
| gated sha | **`e72e7ce`**, `origin/feat/p1p7-shared` matching exactly |
| census merge-base | **`7ce9861`**, taken before the merge, verified independently by the runner |
| typecheck · build · build:site · test | **0 · 0 · 0 · 0** |
| counts | **`Test Files 96 passed (96)` · `Tests 2130 passed (2130)` · 0 skipped** |
| CI | **`38882243266`** · `pull_request` · **SUCCESS** · 1m41s · PR #4 · head sha **byte-equal** to the gated sha |

**`ready-to-merge: YES`**, all seven requirements, with requirement 1 resting on a relay —
see below.

## Criterion 5's sensor: RED re-established by the gate, not by its author

The first gate left requirement 5 pending on this. `9439c11` was verified structurally
(**+31/−0, exactly one new `it`**, asserting `legibilityOf(ink, budget).grade === 'tight'`
**before** reading the string, fixture derived from the file's own
`disparityBudget(DEFAULT_STEREO)` rather than a copied literal) — and then the gate
re-established its RED itself:

| arm | `src/shared/perception.test.ts` | `site/legibility.test.ts` |
|---|---|---|
| control | exit 0, `25 passed (25)` | — |
| forbidden advice planted into the **`tight`** branch only | **exit 1**, `1 failed \| 24 passed (25)` — failing on the new assertion **and nothing else** | **exit 0, `36 passed (36)` — blind** |
| reverted | exit 0, `25 passed (25)` | — |

**The `site/` file is confirmed blind to that branch, exactly as the finding described.**
Caveat recorded by the runner: *a single plant is one input, not a proof the sensor covers
every phrasing of the advice.*

## The matching count, disconfirmed three ways

2130 was predicted before the run and the run returned exactly that. **A match is the
alarm.** None of the three disconfirmations is the arithmetic:

1. **sha, branch and `pwd` stamped by the same shell** that produced the counts.
2. **CI, a different machine, the same sha** — `96 passed (96)`, `2130 passed (2130)`.
3. **A different instrument in the same build state.** `vitest list` on the **built** tree
   collects **exactly 2130 names** — a direct match, not a reconciled sum.

## The build-state census delta — corrected, and the correction lives in §9

**The figure recorded earlier in this document — "26 names are gated on `dist*`
presence" — is wrong in shape, and the corrected row is now in the execution plan's §9
trap table** (landed `7a1a5e9`, the row beginning *"a name census and a suite run answer
the same question"*). **Read it there; it is not restated here, so there is one copy.**

The short of it, for a reader deciding whether to follow the link: the delta is **30 added
and 4 removed**, net +26, and the four exist **only unbuilt** — so **a census crossing
build states trips §6.4's REMOVAL gate, not merely an addition count.** The earlier figure
understated it in the direction that blocks a merge.

## Census — 3 removals, unchanged triage, a fifth independent agreement

Merge-base `7ce9861` (1858 names) → tip `e72e7ce` (2104), **both unbuilt**: 3 removed,
249 added. The same three names as the first gate, with the same triage — two retitles and
one deletion authorised by criterion 5, all three originating at `b3e7601`.

**That is a fifth independent instrument agreeing, and it agreed across a DIFFERENT
merge-base** (`7ce9861` here, `69abca9` for the first gate).

**Both guards printed for all six census files taken**, none skipped:

| census | bytes | `test -s` | exit | names |
|---|---|---|---|---|
| primary tip, unbuilt | 251890 | PASS | 0 | 2104 |
| primary tip, built | 254699 | PASS | 0 | 2130 |
| scratch tip, unbuilt | 251890 | PASS | 0 | 2104 |
| scratch merge-base | 218853 | PASS | 0 | 1858 |
| scratch merge-base, planted | — | PASS | 0 | 1857 |
| scratch merge-base, reverted | — | PASS | 0 | 1858 |

**Fidelity control passed**: scratch tip vs primary tip in the same build state, `diff`
exit 0, **byte-identical at 2104 names**, `comm` empty both directions. `node_modules` by
**`cp -a`**, verified not a symlink and not `cp -al`. Zero dependency drift between
merge-base and tip.

**§6.5a paired control, both halves**: one **row** deleted from an existing `.each` table
(not a whole `it.each(` line) plus one plain `it()` renamed. The census reported exactly
the two removals and the one addition and nothing else. **The total moved 1858 → 1857 —
net −1 for two removals, so a count-only check would have hidden the rename.** Reverted;
post-revert census byte-identical to baseline.

## Docs readers — intersection empty, all three green

**A correction to the PM's figure.** The PM reported that the merge changed **7** `docs/`
paths; the runner measured **3** and is right. The PM's command measured *everything
changed since the merge-base*, which included **four of its own commits**. The merge itself
brought three: the execution plan, the orchestrator handover, and the review-findings
document. **The conclusion was unaffected — none is in the runtime reader set — but the
number was wrong and the label was the error:** "paths the merge will change" was in fact
"paths changed since merge-base".

The runner **re-derived the reader set by predicate** — a read call whose argument resolves
under `docs/` — rather than trusting the handed list, and reached the same three calls plus
the invisible roster path at `site/keybindings.ts:662`. Run singly and read at **file
level**: `keybindings` `1 passed (1)` / 65 · `views` `1 passed (1)` / 94 · `shadings`
`1 passed (1)` / 61.

## A judgement call made against a literal instruction, and recorded as a call

`main` moved by one commit mid-run — `5e52550`, docs-only, the execution plan,
`merge-tree` clean, **not** in the runtime reader set. **The runner did not merge it**, on
the reasoning that merging mints a new sha, which **orphans CI run `38882243266` — the only
green CI at the gated sha, and one of its two independent disconfirmations** — while `main`
moves every few minutes, so chasing it trades a measurement held for one that must be
re-acquired.

**Flagged by the runner as its call, not a measurement**, which is the correct way to
surface it. The PR's merge-base is therefore one commit behind `main`'s tip and CI tested
`e72e7ce`.

## Requirement 1 remains a RELAY, in the runner's own words

V-5 verified all eight criteria and all 17 commits at pin **`26d1f2d`**. The runner measured
the delta itself: **78 commits** from that pin to `e72e7ce`, of which **4 touch `src/` or
`site/`** — `2524fa4` and `9312529` (main-side harness fixes), the merge `5801cfe`, and
`9439c11`.

**`9439c11` postdates every verifier and was written in response to V-5's own finding.** The
runner re-established its RED, which is the best available substitute and is not the same
thing.

> *"If the orchestrator merges on requirement 1, it merges on V-5's word, not on mine."*

## ⚠ CARRIED OPEN PAST THE MERGE — these were NOT closed by it

**The merge settled the gate. It did not settle these.** Recorded in the orchestrator's
words at the point of merge, because each is a thing a later reader would otherwise assume
the merge resolved.

- **Requirement 1 is a RELAY.** **78 commits** from V-5's pin `26d1f2d` to the gated sha,
  **4 touching `src/`/`site/`**, and **`9439c11` postdates every verifier** — its RED
  re-established by the gate runner, **which is the best available substitute and is not
  the same thing.**
- **`vitest list` is collection-only**, so *"zero removals beyond the three"* is **not**
  *"nothing was hollowed out."* (§9 carries the row.)
- **Criterion 5's sensor is proven not-blind, not proven exhaustive** — **one plant is one
  input.**
- **NOT-COVERED 6** — the `deflate`/`CompressionStream` path with **no production
  consumer** — is **open, unmeasured by anyone, and parked against case E, which is
  Shaun's. It resolves whichever way he rules.**

Everything else on the gate report's OPEN list carries forward unchanged and was
**relayed, not re-certified**, by this re-run.

## Uncertain — carried

1. `5e52550` not merged; the PR's merge-base is one docs commit behind `main`.
2. The PM said 7 changed docs paths, the runner measured 3. Same conclusion; the
   discrepancy is explained above but was **unexplained at the time the runner reported it**,
   and it said so rather than reconciling it.
3. **`vitest list` is collection-only.** A test whose **name** survives while its **body**
   is gutted is invisible to the census. **"Zero removals beyond the three" must not be read
   as "nothing was hollowed out."**
4. **One plant is one input.** Criterion 5's sensor is proven not-blind; it is not proven
   to cover every phrasing that would satisfy the two regexes.
5. **Requirement 1 is a relay.** The runner never saw V-5's report.
6. The build-state delta (4 removed / 30 added) was measured at this sha only.
7. It was not independently verified that the implementer commits after `b3e7601` compose
   sequentially. The single post-merge `npm test` on one tree is the authority and says 2130.
8. `yuv444p` was **not** re-run. The needle is confirmed absent from both freshly built
   output directories, but the four-arm blindness experiment stands on the first gate's
   record and was not repeated.
