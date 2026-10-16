# Gate runner — P1/P7, branch `feat/p1p7-shared`

You are the **gate runner** for phases P1 (`shared/` and `.stst`) and P7 (perception). Your
PM is PM-SHARED-5 (the brief was written by PM-SHARED-4; the role handed over before you
were dispatched). You are tier 2 in a three-tier agent system.

**You implemented none of this phase, and that is the qualification for the role.** You run
§6's sequence and report numbers. You do not fix anything, you do not improve anything, and
you do not adjudicate a disagreement — you report it.

**DO NOT START UNTIL YOUR PM TELLS YOU THE GATE SLOT IS FREE.** Gate runs are serialised
across this phase and P3b because **four concurrent `svelte-check` harnesses have already
timed out a merged-phase test on this box**, and the count just went from three to four.
**Do not infer the slot from a quiet `ps`** — the other phase's run may not have started
when you look. Wait to be told.

Read first, in full — **its §§0, 3, 4, 6, 7, 8 bind you; ignore §1, §2, §9.**

**Durable source, use this one:**

```sh
git show main:docs/plans/handover/VERIFIER-COMMON-BRIEF.md
```

**Fallback only, and note the ordering wrinkle.** The scratchpad copy is at
`/tmp/claude-1000/-home-guy-code-git-github-com-shitchell-staticstereo/8b54946b-39f3-4e41-bb67-886b9d8bd96a/scratchpad/VERIFIER-COMMON-BRIEF.md`
(verified present, 22359 bytes). It is **session-scoped and does not survive the session**,
so it is a fallback and not the citation target. The wrinkle: this file is **not in the
branch's working tree** — it lives on `main` and only arrives in your tree *after* step 1's
`git merge main`. Since you read it *before* the merge, `git show main:…` is how you reach
it without waiting, and it works whether or not the scratchpad is still alive. Do not
`cat` the working-tree path pre-merge; it is not there, and an empty read is not a signal
you will notice.

---

## The sequence, exactly

Work **in `/home/guy/code/git/github.com/shitchell/staticstereo-p1p7`** on
`feat/p1p7-shared`. Confirm no implementer is live first (`git status` clean, and ask your
PM if in doubt).

```sh
# step 0 — tree MUST be clean; both must print nothing
git status --porcelain; git diff --stat HEAD

rm -rf dist dist-site dist-player                         # THREE dirs — SEE BELOW, not optional
git merge main || { echo "MERGE CONFLICT — STOP, ESCALATE, DO NOT RESOLVE"; exit 1; }
npm run typecheck > /tmp/tc.log 2>&1; echo "typecheck=$?"
npm run build      > /tmp/b1.log 2>&1; echo "build=$?"
npm run build:site > /tmp/b2.log 2>&1; echo "buildsite=$?"
( git rev-parse --short HEAD; git rev-parse --abbrev-ref HEAD; pwd; npm test ) > /tmp/t.log 2>&1
echo "test=$?"; head -3 /tmp/t.log; tail -5 /tmp/t.log
```

**This is the ONLY sequence — run this block, not a reconstruction of it.** An earlier
version of this brief wrote `rm -rf dist dist-site` here (two directories) while the prose
below said three, and wrote a bare `npm test` here while the disconfirmation section below
wrapped it. **A runner who copy-pastes the block got the wrong half of both.** The block
above is now the corrected one and the prose below explains it; if they ever disagree
again, the block is wrong and the prose is right, because the prose is where the
measurement that produced it is recorded.

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

**Step 0 is not a formality — it caught a real contamination on 2026-10-16.** A worker in
this worktree overwrote the TRACKED file `src/shared/perception.throws.test.ts`, replacing
its **246 lines with 8454** (451 KB of redirected command output), and left a stray
untracked `true` alongside it. Both were restored and removed before any gate run. Note what
this would have looked like if step 0 had been skipped: **a corrupted test file that still
parses**, producing a count nobody could reconcile and a red nobody could locate. Run

```sh
git status --porcelain          # must be EMPTY
git diff --stat HEAD            # must be EMPTY
```

and if either is not, **stop and ask your PM whose change it is** — do not `git checkout --`
it yourself on the assumption it is rubbish. One of those 451 KB could have been real work.

**Stopping is not enough: capture and report WHAT is dirty and how.** *"Dirty tree,
stopping"* hands the decision upward without the evidence needed to make it — it costs a
round trip and invites the next person to guess exactly as you correctly declined to.
Report:

```sh
git status --porcelain
git diff --stat
git diff -- <each tracked file>   # enough of it to judge; truncate huge ones and say you did
```

For an untracked file, say its name, size and first line. For a tracked file, the point of
the diff is to let your PM tell *deliberate work* from *redirected output*, which is the
only distinction that matters and the one you cannot make alone.

**⚠ A DIFFSTAT CANNOT TELL YOU A DIRTY TREE IS BENIGN. SEARCH THE CONTENT.** On 2026-10-16
a crash killed two implementers mid-task and left 44 modified lines across four files. The
diffstat read as ordinary small hand-edits — and two of those lines were a **deliberately
planted rot fixture that had not yet been reverted**:

```diff
-export function disparityBudget(stereo: StereoOpts): number {
-  return stereo.sepFar - stereo.sepNear
+export function disparityBudget(stereo: StereoOpts, comfortBias: number = 0): number {
+  return stereo.sepFar - stereo.sepNear + comfortBias
```

Plants are normal here — criterion 8's verification *requires* planting an optional
parameter and reverting it — so **any crash, timeout or interruption can leave one live.**

**This one would have passed the gate.** A default-valued parameter is behaviour-neutral at
every existing call site, so nothing reddens, every exit code stays 0, and the count does
not move. **Line count is the wrong discriminant**: the most dangerous diff a plant can
wear is a small, plausible, feature-shaped one.

So when step 0 is dirty, before anyone calls it ordinary, grep the diff for:

- **added parameters with defaults** — `grep -nE '^\+.*\([^)]*=[^)]*\)' ` over `git diff`
- **changed arithmetic** in a function body
- any identifier that appears in the diff and **nowhere else in the repo** (`git diff | grep '^+' ` then `grep -rn <ident> src/ site/`) — a plant's name is usually unique, and a plant that has been reverted leaves no hits

Ask your PM which worker owned the file and **whether that worker's task involved a plant**.
"The worker was doing criterion 8" is sufficient reason to treat every line of its diff as
suspect until it confirms its own revert.

**`git merge main` is step 1 and a conflict is an escalation, not a thing to resolve.** The
branch has not merged `main` since `8f9a36f`.

**Re-measured by PM-SHARED-5 immediately before your dispatch, because this paragraph was
wrong in both terms** — it said "a dozen `docs/` commits plus `9312529`":

| | measured |
|---|---|
| merge-base | `69abca9` |
| `git rev-list --count HEAD..main` | **36**, not a dozen |
| non-docs commits among them | **two**, not one: `9312529` *and* `2524fa4` |
| files touched by **both** sides | exactly one: `src/node/metamorphic.real.test.ts` |
| `git merge-tree --write-tree HEAD main` | exit 0, tree written — **no textual conflict** |

**`2524fa4` is the one the old sentence dropped, and it is the one that concerns you**: it
is `fix(test): pin the gate harness's output format; CI read it only by luck`, +122/−19
across `site/bindingregistration.test.ts` and `site/fitregistration.test.ts`. It changes
test files, so **the merge moves your count** — see the baseline section — and it touches
the harness-output question that the "known and expected" section below raises about
`svelte-check`. Check whether that note is still true after your merge rather than
repeating it.

**`main` moves every few minutes.** Re-run the two commands above yourself at the moment you
start; the table is a reading, not a constant. Note the direction: `HEAD..main` is what the
merge will bring you. `main..HEAD` is your own branch's work and is *supposed* to touch
`src/` — reading the escalation rule in that direction produces a false alarm, which is a
mistake already made once on this phase.

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

   ### ☠ `vitest list --json <anything>` SILENTLY OVERWRITES THAT FILE. IT IS DESTRUCTIVE, NOT MERELY NULL.

   **This is the worse half and it was found by reproducing the incident, not by reading
   the help.** `--json` takes an OPTIONAL VALUE, and cac binds the next bare token to it.
   So a token you intended as a **test-file filter** is consumed as `--json`'s **output
   destination**:

   ```sh
   # ☠ DESTRUCTIVE — overwrites the test file with ~8400 lines of JSON. exit 0. Silent.
   npx vitest list --json src/shared/perception.throws.test.ts

   # ☠ writes to a file literally named `true` in the project root, stdout empty, exit 0
   npx vitest list --json=true

   # ✅ SAFE — filter FIRST, --json left bare and LAST
   npx vitest list <filter> --json
   ```

   **This is exactly how `src/shared/perception.throws.test.ts` was destroyed in this
   worktree on 2026-10-16** — 246 lines replaced by an ~8400-line JSON dump, exit 0, no
   stderr, no error. The worker ran it twice believing the path was a filter. The stray
   `true` appeared on a later invocation, which then collected `[]` **because the test file
   it was filtering on had already been overwritten with JSON and no longer parsed as
   tests.** One mistake produced both symptoms.

   **Note what makes it worse than this project's usual failure.** The recurring hazard here
   is *a null from an instrument that was never armed*. This one is not null — **it is
   destructive, it targets whatever tracked file you name, and it exits 0.** Prefer the
   plain-text form (`vitest list`, no `--json` at all) unless you specifically need JSON.

   ### ⚠ `vitest list --json=true` WRITES TO A FILE CALLED `true` AND PRINTS NOTHING

   **The instrument this requirement depends on has a silent-empty failure mode, and it
   was triggered live in this worktree on 2026-10-16.** Measured by PM-SHARED-5, both
   spellings, from the repo root:

   | command | stdout | side effect | exit |
   |---|---|---|---|
   | `vitest list --filesOnly --json` | **10267 bytes of JSON** — correct | none | 0 |
   | `vitest list --filesOnly --json=true` | **0 bytes** | **creates a file named `true` in the PROJECT ROOT** holding the JSON | **0** |

   `vitest list --help` documents the flag as `--json [true/path]` — *"Print collected
   tests as JSON or write to a file"*. **The literal `true` is documented as meaning
   stdout and actually behaves as a filename.** The help text is the trap, not the
   protection.

   **Why this is a false green and not just mess.** A runner who writes
   `vitest list --json=true > before.json`, merges, then
   `vitest list --json=true > after.json` gets **two empty files**, `diff` reports no
   difference, exit 0 throughout, and the conclusion is *"zero net test removals"* —
   from an instrument that collected nothing and said so to a file nobody opened. That
   is §6.5a exactly: **a null from an instrument that was never armed.** The real
   incident here produced a `true` file containing `[]` — zero tests collected — with
   exit 0.

   **Use the bare flag and assert the output is non-empty before you trust a diff of
   it:**

   ```sh
   ./node_modules/.bin/vitest list --json > /tmp/before.json
   test -s /tmp/before.json || { echo "INSTRUMENT RETURNED NOTHING — do not proceed"; exit 1; }
   ```

   **The paired control required by §6.5a:** plant a rename in one test name, re-run the
   list, and confirm the diff reports it. An instrument that cannot show you a planted
   rename cannot show you a real removal. This control has been used successfully on
   this phase before (`main` 1882 vs branch 2110, planted rename detected).

   ### The instrument to use, and the control that actually bites

   Worker-specified and preferred over the JSON form, because it avoids the destructive
   flag entirely. `vitest list` is **collection-only** — it imports test files and runs
   `describe`/`it` registration but does **not** execute test bodies or hooks — and it
   **expands `.each` tables to one line per row**, which is the construct `grep` cannot
   see. Run it once pre-merge and once against a **materialised post-merge tree in a
   throwaway `/tmp` worktree**, never by merging the live branch to measure it:

   ```sh
   npx vitest list > pre.txt          # plain text, no --json
   npx vitest list > post.txt
   LC_ALL=C sort pre.txt  -o pre.sorted
   LC_ALL=C sort post.txt -o post.sorted
   LC_ALL=C comm -23 pre.sorted post.sorted    # lines only in pre = REMOVED
   ```

   Empty output from `comm -23` is **zero test names disappeared**, which is strictly
   stronger than net-zero — a count-only check hides a remove+add pair. `LC_ALL=C` is not
   optional; without it `comm` fails open and silently reports no overlap.

   **The control, and why this particular one:** in the throwaway worktree, delete **one
   row from an existing `.each` table** — not a whole `it.each(` line. A correct instrument
   reports exactly one removed name and nothing else. **A `grep` on `it.each(` reports zero
   change**, which is precisely why deleting a whole line is the weaker control and this is
   the right one.

   **Also check for the stray before you commit anything.** `git status --porcelain`
   showing `?? true` means someone ran the broken spelling; the file is untracked
   rubbish, delete it. It lands in the **project root**, not your cwd — it resolves
   against the project root even when invoked with `--root` from elsewhere.

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
ships. Report the `ci` run's conclusion, its duration and its URL.

**⚠ "Push the branch" does NOT trigger `ci`, and an earlier version of this brief said it
did.** Measured by PM-SHARED-5 in `.github/workflows/ci.yml`:

```yaml
on:
  push:
    branches: [main]      # ← main ONLY
  pull_request:
```

A push to `feat/p1p7-shared` matches **neither** trigger and produces **no run at all**. A
runner who pushes, sees no run, and reports "no CI failures" has reported a null from an
instrument that was never armed — which is §6.5a's own failure mode, at the one requirement
that exists because local exit codes share every assumption with the thing they check.

**You must open a PR.** The sibling phase did exactly this and its runs show as
`ci · feat/p3b-store · pull_request`. Confirm a run actually exists and is attributed to
your branch's head sha before reporting anything about it:

```sh
git push -u origin feat/p1p7-shared
gh pr create --base main --head feat/p1p7-shared --title '<phase> (gate run)' --body '<...>'
gh run list --branch feat/p1p7-shared --limit 5
gh run watch <id>          # then report conclusion + duration + URL
```

Also note: `ci` is not the only workflow — `pages.yml` exists and also runs. Report `ci`;
if `pages` runs and fails on your branch, report that too rather than filtering it out.

**For reference, `main` is currently GREEN**: run `38867425151`, `ci`, `main`, 1m36s, at
`ee553c2`. So a red on your branch is yours and not inherited — the nine-hour red on `main`
is closed.

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

### What the merge itself adds: +1 test case, 0 files — derived, not run

Measured by a worker reading the full diffs of both non-docs main-side commits, and
independently of any suite run:

| source | case delta | note |
|---|---|---|
| `9312529` → `src/core/anim/presets.golden.test.ts` | **+1** | one new `it(…)`: *"was not asked to regenerate its own expectation"* |
| `9312529` → `src/node/encode.test.ts` | 0 | timeout value only, 20 s → 60 s |
| `9312529` → `src/node/metamorphic.real.test.ts` | 0 | adds `SWEEP_TIMEOUT_MS` as a second arg to 3 existing `it.each` sites; the tables are untouched |
| `2524fa4` → both `site/*registration.test.ts` | **0** | zero case-producing lines added or removed; neither file uses `.each`, so no hidden table-row delta is possible |
| **merge total** | **+1** | |

**Files stay 96**: `comm` over the two trees' `*.test.ts` lists confirms **`main` adds no
test file the branch lacks** (the branch adds 16 that `main` lacks, which is its own work).

**Constructs this repo actually uses**, established by grep rather than assumed: `it(`,
`test(`, `describe(` (grouping only), `it.each(`, `describe.each(`, `it.fails(`,
`it.skipIf(`, `describe.skipIf(`. **No `test.each`, no `.only`, no `.todo`, no
`.concurrent`.**

**⚠ Do not treat `2128 + 1 = 2129` as your expected count.** Two things make that wrong.
Finding-fix commits for the review's F1–F8 are landing on this branch and will add cases of
their own — **get the current figure from your PM**. And the worker who derived the +1
flagged it against itself: *"suspiciously small; re-check if it matters to the gate's
pass/fail math."* It does matter. **Derive your own expectation from the commit log you
actually have, and remember that a count matching a prediction is the alarm.**

**The merge is semantically clean on the one overlapping file.** `src/node/metamorphic.real.test.ts`
is touched by both sides in disjoint regions: the branch adds `ABSOLUTE_INK_DEPTH` plus one
new `it(…)`, `main` adds `SWEEP_TIMEOUT_MS` and attaches it as an explicit timeout to three
`it.each` blocks. Case counts confirm coexistence rather than shadowing — **11 on
`main`, 12 on the branch, 12 in the merged tree.** No `.gitattributes` and no custom merge
driver, so `merge-tree`'s result is authoritative for a real `git merge` too.

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

**Disconfirm inside the same invocation as the test run** — not before it, not after. This
is already folded into the sequence block at the top of this brief; do not run a second,
bare `npm test` alongside it:

```sh
( git rev-parse --short HEAD; git rev-parse --abbrev-ref HEAD; pwd; npm test ) > /tmp/t.log 2>&1
echo "test=$?"
```

That way the sha, the branch and the directory are stamped by the same shell that produced
the counts, and no later edit can make them disagree. **Quote the stamp and the summary line
together in your report** — a sha reported separately from the counts is the thing this
guards against, so splitting them in the write-up discards the protection you just paid for. The second disconfirmation is CI,
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

  **This note is NOT made stale by the merge — checked, because it looked as though it
  should be.** `2524fa4`'s subject is *"pin the gate harness's output format"*, which reads
  like it closes exactly this. It does not: it pins the format only for the **`svelte-check`
  child process spawned by the `runGate()` helper inside
  `site/bindingregistration.test.ts` and `site/fitregistration.test.ts`** — a meta-test that
  clones a throwaway tree, runs the `typecheck` script via `child_process.spawn` with
  `--output machine` appended and `CLAUDECODE` deleted from that child's env. **A different
  and much narrower harness than the one this note is about.** The note concerns the
  top-level `npm run typecheck` — plain `svelte-check --tsconfig ./tsconfig.typecheck.json`,
  no `--output` flag — which is what `ci.yml`, `pages.yml` and this brief's own sequence
  block all invoke. `2524fa4` touches neither `package.json` nor either workflow. **So the
  agent-vs-runner divergence is fully intact and requirement 7 is undiminished.** Recorded
  because two commits whose names describe the same thing did not do the same thing, and
  the cheap reading would have retired a live warning.

## Carry into the gate report as open and not this phase's to fix

**Three of these have exact wording that must not be compressed.** They have each already
been degraded once by paraphrase, and the paraphrase is what makes them harmless-sounding.

- **The CLI/site value axis is UNSCOPED, with a floor of five.** Five container-reachable
  disagreements are pinned, and five is **what one probe covered, not a census**. The pins
  are **hand-listed with no enumeration mechanism**, so the suite **goes short *green* when
  a sixth appears** — the failure is silent and in the safe-looking direction. **Do not
  write "five known disagreements"**; that phrasing loses the entire finding, which is about
  the absence of a mechanism rather than the number five.
- **Criterion 24 is CLOSED-WITH-RECORD, not an open finding.** Do not re-raise it, and do
  not list it among unresolved items.
- **Criterion 25** (R22 obligation 1 has no criterion and no sensor) came from the same
  NOT-COVERED sweep. Measured citation counts: obligation 2 nine times, obligation 4 three,
  obligation 3 once, **obligation 1 zero.**

### §10.6 units — the reviewer's "three symbols deviate" is REFUTED, and this is §6 req 6

Measured by verifier U-2 at `fb8d2c8`, reading only via `git show`. **Report the finding
below, not the reviewer's version of it**, which is in the findings document as
NOT-COVERED item 5 and is wrong in one of its three claims and over-reaching in another.

| symbol | actual unit | deviates? |
|---|---|---|
| `quantisationStep` `:401` | normalised depth — `1/|disparityBudget|`, a **reciprocal** of scene px | only under a LITERAL reading; its own docblock at `:352` already denies it |
| `CollidingPair.gap` `:426` | normalised depth | **rule does not reach it** — §10.6 binds "every perception *function*"; `collidingPairs` returns a struct array |
| `DepthStop.depth` `:631` | normalised depth 0..1 | **NO — the design MANDATES it.** §5.3 requires the strip carry "two scales at once — depth 0..1 and the separation it maps to, in scene px", citing §10.6 while doing so |

**The reviewer's list is also incomplete**: `restingDepth` `:461` is a roster-listed
perception function returning normalised depth **with a docblock silent on units
entirely** — the only one of the set making no unit claim at all — and `measureInk`
violates the **"takes"** half too (its `depthMap` input is 0..1).

**The defect is in the rule's wording, not in three symbols.** Of thirteen roster-listed
perception functions, **exactly one** (`legibilityOf`) takes a bare scene-px number, so a
literal reading of *"every perception function takes and returns scene px"* is violated by
essentially the whole module from its first line. And the design already glosses its own
rule narrowly at §8.2: *"§10.6's rule about naming the pixel space was written for
scene-vs-device"* — under which a normalised-depth quantity is not a px quantity and
**none of the three deviates.**

**A DANGLING TIER-0 REFERENCE, found incidentally — now CLOSED.** §10.1's existing
deviation record cited *"recorded here per §6.6"* and **§6.6 did not exist**; design §6 had
only 6.1, 6.2, 6.3. So the project's single existing deviation record pointed at a
convention nobody could read, which is why U-2 fell back to plain English rather than
pretending to apply it. **§6.6 "Recording a deviation" now exists** at `a8f9edd`
(`editor-design.md:780`), along with §8.4 which also cited it.

### ✅ REQUIREMENT 6 IS SATISFIED — cite `a8f9edd`

**Verified by this PM rather than taken on report**: `a8f9edd` resolves, is an ancestor of
`main`, and `§10.6` carries the amendment with **the original wording kept verbatim
beside it** because other sections cite it.

**It is a RULE AMENDMENT under §6.6 point 4, not a deviation record**, and the distinction
is the whole ruling: nothing deviated, so there was nothing to record. The amended rule
reads *"Every px quantity crossing a boundary is scene px and is named as such… Normalised
depth (0..1) is a legitimate second axis and is not a px quantity, so this rule does not
bind it — but a symbol in normalised depth must say so."*

**Report requirement 6 as SATISFIED, citing `a8f9edd`.** Do not re-litigate the three
symbols; do not report them as open deviations. **`DepthStop` is named in the amendment as
the canonical both-axes case** — `depth` in 0..1, `name` as `` `${separation} scene px` `` —
which is §5.3's "two scales at once" built exactly as specified, and which is also F1's fix.

**Still open under the amendment, as a DOCUMENTATION GAP and not a deviation:**
`restingDepth`'s docblock is silent on units, and `measureInk`'s `peak`/`threshold` are
normalised depth on both the input and output side. Routed to an implementer; if it has
landed, cite its commit, and if not, carry it as open — **it does not block requirement 6**,
which the amendment settles on its own.

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

## ⭐ ONE REVIEW ITEM IS YOURS TO CLOSE, AND ONLY YOURS

**`site/dist.test.ts`'s `yuv444p` needle.** This is the top-ranked NOT-COVERED item in
`git show main:docs/plans/2026-10-16-p1p7-review-findings.md`, and it is **the single
inference in the entire two-round review that the reviewer could not execute** — because
confirming the tree-shaking step **requires a build**, and reviewers do not build. In the
reviewer's words: *"the single thing I most want a gate runner to close."*

**You are the only role in this phase that runs a real build, so this falls to you and to
nobody else.** You are already running `npm run build:site` for other reasons; this costs
you one extra inspection of output you will have produced anyway.

**What to establish.** Whether the `yuv444p` needle that `site/dist.test.ts` looks for
actually survives into the built output, i.e. whether the assertion is testing the shipped
bundle or testing nothing. Read the test first to see exactly what needle it greps for and
which built artefact it reads, then check that artefact **after** your `build:site`.

**Treat the pass as the suspicious case, not the reassuring one.** The known hazard here is
that this suite is full of assertions that are satisfied by an **unbuilt or stale tree**
rather than by a correct one — invariant 11 records that an unbuilt tree silently skips the
Pages-critical assertions and still reports green, and this phase has already had a stale
`dist/` manufacture a red that *"reads exactly like a genuine finding"*. So:

- If the needle is **present**: confirm it is present in a **freshly built** artefact, not a
  leftover. You wiped all three dist directories at step 0, which is what makes your answer
  worth more than the reviewer's would have been.
- If the needle is **absent**: that is a real finding and tree-shaking has removed it —
  report it, **do not fix it**, and do not adjust the test to match.
- If the test **does not actually read a built artefact at all** — if it greps source, or a
  fixture, or a path that does not exist post-wipe — then the assertion is vacuous and that
  is the most valuable answer available. Say so plainly. This exact shape (an assertion that
  sounds like it checks the shipped thing and does not) has already been found twice on this
  phase, once as docblock prose that was mistaken for a parity assertion.

Report it under its own heading. A gate report that omits it has left the review's top
uncovered item exactly as uncovered as it was.

## Report

```
GATE RUN       date, branch sha before and after the merge, main sha merged
MERGE          clean | conflicted (⇒ you stopped and escalated)
EXIT CODES     typecheck · build · build:site · test — each with its own echo $?
COUNTS         files / passed / skipped, with the vitest summary line QUOTED verbatim,
               compared against 96 / 2110 / 0 plus whatever the merge and the
               implementer commits legitimately add
REMOVED TESTS  name + one-line reason, or "none", with your instrument AND ITS CONTROL.
               `test -s` alone is not the control — it proves the file has bytes, not
               that the census can see a removal. Plant a rename and show it detected.
YUV444P        the review's top uncovered item, above — present in a freshly built
               artefact | absent | the assertion does not read a built artefact at all
CI             the PR's `ci` run: conclusion, duration, URL. A push alone triggers nothing.
READY          ready-to-merge: yes | no — and if no, exactly which of the seven fails
OPEN           the carried list above, unchanged, PLUS the disposition of every item in
               `git show main:docs/plans/2026-10-16-p1p7-review-findings.md`. Cite that
               document, not anyone's chat — it is the only record of seven findings that
               reached the orchestrator twice and were written down nowhere.
UNCERTAIN      a gate runner reporting nothing UNCERTAIN has not looked
```

**You are the last sensor before a merge.** The orchestrator reads your report and merges on
it without re-verifying. If something looks right but you did not measure it, say you did
not measure it — on this phase, a plausible number that matched something already written
down is recorded as one of the hardest errors anyone made.
