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
    id: 'push',
    label: 'PUSH — text rising out of the noise',
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
          anim: { kind: 'push' },
        },
      ],
    },
  },
  {
    id: 'scroll',
    label: 'SCROLL — text wider than the frame, crossing it',
    note:
      'A move with a speed and repeat: loop. The endpoints travel the whole ' +
      'PLATE rather than the stage — from +stageW + rightMargin to ' +
      '-(contentW + leftMargin) — so the string crosses the whole emitted ' +
      'image at the given speed and leaves completely, instead of parking its ' +
      'tail on screen. This was the `marquee` preset, which computed those two ' +
      'numbers for you; the verb vocabulary has five entries now and a scroll ' +
      'is written out. Edit `to` if you change the text.',
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
          // 640 stage + 55 right margin; the string measures ~1050px at this
          // size and weight, plus a 110px left margin. Written out because no
          // preset derives them any more (design §4.2b).
          anim: {
            kind: 'move', from: [695, 0], to: [-1160, 0], speed: 160, repeat: 'loop',
          },
        },
      ],
    },
  },
  {
    id: 'bounce',
    label: 'BOUNCE — a ball crossing the frame',
    note:
      'Two animators on one layer: a move and a raw keyframe track compose, so ' +
      'the translations sum. The arc is three keys, which no two-key verb can ' +
      'express, so it is written longhand — exactly what the bounce preset used ' +
      'to emit. Easing is per-segment in v1, which is why the rise bounces as ' +
      'well as the fall (design §4.1).',
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
            { kind: 'move', from: [-60, 0], to: [700, 0], repeat: 'loop' },
            {
              keys: [{ t: 0, y: 0 }, { t: 0.5, y: -180 }, { t: 1, y: 0 }],
              ease: 'easeOutBounce', repeat: 'loop', duration: 1,
            },
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
          anim: { kind: 'move', from: [-60, 0], to: [700, 0], repeat: 'loop' },
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
