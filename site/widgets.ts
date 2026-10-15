/**
 * The generated-widget floor: a pure function from one control's descriptor to
 * the fields a generic renderer would put on screen for it.
 *
 * Design §9.3 states the tension this module lives inside and resolves it:
 * *"R4 rejects 'html dropdowns and input fields' as the instrument. R6 demands
 * every control be exposed. A generic widget renderer is how R6 is met, and it
 * is the thing R4 condemned. The honest division: **Canvas for value ·
 * timeline for timing · depth strip for depth · generated widgets for the
 * residue.** Generated widgets are the *floor* that guarantees R6, not the
 * intended primary surface; any control that deserves a spatial instrument
 * should get one and lose its widget."*
 *
 * Two consequences shape everything below.
 *
 * **It is a function returning data, not a component.** Design §12: *"Not
 * tested: Svelte component DOM. Logic lives in plain modules and is tested
 * there."* No tier in this build has a browser, so a floor whose correctness
 * lived in markup would be a floor nothing could check. The Svelte side is a
 * shell over {@link resolveWidget}; everything decidable is decided here.
 *
 * **A floor is answerable for what it does *not* cover.** "Every control is
 * exposed" is not a claim a resolver can make by emitting something for every
 * input — a picker with no options and a text field over an animation track
 * are both worse than an honest absence, because an author cannot tell a
 * broken instrument from a hard one. So a spec with no fields always carries
 * the reason there are none, {@link widgetlessControls} counts them, and
 * {@link instrumentedControls} separates "routed to a spatial instrument by
 * §9.3" from "nobody can build this yet".
 *
 * ## Why the spec is a list of parts rather than one widget
 *
 * One control does not always want one field. A pair wants two numbers; an
 * enum whose reader also accepts another syntax wants a picker *and* a
 * free-text field, because `ease` is five named curves or
 * `cubic-bezier(a,b,c,d)` and a closed picker would tell an author that a
 * valid easing is invalid. Those are the same artefact — a value with more
 * than one way to write it — and so is `move`'s endpoint pair, each slot of
 * which is a scene-pixel number *or* a token like `offRight`: it gets a field
 * **and** a picker per slot, four parts for one control. A return type of one
 * field per control would have been known-wrong before it shipped.
 *
 * ## Where the refusals live
 *
 * {@link REFUSED_WIDGETS}, the same mechanism as `REFUSED_LAYER_VARIANTS` and
 * `ABSENT_OPERATIONS`: a registry records decisions by listing, and an absence
 * is the one thing a list cannot record. §9's last trap is *"a recorded note
 * is not a sensor"*, so `widgets.test.ts` does not take the entry's reasoning
 * on trust — it builds the scene the refused widget would have produced and
 * asks `site/scene.ts` whether it loads.
 *
 * ## There is no barrel
 *
 * `panels.ts`' reason, and `controlspec.ts`' after it: *"a barrel is a second
 * place a registry has to be registered."* Consumers import `./widgets.js`
 * directly, which also keeps this module inside `site/query.test.ts`'s cone
 * walk.
 */
import { CONTROL_SPECS } from './controlspec.js'
import type { ControlInfo, ControlShape, ControlUnit } from './controlspec.js'
import type { AssertNever, ParamDefault } from '../src/core/index.js'

/**
 * The units whose field is a number.
 *
 * **A partition of {@link ControlUnit}, guarded in both directions**, and that
 * is what makes it more than a convenience alias. A unit added upstream has to
 * be put in exactly one half or `_NoUnitUnpartitioned` fails to compile; a
 * unit listed in both halves fails `_NoUnitInBoth`. Deriving this with
 * `Exclude` from the non-numeric half instead would fail open — a new unit
 * would quietly become a quantity and get a spinner.
 *
 * `opaque` is in here and the inclusion is a decision, not a slip: `seed` is
 * an integer and wants a field that accepts integers, while *nothing about it
 * is ordered*, so the field it gets must not be a slider. The unit is what
 * carries that distinction to whoever renders the part.
 */
export type QuantityUnit =
  | 'scenePx'
  | 'platePx'
  | 'degrees'
  | 'depth'
  | 'seconds'
  | 'framesPerSecond'
  | 'multiplier'
  | 'opaque'

/** The units whose field is not a number. The other half of the partition above. */
type NonQuantityUnit = 'enum' | 'boolean' | 'text' | 'identity' | 'none' | 'unrecorded'

type _NoUnitUnpartitioned = AssertNever<Exclude<ControlUnit, QuantityUnit | NonQuantityUnit>>
type _NoUnitInBoth = AssertNever<Extract<QuantityUnit, NonQuantityUnit>>

/**
 * Where a field's starting value comes from, where the registry records one.
 *
 * **Tagged, because the descriptor it is read from is tagged.**
 * `ParamDefault`'s own docblock says the split exists *"so a consumer switches
 * over it exhaustively instead of sniffing the value's JavaScript type"*, and
 * this is that consumer. Collapsing `evaluated` and `rest-of-scene` into one
 * case carrying `number | 'remainder'` would put the sniff back: the renderer
 * would have to ask whether the value is a string to decide whether to show a
 * number at all.
 *
 * The cases are not a copy of `ParamDefault`'s — they are what a *field* does:
 *
 * - `literal` — show this value.
 * - `context` — show the named compile-context measurement. `push.to` defaults
 *   to wherever the layer sits, which is a different fact from any number.
 * - `absent` — show nothing, and mean it: omitting the parameter selects
 *   different behaviour rather than a value. `move.speed` is the one.
 * - `evaluated` — show this value, knowing the compiled track will not carry
 *   it; the evaluator substitutes it. `start` is the one.
 * - `rest-of-scene` — show nothing, meaning "to the end". **No number
 *   expresses it**, which is why it is a case rather than a value.
 */
export type WidgetInitial =
  | { readonly from: 'literal'; readonly value: number | string }
  | { readonly from: 'context'; readonly key: string }
  | { readonly from: 'absent' }
  | { readonly from: 'evaluated'; readonly value: number }
  | { readonly from: 'rest-of-scene' }

/** A numeric field, carrying the space its number is measured in (§2.7). */
export interface NumberPart {
  readonly kind: 'number'
  /** Carried down from the control, never re-derived. See {@link QuantityUnit}. */
  readonly unit: QuantityUnit
  /**
   * Present when the value is a *rate* in `unit` per second.
   *
   * `params.ts` refuses a `scenePxPerSecond` tag on purpose so that a consumer
   * whose rule is "scale every `scenePx` parameter" gets `move.speed` right
   * for free. A field that dropped the tag would offer a distance field for a
   * rate and reintroduce that defect one level further down.
   */
  readonly per?: 'second'
  /** Which member of an `[x, y]` pair this field writes; absent on a scalar. */
  readonly index?: 0 | 1
  /** Where the field starts, where the registry records it. */
  readonly initial?: WidgetInitial
}

/** A checkbox. */
export interface TogglePart {
  readonly kind: 'toggle'
  readonly initial?: WidgetInitial
}

/**
 * A free-text field.
 *
 * `syntax` is present when the field exists to accept a *form* the picker
 * beside it cannot list, and carries that form as the reader itself phrases
 * it, so a control's hint and the refusal an author sees cannot drift.
 */
export interface TextPart {
  readonly kind: 'text'
  readonly syntax?: string
  readonly initial?: WidgetInitial
}

/** A picker over a recorded vocabulary. Never emitted with an empty list. */
export interface ChoicePart {
  readonly kind: 'choice'
  readonly options: readonly string[]
  /**
   * Which member of an `[x, y]` pair this picker writes; absent on a scalar.
   *
   * {@link NumberPart.index}'s field, for {@link NumberPart.index}'s reason
   * and one more: the two slots of an endpoint pair accept **different**
   * names, so a renderer that paired a picker with its field by position
   * would be one index-arithmetic slip away from offering a vertical token
   * for the horizontal slot — which the verb refuses on load.
   */
  readonly index?: 0 | 1
  readonly initial?: WidgetInitial
}

/**
 * Not a field: a marker that design §9.3 has given this control to a spatial
 * instrument.
 *
 * `anim` belongs to the timeline and `mask` needs a thresholded picker over an
 * image; `ControlShape`'s `structured` member is the registry saying *"this
 * key needs an instrument, not a field"* per control instead of assumed. The
 * part exists rather than the spec being empty because these controls are
 * **covered** — routed, with an owner — and counting them as holes would
 * understate the floor.
 */
export interface InstrumentPart {
  readonly kind: 'instrument'
  readonly reason: string
}

export type WidgetPart = NumberPart | TogglePart | TextPart | ChoicePart | InstrumentPart

/** What a generic renderer puts on screen for one control. */
export interface WidgetSpec {
  /** The control this is for. Mirrors `ControlInfo.control`. */
  readonly control: string
  /** The fields, in the order they are written. Empty exactly when `deferred` is set. */
  readonly parts: readonly WidgetPart[]
  /**
   * Why there is no generated widget.
   *
   * Present exactly when `parts` is empty, and that biconditional is asserted
   * rather than documented: without it a control could be dropped silently and
   * {@link widgetlessControls} would still report zero holes.
   */
  readonly deferred?: string
}

/** What {@link REFUSED_WIDGETS} records about a control that gets no widget. */
export interface RefusedWidget {
  /** The `owner.key` this refuses. Mirrors the table key, as `ControlInfo.control` does. */
  readonly key: string
  /** Why, in prose a human can be shown. */
  readonly reason: string
}

/**
 * Controls that exist, are authorable, and get no generated widget anyway.
 *
 * Keyed by `owner.key` rather than by control id, because the decision is
 * about the *key* and the registry derives one control per variant from it:
 * four `layer.*.type` ids, one reason. Keyed by `string` for
 * `REFUSED_LAYER_VARIANTS`' reason — the point is to answer for names,
 * including names that are not controls.
 *
 * **A refusal here is a hole in R6 and is meant to read as one.** It is
 * recorded rather than papered over precisely so that the count of controls
 * the floor does not reach is a number somebody can see going up.
 */
export const REFUSED_WIDGETS: Record<string, RefusedWidget> = {
  'layer.type': {
    key: 'layer.type',
    reason:
      'A picker over a layer\'s discriminant writes a new variant name and changes nothing ' +
      'else, and `site/scene.ts` then checks the *new* variant\'s required fields against ' +
      'the old variant\'s keys. Measured over the browser-reachable variants, ten of the ' +
      'twelve bare retypes are rejected on load — a `text` layer retyped to `shape` arrives ' +
      'with no `shape` key and is refused with "layers[0].shape must be one of circle, rect" ' +
      '— so the author\'s next save does not reopen. The two that load are the worse half of ' +
      'the finding, not an escape from it: `image` → `gif` survives only because `image`\'s ' +
      'keys are a subset of `gif`\'s, and `gif` → `image` loads while the site validator\'s ' +
      'field-by-field rebuild silently drops `loop`, with no error anywhere. Nothing in the ' +
      'registry records which pairs are which, so a generated picker cannot offer the safe ' +
      'transition and withhold the rest; it can only offer all of them. Design §9.3 calls ' +
      'generated widgets "the floor that guarantees R6", and a floor whose use either ' +
      'produces a scene the editor will not load or deletes an authored key without saying ' +
      'so is not one. An absence somebody can count is the better failure. What is missing ' +
      'underneath is a migration that drops the old variant\'s keys and supplies the new ' +
      'one\'s required ones — `ABSENT_OPERATIONS["layer.retype"]`, raised by C-4, deferred ' +
      'with no owner and belonging to a later phase. The *control* stays registered: R6 is ' +
      'about every authorable key, `type` is in every scene file, and a spatial instrument ' +
      'for it (design §9.3\'s "any control that deserves one should get one and lose its ' +
      'widget") is exactly what the missing operation would be.',
  },
}

/**
 * Why this control has no generated widget, if it is one we have refused.
 *
 * `Object.hasOwn` and not a bare index: `REFUSED_WIDGETS['constructor']` is
 * the `Object` **function**, which is truthy, so an unguarded caller shows a
 * refusal whose key and reason are both `undefined` — well-formed prose that
 * explains nothing, which is worse than a visible wrong answer. E8 / R-l.
 */
export function refusedWidget(key: string): RefusedWidget | undefined {
  if (!Object.hasOwn(REFUSED_WIDGETS, key)) return undefined
  return REFUSED_WIDGETS[key]
}

/**
 * How many numeric fields an arity wants, and which member each one writes.
 *
 * The `default:` arm is §1.2k's and E14's form: an `AssertNever` that
 * **returns the existing fallback rather than throwing**, so widening
 * `ParamShape` upstream is a compile error here and zero runtime change. That
 * widening has happened once, exactly as written: `endpoint-pair` arrived and
 * landed here loudly, which is what this arm was for — a new arity silently
 * treated as a scalar would have shipped one field for a value that needs
 * two.
 *
 * `endpoint-pair` is two members like `pair`, and that is the whole of what
 * *this* function has to say about it: the slots are two, and whether each one
 * also gets a picker is {@link resolveWidget}'s question, not an arity's.
 */
function members(shape: ControlShape): readonly (0 | 1 | undefined)[] {
  switch (shape) {
    case 'scalar':
      return [undefined]
    case 'pair':
    case 'endpoint-pair':
      return [0, 1]
    case 'structured':
      return []
    default: {
      const unhandled: never = shape
      void unhandled
      return [undefined]
    }
  }
}

/**
 * What a field starts at, read from the descriptor's tag.
 *
 * The `default:` arm returns `absent` rather than throwing, for `members`'
 * reason and one of its own: an unrecognised tag must not be allowed to claim
 * a value, and showing an empty field is the only answer that cannot be wrong
 * about a default nothing here understands.
 *
 * `index` picks a member out of a pair default. A pair descriptor's value is
 * an `[x, y]`, and the field that writes `y` must start at `y`.
 */
function initialFor(def: ParamDefault, index: 0 | 1 | undefined): WidgetInitial {
  switch (def.from) {
    case 'value': {
      const v = def.value
      if (Array.isArray(v)) {
        const member = (v as readonly number[])[index ?? 0]
        return member === undefined ? { from: 'absent' } : { from: 'literal', value: member }
      }
      return { from: 'literal', value: v as number | string }
    }
    case 'ctx':
      return { from: 'context', key: def.key }
    case 'none':
      return { from: 'absent' }
    case 'eval':
      return { from: 'evaluated', value: def.value }
    case 'remainder':
      return { from: 'rest-of-scene' }
    default: {
      const unhandled: never = def
      void unhandled
      return { from: 'absent' }
    }
  }
}

/** A spec with no fields always says why; this is the only way to build one. */
function deferred(control: string, reason: string): WidgetSpec {
  return { control, parts: [], deferred: reason }
}

/**
 * The fields a generic renderer puts on screen for one control.
 *
 * **Pure and total.** Nothing is read but the argument — no registry lookup,
 * no clock, no DOM — so the same control always resolves to the same spec and
 * the function can be driven with a descriptor nobody has registered, which is
 * what lets its own test reach the arms no shipped control uses.
 *
 * The order of the three decisions is the content:
 *
 * 1. **A refusal wins.** A control somebody has decided must not have a
 *    generated widget does not get one because its unit happens to be
 *    renderable.
 * 2. **An instrument wins over a field.** `shape: 'structured'` is the
 *    registry's record that this key needs §9.3's spatial instrument, and it
 *    is a statement about the *value*, which no unit can override.
 * 3. **Then the unit chooses the field**, and the arity chooses how many —
 *    plus a picker beside each slot that accepts a name as well as a number.
 *
 * The `default:` arm is E14's `AssertNever` returning a fallback rather than
 * throwing: §1.2k reserves a runtime throw for registries where a wrong answer
 * ruins the artifact, and a control the editor cannot draw is cosmetic — it
 * fails loudly to the compiler and quietly, and countably, to the user.
 */
export function resolveWidget(control: ControlInfo): WidgetSpec {
  const refused = refusedWidget(`${control.owner}.${control.key}`)
  if (refused !== undefined) return deferred(control.control, refused.reason)

  if (control.shape === 'structured') {
    return {
      control: control.control,
      parts: [{
        kind: 'instrument',
        reason:
          'A structured value: design §9.3 gives timing to the timeline and depth to the ' +
          'depth strip, and the registry records per control which keys need an instrument ' +
          'rather than a field.',
      }],
    }
  }

  // A shape saying the slots accept names, with no names recorded, is the
  // enum arm's hole one field over: a picker over nothing is an instrument an
  // author cannot use and cannot tell is broken, and a field *without* the
  // picker would be worse still — it would silently withdraw the only way to
  // write `offRight` while looking complete. Every slot must have a
  // vocabulary or the control is a countable hole. `KeySpec.tokens` does not
  // exist, so a model key that took this shape would land here by design.
  if (
    control.shape === 'endpoint-pair' &&
    !(control.tokens !== undefined &&
      control.tokens.length === members(control.shape).length &&
      control.tokens.every(names => names.length > 0))
  ) {
    return deferred(
      control.control,
      'Each slot of this value takes a number or a name, and the registry does not record ' +
      'which names — so the picker that is half of the control would offer nothing. Record ' +
      'them per slot, beside the shape: the two slots of a pair do not accept the same ones.',
    )
  }

  const initial = control.default === undefined ? undefined : control.default
  const numbers = (unit: QuantityUnit): WidgetSpec => ({
    control: control.control,
    // One slot can want two parts. The number is written first and the picker
    // beside it rather than the two pickers being collected at the end: a
    // slot is one decision, and keeping its fields adjacent is what stops a
    // renderer pairing them up by index arithmetic over a flat list.
    parts: members(control.shape).flatMap((index): readonly WidgetPart[] => {
      const field: NumberPart = {
        kind: 'number',
        unit,
        ...(control.per === undefined ? {} : { per: control.per }),
        ...(index === undefined ? {} : { index }),
        ...(initial === undefined ? {} : { initial: initialFor(initial, index) }),
      }
      // Per slot, never flattened: `offLeft` is a horizontal distance and the
      // verb throws when it is written into `y`, so a picker offering the
      // whole vocabulary in both slots would let the floor produce a scene
      // the player refuses — `REFUSED_WIDGETS['layer.type']`'s failure, one
      // parameter over, and the reason that one gets no widget at all.
      const names =
        control.shape === 'endpoint-pair' && index !== undefined
          ? control.tokens?.[index]
          : undefined
      if (names === undefined) return [field]
      // No `initial`: the descriptor's default is a number or a pair of them,
      // so the recorded value belongs in the field that takes numbers. A
      // pre-selected token would claim a default the table does not hold.
      return [field, { kind: 'choice', options: names, index }]
    }),
  })

  switch (control.unit) {
    case 'scenePx':
    case 'platePx':
    case 'degrees':
    case 'depth':
    case 'seconds':
    case 'framesPerSecond':
    case 'multiplier':
    case 'opaque':
      return numbers(control.unit)

    case 'boolean':
      return {
        control: control.control,
        parts: [{
          kind: 'toggle',
          ...(initial === undefined ? {} : { initial: initialFor(initial, undefined) }),
        }],
      }

    case 'text':
    case 'identity':
      return {
        control: control.control,
        parts: [{
          kind: 'text',
          ...(initial === undefined ? {} : { initial: initialFor(initial, undefined) }),
        }],
      }

    case 'enum': {
      // A picker over nothing is an instrument an author cannot use and cannot
      // tell is broken. `KeySpec.values` is partial on purpose — a key that
      // gains an enum unit still produces a control — so this is the sensor
      // that names it, the way `unrecordedUnits` names a missing unit.
      if (control.values === undefined || control.values.length === 0) {
        return deferred(
          control.control,
          'An enum whose accepted values the registry does not record, so a picker over it ' +
          'would offer nothing. Record them on the key\'s spec, beside its unit.',
        )
      }
      const parts: WidgetPart[] = [{
        kind: 'choice',
        options: control.values,
        ...(initial === undefined ? {} : { initial: initialFor(initial, undefined) }),
      }]
      // The reader accepts a form the list cannot hold, so the control offers
      // both — the artefact a value with two spellings always wants.
      if (control.open !== undefined) parts.push({ kind: 'text', syntax: control.open })
      return { control: control.control, parts }
    }

    case 'none':
      // `none` means *no unit applies*, which is true of a structured value
      // and of nothing else — and a structured value has already returned
      // above. Reaching here is a mis-tag, and guessing would hand a text
      // field to a `Track | Preset | (…)[]`.
      return deferred(
        control.control,
        'The unit says no unit applies, which is only true of a structured value, and the ' +
        'arity says this is a plain one. One of the two is wrong; a field built on either ' +
        'reading would be wrong about the other.',
      )

    case 'unrecorded':
      return deferred(
        control.control,
        'No unit has been recorded for this key, so nothing here knows what kind of field it ' +
        'wants. `unrecordedUnits` names it from the registry side.',
      )

    default: {
      const unhandled: never = control.unit
      void unhandled
      return deferred(
        control.control,
        'No field is defined for this unit. A unit added to the vocabulary reaches this arm, ' +
        'and the compile-time guard above is what names the file to edit.',
      )
    }
  }
}

/**
 * The controls the floor does not reach, sorted.
 *
 * §9's *"a recorded note is not a sensor"* applied to R6: "every control is
 * exposed" is only worth asserting if the exceptions are countable, and a
 * reader is what makes the count fall out of the registry rather than out of
 * somebody's memory of which ones were hard.
 *
 * `specs` defaults to the shipped registry, and the parameter is what lets the
 * sentence above be tested: a control that should appear here is unobservable
 * otherwise, and "the floor reaches everything but the refusals" would be
 * provable only of the registry that shipped. `deriveControls`' and
 * `unrecordedUnits`' bargain, for the same reason.
 */
export function widgetlessControls(
  specs: readonly ControlInfo[] = CONTROL_SPECS,
): readonly string[] {
  return specs
    .filter(spec => resolveWidget(spec).parts.length === 0)
    .map(spec => spec.control)
    .sort()
}

/**
 * The controls routed to a spatial instrument rather than to a field, sorted.
 *
 * Kept apart from {@link widgetlessControls} because the two absences mean
 * opposite things. A control here is **covered**: design §9.3 named its owner,
 * and a generated field for it would be the wrong instrument rather than a
 * missing one. A control there is uncovered and somebody should mind.
 */
export function instrumentedControls(
  specs: readonly ControlInfo[] = CONTROL_SPECS,
): readonly string[] {
  return specs
    .filter(spec => resolveWidget(spec).parts.some(part => part.kind === 'instrument'))
    .map(spec => spec.control)
    .sort()
}
