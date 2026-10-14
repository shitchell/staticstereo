import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SMOOTH,
  SMOOTH_MODES,
  SMOOTH_PARAM,
  imageRenderingFor,
  parseSmooth,
} from './smooth.js'
import { encodeSceneHash, parseSceneHash } from './hash.js'
import { planFit } from './scale.js'
import { validateScene } from './scene.js'
import type { Scene } from '../src/core/types.js'

/**
 * The `?smooth=` resampling hint, parsed. Same house pattern as `present.ts`
 * and `fit.ts`: permissive reading, last of a repeat wins, and the fragment is
 * the scene and is never consulted.
 *
 * The scene is a literal rather than `DEFAULT_EXAMPLE` because
 * `site/examples.ts` is editor-only and nothing in the player may depend on it.
 */

const SCENE: Scene = {
  size: [320, 180],
  fps: 12,
  duration: 2,
  freezeNoise: false,
  stereo: { sepFar: 110, sepNear: 92, noiseScale: 2, depthBlur: 1, cross: false, seed: 7 },
  layers: [
    // Was `{kind: 'marquee', speed: 60}`; see `fit.test.ts`'s copy for why it
    // is now a `move` with explicit endpoints, and for why `speed` is 320:
    // `move` derives the track length from the distance between the
    // endpoints, and 640 scene px at `marquee`'s 60 px/sec is a 10.67 s
    // animation inside a 2 s scene. 640/320 = 2 crosses exactly once.
    //
    // The round-trip below asserts `validateScene` accepts it, and that check
    // reaches the preset's `kind` and nothing else — measured in
    // `fit.test.ts`'s copy, which has the detail. `planFit` reads only `size`
    // and `stereo`. So the coherence of the animator is a property of the
    // fixture held by these comments alone.
    {
      type: 'text', text: 'HELLO', size: 60, depth: 0.6,
      anim: { kind: 'move', from: [-320, 0], to: [320, 0], speed: 320 },
    },
  ],
}

describe('SMOOTH_MODES', () => {
  it('is a record keyed by mode name, matching FIT_MODES', () => {
    expect(Object.keys(SMOOTH_MODES).sort()).toEqual(['auto', 'off', 'on'])
    for (const [name, mode] of Object.entries(SMOOTH_MODES)) {
      expect(mode.mode, name).toBe(name)
      expect(typeof mode.description, name).toBe('string')
      expect(mode.description.length, name).toBeGreaterThan(20)
      expect(mode.description, name).not.toContain('\n')
    }
  })

  it('names the default, and the default is a registered mode', () => {
    expect(DEFAULT_SMOOTH).toBe('auto')
    expect(SMOOTH_MODES[DEFAULT_SMOOTH]).toBeDefined()
  })

  it('parses every registered mode from its canonical spelling', () => {
    const names = Object.keys(SMOOTH_MODES)
    expect(names.length).toBeGreaterThan(2)
    for (const name of names) {
      expect(parseSmooth(`?${SMOOTH_PARAM}=${name}`), name).toBe(name)
    }
  })
})

describe('parseSmooth', () => {
  it('falls back to the default when the parameter is absent', () => {
    expect(parseSmooth('')).toBe(DEFAULT_SMOOTH)
    expect(parseSmooth('?')).toBe(DEFAULT_SMOOTH)
    expect(parseSmooth('?other=1')).toBe(DEFAULT_SMOOTH)
  })

  it('reads the canonical spellings, with or without the leading ?', () => {
    expect(parseSmooth('?smooth=auto')).toBe('auto')
    expect(parseSmooth('?smooth=on')).toBe('on')
    expect(parseSmooth('?smooth=off')).toBe('off')
    expect(parseSmooth('smooth=on')).toBe('on')
  })

  it('is permissive about surrounding space and case', () => {
    expect(parseSmooth('?smooth=ON')).toBe('on')
    expect(parseSmooth('?smooth=%20Off%20')).toBe('off')
  })

  it('reads the boolean-ish spellings a human types onto a flag', () => {
    // The choice, recorded at the declaration in smooth.ts: present.ts already
    // established that a reader types `1`/`true`/`yes` to mean on and
    // `0`/`false`/`no`/`off` to mean off, and `off` is ALREADY a canonical
    // value here — so the two vocabularies are half-merged whether we like it
    // or not, and finishing the merge is less surprising than leaving
    // `?smooth=off` meaning off while `?smooth=false` means auto.
    for (const value of ['1', 'true', 'TRUE', 'yes']) {
      expect(parseSmooth(`?smooth=${value}`), value).toBe('on')
    }
    for (const value of ['0', 'false', 'no']) {
      expect(parseSmooth(`?smooth=${value}`), value).toBe('off')
    }
  })

  it('falls back rather than throwing on an unknown or empty value', () => {
    for (const value of ['', 'maybe', 'auto!', 'smooth', 'pixelated', '2']) {
      expect(() => parseSmooth(`?smooth=${value}`), value).not.toThrow()
      expect(parseSmooth(`?smooth=${value}`), value).toBe(DEFAULT_SMOOTH)
    }
  })

  it('reads a bare flag as auto, unlike present.ts, because this is tri-state', () => {
    // `?present` means on because a boolean's only two states make a bare flag
    // unambiguous. Here the default is `auto` and `auto` is a real third
    // answer, so a bare `?smooth` names the parameter without choosing between
    // its values — there is nothing for it to toggle TO. Falling back is the
    // only reading that does not invent an intent.
    expect(parseSmooth('?smooth')).toBe(DEFAULT_SMOOTH)
    expect(parseSmooth('?smooth=')).toBe(DEFAULT_SMOOTH)
  })

  it('takes the last of a repeated parameter, so the later assignment wins', () => {
    expect(parseSmooth('?smooth=on&smooth=off')).toBe('off')
    expect(parseSmooth('?smooth=off&smooth=on')).toBe('on')
    // The literal last, not the last recognised one — same rule as parseFit.
    expect(parseSmooth('?smooth=on&smooth=typo')).toBe(DEFAULT_SMOOTH)
  })

  it('sees the parameter among other parameters, in any position', () => {
    expect(parseSmooth('?fit=snap&smooth=on')).toBe('on')
    expect(parseSmooth('?smooth=on&fit=snap')).toBe('on')
    expect(parseSmooth('?a=1&smooth=off&b=2')).toBe('off')
  })

  it('is not fooled by a parameter that merely contains the name', () => {
    expect(parseSmooth('?unsmooth=on')).toBe(DEFAULT_SMOOTH)
    expect(parseSmooth('?smoothing=on')).toBe(DEFAULT_SMOOTH)
    expect(parseSmooth('?smooth_mode=on')).toBe(DEFAULT_SMOOTH)
    expect(parseSmooth('?x=smooth=on')).toBe(DEFAULT_SMOOTH)
  })
})

describe('parseSmooth and the names Object.prototype already answers to', () => {
  /**
   * The same defect `fit.ts` had, copied here with the idiom, and **twice**:
   * `'constructor' in SMOOTH_MODES` is `true`, and the alias fallback
   * `ALIASES[key]` is an index access on a prototype-bearing object. Fixing
   * only the first leaves the second live, because both registries are plain
   * object literals and therefore share a prototype — nothing can reach one
   * guard without reaching the other.
   *
   * What it shipped: `?smooth=constructor` returned the `Object` **function**
   * typed as a `SmoothMode`. It does not throw — `imageRenderingFor` falls
   * through to the `auto` policy for any mode that is neither `on` nor `off` —
   * so the only symptom is a parameter that silently stopped being parsed.
   * That is why this is pinned on the returned value's membership of the
   * registry, not merely on the absence of a throw.
   *
   * Pinned as inputs and observed behaviour, so `Object.hasOwn`, a `Map` and a
   * null-prototype record all satisfy it.
   */
  const INHERITED = ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']

  it('is not vacuous: each name is on Object.prototype and is not a smooth mode', () => {
    expect(INHERITED.length).toBeGreaterThan(3)
    for (const name of INHERITED) {
      // The hazard, as a fact about the name rather than about our registry.
      expect(name in Object.prototype, name).toBe(true)
      expect(Object.hasOwn(SMOOTH_MODES, name), name).toBe(false)
    }
  })

  it('falls back to the default for every inherited name', () => {
    for (const name of INHERITED) {
      expect(() => parseSmooth(`?smooth=${name}`), name).not.toThrow()
      expect(parseSmooth(`?smooth=${name}`), name).toBe(DEFAULT_SMOOTH)
    }
  })

  it('returns a registered mode and never a function off the prototype', () => {
    // The symptom-free half: a `Function` flows on as a `SmoothMode` and the
    // only visible effect is that the parameter stopped working. Assert
    // membership rather than type, so a string that is not a mode fails too.
    //
    // A second line stood here — `expect(['auto', 'pixelated'],
    // name).toContain(imageRenderingFor(got, 0.5))` — and it could not fail for
    // any input: that two-element union IS `imageRenderingFor`'s declared
    // return type, so the assertion was `typeof x === typeof x`. Measured, with
    // the prototype defect reintroduced (`key in SMOOTH_MODES`) and the
    // membership check above temporarily removed so the line could be reached
    // on its own: `1 passed`, with `parseSmooth('?smooth=constructor')`
    // returning the `Object` function. It was also in the wrong block — a
    // statement about `imageRenderingFor`'s codomain, which that function's own
    // describe sweeps over every mode and every scale, and nothing about
    // `parseSmooth`.
    for (const name of INHERITED) {
      const got = parseSmooth(`?smooth=${name}`)
      expect(Object.hasOwn(SMOOTH_MODES, got as string), name).toBe(true)
    }
  })
})

describe('imageRenderingFor', () => {
  /**
   * A sweep rather than two hand-picked points: the claim is "every downscale"
   * and "every upscale", and two points cannot distinguish that from a
   * threshold accidentally written at 0.5 or at 2.
   */
  const DOWN = [0.001, 0.01, 0.1, 0.25, 1 / 3, 0.5, 0.75, 0.9, 0.99, 0.999, 0.999999]
  const UP = [1.000001, 1.001, 1.01, 1.1, 1.5, 2, 2.5, 3, 10, 100, 1000]
  const DEGENERATE = [1, 0, -0, -1, -0.5, Number.NaN, Infinity, -Infinity]
  const ALL = [...DOWN, ...UP, ...DEGENERATE]

  /**
   * **`dpr` is a dimension of this policy even though it is not an argument.**
   *
   * The matrix below was mode × scale, two arguments and two loops, which is
   * the shape the function's signature invites. It is also the shape that
   * cannot see the defect this block was extended for: the ratio reaching this
   * function is produced by `scale.ts`, which works in four pixel spaces, and
   * whether it arrives as **CSS px ÷ backing-store px** or as **device px ÷
   * backing-store px** is a choice made at the call site, not here. The two
   * differ by exactly `dpr` — so at dpr 1 they are the same number and every
   * test in a suite with no second dpr in it passes either way.
   *
   * The band that separates them is `cssRatio < 1 <= cssRatio * dpr`: a
   * genuine 1:1 or a genuine device upscale that the CSS reading calls a
   * downscale and blends. It is **empty at dpr 1 by construction**, which is
   * why it survived a phase of green runs.
   *
   * ## Which test discharges "put `dpr` in the smoothing matrix", and which does not
   *
   * Recorded because the two are adjacent and the wrong one looks like the
   * guard. **The requirement is discharged by `describe('the ratio
   * imageRenderingFor is given')` below**, which reads the ratio off real
   * `planFit` plans and is therefore the only thing here that a wrong choice of
   * pixel space can redden.
   *
   * The `documents …` test in this block is **not** a guard and is marked as
   * such in its own name. It derives its input from the rule it then checks
   * (`devicePerBackingPx = cssPerBackingPx * dpr`, then asserts the function
   * agrees), so it restates `imageRenderingFor`'s contract in the unit space
   * rather than testing anything: a verifier ran three separate REDs against it,
   * including a **full rollback of the production fix**, and it stayed green
   * through all three. It is kept for the arithmetic it spells out — a reader
   * who has to work out by hand why a 0.75x CSS ratio is a device *upscale* at
   * dpr 1.5 is a reader who will get it wrong again — and it is named so that
   * nobody mistakes it for coverage.
   */
  const CSS_RATIOS = [0.1, 0.4, 0.5, 0.6, 2 / 3, 0.75, 0.8, 0.9, 1, 1.5, 2]
  const DPRS = [1, 1.25, 1.5, 2, 2.5, 3]

  it('is total: every mode and every scale yields one of the two legal values', () => {
    // A CSS property with an undefined value is a silent no-op, so a hole here
    // would not throw — it would just quietly stop pixelating.
    for (const mode of Object.keys(SMOOTH_MODES)) {
      for (const scale of ALL) {
        const got = imageRenderingFor(mode as never, scale)
        expect(['auto', 'pixelated'], `${mode} @ ${scale}`).toContain(got)
      }
    }
  })

  it('honours an explicit on at every scale, including the degenerate ones', () => {
    for (const scale of ALL) {
      expect(imageRenderingFor('on', scale), `on @ ${scale}`).toBe('auto')
    }
  })

  it('honours an explicit off at every scale, including the degenerate ones', () => {
    for (const scale of ALL) {
      expect(imageRenderingFor('off', scale), `off @ ${scale}`).toBe('pixelated')
    }
  })

  it('smooths every downscale under auto, per R20', () => {
    // R20: "softening and blurring and pixels compressing into each other
    // acknowledged and accepted". Nearest-neighbour on the way down drops
    // whole columns, which is the one outcome R20 does NOT accept.
    for (const scale of DOWN) {
      expect(imageRenderingFor('auto', scale), `auto @ ${scale}`).toBe('auto')
    }
  })

  it('pixelates every upscale under auto, so integer factors stay exact', () => {
    for (const scale of UP) {
      expect(imageRenderingFor('auto', scale), `auto @ ${scale}`).toBe('pixelated')
    }
  })

  it('pixelates at exactly 1:1, which is an argued pick and not a don’t-care', () => {
    // Observable, so it is argued rather than asserted blindly. At a true 1:1
    // neither value resamples and the two are identical — but a nominal 1:1 is
    // not a true one: the plate's device-pixel origin is fractional whenever
    // the layout lands it off a whole pixel, and `auto` in that state blends
    // adjacent columns of RANDOM dots, which is exactly the failure
    // site/scale.ts was written to prevent. `pixelated` is the value that is
    // right at 1:1 and still right when the ratio drifts off it, so it is the
    // fail-safe branch. It also agrees with the rule either neighbouring case
    // would suggest by continuity from above ("integer factors stay exact").
    expect(imageRenderingFor('auto', 1)).toBe('pixelated')
  })

  it('pixelates for a scale that cannot be a downscale', () => {
    // Zero, negative and NaN are not downscales; they are a container with no
    // size, an arithmetic error upstream, or a division by zero. None of them
    // is a reason to start blending random dots, so they take the same
    // fail-safe branch as 1:1 rather than a separate rule.
    for (const scale of [0, -0, -1, -0.5, Number.NaN, -Infinity]) {
      expect(imageRenderingFor('auto', scale), `auto @ ${scale}`).toBe('pixelated')
    }
    // Infinity is an upscale by any reading, and lands in the same place.
    expect(imageRenderingFor('auto', Infinity)).toBe('pixelated')
  })

  it('documents (cannot fail): the same CSS ratio reverses with dpr', () => {
    // **DOCUMENTATION, NOT A GUARD — see the block docblock above.** The input
    // is derived from the rule this then checks, so the assertion restates
    // `imageRenderingFor`'s contract in the unit space and cannot go red for
    // any input: the function body never changed, only what it is handed. A
    // verifier confirmed it, three times over, including under a full rollback
    // of the production fix.
    //
    // What discharges the requirement is `describe('the ratio
    // imageRenderingFor is given')` below, which reads the ratio off real fit
    // plans. What this spells out is the arithmetic — why a 0.75x CSS ratio is
    // a device UPSCALE at dpr 1.5 — which is the step somebody got wrong in
    // writing and would otherwise have to re-derive from the policy alone.
    //
    // The two counters at the end are the exception: they are assertions about
    // the SWEEP rather than about the function, and they can fail. See there.
    let checked = 0
    let reversedByDpr = 0
    let reversedAtDprOne = 0
    for (const cssPerBackingPx of CSS_RATIOS) {
      for (const dpr of DPRS) {
        const devicePerBackingPx = cssPerBackingPx * dpr
        const where = `css ${cssPerBackingPx} @ dpr ${dpr} = device ${devicePerBackingPx}`
        expect(imageRenderingFor('auto', devicePerBackingPx), where)
          .toBe(devicePerBackingPx < 1 ? 'auto' : 'pixelated')
        if (cssPerBackingPx < 1 && devicePerBackingPx >= 1) {
          // The band. Under the CSS reading every one of these blends adjacent
          // columns of random dots at a scale where nearest-neighbour is
          // exactly lossless, which is the one thing R20 does not accept.
          expect(imageRenderingFor('auto', devicePerBackingPx), where).toBe('pixelated')
          reversedByDpr++
          if (dpr === 1) reversedAtDprOne++
        }
        checked++
      }
    }
    expect(checked).toBe(CSS_RATIOS.length * DPRS.length)
    // Vacuity floor on the band itself, not just on the loop: a `DPRS` that
    // lost its above-1 entries would still sweep and would still prove nothing.
    expect(reversedByDpr).toBeGreaterThan(8)
    // ...and the finding behind the finding, as an assertion: at dpr 1 the two
    // readings are the same number, so no matrix that holds dpr at 1 can tell
    // them apart however many scales it sweeps.
    expect(reversedAtDprOne).toBe(0)
  })

  it('agrees with parseSmooth on the default, which is the composed behaviour', () => {
    // The pairing a caller actually writes: parse the URL, then ask the policy.
    // Pinned so that changing either half alone shows up here.
    expect(imageRenderingFor(parseSmooth(''), 0.5)).toBe('auto')
    expect(imageRenderingFor(parseSmooth(''), 2)).toBe('pixelated')
    expect(imageRenderingFor(parseSmooth('?smooth=on'), 2)).toBe('auto')
    expect(imageRenderingFor(parseSmooth('?smooth=off'), 0.5)).toBe('pixelated')
  })
})

/**
 * **Which ratio reaches `imageRenderingFor`, measured over real fit plans.**
 *
 * `imageRenderingFor` takes two arguments and neither is a `dpr`, so a matrix
 * over its own signature can never see the mistake: the pixel space is chosen
 * one layer up, where `scale.ts` turns a container and a dpr into a plan. This
 * block reads the ratio off that plan and is therefore the half of the dpr
 * dimension that can actually fail.
 *
 * The scene and `planFit` are imported rather than stubbed because the number
 * under test is the one the fit arithmetic really produces, margins and
 * `noiseScale` and integer flooring included. A hand-written ratio would be a
 * test of this file's own multiplication.
 */
describe('the ratio imageRenderingFor is given', () => {
  const BOXES: readonly (readonly [number, number])[] = [
    [200, 100],
    [480, 270],
    [640, 360],
    [800, 600],
    [1280, 720],
    [1920, 1080],
    [4000, 3000],
  ]
  const BRIDGE_DPRS = [1, 1.25, 1.5, 2, 3]
  const MODES = ['contain', 'snap', 'render'] as const

  it('is the plan’s device-per-backing ratio, which dpr 1 cannot distinguish', () => {
    let checked = 0
    let reversedByDpr = 0
    let reversedAtDprOne = 0
    for (const [availableWidth, availableHeight] of BOXES) {
      for (const dpr of BRIDGE_DPRS) {
        for (const mode of MODES) {
          const plan = planFit(mode, { scene: SCENE, availableWidth, availableHeight, dpr })
          const where = `${mode} ${availableWidth}x${availableHeight} @${dpr}`
          const backingWidth = plan.kind === 'rescale' ? plan.backingWidth : plan.plan.backingWidth
          const cssWidth = plan.kind === 'rescale' ? plan.fit.cssWidth : plan.plan.cssWidth
          // CSS px → device px (× the dpr the caller supplied) → over the
          // backing store. Three named spaces, never read back out of the
          // field under test.
          expect(plan.devicePerBackingScale, where).toBeCloseTo((cssWidth * dpr) / backingWidth, 9)
          // The two readings, and the hint that follows from the right one.
          expect(plan.cssPerBackingScale, where).toBeCloseTo(plan.devicePerBackingScale / dpr, 9)
          expect(imageRenderingFor('auto', plan.devicePerBackingScale), where)
            .toBe(plan.devicePerBackingScale < 1 ? 'auto' : 'pixelated')
          if (
            imageRenderingFor('auto', plan.cssPerBackingScale) !==
            imageRenderingFor('auto', plan.devicePerBackingScale)
          ) {
            // Every disagreement runs the same way round — the CSS reading
            // calls a device 1:1-or-upscale a downscale and asks the browser
            // to blend it. There is no case where it errs toward pixelating.
            expect(imageRenderingFor('auto', plan.cssPerBackingScale), where).toBe('auto')
            expect(imageRenderingFor('auto', plan.devicePerBackingScale), where).toBe('pixelated')
            reversedByDpr++
            if (dpr === 1) reversedAtDprOne++
          }
          checked++
        }
      }
    }
    expect(checked).toBe(BOXES.length * BRIDGE_DPRS.length * MODES.length)
    // The band is non-empty, so this sweep really does discriminate...
    expect(reversedByDpr).toBeGreaterThan(0)
    // ...and it is empty at dpr 1, which is the whole reason a green suite
    // could sit on top of the wrong ratio for a phase.
    expect(reversedAtDprOne).toBe(0)
  })

  it('is exactly 1 for every render plan, at every dpr', () => {
    // `renderFit`'s own contract: "`cssWidth * dpr === backingWidth` exactly".
    // One backing pixel per DEVICE pixel is the mode's defining choice, so the
    // ratio the browser would resample by does not move with dpr at all — and
    // `pixelated` at exactly 1:1 is this module's argued pick.
    for (const [availableWidth, availableHeight] of BOXES) {
      for (const dpr of BRIDGE_DPRS) {
        const plan = planFit('render', { scene: SCENE, availableWidth, availableHeight, dpr })
        const where = `${availableWidth}x${availableHeight} @${dpr}`
        expect(plan.devicePerBackingScale, where).toBe(1)
        expect(imageRenderingFor('auto', plan.devicePerBackingScale), where).toBe('pixelated')
      }
    }
  })

  it('is never below 1 for a snap plan, which floors at 1 by contract', () => {
    for (const [availableWidth, availableHeight] of BOXES) {
      for (const dpr of BRIDGE_DPRS) {
        const plan = planFit('snap', { scene: SCENE, availableWidth, availableHeight, dpr })
        const where = `${availableWidth}x${availableHeight} @${dpr}`
        expect(plan.devicePerBackingScale, where).toBeGreaterThanOrEqual(1)
        expect(imageRenderingFor('auto', plan.devicePerBackingScale), where).toBe('pixelated')
      }
    }
  })
})

describe('parseSmooth and the fragment', () => {
  it('reads only the search, so a scene carrying the text is unaffected', () => {
    const body = encodeSceneHash(SCENE)
    const hash = `#${body}`
    for (const search of ['', '?smooth=on', '?smooth=off&fit=snap']) {
      const url = `/p/${search}${hash}`
      // Not `url.endsWith(hash)`, for the reason spelled out at the same place
      // in `fit.test.ts`: it could not fail for any input, because `url` was
      // built from `hash` one line earlier. The premise that CAN fail is the
      // one the cast below rests on — exactly one `#`, so the fragment
      // boundary is unambiguous and the scene reaches the parser whole.
      expect(url.split('#'), search).toHaveLength(2)
      const [before, after] = url.split('#') as [string, string]
      expect(after).toBe(body)
      expect(parseSceneHash(`#${after}`)).toEqual(SCENE)
      expect(() => validateScene(parseSceneHash(`#${after}`))).not.toThrow()
      const query = before.includes('?') ? before.slice(before.indexOf('?')) : ''
      expect(parseSmooth(query), search).toBe(search === '' ? DEFAULT_SMOOTH : parseSmooth(search))
    }
  })

  it('ignores the parameter spelling when it appears inside the fragment', () => {
    const sneaky: Scene = {
      ...SCENE,
      layers: [{ type: 'text', text: 'smooth=on', size: 60, depth: 0.6 }],
    }
    const hash = `#${encodeSceneHash(sneaky)}`
    expect(parseSmooth('')).toBe(DEFAULT_SMOOTH)
    expect(parseSceneHash(hash)).toEqual(sneaky)
    // The encoded form really does carry the text, so this is not vacuous.
    expect(JSON.stringify(parseSceneHash(hash))).toContain('smooth=on')
  })

  it('and the fragment spelling it refuses really would break the scene', () => {
    // The positive control, as in present.test.ts and fit.test.ts. See
    // `fit.test.ts`'s copy for why the refusal is named two ways: the codec
    // rejects an invalid LENGTH before it scans characters, so which of the
    // two messages a suffix produces depends on the body's length mod 4 and
    // not on anything this test is claiming. This copy passed where
    // `fit.test.ts`'s failed purely because `&smooth=on` is ten characters and
    // `&fit=snap` is nine.
    const body = encodeSceneHash(SCENE)
    expect(parseSceneHash(`#${body}`)).toEqual(SCENE)
    const REFUSED = /not a base64url character|is not a valid base64 length/
    for (const sep of ['&', '?']) {
      expect(() => parseSceneHash(`#${body}${sep}smooth=on`), sep).toThrow(REFUSED)
    }
  })
})
