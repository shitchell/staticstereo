#!/usr/bin/env python3
"""
SIRDS / Magic Eye generator (POC).

Core idea: for each row, walk left->right and copy the pixel from
`separation` pixels back. Where separation is *smaller*, the repeat period
shrinks and your fused eyes read that as "closer". Columns with no source
yet (x < separation) get fresh random pixels, which seeds the whole row.

Depth convention: 1.0 == nearest to viewer, 0.0 == background.
Viewing: parallel / "wall-eyed" (relax eyes, look through the screen).
Use --cross for cross-eyed viewers.

Subcommands:
    still   depth image (or built-in demo) -> one PNG
    pacman  animated pacman-eats-dots -> GIF + MP4
"""
import argparse
import math
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


# --------------------------------------------------------------------------
# the actual algorithm
# --------------------------------------------------------------------------
def sirds_from_depth(depth, sep_far=110, sep_near=92, rng=None):
    """depth: HxW float in [0,1] (1.0 == nearest). Returns HxW uint8 (0/255).

    sep_far  = repeat period of the background, in pixels
    sep_near = repeat period of the nearest surface
    The gap between them is the total depth budget. Keep it ~10-20% of
    sep_far: more is "deeper" but artifacts explode and fusion gets hard.
    """
    if rng is None:
        rng = np.random.default_rng()
    h, w = depth.shape

    sep = np.rint(sep_far - depth * (sep_far - sep_near)).astype(np.int32)
    sep = np.clip(sep, 2, w - 1)

    out = np.empty((h, w), np.uint8)
    rows = np.arange(h)

    # Column-at-a-time so numpy vectorises over rows. The dependency is
    # strictly leftward (src < x), so this is a legal ordering.
    for x in range(w):
        src = x - sep[:, x]
        col = rng.integers(0, 2, size=h, dtype=np.uint8) * 255
        ok = src >= 0
        col[ok] = out[rows[ok], src[ok]]
        out[:, x] = col
    return out


def render(depth, sep_far, sep_near, noise_scale=1, cross=False, blur=1.0, rng=None):
    """Prep depth, run SIRDS, upscale noise pixels. depth is HxW float [0,1]."""
    if cross:
        depth = 1.0 - depth
    if blur > 0:
        # A soft depth edge turns a hard period jump into a ramp, which
        # kills most of the "echo" streaking to the right of an object.
        d8 = Image.fromarray((depth * 255).astype(np.uint8))
        d8 = d8.filter(ImageFilter.GaussianBlur(blur))
        depth = np.asarray(d8, dtype=np.float32) / 255.0

    img = sirds_from_depth(depth, sep_far, sep_near, rng=rng)
    if noise_scale > 1:
        img = np.repeat(np.repeat(img, noise_scale, axis=0), noise_scale, axis=1)
    return Image.fromarray(img, mode="L")


# --------------------------------------------------------------------------
# depth map sources
# --------------------------------------------------------------------------
def demo_depth(name, w, h):
    if name == "sphere":
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        cx, cy, r = w / 2, h / 2, min(w, h) * 0.35
        rr = ((xx - cx) ** 2 + (yy - cy) ** 2) / (r * r)
        return np.where(rr < 1, np.sqrt(np.clip(1 - rr, 0, 1)), 0.0)
    if name == "rings":
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        d = np.hypot(xx - w / 2, yy - h / 2) / (min(w, h) * 0.45)
        return np.clip(1 - d, 0, 1) * (np.sin(d * 18) * 0.5 + 0.5)
    raise SystemExit(f"unknown demo: {name}")


def pacman_depth(w, h, t, n_dots=9):
    """t in [0,1) -> one frame of depth. Pacman slides right, eating dots."""
    img = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(img)

    R = h * 0.17  # pacman radius
    cy = h * 0.5
    x0, x1 = -R, w + R
    px = x0 + t * (x1 - x0)  # pacman centre x

    dot_r = h * 0.035
    first, last = w * 0.12, w * 0.88
    for i in range(n_dots):
        dx = first + (last - first) * i / (n_dots - 1)
        if dx < px + R * 0.35:  # already eaten
            continue
        d.ellipse([dx - dot_r, cy - dot_r, dx + dot_r, cy + dot_r], fill=160)

    # chomp: mouth half-angle oscillates 2..38 degrees
    m = 2 + 36 * abs(math.sin(t * 2 * math.pi * 6))
    d.pieslice([px - R, cy - R, px + R, cy + R], start=m, end=360 - m, fill=255)

    return np.asarray(img, dtype=np.float32) / 255.0


# --------------------------------------------------------------------------
# cli
# --------------------------------------------------------------------------
def add_common(p):
    p.add_argument("--width", type=int, default=800)
    p.add_argument("--height", type=int, default=450)
    p.add_argument("--sep-far", type=int, default=110)
    p.add_argument("--sep-near", type=int, default=92)
    p.add_argument(
        "--noise-scale",
        type=int,
        default=2,
        help="upscale factor for noise pixels (2 = chunkier, easier to fuse)",
    )
    p.add_argument(
        "--blur",
        type=float,
        default=1.0,
        help="depth-edge softening in px; 0 = hard edges + more streaking",
    )
    p.add_argument(
        "--cross", action="store_true", help="invert depth for cross-eyed viewing"
    )
    p.add_argument("--seed", type=int, default=None)


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = ap.add_subparsers(dest="cmd", required=True)

    ps = sub.add_parser("still", help="one autostereogram PNG")
    add_common(ps)
    ps.add_argument("-o", "--out", default="sirds.png")
    ps.add_argument("--depth", help="grayscale depth image (white = near)")
    ps.add_argument("--demo", default="sphere", choices=["sphere", "rings"])

    pp = sub.add_parser("pacman", help="animated pacman GIF + MP4")
    add_common(pp)
    pp.add_argument("-o", "--out", default="pacman")
    pp.add_argument("--frames", type=int, default=60)
    pp.add_argument("--fps", type=int, default=12)
    pp.add_argument("--loops", type=float, default=1.0, help="passes across the screen")
    pp.add_argument(
        "--freeze-noise",
        action="store_true",
        help="reuse one noise seed every frame: stable, but the "
        "shape becomes visible as motion without fusing",
    )
    pp.add_argument("--no-mp4", action="store_true")

    a = ap.parse_args()
    rng = np.random.default_rng(a.seed)
    kw = dict(
        sep_far=a.sep_far,
        sep_near=a.sep_near,
        noise_scale=a.noise_scale,
        cross=a.cross,
        blur=a.blur,
    )

    if a.cmd == "still":
        if a.depth:
            dm = Image.open(a.depth).convert("L").resize((a.width, a.height))
            depth = np.asarray(dm, dtype=np.float32) / 255.0
        else:
            depth = demo_depth(a.demo, a.width, a.height)
        render(depth, rng=rng, **kw).save(a.out)
        print(f"wrote {a.out}")
        return

    # ---- pacman animation ----
    frames = []
    for i in range(a.frames):
        t = (i / a.frames * a.loops) % 1.0
        depth = pacman_depth(a.width, a.height, t)
        frng = np.random.default_rng(a.seed or 0) if a.freeze_noise else rng
        frames.append(
            render(depth, rng=frng, **kw).convert("P", palette=Image.ADAPTIVE, colors=2)
        )
        print(f"\rframe {i+1}/{a.frames}", end="", file=sys.stderr, flush=True)
    print(file=sys.stderr)

    gif = f"{a.out}.gif"
    frames[0].save(
        gif,
        save_all=True,
        append_images=frames[1:],
        duration=int(1000 / a.fps),
        loop=0,
        optimize=False,
    )
    print(f"wrote {gif}  ({os.path.getsize(gif)/1e6:.1f} MB)")

    if not a.no_mp4:
        mp4 = f"{a.out}.mp4"
        d = os.path.join(os.path.dirname(os.path.abspath(a.out)) or ".", "_frames")
        os.makedirs(d, exist_ok=True)
        for i, f in enumerate(frames):
            f.convert("L").save(os.path.join(d, f"{i:04d}.png"))
        # Random noise is near-incompressible AND lossy chroma/DCT mush
        # destroys the stereo signal. Lossless or near-lossless only.
        cmd = [
            "ffmpeg",
            "-y",
            "-framerate",
            str(a.fps),
            "-i",
            os.path.join(d, "%04d.png"),
            "-c:v",
            "libx264",
            "-qp",
            "0",
            "-preset",
            "veryslow",
            "-pix_fmt",
            "yuv444p",
            mp4,
        ]
        r = subprocess.run(cmd, capture_output=True)
        if r.returncode:
            print(r.stderr.decode()[-1500:], file=sys.stderr)
        else:
            print(f"wrote {mp4}  ({os.path.getsize(mp4)/1e6:.1f} MB, lossless x264)")
        for f in os.listdir(d):
            os.remove(os.path.join(d, f))
        os.rmdir(d)


if __name__ == "__main__":
    main()
