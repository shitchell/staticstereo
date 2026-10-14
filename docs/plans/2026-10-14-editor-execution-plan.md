---
title: Editor rewrite — execution plan for a three-tier agent system
description: How the editor design is decomposed into PM-owned phases and worker-owned tasks, with the invariants, contracts, gates and escalation rules that let an orchestrator run it without reading code
status: proposed; awaiting review for fitness as an orchestration spec
date: 2026-10-14
tags: [execution, orchestration, agents, plan, staticstereo, editor]
---

# Editor rewrite — execution plan

This is **not** a design document. The design is
[`2026-10-13-editor-design.md`](2026-10-13-editor-design.md); the requirements are
[`2026-10-13-editor-requirements.md`](2026-10-13-editor-requirements.md); the research is
[`../2026-10-13-editor-ux-research.md`](../2026-10-13-editor-ux-research.md).

This document specifies **how the work is executed by a three-tier agent system**, and it
exists so that an orchestrator can run the build from status reports rather than from the
code.

---

## 1. The orchestration model

| Tier | Who | May write code? | May run tests? | Job |
|---|---|---|---|---|
| 0 | **Orchestrator** (the main session) | No | No | Cross-phase decisions, escalations, talking to Shaun |
| 1 | **PM** — one per phase | **No** | **No** | Decompose, delegate, verify via workers, report upward |
| 2 | **Worker** — ephemeral, one per task | **Yes** | **Yes** | The only tier that touches the repo |
| 3 | available | — | — | Reserved; a worker may spawn a helper for a genuinely separable sub-task |

**The constraint that makes this work: a PM never inspects the repo to answer a question.**
It spawns a worker to answer it. A PM that reads code has become a worker with extra steps,
and its context fills with detail the orchestrator then cannot see past.

**Two distinct worker roles**, and they must not be the same agent:

- **Implementer** — does the work, TDD, reports what it did.
- **Verifier** — fresh context, never sees the implementer's reasoning, independently runs
  the suite and checks the acceptance criteria. Reports pass/fail with evidence.

Separating them is the point. An implementer verifying its own work reports what it
intended, not what happened.

### 1.1 Orchestrator rules

- Do not read source files to answer "is X done?" — ask the PM.
- Exception: a question answerable in **fewer than three commands** where delegation is
  plainly more expensive (e.g. `git log --oneline -3`).
- Do not re-plan a phase a PM is executing. Escalations come up; direction goes down.

---

## 2. Invariants every agent must be told

These are repo-specific and non-obvious. **Every worker prompt must carry §2 verbatim or
by reference**, because a worker with fresh context will otherwise produce code that
passes tests and fails review.

1. **TDD is mandatory.** No production code without a failing test observed first. Report
   the RED output and the GREEN output. A test that passed on first run is not evidence.
2. **`src/core/` imports nothing from `src/node/` or `src/web/`.** `purity.test.ts`
   enforces it. Svelte exists only in `site/`.
3. **Comments carry rationale, not description.** This repo's comments record *why a value
   is what it is and what measurement moved it*. Match that density. A constant with no
   recorded reason is a review failure.
4. **Assert on structure, not on values** — the project's own recorded testing rule. Pin
   the guarantee, not the current output.
5. **Never alpha-blend depth.** `depth[i] = max(depth[i], layerDepth × mask[i])`. There is
   a regression test whose only job is to fail if this is "simplified".
6. **Perceptual thresholds live in functions, never inlined** (R22). No downstream code
   compares against a perceptual constant.
7. **Scene px vs device px must be named** wherever a pixel count appears. `noiseScale`
   defaults to 2 and silently scales nothing in the depth map but everything in the frame.
8. **Do not reformat, reorganise, or "tidy" files you were not asked to change.** Diff
   noise hides real changes from a reviewer who is reading reports.
9. **Use the `git` wrapper on PATH**, never `/usr/bin/git`. It decides authorship itself.
10. **No time estimates** anywhere, in code comments or reports.

---

## 3. Phase map and dependencies

```
P0 model ──┬── P1 shared/.stst ──┐
           ├── P2 player ────────┼── P3 shell ──┬── P4 canvas ──┬── P5 assets
           └── P7 perception ────┘              └── P6 timeline ─┘
                                                                  └── P8 polish
```

| Phase | Owner | Depends on | Closes | Ships alone? |
|---|---|---|---|---|
| **P0** Scene model | PM-MODEL | — | R9, R10 | — |
| **P1** `shared/` + `.stst` | PM-MODEL | P0 | R17, R18 | — |
| **P7** Perception module | PM-MODEL | P0 | R22 | — |
| **P2** Player | PM-PLAYER | P0 | R14–R16, R20, R21 | **Yes** |
| **P3** Editor shell | PM-SHELL | P0, P2 | R3, R4, R6, R7 | — |
| **P4** Canvas, layers, depth strip | PM-CANVAS | P3 | R5(layers), R11, R12 | — |
| **P6** Timeline | PM-TIME | P3, P0 | R5(timeline), R9 | — |
| **P5** Asset import | PM-ASSETS | P3, P4, P1 | R5(upload), R13 | — |
| **P8** Polish | PM-CANVAS | P4, P6 | *nothing — marked so* | — |

**P0, P1 and P7 are one PM's remit** because they are all pure TypeScript with no UI, they
share a reviewer's mental model, and splitting them across PMs would mean three agents
holding the same scene-model context.

**P2 is deliberately next and deliberately standalone.** It derisks the whole URL/fit/embed
story before any editor exists and is the half with users who are not Shaun.

---

## 4. Branch and integration model

- **One branch per phase**, named `feat/<phase>-<slug>`, cut from `main`.
- Workers commit **inside the PM's branch**, in-tree, **sequentially**. Worktree isolation
  is used only when a PM has two tasks with provably disjoint file sets *and* a reason to
  overlap them; the default is sequential, because merge resolution is work the
  orchestrator cannot supervise from reports.
- A phase branch merges to `main` only after its gate (§6) passes.
- **Nothing is pushed and nothing is merged without Shaun's say-so.** PMs report "ready to
  merge"; they do not merge.

### In-flight work

Branch **`feat/transform-axis-rotations`** already exists and carries the `rotateX` /
`rotateY` change from §4.3 of the design — `Transform`, `IDENTITY`, `CHANNELS` with an
`AssertNever` guard, `composeAnim` summing both, and the rasteriser's cosine scale, plus
tests at the track and raster levels. **It was written under TDD but the full suite and
typecheck were never run.** It is P0's task 0: verify, finish, or repair. Do not assume it
is correct.

---

## 5. Contracts

### 5.1 What the orchestrator gives a PM

A PM brief contains, and contains only:

- the phase's **scope and exit criteria** (§7),
- the **design sections** it implements, by number,
- the **requirements** it closes, by R-number,
- §2 invariants,
- the **dependency state** — which phases have merged,
- the **escalation triggers** (§8).

Not included: how to decompose. That is the PM's job.

### 5.2 What a PM gives a worker

| Field | Content |
|---|---|
| Task | One behaviour, one acceptance criterion |
| Files | Expected to change; anything outside needs an escalation |
| Design ref | The section it implements |
| Invariants | §2, verbatim or by reference |
| Acceptance | How the verifier will judge it — stated *before* the work |
| Forbidden | What not to touch |

A task that cannot be stated with one acceptance criterion is two tasks.

### 5.3 What a worker returns

```
WHAT CHANGED   files, one line each
RED            the failing output, quoted, per test
GREEN          the passing output
SUITE          full `npm test` tail
TYPECHECK      `npm run typecheck` result
DEVIATIONS     anything done differently from the task, and why
UNCERTAIN      anything it is not confident about
```

`UNCERTAIN` is load-bearing. A worker that reports nothing uncertain on a non-trivial task
is to be treated as having not looked.

### 5.4 What a PM returns to the orchestrator

```
PHASE          id, branch
STATE          not-started | in-progress | gate-pending | ready-to-merge | blocked
DONE           acceptance criteria met, with the verifier's evidence
NOT DONE       criteria outstanding, and why
DEVIATIONS     anything that differs from the design, with reasoning
ESCALATIONS    decisions the orchestrator or Shaun must make
RISK           what is most likely to be wrong
```

**No code in a PM report.** File paths and criteria, not diffs. If the orchestrator needs
a diff, something has gone wrong with the decomposition.

---

## 6. Gates

A phase branch is `ready-to-merge` only when **all** of:

1. Every acceptance criterion in §7 is met, evidenced by a **verifier** worker that did not
   implement any of it.
2. `npm test` green — the suite was 862 tests across 42 files before this work; a *drop* in
   count is a finding, not a pass.
3. `npm run typecheck` clean.
4. Both builds succeed: `npm run build` and `npm run build:site`. CI runs builds **before**
   tests on purpose — the Pages-critical assertions can only run against build output —
   so a worker that skips them has not reproduced CI.
5. A **fresh reviewer worker** — no prior context on the phase — has reviewed the diff
   against §2's invariants and the design section, and reported no unresolved findings.
6. Deviations from the design are either reverted or recorded in the design document.

The orchestrator reads the PM's report of 1–6. It does not re-verify.

---

## 7. Phase specifications

Each phase lists its exit criteria. A PM decomposes these into tasks; the decomposition is
the PM's, the criteria are not negotiable without an escalation.

### P0 — Scene model · PM-MODEL · design §4

0. `feat/transform-axis-rotations` verified green, or repaired until it is.
1. `Transform` carries `rotate`, `rotateX`, `rotateY`; rotations sum in `composeAnim`;
   `rotateY = π` mirrors; `±π/2` renders nothing. `AssertNever` guards tie `CHANNELS` to
   `Transform`.
2. `Layer` gains optional `id` and `name`. Ids are assigned **on first mutation, not on
   load**, so `examples/*.yaml` round-trip byte-identically. Generation lives in
   `src/shared/` and both `validateScene` implementations use it.
3. Verb vocabulary: `move`, `rotate`, `scale`, `push`, `flip`. `flip` is `rotateY`.
4. Bundles `entrance` and `flyIn`, written out with concrete parameters (design §4.2).
5. `PRESETS` gains a `uiVisible` flag; legacy kinds stay registered and are not listed.
6. Easing gains `cubic-bezier(a,b,c,d)`.
7. **Every legacy preset name still compiles to its previous output.** This is the
   regression that matters most in P0.

### P1 — `shared/` and `.stst` · PM-MODEL · design §6.2

1. Zip read/write over `CompressionStream('deflate-raw')`, no dependency.
2. Contains `scene.json`, baked masks, original sources, a manifest.
3. **The output is a valid zip** — assert by extracting with `unzip`, not by round-tripping
   through our own reader.
4. `stst` **reads and writes** it.
5. CLI and site produce **identical bytes** for one scene.

### P7 — Perception module · PM-MODEL · design §10

1. `src/shared/perception.ts` exporting `encodableDepths`, `quantisationStep`,
   `collidingPairs`, `fusionComfort`, `strokeLegibility`, `depthStops`, `cardboarding`.
2. Each returns **quantities and a grade**, so a caller wanting numbers never touches the
   judgement.
3. **`fusionComfort` keys on the budget, not on `sepNear`.** Pin the revision-1 bug: it
   must fire at `sepFar: 140, sepNear: 78` (budget 62) and stay silent at
   `sepFar: 100, sepNear: 80` (budget 20).
4. `encodableDepths` reports stage capacity **and** the dead strips under `linked`, where
   columns within `sep/2` of each plate edge carry no depth.
5. Today's legibility rule moves in **unchanged**. No new thresholds — that is effort #2.
6. No perceptual constant is inlined anywhere outside this file.

### P2 — Player · PM-PLAYER · design §3.2, §8

1. Separate Vite entry; `dist.test.ts` asserts **no editor code in the player bundle**.
2. `?fit=contain|snap|render`, default `contain`. `?smooth=auto|on|off`, default `auto` —
   smooth down, pixelated up. Query parameters, not fragment.
3. `cover` is not implemented. If someone asks, it crops the margins and destroys edge
   fusion.
4. Present, iframe embed, and fullscreen all work, **all with play/pause** (R16).
5. Fullscreen targets a **wrapper**, not the canvas. Transport container is
   `pointer-events: none`, controls inside are `pointer-events: auto`.
6. Canvas click target preserved.
7. **The §8.3 sub-pixel constraint holds**: nothing added above the canvas in flow.
8. Relative asset paths preserved — a leading-slash path 404s on a GitHub project Page.

### P3 — Editor shell · PM-SHELL · design §5.1, §9, §11

1. Svelte 5 in `site/` only; `purity.test.ts` still green.
2. `LayoutConfig`, `PANELS`, `CONTROLS`, `OPERATIONS`, `SHADINGS`, `FIT_MODES` registries.
3. Per-layer-variant `AssertNever` guards (design §9.1). **Do not attempt a single guard
   over `Scene`** — it cannot be written; §9.1 says why.
4. Each `PresetFn` declares its own parameter descriptors.
5. The **reachability test**: for the default layout, every `CONTROLS` entry resolves to
   exactly one mounted panel.
6. **One registration test per registry** — a dummy entry appears without touching any
   other file. This is what makes R7 falsifiable.
7. Mark-based undo: one history entry per interaction.

### P4 — Canvas, layers, depth strip · PM-CANVAS · design §5.2–§5.6

1. Three views; four shadings with `ramp` default and a **configurable domain** `[near,
   far]` defaulting `[1, 0]`, plus an `auto` fit-to-scene mode.
2. Hold-to-reveal ground truth.
3. Depth strip: ticks for flat layers, **bars for heightmaps**, swept ranges for animated
   depth. Axis labelled in **scene px**.
4. **No drag-reorder and no paint-order warning.** `max` is commutative; layer order is
   inert. Sort by depth, with authoring order as an alternative.
5. Depth-tie badge fires only on **overlapping** layers at equal depth.
6. Structural operations (§5.6): create by type, delete, duplicate.
7. Three canvases; dragging never waits on an encode.
8. Handles drawn 8–10px, hit-tested 24×24.

### P6 — Timeline · PM-TIME · design §7

1. Layer rows expanding to **property rows**; actions attach to a property by right-click.
2. Action bars labelled with the **semantic action**, collapsed; expansion opt-in.
3. **Composition is sum/multiply**, matching `composeAnim`. Not last-wins. The inspector
   shows the composed value alongside each contribution.
4. Repeat, derived-duration (`marquee` from `speed`) and absent-duration bars each render
   distinguishably (design §7.3).
5. Design/Animate mode toggle.
6. Transport: playhead drag, `,`/`.`, `Shift` ×10, Option-drag to scale timing.
7. Scrub against the depth map; re-encode on scrub-end.
8. Depth-thumbnail filmstrip on the ruler.
9. Built, not vendored (design §7.5). Real estate reserved for a later curve editor.

### P5 — Asset import · PM-ASSETS · design §6.1, §6.3

1. PNG → silhouette mask or heightmap, baked at scene resolution.
2. Source cached in IndexedDB; **the scene renders without it**. Eviction degrades to
   "re-upload to re-derive", never breaks.
3. Re-derive on scene resize and on threshold change.
4. Link-size meter with a shareability band, visible during heightmap import.

### P8 — Polish · PM-CANVAS

Eyedropper, motion paths, onion skin, `U` key, Option-drag timing scale. **Closes no
requirement and is marked so.** Cut without ceremony if anything above slips.

---

## 8. Escalation

A PM escalates to the orchestrator — it does not decide — when:

- A design section is **wrong about the codebase**. This already happened five times in one
  review pass; treat it as likely, not exceptional.
- An exit criterion cannot be met as written.
- A task needs to touch files outside its phase.
- Two phases would conflict in the same file.
- A requirement (R-number) looks unsatisfiable.
- A worker reports something in `UNCERTAIN` that the PM cannot resolve with one more
  worker.

The orchestrator escalates to Shaun when a decision changes **what is built** rather than
how. Everything else it decides.

---

## 9. Known traps

Each of these cost a correction already and will be rediscovered by a fresh agent:

| Trap | Reality |
|---|---|
| "layer order is paint order" | `max` is commutative — order is inert |
| "later animator wins" | `composeAnim` sums and multiplies |
| "resting and animated depth are independent" | `emerge` anchors to `ctx.layerDepth` deliberately |
| "cardboarding needs a rasteriser change" | `heightmap` mode and `depthBlur` already ship |
| "fusion cliff is `sepNear` 78" | it is a **budget** of ~32px; 78 is its value only at `sepFar` 110 |
| "every layer has one depth" | heightmaps carry a range; animated depth sweeps one |
| "one `AssertNever` can span `Scene`" | it cannot — union keyof, lost provenance, index signature |
| "`sans-serif` resolves everywhere" | it resolved to dingbats in `@napi-rs/canvas` for a day |
| "the plate can be cropped to the stage" | margins are the fusion partners of the stage's edge columns |

---

## 10. Sequencing for the orchestrator

1. **PM-MODEL** — P0, then P1 and P7 (which are independent of each other).
2. **PM-PLAYER** — P2, may start as soon as P0 merges.
3. **PM-SHELL** — P3, after P2.
4. **PM-CANVAS** and **PM-TIME** — P4 and P6, after P3. Different file sets; the first
   genuine candidate for concurrency.
5. **PM-ASSETS** — P5.
6. **PM-CANVAS** — P8, or cut.

At most two PMs active at once. The limit is not machine capacity, it is how many
report streams an orchestrator can hold without starting to read code to disambiguate them.
