import { createRasterCache, renderFrame } from '../src/core/index.js'
import type { PlateFrame, RasterCache } from '../src/core/index.js'
import { webCanvas } from '../src/web/index.js'
import { applyChrome, playLabelFor } from './chromedom.js'
import type { ChromeDom } from './chromedom.js'
import { loadVendoredFont } from './fonts.js'
import {
  CHROME_IDLE_MS,
  ROLE_CANVAS,
  ROLE_FULLSCREEN,
  ROLE_PLAY,
  ROLE_SEEK,
  ROLE_TRANSPORT,
  chromeVisible,
  fullscreenTarget,
  noteActivity,
} from './playerchrome.js'
import type { ChromeActivity } from './playerchrome.js'
import { playerPlan } from './playerplan.js'
import type { PlayerPlan } from './playerplan.js'
import { frameIndexAt, frameTimesOf, timeOfFrame } from './transport.js'
import { runTransport } from './transportdriver.js'
import type { TransportDriver } from './transportdriver.js'
import type { FitPlan } from './scale.js'

/**
 * The player's imperative shell. **It decides nothing.**
 *
 * ## The line
 *
 * `site/playerplan.ts` holds every decision the player makes about a URL and a
 * box — the framing, the scene, the fit, the display scale, the smoothing
 * hint, the chrome tree, the notices — and returns them as one value. That
 * list names the *shape* of the answer and is not `PlayerPlan`'s field list:
 * it already groups `requestedFit` with `fit` and `imageRendering` with the
 * smoothing hint, and a plan gaining a ratio or a derived hint does not make
 * it wrong. Read the type for the fields; read this for what they are for.
 * This file reads `location`, the container's size, `devicePixelRatio` and whether
 * it is in an `<iframe>`, hands them over, and executes the answer. The split
 * is not stylistic: the test environment is plain node with neither jsdom nor
 * happy-dom, and design §12 excludes component DOM from testing outright, so a
 * decision made here is a decision no test in this repo can reach.
 *
 * The rule for anybody editing this file is the one `chromedom.ts` already
 * states for itself: **if you find yourself writing `if (framing === …)` or
 * `if (fit === …)`, that conditional belongs in `playerPlan` or `chromeSpec`.**
 * The conditionals that legitimately live here are of **four** kinds and no
 * others. The count was three while the fourth went unnamed — it was in the
 * code and documented only on the function that uses it, which made the
 * header's "no others" read as a claim the file did not keep:
 *
 *  - **feature detection** — `ResizeObserver`, `matchMedia`, `requestFullscreen`
 *    and `exitFullscreen` are all optional in some engine somewhere, and a
 *    missing one must degrade rather than throw;
 *  - **gesture gating** — `requestFullscreen` is refused outside a user
 *    gesture by every engine, which is why it is called from a `click` handler
 *    and nowhere else (`site/main.ts:1047-1051` records the same constraint);
 *  - **change detection** — "has the thing I already applied stopped matching
 *    the plan?", which is a question about this file's own cached state and
 *    cannot be answered by a pure function that has never seen it;
 *  - **unpacking a discriminated union whose policy was already chosen** —
 *    exactly once, in {@link boxOf}, which branches on `FitPlan.kind`. This
 *    one is the exception that looks most like the rule it breaks, so it is
 *    named here and not only in its own docblock: a reader auditing this file
 *    against "three kinds and no others" would find a fourth and have to
 *    guess whether it was an oversight. It is not. `playerPlan` already made
 *    the choice between re-scaling and re-rendering and already substituted
 *    the re-authored scene; what is left is that the two arms spell the same
 *    four CSS-px numbers at two different depths, both arms are read, and
 *    neither is preferred. A conditional that *chose* a kind would belong in
 *    `playerPlan`; one that only reads a kind somebody else chose has nowhere
 *    else to go, because the union is what crosses the boundary.
 *
 * ## Failure policy
 *
 * `playerPlan` is total by contract: it never throws, and every failure comes
 * back as a {@link PlayerNotice}. This file honours that by having somewhere
 * to put them. A player that logged "unreadable scene" to the console and
 * showed an empty box would be strictly worse for an embedder than the broken
 * link that caused it, because they cannot tell the two apart.
 */

/* ------------------------------------------------------------- elements */

/** The element `applyChrome`'s tree is mounted into. See `site/player.html`. */
const MOUNT_ID = 'player'

/** Where notices are shown. Below the plate — design §8.3; see the markup. */
const NOTICES_ID = 'notices'

/** Fail loudly and immediately if the markup and this file disagree. */
function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`site/player.html is missing #${id}`)
  return node as T
}

/**
 * An element from the chrome tree, by **role constant**.
 *
 * Never by selector and never by a string literal: `applyChrome` returns the
 * role→element map precisely so that nothing downstream re-derives a class
 * name, and a literal `'control:play'` here would be a second spelling of
 * `ROLE_PLAY` that a rename would not catch.
 *
 * Throws rather than returning `undefined`. A missing role means the tree and
 * this file disagree about what a player is, and the quiet version of that is
 * a control that renders, accepts clicks and does nothing — the failure
 * `markup.test.ts` already records as the hardest to see.
 */
function roleEl<T extends HTMLElement>(dom: ChromeDom, role: string): T {
  const node = dom.byRole.get(role)
  if (!node) throw new Error(`the chrome tree has no element for the role ${JSON.stringify(role)}`)
  return node as T
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/* ------------------------------------------------------------- geometry */

/**
 * Where to put the plate and how big to draw it, whichever kind of plan this
 * is.
 *
 * The one place this file touches `FitPlan`'s discriminant, and it is
 * **unpacking a union, not choosing a policy**: the choice between re-scaling
 * and re-rendering was made in `playerPlan`, which already substituted the
 * re-authored scene into `plan.scene`. What is left is that the two arms spell
 * the same four CSS-px numbers at two different depths. Both arms are read;
 * neither is preferred.
 */
function boxOf(plan: FitPlan): {
  readonly cssWidth: number
  readonly cssHeight: number
  readonly offsetX: number
  readonly offsetY: number
} {
  return plan.kind === 'rerender' ? plan.plan : plan.fit
}

/**
 * A single-channel frame → opaque RGBA, for `putImageData`.
 *
 * A third copy of this expansion, knowingly. `src/shared/frames.ts` has one
 * for the encoders but returns a `Uint8Array`, and `ImageData` requires a
 * `Uint8ClampedArray`, so reusing it would mean a second full copy of every
 * frame on every repaint; `site/depthmap.ts` has one with the right type but
 * is an **editor-only** module the player may not import (P2 brief §1.13) —
 * and `site/dist.test.ts` greps the player bundle for one of its literals to
 * prove it was not imported, so reaching for it here would be self-defeating
 * as well as forbidden. Twelve lines of mechanical expansion is the cheaper
 * side of that trade.
 */
function greyToRgba(grey: ArrayLike<number>, into: Uint8ClampedArray): void {
  for (let i = 0; i < grey.length; i++) {
    const v = grey[i]!
    const o = i * 4
    into[o] = v
    into[o + 1] = v
    into[o + 2] = v
    into[o + 3] = 255
  }
}

/* ----------------------------------------------------------- the session */

const surface = webCanvas()
const mount = el<HTMLElement>(MOUNT_ID)
const noticeBox = el<HTMLElement>(NOTICES_ID)

let dom: ChromeDom | undefined
let driver: TransportDriver | undefined

/**
 * What {@link reflow} has already applied, so it can tell "the environment
 * moved" from "it did not". Both are this file's own cached state and neither
 * is a decision: `appliedFraming` is compared against `plan.framing`, never
 * against a framing literal.
 */
let appliedKey = ''
let appliedFraming: string | undefined

/**
 * Replaced, never reused across scenes. `CanvasLike` has no teardown hook, so
 * a `DecodedImage` holds an `ImageBitmap` nothing can `close()` (design
 * §9.11); dropping the whole cache when the scene object changes bounds that
 * to one scene's assets. `fit=render` produces a *new* scaled scene on every
 * reflow, which is exactly when the cached rasters stop being the right size.
 */
let cache: RasterCache = createRasterCache()

/** Reused across repaints; resized only when the plate's area changes. */
let rgba = new Uint8ClampedArray(0)

/** The vendored-font problem, if there was one. Shown with the plan's notices. */
let fontProblem: string | undefined

/** The last error a render threw. Shown with the plan's notices. */
let renderProblem: string | undefined

let activity: ChromeActivity = { lastActivityMs: 0, playing: false }
let hideTimer: number | undefined

/**
 * Repaint coalescing. A stereogram frame is frequently slower to compute than
 * the interval between the events asking for one — a scrub drag, a resize —
 * so a request arriving mid-render replaces any other pending request rather
 * than queueing behind it. The newest time is the only one worth drawing.
 */
let painting = false
let pendingTime: number | undefined

/* -------------------------------------------------------------- planning */

/** Is the player inside an `<iframe>`? */
function embedded(): boolean {
  try {
    return window.self !== window.top
  } catch {
    // A cross-origin parent can make the comparison itself throw in some
    // engines. Something is wrapping us, which is the answer the question
    // was asking for.
    return true
  }
}

/** Is our wrapper the fullscreen element right now? */
function fullscreen(): boolean {
  return dom !== undefined && document.fullscreenElement === dom.root
}

/**
 * The plan currently in force.
 *
 * Planned eagerly at module scope rather than left undefined until `boot`:
 * `playerPlan` is total by contract, so there is always an answer, and an
 * `undefined` here would push a null check into every function below for a
 * state that only exists for the duration of one `await`.
 */
let plan: PlayerPlan

function planNow(): PlayerPlan {
  return playerPlan({
    search: location.search,
    // The only read of the fragment in the player, and there is deliberately
    // **no `hashchange` listener** behind it. The editor does have one
    // (`site/main.ts:1313`) because it *writes* the fragment — it round-trips
    // the scene through the URL on every edit, so it has to notice a Back
    // press or a hand-pasted link. The player never writes it, and nothing in
    // the player's own four framings changes it: `reflow` is driven by the
    // container, the dpr and `fullscreenchange`, and `environmentKey`
    // explicitly excludes the URL because "a fragment change is a different
    // scene and is not a reflow".
    //
    // The one case that would need it is an embedder mutating the `<iframe
    // src>` fragment after load and expecting the plate to follow — a live
    // scene swap without a reload. Nothing asks for that today (R14 is about
    // the bare directory URL resolving at all), and the cost of guessing
    // wrong in this direction is a reload. If it is ever wanted, the listener
    // belongs here with a cache reset and a fresh driver, not in `reflow`:
    // a new fragment is a new scene, and the driver holds the one it booted
    // with.
    hash: location.hash,
    // CSS px, measured off the mount — `playerpage.css` gives it the viewport
    // minus the notice strip, and an embedder gives the `<iframe>` whatever
    // size they like.
    container: { width: mount.clientWidth, height: mount.clientHeight },
    dpr: window.devicePixelRatio,
    embedded: embedded(),
    fullscreen: fullscreen(),
  })
}

plan = planNow()

/* ------------------------------------------------------------- the chrome */

function mountChrome(next: PlayerPlan): ChromeDom {
  const built = applyChrome(next.chrome, document)
  mount.replaceChildren(built.root)
  wireControls(built)
  return built
}

/**
 * Wire the three controls, each found by its role constant.
 *
 * Re-run whenever the tree is rebuilt, because the elements are new ones. The
 * handlers close over the module-level `driver` and `dom` rather than over
 * their values, so a rebuild does not strand them on a detached tree.
 */
function wireControls(built: ChromeDom): void {
  roleEl(built, ROLE_PLAY).addEventListener('click', () => {
    driver?.toggle()
    bumpActivity()
    syncTransport(driver?.time() ?? 0)
  })

  const seek = roleEl<HTMLInputElement>(built, ROLE_SEEK)
  // `input`, not `change`: a scrub should move the plate while the thumb is
  // moving, which is the whole reason the driver coalesces repaints.
  seek.addEventListener('input', () => {
    const scene = plan.scene
    if (scene === undefined) return
    bumpActivity()
    driver?.seek(timeOfFrame(scene, Number(seek.value)))
  })

  roleEl(built, ROLE_FULLSCREEN).addEventListener('click', () => {
    bumpActivity()
    toggleFullscreen()
  })
}

/**
 * Enter or leave fullscreen, on the element {@link fullscreenTarget} names.
 *
 * **The wrapper, not the canvas and not `document.documentElement`.** Design
 * §8.2 settled it: a fullscreen element's siblings are not painted, so
 * fullscreening the canvas would make the transport invisible at the exact
 * moment R16 says play/pause must work. Today's page
 * (`site/main.ts:1056`) fullscreens the document element instead, which works
 * only because every presentation style keys off a class on `html`, and which
 * leaves the player unable to be fullscreened as a component.
 *
 * Both calls are optional-chained and both are best-effort. `requestFullscreen`
 * is gated on a user gesture by every engine — hence the `click` handler above
 * and nowhere else — and is refused outright in a cross-origin `<iframe>`
 * without `allowfullscreen` and by some enterprise policies. A refusal is not
 * an error for us: the player is useful without it, and the control stays
 * where it was.
 */
function toggleFullscreen(): void {
  const current = dom
  if (current === undefined) return
  const target = roleEl(current, fullscreenTarget(plan.chrome))
  const request = document.fullscreenElement === target
    ? document.exitFullscreen?.()
    : target.requestFullscreen?.()
  if (request !== undefined) void request.catch(() => { /* refused; the mode stands */ })
}

/* ----------------------------------------------------------- the painting */

function paint(frame: PlateFrame): void {
  const current = dom
  if (current === undefined) return
  const canvas = roleEl<HTMLCanvasElement>(current, ROLE_CANVAS)
  // The backing store is the frame's own size, in backing-store px
  // (plate px × noiseScale). It is never the CSS size: `style.width` below is
  // in CSS px and the two differ by the fit scale and the dpr both.
  if (canvas.width !== frame.width) canvas.width = frame.width
  if (canvas.height !== frame.height) canvas.height = frame.height
  const need = frame.width * frame.height * 4
  if (rgba.length !== need) rgba = new Uint8ClampedArray(need)
  greyToRgba(frame.pixels, rgba)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('player: the plate canvas exposes no 2d context')
  ctx.putImageData(new ImageData(rgba, frame.width, frame.height), 0, 0)
}

/**
 * Render the planned scene at `seconds` and put it on screen.
 *
 * The scene is re-read from `plan` on every pass of the loop rather than
 * captured once: a reflow during an `await` can swap in a re-scaled scene, and
 * finishing the old one would paint a plate the current layout is not sized
 * for.
 */
async function draw(seconds: number): Promise<void> {
  if (painting) {
    pendingTime = seconds
    return
  }
  painting = true
  let at = seconds
  try {
    for (;;) {
      pendingTime = undefined
      const scene = plan.scene
      if (scene === undefined) break
      paint(await renderFrame(scene, at, surface, cache))
      renderProblem = undefined
      if (pendingTime === undefined) break
      at = pendingTime
    }
  } catch (err) {
    renderProblem = describeError(err)
  } finally {
    painting = false
    showNotices()
  }
}

/* ------------------------------------------------------------ the display */

/**
 * Write the plan's geometry onto the plate.
 *
 * All four numbers come from `scale.ts` through `playerPlan`; none is computed
 * here. `player.css` deliberately declares no width, height or
 * `image-rendering` for the plate, so these inline values are the only opinion
 * in the system — `canvas { width: 100% }` plus `image-rendering: pixelated`
 * IS the original defect this project was fixed for.
 *
 * The offsets are written as margins rather than as a flex centring, because
 * `snapOffset` has already rounded them to land the plate's origin on a whole
 * device pixel; `margin: auto` would recompute its own half-leftover and
 * reintroduce the fractional origin that cost 1.745% of device pixels in the
 * measurement `scale.ts` records.
 */
function applyGeometry(): void {
  const current = dom
  if (current === undefined) return
  const canvas = roleEl<HTMLCanvasElement>(current, ROLE_CANVAS)
  canvas.style.imageRendering = plan.imageRendering
  const box = plan.fit === undefined ? undefined : boxOf(plan.fit)
  // An absent fit means there is nothing to show; clearing rather than leaving
  // the previous plan's numbers, so a scene that stops loading does not keep a
  // stale frame at a stale size.
  canvas.style.width = box === undefined ? '' : `${box.cssWidth}px`
  canvas.style.height = box === undefined ? '' : `${box.cssHeight}px`
  canvas.style.marginLeft = box === undefined ? '' : `${box.offsetX}px`
  canvas.style.marginTop = box === undefined ? '' : `${box.offsetY}px`
}

/**
 * Put the transport in step with the playhead.
 *
 * The scrubber is indexed in **frames**, not seconds: `renderFrame` is only
 * well-defined on the grid `frameTimes` enumerates, so a slider in seconds
 * would hand the transport times it has to snap anyway, and the snapping would
 * make the thumb jump under the finger.
 *
 * The label is `chromedom.ts`'s, not chosen here. It used to be — `playing ?
 * 'Pause' : 'Play'` on this line — which made it the only user-visible string
 * in the player decided in a file no test in this repo can reach, while every
 * other label came from the rendering table.
 */
function syncTransport(seconds: number): void {
  const current = dom
  if (current === undefined) return
  roleEl(current, ROLE_PLAY).textContent = playLabelFor(driver?.playing() === true)
  const scene = plan.scene
  if (scene === undefined) return
  const seek = roleEl<HTMLInputElement>(current, ROLE_SEEK)
  const times = frameTimesOf(scene)
  seek.min = '0'
  seek.max = String(times.length - 1)
  seek.step = '1'
  seek.value = String(frameIndexAt(scene, seconds))
}

/**
 * Show or hide the chrome, per `chromeVisible`.
 *
 * `playing` is read from the driver at the moment of the decision rather than
 * stored when it changed: the policy's whole point is that a **paused** player
 * keeps its controls, and a stale flag would hide them exactly when the user
 * has no other way to resume.
 *
 * `hidden`, not a class: `player.css` declares no `display` for the transport
 * precisely so the attribute's user-agent rule still works.
 */
function refreshChrome(): void {
  const current = dom
  if (current === undefined) return
  activity = { lastActivityMs: activity.lastActivityMs, playing: driver?.playing() === true }
  roleEl(current, ROLE_TRANSPORT).hidden = !chromeVisible(activity, Date.now())
}

function bumpActivity(): void {
  activity = noteActivity(activity, Date.now())
  refreshChrome()
  if (hideTimer !== undefined) clearTimeout(hideTimer)
  // One shot, re-armed on every activity: `chromeVisible` is a pure function
  // of the clock, so the only thing a timer has to do is ask it again once the
  // idle window has elapsed.
  hideTimer = window.setTimeout(refreshChrome, CHROME_IDLE_MS)
}

/**
 * Everything the player did other than what the URL asked for, in one place a
 * user can read.
 *
 * `playerPlan` fixes the order — environment, parameters, scene, fit — so the
 * first line is the same first line on every machine. The font and render
 * problems are appended rather than interleaved: they are facts about this
 * page's run, not about the link.
 */
function showNotices(): void {
  const lines = [
    ...plan.notices.map(n => n.message),
    ...(fontProblem === undefined ? [] : [fontProblem]),
    ...(renderProblem === undefined ? [] : [renderProblem]),
  ]
  noticeBox.textContent = lines.join(' ')
  noticeBox.hidden = lines.length === 0
}

/* --------------------------------------------------------------- reflow */

/**
 * What a plan depends on, as a string, so an identical environment can be
 * recognised and skipped.
 *
 * Change detection, not policy: a `ResizeObserver` fires when the mount's box
 * changes, and writing a plate into the mount can change that box (a scrollbar
 * appears), so without this an oversized plate would ping-pong the observer
 * forever. Everything in the key is an input to `playerPlan`; the URL is not,
 * because a fragment change is a different scene and is not a reflow.
 */
function environmentKey(): string {
  return `${mount.clientWidth}x${mount.clientHeight}@${window.devicePixelRatio}:${fullscreen()}`
}

function reflow(): void {
  const key = environmentKey()
  if (key === appliedKey && dom !== undefined) return
  appliedKey = key

  plan = planNow()
  const next = plan
  // Rebuild the tree only when the framing changed, because a rebuild throws
  // away the elements and their listeners. This is a comparison against what
  // is already applied, not a decision about what the framing should be —
  // `chromeSpec` made that one, and the tree it returns is the only thing
  // consulted here.
  if (dom === undefined || next.framing !== appliedFraming) {
    appliedFraming = next.framing
    dom = mountChrome(next)
  }
  // The scene object is fresh on every plan (`validateScene` rebuilds it), and
  // under `fit=render` it is also a different *size*, so the rasters cached
  // against the previous one are at best useless and at worst wrong.
  cache = createRasterCache()
  applyGeometry()
  refreshChrome()
  showNotices()
  const at = driver?.time() ?? firstTime()
  syncTransport(at)
  void draw(at)
}

/** Scene time to show when nothing is driving the clock yet. */
function firstTime(): number {
  const scene = plan.scene
  return scene === undefined ? 0 : timeOfFrame(scene, 0)
}

/* ---------------------------------------------------------------- watches */

/**
 * Re-plan when the device pixel ratio changes — a window dragged to a monitor
 * with a different scale factor, or a browser zoom.
 *
 * There is no `devicePixelratiochange` event. The portable idiom is a media
 * query pinned to the *current* ratio, which stops matching the moment it
 * changes; it is one-shot by construction, so it is re-armed against the new
 * ratio each time. Without it an integer-snapped plate keeps its old scale and
 * every plate pixel lands on a fractional device pixel, which is the exact
 * defect `scale.ts` exists to prevent and is invisible except as softness.
 */
function watchDpr(): void {
  if (typeof window.matchMedia !== 'function') return
  const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  const onChange = (): void => {
    query.removeEventListener('change', onChange)
    reflow()
    watchDpr()
  }
  query.addEventListener('change', onChange)
}

/**
 * Re-plan when the container changes size.
 *
 * A `ResizeObserver` on the mount rather than a `resize` listener on the
 * window: the player's container is an `<iframe>` on somebody else's page as
 * often as it is a window (R14), and an iframe resized by its host's layout
 * fires no window `resize` in every engine. The window listener is kept as the
 * fallback for an engine without the observer.
 */
function watchSize(): void {
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => reflow()).observe(mount)
  else window.addEventListener('resize', reflow)
}

/* ------------------------------------------------------------------ boot */

async function boot(): Promise<void> {
  // Before the first render, not alongside it. `@font-face` *declares* the
  // vendored family (`playerpage.css`); only this *loads* it, and canvas text
  // never triggers a lazy load because it is not DOM text. `ctx.fillText` with
  // a declared-but-unloaded family does not wait and does not fail — it draws
  // in a fallback face, and the picture is then merely measured wrong. The
  // same shape of silent failure as `sans-serif` resolving to dingbats in
  // `@napi-rs/canvas`, one layer up.
  const font = await loadVendoredFont()
  fontProblem = font.problem

  plan = planNow()
  appliedKey = environmentKey()
  appliedFraming = plan.framing
  dom = mountChrome(plan)
  applyGeometry()
  showNotices()

  const scene = plan.scene
  if (scene !== undefined) {
    driver = runTransport({
      // `performance.now` and not `Date.now`: monotonic, so a system clock
      // adjustment mid-playback cannot send the playhead backwards.
      now: () => performance.now(),
      schedule: (fn, ms) => window.setTimeout(fn, ms),
      cancel: handle => { window.clearTimeout(handle) },
      onFrame: seconds => {
        syncTransport(seconds)
        void draw(seconds)
      },
      // The scene as planned *now*. Under `fit=render` a later reflow swaps in
      // a differently-sized scene, and the driver keeps this one — which is
      // correct, because `scaleScene` scales geometry and explicitly leaves
      // keyframe times, `duration`, `fps`, `ease` and `repeat` alone, so the
      // frame grid is the same grid either way.
      scene,
    })
  }

  // Activity is anchored at boot so the chrome starts visible and the idle
  // window starts now, rather than at the epoch.
  bumpActivity()
  syncTransport(firstTime())
  void draw(firstTime())

  // `fullscreenchange` covers the Escape key and the browser's own exit
  // affordance as well as our control, which is why nothing listens for
  // Escape directly: a key listener would miss every other way out.
  document.addEventListener('fullscreenchange', reflow)
  for (const event of ['pointermove', 'pointerdown', 'keydown'] as const) {
    window.addEventListener(event, bumpActivity, { passive: true })
  }
  watchSize()
  watchDpr()
}

void boot().catch((err: unknown) => {
  // The last resort. `playerPlan` is total, so anything reaching here is a
  // failure of the shell itself — and a blank box with a console message is
  // precisely what an embedder cannot debug.
  noticeBox.textContent = describeError(err)
  noticeBox.hidden = false
})
