/**
 * Apply a {@link ChromeNode} tree to real elements. **It decides nothing.**
 *
 * ## The line, and why it is drawn here
 *
 * `playerchrome.ts` holds the policy as data — what boxes exist, which of them
 * are in flow, which of them take clicks — precisely because no tier of this
 * project has a browser and design §12 excludes component DOM from testing
 * outright. That is only worth anything if the thing that *executes* the tree
 * adds nothing of its own. So this module reads `tag`, `flow` and
 * `pointerEvents` and does as it is told, and the one rule for anybody editing
 * it is: **if you find yourself writing a conditional on the framing, that
 * conditional belongs in `playerchrome.ts`.** A second module deciding what
 * the first one already decided is two answers that disagree the first time
 * either is edited, and the disagreement is invisible — a transport in the
 * wrong place still renders.
 *
 * `chromedom.test.ts` asserts that line as text: this file may not mention a
 * framing, and `'absolute'` may appear exactly once, inside
 * {@link positionFor}.
 *
 * ## What is not policy but still lives here
 *
 * Two kinds of thing, and both are about *presentation of a given node* rather
 * than about *which nodes exist*:
 *
 * - **Class names.** The tree speaks in roles; CSS cannot. The mapping is one
 *   table ({@link ROLE_RENDERING}) and the renderer refuses a role that is not
 *   in it, so a role added to `playerchrome.ts` tomorrow fails loudly instead
 *   of rendering as an unstyled `<div>`.
 * - **Element attributes a tag cannot supply.** `ChromeNode.tag` is a string
 *   because that module is not allowed to know what a tag resolves to, so the
 *   tree says `input` and stops. An `<input>` with no `type` is a **text
 *   box** — a silent failure exactly where the scrubber belongs — so the
 *   `type` and the accessible name are set from the same table.
 *
 * ## Where position comes from, and why the stylesheet must not say it too
 *
 * From the tree, at apply time. `flow` is a field of `ChromeNode` and
 * {@link positionFor} maps it onto CSS, so the stylesheet declares no
 * `position: absolute|fixed` for the transport at all — if both claimed it,
 * which one won would depend on specificity and nobody could tell from reading
 * either file. `pointer-events` is the deliberate exception: the tree sets it
 * inline *and* the stylesheet declares the same values, because the sheet has
 * to be correct for markup that was not built by this function (P3's shell),
 * and a test pins the two to the same values so they cannot drift.
 */

import { CONTROL_PREFIX, ROLE_CANVAS, ROLE_FULLSCREEN, ROLE_PLAY, ROLE_SEEK, ROLE_TRANSPORT, ROLE_WRAPPER, isControlRole } from './playerchrome.js'
import type { ChromeNode, Flow } from './playerchrome.js'

/* ------------------------------------------------------------ class names */

/**
 * The prefix on every class this module emits.
 *
 * Namespaced because the player is embedded in pages we will never see (R14)
 * and lifted into the editor shell by P3, and a bare `.transport` would
 * collide with either. Four letters of the project's own name is the cheapest
 * thing that cannot collide by accident.
 */
export const CLASS_PREFIX = 'stst-'

export const CLASS_WRAPPER = `${CLASS_PREFIX}player`
export const CLASS_PLATE = `${CLASS_PREFIX}plate`
export const CLASS_TRANSPORT = `${CLASS_PREFIX}transport`

/**
 * The class every control carries, whatever it is.
 *
 * One shared class and not a rule per control, for `CONTROL_PREFIX`'s recorded
 * reason: the `pointer-events: auto` that makes a control clickable under the
 * container's `none` has to hold for controls that do not exist yet, and a
 * hand-kept list of selectors would let one added next year be unclickable
 * with the whole suite green.
 */
export const CLASS_CONTROL = `${CLASS_PREFIX}control`

/** The stylesheet that goes with this renderer, named once so no path is typed twice. */
export const PLAYER_STYLESHEET = 'player.css'

/* --------------------------------------------------------- the role table */

/** How one role is realised: the classes it carries and the attributes it needs. */
export interface RoleRendering {
  /**
   * Classes, **most general first**. The first is the one CSS rules key on
   * and the one {@link primaryClassOf} returns; later ones are for a control
   * that wants its own icon and nothing else.
   */
  readonly classes: readonly string[]
  /** Attributes the tag cannot imply. See the file header. */
  readonly attrs?: Readonly<Record<string, string>>
}

/**
 * Every role this renderer knows, explicitly.
 *
 * Explicit, and not a default arm, because that is the whole mechanism: a role
 * added to `playerchrome.ts` without an entry here throws from
 * {@link renderingFor} rather than rendering as an unstyled, unselectable box
 * that looks like a layout bug. Controls are the one exception, and a
 * deliberate one — see {@link renderingFor}.
 */
export const ROLE_RENDERING: Readonly<Record<string, RoleRendering>> = {
  [ROLE_WRAPPER]: { classes: [CLASS_WRAPPER] },
  [ROLE_CANVAS]: { classes: [CLASS_PLATE] },
  [ROLE_TRANSPORT]: { classes: [CLASS_TRANSPORT] },
  [ROLE_PLAY]: {
    classes: [CLASS_CONTROL, `${CLASS_CONTROL}-play`],
    // `type="button"` and not the default `submit`: a button inside a form on
    // somebody else's page would otherwise submit it. R16 names this control
    // specifically as the one that must work in every framing.
    attrs: { type: 'button', 'aria-label': 'Play or pause' },
  },
  [ROLE_SEEK]: {
    classes: [CLASS_CONTROL, `${CLASS_CONTROL}-seek`],
    // Without `type`, this is a text box. The tree cannot say so: `tag` is a
    // string because `playerchrome.ts` is not allowed to know what a tag
    // resolves to.
    attrs: { type: 'range', 'aria-label': 'Seek' },
  },
  [ROLE_FULLSCREEN]: {
    classes: [CLASS_CONTROL, `${CLASS_CONTROL}-fullscreen`],
    attrs: { type: 'button', 'aria-label': 'Full screen' },
  },
}

/** A role name's tail, as a CSS class must look. */
const CLASS_SAFE = /^[a-z][a-z0-9-]*$/

/**
 * How to render `role`.
 *
 * Known roles come from {@link ROLE_RENDERING}. A **control** role that is not
 * in the table is still rendered — with the shared class and no attributes —
 * because `playerchrome.ts`'s `CONTROL_PREFIX` docblock records that the
 * `pointer-events: auto` rule must hold for controls that do not exist yet,
 * and failing closed on a control would be failing closed on the exact case
 * the prefix was invented for.
 *
 * Everything else throws. That asymmetry is the point: a new control is
 * covered by a rule, a new *structural* role is a hole somebody has to fill.
 */
export function renderingFor(role: string): RoleRendering {
  const known = ROLE_RENDERING[role]
  if (known !== undefined) return known
  if (!isControlRole(role)) {
    throw new Error(
      `renderingFor: unknown chrome role ${JSON.stringify(role)} — add it to ROLE_RENDERING ` +
      `in site/chromedom.ts, or give it the ${JSON.stringify(CONTROL_PREFIX)} prefix if it is a control`,
    )
  }
  const name = role.slice(CONTROL_PREFIX.length)
  if (!CLASS_SAFE.test(name)) {
    throw new Error(
      `renderingFor: control role ${JSON.stringify(role)} does not spell a CSS class — ` +
      `expected ${CLASS_SAFE.source} after the prefix`,
    )
  }
  return { classes: [CLASS_CONTROL, `${CLASS_CONTROL}-${name}`] }
}

/**
 * The class a CSS rule should key on for this role.
 *
 * Exported so that a test can compare the stylesheet's `pointer-events`
 * declarations against the tree's, selector by selector, without either side
 * writing a class name out by hand.
 */
export function primaryClassOf(role: string): string {
  return renderingFor(role).classes[0]!
}

/* ------------------------------------------------------------- the mapping */

/**
 * `Flow` → CSS `position`, where the tree has an opinion.
 *
 * **`'flow'` maps to the empty string, which is a non-claim and not a bug.**
 * `Flow` has three members because only the in-flow/out-of-flow distinction is
 * load-bearing: `playerchrome.ts` records that `relative` displaces exactly as
 * `static` does, which is why neither spelling is offered. So `'flow'` says "I
 * am in my parent's flow" and says nothing about `position` — and `'static'`
 * would say something, loudly, inline, where nothing can override it.
 *
 * The casualty would be the wrapper, which is a `'flow'` node. `player.css`
 * gives it `position: relative` because the overlaid transport is `absolute`
 * and not `fixed` *precisely* so that its containing block is the wrapper —
 * the element handed to `requestFullscreen` — rather than the viewport, which
 * stops being the same rectangle the moment the player is an `<iframe>` in a
 * scrolled page. An inline `static` here would silently reparent every
 * overlaid transport to the initial containing block, and it would look right
 * until the host page scrolled.
 *
 * Assigning `''` is still deterministic on a reused element: it *removes* the
 * inline declaration rather than leaving the previous framing's value behind.
 *
 * The `switch` ends in a throw rather than a fallback so that a fourth member
 * of `Flow` is a compile error naming this spot, not a silently unpositioned
 * overlay sitting in the flow above the canvas.
 */
export function positionFor(flow: Flow): string {
  switch (flow) {
    case 'flow':
      return ''
    case 'absolute':
      return 'absolute'
    case 'fixed':
      return 'fixed'
    default: {
      const unhandled: never = flow
      throw new Error(`positionFor: unhandled flow ${JSON.stringify(unhandled)}`)
    }
  }
}

/* --------------------------------------------------------------- the walk */

/** What {@link applyChrome} built. */
export interface ChromeDom {
  /** The tree's root element — the wrapper, and what `requestFullscreen` is handed. */
  readonly root: HTMLElement
  /** Every node's element, by role, so a caller never queries the document. */
  readonly byRole: ReadonlyMap<string, HTMLElement>
}

/**
 * Build `spec` into elements, parents before children, in tree order.
 *
 * Returns the role→element map rather than letting the caller find things with
 * a selector: a selector is a second spelling of the class table above, and
 * the player would then break on a page whose own CSS classes happened to
 * collide.
 *
 * A duplicate role throws. The map would otherwise silently keep one element
 * and drop the other, and the dropped one would be the one nothing ever wires
 * up — a control that renders, accepts input and does nothing, which is the
 * failure `markup.test.ts` already records as the hardest to see.
 *
 * Nothing is appended to the document: the caller owns placement, because the
 * player is a component in four different containers and only the caller knows
 * which one it is in.
 */
export function applyChrome(spec: ChromeNode, doc: Document): ChromeDom {
  const byRole = new Map<string, HTMLElement>()

  const build = (node: ChromeNode): HTMLElement => {
    const element = doc.createElement(node.tag)
    const rendering = renderingFor(node.role)
    for (const cls of rendering.classes) element.classList.add(cls)
    for (const [name, value] of Object.entries(rendering.attrs ?? {})) {
      element.setAttribute(name, value)
    }
    element.style.position = positionFor(node.flow)
    // Absent means "do not set it", which is NOT the same as `auto`: an
    // explicit `auto` re-enables hit-testing under an ancestor that disabled
    // it, and the canvas must keep the plain default so that nothing here can
    // be mistaken for the reason it is clickable (see `ChromeNode`).
    if (node.pointerEvents !== undefined) element.style.pointerEvents = node.pointerEvents
    if (byRole.has(node.role)) {
      throw new Error(`applyChrome: two nodes claim the role ${JSON.stringify(node.role)}`)
    }
    byRole.set(node.role, element)
    for (const child of node.children ?? []) element.appendChild(build(child))
    return element
  }

  return { root: build(spec), byRole }
}
