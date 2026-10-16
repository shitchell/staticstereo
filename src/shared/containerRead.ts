import {
  MANIFEST_VERSION,
  MEMBER_ROLES,
  ROLE_DIR,
  STST_ENTRY_ORDER,
  STST_ENTRY_ROLES,
  STST_MIMETYPE,
  type MemberRole,
  type StstMember,
} from './container.js'
import { writeScene } from './sceneWrite.js'
import { readZip } from './zipRead.js'
import type { Scene } from '../core/types.js'

/**
 * Opening a `.stst` — the inverse of `container.ts` (design §6.2, plan P1
 * criteria 2/4).
 *
 * The same split as `zip.ts`/`zipRead.ts`, and for the same reason: the writer
 * is a specification and the reader is a parser, and a file that is both is a
 * file where a change to one half is indistinguishable from a change to the
 * format. Every name, order and role this module expects is **imported from
 * the writer**, so there is no second copy of the layout to go stale; what is
 * written here is only the checking.
 *
 * ## Why so much of this file is refusals
 *
 * Plan §1.2k: a wrong layout ruins the artifact. A `.stst` is the user's
 * project — design §6.2 exists because masks are too big to live in a URL —
 * so it is often the only copy, and a reader that guesses turns a recoverable
 * error into silent destruction. The shapes below are therefore refused
 * loudly and by name rather than coped with:
 *
 * - no manifest, or one that is not readable JSON;
 * - a manifest format version this build does not know;
 * - a manifest and a central directory that name different entries, or the
 *   same entries in a different order;
 * - a member named twice, placed under a directory its role does not match,
 *   or given a role this build has no meaning for;
 * - a scene `writeScene` would refuse to save again.
 *
 * Each message names the entry it is about. "The archive is corrupt" sends the
 * author to a backup they may not have; "`masks/logo.png` is in the archive
 * and not in the manifest" tells them which part of their project to look at,
 * and tells whoever wrote the file what they got wrong.
 *
 * ## The manifest is load-bearing, deliberately
 *
 * A reader could recover every role from the directory the member sits in —
 * `masks/` means mask — and would then round-trip this repo's own archives
 * perfectly while never reading `manifest.json` at all. That reader is the one
 * this module is written not to be, because it makes the manifest decorative:
 * it cannot detect a version it does not understand (it never looks), and it
 * silently disagrees with any producer whose manifest says something else.
 * So **role comes from the manifest**, and {@link ROLE_DIR} is used only to
 * check that the two agree.
 *
 * ## What the manifest deliberately does not carry, and what that cost here
 *
 * `31baea5` chose to store no sizes and no checksums, on the argument that the
 * central directory already holds both and a second copy is a second thing
 * that can disagree. Measured from this side, the absence cost nothing:
 * `readZip` inflates every member and verifies its CRC-32 before this module
 * sees it, so there is no point at which a size from the manifest could have
 * been checked against anything not already checked. The decision would start
 * to cost something only for a reader that wanted to list or validate members
 * *without* inflating them — a lazy or streaming reader — and this is not one,
 * because `.stst` is read whole into a project.
 */

export interface StstArchive {
  /**
   * The scene, as `scene.json` held it.
   *
   * Guaranteed to be a scene {@link writeScene} accepts — see
   * {@link readScene} — which is a weaker guarantee than either validator in
   * `src/cli/` or `site/` makes and is the strongest one available from
   * `src/shared/`, where neither of those can be reached.
   */
  readonly scene: Scene
  /**
   * Masks then sources, each sorted by name: the archive's own order, which
   * the writer fixes. Shaped as {@link StstMember} so that what comes out of
   * `readStst` can go straight back into `writeStst`.
   */
  readonly members: readonly StstMember[]
}

/**
 * Strict, for the reason `zipRead.ts` is strict about entry names: a manifest
 * decoded with replacement characters is an unreadable manifest that looks
 * readable, and the lenient decoder makes that failure arrive later and
 * somewhere else.
 */
const UTF8_STRICT = new TextDecoder('utf-8', { fatal: true })

/** One `entries[]` row, after shape checking and before cross-checking. */
interface ManifestEntry {
  readonly name: string
  readonly role: string
}

function isBag(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Parse `manifest.json` and check the format version **before anything reads
 * `entries`**.
 *
 * The ordering is the point of the version field, not a detail of it. A reader
 * that validated the entry list first would have interpreted a future layout's
 * entries — under this layout's rules — before discovering it could not read
 * them, and whatever it concluded in the meantime is the thing §1.2k says must
 * not happen quietly.
 *
 * The lazy way to make a version-2 file load is to delete the comparison, and
 * nothing in a message can make that expensive. What a message *can* do is
 * make the correct route obvious to whoever hits it, so it names both versions
 * and says which program is behind: a reader meeting a newer file needs
 * updating, and a writer that bumped the number needs this module taught the
 * older shape. `containerRead.test.ts` is the sensor that notices the
 * comparison going missing.
 */
function readManifest(bytes: Uint8Array): readonly ManifestEntry[] {
  let text: string
  try {
    text = UTF8_STRICT.decode(bytes)
  } catch (cause) {
    throw new Error('.stst manifest.json is not valid UTF-8', { cause })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (cause) {
    throw new Error('.stst manifest.json is not valid JSON', { cause })
  }
  if (!isBag(parsed)) {
    throw new Error(`.stst manifest.json must be a JSON object, got ${Array.isArray(parsed) ? 'an array' : typeof parsed}`)
  }

  const version = parsed['stst']
  if (version !== MANIFEST_VERSION) {
    const found = typeof version === 'number' ? `version ${version}` : `${JSON.stringify(version)}, which is not a version number`
    throw new Error(
      `.stst manifest.json declares ${found}; this build reads manifest version ` +
      `${MANIFEST_VERSION} only. A higher version means the file was written by a newer ` +
      `staticstereo and this one needs updating rather than persuading — nothing below ` +
      `this line can be trusted to mean what it says under another layout.`,
    )
  }

  const entries = parsed['entries']
  if (!Array.isArray(entries)) {
    throw new Error(
      '.stst manifest.json has no "entries" array. It enumerates every entry in the ' +
      'archive, itself included, and without it there is nothing to check the archive against.',
    )
  }

  return entries.map((e, i): ManifestEntry => {
    if (!isBag(e) || typeof e['name'] !== 'string' || typeof e['role'] !== 'string') {
      throw new Error(`.stst manifest.json entries[${i}] is not a {name, role} pair: ${JSON.stringify(e)}`)
    }
    return { name: e['name'], role: e['role'] }
  })
}

/**
 * Hold the manifest's list and the central directory's list to being one list.
 *
 * This is the relation the manifest's *absence* of sizes and checksums makes
 * load-bearing: names in order are the only thing the two halves both state,
 * so they are the only place a disagreement can be detected at all. The three
 * ways they can differ get three messages, because the caller's next move
 * differs — an entry only the archive has may be a member someone added by
 * hand, an entry only the manifest has is usually a member someone deleted by
 * hand, and a pure reordering is a manifest that was edited without re-zipping.
 *
 * `directories` is checked here rather than ignored: `readZip` surfaces
 * directory records separately, the writer emits none, and the manifest cannot
 * name them. Dropping them silently would leave a record in the file that no
 * part of this module accounts for, which is the hole a smuggled member fits
 * through.
 */
function checkNamesAgree(
  manifest: readonly ManifestEntry[],
  archived: readonly string[],
  directories: readonly string[],
): void {
  if (directories.length > 0) {
    throw new Error(
      `.stst holds directory records the manifest cannot name: ${directories.join(', ')}. ` +
      `The container writes member names containing "/" and no directory entries, so an ` +
      `archive with them was built by something else and may differ in ways this reader ` +
      `cannot see. Re-zip without directory entries.`,
    )
  }

  const seen = new Set<string>()
  for (const e of manifest) {
    if (seen.has(e.name)) throw new Error(`.stst manifest.json names ${e.name} twice; a member appears once`)
    seen.add(e.name)
  }

  const inArchive = new Set(archived)
  const missing = manifest.filter(e => !inArchive.has(e.name)).map(e => e.name)
  if (missing.length > 0) {
    throw new Error(`.stst manifest.json names ${missing.join(', ')}, which the archive does not contain`)
  }
  const extra = archived.filter(n => !seen.has(n))
  if (extra.length > 0) {
    throw new Error(`.stst contains ${extra.join(', ')}, which manifest.json does not name`)
  }
  // Same set, so any difference left is order. Reported as the first position
  // that differs: an archive whose manifest lists the right members in the
  // wrong order is a manifest that was edited by hand, and the place it
  // diverges is the thing to look at.
  for (let i = 0; i < manifest.length; i++) {
    if (manifest[i]!.name !== archived[i]) {
      throw new Error(
        `.stst manifest.json lists the archive's entries in a different order: entry ${i} is ` +
        `${manifest[i]!.name} in the manifest and ${String(archived[i])} in the archive`,
      )
    }
  }
}

/**
 * Check the three fixed entries, which are the only ones whose name *and* role
 * the layout fixes.
 *
 * Position is checked, not just presence. `mimetype` first and stored is what
 * puts the media type at a fixed offset for anything sniffing magic bytes —
 * `container.ts` sets out the ODF/EPUB argument — and a reader that accepted
 * the three in any order would let that property rot with nothing to notice.
 */
function checkFixedEntries(manifest: readonly ManifestEntry[]): void {
  for (let i = 0; i < STST_ENTRY_ORDER.length; i++) {
    const got = manifest[i]
    const name = STST_ENTRY_ORDER[i]!
    const role = STST_ENTRY_ROLES[i]!
    if (got === undefined || got.name !== name || got.role !== role) {
      throw new Error(
        `.stst must begin with ${STST_ENTRY_ORDER.join(', ')} — entry ${i} should be ` +
        `${name} with role ${role}, and is ${got === undefined ? 'absent' : `${got.name} with role ${got.role}`}`,
      )
    }
  }
}

function isMemberRole(role: string): role is MemberRole {
  return (MEMBER_ROLES as readonly string[]).includes(role)
}

/**
 * Turn one manifest row plus its archive bytes into a member.
 *
 * The role is the manifest's, and the directory is then *checked* against it
 * rather than consulted to find it. The two orderings look alike and are not:
 * deriving the role from the prefix makes an archive whose manifest disagrees
 * load silently as something other than what it says it is, which for a baked
 * mask versus an original source means the editor re-bakes the wrong file.
 */
function toMember(entry: ManifestEntry, data: Uint8Array): StstMember {
  if (!isMemberRole(entry.role)) {
    const known = [...STST_ENTRY_ROLES, ...MEMBER_ROLES].join(', ')
    throw new Error(
      `.stst manifest.json gives ${entry.name} the role "${entry.role}", which this build has no ` +
      `meaning for (it knows ${known}). A role it does not know is a member it cannot place, and ` +
      `a .stst carrying one should have declared a manifest version this build would refuse.`,
    )
  }

  const dir = ROLE_DIR[entry.role]
  if (!entry.name.startsWith(dir)) {
    throw new Error(
      `.stst manifest.json calls ${entry.name} a ${entry.role}, but a ${entry.role} is placed ` +
      `under ${dir}. The manifest and the layout disagree about this member, and which of the ` +
      `two is right is not something this reader can decide.`,
    )
  }

  const name = entry.name.slice(dir.length)
  if (name === '' || name.includes('/')) {
    throw new Error(
      `.stst member ${entry.name} is not a bare file name under ${dir}; the container places ` +
      `every member one segment deep, and a name it could not have written is one it cannot write back`,
    )
  }

  return { name, role: entry.role, data }
}

/**
 * Parse `scene.json`, and refuse a scene this repo could not save again.
 *
 * There is no `Scene` validator reachable from `src/shared/` — the CLI's lives
 * in `src/cli/` and the site's in `site/`, and the purity rule keeps both out
 * of here — so the cast below cannot be discharged by one. `writeScene` is the
 * check that *is* available, and it is a real one rather than a stand-in: it
 * walks the scene against the same three rosters the editor generates controls
 * from and refuses any key that is on none of them.
 *
 * Running it for its refusal and discarding its output is deliberate. A reader
 * that handed back a scene the writer will not accept does not avoid the
 * error, it defers it to the next save — by which time the author has built an
 * hour of work on top of a project that cannot be written, which is the §1.2k
 * failure with a delay on it.
 *
 * The limit of this, stated rather than implied: it checks shape and key
 * rosters, not values. A `depth` of `"banana"` passes here and is caught by
 * whichever validator the caller feeds the scene to next.
 */
function readScene(bytes: Uint8Array): Scene {
  let parsed: unknown
  try {
    parsed = JSON.parse(UTF8_STRICT.decode(bytes))
  } catch (cause) {
    throw new Error('.stst scene.json is not valid UTF-8 JSON', { cause })
  }
  const scene = parsed as Scene
  try {
    writeScene(scene)
  } catch (cause) {
    throw new Error(
      `.stst scene.json holds a scene this build cannot write back, so opening it would ` +
      `produce a project that could not be saved: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    )
  }
  return scene
}

/**
 * Read a `.stst` held in memory.
 *
 * Deliberately whole-archive and in memory, matching `readZip`: a project file
 * is opened to be edited, so every member is wanted, and a lazy reader would
 * buy nothing while making the CRC check optional.
 */
export async function readStst(archive: Uint8Array): Promise<StstArchive> {
  const { files, directories } = await readZip(archive)

  const byName = new Map(files.map(f => [f.name, f]))
  const manifestFile = byName.get(STST_ENTRY_ORDER[2])
  if (manifestFile === undefined) {
    throw new Error(
      `.stst has no ${STST_ENTRY_ORDER[2]} entry, so it is not a project file this build can open. ` +
      `Every .stst enumerates its own contents; an archive laid out like one but without the ` +
      `manifest may have been assembled by something that does not know the format.`,
    )
  }

  const manifest = readManifest(manifestFile.data)
  checkNamesAgree(manifest, files.map(f => f.name), directories)
  checkFixedEntries(manifest)

  const mimetype = byName.get(STST_ENTRY_ORDER[0])!
  let declared: string
  try {
    declared = UTF8_STRICT.decode(mimetype.data)
  } catch (cause) {
    throw new Error(`.stst ${STST_ENTRY_ORDER[0]} is not valid UTF-8, so it names no media type`, { cause })
  }
  if (declared !== STST_MIMETYPE) {
    throw new Error(
      `.stst declares the media type ${JSON.stringify(declared)} and not ${JSON.stringify(STST_MIMETYPE)}; ` +
      `this is a zip archive shaped like a project file but identifying itself as something else`,
    )
  }

  const members: StstMember[] = []
  for (let i = STST_ENTRY_ORDER.length; i < manifest.length; i++) {
    const entry = manifest[i]!
    members.push(toMember(entry, byName.get(entry.name)!.data))
  }

  return { scene: readScene(byName.get(STST_ENTRY_ORDER[1])!.data), members }
}
