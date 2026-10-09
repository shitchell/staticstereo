# staticstereo

**Static on the Stereo.**

Generate single-image random-dot stereograms — "Magic Eye" images — as stills *and as
animations*, from declarative scenes built out of text, PNGs, GIFs, shapes, and depth
maps. Usable as a CLI (`stst`) or as a static website from the same core.

Relax your eyes and the noise resolves into pacman eating dots. To anyone watching, you
are staring at television static with great intensity.

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
push to `main`, which needs the repository's Pages source set to "GitHub Actions" once,
by hand.

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

## License

[WTFPL](LICENSE) — do what the fuck you want to.
