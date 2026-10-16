import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { writeScene } from './sceneWrite.js'
import { STST_ENTRY_ORDER, STST_MIMETYPE, writeStst, type StstMember } from './container.js'
import { writeZip } from './zip.js'
import { CHILD_ENV } from './testing/spawnEnv.js'
import type { Scene } from '../core/types.js'

/**
 * The `.stst` container assembler (design §6.2, plan P1 criteria 3/4/5/7).
 *
 * ## What this file is for that `zip.test.ts` is not
 *
 * `zip.test.ts` pins the *archive*: headers that agree, a fixed timestamp, a
 * level the platform chose. It says nothing about which entries a `.stst`
 * holds or in what order, because `writeZip` does not know — its own docblock
 * hands that obligation to its caller in writing. Until now there was no
 * caller: the layout existed as a fixture in `zip.test.ts:235-243` and as
 * prose in `zip.ts:254-268`, and a fixture is not a specification. This file
 * is the specification, and `container.ts` is the one place that knows it.
 *
 * ## Why the order assertions go through `/usr/bin/unzip -Z1`
 *
 * The property under test is "two callers that disagree about order get the
 * same bytes", and reading that back through our own `readZip` would let a
 * writer and reader sharing one misreading agree perfectly — the argument
 * `zip.test.ts` already makes for shelling out. `zipinfo`'s `-1` lists names
 * in **central-directory order and does not sort them**: measured against an
 * archive built by `/usr/bin/zip -X out.zip zzz.txt mmm.txt aaa.txt`, which
 * `-Z1` reports in that order and not alphabetically. An instrument that
 * sorted would have made every order assertion below vacuously green.
 *
 * There is no `HAVE_UNZIP` guard here either, for the reason `zip.test.ts`
 * sets out at length: a skip-guard fails open in exactly the environment
 * where the test stops teaching anything.
 */

const KEEP = mkdtempSync(join(tmpdir(), 'stst-container-'))
afterAll(() => rmSync(KEEP, { recursive: true, force: true }))

let seq = 0
function onDisk(archive: Uint8Array): string {
  const path = join(KEEP, `c${seq++}.stst`)
  writeFileSync(path, archive)
  return path
}

const te = new TextEncoder()
const td = new TextDecoder('utf-8', { fatal: true })
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/**
 * `spawnSync`, never `execFileSync`: `execFileSync` throws on a non-zero exit,
 * which makes `expect(status).toBe(0)` written over it unreachable and
 * decorative. A missing binary gives `status === null`, which `toBe(0)` also
 * rejects, so the no-guard decision above fails closed.
 */
function unzip(args: readonly string[]): { status: number | null; stdout: Uint8Array } {
  // `env: CHILD_ENV`, never inherited — see `testing/spawnEnv.ts`.
  const res = spawnSync('/usr/bin/unzip', [...args], {
    maxBuffer: 64 * 1024 * 1024, env: CHILD_ENV,
  })
  return { status: res.status, stdout: new Uint8Array(res.stdout ?? Buffer.alloc(0)) }
}

/** Entry names in central-directory order, from `zipinfo`, unsorted. */
function namesInArchive(path: string): string[] {
  const got = unzip(['-Z1', path])
  expect(got.status, 'unzip -Z1').toBe(0)
  return td.decode(got.stdout).split('\n').filter(s => s !== '')
}

function extract(path: string, name: string): Uint8Array {
  const got = unzip(['-p', path, name])
  expect(got.status, `unzip -p ${name}`).toBe(0)
  return got.stdout
}

// ---------------------------------------------------------------------- scene

/**
 * A scene whose keys are inserted in a deliberately hostile order.
 *
 * Load-bearing for criterion 2 — "serialised through the existing
 * `writeScene`, not a second JSON path". There is no way to assert that from
 * outside the module except by behaviour: a second `JSON.stringify` would
 * emit these keys in the order they were typed, and `writeScene` emits them
 * in `SCENE_KEYS`/`LAYER_KEYS` order with two-space indent and a trailing
 * newline. The extracted bytes can therefore only match `writeScene`'s if
 * `writeScene` is what produced them.
 */
function hostileScene(): Scene {
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

// --------------------------------------------------------------------- members

/**
 * A non-ASCII mask member name.
 *
 * Not decoration. Design §6.2 puts baked masks in the container and §6.1 bakes
 * them from user uploads; the layer panel derives mask names from
 * `layerName()`, which returns the author's own text verbatim. A layer called
 * `масло` produces a member called `масло`. Cyrillic, an em dash and an
 * astral-plane emoji together cover two-, three- and four-byte UTF-8, which is
 * where a hand-written central directory gets the UTF-8 name flag wrong
 * silently.
 */
const UNICODE_MASK = 'масло — ☕𝄞.png'

/**
 * Mask bytes that are **not** a PNG and could not survive a codec.
 *
 * This is the sensor for criterion 6 — the container does not bake masks. A
 * fixture that was a real PNG would come back byte-identical from a module
 * that decoded and re-encoded it, so it would be consistent with the thing
 * the criterion forbids. Arbitrary bytes with a deliberately wrong signature
 * are not: anything that parsed, resampled or re-encoded them would either
 * throw or emit something else.
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

/**
 * The members in one order, and the same members in a different one.
 *
 * `shuffled` is a deliberate permutation rather than a random one: a shuffle
 * that happened to be the identity would turn the order assertions into
 * tautologies on some runs, and a test that passes for the wrong reason
 * intermittently is worse than one that never runs. It reverses the roles
 * relative to each other **and** reverses the names within each role, so
 * neither "sources came first" nor "names arrived descending" can be the
 * reason the output matches.
 */
function straight(): StstMember[] {
  return [
    { name: 'alpha.png', role: 'mask', data: MASK_A },
    { name: UNICODE_MASK, role: 'mask', data: MASK_UNICODE },
    { name: 'a-source.gif', role: 'source', data: SOURCE_A },
    { name: 'b-source.gif', role: 'source', data: SOURCE_B },
  ]
}

function shuffled(): StstMember[] {
  return [
    { name: 'b-source.gif', role: 'source', data: SOURCE_B },
    { name: 'a-source.gif', role: 'source', data: SOURCE_A },
    { name: UNICODE_MASK, role: 'mask', data: MASK_UNICODE },
    { name: 'alpha.png', role: 'mask', data: MASK_A },
  ]
}

/** The layout this file pins, written out rather than derived from the module. */
const EXPECTED_NAMES = [
  'mimetype',
  'scene.json',
  'manifest.json',
  'masks/alpha.png',
  `masks/${UNICODE_MASK}`,
  'sources/a-source.gif',
  'sources/b-source.gif',
]

interface Manifest {
  readonly stst: number
  readonly entries: readonly { readonly name: string; readonly role: string }[]
}

/* ----------------------------------------------- the compression-method field
 *
 * Deliberately a second, test-local reader rather than `zipRead.ts` or
 * `container.ts`'s own entry list. The claim is about what is *in the file*,
 * and a claim discharged by re-reading the literal that wrote the file is the
 * derivation running twice (§9). `zip.test.ts` makes the same argument for its
 * own parser and this is the same shape of thing, scoped to one field.
 *
 * The format records the method **twice** — once in each entry's local header
 * and once in its central-directory record — and a reader may consult either,
 * so both are collected and compared. An archive whose two halves disagreed
 * would extract differently depending on which the tool trusted.
 */
const METHOD_STORE = 0
const METHOD_DEFLATE = 8

function methodsOf(archive: Uint8Array): { local: number[]; central: number[]; names: string[] } {
  const v = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
  const utf8 = new TextDecoder('utf-8', { fatal: true })

  // Scanned for, not computed from the end: the EOCD is variable-length in
  // the format, and locating it at a fixed offset would be an assumption
  // about our own writer rather than a reading of the file.
  let eocd = -1
  for (let i = archive.length - 22; i >= 0; i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  expect(eocd, 'end-of-central-directory signature').toBeGreaterThanOrEqual(0)

  const count = v.getUint16(eocd + 10, true)
  let at = v.getUint32(eocd + 16, true)
  const local: number[] = []
  const central: number[] = []
  const names: string[] = []
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(at, true), `central record ${i}`).toBe(0x02014b50)
    const nameLen = v.getUint16(at + 28, true)
    central.push(v.getUint16(at + 10, true))
    names.push(utf8.decode(archive.subarray(at + 46, at + 46 + nameLen)))

    const localAt = v.getUint32(at + 42, true)
    expect(v.getUint32(localAt, true), `local header ${i}`).toBe(0x04034b50)
    local.push(v.getUint16(localAt + 8, true))

    at += 46 + nameLen + v.getUint16(at + 30, true) + v.getUint16(at + 32, true)
  }
  return { local, central, names }
}

// ---------------------------------------------------------------------------

describe('writeStst', () => {
  it('lays the archive out in the declared order, whatever order the caller used', async () => {
    const path = onDisk(await writeStst(hostileScene(), straight()))

    // Written out, not derived from `STST_ENTRY_ORDER` or from the member
    // list: §9 — "a guard derived from the roster it guards proves only that
    // the derivation ran twice." A test that built its expectation from the
    // module's own constants would stay green if the layout were silently
    // reordered, because writer and expectation would move together.
    expect(namesInArchive(path)).toEqual(EXPECTED_NAMES)

    // And the same list from a caller that handed the members over backwards.
    // This is criterion 7's mechanism: byte-identity between two callers is a
    // property of the assembler, not an agreement between them.
    const other = onDisk(await writeStst(hostileScene(), shuffled()))
    expect(namesInArchive(other)).toEqual(EXPECTED_NAMES)
  })

  it('emits byte-identical archives from member lists in different orders', async () => {
    const a = await writeStst(hostileScene(), straight())
    const b = await writeStst(hostileScene(), shuffled())
    expect(sha(b)).toBe(sha(a))

    // The control (§6.5a): "the digests matched" is a null measurement, and a
    // null is indistinguishable from a broken instrument unless the same
    // instrument is shown moving. Change one byte of one mask and the same
    // comparison must separate them — otherwise `sha` could be hashing
    // something that is not the archive.
    const moved = straight()
    const tweaked = MASK_A.slice()
    tweaked[0] = (tweaked[0] as number) ^ 0xff
    moved[0] = { name: 'alpha.png', role: 'mask', data: tweaked }
    expect(sha(await writeStst(hostileScene(), moved))).not.toBe(sha(a))
  })

  it('emits byte-identical archives for two calls, whatever the clock says', async () => {
    const first = await writeStst(hostileScene(), straight())
    expect(sha(await writeStst(hostileScene(), straight()))).toBe(sha(first))

    // `zip.test.ts` already pins the mtime fields against a moving clock, and
    // this is not that test repeated: the **manifest** is a new place a
    // timestamp could enter — "saved at" is the obvious field to want — and
    // it is a member payload, which no assertion in `zip.test.ts` can see.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('1999-12-31T23:59:59Z'))
      const atY2K = await writeStst(hostileScene(), straight())
      vi.setSystemTime(new Date('2038-01-19T03:14:07Z'))
      const atEpochEnd = await writeStst(hostileScene(), straight())
      expect(sha(atY2K)).toBe(sha(first))
      expect(sha(atEpochEnd)).toBe(sha(first))
    } finally {
      vi.useRealTimers()
    }

    // The control (§6.5a): three nulls in a row are evidence only if the same
    // instrument can be seen moving. A one-pixel change to the scene is an
    // input the archive is supposed to carry, so the digest must separate it.
    const other = { ...hostileScene(), size: [321, 200] } as unknown as Scene
    expect(sha(await writeStst(other, straight()))).not.toBe(sha(first))
  })

  it('stores every entry, so byte-identity does not rest on a deflater default', async () => {
    const archive = await writeStst(hostileScene(), straight())
    const { local, central, names } = methodsOf(archive)

    // Criterion 7, rewritten 2026-10-15 on measurement.
    // `CompressionStream('deflate-raw')` was measured byte-identical between
    // Node 22.14.0 and Chromium 151 across nine fixtures — and **Firefox 153
    // emits +59% and WebKit 26 emits 10.7x**, diverging at byte 0 or 1. All
    // four round-trip; none of them is wrong. The Streams spec fixes no level,
    // no strategy, no `memLevel` and no `windowBits`, so the Node/Chromium
    // agreement is two implementations happening to wrap zlib at its default
    // and nothing holds them there. Storing every entry makes "the CLI and the
    // site emit identical bytes" true by construction in every engine instead.
    expect(names).toEqual(EXPECTED_NAMES)
    expect(local).toEqual(new Array(EXPECTED_NAMES.length).fill(METHOD_STORE))
    // The format writes the method twice and a reader may consult either; a
    // writer that let the two drift produces an archive that extracts
    // differently depending on which half the tool trusts.
    expect(central).toEqual(local)

    // The control (§6.5a). "Every method field read 0" is a null measurement,
    // and a null cannot be told from a parser that returns 0 whatever it is
    // pointed at. The same function over an archive built one layer down with
    // an explicitly deflated entry must report 8 — and must report it in both
    // halves, or the local-versus-central comparison above is vacuous too.
    const deflated = await writeZip([
      { name: 'mimetype', data: te.encode(STST_MIMETYPE), method: 'store' },
      { name: 'scene.json', data: te.encode(writeScene(hostileScene())), method: 'deflate' },
    ])
    expect(methodsOf(deflated).local).toEqual([METHOD_STORE, METHOD_DEFLATE])
    expect(methodsOf(deflated).central).toEqual([METHOD_STORE, METHOD_DEFLATE])
  })

  /**
   * The same claim as the test above, but about the **writer** rather than
   * about one fixture — and the two are not the same claim.
   *
   * The test above reads the method fields of an archive built from
   * `straight()`, whose members are four 300-byte pseudo-random blobs. That is
   * "all-store holds for this fixture". Criterion 7 asks for something
   * stronger: that the method is never *chosen* — that it is a property of the
   * module and not of the bytes handed to it. The difference is measurable.
   * `method: p.data.length > 100000 ? 'deflate' : 'store'` — a textbook content
   * dependence, and the exact class criterion 7 exists to remove — leaves the
   * test above green, because no member in `straight()` reaches 100,000 bytes.
   * It was planted and measured: **13 of 13 green in this file**, 26 files /
   * 421 tests green across the shared suite. A fixture-scoped assertion cannot
   * see a threshold the fixture does not cross, and nothing says a future
   * threshold would be 100,000.
   *
   * So this sweeps the two axes a content-dependent rule could key on, since
   * there are only two: **length** and **compressibility**. Lengths run from 0
   * to 512 KiB across six orders of magnitude, crossing 64 KiB (the classic
   * chunk boundary) and 100 KiB; each length appears twice, once as
   * `notAPng` pseudo-random bytes and once as a single repeated byte that
   * deflates to roughly 0.1% of itself. "Every entry stored" over that matrix
   * is a statement about the writer. Over one fixture it is a statement about
   * the fixture.
   *
   * **The `notAPng` arm was described as "incompressible" and only the 1 KiB
   * one is.** Measured with `zlib.deflateRawSync`: 1 KiB → 1029 bytes (1.0:1,
   * incompressible as claimed), 64 KiB + 1 → 7142 (9.2:1), 512 KiB → 12,049
   * (43.5:1). The generator is the reason — `x * 1103515245` exceeds 2^53
   * once `x` is past ~8.2e6, so the product is rounded before `>>> 0` and the
   * recurrence is not the modular LCG it reads as; the state falls into a
   * cycle of period **6063** after a 2415-step tail, and deflate's 32 KiB
   * window sees that cycle in anything longer than the tail.
   *
   * Left as it is, deliberately. `notAPng`'s contract is "not a PNG and could
   * not survive a codec", which it still satisfies, and changing the bytes
   * would move every length and method assertion in this file for a reason
   * unrelated to what they check. What it costs is narrower than it looks but
   * is real: the compressible/incompressible contrast is genuine only at the
   * 1 KiB pair, and at 64 KiB + 1 and 512 KiB both arms are compressible. So
   * the **length** axis is swept as described and the **compressibility**
   * axis is swept at one length rather than three. A content rule keyed on
   * compressibility alone, at a threshold above 1 KiB, is the gap.
   *
   * ## The size relation, which does not read the method field at all
   *
   * Reading method fields and asserting they are 0 has a cheapest-wrong
   * satisfying action (plan §6.5a): write 0 into the header while deflating the
   * payload, and every assertion above still passes. The archive **length** is
   * immune to that. With every entry stored, growing one member by *n* bytes
   * grows the archive by exactly *n*, so `archive.length - payload.length` is
   * one constant across the whole matrix — whatever the payload is. Deflate
   * anything, by any rule, and that number moves: measured under the planted
   * `> 100_000` rule, by **523,763** on the repeated 512 KiB member and by
   * **512,239** on the `notAPng` one. (This said "a few bytes on the
   * incompressible ones", which was the same mistake as above: the 512 KiB
   * `notAPng` member is not incompressible and moves by half a megabyte. The
   * members that genuinely move by a few bytes are the sub-100 KiB ones, and
   * under *this* rule they do not move at all, because it does not deflate
   * them.) It is a single number, derived from no literal of the module's,
   * and it is checked for every arm.
   *
   * Nothing here greps `container.ts` for `'store'`. A source grep is satisfied
   * by the word appearing in a comment, which is the cheapest wrong action of
   * all, and it goes blind the moment the literal moves behind a helper.
   */
  it('stores every entry whatever the payload is, not merely for this fixture', async () => {
    // Deliberately **not** derived from `notAPng`'s seed list or from
    // `straight()`: these exist to be unlike the fixture. The repeated-byte
    // arms are the ones a size-and-compressibility rule would deflate.
    const payloads: readonly (readonly [string, Uint8Array])[] = [
      ['empty', new Uint8Array(0)],
      ['1 byte', new Uint8Array([0x5a])],
      ['1 KiB random', notAPng(101, 1024)],
      ['1 KiB repeated', new Uint8Array(1024).fill(0x5a)],
      ['64 KiB + 1 random', notAPng(102, 65537)],
      ['64 KiB + 1 repeated', new Uint8Array(65537).fill(0x00)],
      ['512 KiB random', notAPng(103, 512 * 1024)],
      ['512 KiB repeated', new Uint8Array(512 * 1024).fill(0xff)],
    ]

    // One member, one name, one scene, so that archive length varies with the
    // payload and with nothing else. A varying name would change the header
    // overhead and make the size relation below unreadable.
    const overheads = new Map<string, number>()
    for (const [label, data] of payloads) {
      const archive = await writeStst(hostileScene(), [{ name: 'p.bin', role: 'mask', data }])
      const { local, central, names } = methodsOf(archive)
      expect(local, `local methods · ${label}`).toEqual(new Array(names.length).fill(METHOD_STORE))
      expect(central, `central methods · ${label}`).toEqual(local)
      overheads.set(label, archive.length - data.length)
    }

    // The size relation. Reported as a label→value map rather than as a set
    // size, so a failure names *which* payload was treated differently
    // instead of only saying that one of eight was.
    const flat = [...overheads.values()]
    expect(Object.fromEntries(overheads), 'archive bytes in excess of the payload')
      .toEqual(Object.fromEntries([...overheads.keys()].map(k => [k, flat[0]])))

    // The scene is a payload too. `writeStst` serialises it itself, so a rule
    // keyed on `sceneText.length` would never touch a member — and the member
    // sweep above would stay green. A layer whose text is 200,000 repeated
    // characters makes `scene.json` both the largest entry in the archive and
    // by far the most compressible one.
    const fat = { ...hostileScene() } as unknown as Scene
    const layers = (fat as unknown as { layers: { text: string }[] }).layers
    layers[0] = { ...(layers[0] as { text: string }), text: 'я'.repeat(200_000) }
    const fatArchive = await writeStst(fat, straight())
    const fatMethods = methodsOf(fatArchive)
    expect(fatMethods.local, 'local methods · 200k-character scene')
      .toEqual(new Array(EXPECTED_NAMES.length).fill(METHOD_STORE))
    expect(fatMethods.central, 'central methods · 200k-character scene').toEqual(fatMethods.local)

    // The control (§6.5a), both halves. Every assertion above is a null —
    // "nothing read 8, nothing moved" — and a null is indistinguishable from
    // an instrument that cannot move. So the same two instruments are run over
    // archives built one layer down with the methods chosen from the content,
    // and both must report the difference rather than merely failing to be 0.
    const asWritten: number[] = []
    const asChosen: number[] = []
    const lengths: number[] = []
    for (const [, data] of payloads) {
      const chosen = await writeZip([
        { name: 'mimetype', data: te.encode(STST_MIMETYPE), method: 'store' },
        // The rule the criterion forbids, in its most plausible form: deflate
        // the big ones. 100,000 is V-1's planted threshold, reused so the
        // control is the mutation and not a different thing that also moves.
        { name: 'masks/p.bin', data, method: data.length > 100_000 ? 'deflate' : 'store' },
      ])
      asChosen.push(methodsOf(chosen).local[1] as number)
      asWritten.push(METHOD_STORE)
      lengths.push(chosen.length - data.length)
    }

    // Half one: the method-field reader moves. 0,0,0,0,0,0,8,8 against the
    // all-zero vector the writer produces — so the zeros above are a reading
    // and not a constant.
    expect(asChosen).not.toEqual(asWritten)
    expect(asChosen.filter(m => m === METHOD_DEFLATE)).toHaveLength(2)

    // Half two: the size relation moves, and it moves on the *values*, not on
    // a pass/fail. Under the forbidden rule the excess-over-payload figure
    // spans a range of hundreds of kilobytes instead of being one number.
    //
    // **Where 400_000 comes from**, measured over this exact payload list and
    // this exact rule rather than chosen to clear today's number. The six
    // members at or below 100,000 bytes are untouched by the rule and sit at
    // a constant excess of **+230**; the two 512 KiB members are deflated,
    // to **-512,009** (`notAPng`) and **-523,533** (the repeated byte). So
    // `max - min` is **523,763**, and the floor has ~124 KB of headroom.
    //
    // The headroom is the part that needed a reason, because the floor is
    // *not* independent of zlib: clearing 400,000 requires the repeated 512
    // KiB member to deflate to under ~124 KB, i.e. better than **4.2:1** on a
    // run of 524,288 identical bytes. Measured, zlib gets 525 bytes — about
    // 1000:1 — so the margin is three orders of magnitude, and no deflate
    // implementation that emits a compressed block at all comes near 4.2:1 on
    // a constant run. A floor nearer 523,000 would instead redden on an
    // engine or level change, which is §9's "a numeric floor chosen from
    // today's count is a check". The floor's job is to exclude 0 — the spread
    // `flat` asserts on the next line — not to pin a ratio.
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeGreaterThan(400_000)
    expect(Math.max(...flat) - Math.min(...flat)).toBe(0)
  })

  it('passes /usr/bin/unzip -t', async () => {
    expect(unzip(['-t', onDisk(await writeStst(hostileScene(), straight()))]).status).toBe(0)
  })

  it('gives back exactly the bytes writeScene produced for scene.json', async () => {
    const scene = hostileScene()
    const path = onDisk(await writeStst(scene, straight()))

    // Criterion 4, and criterion 2 with it. `writeScene` is called here on the
    // same scene; if the module had its own JSON path the key order, the
    // indent or the trailing newline would differ and these bytes would not
    // match. `-p` writes the extracted bytes to stdout, so this is the archive
    // round-tripping through a program that is not ours.
    expect(extract(path, 'scene.json')).toEqual(te.encode(writeScene(scene)))

    // The control: the comparison must be able to fail. `writeScene` of a
    // different scene is the same shape of value, so this separates "the
    // bytes match" from "the comparison matches anything".
    const otherScene = { ...hostileScene(), size: [321, 200] } as unknown as Scene
    expect(extract(path, 'scene.json')).not.toEqual(te.encode(writeScene(otherScene)))
  })

  it('carries member bytes verbatim, baking nothing', async () => {
    const path = onDisk(await writeStst(hostileScene(), straight()))

    // Criterion 6. The fixtures are not PNGs (see `notAPng`), so a module that
    // decoded, resampled or re-encoded a mask could not return these bytes.
    expect(extract(path, 'masks/alpha.png')).toEqual(MASK_A)
    expect(extract(path, `masks/${UNICODE_MASK}`)).toEqual(MASK_UNICODE)
    expect(extract(path, 'sources/a-source.gif')).toEqual(SOURCE_A)
    expect(extract(path, 'sources/b-source.gif')).toEqual(SOURCE_B)
  })

  it('round-trips a non-ASCII member name through /usr/bin/unzip', async () => {
    const archive = await writeStst(hostileScene(), straight())
    const path = onDisk(archive)
    const stored = `masks/${UNICODE_MASK}`

    expect(extract(path, stored)).toEqual(MASK_UNICODE)

    // The control (§6.5a): the lookup above is evidence only if `unzip -p`
    // is matching on the name rather than printing whatever it finds first.
    // Corrupt the name in place — same byte count, so every offset in the
    // archive stays valid — and the same call must stop matching.
    const nameBytes = te.encode(stored)
    const mutant = archive.slice()
    let patched = 0
    outer: for (let i = 0; i + nameBytes.length <= mutant.length; i++) {
      for (let j = 0; j < nameBytes.length; j++) {
        if (mutant[i + j] !== nameBytes[j]) continue outer
      }
      // The lead byte of the Cyrillic 'м' (0xD0) flipped to an ASCII letter:
      // one byte, same length, a different name.
      mutant[i + stored.indexOf('м')] = 0x7a
      patched++
      i += nameBytes.length - 1
    }
    // **Three**, and the third one is the news. The local header, the central
    // record, and `manifest.json`'s own copy of the name.
    //
    // This read 2 until 2026-10-15, with a comment saying so and saying why:
    // "the manifest is deflated, so its copy is not findable as plain bytes…
    // if this ever reads 3, the manifest has started being stored, and the
    // archive grew a plaintext copy of every name." It then read 3, for
    // exactly that reason — criterion 7's all-store ruling. The number is
    // updated rather than the assertion relaxed, because the prediction was
    // the point: this is a sensor that fired, named its own cause in advance,
    // and was right.
    //
    // The consequence it warned about is real and is now a property of the
    // format: every member name appears in a `.stst` as plain bytes three
    // times over. That is not a secret anyone was keeping — the central
    // directory has always held the names uncompressed, so `strings` on a
    // `.stst` listed them before this change too — but the manifest also
    // carries each member's *role*, which was previously only readable by
    // inflating. Nothing in the threat model cares; it is recorded so that a
    // reader meeting "3" does not have to re-derive why.
    expect(patched).toBe(3)
    expect(unzip(['-p', onDisk(mutant), stored]).status).not.toBe(0)
  })

  it('emits a manifest that names every entry in the archive, itself included', async () => {
    const path = onDisk(await writeStst(hostileScene(), straight()))
    const manifest = JSON.parse(td.decode(extract(path, 'manifest.json'))) as Manifest

    // Criterion 3, as a relation rather than as a literal: the manifest's name
    // list and the archive's name list are the same list, in the same order.
    // Stated this way it cannot be satisfied by a manifest that was written
    // from a second hand-maintained copy of the layout.
    expect(manifest.entries.map(e => e.name)).toEqual(namesInArchive(path))

    // Role is the thing the central directory cannot tell you — it has names
    // and sizes and no notion of which member is the scene and which is a
    // baked mask. That is what the manifest is for, so it is what is pinned.
    expect(manifest.entries.map(e => e.role)).toEqual([
      'mimetype', 'scene', 'manifest', 'mask', 'mask', 'source', 'source',
    ])
    expect(manifest.stst).toBe(1)

    // Readable by a human who has run `unzip -p`: indented, and ending in a
    // newline so it is POSIX text rather than a line a terminal swallows.
    const text = td.decode(extract(path, 'manifest.json'))
    expect(text.endsWith('\n')).toBe(true)
    expect(text).toContain('\n  "entries": [')
  })

  it('identifies itself from the first bytes of the file, as ODF and EPUB do', async () => {
    const archive = await writeStst(hostileScene(), straight())
    const path = onDisk(archive)

    /**
     * Written out, not read from `STST_MIMETYPE`.
     *
     * Measured: with the expectation taken from the module's own constant,
     * changing that constant to `application/zip` left all twelve tests in
     * this file green — §9's "a guard derived from the roster it guards
     * proves only that the derivation ran twice", live. The media type is
     * the one thing another program identifies a `.stst` by, so changing it
     * is a compatibility break and has to be a deliberate edit in two files.
     */
    const MEDIA_TYPE = 'application/x-stst'
    expect(STST_MIMETYPE).toBe(MEDIA_TYPE)
    expect(extract(path, 'mimetype')).toEqual(te.encode(MEDIA_TYPE))

    // The convention is only worth following if it works, and it works only
    // when `mimetype` is first **and stored**: the media type then sits at a
    // fixed offset, immediately after a 30-byte local header and the 8-byte
    // name, where `file(1)` and friends can read it without inflating
    // anything. Asserted as that offset relation, not as a byte string.
    const at = 30 + 'mimetype'.length
    expect(archive.subarray(at, at + MEDIA_TYPE.length)).toEqual(te.encode(MEDIA_TYPE))
  })

  it('refuses member names the container cannot place', async () => {
    const one = (name: string): StstMember[] => [{ name, role: 'mask', data: MASK_A }]
    const scene = hostileScene()

    // The module owns placement — `masks/` and `sources/` are its decision,
    // not the caller's — so a name carrying its own directory would either
    // land somewhere the container did not choose or collide with a name that
    // did. The message says to pass a bare file name, which is also the
    // cheapest way to go green: a guard whose lazy fix is the wrong one gets
    // satisfied wrongly.
    await expect(writeStst(scene, one('nested/a.png'))).rejects.toThrow(/bare file name/)
    await expect(writeStst(scene, one(''))).rejects.toThrow()
    // `masks/..` extracts to the container's parent. Info-ZIP warns and
    // rewrites it; other tools do not.
    await expect(writeStst(scene, one('..'))).rejects.toThrow()
    // Two masks under one name collide at `masks/<name>`, and the format
    // permits the duplicate while extractors disagree about which wins.
    await expect(writeStst(scene, [...one('a.png'), ...one('a.png')])).rejects.toThrow(/duplicate/i)
  })

  it('refuses a scene writeScene refuses, rather than writing a lesser one', async () => {
    // Criterion 2 from the other side: the container has no JSON path of its
    // own to fall back to, so a scene `writeScene` rejects does not become a
    // `.stst` with a quietly reduced `scene.json` in it.
    const unrostered = { size: [320, 200], layers: [], nope: 1 } as unknown as Scene
    await expect(writeStst(unrostered, [])).rejects.toThrow(/key roster/)
  })

  it('declares its entry order as data, and the data matches the archive', async () => {
    // `STST_ENTRY_ORDER` exists so the reader half and anything auditing the
    // layout has one place to read it from. A constant nothing checks is a
    // note, and §9 is explicit that a note is not a sensor — so it is checked
    // against an archive here, against the literal list above elsewhere in
    // this file, and the two can only agree if both are right.
    const path = onDisk(await writeStst(hostileScene(), straight()))
    const names = namesInArchive(path)
    expect(names.slice(0, STST_ENTRY_ORDER.length)).toEqual([...STST_ENTRY_ORDER])
  })
})
