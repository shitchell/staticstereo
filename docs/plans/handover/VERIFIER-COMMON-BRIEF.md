# Common brief — P1/P7 verifier clusters (PM-SHARED-4)

You are a **verifier**. Read this whole file before your first command.

---

## 0. The paragraph that outranks everything else here, verbatim

> Your measurements outrank any assertion from your PM, **including its acceptance
> criteria** — the one artefact a PM cannot check against the code. Refuse an unsatisfiable
> criterion and prove why. If you cannot reach your PM, your final report is the channel of
> record; the mesh is unreliable, assume it.

This is not a formality. On this phase, the last five implementers produced **five
refutations of their PM's briefs and all five were correct** — two of the false premises
were the PM's, two were the plan's, one was a survey's. Anything below that you can measure,
measure. If this brief and the code disagree, the code wins and you say so.

Related, and binding: **if two instructions conflict, stop and report the conflict — do not
choose between them**, however clear each one is on its own.

---

## 1. What a verifier is, and what it is not

From execution plan §1.2:

> **Verifier** — fresh context, given the task's acceptance criterion and the **diff**,
> *not* the implementer's report. Must **re-establish RED itself**: stash the production
> change, confirm the test fails, unstash. A RED that cannot be reproduced is a gate
> failure. Nothing else in this system checks §2.1, so this check is the whole of it.
>
> **Verifiers are batched by criterion cluster, not one per task.** A cluster verifier
> re-establishes RED **individually for every task in its cluster**, so the §2.1 check is
> preserved in full — only the context boundary moves.

So: **you re-establish RED yourself, once per task, not once per cluster.** You have been
given the commits. You have deliberately **not** been given the implementers' reports —
their commit messages are part of the artifact under test and you may read them, but treat
every claim in them as a claim to check, not a fact to inherit.

**You write no production code and you make no commits.** You mutate, measure, revert. Your
worktree must be clean and your stash list empty when you finish. If you believe something
must change, that is a finding in your report, not an edit.

---

## 2. Set up your worktree

Your prompt names your worktree path and your cluster. Do this first:

```sh
cd /home/guy/code/git/github.com/shitchell/staticstereo-p1p7
git log --oneline -1 main            # MUST be ba433a0. If not, see §3.
git worktree add --detach <YOUR_PATH> b3e7601
cp -a /home/guy/code/git/github.com/shitchell/staticstereo-p1p7/node_modules <YOUR_PATH>/node_modules
cd <YOUR_PATH>
git log --oneline -1                 # MUST be b3e7601
```

`node_modules` is 129 MB; copy it, do **not** symlink it and do **not** `cp -al` it —
Vite writes into `node_modules/.vite` and a shared inode would corrupt the source tree.
`npm ci` also works if the copy looks wrong, but the copy is known-good for this lockfile.

**Do not merge `main`.** You verify `b3e7601` exactly, so your counts are comparable to the
branch's recorded baseline. The merge is the gate runner's step 1, later.

**Build before you test, always** (invariant 11) — `npm test` on an unbuilt tree silently
skips the Pages-critical assertions and still reports green. See §4.1, which is the single
most expensive trap on this cluster.

When you are completely finished, from the main worktree:
`git worktree remove --force <YOUR_PATH>`

---

## 3. The documents, and the version of them that is real

`main` is at **`ba433a0`**. The `feat/p1p7-shared` checkout is **behind `main` by several
`docs/` commits**, and the stale sections are exactly the ones you are governed by. This has
caught six PMs out of six.

**Read the planning documents from this snapshot, never from your checkout:**

```
/tmp/claude-1000/-home-guy-code-git-github-com-shitchell-staticstereo/8b54946b-39f3-4e41-bb67-886b9d8bd96a/scratchpad/docs-main-ba433a0/docs/
```

It is `git archive ba433a0 docs` extracted verbatim. **Confirm `git log --oneline -1 main`
is still `ba433a0` before you trust it**; if `main` has moved, re-extract it yourself with
`git archive <newsha> docs | tar -x -C <a fresh dir>` and say so in your report.

Required reading from that snapshot:

- `plans/2026-10-14-editor-execution-plan.md` — **§2 in full** (the eleven invariants),
  **§6 in full** (the gate, especially §6.5a), **§9 in full** (the trap table — hand to
  yourself, it is 50-odd rows and each cost a correction), and your criteria in **§7**.
- `2026-10-12-legibility-findings.md` — **required for P7 clusters**, optional otherwise.
  Note §2 **and** §5 were each corrected on 2026-10-15 and the §5 correction is the later
  one; §5 bullet 3 is the bullet design §10.3 and P7 criterion 5 actually cite.
- `plans/2026-10-13-editor-design.md` and `-requirements.md` as your criteria reference them.

---

## 4. Five things that will cost you a run if you do not know them

Each of these was paid for by somebody on this phase.

### 4.1 Rebuild inside every mutation

**Editing `src/core/*.ts` without rebuilding reddens `src/core/purity.test.ts:189` and
`site/dist.test.ts:361`** — those are build-staleness gates. `build:site` staleness reddens
`site/dist.test.ts:361` on its own. An implementer on this phase lost a whole mutation
matrix to this and attributed the staleness reds to its mutation.

So every arm of every mutation matrix is: mutate → `npm run build` → `npm run build:site` →
test. And revert → rebuild → test. If you skip the rebuild to save time, say so explicitly
and only for mutations confined to `.test.ts` files, which `dist/` does not contain.

### 4.2 Diff the measured VALUES, not the pass/fail — both halves, named

Execution plan §6.5a:

> **An unasserted `report()` or `[measured]` line is an instrument with no failure mode.**
> This repo holds roughly 126 of them: they print and nothing asserts them. So a claim of
> the form "nothing in the suite sees X", resting on that corpus, is inadmissible under this
> rule unless the measured **values** are diffed under the mutation rather than its
> pass/fail. Diff the values, sorted with their labels; raw order is unstable.
>
> **Anywhere this procedure is referenced, name both halves of it.** "Re-run the mutation"
> is an instruction to do half — it reproduces the reddened *tests* and not the moved
> *measurements*.

**This phase produced the proof that this matters, and it is the best single piece of
evidence the project has:** with a deliberately wrong fix applied (`runLengths` made
peak-relative), `src/node/metamorphic.real.test.ts` was **14/14 green with all 21
`[measured]` values byte-identical** — blind by pass/fail *and* by value. Any null you
report of the shape "HEAD cannot see this" must carry both halves or it is inadmissible.

And §9: **"my control proves the diff works"** — a control proves the instrument functions,
not that it pointed at *your* change. A control must be able to see the specific change
under test, not merely to see *something*.

### 4.3 Never spawn a child with `{...process.env}`

This is the bug that left `main` red for nine hours over eight commits and that **no tier of
this system could have seen by running the suite**, because the blindness was in the thing
all of them share: `svelte-check` 4.7.6's `getOutputFormat()` returns `machine` if
`process.env.CLAUDECODE === '1'` and `human-verbose` otherwise. Two harnesses spawned it
inheriting the environment, so the suite's behaviour depended on whether it was run from
inside Claude Code.

If you write any throwaway harness that spawns a child: minimum explicit environment,
pinned, every variable's presence justified. `src/shared/testing/spawnEnv.ts` exists for
this and is Node-only. Related: **async harnesses `reject`; they never `throw` from a
callback** — a failing `expect` inside `child.on('close')` escapes as an uncaught exception,
the promise never settles, and the test **hangs to the timeout instead of failing**. That is
what produced a fake 10m45s CI run.

### 4.4 Run single files, not concurrent full suites

Measured on this box: a deliberate 14-process CPU burst pushed the heaviest test only to
4079 ms, but **vitest's own worker fan-out inside a full run** is the amplifier. A single
file run alone on a loaded box is safe; concurrent *full suites* are what produce false reds.

**Another verifier cluster and the P3b PM are live right now.** So:

- Drive your mutation matrix with **targeted runs** — `npx vitest run <file>` — not
  `npm test`. This is faster and strictly more reliable.
- Run **at most one** full `npm test`, at the end, and report its exit code and counts.
- A red that looks like a timeout is a timeout until proven otherwise: **re-run that file
  alone before attributing it to a mutation.**

### 4.5 `src/node/encode.test.ts > gifenc module interop` flakes, and it is not yours

Pre-existing, under load, at a 20 s timeout (13.9 s loaded, 4.0 s alone). **Its timeout was
raised to 60 s on `main`, and you are not merging `main`**, so you have the 20 s version.
Do not attribute it to a mutation and do not report it as a finding — it is already known.
Six `sweep()`-driven tests in `src/node/metamorphic.real.test.ts` have the same shape and
were raised to 20 s for it.

---

## 5. The branch, its baseline, and the one number that must not move

Branch `feat/p1p7-shared`, HEAD **`b3e7601`**, 13 implementation commits plus one merge
(`8f9a36f`) on top of `main`.

Recorded baseline at `b3e7601`, as reported and **not independently verified — verifying it
is part of your job if your cluster is the one that lands first**:

| typecheck | build | build:site | test | files | passed | skipped |
|---|---|---|---|---|---|---|
| 0 (475 files) | 0 | 0 | 0 | **96** | **2110** | **0** |

**Zero net test removals is claimed across all thirteen commits and no removal is
pre-authorised on this phase.** If you find one, that is an escalation, not a note. The
instrument that settles it is a `vitest list --json` name-set diff between `main` and the
branch — and per §6.5a it needs a paired control (rename one `it()` in a probe tree and
confirm the diff detects it). Note: **two-dot `git diff main HEAD` shows a spurious doc
deletion; three-dot is required.**

Counts are compared against **this branch's own recorded baseline**, never a figure from a
document (§9: "the suite is *N* tests — never carry the number").

---

## 6. Invariants, verbatim from execution plan §2

Read them from the snapshot too; they are reproduced here because a pointer is unsafe for
anything added mid-phase.

1. **TDD is mandatory.** No production code without an observed failing test. Report RED
   and GREEN output. A test that passed first run is not evidence.
2. **`src/core/` imports nothing from `src/node/` or `src/web/`.** Svelte exists only in `site/`.
3. **Comments carry rationale, not description.** A constant with no recorded reason is a
   review failure. Match the surrounding density.
4. **Assert on structure, not on values.** Pin the guarantee, not today's output.
   *(Standing narrow exception: the preset golden. Legitimate only when all three hold — it
   pins the output of a pure deterministic compiler; its inputs are enumerable from a
   registry rather than hand-listed; and it exists to prove a refactor preserved behaviour.)*
5. **Never alpha-blend depth.** `depth[i] = max(depth[i], layerDepth × mask[i])`.
6. **Perceptual thresholds live in functions, never inlined** (R22).
7. **Name the pixel space** wherever a count appears — scene px, plate px, backing-store px
   (×`noiseScale`, default **2**), device px (×snap scale ÷ dpr). Four spaces, not two.
8. **Do not reformat or tidy files you were not asked to change.**
9. **Use the `git` wrapper on PATH**, never `/usr/bin/git`.
10. **No time estimates**, in code or reports.
11. **Build before you test**, always. `npm test` on an unbuilt tree silently skips the
    Pages-critical assertions and still reports green.

Invariant 1 has a specific consequence for you: **a test that passed first run is not
evidence**, so where an implementer recorded "no RED was available, discharged with §6.5a
paired controls instead", your job is to check that the controls are real and that both
halves are present — not to demand a RED that cannot exist.

---

## 7. Known-open items. Do not re-report these as discoveries.

They are already in the gate report as open and not this phase's to fix. Confirming or
refuting one is welcome; presenting one as new is noise.

- `18` inlined in shipped prose at `site/controlspec.ts:522,539` and
  `site/index.html:223,224,299` — P3a-merged, reclassified as prose-staleness and **excluded
  from P7 criterion 6 by ruling**.
- `src/node/canvas.vendored.test.ts:113` — the third `runLengths(…, 0.5)` site. **P3b owns
  that file. Off-limits.**
- `src/shared/zipRead.ts:268` — *"No producer we target reaches this branch"* (CP437 entry
  names). Unverified claim-shape, one branch over from the claim P1.2 refuted. Open.
- `main`'s own harness fix still spreads `...process.env` in three site harnesses — a
  **deny-list of one variable** — plus six unaudited spawn sites in `src/node/` and `src/cli/`.
- **Nothing guards `site/*.ts` imports** the way `purity.test.ts` guards `src/shared/`;
  `build:site` is fail-open for the side-effect import form.
- §9's `build:site` row is **incomplete** — three cases measured; the exit 1 is Rollup
  failing to resolve a named export off `__vite-browser-external`, **not** a purity check.
- **Case E**: an all-flat-graphics `.stst` is **+27.4% stored** vs deflated. **Escalated to
  Shaun and unresolved — do not change the container format or recommend changing it while
  that is open.**
- The raw-bytes baked-mask hazard: +782 KB / +14,092%. Routed to P5.
- `depthBlur ≥ 1` is the smallest radius tried, **not a measured boundary**; whether a
  blurred edge cures cardboarding at all is the **design's claim, not a measurement**.
- **`"will not fuse however long you stare"` is refuted verbatim by findings §1** — a 16px
  stroke at an 18px budget was read exactly — and survives in **six** places. It is a
  *threshold* claim needing its own measuring round and is **deliberately out of scope**.
  An implementer correctly refused to fix one file while six disagree.

Two corrections you inherit, both of which were asserted in earlier briefs and are false:

- **`site/legibility.test.ts:228`'s `toMatch(/sepNear/)` is INERT as a sensor for the advice
  change.** The verdict line prints `(sepFar 110 − sepNear 92)`, so the regex matches the
  quantities, not the advice. Three briefs claimed otherwise. **Do not cite it as a sensor.**
- **SURVEY-C's `src/shared/perception.ts` line numbers run uniformly ~10 short**, and its
  `src/cli/scene.ts:513-532` citation points at the preset-registry guard, which is
  unrelated. Four of its numbers have already fallen. **Re-verify any figure relayed from a
  survey before you build on it.**

---

## 8. Off-limits files

- `src/node/canvas.vendored.test.ts` — P3b's.
- `site/main.ts`, `site/index.html`, `site/controlspec.ts` — P3a-merged.
- `site/dist.test.ts`, `site/store*`, `site/hashprojection*`, `site/transport*`,
  `site/controls*` — P3b's, live right now.

`src/node/canvas.generics.test.ts` **is** this phase's, by ruling. You may mutate any file
temporarily for a measurement — including off-limits ones, inside your own detached
worktree, reverted immediately — but a *finding* about an off-limits file is reported, never
fixed.

---

## 9. What your report must contain

Report in this shape. Your report is the channel of record; assume your PM cannot be reached.

```
CLUSTER        id, worktree path, HEAD sha verified
SETUP          node_modules provenance; main sha confirmed; build exit codes
PER TASK       one block per commit in your cluster:
                 COMMIT      sha + subject
                 CRITERION   the criterion text it claims to meet, quoted from §7 of the plan
                 RED         how you re-established it YOURSELF — the mutation, the
                             rebuild, the command, the quoted failing output
                 GREEN       the passing output after revert
                 CONTROL     §6.5a both halves where the evidence is a null:
                             the null, AND the instrument exhibited turning non-null,
                             AND the values diffed, not only the pass/fail
                 VERDICT     criterion MET | NOT MET | UNSATISFIABLE-AS-WRITTEN | UNCHECKABLE
                 NOTES       anything the commit message claims that you could not reproduce
SUITE          one full `npm test` at the end: exit code, files/passed/skipped vs baseline
TYPECHECK      exit code (redirect to a file and echo $? — a pipeline returns tail's status)
REMOVED TESTS  name + reason, or "none", with the instrument you used and its control
REFUTATIONS    anything in this brief, in a commit message, or in a criterion that you
               measured to be false. Expected to be non-empty. Quote your measurement.
UNCERTAIN      a verifier reporting nothing UNCERTAIN has not looked.
```

A verdict of **UNSATISFIABLE-AS-WRITTEN** is a success, not a failure, and it must carry the
measurement that proves it. A criterion on this phase has already been found false as
written (P7.4's "assert the strip width equals the margin width" is false at every odd
`sepFar`), and the agent that caught it refused to dispatch the sentence.
