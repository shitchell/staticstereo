---
title: staticstereo — implementation plan
description: Task-by-task TDD plan building the isomorphic core, Node adapters, CLI, and static site
status: ready to execute
date: 2026-10-09
tags: [staticstereo, implementation, plan, typescript, tdd]
---

# staticstereo Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. The design it implements is
> `docs/plans/2026-10-09-staticstereo-design.md` — read that first; it carries the
> rationale, and several decisions below look arbitrary without it.

**Goal:** Generate animated single-image random-dot stereograms from declarative scenes,
driven identically by a CLI (`stst`) and a static website.

**Architecture:** A zero-dependency isomorphic `core` (SIRDS algorithm, scene model,
keyframe animation, depth rasterisation) with platform adapters injected into it. `core`
never imports a canvas, a filesystem, or an encoder — it accepts a `CanvasLike` and
returns typed arrays. Node supplies `@napi-rs/canvas` + ffmpeg; the browser supplies
`OffscreenCanvas` + `gifenc`.

**Tech Stack:** TypeScript (ESM, `node16` resolution), vitest, `@napi-rs/canvas`,
`gifenc`, `omggif`, ffmpeg (external binary), GitHub Actions + Pages.

---

## Verified environment facts

These were measured on this machine on 2026-10-09. Do not re-litigate them; do not
substitute alternatives without re-testing.

| Fact | Value |
|---|---|
| node / npm | v22.14.0 / 10.9.2 (pnpm also present) |
| ffmpeg | 8.0.1 — supports `libx264 -qp 0 -pix_fmt yuv444p` |
| `@napi-rs/canvas` | installs clean, no system libs; `fillText`, `measureText`, `getImageData` all verified working |
| `skia-canvas` | also works; **rejected** — bundles a full Skia, heavier, no benefit here |
| `gifenc` | works, but is a **dual-package hazard** — see below. Do not use a default import. |
| `omggif` | works; exposes `GifReader` as a proper named import. **Decoding needs the disposal model, not a buffer clear** — see below. |

**GIF timing quantisation (measured):** `gifenc` delays round to 10ms units per the GIF
spec. Requesting `delay: 83` (12fps) reads back as 80ms, i.e. 12.5fps. Prefer fps values
that divide 100 — 10, 12.5, 20, 25 — or accept the rounding. Assert on 80, not 83.

### `gifenc` is a dual-package hazard — read this before importing it

An earlier revision of this plan said "ships CommonJS, use a default import". That is
**correct under Node and backwards under every bundler.** `gifenc` ships a CJS `main` and
an ESM `module` with no `exports` map, so the same source line resolves to two different
things. Measured on this machine:

| import form | Node (CJS `main`) | Vite / vitest / esbuild (ESM `module`) |
|---|---|---|
| `import g from 'gifenc'` | namespace object; `g.GIFEncoder` is a function | **`GIFEncoder` itself**; `g.GIFEncoder` is `undefined` |
| `import { quantize } from 'gifenc'` | SyntaxError at link time | works |
| `import * as ns from 'gifenc'` | `{ default }` only | full namespace |

**The trap is the test suite, not the import.** vitest resolves through Vite, so it only
ever exercises the bundler half. A Node-correct default import therefore stays *green in
CI* while the shipped CLI is broken, and a bundler-correct named import stays green in CI
while failing the moment the CLI runs. Neither failure is visible from the suite alone.

Use a namespace import plus a one-line shape probe, and pin **both** directions with
tests. `src/node/encode.ts` already has a working shim — **reuse it rather than
rediscovering this.** Verify any change to it by deliberately breaking it each way and
confirming each break turns something red.

### `omggif` decoding needs the GIF disposal model

An earlier revision said "clear the buffer per frame or earlier frames bleed through."
**That is one-directional, and the fix it implies is a second bug.**

`decodeAndBlitFrameRGBA` writes only the frame's subrect and skips transparent pixels, so
the buffer *is* the compositing canvas. Optimised GIFs — which is what `gifsicle` and
ffmpeg emit, i.e. most real-world GIFs — are partial-frame and rely on the previous frame
showing through. Clearing per frame renders them full of holes.

The GIF spec specifies the behaviour per frame via the **disposal method**, and `omggif`
does not act on it: `0`/`1` keep the previous canvas, `2` clear the frame's rect to
background, `3` restore the pre-frame snapshot. `src/node/canvas.ts` implements this with
a fresh output buffer per frame and fixtures pinning both failure directions.

---

## Phase 0 — Scaffold

### Task 0: Project skeleton

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`

**Step 1: Write `package.json`**

```json
{
  "name": "staticstereo",
  "version": "0.0.0",
  "description": "Static on the Stereo — animated autostereogram generator",
  "type": "module",
  "license": "MIT",
  "bin": { "stst": "./dist/cli/index.js" },
  "exports": {
    ".": "./dist/core/index.js",
    "./node": "./dist/node/index.js",
    "./web": "./dist/web/index.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@napi-rs/canvas": "^0.1",
    "gifenc": "^1",
    "omggif": "^1"
  },
  "devDependencies": {
    "@types/node": "^22",
    "typescript": "^5",
    "vitest": "^2"
  }
}
```

Note the `exports` map is what keeps `@napi-rs/canvas` out of a browser bundle: the web
build imports `staticstereo` (core only), never `staticstereo/node`.

**Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "node16",
    "moduleResolution": "node16",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2022", "DOM"],
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`"lib": ["DOM"]` is needed for `CanvasRenderingContext2D` types in `core` even though
core never *imports* a canvas. `noUncheckedIndexedAccess` is deliberate — this codebase
is dense with typed-array indexing and it catches real off-by-ones.

> **Superseded as built.** This config has since been split in two: `tsconfig.json` adds
> `"exclude": ["**/*.test.ts", "src/core/testing/**"]` for the build, and typecheck moved
> to `tsconfig.typecheck.json`, which re-includes them. Build and typecheck want opposite
> things — shipping tests in `dist` is wrong, and *not* type-checking them loses real
> errors. The block above is kept as the historical record of Task 0.

**Step 3: `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } })
```

**Step 4: `.gitignore`**

```
node_modules/
dist/
dist-site/
*.log
```

**Step 5: Install and verify the toolchain**

Run: `npm install && npm run typecheck`
Expected: installs cleanly; typecheck passes trivially (no source yet).

**Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold TypeScript project"
```

---

## Phase 1 — Core

Tasks 1, 2, and 3 are **independent of each other** once Task 1's types exist. Task 2
(the algorithm) does not even need the types — it takes a `Float32Array`. Dispatch 2 and
3 in parallel.

### Task 1: Scene types and the seeded PRNG

**Files:**
- Create: `src/core/types.ts`, `src/core/rng.ts`, `src/core/rng.test.ts`

**Step 1: Write `src/core/types.ts`** (types only — no runtime code)

```ts
/** 0 = background, 1 = nearest to viewer. */
export type Depth = number

export interface StereoOpts {
  /** Repeat period of the background, in px. */
  sepFar: number
  /** Repeat period of the nearest surface, in px. Must be < sepFar. */
  sepNear: number
  /** Nearest-neighbour upscale of noise pixels. 2 fuses more easily than 1. */
  noiseScale: number
  /** Invert depth for cross-eyed viewers. */
  cross: boolean
  seed: number
}

export const DEFAULT_STEREO: StereoOpts = {
  sepFar: 110, sepNear: 92, noiseScale: 2, cross: false, seed: 0,
}

export interface Transform {
  x: number; y: number; depth: number; scale: number; rotate: number
}

export const IDENTITY: Transform = { x: 0, y: 0, depth: 0, scale: 1, rotate: 0 }

/** A keyframe. `t` is normalised 0..1 within the track's own window. */
export type Key = { t: number } & Partial<Omit<Transform, never>>

export type Easing =
  | 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'easeOutBounce'

export interface Track {
  keys: Key[]
  ease?: Easing
  repeat?: 'once' | 'loop' | 'pingpong'
  /** Seconds. Defaults to the whole scene. */
  start?: number
  duration?: number
}

/** Preset sugar. Compiles to a Track. */
export interface Preset { kind: string; [param: string]: unknown }

export type Anim = Track | Preset | (Track | Preset)[]

export type MaskSource = 'alpha' | { luma: number }

interface LayerBase {
  depth?: Depth
  at?: [number, number]
  anim?: Anim
}

export type Layer = LayerBase & (
  | { type: 'text'; text: string; size?: number; font?: string; weight?: string }
  | { type: 'image'; src: string; mode?: 'silhouette' | 'heightmap'; mask?: MaskSource }
  | { type: 'gif'; src: string; loop?: 'loop' | 'once' | 'pingpong'; mask?: MaskSource }
  | { type: 'shape'; shape: 'circle' | 'rect'; r?: number; w?: number; h?: number }
  | { type: 'draw'; fn: string }
)

export interface Scene {
  size: [number, number]
  fps?: number
  /** Seconds. Omit for a still. */
  duration?: number
  stereo?: Partial<StereoOpts>
  layers: Layer[]
}
```

**Step 2: Write the failing PRNG test — `src/core/rng.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { makeRng } from './rng.js'

describe('makeRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(7), b = makeRng(7)
    const seqA = Array.from({ length: 8 }, () => a())
    const seqB = Array.from({ length: 8 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('differs across seeds', () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)())
  })

  it('stays in [0, 1)', () => {
    const r = makeRng(3)
    for (let i = 0; i < 2000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('is roughly balanced around 0.5 (sanity, not a statistics suite)', () => {
    const r = makeRng(11)
    let lo = 0
    for (let i = 0; i < 10_000; i++) if (r() < 0.5) lo++
    expect(lo).toBeGreaterThan(4700)
    expect(lo).toBeLessThan(5300)
  })
})
```

**Step 3: Run it and watch it fail**

Run: `npx vitest run src/core/rng.test.ts`
Expected: FAIL — cannot resolve `./rng.js`.

**Step 4: Implement `src/core/rng.ts`**

```ts
/**
 * mulberry32 — small, fast, deterministic, good enough for dot fields.
 * Determinism is load-bearing: it makes `freezeNoise` reproducible and makes
 * every stereo test stable.
 */
export function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 0x9e3779b9
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
```

**Step 5: Verify pass**

Run: `npx vitest run src/core/rng.test.ts` → 4 passing.

**Step 6: Commit**

```bash
git add -A && git commit -m "feat(core): scene types and deterministic PRNG"
```

---

### Task 2: The SIRDS algorithm

This is the heart of the project. **It must be test-driven with the autocorrelation
assertion**, not with a golden image — a golden image of noise only tests the PRNG.

**Files:**
- Create: `src/core/sirds.ts`, `src/core/sirds.test.ts`, `src/core/analysis.ts`

**Step 1: Write `src/core/analysis.ts`** — the measurement tool the tests depend on

```ts
/**
 * Find the horizontal repeat period that best explains a row of pixels.
 *
 * This is how a stereogram is verified: the period IS the encoded depth.
 * A row over background should return sepFar * noiseScale; a row over the
 * nearest surface should return sepNear * noiseScale.
 */
export function dominantPeriod(
  row: ArrayLike<number>, lo: number, hi: number,
): { period: number; score: number } {
  let bestScore = -1
  let bestPeriod = lo
  for (let p = lo; p <= hi; p++) {
    let matches = 0
    const n = row.length - p
    if (n <= 0) break
    for (let i = 0; i < n; i++) if (row[i] === row[i + p]) matches++
    const score = matches / n
    if (score > bestScore) { bestScore = score; bestPeriod = p }
  }
  return { period: bestPeriod, score: bestScore }
}

/** Extract row `y` from a width-`w` greyscale buffer. */
export function rowOf(buf: ArrayLike<number>, w: number, y: number): number[] {
  const out = new Array<number>(w)
  for (let x = 0; x < w; x++) out[x] = buf[y * w + x]!
  return out
}
```

**Step 2: Write the failing test — `src/core/sirds.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { sirdsFromDepth, upscale } from './sirds.js'
import { dominantPeriod, rowOf } from './analysis.js'
import { DEFAULT_STEREO } from './types.js'

const W = 800, H = 200

/** Depth map: a flat slab at depth 1.0 spanning x in [300, 500), else 0. */
function slab(): Float32Array {
  const d = new Float32Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 300; x < 500; x++) d[y * W + x] = 1
  return d
}

describe('sirdsFromDepth', () => {
  const o = { ...DEFAULT_STEREO, noiseScale: 1, seed: 7 }

  it('encodes background depth as the sepFar repeat period', () => {
    const img = sirdsFromDepth(slab(), W, H, o)
    const row = rowOf(img, W, H / 2).slice(0, 250)   // entirely background
    const { period, score } = dominantPeriod(row, 80, 140)
    expect(period).toBe(o.sepFar)
    expect(score).toBe(1)          // background is an exact wallpaper repeat
  })

  it('encodes near depth as the sepNear repeat period', () => {
    const img = sirdsFromDepth(slab(), W, H, o)
    // Window fully inside the slab, offset past its leading edge so the
    // shorter period has room to establish itself.
    const row = rowOf(img, W, H / 2).slice(300, 500)
    const { period } = dominantPeriod(row, 80, 140)
    expect(period).toBe(o.sepNear)
  })

  it('produces a different period inside the object than outside', () => {
    const img = sirdsFromDepth(slab(), W, H, o)
    const bg = dominantPeriod(rowOf(img, W, H / 2).slice(0, 250), 80, 140).period
    const fg = dominantPeriod(rowOf(img, W, H / 2).slice(300, 500), 80, 140).period
    expect(fg).toBeLessThan(bg)    // nearer == shorter period
  })

  it('is deterministic for a fixed seed', () => {
    const a = sirdsFromDepth(slab(), W, H, o)
    const b = sirdsFromDepth(slab(), W, H, o)
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('changes with the seed', () => {
    const a = sirdsFromDepth(slab(), W, H, { ...o, seed: 1 })
    const b = sirdsFromDepth(slab(), W, H, { ...o, seed: 2 })
    expect(Array.from(a)).not.toEqual(Array.from(b))
  })

  it('emits only two pixel values', () => {
    const img = sirdsFromDepth(slab(), W, H, o)
    expect([...new Set(img)].sort((p, q) => p - q)).toEqual([0, 255])
  })

  it('cross mode inverts which region is nearer', () => {
    const img = sirdsFromDepth(slab(), W, H, { ...o, cross: true })
    const bg = dominantPeriod(rowOf(img, W, H / 2).slice(0, 250), 80, 140).period
    const fg = dominantPeriod(rowOf(img, W, H / 2).slice(300, 500), 80, 140).period
    expect(fg).toBeGreaterThan(bg)   // inverted: the slab is now further away
  })
})

describe('upscale', () => {
  it('scales both axes by nearest neighbour', () => {
    const src = new Uint8Array([0, 255, 255, 0])          // 2x2
    const out = upscale(src, 2, 2, 2)                      // -> 4x4
    expect(out.length).toBe(16)
    expect(Array.from(out.slice(0, 4))).toEqual([0, 0, 255, 255])
    expect(Array.from(out.slice(4, 8))).toEqual([0, 0, 255, 255])
  })

  it('multiplies the encoded period by the scale factor', () => {
    const o = { ...DEFAULT_STEREO, noiseScale: 2, seed: 7 }
    const img = sirdsFromDepth(slab(), W, H, o)
    const big = upscale(img, W, H, 2)
    const row = rowOf(big, W * 2, H).slice(0, 500)
    expect(dominantPeriod(row, 180, 260).period).toBe(o.sepFar * 2)
  })
})
```

**Step 3: Run and watch it fail**

Run: `npx vitest run src/core/sirds.test.ts`
Expected: FAIL — `./sirds.js` does not exist.

**Step 4: Implement `src/core/sirds.ts`**

```ts
import { makeRng } from './rng.js'
import type { StereoOpts } from './types.js'

/**
 * Turn a depth map into a random-dot stereogram.
 *
 * Each row is walked left to right, copying the pixel from `sep` px back.
 * `sep` shrinks as depth approaches 1, and your fused eyes read that shorter
 * repeat period as "nearer". Columns with no source yet (x < sep) seed the row
 * with fresh random pixels.
 *
 * Row-major is both correct and cache-friendly: within a row the dependency is
 * strictly leftward, so `out[y*w + (x-sep)]` is always already written.
 *
 * @param depth row-major, length w*h, values 0..1 (1 = nearest)
 * @returns row-major greyscale, length w*h, values 0 or 255
 */
export function sirdsFromDepth(
  depth: Float32Array, w: number, h: number, o: StereoOpts,
): Uint8Array {
  const rnd = makeRng(o.seed)
  const out = new Uint8Array(w * h)
  const range = o.sepFar - o.sepNear
  const maxSep = w - 1

  for (let y = 0; y < h; y++) {
    const base = y * w
    for (let x = 0; x < w; x++) {
      const i = base + x
      let z = depth[i]!
      if (o.cross) z = 1 - z
      if (z < 0) z = 0
      else if (z > 1) z = 1

      let sep = Math.round(o.sepFar - z * range)
      if (sep < 2) sep = 2
      else if (sep > maxSep) sep = maxSep

      const src = x - sep
      out[i] = src >= 0 ? out[base + src]! : (rnd() < 0.5 ? 0 : 255)
    }
  }
  return out
}

/** Nearest-neighbour upscale. Chunkier noise pixels fuse more easily. */
export function upscale(
  src: Uint8Array, w: number, h: number, n: number,
): Uint8Array {
  if (n === 1) return src
  const W = w * n
  const out = new Uint8Array(W * h * n)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = src[y * w + x]!
      for (let dy = 0; dy < n; dy++) {
        const rowStart = (y * n + dy) * W + x * n
        for (let dx = 0; dx < n; dx++) out[rowStart + dx] = v
      }
    }
  }
  return out
}
```

**Step 5: Verify pass**

Run: `npx vitest run src/core/sirds.test.ts`
Expected: 9 passing. If the `sepNear` test fails by 1–2px, the window is probably
straddling the slab edge — move it inward, do **not** loosen the assertion to a range.

**Step 6: Commit**

```bash
git add -A && git commit -m "feat(core): SIRDS algorithm with autocorrelation tests"
```

---

### Task 3: Animation engine

Independent of Tasks 2 and 4. Only needs `types.ts`.

**Files:**
- Create: `src/core/anim/easing.ts`, `src/core/anim/track.ts`,
  `src/core/anim/presets.ts`, `src/core/anim/index.ts`
- Create: `src/core/anim/track.test.ts`, `src/core/anim/presets.test.ts`

**Step 1: Write the failing track test — `src/core/anim/track.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { evalTrack, composeAnim } from './track.js'
import { IDENTITY } from '../types.js'

describe('evalTrack', () => {
  const tr = { keys: [{ t: 0, x: 0 }, { t: 1, x: 100 }] }

  it('returns the first key at t=0', () => {
    expect(evalTrack(tr, 0, 1).x).toBe(0)
  })

  it('interpolates linearly at the midpoint', () => {
    expect(evalTrack(tr, 0.5, 1).x).toBeCloseTo(50)
  })

  it('returns the last key at t=1', () => {
    expect(evalTrack(tr, 1, 1).x).toBe(100)
  })

  it('leaves unspecified channels at identity', () => {
    const r = evalTrack(tr, 0.5, 1)
    expect(r.y).toBe(IDENTITY.y)
    expect(r.scale).toBe(IDENTITY.scale)
  })

  it('interpolates each channel independently', () => {
    const t2 = { keys: [{ t: 0, x: 0, depth: 0 }, { t: 1, x: 10, depth: 1 }] }
    const r = evalTrack(t2, 0.25, 1)
    expect(r.x).toBeCloseTo(2.5)
    expect(r.depth).toBeCloseTo(0.25)
  })

  it('clamps past the end when repeat is "once"', () => {
    expect(evalTrack({ ...tr, repeat: 'once' }, 1.5, 1).x).toBe(100)
  })

  it('wraps when repeat is "loop"', () => {
    expect(evalTrack({ ...tr, repeat: 'loop' }, 1.25, 1).x).toBeCloseTo(25)
  })

  it('reverses on alternate cycles when repeat is "pingpong"', () => {
    expect(evalTrack({ ...tr, repeat: 'pingpong' }, 1.25, 1).x).toBeCloseTo(75)
  })

  it('honours start and duration windows', () => {
    const windowed = { keys: [{ t: 0, x: 0 }, { t: 1, x: 100 }], start: 1, duration: 2 }
    expect(evalTrack(windowed, 0.5, 4).x).toBe(0)      // before start -> first key
    expect(evalTrack(windowed, 2.0, 4).x).toBeCloseTo(50)
    expect(evalTrack(windowed, 3.5, 4).x).toBe(100)    // after end -> last key
  })
})

describe('composeAnim', () => {
  it('sums translations and multiplies scales', () => {
    const r = composeAnim([
      { keys: [{ t: 0, x: 10, scale: 2 }] },
      { keys: [{ t: 0, x: 5, scale: 3 }] },
    ], 0, 1)
    expect(r.x).toBe(15)
    expect(r.scale).toBe(6)
  })

  it('returns identity for an empty or absent anim', () => {
    expect(composeAnim(undefined, 0, 1)).toEqual(IDENTITY)
    expect(composeAnim([], 0, 1)).toEqual(IDENTITY)
  })

  it('accepts a bare track as well as a list', () => {
    expect(composeAnim({ keys: [{ t: 0, x: 4 }] }, 0, 1).x).toBe(4)
  })
})
```

**Step 2: Run and watch it fail.** `npx vitest run src/core/anim/` → module not found.

**Step 3: Implement `src/core/anim/easing.ts`**

```ts
import type { Easing } from '../types.js'

export const EASINGS: Record<Easing, (t: number) => number> = {
  linear: t => t,
  easeIn: t => t * t,
  easeOut: t => 1 - (1 - t) * (1 - t),
  easeInOut: t => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
  easeOutBounce: t => {
    const n = 7.5625, d = 2.75
    if (t < 1 / d) return n * t * t
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375
    return n * (t -= 2.625 / d) * t + 0.984375
  },
}
```

**Step 4: Implement `src/core/anim/track.ts`**

```ts
import { EASINGS } from './easing.js'
import { IDENTITY } from '../types.js'
import type { Anim, Key, Track, Transform } from '../types.js'

const CHANNELS = ['x', 'y', 'depth', 'scale', 'rotate'] as const
type Channel = typeof CHANNELS[number]

/** Map wall-clock seconds to this track's normalised local time, honouring repeat. */
function localTime(tr: Track, seconds: number, sceneDuration: number): number {
  const start = tr.start ?? 0
  const dur = tr.duration ?? Math.max(sceneDuration - start, 1e-9)
  let u = (seconds - start) / dur
  const repeat = tr.repeat ?? 'once'
  if (repeat === 'loop') {
    u = u - Math.floor(u)
  } else if (repeat === 'pingpong') {
    const cycle = Math.floor(u)
    const frac = u - cycle
    u = cycle % 2 === 0 ? frac : 1 - frac
  }
  return u < 0 ? 0 : u > 1 ? 1 : u
}

/** Value of one channel at normalised time u, or undefined if no key sets it. */
function channelAt(keys: Key[], ch: Channel, u: number, ease: Easing): number | undefined {
  const pts = keys
    .filter(k => k[ch] !== undefined)
    .sort((a, b) => a.t - b.t)
  if (pts.length === 0) return undefined
  if (pts.length === 1 || u <= pts[0]!.t) return pts[0]![ch]
  const last = pts[pts.length - 1]!
  if (u >= last.t) return last[ch]

  let i = 0
  while (i < pts.length - 1 && pts[i + 1]!.t < u) i++
  const a = pts[i]!, b = pts[i + 1]!
  const span = b.t - a.t
  const local = span <= 0 ? 0 : (u - a.t) / span
  const e = EASINGS[ease](local)
  return a[ch]! + (b[ch]! - a[ch]!) * e
}

/** Evaluate a single track at `seconds` into a scene of `sceneDuration` seconds. */
export function evalTrack(tr: Track, seconds: number, sceneDuration: number): Transform {
  const u = localTime(tr, seconds, sceneDuration)
  const ease = tr.ease ?? 'linear'
  const out: Transform = { ...IDENTITY }
  for (const ch of CHANNELS) {
    const v = channelAt(tr.keys, ch, u, ease)
    if (v !== undefined) out[ch] = v
  }
  return out
}

function isTrack(a: Track | { kind: string }): a is Track {
  return 'keys' in a
}

/**
 * Compose one or many animators into a single transform.
 * Translations/rotations sum; scales multiply; depth sums (then the caller clamps).
 * This is what makes [marquee, bob] work without a marquee-with-bob preset.
 */
export function composeAnim(
  anim: Anim | undefined, seconds: number, sceneDuration: number,
  compile: (p: { kind: string }) => Track = () => ({ keys: [] }),
): Transform {
  if (!anim) return { ...IDENTITY }
  const list = Array.isArray(anim) ? anim : [anim]
  if (list.length === 0) return { ...IDENTITY }

  const acc: Transform = { ...IDENTITY }
  for (const item of list) {
    const tr = isTrack(item) ? item : compile(item)
    const t = evalTrack(tr, seconds, sceneDuration)
    acc.x += t.x
    acc.y += t.y
    acc.depth += t.depth
    acc.rotate += t.rotate
    acc.scale *= t.scale
  }
  return acc
}
```

**Step 5: Verify, then write the preset test — `src/core/anim/presets.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { compilePreset, PRESETS } from './presets.js'
import { evalTrack } from './track.js'

const ctx = { sceneW: 800, sceneH: 450, contentW: 1200, contentH: 90 }

describe('presets', () => {
  it('registers the v1 set', () => {
    expect(Object.keys(PRESETS).sort()).toEqual(
      ['bob', 'bounce', 'emerge', 'marquee', 'slide', 'slide-in'],
    )
  })

  it('marquee carries over-wide content fully off the left edge', () => {
    // 1200px of text across an 800px viewport must end at -1200, not 0,
    // or the tail never leaves the frame.
    const tr = compilePreset({ kind: 'marquee', speed: 100 }, ctx)
    const end = evalTrack({ ...tr, repeat: 'once' }, 1e6, 1)
    expect(end.x).toBeLessThanOrEqual(-ctx.contentW)
  })

  it('marquee starts fully off the right edge', () => {
    const tr = compilePreset({ kind: 'marquee', speed: 100 }, ctx)
    expect(evalTrack(tr, 0, 1).x).toBeGreaterThanOrEqual(ctx.sceneW)
  })

  it('marquee loops by default', () => {
    expect(compilePreset({ kind: 'marquee' }, ctx).repeat).toBe('loop')
  })

  it('emerge animates depth from 0 and never touches opacity', () => {
    const tr = compilePreset({ kind: 'emerge', to: 1 }, ctx)
    expect(evalTrack(tr, 0, 1).depth).toBe(0)
    expect(evalTrack(tr, 1, 1).depth).toBeCloseTo(1)
    expect(JSON.stringify(tr)).not.toContain('opacity')
  })

  it('bounce returns to its start height', () => {
    const tr = compilePreset({ kind: 'bounce', height: 200 }, ctx)
    expect(evalTrack(tr, 0, 1).y).toBeCloseTo(evalTrack(tr, 1, 1).y)
  })

  it('throws a helpful error for an unknown preset', () => {
    expect(() => compilePreset({ kind: 'nope' }, ctx))
      .toThrow(/unknown animation preset "nope"/i)
  })
})
```

**Step 6: Implement `src/core/anim/presets.ts`**

Registry shape — `PRESETS: Record<string, (p, ctx) => Track>`. `ctx` carries
`{ sceneW, sceneH, contentW, contentH }` so `marquee` can use measured content width.
Required behaviours, each pinned by a test above:

- `slide` — `from`/`to` as `[x,y]` pairs, once.
- `slide-in` — `from: 'left'|'right'|'top'|'bottom'`, enters to rest at 0, once, `easeOut`.
- `marquee` — `x` from `+sceneW` to `-contentW`, `repeat: 'loop'`, duration from
  `speed` (px/sec).
- `emerge` — `depth` 0 → `to ?? 1`, once, `easeOut`.
- `bounce` — `y` 0 → `-height` → 0, `easeOutBounce`, loop.
- `bob` — small sinusoid-ish `y` wobble via 3 keys, pingpong.

`compilePreset` must throw `unknown animation preset "<kind>"` listing valid kinds —
a silent no-op here produces a motionless scene with no error, which is miserable to debug.

**Step 7: Export from `src/core/anim/index.ts`, verify all tests, commit**

```bash
npx vitest run src/core/anim/
git add -A && git commit -m "feat(core): keyframe animation engine and v1 presets"
```

---

### Task 4: Depth rasteriser

Depends on Tasks 1 and 3. **This is where the compositing trap lives.**

**Files:**
- Create: `src/core/raster.ts`, `src/core/raster.test.ts`, `src/core/canvaslike.ts`

**Step 1: Define the injected surface — `src/core/canvaslike.ts`**

```ts
/**
 * The minimum canvas surface `core` needs. Node passes @napi-rs/canvas,
 * the browser passes OffscreenCanvas. `core` imports neither.
 */
export interface Ctx2D {
  canvas: { width: number; height: number }
  save(): void
  restore(): void
  clearRect(x: number, y: number, w: number, h: number): void
  fillRect(x: number, y: number, w: number, h: number): void
  translate(x: number, y: number): void
  rotate(a: number): void
  scale(x: number, y: number): void
  beginPath(): void
  arc(x: number, y: number, r: number, a0: number, a1: number): void
  fill(): void
  fillText(text: string, x: number, y: number): void
  measureText(text: string): { width: number }
  drawImage(img: unknown, x: number, y: number, w?: number, h?: number): void
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray }
  fillStyle: string
  font: string
  globalAlpha: number
}

export interface CanvasLike {
  /** Must return a context whose backing store is w x h. */
  make(w: number, h: number): Ctx2D
  /** Decode an image path/URL to something drawImage accepts. */
  loadImage(src: string): Promise<{ width: number; height: number } & object>
  /** Decode an animated GIF to RGBA frames. */
  loadGif(src: string): Promise<{
    width: number; height: number
    frames: { rgba: Uint8Array; delayMs: number }[]
  }>
}
```

**Step 2: Write the failing raster test — `src/core/raster.test.ts`**

Use a tiny fake `CanvasLike` backed by a plain `Uint8ClampedArray` so core tests need
no native canvas. The fake only has to support `fillRect` and `getImageData` for these
assertions — write it in the test file.

```ts
import { describe, it, expect } from 'vitest'
import { rasterDepth } from './raster.js'
import type { Scene } from './types.js'

// Minimal fake: records fillRect into an RGBA buffer. Enough for compositing tests.
function fakeCanvas() { /* implement per Ctx2D: fillRect + getImageData + no-op rest */ }

describe('rasterDepth compositing', () => {
  it('never blends two overlapping depths into an intermediate value', async () => {
    // THE REGRESSION TEST. A layer at 1.0 over a layer at 0.6 must read 1.0,
    // never ~0.8. If this fails, someone replaced max-compositing with alpha
    // blending — see the design doc, section 2.1.
    const scene: Scene = {
      size: [40, 10],
      layers: [
        { type: 'shape', shape: 'rect', at: [0, 0], w: 40, h: 10, depth: 0.6 },
        { type: 'shape', shape: 'rect', at: [0, 0], w: 40, h: 10, depth: 1.0 },
      ],
    }
    const d = await rasterDepth(scene, 0, fakeCanvas() as never)
    for (const v of d) {
      expect(v).not.toBeGreaterThan(0.61 + 1e-6)   // ...unless it is 1.0
      // i.e. assert every pixel is ~0.6 or ~1.0, and nothing in between:
    }
    const bad = Array.from(d).filter(v => v > 0.65 && v < 0.95)
    expect(bad).toHaveLength(0)
  })

  it('returns background 0 where no layer draws', async () => { /* ... */ })
  it('clamps depth into [0,1] after animator depth offsets', async () => { /* ... */ })
  it('places a silhouette layer at one flat depth', async () => { /* ... */ })
  it('maps luminance to depth in heightmap mode', async () => { /* ... */ })
  it('applies the composed animator transform to layer position', async () => { /* ... */ })
  it('selects the right gif frame for a given time and loop mode', async () => { /* ... */ })
})
```

Note the first test's intent: assert every pixel is *either* ≈0.6 or ≈1.0 and that the
`(0.65, 0.95)` band is empty. Do not weaken it to `toBeLessThanOrEqual(1)`, which passes
under the exact bug it exists to catch.

**Step 3–5: Implement `rasterDepth`**

```
rasterDepth(scene, seconds, canvas) -> Float32Array (length w*h, values 0..1)

for each layer:
  1. compose its animators -> Transform  (composeAnim + compilePreset)
  2. draw the layer's MASK into a scratch context, white on black, applying
     at[] + transform. Text uses measureText for the marquee ctx.
  3. read the mask back via getImageData, take one channel /255 -> 0..1
  4. resolve the layer's depth:
       silhouette  -> constant (layer.depth ?? 1) + transform.depth
       heightmap   -> per-pixel luminance of the source image
  5. composite:  depth[i] = max(depth[i], layerDepth * mask[i])
  6. clamp to [0,1]
```

Step 5 is the whole point. Antialiased mask edges become a sub-1.0 multiplier, which
yields a ~1px depth ramp against the background — the artifact mitigation the POC needed
an explicit blur pass for. Against another layer, `max` picks the nearer, so no
nonsense middle value appears.

Image → depth mode resolution (per the design):
- `layer.mode` set → obey it.
- else alpha channel has any pixel with `a < 255` → `silhouette` with `mask: 'alpha'`.
- else → `heightmap`.
- `mask: {luma: t}` → mask is `luminance >= t`, used for opaque art.

**Step 6: Commit**

```bash
git add -A && git commit -m "feat(core): depth rasteriser with max-compositing"
```

---

### Task 5: Core render pipeline + public API

**Files:** `src/core/render.ts`, `src/core/render.test.ts`, `src/core/index.ts`

Compose the pieces: `renderFrame(scene, seconds, canvas)` → `rasterDepth` →
`sirdsFromDepth` → `upscale` → `{ pixels, width, height }`. Plus
`frameTimes(scene)` → `number[]` from `fps`/`duration`, and `renderFrames()` as an async
generator so neither the CLI nor the browser has to hold every frame in memory.

Tests: a still scene yields one frame; `fps: 12, duration: 2` yields 24 frames; the
`freezeNoise` flag makes frame 0 and frame 5 share their background noise while a
moving layer still moves; without it they differ.

`src/core/index.ts` re-exports the public surface. **Nothing in `src/core/` may import
from `src/node/` or `src/web/`** — that is the only thing keeping the browser bundle
clean, so it needs a test.

**The purity test must parse import specifiers, not grep raw text.** An earlier revision
of this plan said to grep `dist/core` for `@napi-rs`. That was wrong twice over, both
verified by building: `dist/core` contains `@napi-rs` hits that are all *comments* in
docblocks, so the grep would fail on correct code; and the one genuine non-relative import
leaking in was `vitest`, which the grep would never have found. Assert instead that every
import specifier under `dist/core` begins with `.` **and that each relative target
resolves inside `dist/core`** — "begins with a dot" alone permits `../shared/`, which now
exists, so `core → shared → node` would slip through.

(`tsconfig.json` now excludes `**/*.test.ts` from the build, with typecheck moved to
`tsconfig.typecheck.json`, which includes them. Before that split all nine test files
compiled into `dist`, and `files: ["dist"]` would have published them.)

Three things this task must wire up that did not exist when it was written:

- **`depthBlur`** — `src/core/blur.ts` provides `blurDepth`. Apply it between
  `rasterDepth` and `sirdsFromDepth`, never inside the rasteriser, so the compositing
  invariant stays exactly testable on unblurred output (design §2.2).
- **`noiseScale` exactly once** — `sirdsFromDepth` takes `SirdsOpts`, which deliberately
  cannot carry it. The pipeline is the single place `upscale` is called; a forgotten or
  doubled call silently halves or doubles every measured period.
- **`RasterCache`** — `rasterDepth` takes an optional one. Pass a single cache across all
  frames, or a 48-frame render re-decodes every asset 48 times.

Stills must honour the §4.1 policy: an absent `duration` is 1 second, never 0, and a still
samples the scene **midpoint** by default — sampling t=0 renders a `marquee` scene
completely empty.

Commit: `feat(core): frame render pipeline and public API`

---

## Phase 2 — Adapters

Tasks 6 and 8 are independent; dispatch in parallel. Task 7 depends on 6.

### Task 6: Node adapter

**Files:** `src/node/canvas.ts`, `src/node/encode.ts`, `src/node/index.ts`, + tests

- `nodeCanvas(): CanvasLike` over `@napi-rs/canvas`. `loadGif` uses `omggif`
  (`GifReader`, `decodeAndBlitFrameRGBA` per frame — note it *blits*, so reuse and clear
  the buffer per frame or earlier frames bleed through).
- `writePng`, `writeGif` (via `gifenc` — **CJS default import**, 2-colour `quantize`),
  `writeMp4` (spawn ffmpeg, `-qp 0 -pix_fmt yuv444p`, PNG frames piped or via temp dir),
  `writePngSequence`.
- `writeMp4` must **warn on stderr** if the caller overrides to a lossy setting, naming
  the consequence: lossy encoding destroys the stereo signal and looks like a generator bug.

Tests: PNG roundtrip reads back the written dimensions; GIF roundtrip via `omggif`
returns the expected frame count and an 80ms delay for 12fps (see the quantisation note);
the lossy-override warning appears; `loadGif` on a 3-frame fixture returns 3 distinct
frames. Generate fixtures in the test rather than committing binaries.

Commit: `feat(node): canvas adapter and PNG/GIF/MP4 encoders`

### Task 7: CLI

**Files:** `src/cli/index.ts`, `src/cli/args.ts`, + tests

`stst render <scene> -o out.{gif,mp4,png}`, `stst still --text X -o out.png`,
`stst preview <scene>`. Stereo flags (`--sep-far`, `--sep-near`, `--noise-scale`,
`--cross`, `--seed`, `--freeze-noise`) override the scene file. Scene loader accepts
JSON and YAML — use a tiny hand-rolled subset or add `yaml` as a dep, your call, but
state which in the commit.

Argument parsing is pure and unit-testable; test that separately from any I/O. Test that
a bad scene file produces a message naming the offending field, not a stack trace.

Commit: `feat(cli): stst render/still/preview`

### Task 8: Web adapter and static site

**Files:** `src/web/canvas.ts`, `src/web/encode.ts`, `site/index.html`, `site/main.ts`

- `webCanvas(): CanvasLike` over `OffscreenCanvas`; `loadGif` reuses `omggif` (it is
  dependency-free and works in a browser).
- Site: live stereogram canvas, **side-by-side depth-map panel** (load-bearing for
  debugging — see design §5), timeline scrubber, preset/stereo controls, GIF export via
  `gifenc`, and scene state serialised into `location.hash`.
- Build to `dist-site/` with relative asset paths — a GitHub project Page serves from
  `/staticstereo/`, so absolute paths break.

Commit: `feat(web): browser adapter and static preview site`

### Task 9: GitHub Pages deploy

**Files:** `.github/workflows/pages.yml`

`actions/deploy-pages` on push to `main`: build, upload `dist-site/`, deploy. No build
output committed, no `gh-pages` branch. Also run `npm test` and `npm run typecheck` in a
`ci.yml` on push and PR.

Commit: `ci: test workflow and Pages deploy`

---

## Done criteria

1. `npm test` green; `npm run typecheck` clean.
2. Every import specifier under `dist/core` is relative (enforced by test, Task 5), and
   no `*.test.js` is emitted into `dist`.
3. `stst render examples/pacman.yaml -o /tmp/p.gif` produces a GIF whose middle row
   measures `sepNear × noiseScale` inside pacman and `sepFar × noiseScale` outside —
   the same check that validated the POC.
4. An `examples/` directory with pacman, scrolling text, and a bouncing ball, each
   reproducing a documented effect from the design.
5. README updated: install, the three CLI commands, a link to the live Pages site.
