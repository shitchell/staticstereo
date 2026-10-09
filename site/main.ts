import {
  DEFAULT_STEREO,
  PRESETS,
  blurDepth,
  createRasterCache,
  frameTimes,
  plateLayoutOf,
  rasterDepth,
  renderFrame,
  renderFrames,
  resolveStereo,
  sceneFps,
} from '../src/core/index.js'
import { gifBlob, pngBlob, webCanvas } from '../src/web/index.js'
import type { PlateFrame, RasterCache } from '../src/core/index.js'
import type { Layer, Preset, Scene, StereoOpts } from '../src/core/types.js'
import {
  CUSTOM_TRACK,
  coerceInt,
  coerceNumber,
  currentFrame,
  frameTimesOf,
  initialState,
  presetNote,
  reduce,
  sceneError,
} from './controls.js'
import type { Action, UiState } from './controls.js'
import { depthToRgba, greyToRgba } from './depthmap.js'
import { describeReadout, expectedPeriods, periodWindow, readRow, readSegment } from './diagnostics.js'
import { DEFAULT_EXAMPLE, EXAMPLES } from './examples.js'
import { encodeSceneHash, parseSceneHash } from './hash.js'
import { validateScene } from './scene.js'
import { stageGuideLabel, stageGuideStyle } from './stageguide.js'

/**
 * DOM wiring. Everything with behaviour worth asserting lives in the sibling
 * modules, which are unit-tested; this file is the part that cannot be, because
 * `OffscreenCanvas` does not exist under node and jsdom does not rasterise
 * (design §9.12).
 *
 * Two structural notes.
 *
 * **The depth panel costs a second rasterisation per frame.** `renderFrame`
 * returns the dot field only, and the per-frame noise seed it derives is
 * private to `src/core/render.ts` — deliberately, since it is what makes
 * `renderFrame(scene, t)` a pure function of its arguments. Re-deriving it here
 * to run the pipeline by hand would duplicate private logic and silently break
 * the property that a GIF exported from this page is byte-identical to one
 * `stst` renders from the same scene. So the depth map is obtained by calling
 * `rasterDepth` again, sharing one `RasterCache` with the render so no asset is
 * decoded twice. It is ~2× the rasterisation cost for the preview and zero cost
 * for the export.
 *
 * **The cache is replaced whenever the scene is replaced.** `CanvasLike` has no
 * teardown hook, so a `DecodedImage` holds an `ImageBitmap` with nothing able
 * to `close()` it (design §9.11). Dropping the whole cache on a scene swap
 * bounds that to one scene's assets instead of every scene ever loaded.
 */

/* --------------------------------------------------------------- elements */

/** Fail loudly and immediately if the markup and this file disagree. */
function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`site/index.html is missing #${id}`)
  return node as T
}

/**
 * Collected in `boot()`, not at module scope.
 *
 * `el()` throws when the markup and this file disagree, and a throw during
 * module evaluation happens *before* the top-level try/catch exists — leaving a
 * blank page and a console message nobody reads. Deferring it means the error
 * reaches the banner.
 */
function collectElements() {
  return {
  error: el<HTMLParagraphElement>('error'),
  stereoCanvas: el<HTMLCanvasElement>('stereo-canvas'),
  stageGuide: el<HTMLDivElement>('stage-guide'),
  stageGuideToggle: el<HTMLInputElement>('stageGuide'),
  guideNote: el<HTMLParagraphElement>('guide-note'),
  depthCanvas: el<HTMLCanvasElement>('depth-canvas'),
  depthView: el<HTMLSelectElement>('depth-view'),
  play: el<HTMLButtonElement>('play'),
  scrub: el<HTMLInputElement>('scrub'),
  frameLabel: el<HTMLOutputElement>('frame-label'),
  example: el<HTMLSelectElement>('example'),
  exampleNote: el<HTMLParagraphElement>('example-note'),
  width: el<HTMLInputElement>('width'),
  height: el<HTMLInputElement>('height'),
  fps: el<HTMLInputElement>('fps'),
  duration: el<HTMLInputElement>('duration'),
  sepFar: el<HTMLInputElement>('sepFar'),
  sepNear: el<HTMLInputElement>('sepNear'),
  noiseScale: el<HTMLInputElement>('noiseScale'),
  depthBlur: el<HTMLInputElement>('depthBlur'),
  seed: el<HTMLInputElement>('seed'),
  cross: el<HTMLInputElement>('cross'),
  freezeNoise: el<HTMLInputElement>('freezeNoise'),
  layer: el<HTMLSelectElement>('layer'),
  preset: el<HTMLSelectElement>('preset'),
  presetNote: el<HTMLParagraphElement>('preset-note'),
  diagExpected: el<HTMLElement>('diag-expected'),
  diagSelected: el<HTMLElement>('diag-selected'),
  diagFullRow: el<HTMLElement>('diag-fullrow'),
  diagTop: el<HTMLElement>('diag-top'),
  diagRow: el<HTMLInputElement>('diag-row'),
  diagRowLabel: el<HTMLElement>('diag-row-label'),
  diagX0: el<HTMLInputElement>('diag-x0'),
  diagX1: el<HTMLInputElement>('diag-x1'),
  diagFull: el<HTMLButtonElement>('diag-full'),
  exportGif: el<HTMLButtonElement>('export-gif'),
  exportPng: el<HTMLButtonElement>('export-png'),
  copyLink: el<HTMLButtonElement>('copy-link'),
  exportStatus: el<HTMLParagraphElement>('export-status'),
  sceneJson: el<HTMLTextAreaElement>('scene-json'),
  applyJson: el<HTMLButtonElement>('apply-json'),
  revertJson: el<HTMLButtonElement>('revert-json'),
  }
}

/* ------------------------------------------------------------------ state */

type Ui = ReturnType<typeof collectElements>

let ui!: Ui
const surface = webCanvas()
let cache: RasterCache = createRasterCache()
let state: UiState = initialState(DEFAULT_EXAMPLE.scene)
/**
 * Diagnostics selection: a row plus a horizontal band.
 *
 * A view concern, not scene state, so it stays out of the hash — a shared link
 * carries the picture, not where someone last pointed the ruler. `bandX1 = 0`
 * means "the full width", resolved against the current frame.
 */
let diagRow = 0
let bandX0 = 0
let bandX1 = 0
let playing = false
let lastWrittenHash = ''

/**
 * Looked up directly rather than through `ui`, so that a failure *while
 * collecting* `ui` can still be reported.
 */
function showError(message: string | undefined): void {
  const banner = document.getElementById('error')
  if (!banner) return
  banner.hidden = message === undefined
  banner.textContent = message ?? ''
}

/**
 * The stereo settings, never throwing.
 *
 * `resolveStereo` rejects combinations that would render wrongly, which is
 * correct for the render path and wrong for the *controls* path: the sliders
 * still have to display the invalid value the user just typed, and the message
 * comes from {@link sceneError} instead. `initialState` materialises all six
 * fields, so the spread is complete rather than a guess.
 */
function stereoOf(scene: Scene): StereoOpts {
  return { ...DEFAULT_STEREO, ...scene.stereo }
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/* ---------------------------------------------------------------- display */

let stereoRgba = new Uint8ClampedArray(0)
let depthRgba = new Uint8ClampedArray(0)

function drawStereo(frame: PlateFrame): void {
  const { width, height, pixels } = frame
  if (ui.stereoCanvas.width !== width) ui.stereoCanvas.width = width
  if (ui.stereoCanvas.height !== height) ui.stereoCanvas.height = height
  const need = width * height * 4
  if (stereoRgba.length !== need) stereoRgba = new Uint8ClampedArray(need)
  greyToRgba(pixels, stereoRgba)
  const ctx = ui.stereoCanvas.getContext('2d')
  if (!ctx) throw new Error('the stereogram canvas has no 2d context')
  ctx.putImageData(new ImageData(stereoRgba, width, height), 0, 0)
  drawStageGuide(frame)
}

/**
 * Mark the stage over the plate (design §10.5).
 *
 * The canvas now shows the **plate** — wider than `scene.size`, with dead
 * strips either side that the encoder needs and nothing should be composed
 * into. Without a guide that difference is invisible and an author will put a
 * ball in the margin, see it, and then find it missing from the fused image:
 * which is the exact bug report that produced the plate/stage split.
 *
 * Positioned as percentages of the canvas box, so it stays correct under the
 * CSS scaling `canvas { width: 100% }` applies — the same reason the click
 * handler maps through `getBoundingClientRect` rather than using `offsetX`.
 */
function drawStageGuide(frame: PlateFrame): void {
  const show = ui.stageGuideToggle.checked
  ui.stageGuide.hidden = !show
  if (!show) return
  const style = stageGuideStyle(frame)
  ui.stageGuide.style.left = style.left
  ui.stageGuide.style.width = style.width
  ui.stageGuide.style.top = style.top
  ui.stageGuide.style.height = style.height
}

function drawDepth(depth: Float32Array, width: number, height: number): void {
  if (ui.depthCanvas.width !== width) ui.depthCanvas.width = width
  if (ui.depthCanvas.height !== height) ui.depthCanvas.height = height
  const need = width * height * 4
  if (depthRgba.length !== need) depthRgba = new Uint8ClampedArray(need)
  depthToRgba(depth, depthRgba)
  const ctx = ui.depthCanvas.getContext('2d')
  if (!ctx) throw new Error('the depth canvas has no 2d context')
  ctx.putImageData(new ImageData(depthRgba, width, height), 0, 0)
}

function updateDiagnostics(frame: PlateFrame, stereo: StereoOpts): void {
  const { near, far } = expectedPeriods(stereo)
  ui.diagExpected.textContent =
    `near ${near} px (sepNear ${stereo.sepNear} × ${stereo.noiseScale}) · ` +
    `far ${far} px (sepFar ${stereo.sepFar} × ${stereo.noiseScale})`

  const { lo, hi } = periodWindow(stereo)
  const maxRow = frame.height - 1
  if (diagRow > maxRow) diagRow = maxRow
  if (diagRow < 0) diagRow = 0
  if (ui.diagRow.max !== String(maxRow)) ui.diagRow.max = String(maxRow)
  if (document.activeElement !== ui.diagRow) ui.diagRow.value = String(diagRow)
  ui.diagRowLabel.textContent = `y=${diagRow}`

  // Resolved against the current frame, which changes size whenever the scene
  // size or noiseScale does. A band remembered in frame coordinates would
  // otherwise silently fall outside and `readSegment` would throw on repaint.
  const x0 = Math.min(Math.max(0, bandX0), frame.width - 1)
  const x1 = bandX1 <= x0 ? frame.width : Math.min(bandX1, frame.width)
  bandX0 = x0
  bandX1 = x1
  if (document.activeElement !== ui.diagX0) ui.diagX0.value = String(x0)
  if (document.activeElement !== ui.diagX1) ui.diagX1.value = String(x1)
  ui.diagX0.max = String(frame.width - 1)
  ui.diagX1.max = String(frame.width)

  ui.diagSelected.textContent =
    `x ${x0}..${x1} (${x1 - x0}px) · ${describeReadout(readSegment(frame, diagRow, x0, x1, lo, hi))}`
  ui.diagFullRow.textContent = describeReadout(readRow(frame, diagRow, lo, hi))
  ui.diagTop.textContent = describeReadout(readRow(frame, 0, lo, hi))
}

/* ----------------------------------------------------------------- render */

/**
 * One in-flight paint plus at most one queued, where the queued one reads
 * whatever the state is when it starts.
 *
 * Dragging a slider fires dozens of `input` events; without coalescing each one
 * queues a full render and the page falls seconds behind the pointer.
 */
let queued: Promise<void> | undefined
let chain: Promise<void> = Promise.resolve()

function render(): Promise<void> {
  if (queued) return queued
  const next = chain.then(async () => {
    queued = undefined
    await paint()
  })
  queued = next
  chain = next.catch(() => {})
  return next
}

async function paint(): Promise<void> {
  const problem = sceneError(state.scene)
  if (problem !== undefined) {
    // The last good frame stays on screen underneath the message. Blanking the
    // canvas would throw away the thing the user is comparing against.
    showError(problem)
    return
  }

  const scene = state.scene
  const [w, h] = scene.size
  const stereo = resolveStereo(scene)
  const seconds = state.time

  try {
    const depth = await rasterDepth(scene, seconds, surface, cache)
    drawDepth(
      state.depthView === 'encoded' ? blurDepth(depth, w, h, stereo.depthBlur) : depth,
      w, h,
    )
    const frame = await renderFrame(scene, seconds, surface, cache)
    drawStereo(frame)
    updateDiagnostics(frame, stereo)
    showError(undefined)
  } catch (err) {
    showError(describeError(err))
  }
}

/* ------------------------------------------------------------- hash sync */

function syncHash(): void {
  const hash = `#${encodeSceneHash(state.scene)}`
  if (location.hash === hash) return
  lastWrittenHash = hash
  // replaceState, not pushState: a slider drag would otherwise fill the history
  // stack with hundreds of entries and make Back useless.
  history.replaceState(null, '', hash)
}

function loadFromHash(): void {
  let decoded: unknown
  try {
    decoded = parseSceneHash(location.hash)
  } catch (err) {
    showError(`${describeError(err)} — showing the default scene instead.`)
    return
  }
  if (decoded === undefined) return

  try {
    setScene(validateScene(decoded))
  } catch (err) {
    showError(`the scene in this link is not valid: ${describeError(err)}`)
  }
}

/* ---------------------------------------------------------------- actions */

function dispatch(action: Action): void {
  try {
    state = reduce(state, action)
  } catch (err) {
    showError(describeError(err))
    return
  }
  syncControls()
  syncHash()
  void render()
}

function setScene(scene: Scene): void {
  // A new scene means new assets; see the header note on the missing teardown
  // hook. Also resets the stereo materialisation and re-snaps the scrub time.
  cache = createRasterCache()
  state = initialState(scene)
  diagRow = middleRow()
  syncControls()
  syncHash()
  void render()
}

/* --------------------------------------------------------------- controls */

/**
 * The vertical middle of the *rendered* frame, which is `noiseScale` times the
 * scene height. Defaulting the diagnostics row to the middle is a guess, but
 * it is the right guess: that is where a centred subject is.
 */
function middleRow(): number {
  return Math.floor((state.scene.size[1] * stereoOf(state.scene).noiseScale) / 2)
}

/** Never overwrite the field the user is typing in. */
function setValue(input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string): void {
  if (document.activeElement === input) return
  if (input.value !== value) input.value = value
}

function layerLabel(layer: Layer, index: number): string {
  const detail =
    layer.type === 'text' ? ` "${layer.text}"` :
    layer.type === 'image' || layer.type === 'gif' ? ` ${layer.src}` :
    layer.type === 'shape' ? ` ${layer.shape}` :
    ''
  return `${index}: ${layer.type}${detail}`
}

function currentPresetKind(layer: Layer | undefined): string {
  const anim = layer?.anim
  if (anim === undefined) return ''
  const first = Array.isArray(anim) ? anim[0] : anim
  if (first && typeof first === 'object' && 'kind' in first) return String(first.kind)
  return CUSTOM_TRACK
}

function syncControls(): void {
  const scene = state.scene
  const stereo = stereoOf(scene)
  const times = frameTimesOf(scene)
  const index = currentFrame(state)

  setValue(ui.width, String(scene.size[0]))
  setValue(ui.height, String(scene.size[1]))
  setValue(ui.fps, scene.fps === undefined ? '' : String(scene.fps))
  setValue(ui.duration, scene.duration === undefined ? '' : String(scene.duration))

  setValue(ui.sepFar, String(stereo.sepFar))
  setValue(ui.sepNear, String(stereo.sepNear))
  setValue(ui.noiseScale, String(stereo.noiseScale))
  setValue(ui.depthBlur, String(stereo.depthBlur))
  setValue(ui.seed, String(stereo.seed))
  ui.cross.checked = stereo.cross
  ui.freezeNoise.checked = scene.freezeNoise === true
  setValue(ui.depthView, state.depthView)

  // Derived from the scene, not from the last frame: the note has to be right
  // the moment someone types a new sepFar, before the repaint lands.
  ui.guideNote.textContent = stageGuideLabel(plateLayoutOf(scene), stereo.noiseScale)

  ui.scrub.max = String(times.length - 1)
  ui.scrub.disabled = times.length <= 1
  if (document.activeElement !== ui.scrub) ui.scrub.value = String(index)
  ui.frameLabel.textContent =
    times.length <= 1
      ? `still · t=${state.time.toFixed(3)}s`
      : `frame ${index + 1} / ${times.length} · t=${state.time.toFixed(3)}s`
  ui.play.disabled = times.length <= 1
  ui.play.textContent = playing ? 'Pause' : 'Play'

  // Rebuilt rather than patched: a scene swap can change the layer count, and a
  // stale option would dispatch an animator onto a layer that no longer exists.
  const selectedLayer = Math.min(Number(ui.layer.value) || 0, Math.max(0, scene.layers.length - 1))
  ui.layer.replaceChildren(
    ...scene.layers.map((layer, i) => {
      const opt = document.createElement('option')
      opt.value = String(i)
      opt.textContent = layerLabel(layer, i)
      return opt
    }),
  )
  ui.layer.disabled = scene.layers.length === 0
  if (scene.layers.length > 0) ui.layer.value = String(selectedLayer)

  const layer = scene.layers[selectedLayer]
  const kind = currentPresetKind(layer)
  if (kind === CUSTOM_TRACK && !Array.from(ui.preset.options).some(o => o.value === kind)) {
    // The dropdown cannot represent a hand-written track, and quietly showing
    // "none" would invite one click that silently discards it.
    const opt = document.createElement('option')
    opt.value = kind
    opt.textContent = 'custom keyframe track'
    ui.preset.append(opt)
  }
  ui.presetNote.textContent = presetNote(kind, scene.layers.length)
  setValue(ui.preset, kind)
  ui.preset.disabled = scene.layers.length === 0

  setValue(ui.sceneJson, JSON.stringify(scene, null, 2))
}

/* ----------------------------------------------------------------- export */

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Freed on the next turn rather than immediately: revoking synchronously can
  // race the navigation the click just started.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

async function withBusy(button: HTMLButtonElement, message: string, work: () => Promise<void>): Promise<void> {
  button.disabled = true
  ui.exportStatus.textContent = message
  try {
    await work()
  } catch (err) {
    ui.exportStatus.textContent = `failed: ${describeError(err)}`
    return
  } finally {
    button.disabled = false
  }
}

/* ------------------------------------------------------------- playback */

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

async function playLoop(): Promise<void> {
  while (playing) {
    const started = performance.now()
    const times = frameTimesOf(state.scene)
    if (times.length <= 1) break
    const next = (currentFrame(state) + 1) % times.length
    state = reduce(state, { type: 'frame', index: next })
    syncControls()
    // Deliberately not syncing the hash per frame: the scrub position is not
    // scene state, and rewriting the URL 12 times a second is pointless churn.
    await render()
    // Renders are frequently slower than the frame interval. Waiting out the
    // remainder keeps real time honest and keeps the tab responsive.
    await sleep(Math.max(0, 1000 / sceneFps(state.scene) - (performance.now() - started)))
  }
  playing = false
  syncControls()
}

/* ------------------------------------------------------------------- wire */

function wire(): void {
  for (const ex of EXAMPLES) {
    const opt = document.createElement('option')
    opt.value = ex.id
    opt.textContent = ex.label
    ui.example.append(opt)
  }
  ui.example.value = DEFAULT_EXAMPLE.id
  ui.exampleNote.textContent = DEFAULT_EXAMPLE.note

  const none = document.createElement('option')
  none.value = ''
  none.textContent = 'none'
  ui.preset.append(none)
  for (const kind of Object.keys(PRESETS).sort()) {
    const opt = document.createElement('option')
    opt.value = kind
    opt.textContent = kind
    ui.preset.append(opt)
  }

  ui.example.addEventListener('change', () => {
    const ex = EXAMPLES.find(e => e.id === ui.example.value)
    if (!ex) return
    ui.exampleNote.textContent = ex.note
    playing = false
    setScene(ex.scene)
  })

  // Written out rather than driven by a computed key: `{[field]: value}` infers
  // an index signature, which is not assignable to `Partial<StereoOpts>`, and
  // the cast that would silence it is exactly the one that would let a typo'd
  // field name through.
  ui.sepFar.addEventListener('input', () => {
    dispatch({ type: 'stereo', patch: { sepFar: coerceNumber(ui.sepFar.value, stereoOf(state.scene).sepFar) } })
  })
  ui.sepNear.addEventListener('input', () => {
    dispatch({ type: 'stereo', patch: { sepNear: coerceNumber(ui.sepNear.value, stereoOf(state.scene).sepNear) } })
  })
  ui.depthBlur.addEventListener('input', () => {
    dispatch({ type: 'stereo', patch: { depthBlur: coerceNumber(ui.depthBlur.value, stereoOf(state.scene).depthBlur) } })
  })
  ui.seed.addEventListener('input', () => {
    dispatch({ type: 'stereo', patch: { seed: coerceNumber(ui.seed.value, stereoOf(state.scene).seed) } })
  })
  ui.noiseScale.addEventListener('input', () => {
    dispatch({
      type: 'stereo',
      patch: { noiseScale: coerceInt(ui.noiseScale.value, stereoOf(state.scene).noiseScale) },
    })
  })
  ui.cross.addEventListener('change', () => {
    dispatch({ type: 'stereo', patch: { cross: ui.cross.checked } })
  })
  ui.freezeNoise.addEventListener('change', () => {
    dispatch({ type: 'freezeNoise', value: ui.freezeNoise.checked })
  })

  // Not a `dispatch`: the guide is a view concern, like the diagnostics band,
  // so it stays out of the scene and out of the shared link. Toggling it also
  // does not need a re-render — the pixels are untouched either way.
  ui.stageGuideToggle.addEventListener('change', () => {
    ui.stageGuide.hidden = !ui.stageGuideToggle.checked
  })

  ui.width.addEventListener('change', () => {
    dispatch({ type: 'size', value: [coerceInt(ui.width.value, state.scene.size[0]), state.scene.size[1]] })
  })
  ui.height.addEventListener('change', () => {
    dispatch({ type: 'size', value: [state.scene.size[0], coerceInt(ui.height.value, state.scene.size[1])] })
  })
  ui.fps.addEventListener('change', () => {
    const raw = ui.fps.value.trim()
    dispatch({ type: 'fps', value: raw === '' ? undefined : coerceNumber(raw, sceneFps(state.scene)) })
  })
  ui.duration.addEventListener('change', () => {
    const raw = ui.duration.value.trim()
    dispatch({ type: 'duration', value: raw === '' ? undefined : coerceNumber(raw, 1) })
  })

  ui.depthView.addEventListener('change', () => {
    dispatch({ type: 'depthView', value: ui.depthView.value === 'encoded' ? 'encoded' : 'composited' })
  })

  ui.scrub.addEventListener('input', () => {
    playing = false
    state = reduce(state, { type: 'frame', index: Number(ui.scrub.value) })
    syncControls()
    void render()
  })

  ui.diagRow.addEventListener('input', () => {
    diagRow = coerceInt(ui.diagRow.value, diagRow)
    void render()
  })
  ui.diagX0.addEventListener('input', () => {
    bandX0 = coerceInt(ui.diagX0.value, bandX0)
    void render()
  })
  ui.diagX1.addEventListener('input', () => {
    bandX1 = coerceInt(ui.diagX1.value, bandX1)
    void render()
  })
  ui.diagFull.addEventListener('click', () => {
    bandX0 = 0
    // 0 means "resolve to the frame's full width"; the frame is not in scope here.
    bandX1 = 0
    void render()
  })

  /**
   * Click the stereogram to aim the ruler.
   *
   * The canvas is CSS-scaled, so the click has to be mapped back through the
   * element's own box — using `offsetX` directly would be wrong by whatever
   * factor the layout chose. The band is `2.2 × sepFar × noiseScale` wide:
   * enough comparisons for a `fair` grade, narrow enough to sit inside a
   * typical subject rather than straddling its edge.
   */
  ui.stereoCanvas.addEventListener('click', event => {
    const box = ui.stereoCanvas.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return
    const fw = ui.stereoCanvas.width
    const fh = ui.stereoCanvas.height
    const x = Math.round(((event.clientX - box.left) / box.width) * fw)
    diagRow = Math.min(fh - 1, Math.max(0, Math.round(((event.clientY - box.top) / box.height) * fh)))
    const span = Math.min(fw, Math.round(expectedPeriods(stereoOf(state.scene)).far * 2.2))
    bandX0 = Math.min(Math.max(0, x - Math.floor(span / 2)), fw - span)
    bandX1 = bandX0 + span
    void render()
  })

  ui.play.addEventListener('click', () => {
    playing = !playing
    syncControls()
    if (playing) void playLoop()
  })

  ui.preset.addEventListener('change', () => {
    const index = Number(ui.layer.value) || 0
    const kind = ui.preset.value
    if (kind === CUSTOM_TRACK) return
    dispatch({
      type: 'layerAnim',
      index,
      anim: kind === '' ? undefined : ({ kind } as Preset),
    })
  })
  ui.layer.addEventListener('change', syncControls)

  ui.applyJson.addEventListener('click', () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(ui.sceneJson.value) as unknown
    } catch (err) {
      showError(`the scene JSON is not valid JSON: ${describeError(err)}`)
      return
    }
    try {
      const scene = validateScene(parsed)
      playing = false
      setScene(scene)
      showError(undefined)
    } catch (err) {
      showError(describeError(err))
    }
  })
  ui.revertJson.addEventListener('click', () => {
    ui.sceneJson.value = JSON.stringify(state.scene, null, 2)
    showError(undefined)
  })

  ui.exportPng.addEventListener('click', () => {
    void withBusy(ui.exportPng, 'rendering this frame…', async () => {
      const frame = await renderFrame(state.scene, state.time, surface, cache)
      download(await pngBlob(frame), 'staticstereo.png')
      ui.exportStatus.textContent = `saved a ${frame.width}×${frame.height} PNG.`
    })
  })

  ui.exportGif.addEventListener('click', () => {
    void withBusy(ui.exportGif, 'encoding…', async () => {
      playing = false
      const scene = state.scene
      const fps = sceneFps(scene)
      const count = frameTimes(scene).length
      ui.exportStatus.textContent = `encoding ${count} frame(s)…`
      // Its own cache: the export decodes every frame of every asset, and
      // sharing the preview's would keep all of it alive afterwards.
      const blob = await gifBlob(renderFrames(scene, surface, createRasterCache()), { fps })
      download(blob, 'staticstereo.gif')
      const delay = Math.round(1000 / fps)
      ui.exportStatus.textContent =
        `saved ${count} frame(s) at ${fps}fps. GIF stores delays in 10ms units, so ` +
        `${delay}ms is written as ${Math.round(delay / 10) * 10}ms` +
        `${Math.round(delay / 10) * 10 === delay ? '' : ' — pick an fps that divides 100 ' +
          '(10, 12.5, 20, 25) to avoid the rounding'}.`
    })
  })

  ui.copyLink.addEventListener('click', () => {
    void withBusy(ui.copyLink, 'copying…', async () => {
      syncHash()
      await navigator.clipboard.writeText(location.href)
      ui.exportStatus.textContent = 'link copied — it carries the whole scene.'
    })
  })

  window.addEventListener('hashchange', () => {
    // Ignore the hash this page just wrote; only react to a link someone pasted.
    if (location.hash === lastWrittenHash) return
    loadFromHash()
  })
}

/* ------------------------------------------------------------------- boot */

function boot(): void {
  ui = collectElements()
  wire()
  diagRow = middleRow()
  loadFromHash()
  syncControls()
  syncHash()
  void render()
}

try {
  boot()
} catch (err) {
  // Most likely cause by a wide margin: a browser without OffscreenCanvas, in
  // which case `webCanvas()` has already explained itself. Anything else is a
  // markup/JS mismatch, which `el()` names precisely.
  showError(`staticstereo could not start: ${describeError(err)}`)
}
