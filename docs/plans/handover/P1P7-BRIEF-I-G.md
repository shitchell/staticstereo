# I-G · implementer — three sensors that cannot see what they claim to watch

You are **I-G**, an implementer on phases P1/P7 of the staticstereo editor rewrite. Your PM
is PM-SHARED-4. You are tier 2 in a three-tier agent system.

**Read this first, in full:**
`/tmp/claude-1000/-home-guy-code-git-github-com-shitchell-staticstereo/8b54946b-39f3-4e41-bb67-886b9d8bd96a/scratchpad/VERIFIER-COMMON-BRIEF.md`

It was written for verifiers; its **§§0, 3, 4, 6, 7, 8** bind you identically — the paragraph
that outranks this brief, the doc snapshot, the traps, the §2 invariants verbatim, the
known-open list, the off-limits files. **Ignore its §1, §2 and §9.**

**`main` was `7eabfc8` when this was written and it moves most hours.** **Re-extract the
snapshot yourself as your first act** — do not trust any path in this brief:

```sh
M=$(git rev-parse --short main)
git archive main docs | tar -x -C /tmp/snap-$M   # mkdir it first
```

A predecessor was briefed with a sha two commits stale and caught it; that check is six for
six and it is cheap.

---

## Where you work

**In `/home/guy/code/git/github.com/shitchell/staticstereo-p1p7`, on `feat/p1p7-shared`,
in-tree. Do not create a worktree, do not detach.** You commit directly.

You are the only implementer running. **PM-SHELL-P3b is live in `…/staticstereo`.** Drive
TDD with targeted `npx vitest run <file>`; concurrent *full suites* are what produce false
reds on this box, not load average. **Use the `git` wrapper on PATH**, never `/usr/bin/git`.

**`rm -rf dist dist-site` before any measurement you intend to trust.** `npm run build`
does **not** clean `dist/`, and the contamination is disguised: a stale planted file gives
**4 reds where a wiped rebuild gives 2**, and the spurious extra red reads *"emits no test
file and no testing/ helper into dist/shared"* — **exactly like a genuine finding.**

---

## State of the phase

**All four verifier clusters are complete and every criterion they examined is MET** — P1
1–10, P7 1–8. Zero net test removals, established by three independent instruments.

**Your baseline is NOT the one in the common brief.** I-F has landed two commits
(`70718ea`, `3d593fe`) on top of `b3e7601`. Measure from a wiped build and confirm before
you start:

| | files | passed | skipped | typecheck |
|---|---|---|---|---|
| `b3e7601` (the common brief's figure) | 96 | 2110 | 0 | 0 over **475** |
| **`3d593fe` — yours** | 96 | **2117** | 0 | 0 over **476** |

The 476th typechecked file is **`src/core/testing/roster.ts`**, which I-F created as the
single authority for `tsconfig()` / `compiledFiles()`, now read by both purity suites.
**Anyone comparing against the literal 475 will flag a false regression.**

I-F's files — `src/shared/purity.test.ts`, `src/core/purity.test.ts`,
`src/core/testing/roster.ts` — **are landed and no longer locked, but they are not your
task.** Do not refactor them.

Your three tasks are **verifier findings**, not original criteria. All three are the same
shape — **a sensor that cannot see the thing it names** — and the third is the most
important thing this phase has produced.

---

## TASK 1 — `cardboarding` is misclassified, and the witness that should have caught it is no sensor at all

**Ruled by the orchestrator on V-4's measurement: `cardboarding` is `objective`. The roster
is wrong and the module is right.**

- `src/shared/testing/perceptionRoster.ts` declares `cardboarding: ['graded', …]`.
- `src/shared/perception.ts` says verbatim *"Objective and ungraded"*, and
  `src/shared/perception.cardboarding.test.ts` has a **passing** test titled `reports
  quantities and no grade` pinning the key set.

**Correct the framing before you start, because I relayed it wrongly and the orchestrator
has already corrected me:** this is **not** "criterion 2 is violated". `cardboarding`
returns a verdict plus three quantities, so it satisfies criterion 2 **either way**. The
real defect is that **`Grading`'s two values had no operative difference** — a weaker
sensor, not a broken criterion. Fix the classification, but do not describe it as a
criterion violation in your commit message.

**The census behind it is the actual finding, and it is what you must close.** V-4 measured
the `AssertNever` pair's detection rate per direction:

| direction | detectable |
|---|---|
| `graded → objective` | **0 of 13** |
| `objective → graded`, scalar/string return | 9 of 13 |
| `objective → graded`, object-with-a-number return | **blind** (`measureInk`) |

So the pair ratchets **membership** and is **no sensor on the classification at all**.
Nobody overclaimed — the file's own docblock says as much.

**Adopt the strengthening V-4 measured:** make the witness assert that **`graded` ⇒ the
answer owns a `grade` field**. That reddens **exactly one row of thirteen**, and it is
`cardboarding` — so the strengthening and the reclassification are a matched pair and each
is the other's control.

**Acceptance:** `cardboarding` is declared `objective`; the witness asserts `graded ⇒ owns a
`grade` field`; and you report the detection rate **in both directions after your change**,
measured the way V-4 measured it, so the remaining blind spots are stated rather than
implied. **If the `objective → graded` direction is still blind for object-returning
functions, say so plainly in the code** rather than letting the strengthening read as a
complete fix. §9: a recorded note is not a sensor — so if you can close that direction
cheaply, close it; if you cannot, the limit goes in the docblock in the same words you would
use to a reviewer.

---

## TASK 2 — a stale pointer created by the very commit that was fixing stale pointers

**`src/node/canvas.generics.test.ts:113-114`** names **`src/node/metamorphic.real.ts`**,
which **does not exist**, and describes `runLengths(…, 0.5)` sites that **the same commit
changed** to `ABSOLUTE_INK_DEPTH`.

The irony is the point and belongs in the commit message: `b3e7601` moved
`canvas.generics.test.ts` to **import** `INK_FRACTION` precisely because its old comment
pointed at `site/legibility.ts`, *"a bare `export *` shim holding no constant — a pointer at
a shim rots quietly"*. It then wrote a **new** pointer that was stale on arrival. **Same
failure shape, same file, same commit.**

By §9's taxonomy this is a **pointer**, not a false assertion — cheaper, and normally it
waits for the file to reopen. **You are reopening the file, so fix it now.**

**Acceptance:** no comment in `canvas.generics.test.ts` names a path that does not resolve
or describes code that no longer exists. **Check the whole file, not the two cited lines** —
§9: *"inserting into a file breaks citations into that file from elsewhere; sweep for
them"*, and the inverse, a file whose comments were written against an older version of
itself. Also sweep for **citations into this file from elsewhere** before you change line
counts.

**That file is this phase's by ruling.** `src/node/canvas.vendored.test.ts` in the same
directory is **P3b's and off-limits.**

---

## TASK 3 — the biggest finding of the phase, and it is now a §9 row

**A test that derives its expectations from the constant under test is blind to that
constant moving.** Measured by V-4:

- `INK_FRACTION` **0.5 → 0.9**: `src/shared/perception.test.ts` stays at **21 passed**.
- `TIGHT_MULTIPLE` **2 → 3**: `src/shared/perception.test.ts` stays at **21 passed**.
- **The only sensor that sees either move is the file using *literal* budgets.**

And the part that makes it worse than a gap: **a docblock amended specifically to avoid a
stale assertion cites that derivation as its proof.** So the cited mechanism is exactly why
the claim fails. That docblock is in **`site/legibility.ts`** and it is **false as written**,
which makes it the §9 assertion class — fix it.

**The standing rule the orchestrator has drawn from this, and your acceptance criterion:**

> Invariant 4 says assert on structure, not on values. **A threshold is the narrow
> exception: every threshold needs at least one literal-pinned witness**, or nothing in the
> suite can see it change.

**Acceptance:** every perceptual threshold in `src/shared/perception.ts` has **at least one
witness pinned to a literal**, such that changing the constant reddens something; and
`site/legibility.ts`'s docblock no longer cites a derivation as proof. Report the **before
and after detection matrix** — constant by constant, does a move redden anything — because
a claim that this is fixed is exactly the claim that was false before.

The thresholds V-4 and earlier work have named: **`INK_FRACTION` 0.5, `TIGHT_MULTIPLE` 2,
`FUSION_PLATEAU_BUDGET` 22, `FUSION_CLIFF_BUDGET` 32**, and `DEPTH_BLUR_RELIEF`. **Do not
take that list as complete** — derive the set from the module rather than from this
sentence, because §9 is explicit that a hand-written list of "the places that do X" goes
stale silently, and because **this brief's list is exactly such a list.**

**Two constraints that are easy to violate here:**

1. **The thresholds themselves must not move.** P7 criterion 5 permits the wrapper shape and
   the verdict string to change; **it does not permit a number to change.** You are adding
   witnesses, not re-calibrating. If adding a literal witness tempts you to adjust a
   constant so the test reads nicely, that is the failure this phase exists to prevent.
2. **A literal witness is not licence to pin everything.** Invariant 4 still governs
   everything that is not a threshold. Pin the threshold; assert structure elsewhere.

---

## Traps that bite these three tasks specifically

- **`npm run build` does not clean `dist/`** — see above; you will be bitten hardest.
- **A mis-pathed `rootDir` emits `.js`/`.d.ts` into `src/` itself, and `rm -rf dist` does
  not undo it.** I-F measured **52 untracked files** emitted into `src/` — `tsc` emits them
  despite exiting 2 — which then poisons **every later `npm run build:site`** with
  `Could not resolve "../shared/frames.js" from "src/web/encode.js"`. **It reads exactly
  like a genuine finding and it cost I-F a cycle.** The cleanup is
  `git clean -f -- 'src/*'`, not a `dist` wipe. If you mutate `tsconfig.json` for any
  probe, check `git status --short -- src/` afterwards **before** you believe any later
  build failure.
- **`rootDir: "."` is the silent one.** I-F measured `rootDir: "src/shared"` at **build
  exit 2** — so the build is already a sensor for that spelling — while `rootDir: "."`
  exits **0** and is the genuinely silent wrong green.
- **Rebuild inside every mutation.** Editing `src/core/*.ts` without rebuilding reddens
  `src/core/purity.test.ts:189` and `site/dist.test.ts:361`, which are staleness gates.
- **Apply mutations from patch files, never a glob or inline quoted string**, and confirm
  with `git diff --stat` before running. A shell expanded a `*` inside a mutation on this
  phase, both patches silently failed, and **both arms reported green.**
- **Never count skips with `grep -c '↓'`** — 0 on a genuine 22-skipped run. Read vitest's
  summary line; a parenthetical total equal to the passed count is positive proof of zero.
- **`npm run typecheck | tail` returns `tail`'s status.** Redirect and echo `$?`.
- **A float32 artefact is already recorded in this module's tests**: `new Float32Array`
  stores 0.9 as 0.899999976…, so an at-threshold sample can fall below a float64 threshold
  and the test then measures the representation rather than the metric. Task 3 will walk you
  straight into this.
- `src/node/encode.test.ts > gifenc module interop` flakes under load at 20 s on this branch
  (`main` has 60 s; you are not merging `main`). Pre-existing — not yours.

## Off-limits

`src/shared/purity.test.ts`, `src/core/purity.test.ts` (I-F is in them right now) ·
`src/node/canvas.vendored.test.ts`, `site/main.ts`, `site/index.html`,
`site/controlspec.ts` · `site/store*`, `site/hashprojection*`, `site/transport*`,
`site/controls*`, `site/dist.test.ts` (P3b's, live).

**Do not touch `"will not fuse however long you stare"**, which survives in six places. It
is refuted by findings §1 — a 16px stroke at an 18px budget was read exactly — but it is a
**threshold claim**, findings §5 explicitly declines to ship a replacement number on one
observer's data, and it needs its own measuring round. An implementer already correctly
refused to fix one file while six disagree.

**Do not pin `--output` in `package.json`'s `typecheck` script.** Proposed twice, ruled
against twice: the harnesses *append*, `mri` collects the duplicate into an array, and the
format silently reverts to human — the change intended to prevent the nine-hour bug would
reintroduce it.

## Commits

One per task, in the repo's idiom: a subject that states the **finding**, a body carrying
the **measurement, the paired control with both halves named, and the reasoning**. Commit
messages are the durable record; the scratchpad is not, and **a committed file must never
cite a scratchpad path.**

**Zero net test removals. None is pre-authorised.** If you believe a test must go, stop and
report.

## Report

```
WHAT CHANGED   files, one line each
RED            quoted failing output, per test, before the production change
GREEN          the passing output
CONTROL        §6.5a both halves for every null: the null, the instrument exhibited
               turning non-null, and the measured VALUES diffed — not pass/fail
MATRIX         task 1 and task 3 each require a before/after detection matrix
SUITE          rm -rf dist dist-site; build; build:site; npm test — exit codes and counts
               against 96 / 2110 / 0, quoting the summary line
TYPECHECK      exit code, redirected not piped
DEVIATIONS     anything done differently, and why
REFUTATIONS    anything here you measured false — expected to be non-empty
UNCERTAIN      an implementer reporting nothing UNCERTAIN has not looked
```

**My acceptance criteria are the one artefact I cannot check against the code, and on this
phase four of my six predictions have been refuted by workers — every refutation correct.**
If a criterion above is unsatisfiable as written, prove it and stop. That is a success.
