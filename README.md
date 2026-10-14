# staticstereo

**Static on the Stereo.**

Generate single-image random-dot stereograms — "Magic Eye" images — as stills *and as
animations*, from declarative scenes built out of text, PNGs, GIFs, shapes, and depth
maps. Usable as a CLI (`stst`) or as a static website from the same core.

Relax your eyes and the noise resolves into pacman eating dots. To anyone watching, you
are staring at television static with great intensity.

**Try it in the browser: <https://shitchell.github.io/staticstereo/>** — no install, and
the scene lives in the URL, so anything you make is a shareable link.

## Status

**Implemented.** The isomorphic core, the Node adapter, the `stst` CLI, the web adapter
and the static site all exist, with a test suite over every one of them. The design —
including each decision, its rationale, and the places the design itself turned out to be
wrong — is at
[`docs/plans/2026-10-09-staticstereo-design.md`](docs/plans/2026-10-09-staticstereo-design.md).

```sh
npm ci
npm test            # whole suite
npm run build       # the package, into dist/
npm run build:site  # the static site, into dist-site/
npm run dev:site    # the static site, with live reload
```

The site is a single static page with no backend — the scene lives in the URL hash, so a
finished piece is a shareable link. Append **`?present=1`** (a query parameter, not part
of the hash — the hash is strictly the scene) and the page shows only the stereogram,
centred at the largest *whole-number* scale that fits both axes, with the page background
showing in the letterbox; `Esc` goes back. It is the view to fullscreen when judging
whether type is legible. It never shrinks the plate — below 1:1 whole columns are dropped
and the image stops fusing — so an over-large plate scrolls instead.
`.github/workflows/pages.yml` publishes it on every
push to `main`. CI deliberately runs both builds *before* the tests, because the
Pages-critical assertions (relative asset paths, no Node code in the bundle) can only run
against build output, and that output is gitignored — so without that ordering they skip
silently and the run still reports green.

A Python proof-of-concept — [`docs/poc/sirds.py`](docs/poc/sirds.py) — validated the
algorithm, the depth-edge artifacts, and the codec pitfalls before the design was
written. It is reference prior art, deliberately *not* the basis of the implementation.

## The idea in one paragraph

A horizontal strip of random pixels is repeated across each row, and the repeat *period*
is modulated by a depth map: nearer surfaces get a shorter period. Your eyes fuse the
repeats and read the period difference as parallax. Depth is therefore the *source*
medium, not something recovered from finished imagery — which is why scenes are authored
as depth directly rather than rendered and then analysed.

## The shape of it

```yaml
size: [800, 450]
fps: 12
duration: 4
layers:
  - type: text
    text: HELLO
    size: 90
    depth: 0.6
    # A scroll is a `move` with a `speed` and `repeat: loop`. `offRight` and
    # `offLeft` are symbolic endpoints `move` resolves from the stage, the
    # margins and the MEASURED text width, so the string runs off the plate at
    # both ends and never parks its tail on screen — without this file naming
    # a width that goes stale the moment the text or the size changes.
    anim: {kind: move, from: [offRight, 0], to: [offLeft, 0], speed: 60, repeat: loop}
  - type: image
    src: ball.png
    depth: 1.0
    # A bounce is a three-key arc and every verb keys two, so it is written as a
    # raw track. `Anim` takes tracks and presets alike — see
    # `examples/bouncing-ball.yaml`, which does exactly this.
    anim:
      keys: [{t: 0, y: 0}, {t: 0.5, y: -200}, {t: 1, y: 0}]
      ease: easeOutBounce
      repeat: loop
      duration: 1
```

The vocabulary is five verbs — `move`, `rotate`, `scale`, `push`, `flip` — and anything
they do not express is a raw keyframe track, which is not a lesser citizen.

```sh
stst render scene.yaml -o out.gif     # gif, mp4, or a png sequence
stst still --text HELLO -o out.png    # one frame, no scene file
stst preview scene.yaml               # render to a temp file and measure it
stst render scene.yaml -o out.gif --depth-map depth.png   # and the depth map
```

`stst --help` lists the rest. Every stereo parameter (`--sep-far`, `--sep-near`,
`--noise-scale`, `--depth-blur`, `--seed`, `--cross`, `--freeze-noise`) overrides the
scene file, so fusion can be tuned without editing anything. The `--text` path takes
`--size`, `--font-size`, `--font-weight` and `--depth` for the layer it builds;
`--font-weight` defaults to `bold`, and `--font-weight 900` is the one that clears the
default depth budget at 90px — see the table below.

## Examples

Three scenes in [`examples/`](examples/), all authorable in plain text — no binary art, so
you can read any of them in a diff:

```sh
stst render examples/pacman.yaml         -o pacman.gif   # a wedge, and dots that get eaten
stst render examples/bouncing-ball.yaml  -o ball.gif     # two animators composed on one layer
stst render examples/scrolling-text.yaml -o text.gif     # a looping move, wider than the frame
```

## Making something you can actually see

Two constraints matter more than anything else, and both are easy to violate by accident.

**Features must be wider than the disparity budget.** That budget is
`sepFar - sepNear` — 18px by default. A shape narrower than the shift cannot carry an
unambiguous match, so it will not fuse no matter how long you stare.

**The metric**, stated in full because the numbers mean nothing without it: the *median
width of the horizontal runs of depth-map samples at or above half the layer's own peak
depth*, in pre-upscale scene pixels. That is exactly what the site's legibility panel
reports, so these figures and the warning you get in the browser are the same
measurement.

They are also, since the font was vendored, the same *face*. `assets/fonts/inter-*` is
registered by the Node adapter and declared by the site over `@font-face`, both under one
family name, and the WOFF2 the browser downloads was produced from the TTF Node reads —
byte-identical `glyf` and `hmtx` tables. Measured against a headless Chromium: the same
strings advance to within **0.0054%** (worst case 0.0047px at 100px type, which is
fixed-point rounding), and the median stroke below agrees exactly in 11 of 16 cells and by
±1px in the other 5, which is rasteriser hinting at the half-peak threshold. Before
vendoring, the browser resolved `sans-serif` to Liberation Sans and the CLI to DejaVu Sans
and the two disagreed by **1.2–8.3%** with neither being wrong.

| weight | size | median stroke | verdict at an 18px budget |
|---|---|---|---|
| normal | 48px (a scene layer's default) | 5px | will not fuse |
| normal | 90px (`--text`'s own size) | 9px | will not fuse |
| normal | 120px | 12px | will not fuse |
| normal | 150px | 15px | will not fuse |
| normal | 182px | 18px | exactly the budget — hard work |
| bold   | 48px | 8px | will not fuse |
| bold   | 90px (**`--text`'s default**) | 14px | still will not fuse |
| bold   | 110px | 18px | exactly the budget — hard work |
| bold   | 150px | 24px | over the budget, under 2× it |
| bold   | 240px | 37px | comfortable |
| bold   | 360px | 55px | comfortable |
| 900    | 83px | 18px | exactly the budget — hard work |
| 900    | 90px | 19px | just over the budget |
| 900    | 150px | 31px | over the budget, under 2× it |
| 900    | 240px | 50px | comfortable |

**Neither default fuses, and there are two of them.** A text layer in a scene file that
omits `size:` gets **48px** (`DEFAULT_TEXT_SIZE`) — a 5px stroke, barely a quarter of the
budget. `stst still --text HELLO`, which supplies its own, gets **90px**
(`TEXT_FONT_SIZE`) **in bold** (`TEXT_FONT_WEIGHT`) — a 14px stroke. Bold is the default
there because 9px regular was indefensible for the headline one-liner, and it is a 56%
improvement; it is **not** enough, and the table says so. Reaching the budget at 90px
takes `--font-weight 900`, which is 19px. Otherwise: **the smallest size that reaches the
18px budget is 182px regular, 110px bold, or 83px at 900.** Set `size:` and `weight:`
deliberately.

Past bold there is now a **real 900 face**, which there was not before. The system
families this used to fall back on — DejaVu Sans, Liberation Sans, Noto Sans — each
declare exactly 400 and 700, so `weight: 900` was *synthesised*: `@napi-rs/canvas` faked
it at +13–25% and Chromium ignored it, rendering 900 byte-identically to bold. That is why
one test pinning a 900-vs-bold ratio passed on this machine and failed on CI. The vendored
family declares 400, 700 **and** 900, and the gain is now real and consistent across both
rasterisers: +36% over bold at 90px and +35% at 240px in `@napi-rs/canvas`, and 23px → 31px
at 150px measured in the browser's own legibility panel.

The face is pinned, so the table is reproducible — but if the vendored registration ever
fails, `stst` warns on stderr and falls back to the system chain, where the same cells
measure up to **29% away** (DejaVu Sans is the heavy outlier: 18px where the vendored face
gives 14px at 90px bold). That is the one condition under which these numbers stop
holding, and it is the reason the fallback is loud.

Alternatively raise `sepNear` to shrink the budget, buying legibility at the cost of depth
range; for text, which wants one flat plane anyway, that is usually the right trade.

**The emitted image is wider than `size:`, and you should compose only inside `size:`.**
`size:` is the **stage** — the region that survives fusion. The encoders cannot express
depth within one separation of an image edge, so the pipeline emits a wider **plate**: the
stage plus dead **margins** either side. `stst` prints both:

```
stage 800x300 -> plate 965x300 (dead margins 110+55px, shift)
```

Those margins are not croppable. Fusion pairs each column with one `sep` away, so the
partner of a column at the stage's own edge lives in the margin; cropping it destroys the
stereo signal at exactly the edges the margins exist to rescue. Nothing should be
*composed* there — the site draws a stage guide over the preview so you can see where
"there" is — but it has to be emitted. Margins are x-only; height is untouched.

The payoff is that `x: 0` now means the stage's left edge and is fully encoded. Before this
split a ball at `x: 80` lost its left 72px and became an unfindable crescent, and
`pacman.yaml` sliding in from `x: -60` produced no signal at all in 62 of its 80 rows at
t=0.25 — it popped into existence instead of sliding in. Both are zero now. See §10 of the
design doc.

One caveat if you switch encoders: the default `linked` encoder links symmetric pairs, so
a percept lands on the depth column that asked for it. `--algorithm shift` links `(x-sep, x)`
instead, which places percepts **half a separation to the left** — the whole fused picture
sits 46–55px left of where you composed it. Margins do not change this; it is a property of
the pairing.

And if a render looks wrong, use `--depth-map`. A stereogram cannot be debugged by eye;
the depth map is the only way to tell an authoring mistake from an encoding one.

## The vendored font

`core` asks for the CSS generic `sans-serif`, which is the right request and which neither
side of this project can answer for itself. A browser maps it; `@napi-rs/canvas` maps no
generic family **and does not fail** — it renders the first registered family, which on a
Debian fontconfig is the URW ZapfDingbats clone, so `stst still --text HELLO` shipped five
dingbats for a day. Resolving the generic to a system family fixed that and left the face a
property of the host, with the browser picking a different one.

So the face is vendored. [`assets/fonts/`](assets/fonts/) holds three static instances of
**Inter 4.001** (SIL OFL 1.1, licence alongside), subset to Google's own "latin" range:
the Node adapter registers the TTFs, the site declares the WOFF2s over `@font-face`, both
under one family name, and the WOFF2s were produced *from* the subset TTFs so the two
formats carry byte-identical outlines and advances. Nothing is fetched at build time or
run time — a build that reaches the network is a build that breaks offline.

| | per weight | 400 + 700 + 900 |
|---|---|---|
| TTF, read from disk by Node, **not** bundled into the site | 58 KB | 174 KB |
| WOFF2, what a visitor downloads | 20–21 KB | 62 KB |

62 KB is the worst case for a visitor who uses all three weights; the `@font-face` rules
are per weight, so a scene that only uses bold fetches 21 KB. The unsubset instances were
341–344 KB each, so the Latin subset is a 6× saving. Inter was chosen over Noto Sans
(which subsets to 31 KB / 14 KB — cheaper) because its 900 is heavier relative to its
bold, which is the whole reason for having a 900: at 90px Inter's 900 clears the 18px
budget at 19px and Noto's lands exactly on it.

**What you give up is everything outside Latin.** 285 codepoints: ASCII, Latin-1, general
punctuation, the arrows and currency marks Google's "latin" subset carries. No Greek, no
Cyrillic, no CJK, no emoji — and no `U+FFFD`, so not even a replacement character. A scene
with CJK or emoji in it does **not** silently become dingbats again (that needed an
*unresolvable* family, and this one resolves); the vendored family is simply first in a
list, so both the browser and `@napi-rs/canvas` do per-glyph fallback down the rest of it
and the text renders in whatever face the host has for that script. It is correct text in a
face neither adapter chose — which means the two sides can disagree about its width even
though they agree about Latin. Set `font:` on the layer to a family both hosts have if that
matters. Details and the exact subset ranges are in
[`assets/fonts/PROVENANCE.txt`](assets/fonts/PROVENANCE.txt).

## License

[WTFPL](LICENSE) — do what the fuck you want to.
