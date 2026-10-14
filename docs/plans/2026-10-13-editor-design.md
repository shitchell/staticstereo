---
title: Editor rewrite — design
description: Replacing the diagnostic site with a layered graphical and animation editor — architecture, scene model changes, the depth-authoring surface, the action/timeline model, and a perception module that keeps every perceptual threshold in one tweakable function
status: revision 2 — corrected after compliance and research audits
date: 2026-10-13
tags: [editor, ui, ux, svelte, design, staticstereo, timeline, depth, plan]
---

# Editor rewrite — design

Companion documents:

- [`2026-10-13-editor-requirements.md`](2026-10-13-editor-requirements.md) — what Shaun
  asked for, verbatim, numbered R1–R22. **The compliance target.**
- [`../2026-10-13-editor-ux-research.md`](../2026-10-13-editor-ux-research.md) — what the
  field got right and wrong, cited. **A prior, not a specification** (R8).

§16 is a traceability matrix. §17 records what revision 2 corrected and why, because
several corrections were errors about *this repository* rather than about the research,
and that is worth remembering.

---

## 1. The framing that organises everything else

**You cannot direct-manipulate a stereogram.** While you arrange layers the output canvas
is, by construction, noise. Three consequences run through everything below:

1. The **primary manipulation canvas is a depth view**; the stereogram is the render
   target you check against.
2. Depth is a **scalar with no visual analogue**, and the survey's strongest finding is
   that every tool facing this adds a second *spatial* view rather than a better number
   (research §1.1). Hence the depth strip (§5.3).
3. **Measurement is the proofreading.** In a medium where the author cannot read the
   output, diagnostics are not an add-on — which is why they get their own module (§10)
   rather than being scattered through panels.

### Why the current site cannot be extended into this

`site/main.ts` is 1346 lines of imperative DOM wiring against fixed `getElementById`
handles, and the panels mirror the *renderer's* parameter list rather than anything an
author thinks in. That is the mechanical cause of R3: the JSON textarea is where the model
actually lives and the panels are a partial projection of it.

---

## 2. Non-goals

- **The simple/quick editor** (R2). Architected for — §11 states the test — not built.
- **A curve/graph editor.** Named easings plus a custom cubic-bezier. But see §7.6: the
  timeline **reserves the real estate** for one, because the research's finding is
  specifically that AE's graph editor is a toggle of the same panel, not a new one.
- **Node graphs, state machines, NLA-style clip libraries** (research §7).
- **Collaboration, accounts, a backend.**
- **`type: 'draw'` layers in the browser.**
- **New perceptual thresholds.** §10 builds the *machinery* and moves today's rules into
  it unchanged. Calibrating better numbers is effort #2 (R1).
- **Depth blend modes** (Add / Carve / Keep-overlap). Named in §10.4 as the real
  cardboarding cure and deliberately deferred — it is a core rasteriser change, not UI.

---

## 3. Architecture

### 3.1 Where code lives

| Package | Change |
|---|---|
| `src/core/` | Scene type only (§4). Pipeline, both encoders, plate/stage untouched. Framework-free; `purity.test.ts` enforces it. |
| `src/shared/` | **New:** `.stst` container; **`perception.ts`** (§10); layer-id generation. Used by CLI and site (R18, R22). |
| `src/cli/` | **Reads and writes** `.stst`. Gains nothing web-shaped. |
| `site/` | Rewritten as a Svelte 5 app, split into **player** and **editor**. |

Svelte exists only in `site/`.

### 3.2 Player / editor split

Two Vite entries; the editor imports the player, never the reverse. Precedent: Theatre.js
splits runtime from studio so the editor never ships to production.

- **Player** — scene decode, render pipeline, canvas, fit modes, transport. What present
  mode and an `<iframe>` load.
- **Editor** — everything else.

`dist.test.ts` asserts the player bundle contains **no editor code**, in the spirit of its
existing "no Node code in the bundle" check. Elective engineering, but cheap and it serves
R14 directly: an embedded stereogram must not ship a timeline editor.

### 3.3 Rendering: three canvases

| Canvas | Redrawn | Carries |
|---|---|---|
| Depth | on scene change | shaded / false-colour / greyscale depth composite |
| Overlay | per rAF | selection handles, guides, stage guide, motion paths |
| Stereogram | debounced / on idle | the encoded output |

**The justification is local and measured, not borrowed.** `sirds.ts` records 40–68 ms per
frame at 1600×600 under `linked`, and `types.ts` records linked costing ~2.9× shift at
this budget. Dragging a layer must not wait on that. (Excalidraw's two-canvas split is a
different thing — one image rendered twice at different cadences, and its own issue
admits the duplicated pipelines cost 30–50%. Ours are three *different images*, which is
a view decomposition and needs no precedent.)

### 3.4 State

One scene store as the single source of truth.

- **The URL hash is a projection of the store**, written on a microtask after mutation so
  rapid edits coalesce. Today the two are parallel and can disagree.
- **History is mark-based** (tldraw's model): changes accumulate until a mark flushes
  them as one entry, so a whole drag or slider sweep is one undo. Ephemeral interaction
  state is tagged to be ignored.

---

## 4. Scene model

### 4.1 Layer identity

`Layer` gains `id?: string` and `name?: string`, **both optional**, so `examples/*.yaml`
stay exactly as they are.

- `id` — short base64url. **Assigned on first mutation, not on load**, and persisted
  thereafter. Loading a legacy scene and saving it unchanged is therefore byte-identical;
  only editing introduces ids.

  **The validators preserve ids; they never mint them.** `src/shared/` exports a pure
  `newLayerId()`, and the editor's mutation path (P3) is the only caller. An earlier draft
  said "both `validateScene`s generate ids identically" — that contradicts the sentence
  above, because a validator that mints on load destroys the byte-identical round-trip.
  What must be identical across the two implementations is *preservation*, and that is a
  real requirement: the CLI validator returns the raw input after an allow-list check,
  while the site validator **rebuilds field-by-field and silently drops anything it does
  not name**, so without an explicit change it would strip ids on every URL round-trip.

  **A related asymmetry was closed only halfway, deliberately.** The site validator now
  *rejects* an unknown **keyframe channel** instead of dropping it, matching the CLI's
  error shape — typing `rotatX: 5` used to validate clean, lose the value, and render
  something subtly wrong with no signal, which on a URL-is-the-scene design is
  unrecoverable data loss rather than a validation nicety. Unknown **layer**, **track** and
  **scene** keys are *still* dropped silently. Full parity is a much larger job, and half
  of it delivered quietly would be worse than none: it would teach an author that the site
  catches typos and leave them wrong about where. The limitation is recorded at both the
  rejection site and the rebuild site, because a reader who finds the drop will otherwise
  file it as a bug.
- `name` — derived from content when absent (`HELLO`, `ball.png`, `circle`). Pre-empts
  PowerPoint's biggest usability complaint, where the pane lists effects with useless
  default names and the documented first step is "go rename everything."

Why ids at all: every surveyed name-matching animation system fails silently when names
drift (research §3), and array-index identity cannot survive a reorder.

### 4.2 Verbs (R9)

The mechanism is already right — `Preset { kind, ...params }` compiled by a `PresetFn`
into a `Track` *is* "action + parameters". And the vocabulary is **already half right**:
`slide` (`presets.ts`) is `move` with `from`/`to`. What is missing is coverage and naming.

All five honour `overrides()` (`ease`, `repeat`, `start`, `duration`, seconds) like every
existing preset, and all default to `ease: 'linear'`, `repeat: 'once'` — **verbs are
unopinionated primitives**, and opinionated defaults are exactly what made `emerge` a
preset rather than a verb.

**One exception, and it is forced: `push` defaults to `ease: 'easeOut'`.** §4.2b requires
`push` to compile to *precisely* what `emerge` did, and `emerge` defaulted to `easeOut`. So
`push` carries an opinionated default **by inheritance, not by choice**, and the sentence
above disqualifies it from verb-hood by its own test. The exact-reproduction requirement
wins, because it is what the golden corpus exists to prove. Recorded here because a reader
arriving at the paragraph above will otherwise change one word in `presets.ts` and redden
the golden — and because it is the one place the descriptor table cannot help: `ease` is
omitted from `PRESET_PARAMS` on the grounds that it is universal, which is true of its
*application* and false of its *default*.

| verb | params | defaults | unit | writes |
|---|---|---|---|---|
| `move` | `from`, `to` | `[0,0]`, `[0,0]` | scene px, **offset from the resting `at`** | x **and** y |
| `rotate` | `from`, `to`, `axis` | `0`, `0`, `'z'` | **degrees**, delta from rest | `rotate` / `rotateX` / `rotateY` |
| `scale` | `from`, `to` | `1`, `1` | **absolute multiplier** | scale |
| `push` | `from`, `to` | `0`, `ctx.layerDepth` | depth 0..1 absolute, compiled as `− ctx.layerDepth` | depth |
| `flip` | `axis` | `'y'` | — | constant `π` on `rotateX`/`rotateY` |

Five of these are decisions rather than transcriptions:

- **`move` is `slide` under its right name**, same offset semantics. Reusing the existing
  convention avoids inventing a second answer to "absolute or relative".
- **`rotate` takes degrees and converts inside the `PresetFn`.** Degrees is already this
  schema's *authoring* unit (`shape.start`/`end`); radians is its *`Transform`* unit; and
  the `PresetFn` is where every other unit translation already happens — `marquee`
  converts px/sec into a duration. An author types `to: 180`, not `to: 3.14159`. The cost
  is a hidden conversion, paid for by the golden fixture and an explicit `180 → Math.PI`
  assertion. **Core gains an exported deg↔rad helper.** *Landed as `src/core/angle.ts`
  (`degToRad`/`radToDeg`), and `raster.ts`'s private `const RAD = Math.PI / 180` — the
  duplication this helper existed to end — is gone with it.

  The switch was treated as a behavioural edit, because it is one. The two spellings
  `d * RAD` and `(d * Math.PI) / 180` disagree by one ulp for roughly a quarter of integer
  degrees, and **one angle the suite exercises is among them**: `raster.test.ts`'s
  `{start: 135, end: 405}` pacman moves from `7.06858347057703451100` to
  `7.06858347057703362282`, so the cosine fed to the rasteriser did change in its last bit.
  **No measured assertion moved**, and could not have — that test probes 45° from the
  wedge boundary and asserts to five decimals, about ten orders of magnitude of margin
  against a 9e-16 rad shift. The angles in `examples/` (`pacman.yaml`'s 40 and 320) and the
  cardinals are bit-identical, and the cardinals are what `flip` and `rotate`'s
  exact-equality assertions rest on.

  Recorded at this length because an earlier draft of this paragraph claimed the two
  spellings were "bit-identical at every angle the committed corpus uses". That is
  checkable and, on any reading that includes the test suite, false — it was promoted from
  a worker's report into this document without a single value being checked, and two
  independent agents caught it. The true claim is the weaker one: no assertion moved.*
- **One `rotate` with an `axis`, not three verbs** — the three rotations are one family.
  `axis` is `'x' | 'y' | 'z'`, naming the channel it writes rather than pitch/yaw/roll.
- **`scale` is absolute, not a delta**, because `composeAnim` *multiplies* this channel
  and `IDENTITY.scale` is 1. For a multiplicative channel the absolute factor *is* the
  delta; writing `to − 1` would produce a zero-scale catastrophe.
- **`flip` is static sugar, not a motion.** Animating a flip is
  `rotate: {axis: 'y', from: 0, to: 180}`. No overlap between the two.
- **`move`'s `from`/`to` accept a symbolic endpoint as well as a number** — `offLeft`,
  `offRight`, `offTop`, `offBottom` — resolved from `PresetCtx` exactly as the deleted
  `marquee` resolved them, and `move` also takes an optional `speed` that derives
  `duration`.

  Both are capabilities `marquee` had that a literal `from`/`to` loses, and the loss is
  not cosmetic. With `marquee` deleted, `scrolling-text.yaml` carried *hardcoded*
  off-stage literals where it used to derive them: change the scene width or the font and
  those numbers are silently wrong. Worse, `PresetCtx.marginLeft`/`marginRight` were left
  with **neither a reader nor a test**, so the only assertion in the repo pinning the
  plate-vs-stage margin relationship was guarding a relationship no shipped code depended
  on any more.

  Symbolic endpoints restore the `measureText → contentW → endpoint` chain to the
  production path. One verb, both affordances — the same move as folding `speed` in.

  **Status: `speed` landed in P0; the symbolic endpoints landed in P0b**, a follow-on phase
  cut for them. P0's criteria list carried only the `speed` half of this bullet and was
  silent on the other, so that phase matched the plan rather than the design; P0b closed the
  gap, and closing it was the reversal this paragraph used to warn about rather than a blank
  being filled.

  **The spelling is per-slot**: a token stands where a number stands, so `from`/`to` stay one
  parameter each — `from: [offRight, 0]`. `offLeft`/`offRight` are valid **only in slot 0**
  and `offTop`/`offBottom` **only in slot 1**; the wrong axis throws, naming the axis, the
  slot and the parameter. §4.2b's own table is the second authority for that reading: it
  assigns off-stage endpoints to the *verb* and `slide-in`'s whole-direction token to a *P6
  template*, so the axis-selecting form is spoken for elsewhere.

  **Four tokens, two formula shapes**, and the asymmetry is correct rather than an oversight:

  | token | resolves to |
  |---|---|
  | `offRight` | `ctx.sceneW + ctx.marginRight` |
  | `offLeft` | `−(ctx.contentW + ctx.marginLeft)` |
  | `offBottom` | `ctx.sceneH` |
  | `offTop` | `−ctx.contentH` |

  The vertical pair carries **no margin term** because `Margins` is `{left, right}` only and
  `plateLayoutOf` applies no vertical padding (§10.2 **of the 2026-10-09 design** — this
  document's own §10.2 is fusion comfort, so the bare cross-reference misleads). A blanket
  "add the margin" would push
  a `from: [0, offTop]` entry a plate-margin above the frame for no reason.

  **A token resolves from the stage and the plate, never from the layer's `at`** — the
  channel is still an offset from `at`, and both statements are true at once. What is *not*
  true is that the result is off-frame for any layer: it is off-frame only when `at[0] === 0`.
  That convention is recorded as load-bearing at `src/cli/scene.ts`'s `textScene`, and it has
  one shipped exception worth knowing, because it needs no mistake by the author: a
  `shape: circle` layer defaults `at` to the stage **centre**, where every other layer type
  defaults to `[0, 0]`. So a tokenised circle starts half a stage short, and overshoots by
  its radius besides, since the formula assumes `at` is the content's left edge.

  **What the consequences cost, now that they are history.** `PresetCtx` had **six** fields
  with no reader, not the four this paragraph used to name — `sceneW` and `sceneH` were as
  unread as `contentW`/`contentH`/`marginLeft`/`marginRight`, and only `push` read
  `layerDepth`. The formula `−(contentW + marginLeft)` had **no assertion anywhere**; it now
  has a witness that fails in both directions, which the deleted `marquee` one did not — a
  gross over-measurement (`contentW` forced to `12345.678`) used to redden nothing at all,
  because the old witness sampled two columns either side of a boundary and over-measurement
  cleared both.

  **The consumer-side gap is closed, with its limit recorded.** A fixture now renders a
  scroll's far endpoint, which no shipped scene did. The limit: it uses `repeat: 'once'`
  where all three shipped scrolls use `loop`, so it renders the far endpoint of a scroll
  *shaped like* the shipped ones rather than of one.

  **And the sharpest thing P0b measured, which explains the 17.33px defect better than the
  duration mismatch does.** This paragraph used to say the far endpoint is unwitnessed
  because every corpus derives a travel longer than its scene — true (`scrolling-text.yaml`
  17.0s against `duration: 6`; the README's 19.98s against 4, having been 21.67s before its
  endpoints were tokenised). But the deeper reason is algebraic: `move` with `speed` sets
  `duration = travel / speed`, so `x(s) = from − speed·s` and **`to` cancels out of every
  rendered position, surviving only in the duration.** Substituting a grossly wrong `to` into
  `scrolling-text.yaml` leaves all 72 frames byte-identical. The bound is real but generous —
  shortening the move far enough *does* change frames, with break-even around `to ≈ −447` —
  so the honest statement is that any endpoint beyond break-even, right or wrong, renders the
  same picture. **A correct literal here would have been unfalsifiable, which is the whole
  argument for deriving it.**

  **For whoever builds the timeline templates, because it changes how you test them: no
  far-endpoint change in these scenes can ever be validated by rendering.** It has to be
  validated at the `Track` level — compile the preset and compare the keyframes. The
  condition is scene duration sitting inside the derived duration, which holds for all three
  shipped scrolls (6s against 17.00s, 6s against 11.70s, 4s against 19.98s), so a rendered
  frame is simply the wrong instrument for the question. P6 re-derives these endpoints in a
  template; it needs this before it writes one. This is also why the corpora's zero-movement
  check rested on a `Track`-level comparison and why its render-level half was vacuous — see
  the plan's §6.5a, which this is the worked example of.

  **Outstanding: §4.2b-pre's scalability obligation.** A token resolves from an
  already-scaled `PresetCtx`, so it must be marked *not* scalable or `fit=render`
  double-counts it — and there is no field to mark it in. `NumericParam` is
  `{name, unit, shape, default, per?}`, scalability is inferred from `unit`, and a token on
  `move.from` is `scenePx` + `pair`, i.e. scalable by default. It may also be the wrong
  shape: `from: [100, 0]` scales and `from: [offLeft, 0]` does not, **same parameter** — so
  this is a property of the value, not of the descriptor. The descriptor additionally now
  understates the accepted *domain*, so a control generated from it would offer two number
  inputs and no way to say `offRight`.

  **What makes that safe today is a fail-closed allow-list, not an absent feature.** An
  earlier draft of this paragraph said `fit=render` did not exist yet. It does: it is a live
  `FitMode` with user-facing copy, and the render plan calls `scaleScene`. What prevents the
  double-count is that `scaleScene` scales only the preset kinds on an explicit allow-list —
  `push` alone — and **refuses** anything else, returning `unscalable-preset` and naming the
  verb. So a token string never reaches a multiplication, and there is no `NaN` route either.
  `PRESET_PARAMS` having no production consumer is true but is not what is protecting us.

  **That matters because it names the trigger condition.** The obligation goes live the
  moment `move` joins that allow-list — which the scaler itself already contemplates as its
  own task — rather than when some absent feature appears. A phase picking this up should
  check the allow-list first, and should treat the descriptor question as *"what does a
  scaler need in order to admit `move` safely"*, which is a sharper question than "mark it
  not scalable". Deferred deliberately, with that reasoning, rather than overlooked.

**`slide` and `emerge` are renames, not delegations.** An earlier revision of this section
argued for keeping near-identical bodies rather than having `slide` delegate to `move`,
to avoid risking the legacy-output guarantee in the phase that established the golden.
**§4.2b supersedes that entirely**: `slide` *became* `move` and `emerge` *became* `push`,
and the golden proved the renames were renames: the fixture held 19 cases at the time and
every recorded `output` survived byte-identically, which is checkable from the fixture's own
history. A verifier additionally compiled the old and new registries side by side over a
parameter sweep — 5,216 cases, zero differences — which is *not* checkable from this repo
and is cited as out-of-tree evidence rather than as a fact the tree will confirm.

**"Fade" compiles to `push`.** `Transform` deliberately has no opacity: there is no
meaningful transparency in depth space, so fading is motion in depth. R10's "ease-in
fade-in 250ms" is a `push` with an ease.

### 4.2b-pre Each verb's parameters declare their own unit and default

Landed in P0, pulled forward from the editor shell's "each `PresetFn` declares its own
parameter descriptors", because **the moment to record a parameter's unit is while writing
the function that consumes it.** Otherwise a later phase reverse-engineers units from
implementations, which is the provenance loss §9.1 warns about — `shape.start`/`end` are
degrees, `Track.start`/`duration` are seconds, same word.

`src/core/anim/params.ts` exports `PRESET_PARAMS`, tied to the registry by
`Record<PresetKind, …>` so that **adding a verb without descriptors, or deleting a verb's
descriptors, is a compile error.** Unit vocabulary: `scenePx` · `degrees` · `depth` ·
`seconds` · `multiplier` · `enum`.

Three decisions worth recording:

- **`speed` is `scenePx` with `per: 'second'`, not its own unit tag.** Under `fit=render`
  a rate in px/s scales by *exactly* the same factor as a distance in px — the geometry
  scales and time does not — so a consumer saying "scale every `scenePx` parameter" gets
  `speed` right for free. A distinct `scenePxPerSecond` tag would make `speed` invisible to
  that rule, which is the fail-open bug the unit tags were raised to kill.
  **The same reasoning puts an obligation on the symbolic endpoints above:** a token
  resolves from an already-scaled `PresetCtx`, so it must be marked *not* scalable, or
  `fit=render` double-counts it.
- **Descriptors carry defaults, checked against behaviour rather than read off the source.**
  Running that check found a default that is dead code: `move`'s `speed` has an apparent
  fallback of `60` inside a branch that only runs when `speed` is present, so the fallback
  can never fire. It is recorded as "no default". A table built by reading the source would
  have published a value the function cannot produce.
- **One default is not a literal.** `push`'s `to` defaults to `ctx.layerDepth`, so it is
  recorded as a tagged marker rather than a number — a consumer must be able to tell
  "defaults to 0.5" from "defaults to wherever this layer sits", and an omitted field says
  neither.

`ease` and `repeat` are deliberately absent: `overrides()` applies them to every preset
uniformly. **Their defaults are not uniform, though** — see `push` above — so a consumer
driving a control from this table cannot get `push`'s initial ease from universality alone.
A phase that needs the four universal parameters rendered will need its own declaration
for them.

### 4.2a Bundles are UI macros, not registry entries

**A bundle cannot be a `PresetFn`, and revision 2 was wrong to imply it could.** A
`PresetFn` returns one `Track`, and a `Track` carries one `ease` and one `repeat`. R10's
own example — ease-in fade over 250ms *plus* a bounce — needs `easeIn`/`once` on depth and
`easeOutBounce`/looping on y. There is no single `Track` that holds both.

So a bundle is **a template the editor expands at attach time**, writing an ordinary
`Anim` array:

```yaml
anim:
  - {kind: push,   from: 0, ease: easeIn,       duration: 0.25}
  - {kind: bounce, height: 40, ease: easeOutBounce, repeat: once}
```

Three things fall out of this, all good:

1. **No model change.** `Anim` is already `Track | Preset | (Track | Preset)[]`, and
   `bouncing-ball.yaml` already composes two animators on one layer.
2. **The bundle→verbs rung disappears.** A bundle was never in the scene to begin with, so
   there is nothing to expand — which collapses §7.1's ladder to the single rung the
   research actually evidenced, and matches Lottie Creator's zero-conversion approach.
3. **Bundles do not round-trip**, and that is correct. A saved scene contains verbs; the
   editor cannot tell "entrance" from the two verbs it wrote, and has no reason to.

Two bundles ship (R10): **`entrance`** as above, and **`flyIn`** — `move` from off-stage
with `easeOut`. Durations are seconds; R10's "250ms" is `0.25`.

### 4.2b The legacy presets are deleted, not preserved

Earlier revisions kept `marquee`, `emerge`, `bob`, `bounce`, `slide` and `slide-in`
registered "so existing YAML and existing links keep working", hidden from the picker by
an allow-list. **That was backwards compatibility reasoning and it does not apply here.**
Shaun, asked directly:

> "no one else is using this. if any decisions are made due to backwards compatibility
> concerns, then those decisions ought be reviewed. we could not care less about backwards
> compatibility."

So **`PRESETS` contains the five verbs and nothing else.**

| was | becomes |
|---|---|
| `slide` | **renamed** `move` — it already *is* `move` with `from`/`to` |
| `emerge` | **renamed** `push` — already exactly the depth verb |
| `marquee` | `move` with off-stage endpoints. Its one distinct capability, deriving duration from a speed, moves onto `move` as an optional `speed` param |
| `bounce` | UI template → `move` on y with `easeOutBounce` |
| `bob` | UI template → `move` on y, `pingpong` |
| `slide-in` | UI template → `move` from a direction |

This removes the allow-list, removes `uiVisible`, and removes the P6 task that would have
maintained the distinction. It is strictly less machinery than preserving them.

**What the golden corpus is still for.** Capturing current output before the refactor
remains worth doing, with a changed purpose: it proves the renames are *renames*. `move`
must compile to precisely what `slide` did, and `push` to what `emerge` did, or the
rename quietly became a rewrite and nothing else in the suite would notice. Deletions
show up as removed fixture entries in a commit that says so.

**The golden stays.** This paragraph called it "a one-shot refactor instrument, not a
permanent pin", and that sentence was wrong twice over: the orchestrator ruled at P0's
merge that the fixture is kept, and a value-pinning fixture that survives its refactor
stops being an exception and becomes **precedent** — the next phase wanting to pin values
will simply cite it. So the boundary is stated rather than the lifetime: execution plan
§2.4 now admits a value-pinning fixture only where all three of **pure deterministic
compiler**, **inputs enumerable from a registry**, and **exists to prove a refactor
preserved behaviour** hold. The golden clears all three; a golden over a rasteriser or a
renderer fails the first, which is why this one had to be kept strictly upstream of
`raster.ts` — `Math.cos` and `@napi-rs/canvas` make everything below it machine-dependent.
Its job is now continuous rather than one-shot: it is what makes a later rewrite of a
`PresetFn` show up as a diff.

**The cost is the examples, and it is not trivial.** All three `examples/*.yaml` use the
old names, and `metamorphic.real.test.ts` reads them with *measured* assertions — row
locality, dead-zone row loss, per-seed silent-row counts. Rewriting the examples to verbs
can move those numbers, and a moved measurement is indistinguishable from a regression at
a glance. **Rewriting the examples is its own task with its own review**, never a side
effect of a registry change.

### 4.3 D1 — `flip` has nowhere to write, because `Transform` is a fixed five-slot bus

**This is not a question about action parameters.** Each verb takes whatever parameters
suit it — `move` takes endpoints, `scale` takes a factor, `flip` would take an axis — and
`PresetFn` plus per-verb descriptors (§9.1) already provide for that. The constraint is at
the other end.

Whatever parameters an action takes, it compiles to a `Transform`:

```ts
interface Transform { x: number; y: number; depth: number; scale: number; rotate: number }
```

That is the fixed set of five values every animator's output flows through. `composeAnim`
sums four and multiplies `scale`; the rasteriser applies them. **`scale` is one number, so
it is uniform** — there is no way to express "mirrored on x, unchanged on y". The action
has no slot to write to.

Per axis:

- **x or y** — needs non-uniform scale. Widening to `number | [number, number]` is
  backwards-compatible (`number` stays valid) but touches `IDENTITY`, `evalTrack`,
  `composeAnim`'s multiply, and the rasteriser's transform application.
- **z (depth)** — would mean inverting a layer's own relief. A no-op for a flat plane; for
  a heightmap it means peaks becoming valleys, which is meaningful and *also* inexpressible
  — depth composes as an additive offset, not a multiplier. (`cross` inverts depth, but
  globally, for the whole scene.)

**Resolved: three rotations, landed in `400ba98`.** Neither of the two options above was
taken. `Transform` gains `rotateX` and `rotateY` beside the existing `rotate`, which is —
and always was — rotation about **z**. Under an orthographic projection the other two
reduce exactly to a cosine scale on the opposite axis:

    rotateX(θ) → scale y by cos θ        rotateY(θ) → scale x by cos θ

So `rotateY = π` gives `sx = −1` and mirroring needs no `flip` channel and no non-uniform
`scale`. This is better than widening `scale` to a pair on three counts: it names what it
means, the in-between values stay meaningful (±π/2 is a card edge-on), and rotations
compose *additively*, so two quarter turns are a mirror — which falls out of `composeAnim`
summing every channel but `scale`.

`flip` therefore becomes sugar: `flip` with no axis is `rotateY: π`; `{axis: 'x'}` is
`rotateX: π`.

**The designed-in flex point** is the reason to do it now rather than later. With a flat
layer `rotateY` is indistinguishable from a horizontal squash, because an orthographic
projection carries no perspective cue. It becomes a *real* turn when the rasteriser
transforms depth alongside position — rotate a heightmap about y and each column's depth
shifts. That is a rasteriser change and not a model change: `Transform` is identical in
both worlds, and so is every scene written against it. Full 3D models later are a new
layer type writing into the depth buffer and need nothing from this type at all.

Two defects shipped with it and are named in the commit message rather than hidden: a
missing type import breaks `typecheck`, and the animatable-channel list turns out to be
duplicated in `src/cli/scene.ts` and `site/scene.ts` with neither guarded, so both
validators still drop the new channels. See the execution plan's P0.

### 4.4 Easing

Existing named set plus `cubic-bezier(a,b,c,d)` serialising to a CSS easing string. Named
list with a Custom escape — PowerPoint's own pattern of named magnitudes with a numeric
escape *inside* the preset. A small inline bezier preview sits beside the four numbers;
see §9.2 for why that matters.

### 4.5 Resting pose vs animated pose — mostly in the data, one coupling to fix

A layer's `at`/`depth` are the resting pose and `IDENTITY` is
`{x:0, y:0, depth:0, scale:1, rotate:0}`, so tracks are deltas. Design mode edits the
layer; Animate mode edits actions (§7.3).

**One shipped preset is anchored to the layer's depth, and that is deliberate.** `emerge`
compiles its keys *relative to* `ctx.layerDepth`:

```
{ t: 0, depth: num(p, 'from', 0) - ctx.layerDepth }
{ t: 1, depth: num(p, 'to', ctx.layerDepth) - ctx.layerDepth }
```

Changing the layer's resting depth therefore moves the emerge's endpoint. An audit read
this as a defect and an earlier revision proposed expanding such presets to absolute keys
on first edit (as "D4"). **That was wrong and is withdrawn.** `composite()` applies
`flat = clamp01(baseDepth + depthOffset)` — a track's depth *is* an offset — and the
preset's own docstring records that keying absolute values "is exactly the bug this
replaced: a layer at depth 1 animated 1→2 and clamped to a static surface." The semantic
is "come up from the noise to wherever this layer lives", and the endpoint tracking the
layer is the point.

So this is a **representation** obligation, not a model change: the depth strip's swept
range moves with the tick, and the inspector labels the endpoint "layer depth" rather
than showing a frozen number.

### 4.6 No hash version bump

Revision 1 proposed `v2` with `deflate-raw`. **Cut.** `id` and `name` are optional, so a
v1 link still decodes; and §6.1's mask baking already solved the payload problem that
compression was aimed at. Compression also made encoding async, which rippled into the
store for no requirement. `HASH_VERSION` stays available for the day something actually
needs it.

---

## 5. The editor shell

### 5.1 Layout

Two fixed, width-draggable sidebars and a bottom dock. No floating panels: nobody in this
class ships free docking, and Photopea — also one developer — gets most of the feel from
fold/unfold columns with a grab bar.

Left = layers · Centre = canvas + depth strip · Right = inspector · Bottom = timeline.
One key hides all chrome. R7's flexibility is served by §11, not by docking.

**The §8.3 sub-pixel constraint applies here too**, and revision 1 applied it only to the
player. The editor's own canvas is what the author fuses while working, so anything added
above it in flow moves its device-pixel origin. View switcher and shading controls are
absolutely positioned or placed below.

### 5.2 Views and shadings

**Three views** (R11) as a registry: `depth` · `stereo` · `both`.

The depth view carries a **shading**, also a registry:

| shading | what |
|---|---|
| `ramp` **(default)** | two-point LUT. **Near and far colours configurable**, defaulting white = near, black = far (R12). |
| `relief` | hillshade, azimuth 315° / altitude 45° — recruits the light-from-above prior |
| `turbo` | Google's Turbo, built for depth and disparity maps |
| `grey` | raw, unstretched — **export truth** |

`ramp` is default because R12 asked for it. The research's second-strongest depth finding
is that relief should be default; **R12 wins, and the conflict is recorded rather than
silently resolved.** Relief is one keystroke away and `SHADINGS` makes the default a
config value, so this is reversible by preference rather than by code.

**This also overturns a recorded decision in `site/depthmap.ts`**, which argues that "a
false-colour ramp would read nicer and would hide exactly the thing the panel exists to
reveal." That worry is real and is answered rather than dismissed: `grey` remains export
truth, the legend states a non-default domain, and hold-to-reveal puts the raw map one key
away without changing a setting. The original rationale must be amended in place, not
deleted — a future reader needs to know the trade was re-decided and why, which is this
repo's own convention.

### 5.2a Depth lives on luminance, never on alpha

A PNG imported as a heightmap carries depth in **luminance**, with **alpha reserved for
the mask**. This was considered afresh and kept, because the alternative is more appealing
than it is workable.

The decisive reason is already recorded in `raster.ts`: heightmap mode keeps alpha as the
mask "so a transparent PNG's background does not become a depth-0 slab that hides
nothing." *Is this pixel part of the layer* and *how near is it* are two different
questions, and one channel cannot answer both — put depth on alpha and a half-alpha pixel
asserts "half outside the layer" and "mid-depth" at once, with no way left to say "part of
this layer, at the far plane."

Two practical reasons besides. **Alpha is the one channel no tool displays**: open an
alpha-encoded depth map in a browser, an editor or an image viewer and you see RGB over a
checkerboard. In a medium where the author already cannot read the output, an unreadable
*source* is the wrong trade. And alpha is lossy in transit — premultiplication, screenshot
flattening, copy-paste.

Greyscale, by contrast, is the identity mapping of a scalar field onto a visual, which is
why every depth pass in every DCC tool is greyscale, and it stays readable in a diff — the
value that keeps all three examples in plain text.

**The separation that makes this safe is §5.2's:** the model stores a scalar, the view
renders it however reads best. False colour is a reversible view transform over unchanged
data, not a change to what is stored.

**The ramp has a configurable domain, which is R12's "near ceiling".** `[near, far]`
display clamps defaulting to `[1, 0]`. Revision 1 refused this as definitionally
impossible; that was wrong — it is a display mapping, and revision 1 shipped two automatic
versions of it in the same section. An `auto` mode fits the domain to the scene's occupied
range, which is the "display stretch" of revision 1 folded into one control.

Guard rails: a custom ramp must be **monotonic in luminance** or depth ordering becomes
unreadable; relief azimuth is constrained above the horizon or the surface inverts. When
the domain is not `[1, 0]`, the legend says so — a stretched ramp decouples "looks white"
from "is nearest".

**Hold-to-reveal.** A momentary ground-truth key: hold to see raw greyscale under whatever
shading is active, a second key to peek the stereogram. Relief is an interpretation; you
should be able to check it without changing a setting.

### 5.3 The depth strip

A horizontal elevation beneath the canvas: far left, near right.

**Not every layer is a tick, and revision 1 assumed they all were.** Three cases:

| layer | drawn as |
|---|---|
| `text`, `shape`, silhouette `image`/`gif` | a tick at its depth |
| **heightmap `image`/`gif`** | a **bar spanning `[0, depth]`** — `raster.ts` makes depth per-pixel luminance × layer depth, so the layer occupies a range |
| any layer with a depth verb | the resting mark plus a **swept range**, animating as the playhead moves |

Dragging writes to the resting depth. Where a `PresetCtx`-anchored action is attached
(§4.5), the swept range **moves with the tick** and the inspector labels its endpoint
"layer depth" — because that coupling is deliberate, not a defect. (An earlier revision
said dragging should trigger "D4's expansion"; D4 is withdrawn and that instruction is
void. Expanding `emerge` to absolute keys would reintroduce a documented bug.)

Also on the strip: **two scales at once** — depth 0..1 and the separation it maps to, in
**scene px, explicitly labelled** (see §10.5 on units); and the **depth stops** as detents
(§10.3).

**The fusion-comfort band is not drawn here.** Revision 1 put it on this axis, which is a
category error: the findings' sweep varied the *global* `sepNear` with text at one depth,
so it is a statement about the scene's stereo settings, not about where a layer sits. It
belongs on the `sepFar`/`sepNear` controls, which is where §10.2 puts it.

### 5.4 Layer panel

The Photopea row contract: eye, lock, thumbnail, name, Ctrl/Shift multi-select,
**double-click to rename with Tab to the next layer**.

**Drag-reorder is not adopted, and that is a correction.** `raster.ts` composites with
`depth[i] = max(depth[i], layerDepth × mask[i])`. `max` is commutative, so permuting
`scene.layers` produces a byte-identical depth map — **the layer list is a set, not a
stack.** Revision 1 adopted reorder from the Photopea contract and also proposed warning
when "paint order disagrees with depth order", a condition that cannot exist here. Both
are removed. The panel instead **sorts by depth** by default, with authoring order
available as an alternative sort.

Per-row, specific to us: the layer's **depth value**, and a **depth-tie badge** (two
overlapping layers at equal depth merge into one surface under `max` — this one is real).
A **depth eyedropper** copies one layer's depth to another; demoted to the polish tier
(§13).

Grouping and filtering are deferred. When grouping lands it must be **plain folders that
do not change the render context** — AE's "precomp hell" is the counter-example.

### 5.5 Canvas interaction

8-handle bounding box; rotation just outside a corner.

| gesture | effect |
|---|---|
| Shift | constrain |
| Alt | from centre |
| Ctrl | **suspend** snapping (snapping defaults on) |
| Alt+click | cycle downward through overlapping layers, wrapping |
| double-click | rename / edit text in place |

**Hit targets are a hard requirement.** Draw handles and keyframe diamonds at 8–10px,
hit-test at 24×24 (WCAG 2.2 SC 2.5.8). Fusion's keyframe editor is disliked purely on
mechanics — ghosting during drag, targets too small, no axis lock — and that is the whole
of its reputation.

### 5.6 Structural operations

Revision 1 had no account of how a layer is created, which is the first item in R5 and the
first thing a user does. A path-keyed control registry cannot express it: adding a layer
is a structural mutation on a discriminated union, and the author must choose a variant
before any control applies.

So structural operations get their own registry, `OPERATIONS`, with the same flexibility
argument as §11:

- **Layer** — create by type (text / shape / image / gif), delete, duplicate.
- **Action** — attach to a layer, attach to a property (§7.2), detach, duplicate, expand
  (§7.1).
- **Keyframe** — insert at playhead, delete, duplicate.

Each operation declares its own undo mark (§3.4), so "add layer" is one history entry.

---

## 6. Assets

### 6.1 PNG import (R5)

A data URI is base64'd twice — once into the URI, once when the JSON becomes the hash — so
a 60KB logo is roughly 107KB of URL. The fragment never reaches a server so there is no
414, but links die in chat clients and mail wrapping somewhere around 2–8KB reliably.

**The renderer never consumes the PNG.** It consumes a silhouette mask or a heightmap. So
import bakes to what the pipeline eats:

- **Silhouette** → 1-bit mask, re-encoded as a mask PNG. A 400×300 silhouette is 1–3KB,
  i.e. 2–5KB of URL. Comfortable.
- **Heightmap** → 8-bit grey, an order of magnitude larger and **frequently not
  URL-viable**. Revision 1 missed this. Heightmap imports therefore default to downsampled
  grey with the link-size meter (§6.3) visible, and `.stst` is the supported path for
  anything that will not fit.

**The source image is kept in IndexedDB** (R19 was neutral; this is the recommendation).
The mask is baked at scene resolution, and scene resolution changes constantly while
hunting legibility thresholds. Source present → re-derive crisp on resize or threshold
change. **The store is a cache and the scene must render without it** — IndexedDB is
evictable, so a lost cache degrades to "re-upload to re-derive" and never breaks.

### 6.2 `.stst` (R17, R18)

A **real zip** — `CompressionStream('deflate-raw')` plus a hand-written central directory,
no dependency — containing `scene.json`, baked masks, original sources, and a manifest.
Chosen over a bespoke container so anyone can `unzip` it and read `scene.json`.

Lives in `src/shared/`; **`stst` reads and writes it** (R18). A project format only the
website could open would be the first asymmetry in an architecture that is otherwise one
core with a CLI and a site at parity. Animated GIF layers are what it is for — multi-frame
masks are too big for a URL, and R17 names them explicitly.

### 6.3 Link-size meter

A live readout of link length with a shareability band. You should see a scene approaching
unshareable while authoring, not discover it in Slack. Load-bearing for heightmap imports
(§6.1).

---

## 7. Animation and the timeline

### 7.1 One rung

**verbs → keyframes**, an explicit, per-item, one-way expand. That is the whole ladder.

Revision 2 said two rungs and revision 1 said three. Both were wrong, for different
reasons. Three was an overclaim — research §1.3 shows three *one*-hop conversions, two of
which skip the proposed middle. Two was an impossibility: §4.2a establishes that a bundle
cannot be a registry entry at all, so it is a template the editor expands at *attach*
time and never reaches the scene. There is nothing left to convert it from.

Which lands exactly where the strongest evidence pointed. Lottie Creator applies a preset
by baking its real content immediately, "so there is no conversion event at all", and
Principle's escalation failure is the standing warning against carrying extra
representations.

Revision 1 claimed a three-rung ladder "validated three times independently". It was not:
research §1.3 shows three *one*-hop conversions, and they are not the same hop — Jitter
goes preset→actions, Figma Motion goes preset→keyframes skipping the middle, Cavalry has
no conversion at all, and Lottie Creator bakes keyframes immediately with zero rungs.
Principle's escalation failure (complexity forced a wholly separate Drivers model) is the
standing warning against extra representations, and three representations means three
things the timeline must label and three states undo must span.

**Conversion is per item, never all-at-once.** Apple Motion's all-behaviours-at-once rule
exists only because several behaviours may write the same property; our composition rule
(below) makes that a non-issue.

**Expansion is lossy and must say so.** §11 demands visible degradation of Google Web
Designer's two-mode round-trip; the same standard applies here. An expanded action records
what it was expanded from.

### 7.2 Composition: sum and multiply, which is what the engine already does

`composeAnim` accumulates across every animator on a layer:

```
acc.x += t.x   acc.y += t.y   acc.depth += t.depth   acc.rotate += t.rotate
acc.scale *= t.scale
```

**Revision 1 specified "later action on the same property wins", which contradicts this
and would break `bouncing-ball.yaml`** — whose own header says "their translations sum,
which is why there is no `slide-with-bounce` preset." The shipped rule is also better:
under multiply, `flip(-1) × scale(2) = -2` is correct.

The UI consequence is that stacked bars **compose rather than override**, and the
inspector shows the composed value alongside each contribution. This also makes the
Cavalry gesture coherent: **actions attach to a property, and a property can carry
several.**

### 7.3 One view, with property rows

Each layer is a row. Each action is a **labelled bar** positioned by `start` and sized by
`duration`, stacked when actions overlap. A layer row expands to **property rows**
(x, y, depth, scale, rotate), which is where an action is attached by right-click — the
Cavalry gesture the research singles out, and which revision 1 adopted as a noun while
dropping the interaction because it had no property rows to right-click on.

Two findings pin the bars:

- **Never ship the flat list without them.** PowerPoint on macOS, Keynote's Build Order,
  Canva and Framer all generate the same complaint about invisible overlap; CreativePro
  calls the missing Mac timeline "the most agonizing missing feature on the Mac."
- **The bar shows the semantic action, collapsed.** Figma Motion's loudest beta complaint
  was that a preset exposed its underlying properties instead of itself. Expansion to
  property rows is opt-in.

R5's "a line above it with markers to represent animations" is these rows, sitting above
the ruler. An aggregate summary lane remains available as one registry entry if rows get
crowded.

**The data model needs three accommodations, not none** — revision 1 said none:

- `repeat: 'loop' | 'pingpong'` makes `duration` one *cycle* while the action plays on.
  `bounce` and `bob` both default to repeating. The bar draws one cycle solid and the
  repeats ghosted.
- `marquee` **derives** its duration from `speed`, so dragging that bar's edge writes back
  into a parameter the bar does not represent. Derived-duration actions get a distinct bar
  treatment and resize by editing the parameter.
- An absent `duration` means "remainder of the scene", which is not a width. Drawn open-
  ended.

### 7.4 Transport and scrubbing

Playhead drag; `,`/`.` nudge one frame, `Shift` ×10; Option-drag a selection scales timing
proportionally. **Scrub against the depth map; re-encode on scrub-end.**

A **filmstrip of cached depth-view thumbnails** along the ruler. Swifter (CHI 2013) found
a thumbnail grid beat conventional scrubbing at scene location by up to 48%, and the
research's own budget directive is to spend on scrubbing. It is nearly free here because
the depth canvas is already the cheap one (§3.3).

An `U`-style key collapses the timeline to only animated layers, and with property rows
now existing (§7.3), to only animated *properties*.

### 7.5 Build, not vendor — D2 resolved

**Decided: build it**, reading `animation-timeline-control` (MIT, zero-dep, dormant since
2024-07-21) and wavesurfer.js's Timeline/Regions plugins for ruler, playhead and
region-drag mechanics.

Three reasons, in order:

1. **The models do not match.** ATC renders generic keyframe rows; we need labelled
   semantic action bars over expandable property rows, with composed values shown
   inline (§7.2). Every interaction would translate between the two.
2. **A thin swap-out wrapper is the worst of the three options**, not the safe middle: it
   costs an abstraction layer *and* still inherits the foreign model, because a wrapper
   can rename an API but not change what the widget believes a row is.
3. **ATC is canvas-rendered.** Our rows carry text labels, nesting, badges and 24×24 hit
   targets (§5.5), all of which DOM gives for free and canvas does not.

The widget itself is a known quantity — ruler, playhead, rows, draggable bars, filmstrip —
and it is the part of the editor most likely to be reworked (R7), which argues for owning
it rather than bending something dormant.

### 7.6 Reserved real estate

The research's phrasing is that AE's graph editor is "a toggle of the same real estate,
not a separate panel", and that Spine shipped without curves until v4. So the timeline's
track area is laid out such that a value-graph mode can replace it in place later, and
Blender's **Normalize / Stacked view** is noted as required when it lands — our five
properties are depth 0..1, x/y in px and rotate in degrees, which are not co-plottable.
Not built; the space is reserved so it is a toggle and not a layout change.

---

## 8. Player: present, embed, fullscreen

### 8.1 The `fit` parameter (R20, R21)

Per R20, **scaling preserves the authored pixels, not the percept**.

| `?fit=` | behaviour |
|---|---|
| `contain` **(default)** | aspect preserved, scaled to fit entirely, letterboxed. Browser resampling, accepted per R20. |
| `snap` | largest whole-number scale that fits — today's present mode. Never resampled. |
| `render` | re-render at the container's exact size, scene geometry scaled. Pixel-exact; stroke widths scale with the frame. |

`cover` is **not** offered: it crops, and cropping horizontally eats the margins, which
are the fusion partners for the stage's edge columns. R14 was clarified to `contain` on
exactly this point.

`?smooth=auto|on|off`, default `auto` — smooth when downscaling (R20's accepted
"softening and blurring"), `pixelated` when upscaling, where integer factors stay exact.

Both are **query parameters, not fragment tokens**, for the same reason `present` is: the
fragment *is* the scene.

### 8.2 Present, embed, fullscreen

One player, three framings: `?present=1`, an `<iframe>` sized by its container (R14), and
fullscreen from the editor (R15).

**Playback transport is available in all three** (R16). Revision 1 promised this and then
mandated the chrome stay `pointer-events: none`, which makes a play button unclickable —
a rule correctly inherited from today's non-interactive `present-hint` and wrongly applied
to a control surface. Corrected:

- **Fullscreen targets a wrapper element, not the canvas.** Fullscreening the canvas would
  make sibling transport unrenderable and R15+R16 unimplementable together.
- The transport **container** is `pointer-events: none`; the controls inside it are
  `pointer-events: auto`. Clicks outside a control still reach the canvas, which matters
  because clicking the canvas is how the diagnostics band is placed today.
- Chrome auto-hides after a few seconds and returns on any key or pointer movement.

### 8.4 What P2 changed in this document (§6.6)

Recorded by the orchestrator at merge, because every plan-document commit in this build is
the orchestrator's and a commit here would have voided the gate evidence P2 had just
collected. Four of its eight deviations change claims made above.

1. **A scene-scale cap exists at all.** §8.1 described `render` as re-rendering at the
   container's size with no upper bound. One now exists, because a mode whose purpose is
   embedding in a page we do not control turns an unbounded container measurement into an
   unbounded allocation. **This is a judgement, not a measurement** — nobody measured where
   the cap should sit, and the constant records that about itself.
2. **`site/query.ts` is a new module** this document does not name. It exists because the
   "strip a leading `?`, take the literal last value, trim and lowercase" policy was
   written three times and a prototype-chain defect appeared in two of the copies *because
   the idiom was copied*. One exported helper, one shared boolean-spelling table.
3. **The player entry emits as `index.html` via a build-time rename.** Not a detail:
   without it the player is reachable only at `…/player/player.html`, and R14 asks for an
   `<iframe src>`, which is a directory URL. The rename is at the build rather than at the
   upload because a rename during copy is a second place the two can disagree. Note
   `site/index.html` is already the editor's entry, so renaming the *source* would collide
   with `markup.test.ts` and with P3's teardown.
4. **Two pixel-space ratios now exist where §8.1 implied one.** `Fit.scale` is device ÷
   backing-store and is what `image-rendering` must be fed; the CSS ÷ backing-store ratio
   is what layout consumes.

   *Corrected by P3's survey:* this paragraph named that second ratio `displayScale`, an
   identifier that **no longer exists anywhere** — it is `cssPerBackingScale`, and that has
   **zero production consumers**, because the smoothing fix moved the live path onto
   `Fit.scale`. So as originally written this section instructed P3 to preserve a
   distinction one half of which is dead code. The distinction is still real and still
   worth naming; the dead identifier is not worth preserving. Whoever next touches it
   should decide whether `cssPerBackingScale` earns its existence. They differ by `dpr`, and conflating them
   smoothed genuine upscales on every HiDPI screen — blending adjacent random dots, which
   §5.2a forbids. §10.6's rule about naming the pixel space was written for scene-vs-device
   and applies here with equal force.

Two things P2 left honest rather than closed, both surfaced by a worker rather than asked
for: the `plateWidth` two-space collision is documented at four declarations but all four
fields are plain numbers, so the wrong substitution still compiles; and the font check pins
the vendored *sources* while nothing pins that the player *build* emits one face per
weight.

### 8.3 One measurement to preserve

The current page records that adding a control *above* the canvas moved its fractional
device-pixel origin and took edge-row disagreement from 13 device px to 445 at dpr 1.5 —
and that "the sensitivity is to the exact sub-pixel and is not something to tune."
**Transport chrome goes below the canvas or is absolutely positioned out of flow**, and
per §5.1 this binds the editor as well as the player.

---

## 9. Exposing every control (R6)

### 9.1 What the type system can and cannot prove

Revision 1 claimed a single `AssertNever` guard would make a missing control a compile
error. **It cannot be written over `Scene`**, for three structural reasons:

1. `Layer` is `LayerBase & (A | B | C | D | E)`, and `keyof` over a union yields the
   *intersection* of keys. A naive path type gives `depth`, `at`, `anim`, `type` and
   silently omits `text`, `size`, `font`, `weight`, `src`, `mode`, `mask`, `shape`, `r`,
   `w`, `h` — every per-type control, which is most of what R3 complains about.
2. Distributing over the union recovers those but collapses provenance: `shape.start`/`end`
   are **degrees**, `Track.start`/`duration` are **seconds**.
3. `Preset` has an index signature, so `keyof Preset` is `string` and the exclusion can
   never reduce to `never`. Verb and bundle parameters — the surface R9 and R10 make
   central — are outside any type-level proof.

**What is writable, and is adopted:**

- `Record<Layer['type'], readonly LayerKeys[]>` with one `AssertNever` pair **per
  variant**. A new field on `LayerShape` is then a compile error, which is the real
  regression.
- The existing `STEREO_KEYS` guard, unchanged.
- The same treatment for `Scene`'s own keys.
- **Each `PresetFn` declares its own parameter descriptors**, so a verb's controls come
  from the verb. Not a proof, but the declaration sits next to the code it describes,
  which is the next best thing.

### 9.2 What a runtime test must cover

Type-level exhaustiveness proves a declaration *exists*, not that a user can *reach* it.
Once panel placement is a config and panels are a registry, the realistic regression is
"spec written, assigned to a panel no layout slots." One cheap test: for the default
layout, every `CONTROLS` entry resolves to exactly one mounted panel. Assert the count,
not the values — the project's own "assert on structure" rule.

### 9.3 The tension with R4, stated rather than hidden

R4 rejects "html dropdowns and input fields" as the instrument. R6 demands every control
be exposed. A generic widget renderer is how R6 is met, and it is the thing R4 condemned.
The honest division:

**Canvas for value · timeline for timing · depth strip for depth · generated widgets for
the residue.** Generated widgets are the *floor* that guarantees R6, not the intended
primary surface; any control that deserves a spatial instrument should get one and lose
its widget. The bezier preview in §4.4 is the cheapest instance of that principle.

---

## 10. The perception module (R22)

`src/shared/perception.ts`. Four obligations from R22, each structural:

1. **Model layer owns the computation.**
2. **The view owns the warning** — the model never refuses to render, clamps, or
   auto-corrects. Advisory only.
3. **Never an inlined constant.** No downstream code compares against a perceptual
   threshold; a revised trial changes one function body.
4. **Objective inputs only** — `sepFar`, `sepNear`, stroke px — never `isEasyToRead`.

Every function returns the measured quantities *and* a grade, so a caller that only wants
numbers never touches the judgement. This is also what makes effort #2 cheap: it edits
bodies in one file, and the CLI's preview report and the editor's panels both follow.

### 10.1 Encoding capacity — objective, no perception involved

`encodableDepths(stereo)` → `sepFar − sepNear + 1`; **19 at the default 110/92**, derived
from `sepAt`'s rounding. Invariant under `noiseScale`, which is applied after the encoder.

`quantisationStep(stereo)`, and `collidingPairs(scene)` — layer pairs closer than one
step, which encode identically.

**One caveat revision 1 missed:** under `linked`, columns within `sep/2` of each plate edge
carry no depth at all. Capacity is 19 in the stage, 0 in those strips, and the function
reports both.

### 10.2 Fusion comfort — on the budget, not on `sepNear`

`fusionComfort(stereo)` takes the **budget** (`sepFar − sepNear`), because that is the axis
the findings document's own table names: flat to ~22px, cliff past ~32px. `sepNear` 78 is
the equivalent *only at `sepFar` 110*.

Revision 1 wrote the rule on `sepNear` and would therefore stay silent at
`sepFar: 140, sepNear: 78` — a 62px budget, twice past the cliff — while firing at
`sepFar: 100, sepNear: 80`, a 20px budget inside the measured plateau. **That is the same
class of error the legibility rewrite exists to correct**, and it is exactly what R22 was
raised in response to.

Surfaced on the `sepFar`/`sepNear` controls, not on the depth strip (§5.3).

### 10.3 Stroke legibility — machinery now, numbers later

`strokeLegibility(ink, stereo)`. Today's rule moves in **unchanged**, and the verdict text
is weakened to lead with quantities.

The findings document's threshold revision does **not** ship here. Its own §5 closes:
"it is one observer, one stroke level across budgets, and the warm-up confound is
unaddressed — so the replacement number deserves its own round rather than being swapped
in now." Revision 1 quoted that document's §6 and omitted its §5 caveat. Calibration is
effort #2; this is the socket it plugs into.

Two notes carried forward for whoever does calibrate: `TIGHT_MULTIPLE = 2` is documented as
"chosen, not measured" and is budget-relative, so the three-grade scale needs rebuilding
alongside the threshold; and the **alphabet distance matrix** from the findings' §3 is a
computation rather than a trial, newly deterministic since the font was vendored, and is
the metric that would replace a hand-picked number.

### 10.4 Depth stops, and where they do not apply

`depthStops(stereo)` → named stops spaced across the encodable separations, recomputed
when `sepFar`/`sepNear` change. The case for them: 19 encodable levels, absolute judgment
of a 1-D stimulus at 4–8 categories, the lenticular trade recommending 6–9 segments.

**They apply to two of five layer cases**, and revision 1 wrote them as though every layer
were a flat plane:

- `text` and `shape` — snapping is coherent, and it is the default gesture with a modifier
  to suspend.
- **heightmap layers** — continuous per-pixel depth. Snapping is meaningless; the stop
  detents still render on the strip as reference.
- **animated depth** — interpolates continuously *between* stops by construction, so
  quantisation is gone for every intermediate frame. The stop applies to the endpoints.

And they interact with §5.4's tie badge: snapping N layers into 6–9 bins makes ties the
expected outcome rather than a risk. So the badge fires only on **overlapping** layers at
equal depth, which is the case where `max` actually merges two surfaces into one.

### 10.5 Cardboarding — and the cure revision 1 said did not exist

`cardboarding(scene)` → true when every layer is a flat plane. Computed, surfaced in the
diagnostics readout, **not** shipped as a UI warning in v1.

Revision 1 said the cure "needs a rasteriser change". Two mechanisms already ship:
**`mode: 'heightmap'`** gives per-pixel depth today, and **`depthBlur`** is documented with
a measured observation that blur ≥1 makes a slab read as "connected to and protruding from
the background" rather than a floating plane — the trade documented as reversing "as the
budget widens". The honest gap is narrower: **text and `shape` layers have no relief
mechanism.**

For those, the surveyed cure is **per-layer depth blend modes** — Add / Carve / Keep
overlap — which is a change to one compositing function in `raster.ts`. Named here, scoped
out (§2), and the strongest candidate for the first post-rewrite core change.

### 10.6 Units

`legibility.ts` carries a standing warning that the budget is **not** scaled by
`noiseScale`, "and silently right at the default of 1" — and the default is now **2**.
Revision 1 mentioned `noiseScale` nowhere while quoting separations in "px".

Rule: **every perception function takes and returns scene px**, and any view converting to
device px does so explicitly at the boundary. The depth strip labels its axis "scene px".
The embed-width readout in effort #2 will cross both `noiseScale` and §8.1's fit factor,
and must name both.

### 10.7 Visual diagnostics

The research's own point is that nobody solves an invisible scalar with a better number,
and revision 1 reported capacity as a number. So: an **occupied-levels histogram** beside
the depth strip, DepthView's design, where "evenly spaced teeth are the fastest visual
tell". It is the one readout that makes the 19-level quantisation visible.

---

## 11. Flexibility, concretely (R7, R8)

| What | Mechanism | Moving it costs |
|---|---|---|
| Panel placement | `LayoutConfig` naming slots → panel ids | a declaration |
| Which panels exist | `PANELS` registry | one registration |
| Scalar controls | `CONTROLS` specs (§9) | one declaration |
| Structural operations | `OPERATIONS` registry (§5.6) | one registration |
| Keybindings | a map | one entry |
| Depth shadings / ramps | `SHADINGS` registry | one registration |
| Fit modes | `FIT_MODES` registry | one registration |
| Verbs and bundles | `PRESETS` registry (exists) | one `PresetFn` + descriptors |
| Perceptual thresholds | `perception.ts` functions (§10) | one function body |

**Each registry gets one test** that registers a dummy entry and asserts it appears
without touching any other file. Without that, "moving a panel costs a declaration" is
unverified until the first time it is false.

**`CONTROLS` is complete; visibility is layered over it.** Revision 1 said simple mode
would use "a filtered `CONTROLS` set", which contradicts §9's completeness requirement.
The registry stays complete — that is R6 — and per-mode *visibility sets* select from it.

**The architecture's test:** simple mode later (R2) must be a different `LayoutConfig` plus
a visibility set, not a second app.

---

## 12. Testing

The existing 862 tests across 42 files stay green; §4 is the only part under pressure.

| Area | Test |
|---|---|
| Scene model | ids appear only on mutation, so `examples/*.yaml` round-trip byte-identically through load → save; load→save→load is idempotent; both `validateScene`s generate ids identically |
| Verbs | each verb compiles to the Track it claims; **`move` and `push` reproduce `slide` and `emerge` exactly** (a rename is not a rewrite); deleted presets leave the golden in a commit that says so |
| Composition | stacked actions sum and multiply per `composeAnim`; `bouncing-ball.yaml` is unchanged by the rewrite |
| `.stst` | round-trip; valid zip readable by `unzip`; **CLI and site produce identical bytes for one scene** |
| Control coverage | per-variant `AssertNever` pairs (compile-time) **plus** the reachability test in §9.2 |
| Registries | one registration test each (§11) |
| Player bundle | `dist.test.ts`: no editor code in the player entry; relative asset paths preserved |
| Fit modes | scale arithmetic for `contain`/`snap`/`render`, including the integer-snap rule |
| Perception | each function on constructed scenes; **`fusionComfort` fires on budget and not on `sepNear`** — the revision-1 bug, pinned |
| Depth stops | stops land on encodable separations; track `sepFar`/`sepNear` |

**Not tested:** Svelte component DOM. Logic lives in plain modules and is tested there.
`site/markup.test.ts` (530 lines against the current `index.html`) is rewritten against the
**player**, which is the part with invariants worth pinning. It will look like a large
deletion in review; it is intentional.

---

## 13. Sequencing

No time estimates; complexity as rough output-token scale. **Every phase names the
requirement it closes**; a phase closing none is suspect.

| Phase | Content | Closes | Scale |
|---|---|---|---|
| **P0** | Scene model: id/name, verbs + bundles, D1, easing. Core + CLI only. | R9, R10 | ~25k |
| **P1** | `src/shared/`: `.stst` read+write, layer-id generation; CLI support. | R17, R18 | ~15k |
| **P2** | **Player**: render, fit modes, present/embed/fullscreen, transport. Ships alone. | R14, R15, R16, R20, R21 | ~30k |
| **P3** | Editor shell: Svelte, `LayoutConfig`, `PANELS`, `CONTROLS`, `OPERATIONS`, guards + reachability test. | R3, R4, R6, R7 | ~45k |
| **P4** | Canvas manipulation, layer panel, depth strip, shadings. | R5 (layers), R11, R12 | ~50k |
| **P5** | Asset import: PNG → mask/heightmap, IndexedDB cache, link meter. | R5 (upload), R13 | ~30k |
| **P6** | Timeline: property rows, action bars, Design/Animate, filmstrip. | R5 (timeline), R9 | ~50k |
| **P7** | `perception.ts` + diagnostics panel + levels histogram. | R22 | ~20k |
| **Polish** | Eyedropper, motion paths, onion skin, `U` key, Option-drag timing. | — | ~20k |

Cut from revision 1: hash v2 + deflate (~20k), depth-window gizmo, the legibility
threshold rewrite (moves to effort #2), the cardboarding UI warning.

**Why P2 is early:** independently shippable, derisks the whole URL/fit/embed story before
any editor exists, and it is the half with users who are not Shaun.

**Polish closes no requirement and is marked so**, per the audit's own suggestion.

---

## 14. Risks and open decisions

**D1 — `flip` has no slot in `Transform`** (§4.3). **Resolved: three rotations**, landed in
`400ba98`. `flip` is sugar over `rotateY: π`. Two known defects shipped with it; see the
execution plan's P0.

**D2 — build vs vendor the timeline** (§7.5). **Resolved: build.**

**D5 — depth on luminance, not alpha** (§5.2a). **Resolved: luminance**, alpha stays the
mask. Reconsidered on request; kept, with the reasoning recorded rather than assumed.

**D6 — bundles are UI macros** (§4.2a). **Resolved.** Forced by `PresetFn` returning a
single `Track`; collapses §7.1's ladder to one rung.

**D4 — withdrawn.** It rested on reading `emerge`'s depth anchoring as a defect; it is
deliberate, and the proposed fix would have reintroduced a documented bug (§4.5).

**R1 risk.** The research effort depends on this one landing. P2's player and P7's
perception module are the parts it needs.

**The protocol gap.** `.stst` is claimed as a way to batch-render trial stimuli, but
nothing here supports what makes a trial *valid* — the findings document's §4 protocol of
a warm-up stimulus, each condition presented twice in randomised order, and disjoint
vocabulary. Building the instrument without the protocol is a real gap; it belongs to
effort #2 but should not be discovered then.

**Text and `shape` layers have no relief mechanism** (§10.5). Named, not fixed.

---

## 15. Requirements traceability

| Req | Summary | Satisfied by |
|---|---|---|
| R1 | UI first, then research | §13; §2 (thresholds excluded); §14 |
| R2 | Strong editor now, simple later | §2; §11 architecture test |
| R3 | Controls not all exposed | §9 |
| R4 | Form controls are the wrong instrument | §5, §7, and **§9.3 states the tension** |
| R5 | Layers · PNG upload · animate · timeline · marker lane | §5.4, §5.6 (create), §6.1, §7.3 (rows *are* the markers) |
| R6 | **Every** control exposed | §9.1 per-variant guards + §9.2 reachability |
| R7 | Flexibility; components; high config | §11, with a test per registry |
| R8 | Research is a starting point | §11; §5.2 records where R12 overrides the research |
| R9 | Verbs + parameters | §4.2, §7.3 (attach by right-click on a property row) |
| R10 | A couple of lite bundles as dogfood | §4.2 — `entrance` and `flyIn`, written out |
| R11 | Three views | §5.2 |
| R12 | Configurable near/far colours **and near ceiling** | §5.2 `ramp` + configurable domain |
| R13 | Whole scene in the URL | §3.4, §4.6, §6.1, §6.3 |
| R14 | URL flag, stereogram only, `contain` | §8.1, §8.2 |
| R15 | Fullscreen the inline preview | §8.2 — wrapper, not canvas |
| R16 | Play/pause while fullscreen | §8.2 — `pointer-events` corrected |
| R17 | `.stst` incl. GIF layers | §6.2 |
| R18 | `.stst` shared by CLI and UI | §3.1, §6.2 — read **and** write |
| R19 | Source images | §6.1 — kept, with reasons |
| R20 | Scaling preserves authored pixels | §8.1 |
| R21 | Fit URL-configurable | §8.1 — `?fit=`, `?smooth=` |
| R22 | Diagnostics as model-layer functions | §10 |

---

## 16. What revision 2 corrected

Recorded because the pattern is informative: revision 1 was well-read on the research and
under-read on this repository. Five of seven corrections were errors about the engine.

| # | Revision 1 said | The code says |
|---|---|---|
| 1 | Conflict rule is "later action wins" | `composeAnim` sums and multiplies; last-wins breaks `bouncing-ball.yaml` |
| 2 | Warn when paint order disagrees with depth order | `max` is commutative — layer order is inert, and drag-reorder is a no-op gesture |
| 3 | Cardboarding has no cure; needs a rasteriser change | `mode: 'heightmap'` and `depthBlur` both ship; the gap is text and `shape` only |
| 4 | Resting and animated pose are already separate | `emerge` compiles relative to `ctx.layerDepth`, so they are coupled |
| 5 | Depth strip is cheap — depth is a per-layer scalar | heightmaps carry a range; animated depth sweeps one |
| 6 | Fusion cliff at `sepNear` 78 | the findings' axis is the **budget**; 78 is its equivalent only at `sepFar` 110 |
| 7 | Three-rung ladder, "validated three times" | three *one*-hop ladders, two skipping the middle, one with none |

Plus: a single `AssertNever` cannot span `Scene` (§9.1); `noiseScale` went unmentioned in a
document full of pixel counts (§10.6); and R12's configurable near ceiling was refused as
impossible when the same section shipped two automatic versions of it (§5.2).
