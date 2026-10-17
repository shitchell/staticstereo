import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ts from 'typescript'
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

/**
 * The method of each of {@link EXPECTED_NAMES}, positionally — `mimetype`
 * stored, everything else deflated (design §6.2, ruled 2026-10-17).
 *
 * Written out rather than computed as `[0, ...fill(8)]`, for the same reason
 * `EXPECTED_NAMES` is written out: a rule expressed as an expression is the
 * writer's rule evaluated twice, and it would stay green if the writer's rule
 * changed shape. Two literal lists side by side are two things that have to be
 * edited together, which is the property wanted.
 */
const EXPECTED_METHODS = [
  METHOD_STORE,    // mimetype       — the ODF/EPUB fixed-offset convention
  METHOD_DEFLATE,  // scene.json
  METHOD_DEFLATE,  // manifest.json
  METHOD_DEFLATE,  // masks/alpha.png
  METHOD_DEFLATE,  // masks/<unicode>
  METHOD_DEFLATE,  // sources/a-source.gif
  METHOD_DEFLATE,  // sources/b-source.gif
]

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

  /**
   * **SAME-ENGINE ONLY. This is not a cross-engine byte-identity claim, and
   * design §6.2 requires every determinism pin in this repo to say so in the
   * file rather than in a document.**
   *
   * Both arms run in one process on one engine, so what is pinned is that
   * `writeStst` does not let the caller's member *order* reach the output —
   * a real property of our writer, and the one criterion 7 is about. It says
   * nothing whatever about two engines producing the same bytes: since the
   * case-E ruling of 2026-10-17 the container deflates, and
   * `CompressionStream('deflate-raw')` is measured to emit **+59% in Firefox
   * 153 and 10.7x in WebKit 26** against Node and Chromium, diverging at byte
   * 0 or 1. Read as a cross-engine guarantee this assertion is false; read as
   * written it is true and is worth keeping.
   */
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

  /**
   * **SAME-ENGINE ONLY**, for the reason set out on the test above, which
   * applies here unchanged: this pins clock-independence of our own writer in
   * one process, not byte identity between two engines.
   */
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

  /**
   * **SUPERSEDED TITLE, kept because this test changed meaning rather than
   * being fixed.** Until 2026-10-17 this test was:
   *
   * > `stores every entry, so byte-identity does not rest on a deflater default`
   *
   * and it asserted `local` and `central` were all-zero. That is not a test
   * that broke and was repaired; it is the **criterion it witnesses changing
   * meaning**, and the old wording is kept here so a reader meeting the new
   * one can see what was traded and why rather than re-deriving it.
   *
   * **What changed.** Design §6.2 case E was ruled 2026-10-17: the container
   * deflates. The all-store ruling of 2026-10-15 had been defending
   * cross-engine byte identity — a property invariant 4 forbids the suite from
   * asserting on, and which no requirement asks for — at a size cost measured
   * at **+27.4% (107,724 → 137,279 bytes)** on a flat-graphics project, which
   * crossed a 5% threshold registered before the measurement. The engine
   * divergence the old title names is **real and is now accepted**: Firefox
   * 153 emits +59% and WebKit 26 10.7x against Node and Chromium, diverging at
   * byte 0 or 1, and all four round-trip exactly.
   *
   * **`mimetype` is the exception and it is not a concession to this file.**
   * It is first and stored so the media type sits at a fixed offset where
   * `file(1)` and archive managers can read it without inflating anything —
   * the ODF/EPUB convention — and it costs 17 bytes. Its sensor is
   * `identifies itself from the first bytes of the file` below, which is also
   * the only assertion in this file that can see `mimetype` stop being stored
   * *without reading a method field*: it reads the media type at offset
   * 30 + `'mimetype'.length`, which a deflated first entry cannot satisfy.
   */
  it('stores mimetype and deflates everything else, as ODF and EPUB do', async () => {
    const archive = await writeStst(hostileScene(), straight())
    const { local, central, names } = methodsOf(archive)

    expect(names).toEqual(EXPECTED_NAMES)
    expect(local).toEqual(EXPECTED_METHODS)
    // The format writes the method twice and a reader may consult either; a
    // writer that let the two drift produces an archive that extracts
    // differently depending on which half the tool trusts.
    expect(central).toEqual(local)

    // The control (§6.5a), and **the flip discharged half of it**. While every
    // field was expected to read 0, "they all read 0" was a null that a parser
    // returning 0 whatever it is pointed at would also produce. The expected
    // vector now contains **both** 0 and 8, so a constant-returning reader is
    // refuted by the assertion itself — that is a strengthening the deflate
    // ruling bought, not something this file arranged.
    //
    // The explicit control below is kept anyway, and it is now corroboration
    // rather than the only thing separating a reading from a constant: it
    // pins the two values against an archive built one layer down whose
    // methods are chosen by the caller, in both halves, so the
    // local-versus-central comparison above is not vacuous either.
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
   * **SUPERSEDED TITLE, kept for the same reason as the test above's.** Until
   * 2026-10-17 this was:
   *
   * > `stores every entry whatever the payload is, not merely for this fixture`
   *
   * The claim it makes about the writer is unchanged in *kind* — the method is
   * not a function of the bytes — and changed in *value*: the answer is now
   * "deflate for every member, store for `mimetype`" rather than "store for
   * everything". Retitled rather than left alone because the old title is a
   * false sentence about the archive, and §9 fixes false assertions on sight;
   * recorded rather than simply replaced because a vanished test name is a
   * §6.4 census event and the triage needs the rename visible in the file.
   *
   * The test above reads the method fields of an archive built from
   * `straight()`, whose members are four 300-byte pseudo-random blobs. That is
   * "the role-keyed rule holds for this fixture". Criterion 7 asks for
   * something stronger: that the method is never *chosen from the content* —
   * that it is a property of the entry's **role** and not of the bytes handed
   * to the module. The difference is measurable.
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
   * deflates to roughly 0.1% of itself. "Every member deflated, whatever it
   * is" over that matrix is a statement about the writer. Over one fixture it
   * is a statement about the fixture.
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
   * ## The size relation — DELETED 2026-10-17, and what replaced it
   *
   * **The deleted text, kept because the relation was true and is now false,
   * not because it was wrong:**
   *
   * > Reading method fields and asserting they are 0 has a cheapest-wrong
   * > satisfying action (plan §6.5a): write 0 into the header while deflating
   * > the payload, and every assertion above still passes. The archive
   * > **length** is immune to that. With every entry stored, growing one
   * > member by *n* bytes grows the archive by exactly *n*, so
   * > `archive.length - payload.length` is one constant across the whole
   * > matrix — whatever the payload is. Deflate anything, by any rule, and
   * > that number moves: measured under the planted `> 100_000` rule, by
   * > **523,763** on the repeated 512 KiB member and by **512,239** on the
   * > `notAPng` one. … It is a single number, derived from no literal of the
   * > module's, and it is checked for every arm.
   *
   * It is the writer that now deflates, so the constant is gone. Measured over
   * this exact matrix under the role-keyed rule, `archive.length -
   * payload.length` runs from **+716** (1 KiB random) to **−523,052** (512 KiB
   * repeated) — a spread of **523,768**. The number could be made to pass
   * again by widening the equality into a tolerance, and that is the cheapest
   * wrong action available here: it would leave an assertion in the file whose
   * only remaining content is "the archive is roughly the size of its
   * payload". **The constant was not loosened. The relation was deleted and
   * the threat it covered was re-expressed.**
   *
   * **What covers the threat now.** The threat is unchanged in shape and
   * inverted in direction: under the role-keyed rule the cheapest-wrong
   * satisfying action for the method-field assertions is to write **8** into
   * both headers while **storing** the payload — never calling the deflater at
   * all — and every method-field assertion in this test still passes. The
   * replacement is `/usr/bin/unzip -p`, over every arm of the matrix, asserted
   * byte-exact against the payload: an inflater that is not ours, acting on
   * the method field rather than reading it, so a header that lies in either
   * direction produces bytes that are not the payload. Measured on this
   * matrix: all eight arms extract byte-exact, and with both method fields
   * patched 8 → 0 and the payload untouched all eight fail with
   * `unzip` status **2**.
   *
   * **What was lost and is not covered.** The deleted relation needed no
   * external tool; the replacement makes `/usr/bin/unzip` load-bearing for
   * eight more assertions. This file already has no `HAVE_UNZIP` guard and
   * fails closed on a missing binary (`status === null`), so that is a
   * dependency rather than a hole — but it is a real difference and is not
   * an improvement in every direction.
   *
   * **And `mimetype` is covered by neither of these.** Its stored-ness is
   * witnessed, without reading a method field, by the byte-offset assertion in
   * `identifies itself from the first bytes of the file`: the media type is
   * read at offset 30 + `'mimetype'.length`, which only holds while the first
   * entry is stored.
   *
   * Nothing here greps `container.ts` for `'store'` or `'deflate'`. A source
   * grep is satisfied by the word appearing in a comment, which is the
   * cheapest wrong action of all, and it goes blind the moment the literal
   * moves behind a helper.
   */
  it('keys the method on the role and never on the payload, not merely for this fixture', async () => {
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

    // One member, one name, one scene. Four entries each time — `mimetype`,
    // `scene.json`, `manifest.json`, `masks/p.bin` — so the expected vector is
    // written out rather than filled, the same argument `EXPECTED_METHODS`
    // carries.
    const ONE_MEMBER_METHODS = [
      METHOD_STORE,    // mimetype
      METHOD_DEFLATE,  // scene.json
      METHOD_DEFLATE,  // manifest.json
      METHOD_DEFLATE,  // masks/p.bin
    ]
    const archives = new Map<string, Uint8Array>()
    for (const [label, data] of payloads) {
      const archive = await writeStst(hostileScene(), [{ name: 'p.bin', role: 'mask', data }])
      const { local, central } = methodsOf(archive)
      expect(local, `local methods · ${label}`).toEqual(ONE_MEMBER_METHODS)
      expect(central, `central methods · ${label}`).toEqual(local)
      archives.set(label, archive)
    }

    // What replaced the deleted size relation — see the docblock. An inflater
    // that is not ours, *acting* on the method field rather than reading it,
    // over every arm. A header claiming 8 over a stored payload and a header
    // claiming 0 over a deflated one both land here, and neither is visible to
    // any assertion above.
    //
    // Compared on length and then on digest rather than with `toEqual`, for a
    // measured reason and not a stylistic one: `toEqual` over a 512 KiB
    // `Uint8Array` costs **1680 ms** in vitest 2.1.9, against **7 ms** for the
    // `unzip` spawn and **24 ms** for the deflate — it is the assertion's
    // diffing machinery, not the work being measured, and two such arms alone
    // put this test past the 5 s default timeout. Length first so the common
    // failure reports a number rather than "the digests differ".
    for (const [label, data] of payloads) {
      const path = onDisk(archives.get(label) as Uint8Array)
      const got = extract(path, 'masks/p.bin')
      expect(got.length, `unzip -p length · ${label}`).toBe(data.length)
      expect(sha(got), `unzip -p bytes · ${label}`).toBe(sha(data))
    }

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
    expect(fatMethods.local, 'local methods · 200k-character scene').toEqual(EXPECTED_METHODS)
    expect(fatMethods.central, 'central methods · 200k-character scene').toEqual(fatMethods.local)

    // The control (§6.5a), both halves, and **both halves inverted when the
    // ruling did.**
    //
    // Half one: the method-field reader must be shown moving, or "every
    // member read 8" is indistinguishable from a reader that returns 8. The
    // forbidden rule now shows up as **stores appearing where the writer
    // always deflates**, which is the same mutation read from the other side:
    // under `> 100_000` the six small payloads are stored and the two 512 KiB
    // ones are deflated, against the writer's constant 8 for every member.
    const asWritten: number[] = []
    const asChosen: number[] = []
    for (const [, data] of payloads) {
      const chosen = await writeZip([
        { name: 'mimetype', data: te.encode(STST_MIMETYPE), method: 'store' },
        // The rule the criterion forbids, in its most plausible form: deflate
        // the big ones. 100,000 is V-1's planted threshold, reused so the
        // control is the mutation and not a different thing that also moves.
        { name: 'masks/p.bin', data, method: data.length > 100_000 ? 'deflate' : 'store' },
      ])
      asChosen.push(methodsOf(chosen).local[1] as number)
      asWritten.push(METHOD_DEFLATE)
    }
    expect(asChosen).not.toEqual(asWritten)
    expect(asChosen.filter(m => m === METHOD_STORE)).toHaveLength(6)

    // Half two, replacing the deleted size relation's control. The extraction
    // sweep above is a positive assertion rather than a null, but §6.5a's
    // question still applies to it: could it have seen a header that lies? So
    // the same instrument is pointed at an archive whose method fields have
    // been patched 8 → 0 in **both** headers with the payload left alone —
    // exactly the cheapest-wrong writer — and must stop agreeing.
    //
    // A byte patch rather than a second `writeZip` call, because `writeZip`
    // has no way to express the lie: it derives the payload from the method,
    // which is the property under test and cannot be the control for itself.
    const honest = archives.get('512 KiB repeated') as Uint8Array
    const liar = honest.slice()
    const lv = new DataView(liar.buffer, liar.byteOffset, liar.byteLength)
    let eocd = -1
    for (let i = liar.length - 22; i >= 0; i--) {
      if (lv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
    }
    expect(eocd, 'end-of-central-directory signature').toBeGreaterThanOrEqual(0)
    let at = lv.getUint32(eocd + 16, true)
    let lied = 0
    for (let i = 0; i < lv.getUint16(eocd + 10, true); i++) {
      const nameLen = lv.getUint16(at + 28, true)
      const localAt = lv.getUint32(at + 42, true)
      if (lv.getUint16(at + 10, true) === METHOD_DEFLATE) {
        lv.setUint16(at + 10, METHOD_STORE, true)
        lv.setUint16(localAt + 8, METHOD_STORE, true)
        lied++
      }
      at += 46 + nameLen + lv.getUint16(at + 30, true) + lv.getUint16(at + 32, true)
    }
    // Three: `scene.json`, `manifest.json` and the member. `mimetype` is
    // already stored and is left alone, which is also why this count is
    // asserted — if it ever read 4 the mimetype exception has gone.
    expect(lied, 'deflated entries whose method field was patched to store').toBe(3)
    expect(unzip(['-p', onDisk(liar), 'masks/p.bin']).status).not.toBe(0)
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
    // **Two**: the local header and the central record.
    //
    // ## The record of this number, which has now moved twice and both moves
    // ## were predicted in advance by the comment that was here at the time
    //
    // **Until 2026-10-15 it read 2**, under the text:
    //
    // > "the manifest is deflated, so its copy is not findable as plain
    // > bytes… if this ever reads 3, the manifest has started being stored,
    // > and the archive grew a plaintext copy of every name."
    //
    // **From 2026-10-15 to 2026-10-17 it read 3**, under the text:
    //
    // > "**Three**, and the third one is the news. The local header, the
    // > central record, and `manifest.json`'s own copy of the name. … The
    // > number is updated rather than the assertion relaxed, because the
    // > prediction was the point: this is a sensor that fired, named its own
    // > cause in advance, and was right. … every member name appears in a
    // > `.stst` as plain bytes three times over. … Nothing in the threat model
    // > cares; it is recorded so that a reader meeting '3' does not have to
    // > re-derive why."
    //
    // **It now reads 2 again**, because design §6.2's case-E ruling of
    // 2026-10-17 deflates `manifest.json` once more. Changing the digit is
    // the cheapest wrong action available here, so the cause was isolated
    // before the digit was touched rather than inferred from the direction it
    // moved. Measured over this fixture, varying nothing but the method rule:
    //
    // ```
    // all stored                      len 2805  occurrences 3
    // all deflated                    len 2377  occurrences 2
    // mimetype stored, rest deflated  len 2375  occurrences 2   ← the ruling
    // manifest STORED, rest deflated  len 2724  occurrences 3
    // ```
    //
    // The fourth row is the one that makes this a measurement rather than a
    // story: the count is `2 + (manifest.json stored ? 1 : 0)` and nothing
    // else in the ruling touches it. The `mimetype` exception does not —
    // rows two and three differ by 2 bytes and not by an occurrence.
    //
    // The property the old text recorded as "now a property of the format" is
    // therefore withdrawn: a member's *role* is once again readable only by
    // inflating, and `strings` on a `.stst` lists each member name twice, from
    // the two header copies that have always been uncompressed.
    expect(patched).toBe(2)
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

  /**
   * ## CRITERION 7, part 1 of 3 — the single-producer structural pin
   *
   * **The criterion's old text, kept beside the new because it changed
   * meaning and was not merely edited** (plan §7, P1 criterion 7):
   *
   * > "CLI and site produce identical bytes for one scene — **by
   * > construction, not by the coincidence of two zlib wrappers agreeing on a
   * > default.**"
   *
   * **It is superseded as of 2026-10-17 and the replacement is weaker in two
   * separate ways, both of which are losses and neither of which is an
   * improvement.** This is not an equivalent restatement, it is not more
   * robust, and calling it either would hide what was traded:
   *
   * 1. **Weaker than byte equality.** Case E deflates the container, so
   *    identical bytes across engines is *unachievable*: Firefox 153 emits
   *    +59% and WebKit 26 10.7x against Node and Chromium on the same input,
   *    diverging at byte 0 or 1. What is pinned below is the archive's
   *    **decoded** content — names, order, per-entry bytes after extraction,
   *    the manifest and `scene.json`. Two producers could satisfy all of that
   *    and still ship files that differ byte for byte, and under case E they
   *    would.
   * 2. **Weaker than the two-sided comparison that was specified in its
   *    place.** The first replacement tier 0 wrote was a CLI-versus-site
   *    comparison of the decoded structure. That is **unbuildable**, because
   *    there is no second producer: `src/cli/index.ts:159` is the only
   *    production call of `writeStst` in the repository and `site/` has no
   *    `.stst` writer at all. Tier 0 withdrew it as its own error 47. So the
   *    comparison below is **one producer against itself** across two caller
   *    orderings, which cannot see a disagreement between two producers for
   *    the plain reason that there is only one.
   *
   * The honest sentence is that a strong witness became unsatisfiable and was
   * traded for an achievable one. What carries the rest of the criterion's
   * weight is part 2 — the criterion reworded to say it is discharged by
   * there being one writer — and part 3, the sensor that reddens the day that
   * stops being true, which is the only part that survives P5 adding a
   * site-side writer.
   *
   * **Why through `/usr/bin/unzip` and not `readStst`.** Decoded content is
   * the claim, and decoding it with our own reader would let a writer and a
   * reader sharing one misreading agree perfectly — the argument
   * `zip.test.ts` and the head of this file already make. `unzip -Z1` lists
   * names in central-directory order and does not sort them, measured.
   *
   * ## What this test adds today, stated honestly, because it is less than it
   * ## looks and §9 says a duplicated witness is one that cannot fail for a
   * ## new reason
   *
   * **On today's tree the straight-versus-shuffled half of this is subsumed**
   * by `emits byte-identical archives from member lists in different orders`
   * two tests up: same engine, same process, so identical bytes implies
   * identical decoded content and the digest comparison is strictly stronger.
   * Every plant that reddens this half reddens that one too — measured, not
   * assumed. The two external anchors below likewise restate
   * `gives back exactly the bytes writeScene produced for scene.json` and
   * `emits a manifest that names every entry in the archive, itself included`.
   *
   * **So what is it for.** It is the form the criterion takes **when the two
   * archives cannot be byte-compared** — a second producer, or the same
   * producer in another engine, where under case E the bytes legitimately
   * differ and a digest tells you nothing. Writing it now rather than when
   * P5 lands means the structural description exists and has been exercised,
   * instead of being derived under time pressure by whoever adds the second
   * writer. It is **not** an additional sensor over today's tree and should
   * not be counted as one.
   *
   * ## The blind spot, found by a plant rather than by reading
   *
   * **A writer bug that affects both callers equally is invisible to the
   * comparison half of this test, and the first control run against it
   * demonstrated exactly that.** Deleting the `source` role from the writer's
   * placement loop — one entry omitted from every archive it produces —
   * reddened **five** tests in this file (`lays the archive out in the
   * declared order`, the two method tests, `carries member bytes verbatim`,
   * `emits a manifest that names every entry`) **and left this one green**,
   * because both arms lost the same entry and the manifest lost it too, so
   * every relation still held.
   *
   * That is the right behaviour for a two-arm comparison and the wrong thing
   * to assume about it. **The comparison half sees order-dependence and
   * nothing else**; the reordering control below, and the reordering plant
   * that reddened this test by name, are what it is sensitive to. The
   * omission case is covered — by the five tests above — but not here, and
   * reading this test as "the whole layout is pinned" would be wrong.
   */
  it('pins the one writer on decoded structure, which is what replaced identical bytes', async () => {
    /** Names in order, every entry's extracted bytes, and the two text members. */
    const decoded = (path: string): Record<string, unknown> => {
      const names = namesInArchive(path)
      return {
        names,
        contents: Object.fromEntries(names.map(n => [n, [...extract(path, n)]])),
        manifest: JSON.parse(td.decode(extract(path, 'manifest.json'))) as unknown,
        sceneJson: td.decode(extract(path, 'scene.json')),
      }
    }

    const a = decoded(onDisk(await writeStst(hostileScene(), straight())))
    const b = decoded(onDisk(await writeStst(hostileScene(), shuffled())))
    expect(b).toEqual(a)

    // And the two text members against what produced them, so "decoded
    // content" is pinned to something outside the archive rather than only to
    // the other arm: `scene.json` is `writeScene`'s own bytes, and the
    // manifest names the archive's entries in the archive's order.
    expect(a['sceneJson']).toBe(writeScene(hostileScene()))
    expect((a['manifest'] as Manifest).entries.map(e => e.name)).toEqual(a['names'])

    // The control (§6.5a), two mutations rather than one, because the
    // comparison has two halves that fail independently and a single control
    // would leave one of them unwitnessed. Both are built one layer down with
    // `writeZip`, since `writeStst` cannot be asked to omit or reorder.
    const utf8 = te
    const scene = utf8.encode(writeScene(hostileScene()))
    const full = [
      { name: 'mimetype', data: utf8.encode(STST_MIMETYPE), method: 'store' as const },
      { name: 'scene.json', data: scene, method: 'deflate' as const },
      { name: 'manifest.json', data: utf8.encode('{}\n'), method: 'deflate' as const },
      { name: 'masks/alpha.png', data: MASK_A, method: 'deflate' as const },
    ]
    // Reordered: the same entries, the same bytes, a different order.
    const reordered = [full[1], full[0], full[2], full[3]] as typeof full
    // Omitted: one member gone, everything else untouched.
    const omitted = [full[0], full[1], full[2]] as unknown as typeof full

    const base = decoded(onDisk(await writeZip(full)))
    expect(decoded(onDisk(await writeZip(reordered)))).not.toEqual(base)
    expect(decoded(onDisk(await writeZip(omitted)))).not.toEqual(base)
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

/* ===================================================================== */
/*  CRITERION 7, part 3 of 3 — the sensor for a second producer           */
/* ===================================================================== */

/**
 * **This is the part of criterion 7's replacement that survives P5.**
 *
 * Parts 1 and 2 are both *weaker* than what they replaced — part 1 weaker
 * than byte equality and weaker than the two-sided comparison tier 0 first
 * specified, part 2 a sentence in a document. Neither is an improvement and
 * neither should be described as one. What they rest on is a fact about
 * today's tree, and a fact about today's tree is exactly the thing that stops
 * being true without anybody noticing: §9's standing row says a recorded note
 * is not a sensor, so the note is written as a test.
 *
 * **The question this sensor asks**, stated rather than a list of spellings,
 * because §9 has two rows on sensors keyed to the forms someone enumerated
 * and defeated by one more: *is there more than one place in production code
 * that produces `.stst` bytes?* A second place is fine — P5 is expected to
 * add a site-side export — **provided it routes through `writeStst`**, which
 * is what keeps the layout, the entry order and the manifest in one module
 * rather than in two lists that agree until somebody edits one. The failure
 * message says that, because a guard whose cheapest satisfying action is the
 * wrong one gets satisfied wrongly, and here the cheapest route to green is
 * also the correct one: call `writeStst`.
 *
 * **Two routes are checked, and the boundary between them is stated rather
 * than left to read as exhaustive.**
 *
 * - **Route A:** a module that names `writeZip` in code. It is the route any
 *   realistic second writer takes, because P1 criterion 1 forbids a zip
 *   dependency, so there is nothing else to call. That `zip.ts` is the only
 *   module compressing is not asserted here as a count in prose — route B
 *   below is the assertion of it.
 * - **Route B:** a module that names `CompressionStream` in code. A
 *   hand-rolled writer that does not call `writeZip` still has to compress,
 *   and with no dependency permitted that is the only way to do it.
 *
 * Both routes are **parsed, not grepped**, for a reason that was measured
 * rather than anticipated — see `namesInCode` below, where the two wrong
 * first drafts and what each of them falsely reported are recorded.
 *
 * **The residue, named so nobody reads the pair as complete — and rewritten
 * 2026-10-17, because the shape it used to name is one no measured evasion
 * takes.** It said the uncovered case was *"a second producer that hand-writes
 * zip records and stores everything"*. A verifier then built five evasions and
 * **none of them is that shape**, which is worse than declaring no residue at
 * all: it tells a reader the hole is somewhere it isn't.
 *
 * **The uncovered class is computed access to the real symbol.** Both routes
 * ask "does this module name the identifier?", so a module that reaches the
 * same function or the same constructor **without ever writing its name as an
 * identifier** is invisible to both. The two measured shapes:
 *
 * - `(await import('./shared/zip.js'))['writeZip'](…)` — the real `writeZip`,
 *   reached through a string-indexed property access.
 * - `new (globalThis as any)['CompressionStream']('deflate-raw')` — the real
 *   constructor, same device.
 *
 * Both were planted in a **covered** position (`src/`, `.ts`) after the
 * widening below and measured: **18 passed, exit 0, neither named.** The same
 * class is what the assembler count further down cannot see either — a
 * signature value computed rather than written (`0x06054b4f + 1`,
 * `parseInt('02014b50', 16)`), planted and measured invisible at 18 passed.
 *
 * **This is the known-hard class and the list above is not exhaustive**: it is
 * two spellings of one device, and the device is "the identifier never
 * appears". Closing it needs a checker that resolves values rather than a
 * parser that reads names, which is a different instrument from this one. §9
 * has two rows on sensors keyed to enumerated forms and defeated by the next
 * one, so the boundary is stated as the class rather than as the two
 * spellings that were tried.
 *
 * **What the roster is derived from — widened 2026-10-17, and the widening is
 * the whole of this sensor's repair.** It used to walk exactly `src/` and
 * `site/` and collect exactly `.ts` and `.svelte`. A verifier defeated it with
 * two **byte-identical** copies of a producer it already caught, differing
 * only in **position** (`exporter/ststExport.ts`, a new top-level directory)
 * and in **extension** (`site/ststExport.js`). Measured before the widening,
 * with both on disk: **17 passed (17), exit 0** — and the same bytes at
 * `src/ststProbeCovered.ts` named by both routes in the same run, so position
 * and extension were the only difference. After the widening both are named by
 * both routes.
 *
 * So the walk is now the **whole repository**, and neither axis is enumerated:
 *
 * - **Position** is not a list at all. The walk starts at the repository root
 *   and refuses only what the repository itself declares is not its content —
 *   `git ls-files --others --ignored --exclude-standard`, one call, so
 *   `node_modules/`, `dist/`, `dist-site/` and `dist-player/` are skipped
 *   because `.gitignore` says so and a fifth is skipped the day it is added.
 *   §9: a hand-written list of "the places that do X" goes stale silently.
 *   **A new directory is in the roster the moment it is on disk**, built or
 *   not, committed or not.
 * - **Extension** is the one axis that is still an enumeration, stated as one
 *   rather than left to read as derived — see `CODE` below for what bounds it.
 * - The three fixture trees at the repository root (`query-sweep-fixture/`,
 *   `svelte-free-fixture/`, `typecheck-fixture/`) are **admitted, not
 *   excluded.** They were measured first: none of their files names either
 *   symbol, so no exclusion is needed, and inventing one by name would be the
 *   stale-list defect in the act of repairing it.
 *
 * Production is every file in that walk that is not a test, matched on
 * `*.test.*` across the same kinds — a convention this file applies, not a
 * glob read from `tsconfig.json`. (`tsconfig.json`'s exclude also drops the
 * `testing/` helper directories it names; this roster deliberately keeps
 * them, since a producer hidden in a test helper is still a producer.)
 *
 * **What this costs.** The roster now depends on `/usr/bin/git` as well as on
 * the filesystem. It fails closed on a non-zero status, for the reason the
 * `unzip` spawns have no `HAVE_UNZIP` guard, so it is a dependency rather
 * than a hole — but it is a real difference and is not an improvement in
 * every direction.
 */
describe('criterion 7 — one production producer of .stst bytes', () => {
  const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')
  const ZIP_WRITER = join(REPO, 'src', 'shared', 'zip.ts')

  /** Repo-relative and `/`-separated, so a failure reads the same everywhere. */
  const show = (path: string): string => relative(REPO, path).split(sep).join('/')

  /**
   * The file kinds a producer can be written in — every module spelling node
   * and vite load, plus `.svelte`. This **is** an enumeration and is the one
   * place in this sensor that stays one, so it is keyed to something that is
   * not ours to extend: a second producer has to be a module the toolchain
   * will execute, and these are the extensions that get executed. A `.md`, a
   * `.css` or a `.json` cannot produce bytes, and admitting them would make
   * the `.svelte` text fallback below report every document under `docs/`
   * that discusses `writeZip` or `CompressionStream` in prose as a producer,
   * which is this repo's dominant false-reader shape and is why both routes
   * parse in the first place.
   */
  const CODE = /\.(?:[cm]?[jt]sx?|svelte)$/
  const TEST = /\.test\.[cm]?[jt]sx?$/

  /**
   * What the walk refuses to enter, **derived rather than listed.** §9: a
   * hand-written list of "the places that do X" goes stale silently, and
   * `dist/`, `dist-site/`, `dist-player/` and `node_modules/` are a list of
   * exactly that shape — one that was already wrong once on this project,
   * when a wipe instruction naming two directories missed the third.
   *
   * So the question asked is the one that actually defines them: *does the
   * repository consider this path its own content?* `git ls-files --others
   * --ignored --exclude-standard --directory` answers it in one call from the
   * repository's own ignore rules, so a fifth build directory added to
   * `.gitignore` tomorrow is skipped without anybody editing this file.
   *
   * Fails closed, like the `unzip` spawns above: a non-zero status reddens
   * rather than degrading to "nothing is ignored", which would walk
   * `node_modules/` and report half of npm as a second producer.
   */
  function ignoredPaths(): Set<string> {
    const res = spawnSync(
      '/usr/bin/git',
      ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory'],
      { cwd: REPO, env: CHILD_ENV, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    )
    expect(res.status, 'git ls-files --others --ignored').toBe(0)
    return new Set(
      (res.stdout ?? '').split('\n').filter(s => s !== '').map(s => s.replace(/\/$/, '')),
    )
  }

  function filesUnder(dir: string, skip: Set<string>): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      // `.git` is not content of the repository; it is the repository, and
      // git never lists it among the paths it ignores.
      if (entry.name === '.git') continue
      const path = join(dir, entry.name)
      if (skip.has(show(path))) continue
      if (entry.isDirectory()) out.push(...filesUnder(path, skip))
      else if (CODE.test(path)) out.push(path)
    }
    return out
  }

  const production = (): string[] =>
    filesUnder(REPO, ignoredPaths())
      .filter(f => !TEST.test(f))
      .sort()

  /**
   * Does this module **name** `ident` in code — an identifier node, not a
   * word in a docblock and not a character sequence inside a string?
   *
   * **Both of this sensor's first drafts were wrong here and the measurement
   * is what said so, which is the §9 row about reading a docblock mention as
   * evidence the file uses the thing. Recorded because it was caught by
   * running it, not by reading it:**
   *
   * - The first route-A draft matched on the *module* a specifier resolved
   *   to, so it reported `src/shared/zipRead.ts` — which imports `crc32`
   *   from `zip.ts` and writes nothing. Resolving the module answers "does
   *   this file depend on `zip.ts`"; the question is "does it call the
   *   writer", and only the binding answers that.
   * - The first route-B draft was `readFileSync(f).includes('CompressionStream')`
   *   and reported `src/shared/container.ts`, whose docblock discusses
   *   `CompressionStream` at length and does not use it. A textual census
   *   manufactures false readers in exactly this repo, where comments cite
   *   things far more often than code touches them.
   *
   * So both routes parse. An `Identifier` node cannot be a comment and cannot
   * be the inside of a string literal, which is the whole difference. An
   * aliased import (`import { writeZip as w }`) still carries the identifier
   * in its import clause, so the alias does not evade it.
   *
   * **Known false-positive direction, and it is the safe one:** a module that
   * declared its own unrelated function called `writeZip` would be reported.
   * That reddens and asks for a look, rather than passing and asking for
   * nothing.
   *
   * **`.svelte` is the one file kind this cannot parse**, so it falls back to
   * a raw-text match. The fallback is a filter, not a proof: it would report a
   * mention in `<!-- -->` as a use, in the direction that asks for a look
   * rather than the direction that passes.
   *
   * **No count of them is given here, deliberately.** This docblock used to
   * say *"there is one `.svelte` file in the repository today"*; there are
   * five, and that sentence was the third instance of its own class inside the
   * file that records the first two. **The rule, applied here and swept for
   * across both files this commit touches: do not state a count of repository
   * contents in a docblock unless a test asserts that count. Either assert it
   * or do not say it.** Nothing here needs the number — what the fallback's
   * weakness depends on is that `.svelte` exists at all, not how much of it
   * there is — so the number is not said.
   */
  function namesInCode(file: string, ident: string): boolean {
    const text = readFileSync(file, 'utf8')
    if (file.endsWith('.svelte')) return text.includes(ident)
    // Everything else in `CODE` is a module the TypeScript parser reads —
    // `.js`, `.mjs` and `.cjs` included, which is what closes the extension
    // half of the evasion the widening was written for. The condition is
    // written as "`.svelte` falls back" rather than "`.ts` parses" because
    // the second spelling silently routed every new kind to the text match.
    const kind = /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, kind)
    let found = false
    const walk = (node: ts.Node): void => {
      if (found) return
      if (ts.isIdentifier(node) && node.text === ident) { found = true; return }
      ts.forEachChild(node, walk)
    }
    walk(sf)
    return found
  }

  const ROUTE_MESSAGE =
    'a second production producer of .stst bytes. If this is a new export path, route it ' +
    'through writeStst() in src/shared/container.ts — the layout, the entry order, the ' +
    'manifest and the compression rule live there, and a second assembler makes them two ' +
    'lists that agree until somebody edits one. See P1 criterion 7.'

  /**
   * The roster's own guard. §6.5a: a null is only evidence if the instrument
   * could have seen something, and the ways this one reports clean while
   * blind are an empty walk, a walk that never reached `site/` — the half the
   * criterion is actually about, since P5's writer would land there — and a
   * walk that cannot see the one file that is supposed to be found.
   *
   * **The last two are new, and they are the two axes a byte-identical
   * producer was measured to escape on** (see the widening recorded in the
   * describe's docblock). They are the guard that notices if the roster is
   * ever re-narrowed to the two directories and the one extension it used to
   * have: a walk confined to `src/` and `site/` cannot satisfy the third, and
   * a walk that collects only `.ts` cannot satisfy the fourth. Both redden on
   * a tree that genuinely lost every file outside those two directories or
   * every non-`.ts` module, which is a tree whose reach has in fact shrunk
   * and is worth a look.
   */
  function roster(): string[] {
    const files = production()
    expect(files.length, 'the source walk found no production files').toBeGreaterThan(0)
    const rel = files.map(show)
    expect(rel).toContain('src/shared/container.ts')
    expect(rel.some(f => f.startsWith('site/')), 'the walk reached site/').toBe(true)
    expect(
      rel.some(f => !f.startsWith('src/') && !f.startsWith('site/')),
      'the walk reached outside src/ and site/',
    ).toBe(true)
    expect(rel.some(f => !f.endsWith('.ts')), 'the walk admits a kind that is not .ts').toBe(true)
    return files
  }

  it('reddens if anything but container.ts calls the zip writer', () => {
    // `zip.ts` declares it, so it names it; the question is who *calls* it.
    const callers = roster()
      .filter(f => f !== ZIP_WRITER && namesInCode(f, 'writeZip'))
      .map(show)
    expect(callers, ROUTE_MESSAGE).toEqual(['src/shared/container.ts'])
  })

  it('reddens if anything but zip.ts compresses', () => {
    // The hand-rolled route. `container.ts` must not appear: it chooses a
    // method and hands bytes to `writeZip`, and that separation is what makes
    // one producer possible in the first place.
    const compressors = roster().filter(f => namesInCode(f, 'CompressionStream')).map(show)
    expect(compressors, ROUTE_MESSAGE).toEqual(['src/shared/zip.ts'])
  })

  /* ------------------------------------------------------------------ */
  /*  The one place both routes have to look away from                    */
  /* ------------------------------------------------------------------ */

  /**
   * **`zip.ts` is where neither route can see, and until now that was an
   * exclusion rather than a measurement.** Route A drops it by path because
   * it *declares* `writeZip`, and route B's expected set *is* it because it
   * is the module that compresses. Both carve-outs are correct and both are
   * whole-file, so a second complete `.stst` assembler written inside
   * `zip.ts` was invisible by construction — not unlikely to be caught, but
   * impossible to catch. That is a property of the exclusion and not of the
   * problem.
   *
   * The carve-outs stay, because they are what makes the two routes
   * expressible at all; what changes is that the region they look away from
   * is now **counted**. "We cannot look here" becomes "we looked and there is
   * one", and a second assembler reddens.
   *
   * **What counts as an assembler, keyed to the question and not to a
   * spelling.** The question is *how many functions in this module build a
   * complete zip?* — and a complete zip is defined by the format, not by us:
   * it needs a central-directory record (`PK\x01\x02`) and an
   * end-of-central-directory record (`PK\x05\x06`). So an assembler is a
   * function that names **both** signature values. A function that emits only
   * local headers is not one; a function that emits only an EOCD is not one.
   *
   * **Values, not identifiers.** The two signatures are resolved through
   * module-level constant bindings to a fixed point, so `SIG_CENTRAL`, a
   * bare `0x02014b50`, and `const S = SIG_CENTRAL` are all the same
   * reference. Aliasing a constant is the cheapest way a second assembler
   * would avoid naming `SIG_CENTRAL`, and it is the first thing a sensor
   * keyed on the identifier would miss.
   *
   * **Attribution is to the nearest enclosing function**, so a second
   * assembler nested inside the first is two, not one — and a reference at
   * module scope belongs to no function and is ignored, which is what keeps
   * the constant declarations themselves out of the count.
   *
   * **Residue, stated rather than left to read as complete:** a signature
   * *computed* rather than written — `0x02014b4f + 1`, a four-byte array, a
   * `parseInt` of a string — is not seen. That is the same computed-access
   * class the describe's docblock names as this sensor's known-hard residue,
   * and it is uncovered here for the same reason.
   */
  const SIG_CENTRAL_VALUE = 0x02014b50
  const SIG_EOCD_VALUE = 0x06054b50

  function assemblersInText(label: string, text: string): string[] {
    const sf = ts.createSourceFile(label, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)

    // Module-level numeric bindings, resolved to a fixed point so that an
    // alias chain is the same reference as the literal it ends at.
    const value = new Map<string, number>()
    for (let changed = true; changed;) {
      changed = false
      for (const st of sf.statements) {
        if (!ts.isVariableStatement(st)) continue
        for (const d of st.declarationList.declarations) {
          if (!ts.isIdentifier(d.name) || d.initializer === undefined) continue
          if (value.has(d.name.text)) continue
          const v = ts.isNumericLiteral(d.initializer) ? Number(d.initializer.text)
            : ts.isIdentifier(d.initializer) ? value.get(d.initializer.text)
            : undefined
          if (v !== undefined) { value.set(d.name.text, v); changed = true }
        }
      }
    }

    const signature = (n: ts.Node): number | undefined => {
      const v = ts.isNumericLiteral(n) ? Number(n.text)
        : ts.isIdentifier(n) ? value.get(n.text)
        : undefined
      return v === SIG_CENTRAL_VALUE || v === SIG_EOCD_VALUE ? v : undefined
    }

    const nameOf = (fn: ts.Node): string => {
      if ((ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) && fn.name !== undefined) {
        return fn.name.getText(sf)
      }
      const parent = fn.parent as ts.Node | undefined
      if (parent !== undefined && ts.isVariableDeclaration(parent)) return parent.name.getText(sf)
      return `<anonymous at line ${sf.getLineAndCharacterOfPosition(fn.getStart(sf)).line + 1}>`
    }

    const seen = new Map<ts.Node, Set<number>>()
    const walk = (node: ts.Node, fn: ts.Node | undefined): void => {
      const here = ts.isFunctionLike(node) ? node : fn
      const sig = signature(node)
      if (sig !== undefined && here !== undefined) {
        const set = seen.get(here) ?? new Set<number>()
        set.add(sig)
        seen.set(here, set)
      }
      ts.forEachChild(node, child => walk(child, here))
    }
    walk(sf, undefined)

    return [...seen.entries()]
      .filter(([, sigs]) => sigs.has(SIG_CENTRAL_VALUE) && sigs.has(SIG_EOCD_VALUE))
      .map(([fn]) => nameOf(fn))
      .sort()
  }

  it('finds exactly one central-directory assembler inside the zip writer', () => {
    // §6.5a, in the same invocation and before the null is read: this
    // assertion is "there is one", which is indistinguishable from an
    // instrument that cannot count past one — or that cannot see an
    // assembler at all — unless it is shown counting two first. The control
    // reaches the central signature through a two-step alias chain and the
    // EOCD through a bare literal, because those are the two spellings a
    // second assembler would be written in if it were avoiding this check.
    const control = assemblersInText('<control>', [
      'const SIG_CENTRAL = 0x02014b50',
      'const ALIAS = SIG_CENTRAL',
      'const AGAIN = ALIAS',
      'function one(v) { v.setUint32(0, AGAIN, true); v.setUint32(8, 0x06054b50, true) }',
      'function two(v) { v.setUint32(0, SIG_CENTRAL, true); v.setUint32(8, 0x06054b50, true) }',
      'function partial(v) { v.setUint32(0, SIG_CENTRAL, true) }',
    ].join('\n'))
    expect(control, 'the assembler count can see two, and an alias chain').toEqual(['one', 'two'])

    expect(
      assemblersInText(show(ZIP_WRITER), readFileSync(ZIP_WRITER, 'utf8')),
      'a second complete zip assembler inside the module both routes look away from. ' +
      'Route it through writeZip() — ' + ROUTE_MESSAGE,
    ).toEqual(['writeZip'])
  })
})
