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

/** The control strip. Its children are the controls, and only controls. */
function transport(flow: Flow): ChromeNode {
  return {
    role: ROLE_TRANSPORT,
    tag: 'div',
    flow,
    children: [
      { role: ROLE_PLAY, tag: 'button', flow: 'flow' },
      { role: ROLE_SEEK, tag: 'input', flow: 'flow' },
      { role: ROLE_FULLSCREEN, tag: 'button', flow: 'flow' },
    ],
  }
}
