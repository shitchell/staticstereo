import type { Scene } from '../src/core/types.js'

/**
 * Starter scenes.
 *
 * Every one of these is built from `text` and `shape` layers only — no PNG, no
 * GIF, no fetch. That is deliberate: the site is served from a GitHub project
 * subpath, and an example that referenced `/dot.png` would work on localhost
 * and 404 in production. With no assets at all there is nothing to get wrong,
 * and `image`/`gif` layers remain reachable through the scene editor with an
 * absolute URL or a `data:` URI.
 *
 * Scene sizes are kept modest (640×360, which `noiseScale: 2` upscales to
 * 1280×720) because every control change re-renders synchronously on the main
 * thread. `stst render` is the place for 1600×900.
 */
export interface Example {
  id: string
  label: string
  /** What this example is demonstrating, shown next to the picker. */
  note: string
  scene: Scene
}

const SIZE: [number, number] = [640, 360]

export const EXAMPLES: Example[] = [
  {
    id: 'emerge',
    label: 'EMERGE — text rising out of the noise',
    note:
      'There is no transparency in depth space, so a fade-in is motion in depth. ' +
      'Watch the depth panel: the word brightens from black, which is it rising ' +
      'from the background plane towards the viewer.',
    scene: {
      size: SIZE,
      fps: 12,
      duration: 3,
      layers: [
        {
          type: 'text',
          text: 'STATIC',
          size: 120,
          at: [120, 120],
          depth: 1,
          anim: { kind: 'emerge' },
        },
      ],
    },
  },
  {
    id: 'marquee',
    label: 'MARQUEE — scrolling text wider than the frame',
    note:
      'The track travels from +sceneW to -contentW, measured from the real text ' +
      'metrics, so an over-wide string leaves the frame completely instead of ' +
      'parking its tail on screen.',
    scene: {
      size: SIZE,
      fps: 12,
      duration: 6,
      layers: [
        {
          type: 'text',
          text: 'STATIC ON THE STEREO',
          size: 96,
          at: [0, 130],
          depth: 0.7,
          anim: { kind: 'marquee', speed: 160 },
        },
      ],
    },
  },
  {
    id: 'bounce',
    label: 'BOUNCE — a ball crossing the frame',
    note:
      'Two animators on one layer: slide and bounce compose, so the translations ' +
      'sum. Easing is per-segment in v1, which is why the rise bounces as well as ' +
      'the fall (design §4.1).',
    scene: {
      size: SIZE,
      fps: 12,
      duration: 4,
      layers: [
        {
          type: 'shape',
          shape: 'circle',
          r: 36,
          at: [0, 280],
          depth: 1,
          anim: [
            { kind: 'slide', from: [-60, 0], to: [700, 0], repeat: 'loop' },
            { kind: 'bounce', height: 180, duration: 1 },
          ],
        },
      ],
    },
  },
  {
    id: 'pacman',
    label: 'PACMAN — three layers, one of them moving',
    note:
      'The deferred multi-layer feature, available from day one: the engine takes ' +
      'a layer list, so this is layers.length > 1 and no engine work at all. The ' +
      'dots sit behind the mover, at depth 0.6 against its 1.0.',
    scene: {
      size: SIZE,
      fps: 12,
      duration: 4,
      freezeNoise: false,
      layers: [
        { type: 'shape', shape: 'circle', r: 12, at: [300, 180], depth: 0.6 },
        { type: 'shape', shape: 'circle', r: 12, at: [420, 180], depth: 0.6 },
        { type: 'shape', shape: 'circle', r: 12, at: [540, 180], depth: 0.6 },
        {
          type: 'shape',
          shape: 'circle',
          r: 44,
          at: [0, 180],
          depth: 1,
          anim: { kind: 'slide', from: [-60, 0], to: [700, 0], repeat: 'loop' },
        },
      ],
    },
  },
  {
    id: 'still',
    label: 'STILL — a single frame, no timeline',
    note:
      'A scene naming neither fps nor duration is a still. It still samples at ' +
      'the scene midpoint rather than t=0, because t=0 for an animated layer is ' +
      'usually off-screen (design §4.1).',
    scene: {
      size: SIZE,
      // Spelled out in full so this example also documents the defaults.
      // depthBlur is 0 deliberately, matching DEFAULT_STEREO: at this depth
      // budget a 1px blur was measured by eye to read as a slope rather than
      // suppressing anything, so pinning 1 here would ship the worse picture.
      stereo: { sepFar: 110, sepNear: 88, noiseScale: 2, depthBlur: 0, cross: false, seed: 3 },
      layers: [
        { type: 'shape', shape: 'circle', r: 110, at: [320, 180], depth: 1 },
        { type: 'text', text: 'FUSE ME', size: 64, at: [200, 300], depth: 0.5 },
      ],
    },
  },
]

export const DEFAULT_EXAMPLE = EXAMPLES[0]!
