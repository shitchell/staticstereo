/**
 * The deterministic zip writer `.stst` is built out of (design §6.2).
 *
 * A `.stst` is a **real zip** — `scene.json`, baked masks, original sources
 * and a manifest — chosen over a bespoke container, in the design's words,
 * "so anyone can `unzip` it and read `scene.json`". That sentence is the
 * whole specification: the archive has to satisfy Info-ZIP, not merely our
 * own reader, and `zip.test.ts` shells out to `/usr/bin/unzip` because a
 * writer and a reader sharing one misreading of the spec agree perfectly.
 *
 * ## No dependency, and none is needed
 *
 * `CompressionStream('deflate-raw')` is a platform primitive in both Node and
 * the browser, and deflate is the only compression method a zip reader is
 * required to support. What a library would add on top is three fixed-layout
 * records and a CRC table, which are written out below. P1 criterion 1 forbids
 * the dependency explicitly; this is what that costs.
 *
 * ## Byte-determinism, and the three things it rests on
 *
 * P1 criterion 7 requires the CLI and the site to emit **identical bytes** for
 * one scene. Three inputs could break that and each is nailed down here:
 *
 * 1. **Time.** Nothing in this file reads a clock. Every entry is stamped
 *    1980-01-01 00:00:00 — see `DOS_DATE_1980_01_01`.
 * 2. **Order.** Entries are emitted in the order the caller's array gives
 *    them, and nothing here sorts. See `writeZip`.
 * 3. **Compression level.** Not settable, and therefore asserted instead —
 *    see `deflateRaw`.
 *
 * ## Deliberately not implemented
 *
 * No zip64, no data descriptors, no archive comment, no extra fields, no
 * directory entries. Each is a branch whose absence `writeZip` enforces with
 * a throw rather than leaving to chance: the 32-bit size fields wrap silently
 * at 4 GiB and the entry count wraps at 65 535, and a wrapped field produces
 * an archive that *parses* and is wrong, which is the worst available outcome.
 */

/** `store` writes the bytes as they are; `deflate` runs them through deflate-raw. */
export type ZipMethod = 'store' | 'deflate'

export interface ZipEntry {
  /**
   * The archive-relative path, `/`-separated. Encoded UTF-8 — mask names are
   * expected to derive from layer names (`layerName.ts`), which are the
   * author's own text and need not be ASCII.
   */
  readonly name: string
  /** The entry's uncompressed contents. */
  readonly data: Uint8Array
  readonly method: ZipMethod
}

const SIG_LOCAL = 0x04034b50
const SIG_CENTRAL = 0x02014b50
const SIG_EOCD = 0x06054b50

const LOCAL_HEADER_BYTES = 30
const CENTRAL_HEADER_BYTES = 46
const EOCD_BYTES = 22

const METHOD_STORE = 0
const METHOD_DEFLATE = 8

/**
 * "Version needed to extract", ×10. 2.0 is the version that introduced
 * deflate, so it is the honest floor for everything written here — claiming
 * less would be a lie a strict reader may act on, and claiming more would
 * make old readers refuse an archive they can in fact read.
 */
const VERSION_DEFLATE = 20

/**
 * "Version made by": low byte the spec version, high byte the host system.
 * Host **0 (MS-DOS/FAT)**, not the machine's real OS, and that choice is
 * determinism rather than nostalgia — the CLI runs on whatever the author has
 * and the site runs in a browser, so a field derived from the host could not
 * satisfy criterion 7. Host 0 also makes the external-attributes field DOS
 * attribute bits, which lets us legitimately write 0 there; declaring host 3
 * (Unix) would put file-mode bits in its high half and invite exactly the
 * machine-dependence we are avoiding.
 */
const VERSION_MADE_BY = (0 << 8) | VERSION_DEFLATE

/**
 * General-purpose bit 11. Tells the reader the name and comment are UTF-8
 * rather than CP437. Set on **every** entry, ASCII ones included: the two
 * encodings agree on ASCII, so there is no case where leaving it off is more
 * correct, and a flag that is only sometimes set is a flag someone will
 * eventually forget to compute.
 *
 * Bit 3 (data descriptor) is deliberately **not** set. We compress each entry
 * fully in memory before writing its header, so the sizes and CRC are known
 * up front and can go in the local header where every reader looks first.
 */
const FLAG_UTF8_NAMES = 0x0800

/**
 * MS-DOS 1980-01-01 00:00:00, as `(year-1980)<<9 | month<<5 | day` and
 * `hour<<11 | minute<<5 | second/2`.
 *
 * The zip format's only mandatory timestamp is this one, and reading the
 * clock to fill it would make byte-determinism impossible — the same scene
 * saved twice would differ, and criterion 7's CLI/site comparison could never
 * pass. 1980-01-01 is the earliest representable date, i.e. the format's
 * equivalent of zero. A date of all-zero bytes is *not* used: it decodes to
 * day 0 of month 0, which some tools reject outright.
 *
 * The information lost is real but was never ours to keep: a `.stst` is a
 * project file whose meaningful timestamp is the one the filesystem holds for
 * it, not one baked separately into each of its members.
 */
const DOS_DATE_1980_01_01 = (0 << 9) | (1 << 5) | 1
const DOS_TIME_MIDNIGHT = 0

/**
 * The points at which a field stops being able to hold the truth. Crossing
 * one is a throw and never a wrap, because a wrapped length field yields an
 * archive that opens and lies about its contents.
 */
const MAX_U16 = 0xffff
const MAX_U32 = 0xffffffff

const UTF8 = new TextEncoder()

/**
 * CRC-32 (IEEE 802.3), the checksum the zip format specifies, over the
 * **uncompressed** bytes.
 *
 * The reversed polynomial 0xEDB88320 is 0x04C11DB7 with its bits in the other
 * order; the reversed form is what a right-shifting implementation needs, and
 * every zip and PNG implementation uses it. The table is built once on first
 * use rather than written out as 256 literals, so there is nothing to mistype
 * and nothing for a reader to have to trust.
 */
let crcTable: Uint32Array | undefined
function crc32(bytes: Uint8Array): number {
  if (crcTable === undefined) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    c = (crcTable[(c ^ (bytes[i] as number)) & 0xff] as number) ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

/**
 * Raw deflate, at whatever level the platform happens to use.
 *
 * **The level is observed, not chosen.** `CompressionStream` accepts no
 * options — its `length` is 1 and a second argument is silently ignored in
 * both Node and Chromium — so there is no API through which this module could
 * request a level, and a comment claiming one would be fiction. What it
 * produces is zlib's default, 6: measured byte-for-byte against
 * `zlib.deflateRawSync(x, {level: 6})` on a fixture where levels 1, 6 and 9
 * each differ, and pinned by `zip.test.ts` so that the day a runtime changes
 * its default is the day something goes red. That is the same day P1
 * criterion 7's cross-runtime byte-identity stops holding, which is why the
 * assertion belongs in the suite rather than in a comment.
 *
 * `'store'` is not a `CompressionFormat` — it throws `TypeError` — so the
 * stored path in `writeZip` is a plain copy and never comes through here.
 *
 * Written in one `write()` and closed. Chunking makes no difference to the
 * output bytes (one write, two writes and 1 KiB writes all agree), so the
 * single write is for clarity, not for correctness.
 */
async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw')
  const writer = cs.writable.getWriter()

  // The copy is not optional and not caution: a `WritableStream<BufferSource>`
  // accepts only views over a plain `ArrayBuffer`, while a `Uint8Array`
  // parameter may be backed by a `SharedArrayBuffer`, and `tsc` 5.9 rejects
  // the assignment outright (TS2345). Copying is the narrowing — `new
  // Uint8Array(view)` always allocates a non-shared buffer.
  //
  // It is **not** a defence against concurrent mutation: `crc32` above reads
  // the caller's array directly, so a buffer another thread is writing could
  // still be checksummed and compressed in two different states. Nothing here
  // can close that, and the caller owns it.
  //
  // Not awaited before `close()`: `write()`'s promise settles when the chunk
  // is accepted downstream, and nothing is reading the output yet, so
  // awaiting it here deadlocks on a stream with a full queue.
  void writer.write(new Uint8Array(data))
  void writer.close()

  const reader = cs.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
  }
  return concat(chunks, total)
}

function concat(parts: readonly Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/**
 * Rejects the entry lists that would produce an archive which opens and is
 * wrong — the failure mode this module cannot let through, because by then
 * nothing downstream has any way to notice.
 *
 * Not a general sanitiser. Each rule here is a case where the name that comes
 * back out of `unzip` is not the name that went in, or where two entries
 * cannot be told apart.
 */
function checkNames(entries: readonly ZipEntry[]): void {
  const seen = new Set<string>()
  for (const e of entries) {
    if (e.name === '') throw new Error('zip entry name is empty')
    // `/` is the format's only path separator. A `\` stays a literal
    // character in the stored name but is a separator to a large fraction of
    // the tools that will open the file, so the entry lands somewhere the
    // writer did not ask for.
    if (e.name.includes('\\')) throw new Error(`zip entry name contains a backslash: ${e.name}`)
    // Info-ZIP's `unzip` strips a leading `/` and warns, so an absolute name
    // round-trips to a different name than it was written under.
    if (e.name.startsWith('/')) throw new Error(`zip entry name is absolute: ${e.name}`)
    // The format permits two entries under one name and extractors disagree
    // about which wins, so such an archive means different things to
    // different readers. A `.stst` layout assembled from layer names can
    // collide; failing here beats shipping the ambiguity.
    if (seen.has(e.name)) throw new Error(`duplicate zip entry name: ${e.name}`)
    seen.add(e.name)
  }
}

/**
 * Build a zip archive from `entries`, in memory, deterministically.
 *
 * **Entry order is the caller's array order, and nothing here sorts it.**
 * Criterion 5 asks which kind of fixed order this is: it is *declared*, by
 * the caller, and the reason is that position in a `.stst` is meaningful —
 * the layout is a hand-written list in which `mimetype` comes first, the
 * convention ODF and EPUB use so that a reader can identify the format from
 * the first bytes of the file. A sort inside the writer would silently
 * reorder a deliberate sequence, and would also make the output depend on the
 * collation of whatever runtime it ran in, which is the determinism bug it
 * would look like it was preventing. Determinism comes from the caller
 * handing over a literal list rather than iterating a map built by accident;
 * that obligation is the caller's and is stated here so it cannot be missed.
 */
export async function writeZip(entries: readonly ZipEntry[]): Promise<Uint8Array> {
  checkNames(entries)
  if (entries.length > MAX_U16) {
    throw new Error(`zip holds at most ${MAX_U16} entries without zip64; got ${entries.length}`)
  }

  const body: Uint8Array[] = []
  const central: Uint8Array[] = []
  let bodyBytes = 0
  let centralBytes = 0

  for (const entry of entries) {
    const name = UTF8.encode(entry.name)
    if (name.length > MAX_U16) throw new Error(`zip entry name is too long: ${entry.name}`)

    const method = entry.method === 'deflate' ? METHOD_DEFLATE : METHOD_STORE
    const payload = entry.method === 'deflate' ? await deflateRaw(entry.data) : entry.data

    if (entry.data.length > MAX_U32 || payload.length > MAX_U32) {
      throw new Error(`zip entry is too large without zip64: ${entry.name}`)
    }
    // The local header's own offset, captured before it is appended. A
    // 32-bit field, so an archive may not pass 4 GiB even if no single entry
    // does — checked here rather than at the end, so the message names the
    // entry that crossed the line.
    const localOffset = bodyBytes
    if (localOffset > MAX_U32) throw new Error(`zip is too large without zip64: ${entry.name}`)

    const crc = crc32(entry.data)

    const local = new Uint8Array(LOCAL_HEADER_BYTES + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, SIG_LOCAL, true)
    lv.setUint16(4, VERSION_DEFLATE, true)
    lv.setUint16(6, FLAG_UTF8_NAMES, true)
    lv.setUint16(8, method, true)
    lv.setUint16(10, DOS_TIME_MIDNIGHT, true)
    lv.setUint16(12, DOS_DATE_1980_01_01, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, payload.length, true)
    lv.setUint32(22, entry.data.length, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true) // extra field length: no extra fields are written
    local.set(name, LOCAL_HEADER_BYTES)

    body.push(local, payload)
    bodyBytes += local.length + payload.length

    const cd = new Uint8Array(CENTRAL_HEADER_BYTES + name.length)
    const cv = new DataView(cd.buffer)
    cv.setUint32(0, SIG_CENTRAL, true)
    cv.setUint16(4, VERSION_MADE_BY, true)
    cv.setUint16(6, VERSION_DEFLATE, true)
    // Every field from here to the CRC is a verbatim copy of the local
    // header's. The format stores them twice and a reader may consult either;
    // a writer that lets the two drift produces an archive that extracts
    // differently depending on which half the tool trusts.
    cv.setUint16(8, FLAG_UTF8_NAMES, true)
    cv.setUint16(10, method, true)
    cv.setUint16(12, DOS_TIME_MIDNIGHT, true)
    cv.setUint16(14, DOS_DATE_1980_01_01, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, payload.length, true)
    cv.setUint32(24, entry.data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint16(30, 0, true) // extra field length
    cv.setUint16(32, 0, true) // file comment length
    cv.setUint16(34, 0, true) // disk number start — single-disk archives only
    // Internal attributes: bit 0 is an advisory "this entry is text" hint.
    // Left clear. Setting it would mean sniffing the content for text-ness,
    // and a guess that changed with the content would change the bytes for a
    // flag no reader is required to act on.
    cv.setUint16(36, 0, true)
    // External attributes: DOS attribute bits, because `VERSION_MADE_BY`
    // declares host 0. Clear means "ordinary file, no attributes".
    cv.setUint32(38, 0, true)
    cv.setUint32(42, localOffset, true)
    cd.set(name, CENTRAL_HEADER_BYTES)

    central.push(cd)
    centralBytes += cd.length
  }

  if (bodyBytes + centralBytes > MAX_U32) throw new Error('zip is too large without zip64')

  const eocd = new Uint8Array(EOCD_BYTES)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, SIG_EOCD, true)
  ev.setUint16(4, 0, true) // this disk's number
  ev.setUint16(6, 0, true) // the disk the central directory starts on
  ev.setUint16(8, entries.length, true) // central directory records on this disk
  ev.setUint16(10, entries.length, true) // …and in total; equal, single-disk
  ev.setUint32(12, centralBytes, true)
  ev.setUint32(16, bodyBytes, true) // the central directory begins where the bodies end
  ev.setUint16(20, 0, true) // archive comment length

  return concat([...body, ...central, eocd], bodyBytes + centralBytes + EOCD_BYTES)
}
