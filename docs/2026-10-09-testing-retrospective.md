---
title: Testing retrospective — five defects a 500-test suite could not see
description: What actually caught the perceptual and spatial defects in this project, why the obvious general property was wrong, and the transferable rule (assert on structure, not on values)
status: complete
date: 2026-10-09
tags: [testing, metamorphic, invariants, retrospective, autostereogram, sirds, methodology]
---

# Testing retrospective

Five real defects in this project were found by a human looking at rendered output. The
test suite, ~500 tests at the time, caught none of them. This is the post-mortem on why,
and on what generalises.

Companion document: [`2026-10-09-predicting-stereogram-defects.md`](2026-10-09-predicting-stereogram-defects.md)
asks whether the same defects were detectable by *reading the code*. This one asks what
kind of *test* sees them.

---

## 1. The scoreboard

| # | Defect | Found by | What would have caught it |
|---|---|---|---|
| 1 | Ghost repeats to the frame edge ("streakiness") | eye | `coherentColumns` at the `sepNear` offset, or correlation vs a chance baseline |
| 2 | PRNG stream desync between rows | eye | "replace every *other* row with noise" — **and only that probe** |
| 3 | Left-edge depth loss (object clipped) | eye | footprint-vs-geometry, via `coherentColumns` |
| 4 | Features thinner than the disparity budget can't fuse | eye | nothing on the output side; a depth-map authoring check |
| 5 | `depthBlur: 1` made images worse | eye, blinded | nothing. Human-only. |

Three of the five are automatable. One is automatable only *before* rendering. One is not
automatable at all. That ratio is the honest headline.

---

## 2. The transferable rule: assert on structure, not on values

This is the finding worth carrying to other projects.

A stereogram's output is a field of pseudorandom pixels. Any assertion about *pixel
values* is either trivially true (it's deterministic) or meaningless (it's noise). What
carries the signal is not the values but the **equality relations between them**:
`out[x] === out[x + sep]` is the entire content of the image. Depth is encoded purely as
*which pixels are constrained to equal which others*.

So the instrument that works measures relations:

```
coherentColumns(img, w, h, off) = { x : img[x][y] === img[x+off][y] for EVERY row y }
```

No width floor — it localises a 1px feature exactly. False-positive rate `2^-h`, which is
`1.5e-5` at 16 rows and measured at **zero hits** on a feature-free control.

The decisive demonstration: by **control-diff** (how many pixels differ from a control),
the new `linked` encoder looks *worse* than `shift` — it rewrites colours upstream
wholesale, 0.496 of pixels changed. By **structure**, it is dramatically better: its
spurious coherence runs are 1px wide against `shift`'s seven runs of exactly 18px, and its
downstream `sepNear` agreement is 0.499 against a chance baseline of 0.500 — while
`shift`'s is 0.585, some 36 standard errors above chance.

Colour is a **gauge**: in a constrained-pair encoder, recolouring an entire equivalence
class changes every pixel and changes nothing a viewer can see. Measuring values therefore
reports a fix as a regression. Measuring relations reports it correctly.

**Generalisation.** For any pipeline whose output is noise-like, synthesised, or otherwise
value-arbitrary — procedural generation, compression, hashing, rendering, shuffling,
simulation — ask: *what relation must hold in the output?* Assert that. Pixel-diffing is a
golden-image test wearing a lab coat.

---

## 3. The instruments, in descending power

| instrument | width floor | other floor | sees | verdict |
|---|---|---|---|---|
| `coherentColumns` (structural) | **none** — exact on 1px | `2^-h` false positives (h = rows) | the actual encoded signal | the general instrument |
| control-diff | none | **sparsity: silent at ~`2^-k`** for a k-pixel feature | *any* influence, incl. invisible recolouring | good for "did this matter at all" |
| autocorrelation (`dominantPeriod`) | `lo + 16` ≈ **108–126px of uniform depth** | — | the dominant period | **fixtures only** |

**Control-diff's second floor cost real time and is easy to miss.** It has no width floor,
but it measures *colour*, and two random pixels agree half the time — so a row containing
only *k* depth pixels registers no difference with probability ≈ `2^-k`, even when the
encoding is perfect. Measured: a 3px feature over 200 rows reads as "lost" in 16–31 rows at
any single seed. That produced false defect reports on committed example scenes.

The fix is a **seed sweep**, and it is principled rather than a fudge: genuine dead-zone
silence is seed-*independent* by construction, because unsourced columns are filled from
positional `noiseAt` and are bit-identical to the control at every seed. So sweeping seeds
cannot mask a real dead zone, only chance agreement. Across seven seeds the same 3px
feature read as lost in **0** rows.

**Generalisation:** when an instrument answers "did anything change", ask what makes it
*silent*, not just what makes it *blind*. A blind spot is a region it cannot see; a silence
is a region it reports as clean. The second is far more dangerous, and ours was a
probabilistic function of feature sparsity rather than anything structural.

Autocorrelation is what this project started with, and it is the weakest of the three
despite being the most obvious. It needs more uniform depth than any real content has:
measured on the committed examples, the widest contiguous solid-depth runs are 61px
(pacman's body), 92px (the bouncing ball), and for text it never clears the threshold at
all.

**And its failure mode is the dangerous one.** 150px bold text has a median stroke run of
13px but a *maximum* of 114px — so the T crossbar and S terminals do clear the floor.
Period analysis aimed at text therefore succeeds on ~1.7% of rows and returns `NaN` on the
rest, which is worse than failing outright, because it looks like it worked.

---

## 4. The subtlest finding: the probe matters more than the property

My prediction going in was that a single **locality** property — "perturbing one depth
pixel changes the output only within a bounded neighbourhood" — would have caught three of
the five defects. Two agents refuted it independently, with measurements, and both halves
of the prediction were wrong.

**The property is false for correct code.** In `linked`, one new link merges two
equivalence classes and repaints the losing chain: measured reach is 724px left and 706px
right from a single pixel. That is not ghosting and no viewer can perceive it. A raw-reach
locality assertion would flag the *fix* as loudly as the bug.

**And the property catches neither defect without the right probe.** Two measured reasons:

- A single-pixel probe is **silent about half the time.** Changing `sep` swaps which of two
  random source pixels gets copied, and they agree 50% of the time.
- The PRNG desync only fires when the perturbation lands in the leftmost `sepFar` columns.
  Measured: a near pixel at **x=100 propagates to every row below; the same pixel at x=110
  propagates to none.** A locality probe poking the middle of the frame reports the defect
  as absent.

The probe that works is *"replace every other row with noise and see which rows move"* —
which is not a smaller version of the one-pixel probe, it is a different experiment.

**Generalisation.** A property is a claim; a probe is an experiment. Reviewing the claim
tells you nothing about whether your experiment can detect its violation. Budget effort for
designing probes, and prove each one non-vacuous by breaking the thing it watches.

---

## 5. Prove the test can fail — every time, without exception

Six properties in `metamorphic.test.ts` are marked `it.fails`: they document defects that
are still live. That is deliberate. A suite that reports two known-broken invariants is
worth more than one tuned green.

Every one was shown to fail with a real `AssertionError` on the stated quantity, not an
incidental throw. Three things only surfaced because of that discipline:

- Two mutations of the occlusion slope constant were **initially green**. The test could
  not see them until a penetration bound was tightened from an inequality to an exact
  equality across six depth budgets.
- Of four tests added for a GIF mode change, only **one** actually failed under the old
  code. The other three pinned behaviour that was already correct — worth having, but not
  regression tests, and saying so cost nothing.
- A skip-guard pattern-matched its own error message, so a test silently skipped itself
  while reporting green.

---

## 6. What is not automatable, honestly

**Defect 5 (`depthBlur`) is human-only, for a reason worth stating precisely.** What blur
*cost* was a correctly-encoded depth gradient reading as a slope — so the object appeared
as a mesa rather than floating. That is not a defect in any measurable sense; it is a
faithful encoding of a depth map the author did not intend. **No image-side property can
distinguish "a slope the author wanted" from "a slope blur introduced."**

The *benefit* side, though, turned out to be measurable after all, and I had wrongly
declared it impossible. Blur monotonically removes the ghost — `sepNear` excess 0.585 →
0.567 → 0.550 → 0.525 → 0.503 at radii 0,1,2,3,5 — reaching chance only at radius ≈ 5,
while the mesa is already perceptible at radius 1 where barely 20% of the excess is gone.
A weak cure with a strong side effect. The blinded trial (3 blur levels × 2 seeds,
replicates adjacent, `p = 0.011`) got the right answer; the measurement explains *why*.

**Defect 4 (feature size) is automatable only from the depth map.** Three attempts from the
output side failed: a 1px feature's encoded footprint is exactly 1px and perfectly
coherent in both encoders. The encoder loses nothing — the *viewer* cannot recover it.
There is no knee anywhere near the 18px budget in far-period agreement versus feature
width. The rule belongs where it is useful anyway: a warning before anything renders.

---

## 7. For a human in the loop

The blinded protocol worked well enough to recommend:

- **Blind the filenames.** Labelled files invite confirmation bias; `trial-a … trial-f`
  does not.
- **Include replicates** — same condition, *different* seed. The pairs cannot be matched by
  pixel comparison, so consistency across them measures the observer's reliability as part
  of the result rather than leaving it an unknown.
- **Don't look at the key** while framing the questions.
- **Compute the null.** Six items, three conditions, pairs grouped and ordered: `p = 0.011`.
  Worth stating, because "I'm not sure" from an observer whose ranking was in fact perfect
  should not be taken at face value — and in this case it wasn't.

---

## 8. The short version

1. Assert on **structure**, not values. Colour is a gauge; relations are the signal.
2. The **probe** matters more than the property. Prove each probe non-vacuous.
3. Know your instrument's **floor**. Autocorrelation needs ~108px of uniform depth and
   lies politely when it doesn't have it.
4. Let known defects **fail visibly** rather than tuning them green.
5. Some things need eyes. Blind them, replicate them, and compute the null.
6. When a measurement contradicts a claim in your own documentation, the measurement wins.
   Four claims in the design doc were retracted this way in one day — including two in the
   same section, and one that asserted a test which had never been committed.
