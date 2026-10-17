import { writeScene } from './sceneWrite.js'
import { writeZip, type ZipEntry } from './zip.js'
import type { Scene } from '../core/types.js'

/**
 * The `.stst` container — the one place that knows a project file's layout
 * (design §6.2, plan P1 criteria 3/4/5/7).
 *
 * ## Why assembling lives here and not in the callers
 *
 * P1 criterion 7 requires the CLI and the site to emit **identical bytes** for
 * one scene. `writeZip` can only promise that for identical inputs; the inputs
 * are a list of entries in a meaningful order, so if the layout lived in the
 * callers, byte-identity would be two independently maintained lists agreeing
 * — a coordination problem rather than a function. `sceneWrite.ts` makes
 * exactly this argument one level down about key order, and the reason is the
 * same one: an agreement between two constructors that nothing guards is an
 * accident that holds until somebody reorders either one.
 *
 * So the layout, the entry order and the manifest are fixed here, and the
 * caller supplies only *what* goes in. Two callers handing the same members
 * over in different orders get the same bytes, which is a property of this
 * module and is asserted in `container.test.ts` rather than left as prose.
 *
 * ## It does not bake anything
 *
 * Mask baking is design §6.1 and belongs to the import path. Members arrive
 * here as bytes and leave as the same bytes; there is no image code in this
 * file and no place for any. The signature says so — `data` is a
 * `Uint8Array`, not an image, a canvas or a layer.
 *
 * ## What this module is not
 *
 * The reader. Opening a `.stst` is `containerRead.ts`, over `zipRead.ts`,
 * which is the same split `zip.ts`/`zipRead.ts` already uses; nothing here
 * parses. The layout vocabulary below is exported rather than private so that
 * the reader reads the layout *from the writer* rather than from a second copy
 * of it — a second copy is the coordination problem this module exists to
 * remove, and it would be worse between a writer and a reader than between two
 * callers, because the two would disagree about files already on disk.
 */

/* ------------------------------------------------------------- the vocabulary */

/**
 * The media type written into `mimetype`.
 *
 * Not registered with IANA and not going to be; the `x-` form is the
 * conventional spelling for exactly that case. Its job is identification, and
 * it only has to be a string nothing else uses.
 */
export const STST_MIMETYPE = 'application/x-stst'

/**
 * The manifest's format number, and the only forward-compatibility affordance
 * the container has.
 *
 * It is here because the alternative is not "add it later": a reader meeting
 * an archive laid out differently has to discover that *before* it has
 * mis-parsed `entries`, and absence can only ever be read as 1 by a reader
 * that was written knowing 1 existed. One number now buys that; nothing buys
 * it afterwards.
 *
 * `readStst` is the consumer, and it refuses any other value before it looks
 * at `entries` — that ordering is the whole reason the field exists, so it is
 * asserted in `containerRead.test.ts` against a manifest whose `entries` are
 * deliberately nonsense. A single integer, not major/minor: there is no
 * change to this layout that a reader written against version 1 could survive
 * by ignoring, so a "compatible" half of a version number would be a promise
 * nothing here can keep.
 */
export const MANIFEST_VERSION = 1

/**
 * The entry a `.stst` is identified by, and the two text members, in the order
 * they are written. Every archive begins with exactly these three.
 *
 * - **`mimetype` first.** This is the ODF and EPUB convention and it is not
 *   decoration: with the entry first and uncompressed, the media type sits at
 *   a fixed offset — 30 bytes of local header plus the 8-byte name — where
 *   `file(1)` and anything else sniffing magic bytes can read it without
 *   inflating a thing. Putting any entry ahead of it silently costs that and
 *   nothing else notices.
 *
 *   **The "and stored" half of the convention is load-bearing again**, and
 *   the record of why it stopped being so is worth keeping. Between
 *   2026-10-15 and 2026-10-17 `writeStst` stored every entry, so `mimetype`
 *   was special in *position* only and this docblock said the clause had gone
 *   vacuous. Design §6.2's case-E ruling of 2026-10-17 deflates everything
 *   but this entry, which restores the exception and with it the distinction:
 *   `mimetype` is now the one entry whose **method** is chosen for it, and
 *   the fixed-offset property is bought by that exception rather than by an
 *   archive-wide rule. Both clauses are asserted — position by
 *   `container.test.ts`'s entry-order tests, method by the same file's
 *   offset relation, which reads the media type at 30 + 8 bytes and cannot
 *   pass over a deflated first entry.
 * - **`scene.json` second.** Design §6.2's stated reason for choosing a real
 *   zip is "so anyone can `unzip` it and read `scene.json`"; it is the
 *   substance of the file and sits at the front of it.
 * - **`manifest.json` third.** It describes the archive, so it belongs with
 *   the other text member and ahead of the bulk — a reader after either of
 *   them reads neither past megabytes of mask data.
 *
 * P1 criterion 4 lists the container's contents as "`scene.json`, baked masks,
 * original sources, manifest". That sentence is a list of *what is in it*; the
 * relative order of the three it names is preserved here, with the manifest
 * pulled forward for the reason above and `mimetype` — which the criterion
 * does not mention — placed where the convention requires it.
 */
export const STST_ENTRY_ORDER = ['mimetype', 'scene.json', 'manifest.json'] as const

/** The roles of the three fixed entries; see {@link STST_ENTRY_ROLES}. */
type FixedRole = 'mimetype' | 'scene' | 'manifest'

/**
 * The manifest role of each of {@link STST_ENTRY_ORDER}, positionally.
 *
 * Written as a mapped type over that tuple rather than as a second `as const`
 * list, so the two cannot drift in length: adding a fourth fixed entry without
 * giving it a role is a compile error here rather than an `undefined` role
 * written into a manifest. The reader needs both halves — a name list alone
 * cannot tell it that `scene.json` is the scene — and taking them from here is
 * what keeps the writer and the reader on one vocabulary instead of two.
 */
type RolesFor<T extends readonly unknown[]> = { readonly [K in keyof T]: FixedRole }
export const STST_ENTRY_ROLES: RolesFor<typeof STST_ENTRY_ORDER> =
  ['mimetype', 'scene', 'manifest'] as const

/**
 * The member roles, **in the order their members are written**, each with the
 * directory it is placed in.
 *
 * The tuple is the roster and {@link MemberRole} derives from it, so a third
 * role cannot be added without choosing its position in the layout and its
 * directory in the same edit — the directory because `ROLE_DIR` is a
 * `Record<MemberRole, string>` and would stop compiling, the position because
 * the tuple is where the new role has to be typed. Pointing an `AssertNever`
 * at a union declared next to the tuple would have proved only that the
 * derivation ran twice.
 *
 * Masks before sources because masks are what the renderer consumes: a reader
 * that wants to display the project needs them and may never need the
 * originals at all.
 */
export const MEMBER_ROLES = ['mask', 'source'] as const

/** What a caller may put in a `.stst` beside the scene. */
export type MemberRole = typeof MEMBER_ROLES[number]

/**
 * Where each role's members live.
 *
 * Directories rather than a flat namespace with prefixed names, because a
 * baked mask and the source it was baked from can legitimately share a name —
 * `logo.png` in and `logo.png` out — and a flat layout would make that a
 * duplicate-entry error for no reason the author could act on.
 *
 * No directory *entries* are written for these, only names containing `/`.
 * Info-ZIP creates intermediate directories on extraction, `writeZip` emits no
 * directory records by design, and a directory entry would be a fourth thing
 * whose order and presence had to be pinned.
 *
 * Exported because the reader strips these prefixes back off. It does **not**
 * use them to decide a member's role — that comes from the manifest, or the
 * manifest would be decorative — it uses them to check that the manifest and
 * the placement agree, which is a relation only a module holding both can
 * state.
 */
export const ROLE_DIR: Record<MemberRole, string> = {
  mask: 'masks/',
  source: 'sources/',
}

/** The role names the manifest uses, which is the member roles plus the fixed three. */
export type ManifestRole = MemberRole | FixedRole

export interface StstMember {
  /**
   * A **bare file name**, no directory part. The container decides placement —
   * see {@link ROLE_DIR} — so a name carrying its own path would either land
   * somewhere the container did not choose or collide with one that did.
   */
  readonly name: string
  readonly role: MemberRole
  /** The member's bytes, carried verbatim. Nothing here decodes or re-encodes them. */
  readonly data: Uint8Array
}

/* ----------------------------------------------------------------- assembling */

/**
 * Reject the member names the container cannot place.
 *
 * `writeZip` already refuses empty names, backslashes, absolute names and
 * duplicates, and those stay its business — they are properties of a zip
 * entry. These are properties of a *member*, which is a narrower thing: the
 * name is one path segment under a directory this module chose.
 *
 * Each message names the shape the caller should pass instead, and in every
 * case that is also the cheapest way to go green. A guard whose lazy fix is
 * the wrong one gets satisfied wrongly — there is no edit here that makes the
 * throw stop and leaves the archive worse, because "drop the directory part"
 * is both the shortest route and the correct one.
 */
function checkMemberName(name: string): void {
  if (name === '') throw new Error('.stst member name is empty; pass a bare file name')
  if (name.includes('/')) {
    throw new Error(
      `.stst member name contains a directory: ${name}. Pass a bare file name — the ` +
      `container places masks under ${ROLE_DIR.mask} and sources under ${ROLE_DIR.source}.`,
    )
  }
  if (name === '.' || name === '..') {
    // `masks/..` is the container's own parent once extracted. Info-ZIP warns
    // and rewrites it; plenty of other tools do not, and a project file that
    // writes outside its own directory is not a thing to ship.
    throw new Error(`.stst member name is a path segment, not a file: ${name}`)
  }
}

/**
 * Order members within a role by name, in UTF-16 code-unit order.
 *
 * Relational `<` on strings is code-unit order and is locale-independent,
 * which is the same property `LC_ALL=C` buys a shell pipeline and the same
 * reason `sceneWrite.ts` uses a bare `.sort()`. `localeCompare` would make the
 * archive's bytes depend on the machine, which is the one thing this module
 * exists to prevent.
 *
 * `writeZip`'s docblock argues against sorting *inside the writer*, and this
 * does not contradict it: the objection there is that sorting would reorder a
 * deliberate sequence handed down by a caller that meant it. Here there is no
 * such sequence to destroy — two masks have no inherent order, so leaving it
 * to the caller's array would make the bytes depend on the order a `Map` or a
 * layer panel happened to iterate in, and criterion 7 would be a coincidence.
 *
 * Equal names are left to `writeZip`'s duplicate check, which reports the
 * collision by its full archive path.
 */
function byName(members: readonly StstMember[]): StstMember[] {
  return [...members].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

/**
 * Assemble a `.stst` from a scene and its already-baked members.
 *
 * The scene goes through {@link writeScene} and nowhere else: this module has
 * no `JSON.stringify` of a `Scene` in it, so a scene `writeScene` refuses —
 * one carrying a key that is on no roster — fails here rather than becoming an
 * archive with a quietly reduced `scene.json` inside it.
 *
 * ## `mimetype` is stored, everything else is deflated
 *
 * Design §6.2 case E, ruled 2026-10-17. The method is a function of the
 * entry's **role** and of nothing else — never of the payload, which is the
 * input-dependence criterion 7 exists to remove and which
 * `container.test.ts` sweeps a 0-to-512-KiB matrix to refute.
 *
 * ### The ruling this replaced, kept because it was true and is now false
 *
 * From 2026-10-15 to 2026-10-17 **every entry was stored**, and the argument
 * was that criterion 7 asks for identical bytes from the CLI and the site
 * while deflating would make that rest on two engines' deflaters agreeing —
 * which they do not. That measurement stands and is the reason the criterion
 * itself had to change rather than the writer: `CompressionStream('deflate-raw')`
 * is byte-identical between Node 22.14.0 and Chromium 151 across nine
 * fixtures, and **Firefox 153 emits +59% while WebKit 26 emits 10.7x**,
 * diverging at byte 0 or 1. All four round-trip exactly; none is wrong. The
 * Streams spec fixes no level, no strategy, no `memLevel` and no
 * `windowBits`, so Node and Chromium agree only because both wrap zlib at its
 * default 6, and nothing holds them there.
 *
 * **What changed is not that measurement but what it was defending.** Stored
 * protected byte-level guarantees — digests, size pins, "same scene, same
 * file" — and invariant 4 forbids the suite from asserting on those, so
 * stored was defending a property nothing is permitted to depend on. Against
 * that, the size cost was measured against a 5% threshold registered *before*
 * the measurement: **+0.195%** on a representative project (photo + logo +
 * GIF + masks, 2.44 MB) but **+27.4% (107,724 → 137,279 bytes)** on a
 * flat-graphics one. The threshold was crossed, the call went to Shaun, and
 * the engine-dependent output is accepted as a consequence.
 *
 * The measurement that made the cost concentrate where it does is worth
 * keeping, because it is the opposite of what the plan predicted: deflating
 * an already-compressed photo PNG makes it **larger**, not equal —
 * `sources/photo.png` went 2,234,956 stored against 2,235,641 deflated, since
 * deflate's stored-block framing is pure overhead on incompressible input.
 * The saving is entirely in `scene.json`, `manifest.json` and the baked
 * masks, which deflate by **18-65%** — and design §6.1 makes silhouette masks
 * the primary import path, so the compressible files are the common case.
 *
 * ### Why `mimetype` keeps the exception
 *
 * It is the ODF/EPUB convention and it costs **17 bytes**. Stored and first,
 * the media type sits at a fixed offset where `file(1)`, archive managers and
 * anything else sniffing magic can read it without inflating a thing.
 * `container.test.ts`'s `identifies itself from the first bytes of the file`
 * is its sensor, and it is the only assertion that sees `mimetype` stop being
 * stored **without reading a method field** — it reads the media type at
 * offset 30 + `'mimetype'.length`, which a deflated first entry cannot
 * satisfy.
 *
 * ### Criterion 7 is no longer discharged here
 *
 * Identical bytes across producers is unachievable under this ruling, and the
 * criterion was rewritten rather than quietly dropped. It is now discharged
 * by **there being exactly one writer**: `src/cli/index.ts` is the only
 * production caller of `writeStst`, `site/` has no `.stst` writer, and
 * `container.test.ts`'s `criterion 7 — one production producer of .stst
 * bytes` is the sensor that reddens the day a second one appears without
 * routing through here. That replacement is **weaker than byte equality** and
 * **weaker than the two-sided CLI-versus-site comparison** that was specified
 * in its place and then withdrawn as unbuildable; it is not equivalent to
 * either and is not more robust than either.
 */
export async function writeStst(
  scene: Scene,
  members: readonly StstMember[],
): Promise<Uint8Array> {
  for (const m of members) checkMemberName(m.name)

  const sceneText = writeScene(scene)

  // Placed before the manifest is built, because the manifest enumerates
  // these by their archive names and must not hold a second opinion about
  // what they are called.
  const placed: { readonly name: string; readonly role: ManifestRole; readonly data: Uint8Array }[] = []
  for (const role of MEMBER_ROLES) {
    for (const m of byName(members.filter(m => m.role === role))) {
      placed.push({ name: ROLE_DIR[role] + m.name, role, data: m.data })
    }
  }

  const [MIMETYPE, SCENE, MANIFEST] = STST_ENTRY_ORDER
  const [MIMETYPE_ROLE, SCENE_ROLE, MANIFEST_ROLE] = STST_ENTRY_ROLES

  /**
   * The manifest enumerates **every** entry including itself, which is what
   * makes "the manifest and the central directory list the same names" a
   * checkable relation rather than a convention. It carries no size and no
   * checksum: the central directory already holds both for every member, and
   * a second copy is a second thing that can disagree. What the zip cannot say
   * is which member is the scene and which is a baked mask — the role — so
   * that is what this adds and all it adds.
   */
  const manifest = {
    stst: MANIFEST_VERSION,
    entries: [
      { name: MIMETYPE, role: MIMETYPE_ROLE },
      { name: SCENE, role: SCENE_ROLE },
      { name: MANIFEST, role: MANIFEST_ROLE },
      ...placed.map(p => ({ name: p.name, role: p.role })),
    ],
  }

  // Indented and newline-terminated for the same reason `writeScene`'s output
  // is: design §6.2 chose a real zip so that a human can `unzip -p` the thing
  // and read it, and the indenting is `JSON.stringify`'s own — ECMA-262
  // specifies the gap behaviour exactly, so cross-engine byte identity rests
  // on the spec rather than on an emitter of mine.
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`

  // The method is a function of the entry's **role** and of nothing else —
  // `mimetype` stored so the media type sits at a fixed offset, every other
  // entry deflated. Never chosen from the content: a method that depended on
  // what the bytes look like would make the archive's layout a function of its
  // payload rather than of its inputs, and `container.test.ts` sweeps a matrix
  // from 0 to 512 KiB across both compressibility arms to say so.
  const utf8 = new TextEncoder()
  const entries: ZipEntry[] = [
    { name: MIMETYPE, data: utf8.encode(STST_MIMETYPE), method: 'store' },
    { name: SCENE, data: utf8.encode(sceneText), method: 'deflate' },
    { name: MANIFEST, data: utf8.encode(manifestText), method: 'deflate' },
    ...placed.map((p): ZipEntry => ({ name: p.name, data: p.data, method: 'deflate' })),
  ]

  return writeZip(entries)
}
