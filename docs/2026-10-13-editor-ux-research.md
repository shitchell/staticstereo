---
title: UX research for a layered depth + animation editor
description: What layer/timeline editors, approachable animation tools, and depth-authoring workflows got right and wrong — surveyed to inform the staticstereo editor rewrite, with the convergent findings called out
status: research complete; feeds the editor design
date: 2026-10-13
tags: [ux, research, editor, timeline, animation, depth, autostereogram, prior-art]
---

# UX research for a layered depth + animation editor

Three parallel surveys, run 2026-10-13, scoped to the problem of building a browser
editor where **layers carry a scalar depth, the manipulation canvas is a depth map, and
the rendered output is unreadable noise while you work**.

- **Thread 1** — professional layer+timeline tools: After Effects, Blender, Rive, Spine,
  Cavalry, Fusion, Adobe Animate, Jitter, Theatre.js.
- **Thread 2** — approachable animation UIs: PowerPoint, Keynote, Figma, Framer, Canva,
  Jitter, Principle, Tumult Hype, Lottie Creator, Google Web Designer, Apple Motion.
- **Thread 3** — browser canvas editors, depth-axis authoring, and available components:
  Photopea, Figma, tldraw, Excalidraw, Penpot, miniPaint; Blender/Nuke/Unreal depth
  passes; LeiaPix/Immersity, Photoshop Depth Blur; timeline libraries.

Per the requirements document, this is a **starting point, not a specification** (R8).
Everything here is a prior, to be overridden freely once the editor exists and real use
contradicts it.

---

## 1. The convergent findings

Five results appeared independently in more than one thread. These are the ones to weight
heavily; everything in §2–§6 is weaker evidence.

### 1.1 An invisible scalar is solved by adding a second *spatial* view, never by a better number

This is the single most useful result in the survey, and it was unanimous.

- After Effects gives Top/Front/Left **orthographic cameras** so you can judge Z from an
  auxiliary projection, because "when working in 3D space you can't tell where an asset is
  located in Z space … a layer might even disappear entirely behind another one"
  ([Frame.io](https://blog.frame.io/2017/11/15/working-in-after-effects-3d/)).
- Blender makes the **F-curve itself the canvas** for channels with no viewport presence.
- Blender's Mist pass draws its Start/Depth/Falloff window **in the viewport as an orange
  line with endpoints extending from the camera** — the depth range is a visible gizmo in
  space, not a number in a panel.
- Spine gives non-spatial timelines (draw order, events) **their own rows** at the bottom
  of the dope sheet, filterable
  ([Spine docs](http://en.esotericsoftware.com/spine-dopesheet)).

Nobody solves it with a better slider, a tooltip, or a more precise readout.

### 1.2 Separate "resting design" from "state at the playhead", with an explicit mode

- **Rive** toggles Design Mode / Animate Mode with `Tab`; in Design Mode edits change the
  object's default, in Animate Mode they key onto the timeline. Documented rationale: it
  "prevents accidental keyframe pollution"
  ([Rive docs](https://rive.app/docs/editor/fundamentals/design-vs-animate-mode)).
- **Jitter** ships the same explicit toggle
  ([Jitter](https://help.jitter.video/en/articles/16414495-design-and-animate-modes)).
- **Tumult Hype** conflates them and has a decade-old grievance thread: "there's no
  keyframes before that, so it shouldn't have any other value than the first keyframe" —
  answered by another user with "this has been one of my biggest issues since day 1 of
  using hype… it's how hype was built"
  ([Tumult forum](https://forums.tumult.com/t/frames-pre-keyframe-should-not-be-something-else/4310)).

Two tools converged on the solution, a third is a cautionary tale for the alternative.

### 1.3 Presets must be sugar over primitives, with a per-item expand

- **Jitter** builds animation from named actions (Move, Scale, Rotate, Opacity, Blur,
  Mask) and ships presets that right-click → **"Convert to actions"** into exactly those
  primitives ([Jitter](https://help.jitter.video/en/articles/14136797-create-custom-animations)).
- **Cavalry** attaches parameterised **Behaviours** (Noise, Bounce, Delay, Modulate — 40+)
  to any attribute by right-click; the praised part is that "instead of writing a
  `wiggle()` expression, you right-click any attribute and attach a Noise Behaviour"
  ([School of Motion](https://schoolofmotion.com/blog/cavalry-houdini-of-2d-after-effects)).
- **Figma Motion** (Config 2026) ships a preset library *plus* right-click → convert to
  keyframes ([Figma](https://www.figma.com/blog/introducing-figma-motion/)).
- **Lottie Creator** goes further: applying a preset simply bakes real keyframes, so there
  is no conversion event at all.
- The counter-example: **Canva**'s presets are opaque, and its only escape is a different
  *modality* — record a mouse drag as a motion path — which authors call "a bit 'jerky'
  depending on how adept you are with a mouse"
  ([Socially Sorted](https://www.sociallysorted.com.au/canva-animation-tools/)).
- **Apple Motion**'s Convert to Keyframes is one-way and **all-behaviours-at-once**,
  greyed out for unsupported behaviours
  ([Apple](https://support.apple.com/guide/motion/convert-behaviors-to-keyframes-motn13743c3a/mac)).
  The all-or-nothing rule exists only because several behaviours may write the same
  property — a constraint that is avoidable if you own the whole property set.

### 1.4 Keyframe hit targets and drag feedback are load-bearing, not polish

Fusion's keyframe editor is comprehensively disliked and the complaints are purely
mechanical: keyframes are "small lines… difficult to select and drag, they ghost and
appear in the place where they originally were before dragging", with no axis-locking,
and "they look nothing like the keyframes on any other page"
([Blackmagic forum](https://forum.blackmagicdesign.com/viewtopic.php?f=33&t=222352)).

Independently, **WCAG 2.2 SC 2.5.8** requires 24×24 CSS px targets; keyframe diamonds are
conventionally drawn at 8–10 px. Draw small, hit-test large.

### 1.5 Timing is the hard part, not values

Terra & Metoyer found setting keyframe *values* is easy while specifying keyframe
*timing* is the slow, difficult part. Swifter (CHI 2013) showed a grid of cached
thumbnails beat conventional scrubbing at scene location by up to **48%**. TimeTunnel
(CHI 2024, Autodesk Research) is premised on animation software separating spatial and
temporal control and forcing view-switching to locate poses.

Budget implication: spend on scrubbing, snapping and motion-path-on-canvas; do not spend
on a curve editor.

---

## 2. Thread 1 — layer and timeline interaction

### After Effects

Layer stack = timeline rows; each layer twirls into a property tree. A property becomes
animatable only when you click its **stopwatch**.

**Praised.** The `U` key ("Used") collapses the timeline to *only* keyframed properties;
`UU` shows everything changed from default
([ProVideo Coalition](https://www.provideocoalition.com/after-effects-master-the-starplume/),
[Creation Effects](https://www.creationeffects.com/post/essential-after-effects-keyboard-shortcuts)).
Single-letter property reveals (P/S/R/T/A). The graph editor is a **toggle of the same
real estate**, not a separate panel.

**Criticised.** The stopwatch is a known beginner trap — clicking it a second time
silently deletes every key on that property, and Auto-Keyframe sits next to it as a
near-identical icon
([Creative COW](https://creativecow.net/forums/thread/after-effects-constantly-adding-unwanted-keyframes/)).
The Speed-vs-Value graph split is "the source of most confusion for new users because
After Effects defaults to one and you usually want the other", symptom being "dragging
handles but seeing no change in motion"
([olafmotion](https://olafmotion.com/motion-knowledge/speed-graph-vs-value-graph-after-effects/)).
A heavily-upvoted Adobe idea calls the graph editor "still outdated, clunky, and untouched
for over a decade… No real-time preview, no modular behavior, no intelligent UI" and the
layer model "manual keyframes and precomp hell"
([Adobe community](https://community.adobe.com/t5/idea-after-effects/after-effects-a-legacy-tool-in-a-modern-world/idi-p/15373747)).
Timeline **folders/grouping** remain absent after years of requests; precomping is the
only grouping mechanism and it hides content and changes navigation context.

Two chronic Z-specific complaints, both of which our model reproduces by construction:
**layer stacking order stops meaning anything** once Z is live, repeatedly filed as a bug;
and **ties in depth are ambiguous**, with the standard forum advice being "push some of
them by 1, or even .1."

### Blender

Three editors (dope sheet, graph editor, NLA) over one F-Curve datamodel. Channels can be
filtered, soloed and **pinned**. Keys are manipulated with the same `G`/`S`/`R` verbs as
objects.

**Normalize** and **Stacked View** are the relevant features for mixed units: normalize
rescales every curve to −1..1 so curves with different ranges are co-editable; stacked
view gives each curve its own value axis
([Blender manual](https://docs.blender.org/manual/en/latest/editors/graph_editor/introduction.html)).
Directly relevant — our five properties are depth 0..1, x/y in px, and rotate in degrees.

**Criticised.** NLA is routinely called "so weird" and "completely unusable"
([Blender Artists](https://blenderartists.org/t/nla-editor-useful-or-just-skip-it/540951));
channel pinning is partially broken
([#141092](https://projects.blender.org/blender/blender/issues/141092)); Blender is
mid-rewrite (Project Baklava) precisely because action+NLA proved too rigid
([code.blender.org](https://code.blender.org/2024/02/animation-2025-progress-planning/)).

### Rive, Spine, Cavalry, Fusion, Animate

- **Rive** — browser-native, the Design/Animate toggle (§1.2), `,`/`.` nudge the playhead
  one frame with `Shift` ×10, Option-drag a key *selection* scales timing proportionally
  ([Rive Masterclass](https://www.rivemasterclass.com/blog/rive-keyboard-shortcuts)).
  State machines "can feel confusing at first… less obvious than just pressing play"
  ([review](https://vijaytalksai.com/rive-review/)).
- **Spine** — dope sheet is timing-only with a separate Graph tab; shipped **without any
  curve editor until v4**, which is evidence that dope sheet + preset easings is viable
  far longer than it feels.
- **Cavalry** — Behaviours (§1.3), the closest existing thing to the requested model.
- **Fusion** — the hit-target cautionary tale (§1.4).
- **Adobe Animate** — frame-cell timeline rather than property rows; widely called "a
  re-skinning of Flash" and sluggish
  ([Software Advice](https://www.softwareadvice.com/graphic-design/adobe-animate-profile/reviews/)).
  Its one strength: frame-based tweening has a very short learning curve.
- **Theatre.js** — splits `@theatre/core` (runtime) from `@theatre/studio` (editor UI) so
  the editor never ships to production. Architectural precedent for a static site that
  needs both a player and an editor. (Licensing: core Apache, **studio AGPL**; repo
  dormant since Aug 2024. Precedent only, not a dependency.)

---

## 3. Thread 2 — approachable animation vocabularies

### PowerPoint, in detail

The atomic unit is an **effect** applied to one object, from four semantic buckets:
Entrance, Emphasis, Exit, Motion Path
([Microsoft](https://support.microsoft.com/en-us/office/animate-text-or-objects-305a1c94-83b1-4778-8df5-fcf7a9b7b7c6)).
Parameters come in two tiers — a ribbon flyout and a modal dialog with Effect / Timing /
Text tabs — and named magnitudes carry **numeric escapes inside the preset**: Grow/Shrink
offers Tiny 25% / Smaller 50% / Larger 150% / Huge 400% *plus* a Custom % field; Spin
offers quarter/half/full turn plus custom degrees
([ppt-design](https://ppt-design.com/blog/emphasis-animation-in-powerpoint-a-complete-guide)).

Sequencing is a flat ordered list tagged On Click / With Previous / After Previous, over
an optional **Advanced Timeline** of draggable Gantt bars whose zoom control is hidden
behind the word "SECONDS"
([Indezine](https://www.indezine.com/products/powerpoint/learn/animationsandtransitions/2013/advanced-timeline.html)).

**Is the model loved?** Loved at the floor, hated at scale, abandoned by experts. Duarte's
animation specialist reports people "feel limited to using the PowerPoint animation
presets (Fade In, Fly Out, Wipe…)" and that the fix is dropping the named presets for
**motion paths + Spin**, hand-positioned
([Duarte](https://www.duarte.com/blog/designer-qa-pushing-the-limits-of-powerpoint-animation/)).
**The one general, fully-parameterised primitive eats the preset library** — which is
precisely the requested design.

Three documented breakdown points:

1. **Object legibility.** The pane lists *effects*, not layers, and default shape names
   are useless: "it's hard to tell which object is which." The documented fix is to go
   rename everything in the Selection Pane first
   ([Indezine](https://www.indezine.com/products/powerpoint/learn/animationsandtransitions/apply-two-or-more-animations.html)).
2. **Ordering at length.** Drag-reorder "may take a lot of time" past a few dozen rows.
3. **Invisible simultaneity.** A flat list cannot show overlap — and the Advanced Timeline
   **does not exist on macOS**, where "all animation delays and durations have to be
   entered numerically, and there is no way to visualise your timeline without watching it
   play out", which CreativePro calls "the most agonizing missing feature on the Mac"
   ([CreativePro](https://creativepro.com/powerpoint-mac-vs-pc-a-top-15-list/)).

The pane is also a performance cliff: a user with 15–20 fade entrances across 20 slides
reports editing "becomes practically impossible: everything is so slow" on a 64 GB machine
([MS Q&A](https://learn.microsoft.com/en-us/answers/questions/5332591/powerpoint-365-unusable-with-animations-pane-or-ta)).

### The rest

- **Keynote** — Build In / Build Out / **Action Build**, ordered in a Build Order window
  with no timeline at all. A Move action supports multiple path segments with draggable
  curve handles ([Apple](https://support.apple.com/guide/keynote/tan3ad5f8d82/mac)).
- **Figma** — Smart Animate diffs two frames, matching layers by exact name and nesting
  path; no match ⇒ **silent** fallback to dissolve
  ([Figma](https://help.figma.com/hc/en-us/articles/360039818874-Smart-animate-layers-between-frames)).
  Top complaint: a single global duration with no per-layer timing.
- **Framer** — four trigger-scoped categories (Appear, Hover, Press, Scroll), each a
  property delta plus a transition block; no timeline, sequencing is delay arithmetic
  ([Framer Academy](https://www.framer.com/academy/lessons/framer-animations-appear-effect)).
- **Google Web Designer** — the canonical two-UI experiment, and the most important
  negative result for R2. Quick mode (scene thumbnails) vs Advanced mode (per-element
  keyframes); round-tripping is lossy and the docs say so — "spans and easings may be
  **locked against editing** in Quick mode", and per-element easing surfaces as the literal
  label **"Mixed"** ([GWD](https://support.google.com/webdesigner/answer/7664386)).
  SitePoint's verdict: "too difficult for novices and too clunky for professionals."
- **Articulate Storyline** — entrance/exit animations are timeline-controlled but **motion
  paths are not**, so half the model is invisible in the view that claims to show time.

### Named-matching fails silently, everywhere

Morph (`!!name`), Magic Move, Smart Animate and Principle all match objects by name, all
fail silently, and all generate the same complaint genre: `Icon` ≠ `icon` produces no
animation and no warning. Data Animator (CHI 2021) is the corrective — auto-match, then
expose the match as an **editable list the user can inspect and override**
([UMD HDI](https://hdi.cs.umd.edu/featured/data-animator/)). That paper also found
designers "prefer keyframe animation" overall but concluded a tool "should combine these
three paradigms" (keyframe / procedural / presets), since preference is task-dependent.

### Two keyframes per property is often enough

Principle shipped a well-liked tool where every animated property has exactly a start and
an end key; complexity came from composition rather than key density. Escalating beyond it
required a wholly separate **Drivers** model — a reconciliation failure worth avoiding.

---

## 4. Thread 3A — authoring a depth axis you cannot see

**The highest-value thread, and the least obvious.**

### The perceptual ceiling is real and quantified

- Miller's span of absolute judgment for a one-dimensional stimulus is ~2–3 bits, i.e.
  **4–8 categories**
  ([Miller 1956](https://labs.la.utexas.edu/gilden/files/2016/04/MagicNumberSeven-Miller1956.pdf)).
- Even on calibrated medical displays with variable adaptation, the maximum number of
  greys a human can perceive is **~720**, far below the 1024–4096 the hardware emits —
  which is exactly why radiology uses **window/level** controls to map a slice of the data
  range onto the visible range
  ([PMC3043920](https://pmc.ncbi.nlm.nih.gov/articles/PMC3043920/)).
- The lenticular-print trade's own manual depth-map tutorial recommends **6–9 distinct
  depth segments** per image, offers no numeric readout, and the guidance is literally
  "try to imagine the volume of the image", with verification by generating a wiggle GIF
  afterwards ([Triaxes](https://triaxes.com/articles/manual-depth-map-creation/)).

Miller's number, rediscovered empirically by an industry. Users will detect the *edge*
between two patches but cannot name either value.

### Raw depth is unviewable by default, everywhere

Blender's Z pass is in metres, so anything past 1 m clips to white and you must insert a
Normalize node; Nuke compositors do the same with Grade/CurveTool
([taukeke](https://taukeke.com/2018/01/normalize-depth-pass/)). Unreal's buffer
visualisation **`frac`s** scene depth — it ships contour banding as the readout. Unity's
Frame Debugger exposes a range slider over the depth preview.

### Cardboarding is our architecture's signature artifact

YUVsoft defines it as what happens "when the depth map has insufficient grading and the
stereo looks unnaturally flat … a combination of flat images just set at different depths"
([YUVsoft](https://www.yuvsoft.com/products/2d-to-3d-conversion/)). A
layer-with-a-scalar-depth model *guarantees* it. The cure is per-layer depth gradients or
micro-relief, which the current rasteriser cannot express for silhouette layers.

### False colour: Turbo, not Viridis, for this job

Google's **Turbo** colormap was designed specifically "for visualizing depth and disparity
maps", fixing Jet's cyan/yellow banding (which fabricates edges in smoothly varying data)
and its colourblind ambiguity. Google's own comparison notes background detail "barely
distinguishable with Inferno" is "clear with Turbo" — Turbo's lightness slope is roughly
double Viridis's, trading perceptual uniformity for **discriminability**
([Google Research](https://research.google/blog/turbo-an-improved-rainbow-colormap-for-visualization/)).
That is the right trade for authoring; greyscale remains export truth.

### Shaded relief is stronger than any ramp

Hillshade at the conventional **azimuth 315° / altitude 45°** recruits the visual system's
light-from-above prior and is "the most widely used technique for making elevation data
visually intuitive"
([Esri](https://pro.arcgis.com/en/pro-app/latest/tool-reference/3d-analyst/how-hillshade-works.htm)).
Caveat: an azimuth below the horizon triggers the inverse-relief illusion.

### Depth-window / slice isolation is an established idiom

Nuke's **ZSlice** takes a slice *centre* and *width*
([Foundry](https://learn.foundry.com/nuke/content/reference_guide/filter_nodes/zslice.html));
the Nukepedia **DepthSlice** gizmo adds *feather* and Near/Far modes
([Nukepedia](https://www.nukepedia.com/tools/gizmos/filter/depthslice/)). Blender's Mist
pass is the authored equivalent — Start / Depth / Falloff, drawn in the viewport as a
gizmo, with a one-key shading mode to preview it live.

### Editing affordances worth stealing

Immersity (ex-LeiaPix): a brush with size/hardness/opacity, an **eyedropper that samples
depth from one area to apply elsewhere**, a clone tool to extend depth consistently, a
numeric depth slider, and an overlay blending the original image with the depth map
([FAQ](https://immersity.ai/faqs)). Photoshop's Depth Blur does the minimum version — an
"output depth map only" checkbox producing an editable greyscale layer.

[DepthView](https://github.com/LeeGillie/DepthView) shows what real depth diagnostics look
like: unique-level count, step size (GCD of gaps), a histogram with an "occupied levels"
strip where "evenly spaced teeth are the fastest visual tell", and a 3D relief preview
quantised to the actual output pass count.

Finally, the stereographer's **depth budget / depth script** — a planned, graphed
allocation of depth across a piece, with native pixel-parallax limits (~14 px at 2K, up to
28 px behind screen)
([RealVision](https://realvision.ae/blog/2011/10/3d-depth-continuity-and-the-stereographer/)).
Directly analogous to our own budget.

### Direct prior art in our exact niche

[DavidFreeborn/autostereogram-creator](https://github.com/DavidFreeborn/autostereogram-creator)
has solved much of this already and its choices are a baseline worth treating seriously:

- **Three views** where **Design shows shaded relief** for authoring, Stereogram shows the
  encoded image, Depth map shows greyscale.
- **Hold to reveal** (hold `R`) — a momentary ground-truth overlay.
- **Depth blend modes per layer**: Add (keeps the nearer surface), Carve (subtracts), Keep
  overlap (intersects). Our rasteriser is max-composite only, i.e. Add only.
- **Check detail** — a depth *linter* that "reports encoded depth levels, depth changes
  lost to pixel rounding and variation below the output pixel scale."

---

## 5. Thread 3B — browser canvas editor mechanics

**Layer panel.** The Photoshop row contract is near-universal across Photopea, Polotno,
miniPaint, Penpot and Figma: eye, lock, thumbnail, name, drag-reorder, group disclosure.
Photopea reproduces it exactly — click name *or* thumbnail to select, Ctrl+click to
toggle, double-click to rename inline, blend/opacity at panel top rather than per row
([docs](https://www.photopea.com/learn/layers)). Figma hides eye/lock until hover, allows
click-and-drag down the lock column to lock a run, and — cheap and high value —
**Tab/Shift-Tab moves inline rename to the next layer**. Neither ships a layer filter box.

Excalidraw's absence of layers is a deliberate stance, not an oversight: issue
[#2170](https://github.com/excalidraw/excalidraw/issues/2170) was closed out-of-scope ("*it
doesn't fit into the UI simplicity principle*"). tldraw likewise has no layer list. Neither
precedent transfers — depth semantics are per-layer and inherently list-shaped.

**Closest structural analogue:** **miniPaint** (vanilla JS, one developer) — a layer is a
flat object `{id, parent_id, name, type, x, y, w, h, visible, opacity, order, composition,
rotate, filters, render_function}`, each with `render_object(ctx, object)`, and a global
`render()` coalesced onto the next animation frame
([wiki](https://github.com/viliusle/miniPaint/wiki/Class:-Base_layers_class)).

**Selection and transform.** 8-handle bbox; rotation by hovering just outside a corner;
Shift = constrain, Alt = from-centre. Occlusion handling converges on a modifier: Figma
⌘/Ctrl+click = deep select, containers select only when *fully enclosed*; Excalidraw Ctrl
= deep-select and suppress dragging, **Alt+click cycles downward through overlapping
elements**, wrapping at the bottom.

**Snapping.** tldraw inverts the default — snapping **off**, hold Ctrl to snap; enabling
snap mode flips the modifier. Grid snap applies to position only, never rotation or scale
([tldraw](https://tldraw.dev/sdk-features/snapping)). Figma and Excalidraw default on with
Ctrl to suspend. The *suppression modifier* is the one universal.

**Docking.** Nobody in this class ships free-floating docks. Figma and Penpot use two
fixed, width-draggable sidebars. Photopea — also one developer — gets most of the feel from
two vertical columns that fold/unfold via a grab bar; full `Window → Arrange` remains an
[open request](https://github.com/photopea/photopea/issues/5755).

**Undo.** tldraw's model ports cleanly to plain TS: two stacks of **diffs + marks**;
changes accumulate until `editor.markHistoryStoppingPoint('rotate shapes')` flushes them as
one entry; `squashToMark` collapses intermediates after an interaction; `bailToMark` reverts
without polluting redo; ephemeral state tagged `history: 'ignore'`
([docs](https://tldraw.dev/sdk-features/history)).

**Performance.** Excalidraw runs **two canvases** — static (redrawn on scene change) and
interactive (per-frame handles) — both RAF-throttled, with memoised renderable sets and O(n)
culling; their own [issue #10063](https://github.com/excalidraw/excalidraw/issues/10063)
admits the duplicate pipelines and contending throttles cost 30–50%. tldraw culls with
`display:none`, debounces zoom-derived values above 500 shapes, and does real LOD. Figma
rejected DOM/SVG *and* immediate-mode 2D canvas for tile-based WebGL; Photopea went to
WebGL because "a 10 megapixel document with lots of layers at 60 fps" needs the GPU.

---

## 6. Thread 3C — available timeline components

**One real fit, and it is dormant.**
[`animation-timeline-control`](https://github.com/ievgennaida/animation-timeline-control)
(npm `animation-timeline-js`) — **MIT, zero runtime dependencies, TypeScript,
canvas-rendered, framework-agnostic**, with ruler, playhead, multi-row keyframes, groups,
multi-select, drag of keys and ranges, snap, zoom/pan and virtualisation. **No curve
editor. Last commit 2024-07-21.** Dependency-free MIT makes vendoring viable despite
dormancy — the same move already made with Inter.

Everything else fails a constraint: **Theatre.js** (AGPL studio, React-bound, dormant);
**@xzdarcy/react-timeline-editor** (MIT, maintained, React-only); **vis-timeline** (nine
peer deps incl. `moment`, calendar idiom); **frappe-gantt** (no playhead or keyframes);
**DHTMLX** (Gantt idiom, heavy); **GSDevTools** (non-OSI licence, and a playback scrubber
rather than a track editor); **Motion DevTools** (a Chrome extension). Headless
keyframe-state libraries effectively do not exist. **wavesurfer.js** (BSD-3, maintained)
isn't a keyframe editor, but its Timeline/Regions/Minimap/Zoom plugins are the cleanest
plain-TS reference for ruler, playhead and region drag.

---

## 7. Adopt / reject

| Pattern | Source | Verdict |
|---|---|---|
| Second spatial view for the invisible scalar (depth strip) | AE orthographic views, Blender Mist gizmo | **Adopt** — highest value in the survey |
| Shaded relief as default depth shading | Esri hillshade, autostereogram-creator | **Adopt** |
| Turbo as the false-colour option | Google Research | **Adopt**; greyscale stays truth |
| Hold-to-reveal momentary ground truth | autostereogram-creator | **Adopt** — cheap, high value |
| Design/Animate mode toggle | Rive, Jitter | **Adopt** |
| Per-property stopwatch | After Effects | **Reject** — documented footgun |
| `U` — collapse to animated properties only | After Effects | **Adopt** |
| Verbs/Behaviours attached per-property by right-click | Cavalry, Jitter | **Adopt** — this is R9 |
| Named action as a *collapsed labelled row*, expand opt-in | Figma Motion's loudest beta complaint | **Adopt** |
| Per-item convert, never all-at-once | Jitter (good) vs Apple Motion (bad) | **Adopt** |
| Action duration as a bar in the sequencing view | Apple Motion; PowerPoint-on-Mac's failure | **Adopt** — do not ship a flat list |
| Dope sheet first, curve editor later in the same panel | AE, Spine shipped without curves until v4 | **Adopt, phased** |
| Speed graph vs value graph | After Effects | **Reject** — biggest documented confusion |
| Normalize / Stacked view for mixed units | Blender | **Adopt when curves land** |
| Depth window (centre/width/feather) with an in-view gizmo | Nuke ZSlice, Blender Mist | **Adopt** |
| Depth linter (levels, step, pairs below one step, cardboarding) | autostereogram-creator, DepthView | **Adopt** — highest leverage diagnostic |
| Depth eyedropper (copy depth between layers) | Immersity | **Adopt** |
| Snap to 6–9 depth bands rather than free floats | Miller, Triaxes, our own 19-level quantisation | **Adopt as default gesture** |
| Photopea layer-row contract + Figma Tab-to-rename | Photopea, Figma | **Adopt** |
| Alt+click to cycle beneath; Ctrl to suspend snap | Excalidraw, tldraw, Figma | **Adopt** |
| Mark-based undo (one entry per interaction) | tldraw | **Adopt** |
| Two static/interactive canvases | Excalidraw | **Adopt**, plus a third debounced one |
| Fixed width-draggable sidebars, no docking | Figma, Penpot, Photopea | **Adopt** |
| 24×24 hit targets on 8–10px diamonds | WCAG 2.2, Fusion's failure | **Adopt as hard requirement** |
| Editor/runtime split | Theatre.js | **Adopt architecturally** |
| Name-based object matching | Morph, Magic Move, Smart Animate | **Reject** — match on stable ids |
| Nesting/precomp as the only grouping | After Effects | **Reject** — plain folders |
| Node graph for composition | Fusion, Cavalry | **Reject** — doesn't pay off under ~20 elements |
| State machine layer | Rive | **Reject** — "think more like a developer" |
| NLA-style reusable clip strips | Blender | **Defer** — being rewritten after a decade of complaints |
| Two modes (quick/advanced) over one model | Google Web Designer | **Defer**; if revived, make the lossiness *visible* |

---

## 8. What the research does not cover

- **Stereogram-specific perception.** Nothing here speaks to fusion, legibility
  thresholds, or the stroke-width findings — that is
  [`2026-10-12-legibility-findings.md`](2026-10-12-legibility-findings.md) and the research
  effort that follows the rewrite.
- **Accessibility beyond hit targets.** Keyboard navigation of a canvas editor, screen
  reader behaviour, and reduced-motion handling were not surveyed.
- **Collaborative editing**, which is out of scope for a backend-free static site.
