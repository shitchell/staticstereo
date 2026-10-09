/**
 * GIF fixtures, built at run time with `omggif`'s writer.
 *
 * Shared by the Node, web, and shared-decoder suites because all three need the
 * same partial-frame/disposal cases, and a committed binary GIF would make the
 * trap those tests exist to catch invisible to review: you could not tell a
 * wrong expectation from a wrong fixture without a hex editor.
 *
 * Excluded from the build (`tsconfig.json`), like `src/core/testing/`.
 */

import { GifWriter } from 'omggif'

/** Must be a power of two for `GifWriter`. Entries are packed 0xRRGGBB. */
export const FIXTURE_PALETTE = [0x000000, 0xff0000, 0x00ff00, 0x0000ff]

export interface GifFixtureFrame {
  /** Subrect origin. Defaults to 0, 0 — i.e. a full-screen frame. */
  x?: number
  y?: number
  /** Subrect size. Defaults to the logical screen size. */
  w?: number
  h?: number
  /** Index into `FIXTURE_PALETTE`; the whole subrect is filled with it. */
  index: number
  /** 1/100 s units, as the GIF format stores it. Default 8 (= 80ms). */
  delay?: number
  /** 0 unspecified, 1 keep, 2 restore-to-background, 3 restore-to-previous. */
  disposal?: number
  transparent?: number | null
}

/** A complete GIF file as bytes. */
export function makeGif(w: number, h: number, frames: GifFixtureFrame[]): Uint8Array {
  const buf = new Uint8Array(w * h * frames.length * 4 + 8192)
  const gw = new GifWriter(buf, w, h, { loop: 0, palette: FIXTURE_PALETTE })
  for (const f of frames) {
    const fw = f.w ?? w
    const fh = f.h ?? h
    const px = new Uint8Array(fw * fh).fill(f.index)
    gw.addFrame(f.x ?? 0, f.y ?? 0, fw, fh, px, {
      delay: f.delay ?? 8,
      disposal: f.disposal ?? 0,
      transparent: f.transparent ?? null,
    })
  }
  return buf.slice(0, gw.end())
}

/**
 * Three solid full-screen frames in distinct colours, 83ms requested.
 * The delay reads back as 80ms: GIF stores delays in 10ms units.
 */
export function solid3Gif(): Uint8Array {
  const delay = Math.round(83 / 10)
  return makeGif(4, 4, [
    { index: 1, delay }, { index: 2, delay }, { index: 3, delay },
  ])
}

/**
 * THE BLEED FIXTURE. Frame 0 fills the canvas red then declares disposal 2
 * ("restore to background"); frame 1 paints a 2x2 green subrect. A correct
 * decoder shows frame 1 as green on transparent; one that reuses a single
 * buffer and ignores disposal shows green on *red*.
 */
export function dispose2Gif(): Uint8Array {
  return makeGif(4, 4, [
    { index: 1, disposal: 2 },
    { index: 2, x: 0, y: 0, w: 2, h: 2, disposal: 0 },
  ])
}

/**
 * The mirror case. Frame 0 declares disposal 1 ("do not dispose"), so frame 1's
 * subrect composites *over* it — clearing the buffer per frame is also wrong.
 */
export function keepGif(): Uint8Array {
  return makeGif(4, 4, [
    { index: 1, disposal: 1 },
    { index: 2, x: 0, y: 0, w: 2, h: 2, disposal: 0 },
  ])
}

/**
 * Frame 0 red, frame 1 a 2x2 green subrect with disposal 3
 * ("restore to previous"), frame 2 a 2x2 blue subrect at the bottom right.
 * Frame 2 must show frame 0's red where frame 1's green was.
 */
export function dispose3Gif(): Uint8Array {
  return makeGif(4, 4, [
    { index: 1, disposal: 0 },
    { index: 2, x: 0, y: 0, w: 2, h: 2, disposal: 3 },
    { index: 3, x: 2, y: 2, w: 2, h: 2, disposal: 0 },
  ])
}

/** `data:` URL for GIF bytes — what the web adapter can be handed under Node. */
export function gifDataUrl(bytes: Uint8Array): string {
  return `data:image/gif;base64,${Buffer.from(bytes).toString('base64')}`
}
