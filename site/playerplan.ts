/**
 * Every decision the player makes about a URL and a box, as one pure function.
 *
 * ## Why the whole policy is one value
 *
 * Each module around this one decides exactly one thing — `fit.ts` reads a
 * parameter, `scale.ts` does arithmetic, `scalescene.ts` accepts or refuses,
 * `playerchrome.ts` says what boxes exist. None of them can answer "what should
 * the player do with *this* link in *this* iframe", because that answer is the
 * composition of all of them, and a composition written inline in a resize
 * handler is a composition no test in this repo can reach: the test environment
 * is plain node with neither jsdom nor happy-dom, and design §12 excludes
 * component DOM from testing outright.
 *
 * So the player is split in two. This function holds the decisions and returns
 * them as data; the imperative shell executes the plan and holds none. The line
 * is not stylistic — it is what makes "an embed with a broken link still shows
 * something and explains itself" an assertion rather than an aspiration.
 *
 * ## It must not throw. That is the acceptance criterion, not a nicety.
 *
 * The player is the half of this product with users who are not its author, and
 * it is loaded from URLs those users did not construct: a truncated paste, a
 * link made by an older page, an `<iframe>` whose container has not been laid
 * out yet, a `devicePixelRatio` read off a detached document. An exception
 * thrown here takes out the host page's console and leaves a blank box with no
 * explanation — strictly worse than the broken link that caused it, because the
 * embedder cannot tell the two apart.
 *
 * Every failure is therefore a {@link PlayerNotice} rather than a throw, and
 * the choice for an unloadable scene is recorded: **nothing is rendered and a
 * notice says why.** The alternative considered was substituting a placeholder
 * scene so the box is never empty; it was rejected because it puts a picture on
 * somebody else's page that their link does not describe, and a viewer has no
 * way to tell a substituted scene from the one the author meant.
 *
 * ## What is NOT decided here
 *
 * Playback. `site/transport.ts` and `site/transportdriver.ts` own time, and a
 * plan that carried a playhead would be a plan that went stale between frames.
 * This function is called on load, on resize, on a dpr change and on entering
 * or leaving fullscreen — the events that change *what the player is*, not
 * *where it is up to*.
 */

import { fitNotice, parseFit } from './fit.js'
import type { FitMode } from './fit.js'
import { parseSceneHash } from './hash.js'
import { chromeSpec } from './playerchrome.js'
import type { ChromeNode, Framing } from './playerchrome.js'
import { isPresenting } from './present.js'
import { planFit } from './scale.js'
import type { FitPlan, PlanFitInput } from './scale.js'
import { scaleScene } from './scalescene.js'
import { validateScene } from './scene.js'
import { imageRenderingFor, parseSmooth } from './smooth.js'
import type { SmoothMode } from './smooth.js'
import type { Scene } from '../src/core/types.js'

/* ------------------------------------------------------------- the notices */

/**
 * Why the player did something other than what the URL asked for.
 *
 * Machine-readable, because the shell has to decide *where* to put each one —
 * a scene that will not load is a message in the middle of an empty box, while
 * a fit mode that fell back is a footnote — and parsing prose to find out is
 * how two renderings of the same notice drift apart.
 */
export type PlayerNoticeCode =
  /** The fragment is empty. A first visit, or an `<iframe src>` with no scene. */
  | 'no-scene'
  /** The fragment is present and `parseSceneHash` could not read it. */
  | 'unreadable-scene'
  /** The fragment decoded to JSON that is not a valid scene. */
  | 'invalid-scene'
  /** A fit mode we understand and deliberately do not offer — `cover`. */
  | 'fit-rejected'
  /** `fit=render` asked for, and `scaleScene` refused this scene. */
  | 'fit-refused'
  /** The scene loaded but its geometry could not be measured at all. */
  | 'fit-unplannable'
  /** The container measured zero, so there is nowhere to draw yet. */
  | 'container-unmeasured'
  /** `dpr` was zero, negative or not a number. */
  | 'dpr-unusable'

/**
 * Every code, as a value.
 *
 * Exported so that a test can enumerate them and so that a shell can route all
 * of them exhaustively; the array and the union are kept in step by the
 * `satisfies` below, which fails to compile if either grows alone.
 */
export const PLAYER_NOTICE_CODES = [
  'no-scene',
  'unreadable-scene',
  'invalid-scene',
  'fit-rejected',
  'fit-refused',
  'fit-unplannable',
  'container-unmeasured',
  'dpr-unusable',
] as const satisfies readonly PlayerNoticeCode[]

/** Errors unless its argument is `never` — the repo's exhaustiveness idiom. */
type AssertNever<T extends never> = T

/**
 * `satisfies` above catches a member of the array that is not in the union;
 * this catches a member of the union that is not in the array. Both directions
 * are needed, and they fail in different places on purpose.
 */
type _NoCodeMissing = AssertNever<Exclude<PlayerNoticeCode, typeof PLAYER_NOTICE_CODES[number]>>

/**
 * The first sentence of each notice: what happened, in the player's own voice.
 *
 * Separate from the *reason*, which always comes from whichever module recorded
 * it — `REJECTED_FIT_MODES[…].reason`, `SCALE_REFUSALS[…].explanation`, the
 * decoder's own error text. This module states the consequence and quotes the
 * cause; it never paraphrases a cause, because a paraphrase is a second copy
 * that drifts.
 */
export const NOTICE_HEADLINES: Record<PlayerNoticeCode, string> = {
  'no-scene': 'This link carries no scene, so there is nothing to show.',
  'unreadable-scene': "This link's scene could not be read.",
  'invalid-scene': "This link's scene was read but is not valid.",
  'fit-rejected': 'That fit mode is not offered; showing the scene with contain instead.',
  'fit-refused': 'This scene cannot be re-rendered at a different size; showing it with contain instead.',
  'fit-unplannable': 'This scene’s size could not be worked out, so no layout was planned.',
  'container-unmeasured': 'The container has no size yet, so the layout was planned against an empty box.',
  'dpr-unusable': 'The device pixel ratio was unusable; the layout was planned at 1 instead.',
}

export interface PlayerNotice {
  readonly code: PlayerNoticeCode
  /** {@link NOTICE_HEADLINES} plus, where one exists, the recorded cause verbatim. */
  readonly message: string
}

/* --------------------------------------------------------------- the input */

/** A container's measured size, in **CSS px**. Named, because four spaces exist. */
export interface ContainerSize {
  readonly width: number
  readonly height: number
}

export interface PlayerPlanInput {
  /** `location.search`. **The parameters live here**, never in the fragment. */
  readonly search: string
  /** `location.hash`. **The scene lives here**, and nothing else does. */
  readonly hash: string
  /** The box the player has been given, in CSS px. */
  readonly container: ContainerSize
  /** `devicePixelRatio`. Coerced, never trusted — see {@link usableDpr}. */
  readonly dpr: number
  /**
   * Is the player inside an `<iframe>`?
   *
   * An input rather than a `window.self !== window.top` read, because that
   * expression is not available to a pure function and smuggling it in would
   * cost this module its entire testability for one boolean. The shell knows;
   * the shell says.
   */
  readonly embedded?: boolean
  /**
   * Is the player's wrapper currently the fullscreen element?
   *
   * Also an input, for the same reason and one more: fullscreen is a *runtime
   * state* that changes without the URL changing, so it cannot be derived from
   * `search` even in principle. The shell re-plans on `fullscreenchange`.
   */
  readonly fullscreen?: boolean
}

/* ---------------------------------------------------------------- the plan */

export interface PlayerPlan {
  /** Which of the four containers the player believes it is in. */
  readonly framing: Framing
  /**
   * The scene to render, or `undefined` when the link carries none that loads.
   *
   * For a `render` plan this is the **scaled** scene `scaleScene` produced, not
   * the authored one: the plan and the scene have to agree about the stage, and
   * handing a caller both and letting it pick is how they stop agreeing.
   */
  readonly scene: Scene | undefined
  /** What `?fit=` asked for, after `parseFit`'s fallbacks. */
  readonly requestedFit: FitMode
  /**
   * The layout, or `undefined` when there is no scene to lay out. Its `mode`
   * may differ from {@link requestedFit} — that is what a notice explains.
   */
  readonly fit: FitPlan | undefined
  /**
   * **CSS px shown ÷ backing-store px.** The ratio `imageRenderingFor` takes.
   *
   * Read from `FitPlan.displayScale` and never recomputed here: `Fit.scale` is
   * device px ÷ backing-store px and the two differ by a factor of `dpr`, which
   * is the single most likely mistake at this call site. `scale.ts` carries the
   * field precisely so this function does not have to do the division.
   *
   * With no fit plan it is `1 / dpr`: nothing is being drawn, so nothing is
   * being resampled, and one backing pixel per device pixel is the honest
   * statement of that. Defined rather than absent because a CSS property set
   * from `undefined` is a silent no-op — it would stop pixelating without
   * telling anyone, which is a defect only ever found by eye.
   */
  readonly displayScale: number
  /**
   * **Device px drawn ÷ backing-store px.** The ratio `imageRenderingFor`
   * takes, and the one the browser actually resamples by.
   *
   * Read from `FitPlan.devicePerBackingScale` and never recomputed here, for
   * the reason {@link displayScale}'s own note gives: the two ratios differ by
   * exactly `dpr` and `scale.ts` carries both so that this call site does not
   * have to choose by doing arithmetic.
   *
   * With no fit plan it is `1`: nothing is being drawn, so nothing is being
   * resampled, and one backing pixel per device pixel is the honest statement
   * of that — the same statement a re-render makes, in the same space. Defined
   * rather than absent because a CSS property set from `undefined` is a silent
   * no-op, which stops pixelating without telling anyone.
   */
  readonly devicePerBackingScale: number
  /** What `?smooth=` asked for. */
  readonly smooth: SmoothMode
  /** The CSS `image-rendering` value for this plan. */
  readonly imageRendering: 'auto' | 'pixelated'
  /** The boxes to build, from {@link chromeSpec}. */
  readonly chrome: ChromeNode
  /**
   * Everything the player did other than what was asked, in a fixed order:
   * the environment first (dpr, container), then the parameters, then the
   * scene, then the fit. Fixed so that a shell showing only the first one shows
   * the same first one on every machine.
   */
  readonly notices: readonly PlayerNotice[]
}

/* ------------------------------------------------------------- the coercion */

/**
 * Is this a `devicePixelRatio` the arithmetic can use?
 *
 * The same predicate `scale.ts` applies internally — finite and positive —
 * stated here rather than inferred, because this module has to *report* the
 * coercion that one performs silently. Two spellings of the same rule would be
 * a plan that said "dpr was fine" while the arithmetic substituted 1.
 */
function isUsableDpr(dpr: number): boolean {
  return Number.isFinite(dpr) && dpr > 0
}

/** `dpr` if usable, else 1 — `scale.ts`'s fallback, applied where it is visible. */
function usableDpr(dpr: number): number {
  return isUsableDpr(dpr) ? dpr : 1
}

/** A measured length if it is one, else 0 — again matching `scale.ts`. */
function usableLength(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/** An error's message, for a notice, without assuming it is an `Error`. */
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/* ------------------------------------------------------------- the framing */

/**
 * Which container the player believes it is in.
 *
 * **Precedence: fullscreen, then embed, then present, then inline**, and the
 * order is an argument rather than an accident of which `if` came first.
 *
 * - `fullscreen` is a runtime state the user just entered and it outranks
 *   everything: whatever the URL says, the wrapper is filling a screen now.
 * - `embed` outranks `present` because being in an `<iframe>` is a **fact about
 *   the box** — a third party chose its size and owns the page around it —
 *   while `?present=1` is a **request inside a URL that third party pasted**.
 *   The fact wins. They do not conflict about layout in any case: `chromeSpec`
 *   gives both an overlaid transport, so the only thing riding on the order is
 *   which name the plan reports.
 */
function framingOf(input: PlayerPlanInput): Framing {
  if (input.fullscreen === true) return 'fullscreen'
  if (input.embedded === true) return 'embed'
  return isPresenting(input.search) ? 'present' : 'inline'
}

/* --------------------------------------------------------------- the scene */

/** What {@link loadScene} found: a scene, or the reason there is not one. */
interface SceneLoad {
  readonly scene?: Scene
  readonly notice?: PlayerNotice
}

/**
 * The scene the fragment carries, or a notice saying why there is not one.
 *
 * Three failure modes and three codes, because a shell should be able to tell
 * them apart without reading English: an absent fragment is a first visit and
 * not an error at all, an unreadable one is almost always a truncated paste,
 * and an invalid one is a scene that decoded perfectly and means nothing.
 *
 * `parseSceneHash` is called inside the `try` rather than guarded by a type
 * check: `hash` is typed `string` but arrives from a caller we do not control,
 * and a non-string would throw inside `String.prototype.replace`. Catching is
 * both shorter and more total than checking.
 */
function loadScene(hash: string): SceneLoad {
  let decoded: unknown
  try {
    decoded = parseSceneHash(hash)
  } catch (err) {
    return { notice: notice('unreadable-scene', messageOf(err)) }
  }
  if (decoded === undefined) return { notice: notice('no-scene') }
  try {
    return { scene: validateScene(decoded) }
  } catch (err) {
    return { notice: notice('invalid-scene', messageOf(err)) }
  }
}

function notice(code: PlayerNoticeCode, cause?: string): PlayerNotice {
  return {
    code,
    message: cause === undefined ? NOTICE_HEADLINES[code] : `${NOTICE_HEADLINES[code]} ${cause}`,
  }
}

/* ----------------------------------------------------------------- the fit */

/** What {@link planLayout} decided: a layout, the scene to draw, and any notice. */
interface LayoutChoice {
  readonly fit?: FitPlan
  readonly scene: Scene | undefined
  readonly notice?: PlayerNotice
}

/**
 * The layout for a loaded scene, falling back where a mode cannot be honoured.
 *
 * ## Why `render` is conditional and the other two are not
 *
 * `contain` and `snap` are arithmetic over a backing store and always have an
 * answer. `render` re-authors the scene smaller, which requires knowing which
 * numbers in it are lengths in scene px — and for a raster layer, an unsized
 * text layer or a preset whose parameters carry no unit, that is not knowable
 * (see `scalescene.ts`). `scaleScene` therefore returns a discriminated refusal
 * rather than throwing or guessing, and **this is the call site that refusal
 * was designed for**: the player drops to `contain`, keeps the authored scene,
 * and carries the refusal's own explanation so a user who asked for `render`
 * and got `contain` is told why.
 *
 * The whole thing is wrapped in one `try`. `plateLayoutOf` throws for a scene
 * whose stereo settings cannot produce margins, and while `validateScene` makes
 * that nearly unreachable, "nearly" is not a property an embed can rely on.
 */
function planLayout(scene: Scene, mode: FitMode, args: PlanFitInput): LayoutChoice {
  try {
    if (mode !== 'render') return { fit: planFit(mode, args), scene }
    const planned = planFit('render', args)
    if (planned.kind !== 'rerender') return { fit: planned, scene }
    const scaled = scaleScene(scene, planned.plan)
    if (scaled.ok) return { fit: planned, scene: scaled.scene }
    return {
      fit: planFit('contain', args),
      scene,
      notice: notice('fit-refused', `${scaled.detail.reason}: ${scaled.detail.explanation}`),
    }
  } catch (err) {
    return { scene, notice: notice('fit-unplannable', messageOf(err)) }
  }
}

/* -------------------------------------------------------------- the whole */

/**
 * What the player should do with this URL in this box.
 *
 * Pure: it reads its argument, calls pure functions, and allocates a result. It
 * never touches `location`, `window`, `document` or a clock, which is what lets
 * the entire policy be exercised in plain node — and what lets P3 lift the
 * player into the editor shell without unpicking anything.
 */
export function playerPlan(input: PlayerPlanInput): PlayerPlan {
  const notices: PlayerNotice[] = []

  // The environment first: both of these are coerced by the arithmetic
  // downstream whether or not anyone is told, so they are reported before
  // anything that depends on them.
  const dpr = usableDpr(input.dpr)
  if (!isUsableDpr(input.dpr)) {
    notices.push(notice('dpr-unusable', `Got ${JSON.stringify(input.dpr)}.`))
  }
  const width = usableLength(input.container?.width)
  const height = usableLength(input.container?.height)
  if (width <= 0 || height <= 0) {
    notices.push(notice(
      'container-unmeasured',
      `Measured ${JSON.stringify(input.container?.width)}x${JSON.stringify(input.container?.height)} CSS px.`,
    ))
  }

  // Then the parameters. `parseFit` and `parseSmooth` are total; the only thing
  // that can need saying is a mode we understand and refuse, which `fitNotice`
  // answers with the recorded argument rather than a generic complaint.
  const requestedFit = parseFit(input.search)
  const rejected = fitNotice(input.search)
  if (rejected !== undefined) {
    notices.push(notice('fit-rejected', `“${rejected.requested}”: ${rejected.reason}`))
  }
  const smooth = parseSmooth(input.search)

  // Then the scene — from the fragment, and from nowhere else.
  const loaded = loadScene(input.hash)
  if (loaded.notice !== undefined) notices.push(loaded.notice)

  // Then the layout, which needs all of the above.
  let fit: FitPlan | undefined
  let scene = loaded.scene
  if (loaded.scene !== undefined) {
    const chosen = planLayout(loaded.scene, requestedFit, {
      scene: loaded.scene,
      availableWidth: width,
      availableHeight: height,
      dpr,
    })
    fit = chosen.fit
    scene = chosen.scene
    if (chosen.notice !== undefined) notices.push(chosen.notice)
  }

  const displayScale = fit?.displayScale ?? 1 / dpr
  const devicePerBackingScale = fit?.devicePerBackingScale ?? 1
  // One `framingOf`, not two: the chrome and the reported framing must be the
  // same answer, and two calls to a function with no reason to disagree is
  // still two places for a later edit to make them disagree.
  const framing = framingOf(input)
  return {
    framing,
    scene,
    requestedFit,
    fit,
    displayScale,
    devicePerBackingScale,
    smooth,
    imageRendering: imageRenderingFor(smooth, devicePerBackingScale),
    chrome: chromeSpec(framing),
    notices,
  }
}
