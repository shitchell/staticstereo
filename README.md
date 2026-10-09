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
unambiguous match, so it will not fuse no matter how long you stare. Measured stroke
widths in the stock sans:

| weight | size | stroke | fuses? |
|---|---|---|---|
| normal | 90px | 10px | no |
| normal | 150px | 17px | no |
| bold | 240px | 57px | yes |
| bold | 360px | 84px | comfortably |

So **text wants bold and 240px or more.** Past bold, whether a heavier weight helps
depends on your installed fonts: `900` is identical to `bold` on a stack with no 900 face
and ~15% wider on one that has it. Size is the lever that always works. Alternatively raise `sepNear` to shrink the budget,
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
