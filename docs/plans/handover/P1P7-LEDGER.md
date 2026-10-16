# P1/P7 ledger — PM-SHARED-4 (fourth PM) — VERIFICATION TIER

**Everything below the `PM-SHARED-3` header is my predecessor's and is retained as
reference, not as fact.** Its handover section at the bottom is the one I acted on.

## Shift state

- `main` = **`ba433a0`**, confirmed by `git log --oneline -1 main`. Branch `feat/p1p7-shared`
  @ **`b3e7601`**, worktree clean, 13 implementation commits + 1 merge (`8f9a36f`).
- **All 26 shas named in the four cluster lists resolve in this repo**, checked in one
  command (§9: "a sha in the record resolves" — two on record elsewhere did not).
- `main`'s `docs/` extracted verbatim to
  `scratchpad/docs-main-ba433a0/docs/` — **every worker reads planning docs from there**,
  and is told to re-extract if `main` has moved. The predecessor's `docs-main/` snapshot is
  stale; do not use it.
- Worktrees live: `…/staticstereo` (P3b, PM-SHELL-P3b-3), `…-main`, `…-p1p7` (mine),
  `…-p2`. Verifiers get `…-v1`, `…-v3`, later `…-v2`, `…-v4`, detached at `b3e7601`.
- `node_modules` is **129 MB** — verifiers `cp -a` it rather than `npm ci`. Explicitly
  **not** `cp -al` and **not** a symlink: Vite writes into `node_modules/.vite` and a
  shared inode would corrupt the source tree.

## Decisions I made that a successor should not re-litigate

1. **Verifiers work at `b3e7601` with NO `main` merge.** Counts stay comparable to the
   recorded baseline 96/2110, and the "zero net test removals" instrument stays clean.
   `git merge main` is §6's own step 1 and belongs to the **gate runner**, later. Cost
   accepted: verifiers have the 20s `encode.test.ts` timeout rather than `main`'s 60s, so
   every brief carries the flake warning instead.
2. **Mutation matrices run as targeted `npx vitest run <file>`, not `npm test`.** The
   handover measured that a 14-process CPU burst pushed the heaviest test only to 4079 ms
   while **vitest's own worker fan-out inside a full run** is the real amplifier. One full
   `npm test` per cluster, at the end. This is what makes two concurrent clusters safe
   alongside a live P3b.
3. **The criteria split across the four clusters is exact and exhaustive, and each brief
   states the other side of its own boundary.** P1: V-1 has 1/2/3/5/7/8/9, V-2 has 4/6/10.
   P7: V-3 has 1/3/4 + criterion 2 over the *objective* functions, V-4 has criterion 2 over
   `legibilityOf`/`describeLegibility` + 5/6/7/8. Named this way because the recurring
   tier-0 failure across three correction passes was **always a dropped clause, never a
   wrong fact** — a gap between two clusters would be invisible to both.
4. **Verifiers make no commits and may not fix anything**, including in off-limits files.
   Detached worktrees so the branch ref cannot move under them.

## BLOCKED — the subagent pool is exhausted, 200 of 200

`Agent` now returns **"Subagent spawn limit reached (200 of 200 agents spawned)"**. V-4 and
V-2 **cannot be dispatched from this session**. V-1 was spawned before the limit and is
still running; it will return.

The harness's own advice is *"complete the remaining work directly with your tools"*. **I am
declining that**, and the refusal is the point: tier 1 may not read `src/` or `site/`, and a
PM that verifies its own phase's code is not a verifier — it is the confident-fiction
failure mode §1.2e-bis describes, with the one sensor removed. Two instructions conflict,
so per §1.2f I report the conflict rather than choose between them.

**Resolution is the orchestrator's:** raise `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION`, or
stand up a successor PM in a fresh session with V-2 and V-4 as its first two dispatches.
Both briefs are written and on disk, so a successor pays nothing to resume:
`scratchpad/BRIEF-V2.md`, `scratchpad/BRIEF-V4.md`, `scratchpad/VERIFIER-COMMON-BRIEF.md`.
**V-4's brief needs the addendum in the next section folded in before dispatch.**

## V-3 — RETURNED, all MET, and the baseline reproduces independently for the first time

96 files / 2110 passed / 0 skipped · typecheck 0 over 475 · build 0 · build:site 0 —
**matching the recorded baseline exactly.** Until now that row was PM-relayed and unverified
by anyone. Nine shas verified, every RED re-established individually, worktrees removed.

**Zero net test removals, measured with a controlled instrument.** `vitest list --json`
name-set diff, main 1882 vs branch 2110, control = a planted rename (detected). Four names
vanish, all four triaged: two renames, one the **plan-authorised** replacement of
`describeLegibility > offers widening sepNear as well as enlarging the text` (criterion 5
says that test will redden and that this is the test doing its job), and one —
`presets.golden > was not asked to regenerate its own expectation` — added by **`9312529`
on `main`, which is not an ancestor of `b3e7601`** (merge-base `69abca9`). A test the branch
has not merged yet, not one it removed. §6.4's itemisation is not engaged.

**Orchestrator error 23 is confirmed by independent re-measurement.** All 24 rows of
`be348d1`'s table reproduce exactly at seed 7 across 14 separations: `strip ≤ margin`
everywhere, `slack ≤ 1` everywhere, right margin exact everywhere, and the original
criterion's *"strip width equals the margin width"* **false at every odd separation and true
at every even one** — it would have shipped green.

### Six refutations, three of which are mine or the plan's

1. **`be348d1`'s "HEAD cannot see it" is true at pass/fail and NOT clean at the value
   level.** Two unasserted `[measured]` lines move under the mutation — `linked white
   fraction 0.5036 → 0.5042` and an odd-separation scale figure `0.8347 → 0.8344`. The
   conclusion survives; **"cannot see" should read "nothing asserts it"**. This is §6.5a's
   second half finding a real gap on this phase, which is exactly why it is in every brief.
   Corollary: *"nothing in this repo sweeps an odd separation"* is **true of
   `sirds.linked.test.ts` and false of the suite** — `site/scale.test.ts` uses `sepFar 111`.
2. **`6214ec5`'s subject line overstates it.** `perception.ts:1` imports `sepAt` from
   **`'../core/sirds.js'`**, not `'../core/index.js'`. Removing it from the public surface
   leaves `npm run build` at 0 and production untouched; only `index.test.ts`'s roster
   reddens. The agreement the commit claims to buy was already provided by the deep import.
3. **`cardboarding` is declared `graded` in the roster and `objective` in the module, and
   both ship.** `perceptionRoster.ts:189` says `['graded', …]`; `perception.ts:1175` says
   verbatim *"Objective and ungraded"*; `perception.cardboarding.test.ts:440` is a passing
   test **titled `reports quantities and no grade`**. If the roster is right, **criterion 2
   is violated.** V-3 reported rather than chose — correct. Its judgement, offered as
   judgement: the module is the stronger position (design §10.5 names a boolean, R22
   obligation 4 forbids inventing a severity).
4. **The `GRADING` table has no sensor in the objective direction, which is how (3) ships
   green.** Flipping `cardboarding` `graded → objective` reddens **nothing** (48/48 green);
   flipping `fusionComfort` the same way reddens **nothing** (9/9). The witness checks only
   *graded ⇒ returns a finite number*. The single artefact criterion 2's rescope rests on is
   **unguarded against mis-declaration in one direction.**
5. **My cluster split is not clean, and the split was my artefact.** Criterion 2's *sensor*
   is one table authored in V-4's commits that governs V-3's objective functions, and the
   live defect sits in V-3's half. Neither cluster can close it alone. **Criterion 2 is
   therefore reassigned to V-4 in full**, behaviour excepted (V-3 measured that and reported
   MET with discriminating mutations on all seven functions).
6. **Criterion 4's tightness bound is narrower than it reads** — my own second prediction,
   confirmed. `slack ≤ 1` holds only in the *matched* pairing `deadStrips(s)` vs
   `marginsFor(s)`. Against the plate as actually cut it is **55 against an all-depths dead
   strip of 46 — slack 9.** What it genuinely pins is the parity guard, not "the real
   plate's margins are within one column of the real dead strips", which is false by nine.
   The commit is honest about this; **the criterion as written reads wider than what is
   asserted** and that belongs in the gate report.

### MY ERROR, recorded in the convention imposed on every PM

**I classified `cardboarding` as *graded* in V-3's brief** — "the same rule you apply to
`fusionComfort` and `cardboarding`" — with **no measurement**. I inferred it from a ledger
sentence about `blurRelief` being "the one number a consumer would put on a scene-px axis".
That is a PM restating its own reasoning as fact, §1.2e-bis exactly, inside the brief whose
first paragraph tells the worker my criteria are the weakest thing I produce. V-3 reported
the conflict instead of complying. **It is also a provenance error (§1.2j): the content may
well be wrong, but what makes it costly is that it arrived wearing my authority.**

### Carried from V-3, open

- **Only `measureInk` and `describeLegibility` have a production caller** (`site/main.ts:595`,
  pre-existing, off-limits). The other six are reachable only from tests and the roster. A
  seam error — wrong unit, wrong argument order at a call site — stays undetectable until
  **P4 wires them**.
- **`reliefOf` and `describeLegibility` are the two weakest roster entries**, both declared
  `objective`. `reliefOf` returns a three-valued categorical, which is close to a grade;
  `describeLegibility` returns a verdict string with the numbers embedded as text, exempted
  "by nature". Flagged so nobody records them as checked. `describeLegibility` is V-4's.
- `be348d1`'s other two mutation rows (`plate.ts` `ceil → floor`, `ceil + 1`) were **not**
  independently re-verified; both are claimed to redden HEAD too, so neither is load-bearing
  for the addition's justification.
- **A new trap, worth a §9 row.** V-3's first attempt at `ded331c`'s decisive run patched via
  `eval` on a quoted string and **the shell expanded the `*` in `DEPTH_BLUR_RELIEF *
  stereo.noiseScale` into a directory listing.** Both patches silently failed and **both arms
  reported green** — a clean false null that would have "confirmed" the commit for the wrong
  reason. Caught only because an `IndentationError` printed above the green counts. **Apply
  mutations from patch files and confirm the file changed before running anything.**

## V-1 — RETURNED. Criteria 1, 2, 3, 5, 7, 8, 9 all MET.

96 files / 2110 passed / 0 skipped · typecheck 0 over 475 · build 0 · build:site 0.
**That is the second fully independent reproduction of the baseline**, by a different agent
in a different worktree — and these are two *measurements*, not two reports, so §9's
"two independent workers agreeing is one unverified report" does not apply.

**Zero net test removals, by a second and differently-built instrument** — TypeScript-parsed
title extraction at merge-base `69abca9` and at `b3e7601`, `LC_ALL=C`-sorted, `comm`-diffed
(§9: `comm` without `LC_ALL=C` fails open). **1796 → 2018 names, net +222, zero file
deletions on three-dot.** Control: a planted rename is reported in both directions. V-1 and
V-3 used different instruments and different coordinates and agree. **§6.4 is not engaged.**

Every RED re-established individually, every production mutation rebuilt (one declared
exception, justified: vitest resolves `./containerRead.js` to source, confirmed by marker
instrumentation without a rebuild).

### Seven refutations

1. **"`zip -q out.zip - < soup.txt` and `cat soup.txt | zip -q out.zip -` are byte-identical
   ZIP64" is FALSE.** Both 991 bytes with identical ZIP64 structure, but **sha256 differ** —
   exactly 2 bytes at offset 886–887, the central directory's **external-attributes** field:
   `0x81b40000` (`S_IFREG|0664`) redirected vs `0x11800000` (`S_IFIFO|0600`) piped. **`zip`
   records the inode type of stdin.** The *conclusion* it was offered for reproduces intact:
   ZIP64 here is a stdin-streaming effect, not seekability; only the stdout data-descriptor
   case is about seekability (`flags=0x0000` vs `0x0008`, confirmed).
2. **My hypothesis that criterion 5's "fixed compression level" went vacuous under the
   `method:'store'` ruling is REFUTED.** The level pin is live code over the still-public
   `'deflate'` branch with an in-repo caller, and a `level:1` mutation reddens it. The true,
   narrower statement is the one the file already makes in writing: the pin is no longer a
   proxy for criterion 7. **My second wrong prediction this shift.**
3. **`src/shared/purity.test.ts:505-507` is FALSE — two of its five named properties.** The
   comment claims containment fails loudly for, among others, a mis-pathed root and a moved
   `outDir`. Measured: `rootDir: "src/shared"` → **15/15 green**; `outDir: "dist2"` **with a
   successful build writing 13 files there** and `dist/shared` left stale → **15/15 green**,
   and **23/23** with `src/core/purity.test.ts` added, the very file the comment delegates
   freshness to. **Both guards then certify a `dist/` that `tsc` no longer writes.** §9's
   taxonomy: an **assertion**-class stale comment, which is the kind you fix.
4. **Criterion 7's guard does not test "by construction" — it tests "all-store for this
   fixture".** Planting `method: p.data.length > 100000 ? 'deflate' : 'store'` in
   `writeStst` — **a textbook content dependence, the exact class criterion 7 exists to
   remove** — leaves **26 files / 421 tests green**. Criterion 7 is MET by the code today
   (four unconditional `method:'store'` literals at `container.ts:349-354`); **nothing stops
   it rotting the way the criterion was written to prevent.**
5. **Criterion 1's "No dependency" has no sensor against a *declared* dependency.** `yaml`
   (a real `dependencies` entry) imported **and called** in `src/shared/zip.ts`: **26 files
   / 330 tests green.** The guard rejects undeclared packages and declared ones whose entry
   module reaches a builtin. **A pure-JS zip library added to `dependencies` would pass every
   sensor in the repo.** Criterion 1 is MET as built — `zip.ts` has zero imports — but it is
   met by fact, not by sensor.
6. **The third purity hop I predicted is LIVE, one package further out.**
   `src/shared/zzzUse.ts → src/core/zzzBridge.ts → src/core/testing/imports.ts → typescript`
   (a devDependency whose entry reaches builtins). **`src/core/purity.test.ts` has no closure
   assertion at all** — no `rosterVerdict`, no `compiledFiles`. Unbuilt tree: **24 passed |
   7 skipped, exit 0.** Built tree catches it via the `dist/core` walk — **which is exactly
   the build-dependent blindness `2e07de6` removed for `src/shared` and left standing for
   `src/core`.** `src/core/testing/` is excluded at `tsconfig.json:22`, the sibling of the
   line that motivated `rosterVerdict`. **Criterion 8 is scoped to `src/shared/` and is MET;
   this is the same defect next door, and it is a task, not a note.**
7. **The recorded `zipRead.test.ts` runtime does not reproduce** — claimed 298/273/338 ms,
   measured **551/561/460 ms** with the default reporter under concurrent load. Not a defect;
   **do not carry the number.** The structural half confirms: fixtures memoised in a
   `streamed` Map keyed per distinct invocation, built lazily inside `it()` bodies, and
   `zipRead.test.ts` contains **no `beforeAll`**.

### Hypotheses of mine that V-1 closed in the other direction

Both named in my brief as the likely third hop; **both closed**, not open:
`import * as fs from 'node:fs'` (namespace) → caught; `await import('node:fs')` (dynamic) →
caught. `src/core/testing/imports.ts` handles static, `import type`, `import()`, `require()`,
`import =` and `import('x').T`. And §9's `build:site` row is confirmed with a third row:
**the namespace form is also exit 0** — so the purity guard is the only sensor for **two** of
the three spellings, and it sees all three. Neither Vite config carries `onwarn` on this tree.

### Cross-cluster, routed to V-4

The third vanished title in `site/legibility.test.ts` —
`describeLegibility > offers widening sepNear as well as enlarging the text`, replaced by
`does not offer the budget as a second fix — the purchase does not exist` **plus** `still
tells the author the one thing that does help` — is a **semantic reversal of the advice, not
a title tidy.** It is plan-authorised (criterion 5 says that test will redden and that this
is the test doing its job), but **V-4 must verify the replacement asserts the right thing**,
not merely that something replaced it.

### Carried from V-1, open

- **Seven refusal paths in `zipRead.ts` are reached by no test**, measured by marker
  insertion over all 21 `src/shared` test files (250 tests), not by reading: deflate-stream
  failure · invalid-UTF-8 name · **CP437 name** (the known-open `:268` claim; the throw is at
  `:280`) · missing central signature · central-offset-not-a-local-header · split archive ·
  expanded-size-vs-declared mismatch. **Only the CP437 one was previously known.** Whether
  defensive dead branches need sensors is a ruling nobody has made.
- **Criterion 7 names two producers and only one exists.** No file under `site/` except
  `site/project.test.ts` imports `src/shared/container.js`, and **there is no site-side
  `.stst` writer at all.** "The CLI and the site produce identical bytes" is currently a
  statement about one producer and one test. Sits on V-2's boundary (criteria 6 and 10).
- `purity.test.ts`'s `reachedBuiltins` probe **reads a package's entry module only and is not
  transitive** — stated in its own docblock, not closed. With R6 that is the same shape twice.
- The `ae9f0c8` docblock's literal counts do not reproduce on a differently-built tree;
  direction and mechanism do. Commit drift, not an error.

## Now

- **V-1 and V-3 are COMPLETE.** Both worktrees removed, no commits, stashes empty.
- **V-2 and V-4 are BLOCKED on the spawn limit** — briefs written, addenda folded in.
- Nothing else can proceed from this session.

## Task list a successor inherits, in dependency order

1. **V-2** (`BRIEF-V2.md`) and **V-4** (`BRIEF-V4.md`, addendum already folded in — add
   V-1's cross-cluster item above). Two at a time is the cap; these two are the pair.
2. **Five findings that are tasks, not notes** — none authorised by me, all needing TDD and
   a decision on scope:
   a. `cardboarding`'s `graded`/`objective` contradiction (V-3 R3) — a declaration plus the
      missing sensor.
   b. The `GRADING` ratchet blind in the objective direction (V-3 R4).
   c. `src/shared/purity.test.ts:505-507`'s false comment (V-1 R3) — §9 says fix false
      assertions; two of five named properties do not hold.
   d. Criterion 7's guard testing the fixture rather than the construction (V-1 R4).
   e. `src/core/purity.test.ts`'s missing closure assertion (V-1 R6) — **this one is outside
      P1's criterion 8, which is scoped to `src/shared/`, so it needs an orchestrator ruling
      on whether this phase owns it.**
3. **Reviewer**, two rounds maximum.
4. **Gate runner** — `git merge main` first; a conflict is an escalation. Announce before
   running; serialised against P3b.
5. **Push + a green `ci` run.** `ready-to-merge` requires it and four local exit codes do
   not satisfy it.
- `scratchpad/VERIFIER-COMMON-BRIEF.md` is the shared brief both carry: the
  measurement-outranks-your-PM paragraph verbatim, §2's eleven invariants verbatim, the
  five traps (rebuild-inside-mutation · value-diff both halves · never `{...process.env}` ·
  single-file-not-full-suite · the `encode.test.ts` flake), the known-open list so they
  cannot waste a round rediscovering it, the off-limits files, and the report format.
- Both briefs carry **my own two "most likely wrong" predictions, labelled as my unverified
  reasoning** — §1.2h, and the inverse §1.2j: never present my own reasoning as someone
  else's authority.

## Queued, not yet dispatched

- **V-2 · P1 consumers** — criteria 4/6/10: `31baea5`, `ed87a60`, `7192402`, `e14ca10`,
  `64eb049`. Goes out when V-1 or V-3 returns.
- **V-4 · P7 sensors + text** — criterion 2 over `legibilityOf` + 5/6/7/8: `9d0ea36`,
  `ae79268`, `b3e7601`.
- Then **reviewer** (≤2 rounds), then **gate runner** (`git merge main` first — a conflict
  is an escalation), then **push with a green `ci` run**, which `ready-to-merge` now
  requires and four local exit codes do not satisfy.

---

# P1/P7 ledger — PM-SHARED-3 (third PM on this phase)

**This file is scaffold, never a citation target.** Plan §1.2a: it is untracked by design,
lives in a per-session tmp dir, and does not survive. A shipped comment once cited a
predecessor's ledger path; that is a review failure. Anything that must outlive this phase
goes in a **commit message** or in `docs/`.

Branch: `feat/p1p7-shared` @ `bdd4af1` · worktree `…/staticstereo-p1p7`
`main` @ **`720a2d1`** (moved under me mid-survey; was `c4f4b7f` when I was briefed) —
branch is **14 ahead / 4 behind**, all four behind are `docs/`-only.
**Execution plan, design, requirements and legibility findings are byte-identical across
`c4f4b7f..720a2d1`** — only the handover and the starting prompt changed. So every criterion
quoted inline in `COMMON-BRIEF.md` is live and the dispatched briefs are sound. Caught by
SURVEY-A, which ran `git log --oneline -1 main` as its first act, per §1.2n — seven for seven.

**Collision surfaces are reserved for me**, per handover §3: PM-SHELL-P3b is told to stay out
of `src/shared/`, `src/node/canvas.generics.test.ts`, `src/cli/` **and** `site/legibility.test.ts`
— all four of this phase's touch points.

---

## SURVEY-C findings that REFUTE the brief — escalate, do not quietly reinterpret

**R1. Criterion 4's sensor wording is false at any odd `sepFar`.** Measured:
`marginsFor` (`src/core/plate.ts:132-139`) gives `left = right = ceil(sepFar/2)` for `linked`.
The encoder's skip test (`src/core/sirds.ts:180-191`, `left = x - (sep>>1)`) gives
**left dead strip `floor(sepFar/2)`, right dead strip `ceil(sepFar/2)`.** At `sepFar 110`
(the default) both are 55 and an equality assertion passes. **At `sepFar 111` the left is
55 against a margin of 56.** So "assert the strip width equals the margin width" ships green
only because nobody sweeps an odd separation.
**The ruling survives — containment (`floor ≤ ceil`) holds for every `sepFar ≥ 2`, both sides.**
It is the *sensor's wording* that is wrong, not the closure. Instrument was controlled: it
reproduces the repo's own independently measured 46/46 at `sirds.linked.test.ts:224,229`, and
a planted `floor→ceil` mutation moves it.
Second nuance: there are **two** strip widths. Dead-for-every-depth reaches only
`floor(sepNear/2)` (46 at defaults); 46–54 is dead for far depths, live for near. A sensor
written against "capacity 0" compares 46 to 55 and reddens immediately.

**R2. Criterion 5's description of the wrong advice is BACKWARDS, in the plan and in the
findings document.** The plan, the handover and my own brief all say the branch *"tells the
author to widen the budget."* The shipped string (`perception.ts:1347-1350`) says the
opposite: *"raise sepNear to **shrink** the budget."* Raising `sepNear` at fixed `sepFar`
*reduces* the budget, moving it **toward** the measured plateau — so fusion gets **easier**,
not harder. The error originates at `docs/2026-10-12-legibility-findings.md:100` and
`perception.ts:1270` has since copied that sentence into the `fusionComfort` docblock, ~80
lines above code that says the reverse — **the module contradicts itself in its own comments.**
The advice is still worse than silence, for a different reason: it **trades away depth range
for nothing**, and the string advertises the cost while the purchase does not exist.
**Consequence for dispatch:** an implementer told "stop saying widen" will read the string,
see *shrink*, and conclude the brief is stale. Brief it as **remove the `sepNear` trade from
both the `illegible` and the `tight` branches**, because the budget does not govern
legibility in either direction.

**R3. Two cited line numbers are wrong, one of them in my own brief.**
`src/shared/perception.test.ts`'s superseded comment is at **161–162**, not 163–166; 163–166
are the *assertions*, which are structural (quantities before the em-dash) and **survive a
reword untouched**. `site/legibility.test.ts:228-229` is confirmed, but the `it` title at
`:223` and the rationale comment at `:224-226` must go with it.

**R4. Criterion 2 has a live question.** `legibilityOf` (`perception.ts:1314`) is a **graded**
function returning a bare `Legibility` string union — a grade with **no quantities**.
`fusionComfort` honours the criterion; `legibilityOf` does not. The defence (the caller passed
`ink` and `budget` in, so it already holds them) is sound but **recorded nowhere in the file**
and not carried by the criterion. Needs a ruling, not a PM reinterpretation (error 13).

## MERGED and RULED — 2026-10-15

Branch merged `main` @ `69abca9` → **HEAD `8f9a36f`**, clean, no conflicts.
**`docs/` in the checkout is now current. The scratchpad `docs-main/` snapshot is STALE —
`COMMON-BRIEF.md` §1 has been flipped to say so.**

All seven escalations ruled. What changed in the plan:
- **P1.7 rewritten**: container is written with **`method:'store'`**. Byte-identity then holds
  by construction in every engine, no browser needed. **Conditional on measurement** — a
  worker measures stored-vs-deflated on a representative multi-layer scene with a real
  imported PNG; **if the delta is material that is an escalation to Shaun**, because trading
  size for engine-independence is a product decision. Narrowing to Chromium was rejected:
  the player is designed to be embedded in other people's pages.
- **P1.8** now carries the measured blind spot (13-passed-blind → 2-failed-sighted).
- **P1.9 added** — `.stst` round-trips a multi-frame/GIF layer (R17's stated motivation).
- **P1.10 added** — the **site** reads a `.stst`, not only the CLI. Scope is the shared reader
  being browser-reachable and exercised by site-side code. **The import UI is P5's — no UI.**
- **P7.4 rewritten** to containment + tightness (`ceil − floor ≤ 1`), swept over odd and even
  including the `sepFar = 2` floor, both sides derived from shipped code.
- **P7.5 rewritten**: remove the `sepNear` trade from **both** `illegible` and `tight`; the
  `fusionComfort` docblock's copied-backwards sentence is part of the task.
- **§7 preamble corrected**: "no tier has a browser" was false of this host; the true
  statement is the default harness has none and a phase wanting one must be funded.
- **§9 gains two rows**: a planted needle is inadmissible as a control until confirmed
  present in the built artifact; and a §4 standing ruling traceable to no measurement or
  decision is a proposal, not an inheritance.
- **E4 ruled as a measurement, not my recommendation**: `legibilityOf` is satisfied-with-
  rationale **only if** it derives no intermediate quantity the caller cannot cheaply
  recompute. If it derives one — a stroke width in scene px, a margin to threshold — that
  quantity is **returned alongside the grade**. Either way the rationale goes in the file.
- **Task 7 ruling is now standing**: name the constant locally with the discrepancy recorded;
  do **not** import `INK_FRACTION` into absolute-ink-definition sites. The `18`-in-prose
  group is excluded from criterion 6 and reported as prose-staleness.

**NEW BOUNDARY, and it cuts one of my tasks:** `src/node/canvas.vendored.test.ts` is **P3b's**
(it reads `site/index.html` and dies on teardown). So task 7's three `runLengths(…, 0.5)`
sites reduce to **two** — `src/node/metamorphic.real.test.ts:104` and `:232`. The third,
`canvas.vendored.test.ts:113`, is **not ours** and goes in the gate report as open.
`canvas.generics.test.ts` in the same directory **is** ours, confirmed by ruling.

**Gate runs are serialised** across P1/P7 and P3b. Tell the orchestrator before running one.

## Dispatch plan — 13 tasks in 5 implementer batches, strictly SEQUENTIAL in-tree

Plan §4: workers commit in-tree **sequentially**; worktree isolation only for provably
disjoint sets. Two implementers in one worktree would interleave `npm test` against each
other's half-written files, so: one implementer at a time. Verifier clusters afterwards can
run in **worktrees** (they stash/unstash, which mutates a tree) — at most **two at once**,
because four concurrent suite runs have already timed out a merged-phase test.

- **I-A** — purity-guard roster (P1.8) + zip-reader false rationale and real refusal
  fixtures (P1.2). **DISPATCHED.**
- **I-B** — `method:'store'` + the stored-vs-deflated size measurement (P1.7) + multi-frame
  GIF round-trip (P1.9).
- **I-C** — CLI wiring shapes A + C (P1.6) + the site reads a `.stst` (P1.10).
- **I-D** — the four missing P7 sensors: containment/tightness (P7.4), no-throw-on-any-
  `StereoOpts` (P7.7), the parameter ratchet (P7.8), and `cardboarding`'s scene-px assertion.
- **I-E** — the `:106` edit and the two local constants (P7.6) + the reword, the docblock
  contradiction, and the E4 measurement (P7.5, P7.2).

Then **four verifier clusters**, a **reviewer** (≤2 rounds), a **gate runner**.
The orchestrator's standing instruction: **weight the verifier clusters over the tasks.**

## SUPERSEDED BELOW — `main` is GREEN at `57f1e15`, and the root cause matters

The red-CI section that follows is **historical**. CI is fixed and merged; `ci` and `pages`
green, site deployed. **Merge `main` freely.** The 10m45s figure is **withdrawn — green CI
is 94 seconds**; the red run was burning a 600s timeout.

**Root cause, and it is the single most instructive thing this project has produced:**
`svelte-check` 4.7.6's `getOutputFormat()` falls back to **`machine` if
`process.env.CLAUDECODE === '1'`**, else `human-verbose`. The harnesses spawned it with
`{...process.env}`. **So the suite's behaviour depended on whether it was run from inside
Claude Code** — every agent got one format, the runner got the other, and **no tier of this
system could have seen it by running the suite, because the blindness was in the thing all
of them share.** Plan §9 at `ab6ca78`.

**Two obligations now in `COMMON-BRIEF.md` §3a for every remaining worker:**
1. **Never spawn with `{...process.env}`** in a test. Minimum explicit env, pinned, each
   variable's presence justified. Paired control: set vs stripped produce the same result,
   so it is recorded as defence against an unaudited surface, not a fix for a phantom bug.
2. **Async harnesses `reject`, never `throw` from a callback.** A failing `expect` inside
   `child.on('close')` escapes as an uncaught exception, the promise never settles, and the
   test **hangs to the timeout instead of failing** — that is what produced the fake 10m45s.

**Exposure in our own landed work:** I-A's `17e6668` added **four `/usr/bin/zip` spawns**,
and `zip.test.ts` / `container.test.ts` spawn `unzip`. **I-B has been given the env sweep
over `src/shared/**/*.test.ts` as a third task**, since it is already in those files.
`zip`/`unzip` almost certainly do not branch on `CLAUDECODE`, but "almost certainly" is the
standard that just cost nine hours, hence the paired control rather than an assumption.

**The runtime caution I gave I-B is withdrawn in writing**, including the instruction to
reconsider anything it simplified on my advice. **I-D's 210,800-case fuzz has ample
headroom** and must not be trimmed on runtime grounds without measuring.

## CI — superseded, kept for the record

**`main`'s CI is red since `7cd5599`** (P3a merge): four `site/` svelte-check harnesses fail
on the runner, pass locally — *"could not read the checker's COMPLETED line"*. Orchestrator
error 24, recorded at `27f1e71`. **Not ours.** Owned by a worker on
`fix/ci-svelte-check-harness`. We inherit it on merge; expect four red `site/` tests and do
not let them mask a real failure.

**§6's four local exit codes are no longer sufficient.** The gate now also requires a
**green `ci` run on a pushed branch** before `ready-to-merge`, because a local re-run shares
every environmental assumption with the run it is checking.

**Runtime is a budget:** CI 10m45s vs 43s local, 2-core runner; three `svelte-check`
harnesses are >60% of the suite. **I-D's criterion-7 fuzz (SURVEY-C ran 210,800 cases as a
standalone script, not as a suite test) must be re-costed before it lands** — boundary cases
exhaustive, remainder from a fixed seed, bound defensible on 2 cores, runtime reported.
Timing must use the **default reporter**: `--reporter=json` under-reports `beforeAll`-heavy
files by 1500×.

**I-A was messaged mid-flight** with the runtime constraint (its task 2 adds `/usr/bin/zip`
spawns) and with the pin-don't-observe point, since its task 2 is literally replacing one
environment-dependent claim and must not install another.

## I-A — LANDED. `2e07de6` (P1.8) + `17e6668` (P1.2). Suite 2040 / 92 files / 0 skipped, four zeroes, typecheck 0 over 469.

**P1.8 — the purity-guard hole is closed.** Roster now derived from
`ts.parseJsonConfigFileContent` over the repo's `tsconfig.json`, not from `dist/shared/*.js`.
RED reproduced independently (13-passed-blind → sighted, both instruments). GREEN shows the
acceptance criterion met **with no `dist/shared/zzzLeak.js` at any point**, plus a control
where the same new file *without* the builtin import stays green — so the guard sees the
import, not the file.

**P1.2 — rationale corrected, three new tests, refusal unchanged.** Real `/usr/bin/zip`
ZIP64 and data-descriptor fixtures. RED established **by mutation with HEAD as the paired
control**: each guard removed in turn, new file vs an unmodified copy of HEAD's, so the HEAD
column proves the *additions* see the guard rather than that the suite sees something.

### Three refutations of my brief — I-A was right on all three

1. **`gifFixtures.ts` is NOT swept in.** `tsconfig.json:23` excludes `src/shared/testing/**`,
   so the specced roster excludes it **by the rule**, not by the accident of emitting nothing.
   My brief said it would be swept in. Measured anyway: if included, the ambient-global rule
   **fails on `Buffer`**, correctly — its only importers are four `.test.ts` files under
   vitest's node environment. Reported, not fixed, as instructed.
2. **Three of the four named refusal paths were unreached, not four.** `:307` was already
   live via the `usize` disjunct; `csize` and `localOffset` were dead. Established by
   inserting a marker at each branch, not by reading.
3. **The ZIP64 stdin case is NOT a seekability effect.** `zip -q out.zip - < soup.txt` and
   `cat soup.txt | zip -q out.zip -` are byte-identical ZIP64 — for **stdin** it is *not
   knowing the size* that triggers ZIP64. Only the **stdout** data-descriptor case is about
   seekability. I had relayed the two as one mechanism. Both are now recorded in the files.

### Deviations accepted
- **Containment, not equality**, for the purity pairing cross-check. Reasoning is sound and
  better than my spec: equality's other direction is false of exactly the file the criterion
  exists for, so a new leaky module **and its own paired control** would redden identically
  on a message about the build — §9's *"my control proves the diff works"*. Containment still
  catches a moved `outDir`/`rootDir`, a changed extension filter, an `exclude` glob grown over
  a still-emitting module, and a `dist/` orphan (measured).
- **`skipIf(!built)` narrowed** from the two `describe`s to the three `dist/`-reading `it`s —
  its recorded rationale ("the roster here is derived from the build") was retired by the
  change, and leaving it would have kept the identical blindness under `rm -rf dist`.
- **Five stale measured values corrected** in files already being edited (§9's stale-assertion
  row): 22 specifiers not 14; 21 ambient globals from 13 modules not 20 from eleven;
  instrument-check 20→21; fail-closed 12-of-13→15-of-16; one test title that had become false.
- **Freshness gate considered and declined, with reasoning**: `src/core/purity.test.ts:168-205`
  already walks the whole of `dist/`, `dist/shared` included, with its own paired control; a
  second copy would guard a strict subset.

**Runtime:** `zipRead.test.ts` 252/247/247 ms → 298/273/338 ms, default reporter. Four new
spawns, two of them negative controls, memoised per distinct invocation and built **lazily on
first use rather than in a `beforeAll`**, so a run selecting only the tree tests pays nothing.
Fail-closed preserved and extended: absent binary now reddens **15 of 16**.

### CARRY — a live instance of the very claim-shape P1.2 existed to fix
`src/shared/zipRead.ts:268`: *"No producer we target reaches this branch"*, about CP437 entry
names. **Unverified, untouched, one branch over from the claim I-A just refuted.** The obvious
probes are `zip -UN=...` and a non-UTF-8 locale. Goes in the gate report; candidate task if
there is room.

Also observed-not-specified and flagged: `zip`'s store-vs-deflate threshold (already asserted
as *coverage* rather than assignment at `zipRead.test.ts:266`, correctly), and the
28-local/24-central extra-field asymmetry whose *field choice* (`0x5455`, `0x7875`) is
Info-ZIP's.

**`main` moved again: `69abca9` → `27f1e71`** (the red-CI writeup, handover only). The
receiving-agent check is now **eight for eight**.

## I-B — LANDED. `7d39ab1` (P1.7 all-store) + `b8a157f` (P1.9 sensor) + `03908db` (spawn env).
93 files / 2046 passed / 0 skipped · typecheck 0 over 471 files · four zeroes.
(+1 test file, +6 tests, +2 typechecked files. No removals.)

### ESCALATED TO SHAUN — case E crosses the threshold and I think I-B under-rated it
Threshold stated **before** measuring: material = ≥5% relative. Representative fixture
(4 text/shape layers + photo PNG + logo PNG + 3-frame GIF + baked masks, 2.44 MB):
**+4,777 B, +0.195%.** Not material. Proceeded correctly.

Sweep: absolute cost bounded **+478 B to +8,892 B**; relative is large only where absolute
is under ~1.1 KB (no-members 676→1154 = +70.7%; GIF-only 1228→2287 = +86.2%).

**Case E — eight flat-graphic PNGs as masks and sources, no photo: 107,724 → 137,279,
+29,555 B, +27.4%.** I-B judged it unrepresentative (99% PNG) and reported rather than
escalating or quietly switching instruments — correct behaviour either way.

**I disagree with the representativeness call and am escalating.** Design §6.1 makes
**silhouette masks the primary import path** — *"Silhouette → 1-bit mask, re-encoded as a
mask PNG. A 400×300 silhouette is 1–3KB"*. Flat graphics are the **common** case here, not
the exotic one. So case E is closer to a typical `.stst` than the photo fixture is.

**And the plan's mechanism was wrong in the direction that makes this worse.** Measured: on
a photo PNG, deflate buys **less than zero** — 2,234,956 stored vs 2,235,641 deflated,
stored-block framing being overhead on incompressible input. The **entire** positive delta
comes from `scene.json`, `manifest.json` and the **baked masks**, which are small, flat, and
still deflate **18–65%** (cross-checked across five PNG encoders, so not a fixture artefact).
**The cost is concentrated exactly in the files case E is made of.** The orchestrator's
"deflate buys ~0% on already-compressed image data" is right about photos and wrong about
the masks, which are the part that matters.

### Open hazard, recorded in `container.ts`, needs routing to P5
A baked mask handed over as **raw bytes rather than PNG**: 5,552 → 787,929 — **+782 KB,
+14,092%.** Design §6.1 has not chosen the baked-mask encoding. The container cannot defend
against it: choosing method from content is exactly the input-dependence criterion 7 exists
to remove.

### P1.9 was already met and had NO sensor — the repo was blind
Measured before adding anything: patching `writeStst` to carry every member faithfully while
**silently dropping every `type:'gif'` layer** left 18 shared files / 209 tests green. Two
REDs now (layer dropped; `loop` dropped); `containerRead.test.ts:209` saw **neither**. Its
scope call is **not** overturned — no frame or naming convention imposed.

### Task 3 is incomplete AT THE REPO LEVEL, and the rest is not ours — report upward
- **`main`'s own harness fix still spreads `...process.env`** in all three site harnesses,
  having pinned `--output machine` and deleted `CLAUDECODE`. That is a **deny-list of one
  variable**, and §9's *first recorded* failure is a deny-list that failed open.
- **Six spawn sites in `src/node/` and `src/cli/` inherit the environment unaudited.**
  I-B's census covered `src/shared/` only.
- Measured: `zip`, `unzip` and `node` are **byte-identical under `env -i`** — none branches
  on the harness variable. So this was **defence, not a bug fix**, as intended.
- **Locale is NOT load-bearing for Info-ZIP's UTF-8 name flag** — it decides per name from
  the bytes, identically under six environments. I predicted the opposite in the brief.
- I-B's own guard had **two fail-open holes, both caught by its own controls, not by review**:
  it counted its own control string, and counting the import as a mention gave every file one
  free unaccompanied spawn.

### Self-inflicted failure worth recording because the sensor worked
I-B's `execFile` wrapper widened `stdout` to `string | Buffer` and reddened **seven `site/`
registration tests** — **not** the known CI breakage; they assert the typecheck surface is
clean and it was not. Fixed by writing the return type out.

**`main` moved again → `311dec1`** (docs + `site/bindingregistration.test.ts`,
`site/fitregistration.test.ts`; nothing touching P1/P7). **Nine for nine.** I-B did not
merge; no red `site/` tests appeared in this worktree at any point.

## I-C — LANDED. `7192402` (P1.6 read) + `e14ca10` (P1.6 write) + `64eb049` (P1.10).
94 files / 2070 passed / 0 skipped · typecheck 0 over **472** files · four zeroes.

**`src/cli/` surface — exactly the six predicted, no more:** `args.ts`, `args.test.ts`,
`index.ts`, `index.test.ts`, `scene.ts`, `scene.test.ts`. Plus `site/project.test.ts` (new)
and `src/shared/purity.test.ts` (+103). `keydrift.test.ts` unmoved, as predicted.

**Lossy-read decision: option (iii) — the loss is *removed*, not announced.** `loadProject`
returns the whole archive, `loadScene` is its `.scene`, and `index.ts` carries `members`
into `writeStst`, so `stst render p.stst -o out.gif --save-project p.stst` is lossless **by
construction**. The code says explicitly that the render path *can* legitimately ignore
members today (nothing in `src/core` consumes a baked mask) — but that is not what makes it
safe; the write half is. Good reasoning, better than any of my three options.

One extra `check()` rule beyond brief: `--save-project` requires `.stst`, because
`loadScene` dispatches on extension alone, so a project under another name is a zip this
same program hands to the YAML parser.

### Three measured findings

1. **The purity guard was still blind ONE HOP OUT — now closed.** `tsconfig.json` excludes
   `src/shared/testing/**`, so a hop there is `shared → shared` and the target is in **no
   roster**. Planted `import { CHILD_ENV } from './testing/spawnEnv.js'` in
   **`containerRead.ts` itself — the `.stst` reader** — and on an unbuilt tree the suite was
   **green with `node:os` one hop down the reader's graph**. This is `2e07de6`'s blindness
   restated one hop out, and it was **exactly the hazard I-B flagged**. Closed by
   `rosterVerdict`: *a guarded module may not reach an unguarded one.* Paired control on the
   unbuilt tree: planted 1 failed | 12 passed; removed 13 passed.
2. **The shared suite is blind to a browser-shaped input.** Dropping `archive.byteOffset`
   from `zipRead.ts`'s two `DataView`s leaves **all 387 tests in `src/shared/` + `src/cli/`
   green**; `site/project.test.ts` is the only thing that reddens. `zipRead.ts` is correct
   today and **nothing pinned it.** This is criterion 10 justifying itself on its first day.
3. **§9's `build:site` row is right but INCOMPLETE — three cases measured:**
   | in bundle graph | import form | `build:site` |
   |---|---|---|
   | no (`src/shared/containerRead.ts`) | named + used | **exit 0, no warning at all** |
   | yes (`site/fonts.ts`) | side-effect `import 'node:fs'` | **exit 0** + "has been externalized" |
   | yes (`site/fonts.ts`) | named + used | **exit 1** |
   The exit 1 is **not a purity check** — it is Rollup failing to resolve a named export off
   `__vite-browser-external`, which exports nothing. So `import * as fs from 'node:fs'` or a
   dynamic import would likely slip through, and `containerRead.ts` is **not in the site
   bundle graph at all**, so `build:site` says nothing about it either way. **The purity
   guard is its only sensor.** → §9 amendment for tier 0.

### Deviation: Task 2 had no TDD RED available
The site test passed first run — the capability already existed and **the test is the
deliverable**. Discharged with §6.5a paired controls instead, both halves each:
reader-moved-out (import failure → restored), and the `byteOffset` mutation. Correct call.

### UNCERTAIN worth routing upward
- **`package.json`'s `typecheck` script pins no `--output`.** Its format is still decided by
  `process.env.CLAUDECODE` — agent runs get machine, CI gets human-verbose. **Exit code
  unaffected so nothing is broken**, but it is the same unpinned surface that cost nine
  hours, **one layer up from the harnesses that were fixed.**
- **Nothing guards `site/*.ts` imports** the way `purity.test.ts` guards `src/shared/`.
  `build:site` is the only sensor and is fail-open for the side-effect form (finding 3). No
  site module imports `src/shared/testing/*` today — only `.test.ts` files do — so the
  hazard is **open but unrealised**. I-C raised rather than built; outside criterion 10.
- **`site/project.test.ts` is a new file in `site/`, which is NOT on our reserved list.**
  Collides with nothing today but P3b owns `site/` teardown. **Flag to the orchestrator.**
- `src/node/encode.test.ts > gifenc module interop` **flaked once** at a 20s timeout under a
  loaded full run (13.9s in baseline, 4.0s alone). Untouched by us; margin already thin.

## I-D — LANDED. `be348d1`, `9d0ea36`, `ae79268`, `ded331c`. Four P7 sensors.
96 files / 2095 passed / 0 skipped · typecheck 0 over **475** files · four zeroes · 47.06s
(vs 48.40s baseline — the suite got *faster*).

New: `src/shared/testing/perceptionRoster.ts` (self-enumerating signature roster, plain
module, build-excluded like `spawnEnv.ts` — a test file importing another test file would
re-register its `describe` blocks in both runs), `perception.contract.test.ts`,
`perception.throws.test.ts`, +249 in `perception.capacity.test.ts`, +69 in cardboarding.

**Every RED was established by mutation with a HEAD column.** Sensor 1: `sirds.ts`
`x - (sep>>1)` → `x - ceil(sep/2)` reddens the new sensor, **HEAD green including
`sirds.linked.test.ts` — every separation it uses is even.** Sensor 4's decisive run had to
set `DEFAULT_STEREO.noiseScale` back to **1** (the value the stale `legibility.ts` comment
claimed): at 2, HEAD sees the mutations *by accident*; at 1, HEAD's 22 tests are green and
only the new sensor reddens.

### Three more corrections to my brief — all accepted
1. **Criterion 4's far-extreme strip can NEVER be measured end-to-end**, and this is stronger
   than SURVEY-C's "not observable against a far background". Over a uniform-depth field the
   linked pair set is `{(a, a+sep)}` **whichever way the skip test rounds** — swapping
   `x-(sep>>1)` for `x-ceil(sep/2)` relabels which column produced each pair and emits a
   **bit-identical frame**. A feature at `sep = sepFar` is by construction indistinguishable
   from the background. **But I-D did confirm end-to-end at odd separations** by measuring at
   a separation a slab really encodes at — three independent readings agreeing exactly at
   sep 2,3,4,5,10,11,46,47,92,93,110,111,140,141. My brief's "strongest shape"
   (`encodedCentres`) would have hit trap (a); the "acceptable fallback" was not needed.
2. **SURVEY-C's parameter count was wrong: 21 parameters (10 distinct names), not 15.**
   13 functions is right. I-D reported it as **not reproduced** rather than as moved — the
   right epistemic call, since it could not reconstruct 15 from any grouping.
3. **The tightness bound is satisfiable only against the far-extreme derivation**, not
   against a near-extreme measurement (46 vs 55 = slack 9). I-D kept the bound, swept
   *separation* rather than depth, **and added a second assertion that the right margin is
   exact at every separation** — because slack ≤ 1 on both sides would still permit a margin
   one column too wide everywhere. Strictly better than what I specced.

### Fuzz sizing
`perception.throws.test.ts` **3.19 s** — 105,921 cases × 13 functions = 1.38 M calls plus
105,921 control calls. 20,000 was measured first at 0.7 s and found nothing more; kept at
100,000 because the cost is known. Corroborates SURVEY-C's 210,800 **as a measurement**, not
as independent evidence of the property — same module.

### WARNING for every verifier cluster — I-D lost a mutation run to this
**Editing `src/core/*.ts` without rebuilding reddens `purity.test.ts:189` and
`dist.test.ts:361`** (build-staleness gates), and `build:site` staleness reddens
`dist.test.ts:361` on its own. **A mutation matrix that does not rebuild both will
attribute those to the mutation.** Put this in every verifier brief.

### Already-ruled, so do NOT re-escalate
My last report flagged `package.json`'s `typecheck` script pinning no `--output`. **§9's new
row says explicitly NOT to pin it there** — the harnesses *append* rather than replace, and
`mri` would collect a duplicated flag into an array and silently revert to human format.
I-D flagged it and correctly did not touch it. The item is closed.

**`main` → `d5dcf89`** (P3b rulings ESC-7..12, four §9 rows, CI notes; **zero hits** for P7,
perception, cardboarding, margin, strip, subjective, sepFar). **Ten for ten.** Note `main`
also now carries test edits to `presets.golden`, `encode`, `metamorphic.real` — **the last
of those is a file I-E is editing; expect a merge touch there.**

## I-E — LANDED `b3e7601`. ALL 13 IMPLEMENTATION TASKS COMPLETE.
96 files / **2110 passed** / 0 skipped · typecheck 0 over 475 · four zeroes · tree clean.
13 commits + 1 merge on the branch. **Zero test removals across all of them.**

**E4 RESOLVED BY MEASUREMENT, as ruled:** `legibilityOf` **did** derive a quantity the caller
cannot recompute, so criterion 2 was **not** satisfied. Now returns
`LegibilityReading {medianRun, budget, clearAt, grade}`. A `GRADING` table was added to
I-D's self-enumerating roster so the rule has a sensor, not a note.

### I-E's four refutations
1. **THE FINDINGS DOCUMENT IS STILL HALF-WRONG — ORCHESTRATOR ACTION NEEDED.** §2 was
   corrected at `69abca9`; **§5 bullet 3 was not.** It still reads *"stop implying that
   **widening** the budget helps legibility"* — the identical reversed mechanism — **and it
   is the bullet design §10.3 and criterion 5 both cite.** Not edited: tier-0 document,
   error 14 says report rather than edit.
2. **SURVEY-C's `perception.ts` line numbers are uniformly ~10 short** (plateau `:1211`→
   actual `:1221`; `legibilityOf` `:1314`→`:1324`; ladder `:1315-18`→`:1325-28`). And its
   `src/cli/scene.ts:513-532` is the preset-registry guard, unrelated — the real block is
   **`:617-640`**. Third and fourth SURVEY-C numbers to fall.
3. **`site/legibility.test.ts:228`'s `toMatch(/sepNear/)` could never have seen this change**
   — the verdict line prints `(sepFar 110 − sepNear 92)` so the budget is checkable, and the
   regex matches that. **Half the old sensor was inert. Instance nine** of "a check that
   cannot see reports fine".
4. **Two docblocks claimed "the test file is unmodified, which is what proves it."** That
   claim was spent the moment this task ran; both amended to past tense.

### The best control of the phase
Cycle 3, criterion 6 task 1b: with the **forbidden** fix applied (`runLengths` made
peak-relative), HEAD's `metamorphic.real.test.ts` was **14/14 green with all 21 `[measured]`
values byte-identical** — blind by pass/fail **and** by value. That is §6.5a's "diff the
values, not the pass/fail" procedure finding a true blindness, and it is why the standing
ruling against importing `INK_FRACTION` there was right.

### OPEN — needs scoping as its own task, deliberately not done
**"will not fuse however long you stare" is refuted verbatim by findings §1 round 1** —
a 16px stroke at an 18px budget was read exactly. It survives in `perception.ts`'s header
and verdict, `README.md:120` + its 12-row table, `examples/scrolling-text.yaml`,
`src/cli/scene.ts:617-640`, and `src/core/testing/metamorphic.ts`. **It is a *threshold*
claim and findings §5 declines to replace the number**, so it is out of criterion 5's
"wrapper shape and verdict string only" scope. I-E correctly refused to fix one file while
six disagree — that is this phase's own error class.

**`main` → `98da3ee`** ("criterion 23, and a guard that made the right architecture the
detectable one"). Eleven for eleven.

---

# HANDOVER — verification tier, untouched. This is the whole remaining job.

**No verifier, reviewer or gate runner has ever run on this phase.** 13 implementer commits.
The orchestrator's standing instruction: **weight the clusters over the tasks.**

### Proposed four verifier clusters (each re-establishes RED individually per task)
- **V-1 · P1 zip + container** — P1.1/2/3/5 (`76b7e94`, `4ffe42e`), `2e07de6`, `17e6668`,
  `7d39ab1`, `b8a157f`, `03908db`.
- **V-2 · P1 consumers** — P1.4/6/10 (`31baea5`, `ed87a60`, `7192402`, `e14ca10`, `64eb049`).
- **V-3 · P7 objective half** — P7.1/2/3/4 (`3c18a06`, `96dceb6`, `4e41934`, `6214ec5`,
  `8d08ef1`, `76c5976`, `bdd4af1`, `be348d1`, `ded331c`).
- **V-4 · P7 sensors + text** — P7.5/6/7/8 (`9d0ea36`, `ae79268`, `b3e7601`).

Run in **worktrees** (they stash/unstash, which mutates a tree). **Two at a time maximum.**

### PUT THIS IN EVERY VERIFIER BRIEF
1. **Rebuild inside every mutation.** Editing `src/core/*.ts` without rebuilding reddens
   `purity.test.ts:189` and `dist.test.ts:361` (staleness gates); `build:site` staleness
   reddens `dist.test.ts:361` alone. **I-D lost a matrix run to this.** A matrix that does
   not rebuild will attribute those to the mutation.
2. **§6.5a, both halves named** — diff the measured **values**, not pass/fail. I-E's cycle 3
   is the proof this matters: 21 `[measured]` values byte-identical under the mutation.
3. **Never spawn with `{...process.env}`**; reuse `src/shared/testing/spawnEnv.ts` (Node-only).
4. **Async harnesses `reject`, never `throw` from a callback** — otherwise the test hangs to
   the timeout instead of failing.
5. **Off-limits:** `src/node/canvas.vendored.test.ts` (P3b's), `site/main.ts`,
   `site/index.html`, `site/controlspec.ts` (P3a's).
6. `src/node/encode.test.ts > gifenc module interop` **flakes at a 20s timeout under load**
   (13.9s loaded, 4.0s alone). Pre-existing; do not attribute it to a mutation.

### Then: reviewer (≤2 rounds), gate runner, **push + a green `ci` run** (new requirement —
four local exit codes are no longer sufficient). **Tell the orchestrator before any gate
run; they are serialised against P3b.**

### Carry into the gate report as open-and-not-ours
- `18` inlined in prose at `site/controlspec.ts:522,539`, `site/index.html:223,224,299` —
  P3a-merged; **reclassified as prose-staleness, excluded from criterion 6 by ruling.**
- `src/node/canvas.vendored.test.ts:113` — the third `runLengths(…, 0.5)` site, **P3b's**.
- `src/shared/zipRead.ts:268` — *"No producer we target reaches this branch"* (CP437),
  **the same unverified claim-shape P1.2 just demolished, one branch over.** Probes:
  `zip -UN=...`, a non-UTF-8 locale.
- **`main`'s harness fix still spreads `...process.env`** — a deny-list of one variable;
  §9's first recorded failure is a deny-list that failed open. Plus **six unaudited spawn
  sites** in `src/node/` and `src/cli/`.
- **Nothing guards `site/*.ts` imports** the way `purity.test.ts` guards `src/shared/`;
  `build:site` is fail-open for the side-effect form. Open but unrealised.
- **§9's `build:site` row is incomplete** — three cases measured by I-C; the exit 1 is
  Rollup failing to resolve a named export, **not a purity check**.
- **`depthBlur ≥ 1` is the smallest radius tried, not a measured boundary**; whether a
  blurred edge cures cardboarding at all is the **design's claim, not a measurement**. No
  boolean on it may reach past a diagnostics line. Six of eight criterion-1 functions still
  have **zero production callers** — P4 wiring them is what makes this load-bearing.
- **Case E**: all-flat-graphics `.stst` is **+27.4% stored**. Escalated to Shaun; unresolved.
- **The raw-bytes baked mask hazard**: +782 KB, +14,092%. **P5 must be told.**

## Open questions (top, per working style)

- **P1 criterion 7**: is `CompressionStream('deflate-raw')` bit-identical Node vs Chromium?
  If not, the criterion is unachievable and that is an **escalation, not a workaround**.
  SURVEY-B is establishing what can even be measured (no tier has a browser).
- **New `stst` subcommand?** `COMMANDS` is `['render','still','preview']` and the design
  names no new one. Any new name is an **escalation**. SURVEY-B is enumerating wiring
  shapes that avoid one.
- **Criterion 8's named list** — must be fixed by me before dispatch. SURVEY-C enumerating.
- **Criterion 6's named list** — same. SURVEY-C enumerating; includes the
  `canvas.generics.test.ts` line (criterion says `:107`, outgoing PM says `:106`).

## Now

- **Surveys dispatched, three in parallel, none returned.**
  - SURVEY-A — baseline re-measure, node_modules integrity, gate, net test removals,
    commit→criterion map, skip/freshness.
  - SURVEY-B — P1: `src/shared/` inventory, criteria 1–5 + 8 evidence, ZIP64/data-descriptor
    refusal, CLI wiring + collision surface, criterion 7 cross-runtime, design-vs-criteria gap.
  - SURVEY-C — P7: perception inventory, criterion 4 strip/margin sensor, criterion 6 list,
    criterion 8 list, criterion 7 throw sensor, criterion 5 reword blast radius, §10 gap.
- Awaiting all three before sending the numbered task list for orchestrator approval
  (plan §5.5 — no implementer dispatches before that).

## Just finished

- Verified `main` = `c4f4b7f`, branch 14/3, tree clean. (`git rev-list --left-right --count`)
- Extracted `main`'s `docs/` verbatim to `scratchpad/docs-main/` — **all workers read planning
  docs from there, never from the checkout**, which is 3 docs-commits stale.
- Read plan §1 (all), §2, §4, §5, §6, §7 preamble + P1 + P7, §8, §9 (full trap table);
  design §6.2, §10, §12, §13; legibility findings; requirements R17/R18/R22;
  handover §2, §4, §5, §5a.
- Wrote `scratchpad/COMMON-BRIEF.md` — the verbatim measurement-outranks-your-PM paragraph,
  §2 invariants verbatim, the amended P7 criteria **inline** (§1.2n: a pointer is unsafe for
  text added after the branch was cut), the fail-open failure mode, and §6.5a with **both
  halves named**.

## Baseline — MEASURED by SURVEY-A, no longer relayed

| | typecheck | build | build:site | test | files | passed | skipped |
|---|---|---|---|---|---|---|---|
| `feat/p1p7-shared` @ `bdd4af1` | 0 (469 files) | 0 | 0 | 0 | **92** | **2037** | **0** |
| `main` (re-measured in a throwaway detached worktree) | 0 (451 files) | 0 | 0 | 0 | 80 | 1881 | 0 |

Delta: +18 typechecked files, +12 test files, **+156 tests, zero removals.**
The outgoing PM's four claims (sha, 14 commits, 92/2037, four zeroes) **all reproduce.**
`node_modules` is complete — `npm ls --all` exit 0, every absent entry an optional foreign-
platform dep. No repair needed; the 127/1/1 seen elsewhere was a *different* worktree.

**Zero net test removals, and the instrument was exhibited turning non-null** (§6.5a, both
halves): `vitest list --json` name-set diff across both trees, with a control that renamed
one `it()` in a probe worktree and was duly detected. §6.4's itemisation is not engaged.
Note: two-dot `git diff main HEAD` shows a *spurious* doc deletion — three-dot is required.

**Skip count 0 is positively witnessed, not merely absent**: each guarded file carries an
inverse sentinel that registers only when its gate is false; none appeared, and per-file
counts are at maximum. Control: `touch site/controls.ts` moved skips 0 → 22 and turned the
suite **red** — staleness is a hard failure here, and the cheapest fix is to rebuild, which
is the right way round for a tripwire.

**Correction to my own brief, from SURVEY-A:** `purity.test.ts` is **not** mtime-gated —
both purity files are `existsSync`-only; the mtime logic lives solely in `site/dist.test.ts`.
`src/core/purity.test.ts` compensates with a separate dist-wide staleness sensor carrying its
own paired control. `src/shared/purity.test.ts` has **no freshness mechanism of its own** and
leans on that. It reads as ungated; worth carrying to the reviewer.

## Criteria status (SURVEY-A, from commit messages + file lists only — grep-level, not read-level)

**Met, with commits:** P1-1/3/5 `76b7e94` · P1-2 `4ffe42e` · P1-4 `31baea5`+`ed87a60` ·
P1-8 `ae9f0c8` · P7-1 across six commits · P7-2/3 `96dceb6` · P7-4 capacity half `4e41934` ·
P7-5 first half `3c18a06`. Enabler `6214ec5` (`sepAt`, ruling E-7) and merge `2c66cac` map to
no criterion. **None of this is verifier-confirmed — that is the shift's real work.**

**Open, confirmed by empty diffs:** P1-6 (`src/cli/` untouched) · P1-7 (half; no browser-side
anything) · P7-4 sensor (one *comment* at `perception.capacity.test.ts:176`, no assertion) ·
P7-5 second half (`site/legibility.test.ts` untouched; `3c18a06` says the wrong advice crossed
byte-for-byte) · P7-6 (`src/node/` untouched) · P7-7/P7-8 (no dedicated sensor).

**`src/node/canvas.generics.test.ts` line numbers measured:** `peak * 0.5` is at **`:106`**,
`INK_FRACTION` comment at **`:99`**. The outgoing PM is right; the criterion's `:107` is stale.

## Escalations open

None raised yet. Three are anticipated (see Open questions).

## Carried into the gate report, not ours to fix

- `18` inlined in shipped prose at `site/controlspec.ts:522,539` and
  `site/index.html:223,224,299` — only perceptual threshold in production; **P3a-merged.**
- `depthBlur ≥ 1` is the smallest radius tried, **not a measured boundary**; (0,1) unmeasured.
  Whether a blurred edge cures cardboarding at all is the **design's claim, not a
  measurement**. No boolean on it may reach anywhere louder than a diagnostics line.
