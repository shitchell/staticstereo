import { describe, expect, it } from 'vitest'
import {
  NOTICE_HEADLINES,
  PLAYER_NOTICE_CODES,
  playerPlan,
} from './playerplan.js'
import type { PlayerNoticeCode, PlayerPlan, PlayerPlanInput } from './playerplan.js'
import { MAX_SCENE_SCALE } from './scale.js'
import type { RenderFit } from './scale.js'
import { REJECTED_FIT_MODES, parseFit } from './fit.js'
import { imageRenderingFor, parseSmooth } from './smooth.js'
import { SCALE_REFUSALS } from './scalescene.js'
import { FRAMING_NAMES, ROLE_CANVAS, ROLE_TRANSPORT, nodesOf } from './playerchrome.js'
import { bytesToBase64Url, encodeSceneHash, parseSceneHash } from './hash.js'
import { validateScene } from './scene.js'
import type { Framing } from './playerchrome.js'
import type { Layer, Scene } from '../src/core/types.js'

/**
 * `playerPlan` — every decision the player makes, as one pure function.
 *
 * Two things are being tested and they fail differently.
 *
 * **Composition.** Each decision already has its own module and its own suite;
 * what nobody else can see is whether this function wires them to each other
 * correctly. So the assertions here are mostly of the form "the plan agrees
 * with the module it delegated to", computed by calling that module directly
 * rather than by pinning a value — a pinned value would go stale the day a
 * policy changes and would then be asserting the old policy.
 *
 * **Totality.** The player is loaded from URLs its users did not construct, and
 * an embed that throws takes out the host page's console and shows a blank box
 * with no explanation. The malformed-input table at the bottom is therefore not
 * a nicety: it is the acceptance criterion, and it asserts the absence of a
 * throw explicitly rather than relying on the other tests not crashing.
 *
 * House style per `markup.test.ts`: every enumeration-driven assertion carries
 * a vacuity floor, so a loop that silently stops iterating cannot pass.
 */

/* ------------------------------------------------------------- the fixtures */

/** A scene `scaleScene` accepts: shape geometry only, no raster, sized text. */
function scalableScene(): Scene {
  return {
    size: [320, 160],
    fps: 12,
    duration: 1,
    layers: [
      { type: 'shape', shape: 'rect', w: 16, h: 8, at: [4, 8] },
      { type: 'text', text: 'HI', size: 32, at: [40, 40] },
    ],
  }
}

/**
 * A scene `scaleScene` refuses, and one the *validator* accepts — both halves
 * matter. A scene the validator rejected would exercise the invalid-scene path
 * instead and the refusal would never be reached.
 */
function unscalableScene(): Scene {
  const image: Layer = { type: 'image', src: 'logo.png', at: [4, 8] }
  return { size: [320, 160], fps: 12, duration: 1, layers: [image] }
}

/**
 * A scene small enough to reach `MAX_SCENE_SCALE` in an ordinary container.
 *
 * 8x8 scene px, so the cap engages in a box under about 1600 CSS px wide at
 * dpr 1 — which is to say, in a perfectly normal `<iframe>` rather than in a
 * deliberately absurd one. The size is the whole point of the fixture and the
 * shape is incidental; it is a `shape` layer because that is what `scaleScene`
 * accepts without a sized-text or raster refusal getting in the way first.
 */
function tinyScene(): Scene {
  return {
    size: [8, 8],
    fps: 12,
    duration: 1,
    layers: [{ type: 'shape', shape: 'rect', w: 4, h: 4, at: [2, 2] }],
  }
}

const SCALABLE_HASH = `#${encodeSceneHash(scalableScene())}`
const UNSCALABLE_HASH = `#${encodeSceneHash(unscalableScene())}`
const TINY_HASH = `#${encodeSceneHash(tinyScene())}`

/** The refusal the unscalable fixture earns, read from the record, not retyped. */
const RASTER_REFUSAL = SCALE_REFUSALS['raster-geometry']

function at(input: Partial<PlayerPlanInput> = {}): PlayerPlanInput {
  return {
    search: '',
    hash: SCALABLE_HASH,
    container: { width: 800, height: 600 },
    dpr: 1,
    ...input,
  }
}

function codes(input: PlayerPlanInput): PlayerNoticeCode[] {
  return playerPlan(input).notices.map(n => n.code)
}

/* ---------------------------------------------------------------- defaults */

describe('the defaults, which are what an embedder who typed nothing gets', () => {
  it('is contain, auto and the inline framing for an empty query', () => {
    const plan = playerPlan(at())
    expect(plan.requestedFit).toBe('contain')
    expect(plan.fit?.mode).toBe('contain')
    expect(plan.smooth).toBe('auto')
    expect(plan.framing).toBe('inline')
    expect(plan.notices).toEqual([])
  })

  it('loads the scene the fragment carries, validated', () => {
    const plan = playerPlan(at())
    // Not `toEqual(scalableScene())` by luck: the validator rebuilds field by
    // field, so this also pins that the plan hands back the validated object
    // rather than the raw decode.
    expect(plan.scene).toEqual(validateScene(parseSceneHash(SCALABLE_HASH)))
  })

  it('carries a chrome tree with a canvas and a transport in it', () => {
    const roles = nodesOf(playerPlan(at()).chrome).map(n => n.role)
    expect(roles.length).toBeGreaterThanOrEqual(5)
    expect(roles).toContain(ROLE_CANVAS)
    expect(roles).toContain(ROLE_TRANSPORT)
  })
})

/* ---------------------------------------------------------------- framings */

describe('the framing', () => {
  it('is present for ?present=1 and inline for its absence', () => {
    expect(playerPlan(at({ search: '?present=1' })).framing).toBe('present')
    expect(playerPlan(at({ search: '?present=0' })).framing).toBe('inline')
  })

  it('is embed when the shell says it is in an iframe', () => {
    expect(playerPlan(at({ embedded: true })).framing).toBe('embed')
  })

  /**
   * **The precedence, stated.** Being in an `<iframe>` is a *fact about the
   * box* — a third party chose its size and owns the page around it — while
   * `?present=1` is a *request inside a URL that same third party pasted*. The
   * fact wins over the request. They do not in fact conflict about layout
   * (`chromeSpec` gives both an overlaid transport), so the only thing riding
   * on this is which name the plan reports; stating it means a later reader
   * does not have to guess which one the code happened to check first.
   *
   * `fullscreen` outranks both for the same reason one step further on: it is
   * a runtime state the user just entered, it is the most specific of the
   * three, and the element being fullscreened is the player's own wrapper.
   */
  it('prefers embed over present, and fullscreen over both', () => {
    expect(playerPlan(at({ search: '?present=1', embedded: true })).framing).toBe('embed')
    expect(playerPlan(at({ search: '?present=1', fullscreen: true })).framing).toBe('fullscreen')
    expect(playerPlan(at({ embedded: true, fullscreen: true })).framing).toBe('fullscreen')
  })

  it('only ever reports a framing the chrome module knows', () => {
    const seen = new Set<Framing>()
    for (const search of ['', '?present=1']) {
      for (const embedded of [false, true]) {
        for (const fullscreen of [false, true]) {
          seen.add(playerPlan(at({ search, embedded, fullscreen })).framing)
        }
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(3)
    for (const framing of seen) expect(FRAMING_NAMES).toContain(framing)
  })
})

/* -------------------------------------------------------------------- fit */

describe('the fit plan', () => {
  it('produces the plan kind each mode is defined by', () => {
    expect(playerPlan(at({ search: '?fit=contain' })).fit).toMatchObject({
      kind: 'rescale', mode: 'contain',
    })
    expect(playerPlan(at({ search: '?fit=snap' })).fit).toMatchObject({
      kind: 'rescale', mode: 'snap',
    })
    expect(playerPlan(at({ search: '?fit=render' })).fit).toMatchObject({
      kind: 'rerender', mode: 'render',
    })
  })

  it('re-renders only a scene scaleScene accepts', () => {
    // The whole point of the discriminated refusal: same query, same container,
    // different scene, different plan kind.
    expect(playerPlan(at({ search: '?fit=render' })).fit?.kind).toBe('rerender')
    expect(
      playerPlan(at({ search: '?fit=render', hash: UNSCALABLE_HASH })).fit?.kind,
    ).toBe('rescale')
  })

  it('hands the render plan a SCALED scene, not the authored one', () => {
    const plan = playerPlan(at({ search: '?fit=render', container: { width: 200, height: 100 } }))
    expect(plan.fit?.kind).toBe('rerender')
    // The stage the rasteriser is handed is the plan's floored size. Asserted
    // against the plan rather than against a number, because the number is
    // `renderFit`'s to choose.
    const fit = plan.fit!
    expect(fit.kind === 'rerender' && plan.scene?.size).toEqual(
      fit.kind === 'rerender' ? [fit.plan.sceneWidth, fit.plan.sceneHeight] : undefined,
    )
    expect(plan.scene).not.toEqual(scalableScene())
  })

  it('falls back to contain for a refused scene, and says why in the refusal’s own words', () => {
    const plan = playerPlan(at({ search: '?fit=render', hash: UNSCALABLE_HASH }))
    expect(plan.requestedFit).toBe('render')
    expect(plan.fit).toMatchObject({ kind: 'rescale', mode: 'contain' })
    const notice = plan.notices.find(n => n.code === 'fit-refused')
    expect(notice, 'the refusal produced no notice').toBeDefined()
    // Against the record, never against a copied string: a reworded
    // explanation must not need this test edited, and a notice that stopped
    // quoting the record must fail.
    expect(notice!.message).toContain(RASTER_REFUSAL.explanation)
    expect(notice!.message).toContain(RASTER_REFUSAL.reason)
    // ...and the picture it shows is the authored scene, unscaled.
    expect(plan.scene).toEqual(validateScene(parseSceneHash(UNSCALABLE_HASH)))
  })

  it('refuses the same scene at every container size, not just the small ones', () => {
    // `scaleScene` decides on structure alone, before it reads the plan. If
    // this function ever asked it only when the scale was below 1, a user would
    // get `render` on a big screen and `contain` on a small one.
    for (const box of [{ width: 100, height: 50 }, { width: 4000, height: 3000 }]) {
      const plan = playerPlan(at({ search: '?fit=render', hash: UNSCALABLE_HASH, container: box }))
      expect(plan.fit?.mode, `${box.width}x${box.height}`).toBe('contain')
    }
  })

  it('falls back to contain for ?fit=cover, carrying the recorded reason', () => {
    const plan = playerPlan(at({ search: '?fit=cover' }))
    expect(plan.requestedFit).toBe(parseFit('?fit=cover'))
    expect(plan.fit).toMatchObject({ kind: 'rescale', mode: 'contain' })
    const notice = plan.notices.find(n => n.code === 'fit-rejected')
    expect(notice, 'cover produced no notice').toBeDefined()
    expect(notice!.message).toContain(REJECTED_FIT_MODES['cover']!.reason)
  })

  it('says nothing about a merely-unknown fit value, which has no recorded reason', () => {
    expect(codes(at({ search: '?fit=wibble' }))).toEqual([])
    expect(playerPlan(at({ search: '?fit=wibble' })).fit?.mode).toBe('contain')
  })
})

/* --------------------------------------------------- the scene-scale clamp */

/**
 * `renderFit` bounds `sceneScale` at both ends and reports it through
 * `RenderFit.clamped`, and until this block **nothing surfaced that to a
 * user**: the flag was computed, asserted in `scale.test.ts`, and read by no
 * production code anywhere in `site/` or `src/`. The two outcomes it reports
 * are both visible and neither is self-explanatory — a small scene letterboxed
 * at 64x inside a large `<iframe>`, and a plate that overflows a box too small
 * to hold one scene pixel — so the player showed somebody else's page a
 * picture that was not the size their link asked for and said nothing about it.
 *
 * `render` is the only mode that can clamp: the other two are arithmetic over
 * an already-rendered backing store and always have an answer.
 *
 * Both directions are asserted, and the direction in each assertion is read
 * off `RenderFit.overflows` rather than typed in — the notice states the
 * measured relation of the plate to the box, so pinning the word here would be
 * pinning the message instead of the property.
 */
describe('the scene-scale clamp is reported, not applied silently', () => {
  /** The cap, as `renderFit` bounds it. Imported, never retyped. */
  const capped = (): PlayerPlan => playerPlan(at({
    search: '?fit=render',
    hash: TINY_HASH,
    container: { width: 1600, height: 1200 },
  }))

  /**
   * The floor: a box that cannot hold even a one-pixel stage. Reachable from a
   * link — a 1 CSS px tall `<iframe>` is legal — unlike the sub-pixel-scene
   * hole `renderFit`'s own contract records, which `requireSize` makes
   * unreachable from a parsed scene.
   */
  const floored = (): PlayerPlan => playerPlan(at({
    search: '?fit=render',
    container: { width: 800, height: 1 },
  }))

  const renderPlan = (plan: PlayerPlan): RenderFit => {
    const fit = plan.fit
    expect(fit?.kind, 'not a re-render, so there is no clamp to report').toBe('rerender')
    return (fit as { plan: RenderFit }).plan
  }

  it('reaches both bounds, so neither case below is vacuous', () => {
    // The premise of every assertion here, read off the plan rather than
    // assumed from the container sizes: a cap that stopped engaging would make
    // the notice assertions pass for the wrong reason.
    const cap = renderPlan(capped())
    expect(cap.clamped, 'the cap did not engage').toBe(true)
    expect(cap.sceneScale).toBe(MAX_SCENE_SCALE)
    expect(cap.overflows, 'the cap letterboxes inside the box').toBe(false)
    const floor = renderPlan(floored())
    expect(floor.clamped, 'the floor did not engage').toBe(true)
    expect(floor.sceneScale).toBeLessThan(MAX_SCENE_SCALE)
    expect(floor.overflows, 'the floor hands back a plate bigger than the box').toBe(true)
  })

  it('tells a user whose scene was letterboxed by the cap that it was', () => {
    const plan = capped()
    const notice = plan.notices.find(n => n.code === 'render-scale-clamped')
    expect(
      notice,
      'the cap engaged and the plan carries no notice, so an embed shows a picture smaller ' +
      'than the box it was given and explains nothing',
    ).toBeDefined()
    expect(notice!.message).toContain(NOTICE_HEADLINES['render-scale-clamped'])
    // What happened to the picture, in the terms a viewer can check against
    // what they can see. Derived from the plan, not typed.
    expect(notice!.message).toContain(renderPlan(plan).overflows ? 'larger' : 'smaller')
  })

  it('and tells one whose box was too small the other thing, which is the opposite', () => {
    const plan = floored()
    const notice = plan.notices.find(n => n.code === 'render-scale-clamped')
    expect(notice, 'the floor engaged and the plan carries no notice').toBeDefined()
    expect(notice!.message).toContain(renderPlan(plan).overflows ? 'larger' : 'smaller')
    // One code, two directions, and they must not read alike: a single
    // sentence covering both would be a notice that tells a viewer nothing
    // they could not already see.
    expect(notice!.message).not.toBe(
      capped().notices.find(n => n.code === 'render-scale-clamped')!.message,
    )
  })

  it('says nothing for a render the container could be honoured at', () => {
    // The ordinary case, and the thing a notice on every render would destroy:
    // a player that complains about every link teaches an embedder to ignore
    // the strip.
    const plan = playerPlan(at({ search: '?fit=render' }))
    expect(renderPlan(plan).clamped, 'the default box clamps, so this proves nothing').toBe(false)
    expect(codes(at({ search: '?fit=render' }))).toEqual([])
  })

  it('is not produced by the modes that cannot clamp', () => {
    for (const mode of ['contain', 'snap']) {
      // Same tiny scene, same large box — the one that caps under `render`.
      const plan = playerPlan(at({
        search: `?fit=${mode}`,
        hash: TINY_HASH,
        container: { width: 1600, height: 1200 },
      }))
      expect(plan.fit?.kind, mode).toBe('rescale')
      expect(plan.notices.map(n => n.code), mode).not.toContain('render-scale-clamped')
    }
  })
})

/* ------------------------------------------------------- the dpr factor */

/**
 * **The mistake most likely to ship, asserted over a sweep — and the sweep
 * below used to assert the mistake.**
 *
 * This docblock read: *"`smooth.ts`'s `displayScale` is CSS px ÷ backing-store
 * px; `scale.ts`'s `Fit.scale` is device px ÷ backing-store px. They differ by
 * a factor of `dpr`, so a plan that handed `Fit.scale` to `imageRenderingFor`
 * would call a 1x plate on a dpr-2 panel an upscale and pixelate a picture
 * that is in fact being halved — visible to nobody but the eye."*
 *
 * The two definitions in the first sentence are correct. The conclusion is
 * backwards, and the sweep was written to enforce it. A 1x plate on a dpr-2
 * panel is not being halved: each backing pixel covers a **2x2 block of device
 * pixels**, and `pixelated` — nearest-neighbour, exactly lossless at an integer
 * factor — is the right hint for it. `image-rendering` hints at one step,
 * backing store onto the **device grid**; CSS px are a layout unit and nothing
 * is resampled into them. So the hint follows device px ÷ backing-store px.
 *
 * "Visible to nobody but the eye" was the accurate part, and it is why this
 * stayed green: at dpr 1 the two ratios are the same number.
 *
 * Both ratios are still swept, and neither expectation is read out of the plan
 * field it is checking — that would be `x === x`. {@link cssPerBackingFromDefinition}
 * recomputes the CSS one and {@link devicePerBackingFromDefinition} the device
 * one, each from the widths and the caller's own `dpr`, which is the only route
 * that catches a `dpr` dropped or applied twice inside `scale.ts`.
 *
 * ## `PlayerPlan` no longer carries the CSS ratio, and this is where that shows
 *
 * It used to, as `PlayerPlan.displayScale`, and **this file was its only
 * reader** — assigned in `playerPlan`, exported on the type, consumed by no
 * production code anywhere. A dead second ratio on the public plan type is not
 * a safeguard against picking the wrong one; it is the thing that makes picking
 * the wrong one possible, which is how the defect above shipped. So it is gone,
 * `scale.ts`'s surviving copy is renamed `cssPerBackingScale` to name both of
 * its spaces the way `devicePerBackingScale` does, and the CSS ratio is
 * recomputed here from the plan's widths rather than read off a field.
 *
 * What that buys, measured: before the change, swapping `devicePerBackingScale`
 * for `displayScale` at `playerPlan`'s own `imageRenderingFor` call typechecked
 * clean. After it, there is no such name in scope and the swap does not compile.
 */
function cssPerBackingFromDefinition(plan: ReturnType<typeof playerPlan>): number {
  const fit = plan.fit
  if (fit === undefined) throw new Error('no fit plan to measure')
  return fit.kind === 'rescale'
    ? fit.fit.cssWidth / fit.backingWidth
    : fit.plan.cssWidth / fit.plan.backingWidth
}

/**
 * **Device px ÷ backing-store px** — the ratio the browser actually resamples
 * by, and therefore the one `imageRenderingFor` is given.
 *
 * Recomputed from the definition for the same reason as
 * {@link cssPerBackingFromDefinition}, and never read back out of the plan's own
 * `devicePerBackingScale`, which would make the assertion `x === x`. The route
 * taken here crosses three of the four named pixel spaces one step at a time —
 * the **CSS px** width the plan asks for, multiplied by the **dpr the caller
 * supplied** to reach **device px**, over the **backing-store px** it was
 * computed against — so a `dpr` dropped or applied twice anywhere inside
 * `scale.ts` surfaces here as a mismatch rather than as a soft picture.
 *
 * Only valid for a finite positive `dpr`, which is why the sweep that uses it
 * passes its own `dpr` rather than reading the plan's: for an unusable `dpr`
 * the plan coerces to 1 and the caller's number is not the one in play.
 */
function devicePerBackingFromDefinition(
  plan: ReturnType<typeof playerPlan>,
  dpr: number,
): number {
  const fit = plan.fit
  if (fit === undefined) throw new Error('no fit plan to measure')
  const cssWidth = fit.kind === 'rescale' ? fit.fit.cssWidth : fit.plan.cssWidth
  const backingWidth = fit.kind === 'rescale' ? fit.backingWidth : fit.plan.backingWidth
  return (cssWidth * dpr) / backingWidth
}

describe('the image-rendering hint', () => {
  const BOXES = [
    { width: 1, height: 1 },
    { width: 200, height: 100 },
    { width: 321, height: 167 },
    { width: 800, height: 600 },
    { width: 1920, height: 1080 },
    { width: 4000, height: 3000 },
  ]
  const DPRS = [0.75, 1, 1.25, 1.5, 2, 2.5, 3]
  const QUERIES = ['', '?smooth=auto', '?smooth=on', '?smooth=off', '?smooth=true']
  const MODES = ['contain', 'snap', 'render']

  it('matches the smoothing policy at every container size and fractional dpr', () => {
    let checked = 0
    let reversedByDpr = 0
    for (const container of BOXES) {
      for (const dpr of DPRS) {
        for (const smooth of QUERIES) {
          for (const mode of MODES) {
            const search = `${smooth === '' ? '?' : `${smooth}&`}fit=${mode}`
            const plan = playerPlan(at({ search, container, dpr }))
            const where = `${mode} ${container.width}x${container.height} @${dpr} ${smooth}`
            const cssRatio = cssPerBackingFromDefinition(plan)
            const deviceRatio = devicePerBackingFromDefinition(plan, dpr)
            // The two readings still differ by exactly `dpr`. That relation is
            // the entire content of the mistake this sweep exists for, so it is
            // asserted rather than assumed — and the CSS one is recomputed from
            // the plan's widths, because the plan no longer carries it as a
            // field for anyone to read by accident.
            expect(plan.fit?.cssPerBackingScale, where).toBeCloseTo(cssRatio, 10)
            expect(plan.devicePerBackingScale, where).toBeCloseTo(deviceRatio, 10)
            expect(deviceRatio, where).toBeCloseTo(cssRatio * dpr, 10)
            // ...and the hint is decided in DEVICE px, which is the space the
            // browser resamples in. Handing `imageRenderingFor` the CSS ratio
            // instead is what this line fails on.
            expect(plan.imageRendering, where)
              .toBe(imageRenderingFor(parseSmooth(search), deviceRatio))
            if (cssRatio < 1 && deviceRatio >= 1) reversedByDpr++
            checked++
          }
        }
      }
    }
    // Vacuity floor: a loop that stopped iterating would assert nothing.
    expect(checked).toBe(BOXES.length * DPRS.length * QUERIES.length * MODES.length)
    expect(checked).toBeGreaterThan(400)
    // A second floor, on the band that discriminates the two readings rather
    // than on the sweep as a whole. `cssRatio < 1 <= deviceRatio` is exactly
    // the set of points where the CSS reading says "downscale, blend" and the
    // device reading says "1:1 or larger, leave the dots alone"; it is empty
    // at dpr 1 by construction, which is why a suite with no fractional dpr in
    // it passed over this defect for the whole phase. If `DPRS` ever loses its
    // above-1 entries the sweep still runs and still proves nothing, and this
    // is the line that says so.
    expect(reversedByDpr).toBeGreaterThan(0)
  })

  /**
   * **The discriminating case, inverted — and the comment it replaces was a
   * green test asserting the defect.**
   *
   * What stood here read: "At dpr 2 a `render` plan shows one backing pixel per
   * DEVICE pixel, which is half a CSS pixel — a downscale, and `auto` must
   * smooth it. Reading `Fit.scale` instead would report 1 and pixelate." Every
   * clause of that is arithmetically true and the conclusion is backwards. The
   * browser does not resample in CSS px; it resamples backing store onto the
   * device grid, and in that space a re-render is 1:1 at every dpr. `render` is
   * the one mode whose whole purpose is pixel-exactness — `renderFit` sizes the
   * backing store so that `cssWidth * dpr === backingWidth` — so asking the
   * browser to interpolate it is precisely the blur the mode exists to prevent.
   *
   * Kept as a rewrite rather than deleted because the direction of this ratio
   * was argued once, in writing, and got the wrong answer; a reader who finds
   * only the corrected rule has no reason to check it, and a reader who finds
   * the record of the earlier mistake does.
   */
  it('pixelates a dpr-2 render plan, because a re-render is 1:1 in DEVICE px', () => {
    const one = playerPlan(at({ search: '?fit=render', dpr: 1 }))
    const two = playerPlan(at({ search: '?fit=render', dpr: 2 }))
    // dpr genuinely changes the CSS-px ratio. That much was never in doubt...
    expect(cssPerBackingFromDefinition(one)).toBeCloseTo(1, 10)
    expect(cssPerBackingFromDefinition(two)).toBeCloseTo(0.5, 10)
    expect(cssPerBackingFromDefinition(two))
      .toBeCloseTo(cssPerBackingFromDefinition(one) / 2, 10)
    // ...and it is exactly why the CSS-px ratio is the wrong thing to hint
    // with: the ratio the browser resamples by does not move at all.
    expect(one.devicePerBackingScale).toBeCloseTo(1, 10)
    expect(two.devicePerBackingScale).toBeCloseTo(1, 10)
    expect(one.imageRendering).toBe('pixelated')
    expect(two.imageRendering).toBe('pixelated')
  })

  it('never smooths a snap plan, at any dpr, because snap never downscales', () => {
    // `fitScale` floors at 1 and returns an integer, so a snap plan is a 1x or
    // an exact n-times upscale in device px and nothing else. Under the CSS
    // reading a 1x snap on a dpr-2 panel read as 0.5 and got blended, which is
    // the same defect as the render case wearing the other mode's name.
    let checked = 0
    for (const dpr of DPRS) {
      for (const container of BOXES) {
        const plan = playerPlan(at({ search: '?fit=snap', container, dpr }))
        const where = `${container.width}x${container.height} @${dpr}`
        expect(plan.devicePerBackingScale, where).toBeGreaterThanOrEqual(1)
        expect(plan.imageRendering, where).toBe('pixelated')
        checked++
      }
    }
    expect(checked).toBe(DPRS.length * BOXES.length)
  })

  it('is defined even when there is nothing to draw', () => {
    // A CSS property set to `undefined` is a silent no-op, so a hole here would
    // quietly stop pixelating rather than throw.
    for (const hash of ['', '#v1.!!!']) {
      const plan = playerPlan(at({ hash }))
      expect(plan.fit, hash).toBeUndefined()
      expect(Number.isFinite(plan.devicePerBackingScale), hash).toBe(true)
      expect(['auto', 'pixelated']).toContain(plan.imageRendering)
    }
  })
})

/* ------------------------------------------- the fragment/query separation */

describe('the fragment is the scene and the query is the parameters', () => {
  it('never reads a parameter out of the fragment', () => {
    const plan = playerPlan(at({ search: '', hash: `${SCALABLE_HASH}&fit=snap&present=1` }))
    expect(plan.requestedFit).toBe('contain')
    expect(plan.framing).toBe('inline')
    expect(plan.scene).toBeUndefined()
    expect(codes(at({ search: '', hash: `${SCALABLE_HASH}&fit=snap` }))).toContain('unreadable-scene')
  })

  it('and the fragment spelling it rejects really would break the scene', () => {
    // The positive control, cloned from `present.test.ts`. Without it, "the
    // parameters are not in the fragment" is a claim about a danger nobody has
    // shown to exist.
    const body = encodeSceneHash(scalableScene())
    expect(() => parseSceneHash(`#${body}&fit=snap`)).toThrow(/not a base64url character/)
    expect(() => parseSceneHash(`#${body}?smooth=auto`)).toThrow(/not a base64url character/)
    // A trailer whose length lands the payload on `n % 4 === 1` is rejected by
    // the length guard before the alphabet check is ever reached. Both are
    // rejections and the control is about the rejection, not about which guard
    // fires — but asserting the alphabet message above and this one here keeps
    // either guard being deleted from passing silently.
    expect(() => parseSceneHash(`#${body}?smooth=on`)).toThrow(/could not be decoded/)
  })

  it('never reads a scene out of the query', () => {
    const body = encodeSceneHash(scalableScene())
    const plan = playerPlan(at({ search: `?scene=${body}`, hash: '' }))
    expect(plan.scene).toBeUndefined()
    expect(plan.notices.map(n => n.code)).toContain('no-scene')
  })

  it('reads both halves of a URL that carries both', () => {
    const plan = playerPlan(at({ search: '?present=1&fit=snap&smooth=off', hash: SCALABLE_HASH }))
    expect(plan.framing).toBe('present')
    expect(plan.requestedFit).toBe('snap')
    expect(plan.smooth).toBe('off')
    expect(plan.imageRendering).toBe('pixelated')
    expect(plan.scene).toEqual(validateScene(parseSceneHash(SCALABLE_HASH)))
    expect(plan.notices).toEqual([])
  })
})

/* ------------------------------------------------------------- totality */

/** base64url of a JSON payload, so a hash can carry a non-scene on purpose. */
function hashOf(json: string): string {
  return `#v1.${bytesToBase64Url(new TextEncoder().encode(json))}`
}

describe('every malformed input produces a plan and a notice, and never throws', () => {
  const TABLE: readonly [string, Partial<PlayerPlanInput>, PlayerNoticeCode][] = [
    ['absent hash', { hash: '' }, 'no-scene'],
    ['bare #', { hash: '#' }, 'no-scene'],
    ['truncated hash', { hash: SCALABLE_HASH.slice(0, -7) }, 'unreadable-scene'],
    ['non-base64url hash', { hash: '#v1.not a scene!' }, 'unreadable-scene'],
    ['no version prefix', { hash: '#eyJhIjoxfQ' }, 'unreadable-scene'],
    ['a future version', { hash: '#v2.eyJhIjoxfQ' }, 'unreadable-scene'],
    ['valid base64, not JSON', { hash: '#v1.AAAA' }, 'unreadable-scene'],
    ['valid JSON, not a scene', { hash: hashOf('42') }, 'invalid-scene'],
    ['a scene that fails validation', { hash: hashOf('{"size":[0,0],"layers":[]}') }, 'invalid-scene'],
    ['an unknown preset', {
      hash: hashOf('{"size":[64,32],"layers":[{"type":"shape","shape":"circle","r":4,"anim":{"kind":"nope"}}]}'),
    }, 'invalid-scene'],
    ['zero container', { container: { width: 0, height: 0 } }, 'container-unmeasured'],
    ['zero height only', { container: { width: 800, height: 0 } }, 'container-unmeasured'],
    ['negative container', { container: { width: -10, height: -10 } }, 'container-unmeasured'],
    ['non-finite container', { container: { width: Number.NaN, height: Infinity } }, 'container-unmeasured'],
    ['zero dpr', { dpr: 0 }, 'dpr-unusable'],
    ['negative dpr', { dpr: -2 }, 'dpr-unusable'],
    ['NaN dpr', { dpr: Number.NaN }, 'dpr-unusable'],
    ['infinite dpr', { dpr: Infinity }, 'dpr-unusable'],
  ]

  it('found a table big enough to be a real check', () => {
    expect(TABLE.length).toBeGreaterThanOrEqual(15)
  })

  it('never throws, for any row, in any fit mode', () => {
    // Asserted over the whole table explicitly, and over every fit mode,
    // because `render` is the arm that reaches furthest into the scene.
    let checked = 0
    for (const [name, patch] of TABLE) {
      for (const fit of ['contain', 'snap', 'render', 'cover']) {
        expect(() => playerPlan(at({ ...patch, search: `?fit=${fit}` })), `${name} / ${fit}`)
          .not.toThrow()
        checked++
      }
    }
    expect(checked).toBe(TABLE.length * 4)
  })

  it('returns a defined plan carrying the notice the row is about', () => {
    for (const [name, patch, code] of TABLE) {
      const plan = playerPlan(at(patch))
      expect(plan, name).toBeDefined()
      expect(plan.notices.length, name).toBeGreaterThanOrEqual(1)
      expect(plan.notices.map(n => n.code), name).toContain(code)
      // Whatever else went wrong, the shell always has chrome to render and a
      // framing to render it in: an embed that shows nothing and says nothing
      // is the failure this function exists to prevent.
      expect(nodesOf(plan.chrome).length, name).toBeGreaterThanOrEqual(5)
      expect(FRAMING_NAMES, name).toContain(plan.framing)
      expect(['auto', 'pixelated'], name).toContain(plan.imageRendering)
    }
  })

  it('renders nothing rather than guessing when the scene will not load', () => {
    // The recorded choice: an unloadable scene yields no scene and no fit plan,
    // plus a notice. The alternative — substituting a placeholder scene — would
    // put a picture on somebody's page that their link does not describe.
    for (const [name, patch, code] of TABLE) {
      if (code !== 'no-scene' && code !== 'unreadable-scene' && code !== 'invalid-scene') continue
      const plan = playerPlan(at(patch))
      expect(plan.scene, name).toBeUndefined()
      expect(plan.fit, name).toBeUndefined()
    }
  })

  it('still plans a layout for a scene in a box that has not been laid out yet', () => {
    // A detached or `display: none` container measures 0, and a resize handler
    // must survive it. The scene is readable, so the plan is real — it is the
    // *box* that is missing, and `scale.ts` already coerces it to 0.
    const plan = playerPlan(at({ container: { width: 0, height: 0 } }))
    expect(plan.scene).toBeDefined()
    expect(plan.fit).toBeDefined()
    expect(plan.notices.map(n => n.code)).toEqual(['container-unmeasured'])
  })

  it('gives every notice code a headline, and every notice a non-empty message', () => {
    expect(PLAYER_NOTICE_CODES.length).toBeGreaterThanOrEqual(7)
    for (const code of PLAYER_NOTICE_CODES) {
      expect(NOTICE_HEADLINES[code], code).toBeTruthy()
    }
    // And every code the table can produce really is produced, so the
    // enumeration is not three dead strings and four live ones.
    const produced = new Set(TABLE.flatMap(([, patch]) => codes(at(patch))))
    for (const code of ['no-scene', 'unreadable-scene', 'invalid-scene', 'container-unmeasured', 'dpr-unusable']) {
      expect([...produced], code).toContain(code)
    }
    const all = new Set([
      ...produced,
      ...codes(at({ search: '?fit=cover' })),
      ...codes(at({ search: '?fit=render', hash: UNSCALABLE_HASH })),
    ])
    expect([...all].sort()).toEqual([...PLAYER_NOTICE_CODES].filter(c => all.has(c)).sort())
    expect(all.size).toBeGreaterThanOrEqual(7)
  })
})

/* ---------------------------------------------------------------- purity */

describe('it is a pure function', () => {
  const INPUTS: PlayerPlanInput[] = [
    at(),
    at({ search: '?present=1&fit=snap&smooth=on', dpr: 1.5 }),
    at({ search: '?fit=render', container: { width: 213, height: 97 }, dpr: 2.5 }),
    at({ search: '?fit=cover', hash: UNSCALABLE_HASH, embedded: true }),
    at({ hash: '#v1.!!!', dpr: 0, container: { width: 0, height: 0 } }),
  ]

  it('returns deep-equal results for identical inputs', () => {
    for (const input of INPUTS) {
      expect(playerPlan(input)).toEqual(playerPlan(input))
    }
    expect(INPUTS.length).toBeGreaterThanOrEqual(5)
  })

  it('mutates neither its input nor the objects inside it', () => {
    for (const input of INPUTS) {
      const before = structuredClone(input)
      playerPlan(input)
      expect(input).toEqual(before)
    }
  })

  it('does not alias its input’s container into the plan', () => {
    // A plan holding a reference to a live measurement object would change
    // under the caller the next time the shell reused its scratch object.
    const container = { width: 800, height: 600 }
    const plan = playerPlan(at({ container }))
    container.width = 1
    expect(playerPlan(at({ container: { width: 800, height: 600 } }))).toEqual(plan)
  })
})
