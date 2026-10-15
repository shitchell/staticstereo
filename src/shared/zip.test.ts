import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { writeZip, type ZipEntry } from './zip.js'

/**
 * The zip writer `.stst` is made of (design §6.2, plan P1 criteria 1/3/5).
 *
 * ## Why `/usr/bin/unzip` is shelled out to, unconditionally
 *
 * Design §6.2 chooses a real zip over a bespoke container **"so anyone can
 * `unzip` it and read `scene.json`"**. That property is about a program this
 * repo does not contain, so no assertion written against our own reader can
 * discharge it — a writer and a reader that share a misreading of the spec
 * agree with each other perfectly.
 *
 * There is **no `HAVE_UNZIP` skip guard** and that is deliberate. A guard
 * fails *open*: the one environment where the binary has vanished is the
 * environment where the test teaches nothing, and the suite still reports
 * green. §9's `purity.test.ts` row is this exact shape — it had no freshness
 * gate, only `existsSync`, and so *silently passed* over stale output. An
 * unconditional shell-out fails *closed*: the binary goes missing, the test
 * goes red, and somebody finds out. `.github/workflows/ci.yml:17-24` already
 * argues this way in writing about ffmpeg, and installs it rather than let the
 * mp4 tests skip.
 *
 * The binary is present on the runner: the `actions/runner-images` manifests
 * list `unzip 6.0-26ubuntu3.2` (Ubuntu 22.04) and `unzip 6.0-28ubuntu4.1`
 * (Ubuntu 24.04), and CI is `ubuntu-latest`. Read from the manifests rather
 * than recalled. If that ever stops being true the fix is an apt line in
 * `ci.yml` next to ffmpeg's, not a guard here.
 *
 * ## `-t` is not enough on its own
 *
 * `unzip -t` verifies CRCs and never writes an extracted byte anywhere, so it
 * proves integrity and **not** that the archive gives the original bytes back.
 * Every content claim below goes through `unzip -p`.
 */

const KEEP = mkdtempSync(join(tmpdir(), 'stst-zip-'))
afterAll(() => rmSync(KEEP, { recursive: true, force: true }))

let seq = 0
function onDisk(archive: Uint8Array): string {
  const path = join(KEEP, `a${seq++}.zip`)
  writeFileSync(path, archive)
  return path
}

const sha = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex')

/**
 * Run `/usr/bin/unzip` and hand back **both** its exit status and its stdout.
 *
 * `spawnSync` rather than `execFileSync`, and that is the point: `execFileSync`
 * *throws* on a non-zero exit, so `expect(run(...)).toBe(0)` written over it
 * is decorative — the assertion is never reached on failure and so can never
 * itself go red. Here the status is an ordinary value that a reviewer can see
 * being compared, and the comparison is the sensor.
 *
 * A missing binary gives `status === null`, so the no-guard decision in the
 * docblock above fails closed through the same assertion: `toBe(0)` is false
 * for `null`.
 */
function unzip(args: readonly string[]): { status: number | null; stdout: Uint8Array } {
  const res = spawnSync('/usr/bin/unzip', [...args], { maxBuffer: 64 * 1024 * 1024 })
  return { status: res.status, stdout: new Uint8Array(res.stdout ?? Buffer.alloc(0)) }
}

// ---------------------------------------------------------------------------
// A test-local structural reader.
//
// P1 criterion 2 is a separate task's zip *reader*; this is not it and must not
// become it. It exists so the assertions below can be about **structure** (§2.4)
// — "the central record's offset lands on a local-header signature" — rather
// than about a byte string that pins today's output. It parses only what these
// tests interrogate and deliberately handles no zip64, no comment, no data
// descriptor: a reader that tolerated those would hide the writer emitting one.
// ---------------------------------------------------------------------------

const SIG_LOCAL = 0x04034b50
const SIG_CENTRAL = 0x02014b50
const SIG_EOCD = 0x06054b50

interface Record {
  readonly name: string
  readonly flags: number
  readonly method: number
  readonly dosTime: number
  readonly dosDate: number
  readonly crc: number
  readonly csize: number
  readonly usize: number
  readonly localOffset: number
  readonly payload: Uint8Array
}

function parse(archive: Uint8Array): {
  readonly entryCount: number
  readonly cdOffset: number
  readonly cdSize: number
  readonly central: readonly Record[]
  readonly local: readonly Omit<Record, 'localOffset'>[]
} {
  const v = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
  const utf8 = new TextDecoder('utf-8', { fatal: true })

  // Scan backwards for the EOCD signature, which is what a real reader must do
  // because the record is variable-length (trailing comment). Finding it at a
  // fixed offset from the end would be an assumption about our own writer.
  let eocd = -1
  for (let i = archive.length - 22; i >= 0; i--) {
    if (v.getUint32(i, true) === SIG_EOCD) {
      eocd = i
      break
    }
  }
  if (eocd === -1) throw new Error('no end-of-central-directory record')

  const entryCount = v.getUint16(eocd + 10, true)
  const cdSize = v.getUint32(eocd + 12, true)
  const cdOffset = v.getUint32(eocd + 16, true)

  const central: Record[] = []
  const local: Omit<Record, 'localOffset'>[] = []
  let p = cdOffset
  for (let i = 0; i < entryCount; i++) {
    if (v.getUint32(p, true) !== SIG_CENTRAL) {
      throw new Error(`central record ${i} has no signature at ${p}`)
    }
    const nameLen = v.getUint16(p + 28, true)
    const extraLen = v.getUint16(p + 30, true)
    const commentLen = v.getUint16(p + 32, true)
    const localOffset = v.getUint32(p + 42, true)
    const name = utf8.decode(archive.subarray(p + 46, p + 46 + nameLen))

    // The local header the central record points at, read through the pointer
    // rather than by walking the file: that the pointer is right is one of the
    // things under test.
    const lp = localOffset
    if (v.getUint32(lp, true) !== SIG_LOCAL) {
      throw new Error(`entry ${i} central offset ${lp} is not a local header`)
    }
    const lNameLen = v.getUint16(lp + 26, true)
    const lExtraLen = v.getUint16(lp + 28, true)
    const lCsize = v.getUint32(lp + 18, true)
    const body = lp + 30 + lNameLen + lExtraLen

    central.push({
      name,
      flags: v.getUint16(p + 8, true),
      method: v.getUint16(p + 10, true),
      dosTime: v.getUint16(p + 12, true),
      dosDate: v.getUint16(p + 14, true),
      crc: v.getUint32(p + 16, true),
      csize: v.getUint32(p + 20, true),
      usize: v.getUint32(p + 24, true),
      localOffset,
      payload: archive.subarray(body, body + lCsize),
    })
    local.push({
      name: utf8.decode(archive.subarray(lp + 30, lp + 30 + lNameLen)),
      flags: v.getUint16(lp + 6, true),
      method: v.getUint16(lp + 8, true),
      dosTime: v.getUint16(lp + 10, true),
      dosDate: v.getUint16(lp + 12, true),
      crc: v.getUint32(lp + 14, true),
      csize: lCsize,
      usize: v.getUint32(lp + 22, true),
      payload: archive.subarray(body, body + lCsize),
    })
    p += 46 + nameLen + extraLen + commentLen
  }
  return { entryCount, cdOffset, cdSize, central, local }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const te = new TextEncoder()

/**
 * A deterministic word soup, sized so that **the deflate level is visible in
 * the output bytes**.
 *
 * This is the load-bearing property, not the content. `CompressionStream` has
 * no level knob, so the only way to pin the level is to compare against
 * `deflateRawSync` at a known one — and that comparison is **vacuous on a
 * fixture that compresses the same way at every level**. Measured on this
 * machine: a 200-byte JSON blob, a 64-byte hash and `'ABCD'.repeat(5000)` all
 * produce byte-identical output at zlib 6 and 9, so a test built on any of
 * them would pass if the platform silently switched to 9.
 *
 * 1000 words (5743 bytes) is past that: levels 1, 6 and 9 each give a
 * different stream, because there is enough redundancy for the match-chain
 * depth — which is what the level actually sets — to change the choices made.
 * `deflateLevelFixture` asserts all three, so the discrimination is checked
 * rather than assumed.
 */
function wordSoup(words: number): Uint8Array {
  const vocab = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta']
  // A plain LCG, not `Math.random`: the fixture has to be the same bytes on
  // every machine or none of the determinism claims below mean anything.
  let x = 7
  const out: string[] = []
  for (let i = 0; i < words; i++) {
    x = (x * 1103515245 + 12345) >>> 0
    out.push(vocab[(x >>> 16) % vocab.length] as string)
  }
  return te.encode(out.join(' '))
}

const SOUP = wordSoup(1000)

/**
 * A non-ASCII entry name.
 *
 * Not decoration: design §6.2 puts baked masks in the container and the layer
 * panel derives mask names from `layerName()`, which returns **the author's
 * own text** (`src/shared/layerName.ts` — "never truncated", returns
 * `layer.name` or the drawn content verbatim). A scene whose layer is called
 * `масло` produces an entry called `масло`. Cyrillic, an em dash and an
 * astral-plane emoji together cover two-, three- and four-byte UTF-8.
 */
const UNICODE_NAME = 'masks/масло — ☕𝄞.png'

const SCENE = te.encode(JSON.stringify({ stage: { w: 640, h: 360 }, layers: [] }))

function fixtureEntries(): ZipEntry[] {
  return [
    // `store` first and deflated after, so the archive exercises both methods
    // and `unzip -p` has one of each to be checked against (criterion 3).
    { name: 'mimetype', data: te.encode('application/x-stst'), method: 'store' },
    { name: 'scene.json', data: SCENE, method: 'deflate' },
    { name: UNICODE_NAME, data: SOUP, method: 'deflate' },
  ]
}

// ---------------------------------------------------------------------------

describe('writeZip', () => {
  it('emits a local header, a central directory and an EOCD that agree', async () => {
    const entries = fixtureEntries()
    const archive = await writeZip(entries)
    const z = parse(archive)

    expect(z.entryCount).toBe(entries.length)
    expect(z.central).toHaveLength(entries.length)

    // The EOCD's own pointers describe the central directory it is attached
    // to, rather than some region that happens to parse. Asserted as an
    // identity between the three numbers, not as three literals.
    expect(z.cdOffset + z.cdSize).toBe(archive.length - 22)

    // Local and central must carry the same facts about every entry. They are
    // written twice in the format, 40-odd bytes apart, and a writer that
    // disagrees with itself produces an archive that extracts differently
    // depending on which half the tool trusts.
    for (let i = 0; i < entries.length; i++) {
      const c = z.central[i] as Record
      const l = z.local[i] as Omit<Record, 'localOffset'>
      expect(l.name).toBe(c.name)
      expect(l.method).toBe(c.method)
      expect(l.crc).toBe(c.crc)
      expect(l.csize).toBe(c.csize)
      expect(l.usize).toBe(c.usize)
      expect(l.usize).toBe((entries[i] as ZipEntry).data.length)
    }

    // Entry order is the caller's array order, unsorted. Criterion 5 asks
    // which it is and why: the `.stst` layout is a hand-written list in which
    // position is meaningful (`mimetype` first, as in ODF and EPUB), so a sort
    // inside the writer would silently reorder a deliberate sequence.
    expect(z.central.map(r => r.name)).toEqual(entries.map(e => e.name))

    // Methods are the caller's too. There is no "store it if deflate came out
    // bigger" rule: that would make the method depend on the compressor's
    // behaviour, which is the one thing here we do not control.
    expect(z.central.map(r => r.method)).toEqual([0, 8, 8])
  })

  it('shells out to /usr/bin/unzip -t and gets exit 0', async () => {
    expect(unzip(['-t', onDisk(await writeZip(fixtureEntries()))]).status).toBe(0)
  })

  it('gives unzip -p back the exact bytes of a stored and a deflated entry', async () => {
    const entries = fixtureEntries()
    const path = onDisk(await writeZip(entries))

    for (const e of entries) {
      const got = unzip(['-p', path, e.name])
      expect(got.status, `unzip -p ${e.name}`).toBe(0)
      expect(got.stdout).toEqual(e.data)
    }
  })

  it('round-trips a non-ASCII entry name through /usr/bin/unzip', async () => {
    const archive = await writeZip(fixtureEntries())
    const path = onDisk(archive)
    const z = parse(archive)

    // Bit 11 (0x800) tells the reader the name is UTF-8 rather than CP437.
    // Set on both copies of every header: a reader is entitled to consult
    // either, and Info-ZIP's `unzip` reads the central one while `zipinfo`
    // and streaming readers read the local one.
    for (const r of [...z.central, ...z.local]) expect(r.flags & 0x800).toBe(0x800)

    const nameBytes = te.encode(UNICODE_NAME)
    const got = unzip(['-p', path, UNICODE_NAME])
    expect(got.status).toBe(0)
    expect(got.stdout).toEqual(SOUP)

    // The control (§6.5a): the assertion above is only evidence if it could
    // have failed. Corrupt the name's UTF-8 bytes in place — same length, so
    // every offset in the archive stays valid — and the *same* `unzip -p`
    // call must now fail to match. Without this, a reader could not tell the
    // lookup from a tool that prints the first entry regardless of the name.
    const mutant = archive.slice()
    let patched = 0
    outer: for (let i = 0; i + nameBytes.length <= mutant.length; i++) {
      for (let j = 0; j < nameBytes.length; j++) {
        if (mutant[i + j] !== nameBytes[j]) continue outer
      }
      // The first byte of the Cyrillic 'м' (0xD0): flipping it to an ASCII
      // letter keeps the byte count identical while changing the name.
      const at = i + UNICODE_NAME.indexOf('м')
      mutant[at] = 0x7a
      patched++
      i += nameBytes.length - 1
    }
    // Twice: the local header and the central record. If only one copy were
    // found, the writer is not writing the name in both places and the
    // control is measuring something other than what it claims.
    expect(patched).toBe(2)

    // The same call, same instrument, against the mutant: a non-zero status
    // ("filename not matched"). Asserted as "not 0" rather than as unzip's
    // particular code for it, which is a value and not the guarantee.
    expect(unzip(['-p', onDisk(mutant), UNICODE_NAME]).status).not.toBe(0)
  })

  it('writes byte-identical archives for the same input, whatever the clock says', async () => {
    const first = await writeZip(fixtureEntries())

    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('1999-12-31T23:59:59Z'))
      const atY2K = await writeZip(fixtureEntries())
      vi.setSystemTime(new Date('2038-01-19T03:14:07Z'))
      const atEpochEnd = await writeZip(fixtureEntries())

      expect(sha(atY2K)).toBe(sha(first))
      expect(sha(atEpochEnd)).toBe(sha(first))
    } finally {
      vi.useRealTimers()
    }

    // The control (§6.5a). "The digest did not move when the clock moved" is a
    // null measurement, and a null is indistinguishable from a broken
    // instrument unless the same instrument can be shown moving. So: patch the
    // MS-DOS date field of the first local header and watch the digest change.
    // That is the field a clock-reading writer would have varied, which makes
    // this the control for *this* null rather than for determinism in general.
    const mutant = first.slice()
    const dosDateAt = 12 // local header + 12: last-mod date, after the 2-byte time
    const view = new DataView(mutant.buffer, mutant.byteOffset, mutant.byteLength)
    const before = view.getUint16(dosDateAt, true)
    view.setUint16(dosDateAt, before + 1, true)
    expect(sha(mutant)).not.toBe(sha(first))

    // And the timestamp that is written is the fixed one, not a reading of any
    // clock: 1980-01-01 00:00:00, the earliest MS-DOS date representable.
    // `(year-1980)<<9 | month<<5 | day` with year 1980, month 1, day 1.
    const z = parse(first)
    for (const r of [...z.central, ...z.local]) {
      expect(r.dosDate).toBe((0 << 9) | (1 << 5) | 1)
      expect(r.dosTime).toBe(0)
    }
  })

  it('deflates at zlib level 6, which is the platform default and not our choice', async () => {
    const archive = await writeZip([{ name: 'soup.txt', data: SOUP, method: 'deflate' }])
    const payload = (parse(archive).central[0] as Record).payload

    // `CompressionStream` takes no options — its `length` is 1 and a second
    // argument is silently ignored in both Node and Chromium — so the level
    // cannot be configured, only observed. This assertion is the observation,
    // and it is a genuine sensor: the day a runtime changes its default it
    // goes red, which is also the day P1 criterion 7's cross-runtime
    // byte-identity quietly stops holding. (The phase criterion's wording,
    // "fixed compression level", names an action no API supports; the pin is
    // the test.)
    expect(new Uint8Array(payload)).toEqual(new Uint8Array(deflateRawSync(SOUP, { level: 6 })))

    // The control: without these, the assertion above would also pass at
    // levels 1 and 9 on a less compressible fixture, and would therefore be
    // consistent with the platform having changed nothing it could change.
    expect(new Uint8Array(payload)).not.toEqual(new Uint8Array(deflateRawSync(SOUP, { level: 1 })))
    expect(new Uint8Array(payload)).not.toEqual(new Uint8Array(deflateRawSync(SOUP, { level: 9 })))
  })

  it('refuses the entry lists that would produce a silently wrong archive', async () => {
    const one = (name: string): ZipEntry[] => [{ name, data: SCENE, method: 'store' }]

    // Two entries under one name: the format permits it and extractors
    // disagree about which wins, so the archive means different things to
    // different readers. A `.stst` layout assembled from layer names can
    // collide, and failing here beats shipping that ambiguity.
    await expect(writeZip([...one('a.txt'), ...one('a.txt')])).rejects.toThrow(/duplicate/i)

    await expect(writeZip(one(''))).rejects.toThrow()
    // `/` is the format's only path separator. A `\` would be a literal
    // character in the name here and a separator to half the tools that open
    // it, so the name you wrote is not the name they see.
    await expect(writeZip(one('a\\b.txt'))).rejects.toThrow()
    // An absolute name is stripped by Info-ZIP's `unzip` with a warning, so
    // the entry comes back under a different name than it went in under.
    await expect(writeZip(one('/a.txt'))).rejects.toThrow()
  })
})
