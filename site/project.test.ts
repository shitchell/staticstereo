import { describe, it, expect } from 'vitest'
import { writeStst } from '../src/shared/container.js'
import type { StstMember } from '../src/shared/container.js'
import { readStst } from '../src/shared/containerRead.js'
import { validateScene } from './scene.js'
import type { Scene } from '../src/core/types.js'

/**
 * **P1 criterion 10: the site reads a `.stst`, not only the CLI.**
 *
 * R17 is *"an exportable custom .stst file that someone else can **import**"*,
 * and design §6.2's argument is that a format only one side can open "would be
 * the first asymmetry in an architecture that is otherwise one core with a CLI
 * and a site at parity." Until this file every `.stst` test lived in
 * `src/shared/` or `src/cli/`, so the claim that the site could read one was an
 * argument about where the module sits rather than anything exercised. In the
 * surveying worker's words: *the criteria encode the asymmetry they were
 * written to prevent.*
 *
 * Scope is deliberately narrow. The import **UI** is P5's (R19); this is the
 * reader being reachable from site-side code and doing the job the CLI's
 * reader does.
 *
 * ## What this file is a sensor for, and what it is not
 *
 * It is **not** the browser-reachability sensor, and saying so matters more
 * than the tests below. Vitest runs these in Node, so a `node:fs` added to
 * `containerRead.ts` tomorrow would leave every assertion here green. The
 * sensor for that is `src/shared/purity.test.ts`, which walks the source (not
 * `dist/`) and now also requires that every relative hop out of a guarded
 * module land on another guarded module — the hole that let
 * `src/shared/testing/spawnEnv.ts` and its `node:os` sit one import away from
 * this very reader, unseen on an unbuilt tree.
 *
 * What this file *does* sense is the other half, which nothing else does:
 *
 * - **Reachability from `site/`.** These imports are `../src/shared/*.js`, the
 *   same source path `site/fonts.ts` and `site/legibility.ts` use and the one
 *   Vite bundles from — not `dist/`. A reader moved into `src/node/`, or
 *   stopped being exported, reddens here and nowhere else: the purity guard
 *   only has opinions about files that are still in `src/shared`.
 * - **Parity with the CLI's handoff.** `src/cli/scene.ts` puts an archive's
 *   scene through the CLI validator, because `containerRead.ts` checks "shape
 *   and key rosters, not values". The site has its own validator for exactly
 *   the same reason, and if the two disagreed about a scene that came out of a
 *   container, "someone else can import" would be false for half the audience.
 */

/**
 * A scene with something of each kind in it, rather than the two-key minimum.
 *
 * Structure, not values (invariant §2.4): what is being pinned is that an
 * animated multi-layer scene with a `stereo` block survives the container and
 * is still something the site will load — not these particular numbers.
 */
const SCENE: Scene = {
  size: [320, 180],
  fps: 12,
  duration: 2,
  stereo: { sepFar: 60, sepNear: 40, noiseScale: 2, seed: 3 },
  layers: [
    { type: 'text', text: 'SHARED', depth: 0.8, size: 40 },
    { type: 'shape', shape: 'rect', at: [10, 10], w: 40, h: 40, depth: 0.2 },
    {
      type: 'gif',
      src: 'spin.gif',
      depth: 0.5,
      anim: { kind: 'move', from: [0, 0], to: [50, 0] },
    },
  ],
}

const MEMBERS: StstMember[] = [
  { name: 'spin.mask', role: 'mask', data: new Uint8Array([1, 2, 3, 4]) },
  { name: 'spin.gif', role: 'source', data: new Uint8Array([71, 73, 70]) },
]

describe('the site reads a .stst through the shared reader', () => {
  it('gets the scene back, and the site validator accepts it', async () => {
    const archive = await readStst(await writeStst(SCENE, MEMBERS))

    expect(archive.scene.size).toEqual([320, 180])
    expect(archive.scene.layers.map(l => l.type)).toEqual(['text', 'shape', 'gif'])
    expect(archive.scene.stereo?.sepFar).toBe(60)

    // The handoff `containerRead.ts` names — "caught by whichever validator
    // the caller feeds the scene to next" — on the site's side of the parity
    // claim. `src/cli/scene.ts` does the same with the CLI's validator.
    const loaded = validateScene(archive.scene)
    expect(loaded.layers).toHaveLength(3)
  })

  it('keeps the masks and sources an importer would need', async () => {
    const archive = await readStst(await writeStst(SCENE, MEMBERS))
    expect(archive.members.map(m => `${m.role}:${m.name}`))
      .toEqual(['mask:spin.mask', 'source:spin.gif'])
    expect([...archive.members[0]!.data]).toEqual([1, 2, 3, 4])
  })

  /**
   * The shape a browser actually hands over.
   *
   * `new Uint8Array(await blob.arrayBuffer())` is offset 0, but
   * `file.slice()`, a `subarray` out of a streamed chunk, or a view into a
   * pooled buffer are not — and a reader that reaches `archive.buffer`
   * without adding `archive.byteOffset` reads somebody else's bytes and
   * reports the file as corrupt. `zipRead.ts` gets this right today; nothing
   * pinned it, and no `src/shared/` test passes the reader a non-zero-offset
   * view. It is pinned here because the offset is a *browser*-shaped input.
   */
  it('reads a view with a non-zero byteOffset, which is what a File slice gives', async () => {
    const bytes = await writeStst(SCENE, MEMBERS)
    const padded = new Uint8Array(bytes.length + 7)
    padded.set(bytes, 7)
    const view = padded.subarray(7)
    expect(view.byteOffset).toBe(7)

    const archive = await readStst(view)
    expect(archive.scene.size).toEqual([320, 180])
    expect(archive.members).toHaveLength(2)
  })

  /**
   * Import is the half R17 names, so a `.stst` this build cannot open has to
   * say so rather than half-load. Asserted on the message, not on "it threw":
   * a reader that threw `TypeError` would also satisfy a bare `rejects`.
   */
  it('refuses a file that is not a project, naming what is wrong', async () => {
    const notAZip = new TextEncoder().encode('size: [40, 20]\nlayers: []\n')
    await expect(readStst(notAZip)).rejects.toThrow(/not a zip archive/)

    const bytes = await writeStst(SCENE, [])
    await expect(readStst(bytes.slice(0, bytes.length - 40))).rejects.toThrow(/zip/)
  })
})
