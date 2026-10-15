/**
 * The editor's keybindings: what a key does, as data.
 *
 * Design §11 row 5 budgets *"keybindings — a map — one entry"*, and §11 says
 * why a registry gets a test rather than a comment: *"without that, 'moving a
 * panel costs a declaration' is unverified until the first time it is false."*
 *
 * **This module declares bindings. It does not dispatch them.** There is no
 * `keydown` listener here and no `preventDefault`; the shell (P3b) reads this
 * table and decides what to do with a `KeyboardEvent`. The split is the whole
 * point of the row: a key that is a literal inside a handler costs a code
 * change to move, cannot be printed in a help panel, and cannot be checked
 * against a second binding that claims the same chord.
 *
 * ## The one binding the design names, and the only floor worth having
 *
 * Design §5.1: *"One key hides all chrome."* That is the only keybinding named
 * anywhere in the design, so it is this registry's floor, and
 * `keybindings.test.ts` reads the sentence out of the design document rather
 * than trusting this paragraph. {@link CHROME_BINDING} is that binding.
 *
 * {@link KeyBinding.hides} for it is **derived** from `panels.ts`'
 * {@link chromePanels}, which C-2 shipped for exactly this consumer. The
 * alternative was a hand-written list of panel names here, which is §9's named
 * non-check: *"a hand-written list of the places that do X goes stale silently
 * the day a second place does X"* — and the symptom would be a panel added
 * next year that stays on screen in the one mode whose entire purpose is that
 * nothing is.
 *
 * The derivation also supplies the vacuity floor without a number in it.
 * §9: *"a numeric floor chosen from today's count is a check — it is not."*
 * The floor here is a **relation**: the hidden set is a non-empty **strict**
 * subset of `PANEL_IDS`. Both ends can fail — a registry that hides nothing
 * makes the key inert, and one that hides every panel leaves nothing for the
 * author to fuse — and neither end is a count anybody typed.
 *
 * **`chrome` is not visibility, and this module must not turn it into
 * visibility.** Design §11: *"the registry stays complete — that is R6 — and
 * per-mode visibility sets select from it."* `panels.ts`' `PanelInfo.chrome`
 * records what a panel *is*; which panels are on screen right now is state the
 * shell holds. This registry says which panels the key *addresses*, not which
 * are up.
 *
 * ## Why the prototype-chain clause is the live case here
 *
 * A keybinding table is a lookup keyed by a string **an attacker, a stuck
 * keyboard or an unusual layout chooses** — a `KeyboardEvent.key` value, not a
 * name from our own vocabulary. `KEYBINDINGS['constructor']` on a bare index
 * is the `Object` function, which is `!== undefined`, so a dispatcher would
 * hand it to the command runner. That is `site/chromedom.ts:189`'s defect
 * (E8 / R-l, closed by C-2 at `fb974d3`) in a new file, and of the eight
 * registries in this cluster this is the one where it is reachable from real
 * input rather than hypothetically. Every reader below uses `Object.hasOwn`,
 * and every comparison uses `Object.keys` / `Object.hasOwn` and never
 * `key in table`.
 *
 * ## Conflict detection: guarded, and why
 *
 * The registry is keyed by **binding id**, so two entries carrying the same
 * {@link KeyBinding.key} collide on a *field*, which a record cannot see — the
 * ids are distinct and nothing overwrites anything. That is B-4's `LAYER_KEYS`
 * duplicate defect in the shape this registry has it, and the symptom is the
 * one B-4 recorded: one of two commands **silently never fires**, whichever
 * the dispatcher reaches second. {@link conflictingChords} is the sensor and
 * {@link composeKeybindings} refuses to build a table that has one.
 *
 * It is guarded rather than left open because the key space is contested by
 * construction — P4 wants arrows and `Delete`, P6 wants the transport keys,
 * P3b wants undo — and every one of those lands as a second table composed
 * with this one, which is precisely the case a per-file review cannot see.
 *
 * ## `KeyboardEvent.key`, not `.code`, and that is a decision
 *
 * {@link KeyBinding.key} holds a **`KeyboardEvent.key`** value. `.key` is
 * layout-dependent and `.code` is physical position, and for every binding
 * this registry has that dependence is the behaviour you want: the bindings
 * are *mnemonic* (`p` for the presentation the page already calls `present`)
 * or *named* (`Escape`), so a reader who presses the cap printed in the
 * caption gets the command on any layout. A **positional** binding — a
 * WASD-shaped nudge — is the case `.key` gets wrong, and it is recorded as a
 * vacancy in {@link ABSENT_BINDINGS} rather than solved here, because the
 * phase that wants one owns the choice.
 *
 * ## There is no barrel
 *
 * For `panels.ts`', `layout.ts`', `controlspec.ts`', `operations.ts`',
 * `shadings.ts`' and `views.ts`' recorded reason: a barrel is a second place
 * every registry has to be registered, which is the cost §11 budgets at one.
 * A direct `./keybindings.js` import also keeps this module inside
 * `site/query.test.ts`'s cone walk, which resolves only a relative specifier
 * with no `/` in it.
 */
import type { AssertNever } from '../src/core/index.js'
import { chromePanels } from './panels.js'

/**
 * The modifiers a chord may carry.
 *
 * **No shipped binding uses one**, and that is design §5.1's word: *"One key
 * hides all chrome."* The vocabulary exists anyway because §11 row 5 budgets a
 * new binding at **one entry**, and a registry with no modifier field makes
 * the first binding that needs one — `ctrl+z`, already named in
 * {@link ABSENT_BINDINGS} — cost a shape change in this file plus an edit at
 * every reader. Declaring the axis now is what keeps that budget true.
 *
 * Exercised by {@link chordId} rather than by an entry, which is the honest
 * runtime witness available: every member is driven through the function that
 * consumes it, instead of a binding being invented so that a member has an
 * occupant.
 */
export type Modifier = 'ctrl' | 'meta' | 'alt' | 'shift'

/**
 * The modifiers, in the order {@link chordId} writes them.
 *
 * Not alphabetical: this is the order the platforms print, and a canonical
 * spelling is only useful if it is the one a human would have typed.
 * `ctrl` before `meta` because the two are the same slot on different
 * platforms and `ctrl` is the one this codebase can test.
 */
export const MODIFIERS = ['ctrl', 'meta', 'alt', 'shift'] as const

type _NoModifierMissing = AssertNever<Exclude<Modifier, typeof MODIFIERS[number]>>
type _NoModifierExtra = AssertNever<Exclude<typeof MODIFIERS[number], Modifier>>

/**
 * The bindings this registry declares.
 *
 * Declared as a union **and** as {@link BINDING_IDS}, tied by the
 * `AssertNever` pair below, for the reason `anim/track.ts:204-208` records for
 * `SUMMED_CHANNELS` and `panels.ts` repeats: the compile-time guard is
 * enforced by `npm run typecheck` alone, so the tuple is what lets `npm test`
 * witness it. Neither declaration is derived from the other, or the pair would
 * be a restatement.
 *
 * **Two, and the second is not padding.** `hide-chrome` is design §5.1's.
 * `show-chrome` is the gesture the product already ships — `site/main.ts`
 * compares `event.key !== 'Escape'` and `site/index.html` prints
 * `<kbd>Esc</kbd>` — and both of those files are deleted by the teardown. The
 * same argument ruling R-p made for `DEPTH_SOURCES`: without a registry behind
 * it, a shipped decision leaves the product and nothing in `npm test` notices.
 */
export type BindingId = 'hide-chrome' | 'show-chrome'

/** The bindings, in the order an author meets them: hide, then come back. */
export const BINDING_IDS = ['hide-chrome', 'show-chrome'] as const

type _NoBindingMissing = AssertNever<Exclude<BindingId, typeof BINDING_IDS[number]>>
type _NoBindingExtra = AssertNever<Exclude<typeof BINDING_IDS[number], BindingId>>

/**
 * Design §5.1's binding, by name.
 *
 * A constant rather than a string at each reader, so the one binding the
 * design actually names is reachable without anybody spelling it again, and so
 * {@link chromeBindingInfo} has something to resolve. Annotated
 * {@link BindingId}, which makes a value naming a binding that does not exist
 * unrepresentable.
 */
export const CHROME_BINDING: BindingId = 'hide-chrome'

/** What {@link KEYBINDINGS} records about one binding. */
export interface KeyBinding {
  /**
   * The binding's id.
   *
   * Mirrors the key, as `PanelInfo.panel`, `FitModeInfo.mode`, `Operation.id`,
   * `ShadingInfo.shading` and `ViewInfo.view` do: a registry hands out values,
   * and a value that does not know its own name forces every caller to carry
   * the pair. Typed `string` and not {@link BindingId} so a registration test
   * can declare an entry without widening the union; the mirroring is checked
   * at run time instead, over every table a reader is handed.
   */
  readonly binding: string
  /**
   * The `KeyboardEvent.key` value, verbatim — `'Escape'`, not `'Esc'`.
   *
   * `.key` and not `.code`; see this module's header for the argument and
   * {@link ABSENT_BINDINGS} for the case it gets wrong.
   */
  readonly key: string
  /**
   * The modifiers held with it. See {@link Modifier}.
   *
   * `readonly string[]` and not `readonly Modifier[]`, for
   * {@link KeyBinding.binding}'s reason — a registration test must be able to
   * register a chord without widening the vocabulary — and
   * {@link auditKeybindings} is what complains about a modifier nobody
   * recognises. Order is not significant: {@link chordId} normalises it, which
   * is what stops two spellings of one chord from being two chords.
   */
  readonly modifiers: readonly string[]
  /**
   * What to print in a `<kbd>`.
   *
   * Separate from {@link KeyBinding.key} because the two genuinely differ and
   * the product has already decided one of them: `site/index.html` prints
   * `<kbd>Esc</kbd>` while `site/main.ts` matches `'Escape'`. Deriving the
   * caption from the key would either change what the page shows or require a
   * lookup table of exceptions, which is a second registry nobody asked for.
   */
  readonly caption: string
  /** Human-facing name for the command — a help panel row, a menu item. */
  readonly label: string
  /**
   * Why this binding exists and why it is this key, in the design's and the
   * page's own terms. §2.3: a constant with no recorded reason is a review
   * failure, and a bare key name would be exactly that.
   */
  readonly reason: string
  /**
   * The panels this binding hides, or empty.
   *
   * Derived from {@link chromePanels} for the chrome binding — never typed out
   * — which is what makes the set track `PANELS` instead of going stale. See
   * {@link hiddenChrome}.
   *
   * `readonly string[]` rather than `readonly PanelId[]` for
   * {@link KeyBinding.binding}'s reason; {@link auditKeybindings} checks the
   * names against the panel vocabulary its caller supplies.
   */
  readonly hides: readonly string[]
  /**
   * Whether the binding fires while a text field has focus.
   *
   * A **declaration**, not dispatch: the shell reads it, and without it the
   * rule lands inside the handler, which is the thing §11 row 5 exists to
   * prevent. It is load-bearing for a bare-letter binding — `p` must not hide
   * the chrome in the middle of typing a layer name into the inspector, and
   * `Escape` must leave a textarea's edit alone before it is a chrome gesture.
   */
  readonly whileTyping: boolean
}

/**
 * A table of bindings, keyed by id.
 *
 * Keyed by `string` and not by {@link BindingId}, which is what every reader
 * takes. Two reasons, both load-bearing: a later phase composes its own table
 * in without widening this file's union (see {@link composeKeybindings}), and
 * a registration test must be able to register an entry without editing this
 * file. The *shipped* registry is still total over the union — see
 * {@link KEYBINDINGS}.
 */
export type KeyBindingTable = Readonly<Record<string, KeyBinding>>

/**
 * The panels design §5.1's "one key hides all chrome" hides.
 *
 * A thin forward to `panels.ts`' {@link chromePanels}, and the thinness is the
 * point: it is the **one** place this module decides what "all chrome" means,
 * and it decides it by asking the registry that knows. C-2 shipped
 * `chromePanels()` for this consumer precisely so that this file would not
 * contain a list of panel names.
 *
 * A function rather than a constant so a caller gets the live answer. The
 * entry in {@link KEYBINDINGS} is necessarily a snapshot taken at module load
 * — an object literal cannot be anything else — and
 * {@link auditKeybindings} is what notices if a snapshot and the live set ever
 * disagree, because the chrome set it checks against is supplied by its
 * caller rather than read from here.
 */
export function hiddenChrome(): readonly string[] {
  return chromePanels()
}

/**
 * The editor's keybindings.
 *
 * `Record<BindingId, KeyBinding>` **by annotation**, which is the registry's
 * compile-time guard: a third member of {@link BindingId} is an error here
 * whose only honest fix is to say which key it is, what it does and why. A
 * `Record<string, …>` would have accepted the widened union in silence.
 *
 * It is a plain object literal, so `Object.prototype` is behind it and
 * `KEYBINDINGS['constructor']` answers with the `Object` function. That is
 * deliberate and not an oversight: the annotation above is only available on a
 * literal, and the guard that survives the `{...KEYBINDINGS}` the shell will
 * eventually write is the one at the reader anyway (E8 / R-l).
 */
export const KEYBINDINGS: Record<BindingId, KeyBinding> = {
  'hide-chrome': {
    binding: 'hide-chrome',
    key: 'p',
    modifiers: [],
    caption: 'P',
    label: 'Hide all chrome',
    reason:
      'Design §5.1\'s only named keybinding: "One key hides all chrome." It is the entry half of ' +
      'a mode the product already ships — `site/present.ts`\'s `?present=1`, whose only entry ' +
      'today is the `present ⤢` button — so the binding closes a gap rather than inventing a ' +
      'mode. `p` is mnemonic for that flag\'s own name, which is the spelling used by the URL ' +
      'parameter, the module and the button label, so the reason the key is this key is ' +
      'checkable against the repository rather than against taste. A bare letter rather than a ' +
      'chord because §5.1 says "one key", and `whileTyping: false` is what makes a bare letter ' +
      'safe in an editor whose R6 requirement fills it with text inputs. `Tab` — the convention ' +
      'in every desktop tool in this class, including the Photopea §5.1 names as the reference ' +
      '— is refused in `ABSENT_BINDINGS` for an argument that is about the browser, not about ' +
      'the gesture.',
    hides: chromePanels(),
    whileTyping: false,
  },
  'show-chrome': {
    binding: 'show-chrome',
    key: 'Escape',
    modifiers: [],
    caption: 'Esc',
    label: 'Show the chrome again',
    reason:
      'The way back, and the one binding in this table that is not a new decision: it ships ' +
      'today. `site/main.ts` matches `event.key !== \'Escape\'` on `window` and `site/index.html` ' +
      'prints "presentation mode · <kbd>Esc</kbd> to leave", with the recorded argument that "a ' +
      'paragraph rather than a button: Escape is the gesture, and a button here would be a ' +
      'second control to hide." Registering it is what stops the teardown from deleting both ' +
      'those files and taking the only written record of the decision with them — ruling R-p\'s ' +
      'argument for `DEPTH_SOURCES`, applied to a key. The cost is recorded rather than hidden: ' +
      'Escape is also the conventional cancel, so a P4 drag or a P6 scrub that wants to be ' +
      'cancellable will have to argue with this entry instead of quietly shadowing it, which is ' +
      'the whole reason `conflictingChords` exists.',
    hides: [],
    whileTyping: false,
  },
}

/* ------------------------------------------------------------------ *
 * Chords. One spelling, so two spellings cannot be two chords.
 * ------------------------------------------------------------------ */

/**
 * One canonical spelling for a chord: `ctrl+shift+z`, or `Escape`.
 *
 * **Normalising is what makes conflict detection work.** Two entries that
 * declare `['shift','ctrl']` and `['ctrl','shift']` are one chord; a
 * comparison over the raw arrays would call them two and let one of the two
 * commands silently never fire, which is the defect {@link conflictingChords}
 * exists to catch.
 *
 * Known modifiers come first in {@link MODIFIERS} order, then any the
 * vocabulary does not recognise, alphabetically, then the key. Unrecognised
 * modifiers are **kept rather than dropped**: dropping one would make
 * `hyper+z` and `z` the same chord and hide a collision, and naming it is
 * {@link auditKeybindings}' job, not this function's.
 *
 * Duplicates are collapsed, because `['alt','alt']` is one held key.
 */
export function chordId(chord: {
  readonly key: string
  readonly modifiers?: readonly string[]
}): string {
  const given = [...new Set(chord.modifiers ?? [])]
  const known: readonly string[] = MODIFIERS.filter(modifier => given.includes(modifier))
  const unknown = given.filter(modifier => !(MODIFIERS as readonly string[]).includes(modifier))
  return [...known, ...unknown.sort(), chord.key].join('+')
}

/* ------------------------------------------------------------------ *
 * Readers. `Object.hasOwn` at every one of them — E8 / R-l.
 * ------------------------------------------------------------------ */

/**
 * What this binding is, or `undefined` if it is not one.
 *
 * **`Object.hasOwn`, not a bare index and not `in`.** The table is an object
 * literal, so `KEYBINDINGS['constructor']` is the `Object` function and
 * `'toString' in KEYBINDINGS` is `true`; a dispatcher holding an id from a
 * stored keymap would be handed a value whose `key` and `label` are both
 * `undefined` and would bind nothing to nothing.
 *
 * `table` is a parameter so that a copy — the `{...KEYBINDINGS}` the shell
 * will write, or a composed table — is read by this same function rather than
 * by a second reader written for the occasion.
 */
export function bindingInfo(
  binding: string,
  table: KeyBindingTable = KEYBINDINGS,
): KeyBinding | undefined {
  if (!Object.hasOwn(table, binding)) return undefined
  return table[binding]
}

/**
 * The binding a chord fires, or `undefined`.
 *
 * **This is the reader a `keydown` handler actually wants**, and the reason
 * the prototype-chain clause is live rather than theoretical in this registry:
 * its argument is built from a `KeyboardEvent.key`, which the person at the
 * keyboard chooses. It walks `Object.keys` rather than indexing by the chord,
 * because the table is keyed by binding id and the chord is a field — the same
 * asymmetry {@link conflictingChords} exists for.
 *
 * Returns the **first** match in key order and does not resolve ambiguity;
 * {@link composeKeybindings} is what guarantees there is none to resolve.
 */
export function bindingForChord(
  chord: string,
  table: KeyBindingTable = KEYBINDINGS,
): KeyBinding | undefined {
  for (const id of Object.keys(table)) {
    const info = table[id]!
    if (chordId(info) === chord) return info
  }
  return undefined
}

/**
 * Design §5.1's binding, resolved through the registry.
 *
 * The runtime half of §F-6's pairing rule for {@link CHROME_BINDING}: the
 * annotation on that constant is enforced by `npm run typecheck` alone, so
 * without something that reads it at run time the guarantee is invisible to
 * `npm test` and therefore to the gate's test leg.
 */
export function chromeBindingInfo(table: KeyBindingTable = KEYBINDINGS): KeyBinding | undefined {
  return bindingInfo(CHROME_BINDING, table)
}

/**
 * The chords more than one binding claims, sorted and deduplicated.
 *
 * **B-4's `LAYER_KEYS` defect, in the registry where it bites hardest.** The
 * table is keyed by binding id, so two entries carrying one chord are two
 * lawful, distinct, non-overwriting entries — nothing in the record, the
 * annotation or the `AssertNever` pair can see them, because `Exclude` is
 * set-valued over the *ids*. The symptom is the one B-4 recorded for
 * `LAYER_KEYS`: one of the two commands silently never fires.
 *
 * Separate from {@link composeKeybindings} so a caller can ask before it
 * commits, and so the throw there has something to name. The same split
 * `duplicatePanelIds`, `duplicateControlIds` and `duplicateOperationIds` make
 * — and the difference worth stating is that all three of those dedupe on the
 * record's **key**, where this dedupes on a **field**, which is the case a
 * record cannot report for itself at all.
 *
 * `Object.keys` and a `Set`, never `chord in seen`: `'constructor' in {}` is
 * `true`, so a plain object accumulator would invent a conflict for a binding
 * whose key happens to be an inherited name. That is the prototype chain
 * reaching a *comparison* rather than a lookup (C-6's), and it is tested.
 */
export function conflictingChords(...tables: readonly KeyBindingTable[]): readonly string[] {
  const seen = new Set<string>()
  const clashed = new Set<string>()
  for (const table of tables) {
    for (const id of Object.keys(table)) {
      const chord = chordId(table[id]!)
      if (seen.has(chord)) clashed.add(chord)
      seen.add(chord)
    }
  }
  return [...clashed].sort()
}

/**
 * One keymap from several tables, so a later tier extends rather than edits.
 *
 * **The open door.** P4 wants the arrows and `Delete`, P6 wants the transport
 * keys and P3b wants undo; each lands as a {@link KeyBindingTable} in its own
 * module and the shell composes. No type here widens, no union here grows and
 * no entry here moves, which is what keeps §11 row 5's "one entry" true for a
 * phase that does not own this file.
 *
 * **It throws**, on a duplicate id and on a duplicate chord, for
 * `composeOperations`' reason: two tables are **code**, so there is no
 * caller-side recovery worth offering, and a record cannot report either
 * collision on its own — the second id silently overwrites the first, and the
 * second chord silently never fires.
 *
 * Built onto a **null prototype**, and that is the hazard with no wrong value
 * to notice: `merged['__proto__'] = entry` on a `{}` accumulator invokes the
 * inherited setter, so the entry **vanishes** and the accumulator's prototype
 * is replaced by it. Not a wrong binding — an absent one, with nothing left to
 * inspect. `Object.create(null)` makes `__proto__` an ordinary own property.
 */
export function composeKeybindings(...tables: readonly KeyBindingTable[]): KeyBindingTable {
  const ids = new Set<string>()
  const shadowed = new Set<string>()
  for (const table of tables) {
    for (const id of Object.keys(table)) {
      if (ids.has(id)) shadowed.add(id)
      ids.add(id)
    }
  }
  if (shadowed.size > 0) {
    throw new Error(
      `binding id declared by more than one table: ${[...shadowed].sort().join(', ')}. ` +
      `A record cannot report a collision — the second registration would silently shadow the ` +
      `first, leaving a command bound to a key that runs something else.`,
    )
  }

  const clashed = conflictingChords(...tables)
  if (clashed.length > 0) {
    throw new Error(
      `chord claimed by more than one binding: ${clashed.join(', ')}. ` +
      `Two bindings on one chord is one command that silently never fires, whichever the ` +
      `dispatcher reaches second.`,
    )
  }

  const merged: Record<string, KeyBinding> = Object.create(null) as Record<string, KeyBinding>
  for (const table of tables) {
    for (const id of Object.keys(table)) {
      merged[id] = table[id]!
    }
  }
  return Object.freeze(merged)
}

/* ------------------------------------------------------------------ *
 * The audit. The instrument the vacuity control drives.
 * ------------------------------------------------------------------ */

/**
 * Everything wrong with a table of keybindings, as sentences, or empty.
 *
 * **This exists so that the vacuity control has an instrument to drive.**
 * Survey §I-1 measured that a universally-quantified registry check is
 * vacuously true at zero entries, and C-3's emptied-registry plant caught that
 * exact defect inside its own test file. The floor here is not a number: it is
 * `chrome` and `panels`, **supplied by the caller** from `panels.ts`, which is
 * also what keeps the check from being the derivation running twice — the
 * shipped entry's `hides` is a module-load snapshot of `chromePanels()`, and
 * this compares it against the live set rather than against itself.
 *
 * Returns complaints rather than throwing, for `auditViews`' and
 * `auditShadings`' reason: the caller has the context to decide what an
 * incomplete table means, and a thrown error reports only the first thing
 * wrong.
 */
export function auditKeybindings(
  table: KeyBindingTable,
  chrome: readonly string[],
  panels: readonly string[],
): readonly string[] {
  const complaints: string[] = []
  const wanted = new Set(chrome)

  // Design §5.1's floor, and the only entry this registry is required to have.
  const hidesAllChrome = Object.keys(table).some(id => {
    const got = new Set(table[id]!.hides)
    return got.size === wanted.size && [...wanted].every(panel => got.has(panel))
  })
  if (!hidesAllChrome) {
    complaints.push('no binding hides all chrome, which is the one design §5.1 names')
  }

  for (const [id, info] of Object.entries(table)) {
    if (info.binding !== id) {
      complaints.push(`\`${id}\` is registered under a key its entry does not know (\`${info.binding}\`)`)
    }
    if (info.key.trim() === '') {
      complaints.push(`\`${id}\` has no key, so its key is hidden in a handler`)
    }
    if (info.caption.trim() === '') complaints.push(`\`${id}\` has no caption`)
    if (info.label.trim() === '') complaints.push(`\`${id}\` has no label`)
    if (info.reason.trim() === '') complaints.push(`\`${id}\` has no recorded reason`)

    for (const modifier of info.modifiers) {
      if (!(MODIFIERS as readonly string[]).includes(modifier)) {
        complaints.push(`\`${id}\` holds \`${modifier}\`, and that is not a modifier`)
      }
    }

    if (new Set(info.hides).size !== info.hides.length) {
      complaints.push(`\`${id}\` names a panel twice`)
    }
    for (const panel of info.hides) {
      if (!panels.includes(panel)) {
        complaints.push(`\`${id}\` hides \`${panel}\`, and that is not a panel`)
      }
    }
    // The strict half of the subset relation. A binding that hides every panel
    // there is leaves nothing on screen, which is not "hides all chrome" — it
    // is an editor with no editor in it.
    if (panels.length > 0 && panels.every(panel => info.hides.includes(panel))) {
      complaints.push(`\`${id}\` hides every panel there is, leaving nothing to fuse`)
    }
  }

  for (const chord of conflictingChords(table)) {
    complaints.push(`\`${chord}\` is claimed by more than one binding, so one of them never fires`)
  }

  return complaints
}

/* ------------------------------------------------------------------ *
 * Provenance, recorded as data rather than as a note.
 * ------------------------------------------------------------------ */

/** One upstream a binding is checked against. See {@link BindingProvenance}. */
export interface BindingRoster {
  /** Path from the repository root, exactly as the test reads it. */
  readonly file: string
  /** What in that file is the roster, in enough detail to find it after a reformat. */
  readonly what: string
}

/** Where this registry's bindings came from, and what would lose them. */
export interface BindingProvenance {
  /** The upstreams, resolved and parsed by `keybindings.test.ts`. */
  readonly rosters: readonly BindingRoster[]
  /** What happens without this registry. */
  readonly lostWithout: string
  /** The sentence the registry is floored on, quoted. */
  readonly ruling: string
}

/**
 * The upstreams behind the two shipped bindings.
 *
 * §9's last trap is that *"a recorded note is a sensor — it is not. A note
 * tells whoever reads it; nothing makes them read it."* So {@link rosters} is
 * **data**: `keybindings.test.ts` resolves each recorded path, parses it, and
 * requires it to still say what this registry says it says. A rename or a
 * deletion upstream reddens a test naming the file, with no production import
 * from this module to either of them (C-5's rule).
 *
 * **When the teardown's red arrives, it is working.** `site/main.ts` and
 * `site/index.html` are deleted by P3b; at that point the fix is to drop the
 * deleted roster and keep the design, because this registry *is* then the only
 * place the binding is written down — which is the whole reason for writing it
 * down here first.
 */
export const CHROME_BINDING_PROVENANCE: BindingProvenance = {
  rosters: [
    {
      file: 'docs/plans/2026-10-13-editor-design.md',
      what: '§5.1\'s sentence "One key hides all chrome."',
    },
    {
      file: 'site/main.ts',
      what: 'the `event.key !== \'Escape\'` comparison in the presentation-mode keydown listener',
    },
    { file: 'site/index.html', what: 'the `<kbd>` captions in the present hint and the button note' },
  ],
  lostWithout:
    'The chrome gesture ships half-built today — an Escape handler and a button, with no key ' +
    'that enters the mode and nothing that writes either decision down. The teardown deletes ' +
    'both files, so without this registry the editor would lose a shipped binding and nothing ' +
    'in `npm test` would notice.',
  ruling:
    'Design §5.1: "One key hides all chrome." It is the only keybinding the design names, which ' +
    'is why it is this registry\'s floor rather than one entry among many.',
}

/* ------------------------------------------------------------------ *
 * The absences, which are decisions a list cannot record by listing.
 * ------------------------------------------------------------------ */

/**
 * Whether an unbound chord is argued against, owned by something else, or
 * simply not here yet.
 *
 * **Three members, and the vocabulary is chosen rather than copied.** C-4's
 * `OperationDisposition` is `refused | deferred`; C-5's and C-6's is
 * `refused | elsewhere`, and C-5 measured that it had no vacancy at all. A
 * keybinding registry has all three and they are genuinely different
 * questions:
 *
 * - `refused` — we will not bind it, and here is the argument. Reopening it
 *   means arguing with the entry.
 * - `elsewhere` — the chord is not ours to bind. The user agent has it.
 * - `deferred` — we *will* bind it, in a phase that is not P3a, and the entry
 *   says which. These are **vacancies owned by P3b, P4 and P6**, not refusals.
 *
 * C-4's reason for splitting at all, which is the reason the third member is
 * worth the line: *"a refusal filed as a vacancy is a settled argument
 * somebody reopens by implementing it"* — and the converse, a vacancy filed as
 * a refusal, is a feature quietly cancelled by whoever reads the table next.
 */
export type BindingDisposition = 'refused' | 'elsewhere' | 'deferred'

/** The dispositions. See {@link BindingDisposition}. */
export const BINDING_DISPOSITIONS = ['refused', 'elsewhere', 'deferred'] as const

type _NoDispositionMissing =
  AssertNever<Exclude<BindingDisposition, typeof BINDING_DISPOSITIONS[number]>>
type _NoDispositionExtra =
  AssertNever<Exclude<typeof BINDING_DISPOSITIONS[number], BindingDisposition>>

/** What {@link ABSENT_BINDINGS} records about a chord it does not bind. */
export interface AbsentBinding {
  /** The chord, in {@link chordId}'s spelling. Mirrors the key. */
  readonly name: string
  /** Argued against, owned elsewhere, or not here yet. See {@link BindingDisposition}. */
  readonly disposition: BindingDisposition
  /** Why, in prose a reviewer can check against the design, the code or the platform. */
  readonly reason: string
  /** For anything but a refusal, the phase or mechanism that owns it. Absent on a refusal. */
  readonly ownedBy?: string
}

/**
 * Chords that are understood, will be asked for, and are not bound here.
 *
 * A registry records decisions by **listing**, and several of this registry's
 * decisions are **absences**, which is the one thing a list cannot record.
 * C-1's convention, now the cluster's: *"a comment above the registry is
 * deleted by whoever adds the entry; a table with a test over it has to be
 * argued with."* Same mechanism as `layout.ts`' `REFUSED_PLACEMENTS`,
 * `panels.ts`' `REFUSED_PANELS`, `controlspec.ts`' `REFUSED_LAYER_VARIANTS`,
 * `fit.ts`' `REJECTED_FIT_MODES`, `operations.ts`' `ABSENT_OPERATIONS`,
 * `shadings.ts`' `ABSENT_SHADINGS` and `views.ts`' `ABSENT_VIEWS`.
 *
 * Keyed by chord rather than by command, because the question a reader arrives
 * with is *"why does this key do nothing?"*
 */
export const ABSENT_BINDINGS: Record<string, AbsentBinding> = {
  Tab: {
    name: 'Tab',
    disposition: 'refused',
    reason:
      'The convention for this exact gesture in every desktop tool in the class — Photoshop, ' +
      'Krita, GIMP, Affinity, and the Photopea design §5.1 names as its reference for the ' +
      'shell\'s feel all hide their panels on Tab — and it does not transfer, because none of ' +
      'them is a web page. In a browser Tab is focus traversal, and this editor is the one ' +
      'application that cannot afford to take it: R6 requires every control to be exposed, ' +
      'design §9.3 generates a widget for each, and swallowing Tab would leave a keyboard user ' +
      'unable to reach any of them. Refused on an argument about the medium rather than about ' +
      'the gesture, which is why the mnemonic `p` was chosen instead of a near-miss like Tab ' +
      'with a modifier.',
  },
  F11: {
    name: 'F11',
    disposition: 'elsewhere',
    reason:
      'Fullscreen, and not ours to bind: the user agent handles it before the page sees it, and ' +
      'on the engines that do deliver it the page cannot enter fullscreen from a key it did not ' +
      'receive. The product already has the supported door — `site/index.html` records that the ' +
      'present button is a button because "a click is also the only kind of event an engine will ' +
      'honour requestFullscreen from". Binding F11 would be a keymap entry that silently does ' +
      'nothing, which is exactly the state this registry exists to make visible.',
    ownedBy: 'the user agent, and `requestFullscreen` from a user gesture',
  },
  'ctrl+z': {
    name: 'ctrl+z',
    disposition: 'deferred',
    reason:
      'Undo. Plan §7 P3.7 is "mark-based undo — one history entry per interaction" and design ' +
      '§3.4 specifies the model, and neither is P3a: survey §G-4 measured the repository as ' +
      'having "no undo, no redo, no mark concept, no history stack". Binding it before the ' +
      'history exists would be a key that does nothing, and choosing the platform mapping — ' +
      '`meta+z` on macOS against `ctrl+z` elsewhere — is a dispatcher decision this registry ' +
      'deliberately does not make, because `Modifier` has both members and nothing here says ' +
      'which one a platform substitutes.',
    ownedBy: 'P3b — plan §7 P3.7, design §3.4',
  },
  Delete: {
    name: 'Delete',
    disposition: 'deferred',
    reason:
      'Delete the selected layer. The operation already exists — `operations.ts` registers ' +
      '`layer.delete` from design §5.6 — so this is a binding with nothing missing behind it ' +
      'except a selection, and selection is canvas interaction (design §5.5), which plan §7 ' +
      'assigns to P4. Recorded rather than bound so that P4 adds one entry and finds the ' +
      'argument already made, instead of discovering that the registry had quietly decided ' +
      'against it.',
    ownedBy: 'P4 — design §5.5, §5.6',
  },
  ArrowLeft: {
    name: 'ArrowLeft',
    disposition: 'deferred',
    reason:
      'Two commands want the arrows and neither is P3a: nudging the selection by a scene pixel ' +
      '(design §5.5) and stepping the transport by a frame (design §7.4). It is also the one ' +
      'case this registry\'s `KeyboardEvent.key` decision gets wrong in principle — a nudge ' +
      'cluster is **positional**, so a WASD-shaped binding would need `.code` and would have to ' +
      'widen `KeyBinding` to say which it means. Deferring it keeps that widening with the phase ' +
      'that can argue for it, rather than adding a field nothing uses.',
    ownedBy: 'P4 (design §5.5) and P6 (design §7.4)',
  },
}

/**
 * Why this chord is not bound, if it is one we have considered.
 *
 * Returns `undefined` for a chord that *is* bound and for one nobody has
 * considered — an unknown chord has no recorded reason to give, and inventing
 * one is a generic message any caller can write for itself. The same split
 * `refusedPanel`, `refusedPlacement`, `refusedLayerVariant`, `absentOperation`,
 * `absentShading` and `absentView` make.
 *
 * `Object.hasOwn` again, and this is the reading where the unguarded form is
 * worst: a bare index answers with `Object` for `absentBinding('constructor')`,
 * so a help panel would show a refusal whose chord and reason are both
 * `undefined`. A wrong answer is at least visible; well-formed prose that
 * explains nothing is not.
 */
export function absentBinding(chord: string): AbsentBinding | undefined {
  if (!Object.hasOwn(ABSENT_BINDINGS, chord)) return undefined
  return ABSENT_BINDINGS[chord]
}
