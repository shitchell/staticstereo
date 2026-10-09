---
title: staticstereo — design
description: Animated autostereogram (SIRDS) generator with an isomorphic core, a CLI, and a static web view
status: design approved, not yet implemented
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
native dependencies (`skia-canvas`, ffmpeg) must never reach a browser bundle.

```
src/
  core/          ← zero dependencies, isomorphic
    sirds.ts       depth → pixels (the algorithm)
    scene.ts       Scene/Layer types + validation
    anim/          keyframe engine, easings, preset registry
    raster.ts      Scene × t → Float32Array depth
  node/          ← skia-canvas, ffmpeg, fs
  web/           ← OffscreenCanvas, WebCodecs, gif encoder
  cli/
site/            ← the static site; no server
docs/plans/
```

`core/raster.ts` accepts an injected **`CanvasLike`** (anything exposing a 2D context).
Node supplies `skia-canvas`; the browser supplies `OffscreenCanvas`; core imports
neither. Depth rasterisation is then "draw with grayscale fills, read back one channel",
which inherits `fillText`, paths, transforms, and `drawImage` instead of reimplementing a
renderer.

TypeScript throughout: with two consumers and a serialisable scene format, the types are
load-bearing.

### 2.1 Layer compositing must use depth-max, not alpha

Layers composite as `depth = max(depth, layerDepth × mask)`.

Alpha-blending two layers at different depths averages their depths into a value that
means neither: a logo at depth 1.0 over a dot at 0.6 would render at 0.8 — floating in
empty space between two real surfaces. Max-compositing avoids this.

A beneficial side effect: canvas edge antialiasing becomes a ~1px depth *ramp* against
the background, which is precisely the artifact mitigation the POC needed as an explicit
`--blur` pass. It is now free and automatic. At an edge where `mask = 0.5` over another
layer at 0.6, `max(0.6, 0.5) = 0.6` — no nonsense blend.

This has a dedicated regression test (§6).

---

## 3. Scene and layer model

Every element is a layer with a source, a depth, and optional animators. Sources are a
discriminated union so the format is unambiguous in JSON/YAML.

```yaml
size: [800, 450]
fps: 12
duration: 4
stereo: {sepFar: 110, sepNear: 92, noiseScale: 2, freezeNoise: false, cross: false, seed: 7}
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

### 3.1 Image → depth

Auto-detected, with a per-layer override that always wins:

- Meaningful alpha channel present → **silhouette** mode.
- Fully opaque → **heightmap** mode (brightness = depth).

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
{ src: 'ball.png', anim: {kind: 'bounce', h: 200} }

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
adding one later is a new file, not a refactor.

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
  subpath (`/staticstereo/`). Already consistent with §5, which specifies a static site
  with scene state in the URL hash.
