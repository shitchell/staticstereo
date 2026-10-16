# I-H · implementer — the last three fixes before the gate

You are **I-H**, an implementer on P1/P7 of the staticstereo editor rewrite. PM is
PM-SHARED-4. Tier 2 of three.

**Read first, in full:**
`/tmp/claude-1000/-home-guy-code-git-github-com-shitchell-staticstereo/8b54946b-39f3-4e41-bb67-886b9d8bd96a/scratchpad/VERIFIER-COMMON-BRIEF.md`
— its §§0, 3, 4, 6, 7, 8 bind you. Ignore §1, §2, §9.

**Re-extract the docs snapshot yourself as your first act.** `main` moves most hours and the
last two implementers each caught a stale sha in their brief — the check is eight for eight:

```sh
M=$(git rev-parse --short main); mkdir -p /tmp/snap-$M
git archive main docs | tar -x -C /tmp/snap-$M
```

## Where you work

**In `/home/guy/code/git/github.com/shitchell/staticstereo-p1p7`, on `feat/p1p7-shared`,
in-tree. Do not create a worktree, do not detach.** You commit directly. **You are the only
implementer running and the box is free** — but a reviewer may run a single targeted file,
so prefer `npx vitest run <file>` for your loop and keep full `npm test` to the end of each
task. **Use the `git` wrapper on PATH**, never `/usr/bin/git`.

**Wipe `dist dist-site dist-player` before any measurement you trust** — three directories.
`npm run build` does not clean `dist/`, and a stale artifact once produced **4 reds where a
wiped rebuild gives 2**, with the spurious red reading *"emits no test file and no testing/
helper into dist/shared"* — **exactly like a genuine finding.**

## Your baseline — confirm it from a wiped build before changing anything

Branch is at **`f352b99`**, tree clean.

| | files | passed | skipped | typecheck |
|---|---|---|---|---|
| **`f352b99` — yours** | 96 | **2122** | 0 | 0 over **476** |

Do not compare against 2110/475 or 2117/476; both are earlier points on this branch.

## State

All four verifier clusters are complete; **every criterion of P1 (1–10) and P7 (1–8) is
MET** with independently re-established REDs. I-F and I-G have landed five commits of
finding-fixes. **You are the last implementer before the reviewer's round 2 and the gate.**
Your three tasks are the remaining unresolved findings; `ready-to-merge` requirement 5 is
*"a reviewer, two rounds, with no unresolved findings"*, so these must be fixed or recorded.

---

## TASK 1 — criterion 7's guard tests the fixture, not the construction

**Found by V-1.** The container is written with `method:'store'` so byte-identity holds **by
construction in every engine** — that is what criterion 7 was rewritten to require, after
the original *"CLI and site produce identical bytes"* was found satisfiable-today and
silently rot-prone. V-1 confirmed the code meets it: `container.ts:349-354` writes four
unconditional `method: 'store'` literals and nothing derives a method from content.

**But the guard does not test that.** V-1 planted
`method: p.data.length > 100000 ? 'deflate' : 'store'` in `writeStst` — **a textbook content
dependence, the exact class criterion 7 exists to remove** — and got **26 files / 421 tests
green**. The existing assertion tests "all-store for this fixture".

**Acceptance:** a content-dependent method selection in `writeStst` reddens something. Your
paired control is V-1's mutation (must redden) against the "pick the smaller of stored and
deflated" mutation (must also redden — an earlier commit's own sensor catches that one, so
confirm you have not merely re-implemented it).

**The hard part is not writing an assertion, it is writing one that cannot be satisfied
wrongly.** §6.5a: *a guard whose cheapest satisfying action is wrong will eventually be
satisfied wrongly.* A guard that greps the source for the literal `'store'` passes if
someone writes `'store'` in a comment. A guard that checks one fixture's entries is what
you are replacing. Aim at the **property** — every entry stored regardless of input — and
exercise inputs whose compressibility differs wildly, including an incompressible one and a
highly compressible one, so "all stored" is a claim about the writer and not about the data.

**Do not change the container format.** Case E — an all-flat-graphics `.stst` is **+27.4%
stored** — is **with Shaun and unresolved.** You are strengthening a sensor, not revisiting
a decision.

---

## TASK 2 — `src/core/purity.test.ts`'s failure message over-claims, the same way the comment did

**I-F's recommended follow-up, and it is cheap now because the authority exists.** I-F
closed `src/shared/purity.test.ts`'s containment hole and created
`src/core/testing/roster.ts` as the single authority for `tsconfig()` / `compiledFiles()`.
It reported that **`src/core/purity.test.ts:178-183`'s failure message over-claims in the
same shape** the `src/shared` comment did, and that **`src/core` has the identical layout
hole** — now cheap to close against `roster.ts`.

**Acceptance:** no failure message or comment in `src/core/purity.test.ts` asserts a
property the code does not have, and the layout hole is either closed or recorded with a
demonstration that it cannot produce a wrong green.

**Verify I-F's claim before you build on it** — it is relayed through me and I cannot check
it. In particular re-measure which `rootDir` / `outDir` spellings are actually silent here:
I-F found for `src/shared` that **`rootDir: "."` leaves build exit 0** and everything green
while `rootDir: "src/shared"` exits 2, so **the silent spelling was the one nobody tried.**
Do not assume `src/core` behaves the same.

**Trap, measured and expensive:** a mis-pathed `rootDir` makes `tsc` emit **52 `.js`/`.d.ts`
files into `src/` itself** — emitted *despite* exit 2 — which poisons every later
`build:site` with `Could not resolve "../shared/frames.js"`. **That reads exactly like a
genuine finding and it cost a cycle.** `rm -rf dist` does not undo it; `git clean -f --
'src/*'` does. Check `git status --short -- src/` after any `tsconfig.json` probe, **before**
you believe any later failure.

---

## TASK 3 — four citation chains that were true when written and falsified by this phase

All four are **ASSERTION-class** by §9's taxonomy — *now false, and a reader who trusts them
is misled* — as against a stale pointer, which costs a `grep`. All four are the reviewer's,
verified by it rather than relayed. **Verify each before fixing; the reviewer's measurements
reached me through two hops.**

**3a · The spent-proof pattern is SEVEN instances; five remain.**
`perception.fusion.test.ts:16`, `capacity.test.ts:11`, `collisions.test.ts:15`,
`stops.test.ts:15`, `cardboarding.test.ts:15` each assert `perception.test.ts` is
*"unmodified by this task, and keeping them that way is what lets them say anything about
it"*. `perception.test.ts` **was modified at `b3e7601`**, later than all five creating
commits. The phase already fixed the two primary instances — `perception.test.ts:26` and
`site/legibility.ts` both say *"'Unchanged' is past tense as of 2026-10-15"* — **and the
correction did not propagate to the five derived ones**, each of which cites the one before
it.

**3b · A four-file citation chain in which only the first link was checked.**
`perception.fusion.test.ts:14-15` names `perception.test.ts` as *"the behaviour-preservation
proof for the legibility move"*. `perception.test.ts:16-17` says **the opposite** — that
`site/legibility.test.ts` was, and that it is *deliberately not* a second copy of it.
`capacity.test.ts:9-11` inherits the error by reference, `cardboarding.test.ts:12-16` chains
off `capacity`, and `collisions`/`stops` repeat it.

**3c · "7 of 20" is 8 of 20, in four places, two of them production.** Recomputed over the
real 20-row `CONFIGS` table: **8 rows disagree** — `110.4/92.3`, `110.5/92`, `110/92.5`,
`99.7/2.2`, `92/110`, `110/1`, `110/0`, `50/-10`. Cited at **`src/shared/perception.ts:290`**
and **`src/core/sirds.ts:45`** (both production), plus `perception.capacity.test.ts:17` and
`perception.stops.test.ts:40-42`. **The test built to demonstrate the property is titled
*"is not the closed form — seven configurations tell them apart"* and its own table has 8
rows — the sensor contains its own refutation.** Recompute it yourself; do not take 8 from
me either.

**3d · `perception.test.ts:151-154` claims a pairing that exists in neither direction.** It
says the argument guard is the needle `site/dist.test.ts` greps for, *"so that a move which
kept the function and lost the guard is red at the module as well as in the bundle check"*.
It annotates the **dimension** guard (`/4×4/`); the only `measureInk` needle in
`site/dist.test.ts` is the **fraction** guard. **Report, do not fix, the cross-phase half:**
`dist.test.ts:1344` carries `source: 'site/legibility.ts'`, now a 33-line re-export shim
holding no such string — **`site/dist.test.ts` is P3b's and off-limits.**

**Acceptance for task 3:** no comment in those files asserts something false. **Amend in
place, in past tense, rather than deleting** — that is what the two already-fixed instances
did, and §9 warns separately that **a comment which is a verbatim quote of a ruling must be
corrected *beside* the quote, never inside it**, because editing it falsifies the record of
what was ruled.

**An instrument is a candidate here, not a requirement.** I-G built
`names no source path that does not resolve` for the pointer class, and the reviewer noted
it **covers none of these** — it checks path existence, in one file, with no line numbers,
no counts and no "unmodified" assertions. If you can cheaply instrument the *spent-proof*
class, that is worth more than five edits. I-G's own caution applies: **a repo-wide version
would redden on the many deliberate past-tense citations and needs a convention first.**
If you cannot, say so and fix the five.

---

## Known-open — do not re-report, do not fix

The common brief §7 list, plus: the `18`-in-prose group · `canvas.vendored.test.ts:113` ·
`zipRead.ts:268` and six further unreached refusal paths · `build:site` catching one import
spelling of four **and being blind to `site/` type errors** · Case E · the raw-bytes
baked-mask hazard · six of eight perception functions having no production caller ·
`"will not fuse however long you stare"` (a **threshold** claim needing its own measuring
round, surviving in six places — an implementer already correctly refused to fix one file
while six disagree).

**Two flakes are expected and are NOT yours**, both because this branch has not merged
`main`: `src/node/encode.test.ts > gifenc module interop` at a 20 s timeout, and
`src/node/metamorphic.real.test.ts`'s `sweep()`-driven tests **still at 5 s on this branch**
— `main`'s `9312529` raised them to 20 s and `encode` to 60 s. **The gate's `git merge main`
brings those raises.** Do not re-tune a timeout.

## Off-limits

`site/dist.test.ts`, `site/store*`, `site/hashprojection*`, `site/transport*`,
`site/controls*` (P3b's, live) · `src/node/canvas.vendored.test.ts`, `site/main.ts`,
`site/index.html`, `site/controlspec.ts`.

**`src/shared/purity.test.ts` and `src/core/purity.test.ts` are NOT off-limits to you** —
task 2 is in the second. I-F and I-G are both finished.

**Do not pin `--output` in `package.json`'s `typecheck` script** — proposed twice, ruled
against twice: the harnesses *append*, `mri` collects the duplicate into an array, and the
format silently reverts to human, reinstating the nine-hour bug.

## Commits

One per task, subject stating the **finding** not the action, body carrying the
**measurement, the paired control with both halves, and the reasoning**. Commit messages are
the durable record; **never cite a scratchpad path from a committed file.**

**Zero net test removals. None is pre-authorised.** If you think one must go, stop and report.

## Report

```
WHAT CHANGED · RED (quoted, per test) · GREEN · CONTROL (§6.5a both halves, values diffed
not pass/fail) · SUITE (wiped build; counts vs 96/2122/0, summary line quoted)
TYPECHECK (exit code, redirected not piped) · DEVIATIONS · REFUTATIONS · UNCERTAIN
```

**My acceptance criteria are the one artefact I cannot check against the code. On this phase
five of my predictions have been refuted by workers and every refutation was correct** —
I-G alone returned six, including that my claim "most thresholds have no witness" was false
(six of seven had one) and that my hand-written threshold list omitted the only blind
constant in the module. **If a criterion here is unsatisfiable or wrong, prove it and stop.**
