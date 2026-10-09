/**
 * The stage guide: where the authoring area is, inside the plate that is
 * actually drawn (design §10.5).
 *
 * ## Why this is an HTML overlay and not pixels
 *
 * The obvious implementation — tint the margin pixels in the RGBA buffer before
 * `putImageData` — is **wrong, and wrong for the reason the margins exist**.
 * Those columns are not decoration: fusion forms one percept per pair
 * `(P, P + sep)`, and the partner of a column at the stage's own edge lives in
 * the margin. Darkening or recolouring them breaks the correspondence a viewer
 * needs for exactly the stage columns the plate/stage split was added to
 * rescue, so the preview would stop fusing at its edges and the guide would
 * have reintroduced the defect it is there to explain. Design §10.4 says the
 * margins stay visible; a tint is a quieter form of cropping them.
 *
 * So the guide is a separate element positioned over the canvas, and the pixels
 * are never touched. It is also toggleable, because any overlay — even a 1px
 * outline — sits in front of real dots, and someone trying to *fuse* the
 * preview should be able to get it out of the way.
 *
 * ## Why percentages
 *
 * The canvas is CSS-scaled (`max-width: 100%`), so its layout size has no fixed
 * relationship to its pixel size — the same trap `main.ts`'s click handler
 * already has to work around. Percentages of the canvas box are exact under any
 * scale and need no resize listener.
 */
import type { PlateLayout } from '../src/core/index.js'

/** Inline styles for the overlay rectangle that marks the stage. */
export interface StageGuideStyle {
  readonly left: string
  readonly width: string
  readonly top: string
  readonly height: string
}

/** The minimum a frame has to expose for the guide to be placeable. */
export interface GuidableFrame {
  readonly width: number
  readonly height: number
  readonly stage: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
}

/**
 * Percentage geometry of the stage within the plate.
 *
 * Taken from the **frame**, not from the scene, deliberately: the frame is what
 * was drawn, and `renderFrame` reports its own stage in output pixels. Deriving
 * it from `scene.size` and `noiseScale` would be a second computation of the
 * same thing, free to disagree with the picture under it.
 */
export function stageGuideStyle(frame: GuidableFrame): StageGuideStyle {
  if (!(frame.width > 0) || !(frame.height > 0)) {
    throw new Error(
      `stageGuideStyle: the frame has no area (${frame.width}x${frame.height})`,
    )
  }
  const pct = (v: number, of: number): string => `${((v / of) * 100).toFixed(4)}%`
  return {
    left: pct(frame.stage.x, frame.width),
    width: pct(frame.stage.width, frame.width),
    top: pct(frame.stage.y, frame.height),
    height: pct(frame.stage.height, frame.height),
  }
}

/**
 * One line of prose for the panel, in **scene** pixels — the units the scene
 * file and the width/height fields are written in.
 *
 * It says the margins cannot be cropped because that is the non-obvious half:
 * "dead space" invites exactly the wrong conclusion, and cropping it is the
 * trap design §10.4 records the project nearly walking into.
 */
export function stageGuideLabel(layout: PlateLayout, noiseScale: number): string {
  const { stage, plate, margins } = layout
  const scaled = noiseScale === 1
    ? ''
    : ` · drawn at ${plate.width * noiseScale}×${plate.height * noiseScale} (noiseScale ${noiseScale})`
  return (
    `stage ${stage.width}×${stage.height} inside a ${plate.width}×${plate.height} plate` +
    `${scaled} · ${margins.left}px left + ${margins.right}px right is dead space: ` +
    `compose nothing there, but it is emitted and not croppable — fusion needs ` +
    `those partner pixels. The depth panel shows the stage only.`
  )
}
