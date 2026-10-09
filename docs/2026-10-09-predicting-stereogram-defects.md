---
title: Predicting stereogram defects from the code
description: Whether the five eye-found encoder defects were statically detectable, why the single-root hypothesis is only half right, and the eight-question checklist that would have caught the catchable ones
status: complete — one check shipped (src/core/types.seam.test.ts), four candidates deliberately declined
date: 2026-10-09
tags: [autostereogram, sirds, static-analysis, testing, invariants, postmortem, retrospective]
---

# Predicting stereogram defects from the code

Five defects shipped past 491 tests and were found by a person looking at rendered
output. Two more were found by reasoning rather than by eye. This asks, for each one,
whether a tool or a reviewer reading the code could have flagged it first — and what the
honest answer implies.

**Headline:** six of the seven were predictable, but only two by anything resembling
static analysis. The rest needed a *stated invariant* and a question asked of it. One is
permanently out of reach of any program. The proposed single root — "the encoder's core
recurrence has unbounded, order-dependent dataflow" — is **right about the location and
wrong about the property**, and the measurement that refutes it is in §3.

Only one automated check is shipped from this work: `src/core/types.seam.test.ts`. Four
other candidates were built or specified and then declined; §6 says why. The dynamic
counterpart to this document is `src/core/metamorphic.test.ts`, in flight separately and
deliberately not duplicated here.

---

## 1. Classification

| # | Defect | Classification | The signal that was available |
|---|---|---|---|
| 1 | Unbounded rightward propagation | **Statically detectable** | `out[x] = out[x - sep(x)]` makes reach transitive. One-line induction. The design doc stated a *finite* bound and was wrong. |
| 2 | PRNG row desynchronisation | **Statically detectable** (by a reviewer, not an off-the-shelf tool) | A mutable generator created above the row loop and advanced inside it on a data-dependent branch. |
| 3 | Left-edge depth loss | **Detectable by reasoning from a stated invariant** | Visible in plain sight — and documented as a *feature* in the POC's docstring. No tool would call it a defect. |
| 4 | Feature-size floor | **Detectable by reasoning from a stated invariant** | One-line derivation from `sep(z)`. Written down nowhere, in the POC or the design. |
| 5a | `depthBlur = 1.0` is *worse* at an 18px budget | **Only observable by a human** | None. Provably none — see §5. |
| 5b | `depthBlur = 1.0` was never *chosen* | **Statically detectable** | A default inherited from a POC with no test that distinguishes its values. Mechanically checkable; measured in §4. |
| 6 | A type asserted to prevent a bug and did not | **Statically detectable** | Excess-property checking fires only on fresh object literals. Now statically *checked*. |
| 7 | CI green while skipping 11 assertions | **Statically detectable** | A `skipIf` on a gitignored path, in a workflow with no build step before `npm test`. Three independently readable facts. |

### 1 — Unbounded rightward propagation

The recurrence is `out[x] = out[x - sep(x)]` whenever `x >= sep(x)`. Reach follows by
induction with no execution at all: from any column `c`, the chain `c → c + sep(·)`
advances by at least `sepNear` and at most `sepFar` each step, so it reaches within
`sepFar` of the right edge from *every* column in the live window. Changing one column's
depth therefore changes pixels arbitrarily far downstream. Measured, 640×24, one
perturbed column:

```
x= 92  changed=[92,532]      x=150  changed=[150,590]
x=320  changed=[320,540]     x=500  changed=[500,610]
```

The signal was not merely available — it was **written down wrong**. Design §2.2 says a
hard depth step produces

> a visible **ghost of the shape echoed up to `sepFar` px to its right**

That bound is false by the induction above, and the error is a factor of roughly
`w / sepFar` (≈ 14 on a 1600px frame). A reviewer asking "why `sepFar` and not forever?"
of that one sentence would have found the defect without rendering anything.

**But knowing the reach is unbounded does not tell you it is harmful.** The replacement
encoder's reach is *also* unbounded, in both directions — measured on the same probe,
`linked` propagates 486px rightward and 503px leftward from a single perturbed column —
and that is fine. See §3.

### 2 — PRNG row desynchronisation

Pre-fix, `const rnd = makeRng(o.seed)` sat above the `y` loop and was consumed inside it
only on the `src < 0` branch, whose condition depends on that row's depth. The
consequence follows in one step: a row's appearance depends on how many times the branch
fired in the rows above it. Mechanically, `rnd`'s closure was the only mutable state
crossing the row boundary other than `out` itself, which makes this the most nearly
*lintable* of the seven — and it is still not a rule I would write (see §6.5).

One honest negative: I built a single-column influence probe expecting it to catch this
too, and **measured that it does not**. A single near column at `x < sepNear` keeps the
row's draw count at `sepFar` either way, so the stream never re-phases. The desync needs
a perturbation in `[sepNear, sepFar)`, which is *inside* the live window where the probe
only asserts "something changed" — which the broken encoder also satisfies. Verified by
reintroducing the stream RNG: the probe stayed green while
`sirds.test.ts > row independence (shift)` and the dead-zone assertion went red. This
defect needs a cross-row instrument; the reach instrument cannot see it.

### 3 — Left-edge depth loss

For `x < sep(x)` there is no source column, `depth[x]` is read, converted to a
separation, and discarded. **Nothing is hidden.** The POC's own docstring describes the
behaviour as a design feature:

> Columns with no source yet (x < separation) get fresh random pixels, which seeds the
> whole row.

That sentence is true, and it is also the defect. No tool and no reviewer flags
documented, intentional behaviour. What turns it into a defect is the invariant — *every
depth sample must be representable in the output* — and once that is stated a program can
answer it: perturb one column, ask whether the image moves at all. Measured, 640px frame,
`sepFar=110`, `sepNear=92`:

```
shift   depth of columns   0..91  is discarded entirely; first live column = 92 = sepNear
linked  depth of columns   0..45  and 594..639 discarded;  = sepNear/2 at each edge
```

Both boundaries are exact and derivable without measuring: `shift` is live iff
`x >= sep(1) = sepNear`; `linked` links `x - sep/2 ↔ x + sep/2` and skips out-of-range
pairs, so it is live iff `sepNear/2 <= x <= w - 1 - sepNear/2`. The classification is
therefore "statically *visible*, semantically invisible" — and the fix for the reach
defect (#1) does not fix this one. It only halves and symmetrises the loss.

### 4 — Feature-size floor

Derivable in one line from the geometry already in `sirds.ts`: a feature at depth `z`
carries a disparity of `Δ = sepFar - sep(z) <= sepFar - sepNear = 18px`, so its two
monocular images sit `Δ` apart. For a feature of width `F < Δ` those two images are
*disjoint* — there is no overlap to establish correspondence, and the only evidence for
the near match is `F` random pixels competing against a globally consistent wallpaper
hypothesis at `sepFar`. 90px text has ~10px strokes; `Δ` is 18.

This derivation appears nowhere — not in the POC, not in the design. The POC gets as far
as *"keep [the budget] ~10-20% of sep_far: more is 'deeper' but artifacts explode and
fusion gets hard"*, which is about the budget's size, not about what the budget can
express.

Two measurements bound how predictable the *threshold* is, as opposed to the rule:

- **The repo's only metric cannot see it.** `dominantPeriod` needs a window of
  `period + MIN_OVERLAP` samples, so on a near bar of width `F` it returns `NaN` for all
  `F <= 72` and first resolves `sepNear` at `F = 110` (score 1.000, 18 samples). The
  measurement floor is ~108px — **six times** the 18px fusion floor. Any check for #4
  needs a new instrument.
- **A purpose-built instrument gives the direction, not the threshold.** An ideal
  matched-filter disparity recovery (per column, argmax agreement over offsets 92..110,
  window ±k, bars of width `F` with equal gaps, shift encoder) recovers the true
  disparity at: `F=4 → 0.44`, `F=10 → 0.66`, `F=18 → 0.56`, `F=24 → 0.68`,
  `F=32 → 0.87`, `F=64 → 0.91`. Rising, noisy, and with **no knee at 18**. So the
  monotone claim "wider features encode better" is measurable; the specific floor is not.

### 5 — `depthBlur`

Split it in two, because the halves classify oppositely.

**5a, "is 1.0 worse than 0 at an 18px budget": only observable by a human, provably.**
Design §2.3 already contains the proof: at blur 0 the band immediately right of a near
shape is *perfectly* periodic at `sepFar` — score 1.000, indistinguishable from clean
background. The artifact blur exists to suppress is not in the image as any monocular
statistic can define it; it is in the correspondence two eyes compute. And the cost blur
introduces is not an error at all — a blurred depth edge *is* a slope, and reading it as
a mesa is the correct interpretation of the depth map it was given. No program has an
opinion about whether a user wanted a mesa.

**5b, "had anyone validated 1.0": statically detectable, and mechanically.** Mutate the
default and see whether anything fails. Run today (§4), `depthBlur` has exactly one guard
and it is `render.test.ts > resolveStereo > fills every field from DEFAULT_STEREO` — a
test that restates the literal. A default pinned only by the test that enumerates the
defaults is a default nobody chose. That is a computable fact, it was computable on day
one, and it is the predictable part of this defect.

### 6 — The type that did not assert

`SirdsOpts` was introduced narrower than `StereoOpts` so that `noiseScale` could not be
passed to the encoder. Excess-property checking fires only on fresh object literals, so
a `StereoOpts` *variable* stayed assignable and `sirdsFromDepth(d, w, h, stereo)`
compiled clean while silently dropping two fields. `?: never` members fixed it.

Purely static, and now statically checked — see §7. Note that design §9 item 8 says *"the
leak probe now fails with TS2345"*, and **no probe was committed**: the guarantee rested
on two one-line members that read like decoration.

### 7 — CI green while skipping

Three mechanically readable facts, none of which needed a render: a `describe.skipIf`
guarded on the presence of build output; that path in `.gitignore`; and a workflow whose
`npm test` step ran before any build. The mechanism is still live and observable — on a
clean checkout the suite reports 11 skipped, and running `npm run build` locally drops it
to 7 (the remainder needing `dist-site`).

The generalisable fix is policy, not a lint: **a skip is a silent pass**, so the guard
should be `skipIf(!built && !process.env.CI)` — absent build output becomes a failure in
CI rather than a shrug.

---

## 2. Verdict on the single-root hypothesis

> 1, 2 and 3 share one root — the encoder's core recurrence has unbounded,
> order-dependent dataflow — and all three are consequences of that single property.

**Right about the location. Wrong about the property, in two specific ways.** The three
defects do all live in one object, and that is the useful part of the hypothesis. But
they are three different properties of it, they are not consequences of one another, and
the single property as named would have produced a wrong conclusion.

### Wrong 1: unboundedness is not the defect

Measured, one perturbed depth column, 640×24:

| encoder | leftward reach | rightward reach | verdict |
|---|---|---|---|
| `shift` | 0 | to the frame edge | the bug |
| `linked` | up to 503px | up to 486px | **fine, by design** |

The replacement encoder's raw pixel influence is unbounded in *both* directions, and it
is unbounded for a benign reason: linking a near pair merges two equivalence classes, and
the colouring pass then recolours every member of the merged class across the whole row.
What propagates is **colour**, not **structure** — and random dots recoloured are still
random dots.

So a reach bound is not an invariant you can state for this encoder family. A check that
flagged unbounded reach would have flagged the fix as loudly as the bug. I tried to build
exactly that check and this measurement is why it does not exist. The property that
actually separates the two encoders is *structural* footprint, and the separating
statistic has to be chosen per encoder (`sirds.linked.test.ts` does precisely that, with
an asymmetric pair of measurements, and it is right to).

### Wrong 2: order dependence is not a property of the recurrence

`out[x] = out[x - sep(x)]` has **no cross-row dataflow whatsoever**. The row loop is
embarrassingly parallel; `rng.ts` says as much. Defect #2 was an *implicit* input the
signature did not mention — a stream cursor hoisted above the row loop — and it needed a
cross-row instrument that the reach instrument demonstrably does not provide (§1.2).
Calling that "the recurrence is order-dependent" inverts cause and effect: the recurrence
was order-*independent*, and a hidden generator smuggled an ordering in.

### What survives, sharpened

One object, three questions — not one property:

> For the recurrence at the heart of the encoder, state
> **(a)** its reach, *and what travels along it*;
> **(b)** its base case, *and what information the base case discards*;
> **(c)** every input it reads, *including implicit state*.

(a) → defect 1. (b) → defect 3. (c) → defect 2. A fourth question about the same
`sep(z)` mapping — *what is the smallest feature this budget can express?* — gives defect
4. Defect 5 is not about the recurrence at all.

This is a better artifact than the one-property version for three reasons: it is
answerable by reading, each sub-question has a different instrument, and (a)'s "what
travels along it" is exactly the clause that stops you concluding the fix is as bad as
the bug.

---

## 3. The checklist

Short enough to actually use. Every item has a shipped defect behind it.

**When touching the encoder, the `sep(z)` mapping, or the stereo defaults:**

1. **What is the reach of each recurrence, and what travels along it** — colour or
   structure? Unbounded reach is not automatically a bug; unbounded *structural* reach is.
   *(defect 1)*
2. **What does the base case discard?** Name the columns or rows whose input cannot appear
   in the output, and give the boundary as a formula, not a measurement. *(defect 3)*
3. **List every input the inner loop reads.** Is any of it implicit — a cursor, a cache, a
   counter — declared outside the loop that consumes it? *(defect 2)*
4. **What is the smallest feature the current budget can express, and is anything in the
   scene narrower?** `sepFar - sepNear` is the number; 90px text has 10px strokes.
   *(defect 4)*
5. **For each new or changed default, name the test that fails if it changes** — and say
   whether that test measures a *consequence* or merely restates the literal. If only the
   latter, nobody has chosen the value. *(defect 5b)*
6. **Does any new type-level guarantee have a `@ts-expect-error` probe?** A type that is
   only *claimed* to reject something does not reject it. *(defect 6)*
7. **Does any test skip itself based on the filesystem?** If so, does CI create the thing
   it looks for, *before* `npm test`? A skip is a silent pass. *(defect 7)*
8. **Is there a runtime list that duplicates a type's keys?** It will drift. `STEREO_KEYS`
   is currently written out twice — `site/scene.ts:32` and `src/cli/scene.ts:95` — and
   neither is derived from `StereoOpts`. Adding `algorithm` needed three coordinated
   edits and went red in a *downstream message assertion* rather than at either list.
   *(found during this investigation)*

Item 8 has a two-line fix that is not applied here only because those files are owned
elsewhere this session: export `STEREO_KEYS` and assert, in each file's test,
`expect([...STEREO_KEYS].sort()).toEqual(Object.keys(DEFAULT_STEREO).sort())`.
`DEFAULT_STEREO` is typed `StereoOpts`, so a missing field is already a type error, which
makes its key set authoritative at runtime.

---

## 4. Measured: which defaults is anyone actually checking?

Mutation audit of `DEFAULT_STEREO`, run on a throwaway copy of the tree. One field
changed at a time, full suite each time, deltas against a baseline of 526 tests with one
pre-existing unrelated failure.

| mutation | extra tests failing | reading |
|---|---|---|
| `cross: false → true` | +11 | thoroughly pinned |
| `noiseScale: 2 → 1` | +5 | pinned by consequence |
| `sepFar: 110 → 120` | +4 | pinned by consequence |
| `sepNear: 92 → 80` | +3 | pinned by consequence |
| `seed: 0 → 1` | +1 | pinned |
| `depthBlur: 0 → 1` | **+1, and it is the "fills every field" test** | recorded, not validated |
| `algorithm: 'shift' → 'linked'` | **+0** | **nothing notices** |

Two findings. First, `depthBlur` is exactly as weakly guarded now as it was when the bad
default shipped — which is honest (design §9 item 10 says so) but means the signal that
would have predicted defect 5 is *still present* for this field. Second, and live:
**`DEFAULT_STEREO.algorithm` is pinned by nothing at all.** Flipping the shipped default
encoder for every user and every scene fails zero tests. `sirds.test.ts` does pin the
*encoder's* internal default (`defaults to shift when no algorithm is named`), so the gap
is only the resolved default — but that is the one users get.

This audit is the right diagnostic and the wrong thing to commit; see §6.3.

---

## 5. What is not predictable, and why

- **Fusion.** The ground truth for "does this read as a floating plane or a mesa" is a
  person holding fusion. Design §2.3 contains the proof that this is not laziness: the
  ghost the entire `depthBlur` stage exists to suppress leaves the downstream band
  *perfectly* periodic at `sepFar`, score 1.000. The artifact lives in the correspondence
  two eyes compute, and there is no monocular statistic over one image that defines it.
  A blinded randomised A/B with replicates is the correct instrument, and it is a human
  instrument.
- **The magnitude of a perceptual trade.** The reasoning chain behind `depthBlur` was
  sound; only the magnitudes were wrong — at an 18px budget the cure is above threshold
  and the disease below it. Perceptual thresholds are not derivable from source.
- **Whether unbounded influence is harmful** (§2). Requires the colour-versus-structure
  distinction, which is a fact about human vision, not about the program.
- **Readability.** The *direction* of defect 4 is measurable and the *rule* is derivable,
  but the threshold is not: an ideal matched filter shows a rising, knee-free curve from
  F=4 to F=64. "Can you read this word" stays human.
- **Anything about the GIF/MP4 codec path** that depends on a decoder's behaviour rather
  than on this repo's code — already handled correctly by measurement rather than by
  reasoning (implementation plan, "Verified environment facts"), and that is the right
  posture.

A pattern worth naming: in every case above, what is unpredictable is a **threshold or a
preference**, and what is predictable is a **structure or an absence**. Static reasoning
found every missing question. It found no answers.

---

## 6. What was deliberately not built

Four candidates were specified, three of them prototyped and run, and all four declined.
Judged by "would a maintainer trust this and keep it?"

### 6.1 A generic bounded-reach / influence check — **declined, invalid**

Intended to catch defect 1 for any encoder. It cannot exist: `linked`'s raw influence is
unbounded in both directions by design (§2), so the check fires identically on the bug
and on its fix. This is a measurement, not a judgement call. The per-encoder asymmetric
measurements in `sirds.linked.test.ts` are the correct shape and should stay that way.

### 6.2 A depth-observability property suite over `SIRDS_ALGORITHMS` — **built, passing, declined as duplicate**

A registry-driven version of defect 3: perturb one full-height column, assert the
encoder's declared live window exactly, force any new encoder to add a row to the
declaration table. It worked, deterministically — with the naive declaration "no depth is
lost" it reported `{ x: 0, observable: false }`, i.e. it names defect 3 without rendering
anything a human looks at. A full column rather than a single pixel because one pixel
flips the output with probability ½; over 24 rows that is 2⁻²⁴ *and* the seed is fixed, so
it is deterministic rather than merely improbable.

Declined anyway. While I was prototyping it, `sirds.linked.test.ts` grew an `edge dead
zones` block covering the same property with a **better instrument** — a structural
`linkedColumns` probe, where mine used a pixel diff that cannot distinguish recolouring
from re-structuring — and `src/core/metamorphic.test.ts` arrived with a `P4 completeness`
section doing it again. Two or three tests asserting the same dead zones is how a
maintainer learns to distrust all of them. The registry-exhaustiveness angle is real but
does not pay for a duplicate file; it belongs as a line in whichever of those files wins.

### 6.3 A committed mutation gate on the defaults — **declined as packaging, run as an audit**

Right diagnostic (§4), wrong artifact: N full suite runs, and an allowlist of
"deliberately unvalidated" fields that rots the moment anyone is in a hurry. Run it by
hand when a default changes. Today's output is in §4, including the live `algorithm` gap.

### 6.4 A feature-size lint on depth maps — **declined, soft threshold**

Minimum horizontal run-length of a depth plateau versus `sepFar - sepNear` is cheap and
needs no stereo. But §1.4's measurement shows there is no knee at the budget, and a depth
map legitimately contains antialias ramps narrower than 18px (design §2.1 measures them:
0.769, 0.780, 0.937, 0.941). A check that warns on correct output trains people to ignore
it. This belongs in the site's diagnostics panel as an advisory number next to the depth
view — where a human is already looking and can judge — not in the suite.

### 6.5 A lint for "no mutable state crosses the row loop" — **declined**

Expressible, and it would have caught defect 2. But the only way to make it precise is to
hard-code the encoder's shape, and it fires on `out` — the one piece of cross-row state
that is the function's entire purpose. The checklist question (item 3) is cheaper and
strictly more general.

---

## 7. What was built

`src/core/types.seam.test.ts` — the compile-time probe behind defect 6, and the only one
of the seven that a compiler can catch unaided.

Three `@ts-expect-error` probes: one per `?: never` member, each against a *variable* of a
named widened type rather than a fresh object literal (the literal is what
excess-property checking already caught, and relying on it is the original bug), plus one
against a real `StereoOpts` for the exact call shape the pipeline would have written. The
per-field split matters: a single probe against the whole of `StereoOpts` is satisfied by
either guard surviving, so a tidy-up could delete one unnoticed.

Verified in every direction on a throwaway copy of the tree:

```
as shipped                                   typecheck exit=0
delete only  noiseScale?: never   →  types.seam.test.ts(63,5): error TS2578: Unused '@ts-expect-error' directive.
delete only  depthBlur?: never    →  types.seam.test.ts(70,5): error TS2578: Unused '@ts-expect-error' directive.
```

Each guard is independently pinned. The runtime half of the file is not decoration: it
shows that the rejected call *silently does nothing* — encoding with `noiseScale: 4` or
`depthBlur: 3` sneaked past the type is byte-identical to encoding without them — which is
why the compile-time guard is worth having at all.

One limitation, stated because it is load-bearing: vitest does not type-check, so this
check is enforced by `npm run typecheck` (`tsconfig.typecheck.json` re-includes
`*.test.ts`) and **not** by `vitest run`. Removing the typecheck step from CI disarms it
silently — which is checklist item 7 wearing a different hat.
