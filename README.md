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
finished piece is a shareable link. `.github/workflows/pages.yml` publishes it on every
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
  - {type: text,  text: HELLO,   size: 90, depth: 0.6, anim: {kind: marquee, speed: 60}}
  - {type: image, src: ball.png,           depth: 1.0, anim: {kind: bounce, height: 200}}
```

```sh
stst render scene.yaml -o out.gif     # gif, mp4, or a png sequence
stst still --text HELLO -o out.png    # one frame, no scene file
stst preview scene.yaml               # render to a temp file and measure it
stst render scene.yaml -o out.gif --depth-map depth.png   # and the depth map
```

`stst --help` lists the rest. Every stereo parameter (`--sep-far`, `--sep-near`,
`--noise-scale`, `--depth-blur`, `--seed`, `--cross`, `--freeze-noise`) overrides the
scene file, so fusion can be tuned without editing anything.

## Examples

Three scenes in [`examples/`](examples/), all authorable in plain text — no binary art, so
you can read any of them in a diff:

```sh
stst render examples/pacman.yaml         -o pacman.gif   # a wedge, and dots that get eaten
stst render examples/bouncing-ball.yaml  -o ball.gif     # two animators composed on one layer
stst render examples/scrolling-text.yaml -o text.gif     # marquee, wider than the frame
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
measurement. Measured through `@napi-rs/canvas` on **DejaVu Sans**, which is what the Node
adapter resolves `sans-serif` to on a Debian font stack:

| weight | size | median stroke | verdict at an 18px budget |
|---|---|---|---|
| normal | 48px (a scene layer's default) | 6px | will not fuse |
| normal | 90px (`--text`'s default) | 10px | will not fuse |
| normal | 120px | 13px | will not fuse |
| normal | 150px | 16px | will not fuse |
| normal | 170px | 18px | exactly the budget — hard work |
| bold | 90px | 18px | exactly the budget — hard work |
| bold | 150px | 29px | over the budget, under 2× it |
| bold | 240px | 46px | comfortable |
| bold | 360px | 68px | comfortable |

**Neither default fuses, and there are two of them.** A text layer in a scene file that
omits `size:` gets **48px** (`DEFAULT_TEXT_SIZE`) — a 6px stroke, a third of the budget.
`stst still --text HELLO`, which supplies its own, gets **90px** (`TEXT_FONT_SIZE`) — a
10px stroke, just over half. So the one-liner at the top of this file produces something
you cannot fuse unless you ask for more, and the `size: 90` in the snippet above is both a
default *and* too small. Set `size:` and `weight:` deliberately: **bold is the cheapest
lever — 90px bold reaches the budget exactly and 150px bold clears it — and 240px bold
clears it comfortably.**

Those are one family's numbers and the family matters by 10–25%. The same four
regular/bold rows measure 9 / 15 / 35 / 52 px on Liberation Sans and 9 / 14 / 37 / 55 px on
Noto Sans, so treat the table as a scale, not a specification — and note the browser does
its own generic resolution, so the site may be measuring a different face than the CLI.

Past bold, a heavier weight is **synthesised, not selected**. DejaVu Sans and Liberation
Sans each declare only a 400 and a 700 face, and in Chromium `900` is byte-identical to
`bold` in both — same ink count, same pixels. Through `@napi-rs/canvas` the same request
measures 14–19% wider on DejaVu Sans and 13–25% wider on Liberation Sans, because that
rasteriser fakes the weight it cannot find. So `900` buys somewhere between nothing and a
fifth, depending on who is drawing, and nothing in this repo can promise which. Size is
the lever that always works. Alternatively raise `sepNear` to shrink the budget,
buying legibility at the cost of depth range; for text, which wants one flat plane anyway,
that is usually the right trade.

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

## License

[WTFPL](LICENSE) — do what the fuck you want to.
