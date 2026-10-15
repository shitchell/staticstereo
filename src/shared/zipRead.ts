/**
 * The zip reader `.stst` is opened with (design §6.2, plan P1 criterion 2).
 *
 * The mirror of `zip.ts`, and it shares that file's `ZipEntry` type and its
 * CRC-32 table deliberately — a second table would be a second thing to
 * mistype, and a reader whose idea of an entry differed from the writer's
 * would make the round trip prove less than it looks like it proves.
 *
 * ## It must read archives this repo did not write
 *
 * Criterion 2 is worded to exclude the easy version: the reader "**must read
 * a zip produced by `/usr/bin/zip`**, not only our own writer." A writer and
 * a reader that share one misreading of the format agree with each other
 * perfectly, so a round trip through our own halves is a fidelity check and
 * not a conformance one. `zipRead.test.ts` generates its fixtures by shelling
 * out to `/usr/bin/zip`, and the three places where a foreign archive differs
 * from ours each have a branch here:
 *
 * 1. **Extra fields.** Default `zip -r` writes them; `zip -r -X` does not.
 *    A reader that ignores `extraLen` when stepping from the local header to
 *    the file data starts reading 28 bytes early.
 * 2. **Directory entries.** `zip -r` records every traversed directory as an
 *    entry of its own — method 0, size 0, name ending in `/`. Our writer
 *    emits none. They are not files and must not arrive in the file list.
 * 3. **Stored entries.** `zip` picks method 0 for anything deflate would not
 *    shrink, so a deflate-only reader fails on the first small file.
 *
 * ## The central directory is authoritative — and the limit of that rule
 *
 * Every fact about an entry is taken from its central-directory record:
 * name, method, CRC, both sizes. Trusting the local header instead is the
 * classic zip-parsing vulnerability, because the two copies can disagree and
 * then "what is in this archive" has two answers.
 *
 * **The one thing the central record cannot tell you is where the local
 * header ends**, and getting this wrong is the subtlest bug available here.
 * The local header has its own `nameLen` and `extraLen`, and the extra
 * lengths legitimately differ between the two copies: measured on Info-ZIP
 * 3.0, a default `zip -r` entry carries **28** bytes of extra locally and
 * **24** centrally, because the extended-timestamp field `0x5455` is 9 bytes
 * in a local header (flags + mtime + atime) and 5 in a central one (flags +
 * mtime). That is the specification's own asymmetry, not a quirk. So the file
 * data begins at `localOffset + 30 + localNameLen + localExtraLen`, read from
 * the local header, while everything *about* the data comes from the central
 * record. A reader that applies "central is authoritative" to this one step
 * too lands 4 bytes inside the compressed stream — which is why the test
 * plants exactly that mutation.
 *
 * Where the two copies carry the same field, disagreement is an error rather
 * than a preference: `checkLocalAgrees` throws instead of silently picking a
 * side.
 *
 * ## Why this throws where `zip.ts` throws
 *
 * Plan §1.2k: *a wrong layout ruins the artifact; a wrong resampling hint
 * costs a soft frame.* A `.stst` is the user's project, so a silently
 * mis-read one destroys work that exists nowhere else. Everything this module
 * cannot read with certainty is therefore a throw naming the entry, never a
 * best effort: a bad CRC, a truncation, an unsupported method, encryption, a
 * data descriptor, a ZIP64 marker, a name whose encoding is undeclared.
 *
 * Two of those are refusals of things that are not actually broken. Both are
 * deliberate, and **both are refusals of archives this host can produce** —
 * which is the point, and is the opposite of what this docblock said until
 * 2026-10-15. It claimed no local producer could emit either, so the paths
 * were untested of necessity. Measured, with Info-ZIP `zip` 3.0, the only
 * `zip` on this machine:
 *
 * - **ZIP64.** `zip -h2` says it in its own words — *"streaming stdin creates
 *   Zip64 archives by default"*. `cat soup.txt | zip -q out.zip -` writes a
 *   ZIP64 end-of-central-directory record, a ZIP64 locator **and** a `0x0001`
 *   extra field in the local header, from a 5 KiB input with no 4 GiB in
 *   sight. `-fz-` suppresses all three and is the negative control. The
 *   refusal stands because a ZIP64 archive's 32-bit fields are left at
 *   `0xffffffff` as sentinels, so a reader that takes them literally computes
 *   a 4 GiB offset into a 2 KiB file.
 * - **Data descriptors** (general-purpose bit 3) move the CRC and sizes after
 *   the data and zero the local header's copies. **A shell redirect is not a
 *   pipe, and that is why this was measured wrong the first time.** With
 *   `zip -X - soup.txt > out.zip` the tool's stdout is seekable: it seeks back
 *   and patches the local header, and bit 3 comes out **clear**. Send the same
 *   bytes through a pipe — `| cat > out.zip`, or `spawnSync` with a piped
 *   stdout, as the test does — and stdout is unseekable, so the descriptor
 *   goes in and bit 3 comes out **set**. Measured side by side, same command,
 *   same input: `> out.zip` → flags `0x0000`; `| cat` → flags `0x0008`.
 *
 * So the data-descriptor refusal is **no longer an absence of evidence**, and
 * the previous wording must not be allowed to read as prescient. This reader
 * takes both sizes and the CRC from the central directory, so it would very
 * likely cope with bit 3 — and it still refuses, because *likely* is the wrong
 * standard for a `.stst`. Plan §1.2k again: a silently mis-read project file
 * destroys work that exists nowhere else, and a format this repo neither
 * writes (`zip.ts` sets bit 3 on nothing) nor has a reason to read is not
 * worth the surface. **Refusing a format we can now produce and test is a
 * decision, not a gap**, and `zipRead.test.ts` drives both refusals with real
 * `/usr/bin/zip` output rather than with a patched flag word.
 */

import { crc32, type ZipEntry, type ZipMethod } from './zip.js'

export interface ZipArchive {
  /**
   * Every non-directory entry, in central-directory order. Shaped as
   * `ZipEntry` so that `readZip(await writeZip(x))` is comparable to `x`
   * field by field, and so a caller can re-write what it read.
   */
  readonly files: readonly ZipEntry[]
  /**
   * The names of the directory entries, trailing `/` kept, in
   * central-directory order.
   *
   * Surfaced rather than discarded because dropping them silently would make
   * "this archive has four members" and "this archive has six records" both
   * true and neither checkable. A `.stst` consumer wants `files`; a tool
   * re-emitting an archive wants to know the directories were there.
   */
  readonly directories: readonly string[]
}

const SIG_LOCAL = 0x04034b50
const SIG_CENTRAL = 0x02014b50
const SIG_EOCD = 0x06054b50
/** `PK\x06\x06` and `PK\x06\x07` — the ZIP64 end-of-central-directory pair. */
const SIG_ZIP64_EOCD = 0x06064b50
const SIG_ZIP64_LOCATOR = 0x07064b50

const LOCAL_HEADER_BYTES = 30
const CENTRAL_HEADER_BYTES = 46
const EOCD_BYTES = 22
/** The ZIP64 locator sits immediately before the EOCD when there is one. */
const ZIP64_LOCATOR_BYTES = 20

const METHOD_STORE = 0
const METHOD_DEFLATE = 8

/** Bit 0, and bit 6 which accompanies it for the strong-encryption variants. */
const FLAG_ENCRYPTED = 0x0001
const FLAG_STRONG_ENCRYPTION = 0x0040
/** Bit 3: sizes and CRC follow the data instead of preceding it. */
const FLAG_DATA_DESCRIPTOR = 0x0008
/** Bit 11: the name is UTF-8 rather than CP437. */
const FLAG_UTF8_NAMES = 0x0800

/** The extra-field header id ZIP64 uses to carry 64-bit sizes and offsets. */
const EXTRA_ZIP64 = 0x0001

/**
 * `0xffff` / `0xffffffff` in a count, size or offset is ZIP64's "the real
 * value is in the extra field", not a real value. Treating one as a number is
 * the mis-parse this module refuses to commit.
 */
const SENTINEL_U16 = 0xffff
const SENTINEL_U32 = 0xffffffff

/** The EOCD's trailing comment is a `uint16` length, so the scan is bounded. */
const MAX_COMMENT_BYTES = 0xffff

/**
 * Strict on purpose. A lone surrogate or a truncated sequence in an entry
 * name would otherwise become U+FFFD, and the name that comes out of the
 * archive would not be the name that went in — silently, and in the one field
 * a container is indexed by.
 */
const UTF8_STRICT = new TextDecoder('utf-8', { fatal: true })

function need(archive: Uint8Array, at: number, len: number, what: string): void {
  if (at < 0 || len < 0 || at + len > archive.length) {
    throw new Error(
      `zip is truncated or corrupt: ${what} needs bytes ${at}–${at + len} of a ${archive.length}-byte archive`
    )
  }
}

/**
 * Locate the end-of-central-directory record.
 *
 * Scanned backwards because the record is variable-length — it ends in an
 * optional comment — so there is no fixed offset from the end to read it at.
 * The signature alone is not enough: four bytes that happen to spell `PK\5\6`
 * can occur inside compressed data, and on an archive with a comment the
 * first match going backwards can be one of them. The length identity
 * `at + 22 + commentLen === archive.length` is what distinguishes the record
 * from a coincidence, and it is cheap.
 */
function findEocd(archive: Uint8Array, v: DataView): number {
  if (archive.length < EOCD_BYTES) {
    throw new Error(`zip is truncated: ${archive.length} bytes cannot hold a ${EOCD_BYTES}-byte EOCD record`)
  }
  const floor = Math.max(0, archive.length - EOCD_BYTES - MAX_COMMENT_BYTES)
  for (let at = archive.length - EOCD_BYTES; at >= floor; at--) {
    if (v.getUint32(at, true) !== SIG_EOCD) continue
    if (at + EOCD_BYTES + v.getUint16(at + 20, true) === archive.length) return at
  }
  throw new Error('zip has no end-of-central-directory record; it is not a zip archive, or it is truncated')
}

/**
 * Raw inflate, the mirror of `zip.ts`'s `deflateRaw`.
 *
 * `DecompressionStream` is the platform primitive in both Node and the
 * browser, so criterion 1's no-dependency rule costs nothing here either.
 * A malformed stream rejects the read, and that rejection is caught and
 * re-thrown with the entry name: a bare "incorrect header check" tells the
 * caller nothing about which member of their project is unreadable.
 */
async function inflateRaw(payload: Uint8Array, name: string): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()

  // The copy is the same narrowing `zip.ts` documents: a stream accepts only
  // views over a plain `ArrayBuffer`, while a `Uint8Array` may be backed by a
  // `SharedArrayBuffer`, and `tsc` 5.9 rejects the assignment (TS2345).
  //
  // Not awaited before `close()`: `write()` settles when the chunk is accepted
  // downstream, and nothing is reading yet, so awaiting here deadlocks.
  void writer.write(new Uint8Array(payload))
  void writer.close()

  const reader = ds.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.length
    }
  } catch (cause) {
    throw new Error(`zip entry ${name} is not a valid deflate stream`, { cause })
  }

  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

/** One central-directory record, decoded but not yet validated against its data. */
interface Central {
  readonly name: string
  readonly flags: number
  readonly method: number
  readonly crc: number
  readonly csize: number
  readonly usize: number
  readonly localOffset: number
  /** Where the next central record begins. */
  readonly next: number
}

/**
 * Decode an entry name.
 *
 * Bit 11 set means UTF-8, which is what `zip.ts` always writes and what
 * `/usr/bin/zip` writes for any name that needs it (measured: set on a
 * Cyrillic name, clear on the ASCII ones in the same archive, so a real
 * archive drives both paths).
 *
 * With the bit clear the format says CP437, and CP437 agrees with ASCII over
 * the whole range below 0x80. A high byte with the bit clear is therefore a
 * name this module cannot decode without a CP437 table it does not have, and
 * it throws rather than guessing — a mojibake entry name in a container is a
 * file the caller can no longer find, which is the failure §1.2k says to be
 * loud about. No producer we target reaches this branch.
 */
function decodeName(bytes: Uint8Array, flags: number, at: number): string {
  if ((flags & FLAG_UTF8_NAMES) !== 0) {
    try {
      return UTF8_STRICT.decode(bytes)
    } catch (cause) {
      throw new Error(`zip entry name at ${at} is flagged UTF-8 but is not valid UTF-8`, { cause })
    }
  }
  for (const b of bytes) {
    if (b >= 0x80) {
      throw new Error(
        `zip entry name at ${at} has no UTF-8 flag and is not ASCII; CP437 entry names are not supported`
      )
    }
  }
  return UTF8_STRICT.decode(bytes)
}

/** Throw if any extra field announces ZIP64, whichever copy it is in. */
function rejectZip64Extra(archive: Uint8Array, at: number, len: number, name: string): void {
  let p = at
  const end = at + len
  const v = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
  // A 4-byte header (id, length) per field. A field whose declared length runs
  // past the block is malformed rather than ZIP64, and stopping is correct:
  // the fields are advisory and the authoritative numbers are already read.
  while (p + 4 <= end) {
    const id = v.getUint16(p, true)
    const size = v.getUint16(p + 2, true)
    if (id === EXTRA_ZIP64) {
      throw new Error(`zip entry ${name} carries a ZIP64 extra field; ZIP64 archives are not supported`)
    }
    p += 4 + size
  }
}

function readCentral(archive: Uint8Array, v: DataView, at: number, index: number): Central {
  need(archive, at, CENTRAL_HEADER_BYTES, `central directory record ${index}`)
  if (v.getUint32(at, true) !== SIG_CENTRAL) {
    throw new Error(`zip central directory record ${index} has no signature at offset ${at}`)
  }

  const nameLen = v.getUint16(at + 28, true)
  const extraLen = v.getUint16(at + 30, true)
  const commentLen = v.getUint16(at + 32, true)
  need(archive, at, CENTRAL_HEADER_BYTES + nameLen + extraLen + commentLen, `central directory record ${index}`)

  const flags = v.getUint16(at + 8, true)
  const name = decodeName(archive.subarray(at + CENTRAL_HEADER_BYTES, at + CENTRAL_HEADER_BYTES + nameLen), flags, at)
  rejectZip64Extra(archive, at + CENTRAL_HEADER_BYTES + nameLen, extraLen, name)

  const csize = v.getUint32(at + 20, true)
  const usize = v.getUint32(at + 24, true)
  const localOffset = v.getUint32(at + 42, true)
  // The sentinels, checked per entry and not only on the EOCD: an archive
  // under 4 GiB overall can still hold a member that needs ZIP64, and that is
  // the case where the EOCD looks entirely ordinary.
  if (csize === SENTINEL_U32 || usize === SENTINEL_U32 || localOffset === SENTINEL_U32) {
    throw new Error(`zip entry ${name} uses ZIP64 size or offset sentinels; ZIP64 archives are not supported`)
  }

  return {
    name,
    flags,
    method: v.getUint16(at + 10, true),
    crc: v.getUint32(at + 16, true),
    csize,
    usize,
    localOffset,
    next: at + CENTRAL_HEADER_BYTES + nameLen + extraLen + commentLen,
  }
}

/**
 * Validate the local header and return the offset its file data starts at.
 *
 * The *only* numbers taken from the local header are its own `nameLen` and
 * `extraLen`, because they describe the local header's own length and nothing
 * else can. Everything else is read in order to be compared with the central
 * record and rejected on disagreement — see the module docblock on why
 * `extraLen` is excluded from that comparison and `csize` is not.
 */
function localDataOffset(archive: Uint8Array, v: DataView, c: Central): number {
  const at = c.localOffset
  need(archive, at, LOCAL_HEADER_BYTES, `local header for ${c.name}`)
  if (v.getUint32(at, true) !== SIG_LOCAL) {
    throw new Error(`zip entry ${c.name}: central directory points at offset ${at}, which is not a local header`)
  }

  const nameLen = v.getUint16(at + 26, true)
  const extraLen = v.getUint16(at + 28, true)
  need(archive, at, LOCAL_HEADER_BYTES + nameLen + extraLen, `local header for ${c.name}`)

  const localFlags = v.getUint16(at + 6, true)
  const localName = decodeName(archive.subarray(at + LOCAL_HEADER_BYTES, at + LOCAL_HEADER_BYTES + nameLen), localFlags, at)
  rejectZip64Extra(archive, at + LOCAL_HEADER_BYTES + nameLen, extraLen, c.name)

  const disagreements: string[] = []
  if (localName !== c.name) disagreements.push(`name (local ${JSON.stringify(localName)})`)
  if (v.getUint16(at + 8, true) !== c.method) disagreements.push('compression method')
  if (v.getUint32(at + 14, true) !== c.crc) disagreements.push('CRC-32')
  if (v.getUint32(at + 18, true) !== c.csize) disagreements.push('compressed size')
  if (v.getUint32(at + 22, true) !== c.usize) disagreements.push('uncompressed size')
  if (disagreements.length > 0) {
    throw new Error(
      `zip entry ${c.name}: local header and central directory disagree on ${disagreements.join(', ')}; ` +
        `refusing rather than choosing one, because an archive its own two halves describe differently ` +
        `means different things to different tools`
    )
  }

  return at + LOCAL_HEADER_BYTES + nameLen + extraLen
}

/**
 * Read a zip archive held in memory.
 *
 * Returns copies, never views into `archive`: a `Uint8Array` handed back as a
 * subarray would alias the caller's buffer, so writing to a mask would edit
 * the archive it came from.
 */
export async function readZip(archive: Uint8Array): Promise<ZipArchive> {
  const v = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
  const eocd = findEocd(archive, v)

  // The ZIP64 locator, if present, sits immediately before the EOCD and is the
  // earliest point at which a ZIP64 archive can be recognised for what it is.
  if (eocd >= ZIP64_LOCATOR_BYTES && v.getUint32(eocd - ZIP64_LOCATOR_BYTES, true) === SIG_ZIP64_LOCATOR) {
    throw new Error('zip carries a ZIP64 end-of-central-directory locator; ZIP64 archives are not supported')
  }

  const thisDisk = v.getUint16(eocd + 4, true)
  const cdDisk = v.getUint16(eocd + 6, true)
  const onThisDisk = v.getUint16(eocd + 8, true)
  const total = v.getUint16(eocd + 10, true)
  const cdSize = v.getUint32(eocd + 12, true)
  const cdOffset = v.getUint32(eocd + 16, true)

  if (total === SENTINEL_U16 || onThisDisk === SENTINEL_U16 || cdSize === SENTINEL_U32 || cdOffset === SENTINEL_U32) {
    throw new Error('zip end-of-central-directory holds ZIP64 sentinels; ZIP64 archives are not supported')
  }
  // Split archives would need the other volumes, which an in-memory reader by
  // definition does not have. Named rather than left to fail as a bad offset.
  if (thisDisk !== 0 || cdDisk !== 0 || onThisDisk !== total) {
    throw new Error(`zip is a split archive (disk ${thisDisk}, ${onThisDisk} of ${total} records here); not supported`)
  }
  need(archive, cdOffset, cdSize, 'central directory')
  if (v.getUint32(cdOffset, true) === SIG_ZIP64_EOCD) {
    throw new Error('zip central directory offset points at a ZIP64 record; ZIP64 archives are not supported')
  }

  const files: ZipEntry[] = []
  const directories: string[] = []

  let at = cdOffset
  for (let i = 0; i < total; i++) {
    const c = readCentral(archive, v, at, i)
    at = c.next

    if ((c.flags & (FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION)) !== 0) {
      // Without this the entry would still be rejected — ciphertext fails the
      // CRC — but under a message that sends the caller hunting for corruption.
      throw new Error(`zip entry ${c.name} is encrypted; encrypted entries are not supported`)
    }

    // A directory is an entry whose name ends in `/`. That is the convention
    // every producer writes and the only signal that is host-independent: the
    // external-attributes field holds DOS attribute bits under host 0 and Unix
    // mode bits under host 3, and `zip.ts` declares host 0 and writes zero
    // there, so the attribute cannot discriminate across both producers.
    if (c.name.endsWith('/')) {
      if (c.usize !== 0 || c.csize !== 0) {
        throw new Error(
          `zip entry ${c.name} is named as a directory but declares ${c.usize} bytes of content; ` +
            `refusing rather than discarding them`
        )
      }
      // Its flags are still checked above, and its local header is not: a
      // zero-length entry has no data to locate, so there is nothing the
      // local header could tell us that the central record has not.
      directories.push(c.name)
      continue
    }

    if ((c.flags & FLAG_DATA_DESCRIPTOR) !== 0) {
      // The message has to be actionable, because the commonest way to get
      // here is a producer that streamed to a pipe rather than to a file —
      // which the caller can usually just redo. It must not repeat the old
      // claim that nothing here can emit one; `zipRead.test.ts` emits one.
      throw new Error(
        `zip entry ${c.name} uses a data descriptor (general-purpose bit 3); not supported — ` +
          `the CRC and sizes follow the data because the producer's output was not seekable. ` +
          `Re-create the archive writing to a file rather than to a pipe`
      )
    }

    let method: ZipMethod
    if (c.method === METHOD_STORE) method = 'store'
    else if (c.method === METHOD_DEFLATE) method = 'deflate'
    else {
      throw new Error(
        `zip entry ${c.name} uses compression method ${c.method}; only 0 (store) and 8 (deflate) are supported`
      )
    }

    const dataAt = localDataOffset(archive, v, c)
    need(archive, dataAt, c.csize, `file data for ${c.name}`)
    const payload = archive.subarray(dataAt, dataAt + c.csize)

    const data = method === 'store' ? payload.slice() : await inflateRaw(payload, c.name)

    if (data.length !== c.usize) {
      throw new Error(`zip entry ${c.name} expands to ${data.length} bytes but declares ${c.usize}`)
    }
    const actual = crc32(data)
    if (actual !== c.crc) {
      // The whole reason this reader exists rather than a best-effort one.
      // The message names the member so the caller can say which part of the
      // project is damaged, which is the only thing they can act on.
      throw new Error(
        `zip entry ${c.name} failed its CRC-32 check: stored 0x${c.crc.toString(16).padStart(8, '0')}, ` +
          `computed 0x${actual.toString(16).padStart(8, '0')} — the archive is corrupt`
      )
    }

    files.push({ name: c.name, data, method })
  }

  return { files, directories }
}
