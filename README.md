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

So **text wants bold and 240px or more.** Weight saturates — `900` renders identically to
`bold` — so past that only size helps. Alternatively raise `sepNear` to shrink the budget,
buying legibility at the cost of depth range; for text, which wants one flat plane anyway,
that is usually the right trade.

**Keep content clear of the left edge.** The leftmost `sepFar` columns have no source
column to copy from, so depth there is discarded and an object gets clipped — a ball at
`x: 80` loses its left 72px and becomes an unfindable crescent. See §10 of the design doc
for the plate/stage split that fixes this properly.

And if a render looks wrong, use `--depth-map`. A stereogram cannot be debugged by eye;
the depth map is the only way to tell an authoring mistake from an encoding one.

## License

[WTFPL](LICENSE) — do what the fuck you want to.
