import { describe, it, expect } from 'vitest'
import { writeStst } from '../src/shared/container.js'
import type { StstMember } from '../src/shared/container.js'
import { readStst } from '../src/shared/containerRead.js'
import { writeScene } from '../src/shared/sceneWrite.js'
import { writeZip } from '../src/shared/zip.js'
import { validateScene } from './scene.js'
// The CLI's validator, imported into a `site/` test on purpose: the parity
// claim below is about these two functions and cannot be checked from one of
// them. Nothing bundles a `.test.ts`, so this import cannot reach the page —
// `site/dist.test.ts`'s "contains no code from src/node or src/cli" is the
// standing sensor for that, over the built bundle rather than over this graph.
import { validateScene as validateCli } from '../src/cli/scene.js'
import type { Layer, Scene } from '../src/core/types.js'

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
 * - **Parity with the CLI's handoff, over the constructs where parity is
 *   true.** `src/cli/scene.ts` puts an archive's scene through the CLI
 *   validator, because `containerRead.ts` checks "shape and key rosters, not
 *   values". The site has its own validator for the same reason. This file
 *   used to claim the two agree, full stop, and asserted it over a fixture
 *   carrying three of the five layer types and none of the one they disagree
 *   about — so the claim could not fail. The claim is now the measured one,
 *   and the disagreements are assertions rather than an omission. The census
 *   is in the second `describe` below, "CLI/site parity over a .stst".
 */

/**
 * A scene carrying **every layer type both validators accept** — four of the
 * five — rather than the two-key minimum.
 *
 * It carried three before, and that was the defect: `image` was absent for no
 * reason, and `draw` — the one type the two sides genuinely disagree about —
 * was absent in a file whose docblock claimed they agree. `draw` is not added
 * here, because a `Scene` holding one is not a scene both sides accept; it has
 * its own test below, which asserts the disagreement instead of hiding it.
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
    { type: 'image', src: 'photo.png', depth: 0.4, mode: 'heightmap', mask: { luma: 0.5 } },
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
    expect(archive.scene.layers.map(l => l.type)).toEqual(['text', 'shape', 'gif', 'image'])
    expect(archive.scene.stereo?.sepFar).toBe(60)

    // The handoff `containerRead.ts` names — "caught by whichever validator
    // the caller feeds the scene to next" — on the site's side of the parity
    // claim. `src/cli/scene.ts` does the same with the CLI's validator.
    const loaded = validateScene(archive.scene)
    expect(loaded.layers).toHaveLength(4)
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

/* ====================================================== the parity census */

/**
 * **The parity claim, as something that can fail.**
 *
 * The docblock at the top of this file used to say the two validators agree
 * about a scene that came out of a container, and nothing in the file called
 * the CLI's validator at all — the claim was prose, discharged by a fixture
 * carrying `text`, `shape` and `gif`. A claim whose fixture omits the
 * disagreeing case is not a smaller claim, it is a false one, and a smaller
 * true claim is worth more. So the census below is asserted in both
 * directions: where they agree, that they agree *to the byte*; where they
 * disagree, that they still disagree in the recorded direction.
 *
 * ## The census, measured through `writeStst` → `readStst`
 *
 * | layer type | CLI | site | reachable in a `.stst` |
 * |---|---|---|---|
 * | `text`, `shape`, `gif`, `image` | accept | accept | yes — the fixture above |
 * | `draw` | accept | **refuse** | yes, and it is the only type divergence |
 *
 * `draw` is the fifth type, `src/core/types.ts`'s `LAYER_KEYS` has a roster
 * for it, so `writeStst` writes one and `readStst` gives it back — the
 * divergence is reachable by anyone who runs `stst … --save-project` over a
 * scene with a `draw` layer and sends the file on. It is **not a defect to
 * fix here**: design §9.5 is why the site refuses it (a module path cannot be
 * resolved inside a static bundle) and `src/core/types.ts`'s `LAYER_KEYS`
 * docblock already records that the two lists disagree about `draw` on
 * purpose. What was wrong was claiming otherwise.
 *
 * ## What this census does not cover, and why that is still asserted
 *
 * The two validators also disagree about **values**, which is a different
 * axis from layer type and a wider one — `src/cli/scene.ts` is exhaustive by
 * design and `site/scene.ts` is "exactly as permissive as `core`, and no
 * more", so each is stricter than the other in places. Those are named and
 * pinned in the last test below rather than left to a comment: a note is not
 * a sensor, and an axis a reader cannot see is an axis the next fixture omits
 * for the same reason this one did.
 *
 * The **animator** axis — the one `src/shared/sceneWrite.ts`'s
 * `canonicalAnimOne` docblock records, where the CLI discriminates `kind`
 * first and the site `keys` first — is a real divergence between the two
 * functions and is **not reachable through a `.stst`**, measured in both
 * directions below. That is not luck: `containerRead.ts` runs `writeScene`
 * over an archive's scene on the way in, so the roster that refuses a
 * both-keys bag on the way out refuses it on the way in too. It is asserted
 * here because that gate is the only thing standing between this file's
 * parity claim and a counter-example, and nothing else tests it from the
 * importing side.
 */
describe('CLI/site parity over a .stst', () => {
  it('agrees to the byte about the four layer types both sides accept', async () => {
    const archive = await readStst(await writeStst(SCENE, MEMBERS))

    const cli = validateCli(archive.scene, 'shared.stst')
    const site = validateScene(archive.scene)

    // `toEqual` is the parity assertion; it is what the control below moves.
    expect(site).toEqual(cli)

    // The second line is **not** a stronger reading of the first, and saying
    // so is the point of the comment. The two validators really do build a
    // layer in different key orders — the CLI hands the parsed object back,
    // the site rebuilds it field by field, and `sceneWrite.ts`'s docblock
    // measured the divergence at byte 44 — but `writeScene` imposes the
    // rosters' order on both, so order cannot reach this comparison. What it
    // adds is that **both outputs are still saveable**: `writeScene` throws
    // on a key outside a roster, so a validator that started passing some
    // extra field through would fail here even if a future `toEqual` were
    // relaxed. Re-export is the other half of "someone else can import".
    expect(writeScene(site)).toBe(writeScene(cli))
  })

  /**
   * The case the old fixture omitted, in the direction it actually goes.
   *
   * If this ever reddens because the two sides were brought into agreement,
   * the fix is to move `draw` into `SCENE` and delete this test — not to flip
   * the expectation. Stated because the cheapest way to satisfy a failing
   * characterisation is to edit what it characterises.
   */
  it('disagrees about `draw`, the fifth type, and the archive carries one', async () => {
    const withDraw: Scene = {
      ...SCENE,
      layers: [...SCENE.layers, { type: 'draw', fn: './wave.js', depth: 0.3 } as Layer],
    }
    const archive = await readStst(await writeStst(withDraw, MEMBERS))
    expect(archive.scene.layers.map(l => l.type)).toContain('draw')

    expect(validateCli(archive.scene, 'shared.stst').layers).toHaveLength(5)
    // Asserted on the message: the refusal has to be the explained one from
    // `site/scene.ts:268`, not an incidental `TypeError` from somewhere that
    // merely happens to also throw.
    expect(() => validateScene(archive.scene)).toThrow(/layer type "draw" is not supported/)
  })

  it('cannot be handed a {kind, keys} animator, on the way out or the way in', async () => {
    const bag = {
      size: [320, 180] as [number, number],
      layers: [{ type: 'text', text: 'A', anim: { keys: [{ t: 0, x: 0 }], kind: 'move' } }],
    } as unknown as Scene

    // Out: `writeStst` canonicalises through `writeScene`, whose track roster
    // has no `kind`.
    await expect(writeStst(bag, [])).rejects.toThrow(/not in its key roster/)

    // In: the same roster, reached through `containerRead.ts`'s "a scene this
    // build cannot write back" gate — so a `.stst` assembled by someone
    // else's tool cannot smuggle the bag past it either. Hand-built over
    // `writeZip` for that reason: our own writer will not produce this file.
    const te = new TextEncoder()
    const foreign = await writeZip([
      { name: 'mimetype', data: te.encode('application/x-stst'), method: 'store' },
      {
        name: 'scene.json',
        data: te.encode(`${JSON.stringify({
          size: [320, 180],
          layers: [{ type: 'text', text: 'A', anim: { keys: [{ t: 0, x: 0 }], kind: 'move' } }],
        }, null, 2)}\n`),
        method: 'deflate',
      },
      {
        name: 'manifest.json',
        data: te.encode(`${JSON.stringify({
          stst: 1,
          entries: [
            { name: 'mimetype', role: 'mimetype' },
            { name: 'scene.json', role: 'scene' },
            { name: 'manifest.json', role: 'manifest' },
          ],
        }, null, 2)}\n`),
        method: 'deflate',
      },
    ])
    await expect(readStst(foreign)).rejects.toThrow(/cannot write back/)
  })

  /**
   * The value axis, as data rather than as a paragraph.
   *
   * Each row is a scene the container carries happily — `writeScene` checks
   * key rosters, not values — and that exactly one of the two validators
   * refuses. They are not bugs to fix from this file: `src/cli/scene.ts` is
   * deliberately exhaustive and `site/scene.ts` deliberately refuses to be
   * stricter than `core` (its own docblock: "being stricter than core would
   * mean a scene the CLI accepts fails to load from a link"). Pinned so that
   * the next person to widen this file's parity claim has to walk past them.
   *
   * Same rule as the `draw` test: if a row reddens because the two sides were
   * unified, delete the row — do not flip the expectation.
   */
  it('names the value-level disagreements, which the container does carry', async () => {
    const layerScene = (layer: unknown): Scene =>
      ({ size: [320, 180], layers: [layer] }) as unknown as Scene

    const cases: ReadonlyArray<readonly [string, Scene, 'cli' | 'site']> = [
      // CLI bounds `depth` to 0..1; the site says nothing because `core` only
      // clamps it.
      ['depth above 1', layerScene({ type: 'text', text: 'A', depth: 5 }), 'cli'],
      // CLI bounds a luma threshold to 0..1; the site requires only a number.
      ['mask luma above 1', layerScene({ type: 'image', src: 'a.png', mask: { luma: 9 } }), 'cli'],
      // CLI requires a non-negative track offset; the site requires finite.
      ['negative track start', layerScene({ type: 'text', text: 'A', anim: { keys: [{ t: 0 }], start: -5 } }), 'cli'],
      // The site requires a positive track duration; the CLI admits zero.
      ['zero track duration', layerScene({ type: 'text', text: 'A', anim: { keys: [{ t: 0 }], duration: 0 } }), 'site'],
      // The site requires a wedge's bounds both-or-neither, because it
      // rebuilds field by field and would otherwise drop half a wedge; the
      // CLI hands the object back and never looks.
      ['half a wedge', layerScene({ type: 'shape', shape: 'circle', r: 5, start: 10 }), 'site'],
    ]

    for (const [name, scene, refuser] of cases) {
      // Reachability first: a divergence the container cannot carry is not in
      // this criterion's scope, and `unknown layer key` and `unknown scene
      // key` — which also diverge — are excluded for exactly that reason.
      await expect(readStst(await writeStst(scene, []))).resolves.toBeTruthy()

      const cli = (): unknown => validateCli(scene, 'shared.stst')
      const site = (): unknown => validateScene(scene)
      if (refuser === 'cli') {
        expect(() => cli(), name).toThrow()
        expect(() => site(), name).not.toThrow()
      } else {
        expect(() => cli(), name).not.toThrow()
        expect(() => site(), name).toThrow()
      }
    }
  })
})
