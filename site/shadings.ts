/**
 * The depth view's shadings: how a scalar depth field is turned into something
 * a human can read.
 *
 * Design §5.2 is the whole rationale. The model stores a scalar and the view
 * renders it however reads best — *"False colour is a reversible view
 * transform over unchanged data, not a change to what is stored"* (§5.2a) —
 * and design §11 row 6 budgets a new shading at **one registration**, with
 * §11's reason for testing that budget rather than asserting it: *"without
 * that, 'moving a panel costs a declaration' is unverified until the first
 * time it is false."*
 *
 * ## P3a ships the keys; P4 ships the pixels
 *
 * Plan §7 P4.2 assigns every implementation to P4 — the Turbo LUT, the
 * hillshade, `ramp`'s configurable domain. What is here is the vocabulary and
 * what is recorded against each name. {@link ShadingInfo.shipped} is the
 * claim about today's population and `shadings.test.ts` is what keeps it from
 * going stale in either direction: today exactly one shading has a mapping in
 * the tree, `grey`, and it is `site/depthmap.ts`'s `depthToRgba`, which plan
 * §7 P4.2 requires stay *"byte-identical to today"*.
 *
 * **This module imports nothing from `depthmap.ts`.** It records the claim as
 * data — {@link ShadingImplementation} — and the test resolves it. A
 * production import would couple a registry to a module the teardown orphans
 * (survey §1a: `depthmap.ts`'s only production consumer is `main.ts`), to buy
 * a reference the registry does not call.
 *
 * ## Membership is declared, not derived — and it has an upstream anyway
 *
 * C-3's §9 trap row is that *"a guard derived from the roster it guards
 * proves only that the derivation ran twice"*. Nothing here is derived from a
 * codebase roster: there is no `Shading` in the model, and survey §I-2 **[M]**
 * measured the membership as *"fully determined"* by design §5.2's four-row
 * table. So the trap does not apply in its usual form — but its spirit does,
 * because a registry whose only guard ties its own two declarations to each
 * other can lose a member from both at once and stay green.
 *
 * The answer is that the four-row table **is** an upstream roster, and it is
 * in this repo. `shadings.test.ts` parses design §5.2 and requires
 * {@link SHADING_IDS} to equal its rows, and requires
 * {@link DEFAULT_SHADING} to be the row the table marks `(default)`. A fifth
 * row in the design, or a member deleted here, is red. That is the vacuity
 * floor in a form that is not a number: see this file's companion note in the
 * test, and §9's trap that *"a numeric floor chosen from today's count is a
 * check — it is not"*.
 *
 * The two local declarations are still tied to each other by an
 * {@link AssertNever} pair, `panels.ts`' idiom, and {@link SHADINGS} is total
 * over {@link Shading} **by annotation** — so a fifth member is a compile
 * error whose only honest fix is to write down why the shading exists. That
 * is C-4's reading of §F-6's pairing rule: point the compile-time guard at
 * something with content in it, so the compiler asks for a sentence rather
 * than for a comma.
 *
 * ## The default is a value, not a position, and the losing argument survives
 *
 * {@link DEFAULT_SHADING} is a `Shading`-typed constant, which is `fit.ts`'
 * and `smooth.ts`' shipped idiom (`DEFAULT_FIT`, `DEFAULT_SMOOTH`) and makes
 * naming a shading that does not exist **unrepresentable** rather than
 * caught. {@link SHADING_IDS} is deliberately **not** ordered with the
 * default first, so that `SHADING_IDS[0]` is never an accidental synonym for
 * it — the coincidence that would let design §5.2's *"reversible by
 * preference rather than by code"* quietly become false.
 *
 * And the default was **contested**. Design §5.2: *"`ramp` is default because
 * R12 asked for it. The research's second-strongest depth finding is that
 * relief should be default; **R12 wins, and the conflict is recorded rather
 * than silently resolved.**"* A registry that recorded only the winner would
 * have destroyed the evidence that there was an argument, so the argument is
 * {@link DEFAULT_CONTEST} and the test ties it to {@link DEFAULT_SHADING}:
 * flipping the default without saying which side now loses is red.
 *
 * ## There is no barrel, and no composition door
 *
 * No barrel, for the reason `panels.ts`, `controlspec.ts` and `operations.ts`
 * record: a barrel is a second place every registry has to be registered,
 * which is exactly the cost §11 budgets at one. A direct `./shadings.js`
 * import also keeps this module inside `site/query.test.ts`'s cone walk,
 * which resolves only a relative specifier with no `/` in it.
 *
 * No `composeShadings` either, and that is the difference from `operations.ts`
 * rather than an omission. `OPERATIONS` had to stay open because plan §7 P4.7
 * hands *later tiers* to a later phase, so a keyframe operation must be able
 * to arrive from another module. A shading has no tiers and no later owner:
 * design §11 row 6 budgets a new one at one registration **in this file**,
 * which is the cost the design chose. {@link ShadingTable} is keyed by
 * `string` so that a registration test can register one without widening a
 * union, and so that every reader is written for a name that came from a
 * stored preference rather than from a literal.
 */
import type { AssertNever } from '../src/core/index.js'

/**
 * The shadings the depth view offers.
 *
 * Declared as a union **and** as {@link SHADING_IDS}, tied by the pair below,
 * for `panels.ts`' reason: neither declaration is derived from the other, so
 * the pair is a real guard rather than a restatement. Both are checked
 * against design §5.2's table by `shadings.test.ts`, which is the guard that
 * survives someone editing both at once.
 */
export type Shading = 'grey' | 'ramp' | 'turbo' | 'relief'

/**
 * The shadings, ordered by **how much they interpret**, which is the one
 * ordering this registry can defend and is not design §5.2's table order.
 *
 * `grey` is the identity mapping of the scalar; `ramp` is a two-point LUT
 * over the same per-pixel value; `turbo` is a multi-stop LUT over it; and
 * `relief` is not a LUT at all — it is computed from the *neighbourhood*, so
 * it is the only entry whose output cannot be inverted back to a depth.
 * Design §5.2a puts it plainly: *"Relief is an interpretation; you should be
 * able to check it without changing a setting."*
 *
 * **The default is deliberately not first.** Design §5.2's own table lists
 * `ramp` first *because* it is the default, and copying that order here would
 * have made `SHADING_IDS[0]` a correct-by-accident spelling of
 * {@link DEFAULT_SHADING}. The next reader to reach for the shorter
 * expression would then have turned the default back into a *position* —
 * which is the one property §5.2 asks this registry to remove, since
 * *"`SHADINGS` makes the default a config value, so this is reversible by
 * preference rather than by code."* `shadings.test.ts` asserts the
 * non-coincidence, so the protection is a sensor and not this paragraph.
 */
export const SHADING_IDS = ['grey', 'ramp', 'turbo', 'relief'] as const

type _NoShadingMissing = AssertNever<Exclude<Shading, typeof SHADING_IDS[number]>>
type _NoShadingExtra = AssertNever<Exclude<typeof SHADING_IDS[number], Shading>>

/**
 * The shipped default, as a value.
 *
 * `DEFAULT_FIT` and `DEFAULT_SMOOTH`'s idiom, and the annotation is the point:
 * a default naming a shading that does not exist is **not expressible**, so
 * criterion (a) is discharged by the compiler rather than by a test. The
 * runtime half is {@link defaultShadingInfo}, which resolves it through the
 * registry's own reader.
 *
 * **Changing it is one token.** What it also costs is {@link DEFAULT_CONTEST},
 * because design §5.2 requires the losing argument to survive the change, and
 * that is not a tax on reversibility — a *user's* preference costs nothing at
 * all, since {@link resolveShading} is the path a stored preference takes and
 * it touches no code.
 */
export const DEFAULT_SHADING: Shading = 'ramp'

/**
 * Where a shading's mapping lives today, when one does.
 *
 * Recorded as strings rather than as a function reference so that this
 * registry stays importable without pulling in whatever renders. The strings
 * are load-bearing: `shadings.test.ts` resolves the module and asserts the
 * named export really is there, so a rename upstream reddens here instead of
 * leaving a registry quietly describing a function nobody has.
 */
export interface ShadingImplementation {
  /** The module specifier, exactly as a `site/` module would import it. */
  readonly module: string
  /** The exported name within it. */
  readonly export: string
}

/**
 * The light a hillshade is lit by.
 *
 * **Degrees, and the suffix is not decoration.** §9's standing trap is that
 * `Transform.rotate` is radians while `shape.start`/`end` are degrees, and
 * design §9.1 cites that exact collision; a bare `azimuth: 315` in a registry
 * read by a renderer that takes radians is the same bug with a different
 * number. Invariant §2.7's rule for pixel spaces applies to angles for the
 * same reason — name the unit where the number appears.
 */
export interface ShadingLight {
  /** Compass bearing of the light, degrees clockwise from north. */
  readonly azimuthDeg: number
  /**
   * Height of the light above the horizon, in degrees.
   *
   * Design §5.2a's guard rail: *"relief azimuth is constrained above the
   * horizon or the surface inverts."* Strictly greater than 0 and at most 90,
   * asserted in `shadings.test.ts` — recorded here as a range rather than
   * enforced by a type because P4 owns the control that may let an author
   * move it, and a constraint that lives only in the widget is a constraint
   * the next widget does not have.
   */
  readonly altitudeDeg: number
}

/** What the registry records about one shading. */
export interface ShadingInfo {
  /**
   * The shading's key.
   *
   * Mirrors the key, as `PanelInfo.panel`, `FitModeInfo.mode` and
   * `Operation.id` do: a registry hands out values, and a value that does not
   * know its own name forces every caller to carry the pair. Typed `string`
   * and not `Shading` so that a registration test can declare an entry
   * without widening the union — the mirroring is checked at run time
   * instead, over every table a reader is handed.
   */
  readonly shading: string
  /** Human-facing name — a menu entry, a radio label, a legend heading. */
  readonly label: string
  /**
   * Why this shading exists, in design §5.2's own terms.
   *
   * §2.3: a constant with no recorded reason is a review failure, and four
   * bare names would be exactly that. These are quoted rather than invented
   * because the design has already argued each one, and a paraphrase is how a
   * rationale drifts from the decision it records.
   */
  readonly reason: string
  /**
   * Whether a mapping for this shading exists in the tree **today**.
   *
   * Not a capability and not a toggle: it is the claim that makes "P4 owns
   * the implementations" legible in the registry rather than only in a plan,
   * and `shadings.test.ts` checks it against {@link implementedBy} in both
   * directions on every run. Flipping it without naming an implementation is
   * red, and naming one without flipping it is red. C-4's convention: a
   * recorded claim about today's population is only worth writing down if
   * something goes red when it stops being true.
   */
  readonly shipped: boolean
  /** Where that mapping is, iff {@link shipped}. See {@link ShadingImplementation}. */
  readonly implementedBy?: ShadingImplementation
  /** The light, iff this shading is a hillshade. See {@link ShadingLight}. */
  readonly light?: ShadingLight
}

/**
 * A table of shadings, keyed by name.
 *
 * Keyed by `string` and not by {@link Shading}, which is what every reader
 * takes. Two reasons, both load-bearing: a caller holding a name out of a
 * stored preference, a `data-` attribute or a link has a `string` and not a
 * union member, and a registration test must be able to register an entry
 * without editing this file's union. The *shipped* registry is still total
 * over the union — see {@link SHADINGS}.
 */
export type ShadingTable = Readonly<Record<string, ShadingInfo>>

/**
 * The shadings.
 *
 * `Record<Shading, ShadingInfo>` **by annotation**, and that is the registry's
 * compile-time guard: a fifth member of {@link Shading} is an error here, and
 * the only honest fix is to write the sentence saying why the shading exists.
 * A `Record<string, …>` would have accepted the widened union in silence,
 * which is the difference between a guard that asks for content and one that
 * asks for a comma.
 *
 * It is a plain object literal, so `Object.prototype` is behind it and
 * `SHADINGS['constructor']` answers with the `Object` function. That is
 * **deliberate and not an oversight**: the annotation above is only available
 * on a literal, and the guard that survives a `{...SHADINGS}` in the shell is
 * the one at the reader anyway (E8 / R-l). Every reader below uses
 * `Object.hasOwn`.
 */
export const SHADINGS: Record<Shading, ShadingInfo> = {
  grey: {
    shading: 'grey',
    label: 'Grey',
    reason:
      'Design §5.2: "raw, unstretched — **export truth**". The identity mapping of the scalar ' +
      'onto a visual, which is why every depth pass in every DCC tool is greyscale (§5.2a). It ' +
      'is also the answer to `site/depthmap.ts`\'s recorded worry that "a false-colour ramp ' +
      'would read nicer and would hide exactly the thing the panel exists to reveal" — §5.2 ' +
      'answers it rather than dismissing it, and `grey` staying available unchanged is half of ' +
      'that answer. Plan §7 P4.2 requires it stay byte-identical to today.',
    shipped: true,
    implementedBy: { module: './depthmap.js', export: 'depthToRgba' },
  },
  ramp: {
    shading: 'ramp',
    label: 'Ramp',
    reason:
      'Design §5.2: "two-point LUT. **Near and far colours configurable**, defaulting white = ' +
      'near, black = far (R12)." The default shading, and the only one R12 asked for by name. ' +
      'Its `[near, far]` display domain is a control and not a shading — design §5.2a gives it ' +
      'a default of `[1, 0]` and an `auto` mode, and plan §7 P4.2 makes it P4\'s "domain ' +
      'control", so neither the domain nor its default is declared here. See ' +
      '`ABSENT_SHADINGS.auto`.',
    shipped: false,
  },
  turbo: {
    shading: 'turbo',
    label: 'Turbo',
    reason:
      'Design §5.2: "Google\'s Turbo, built for depth and disparity maps". The reason it is this ' +
      'LUT and not a rainbow is §5.2a\'s guard rail — "a custom ramp must be monotonic in ' +
      'luminance or depth ordering becomes unreadable" — which is the defect Turbo was ' +
      'published to fix. See `ABSENT_SHADINGS.jet`, where the refusal of the alternative is ' +
      'recorded so this entry is not the only place the argument survives.',
    shipped: false,
  },
  relief: {
    shading: 'relief',
    label: 'Relief',
    reason:
      'Design §5.2: "hillshade, azimuth 315° / altitude 45° — recruits the light-from-above ' +
      'prior". The strongest reading of the four and the one the research wanted as default; it ' +
      'is not, and `DEFAULT_CONTEST` is where that argument is kept. Computed from the ' +
      'neighbourhood rather than from the value, so it is the one shading whose output cannot ' +
      'be read back as a depth — §5.2a: "Relief is an interpretation; you should be able to ' +
      'check it without changing a setting."',
    shipped: false,
    light: { azimuthDeg: 315, altitudeDeg: 45 },
  },
}

/**
 * The argument the default won, and the one it beat.
 *
 * **Design §5.2 requires this to exist**, and in those words: *"R12 wins, and
 * the conflict is recorded rather than silently resolved."* A registry that
 * said only `DEFAULT_SHADING = 'ramp'` would have resolved it silently — the
 * reader six months from now sees a default and no sign that anything else
 * was ever a candidate, and the second-strongest finding in the depth
 * research is simply gone.
 *
 * Tied to {@link DEFAULT_SHADING} by `shadings.test.ts`, so flipping the
 * default and leaving this alone is red. That is not a brake on
 * reversibility: §5.2's reversibility is *by preference* — see
 * {@link resolveShading}, which costs no edit at all — and the one thing a
 * change of *shipped* default must not be able to do is erase the record that
 * it was contested.
 */
export interface DefaultContest {
  /** The shading that won, which must be {@link DEFAULT_SHADING}. */
  readonly chosen: Shading
  /** The shading that lost, which must not be the one that won. */
  readonly contender: Shading
  /** The case for the winner. */
  readonly chosenBecause: string
  /** The case for the loser, kept because it was not refuted. */
  readonly contenderBecause: string
  /** How the tie was broken, quoted from the design. */
  readonly resolvedBy: string
}

/** The contest over the default. See {@link DefaultContest}. */
export const DEFAULT_CONTEST: DefaultContest = {
  chosen: 'ramp',
  contender: 'relief',
  chosenBecause:
    'Design §5.2: "`ramp` is default because R12 asked for it." R12 is a stated requirement with ' +
    'a named default — white = near, black = far — and the ramp is the only one of the four the ' +
    'requirements name at all.',
  contenderBecause:
    'Design §5.2: "The research\'s second-strongest depth finding is that relief should be ' +
    'default." Relief recruits the light-from-above prior (§5.2), which is a perceptual ' +
    'mechanism the other three do not reach; the finding was not refuted, it was outranked.',
  resolvedBy:
    'Design §5.2: "**R12 wins, and the conflict is recorded rather than silently resolved.** ' +
    'Relief is one keystroke away and `SHADINGS` makes the default a config value, so this is ' +
    'reversible by preference rather than by code." The cost of being wrong is therefore one ' +
    'preference, which is why the requirement could outrank the finding without the finding ' +
    'having to be wrong.',
}

/**
 * What this shading is, or `undefined` if it is not one.
 *
 * **`Object.hasOwn`, not a bare index and not `in`.** {@link SHADINGS} is a
 * plain object literal, so `SHADINGS['constructor']` is the `Object` function
 * and `'toString' in SHADINGS` is `true`; a caller holding a name from a
 * stored preference would be handed a value whose `label` and `reason` are
 * both `undefined`, which is worse than an obviously wrong answer because it
 * renders as a blank menu row rather than as a crash. E8 / R-l, the same fix
 * P0b used in five registries and C-2 used to close the sixth live instance
 * at `site/chromedom.ts:189`.
 *
 * `table` is a parameter so that a copy — the `{...SHADINGS}` the shell will
 * eventually write, or a registration test's table — is read by this same
 * function rather than by a second reader written for the occasion.
 */
export function shadingInfo(shading: string, table: ShadingTable = SHADINGS): ShadingInfo | undefined {
  if (!Object.hasOwn(table, shading)) return undefined
  return table[shading]
}

/**
 * The shadings a table offers, in the order it declares them.
 *
 * **The question a picker asks, and until this existed the answer was
 * {@link SHADING_IDS}** — a static declaration no table can move. Every other
 * reader here takes a name and hands back what is recorded against it, which
 * answers *"is this a shading?"* for a caller who already has the name. The
 * depth view does not have one: design §5.2 says it "carries a shading" and
 * {@link ShadingInfo.label} exists to be *"a menu entry, a radio label, a
 * legend heading"*, so what the view needs before any name is the list. A
 * shading registered into a table that nothing enumerates is registered and
 * not offered — plan §9: *"A registration test must assert that the thing a
 * consumer does is now possible — not that the entry can be found."*
 *
 * **Defined in terms of {@link shadingInfo} rather than beside it**, so the
 * two cannot disagree. An enumeration written independently would be free to
 * offer a row the lookup then refuses — a menu entry that selects nothing —
 * and `for…in`, the obvious spelling, does exactly that for a table built on
 * another table: `Object.prototype`'s own members are non-enumerable and
 * never reach a picker, but a `{ __proto__: SHADINGS, … }` copy's inherited
 * entries do, and `Object.hasOwn` at the lookup refuses every one of them.
 *
 * Order is the table's own, which is an argument somebody made: see
 * {@link SHADING_IDS} on why these are ordered by how much each interprets
 * rather than by design §5.2's table, and a reader that sorted its answer
 * would discard that. A registration therefore appends rather than reorders.
 * `Object.keys` puts integer-like keys first, so a shading named `'0'` would
 * jump the queue — recorded rather than guarded against, because a numeric
 * shading name has no caller and inventing a check for one is cheaper to
 * write than to justify.
 */
export function offeredShadings(table: ShadingTable = SHADINGS): readonly ShadingInfo[] {
  const offered: ShadingInfo[] = []
  for (const name of Object.keys(table)) {
    const info = shadingInfo(name, table)
    if (info !== undefined) offered.push(info)
  }
  return offered
}

/**
 * The shading a stored preference selects, falling back to the default.
 *
 * **This is what design §5.2's "reversible by preference rather than by code"
 * means concretely**, and it is why the default had to stop being a position:
 * a preference arrives as a `string` from somewhere outside this module, and
 * the registry is the only thing that can say whether it names a shading.
 *
 * Falls back rather than throwing, which is `parseFit`'s trade for
 * `parseFit`'s reason: an unreadable preference should cost the author a
 * default view, not an error page. It does **not** normalise case or trim —
 * `fit.ts` and `smooth.ts` take that from `query.ts`, which owns the one copy
 * of that policy, and a second normaliser here would be the drift
 * `query.test.ts` exists to catch.
 */
export function resolveShading(preference: string | undefined, table: ShadingTable = SHADINGS): string {
  if (preference === undefined) return DEFAULT_SHADING
  return Object.hasOwn(table, preference) ? preference : DEFAULT_SHADING
}

/**
 * The default's own entry, resolved through the registry.
 *
 * The runtime half of §F-6's pairing rule for the default: the annotation on
 * {@link DEFAULT_SHADING} is enforced by `npm run typecheck` alone, so
 * without something that reads it at run time the guarantee is invisible to
 * `npm test` and therefore to the gate's test leg.
 */
export function defaultShadingInfo(table: ShadingTable = SHADINGS): ShadingInfo | undefined {
  return shadingInfo(DEFAULT_SHADING, table)
}

/**
 * Whether an absent shading is argued against or owned by something else.
 *
 * **There is no `deferred` member, and that is the finding rather than an
 * oversight.** C-4's `OperationDisposition` needed one because design §5.6
 * names three tiers and P3a populates one, so two memberships are genuinely
 * *pending*. `SHADINGS` has no pending member: survey §I-2 **[M]** measured
 * design §5.2's membership as *"fully determined"*, and every shading-shaped
 * thing the design still owes is owed by a different mechanism — a mode of a
 * control, an interaction, or another registry's axis. Inventing a vacancy to
 * fill the slot would have put a shading nobody has argued for into a table
 * whose whole job is to record arguments.
 *
 * The distinction that *is* live here is between an argument we have had and
 * a thing that is simply not this registry's business, and it matters in the
 * same way C-4's did: a refusal filed as someone else's problem is a settled
 * argument that the someone else will reopen.
 */
export type ShadingDisposition = 'refused' | 'elsewhere'

/** The dispositions. See {@link ShadingDisposition}. */
export const SHADING_DISPOSITIONS = ['refused', 'elsewhere'] as const

type _NoDispositionMissing =
  AssertNever<Exclude<ShadingDisposition, typeof SHADING_DISPOSITIONS[number]>>
type _NoDispositionExtra =
  AssertNever<Exclude<typeof SHADING_DISPOSITIONS[number], ShadingDisposition>>

/** What {@link ABSENT_SHADINGS} records about a shading that is not registered. */
export interface AbsentShading {
  /** The name someone might ask for. Mirrors the key, as {@link ShadingInfo.shading} does. */
  readonly name: string
  /** Argued against, or owned elsewhere. See {@link ShadingDisposition}. */
  readonly disposition: ShadingDisposition
  /** Why, in prose a reviewer can check against the design. */
  readonly reason: string
  /** For an `elsewhere`, the mechanism that owns it. Absent on a refusal. */
  readonly ownedBy?: string
}

/**
 * Shadings that are understood, will be asked for, and are not registered —
 * with what each absence actually is.
 *
 * A registry records decisions by **listing**, and several of design §5.2's
 * decisions are **absences**, which is the one thing a list cannot record.
 * C-1's convention, now the cluster's: *"a comment above the registry is
 * deleted by whoever adds the entry; a table with a test over it has to be
 * argued with."* Same mechanism as `layout.ts`'s `REFUSED_PLACEMENTS`,
 * `panels.ts`' `REFUSED_PANELS`, `controlspec.ts`'s `REFUSED_LAYER_VARIANTS`,
 * `fit.ts`'s `REJECTED_FIT_MODES` and `operations.ts`' `ABSENT_OPERATIONS`.
 *
 * **Four entries and not more.** Over-recording is its own failure: a table
 * that answers for everything adjacent stops being a record of decisions and
 * becomes a second copy of the design. Each entry below is here because it is
 * a name a reasonable person would try to add to {@link SHADINGS}, which is
 * the test for membership of this table.
 *
 * Keyed by `string` rather than by a shading type, for `REFUSED_PANELS`'
 * reason: the whole point is to answer for names that are not shadings.
 */
export const ABSENT_SHADINGS: Record<string, AbsentShading> = {
  jet: {
    name: 'jet',
    disposition: 'refused',
    reason:
      'The rainbow LUT, and the one false-colour map everybody reaches for first. Refused by ' +
      'design §5.2a\'s guard rail: "a custom ramp must be monotonic in luminance or depth ' +
      'ordering becomes unreadable." Jet is not — its luminance rises, falls and rises again, ' +
      'so two different depths render at the same brightness and the ordering a depth map ' +
      'exists to show is destroyed. This is not a deferral: `turbo` is already in the registry ' +
      'as the answer to the need jet would serve, and design §5.2 says why it is the right one ' +
      '("built for depth and disparity maps").',
  },
  auto: {
    name: 'auto',
    disposition: 'elsewhere',
    reason:
      'A mode of `ramp`\'s display domain, not a shading. Design §5.2a: "`[near, far]` display ' +
      'clamps defaulting to `[1, 0]`. … An `auto` mode fits the domain to the scene\'s occupied ' +
      'range." Registering it here would make the registry the cross-product of every shading ' +
      'and every mode of its parameters, and `ramp` with an auto domain is still `ramp` — the ' +
      'legend is what tells the author the domain moved ("When the domain is not `[1, 0]`, the ' +
      'legend says so"), which is also not a shading.',
    ownedBy: 'the ramp domain control — plan §7 P4.2, design §5.2a',
  },
  'hold-to-reveal': {
    name: 'hold-to-reveal',
    disposition: 'elsewhere',
    reason:
      'Not a setting, and a registry member is a setting. Design §5.2a: "A momentary ' +
      'ground-truth key: hold to see raw greyscale under whatever shading is active, a second ' +
      'key to peek the stereogram. Relief is an interpretation; you should be able to check it ' +
      'without changing a setting." A `hold-to-reveal` entry in `SHADINGS` would be exactly the ' +
      'setting change the mechanism exists to avoid, and releasing the key would have to ' +
      'restore a previous selection that the registry has nowhere to keep. The raw map it ' +
      'reveals is `grey`, which is registered.',
    ownedBy: 'the editor\'s key handling — plan §7 P4.3, and `KEYBINDINGS`',
  },
  composited: {
    name: 'composited',
    disposition: 'elsewhere',
    reason:
      'Today\'s `#depth-view` offers `composited | encoded` (`site/index.html:153-154`, ' +
      '`site/controls.ts:29`) — the depth map before versus after `depthBlur`. Survey §I-2 ' +
      '**[M]** measured it as a third axis, orthogonal to both which canvas is shown (`VIEWS`) ' +
      'and which LUT is applied (this registry): every combination of the three is meaningful, ' +
      'so folding it in here would double the membership and still not express ' +
      '`encoded` + `relief`. Recorded rather than left out because ruling R-p is that without ' +
      'somewhere to land it is dropped silently by the teardown.',
    ownedBy: 'ruling R-p: a `DEPTH_SOURCES` member list alongside `VIEWS`',
  },
}

/**
 * Why this shading is not registered, if it is one we have considered.
 *
 * Returns `undefined` for a shading that exists and for a name nobody has
 * considered — an unknown name has no recorded reason to give, and inventing
 * one is a generic message any caller can write for itself. The same split
 * `refusedPanel`, `refusedPlacement`, `refusedLayerVariant` and
 * `absentOperation` make.
 *
 * `Object.hasOwn` again, and here the table really is a plain object literal
 * with `Object.prototype` behind it: a bare index answers with the `Object`
 * function for `absentShading('constructor')`, which is truthy, so the caller
 * shows a refusal whose name, disposition and reason are all `undefined`. A
 * visibly wrong answer is recoverable; well-formed prose that explains
 * nothing is not.
 *
 * `table` is a parameter for {@link shadingInfo}'s reason — a copy should be
 * read by this same function rather than by a second one written for the
 * occasion — and for one this registry's own test earned: a census that
 * cannot vary an input cannot show that the rows reading it held still, so
 * the claim *"a registration moved nothing else"* would rest on a row with
 * no way to move at all. C-5 did not need it; the registration test does.
 */
export function absentShading(
  name: string,
  table: Readonly<Record<string, AbsentShading>> = ABSENT_SHADINGS,
): AbsentShading | undefined {
  if (!Object.hasOwn(table, name)) return undefined
  return table[name]
}

/**
 * Everything wrong with a table of shadings, as sentences, or empty.
 *
 * **This exists so that the vacuity control has an instrument to drive to
 * zero.** Survey §I-1 measured that a universally-quantified registry check
 * is vacuously true at zero entries, and §9 adds that *"a numeric floor
 * chosen from today's count is a check — it is not"*. The floor here is not a
 * number: {@link requiredShadings} is the audit's demand, and the test
 * supplies it by parsing design §5.2's table, so the registry is checked
 * against an upstream roster rather than against a count someone typed.
 *
 * Returns complaints rather than throwing, for `unrecordedOperations`'
 * reason: the caller — here, a test — is the one with the context to decide
 * what an incomplete table means, and a thrown error reports only the first
 * thing wrong.
 */
export function auditShadings(
  table: ShadingTable,
  requiredShadings: readonly string[],
): readonly string[] {
  const complaints: string[] = []

  for (const required of requiredShadings) {
    if (!Object.hasOwn(table, required)) complaints.push(`no entry for \`${required}\``)
  }

  for (const [key, info] of Object.entries(table)) {
    if (info.shading !== key) {
      complaints.push(`\`${key}\` is registered under a key its entry does not know (\`${info.shading}\`)`)
    }
    if (info.label.trim() === '') complaints.push(`\`${key}\` has no label`)
    if (info.reason.trim() === '') complaints.push(`\`${key}\` has no recorded reason`)
    if (info.shipped && info.implementedBy === undefined) {
      complaints.push(`\`${key}\` claims to ship but names no implementation`)
    }
    if (!info.shipped && info.implementedBy !== undefined) {
      complaints.push(`\`${key}\` names an implementation but does not claim to ship`)
    }
    if (info.light !== undefined) {
      const { altitudeDeg, azimuthDeg } = info.light
      if (!(altitudeDeg > 0 && altitudeDeg <= 90)) {
        complaints.push(`\`${key}\` is lit from ${altitudeDeg}° — design §5.2a constrains a hillshade above the horizon`)
      }
      if (!(azimuthDeg >= 0 && azimuthDeg < 360)) {
        complaints.push(`\`${key}\` has an azimuth of ${azimuthDeg}°, which is not a compass bearing`)
      }
    }
  }

  return complaints
}
