/**
 * The verb vocabulary design §4.2b narrows `PRESETS` to — written out rather
 * than read from the registry on purpose.
 *
 * `Object.keys(PRESETS)` would make a test that used it agree with whatever
 * the registry currently holds, which is exactly the thing being decided; it
 * would have passed while the examples still used `marquee` and `bounce`. The
 * list is a design decision, so it is pinned as one. `presets.test.ts` is
 * where the registry itself is held to the same five.
 *
 * It lives in its own module, rather than in the test that first wrote it
 * down, because there are **two** corpora of shipped example scenes —
 * `examples/*.yaml` for the CLI and `site/examples.ts` for the editor — and a
 * second copy of the list is how one corpus gets migrated off a deleted kind
 * while the other goes on passing against a stale vocabulary. That is not
 * hypothetical: the site's scenes were hand-migrated with no test over them at
 * all.
 */
import type { Anim, Preset, Track } from '../types.js'

export const VERBS = ['flip', 'move', 'push', 'rotate', 'scale']

/**
 * An `Anim` as the flat list of animators it is.
 *
 * A raw keyframe track is not a lesser citizen here: `Anim` is
 * `Track | Preset | (Track | Preset)[]`, and §4.2b makes the presets UI
 * templates that emit ordinary `Anim`, so a literal track is what such a
 * template would write. Callers that sweep for verbs skip the tracks rather
 * than failing them.
 */
export function animators(anim: Anim | undefined): (Track | Preset)[] {
  if (!anim) return []
  return Array.isArray(anim) ? anim : [anim]
}
