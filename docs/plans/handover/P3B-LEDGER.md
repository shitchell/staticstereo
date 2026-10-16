# P3b ledger — PM-SHELL-P3b

**NEVER cite this file from a committed artifact.** It is session-scoped, untracked by
design, and will not survive. Durable records go in commit messages or `docs/`.

## Shift 1

Branch `feat/p3b-store`, cut from `main` @ `c4f4b7f`. Verified by command, not inherited:

- `git log --oneline -1 main` → `c4f4b7f` ✓ (brief's claim confirmed)
- HEAD = `c4f4b7f`, working tree clean ✓
- `7cd5599` (P3a merge) is an ancestor of HEAD ✓
- `773cc32` (criterion-14 measurement point) is an ancestor of HEAD ✓
- `bdd4af1` (P1/P7, `feat/p1p7-shared`) is NOT an ancestor ✓ — correctly absent
- Sibling worktrees: `-main` @ c4f4b7f, `-p1p7` @ bdd4af1, `-p2` @ 8a32606. Untouched.

Gate baseline: **not yet re-measured by me.** Orchestrator handed typecheck 0 / build 0 /
build:site 0 / test 0, 80 files / 1881 passed / 0 skipped / 42s. S-1 is re-measuring.

## Criteria status

| # | Criterion | Status | Commit |
|---|---|---|---|
| 7 | Mark-based undo, one entry per interaction | not-started | — |
| 8 | Scene store; hash is a projection of it | not-started | — |
| 9 | Scene time in store, consuming P2's transport | not-started | — |
| 10 | Teardown + per-file disposition table | not-started | — |
| 11 | R2/R8 architecture test | not-started | — |
| 14 | `dist.test.ts` no-editor-code check has teeth | not-started | — |
| 15 | Hash projection coalesces on a microtask | not-started | — |
| 16 | Centre slot admits nothing above canvas in flow | not-started | — |

## Agents

| id | role | state |
|---|---|---|
| S-1 | survey (task 0) | dispatched, **alive and working** (verified by `ps`, 15:38) |

### My own instrument error, recorded per §1.2o

I armed a monitor that inferred "survey finished" from the **mtime of S-1's task output
file**. It fired at 122s idle. **S-1 was not finished** — it was mid-run, with 12 processes
cwd'd into the worktree and fresh `vitest`/`svelte-check` pids at 1s old. The file is a
156-byte stub, not a growing transcript, so its mtime never tracked the worker at all.
A check that cannot see reported "fine", in my own tooling, within the first hour.
Caught by `ps` (§1.2q), which is the PM-legal probe and which I only ran because §1.2b says
a notification is not a termination. Re-armed against process activity in the worktree.

### Concurrency hazard, live right now

P1/P7's survey worker is running in `staticstereo-p1p7` **concurrently with mine**: 16
processes cwd'd there, a sustained train of `svelte-check` spawns. Handover §5a records
that three `svelte-check` harnesses are >60% of the ~43s suite and that **four concurrent
such processes have already timed out a merged-phase test.** Two surveys are now running
builds and suites against two worktrees at once. Consequence: **any baseline timing S-1
reports is contaminated and must be re-measured quiet before it is used as the branch
baseline.** Exit codes and counts are still usable; wall times are not.

## Open escalations

None yet. Two items queued for the task-list report to the orchestrator (not yet
escalations, flagged as findings):

1. **Handover §5a is stale against plan §7.** Handover line 201-203 says "three cluster-C
   modules are absent" from `EDITOR_ONLY_MODULES`; plan §7 carried-finding 3 (line 922-925)
   says **eight**, "not the three on record". Plan is the corrected, deeper source. Tier-0
   doc, tier-0's to fix; reporting rather than editing (cf. error 14).
2. **Two tier-0 line numbers for one citation.** Plan criteria table (line 957) says
   `site/dist.test.ts:1382`; plan carried-finding 3 (line 923) says `site/dist.test.ts:1430`.
   Same file, same subject, different line. S-1 is measuring the true one.
3. **`site/views.test.ts` is not in the disposition-table list.** Plan §9 (line 1148) records
   P3a deliberately left it depending on `site/index.html` so P3b's teardown reddens it
   **by design**. The plan's criterion-10 file list does not name it. S-1 is verifying.
   Not a net removal — a modification — but the orchestrator should know it is coming.

## Shift 1, after S-1 (survey complete)

**`main` moved mid-phase.** I measured `c4f4b7f` at 15:32; S-1 measured `720a2d1` later;
both were correct when taken. Verified by me: `c4f4b7f` is an ancestor of `720a2d1`, the
delta is **docs-only** (handover + starting prompt), and **plan/design/requirements are
byte-identical** — so every section I was briefed to read is intact. But the handover in
my tree is NOT the one on `main`, and I quoted its §5a into the worker boilerplate.
I verified `720a2d1` does **not** touch §4's standing rulings (no seek/clamp/wrap line
moved); it only records both PM slots as filled. Error 11's pattern recurring.

**Baseline, measured by S-1 under concurrent P1/P7 load:** typecheck 0 / build 0 /
build:site 0 / test 0, **80 files / 1881 passed / 0 skipped**, 43.11s. Re-run clean at
survey end: identical. Counts and exit codes usable; wall time contaminated.
Three `svelte-check` harnesses confirmed by two agreeing instruments (subprocess census +
timing rank): `typecheck-gate`, `fitregistration`, `bindingregistration` = 60.3% of summed
test time. **Whether a fourth fits is unmeasured — S-1 did not plant one.**

### S-1's findings that refute my brief (relayed, S-1's measurements, not mine)

- **Criterion 14's premise is wrong.** My brief said eight modules are *absent from*
  `EDITOR_ONLY_MODULES`. S-1's import-graph walk from both entries: the hand-written list
  is **exactly correct today, 7 of 7, zero absent, zero spurious**. The "eight" are a
  different set — P3a's eight registry modules, reachable from **neither** entry. S-1
  planted them: adding them **reddens** the suite, because the presence half of the control
  catches a needle that is in no bundle. The ordered shape is refuted by measurement.
- **The check already has teeth.** S-1 planted a real leak in `player.ts`, confirmed the
  needle reached `dist-player/` by grep, and the test failed by name. Caveat it recorded:
  its *first* plant was constant-folded away by Rollup and the suite reported green — so
  **a criterion-14 control is inadmissible unless the planted needle is first confirmed
  present in `dist-player/` by grep.**
- **`seek` wraps; the standing ruling says it clamps.** `transport.ts:266` uses
  `snapLoopTime` (circular). `transport.ts:217-254` says in writing that nothing pins it,
  no test samples the gap, and **the choice is P3's**, between two named shapes.
- **Criterion 10 and criterion 11's second clause are not module predicates** (§7 preamble).
- **Six files break or redden on teardown that the disposition list does not name:**
  `site/views.test.ts`, `site/keybindings.test.ts`, `src/node/canvas.vendored.test.ts`,
  `site/fonts.test.ts`, `site/styles.css`, `vite.site.config.ts`.
- **No store, no undo, no visibility set exists.** Three modules decline the visibility
  field in prose, quoting §11.
- **P2's `flowViolations`/`ChromeNode` in `site/playerchrome.ts` is a ready-made criterion-16
  instrument** with four controls already written.

## Shift 1, after decomposition approval

**Merged `main` at `69abca9`** — fast-forward from `c4f4b7f`, no conflict, tree clean.
Verified the amendments myself by diff rather than trusting the message: it rewrites
criteria 10, 11 and 14, adds criterion **21**, adds two §9 rows (both out of S-1's
findings), and corrects the §7 preamble — **a browser IS available on this host** if a
phase funds a harness. P3b funds none and needs none.

All six escalations ruled. ESC-1 and ESC-4 were orchestrator errors 22 and 21; refusing to
build on either was correct. The `seek` ruling is now: **∀t, `seek` and `snapTime` select
the same frame; both clamp; playback wrap stays separate** (`repeat` acts on advance, not
frame selection). C is unblocked.

**Scope grew to nine criteria** — 21 added. Placed in cluster G, not A: its sensor is RED
until teardown removes `main.ts`'s nine `let`s, so writing it in A would redden the suite
for the whole phase. In G it is textbook TDD — G-2 writes it red, G-3 turns it green, and
it becomes the direct evidence that teardown closed the gap.

### Approved task list, as amended

A-1 store · A-2 hash projection · A-3 microtask coalescing · B-1 history module ·
B-2 bind history to the action boundary · C-1 store consumes transport · C-2 the
agreement sweep + clamp pin · D-1 derive/cross-check the module list · E-1 visibility set
as a third value · E-2 architecture test (second instance **inline, adds no module**) ·
**SPIKE-1** (throwaway, one panel against the store, reported and discarded, not
committed) · F-1 lift `flowViolations` to shared · F-2 shell · F-3 criterion 16 ·
G-1 disposition table → `docs/` (15 files) · **G-2 criterion 21 sensor, RED** ·
G-3 execute teardown (turns G-2 green; includes `src/node/canvas.vendored.test.ts`,
now ruled P3b's) · G-4 `markup.test.ts` rewritten against the player, **carrying §8.3's
sub-pixel injunction sensor** plus the three otherwise-unpinned assertions · D-2 needles
extended to the shell + presence half re-run.

18 implementers, 7 verifier clusters, reviewer, gate runner. **Gate runs are serialised
against P1/P7 by ruling — tell the orchestrator before running one.**

### Criteria status

| # | Criterion | Status |
|---|---|---|
| 7 | Mark-based undo | not-started (B) |
| 8 | Store; hash as projection | **in progress — A-1 dispatched** |
| 9 | Scene time over P2's transport | unblocked, not-started (C) |
| 10 | Teardown + disposition table | not-started (G) — now a **review** criterion |
| 11 | R2/R8 architecture test | not-started (E) — restated, predicate accepted |
| 14 | `dist.test.ts` has teeth | partly discharged already; D-1/D-2 remain |
| 15 | Microtask coalescing | not-started (A-3) |
| 16 | Nothing above the canvas in flow | not-started (F-3) |
| **21** | No module-level mutable scene state outside the store | not-started (G-2/G-3) |

## `main`'s CI is red — inherited, not ours (orchestrator error 24, `27f1e71`)

Red since `7cd5599` (P3a merge): nine hours, eight commits, found only when Shaun asked
about the deploy pipeline. Four tests fail on CI and pass locally —
`site/fitregistration.test.ts:303` (×3) and `site/bindingregistration.test.ts:692`,
all *"could not read the checker's COMPLETED line"*. The harnesses parse `svelte-check`
output, which arrives in human format with no `COMPLETED` line on CI. **The criterion is
working; the parser is broken.** Being fixed by a worker on `fix/ci-svelte-check-harness`
in `…/staticstereo-p2`. **Hands off both files and that branch.**

Consequences I have taken on:

1. **The gate grew a fifth check.** `ready-to-merge` now needs a green CI run on the
   pushed branch, not four local exit codes. A local green is the instrument that missed
   this for nine hours.
2. **CI is ~15× slower** (10m45s vs 43s) on a 2-core runner — assume a quarter of local
   parallelism when judging anything concurrency-shaped.
3. **D-1's design constraint, new and sharp:** a harness whose *unparseable output* path
   and whose *criterion not met* path produce the same assertion cannot say which
   happened. That is exactly this bug. Written into the boilerplate as a standing rule for
   any harness that parses another tool's output.
4. **Standing rule added: no new `svelte-check`-spawning harness without clearing it with
   me.** My assessment, stated in the boilerplate as refutable: **no P3b task needs one.**
   Criterion 11's predicate is plain values; 14 is a module-graph walk plus a bundle grep;
   16 is `flowViolations` over constructed trees; 21 is a source scan. If a worker
   disagrees it must say so before building, and bring a wall-clock re-measure.

A-1 is unaffected — it adds no harness, touches neither file, and those four are green
locally. Not interrupting it.

## A-1 DONE — `cf4b119`, spot-checked

`site/store.ts` (180) + `site/store.test.ts` (496), 14 tests. Suite **81 files / 1895
passed / 0 skipped**, test exit 0, typecheck 0 (453 files), both builds 0. Delta is
exactly +1 file / +14 tests; no other test moved. Sha verified by me against `git log`.

Two-stage RED (absent module gives a collection error, not per-test failures, so an inert
stub produced 9-of-14 per-test RED). The five that passed against the stub each got a
**paired control**, all reverted — including one where planting a 12th `Action` member
reddened **both** a typecheck error and the variant sweep, and one where pointing the
closure walk at `main.ts` found `site/fonts.ts:48 document` two modules deep.

Held `DepthView`, **forced not preferred** — the store holds `UiState` whole. Neither name
renamed or deleted, so whoever ties `DepthView`/`DepthSource` is not pre-empted.
Holds `UiState.time` with `snapTime`; **no second snapping rule**, no `TransportState`.
C-1 inherits the reasoning from the module header.

### My own error, found by A-1 (§1.2e: the expensive errors sit in the cheapest checks)

I wrote "§9, lines 1079–1151, all 68 rows" into the boilerplate and "grown to 70" into
A-1's brief. **All three wrong.** The range was pre-merge; the counts were never measured.
Worse: when I re-counted to check A-1, **my own instrument was broken** — an `awk` pattern
`^\| ` that cannot match the separator row `|---|---|`, so subtracting 2 subtracted a row
that never matched, yielding 67. Correct counts: **68 at `69abca9`, 66 at `c4f4b7f`.**
A-1 was right and my correction of it was wrong. §1.2o, committed by the PM that wrote the
rule into the boilerplate. Boilerplate now points at the heading, not a line number.

### Carried forward from A-1

- **Criterion 21 confirmed open, by measurement, exactly as planned.** The store ships
  *beside* `main.ts`'s nine `let`s. A-1 deliberately did not build the sensor, for my
  reason: it would red the suite from this commit until teardown. Confirms G-2/G-3.
- **`site/store.ts` is the ninth neither-bundle module** (grep of all three dists: no
  hits), joining the eight P3a registries. Correctly stays out of `EDITOR_ONLY_MODULES`.
  **D-1 must handle a list that is about to grow, not just one that rots.**
- **Re-entrancy semantics are A-1's decision, not any document's** — "a subscriber
  dispatching mid-pass means later subscribers see the newer state", argued in the header
  and pinned by a test. **A-3 must either adopt it or raise a conflict**; it reddens rather
  than drifts. Also unmeasured: whether this notification shape fights A-3's coalescing
  (adjacent to S-1's open item 8, the `render()` promise chain).
- **Wall-clock moved 43.1s → 59.07s and A-1 could not attribute it.** Its own file costs
  ~2.3s; `bindingregistration.test.ts` alone went 41.0s → 56.7s, and that is a
  `svelte-check` harness A-1 did not touch. Most likely concurrent P1/P7 load — a guess,
  not a measurement. **Do not treat 59s as the new baseline; re-measure quiet.**
- `createSceneStore` takes `UiState`, not `Scene`; `main.ts:722`'s `setScene` also resets
  the raster cache and diagnostics row, so the shell may want a different constructor.
  Flagged for F-2.

## SPIKE-1 DONE — throwaway, nothing committed, tree verified clean at `cf4b119`

Mounted `PANELS.inspector` (the only panel any registry describes the contents of — all
63 `CONTROL_SPECS` carry `panel:'inspector'`), registry-driven, against the real store.
Cleanup proven: porcelain empty, HEAD `cf4b119`, 81 files / 1895 / 0 skipped, typecheck 0.

**Findings that change the plan. All SPIKE-1's measurements, none mine.**

1. **R6 is NOT reachable through the current `Action` union.** 17 of 63 controls have a
   keyed `Action`; **46 do not** — every `layer.*.at`/`.depth`/`.name`, all `layer.shape.*`,
   all `image/gif.src|mode|mask`, **all 11 `preset.*`**. Their only path is rebuilding the
   whole scene, which `store.ts`'s header says the store must not own. **Criterion 6
   ("every `CONTROLS` entry resolves to one mounted panel") is MET and cannot see this** —
   it proves the spec is *reachable*, not that the value is *writable*. R6 says "exposes
   every control". Needs a path-addressed `Action` variant or a scene patcher. **Budgeted
   nowhere.**
2. **The generic write path defeats the type checker.** A computed `string` key erases the
   field type: `{type:'stereo', patch:{[key]: Number(raw)}}` compiles clean while the
   literal form errors. A generic renderer can write a number into a boolean or an enum
   field with nothing to stop it. SPIKE-1's own code had the bug and compiled.
3. **The test tier cannot see F-2's real failure modes.** No DOM tier at all (`jsdom` and
   `happy-dom` absent, `mount()` unrunnable by any test); **`$effect` is stripped from SSR
   output**; `$state(store.state())` **forks state in the browser** (breaking the store's
   identity guarantee, writes landing nowhere) while SSR reports the opposite for *both*
   the correct and incorrect spelling; **`render()` is lazy** — the component script does
   not run until `.body` is touched, so a side-effect assertion after `render()` measures
   nothing and reports green. Instance nine of the dominant failure mode.
4. **`npm run typecheck` is fail-open on Svelte warnings.** 8 × `state_referenced_locally`
   — Svelte saying the panel will never re-render — and the gate exits **0**.
5. **`dist.test.ts`'s `@napi-rs` grep reddens on the first consumer of `controlspec.ts`.**
   Not a purity defect: the registry ships a *doc string* containing "@napi-rs" and the
   check is a raw `text.includes` over built files. **F-2 cannot be green until it is
   narrowed.** Its parse-failure and real-regression modes are also the same assertion.
6. **Criterion 14's rot observed under a real consumer.** Six modules became editor-only
   and `EDITOR_ONLY_MODULES`/`toHaveLength(7)` stayed **green and silent**. Direct
   evidence for D-1; the list is wrong the moment F-2 lands.
7. **The only path into the site bundle is `site/index.html`** — `vite.site.config.ts` has
   `root:'site'` and no explicit input. **That is the file teardown deletes.** Hard
   ordering constraint between F-2 and criterion 10, in no document.
8. **`store.dispatch` rethrows where `main.ts:707` caught and called `showError`.**
   `controls.ts`'s header: *"A `sepNear` slider dragged up past `sepFar` must not throw out
   of an event handler."* Every Svelte handler needs a wrapper or a `dispatchOrShow` seam.
9. **F-2 is not "one component plus a map."** Generic works for the inspector (63/63). But
   `PANELS` carries no component reference, and `OPERATIONS`/`VIEWS`/`SHADINGS` carry no
   panel field — so four bespoke panels plus **two hand-written maps the registries do not
   support**.
10. **Chrome: three options, and (c) is the default-by-accident.** (a) `applyChrome` from
    an effect; (b) a recursive Svelte renderer over `ChromeNode` — built, `flowViolations`
    `[]` with a working paired control, but it is a *second* renderer of the tree, which
    `chromedom.ts`'s header names as the thing not to build, and it already diverged twice;
    (c) hand-written markup **plus** a separate `ChromeNode` tree = a parallel description
    = **criterion 16 becomes a check that cannot see.** *"If F-2 is specified as 'write the
    shell in Svelte markup,' it has chosen (c) without anyone deciding to."*
11. Bundle +65% raw / +71% gzip from one panel + runtime + registries, much of it registry
    prose shipped to the browser.

`main` moved again to `27f1e71` (docs-only, the error-24 record).

**Open escalations raised to the orchestrator: ESC-7 (R6/`Action` gap) · ESC-8 (fund a
sensor tier for F) · ESC-9 (narrow the `@napi-rs` grep, merged P2 file) · ESC-10 (decide
chrome (a)/(b)/(c) before F-3) · ESC-11 (F-2 ↔ criterion 10 entry ordering).**

**Unblocked while those are open (§8):** A-2, A-3, B-1, B-2, C-1, C-2, D-1, E-1, E-2.
**Blocked/affected:** F-1, F-2, F-3, G-1..G-4, D-2.

## CI fixed and merged — HEAD `32eaaac`

Merged `main` (`311dec1`) cleanly: the harness fix plus three new §9 rows. CI and pages
green, site deployed. The red-CI block in the boilerplate is **superseded and rewritten**;
the "assume a quarter of your parallelism" guidance is **withdrawn** (green CI = 94s).

**Root cause, and it is the sharpest thing in this project so far.** `svelte-check`
4.7.6's `getOutputFormat()` falls back to `machine` when `process.env.CLAUDECODE === '1'`,
else `human-verbose`. Both harnesses spawned with `{...process.env}`. **The suite's output
format was decided by whether it was being run from inside Claude Code** — every agent got
a `COMPLETED` line, the runner got none, and *no tier of this system could have seen it by
running the suite*, because the blindness sat in what all tiers share.

Also: a failing `expect` in a `child.on('close')` callback **hangs** rather than fails —
uncaught exception, promise never settles, `beforeAll` burns its timeout. That was the
whole 10m45s. **Async harnesses `reject`, never `throw` from a callback.**

### My own overconfidence, recorded

I told the orchestrator three concurrent worktrees were "almost certainly the whole
explanation" for A-1's 43.1s → 59.07s, and proposed extending gate serialisation to any
recorded measurement. **The 15× figure I built on was wrong, and SPIKE-1 had already
measured the opposite direction** (52.87s with the spike → 61.42s clean) — evidence
against my own hypothesis that I relayed without updating on. Local contention may still
be a real minor effect; my confidence was not earned. §9's *"the arithmetic is wrong,
because the output is wrong"* — look upstream of the computation before auditing it.

### Carried question for the gate

The repo has **env-conditional skips** (`HAVE_FFMPEG`, `HAVE_TSC`, `HAVE_STRIP_TYPES` —
plan §4.1 records 8 such tests). My baseline "0 skipped" is a **local** measurement. §6.3
compares counts against the branch's own baseline, and the gate now also requires green
CI. **0-skipped locally is not evidence of 0-skipped on CI**, and comparing a local
baseline against a CI run compares two different populations. The gate runner must record
both, or the comparison is void. Raised to the orchestrator.

## A-2 DONE — `7cb2704`, spot-checked

`site/hashprojection.ts` (164) + `site/hashprojection.test.ts` (480), 20 tests.
Suite **82 files / 1915 passed / 0 skipped**, typecheck 0 (455 files), builds 0.
Delta exactly +1 file / +20 tests, which also cross-checks the baseline I handed it.

`projectedHash(state)` pure; `PROJECTED_FIELDS`/`UNPROJECTED_FIELDS` made total by three
`AssertNever` pairs; `HashTarget {read, write}` injected; `attachHashProjection(store,
target)`. Five real-module mutation controls for the 7 vacuously-satisfied tests, each
reddening the right tests and no others. Two nulls declared **not** externally controlled
rather than implied otherwise.

**Instrument discipline worth copying:** M1 (`history.replaceState` planted at module
scope) produced `Tests: no tests` — node has no `location`, so the module threw at import
and *collection* failed. **A collection error is not the failure the control claims**, so
A-2 re-planted inside an unexecuted function. That is the §9 "my control proves the diff
works" distinction caught in the act.

### My acceptance criteria were jointly unsatisfiable — A-2 measured it

Criterion 3 (a mutation of an excluded field produces **no** write) and criterion 4 (any
dispatch sequence leaves the projection **equal** to the state's encoding) cannot both
hold. On a page whose fragment does not yet agree with the store — first visit, no
fragment — the only notification available to close the gap is the next mutation,
whatever field it touched. So the first dispatch must either write (breaking 3) or leave
them disagreeing (breaking 4). Found empirically: the criterion-3 test went red on `time`.

**A-2's resolution, which I accept:** the exclusion holds **once the fragment agrees** (the
state a page opened on a share link is in), and the projector converges on the first
mutation while it does not. Both halves pinned; the precondition is in the test docblock
and the module records why. It declined the third option — writing on attach — on a
concrete harm: *a reader who arrives on a broken link gets an error naming it, and an
attach-time write would replace that evidence with the default scene before they could
read it.* **One-line reversal if tier 0 rules otherwise.**

This is the thirteenth consecutive worker pushback that was right. My criteria remain the
weakest thing I produce (§1.2e-ter) and this is the second of mine to be refuted.

### Carry-forwards

- **ESC-12 (new, open): an unrenderable scene still reaches the URL.** `reduce` accepts
  combinations that do not render, so a share link can carry a scene the canvas refuses to
  draw. Not new — `main.ts` does the same — but `hashprojection.ts` is where a filter
  would live, so shipping without one is a tacit answer. A-2 recorded it rather than
  deciding. **User-visible; needs a ruling.**
- **For criterion 14's owner:** `hashprojection.ts` is in neither bundle today, so
  `EDITOR_ONLY_MODULES` correctly omits it. **The day cluster G wires the browser adapter
  it becomes editor-only and the list must gain it — and the list lives in three places,
  one unguarded.** Second confirmed instance of the rot D-1 exists to fix.
- **The browser adapter does not exist.** Intended:
  `{read: () => location.hash, write: h => history.replaceState(null, '', h)}` at the
  composition root. Trivial by design, but **unexercised against a real browser** — the
  module's whole testability argument rests on that two-liner being trivial, which is a
  judgement, not a measurement. Cluster F/G owns it.
- S-1's `main.ts:681`/`:1315` stale-guard lead remains **traced, not executed**, by anyone.
  A-2 designed so the shape cannot exist (no remembered value; the guard reads the live
  fragment) and pinned that with M4, but the original bug is still unverified.

### Boilerplate fixed

My §0 branch-point rule said "HEAD must not be behind `main`, do not start" — which
**deadlocks the phase**, since tier 0 lands doc commits continuously. A-2 overrode it
correctly and flagged it. Rewritten: the hard requirement is that `69abca9` is an
ancestor of HEAD; docs-only divergence → proceed and report; any divergence touching
`src/`, `site/`, config or tests → stop.

## A-3 DONE — `ceaa3b0`, spot-checked. **Cluster A complete. PM-SHELL-P3b stands down here.**

`attachHashProjection(store, target, schedule)` — a notification sets a per-attachment
`pending` flag and asks `schedule` for a flush; the flush clears `pending` first, honours
`detached`, and projects **`store.state()` as it stands when it runs**, not the notified
state. +14 tests. Suite **82 files / 1929 passed / 0 skipped**, typecheck 0 (455), builds 0.
Delta +14, zero removals. **Eight mutation plants**, each confirmed present in the source
before the suite was read — including "the projector never writes at all" → 20 red, which
is criterion 2's whole reason for existing.

**A-3 found its own instrument blind mid-task.** Its drain test watched `writes`; the
self-requeueing plant passed it, because the follow-up flush found the fragment unchanged
and wrote nothing — *a projector queueing microtasks forever, invisible to the only test
asking*. It now counts `schedule` calls and catches the plant. Note the residue: the
**unbounded** form of that plant **hangs** the runner rather than reddening it — the same
shape as §9's child-process-callback row.

**Criterion 15's wording is imprecise and A-3 shipped the precise version rather than
silently widening it.** N mutations in one tick produce **at most** one write: a tick whose
mutations cancel leaves the projection where it was and the unchanged-fragment guard skips
it, as it does outside a tick. Writing anyway reinstates the per-tick `replaceState` cost
`main.ts:683-684` exists to avoid. **Pinned rule: a write happens exactly when the
projection moved across the tick.** Both arms tested. Tier 0 may want this reflected in
the criterion's text.

A-1's re-entrancy decision **adopted, no conflict**. A-2's three load-bearing claims
re-established through a *deferred* scheduler, since A-2's own tests pass through a
synchronous one and that is weaker than "survives coalescing". No A-2 test body changed.

### Carry-forwards from A-3

- **ESC-13 (new): `src/node/metamorphic.real.test.ts` has a 5000ms timeout on work measured
  at 5388ms under load.** Pre-existing, not P3b's file, not P3b's phase. **It will flake on
  a loaded CI runner.** A-3 routed it rather than touching it. Two of its own runs failed
  there at load ~20; proven environmental — passes in isolation 14/14, and `main`'s own
  tree at load 13.2 is 1915/1915 green.
- **Criterion 15 is met *at the module*. "The editor's URL coalesces" is unwitnessed**
  until cluster F/G builds the composition root, and **the choice of queue is theirs to get
  wrong.** Worth a criterion or a sensor on that side — currently neither exists.
- **For the reviewer:** A-2's remaining ~17 tests now describe only the *uncoalesced*
  configuration. Meanings intact, but if the composition root ships `queueMicrotask`, most
  of that file exercises a configuration nobody runs. Parameterising it over both
  schedulers is the alternative; A-3 judged that a larger rewrite of A-2's work than
  criterion 4 licenses. **A reviewer may reasonably want it and should be told it was a
  considered call, not an oversight.**
- `Schedule` is a third **parameter**, not a third member of `HashTarget`, departing from
  A-2's stated expectation. Reason in code: `HashTarget` answers *where*, `Schedule`
  answers *when*, and only the second is a policy a caller varies. A-3 flagged it as a
  judgement with no empirical discriminator.
- A-3 changed A-2's `globalsNamedIn` to take a defaulted `names` parameter. No A-2 test
  touched; P3a's carried finding 4 rules the defaulted-table direction correct.

### My boilerplate's §9 row count was wrong a third time — removed, not corrected

68 → measured 71 in-tree, 72 on `main`. The file now states **no count** and tells workers
to find the table by heading and read to the end. A hand-maintained number in a file nobody
owns is §9's own hand-written-list trap, committed by the file that warns about it.

## Next

Await S-1. Then: restate all eight criteria as module-level predicates (§7 preamble),
cluster them, report the numbered task list to the orchestrator, and **wait** (§5.5).

---

# Shift 2 — PM-SHELL-P3b-2

## Handover verified, not inherited (§1.2c)

- `69abca9` is an ancestor of HEAD ✓ (`git merge-base --is-ancestor`)
- `main` was `0e111eb`; divergence **docs-only** (`editor-execution-plan.md`,
  `orchestrator-handover.md`). **Merged → HEAD `466e2aa`**, clean, no conflict.
- Predecessor's three feature shas all resolve and their messages corroborate the
  ledger: `cf4b119` store, `7cb2704` hash projection, `ceaa3b0` coalescing.
  Counts in the commit trailers: 81/1895 → 82/1915 → 82/1929, 0 skipped throughout.
  **Nobody has re-measured any of it. Local only, never CI.**
- Worktrees: `-main` 0e111eb, `-p1p7` e14ca10 (PM-SHARED-3 live), `-p2` b8a42cb. Untouched.

## First dispatch: V-A (verifier, cluster A) — the first sensor ever switched on over this phase

Covers A-1/A-2/A-3, RED re-established individually. Four named checks beyond the
standard verifier duty:
1. the two-stage RED (collection error is not an admissible RED);
2. **A-3's claim that no A-2 test body changed**, which is in tension with `schedule`
   being a required third parameter — if false it is a false statement in the durable
   record;
3. re-plant ≥3 of A-3's eight mutations, grep-confirmed present before reading any
   verdict, with the unbounded-self-requeue **hang** hazard called out;
4. counts re-measured, "0 skipped" verified positively by grepping for `↓`.
Told explicitly: criterion 15's second clause (composition root) is F/G's and A-3 is
not to be failed for it; A-2's ~17 uncoalesced tests were a **considered call**.

## Criteria status at `466e2aa`

| # | Criterion | Status |
|---|---|---|
| 7 | Mark-based undo, one entry per interaction | not-started (B) |
| 8 | Store; hash as projection | **implemented `cf4b119`+`7cb2704`, UNVERIFIED — V-A live** |
| 9 | Scene time over P2's transport | not-started (C) |
| 10 | Teardown + disposition table (review criterion) | not-started (G) |
| 11 | R2/R8 architecture test | not-started (E) |
| 14 | `dist.test.ts` has teeth | partly discharged pre-phase; D-0/D-1/D-2 remain |
| 15 | Coalescing — module half | **implemented `ceaa3b0`, UNVERIFIED — V-A live** |
| 15b | Coalescing — composition root (new clause) | not-started (F/G) |
| 16 | Nothing above the canvas in flow | not-started (F) |
| 21 | No module-level mutable scene state outside the store | not-started (G) |
| 22 | Every `CONTROLS` entry *writable*; wrong-typed write fails to compile | not-started (H) — **prerequisite for F** |

## Standing constraint added this shift

**Workers commit in-tree sequentially (§4).** A verifier stashes and unstashes production
code, so **no implementer may run concurrently with a verifier in this worktree.**
The predecessor never hit this because it never ran a verifier.

## V-A DONE — the first verification ever run on this phase. Tree clean, HEAD unmoved.

**Criterion 8 `MET WITH FINDINGS` · criterion 15 `MET` at the module.** RED reproducible
for all three tasks, from V-A's **own** stubs: A-1 9/14 (claim 9/14), A-2 12/8 (claim
13/7, delta attributed to stub choice), **A-3 needed no stub** — A-2's real uncoalesced
predecessor under HEAD's test file gives 10 of 14 red, so A-3's RED is the only one of the
three immune to the collection-error objection. Counts re-measured exactly: 82/1929/0,
four exit codes 0, typecheck 455 files 0/0/0. **"0 skipped" confirmed positively** by
`grep -c '↓'` → 0, *and* V-A accidentally produced the paired control for that instrument
by running once on a stale tree: 22 skipped, found immediately, failing by name with a
build instruction. **§9's "a freshness gate skips when stale" row is closed in the good
direction** — the gate is loud now, not silent.

Five of A-3's eight plants re-planted from the description (not copied), grep-confirmed
present before any verdict read: silent projector **20 red** ✓, bounded self-requeue
**5 red** ✓ (did not hang), `pending` cleared late **1** ✓, first-state flush **4** ✓,
welded-in scheduler 21 vs 20 (V-A's plant kept the param used). Two compile-time clauses
V-A reddened itself: a twelfth `Action` variant → `TS2741` at `store.test.ts:43` **and**
the parser cross-check, two independent machines; a fourth `UiState` field →
`_NoFieldUnclassified` at `hashprojection.ts:103`.

### The finding that matters — an *agreeing* duplicate is invisible to the whole repo

`store.ts`'s contract is "adds no second implementation of any reducer arm". V-A planted a
`depthView` special case in `dispatch` **computing the same answer `reduce` does**:
suite 82/1929/0 exit 0, typecheck 0, both builds 0 — **and the 227 unasserted
`report()`/`[measured]` lines diffed `LC_ALL=C`-sorted, identical, zero difference.** Both
halves of §6.5a, with the diff pipeline itself controlled. The existing sweep senses
**divergence** (a *disagreeing* plant reddens one test immediately), never **duplication**.
This is the exact shape of the defect `store.ts`'s own header cites as the repo's
signature — the channel list duplicated unguarded in two validators, which **agreed on the
day it was written and drifted later**. Criterion 8 is met by the code; the clause is
unsensored. → **A-4 dispatched.**

Two smaller findings → folded into A-4:
- `site/hashprojection.ts:88` says "a **twelfth** field" where `UiState` has three —
  correct word *fourth*. A §9 false **assertion**, not a stale pointer. (The "twelfth" in
  `store.test.ts:27` is correct — eleven `Action` members — and must not be touched.)
- **`ceaa3b0`'s commit message is false**: *"every one of A-2's tests passes with its body
  unchanged"* — 12 call sites across 11 of A-2's 20 tests were edited to thread a
  `const immediately: Schedule`. True version: *"with its **assertions** unchanged."*
  Corrected **beside**, in A-4's commit message; no rebase (merge commit sits after it).

### V-A refuted the relayed "~17 uncoalesced tests" concern — overstated by count

Of A-2's 20 tests, **nine attach no projector at all** (purity, roster, the two source
scans and their controls) and are scheduler-independent by construction. Eleven attach
one; **A-3's new block re-establishes nine of those eleven across a real tick.** The
residue is **two**, not seventeen — one substantive (the arbitrary-interleaving test) and
one scheduler-irrelevant. A reviewer wanting the interleaving test across a tick has a fair
ask costing one test; **parameterising the file over both schedulers would buy nine
duplicates of claims already made.** A-3's judgement stands.

### My own instrument error, caught by V-A (§1.2o) — the same rule wrong for a second time

I shipped the boilerplate's §0 divergence check as `git diff --name-only HEAD..main`.
**Two-dot is a tree diff, not a commit range**, so it lists the branch's own additions as
though `main` were missing them: V-A ran it on a zero-divergence tree and got four `site/`
files, which under my literal instruction is a STOP. **It says "stop" for every branch in
this project that has ever added a file** — i.e. exactly the branches it guards.
Fail-closed, so no wrong answer shipped; it deadlocks instead — *the identical defect to
the predecessor's "HEAD must not be behind main"* rule it replaced. **This §0 rule has now
been wrong twice and been overridden by a worker both times.** Boilerplate rewritten to
`git log --oneline HEAD..main` first (empty ⇒ no divergence), then three-dot
`git diff --name-only HEAD...main` to classify, with the two-dot trap written out.
I used the correct instruments on my own merge and still shipped the wrong one downstream —
§1.2o exactly: *I checked the output and not the instrument.*

### V-A's open UNCERTAINs, carried

1. **Every typecheck number in its report was produced inside the agent harness**, so
   `svelte-check` emitted machine format via the `CLAUDECODE` sniff. It did not strip the
   environment and re-run. Its argument for why this is tolerable: both its typecheck
   plants gave **exit 1 with the expected named errors**, and a format revert fails *open*
   (toward green) — so a **clean** typecheck here is less trustworthy than a dirty one.
   All three of its clean runs inherit that. **The gate runner must strip the env.**
2. Three of A-3's eight plants not re-run (`pending` hoisted, detach flag unread, guard
   remembering its last write).
3. Whether duplicated-but-agreeing logic is similarly invisible **elsewhere in `site/`** is
   unasked and no instrument in this repo answers it.
4. Criterion 21 open; V-A did not verify `main.ts`'s "nine `let`s" count.

## A-4 dispatched — remediation of V-A, strictly additive plus one word

Guard the agreeing-duplicate clause (parse, do not grep; scope it to the module not the
literal `dispatch` body, because a helper would evade the narrower form); fix
`hashprojection.ts:88`; correct `ceaa3b0`'s false sentence in A-4's own commit message.
Judged **remediation of approved cluster A**, not new scope, so dispatched without waiting
on the orchestrator's ruling on the seven new tasks.

## A-4 DONE — `92e8b43`, signed, tree clean. Criterion 8's unsensored clause is now sensored.

`site/store.test.ts` +291 additive (a **parsed** structural guard `Delegation`/`delegationIn`
plus two tests: the guard, and its paired control). `site/hashprojection.ts` one word.
**`site/store.ts` UNCHANGED — the guard needed no production edit.** 82 files / **1931**
passed / 0 skipped (grep `↓` → 0), typecheck 0 / 455 / 0 errors 0 warnings, builds 0.
Delta exactly +2. Zero removals.

A-4 **independently re-verified all three relayed V-A claims** before building on them:
reproduced the agreeing-plant invisibility end to end; counted `UiState` at 3 fields and
`Action` at 11 (so `store.test.ts:27`'s "twelfth" is correct and was left alone); counted
item 3 at exactly 12 call sites / 11 tests, with **zero removed lines containing `expect(`
or `assert`** — so A-3's narrower claim holds exactly. It grepped `docs/` first to confirm
the "twelfth" sentence is not a verbatim ruling quote before editing, and **reported the
avoided trap rather than staying silent** (§9's own row on that).

### A-4 settled my open design question by measurement, not argument

I asked whether a guard scoped to the literal `dispatch` body could be evaded. A-4 planted
the same duplicate inside a module-level helper `arm()` that `dispatch` calls: **typecheck
0, behavioural sweep still green, module-scoped guard reddens.** A `dispatch`-scoped guard
would have missed it. Module scope is now measured correct.

**It also partly refuted V-A's suggested design, and was right:** V-A's "exactly one call
to `reduce`" clause does **not** catch the agreeing plant — the plant still contains
exactly one `reduce` call. Only "constructs no state" bites. A-4 implemented
write-provenance (every assignment to the storage takes `reduce`'s answer straight) plus
arm-naming instead. **Two verifier-suggested designs in a row have needed correction by
the implementer.**

### A-4's carried UNCERTAINs — for the reviewer

1. **`tagsNamed` is the half most likely to need narrowing.** `Action`'s tags include
   ordinary words (`time`, `size`, `scene`, `frame`); a legitimate future string literal
   reddens it on a non-defect. Kept because it is the only half that sees arm
   *suppression*. Failure message names the line, so diagnosis is cheap.
2. `delegationIn`'s const-binding map is **file-wide, not scope-aware** — a name declared
   twice resolves to "not delegated". Fails closed, but it is looseness.
3. `Object.assign(self, {state: x})` or a destructuring write would not be seen.
4. **One-sided vacuity on the suppression case** — the control proves `tagsNamed` sees
   suppression over a *synthetic* module; A-4 did not plant suppression into the real
   `store.ts`. One fewer end-to-end observation than the other two plants have.
5. It grepped the twelfth/fourth claim's **string**, not its claim-shape, so siblings
   elsewhere in `site/` are unswept.

### My §0 rule was wrong a THIRD time — A-4's correction adopted

The replacement threshold stopped on *any* `src/` divergence. A-4 hit it over three
`.test.ts` files from the concurrent phase, provably disjoint from its scope, **tried to
escalate, and found the mesh one-way** (`SendMessage` to `PM-SHELL-P3b-2` → *"No agent
named … is reachable"*). "Stop and report" with no reachable recipient delivers nothing.
It measured and proceeded — correctly. Boilerplate now classifies **by intersection with
the worker's own scope**, and says out loud that this rule has been wrong three times and
is probably still wrong somewhere.

## `main` merged → HEAD `7afc644`. Baseline is now UNMEASURED.

`main` moved to `d5dcf89`: `cc88b4b`/`9312529` (**ESC-13's fix, landed by the other phase
— two false reds closed: a 5s timeout that only lost under fleet load, and
`UPDATE_PRESET_GOLDEN` fenced so it can no longer manufacture green**) plus pages docs.
Four files, three of them `src/**.test.ts`, none in `site/`. Clean merge.
**`presets.golden.test.ts` gains a test, so the pre-merge 1931 is stale.** C-1 is
establishing the post-merge figure as its first act.

## C-1 dispatched — cluster C REORDERED, and the reorder is the point

Approved order was C-1 "store consumes transport" → C-2 "agreement sweep + clamp pin".
**Inverted.** `transport.ts` (`snapLoopTime`, circular) and `controls.ts` (`snapTime`,
linear) disagree today; a store consuming transport first must silently pick one, which is
exactly what A-1 declined — *"a store quietly holding both is where that disagreement
would have become permanent."* So C-1 is now the reconciliation (∀t agreement + both
clamp, playback wrap untouched) and the store consumption is C-2. Same two deliverables,
no scope change. **Told C-1 to say whether it thinks the reorder was right.**

Three green-lie modes written into its brief: a sweep sampling only frame boundaries
cannot see the bug (P2's counter-example is at t=1.99, *inside* the final inter-frame gap,
agreeing again at 1.95); a sweep comparing a function with itself proves only that the
derivation ran twice, so if `seek` ends up calling `snapTime` the vacuity floor must move
and it must say where; and the §6.5a plant with both halves named.

### Verification owed

**A-4 has no verifier.** Folding it into the next verifier cluster (V-BC) rather than
spawning one for a single task. Recorded here so it cannot be dropped — §6.1 needs every
criterion evidenced by a verifier who implemented none of it.

## C-1 DONE — `bf5eb1a`. Criterion 9's first half: the two snapping rules are reconciled.

`seek`'s anchor: `snapLoopTime` (circular) → `snapTime` (linear). **`site/controls.ts` NOT
touched** — it already aliases `snap = snapTime`, which is the side that won. +4 tests,
zero removals. **Baseline established post-merge at `7afc644`: 82 files / 1932 / 0
skipped.** After C-1: **82 / 1936 / 0**, typecheck 0 / 455 / 0 errors 0 warnings, builds 0.

RED was real and quoted against unmodified `transport.ts`: 3 failed / 25 passed, including
P2's own counter-example grid. Provenance verified by command as instructed — `git log -S
--pickaxe-regex` puts *"`seek` clamps to the last frame"* in `4d4799e`, and
`--diff-filter=A` confirms that is the handover's **birth commit**, so error 22's account
is accurate; the on-merits replacement enters in `69abca9`. C-1 implemented the
replacement.

### ⚠️ ESCALATION — the ruling contradicts a merged P2 test, unavoidably. Landed, unratified.

`transport.test.ts`'s *"wraps a seek out of range into the scene rather than clamping or
throwing"* pinned `2.5→frame 6`, `-0.5→frame 18`, `4→frame 0`. **Out-of-range and
in-the-final-gap were never two behaviours** — `seek` reached both through one
`snapLoopTime` fold — so no implementation agrees with `snapTime` inside the gap and still
wraps outside it: `seek(…,2.5)` would have to be frame 6 and frame 23 at once. C-1 proved
this is not a straw man by **planting the half-reconciliation (Plant B) and measuring it
red**. Per instruction it did not delete: retitled *"clamps a seek out of range the way
snapTime does, rather than wrapping"*, rows re-pointed, **old rows and the superseded rule
preserved in a docblock beside it, assertions 7 → 15.** `transportdriver.test.ts`,
`controls.test.ts` and the rest of P2 are untouched and green.
**Needs tier-0 ratification. Revertible.**

### C-1 refuted my acceptance criterion 2 — my first, and it was right

*"`t` beyond the end selects the last frame"* taken literally over `number` makes
`+Infinity` the last frame. It is **frame 0** by `frameIndexAt`'s own older documented
rule, pinned by a merged test row and re-exported through `controls.ts`. The handover
ruling does not require otherwise — its stated reason is *"an editor scrubber dragged past
the end parks at the end"*, and **no scrubber emits Infinity**. Criterion 1 holds for
non-finite t either way (both answer frame 0). Implemented under a finite-t reading with
`.filter(Number.isFinite)`, recorded at the assertion and at `seek`.

### Plant C is the result worth keeping — the predicted tautology, caught and relocated

Three plants, each grep-confirmed present before any verdict, all reverted (`grep -c
PLANT-` → 0): **A** (pre-ruling rule restored) 4 red; **B** (half-reconciliation, agrees in
the gap and still wraps) 3 red; **C** an *agreeing* pair where **both** wrap — the
agreement sweep **stayed green**, exactly the tautology I warned about since `seek` now
calls `snapTime`, **and the clamp arm reddened.** The vacuity floor moved to the clamp arm,
which compares each function to an index derived from `frameTimesOf(scene).length` rather
than to its twin. **This is store.ts's agreeing-duplicate failure mode controlled for
directly, by a worker who was told about it and went looking.**

The sweep generates from each grid's geometry over six configurations (12fps/2s, 6/1s,
25fps/0.55s ragged, 60/0.5s, 1fps/3s, a still): every frame time, quarter-frame offsets, a
dense fan across the final gap to 0.99999 of its width, past `loopDuration`, below zero,
and the three non-finites. A third test asserts the sweep **reaches** the discriminating
region and re-runs P2's counter-example (apart at 1.99, together at 1.95), so a hand-picked
table could not have passed.

### My brief contained a genuine internal conflict — C-1 named it rather than choosing

Scope listed `site/transport.test.ts` as expected-to-change; the escalation clause said do
not edit a merged phase's test to make a change fit. C-1 read the explicit listing as the
carve-out, rewrote rather than deleted, and said that **if that reading is wrong the only
alternative is to stop, because the criterion cannot be met with that test intact.** That
is §1.2f working. Fourth instruction defect of mine this shift.

### C-1's other UNCERTAINs

- It changed **one character inside P2's retained note**: `##` → `###`, to nest it under a
  heading marking it historical. Words byte-identical, verified by `LC_ALL=C diff` with a
  same/mutated control pair in the same invocation. **My call: accept** — a heading depth
  is not a claim and the preserved text is intact — but it is an edit inside preserved
  text and tier 0 may want it reverted.
- `snapLoopTime` now has exactly **one** production caller (`timeAt`), still exported,
  three tests use it as a negative control. Narrowing it is a judgement C-1 declined to
  make. Left for the reviewer.
- **CI has not seen any of this.** Given error 24, local green is not the gate.

## C-2 dispatched — the store consumes transport. Last dispatch of this shift.

Told: the four compile-time tripwires that will fire on it **by design** (the `UiState`
3-field `AssertNever` partition; the 11-member `Action` union with three instruments; **A-4's
duplication guard, which reddens if transport handling goes in as a `dispatch` special
case**; `reduce`'s no-`default` exhaustive switch). Told C-1's merged-test rewrite is
escalated and unratified, and not to treat it as precedent without saying so. Told the
`TransportState`-in-or-beside-`UiState` question is **its** design decision, that I am
least confident about that criterion's scope, and to argue it in the module header.

## C-2 DONE — `760f353`. **Criterion 9 complete.** PM-SHELL-P3b-2 stands down here.

`UiState` gains `transport: TransportState`; `time` is now always `transport.anchorTime`;
`Action` gains play/pause/seek (each carrying `nowMs`); new `currentTime(state, nowMs)`;
single write-site helper `withTransport`. **82 files / 1948 passed / 0 skipped**, typecheck
0 / 455 / 0-0, builds 0. **Delta +12, itemised by a per-file count diff of two run logs
under `LC_ALL=C` with a known-different control pair in the same invocation** —
controls.test.ts 40→44, store.test.ts 16→24, all 80 other files byte-identical. Zero removals.

**Two of its tests passed on first run and it said so rather than counting them.** Invariant
1 says that is not evidence, so it established RED by planting in the REAL files,
grep-confirming each present before reading any verdict: PLANT-A an *agreeing*
re-implementation of `play` inside `reduce` → the new duplication guard fires by line;
PLANT-B an *agreeing* duplicate `pause` arm in `dispatch` → **A-4's guard fires on tags it
was never told about, which is measured, not assumed**; PLANT-C `Date.now()` in controls.ts
→ the closure clock sensor fires. All reverted, tree clean.

### The design decision: `TransportState` IN `UiState`, and reason (a) is the one to keep

(a) **Beside it defeats tripwire 3.** A-4's guard reads writes to the expression `state()`
returns; a second field written by `store.ts` sits outside that expression, so the sensor
for "the store computes state itself" would be **silent over exactly the code this task
adds.** Routing around the guard was forbidden and would have been the practical effect.
(b) Beside it reproduces what A-1 refused — two independent numbers for scene time with
nothing tying them. In `UiState` they are one number with two names, and the equality is
asserted over the whole compiler-total `Action` table, not over the three arms that touch
time. (c) §3.4 / criterion 21 want one source of truth; a second field is a second store.

Tripwire 1 fired → `transport` classified **unprojected**: `anchorMs` is a reading of this
machine's clock, `playing` would make a shared scene start moving on arrival, and its
scene-time half IS the already-excluded scrub position, so projecting it would smuggle
`time` in by the side door. **Vacuity floor moved again, and C-2 said where** — the
agreement half is now a tautology (`reduce` → `seek` → `snapTime`, C-1's Plant-C shape);
the floor is the clamp half, compared against an index derived from
`frameTimesOf(scene).length` rather than against its twin.

### My FIFTH instruction defect — a second internal conflict, again named not resolved

§2 scoped `site/hashprojection.test.ts` do-not-touch, with the exception written only for
the partition (which lives in `hashprojection.ts`). But my own tripwire 2 said a new
`Action` member reddens a site in `hashprojection.test.ts` — and it does: `:144` holds a
second `{[K in Action['type']]: …}` mapped table, three rows TS2741-forced. **The two
instructions cannot both be obeyed.** C-2 edited minimally (three sample rows, one docblock
sentence my change made false), added no test, removed none, changed no assertion.
**Needs ratification.**

### A stale number I relayed — §9's own row, committed by me

I wrote "`site/transport.ts` (274)". It is **318** at `bf5eb1a`. Straight from S-1's survey,
taken at `c4f4b7f`, before this phase committed. §9: *"a count from the survey is still the
count — not if your own phase has been committing."* Harmless here; the shape is not.
Also now stale and recorded so the next brief does not carry it: **`controls.ts` no longer
aliases `snap = snapTime`** — C-2 removed the dead alias, record pointed at snapTime's own
docblock.

### C-2's carried defects — these must reach cluster F/G

1. **The clock-free scrub arms are a wart during playback.** `{type:'time'}` and
   `{type:'frame'}` carry no `nowMs` and one could not be added without changing eleven
   action shapes `main.ts` consumes. **Paused — the scrubber's real case — it is exact and
   asserted for five wildly separated clocks. Playing, the playhead resumes advanced by the
   interval already elapsed since the old anchor, so a drag issuing many `time` actions
   during playback compounds.** Documented at the arm. The fix is to give `time`/`frame` a
   `nowMs`, which is a `main.ts` edit — **cluster F/G's, and it is not currently budgeted.**
2. **C-1's unratified escalation is upstream of C-2.** If tier 0 restores the wrap, C-2's
   clamp assertions redden and the `seek`/`time` unification in `reduce` must be rethought.
3. `toggle` has no store action — three actions match criterion 1's named primitive exactly;
   a fourth that only picks between two others would tax every consumer of the union. One
   arm if P6 wants it.
4. `currentTime` is a free function in `controls.ts`, not a method on `SceneStore`, keeping
   `store.ts`'s "it decides nothing" property. Three-line change if read otherwise.
5. **The clock sensor's name list is hand-written** (`Date`, `performance`, four schedulers,
   `process`). §9 dislikes the shape; C-2 could not derive it from anything. Paired control,
   zero hits across the 21-file closure, but a novel clock spelling passes it.

## The eight tasks, defined and COMMITTED at `62696ae` (243-line body)

Verbatim copy of the commit body. **Cite the commit, never this file** — the commit
survives the session and this does not. If the two ever disagree, the commit wins.

```
docs(p3b): the eight unwritten tasks, defined before the context holding them dies

PM-SHELL-P3b-2 adopted seven tasks in a message and wrote them into no document.
That is orchestrator error 15 committed one tier down: the names appeared in a
report, the definitions existed only in a PM's context, and the ledger that held
even the names is session-scoped and untracked. Tier 0 declined to reconstruct
them, on the strength of having tried exactly that once before — nine criteria
rebuilt from its own rulings, five rows defective and one criterion deleted
outright, with the result internally consistent and quote-diff clean. A cure for
an absence that produced a better-hidden absence.

So the definitions are here, in the durable record, where a successor can read
them without this session. Criterion 23 is added by tier 0 out of C-2's
carry-forward and is defined alongside them.

Each entry gives: the criterion it serves, the files it expects to touch, its
acceptance criterion, and what would make it refusable. The last field is not
decoration. Worker pushback on this build stands at nineteen for nineteen, five
of those against this PM's own briefs, and a PM cannot check its own acceptance
criteria against the code.

NOTHING BELOW IS APPROVED. Tier 0 has not ruled on any of it.


D-0 — narrow dist.test.ts's @napi-rs grep

  Serves    No numbered criterion. It is ESC-9 remediation and a hard
            prerequisite: cluster F cannot be green until it lands. P3b owns
            the file by that ruling.
  Files     site/dist.test.ts
  Why       SPIKE-1 measured the check to be a raw `text.includes` over built
            files, so it reddens on a DOC STRING in controlspec.ts containing
            "@napi-rs". Not a purity defect — the first real consumer of that
            registry turns the suite red for a comment.
  Accept    (1) A doc string or comment containing "@napi-rs" in a bundled
                module does not redden the check.
            (2) A real @napi-rs import or runtime reference reaching a browser
                bundle still does — shown with a planted needle CONFIRMED
                PRESENT IN THE BUILT ARTIFACT BY GREP BEFORE THE CHECK IS READ.
                A survey's first plant was constant-folded away by Rollup and
                the check reported green over a bundle the needle never reached.
            (3) The "I could not read or parse the artifact" path and the
                "a real regression is present" path are DISTINGUISHABLE
                ASSERTIONS with distinguishable messages. They are currently one
                assertion, which is the same defect that made four CI failures
                indistinguishable from a broken parser for nine hours.
  Refusable If clauses (1) and (2) cannot both hold — if no available instrument
            separates a doc string from a real reference in built output — then
            narrowing weakens the check and the task is an escalation, not a fix.

T-1 — close npm run typecheck's fail-open on Svelte warnings

  Serves    ESC-8 part 3. No numbered criterion; it is gate integrity, and it
            is what makes cluster F's warnings visible at all.
  Files     package.json (the typecheck script). Possibly a new sensor.
  Why       SPIKE-1 measured 8 x state_referenced_locally — Svelte saying the
            panel will never re-render — with the gate exiting 0.
  Accept    (1) The repo-wide Svelte warning count is MEASURED AND REPORTED
                FIRST, before any change. Closing the gate may redden existing
                code and that count is the decision input.
            (2) After the change, a planted Svelte warning makes
                `npm run typecheck` exit non-zero.
            (3) --output IS NOT TOUCHED.
  Forbidden Do not pin the format in the root typecheck script. The harnesses
            APPEND `--output machine` to the script's tokens, so a root pin
            yields a DUPLICATED flag; `mri` collects a repeated flag into an
            array, `outputFormats.includes([...])` is false, and the format
            SILENTLY REVERTS TO HUMAN — which is the nine-hour CI failure,
            restored by the change intended to prevent it.
            Do not modify site/typecheck-gate.test.ts. It was measured robust
            under all four formats svelte-check can choose, no RED is available
            for it, and invariant 1 therefore forbids changing it.
  Refusable If the measured warning count is large enough that closing the gate
            reddens code T-1 is not authorised to fix, it reports the count and
            escalates. Suppressing warnings to reach green is the one outcome
            that fails this task.

H-1 — the writable write path (criterion 22, first clause)

  Serves    Criterion 22: every CONTROLS entry is writable, not merely
            reachable. PREREQUISITE FOR CLUSTER F, because the Action union is
            the store's API and P4, P5 and P6 all build on it.
  Files     site/controls.ts (Action and reduce), site/controls.test.ts,
            possibly site/controlspec.ts.
  Why       SPIKE-1 measured 17 of 63 controls with a keyed Action and 46
            without — every layer.*.at / .depth / .name, all layer.shape.*, all
            image|gif.src|mode|mask, and all 11 preset.*. Their only write path
            is rebuilding the whole scene, which store.ts's header says the
            store must not own. Criterion 6 is MET and structurally cannot see
            this: it proves a spec is REACHABLE, not that a value is WRITABLE.
  Accept    Every CONTROLS entry has a write path through the store's Action
            union that does not require rebuilding the scene, AND the write path
            preserves field types.
  Hazard    The second half is not decoration and it is the whole risk. SPIKE-1
            measured that a computed string key ERASES THE FIELD TYPE:
            {type:'stereo', patch:{[key]: Number(raw)}} compiles clean where the
            literal form errors, so a generic renderer can write a number into a
            boolean or an enum with nothing to stop it. SPIKE-1's own code had
            the bug and compiled. A path-addressed action that reintroduces that
            hole satisfies the first clause and FAILS the criterion.
  Also      Action has 14 members after C-2 (11 + play/pause/seek). Adding
            variants reddens three instruments by design: a sample table in
            store.test.ts, a parser cross-check reading the union out of
            controls.ts, and a mapped table at hashprojection.test.ts:144.
            Classify, never suppress. A-4's duplication guard forbids
            constructing state outside reduce's answer.
  Refusable NOBODY HAS MEASURED A SOLUTION. SPIKE-1 measured the
            counter-example only. This is the highest-risk item in the phase and
            H-1 is explicitly permitted to return "this shape cannot be typed in
            TypeScript", with the options and their costs, instead of a design.
            That is a successful outcome, not a failure.

H-2 — the criterion-22 sensor (second clause)

  Serves    Criterion 22. Depends on H-1.
  Files     A test file; possibly a new harness.
  Accept    (1) A sweep DERIVED FROM CONTROL_IDS — never a hand-written list —
                asserting every entry is writable. Cite the length of the thing,
                never a total someone wrote down: a survey paragraph once gave a
                control population of 64 using two arity conventions at once,
                where the answer is 63 under one and 68 under the other, and
                pinning 64 would have produced a wrong registry that was green.
            (2) A wrong-typed write FAILS TO COMPILE, demonstrated by a plant.
            (3) A vacuity floor: the sweep is shown to redden when an entry is
                made unwritable.
  Harness   Clause (2) is the exact shape the three existing registration
            harnesses implement — plant, run svelte-check, parse — so H-2
            PROBABLY NEEDS A FOURTH, against the standing assessment that no
            P3b task does. That assessment is hereby withdrawn for H-2
            specifically. A fourth must be cleared with the PM, wall-clock
            re-measured before it lands, and it must strip CLAUDECODE from the
            child environment, pin --output machine, reject rather than throw
            from any callback, and keep its parse-failure and
            criterion-not-met paths as distinguishable assertions.
  Refusable If H-1 returns that the type-level half is not expressible, clause
            (2) has no subject and H-2 must be restated or cut.

F-0a — fund the minimal jsdom tier

  Serves    ESC-8 part 2. Unblocks cluster F's only untestable residue.
  Files     package.json, the vitest config, a new test file.
  Why       SPIKE-1 measured that no DOM tier exists (jsdom and happy-dom
            absent, mount() unrunnable by any test); that $effect is STRIPPED
            from SSR output; that render() is LAZY, so a side-effect assertion
            after it measures nothing and reports green; and that
            $state(store.state()) FORKS STATE IN THE BROWSER, breaking the
            store's identity guarantee, WHILE SSR REPORTS THE SAME ANSWER FOR
            THE CORRECT AND THE INCORRECT SPELLING. That last one is the worst
            kind: the tier does not merely miss the bug, it cannot distinguish
            the two cases.
  Accept    mount() runs in a test, and the store-identity guarantee is
            asserted: a component bound to the store writes THROUGH to the
            store rather than to a fork. The test must be shown to DISTINGUISH
            the correct spelling from the incorrect one — that is the entire
            point, and it is the thing SSR cannot do.
  Standing  A Svelte component is a thin binding and holds no logic that could
            fail a test. Everything testable lives in a plain module. This tier
            exists only for the residue that rule cannot cover.
  Refusable IF mount() CANNOT BE MADE TO RUN, THAT IS AN ESCALATION, NOT A
            WORKAROUND. Ruled explicitly. Playwright is deliberately not funded
            here; revisit for P4, where pixels are the subject.

F-0b — explicit input for vite.site.config.ts

  Serves    ESC-11. Decouples cluster F from criterion 10 rather than
            sequencing them.
  Files     vite.site.config.ts, plus a sensor.
  Why       The config has root:'site' and no explicit input, so site/index.html
            is THE ONLY PATH INTO THE BUNDLE — and it is the file teardown
            deletes. THIS EDIT BELONGS TO F, NOT G. G-3 may not delete
            site/index.html until it has landed. An ordering constraint that
            exists in no document is how a phase discovers it the hard way.
  Accept    npm run build:site exits 0 with an explicitly declared input, and a
            sensor exists for the entry being explicit — a note is not a sensor.
  UNSETTLED THE SENSOR SHAPE IS NOT RECONSTRUCTED AND I WILL NOT INVENT ONE.
            The honest test — the build still succeeds with site/index.html
            absent — cannot be run before teardown without deleting the file.
            A test asserting the config declares build.rollupOptions.input is
            checkable but weak. The worker proposes the sensor and the PM
            ratifies it; do not treat either option above as chosen.
  Refusable If an explicit input cannot be given without changing output
            filenames or asset paths, that changes WHAT GETS BUILT rather than
            how, and it is Shaun's call, not the worker's and not the PM's.

G-5 — criterion 15's second clause: the editor's URL actually coalesces

  Serves    Criterion 15, second clause. Depends on F-2 (the composition root).
  Files     The composition root, plus a test.
  Why       Criterion 15 is MET AT THE MODULE and verified there. "The editor's
            URL coalesces" is UNWITNESSED until the composition root exists, and
            THE CHOICE OF QUEUE IS CLUSTER F/G'S TO GET WRONG. Today there is
            neither a criterion nor a sensor on that side, which the standing
            "a gap ships only with a sensor" rule forbids.
  Accept    A sensor that the composition root passes a MICROTASK scheduler —
            not a macrotask, not a synchronous one — to attachHashProjection,
            and that a gesture producing N mutations in one tick produces one
            URL write through the real browser adapter.
  Hazard    A-3 measured that A FAKE SCHEDULER IS IDENTICAL FOR queueMicrotask
            AND setTimeout and therefore cannot see which queue the projector
            landed on. The sensor must bracket from both sides: nothing written
            before the first await rules out a synchronous flush, and everything
            written after it rules out any macrotask. A-3's own test does this
            at the module; G-5 does it at the root.
  Refusable Cannot start before F-2 exists. If F-2 ships without a composition
            root that owns the scheduler choice, G-5 has no subject and that is
            a finding about F-2.

G-6 — criterion 23: time and frame carry no clock (ADDED BY TIER 0)

  Serves    Criterion 23, created by tier 0 from C-2's carry-forward, because
            "no criterion covers it" was the problem and a note is not a sensor.
  Files     site/controls.ts, site/controls.test.ts, and main.ts or whatever
            composition root replaces it.
  Why       C-2 measured it and documented it at the arm. {type:'time'} and
            {type:'frame'} carry no nowMs, and C-2 could not add one without
            changing eleven action shapes that main.ts — out of its scope —
            consumes. PAUSED, which is the scrubber's real case, the behaviour
            is exact and C-2 asserts it for five wildly separated clocks.
            PLAYING, the playhead resumes advanced by the interval already
            elapsed since the old anchor, so a drag issuing many time actions
            during playback COMPOUNDS.
  Accept    During playback, N successive time or frame actions leave the
            playhead where the last one put it, not advanced by accumulated
            intervals. Asserted CLOCK-FREE, by injection, on
            transportdriver.ts's precedent: nothing reads a clock or creates a
            timer, so a whole playback session is expressible as a sequence of
            values in a test, in plain node.
  Refusable The fix is to give time and frame a nowMs, which is a main.ts edit.
            If the eleven action shapes cannot be changed before teardown
            removes main.ts, G-6 SEQUENCES AFTER G-3 rather than being
            independent — and the worker should say so rather than editing a
            file the phase is about to delete.


ORDERING AND DEPENDENCIES

  Independent, dispatchable in any order:   D-0, T-1, H-1
  H-2 after H-1.  F-0a and F-0b before F-2.  D-0 before F-2 can be green.
  T-1 before F so F's warnings are visible.  G-5 after F-2.
  G-6 after G-3 if it proves to need main.ts gone first.
  F-2 is blocked on H-1, H-2, F-0a, F-0b and D-0 — five prerequisites, and
  cluster F is the first thing in this project that renders.

VERIFICATION OWED, unassigned: A-4, C-1, C-2. V-A covered A-1, A-2 and A-3 only.

This is an empty commit. It changes no file; the message is the artifact.
```

---

# Shift 3 — PM-SHELL-P3b-3

## Handover verified by command, not inherited (§1.2c)

- `62696ae` read first, in full. Its 243-line body is the authority on the eight tasks;
  the scratchpad copy at the end of this file is a convenience and loses if they differ.
- `69abca9` ancestor of HEAD ✓. `main` was `ba433a0`, two commits ahead (docs-only:
  `legibility-findings`, `editor-execution-plan`, `orchestrator-handover`).
  **Merged clean → HEAD `febb020`**, no conflict, signed by the wrapper.
- Worktrees: `-main` ba433a0, `-p1p7` b3e7601 (**PM-SHARED-4 live**), `-p2` 9312529.
  Untouched by me.
- Predecessors' six feature shas all resolve: `cf4b119` `7cb2704` `92e8b43` `ceaa3b0`
  `bf5eb1a` `760f353`.

## Baseline

**82 files / 1948 passed / 0 skipped, four exit codes 0 — at `760f353`, local only, and
CI has never seen this branch.** That figure predates the `main` merge, so **the
post-merge baseline at `febb020` is UNMEASURED**; §9's *"a test that pins prose is stable
— not if the prose churns"* applies, and the merge moved three `docs/` files. Both live
workers were told to establish it as a first act. Error 24 stands: four local exit codes
are not the gate, `ready-to-merge` needs a green CI run on the pushed branch.

## Criteria status at `febb020`

| # | Criterion | Status |
|---|---|---|
| 7 | Mark-based undo, one entry per interaction | not-started (B) |
| 8 | Store; hash as projection | **DONE** `cf4b119` `7cb2704` `92e8b43`, verified by V-A |
| 9 | Scene time over P2's transport | **DONE** `bf5eb1a` `760f353` — **UNVERIFIED, V-BC live** |
| 10 | Teardown + disposition table (review criterion) | not-started (G) |
| 11 | R2/R8 architecture test | not-started (E) |
| 14 | `dist.test.ts` has teeth | partly discharged pre-phase; D-0/D-1/D-2 remain |
| 15 | Coalescing — module half | **DONE** `ceaa3b0`, verified by V-A |
| 15b | Coalescing — composition root | not-started (G-5, after F-2) |
| 16 | Nothing above the canvas in flow | not-started (F) |
| 21 | No module-level mutable scene state outside the store | not-started (G) |
| 22 | Every `CONTROLS` entry writable; wrong-typed write fails to compile | **in progress — H-1 live** |
| 23 | Playhead does not drift when playback resumes | not-started (G-6) |

**Zero test removals across the entire phase.** Only `site/markup.test.ts` is
pre-authorised. Keep it that way.

## Shift 3, dispatch 1 — V-BC and H-1, in parallel

**V-BC** (verifier, cluster BC) closes §6.1's hole: A-4, C-1 and C-2 have never been
verified by anyone. V-A covered A-1/A-2/A-3 only. Nine named checks beyond standard duty;
the one I expect most from is #2 — **re-establishing that the clamp arm really is
criterion 9's vacuity floor**, since the agreement sweep became a tautology the moment
`seek` started calling `snapTime`, and both C-1 and C-2 said so themselves. If the clamp
arm can also be made tautological, criterion 9 has no floor, which would be the most
important finding available this shift. #7 is A-4's own one-sided vacuity (suppression
planted only into a *synthetic* module, never the real `store.ts`); #9 asks whether C-2's
load-bearing reason for putting `TransportState` inside `UiState` — that A-4's guard would
have been silent over a field beside it — is actually true.

**H-1** (implementer) is the critical path and is **explicitly permitted to fail**.
Briefed that *"this shape cannot be typed in TypeScript", with options and costs, is a
successful outcome that ends the task* — SPIKE-1 measured the counter-example and nobody
has measured a solution, so briefing it as though one exists would be manufacturing a
premise. Also told not to carry `17 of 63`: §9's arity-convention row, cite
`CONTROL_IDS.length` and measure the split itself.

### A conflict I resolved structurally rather than escalating, and it should be checked

Tier 0 told me to run V-BC and H-1 **in parallel**. My predecessor recorded a standing
constraint that **no implementer may run concurrently with a verifier in this worktree**,
because a verifier stashes production code — and the collision here is real, not
theoretical: V-BC must mutate `site/controls.ts` to verify C-2 and H-1 edits the same file.

Resolution: **V-BC runs in its own isolated git worktree at the same commit**, H-1 owns
the primary one. Both instructions are honoured and neither is overridden. The residual
risk is **unmeasured and I said so in the brief**: a fresh worktree has no `node_modules`,
and V-BC was told to try symlink → hardlink copy → `npm ci`, to touch neither the primary
tree nor `package-lock.json`, and to **stop and report rather than fall back into the
primary worktree** if none of them works. If that proves unworkable the honest answer is
to serialise, and I would rather learn that from a measurement than assume it.

Also told both: concurrent **full suites** are the measured amplifier of the timeout
flakes (not load average — a deliberate 14-process CPU burst never broke 5s), so a
timeout-shaped red gets re-run alone before it is reported.

### Boilerplate updated this shift

- Pushback count 12 → **19 for 19**, plus the note that two verifier-proposed designs were
  corrected by their implementers.
- New §0 "Shift 3 state" block: HEAD, the authority commit, the unmeasured post-merge
  baseline, and **the two stale facts** — `transport.ts` is **318** not 274, and
  `controls.ts` **no longer aliases `snap = snapTime`**.
- **The "no P3b task needs a `svelte-check` harness" rule is withdrawn for H-2
  specifically**, with the four mandatory conditions written out (strip `CLAUDECODE`, pin
  `--output machine` on its own spawn and never in the root script, `reject` never `throw`
  from a callback, parse-failure and criterion-not-met as distinguishable assertions) plus
  a wall-clock measurement before it lands. Green CI is 94s and that is the budget.
- New **§7, "If you are a verifier"** — the four rules, each paid for by somebody: rebuild
  inside every mutation; diff the measured values and not just pass/fail; never spawn a
  child with `{...process.env}`; a plant is inadmissible until confirmed present in the
  built artifact.

## Not yet dispatched, and why

D-0 and T-1 are independent and ready, but both would land in the primary worktree that
H-1 owns, and T-1 changes the `typecheck` script **every other agent is measuring
against**. They queue behind H-1 rather than racing it.

**F-2's chain is longer than earlier reports implied: five prerequisites, H-1, H-2, F-0a,
F-0b and D-0.** Cluster F is the first thing in this project that renders. H-1 → H-2 → F-2
is the critical path and H-2 cannot be written until H-1's answer is known.

## V-BC DONE — criterion 9 verified for the first time. Nothing committed, both trees clean.

**Criterion 8 `MET WITH FINDINGS` · criterion 9 first half `MET` · criterion 9 second half
`MET WITH FINDINGS`.** RED re-established individually for all three tasks, every plant
into the **real** modules, every one grep-confirmed present and built before any verdict
was read. **Baseline established post-merge at `febb020`: 82 files / 1948 passed /
0 skipped, build 0, build:site 0, typecheck 0 (0 errors 0 warnings)** — identical to the
pre-merge figure; the merge is docs-only and moved nothing.

### FINDING B1 — the skip instrument is blind, and this phase has been citing it for two shifts

`grep -c '↓'` returned **0** on a genuine 22-skipped run. The working instrument is
`grep -c 'skipped'`: **0** at baseline, **4** on that run. A complete §6.5a pair.
**Every "0 skipped verified positively by `↓`" claim on this phase verified nothing** —
including V-A's, which I relayed into this ledger and into three briefs. Note the nuance:
V-A *did* notice its 22-skipped run, but by the summary line, not by the instrument it
credited. Instance nine of *a check that cannot see reports fine*, committed **by the
boilerplate that warns about it**. Boilerplate corrected; H-1 messaged mid-task.

### FINDING A1 — A-4's guard has a hole, and `store.test.ts:277`'s "fails closed" is FALSE

Both halves must be evaded at once, and they can be. `undelegated` keys on the
*declaration* of the name written to storage, so a **reassignment** defeats it; `tagsNamed`
keys on a value-position tag literal, so a **tag-free selection** defeats it. V-BC planted
an independent `depthView` arm using both at once into the real `site/store.ts`:
**build 0, build:site 0, test 0 (82/1948/0), typecheck 0 (env stripped) — entirely
invisible.** That is an unambiguous second implementation of a reducer arm, which is the
exact defect the guard exists for. The docblock's claim that the file-wide looseness
*"fails closed"* is true for a second **declaration** and **fails open** for a
reassignment. A false assertion in a comment, §9's own taxonomy. → **A-5.**

V-BC proposed a fix (disqualify any name assigned from a non-`reduce` expression) and
tested it green on the pristine module and red on the plant — **labelled a proposal**,
citing that two verifier-proposed designs on this phase were corrected by their
implementers. Treat it as evidence the hole is closable, not as the design.

### Criterion 9, first half (C-1) — MET, and the vacuity floor is in a different test

Plant C re-derived from description, not copied: agreement arm green, clamp arm red —
as C-1 predicted. V-BC then pushed **further than C-1 did**, and this is the part to keep:

- **Plant E** replaced `snapTime`'s entire body with a constant. 14 tests reddened and
  **the agreement arm was not one of them.** It survives the most extreme possible mutation
  of the function it checks — **zero discriminating power.**
- **Plant F** pushed `lastFrameTime` past every swept sample, making the clamp branch
  unreachable. Both arms then pass **✓ vacuously** — but `samples the region where the two
  rules actually part` reddens.

**So criterion 9 has a floor, but it lives in a different test from the arm it floors.**
The clamp test carries no in-test floor of its own. Weaken or delete `samples the region…`
and the clamp arm can silently stop asserting at the top end with nothing to say so.
Sound today; recorded because nobody would find it twice.

Check 3 confirmed independently by re-deriving `sweptTimes` and computing where the
superseded and shipped rules name different frames: **19–29 samples per grid land in the
disagreeing region** across five grids, including 1.958333…1.999999 inside 12fps/2s's
final gap. Not a table that happened to pass. Check 4's four clauses all verified: net test
change **−1/+5 = +4**, zero removals; the superseded rule is preserved as **executable
assertions**, not merely a docblock, which is stronger than ratified; `##`→`###` is a
single `-`/`+` pair in an otherwise context-only hunk; `bf5eb1a` touches exactly two files.

### Criterion 9, second half (C-2) — MET WITH FINDINGS

**Check 9: C-2's load-bearing design reason is TRUE and is now measured.** V-BC planted the
counterfactual C-2 rejected — `transport` as a second field on `self`, written in
`dispatch` with an independently-computed arm: **82/1948/0, exit 0, A-4's guard completely
silent**, because `storage` derives from what `state()` returns and the write targets
`self.transport`. Had `TransportState` gone beside `UiState`, the duplication guard would
have been blind over exactly the code C-2 added. The phase's most transferable finding
holds.

**§7's paused claim confirmed and shown to be load-bearing**: under a stray-clock plant the
five-clock assertion fails at `nowMs=86400000` **only** — the four smaller clocks all pass.
A one-clock test would have shipped it green.

**FINDING C1 — the clock sensor's hole is not the one that was reported, and extending the
roster will not close it.** `Date` *is* on the list; `globalThis.Date.now()` makes it
`parent.name` of a PropertyAccessExpression, which `globalsIn` deliberately skips — and
that same suppression is what stops false positives on `present.ts`'s `location` parameter.
**Any listed global is evadable this way.** `Promise.resolve().then(f)` also passes.
Positive control on the same line fires. So the known weakness recorded by C-2 was
correctly flagged but **wrongly diagnosed**: it is not the hand-written-list shape, it is
member-name suppression, and the two have different cures.

**FINDING C2 — the one test total over the vocabulary cannot distinguish a refusal from a
crash.** `holds one scene time and not two…` wraps `dispatch` in `try/catch {}` to tolerate
legitimately-refused actions and increments `examined` *after* the catch. V-BC made
`withTransport` throw on **every** transition — the most total reducer failure possible —
and **the test passes**: 20 samples asserted against 20 copies of the untouched initial
state, with a vacuity floor counting attempts rather than commits. 13 sibling tests do
catch it, so the criterion is not unguarded overall, but the one sensor that is total over
the vocabulary is the one that cannot see. → **C-3**, proposal (V-BC's, labelled): floor
committed transitions separately from attempts.

### Two instruction defects of mine, both caught below me

1. **My worktree brief was wrong.** I asserted the isolated worktree would be at `febb020`
   on this branch. **It was cut from `main`**; `62696ae` was not an ancestor. V-BC checked
   rather than trusted, and reset onto the right commit inside its own throwaway branch.
   Had it trusted me it would have verified the wrong tree and reported confidently.
2. **My first-choice `node_modules` instruction was unsafe and V-BC refused it, correctly.**
   I told it to try symlinking from the primary worktree first.
   `node_modules/.vite/vitest/results.json` is rewritten by every `npm test`, so that would
   have put a verifier's writes inside a live implementer's tree — the exact collision the
   isolated worktree existed to prevent, reintroduced by the instruction meant to enable it.
   It used `cp -al`, broke the hardlinks on the write-prone directories, verified separate
   inodes, and proved afterwards by inode and mtime that the primary was never written to.

Both are in the boilerplate now. **That is twenty-one for twenty-one on worker pushback.**

### Carried, for tier 0

- **`npm run build` does not typecheck `site/`.** A planted `ReferenceError` in
  `site/controls.ts` left `tsc -p tsconfig.json` at exit **0**; only `npm run typecheck`
  covers `site/`. **Every "build 0" recorded on this phase says nothing about `site/`
  types.** Adjacent to T-1 and arguably enlarges it.
- `92e8b43` touches `site/hashprojection.ts` (one word), disclosed at length in its own
  commit message — a technical invariant-8 deviation, correct and declared.
- `withTransport` is described as the single write site for `time`; there are **two**
  (`controls.ts:258` `initialState`, `:310` `withTransport`), both taking
  `transport.anchorTime`. Construction is out of scope so the invariant holds; the phrase
  is one site optimistic.
- Criterion 23 is documented at the arm but is **a note, not a sensor** — which §6 forbids.
  That obligation transfers to G-6.
- V-BC measured vitest's skip reporting on **one** reporter configuration only.

## H-1b DONE — `24392c3`. Criterion 22's work adopted with RED attributed. HEAD now `c0a6b36`.

Content byte-identical to `b27a315` (`git diff b27a315 HEAD` empty); salvage branch **not**
merged, content brought across. **82 files / 1955 passed / 0 skipped**, +7 over baseline,
zero removals, typecheck 0 both with and without `CLAUDECODE` stripped. `main` merged
(`ec900f0`, docs-only) → `3169a6b`; three queued briefs committed → `c0a6b36`.

**14 claims, each with a named mutation, grep-confirmed, quoted verdict.** One claim has
**no runtime RED by name**: `hashprojection.test.ts`'s mapped `SAMPLES` table — removing
the `set` row leaves vitest at 34 passed; only the compiler sees it. Recorded so nobody
assumes the suite covers it.

**The mechanism: the erasure is genuinely solved for the `set` path, not papered over.**
`SetAction` is a mapped type distributed over control id → the model's own field type, so
each member pairs one literal `control` with one concrete `value` type. Severing the
correlation (`value: ControlValues[K]` → `unknown`) turns **exactly six of eleven**
`@ts-expect-error` directives "unused" — the six value-type claims — while the five
structural ones still bite. That is the measurement proving the wall is neither inert nor
double-counted.

**But clause 2 is true of the `set` path and false of the `Action` union.** The legacy
keyed arms survive because `main.ts` consumes them, and `{type:'stereo', patch:{[key]:…}}`
still compiles clean **with no sensor on it**. Escalated. Clause 1 likewise: 52 of 63
writable, 11-entry preset residue derived and sensored by `unwritableControls()`.
Both rulings are in `c0a6b36`'s message.

### My error, caught by the worker, and it is a new shape

**I read the dead agent's last transcript line as the frontier of its work. It was not.**
H-1 had **already finished** the parser cross-check; "Now extend the parser cross-check…"
was written *before* doing it. H-1b added no code there — it verified by re-establishing
the RED and proving the extension fails closed three ways. The task *was* killed
mid-flight (no report, no commit), but the specific deliverable I named as unfinished was
done. **A self-instruction in a transcript is a statement of intent, not a record of
state**, and I inferred backwards from the last line without asking whether the work after
it existed. Twenty-two for twenty-two.

**Also corrected: V-BC's `hashprojection.test.ts:153` is wrong — the table is at `:144`**,
both at `febb020` and now. The brief's figure was right. V-BC's one measurable error, in a
report that was otherwise exact.

### H-1b's carried UNCERTAINs

1. `controls.test.ts`'s `expect(new Set(pairs.map(…)).size).toBe(17)` is **a self-count of
   a hand-written table**, not a measurement of the registry. A new `Action` variant is
   caught; an 18th control absorbed into an existing keyed arm is invisible. §9's
   hand-written-list shape, small. Candidate for R-1's scope.
2. **`'set'` is now an `Action` tag and a very short string**, and A-4's guard flags
   value-position string literals equal to any tag. `site/store.ts` holds no `'set'`
   literal today, so it is green on its merits — but the collision surface is far larger
   for `'set'` than for `'depthView'`. Bears directly on R-1.
3. RED is **reconstructed by mutation, not test-before-code** — the production half already
   existed. H-1b said so plainly rather than letting it read as original TDD.

## Shift 3 close — ownership, and one candidate task the successor must not lose

### Ownership ruling, 2026-10-16 — P1/P7 owns three `site/` files

**`site/legibility.ts`, `site/legibility.test.ts`, `site/project.test.ts` are P1/P7's.**
The first two are its criterion 5 subject (the `illegible` reword); the third is its
criterion 10 deliverable (the site reads a `.stst`). **No actual collision exists** — none
of the three is on P3b's teardown list, which is `main.ts`, `index.html`, and the
`controls` / `markup` / `present` / `scale` / `diagnostics` / `depthmap` / `stageguide`
tests. **If teardown turns out to need any of them, escalate rather than edit.** Both PMs
have been told, so neither discovers it at a merge.

### CANDIDATE TASK, not in scope this shift — `build:site` catches one builtin spelling of four

Measured by the other phase and recorded at `7fda4b0`. **`await import('node:fs')` on a
reachable path in `site/fonts.ts` exits 0 with a warning AND THE NEEDLE SHIPS**, emitting a
`__vite-browser-external-*.js` chunk. Note what that defeats: **it beats the
constant-folding trap too**, because the code genuinely is in the bundle — so the standard
"confirm the plant survived the build" control passes and the check still says nothing.

**The complement is the useful half.** Inside `src/shared/` the purity guard catches all
three import forms. **So the unguarded hole is `site/*.ts` — which is P3b's territory, and
`site/` is about to grow a great deal under cluster F.** The hole grows with it.

Deliberately **not added to this shift's scope** by tier 0, on the grounds that this PM was
at half context and handing over. **It is a real task and it belongs to whoever owns
`site/` when cluster F lands.** Sized like D-0: a sensor, not a redesign.

### Also new at `7fda4b0` and already relayed inline to both live workers

**`npm run build` does not clean `dist/`.** A stale planted file survived a rebuild and
gave **4 reds where a wiped rebuild gives 2** — and the spurious extra red read exactly
like a genuine finding. **Any worker planting into built output must `rm -rf dist
dist-site` first.** H-2 was additionally told this contaminates a cold-vs-warm wall-clock
comparison, which is the measurement its whole task may turn on, and that CI always builds
cold.

**`main` has moved to `7fda4b0` and this branch has NOT merged it** — deliberately, because
H-2 owns the primary worktree and merging would move the tree under a live worker. Both
new §9 rows were relayed inline instead (§1.2n: a brief carries the content of anything
added mid-phase, not a section number). **Merge `main` once H-2 and R-1 have landed.**

## R-1 DONE — all six closed. Branch `worktree-agent-a5e982cfa6bd027e8` @ `5f11f93`. NOT MERGED.

Based on `972dc02` (an ancestor of the current tip). Touches **three files**:
`site/store.test.ts` (+532/−40), `site/controls.test.ts` (+323/−8),
`docs/plans/2026-10-14-editor-execution-plan.md` (+25). **No production edit** — A-4's
constraint held. **1955 → 1959 passed, +4 tests, zero removals**, four exit codes 0,
typecheck 0 both with and without `CLAUDECODE`, skips by `grep -c 'skipped'` throughout.
`dist` wiped before the A1 null and the final gate, and R-1 stated per item where it did
not wipe and why — the six REDs are judged by source-reading sensors, never built output.

**DO NOT MERGE WHILE H-2 IS LIVE.** Merging moves `site/controls.test.ts` and
`site/store.test.ts` under a working implementer.

### C1 was fixable after all — V-BC's "may not be fixable" was wrong in the good direction

`globalThis.Date.now()` and `Promise.resolve().then(f)` both now redden; the positive
control still fires; the false positive the suppression exists for (`a.window`,
`{Date:1}.Date`) is asserted still suppressed. **The suppression was narrowed at its one
`globalThis` receiver rather than removed.** Two things fell out that nobody asked for:

1. **`Promise` is a genuine roster gap** — an inconsistency *inside* the roster's own
   intent, since `queueMicrotask` was already listed.
2. **Adding it exposed a latent false positive affecting EVERY entry.** `Promise` reddened
   the real closure at **nine sites, all nine type annotations** (`Promise<DecodedImage>`,
   `Map<string, Promise<…>>`) in `src/core/{canvaslike,raster,render}.ts`. **Type position
   is now ignored for both rosters.** R-1's framing is the keeper: *"that was always wrong
   and `Promise` is simply the first entry common enough in a type to expose it."*

### V-BC's A1 plant had gone STALE, and R-1 caught it

**The literal plant in my brief no longer typechecks at `24392c3`**: `SetAction` members
carry plain-`string` values (`layer.text.text`), so `typeof action.value === 'string'`
narrows to `string`, not `DepthView`. **The hole is real; the spelling moved.** R-1
re-derived a tag-free, type-correct version and confirmed invisibility on a wiped build.
New shape worth keeping: **a plant quoted in a brief is a measurement with an expiry date,
and the commit that expires it is one of your own.**

### R-1 went beyond both of V-BC's proposals, and argued why — three in a row now

- **A1: adopted `bind`-extension for the reassignment hole, then added a THIRD half**
  rather than widening `tagsNamed`, because `'set'` makes `tagsNamed` unmaintainable
  (§2a). `conditional` — *a write to storage must be reachable on every path through its
  own function*, no tag involved. Proof it is not a restatement: a **dormant**
  `if (Object.keys(action).length > 99) return` in the real `dispatch` — no tag literal,
  no behavioural divergence — reddens, and `conditional` is the only sensor in the suite
  that sees it.
- **C2: the floor is PER VARIANT, not one total.** A single total survives the same
  mutation as long as one arm anywhere still works. Measured every variant commits ≥1
  sample today, so the per-variant floor is satisfiable *and* total over the vocabulary.

**Three verifier-proposed designs in a row have now been corrected by the implementers
that built them.** That is the tier working, not a defect in verifiers.

### ⚠️ ESCALATION — R-1 edited a tier-0 document

`docs/plans/2026-10-14-editor-execution-plan.md`, +25 lines: a **dated correction block
under *Known weakness shipped knowingly*** that preserves C-2's original paragraph rather
than deleting it. R-1 flagged it itself and offered the revert. **Tier 0's file, tier 0's
call** — error 14 is a PM editing one of these rather than reporting it.
**My recommendation: keep it.** It matches §9's *correct beside the quote, never inside*,
and the substance is required — C-2's recorded rationale names the wrong mechanism and
would send the next reader to the wrong cure. **The code is independent of it**: the
in-code `CLOCKS` docblock carries the full version, so reverting the doc hunk loses
nothing operational. Decide before merging the branch.

### The worktree defect is SEVEN FOR SEVEN and is systematic, not bad luck

R-1's isolated worktree was **again cut from `main` (`d51a9f7`), not the phase branch**;
`69abca9` was an ancestor but **`62696ae` was not**. It reset to `972dc02` inside its own
branch. **This is now two for two on my own dispatches and seven for seven across the
project.** `isolation: worktree` does not cut from the current branch. **Any future
isolated-worktree brief must say so as a fact, not a caution.**

R-1 also declined my `cp -al` recipe for a better one: **full `cp -a` from
`staticstereo-main`**, not a hardlink copy from the primary — 129 MB is trivially cheap, a
full copy guarantees zero shared inodes instead of requiring the write-prone directories
to be enumerated correctly, and sourcing from `-main` avoids a torn copy out of a tree H-2
is running tests in. **Adopt that recipe; mine was the fragile one.**

### Merge sequencing — R-1 gave the collision map

`site/controls.test.ts` is the only file H-2 could also touch; as of R-1's report the
primary's copy was **unmodified at 853 lines**. R-1's hunks: an import at `:34`, the
`KEYED_ARM_COVERAGE` derivation at `:633`, one new `it` at `:846`, the `toBe(17)`
replacement at `:916`, and **the G-3 tripwire appended at `:1034`, after the clause-2
`describe`**. **That last one is the risk** — H-2's harness is most likely to land in
exactly that place. Both sides are pure additions touching none of the other's assertions,
so a textual conflict there is semantically trivial.

### R-1's carried UNCERTAINs

1. `conditional`'s `canExitBefore` is **positional, not control-flow** — any
   `return`/`throw` textually before the write in the same function marks it. Nothing in
   the real module has one; a future `dispatch` with early validation would. Fails
   **closed** (noisy, not silent), which is the right direction, but it will annoy someone.
2. The narrowed `tagsNamed` cannot see `const arm = action.type; if (arm === 'set')`.
   Argued acceptable because `conditional` covers it whenever it affects stored state —
   but a tag-laundered per-arm **side effect that writes nothing** is now invisible to all
   three halves.
3. `Promise` on `CLOCKS` is a judgement R-1 could not derive; defensible only because
   `queueMicrotask` was already listed. The type-position suppression is not in doubt.
4. The tripwire's compile half **asserts a line still compiles** — the inverse of every
   other compile-time claim in the repo, with no runtime failure mode and `typecheck` as
   its only witness. The runtime half exists because of this but covers a different
   retirement.
5. **Line pointers in the handover docs are stale by roughly 100 lines** after `24392c3`.
   My brief's `store.test.ts:277` was actually `:356`; R-1 found it by content. Assume the
   same of every other line number in these documents.

## H-2 DONE — `f8d931b`. Criterion 22's clause-2 sensor. Harness landed, budget measured not inherited.

New file `site/setrejection.test.ts`; **`site/controls.test.ts` untouched**, so R-1 merged
with zero conflict. **83 files / 1963 passed / 0 skipped**, +8, zero removals, four exit
codes 0, typecheck 0 both with and without `CLAUDECODE` (456 FILES).

### It refuted my cheaper-route suggestion by measurement — twenty-three for twenty-three

I told H-2 the existing `@ts-expect-error` wall might discharge clause 2 at a fraction of
the cost and invited an argument for it. **The argument goes the other way and it is one
table row.** A directive is **lexical** — it cannot be generated from
`WRITABLE_CONTROL_IDS` — so the wall is eleven rows over **eight** controls and the other
**44 have no clause-2 coverage at all**:

| mutation to `site/controls.ts` | the wall | the sweep |
|---|---|---|
| `value: ControlValues[K]` → `unknown` | red (exactly 6 of 11 unused) | red, 52 → 0 |
| → the whole value union | red (the same six) | red, 52 → 0 |
| **`SceneValues` → `unknown` (4 controls erased)** | **GREEN, typecheck exits 0** | red, 52 → 48, names all four |
| `layer.*.at` → `unknown` | **GREEN** | red, 52 → 48 |

**Row 3 is the whole argument: the exact erasure clause 2 forbids, and the gate is green.**
H-1b's six-of-eleven figure reproduced independently. **The wall was not duplicated; it
stays.** My suggestion was cheap and wrong, and it was refuted the only way it could be.

**The probe design, and the plausible wrong one beside it.**
`Exclude<AnyControlValue, ControlValues[K]>` collapses to `never` exactly when the
correlation breaks, so the sensor's failure mode *is* the criterion's. H-2's first attempt
used a `symbol` and **stays red under a correlation severed to the whole value union** —
i.e. it reports the criterion met over a type that has lost it. Recorded because it is the
design a reasonable person reaches for first.

### The CI budget was one sample of a varying quantity, and H-2 measured it instead

`gh api .../jobs` on the last green `ci`: whole job **93s**, of which `npm test` is **53s**,
typecheck 6s, both builds 4s, and **`apt-get install ffmpeg` 25s**. The last four `ci` runs
span **93–108s**. So the "94s budget" every brief on this phase has cited — mine included —
is **one sample of something that already varies by 15s**, and a quarter of it is apt.
The runner's `npm test` matches this host's **unconstrained** 53s, so the runner is not
CPU-starved relative to here.

**Wall-clock, alternated runs to cancel drift from the concurrent R-1 worktree:** before
49.96 / 52.10 / 53.00s; after 50.73 / 52.66 / 51.24 / 50.29s. **No measurable change.**
Summed test time rises 165s → 197s and wall-clock does not move — the critical path is
`bindingregistration.test.ts` at ~48s and the new file's ~27s runs inside its shadow
(9.6s alone; 27–29s in-suite, the difference being four `svelte-check` processes
contending). A 4-core proxy gives +8.1s median, which H-2 treats as an **upper bound, not
a prediction**, because this host sat at load 9–18 throughout.

### Instrument discipline worth copying

**One gate spawn, not two.** The accepting and rejecting sweeps are two generated files in
**one** tree, so no difference between the halves can be an artefact of two
differently-configured runs. And the **parse-failure path was measured, not asserted**:
forcing `--output human-verbose` made `runGate` reject in **10.4 seconds, not a timeout** —
the `reject`-never-`throw` condition demonstrated rather than claimed. The harness also
proves its own plant arrived: dropping the sentinel yields *"the gate never checked the
generated plant and the clean result below measures nothing."*

All four mandatory conditions discharged in code with reasons in the docblock, which also
states the scope is the `set` path only, names the tripwire as cover for the legacy hole,
and points at G-3.

### H-2's carried UNCERTAINs — two matter beyond this task

1. **A `beforeAll` rejection reports as "N skipped" plus a file failure.** Not fail-open
   (exit 1), but **a future red in any of the four harnesses will show a nonzero skip
   count** — and this phase has just finished teaching everyone to read skips as an alarm.
   Whoever runs the gate must not mistake one for the other.
2. **Both existing harnesses unescape machine messages with `replace(/\\(.)/g,'$1')`,
   which turns `\n` into a literal `n`** and welds a nested diagnostic's two lines
   together. H-2's maps escapes explicitly. **It did not touch theirs and did not audit
   whether either asserts across a line join** — so this is a *candidate* latent defect in
   two merged harnesses, unmeasured.
3. `typecheckCommand()` is duplicated from `fitregistration.test.ts` rather than extracted;
   extracting means editing two working harnesses on a task that did not authorise it.
4. The sweep proves rejection of an *unrelated* type, not of every *plausible* wrong value.
   The wall covers the plausible cases for eight controls. **Complementary; neither alone
   discharges the clause.**

## MERGED AND UNVERIFIED — the state a successor inherits

`5dffba3`. R-1's branch merged clean (no conflict — H-2 never touched
`site/controls.test.ts`), then `main` @ `7fda4b0` merged clean, the execution plan
auto-merging R-1's correction block against tier 0's new §9 rows.

**Three commits have never been run together: `24392c3`, `f8d931b`, `5f11f93`.** Expected
83 files / ~1967 if the deltas are additive, but **that is arithmetic, not a measurement**,
and §6.3 compares against the branch's own recorded baseline. **A gate run is owed**, by a
gate runner who implemented none of it, announced and serialised against P1/P7.

**Verification is owed on all three** — H-1b, H-2 and R-1 have been seen by nobody who did
not write them. That is §6.1's requirement and it is the largest outstanding debt on the
phase.
