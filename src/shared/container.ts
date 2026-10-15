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
 * The reader. Opening a `.stst` is `zipRead.ts` plus whatever consumes the
 * manifest; nothing here parses. `STST_ENTRY_ORDER` and `MANIFEST_VERSION`
 * are exported so that the reader reads the layout from the writer rather
 * than from a second copy of it.
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
 * Nothing reads it today — the reader half is a separate task — and that is
 * worth stating plainly rather than implying a consumer that does not exist.
 * It is here because the alternative is not "add it later": a reader meeting
 * an archive laid out differently has to discover that *before* it has
 * mis-parsed `entries`, and absence can only ever be read as 1 by a reader
 * that was written knowing 1 existed. One number now buys that; nothing buys
 * it afterwards.
 */
export const MANIFEST_VERSION = 1

/**
 * The entry a `.stst` is identified by, and the two text members, in the order
 * they are written. Every archive begins with exactly these three.
 *
 * - **`mimetype` first, and stored rather than deflated.** This is the ODF and
 *   EPUB convention and it is not decoration: with the entry first and
 *   uncompressed, the media type sits at a fixed offset — 30 bytes of local
 *   header plus the 8-byte name — where `file(1)` and anything else sniffing
 *   magic bytes can read it without inflating a thing. Deflating it, or
 *   putting any entry ahead of it, silently costs that and nothing else
 *   notices.
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
const MEMBER_ROLES = ['mask', 'source'] as const

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
 */
const ROLE_DIR: Record<MemberRole, string> = {
  mask: 'masks/',
  source: 'sources/',
}

/** The role names the manifest uses, which is the member roles plus the fixed three. */
type ManifestRole = MemberRole | 'mimetype' | 'scene' | 'manifest'

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
 * Every member is deflated except `mimetype`. Masks and sources are usually
 * already-compressed image data, where deflate buys a fraction of a percent
 * and costs the same, but the alternative is choosing the method from the
 * content — and a method that depends on what the bytes look like is how an
 * archive's layout stops being a function of its inputs. `mimetype` is the one
 * exception, and it is a requirement of the convention rather than a judgement
 * about its contents.
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
      { name: MIMETYPE, role: 'mimetype' },
      { name: SCENE, role: 'scene' },
      { name: MANIFEST, role: 'manifest' },
      ...placed.map(p => ({ name: p.name, role: p.role })),
    ],
  }

  // Indented and newline-terminated for the same reason `writeScene`'s output
  // is: design §6.2 chose a real zip so that a human can `unzip -p` the thing
  // and read it, and the indenting is `JSON.stringify`'s own — ECMA-262
  // specifies the gap behaviour exactly, so cross-engine byte identity rests
  // on the spec rather than on an emitter of mine.
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`

  const utf8 = new TextEncoder()
  const entries: ZipEntry[] = [
    { name: MIMETYPE, data: utf8.encode(STST_MIMETYPE), method: 'store' },
    { name: SCENE, data: utf8.encode(sceneText), method: 'deflate' },
    { name: MANIFEST, data: utf8.encode(manifestText), method: 'deflate' },
    ...placed.map((p): ZipEntry => ({ name: p.name, data: p.data, method: 'deflate' })),
  ]

  return writeZip(entries)
}
