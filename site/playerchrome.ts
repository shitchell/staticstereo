/**
 * The player's chrome, as data: what boxes exist around the plate, where they
 * sit, and which of them take clicks.
 *
 * ## Why a tree and not DOM-building code
 *
 * No tier of this project has a browser — the test environment is plain node,
 * with neither jsdom nor happy-dom installed — and design §12 excludes
 * component DOM from testing outright. Three of the player's acceptance
 * criteria are nonetheless statements about layout and event policy:
 * transport in every framing (R16), fullscreen targeting a wrapper with the
 * canvas still clickable (R15, design §8.2), and nothing above the canvas in
 * normal flow (design §8.3). Written as `document.createElement` calls those
 * rules would be assertable only by a browser we do not run, which in practice
 * means not assertable at all — which is how the current page ended up with no
 * transport in present mode (`site/styles.css:592-599` hides `.timeline`,
 * the element that holds `#play` and `#scrub`) without a single test noticing.
 *
 * So the policy is a value. {@link chromeSpec} returns a plain tree, every
 * rule above is a predicate over that tree, and the renderer that applies it
 * to real elements holds no decisions at all — it reads `tag`, `flow` and
 * `pointerEvents` and does as it is told. Anything the renderer has to *decide*
 * belongs here instead; that is the line.
 *
 * It is also what P3 needs. The editor shell lifts the player into itself and
 * has to obey the same §8.3 measurement; a data tree it can inspect is worth
 * more to it than DOM-construction code it would have to re-read.
 *
 * **No DOM types appear in this file, by rule** — not `HTMLElement`, not
 * `Element`, not `CSSStyleDeclaration`. `tag` is a string because this module
 * is not allowed to know what a tag resolves to.
 */

/* ------------------------------------------------------------------- roles */

/**
 * Role names are exported as constants and never spelled at call sites.
 *
 * The renderer keys on them, every predicate here keys on them and the tests
 * key on them; three independent spellings of `'transport'` would silently
 * become three roles, and the failure mode is a rule that holds over a node
 * nothing renders. A constant makes the typo a resolution error instead.
 */
export const ROLE_WRAPPER = 'wrapper'

/** The plate itself. The only node whose contents this module knows nothing about. */
export const ROLE_CANVAS = 'canvas'

/** The box the controls live in — the thing shown and hidden, and positioned. */
export const ROLE_TRANSPORT = 'transport'

/**
 * Every control role begins with this.
 *
 * A prefix rather than a list because the `pointer-events: auto` rule of
 * design §8.2 has to hold for controls that do not exist yet. A hand-kept set
 * would let a control added next year default to the container's
 * `pointer-events: none` and be unclickable, with every existing test green —
 * exactly the class of bug this module was written to make impossible.
 */
export const CONTROL_PREFIX = 'control:'

/** Play/pause. R16 names this one specifically: it must work while fullscreen. */
export const ROLE_PLAY = `${CONTROL_PREFIX}play`

/** The scrubber. Transport without seek is a toggle, not a transport. */
export const ROLE_SEEK = `${CONTROL_PREFIX}seek`

/**
 * Enter or leave fullscreen (R15).
 *
 * Present in every framing, including `fullscreen` itself, because it is a
 * toggle: in the inline editor preview it is R15's "option to fullscreen the
 * inline stereogram preview", and in fullscreen it is the only *visible* way
 * back out. Escape also works, but a control surface that relies on the user
 * knowing an unlabelled key is the same mistake as having no transport.
 */
export const ROLE_FULLSCREEN = `${CONTROL_PREFIX}fullscreen`

/** True for a control node's role. See {@link CONTROL_PREFIX} for why it is a prefix test. */
export function isControlRole(role: string): boolean {
  return role.startsWith(CONTROL_PREFIX)
}

/* ---------------------------------------------------------------- the tree */

/**
 * How a node is taken out of, or left in, its parent's normal flow.
 *
 * Three values and not a free-form CSS `position`, because only the
 * in-flow/out-of-flow distinction is load-bearing here: design §8.3's
 * measurement is about what *displaces* the canvas, and `relative` displaces
 * exactly as `static` does while `sticky` is `relative` until it is not.
 * Neither can be described as in or out of flow by its name alone, so neither
 * is offered. The renderer maps these three onto CSS.
 */
export type Flow = 'flow' | 'absolute' | 'fixed'

/**
 * One box. `children` is absent rather than empty for a leaf, so the tree
 * reads as a tree rather than as a table with a nullable column.
 */
export interface ChromeNode {
  /** One of the `ROLE_*` constants, or `CONTROL_PREFIX` + a control's name. */
  readonly role: string
  /** The element name the renderer creates. A string: see the file header. */
  readonly tag: string
  readonly flow: Flow
  /**
   * `pointer-events`, where this module has an opinion. Absent means "do not
   * set it" — which is not the same as `'auto'`, because an explicit `auto`
   * re-enables hit-testing under an ancestor that disabled it, and the canvas
   * must keep the plain default so that nothing here can be mistaken for a
   * reason it is clickable.
   */
  readonly pointerEvents?: 'none' | 'auto'
  readonly children?: readonly ChromeNode[]
}

/** Every node of `spec`, `spec` itself first, parents before their children. */
export function nodesOf(spec: ChromeNode): ChromeNode[] {
  const out: ChromeNode[] = [spec]
  for (const child of spec.children ?? []) out.push(...nodesOf(child))
  return out
}

/**
 * The chain from `spec` down to the first node with `role`, both ends
 * included, or `undefined` if there is no such node.
 *
 * The chain and not the node, because every interesting question about a node
 * here is a question about what is *above* it: an ancestor can make a canvas
 * unclickable (design §8.2) and an ancestor's earlier children can displace it
 * (design §8.3). A finder that returned the node alone would make both
 * unaskable.
 */
export function pathToRole(spec: ChromeNode, role: string): ChromeNode[] | undefined {
  if (spec.role === role) return [spec]
  for (const child of spec.children ?? []) {
    const below = pathToRole(child, role)
    if (below !== undefined) return [spec, ...below]
  }
  return undefined
}

/**
 * The smallest tree that can satisfy every rule in this module: a wrapper, a
 * canvas, a transport container, and the two controls R16 and design §7.4
 * require in it.
 *
 * Exported because it is the vacuity floor the tests assert against. Every
 * structural rule here is of the form "no node does X", and a tree with no
 * nodes satisfies all of them.
 */
export const MIN_CHROME_NODES = 5

/* ------------------------------------------------------------- the framings */

/**
 * The three framings design §8.2 names, plus the one it is lifted out of.
 *
 * `inline` is the editor's preview pane (R15's "normal editing mode"); it is
 * in this enumeration rather than outside it because P3 lifts this player into
 * the editor shell, and a layout rule that holds for three of four framings is
 * a rule the shell gets to break.
 */
export type Framing = 'inline' | 'present' | 'embed' | 'fullscreen'

/** What {@link FRAMINGS} records about one framing. */
export interface FramingInfo {
  /** The framing's own name, so an entry carries its key when passed around alone. */
  readonly framing: Framing
  /** One line, human-facing: what container the player is being shown in. */
  readonly description: string
}

/**
 * The framings, keyed by name.
 *
 * A `Record<Framing, …>` and not an array: adding a member to the union
 * without adding it here is a compile error, which is the only mechanism that
 * makes "every framing has a transport" a claim about the type rather than
 * about today's four strings. {@link chromeSpec}'s `switch` is the second such
 * mechanism, and they fail in different places on purpose — this one catches a
 * framing that was never described, that one catches a framing that was never
 * given a shape.
 */
export const FRAMINGS: Record<Framing, FramingInfo> = {
  inline: {
    framing: 'inline',
    description: "The editor's preview pane, with the rest of the shell around it.",
  },
  present: {
    framing: 'present',
    description: '`?present=1` — the plate alone, filling the page, no editor.',
  },
  embed: {
    framing: 'embed',
    description: 'An `<iframe>` on somebody else’s page, sized by its container (R14).',
  },
  fullscreen: {
    framing: 'fullscreen',
    description: 'The wrapper handed to `requestFullscreen`, from the editor or the player (R15).',
  },
}

/** Every framing. Derived from {@link FRAMINGS} so the two cannot drift. */
export const FRAMING_NAMES: readonly Framing[] = Object.keys(FRAMINGS) as Framing[]

/** The compile-time half of the exhaustiveness guard. See {@link chromeSpec}. */
function assertNever(value: never, what: string): never {
  throw new Error(`unhandled ${what}: ${JSON.stringify(value)}`)
}

/**
 * The chrome for one framing. The root is always the wrapper.
 *
 * Total over {@link Framing} by construction — the `switch` has no `default`
 * returning a fallback, only `assertNever`, so a new framing is a type error
 * at the call to it rather than a silently chromeless player.
 *
 * What actually differs between the framings is one thing: whether the
 * transport sits below the plate in normal flow or floats over it. In `inline`
 * the player is one pane of a shell that already has somewhere to put a strip,
 * so the transport takes its own row and nothing overlaps the plate. In the
 * other three the plate *is* the page, so a row below it would either shrink
 * the plate or push it up — and design §8.3 forbids changing what the canvas
 * is laid out against. Overlaying is what is left, and {@link chromeVisible}
 * is the other half of making that acceptable.
 */
export function chromeSpec(framing: Framing): ChromeNode {
  switch (framing) {
    case 'inline':
      return wrapper('flow')
    case 'present':
    case 'embed':
    case 'fullscreen':
      return wrapper('absolute')
    default:
      return assertNever(framing, 'framing')
  }
}

/**
 * The tree, given where the transport goes.
 *
 * One builder for all four framings rather than four literals: the rules in
 * this module are mostly about the *relationship* between the canvas and the
 * transport, and four copies of that relationship would be four chances to get
 * one of them wrong in a way only one framing's test catches.
 *
 * `absolute` and not `fixed` for the overlaid case: the positioning context
 * must be the wrapper, because the wrapper is what `requestFullscreen` is
 * handed ({@link fullscreenTarget}), and a `fixed` child of a fullscreen
 * element is positioned against the viewport — which is the same rectangle
 * right up until the player is also an `<iframe>` inside a scrolled page, and
 * then it is not.
 */
function wrapper(transportFlow: Flow): ChromeNode {
  return {
    role: ROLE_WRAPPER,
    tag: 'div',
    flow: 'flow',
    children: [canvas(), transport(transportFlow)],
  }
}

/**
 * The plate.
 *
 * No `pointerEvents` of its own, deliberately — see {@link ChromeNode}. It is
 * clickable because nothing above it says otherwise, and that is the property
 * the tests assert, because it is the one that actually has to hold.
 */
function canvas(): ChromeNode {
  return { role: ROLE_CANVAS, tag: 'canvas', flow: 'flow' }
}

/**
 * The control strip. Its children are the controls, and only controls.
 *
 * **The container is `pointer-events: none` and each control is `auto`** —
 * design §8.2, which corrected revision 1's blanket `none`: a rule "correctly
 * inherited from today's non-interactive `present-hint` and wrongly applied to
 * a control surface". A strip spanning the plate's width that ate every click
 * that missed a button would break canvas clicking, which is how the
 * diagnostics band is placed. Each control re-enables itself, so the only
 * pixels that stop a click are the pixels of an actual control.
 *
 * Written as a `map` over the control list rather than as three literals each
 * carrying `pointerEvents: 'auto'`: a fourth control added by hand is exactly
 * the thing that would be added without it, and it would be unclickable with
 * the suite green.
 */
function transport(flow: Flow): ChromeNode {
  const controls: readonly { role: string; tag: string }[] = [
    { role: ROLE_PLAY, tag: 'button' },
    { role: ROLE_SEEK, tag: 'input' },
    { role: ROLE_FULLSCREEN, tag: 'button' },
  ]
  return {
    role: ROLE_TRANSPORT,
    tag: 'div',
    flow,
    pointerEvents: 'none',
    children: controls.map(c => ({ ...c, flow: 'flow' as const, pointerEvents: 'auto' as const })),
  }
}

/* ------------------------------------------------------------- fullscreen */

/**
 * The role of the element to hand to `requestFullscreen`.
 *
 * **The wrapper, never the canvas** — design §8.2, already resolved there:
 * "Fullscreening the canvas would make sibling transport unrenderable and
 * R15+R16 unimplementable together." A fullscreen element's siblings are not
 * painted; a transport that is the canvas's sibling therefore disappears at
 * the exact moment R16 says play/pause must work.
 *
 * This is net-new rather than a retarget. Today's one call
 * (`site/main.ts:1056`) is handed `document.documentElement`, which is neither
 * — it works only because every presentation style keys off a class on `html`
 * rather than off `:fullscreen`, and it leaves the player unable to be
 * fullscreened as a component, which is precisely what R15 asks for.
 *
 * Returns a **role**, not a node and certainly not an element: resolving a
 * role to something `requestFullscreen` can be called on is the renderer's
 * job, and this module is not allowed to name the type that would require.
 *
 * Throws on a tree not rooted at the wrapper rather than searching for one.
 * The root *is* the wrapper by construction, so a tree that fails this is
 * malformed, and the alternative — returning {@link ROLE_WRAPPER} regardless —
 * would let a renderer fullscreen an element the spec does not contain.
 */
export function fullscreenTarget(spec: ChromeNode): string {
  if (spec.role !== ROLE_WRAPPER) {
    throw new Error(`fullscreenTarget: spec must be rooted at the ${ROLE_WRAPPER}, got ${spec.role}`)
  }
  return spec.role
}

/* ------------------------------------------------- flow around the canvas */

/** What {@link flowViolations} found. */
export type FlowViolationKind =
  /** An in-flow node precedes the canvas's branch, displacing its origin. */
  | 'above-canvas'
  /** The transport is in flow and not after the canvas. */
  | 'transport-placement'
  /** The spec has no canvas, or no transport, so the rules above say nothing. */
  | 'absent'

export interface FlowViolation {
  readonly kind: FlowViolationKind
  /** The offending node's role — or, for `absent`, the role that is missing. */
  readonly role: string
  /** Where it was found, or where it was looked for. */
  readonly parentRole: string
  /** Why it is a violation, in prose a reviewer can act on. */
  readonly detail: string
}

/**
 * Everything in `root` that breaks design §8.3. An empty array is conformance.
 *
 * ## The measurement this enforces — read before moving a control
 *
 * This is not a style preference and it is not tunable. The page's own record,
 * quoted by design §8.3: adding a control **above** the canvas moved its
 * fractional device-pixel origin and took edge-row disagreement from
 * **13 device px to 445 at dpr 1.5** — a 34× worsening — and "the sensitivity
 * is to the exact sub-pixel and is not something to tune". `site/main.ts:345`
 * records the other half: a negative-margin correction for the same fractional
 * origin was measured across 96 (viewport, dpr, mode) combinations, produced
 * byte-identical output, and was deleted. There is no nudge that buys this
 * back. The only thing that works is not displacing the canvas.
 *
 * So: **transport chrome goes below the canvas, or out of flow entirely.**
 * Somebody will want a toolbar up there. This is the answer, and the number is
 * what makes it an answer rather than an opinion.
 *
 * ## What is actually checked
 *
 * Not "the canvas is the first child" — that is a statement about one tree
 * shape. What displaces the canvas is any in-flow box preceding **its branch**
 * at **any** level, because a strip above the box the canvas is inside moves
 * it by exactly as much as one beside it. So the walk goes from the root down
 * to the canvas and inspects the preceding siblings at every step. A preceding
 * sibling is permitted only when it is `absolute` or `fixed`: out of flow, it
 * contributes nothing to its parent's layout and the canvas's origin does not
 * know it exists.
 *
 * A missing canvas or transport is itself reported. Every other rule here is
 * of the form "nothing does X", so without this an empty wrapper — the exact
 * shape a half-finished renderer produces — would be perfectly conformant.
 */
export function flowViolations(root: ChromeNode): FlowViolation[] {
  const found: FlowViolation[] = []
  const canvasPath = pathToRole(root, ROLE_CANVAS)
  const transportPath = pathToRole(root, ROLE_TRANSPORT)

  if (canvasPath === undefined) {
    found.push({
      kind: 'absent',
      role: ROLE_CANVAS,
      parentRole: root.role,
      detail: 'no canvas in this spec, so no rule about what sits above it can hold',
    })
  }
  if (transportPath === undefined) {
    found.push({
      kind: 'absent',
      role: ROLE_TRANSPORT,
      parentRole: root.role,
      detail: 'no transport container in this spec, so no rule about where it sits can hold',
    })
  }
  if (canvasPath === undefined || transportPath === undefined) return found

  for (let i = 0; i + 1 < canvasPath.length; i++) {
    const parent = canvasPath[i]!
    const siblings = parent.children ?? []
    const onPath = siblings.indexOf(canvasPath[i + 1]!)
    for (const before of siblings.slice(0, onPath)) {
      if (before.flow !== 'flow') continue
      found.push({
        kind: 'above-canvas',
        role: before.role,
        parentRole: parent.role,
        detail:
          'in normal flow before the canvas’s branch: it moves the canvas’s fractional ' +
          'device-pixel origin, which took edge-row disagreement from 13 device px to 445 ' +
          'at dpr 1.5 the one time it was measured (design §8.3)',
      })
    }
  }

  const transport = transportPath[transportPath.length - 1]!
  if (transport.flow === 'flow') {
    const canvasParent = canvasPath[canvasPath.length - 2]
    const transportParent = transportPath[transportPath.length - 2]
    const siblings = canvasParent?.children ?? []
    const after =
      canvasParent !== undefined &&
      transportParent === canvasParent &&
      siblings.indexOf(transport) > siblings.indexOf(canvasPath[canvasPath.length - 1]!)
    if (!after) {
      found.push({
        kind: 'transport-placement',
        role: transport.role,
        parentRole: transportParent?.role ?? '',
        detail:
          'an in-flow transport must be a following sibling of the canvas; anywhere else its ' +
          'height is part of what the canvas is laid out against (design §8.3)',
      })
    }
  }

  return found
}

/* --------------------------------------------------------- chrome auto-hide */

/**
 * How long the chrome stays up after the last activity, in **milliseconds of
 * wall-clock time** — not scene time, which is in seconds and stops when the
 * transport does.
 *
 * Design §8.2 says "a few seconds" and does not say how many, so this is a
 * judgement inside a stated range rather than a measurement, and it is
 * recorded as one. Three seconds is bounded below by the time a viewer needs
 * to notice the strip, decide, and travel to a control after the movement
 * that summoned it — under about a second and the chrome is gone before the
 * pointer arrives, which reads as the page fighting back. It is bounded above
 * by how long an overlay is allowed to sit on top of a plate the viewer is
 * trying to fuse: fusion takes seconds to establish and anything moving in
 * the field delays it, so a long delay converts an accessibility affordance
 * into the thing it was protecting against.
 *
 * Named and exported rather than inlined because the renderer schedules
 * against it and the tests assert against it, and three independent spellings
 * of "a few seconds" would be three different policies.
 */
export const CHROME_IDLE_MS = 3000

/**
 * What the auto-hide policy needs to know. Supplied by the caller and
 * returned by {@link noteActivity}; nothing here is stored in this module.
 */
export interface ChromeActivity {
  /** Wall clock in milliseconds at the last key press or pointer movement. */
  readonly lastActivityMs: number
  /**
   * Whether the transport is playing. Optional, and **absent means paused** —
   * see {@link chromeVisible} for why that is the safe way round.
   */
  readonly playing?: boolean
}

/**
 * Should the chrome be shown at wall-clock `nowMs`?
 *
 * A pure function of an explicit state and an injected clock — no timers, no
 * DOM, no `Date.now` — for the same recorded reason as `site/transport.ts`:
 * P3 lifts this into the editor shell, and anything entangled with the
 * player's page cannot be lifted. It is also what makes the whole policy
 * testable in plain node, which is the only environment this project has.
 *
 * **Only a playing transport hides its chrome.** Design §8.2 states the
 * auto-hide without qualification, but a paused player showing no controls
 * has no visible way to resume — the one thing R16 exists to guarantee — and
 * "move the mouse to find out whether there is a play button" is not a
 * discoverable affordance. Hiding also has a purpose only while something is
 * moving under it: the whole argument for an overlay (§8.3 forbids a strip
 * above the canvas, and a strip below it in present mode would displace the
 * plate) is that it gets out of the way *during playback*. A still scene,
 * which never plays, therefore keeps its chrome forever, which is correct:
 * there is nothing to watch it get out of the way of.
 *
 * `playing` is optional and an absent flag counts as paused, which is the
 * safe default of the two. Chrome that will not hide costs a strip of plate;
 * chrome that hides with no way back costs the player. A caller that wants
 * the hiding behaviour has to say so.
 *
 * **Degenerate clocks all resolve to visible**, each for the same reason:
 * visible is the state a user can act from, so it is what an unusable clock
 * reading should fall back to.
 * - `nowMs` **earlier** than `lastActivityMs` — a clock stepped backwards, or
 *   a stamp taken from a different clock. Treating the negative interval as
 *   "a long time ago" would blank the controls on a machine that just
 *   resynchronised its time.
 * - `nowMs` **equal** to it: zero elapsed, visible, which is the same answer
 *   the general rule gives and is stated only so the boundary is not an
 *   accident.
 * - **Non-finite** either side: no interval exists. `NaN` already compares
 *   false against everything, so a naive `elapsed < CHROME_IDLE_MS` would
 *   hide the chrome; the explicit check makes the answer a decision rather
 *   than a consequence of IEEE-754.
 *
 * The delay's own boundary belongs to hidden — visible iff `elapsed <
 * CHROME_IDLE_MS` — so the constant reads as "visible for this long, then
 * gone", and a clock that happens to tick exactly on it is not a special case.
 */
export function chromeVisible(state: ChromeActivity, nowMs: number): boolean {
  if (state.playing !== true) return true
  if (!Number.isFinite(nowMs) || !Number.isFinite(state.lastActivityMs)) return true
  const elapsed = nowMs - state.lastActivityMs
  if (elapsed < 0) return true
  return elapsed < CHROME_IDLE_MS
}

/**
 * The state after a key press or a pointer movement at `nowMs`.
 *
 * A transition rather than a mutation, so the caller owns the state and this
 * module stays a set of functions — the shape `site/transport.ts` already
 * uses and the shape P3's store can adopt without unpicking anything.
 *
 * A non-finite reading is refused and the state returned unchanged. Storing
 * it would make every later comparison non-finite and so pin the chrome
 * visible for the rest of the session, which is a worse failure than losing
 * one activity event: the next real one re-anchors it.
 */
export function noteActivity(state: ChromeActivity, nowMs: number): ChromeActivity {
  if (!Number.isFinite(nowMs)) return state
  return { ...state, lastActivityMs: nowMs }
}
