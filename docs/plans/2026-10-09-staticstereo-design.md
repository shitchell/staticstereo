---
title: staticstereo — design
description: Animated autostereogram (SIRDS) generator with an isomorphic core, a CLI, and a static web view
status: implemented — core, Node and web adapters, CLI, and static site
date: 2026-10-09
tags: [autostereogram, sirds, stereoscopy, typescript, cli, canvas, design]
---

# staticstereo — design

**Tagline:** Static on the Stereo
**Package / repo:** `staticstereo` · **CLI:** `stst`

Generate single-image random-dot stereograms (SIRDS / "Magic Eye"), as stills and as
animations, from declarative scenes built out of text, PNGs, GIFs, shapes, and depth
maps.

Origin of the project:

> "i just saw a crazy cool video that looked mostly like static, but if you relaxed your
> eyes in good stereoscopic practice, you could see pacman eating some dots :p it was
> super cool and makes you look like some freak staring at a static screen for some
> MJ12/alien downloads xD i'd love to be able to create something like that"

A throwaway Python POC (`sirds.py`) validated the algorithm and the artifact/codec
pitfalls before this design was written. It is not the basis of this implementation; it
is prior art to port from.

---

## 1. The central premise: depth is the source, not an output

Do **not** derive stereograms from finished colour imagery. A shaded, full-colour render
carries strictly less information than the depth map it came from, and recovering depth
from it means monocular depth estimation (MiDaS, Depth Anything) — heavy, ML-dependent,
and counterproductive here.

SIRDS has a very small depth budget: the POC used 18px of total disparity. Estimated
real-world depth is smooth, noisy, and gradient-heavy, which turns to mush inside that
budget. SIRDS wants **flat, quantised, high-contrast depth planes**.

Therefore depth maps are authored directly. Three supported tiers:

| Source | Mechanism | Suited to |
|---|---|---|
| Canvas 2D drawing, where fill colour *is* depth | `ctx.fillStyle = d(0.8)`; paths, `fillText`, transforms | Text, sprites, shapes, all animation. ~90% of use. |
| Blender | Export the **Mist/Z pass** as an image sequence; the beauty pass is never needed | Real 3D objects |
| Existing colour video | ML depth estimation, out of process | Possible, poor results. Not supported in v1. |

Consequence for text: keep it on one flat plane, or 2–3 planes at most. Do not extrude or
shade it — within 18px of disparity a gradient only degrades fusion.

Consequence for fade: there is no meaningful "transparent" in depth space. Alpha-blending
a shape to 50% does not make it faint, it places it *halfway between the object and the
background in depth*. So fade is expressed as the `emerge` preset, animating depth from 0
to target — the object rises out of the noise. This is the native idiom and is treated as
a feature, not a workaround.

---

## 2. Architecture

One repo, one package, three entry points separated by `package.json` exports. The CLI's
native dependencies (`@napi-rs/canvas`, ffmpeg) must never reach a browser bundle.

```
src/
  core/          ← zero dependencies, isomorphic
    sirds.ts       depth → pixels (the algorithm)
    types.ts       Scene/Layer types
    canvaslike.ts  the injected drawing-surface interface
    anim/          keyframe engine, easings, preset registry
    raster.ts      Scene × t → Float32Array depth
  node/          ← @napi-rs/canvas, ffmpeg, fs
  web/           ← OffscreenCanvas, WebCodecs, gif encoder
  cli/
site/            ← the static site; no server
docs/plans/
```

`core/raster.ts` accepts an injected **`CanvasLike`** (anything exposing a 2D context).
Node supplies `@napi-rs/canvas`; the browser supplies `OffscreenCanvas`; core imports
neither. Depth rasterisation is then "draw with grayscale fills, read back one channel",
which inherits `fillText`, paths, transforms, and `drawImage` instead of reimplementing a
renderer.

TypeScript throughout: with two consumers and a serialisable scene format, the types are
load-bearing.

**`CanvasLike` costs exactly one cast per adapter, and that is accepted.** `Ctx2D` narrows
`fillStyle` to `string` (the DOM allows `string | CanvasGradient | CanvasPattern`) and
`textBaseline` to four of six values. TypeScript's mutable properties are invariant, so a
real context is neither a subtype nor a supertype of `Ctx2D` and the assignment is rejected
in *both* directions — every adapter needs either a cast or a ~40-line forwarding wrapper.
The narrowing is the whole point of the seam, so the cast stays, and the compensating
control is that each adapter's tests exercise **every** `Ctx2D` member against the real
context, so the cast cannot silently become untrue.

### 2.1 Layer compositing must use depth-max, not alpha

Layers composite as `depth = max(depth, layerDepth × mask)`.

Alpha-blending two layers at different depths averages their depths into a value that
means neither: a logo at depth 1.0 over a dot at 0.6 would render at 0.8 — floating in
empty space between two real surfaces. Max-compositing avoids this.

**State the invariant precisely, because the obvious phrasing is wrong.** It is tempting
to say "no intermediate depth ever appears at a layer boundary". That is false, and
measuring it against a real canvas proves it: a circle at depth 1.0 over a slab at 0.6
yields pixels at 0.769, 0.780, 0.937, 0.941 — because `max(0.6, 1.0 × m)` for a fractional
antialias coverage `m ∈ (0.6, 1)` is just `m`. Those values are **correct**. They are the
1px ramp §2.2 wants.

The invariant that actually holds, and the one worth testing:

> In an overlap **interior** — where both masks are fully opaque — the result is exactly
> the nearer layer's depth, never a blend of the two.

Alpha blending fails this across the *entire* overlap region, conjuring a whole phantom
surface at 0.8. Max-compositing produces intermediate values only on the one-pixel
antialiased boundary, as a ramp between two real surfaces. A second invariant is worth
pinning alongside it: a far layer drawn *after* a near one must not bury it, which is what
distinguishes max-compositing from naive painter's order.

Both have dedicated regression tests (§6), which must use **exact** masks — against a real
antialiasing canvas the interior assertion is the only one that is meaningful, and this is
an independent reason the core tests run on an injected fake canvas rather than a native
one.

### 2.2 Antialiasing does NOT replace the POC's depth blur

An earlier revision of this document claimed canvas edge antialiasing made the POC's
`--blur` pass unnecessary — "free and automatic". **That was wrong, and it was mildly
self-contradictory.** Recorded here rather than quietly deleted, because the reasoning
matters.

Antialiasing gives a sub-pixel ramp on boundary pixels of an antialiased *mask edge*. It
does nothing in two cases that certainly occur:

- **Heightmap interiors.** `mode: 'heightmap'` maps luminance to depth per pixel, so a
  quantised image — which §1 explicitly *wants* — has hard interior steps with no mask
  edge to antialias.
- **Fully opaque overlaps.** Where two layers with *exact* (non-antialiased) masks
  overlap, `max` yields a hard step by construction and there is no edge to antialias.

The artifact this leaves is the one the POC's own docstring names: a hard depth step makes
the encoder copy from source content of a different period, producing a visible **ghost of
the shape echoed up to `sepFar` px to its right**. Note that no period-measurement test
catches this — the background still measures `sepFar` at score 1.0 by construction,
because the echo is a perceptual artifact, not an encoding failure.

So `StereoOpts` carries an explicit `depthBlur`, applied **in the render pipeline, after
compositing and before encoding** — not inside the rasteriser — specifically so the
max-compositing invariant above stays exactly testable on unblurred output.

### 2.3 …and the blur turned out not to be worth paying for

**Everything above is the theory. It did not survive being looked at, and the default is
now 0.** Recorded rather than rewritten, because the reasoning chain was sound and only
the magnitudes were wrong.

Shaun compared blur 0/1/2 by eye at the shipped 18px disparity budget, switching between
them in-place with `feh` while holding fusion:

> "i think blur0 was clean … genuinely little to no difference. i will say: blur1 and
> blur2 *seemed* to have almost a sort of extra border at the bottom that gave a sense of
> more of a mountain sort of thing? like the square was connected to and protruding from
> the background. whereas blur0 seemed to just be more of a floating square."

Two things follow. First, **the ghost echo was not visible at all** at blur 0 — the
artifact this entire stage exists to suppress. Second, blurring **introduced** a cost that
had not been predicted: a depth gradient at the edge is, when fused, literally a *slope*,
so the object reads as a mesa connected to the background instead of a plane floating free
of it. That is not misperception; it is the correct interpretation of a blurred depth map,
and it is the opposite of the intended effect.

The echo remains a real artifact of the shift method — the Thimbleby algorithm performs
hidden-surface removal precisely because of it. The error was one of **magnitude, not
mechanism**: at an 18px budget the cure sits above perceptual threshold and the disease
sits below it. The knob is kept because that trade should reverse as `sepFar` and `sepNear`
move apart.

An attempt to find a monocular statistic for the echo failed, and informatively. At blur 0
the band immediately right of a near shape is *perfectly* periodic at `sepFar` — score
1.000, indistinguishable from clean background. The period is exactly correct; the echo is
about *which content* repeats. So the artifact only comes into existence once two eyes
fuse, which is why no measurement in this repo can see it.

The free-antialiasing argument from §2.2 survives only in its narrow true form: layer-over-
*background* mask edges do get a soft sub-pixel ramp — and at this depth budget that turns
out to be all the softening the encoder needs.

---

## 3. Scene and layer model

Every element is a layer with a source, a depth, and optional animators. Sources are a
discriminated union so the format is unambiguous in JSON/YAML.

```yaml
size: [800, 450]
fps: 12
duration: 4
freezeNoise: false   # a Scene field, not a stereo field
stereo: {sepFar: 110, sepNear: 92, noiseScale: 2, depthBlur: 1, cross: false, seed: 7}
layers:
  - {type: text,  text: HELLO,   size: 90,     depth: 0.6, anim: {kind: marquee, speed: 60}}
  - {type: image, src: ball.png,               depth: 1.0, anim: {kind: bounce, height: 200}}
  - {type: gif,   src: walk.gif, loop: loop,   depth: 1.0, anim: {kind: slide-in, from: left}}
  - {type: shape, shape: circle, at: [400, 225], r: 40, depth: 0.8}
  - {type: draw,  fn: ./custom.mjs}   # escape hatch; receives (ctx, t, d)
```

`gif` layers run their own internal frame clock *underneath* the layer animator, so a
walk cycle can play while the sprite also translates.

`marquee` measures rendered text width so that copy wider than the viewport correctly
enters from beyond the edge — translating `+W → -textWidth`, not `+W → 0`.

**`at` anchoring is specified, because the presets depend on it.** `slide-in` and
`marquee` compute off-frame positions as `-contentW` / `+sceneW`, which are only genuinely
off-frame if the layer's own position is the origin. So `at` defaults to `[0, 0]` for
text, image, gif, and rect layers, with text drawn from `textBaseline: 'top'` so that
corner is visible rather than one line above the canvas. `circle` is the sole exception:
its `at` *is* its centre, so it defaults to the scene centre — `[0, 0]` would put three
quarters of it off-canvas.

The tempting friendlier default — centring a bare image or text layer — would silently
break the one behaviour this section calls out by name, since an over-wide marquee would
then start half a screen from where it should. Consequence to be aware of: a bare
`{type: 'text'}` layer renders at the top-left corner, so `stst still --text HELLO` should
supply its own `at`.

### 3.1 Image → depth

Auto-detected, with a per-layer override that always wins:

1. `mode` set → obey it.
2. **A `mask` with no `mode` → silhouette.** This rule was missing from the first draft,
   which made the example below silently wrong: `{src: 'logo.png', mask: {luma: 0.5}}` is
   opaque artwork, so alpha auto-detection fell through to heightmap and *ignored the mask
   that was the entire point of writing it*.
3. Meaningful alpha channel present → **silhouette**.
4. Fully opaque → **heightmap** (brightness = depth).

GIF layers resolve mode by the same four rules. They originally hardcoded silhouette,
which left an opaque GIF flattening to its bounding rectangle with heightmap not
expressible at all. Alpha is detected per frame, not from frame 0, because a sprite
sheet's frames need not agree.

`alpha` masking and "anything not transparent sits on one flat plane" are the same
operation — *build a binary mask, place the mask at one depth* — differing only in where
the mask comes from. So there is one `silhouette` mode with a pluggable mask source:

```js
{ src: 'ball.png',   depth: 1.0 }                      // auto → alpha silhouette
{ src: 'logo.png',   depth: 1.0, mask: {luma: 0.5} }   // opaque logo → threshold silhouette
{ src: 'relief.png', mode: 'heightmap' }               // brightness → sculpted depth
```

The `{luma: threshold}` mask source costs one line and covers the common case: an
arbitrary PNG is usually a logo on an *opaque* white background, where pure alpha mode
yields a floating rectangle and heightmap mode yields mush.

### 3.2 Multiple layers (the deferred feature, available immediately)

```yaml
layers:
  - {type: image, src: dot.png, at: [150, 225], depth: 0.6}
  - {type: image, src: dot.png, at: [300, 225], depth: 0.6}
  - {type: image, src: pac.png, depth: 1.0, anim: {kind: slide, from: [-80, 225], to: [880, 225]}}
```

That is the pacman animation assembled from three static PNGs. Because the core takes a
layer **list** from day one, this requires no engine work — it is `layers.length > 1`.
Only the *UI* for arranging layers is deferred.

---

## 4. Animation model

Keyframes plus easing are the engine; named presets are sugar that compile down to them.

```js
// authored (sugar)
{ src: 'HELLO',    anim: {kind: 'marquee', speed: 60} }
{ src: 'ball.png', anim: {kind: 'bounce', height: 200} }

// compiled (engine)
{ keys: [{t: 0, x: 800}, {t: 1, x: -400}], ease: 'linear', repeat: 'loop' }

// fine-tuned escape hatch — same slot, same code path
{ keys: [{t: 0, y: 0, depth: 0}, {t: 0.5, y: 120, depth: 1}, {t: 1, y: 0, depth: 0}],
  ease: 'easeOutBounce' }
```

A `Track` is `{keys, ease, repeat, start, duration}`. Raw tracks are accepted wherever a
preset is, so fine control is not a parallel mechanism.

**Animators compose.** `anim` accepts one or a list; transforms accumulate (translations
sum, scales multiply). `[{kind: marquee}, {kind: bob}]` yields scrolling text that also
bobs, with no `marquee-with-bob` preset.

The transform set is `{x, y, depth, scale, rotate}`. There is deliberately **no
`opacity`** — see §1.

Everything is JSON-serialisable, so the web view gets a timeline and shareable scenes for
free.

v1 presets: `slide`, `slide-in`, `marquee`, `emerge`, `bounce`, `bob`. Registry-based —
adding one later is a new file, not a refactor. `bounce` takes `height` (`h` accepted as
an alias).

### 4.1 Timing policy

Neither this document nor the plan originally said what a scene naming only *one* of
`fps`/`duration` means, and the two pointed opposite ways. Decided:

| Scene names | Treated as |
|---|---|
| neither `fps` nor `duration` | a still |
| `duration` only | animated at `DEFAULT_FPS` = 12 |
| `fps` only | animated over the default 1 second |
| both | as written |

`fps: 0` and `duration: 0` are both rejected rather than honoured — accepting one while
replacing the other would be two opposite readings of the same malformed input inside one
function. `frameTimes` **excludes the endpoint**: the last frame is at `(n-1)/fps`, not at
`duration`, because `t = duration` is the same pose as `t = 0` for anything looping and
including it stutters every loop with a duplicated frame.

#### Two consequences worth knowing up front

**A still of an animated scene must not sample at t=0.** With no `duration`, a naive
implementation gives every track a zero-width window and pins it at its t=0 pose — which
for `marquee` is fully off-screen right, so the still renders *completely empty*. Policy:
an absent `duration` is treated as 1 second, never 0, and still rendering takes an
explicit sample time defaulting to the **midpoint** of the scene. `stst still` exposes
`--at <seconds>`.

**`bob` and `bounce` deliberately have no default duration**, so they inherit the scene's.
That means `{kind: 'bob'}` on a 10-second scene bobs exactly *once* over ten seconds —
authors wanting an idle wobble must pass `duration`. The alternative was a fixed default
period, which leaves the track mid-cycle at the scene's end and breaks loop closure.
`marquee` is the only preset deriving its own duration, because `speed` demands it.

Easing is applied **per segment**, so a three-key `bounce` (`0 → -h → 0`) runs the bounce
curve on the rise as well as the fall, which is physically backwards. Accepted for v1;
fixing it properly needs an optional per-`Key` easing, which is a schema change.

---

## 5. Outputs and views

### Encoders

Stills → PNG. Animation → GIF, MP4, or PNG sequence.

**The codec trap is enforced, not documented.** MP4 defaults to
`libx264 -qp 0 -pix_fmt yuv444p` (lossless). Random noise is near-incompressible, and
lossy DCT plus chroma subsampling smears exactly the pixel-level correlations that *are*
the stereo signal. The CLI warns when overridden to a lossy setting, because the failure
mode looks like a bug in the generator rather than a bad encode.

GIF is a genuinely good fit: binary black/white noise is a 2-colour palette, so GIF is
lossless and smaller than expected. POC measurement: 6.7 MB for 48 frames at 1600×900
(lossless MP4 of the same frames was 16.1 MB).

### CLI (`stst`)

```sh
stst render scene.yaml -o out.gif
stst still --text HELLO -o out.png      # one-liners without a scene file
stst preview scene.yaml                 # watch it in a window
```

Stereo parameters (`--sep-far`, `--sep-near`, `--noise-scale`, `--cross`, `--seed`)
override the scene file, so fusion can be tuned without editing anything.

### Web (static, no backend)

Live canvas preview, a timeline scrubber, **a side-by-side depth-map view**, and export
via WebCodecs. The scene serialises into the URL hash, so a finished piece is a shareable
link with no server.

The depth-map panel is load-bearing rather than a convenience: a stereogram cannot be
debugged by eye, so without it there is no way to tell a depth-authoring bug from an
encoding bug.

---

## 6. Testing strategy

"It rendered without throwing" proves nothing about a stereogram. The split:

- **Depth frames get golden tests.** Deterministic, small, human-readable; a PNG diff
  shows exactly what broke.
- **Stereograms get analytic tests.** Render a known depth map, measure the dominant
  repeat period by autocorrelation inside versus outside the object, and assert
  `sepNear × noiseScale` and `sepFar × noiseScale`. This is the test that fails when the
  encoding breaks. Run against the POC it returned 184px inside the sphere and 220px
  outside, for `sepNear=92`, `sepFar=110`, `noiseScale=2`. Golden-imaging the noise
  itself would only test the PRNG.
- **Compositing regression test.** Two overlapping layers at depth 0.6 and 1.0; assert
  *no* pixel reads ≈0.8. This test exists specifically to fail if max-compositing is ever
  "simplified" into alpha blending (§2.1).
- **Determinism.** Same seed → byte-identical output, via a seeded PRNG (xorshift128),
  which is what makes all of the above stable and makes `freezeNoise` reproducible.
- **Unit tests on animator maths.** Presets compile to expected tracks; `marquee` with
  over-wide text fully exits the frame.

---

## 7. Deferred / out of scope

- UI for visually arranging multiple layers (the engine already supports n layers).
- ML depth estimation from colour video.
- Colour or textured stereograms (pattern-based rather than random-dot).
- Blender integration beyond consuming an exported Z/Mist image sequence.

---

## 8. Decisions and rationale

### Node/TypeScript rather than Python

- **Status**: Accepted
- **Context**: Choosing an implementation language after a Python POC proved the
  algorithm. Needed to serve both a CLI and a static website.
- **Rationale**: Shaun:

  > "i'd actually love node if possible so that i can use it as a cli or static website
  > equally... if possible :p if not, i'm happy with python. i'd just put it into its own
  > repo either way, not the ~/code catch-all :)"

  Supporting technical point raised in design: the core algorithm is typed arrays and
  integer maths with zero dependencies, and Canvas 2D exists in both Node and the
  browser, so depth-authoring code is literally identical across both targets.

### Shared core with separate CLI and web views (MVC)

- **Status**: Accepted
- **Context**: Asked whether he had architectural preferences, and what the required
  input types and extension points were.
- **Rationale**: Shaun:

  > "i honestly have no notes or asks around architecture for this other than the obvious
  > MVC to facilitate shared core with different CLI/web views :p which i'm guessing you'd
  > have gathered. flex points i'd say are just ensuring it has room to accept gifs, pngs,
  > text, and some level of text animations (and ideally the ability to later extend some
  > of those animations). i might also look at some shared thing around the animation bit
  > so that we could animate scrolling text (including text so long "comes in" from beyond
  > the edge of the view) or a png (e.g.: take a static png of a ball and then generate a
  > video of it bouncing across the screen). flexy flex point to design around but not
  > build: a future update where i could feasibly take 3 or 4 image files, set some of them
  > to a static position, and then move one (e.g.: to create something like the pacman
  > video from a few static images)."

### Animation belongs to the layer, not the layer type

- **Status**: Accepted
- **Context**: Derived from the requirement above — one mechanism had to drive both
  scrolling text and a bouncing PNG, and the deferred multi-image feature had to remain
  reachable.
- **Rationale**: "Take 3–4 images, pin some, animate one" and "scrolling text" are the
  same shape: a list of layers each with an optional animator. Making animation a layer
  property rather than a type-specific behaviour means the deferred multi-image feature
  is not a future refactor — it is `layers.length > 1` and falls out for free. Shaun's
  reaction to the layer model: "awesome :D i like it :)"

### Presets compiling to keyframes, with raw-track escape hatch

- **Status**: Accepted
- **Context**: Choosing between named presets, keyframes, and raw functions for the
  animation mechanism; serialisability mattered because the web view needs to build and
  save scenes.
- **Rationale**: Shaun:

  > "presets over keyframes... but it'd be nice to expose some form of fine-tuned control.
  > i think that's what you're expressing with the escape hatch :)"

### Image → depth: auto-detect, overridable, silhouette default

- **Status**: Accepted
- **Context**: Deciding how a PNG becomes depth; offered alpha-silhouette, luminance
  heightmap, or auto-detect with override.
- **Rationale**: Shaun:

  > "i like the auto-detect option! i'd say alpha always goes to flat / background. i like
  > your luminance as a height map, but i'd make that overridable in case i just want to
  > take a random png and create a stereoscopic image without trying to manipulate it in
  > any way to account for depth. in that mode, i'd simply say "anything that isn't
  > transparent is on the same elevated/projected flat surface"."

  The `{luma: threshold}` mask source was added on top of this (not requested) because an
  arbitrary opaque PNG would otherwise silhouette to a plain rectangle.

### Depth-map preview panel in the web view

- **Status**: Accepted
- **Context**: Presented as part of the outputs/views section.
- **Rationale**: Shaun:

  > "ooh, i love it, especially the preview bit"

  Design-side reason it is treated as load-bearing: a stereogram cannot be inspected by
  eye, so without a depth view there is no way to distinguish an authoring bug from an
  encoding bug.

### Naming: `staticstereo`, CLI `stst`, tagline "Static on the Stereo"

- **Status**: Accepted — provisional per default practice; treat as changeable until
  stated otherwise
- **Context**: Repo being split out of the scratchpad POC into a standalone project.
  Candidates were Shaun's own: "staticstereo? stereostatic? static on the stereo? sots?
  :p". Availability checked before settling: `staticstereo` free on npm; `stst` and `sots`
  taken as npm package names but irrelevant as bin names; no PATH collisions for `stst` or
  `sots`.
- **Rationale**: Shaun:

  > "if available, i think i favor "staticstereo" with either "sots" or "stst" as the cli
  > utility :)"

  and on the CLI name specifically:

  > ""stst" is particularly easy to type lol"

  then confirming:

  > "i think `staticstereo` for the url / package name, "Static on the Stereo" for the
  > tagline as you suggested, and `stst` as the cli utility name :)"

  Per standing naming practice the name is kept out of module, class, type, and wire
  identifiers (neutral terms there: `Scene`, `Layer`, `Track`, `renderSirds`) so a rename
  stays a mechanical grep. `stst` is also a rare substring, which keeps `grep` precise.

### Repo location and creation flow

- **Status**: Accepted
- **Context**: Needed a path, and the git wrapper fails closed on a repo with no remote,
  so the first commit would be refused in a bare `git init`.
- **Rationale**: Shaun:

  > "ah, yeah, that's the correct spot :) `git clone` without a target dir would
  > automatically organize it there. i would typically, for my own part, create the repo on
  > github, then clone via ssh sans a target dir. that solves all the things"

  Note: the wrapper's `clone_organize_dirs.basedir` is `/home/guy/code/git` (with
  `force = true`), so the clone landed at
  `/home/guy/code/git/github.com/shitchell/staticstereo`, not under `~/git`. `~/git` and
  `~/code/git` are separate real directories; the active one is `~/code/git`.

### Lossless-by-default encoding

- **Status**: Accepted
- **Context**: Measured during the Python POC.
- **Rationale**: Rationale TBD from Shaun; adopted on technical grounds established in
  the POC — lossy DCT and chroma subsampling destroy the pixel-level correlations that
  carry the stereo signal, and the resulting failure is indistinguishable from a generator
  bug.

### Repository visibility: public

- **Status**: Accepted
- **Context**: Repo was created private on 2026-10-09 as a conservative default, then made
  public the same day on request.
- **Rationale**: Shaun:

  > "we can make it public :) i intend to host the static site there via GH Pages. i
  > understand we might need a pipeline build step for that; that doesn't have to be a
  > this-session thing unless you wanna throw that in"

### Static site hosted on GitHub Pages, deployed via Actions

- **Status**: Accepted (design); implementation deferred
- **Context**: Follows directly from the visibility decision above. `docs/` is already in
  use for planning documents, so the legacy "serve from `/docs` on main" Pages mode is
  unavailable, and a `gh-pages` branch would mean committing build output.
- **Rationale**: Shaun intends Pages hosting (quoted above) and explicitly deferred the
  pipeline: "that doesn't have to be a this-session thing unless you wanna throw that in".
  Deferred rather than built because there is no site to build yet — the implementation
  does not exist, so a deploy workflow would have nothing to deploy and could not be
  verified. Approach recorded now so the implementation targets it:
  `actions/deploy-pages` building `site/` → `dist-site/` on push to the default branch, no
  build artifacts committed and no second branch.

  This constrains the web build: `site/` must compile to a fully static bundle with no
  server and only relative asset paths, since Pages serves a project site from a
  subpath (`/staticstereo/`).

  **And the constraint is only enforced if CI builds before it tests.** That sentence was
  missing, and its absence cost real coverage: the relative-path check can only run
  against *built* output, `dist-site/` is gitignored, and the test skips when it is
  absent — so CI reported green while never executing it. Eleven assertions were skipped
  that way, including all seven Pages-critical ones. Already consistent with §5, which specifies a static site
  with scene state in the URL hash.

### Corrections from implementation review (2026-10-09)

- **Status**: Accepted
- **Context**: Tasks 2 and 3 were implemented by subagents instructed to report real
  problems rather than reassurance. Four findings were reproduced and verified before
  acting on them; one was reported inaccurately and is recorded as such.
- **Rationale**: Rationale TBD from Shaun — these are technical corrections made under
  delegated authority ("take the wheel and drive as you see fit"), not choices he weighed
  in on. Flagged for review; see "Open questions for Shaun" below.

  Confirmed and fixed:

  1. **§2.1's "antialiasing replaces the POC blur" claim was wrong** and mildly
     self-contradictory. See §2.2 for the full reasoning and the `depthBlur` replacement.
  2. **`dominantPeriod` could return a period it never measured** (`bestPeriod = lo` with
     `score = -1`), indistinguishable from a real measurement to a caller that did not
     check for a negative score. Reproduced: an 80-sample window over candidates 80..140
     returned `period=80, score=-1, overlap=0`. Fixed with an overlap floor, a `NaN`
     period when nothing is measurable, and a `samples` count in the return.
  3. **`upscale(src, w, h, 1)` returned its input by reference.** Reproduced: mutating the
     result mutated the caller's buffer. Downstream encoders quantise in place, so a
     reused frame buffer would have been silently corrupted.
  4. **`localTime` wrapped negative time**, so `{start: 1, repeat: 'loop'}` showed the
     middle of its animation *before* its start. The planned test only covered
     `repeat: 'once'`, where the clamp hid it.
  5. **A still of a `marquee` scene rendered completely empty** — zero duration pinned
     every track at its t=0 pose, which is off-screen. See §4.1.
  6. **`sirdsFromDepth` silently ignored `noiseScale`.** `SirdsOpts` was introduced as a
     narrower type so the mistake could not be made. **That guarantee was overstated and
     is recorded here as such.** Excess-property checking fires only on fresh object
     literals, and because `StereoOpts extends SirdsOpts` a `StereoOpts` *variable* is
     assignable to the parameter — verified: `sirdsFromDepth(d, w, h, stereo)` compiles
     clean and silently drops `noiseScale` and `depthBlur`, which is the exact bug the
     type existed to prevent, via the most natural call shape. See §9 item 8 for the
     pending fix. The pipeline avoids it behaviourally by building an explicit
     four-field literal, and the end-to-end period assertions cover it.
  7. `bounce` took `h` here and `height` in the plan. Canonical is `height`.

  Reported but **not** reproduced as described: the `dominantPeriod` defect was reported
  as "returns period 236 at score 1.0 from four comparisons". On the flat-slab fixture it
  instead returns a sentinel `score = -1`. The agent's figure came from the POC's *sphere*
  — gradient depth, different data. The underlying defect is real; the specific numbers
  were not independently reproducible and should not be quoted.

  Also noted, accepted as-is for v1: easing is per-segment, so a three-key `bounce` eases
  the rise as well as the fall (§4.1).

---

### Corrections from implementation review, round 2 (2026-10-09)

- **Status**: Accepted
- **Context**: Tasks 4 and 6 (rasteriser, Node adapter), same instruction to report real
  problems. Every finding below was reproduced before being acted on.
- **Rationale**: Rationale TBD from Shaun — technical corrections under delegated
  authority, same as the first round.

  1. **§2.1's invariant was stated too strongly.** "No intermediate depth at a layer
     boundary" is false against a real antialiasing canvas, and the test as drafted would
     have failed on a *correct* implementation. Measured: 0.769, 0.780, 0.937, 0.941. See
     §2.1 for the invariant that actually holds.
  2. **§2.2's "fully opaque overlaps" bullet replaced "layer-over-layer boundaries"**, for
     the same reason.
  3. **`emerge` did nothing for any layer except `depth: 0`** — i.e. it was broken by
     default. Measured at depth 1: `1.000` at every sampled time. `PresetCtx` now carries
     `layerDepth`; see §4.
  4. **A `mask` with no `mode` was ignored**, which made §3.1's own example wrong. Fixed as
     rule 2 in §3.1.
  5. **GIF layers hardcoded silhouette**, so opaque GIFs flattened to a rectangle. Now
     resolved by the same rules as still images.
  6. **The plan's `gifenc` advice was Node-correct and bundler-backwards.** It is a
     dual-package hazard, and the trap is that vitest exercises only the bundler half — so
     one form stays green in CI while the shipped CLI is broken. Measured both ways.
  7. **The plan's "clear the gif buffer per frame" advice was itself a bug.** Optimised
     GIFs are partial-frame; clearing renders them full of holes. The GIF disposal model is
     required instead.
  8. **The planned core-purity test was wrong twice over** — it grepped raw text, matching
     several `@napi-rs` mentions that are all comments, while missing the one real leak
     (`vitest`, because the build compiled tests into `dist` and `files: ["dist"]` would
     have published them).
  9. **`quantize(rgba, 2)` can return fewer than 2 colours** for low-colour input; measured
     `quantize(allBlack, 2) → [[0,0,0]]`. A solid first frame would have flattened a whole
     animation to black.
  10. **§5's lossless claim is now measured rather than asserted:** `-qp 0 -pix_fmt
      yuv444p` round-trips a dot field with 0 mismatched pixels; `-crf 28 -pix_fmt yuv420p`
      corrupts ~145 of 256 and turns 2 distinct values into 55.

  `at` anchoring (§3) and the `CanvasLike` cast (§2) were both unspecified and are now
  written down.

---

## 9. Open questions for Shaun

Decisions made under delegated authority that he has not weighed in on. None block
implementation; all are cheap to change.

1. ~~`depthBlur` default of 1.0.~~ **Answered by measurement — default is now 0.** See
   §2.3; the ghost it suppressed was invisible and the blur's own slope artifact was not.
2. **Stills sample at the scene midpoint.** Defensible (an animated scene stills to
   something visible) but arbitrary; t=0 is the more literal reading of "the first frame".
3. **Per-segment easing on `bounce`** is physically backwards and deferred rather than
   fixed. Fixing it means adding optional per-`Key` easing — a schema change, hence the
   deferral.
4. ~~**Licence is TBD** in `package.json` (currently `MIT`) and the README.~~ **Decided:
   WTFPL.** `LICENSE`, `package.json` (`"license": "WTFPL"`), the README and the site
   footer all say so.
5. **`type: 'draw'` is unimplemented and throws.** Resolving a module path is
   platform-specific: `import()` of a filesystem path is meaningless in the static Pages
   bundle, and doing it in `core` would smuggle a Node dependency past the `CanvasLike`
   seam. Pre-resolving a function onto the layer instead would break the
   JSON-serialisability that URL-hash scenes rely on. Needs a decision: a
   `CanvasLike.loadModule(src)`, or drop the escape hatch, or accept non-serialisable
   scenes for code-authored cases.
6. **`at` defaults to the top-left** for text/image/gif (§3). Predictable and required by
   the presets, but it means a bare text layer renders in the corner.
7. **Opaque GIFs now default to heightmap** rather than a flat silhouette. More consistent
   with still images, but it is a behaviour change for anyone who wanted the rectangle.
8. ~~`SirdsOpts` does not actually prevent passing `noiseScale`.~~ **Fixed** — the
   `?: never` members landed, the leak probe now fails with TS2345, and §8 round 2 item 6
   keeps the record of the overstated claim.
9. **`DEFAULT_FPS = 12` is invented.** It matches the design's example scene and the POC
   default, but nothing chose it deliberately.
10. **`depthBlur` still has no automated test that can validate it for its purpose**, and
    now provably cannot: the echo is invisible to every monocular statistic (§2.3). What
    changed is that this no longer matters much — the stage is off by default. If anyone
    turns it on at a wide depth budget, the only available verification is a person's
    eyes. A blinded, randomised A/B with replicates is the right instrument, and one is
    in flight.
13. **`MIN_CREDIBLE_SCORE`, `WEAK_SAMPLES` and `FAIR_SAMPLES` in `site/diagnostics.ts` are
    invented numbers**, same category as `DEFAULT_FPS` (item 9). The file says so
    honestly, and they are chosen so a full-width row grades `strong` while a thin
    user-dragged band cannot. But the confidence grade is exactly what the diagnostics
    panel asks you to trust, so the thresholds deserve a deliberate choice.
14. **The site cannot load any example with an `image` or `gif` layer.** `examples.ts` is
    text and shapes only, on purpose: a bundled `/dot.png` would work on localhost and 404
    under `/staticstereo/`. The consequence is that the image→depth path — four
    auto-detect rules and per-frame alpha detection, the most error-prone corner of the
    scene model — is reachable on the site only by hand-typing a URL or a `data:` URI.
    Given the depth panel exists to debug exactly that, a tiny inline `data:` URI example
    would make it one click away.
11. **`CanvasLike` has no teardown hook, and the browser will eventually need one.**
    `createImageBitmap` returns a resource with `close()` and `DecodedImage` has nowhere to
    put it. Harmless today — one decode per render, held by `RasterCache` — but a page that
    swaps scenes repeatedly will leak decoded pixels. Deliberately *not* fixed by widening
    the interface, since §2 says keep it narrow; the decision is which way to pay.
12. **The web adapter's `asCtx2D` cast has no test behind it and cannot have one here.**
    The Node adapter's equivalent cast is backed by a sweep exercising every `Ctx2D` member
    against the real context. `OffscreenCanvas` does not exist in Node and jsdom/happy-dom
    do not rasterise, so the browser cast rests only on the DOM spec being the API
    `@napi-rs/canvas` imitates. `webCanvas().make()`, `loadImage()` (hence the browser's
    `hasAlpha`/mode decision), and `pngBlob()` are unverified. The highest-value browser
    test to add later is that same member-by-member sweep.
