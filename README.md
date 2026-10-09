# staticstereo

**Static on the Stereo.**

Generate single-image random-dot stereograms — "Magic Eye" images — as stills *and as
animations*, from declarative scenes built out of text, PNGs, GIFs, shapes, and depth
maps. Usable as a CLI (`stst`) or as a static website from the same core.

Relax your eyes and the noise resolves into pacman eating dots. To anyone watching, you
are staring at television static with great intensity.

## Status

**Design stage.** No implementation yet. The approved design is at
[`docs/plans/2026-10-09-staticstereo-design.md`](docs/plans/2026-10-09-staticstereo-design.md),
including the decisions and the rationale behind them.

A Python proof-of-concept — [`docs/poc/sirds.py`](docs/poc/sirds.py) — validated the
algorithm, the depth-edge artifacts, and the codec pitfalls before the design was
written. It is reference prior art, deliberately *not* the basis of the implementation.

## The idea in one paragraph

A horizontal strip of random pixels is repeated across each row, and the repeat *period*
is modulated by a depth map: nearer surfaces get a shorter period. Your eyes fuse the
repeats and read the period difference as parallax. Depth is therefore the *source*
medium, not something recovered from finished imagery — which is why scenes are authored
as depth directly rather than rendered and then analysed.

## Planned shape

```yaml
size: [800, 450]
fps: 12
duration: 4
layers:
  - {type: text,  text: HELLO,   size: 90, depth: 0.6, anim: {kind: marquee, speed: 60}}
  - {type: image, src: ball.png,           depth: 1.0, anim: {kind: bounce, height: 200}}
```

```sh
stst render scene.yaml -o out.gif
stst still --text HELLO -o out.png
stst preview scene.yaml
```

## License

[WTFPL](LICENSE) — do what the fuck you want to.
