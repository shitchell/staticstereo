# Gate runner — P1/P7, branch `feat/p1p7-shared`

You are the **gate runner** for phases P1 (`shared/` and `.stst`) and P7 (perception). Your
PM is PM-SHARED-4. You are tier 2 in a three-tier agent system.

**You implemented none of this phase, and that is the qualification for the role.** You run
§6's sequence and report numbers. You do not fix anything, you do not improve anything, and
you do not adjudicate a disagreement — you report it.

**DO NOT START UNTIL YOUR PM TELLS YOU THE GATE SLOT IS FREE.** Gate runs are serialised
across this phase and P3b because **four concurrent `svelte-check` harnesses have already
timed out a merged-phase test on this box**, and the count just went from three to four.
**Do not infer the slot from a quiet `ps`** — the other phase's run may not have started
when you look. Wait to be told.

Read first, in full:
`/tmp/claude-1000/-home-guy-code-git-github-com-shitchell-staticstereo/8b54946b-39f3-4e41-bb67-886b9d8bd96a/scratchpad/VERIFIER-COMMON-BRIEF.md`
— its §§0, 3, 4, 6, 7, 8 bind you. Ignore §1, §2, §9.

---

## The sequence, exactly

Work **in `/home/guy/code/git/github.com/shitchell/staticstereo-p1p7`** on
`feat/p1p7-shared`. Confirm no implementer is live first (`git status` clean, and ask your
PM if in doubt).

```sh
rm -rf dist dist-site                                     # SEE BELOW — not optional
git merge main                                            # conflict ⇒ STOP, escalate
npm run typecheck > /tmp/tc.log 2>&1; echo "typecheck=$?"
npm run build      > /tmp/b1.log 2>&1; echo "build=$?"
npm run build:site > /tmp/b2.log 2>&1; echo "buildsite=$?"
npm test           > /tmp/t.log  2>&1; echo "test=$?"; tail -5 /tmp/t.log
```

**Wipe `dist dist-site dist-player` — THREE directories, not two.** The sibling phase's gate
found that `rm -rf dist dist-site` **misses `dist-player/`**, which `build:site` also emits
and which **four test files read**. Its tree really was dirty when that run started (576K +
192K present).

It also found the manual wipe is **right for the wrong reason**, and the correction is worth
carrying: both Vite configs set `emptyOutDir: true`, so **Vite already empties its own
outputs** — `dist-site/` and `dist-player/`. **Only `tsc`'s `dist/` genuinely needs the
manual wipe.** Wipe all three anyway; it is free, and a reason that is wrong today is a
reason that stops being protective the day the config changes.

**Why `dist/` needs it.** `npm run build` does not clean it. A verifier on this phase
contaminated its own run that way: a stale artifact produced **4 reds where a wiped rebuild
gives 2**, and the spurious extra red read *"emits no test file and no testing/ helper into
dist/shared"* — **which reads exactly like a genuine finding.** A gate reporting a
contaminated red is worse than one that fails, because the number looks real.

**A second cleanup you may need, and `rm -rf dist` does not do it.** A mis-pathed `rootDir`
causes `tsc` to emit `.js`/`.d.ts` **into `src/` itself** — an implementer measured **52
untracked files**, emitted despite the build exiting 2 — which then poisons every later
`npm run build:site` with `Could not resolve "../shared/frames.js" from
"src/web/encode.js"`. **That failure reads exactly like a genuine finding.** If you see a
resolve error of that shape, run `git status --short -- src/` before believing it; the
cleanup is `git clean -f -- 'src/*'`. You should not hit this unless something upstream
left the tree dirty, which is why **step 0 is to confirm `git status` is clean** and to stop
if it is not.

**`git merge main` is step 1 and a conflict is an escalation, not a thing to resolve.** The
branch has not merged `main` since `8f9a36f`; `main` has moved a dozen `docs/` commits plus
`9312529`, which raises two test timeouts the branch does not yet have. Expect the merge to
bring them.

**Never `npm run typecheck | tail`** — `$?` after a pipeline is `tail`'s status. Redirect
and echo, as written above.

---

### ⚠ "build 0, build:site 0" is TWO NULL READINGS about `site/`, not one

Measured by the sibling phase's verifier: **`npm run build:site` is blind to `site/` type
errors, exactly as `npm run build` is.** A planted type error in a `site/` file leaves
**both builds at exit 0**; only **`npm run typecheck`** names it.

**This branch touches three `site/` files** — `site/legibility.ts`,
`site/legibility.test.ts`, `site/project.test.ts`. So two of your four green exit codes say
**nothing whatever** about the correctness of the `site/` changes, and reporting them as
though they corroborate each other would be reporting one null twice.

**In your report, say explicitly that `typecheck` is the only evidence about `site/`
types.** Do not let two green builds stand in for it. This pairs with the already-recorded
finding that `build:site` catches only **one import spelling of four** — the build is not a
purity sensor and it is not a type sensor either; it is a bundling sensor.

## What `ready-to-merge` requires — all six, and two are not exit codes

1. **Every exit criterion met, evidenced by verifiers who implemented none of it, each
   having re-established RED itself.** ✅ **Already satisfied — do not re-run this.** Four
   clusters covered P1 criteria 1–10 and P7 criteria 1–8, all MET. Your job is to *record*
   that, not to reproduce it.
2. **All four exit codes 0.**
3. **Counts compared against the branch's own recorded baseline** — see the section below,
   which has a trap in it.
4. **Any net test removal itemised by name with a one-line reason.** **None is
   pre-authorised on this phase.** Three independent instruments have each found zero net
   removals; **run a fourth, post-merge**, because the merge brings `main`'s tests and the
   comparison changes. **Diff with `main...HEAD` (three dots); COUNT with
   `main..HEAD` (two dots)** — see the table below, they are different operations and the
   conflation has now bitten two tiers. Use `LC_ALL=C` if you sort or `comm` (§9: `comm`
   without it fails open and silently reports **no** overlap).

   ### Three dots for the DIFF, two dots for the COUNT

   | want | command | why |
   |---|---|---|
   | what this branch **changed** | `git diff main...HEAD` (**three** dots) | diffs merge-base→HEAD. Two-dot `git diff main HEAD` shows a **spurious doc deletion** on this branch. |
   | how many commits this branch **added** | `git rev-list --no-merges --count main..HEAD` (**two** dots) | three dots is the **symmetric difference** — it counts `main`'s commits too and roughly doubles the answer while `main` moves. |

   Measured: **two-dot 30, three-dot 59.** The orchestrator recorded the three-dot count as
   its error 31, and **I repeated the conflation in an earlier version of this brief** —
   "scope with `main...HEAD`, three dots, 26 non-merge commits" is the right flag attached
   to the wrong operation. **Use the table, not either of our sentences.**
5. **A reviewer worker, two rounds maximum, with no unresolved findings.** Your PM will tell
   you the reviewer has closed before you start.
6. **Deviations either reverted or recorded.**

**On CI timing: treat every figure anyone hands you as ONE SAMPLE.** The orchestrator's
relayed budget breakdown was measured wrong in **both** large terms — `apt` at 19 s not 25,
`npm test` at 58 s not 53. The overall 93–108 s band held while the composition did not, so
a total that lands in the band is **not** evidence the parts were right. Report what your
run actually took, per step, and do not reconcile it against a forecast.

**And one more that §6's list predates:** `ready-to-merge` now also requires **a green `ci`
run on a pushed branch.** Four local exit codes do not satisfy it — a local re-run shares
every environmental assumption with the run it is checking. This phase's defining defect was
a suite that was green for **every agent that ever ran it** and red on the only machine that
ships. Push the branch and report the `ci` run's conclusion and its URL.

---

## The baseline, and the composition trap — read before you compare any count

The branch's recorded baseline **at `b3e7601`** is:

| typecheck | build | build:site | test | files | passed | skipped |
|---|---|---|---|---|---|---|
| 0 (**475** files) | 0 | 0 | 0 | **96** | **2110** | **0** |

**It has been independently reproduced four times** by four different agents in four
different worktrees.

**⚠ That is the verification baseline, NOT what you will measure.** Implementer commits
landed after it and both counts move:

| at | files | passed | skipped | typecheck |
|---|---|---|---|---|
| `b3e7601` (verification baseline) | 96 | 2110 | 0 | 0 over **475** |
| `3d593fe` (I-F) | 96 | 2117 | 0 | 0 over **476** |
| `f352b99` (I-G) | 96 | 2122 | 0 | 0 over 476 |
| `cc46d3e` (I-H) | 96 | 2124 | 0 | 0 over 476 |
| **`6531698` (I-I) — the tree you gate** | 96 | **2128** | **0** | 0 over **476** |

Every row above was measured from a wipe of all three dist directories. **Zero net test
removals at every step**, by four independent instruments across the phase.

**⚠ A docs-only commit lands after `6531698`** carrying this brief and the phase ledger into
`docs/plans/handover/`. It touches no `src/`, no `site/` and no test, so counts must not
move. **But §9 records a `site/` test reddening on `docs/` edits** because prose churn is a
real upstream here. If anything reddens that parses documentation, **that commit is the
cause and it is the outgoing PM's, not a defect in the phase** — say so and strip it rather
than chasing it.

**The 476th typechecked file is `src/core/testing/roster.ts`**, created by I-F as the single
authority for `tsconfig()` / `compiledFiles()` and read by both purity suites. **A gate
runner comparing against the literal 475 will report a false regression.** Get the current
expected figures from your PM and reconcile them against the commit log; **do not treat any
number in this brief as current** — §9: *never carry the number; compare against the
branch's own recorded baseline.*

**The trap, raised by the orchestrator and worth stating precisely because it does *not*
apply the way it first looks.** A sibling phase found that two of its commits had each been
measured in parallel worktrees **against the same baseline**, so neither saw the other's
presence and **their deltas could not be summed.**

**That hazard does not bite this phase's verifier numbers, and here is why:** all four
clusters were **verifiers**. They mutated and reverted, made **no commits**, and each
measured the **same fixed sha, `b3e7601`**. Four measurements of one tree state are four
**confirmations**, not four deltas. There is nothing to sum, so there is nothing to
mis-sum.

**Where it *could* bite, and what you must check:** the implementer commits landing after
`b3e7601` (I-F, I-G, and possibly I-H) were taken **in-tree, sequentially**, each measuring
against its predecessor's HEAD rather than against a common base — which is the arrangement
that composes correctly. **Verify that is what actually happened** rather than taking my
word for it: if any two of those commits report deltas measured against the *same* parent,
their counts do not compose and the branch's true count is whatever one tree actually
measures. **Your own post-merge `npm test` on one tree is the authority**; every number in
any report, mine included, is subordinate to it.

### A number that matches the prediction is the ALARM, not the confirmation

**You will be given a predicted count before you run.** Treat a match as the hardest case to
clear, not as agreement.

The sibling phase's gate forecast 83 files / 1967 passed arithmetically, and the run
returned **exactly that**. Its runner treated the match as suspicious rather than
confirming, and it was right to: §9 records that **a wrong answer matching something already
written down is the hardest kind to catch** — an orchestrator once ran a gate in a worktree
checked out on the wrong branch and got back a plausible figure already in the record.
`git log <ref>` takes a ref; **`npm test` runs whatever is checked out**, and the two look
interchangeable.

**Disconfirm inside the same invocation as the test run** — not before it, not after:

```sh
( git rev-parse --short HEAD; git rev-parse --abbrev-ref HEAD; pwd; npm test ) > /tmp/t.log 2>&1
echo "test=$?"
```

That way the sha, the branch and the directory are stamped by the same shell that produced
the counts, and no later edit can make them disagree. The second disconfirmation is CI,
which re-runs on a different machine — that is the point of requirement 7.

**Report the vitest summary line verbatim.** Skips are counted from that line and **never**
from a glyph: `grep -c '↓'` returns **0 on a genuine 22-skipped run**. A parenthetical total
equal to the passed count — `Tests 2110 passed (2110)` — is positive proof of zero skips; an
unequal one is the alarm. This matters because invariant 11 says an unbuilt tree silently
skips the Pages-critical assertions and still reports green.

---

## Known and expected — do not report these as gate failures

- **`src/node/encode.test.ts > gifenc module interop`** flakes under load at a 20 s timeout.
  **`main` raised it to 60 s and your merge brings that**, so it should stop. If it still
  flakes, **re-run that file alone** before calling it a failure — single-file runs on a
  loaded box are safe; it is concurrent full suites that are not.
- Six `sweep()`-driven tests in `src/node/metamorphic.real.test.ts` were raised to 20 s for
  the same reason.
- **`svelte-check` will emit machine format for you** because you are an agent
  (`CLAUDECODE=1`) and human-verbose on the runner. **Your typecheck result is an
  agent-harness result**, exactly like every other tier's, and is *not* evidence about the
  shipping machine. That is the whole reason requirement 7 exists.

## Carry into the gate report as open and not this phase's to fix

- `18` inlined in prose at `site/controlspec.ts:522,539` and `site/index.html:223,224,299` —
  P3a-merged, **excluded from P7 criterion 6 by ruling** as prose-staleness.
- `src/node/canvas.vendored.test.ts:113` — the third `runLengths(…, 0.5)` site. **P3b's.**
- `src/shared/zipRead.ts:268` — *"No producer we target reaches this branch"* (CP437),
  unverified, and **six further refusal paths reached by no test** (deflate-stream failure,
  invalid-UTF-8 name, missing central signature, central-offset-not-a-local-header, split
  archive, expanded-size mismatch). Whether defensive dead branches need sensors is unruled.
- **`main`'s own harness fix still spreads `...process.env`** — a deny-list of one variable
  — plus six unaudited spawn sites in `src/node/` and `src/cli/`.
- **`build:site` catches one spelling of four.** `await import('node:fs')` on a reachable
  path exits **0** and **the needle ships**, with a dedicated `__vite-browser-external-*.js`
  chunk — so it defeats the constant-folding control too. Inside `src/shared/` the purity
  guard catches all three forms; **the hole is `site/*.ts`, which nothing guards.**
- **Criterion 7 names two producers and one exists** — there is no site-side `.stst`
  *writer*, and `containerRead.ts` is absent from `dist-site/`. Criterion 10's
  *"browser-reachable"* half is met **by construction**, not by a shipped bundle. Scope
  finding, not a defect; the import UI is P5's.
- **Case E** — an all-flat-graphics `.stst` is **+27.4% stored**. **With Shaun, unresolved.
  The container format is frozen; do not recommend changing it.**
- **The raw-bytes baked-mask hazard: +782 KB, +14,092%. P5 must be told before it bakes
  anything.** Carry this one explicitly.
- **Six of eight perception functions have no production caller** — only `measureInk` and
  `describeLegibility` do. P4's wiring is what makes them load-bearing, so a seam error
  (wrong unit, wrong argument order) stays undetectable until then.
- `depthBlur ≥ 1` is the smallest radius tried, **not a measured boundary**; whether a
  blurred edge cures cardboarding at all is the **design's claim, not a measurement**.
- **`"will not fuse however long you stare"`** is refuted verbatim by findings §1 and
  survives in **six** places. A *threshold* claim needing its own measuring round.

## Report

```
GATE RUN       date, branch sha before and after the merge, main sha merged
MERGE          clean | conflicted (⇒ you stopped and escalated)
EXIT CODES     typecheck · build · build:site · test — each with its own echo $?
COUNTS         files / passed / skipped, with the vitest summary line QUOTED verbatim,
               compared against 96 / 2110 / 0 plus whatever the merge and the
               implementer commits legitimately add
REMOVED TESTS  name + one-line reason, or "none", with your instrument and its control
CI             the pushed branch's `ci` run: conclusion, duration, URL
READY          ready-to-merge: yes | no — and if no, exactly which of the seven fails
OPEN           the carried list above, unchanged
UNCERTAIN      a gate runner reporting nothing UNCERTAIN has not looked
```

**You are the last sensor before a merge.** The orchestrator reads your report and merges on
it without re-verifying. If something looks right but you did not measure it, say you did
not measure it — on this phase, a plausible number that matched something already written
down is recorded as one of the hardest errors anyone made.
