import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { decodeGif } from './gif.js'
import { makeGif, solid3Gif } from './testing/gifFixtures.js'
import { writeScene } from './sceneWrite.js'
import { writeZip, type ZipEntry } from './zip.js'
import { writeStst, type StstMember } from './container.js'
import { readStst } from './containerRead.js'
import { CHILD_ENV } from './testing/spawnEnv.js'
import type { Scene } from '../core/types.js'

/**
 * The `.stst` reader (design §6.2, plan P1 criteria 2/4).
 *
 * ## What this file has to prove that a round trip cannot
 *
 * `readStst(writeStst(x))` returning `x` is a fidelity check between two
 * halves written by the same hand against the same reading of the format —
 * the argument `zipRead.ts` already makes for shelling out to `/usr/bin/zip`,
 * and it applies one layer up. So the round trip is here, but so is an archive
 * **assembled by `/usr/bin/zip` from files written by hand**, whose
 * `scene.json` and `manifest.json` are typed out in this file rather than
 * produced by `writeScene` or by `writeStst`. If the two disagree about the
 * layout, only the second one can say so.
 *
 * ## The manifest has to be load-bearing, not decorative
 *
 * A reader that ignored `manifest.json` and recovered each member's role from
 * its directory would pass every round-trip assertion in this file — the
 * writer puts masks under `masks/` and that is a perfectly good prefix to
 * match on. It would also silently accept an archive whose manifest says
 * something else, and `MANIFEST_VERSION` would stay a number nothing reads.
 * Three assertions below exist only to rule that reader out: the role comes
 * from the manifest and a manifest that disagrees with the directory is
 * refused; an archive with no manifest is refused even though its prefixes are
 * intact; and a manifest version this build does not know is refused before
 * `entries` is looked at.
 *
 * ## `/usr/bin/unzip` is not a sensor on its own
 *
 * It was measured accepting malformed variants elsewhere in this suite, so it
 * appears here only as `-t` (a CRC check over every member, extracting
 * nothing) on the hand-built fixture — evidence that the fixture is a sound
 * zip, which is what it is needed for. Every claim about *content* goes
 * through `readStst` and is compared byte for byte.
 */

const KEEP = mkdtempSync(join(tmpdir(), 'stst-read-'))
afterAll(() => rmSync(KEEP, { recursive: true, force: true }))

const te = new TextEncoder()

/**
 * Written out rather than read from `STST_MIMETYPE`.
 *
 * `31baea5` measured this exact trap in the writer's suite: with the
 * expectation taken from the module's own constant, changing the constant left
 * every test green. The reader compares the archive's `mimetype` member
 * against that constant, so a fixture built from it would move with it.
 */
const MEDIA_TYPE = 'application/x-stst'

/** See `container.test.ts`: Cyrillic, an em dash and an astral emoji together. */
const UNICODE_MASK = 'масло — ☕𝄞.png'

/**
 * Member bytes that are **not** a PNG and could not survive a codec, for the
 * reason `container.test.ts` gives: a real PNG would come back identical from
 * a module that decoded and re-encoded it, so it cannot distinguish a reader
 * that carries bytes from one that rebuilds them.
 */
function notAPng(seed: number, length: number): Uint8Array {
  const out = new Uint8Array(length)
  let x = seed >>> 0
  for (let i = 0; i < length; i++) {
    x = (x * 1103515245 + 12345) >>> 0
    out[i] = (x >>> 16) & 0xff
  }
  return out
}

const MASK_A = notAPng(1, 300)
const MASK_UNICODE = notAPng(2, 300)
const SOURCE_A = notAPng(3, 300)
const SOURCE_B = notAPng(4, 300)

/** The same key order `container.test.ts` uses: deliberately not the canonical one. */
function scene(): Scene {
  return {
    layers: [{
      depth: 0.5,
      at: [10, 20],
      text: 'привет',
      type: 'text',
      name: 'greeting',
    }],
    stereo: { sepFar: 110, sepNear: 78 },
    size: [320, 200],
  } as unknown as Scene
}

function straight(): StstMember[] {
  return [
    { name: 'alpha.png', role: 'mask', data: MASK_A },
    { name: UNICODE_MASK, role: 'mask', data: MASK_UNICODE },
    { name: 'a-source.gif', role: 'source', data: SOURCE_A },
    { name: 'b-source.gif', role: 'source', data: SOURCE_B },
  ]
}

/** The same members in an order no part of the layout agrees with. */
function shuffled(): StstMember[] {
  return [
    { name: 'b-source.gif', role: 'source', data: SOURCE_B },
    { name: 'a-source.gif', role: 'source', data: SOURCE_A },
    { name: UNICODE_MASK, role: 'mask', data: MASK_UNICODE },
    { name: 'alpha.png', role: 'mask', data: MASK_A },
  ]
}

/* ------------------------------------------------- hand-assembled archives
 *
 * The negative cases need archives the writer would never produce, so they are
 * built entry by entry over `writeZip` — the layer below the one under test.
 * Each test mutates one thing about the conformant list, which is what makes
 * the resulting throw attributable to that one thing.
 */

interface DraftEntry { name: string; role: string }
interface Draft { stst: number; entries: DraftEntry[] }

/** The manifest `writeStst` would emit for {@link conformantEntries}, typed out. */
function conformantManifest(): Draft {
  return {
    stst: 1,
    entries: [
      { name: 'mimetype', role: 'mimetype' },
      { name: 'scene.json', role: 'scene' },
      { name: 'manifest.json', role: 'manifest' },
      { name: 'masks/alpha.png', role: 'mask' },
      { name: 'sources/a-source.gif', role: 'source' },
    ],
  }
}

function manifestEntry(value: unknown): ZipEntry {
  return { name: 'manifest.json', data: te.encode(`${JSON.stringify(value, null, 2)}\n`), method: 'deflate' }
}

/** Index of `manifest.json` in {@link conformantEntries}, so a test can replace it. */
const MANIFEST_AT = 2

function conformantEntries(manifest: unknown = conformantManifest()): ZipEntry[] {
  return [
    { name: 'mimetype', data: te.encode(MEDIA_TYPE), method: 'store' },
    { name: 'scene.json', data: te.encode(writeScene(scene())), method: 'deflate' },
    manifestEntry(manifest),
    { name: 'masks/alpha.png', data: MASK_A, method: 'deflate' },
    { name: 'sources/a-source.gif', data: SOURCE_A, method: 'deflate' },
  ]
}

/* ------------------------------------------------------------------------ */

describe('readStst', () => {
  it('gives back the scene and the members that went in, in the layout order', async () => {
    const back = await readStst(await writeStst(scene(), straight()))

    expect(back.scene).toEqual(scene())
    expect(back.members).toEqual([
      { name: 'alpha.png', role: 'mask', data: MASK_A },
      { name: UNICODE_MASK, role: 'mask', data: MASK_UNICODE },
      { name: 'a-source.gif', role: 'source', data: SOURCE_A },
      { name: 'b-source.gif', role: 'source', data: SOURCE_B },
    ])

    // The writer normalises member order, so the reader's output is the same
    // list for a caller that handed them over backwards. That is criterion 7's
    // byte-identity seen from this end: two callers who disagree about order
    // cannot produce projects that reopen differently.
    expect(await readStst(await writeStst(scene(), shuffled()))).toEqual(back)

    // The control (§6.5a). Every byte-equality claim in this file rests on
    // `toEqual` discriminating `Uint8Array` **contents**; if it compared only
    // lengths or identity, all of them would be vacuous and all of them would
    // be green. One flipped byte in a same-length copy must separate them.
    const flipped = MASK_A.slice()
    flipped[0] = (flipped[0] as number) ^ 0xff
    expect(back.members[0]?.data).not.toEqual(flipped)
  })

  it('keeps a mask and a source that share a file name apart', async () => {
    // The writer's stated reason for directories over a flat namespace: a
    // baked mask and the source it was baked from can legitimately be called
    // the same thing. A reader that keyed members by bare name would lose one
    // of these, and the round trip would still look like it worked.
    const back = await readStst(await writeStst(scene(), [
      { name: 'logo.png', role: 'mask', data: MASK_A },
      { name: 'logo.png', role: 'source', data: SOURCE_A },
    ]))
    expect(back.members).toEqual([
      { name: 'logo.png', role: 'mask', data: MASK_A },
      { name: 'logo.png', role: 'source', data: SOURCE_A },
    ])
  })

  it('round-trips a multi-frame GIF mask with no convention of its own', async () => {
    // R17 — "animated GIF layers are what it is for; multi-frame masks are too
    // big for a URL" — is the stated reason `.stst` exists, and whether a
    // multi-frame mask is one member or many is an open question for the
    // baking layer (§6.1). This pins what the *container* contributes to that
    // question, which is nothing: a three-frame GIF is bytes with a name, and
    // it comes back as the same bytes under the same name. Neither half needs
    // a frame convention, so neither half can impose one.
    //
    // **That scope limit still stands and is still right.** What it does not
    // cover is the half R17 actually asks for — a *scene* that refers to the
    // member — and until 2026-10-15 that was recorded here as a note rather
    // than asserted anywhere. P1 criterion 9 is the test below this one; see
    // its comment for the measurement that showed the gap was real.
    const gif = solid3Gif()
    const back = await readStst(await writeStst(scene(), [{ name: 'spin.gif', role: 'mask', data: gif }]))

    expect(back.members).toEqual([{ name: 'spin.gif', role: 'mask', data: gif }])
    // And it is still a GIF afterwards, read by a decoder that is not ours:
    // byte equality to a fixture proves the bytes survived, this proves what
    // survived is still three frames of animation.
    expect(decodeGif(back.members[0]!.data).frames.length).toBe(3)
  })

  it('round-trips a project whose scene has a multi-frame gif layer, twice over', async () => {
    /**
     * **P1 criterion 9** (added 2026-10-15), and R17's own words for why it
     * exists: *"that would also save the multi-frame / gif layer if i want to
     * share the full editable project with someone else."*
     *
     * ## The gap this fills, measured rather than argued
     *
     * The test above pins the *member* half — GIF bytes in, same bytes out,
     * still N frames — and deliberately stops there. Nothing pinned the
     * *scene* half, so nothing connected the two. Paired control (§6.5a),
     * both halves named: `writeStst` was patched to carry every member
     * faithfully and silently drop every `type: 'gif'` layer from the scene
     * on the way out — a container that keeps the animation's bytes and loses
     * the layer that refers to them, which is the precise shape of "R17 is
     * unmet". Result: **18 shared test files / 209 tests passed, and the full
     * suite's only failure was the unrelated `dist/` staleness gate.** The
     * whole repo was blind to it. Reverted; this test is what sees it.
     *
     * ## What this does *not* do, because the scope call above is right
     *
     * It imposes no frame convention and no naming convention. The scene and
     * the member share a name because **this test's caller chose that**, the
     * way an import path would; the container is never asked to derive one
     * from the other, and an assertion that it did would be the container
     * answering a question §6.1 owns. What is asserted is only that neither
     * side is mangled, so whatever convention P5 picks still has two intact
     * halves to connect.
     *
     * ## Why write → read → **write**
     *
     * "Share the full editable project" means the recipient opens it, works,
     * and saves again. One round trip proves the bytes arrived; the second
     * write proves nothing was quietly dropped in between — a reader that
     * returned a scene missing `loop` would pass a single round trip against
     * a hand-written expectation and fail here. It is also the cheapest
     * possible assertion: feed `readStst`'s own output straight back in.
     */
    const gif = makeGif(4, 4, [
      { index: 1 }, { index: 2 }, { index: 3 }, { index: 1 }, { index: 2 },
    ])
    // Five, not three: `solid3Gif` is already the fixture above, and a count
    // that differs from the neighbouring test's cannot be satisfied by a
    // decoder that has learned to say 3.
    const FRAMES = 5
    expect(decodeGif(gif).frames.length).toBe(FRAMES)

    /**
     * Every gif-specific key the roster admits, not a minimal layer.
     * `loop` is the one that only a multi-frame layer has any use for, so a
     * roster that lost it would be a `.stst` that cannot express animation —
     * and `type`, `src`, `mode` and `mask` are what make it a *mask* layer
     * rather than a decoration. `id` and `name` are there because a shared
     * project is one someone else's editor has to show in a panel.
     */
    const gifLayer = {
      type: 'gif', src: 'spin.gif', loop: 'pingpong',
      mode: 'silhouette', mask: { luma: 0.4 },
      id: 'G1', name: 'the spinner', depth: 0.75, at: [40, 60],
    }
    const project = {
      layers: [
        { type: 'text', text: 'привет', at: [10, 20], depth: 0.5, name: 'greeting' },
        gifLayer,
        { type: 'shape', shape: 'circle', r: 12, at: [90, 90], depth: 0.2 },
      ],
      stereo: { sepFar: 110, sepNear: 78 },
      size: [320, 200],
    } as unknown as Scene

    // The member list a baking layer would hand over: the baked mask and the
    // original the author imported, under one name in two roles.
    const members: StstMember[] = [
      { name: 'spin.gif', role: 'mask', data: gif },
      { name: 'spin.gif', role: 'source', data: gif },
    ]

    const first = await writeStst(project, members)
    const back = await readStst(first)

    // (a) The layer survived, with every key it went in with. Written out
    // rather than compared to `gifLayer`, so a writer and a reader that agreed
    // on dropping one cannot both move and stay green.
    expect(back.scene.layers.map(l => l.type)).toEqual(['text', 'gif', 'shape'])
    expect(back.scene.layers[1]).toEqual({
      type: 'gif', src: 'spin.gif', loop: 'pingpong',
      mode: 'silhouette', mask: { luma: 0.4 },
      id: 'G1', name: 'the spinner', depth: 0.75, at: [40, 60],
    })

    // (b) The member the layer names is still there, under that name, in both
    // roles, and still decodes to five frames by a decoder that is not ours.
    const named = back.members.filter(m => m.name === gifLayer.src)
    expect(named.map(m => m.role)).toEqual(['mask', 'source'])
    for (const m of named) {
      expect(m.data).toEqual(gif)
      expect(decodeGif(m.data).frames.length).toBe(FRAMES)
    }

    // (c) Re-saving what was opened gives the same file. This is the property
    // "share the editable project" actually needs: `readStst`'s output is
    // shaped to go straight back into `writeStst`, and if that is lossy the
    // loss lands on the recipient's copy rather than the author's.
    const again = await writeStst(back.scene, [...back.members])
    expect(again).toEqual(first)

    /* ----------------------------------------------------------- controls
     *
     * Three nulls above — "the layer matched", "the bytes matched", "the
     * archives matched" — and a null is indistinguishable from a broken
     * instrument unless the same instrument is shown moving. One control per
     * claim, each mutating exactly the thing that claim is about.
     */

    // (a)'s control: a scene with `loop` removed must not satisfy the layer
    // assertion. Otherwise `toEqual` is matching on something weaker than the
    // key set, and a container that dropped `loop` would pass.
    const { loop: _dropped, ...noLoop } = gifLayer
    expect(noLoop).not.toEqual(back.scene.layers[1])

    // (b)'s control: the frame count must be able to be wrong. A two-frame
    // GIF is still a GIF and still decodes, so this separates "it has five
    // frames" from "`decodeGif` returns whatever it is given".
    expect(decodeGif(makeGif(4, 4, [{ index: 1 }, { index: 2 }])).frames.length).not.toBe(FRAMES)

    // (c)'s control: the comparison must separate two archives that differ.
    // A re-save that changed the loop mode is the realistic loss — the layer
    // is still a gif layer, still names the same member, and only the
    // animation's behaviour has gone.
    const edited = {
      ...back.scene,
      layers: back.scene.layers.map((l, i) => (i === 1 ? { ...l, loop: 'once' } : l)),
    } as Scene
    expect(await writeStst(edited, [...back.members])).not.toEqual(first)
  })

  it('reads a .stst assembled by /usr/bin/zip from hand-written parts', async () => {
    // Criterion 2's reasoning, one layer up: a writer and a reader that share
    // one misreading agree perfectly. Nothing in this fixture comes from
    // `writeStst`, and the two text members are typed out below rather than
    // produced by `writeScene` or by `JSON.stringify` of a manifest the writer
    // built — including their indentation and key order, which differ from
    // ours deliberately. A reader that required canonical bytes rather than
    // canonical *structure* would fail here, and should: `unzip -p` plus an
    // editor is a workflow design §6.2 chose this format to allow.
    const dir = mkdtempSync(join(KEEP, 'foreign-'))
    mkdirSync(join(dir, 'masks'))
    mkdirSync(join(dir, 'sources'))

    writeFileSync(join(dir, 'mimetype'), MEDIA_TYPE)
    writeFileSync(join(dir, 'scene.json'), [
      '{',
      '    "layers": [',
      '        {"type": "text", "text": "привет", "name": "greeting", "at": [10, 20], "depth": 0.5}',
      '    ],',
      '    "size": [320, 200],',
      '    "stereo": {"sepNear": 78, "sepFar": 110}',
      '}',
      '',
    ].join('\n'))
    writeFileSync(join(dir, 'manifest.json'), [
      '{"stst": 1, "entries": [',
      '  {"role": "mimetype", "name": "mimetype"},',
      '  {"role": "scene", "name": "scene.json"},',
      '  {"role": "manifest", "name": "manifest.json"},',
      `  {"role": "mask", "name": "masks/${UNICODE_MASK}"},`,
      '  {"role": "source", "name": "sources/a-source.gif"}',
      ']}',
      '',
    ].join('\n'))
    writeFileSync(join(dir, 'masks', UNICODE_MASK), MASK_UNICODE)
    writeFileSync(join(dir, 'sources', 'a-source.gif'), SOURCE_A)

    const path = join(dir, 'hand.stst')
    // Named one by one rather than `-r`: the argument order is the central
    // directory's order, which is the thing the manifest has to agree with.
    // `-X` drops the extra fields `zip` would otherwise attach, which is the
    // variant `zipRead.ts` documents; the methods are left to `zip`, so it
    // stores what deflate would not shrink and both branches get exercised.
    // `env: CHILD_ENV`, never inherited — see `testing/spawnEnv.ts`. The
    // non-ASCII member name makes this the spawn where an inherited locale
    // would be most likely to matter; measured, it does not — `zip` sets the
    // UTF-8 name flag from the bytes, identically under six environments
    // including `env -i`. Pinned anyway so it cannot start to.
    const zipped = spawnSync('/usr/bin/zip', [
      '-X', '-q', path,
      'mimetype', 'scene.json', 'manifest.json', `masks/${UNICODE_MASK}`, 'sources/a-source.gif',
    ], { cwd: dir, env: CHILD_ENV })
    expect(zipped.status, `/usr/bin/zip: ${String(zipped.stderr)}`).toBe(0)

    // `unzip -t` verifies every member's CRC and extracts nothing, so this
    // says the fixture is a sound archive — it says nothing about layout, and
    // is not asked to.
    expect(spawnSync('/usr/bin/unzip', ['-t', path], { env: CHILD_ENV }).status, 'unzip -t').toBe(0)

    const back = await readStst(new Uint8Array(readFileSync(path)))
    expect(back.scene).toEqual(scene())
    expect(back.members).toEqual([
      { name: UNICODE_MASK, role: 'mask', data: MASK_UNICODE },
      { name: 'a-source.gif', role: 'source', data: SOURCE_A },
    ])
  })

  it('refuses a manifest version it does not know, before it parses the entries', async () => {
    // `MANIFEST_VERSION`'s first consumer. `31baea5` added the number with no
    // reader and said so; its argument was that "absence can only ever be read
    // as 1 by a reader that was written knowing 1 existed", and that only pays
    // off if the reader actually branches on it.
    //
    // `entries` is deliberately nonsense here. A reader that validated the
    // entry list first would report *that*, and would therefore have mis-read
    // a version-2 archive's entries before noticing it could not. The message
    // has to name the version it found and the version it can read, or the
    // caller cannot tell "upgrade this program" from "this file is damaged".
    const future = await writeZip(conformantEntries({ stst: 2, entries: 'not a list' }))
    await expect(readStst(future)).rejects.toThrow(/manifest/)
    await expect(readStst(future)).rejects.toThrow(/version 2/)
    await expect(readStst(future)).rejects.toThrow(/\b1\b/)

    // Not a number at all, and not an integer: both are "this is not a version
    // this build knows", and neither may be coerced into one.
    await expect(readStst(await writeZip(conformantEntries({ stst: '1', entries: [] }))))
      .rejects.toThrow(/version/)
    await expect(readStst(await writeZip(conformantEntries({ entries: [] })))).rejects.toThrow(/version/)
  })

  it('takes each role from the manifest, not from the directory the member is in', async () => {
    // The whole criterion. A reader that matched on `masks/` would return this
    // archive as a mask called `alpha.png` and never notice the manifest said
    // otherwise — the manifest would be decorative and nothing would say so.
    const lying = conformantManifest()
    lying.entries[3] = { name: 'masks/alpha.png', role: 'source' }
    await expect(readStst(await writeZip(conformantEntries(lying)))).rejects.toThrow(/masks\/alpha\.png/)
    await expect(readStst(await writeZip(conformantEntries(lying))))
      .rejects.toThrow(/a source is placed under sources\//)

    // And the other half: an archive whose prefixes are all intact and whose
    // manifest is simply gone. A prefix reader would open it happily.
    const noManifest = conformantEntries().filter(e => e.name !== 'manifest.json')
    await expect(readStst(await writeZip(noManifest))).rejects.toThrow(/has no manifest\.json entry/)
  })

  it('holds the manifest and the central directory to one list in one order', async () => {
    // `31baea5` stored no sizes and no checksums in the manifest on the
    // argument that the central directory already holds both and "a second
    // copy is a second thing that can disagree". That makes the *name list*
    // the only place the two can disagree, so it is the one relation worth
    // asserting — and §9 is explicit that an unasserted invariant is a note,
    // not a sensor. Three mutations, three distinguishable messages: the
    // caller has to be able to tell a damaged archive from a stale manifest.
    const shortManifest = conformantManifest()
    shortManifest.entries.pop()
    await expect(readStst(await writeZip(conformantEntries(shortManifest))))
      .rejects.toThrow(/sources\/a-source\.gif, which manifest\.json does not name/)

    const longManifest = conformantManifest()
    longManifest.entries.push({ name: 'masks/ghost.png', role: 'mask' })
    await expect(readStst(await writeZip(conformantEntries(longManifest))))
      .rejects.toThrow(/names masks\/ghost\.png, which the archive does not contain/)

    const reordered = conformantManifest()
    const last = reordered.entries.pop()!
    reordered.entries.splice(3, 0, last)
    await expect(readStst(await writeZip(conformantEntries(reordered)))).rejects.toThrow(/in a different order/)
  })

  it('refuses a manifest it cannot read at all', async () => {
    const withManifest = (data: Uint8Array): ZipEntry[] => {
      const entries = conformantEntries()
      entries[MANIFEST_AT] = { name: 'manifest.json', data, method: 'deflate' }
      return entries
    }

    await expect(readStst(await writeZip(withManifest(te.encode('{not json'))))).rejects.toThrow(/not valid JSON/)
    // A lone 0xff is not valid UTF-8 anywhere. The decoder is strict for the
    // reason `zipRead.ts` gives: U+FFFD would turn an unreadable manifest into
    // a plausible-looking one.
    await expect(readStst(await writeZip(withManifest(new Uint8Array([0xff, 0xfe, 0x00])))))
      .rejects.toThrow(/manifest\.json is not valid UTF-8/)
    // Valid JSON, wrong shape. Both would read as "zero entries" to anything
    // that indexed without checking, and an archive with members would then
    // come back empty — the project opening with its masks gone. They are
    // separated rather than folded into one match because they fail at
    // different points: an array has no `stst` to read, so it cannot even
    // reach the version check, while an object missing `entries` has passed it.
    await expect(readStst(await writeZip(withManifest(te.encode('[]'))))).rejects.toThrow(/JSON object/)
    await expect(readStst(await writeZip(withManifest(te.encode('{"stst": 1}'))))).rejects.toThrow(/entries/)
  })

  it('refuses a duplicate member and a role it does not know', async () => {
    // A name twice in the manifest. It cannot be twice in the archive —
    // `writeZip` refuses that and so does `/usr/bin/zip` — so the duplicate
    // check has to run before the name-list relation, or this reports as a
    // length mismatch and the caller is told the wrong thing.
    const twice = conformantManifest()
    twice.entries.splice(4, 0, { name: 'masks/alpha.png', role: 'mask' })
    await expect(readStst(await writeZip(conformantEntries(twice)))).rejects.toThrow(/twice|duplicate/i)

    // An unknown role is a `.stst` from a build that knows something this one
    // does not — exactly what the version number is for, so meeting one under
    // version 1 means the file is wrong rather than new.
    const unknownRole = conformantManifest()
    unknownRole.entries[3] = { name: 'masks/alpha.png', role: 'texture' }
    await expect(readStst(await writeZip(conformantEntries(unknownRole))))
      .rejects.toThrow(/role "texture", which this build has no meaning for/)

    // A member name with a directory part the container never writes. The
    // writer refuses to *place* one (`container.ts`'s `checkMemberName`); this
    // is the same rule met from the other side, where accepting it would hand
    // back a member whose name cannot be written out again.
    const nested = conformantManifest()
    nested.entries[3] = { name: 'masks/sub/alpha.png', role: 'mask' }
    const nestedEntries = conformantEntries(nested)
    nestedEntries[3] = { name: 'masks/sub/alpha.png', data: MASK_A, method: 'deflate' }
    await expect(readStst(await writeZip(nestedEntries)))
      .rejects.toThrow(/masks\/sub\/alpha\.png is not a bare file name/)
  })

  it('refuses an archive that is a zip but not a .stst', async () => {
    // Wrong media type. The manifest is intact, so everything else about this
    // archive is readable — and it is still not a project file this build
    // should open, because `mimetype` is the one thing another program
    // identifies the format by.
    const wrongType = conformantEntries()
    wrongType[0] = { name: 'mimetype', data: te.encode('application/zip'), method: 'store' }
    await expect(readStst(await writeZip(wrongType)))
      .rejects.toThrow(/declares the media type "application\/zip"/)

    // The three fixed entries, out of order. `mimetype` must be first and
    // stored or the fixed-offset sniff `container.ts` documents does not work,
    // and a reader that accepted any order would let that rot silently.
    const swapped = conformantEntries()
    const manifestFirst = conformantManifest()
    manifestFirst.entries = [
      { name: 'scene.json', role: 'scene' },
      { name: 'mimetype', role: 'mimetype' },
      { name: 'manifest.json', role: 'manifest' },
      { name: 'masks/alpha.png', role: 'mask' },
      { name: 'sources/a-source.gif', role: 'source' },
    ]
    swapped[MANIFEST_AT] = manifestEntry(manifestFirst)
    const head = swapped[0]!
    swapped[0] = swapped[1]!
    swapped[1] = head
    await expect(readStst(await writeZip(swapped))).rejects.toThrow(/must begin with mimetype/)

    // A directory record. `writeZip` emits none and `readZip` surfaces them
    // separately rather than discarding them, so they arrive here as entries
    // the manifest does not name — which is the same hole as a smuggled
    // member, and is reported rather than skipped.
    const withDir = conformantEntries()
    withDir.splice(3, 0, { name: 'masks/', data: new Uint8Array(0), method: 'store' })
    await expect(readStst(await writeZip(withDir)))
      .rejects.toThrow(/directory records the manifest cannot name: masks\//)
  })

  it('refuses a scene it would not be able to save again', async () => {
    // `writeScene` is the only `Scene`→text path in the repo and it refuses a
    // key that is on no roster, "because a key missing from a saved .stst is
    // the author's work gone with no error raised". A reader that handed back
    // a scene the writer will not accept defers that loss to the next save,
    // where the user has already done an hour of work on top of it.
    const entries = conformantEntries()
    entries[1] = {
      name: 'scene.json',
      data: te.encode('{"size": [320, 200], "layers": [], "nope": 1}\n'),
      method: 'deflate',
    }
    await expect(readStst(await writeZip(entries))).rejects.toThrow(/scene\.json/)
    await expect(readStst(await writeZip(entries))).rejects.toThrow(/key roster/)

    const notJson = conformantEntries()
    notJson[1] = { name: 'scene.json', data: te.encode('{oops'), method: 'deflate' }
    await expect(readStst(await writeZip(notJson)))
      .rejects.toThrow(/scene\.json is not valid UTF-8 JSON/)
  })
})
