import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderFrame, stillTime } from '../core/index.js'
import type { CanvasLike } from '../core/canvaslike.js'
import { fakeCanvas, rgbaImage } from '../core/testing/fakeCanvas.js'
import { writeStst } from '../shared/container.js'
import type { StstMember } from '../shared/container.js'
import { readStst } from '../shared/containerRead.js'
import { loadProject } from './scene.js'
import type { Scene } from '../core/index.js'

/**
 * The cold container: what a `.stst` is worth on a machine that holds only the
 * `.stst`.
 *
 * This is a **characterisation** file. Every assertion below pins behaviour
 * that is **wrong** — measured wrong, recorded wrong in the design document,
 * and owned by a phase that has not started. It exists because plan §9's
 * standing row says *a recorded note is a sensor* is false: a note tells
 * whoever reads it and nothing makes them read it. The gap was a note in
 * **design §6.2b** and a pre-registered criterion in **plan §7's P5 criterion
 * 6**; this file is the sensor those two asked for.
 *
 * ## TRIPWIRE
 *
 * > **if this reddens because `.stst` became portable, delete the row — do not
 * > flip the expectation.**
 *
 * The operative half of that sentence is in-repo precedent — `site/project.
 * test.ts:307` says it about the two scene validators — and it is here for the
 * same reason: when a characterisation test reddens, the cheapest wrong action
 * is to update the expectation, which buries the fix under a green suite and
 * leaves the next reader believing the behaviour was intended.
 *
 * **Reddening is the success signal for this file.** It is the only file in
 * the repository whose ideal end state is deletion.
 *
 * To be unambiguous about the direction, because "delete the row" is itself an
 * instruction someone could carry out for the wrong reason: delete a row when
 * the **fix** lands — a layer→member mapping in the container format, an
 * exporter that originates members, a resolver that rebases `src` on read
 * (design §6.2b names all three, and says repairing any one alone changes
 * nothing). Do **not** delete a row to make a run green.
 *
 * ## What this file looks like when the gap closes
 *
 * `cold-render` becomes the v1 of this file, which was written first and
 * watched failing: a `.stst` carrying `src: /home/alice/ball.png` plus
 * `sources/ball.png`, opened with nothing on disk but the archive, **renders**
 * — and the recording canvas's request log names the member rather than the
 * absolute path. `cold-project` and `cold-origination` then have no subject
 * left at all and go with it. `shared-basename` is a different defect
 * (design §6.2b's fourth, owned by nobody) and outlives the other three.
 *
 * That whole-file replacement is P5's, not this file's: criterion 6's
 * **re-derivation half** — masks re-derive from the source on resize and on
 * threshold change — needs §6.1 code nobody has written, and criterion 6 is
 * explicit that the cold-container half is a *prerequisite* and does not
 * discharge it.
 *
 * ## This paragraph is not the sensor
 *
 * §9 records a "TRIPWIRE" in `site/dist.test.ts` that turned out to be a
 * docblock with no executable component, and notes that the word itself is
 * what stopped anyone checking. So, stated plainly: the sensors here are the
 * `expect` calls. This docblock is the instruction for when one of them fires,
 * and it was checked by planting against it rather than by being read — see
 * below.
 *
 * ## §6.5a — the paired control, because three of these assert an absence
 *
 * An absence assertion passes when the instrument is broken, so two plants
 * were run against this file and each is recorded with the row it moved:
 *
 * - **A resolver** — five lines in `readStst` rebasing a layer's `src` onto
 *   the `sources/` member whose name it ends with. Exactly two tests failed,
 *   both of them this file's: `cold-project` on `'ball.png'` against
 *   `'/home/alice/ball.png'`, and `cold-render` on the request log, which
 *   read `['ball.png']`. The other two rows stayed green, which is correct —
 *   a read-side resolver is not their subject.
 * - **An originator** — six lines in `loadProject` building a `source` member
 *   from every image layer whose `src` opens. Exactly one test failed,
 *   `cold-origination`, on `[{name: 'ball.png', …}]` against `[]`.
 *
 * Both were reverted. They are recorded because a plant is a measurement with
 * an expiry date (§9): re-establish them against the tree in front of you
 * rather than trusting this paragraph.
 *
 * `shared-basename` needs no control — it asserts a **throw**, which is a
 * presence, and an instrument that cannot see it fails that row rather than
 * passing it.
 *
 * ## Why the pins are structural
 *
 * Invariant 4, and one specific hazard: the measured cold-machine failures are
 * `Invalid URL` and `ENOENT`, which are `@napi-rs/canvas`'s wording and
 * `libuv`'s, not ours. A row pinned to either would redden on a dependency
 * bump and say nothing about portability. So what is pinned is the shape — the
 * string `src` that comes out equals the one that went in, the request log, the
 * member count — and the one message-ish check, `shared-basename`, is pinned
 * to **our** `writeZip`'s refusal and matched loosely.
 */

/**
 * The archive a cold machine is handed: an absolute `src`, and the bytes it
 * names sitting in the same file under both roles.
 *
 * The absolute path is load-bearing and is not decoration. `containerRead.
 * test.ts:326` only *appears* to exercise the layer→member link because its
 * fixture's `src` is coincidentally the bare name `'spin.gif'`, which is also
 * the member name — the two sides match by accident and the test cannot tell a
 * resolver from its absence. A path that no member name can equal removes that
 * coincidence, so these rows measure the link and not a collision.
 */
const SRC = '/home/alice/ball.png'
const MEMBERS: readonly StstMember[] = [
  // Both roles, because design §6.2b's measurement found the correct bytes
  // "sitting unused in `sources/` **and** `masks/` in the same archive". A
  // fixture carrying only one of them would leave the other unmeasured.
  { name: 'ball.png', role: 'mask', data: new Uint8Array([1, 2, 3]) },
  { name: 'ball.png', role: 'source', data: new Uint8Array([4, 5, 6, 7]) },
]
const SCENE: Scene = {
  size: [40, 20],
  layers: [{ type: 'image', src: SRC, depth: 1 }],
}

/** A 4x4 opaque white square. The bytes in the members are never decoded by
 * anything — `fakeCanvas` keys fixtures by request string — so the image a
 * successful load would yield is supplied here instead. That is the honest
 * shape: these rows pin *which string is asked for*, not what decodes. */
const BALL = rgbaImage(4, 4, () => [255, 255, 255, 255])

/**
 * A `CanvasLike` that records every load request before serving it.
 *
 * `src/core/render.test.ts:95`'s `countingCanvas` is the same idiom counting
 * instead of logging. Logging rather than counting because the question here
 * is *which string was asked for*: a count cannot distinguish "asked for the
 * raw `src`" from "asked for the member", and that distinction is the whole
 * subject of the file.
 */
function recordingCanvas(images: Record<string, ReturnType<typeof rgbaImage>>) {
  const base = fakeCanvas({ images })
  const requests: string[] = []
  const canvas: CanvasLike = {
    make: (w, h) => base.make(w, h),
    loadImage: src => {
      requests.push(src)
      return base.loadImage(src)
    },
    loadGif: src => {
      requests.push(src)
      return base.loadGif(src)
    },
  }
  return { canvas, requests }
}

async function archiveOnDisk(scene: Scene, members: readonly StstMember[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'stst-cold-'))
  const path = join(dir, 'project.stst')
  await writeFile(path, await writeStst(scene, members))
  return path
}

describe('a .stst on a machine that holds only the .stst (design §6.2b, plan §7 P5 criterion 6)', () => {
  /**
   * Missing link 1 of design §6.2b's three: *`src` is carried verbatim and
   * never rebased.*
   *
   * Compared against the input rather than against a literal, so the row
   * states the relation — out equals in — rather than today's path. Both
   * spellings, because the measurement found them failing for *different*
   * reasons: an absolute path has nothing to resolve against, and a relative
   * one resolves against the process cwd, which on the cold machine is
   * wherever the user happened to be standing.
   *
   * TRIPWIRE: see this file's docblock. Delete, do not flip.
   */
  it('cold-project carries layer.src verbatim, rebasing it against nothing', async () => {
    for (const src of [SRC, 'ball.png', '../shared/ball.png']) {
      const scene: Scene = { size: [40, 20], layers: [{ type: 'image', src, depth: 1 }] }
      const archive = await readStst(await writeStst(scene, MEMBERS))
      const layer = archive.scene.layers[0]!
      expect(layer.type === 'image' && layer.src, src).toBe(src)

      // And through the CLI's own door, which is what `--save-project` and
      // every render of a project file go through. Measured separately
      // because `loadProject` re-validates the scene and could in principle
      // have rewritten it on the way past; it does not.
      const project = await loadProject(await archiveOnDisk(scene, MEMBERS))
      const loaded = project.scene.layers[0]!
      expect(loaded.type === 'image' && loaded.src, src).toBe(src)
    }
  })

  /**
   * Missing link 2: *no code path connects a container member to a renderer.*
   *
   * The archive carries the bytes under both roles and the renderer asks for
   * the raw `src`, once. This is the row the file was written for, and it is
   * the one the v1 of this file asserted the other way round — the failure
   * that opened it was `fakeCanvas: no image fixture for "/home/alice/ball.
   * png"`, thrown out of `raster.ts`'s `loadImage` with `sources/ball.png`
   * unread in the same archive.
   *
   * The second arm is what makes the row say "wrong name" rather than "wrong
   * bytes": re-key the *same* fixture under the raw `src` and the same scene
   * renders. So the only thing between a cold machine and a picture is that
   * nothing rewrites one string into the other.
   *
   * TRIPWIRE: see this file's docblock. Delete, do not flip.
   */
  it('cold-render asks for the raw src and never for the member holding the bytes', async () => {
    const project = await loadProject(await archiveOnDisk(SCENE, MEMBERS))

    // The bytes are present. "Inert" below is about consumption, not absence,
    // and a row that did not establish this would be consistent with an
    // archive that simply lost them.
    expect(project.members.map(m => `${m.role}:${m.name}`)).toEqual(['mask:ball.png', 'source:ball.png'])

    // Keyed by the MEMBER's name, which is the string a resolver would hand
    // the adapter. Nothing on this machine answers to `SRC`.
    const byMember = recordingCanvas(Object.fromEntries(MEMBERS.map(m => [m.name, BALL])))
    const outcome = await renderFrame(project.scene, stillTime(project.scene), byMember.canvas)
      .then(() => 'rendered' as const, () => 'threw' as const)

    // The whole of the gap, as a value: one request, and it is the scene's
    // own string. No message is pinned — the real adapters throw
    // `@napi-rs/canvas`'s `Invalid URL` and libuv's `ENOENT` here, which are
    // not ours to assert on (invariant 4, and §9's "assert on structure").
    //
    // The outcome is caught into a value and asserted *after* the request log
    // rather than with `rejects.toThrow`, and that ordering is the control's
    // doing rather than a style choice: with the rejection first, a resolver
    // plant short-circuits the test there and the request log — which is the
    // row's actual subject — is never reached, leaving the sharpest line in
    // the file uncontrolled while the row still reddens. §6.5a's "a control
    // must see the specific change under test, not merely see something."
    expect(byMember.requests).toEqual([SRC])
    for (const m of MEMBERS) expect(byMember.requests).not.toContain(m.name)
    expect(outcome).toBe('threw')

    // Same fixture, keyed by the raw `src`: renders. The difference between
    // this arm and the one above is one string, and it is the string nothing
    // in production writes.
    const bySrc = recordingCanvas({ [SRC]: BALL })
    const frame = await renderFrame(project.scene, stillTime(project.scene), bySrc.canvas)
    expect(frame.width).toBeGreaterThan(0)
    expect(bySrc.requests).toEqual([SRC])
  })

  /**
   * Missing link 3: *nothing writes the member in the first place.*
   *
   * `src/cli/index.ts` builds its `--save-project` output from
   * `loadProject(...).members`, so this is that path with the file write
   * elided: a scene file in, a `.stst` out. The shipped exporter prints
   * `scene + 0 members` for a scene with an image layer, and this is that
   * sentence as an assertion.
   *
   * The source file is created on disk and the layer's `src` points straight
   * at it, which is the sharp form of the row: the bytes are **available**,
   * readable, and named by an absolute path, and the export still carries
   * none of them. `scene.test.ts`'s existing "reads a plain .yaml too, with no
   * members" pins the same `[]` over a *text* layer, where there is nothing to
   * originate; the distinction is the point of adding this one.
   *
   * TRIPWIRE: see this file's docblock. Delete, do not flip.
   */
  it('cold-origination writes no member for an image layer whose source is on disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'stst-cold-'))
    const source = join(dir, 'ball.png')
    await writeFile(source, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))
    const scenePath = join(dir, 'scene.json')
    await writeFile(scenePath, JSON.stringify({
      size: [40, 20],
      layers: [{ type: 'image', src: source, depth: 1 }],
    }))

    const project = await loadProject(scenePath)
    expect(project.members).toEqual([])

    // `index.ts`'s two lines, inlined. Round-tripped rather than asserted on
    // `project.members` alone so the row covers the whole export rather than
    // its input: what a second machine receives is this archive.
    const exported = await readStst(await writeStst(project.scene, project.members))
    expect(exported.members).toEqual([])
    const layer = exported.scene.layers[0]!
    // The export's one reference to the image is a path on the exporting
    // machine, which is the entirety of what a second machine is given.
    expect(layer.type === 'image' && layer.src).toBe(source)
  })

  /**
   * Design §6.2b's fourth defect, "found on the way and owned by nobody": two
   * layers whose sources share a basename are unrepresentable.
   *
   * Pinned here rather than left in prose because it bounds the fix: the
   * naming convention `masks/x.png` ↔ `sources/x.png` that links 1 and 2 would
   * be built on cannot address these two layers at all, and the only escape —
   * a directory inside a member name — is refused one line further down.
   * Whoever designs the mapping needs to walk past this.
   *
   * **Do not fix it from here.** It is a container-format decision and it
   * belongs with the other three.
   *
   * This row asserts a throw, so §6.5a's paired-control requirement does not
   * reach it: a blind instrument fails this row rather than passing it.
   *
   * The message is matched loosely and it is **ours** — `src/shared/zip.ts`'s
   * duplicate-entry refusal, reached through `writeStst`. Pinned at all only
   * because "rejects" alone would also be satisfied by a future refusal for an
   * unrelated reason, which would quietly turn this row into a different test.
   */
  it('shared-basename is unrepresentable, so the naming convention cannot address it', async () => {
    const twoLayers: Scene = {
      size: [40, 20],
      layers: [
        { type: 'image', src: '/home/alice/a/logo.png', depth: 1 },
        { type: 'image', src: '/home/alice/b/logo.png', depth: 1 },
      ],
    }
    const collide: StstMember[] = [
      { name: 'logo.png', role: 'source', data: new Uint8Array([1]) },
      { name: 'logo.png', role: 'source', data: new Uint8Array([2]) },
    ]
    await expect(writeStst(twoLayers, collide)).rejects.toThrow(/duplicate/i)

    // The escape is closed too, so there is no spelling of these two members
    // the container accepts.
    await expect(writeStst(twoLayers, [
      { name: 'a/logo.png', role: 'source', data: new Uint8Array([1]) },
      { name: 'b/logo.png', role: 'source', data: new Uint8Array([2]) },
    ])).rejects.toThrow(/directory/i)
  })
})
