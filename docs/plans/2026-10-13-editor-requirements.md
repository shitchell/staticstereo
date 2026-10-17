---
title: Editor rewrite — user requirements
description: Shaun's stated requirements for replacing the site with a strong layered graphical + animation editor, recorded verbatim with rationale, plus the two conflicts they contain
status: recorded; two requirements carry conflicts that need a decision
date: 2026-10-13
tags: [requirements, editor, ui, ux, staticstereo, rationale]
---

# Editor rewrite — user requirements

This document records what Shaun asked for, in his own words where rationale was given.
It is the compliance target: the design in
[`2026-10-13-editor-design.md`](2026-10-13-editor-design.md) is reviewed against *this*
file, not against the research.

Requirements are numbered. The numbering is stable and is referenced by the design and
by the review agents; do not renumber, append.

---

## 0. Scope and ordering

### R1 — Two bodies of work, UI first

Two efforts were identified:

1. "doing more passes together to investigate/research discernibility/legibility within
   the generated stereograms in different contexts (boths shapes and text)"
2. "completely rewriting the UI to better facilitate building and viewing stereograms"

The UI comes first. Rationale, verbatim:

> "i'm not sure if #2 would be greatly benefited by #1? it would be at least somewhat
> benefited, but i *think* it would mostly be benefited in the sense that we could impose
> more sensible defaults. so long as the UI is decently architected, i don't think the
> order should matter much, and improving the UI could potentially even make #1 easier
> since it could allow me to more rapidly tweak things for my own investigation/experiments
> compared to my slower and more tedious yaml editing. which... yeah, i think i just talked
> myself into it lol, i think #2 is first, then #1 both together and me solo :)"

Note for the research effort that follows: it covers **shapes as well as text**. The
shipped legibility work to date is text-only.

### R2 — This effort builds the *strong* editor

Two editors are imagined; only one is in scope now.

> "i wouldn't be *mad* at having 2 UIs -- a strong editor that gives solid control and a
> simple editor that lets you quickly throw simple text / shapes into a stereogram. for
> now, this effort should focus on the strong editor"

---

## 1. What is wrong with the current UI

### R3 — Controls are not all exposed, forcing raw YAML

> "not every control is exposed through the editor and requires direct YAML manipulation
> (which also means that i have to know the entire YAML schema)"

Two distinct costs: the control is missing, *and* reaching it demands schema knowledge.

### R4 — Form controls are the wrong instrument

> "even if all controls were exposed, the present system of various html dropdowns and
> input fields isn't well suited to layered graphical + animation editing lol"

---

## 2. What the editor must be

### R5 — GIMP × PowerPoint, with a video-editor timeline

> "something like a blend of gimp + powerpoint would be more ideal. we don't need all the
> tools gimp offers, but something which supports adding layers, adding a PNG uploaded file
> into a layer, adding animations to layers, maybe a timeline at the bottom like a video
> editor might offer with a line above it with markers to represent animations?"

Enumerated: add layers · **import an uploaded PNG into a layer** · animate layers ·
bottom timeline · a marker lane above the timeline representing animations.

### R6 — Every control is exposed in the editor

> "ensure the strong editor exposes every control"

The direct remedy for R3. Nothing may require hand-editing YAML.

### R7 — Flexibility is a hard requirement, because rework is expected

> "i'm unfortunately not *super* experienced with video / animation editing, so i can't
> offer the greatest insight into UX design or app comparisons that would work best for
> me. which unfortunately means some level of rework will be needed as we go, which means
> flexibility is a must to minimize that rework (components in the UI + js to make it
> easier to move pieces around, high config baked all throughout the UI, etc...)."

This is a constraint on *architecture*, not a feature. Named means: componentised UI,
pieces easy to move, high config throughout.

### R8 — Research informs, it does not specify

> "for you to research UX patterns, especially user reviews, critcisms, and praises to use
> as a starting point"
>
> "emphasizing: we still want to use highly flexible design/configs so that we can move
> things around and tweak -- the research simply provides the starting point"

R7 and R8 are the same requirement from two directions: no research finding may be baked
in so hard that changing it is a rewrite.

---

## 3. Animation model

### R9 — PowerPoint-shaped verbs with parameters, not narrow presets

> "i'd rather see powerpoint-esque 'animate this layer/object, move/flip/<action> using
> <parameters for action>'. 'marquee' is a very specific and limited type of 'move from
> here to there'. idk that it'd survive as a preset. not in the UI i'm considering. i want
> stronger control."

### R10 — A couple of lite presets, as dogfood

> "i'm not sure what exactly presets would look like other than combinations of actions +
> parameters, but yeah, i might disregard the 'marquee' idea as-is... maybe just add a
> couple of lite presets just to dogfood the idea, because i do like your hybrid idea.
> maybe 'fade-in and bounce' with specific parameters (ease-in fade-in 250ms, bounce with
> whatever params)"

The "hybrid idea" referenced is: presets remain editable *as presets*, with an explicit,
one-way "convert" escape hatch, rather than being baked to keyframes on first touch.

**Translation note.** There is no opacity in this model — `Transform` deliberately omits
it, because there is no meaningful transparency in depth space, and fading is expressed
as motion in `depth`. So "fade-in" compiles to a depth move, which is what the existing
`emerge` preset already does. The requirement stands; only the mechanism differs.

---

## 4. Views

### R11 — Three views

> "offer 3 views: depth-as-greyscale (solo), stereogram (solo), both side-by-side (as
> today)"

### R12 — Configurable near/far colours on the depth view

> "set up depth-as-greyscale so that it's easy to configure the 'near' and 'far' colors;
> we'd default to white = nearest (some near ceiling we pick (configurable)) and black =
> furthest away (i might just have it match `sepFar`? if i'm interpreting that variable
> correctly as representing the sort of 'furthest away back wall' of the depth map)"

*Gloss — this paragraph is the design's reading, not part of the requirement.* The
`sepFar` reading is correct: depth 0 *is* `sepFar` and depth 1 *is* `sepNear` by
definition, so those two **scene** endpoints cannot drift from each other.

An earlier version of this gloss went further and said the depth each colour maps to is
therefore not configurable. **That was wrong and it was the design's position leaking into
the compliance target.** The requirement asks for a configurable near ceiling — "some near
ceiling we pick (configurable)" — and that is a *display* clamp on the ramp's domain, not a
claim about the scene model. It is satisfiable, and the design satisfies it.

Recorded as a process note: glosses in this document are marked as such from here on.
A requirements document that has absorbed the design's answers cannot function as an
independent target.

---

## 5. Keep from the current site

### R13 — Whole scene in the URL

> "having the entire YAML encoded into the URL for a static-site friendly shareable link"

### R14 — A URL flag that shows only the stereogram, `contain`-style

> "a query/fragment/url thingy that causes the page to show *just* the stereogram in a
> sort of `background-size: cover` sort of way (maintain aspect ratio, fill to max size of
> the viewport without cutting/overflow, enables embedding a stereogram as an iframe in
> another page at arbitrary dimensions)"

**Clarified on asking:** `cover` was a slip — the described behaviour (no cutting, no
overflow) is `contain`.

> "oh! my bad, yeah, i don't want cover, i want contain :p"

The distinction is load-bearing here rather than cosmetic. `cover` crops the overflow, and
cropping horizontally eats the **margins** — which are the fusion partners for the stage's
own edge columns (design §10.4). A `cover` crop would destroy edge fusion by construction.

### R20 — Scaling preserves the authored pixels, not the percept

The resolution of C1 (§7), decided by Shaun:

> "i'd say any issues that arise from taking a stereogram intended to be shown at 1080x720
> resolution and then fitting it into a 200x100 box... are not our problem :p i would
> rather preserve the integrity of the original pixels produced at the intended resolution
> as much as possible (softening and blurring and pixels compressing into each other
> acknowledged and accepted) rather than try to preserve the effect."

This is a clear ordering of two goods, and it is the opposite of what was recommended.
**Fidelity to the authored artifact outranks fidelity to the fused percept.** The image is
what it is at the resolution it was made for; a container too small to carry it is the
embedder's problem.

### R21 — Fit behaviour is URL-configurable

> "that said, we have opted for config-heavy, so i'm fine with it being a url
> fragment/query parameter that dictates how it gets rendered in different dimensions."

---

## 5a. Perceptual diagnostics — architecture

### R22 — Diagnostics are model-layer functions over objective variables

Raised after the design's first draft stated the fusion cliff as a constant on the wrong
variable (`sepNear` 78 rather than the budget it is only equivalent to at `sepFar` 110).

> "1. write such diagnostic functions at the model layer, only ever use diagnostics around
> perceptibility / interprability for the purposes of warning at the View layer (thinking
> in MVC terms)
>
> 2. always write and *use* such things as functions so that we can easily tweak them
> without rewriting downstream code later. i.e.: if we try to incorporate `sepNear` into
> downstream code for a warning and then realize that perception is more complex than just
> `sepNear == 78`, then we have a lot of stuff to rewrite. especially since
> interpretability is something that will require ongoing trials with hard-to-predict
> results (i.e.: we will likely have to continuously tweak any functions that aim to
> guess/estimate interpretability of generated diagrams), we need all such things to be
> functions that leverage quantifiable, non-subjective, objective facts-as-variables (e.g.:
> variables like `sepNear`, not `isEasyToRead: float`)."

Four separable obligations, all testable:

1. **Model layer owns the computation.** Perceptual predicates live in the model, not in
   any view.
2. **View layer owns the warning.** The model never acts on a perceptual judgement — it
   does not refuse to render, clamp, or auto-correct. Advisory only. (This also matches
   the project's existing stance that the measurement is the honest advisor.)
3. **Always a function, never an inlined constant.** No downstream code may compare
   against a perceptual threshold directly. A revised trial must change one function body.
4. **Inputs are objective, quantifiable scene facts** — `sepFar`, `sepNear`, stroke px,
   budget px — never a subjective score like `isEasyToRead: float`.

Rationale is explicitly forward-looking: these estimators are expected to be revised
repeatedly by ongoing trials with hard-to-predict results, so the cost of revision is the
thing being designed against.

### R15 — Fullscreen the inline preview while editing

> "in normal editing mode, the option to fullscreen the inline stereogram preview"

### R16 — Play/pause while fullscreen

> "should be able to play/pause the stereogram video while in full screen"

---

## 6. Project format

### R17 — `.stst` export/import of the full editable project

> "i really like the exportable custom .stst file that someone else can import :D that
> would also save the multi-frame / gif layer if i want to share the full editable project
> with someone else -- not just the exported .gif"

## ⛔ R17 IS REOPENED, 2026-10-17. IT WAS REPORTED CLOSED AND IT IS NOT MET.

**Measured, with a positive control established first** (depth map dumped on machine A and
md5-compared against the same scene with `layers: []`, so *exit 0* was not the evidence).
**A `.stst` carrying an image or gif layer does not render on a second machine at all** —
not *"cannot continue editing"*, **cannot open**:

| `src` spelling | machine B, holding only the `.stst` |
|---|---|
| absolute path, `image` | **throws** `Invalid URL`, exit 1, no output |
| absolute path, `gif` | **throws** `ENOENT` |
| relative path, both | **throws** — resolved against **process cwd**, never the `.stst` |
| `data:` URI, both | **renders**, byte-identical to A |
| `file:` URI | accepted for `gif`, **rejected for `image`** — the two types differ |

**The one spelling that works is one the product cannot emit.** No shipped code path
produces a `data:` src, and **the exporter prints `scene + 0 members`** for a scene with an
image layer. **`data:` is not the cure either** — §6.1 makes `.stst` *the path for assets
too big for a URL*, so baking to `data:` reinstates the problem the container exists to
solve. **For every project the tooling can currently create, the answer is no.** It fails
**loudly**, which is the only mercy.

**Three independent missing links; repairing any one alone changes nothing.** (1) `src` is
carried verbatim and **never rebased** — a relative `src` read with cwd forced to `/`
returns the literal `"ball.png"`. (2) **No code path connects a container member to a
renderer** — a recording canvas saw exactly one load request, the raw `src`, with the
correct bytes sitting unused in `sources/` **and** `masks/` in the same archive. (3)
Nothing writes the member in the first place.

**A fourth defect, found on the way and owned by nobody:** two layers whose sources share a
basename are **unrepresentable** — `writeStst` throws `duplicate zip entry name`, the only
escape is refused, and `layerName()` returns the same string for both, so they are
**indistinguishable in the UI as well.**

**WHY NOTHING CAUGHT A MERGED, REQUIREMENT-CLOSING DEFECT — the reusable part.**
**No test anywhere renders a scene that was read from a `.stst`.** The existing sensor is
**round-trip fidelity**, which is *a different property from resolvability*, and the one
test that appears to exercise the layer→member link does so **only because its fixture's
`src` is coincidentally a bare filename.** A sensor for the wrong property is not a weak
sensor; it is **no sensor**, and it reads as coverage.

**Accountability, stated plainly:** tier 0 merged this at `da0e4a9` and reported R17 closed
to Shaun. The gate was green, CI was green at the byte-equal sha, and **none of that was
evidence for this clause.** Fix shape is innards and tier 0's; **the status went to Shaun
immediately rather than at repair.** Repair is a separate phase — a container-format
change plus an exporter change plus a resolver change — and is **not** folded into the
phase that found it.

**Sharpened 2026-10-17, verbatim, while ruling case E:**

> "i think as long as its one file we're good. i'm not too plussed about the innards of the
> content so long as it contains everything one would need to copy a project to another
> machine and continue editing it"

**Two binding constraints, not preferences.** (1) **One file** — settled; `.stst` is a zip
and both compression choices are a single file, so nothing here constrains case E. (2)
**Another machine, continue editing** — this is stronger than *import* and stronger than
*render*, and it is the acceptance test. Design §6.1 re-derives masks from the source image
on resize or threshold change, so a container that omits sources passes *render* and fails
*continue editing*. **It must be verified with an empty IndexedDB**, because re-importing on
the exporting machine succeeds from a warm cache regardless of what the file contains.
**This settles R19 in one direction** for the container: sources ship in the `.stst`
whatever the local cache policy is. See design §6.2a.

**Rationale, Shaun's, for the delegation itself:** *"i leave it with you :p … i'm not too
plussed about the innards"* — the container's internals are explicitly not his axis; the
**single-file property and the portability outcome** are.

### R18 — `.stst` logic shared by CLI and UI

> "we can bake some of the .stst logic into a shared area for both the cli / ui to use?"

### R19 — Source images: no stated preference

> "i'm not particularly pressed about keeping the source image if we never use it? but i
> suppose if IndexedDB generally allows for high capacity, there's not necessarily a huge
> reason to trim the source to the mask before storing? i could go either way if you think
> there's a good reason to keep the full source image in IndexedDB."

Explicitly deferred to recommendation. Not a constraint; recorded so the design's choice
is traceable to a real question rather than invented.

---

## 7. Conflicts inside the requirements

Two requirements cannot be satisfied literally as stated. Both are flagged here so the
design's resolution is reviewable rather than silent.

### C1 — R14 (fill-the-container embed) vs. the no-downscale rule — **RESOLVED**

Present mode today picks the largest **whole-number** scale that fits and letterboxes the
remainder. That is deliberate and measured: below 1:1 whole columns are dropped and the
image stops fusing. An iframe at arbitrary dimensions will often be smaller than the
plate, so "fills any container" and "always fusable" cannot both hold for a *fixed* image.

The pressure is worse than it sounds, because **stereogram plates are intrinsically large
in physical pixels**: separation is a property of the viewer's eyes, not of the picture, so
a modest 800×450 scene emits a 965-wide plate which at `noiseScale: 2` is 1930×900 actual
pixels. A 600×400 iframe is a 0.31× downscale.

Three options were put to Shaun:

| | behaviour | cost |
|---|---|---|
| scale the bitmap | exactly like a GIF; browser resamples | non-integer downscale destroys correspondence — averaging blends adjacent *random* dots; nearest-neighbour drops a column independently of its partner |
| re-render at container size, geometry scaled | pixel-exact at any size, looks like `object-fit: contain` | stroke widths scale, so small embeds can cross the legibility threshold |
| re-render at container size, geometry fixed | stroke widths preserved | reframes rather than resizes |

**Resolved in favour of scaling the bitmap** — see R20. Recommendation had been the
second option; Shaun chose the first with explicit rationale, and the others remain
available under R21's parameter.

### C2 — Free depth floats vs. what the encoder can carry

`sepAt` rounds to whole pixels: `sep = round(sepFar − z·(sepFar − sepNear))`. At the
default 110/92 that is `sep ∈ {92…110}` — **19 distinct encodable depths**, and every
value between them is discarded. Independently, the perceptual literature puts absolute
judgment of a one-dimensional stimulus at 4–8 categories, and the lenticular-print trade
recommends 6–9 depth segments per image. A free 0..1 float field is therefore a false
affordance in both directions.

This is not a stated requirement in conflict; it is a conflict between R6 ("expose every
control") and honesty about what the control does. The design's resolution is in the
design document.

---

## 8. Non-requirements

Recorded so they are not reintroduced by accident:

- **A simple/quick editor** — wanted eventually (R2), explicitly out of scope now.
- **Presets as a large shipped library** — explicitly rejected in favour of verbs (R9),
  with only a couple of bundles as dogfood (R10).
- **`type: 'draw'` layers in the browser** — unsupported today and not requested.
