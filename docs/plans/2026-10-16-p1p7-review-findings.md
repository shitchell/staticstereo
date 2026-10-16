---
title: P1/P7 review findings — the seven that nearly evaporated
description: Reviewer round 1 and 2 findings for the .stst and perception phases, written down because they reached the orchestrator twice in chat and were never recorded
status: open; each item needs a disposition before P1/P7 merges or is explicitly deferred
date: 2026-10-16
tags: [review, findings, staticstereo, p1, p7]
---

# P1/P7 review findings

**Why this document exists.** The reviewer's round-1 report routed to the orchestrator
**twice** — the agent mesh dropped it in both directions, so it never reached its PM or any
ledger. The orchestrator read it both times, acted on parts of it in chat, and **wrote none
of it into a document.** The reviewer flagged that itself when closing round 2:

> *"Seven of my round-1 findings are still open and still unrecorded anywhere — not
> rejected, never delivered. F1 in particular is a shipped user-facing string that
> contradicts the design text in two places, with a sensor that cannot see the difference,
> and it has now survived two full review rounds without ever reaching a decision-maker."*

That is **orchestrator error 33**, and it is error 15's exact shape — findings adopted in
messages and never committed. Error 15 cost nine criteria and produced five wrong
reconstructions when they were rebuilt from memory. **These are therefore transcribed, not
summarised.**

---

## Open findings — round 1

| # | Location | Class | Severity | Finding |
|---|---|---|---|---|
| **F1** | `perception.ts:822`, `:743-744` | ASSERTION | **should-fix, arguably blocking** | The label `` `${separation} px` `` **names none of the four pixel spaces**, while the docblock claims it satisfies invariant 7 and design §5.3/§10.6 says **twice** that the strip labels "scene px". The sensor `stops.test.ts:542` is `toContain('px')` — **blind to the distinction**. A shipped user-facing string contradicting the design text in two places. No consumer outside its own tests. **Fix needs `stops.test.ts:542` tightened to `toContain('scene px')`; unrun.** |
| **F2** | `perceptionRoster.ts:126-145`, `contract.test.ts:65-75,77-126` | ASSERTION | **CLOSED `819101d`** | **All three halves of criterion 8's guard were blind to an added *optional* parameter**, because `Parameters<F>['length']` is a **union** wherever a parameter is optional, so "declared length is a member of the union" passes for every member. Fixed with `Required<Parameters<F>>['length']`. **Two figures in this row were measured wrong and are corrected here: `measureInk`'s real arity is `3 | 4`, not `3|4|5`; and the control's `"TS2344 ×2, exit 2"` is wrong in both terms** — raw `tsc` exits 2 on a *clean* tree from a pre-existing `TS2307`, so under `npm run typecheck` it is **one error, exit 1**. Proved at type level by the reviewer and then **planted for real** by the fix worker: with the rot present all three instruments were **byte-identical green** (476 files / 0 errors, contract 10/10, throws 15/15) — *that green was the bug* — and the fix makes it exit 1 naming the drifting export, with the original wrong-arity case still caught. |
| **F3** | `shared/purity.test.ts:575` → `core/purity.test.ts:221` | POINTER | note | Correct at `70718ea`, **broken by `3d593fe`**; the real site is `:377`. LIVE. |
| **F4** | `perception.ts:1076` → `cli/scene.ts:263` | POINTER | note | Correct at `bdd4af1`, **broken by this branch's CLI work**; the real site is `:368-371`. LIVE. |
| **F6** | `perceptionRoster.ts`, new text at `421e265` | ASSERTION | note | Says *"verdict plus three quantities"* — there are **two** finite numbers. |
| **F7** | `contract.test.ts:219` — **not `:185`, measured stale** | invariant 3 | note | `toBeGreaterThan(20)` — magic number with no recorded derivation. **Substance reproduced; location did not.** This is the **fourth** line number in this document measured stale in one day; another (`:377`) was true only between two commits and is now `:466`, having drifted twice. **Prefer a stable anchor to a fresh line number — replacing one with another just restarts the clock.** |
| **F8** | `zip.ts:58-60`, `zipRead.ts:120-122` | invariant 3 | note | Signature constants unexplained **while `SIG_ZIP64_EOCD` beside them is documented** — the inconsistency is the tell. |

**F5** (`canvas.generics.test.ts:113-114`, three defects in one sentence) — **already fixed
at `8d02868`.** **F9** (`INK_FRACTION` and `TIGHT_MULTIPLE` with no literal-pinned witness
at any of ~30 sites) — confirmed; **`f352b99` appears to address it and should be checked
against this rather than re-reported.**

## Open findings — round 2

- **A new POINTER defect, re-measured by the reviewer before passing on.**
  `src/core/purity.test.ts:60` names `2e07de6` as having closed a hole via
  `emitLayoutVerdict`. Measured: `git show 2e07de6:src/shared/purity.test.ts | grep -c
  emitLayoutVerdict` → **0**; `git log -S` puts its introduction at **`70718ea`**, whose
  parent is `b3e7601`, so it is not that commit's successor in any git sense. **The sharp
  part: `2a553aa`'s own commit message gets it right.** Only the in-file comment names the
  wrong sha, so the log and the code it describes disagree.
- **`src/shared/container.test.ts:462`** — the `400_000` control floor has no recorded
  derivation. The real spread is ~523,000, **so the floor is sound; it just is not shown.**
  Joins F7 as a propagated magic number.
- **`perception.stops.test.ts`** — `CONFIGS` has **22** rows about 45 lines below a docblock
  saying "8 of 20". The "20" correctly refers to a different file's array and the sentence
  never equates them. **Not a defect — a skim trap**, in a file family where cross-file
  count citations have now been wrong twice.

**Two corrections the round-2 sweep made to round 1, both strengthening the code:**
**A4's instrument is *derived*, not a hand list** — `perception.capacity.test.ts:174-204`
filters `CONFIGS` through `encodableDepths` and uses `CLOSED_FORM_CASES` only as a
cross-check, so **a row added to either side without the other reddens**, and
`encodableDepths` is itself anchored to `sepAt` at `:112`. **Stronger than the reviewer had
credited.** And there was a **fifth** "7 of 20" citation at `perception.stops.test.ts:45`;
the count of four was short.

## NOT-COVERED, ranked — the gaps no criterion asks about

1. **`site/dist.test.ts`'s `yuv444p` needle** — top item, and **the one inference in the
   whole review that could not be executed, because confirming the tree-shaking step needs
   a build.** The reviewer: *"the single thing I most want a gate runner to close."*
2. **R22 obligation 1 has no criterion and no sensor** — now **criterion 25**. Measured
   citations: ob.2 nine times, ob.4 three, ob.3 once, **ob.1 zero.**
3. ~~**Criterion 8's rot case is not eliminated**~~ — **CLOSED at `819101d`**, with the rot planted for real rather than proved at type level.
4. **No criterion asks what a `.stst` means for a layer type only one side accepts** — now
   **criterion 24**, closed-with-record, not to be re-raised.
5. ~~**Design §10.6 deviated from**~~ — **RESOLVED at `a8f9edd`, and the reported finding was
   wrong in all three parts.** `DepthStop.depth` does not deviate — **§5.3 mandates a 0..1
   scale and cites §10.6 while doing so.** `CollidingPair.gap` is out of scope — the rule
   binds *functions*. `quantisationStep` is a **reciprocal** of scene px and its docblock
   already denies the deviation. **The defect was §10.6's wording**, which is unsatisfiable
   module-wide, so the rule was amended to the gloss §8.2 already contained. **§6.6, cited
   twice and never written, now exists.**
6. **The writer's `deflate` path has no production consumer** — write-side
   `CompressionStream`, design §6.2's named mechanism, is **test-only** now.
7. **The CLI/site value axis is unscoped** — five container-reachable disagreements pinned,
   **hand-listed with no enumeration mechanism, so it goes short *green* when a sixth
   appears.** Five is what one probe covered, not a census.

## Axes checked with no finding, named so the coverage is legible

Invariant 2 · invariant 4 (no byte-count, size or digest assertion anywhere new) ·
invariant 7 (16 explicit "scene px"; F1 the sole violation) · **invariant 8 measured** —
`-w` and non-`-w` diffs both give 11778/357, so **no whitespace-only reformatting
anywhere** · invariant 10 · **test removals: zero net, three titles vanished as two renames
and one authorised by criterion 5** · §6.5a controls · R17 round-trip · design §6.2's
stated reason, via `unzip -p` · criterion 6's escalation (`COMMANDS` byte-identical) ·
pointer spot-check (8 checked, **7 accurate, 3 verbatim**) · invariant 1 left to the
verifier clusters by design.

## Still standing as unverified

~25 relayed claims, including the four ranked above. F1's fix is unrun. F2 is type-level
only. Whether NOT-COVERED 5 is already under DEVIATIONS.
