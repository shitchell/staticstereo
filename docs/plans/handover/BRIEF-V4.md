# V-4 · P7 sensors + text — verifier cluster brief

> **ADDENDUM, written after V-3 returned. It is later than the body below and wins where
> they conflict. Whoever dispatches this brief must include it.**
>
> V-3 verified the P7 objective half and returned **MET on every commit**, with the recorded
> baseline (96 files / 2110 passed / 0 skipped, typecheck 0 over 475) **reproducing exactly
> for the first time independently**. It produced six refutations; four land in your cluster.
> **All of them are relayed and unverified by your PM — verify them, do not build on them.**
>
> **A. `cardboarding` is declared `graded` in YOUR roster and `objective` in the module, and
> both ship.** `src/shared/testing/perceptionRoster.ts:189` declares `cardboarding:
> ['graded', …]`; `src/shared/perception.ts:1175` says verbatim *"Objective and ungraded"*;
> `src/shared/perception.cardboarding.test.ts:440` is a **passing** test titled `reports
> quantities and no grade`, pinning the key set to `['blurRelief','cardboarding','depthBlur',
> 'relief']`. If the roster is right, **P7 criterion 2 is violated.** V-3 reported the
> conflict rather than choosing — correct. Its judgement, offered as judgement and not
> measurement: the module is the stronger position, because design §10.5 names a boolean and
> R22 obligation 4 forbids inventing a severity. `perceptionRoster.ts` and
> `perception.contract.test.ts` are **yours** (`9d0ea36`, `b3e7601`). V-3 could see the
> defect but not the artefact; you can see both. **Settle it by measurement.**
>
> **Your PM's error, recorded so you do not inherit it:** V-3's brief classified
> `cardboarding` as graded, on **no measurement** — inferred from a ledger sentence about
> `blurRelief` being "the one number a consumer would put on a scene-px axis". That is a PM
> restating its own reasoning as fact. Treat the PM's classification as evidence in neither
> direction.
>
> **B. The `GRADING` table has no sensor in the objective direction — and your criterion 2
> rests on it.** Measured by V-3: flipping `cardboarding` `'graded' → 'objective'` reddens
> **nothing** (48/48 green across the contract, cardboarding and throws files); flipping
> `fusionComfort` the same way also reddens **nothing** (9/9 green). The witness checks only
> *graded ⇒ returns a finite number*, which its own docblock admits. §1 below has you verify
> the ratchet catches `legibilityOf` reverting to a bare string — that is the **graded**
> direction. This is the **objective** direction and it looks open. Reproduce both flips and
> establish whether a ratchet blind to a `graded → objective` demotion is a sensor at all.
>
> **C. Criterion 2 is now YOURS IN FULL, both halves.** The cluster split was the PM's
> artefact and V-3 refuted it: criterion 2's *sensor* is one table authored in your commits
> that governs V-3's objective functions, and the live defect sits in V-3's half. You may
> range over the objective functions' **declarations** as far as the roster and the contract
> test reach. Do **not** re-verify their **behaviour** — V-3 did, with discriminating
> mutations on all seven, and reported MET.
>
> **D. Two roster entries V-3 flagged and deliberately did not call, both declared
> `objective`.** `describeLegibility` returns only a verdict string with the numbers embedded
> as text, exempted "by nature" — and it is **explicitly yours**, named by criterion 1
> alongside `legibilityOf`, with design §10.3 saying lead with quantities. Whether
> "quantities embedded in a sentence" satisfies criterion 2 is a real question nobody has
> answered. `reliefOf` returns a three-valued categorical (`flat`/`relief`/`undecided`),
> which is close to a grade.
>
> **E. Two measured facts sharpening §4 below.** V-3 reproduced `be348d1`'s "HEAD cannot see
> it" null and found it **true at pass/fail and not clean at the value level** — two
> unasserted `[measured]` lines moved (`linked white fraction 0.5036 → 0.5042`, and an
> odd-separation scale figure `0.8347 → 0.8344`). Nothing reddens because both are unasserted
> instruments. That is §6.5a's second half finding a real gap **on this phase**, and your §4
> task is the same procedure on a bigger claim. Also: *"nothing in this repo sweeps an odd
> separation"* is **true of `sirds.linked.test.ts` and false of the suite** —
> `site/scale.test.ts` exercises `sepFar 111`. Be precise if you restate it.
>
> **F-bis. From V-1, which has also now returned (P1 criteria 1/2/3/5/7/8/9, all MET,
> baseline reproduced a second time independently).** Its test-removal census — a different
> instrument from V-3's, TypeScript-parsed titles at merge-base `69abca9` vs `b3e7601`,
> `LC_ALL=C`-sorted — found **three vanished titles, all in `site/legibility.test.ts`, which
> is YOUR criterion 5's file**, with the file going 33 → 36 names. Two are renames. The
> third is **not a title tidy — it is a semantic reversal of the advice**:
> `describeLegibility > offers widening sepNear as well as enlarging the text` is replaced by
> `does not offer the budget as a second fix — the purchase does not exist` **plus** `still
> tells the author the one thing that does help`. This is plan-authorised (criterion 5 says
> that test will redden and that this is the test doing its job), so it is **not** a removal.
> **Your job is to verify the replacements assert the right thing** — that the first really
> pins the absence of the trade and the second really pins the surviving advice — not merely
> that something replaced it. §9: *"registered" means the entry appears* — a replacement test
> must assert what a consumer can now do, not that a name exists.
>
> **F. A trap V-3 paid for, inherited.** Its first attempt at a decisive run patched a file
> via `eval` on a quoted string, and **the shell expanded the `*` in `DEPTH_BLUR_RELIEF *
> stereo.noiseScale` into a directory listing.** Both patches silently failed and **both arms
> reported green** — a clean false null that would have "confirmed" a commit for the wrong
> reason. It was caught only because an `IndentationError` printed above the green counts.
> **Apply mutations from patch files, never inline quoted strings, and confirm the file
> actually changed before you run anything.**

You are **V-4**, a verifier cluster on phase P7 (the perception module) of the staticstereo
editor rewrite. Your PM is PM-SHARED-4. You are tier 2 in a three-tier agent system.

**FIRST, read this file in full before any other command:**
`/tmp/claude-1000/-home-guy-code-git-github-com-shitchell-staticstereo/8b54946b-39f3-4e41-bb67-886b9d8bd96a/scratchpad/VERIFIER-COMMON-BRIEF.md`

It carries the paragraph that outranks this brief, your worktree setup, the five traps that
will each cost you a run, the §2 invariants, the known-open items you must not re-report,
the off-limits file list, and your report format. Everything below is *in addition* to it.

## Your worktree

`/home/guy/code/git/github.com/shitchell/staticstereo-v4`

Detached at `b3e7601`, `node_modules` copied in. One other verifier is running concurrently
and the P3b PM is live in `…/staticstereo`. **Targeted `npx vitest run <file>` for your
mutation matrix; at most one full `npm test`, at the end.**

## Required reading beyond the common brief

`docs/2026-10-12-legibility-findings.md` **from the snapshot**, in full. It was corrected
**twice** on 2026-10-15 and **the second correction is in §5**. §5 bullet 3 is the bullet
that design §10.3 and P7 criterion 5 actually cite; §2 was fixed first and §5 was left
carrying the identical reversed mechanism for a while. Both are now correct in the snapshot.
If your checkout's copy disagrees with the snapshot, the snapshot wins and you say so.

## Your cluster: P7 criterion 2 over `legibilityOf`, plus criteria 5, 6, 7, 8

| Criterion | Claimed evidence |
|---|---|
| **2** graded functions return quantities **and** a grade — **restricted here to `legibilityOf` / `describeLegibility`** | `b3e7601` |
| **5** today's legibility rule moves in with **no threshold change**; the wrapper shape is the permitted change, the numbers are not | `b3e7601` |
| **6** no perceptual **threshold** inlined outside `perception.ts`, against a named list fixed before dispatch | `b3e7601` |
| **7** R22 obligation 2 has a sensor: **no perception function throws on any `StereoOpts`**, inverted case included | `ae79268` *(R22's "never refuses" was honoured by two signatures and seen by none)* |
| **8** R22 obligation 4 has a sensor: **no perception signature takes a subjective parameter** | `9d0ea36` *(the subjective-parameter rule needed a roster that cannot go short)* |

Criteria **1, 3, 4** and criterion 2 over the *objective* functions are **V-3's**. The split
across P7 is exhaustive.

## Claims needing an independent measurement

1. **Criterion 2 was NOT satisfied by `legibilityOf`, and the measurement is what decided
   it.** The ruling: satisfied-with-rationale only if the function derives no quantity the
   caller cannot cheaply recompute. It derived exactly one — `budget × TIGHT_MULTIPLE`, the
   stroke in scene px at which the grade turns `clear`. `budget` and `medianRun` are
   arguments; `TIGHT_MULTIPLE` is not, and a caller can only reach it by importing a second
   name and repeating the multiply. There was a **live witness** of precisely that:
   `site/legibility.test.ts` wrote `legibilityOf(at(18 * TIGHT_MULTIPLE - 1), 18)` — a
   downstream copy of a perceptual boundary's arithmetic, which is the shape criterion 6
   forbids. So it now returns `{medianRun, budget, clearAt, grade}`, mirroring
   `FusionReading`. **Verify the derived-quantity argument, and verify the witness was real.**

   The sensor claim on top of it is the interesting one: **`legibilityOf` reverted to a bare
   string left the contract roster 5/5 GREEN**, because `SIGNATURES` and `ArityDrift` both
   read `Parameters<F>`, so a **return type moves no key and criterion 2 had no sensor at
   all.** Closed with a `GRADING` table on the same self-enumerating ratchet. Reproduce that
   null with both halves.

2. **Criterion 5: the fix was to DELETE the trade, not to invert a direction — and the
   original sentence was wrong in four documents at once.** The plan, the handover, the
   findings doc and three briefs all said the branch *"tells the author to widen the
   budget."* The shipped string said the **opposite**: *"raise `sepNear` to **shrink** the
   budget"*, which makes fusion **easier**, not harder. The advice is bad for a different
   reason — it **trades away depth range and buys nothing for legibility**, because findings
   §1 round 2 held the stroke at 14px and swept the budget over 10/18/24/30px for **4/4 exact
   reads**. The threshold is an absolute stroke width and the budget is not a lever on it,
   so the line advertised a real cost against nothing.

   Claimed removed from **both** the `illegible` and the `tight` branch, from `fusionComfort`'s
   docblock (which had copied the superseded sentence in, ~80 lines above code saying the
   reverse — **the module contradicted itself in its own comments**), from `README.md` and
   from `examples/scrolling-text.yaml`. Also: `${TIGHT_MULTIPLE}×` was that constant's only
   user-facing appearance, so the `tight` branch now prints the boundary twice —
   `36 px (2× the budget)`, **quantity first per design §10.3**.

   **THRESHOLDS CLAIMED UNMOVED, and this is criterion 5's hard half — verify every one:**
   `INK_FRACTION` 0.5 (`:112`), `TIGHT_MULTIPLE` 2 (`:122`), `FUSION_PLATEAU_BUDGET` 22
   (`:1221`), `FUSION_CLIFF_BUDGET` 32 (`:1243`), and **both grade ladders unchanged in form
   and in constants.** The criterion permits the wrapper shape to change and permits a
   verdict *string* to change; it does **not** permit a number to move.

3. **`site/legibility.test.ts:228`'s `toMatch(/sepNear/)` is INERT and three briefs said
   otherwise — this is orchestrator error 26.** The verdict line prints
   `(sepFar 110 − sepNear 92)` to make the budget checkable, so the regex matches the
   **quantities**, not the advice, and that half of the old assertion passes identically
   before and after. **Do not accept it as a sensor and do not cite it as one.** Confirm the
   inertness yourself — if it turns out to be live after all, that reverses a recorded
   tier-0 error and is a major finding.

4. **Criterion 6: one site imports, two must not, and the distinction must be measured
   rather than asserted.** `src/node/canvas.generics.test.ts`'s `inkExtent` now **imports**
   `INK_FRACTION` (its comment had pointed at `site/legibility.ts`, a bare `export *` shim
   holding no constant — **a pointer at a shim rots quietly**). But
   `src/node/metamorphic.real.test.ts`'s **two** `runLengths(…, 0.5)` calls get a **local
   `ABSOLUTE_INK_DEPTH`** instead, because `runLengths` compares `depth > threshold`
   *absolutely* while `measureInk` compares `depth >= peak × INK_FRACTION`. They agree only
   at full layer depth — and the **comparison differs too, `>` against `>=`**, unobservable
   only because depth is k/255 and never exactly 0.5. Those sites are the authority for the
   calibration table `perception.ts` publishes and `README.md` reprints, so coupling them to
   a constant scheduled to move would **re-measure the table silently**. That is a standing
   ruling: *name the constant locally with the discrepancy recorded; do not import
   `INK_FRACTION` into absolute-ink-definition sites.*

   **The decisive control, and it is the best single piece of evidence this project has
   produced.** With the **forbidden** fix applied — `runLengths` made peak-relative —
   `metamorphic.real.test.ts` was **14/14 GREEN with all 21 `[measured]` values
   byte-identical.** Blind by pass/fail **and** by value. **Reproduce that.** If it holds it
   simultaneously vindicates the standing ruling and proves the suite cannot see a change it
   ought to; if it does not hold, the ruling needs re-examining. Either answer is worth the run.

   Counting notes: the `18`-in-prose group (`site/controlspec.ts:522,539`,
   `site/index.html:223,224,299`) is **excluded from criterion 6 by ruling** as prose-staleness.
   `src/node/canvas.vendored.test.ts:113` is the **third** `runLengths(…, 0.5)` site and is
   **P3b's — off-limits**, carried in the gate report as open. `src/core/metamorphic.test.ts:706`
   is claimed to be a separator over a binary map, not a perceptual threshold — check that.
   The criterion text says `canvas.generics.test.ts:107`; the measured line is **`:106`**, with
   the `INK_FRACTION` comment at `:99`. The criterion's line number is stale.

5. **Criterion 7's qualifier IS the sensor.** "No perception function throws", written flat,
   **contradicts two assertions already in the suite**: `perception.test.ts`'s *refuses an
   index the scene does not have* (`soloLayerScene`) and `site/legibility.test.ts`'s *refuses
   a fraction outside (0, 1]* (`measureInk`). Neither takes a `StereoOpts`, so **the stereo
   is the only axis that varies**; every other argument comes from the roster and is valid.
   Verify that scoping is honest and that neither existing guard was weakened.

   Sizing, claimed measured rather than guessed: 31 boundary values swept one field at a time
   (155), the separation pair exhaustively across cross and algorithm (3,844), the scaling
   pair exhaustively at a normal and an inverted separation (1,922) — **5,921 cases before a
   single random one** — then 100,000 fixed-seed random cases (mulberry32, seed 20261015).
   **105,921 × 13 functions = 1.38 M calls, 2.9 s against a 48 s suite**; 20,000 was measured
   first at 0.7 s and found nothing more. `algorithm` is deliberately **not** swept over
   invalid strings (reachable only through a cast). **Re-time it with the default reporter** —
   §9: `--reporter=json` under-reports `beforeAll`-heavy files by up to 1500×.

   The control is `resolveStereo` — **not a planted throw, but the actual function the module
   is structured to avoid calling** (it throws at `render.ts:121-127` on `sepNear >= sepFar`,
   precisely the case R22 obligation 2 forbids the model from refusing). Null half: the module
   threw on **0 of 105,921**. Moved half: `resolveStereo` threw on **more than half** of the
   same stream, asserted as a ratio. The decisive mutation: **`fusionComfort` adopting
   `resolveStereo`'s `noiseScale` guard** is claimed red on the new sensor and **GREEN on
   HEAD — the whole suite, including `perception.fusion.test.ts`'s own `noiseScale` invariance
   test, which sweeps 1, 2 and 4 and every one of them is valid.** That row is the addition's
   entire justification. Reproduce it.

6. **Criterion 8's roster must be self-enumerating or it is §9's hand-written list.** The key
   set is derived from the module's own type (`typeof perception` filtered to functions) and
   `SIGNATURES` is checked in **both directions** — `satisfies Record<PerceptionFunctionName,
   …>` plus an `AssertNever` pair, plus a mapped arity check against `Parameters<F>['length']`.
   The roster lives in `src/shared/testing/perceptionRoster.ts` as a **plain module, not a test
   file**, because `perception.throws.test.ts` drives the same roster and **a test importing a
   test would re-register its `describe` blocks in both runs.** Verify that.

   Part 2 is a **runtime witness** for a stated reason: `AssertNever` is enforced by
   `npm run typecheck` **alone**, so without the witness the ratchet is invisible to `npm test`.
   Part 3 is a **behavioural half with no list in it**: every object-valued argument is handed
   `isEasyToRead: 0.9` and the answer must not move — catching a function *reading* a subjective
   field whether or not the table was updated. Two subtleties claimed, both of which are the
   kind of thing that silently makes a test vacuous: **pass-through is not reading**
   (`soloLayerScene` returns `{...scene}`, so a naive deep-equal reddens on a function that
   never looked), so the planted key is stripped from both answers; and **the planted key is
   asserted absent from `STEREO_KEYS` first**, so a field that later becomes a real part of
   `StereoOpts` cannot quietly turn the assertion into a tautology.

   **The honest limit, recorded in the code and not to be softened:** none of this can decide
   that a parameter *named* objectively is objective. What it guarantees is that the set is
   self-enumerating, so it can only be wrong **loudly**, at the commit that made it wrong. The
   rot case is eliminated; the deliberate-error case is not. Verify that limit is actually
   recorded and that nobody has overclaimed past it.

   **SURVEY-C's parameter count was reported wrong and the correction matters:** it said "15
   parameters of 13 exported functions"; 13 functions is right, the parameter count is **21**
   (10 distinct names: depth, width, height, fraction, stereo, layer, scene, ink, budget,
   index), and 15 could not be reconstructed from any grouping, so it was reported **not
   reproduced** rather than moved. Re-count independently.

7. **A float32 artefact was found by a control and recorded in a test.** A sensor built on
   `new Float32Array` stores 0.9 as 0.899999976…, so a deliberately at-threshold sample fell
   below a float64 threshold and **the test measured the representation instead of the
   metric.** Confirm the recorded mitigation is real; this is the shape that produces a test
   that passes for the wrong reason.

8. **Two docblocks claimed "the test file is unmodified, which is what proves it."** That
   claim was **spent the moment this task ran**, and both were amended to past tense rather
   than deleted (`site/legibility.ts`, `src/shared/perception.test.ts`). Verify the amendments
   are accurate — §9: *a stale **assertion** is now false and a reader who trusts it is
   misled*, unlike a stale pointer.

## My two predictions as your PM, labelled as my unverified reasoning

- **Criterion 5 is where I would expect a number to have moved without anyone noticing.** It
  is the only criterion on this phase that licenses changing user-visible text while
  forbidding changing the numbers inside it, and the same commit touched `perception.ts`,
  `README.md` and `examples/scrolling-text.yaml`. The `tight` branch now prints the boundary
  **twice** (`36 px (2× the budget)`), which is a new arithmetic expression in a string — and
  a new inlined threshold in prose is exactly what criterion 6 forbids elsewhere. Check
  whether criterion 5's fix violates criterion 6.
- **Criterion 6's named list may never have been fixed before dispatch, as the criterion
  requires.** It says "against a named list fixed before dispatch", the list came from
  SURVEY-C, and **four of SURVEY-C's numbers have since fallen** (its `perception.ts` line
  numbers run uniformly ~10 short and its `src/cli/scene.ts:513-532` citation points at the
  preset-registry guard, unrelated — the real block is `:617-640`). If the list was never
  pinned, criterion 6 is **UNCHECKABLE as written** and that is the correct verdict.

## Reminders with teeth

- **Re-establish RED individually for every commit**, not once for the cluster.
- **Rebuild inside every mutation.**
- **Diff the measured values, not the pass/fail.** Points 1, 4 and 5 are all nulls, and point
  4 is the one where a mutation left 21 measured values byte-identical.
- **Do not report "will not fuse however long you stare" as a finding.** Refuted by findings
  §1 (a 16px stroke at an 18px budget was read exactly), surviving in **six** places, a
  *threshold* claim needing its own measuring round, and **deliberately out of scope** —
  findings §5 explicitly declines to ship a replacement number on one observer's data. An
  implementer correctly refused to fix one file while six disagree. Also already reported and
  deliberately unchanged: `runLengths`' `threshold = 0` default.
- **No commits.** Leave the worktree clean with an empty stash list.

Your `REFUTATIONS` section is expected to be non-empty.
