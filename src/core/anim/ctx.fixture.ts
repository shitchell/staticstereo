/**
 * The one `PresetCtx` the preset tests compile against. It lives in its own
 * module because two copies would drift, and a drifted fixture makes the
 * golden corpus disagree with `presets.test.ts` for a reason that looks like a
 * regression.
 *
 * `marginLeft`/`marginRight` are the shipped `shift` margins for `sepFar: 110`
 * (design §10.3), and they are deliberately **unequal** — a preset that added
 * the wrong one, or added the same one twice, would still pass with a
 * symmetric fixture.
 */
import type { PresetCtx } from './presets.js'

export const CTX: PresetCtx = {
  sceneW: 800, sceneH: 450, contentW: 1200, contentH: 90, layerDepth: 1,
  marginLeft: 110, marginRight: 55,
}

/**
 * The same measurements with a **non-trivial** `layerDepth`.
 *
 * `emerge` compiles its absolute depths as `value − ctx.layerDepth`, and `to`
 * *defaults* to `ctx.layerDepth`. At `layerDepth: 1` both the subtrahend and
 * that default are 1, which is also the identity for enough arithmetic that a
 * golden captured there would not witness the term at all — `0.6` makes the
 * subtraction legible in every recorded number. `CTX` keeps `1` because the
 * existing assertions in `presets.test.ts` pass a hardcoded layer depth of 1
 * to their `absDepth` helper; changing it there is a behavioural edit to a
 * file this task may not touch.
 */
export const GOLDEN_CTX: PresetCtx = { ...CTX, layerDepth: 0.6 }
