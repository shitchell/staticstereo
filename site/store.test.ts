import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as ts from 'typescript'
import { createSceneStore } from './store.js'
import { currentTime, initialState, reduce } from './controls.js'
import type { Action, UiState } from './controls.js'
import {
  frameIndexAt,
  frameTimesOf,
  initialTransport,
  lastFrameTime,
  loopDuration,
  snapTime,
  timeOfFrame,
} from './transport.js'
import { importSpecifiers } from '../src/core/testing/imports.js'
import type { Scene } from '../src/core/types.js'

const ANIM: Scene = { size: [64, 32], fps: 12, duration: 2, layers: [{ type: 'text', text: 'A' }] }
const OTHER: Scene = { size: [100, 50], layers: [{ type: 'text', text: 'B' }] }

const STORE = fileURLToPath(new URL('./store.ts', import.meta.url))
const CONTROLS = fileURLToPath(new URL('./controls.ts', import.meta.url))
const SOURCE = readFileSync(STORE, 'utf8')

/* ------------------------------------------------- the Action vocabulary */

/**
 * One or more sample actions per {@link Action} variant, **total by the
 * compiler**.
 *
 * The mapped type is the point. §9: *"a hand-written list of 'the places that
 * do X' is a check — it goes stale silently the day a second place does X."*
 * A plain `Action[]` would be exactly that list: add a twelfth variant to
 * `controls.ts` and the sweep below would keep passing over eleven. Written as
 * `{[K in Action['type']]: …}`, a missing key is a typecheck failure naming the
 * variant, so the enumeration is the compiler's and not mine.
 *
 * That is one instrument. It has one hole — a `satisfies`/`as` escape, or a
 * variant whose tag is not a string literal, would silence it — so
 * {@link actionKindsDeclaredIn} reads the union out of `controls.ts`'s source
 * and the two are compared. Two readings of the same declaration through two
 * different machines (the checker, the parser); neither derives from the
 * store, which enumerates nothing at all.
 *
 * Several samples per variant where the variant has more than one *shape* of
 * outcome — a value and its removal, an in-range index and an out-of-range one
 * that throws. The sweep is over outcomes, not over tags.
 */
const SAMPLES: { readonly [K in Action['type']]: readonly Extract<Action, { type: K }>[] } = {
  scene: [{ type: 'scene', scene: OTHER }],
  stereo: [{ type: 'stereo', patch: { seed: 9 } }, { type: 'stereo', patch: { sepNear: 1e6 } }],
  freezeNoise: [{ type: 'freezeNoise', value: true }, { type: 'freezeNoise', value: false }],
  // `undefined` deletes the key rather than setting it; that is a different
  // scene object from the one a number produces, so both are swept.
  fps: [{ type: 'fps', value: 24 }, { type: 'fps', value: undefined }],
  duration: [{ type: 'duration', value: 3 }, { type: 'duration', value: undefined }],
  size: [{ type: 'size', value: [80, 40] }],
  time: [{ type: 'time', seconds: 1.3 }, { type: 'time', seconds: -5 }],
  frame: [{ type: 'frame', index: 7 }, { type: 'frame', index: 0 }],
  depthView: [{ type: 'depthView', value: 'encoded' }, { type: 'depthView', value: 'composited' }],
  // The transport primitive. Each carries its own `nowMs` because nothing in
  // this layer may read a clock; the wall clock is an argument exactly as it
  // is in `transportdriver.ts`, which is what makes a playback session a
  // sequence of values a test can write down.
  play: [{ type: 'play', nowMs: 1_000 }],
  pause: [{ type: 'pause', nowMs: 1_500 }],
  seek: [
    { type: 'seek', seconds: 1.3, nowMs: 2_000 },
    // Out of range in both directions: `seek` clamps, and the clamp is the
    // half of C-1's invariant that is not a tautology — see the sweep below.
    { type: 'seek', seconds: 99, nowMs: 2_000 },
    { type: 'seek', seconds: -99, nowMs: 2_000 },
  ],
  layerAnim: [
    { type: 'layerAnim', index: 0, anim: { kind: 'push', to: 0.2 } },
    { type: 'layerAnim', index: 0, anim: undefined },
    // Out of range: `reduce` throws, and the store must throw the same way
    // rather than committing half an edit.
    { type: 'layerAnim', index: 4, anim: undefined },
  ],
  layerText: [
    { type: 'layerText', index: 0, patch: { size: 48 } },
    { type: 'layerText', index: 0, patch: { weight: undefined } },
    // Rejected at the edit by `patchText`, so this one throws too.
    { type: 'layerText', index: 0, patch: { size: 0 } },
  ],
  // Criterion 22's write path, and the one variant that is itself a union —
  // one member per writable control, so `Extract<Action, {type: 'set'}>` is
  // 52 members rather than one. The samples below are chosen by *outcome*
  // shape and not by control, which is what the rest of this table does: the
  // arm branches on the owner, on whether the value is a removal, and on two
  // refusals that must leave the store untouched.
  set: [
    { type: 'set', control: 'stereo.cross', value: true },
    { type: 'set', control: 'scene.fps', value: undefined },
    { type: 'set', control: 'layer.text.weight', value: '700', index: 0 },
    { type: 'set', control: 'layer.text.anim', value: undefined, index: 0 },
    // Out of range, and addressed at the wrong variant. Both are refused by
    // name, so the store rethrows and commits nothing.
    { type: 'set', control: 'layer.text.text', value: 'B', index: 4 },
    { type: 'set', control: 'layer.shape.r', value: 3, index: 0 },
  ],
}

/**
 * The `type` tags of `Action`'s union members, read out of `controls.ts`.
 *
 * **Throws rather than returning `[]` for every shape it does not recognise.**
 * An empty list here would make the totality check below compare the sample
 * table against nothing and pass — plan §1.2k's rule applied to an instrument:
 * guard at compile time where you can, and throw at runtime where a wrong
 * answer silently ruins the thing the check exists for. Each throw names what
 * changed, so renaming or restructuring `Action` produces an instruction and
 * not a mystery.
 */
function actionKindsDeclaredIn(source: string): readonly string[] {
  const file = ts.createSourceFile('controls.ts', source, ts.ScriptTarget.ES2022, true)
  const aliasNamed = (name: string): ts.TypeAliasDeclaration | undefined =>
    file.statements.find(
      (node): node is ts.TypeAliasDeclaration =>
        ts.isTypeAliasDeclaration(node) && node.name.text === name,
    )
  const alias = aliasNamed('Action')
  if (!alias) throw new Error('controls.ts no longer declares `type Action`; this sweep is blind')
  if (!ts.isUnionTypeNode(alias.type)) {
    throw new Error('`Action` is no longer a union of object types; this sweep cannot enumerate it')
  }
  return alias.type.types.map(member => {
    if (ts.isTypeReferenceNode(member)) return tagOfReferencedAlias(member, aliasNamed)
    if (!ts.isTypeLiteralNode(member)) {
      throw new Error(`an \`Action\` member is not an object type: ${member.getText()}`)
    }
    return tagOfTypeLiteral(member)
  })
}

/** The string-literal `type` of one object-shaped `Action` member. */
function tagOfTypeLiteral(member: ts.TypeLiteralNode): string {
  const tag = member.members.find(
    (property): property is ts.PropertySignature =>
      ts.isPropertySignature(property) && property.name.getText() === 'type',
  )
  const literal = tag?.type
  if (!literal || !ts.isLiteralTypeNode(literal) || !ts.isStringLiteral(literal.literal)) {
    throw new Error(`an \`Action\` member has no string-literal \`type\`: ${member.getText()}`)
  }
  return literal.literal.text
}

/**
 * The tag of an `Action` member written as a reference to a named alias.
 *
 * **Added rather than worked around, and the distinction matters.** Criterion
 * 22's write path cannot be a type literal: it is one member per writable
 * control, distributed out of a mapped type, which is the shape that stops a
 * computed key erasing the field type. Spelling it inline is not available, so
 * the choice was between teaching this parser one more shape and deleting the
 * cross-check — and deleting it would remove the only instrument that can see
 * an `as`/`satisfies` escape in the sample table above.
 *
 * **It stays fail-closed.** The search is for string-literal `type` properties
 * anywhere under the alias, and it throws unless it finds exactly one distinct
 * value: a referenced alias with no tag, or with two, means the union has
 * grown a shape this reader cannot enumerate, and §1.2k says an instrument
 * whose wrong answer is silent should throw rather than guess. It does not
 * follow references out of this file, which is deliberate — `Action` is
 * declared here and a member defined elsewhere would be a different problem.
 */
function tagOfReferencedAlias(
  member: ts.TypeReferenceNode,
  aliasNamed: (name: string) => ts.TypeAliasDeclaration | undefined,
): string {
  const name = member.typeName.getText()
  const referenced = aliasNamed(name)
  if (!referenced) {
    throw new Error(
      `an \`Action\` member references \`${name}\`, which controls.ts does not declare; ` +
      'this sweep cannot enumerate it',
    )
  }
  const tags = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (ts.isTypeLiteralNode(node)) {
      const found = node.members.find(
        (property): property is ts.PropertySignature =>
          ts.isPropertySignature(property) && property.name.getText() === 'type',
      )
      const literal = found?.type
      if (literal && ts.isLiteralTypeNode(literal) && ts.isStringLiteral(literal.literal)) {
        tags.add(literal.literal.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(referenced.type)
  if (tags.size !== 1) {
    throw new Error(
      `\`${name}\` declares ${tags.size} string-literal \`type\` tags ` +
      `(${[...tags].sort().join(', ') || 'none'}); an \`Action\` member must declare exactly one`,
    )
  }
  return [...tags][0]!
}

/* ---------------------------------------------------- the delegation guard */

/**
 * What `store.ts` does with its own state, read structurally.
 *
 * **The behavioural sweep above cannot see an *agreeing* duplicate, and that
 * is measured rather than feared.** Planting a second implementation of one
 * arm in `dispatch` that returns the same answer `reduce` does —
 *
 * ```ts
 * const next = action.type === 'depthView'
 *   ? { ...self.state, depthView: action.value }
 *   : reduce(self.state, action)
 * ```
 *
 * — leaves `npm test` at **82 files / 1929 passed, 0 skipped, exit 0**, and
 * `typecheck`, `build` and `build:site` all at 0, with the plant grep-confirmed
 * present in the file and the build run first. The sweep compares `dispatch`'s
 * output against `reduce`'s, so a duplicate that *agrees* is invisible to it by
 * construction; only a divergent one reddens, and that one already does. Two
 * independent measurements of this, a verifier's and this file's.
 *
 * **Why duplication and not disagreement is the thing worth guarding.** The
 * module header's own cautionary case is exactly this shape: the
 * animatable-channel list is guarded in `track.ts` and duplicated unguarded in
 * two validators, and that duplicate **agreed on the day it was written** and
 * drifted later. A guard that waits for the drift fires after the defect has
 * shipped. §9: *"a recorded note is a sensor — it is not. Where a gap is
 * accepted, convert the note into a test that goes red the day someone crosses
 * it."*
 *
 * **Parsed and not grepped.** `browserGlobalsIn` records the general reason one
 * section down; here it is sharper still, because `store.ts`'s header discusses
 * `depthView` in prose over eight lines, so a text search for the tag is red on
 * the module exactly as it stands. §9: *"a grep census is a census."*
 *
 * **Three halves, because they fail on different things.** {@link
 * Delegation.undelegated} catches a state *computed* anywhere in the module and
 * is indifferent to how the arm was selected, so extracting the duplicate into a
 * helper does not evade it — `self.state = someHelper(…)` is as undelegated as
 * an inline object literal. {@link Delegation.conditional} catches a write that
 * only *some* actions reach, which is the *suppression* case: an early
 * `if (action.type === 'scene') return` writes nothing and would pass the first
 * half while silently dropping a transition. {@link Delegation.tagsNamed}
 * catches a per-arm decision that changes no state at all — a branch on the
 * discriminant whose body only logs, or counts, or notifies twice.
 *
 * ## The hole the second half closed, and why there are three halves and not two
 *
 * There used to be two, and **a verifier measured that both could be evaded at
 * once**: {@link Delegation.undelegated} keyed on the *declaration* of the name
 * written to storage, so a **reassignment** defeated it, and
 * {@link Delegation.tagsNamed} keyed on a tag literal, so a **tag-free
 * selection** defeated it. Planted into this module together —
 *
 * ```ts
 * let next = reduce(self.state, action)
 * if ('value' in action && (action.value === 'composited' || action.value === 'encoded')) {
 *   next = { ...self.state, depthView: action.value }      // no tag literal anywhere
 * }
 * self.state = next
 * ```
 *
 * — the repository did not move: `build` 0, `build:site` 0, `typecheck` 0,
 * **82 files / 1955 passed / 0 skipped**. That is an unambiguous second
 * implementation of the `depthView` arm, computed from `self.state` and
 * `action` alone, and it was invisible. Two fixes followed, and they are
 * separate because the two evasions are:
 *
 *  - **A reassignment is a binding.** `fromReduce` now accumulates over
 *    assignments as well as declarations, so `next` reassigned from anything
 *    other than `reduce` disqualifies every write of `next`.
 *  - **Suppression is measured structurally and no longer through the tag.**
 *    {@link Delegation.conditional} asks whether the write is reachable on
 *    *every* path through its own function, which catches
 *    `if (shouldSkip(action)) return` exactly as it catches
 *    `if (action.type === 'scene') return`. The tag spelling is no longer
 *    load-bearing for the case that matters.
 *
 * **That second fix is what buys {@link Delegation.tagsNamed} the room to be
 * narrowed**, and it had to be narrowed: `'set'` joined `Action`'s tags at
 * `24392c3`, and a guard that reddens on *any* value-position `'set'` in this
 * module is a guard whose cheapest satisfying action is to delete the half that
 * once saw suppression (§6.5a's tripwire paragraph; A-4's own UNCERTAIN 1 flagged
 * `tagsNamed` as the half most likely to need narrowing, over the far milder
 * collisions `time`, `size`, `scene` and `frame`). So the tag half now counts a
 * literal only where it is **compared against a `.type` discriminant** — in a
 * `===`/`!==` or a `switch` case — and an ordinary `'set'` used as data passes.
 * The residue is named rather than hidden: a tag laundered through a variable
 * (`const arm = action.type; if (arm === 'set')`) is invisible to this half, and
 * is caught by {@link Delegation.conditional} whenever it guards or skips the
 * write, which is every case where it can change what the store stores.
 *
 * **What is deliberately not constrained.** Construction. The guard is over
 * writes to the storage *after* it exists, never over building the initial
 * value, so a later constructor that takes a `Scene` and resets a raster cache
 * alongside it — flagged as wanted, `main.ts`'s `setScene` does exactly that —
 * is untouched by this. What a reducer-arm duplicate does and an initialiser
 * does not is derive the *next* state from the current one.
 */
interface Delegation {
  /** The expression the public `state()` accessor hands back — the storage. */
  readonly storage: string
  /** Writes to {@link storage}, `path:line`. The vacuity floor for the next. */
  readonly writes: readonly string[]
  /** Writes whose value did not come straight from `reduce`, `path:line …`. */
  readonly undelegated: readonly string[]
  /** Writes some actions cannot reach, `path:line reason` — the suppression half. */
  readonly conditional: readonly string[]
  /** `Action` tags compared against a `.type` discriminant, `path:line tag`. */
  readonly tagsNamed: readonly string[]
}

/**
 * Read {@link Delegation} off `text`.
 *
 * `tags` is passed in rather than read here so that the roster stays
 * {@link actionKindsDeclaredIn}'s — §9: *"derive it from the thing that makes a
 * site one of them, never from an enumeration someone typed."*
 *
 * **Throws rather than returning an empty record** for every shape it does not
 * recognise, which is plan §1.2k applied to an instrument: an empty `storage`
 * would match no write, report no undelegated write, and pass having swept
 * nothing. Each throw names what moved, so restructuring the module produces an
 * instruction and not a mystery.
 */
function delegationIn(path: string, text: string, tags: readonly string[]): Delegation {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true)
  const at = (node: ts.Node): string =>
    `${path}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1}`

  const isReduceCall = (node: ts.Node): boolean =>
    ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'reduce'

  // A locally declared `reduce` would make every match below name the wrong
  // function, and silently — the identifier text is identical. Refused rather
  // than resolved, because resolving it is a type-checker's job. An *imported*
  // `reduce` is an `ImportSpecifier` and not a declaration, so the real
  // module's import does not trip this.
  const declared = new Set<string>()
  const names = (node: ts.Node): void => {
    if (
      (ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) &&
      node.name && ts.isIdentifier(node.name)
    ) {
      declared.add(node.name.text)
    }
    ts.forEachChild(node, names)
  }
  names(file)
  if (declared.has('reduce')) {
    throw new Error(`${path} declares its own \`reduce\`; this guard would be checking the wrong one`)
  }

  // The storage location, taken from the module's own public accessor rather
  // than spelled `self.state` here. A roster written out in the test is the
  // defect this whole file argues against, and deriving it means a rename of
  // the field or of the `self` object moves the guard with it instead of
  // quietly emptying it.
  const storage = ((): string => {
    const factory = file.statements.find(
      (node): node is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(node) && node.name?.text === 'createSceneStore',
    )
    if (!factory) {
      throw new Error(`${path} no longer declares \`createSceneStore\`; this guard is blind`)
    }
    let returned: ts.Expression | undefined
    const find = (node: ts.Node): void => {
      if (ts.isObjectLiteralExpression(node)) {
        for (const member of node.properties) {
          if (!member.name || !ts.isIdentifier(member.name) || member.name.text !== 'state') continue
          const body = ts.isMethodDeclaration(member)
            ? member.body
            : ts.isPropertyAssignment(member) && ts.isArrowFunction(member.initializer)
              ? member.initializer.body
              : undefined
          if (body === undefined) continue
          returned ??= ts.isBlock(body)
            ? body.statements.find(ts.isReturnStatement)?.expression
            : body
        }
      }
      ts.forEachChild(node, find)
    }
    find(factory)
    if (!returned || !ts.isPropertyAccessExpression(returned)) {
      throw new Error(
        `${path}'s \`state()\` no longer returns a plain property access, so this guard cannot ` +
        'tell which location holds the state',
      )
    }
    return returned.getText()
  })()

  const isAssignment = (node: ts.Node): node is ts.BinaryExpression =>
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    node.operatorToken.kind <= ts.SyntaxKind.LastAssignment

  // Names **every** one of whose bindings in the file comes straight from
  // `reduce`, so that the one-hop `const next = reduce(…); self.state = next`
  // the module actually uses is recognised. File-wide rather than scope-aware,
  // and the looseness fails closed: a name bound twice, once from `reduce` and
  // once from anything else, is not treated as delegated by either site.
  //
  // **A reassignment is a binding, and leaving it out was a measured hole and
  // not a theoretical one.** Keyed on declarations alone, this map called `next`
  // delegated however many times it was subsequently overwritten, so
  // `let next = reduce(…); next = {…}; self.state = next` reported clean — and
  // did, across the whole repository. That is the "fails closed" claim above
  // being true of declarations and **false of the file**, which is the shape §9
  // separates from a stale pointer: a wrong assertion misleads whoever trusts
  // it. Both forms are accumulated here now, so the claim is true as written.
  const fromReduce = new Map<string, boolean>()
  const binds = (name: string, straight: boolean): void => {
    fromReduce.set(name, (fromReduce.get(name) ?? true) && straight)
  }
  const bind = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      binds(node.name.text, node.initializer !== undefined && isReduceCall(node.initializer))
    }
    if (isAssignment(node) && ts.isIdentifier(node.left)) {
      // A compound assignment (`+=`) is never delegation whatever is on the
      // right, so the operator is part of the test here exactly as it is at
      // the write site below.
      binds(
        node.left.text,
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken && isReduceCall(node.right),
      )
    }
    ts.forEachChild(node, bind)
  }
  bind(file)

  /** The function a node sits directly inside, ignoring blocks and statements. */
  const enclosingFunction = (node: ts.Node): ts.Node | undefined => {
    for (let at: ts.Node | undefined = node.parent; at !== undefined; at = at.parent) {
      if (
        ts.isFunctionDeclaration(at) || ts.isFunctionExpression(at) ||
        ts.isArrowFunction(at) || ts.isMethodDeclaration(at)
      ) {
        return at
      }
    }
    return undefined
  }

  /**
   * The construct, if any, that makes `write` conditional within `fn`.
   *
   * Only the chain between the two is walked, so the `for` loop that notifies
   * subscribers *after* the write is not a guard on it.
   */
  const guardOver = (write: ts.Node, fn: ts.Node): string | undefined => {
    for (let at: ts.Node | undefined = write.parent; at !== undefined && at !== fn; at = at.parent) {
      if (ts.isIfStatement(at)) return 'if'
      if (ts.isConditionalExpression(at)) return 'conditional expression'
      if (ts.isSwitchStatement(at) || ts.isCaseClause(at) || ts.isDefaultClause(at)) return 'switch'
      if (ts.isIterationStatement(at, false)) return 'loop'
      if (ts.isCatchClause(at) || ts.isTryStatement(at)) return 'try'
      if (ts.isBinaryExpression(at)) {
        const kind = at.operatorToken.kind
        if (
          kind === ts.SyntaxKind.AmpersandAmpersandToken ||
          kind === ts.SyntaxKind.BarBarToken ||
          kind === ts.SyntaxKind.QuestionQuestionToken
        ) {
          return 'short-circuit'
        }
      }
    }
    return undefined
  }

  /** Whether `fn` can leave before reaching `write`. Nested functions are not `fn`'s. */
  const canExitBefore = (write: ts.Node, fn: ts.Node): boolean => {
    let found = false
    const scan = (node: ts.Node): void => {
      if (found) return
      if (
        node !== fn &&
        (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) ||
          ts.isArrowFunction(node) || ts.isMethodDeclaration(node))
      ) {
        return
      }
      if (
        (ts.isReturnStatement(node) || ts.isThrowStatement(node)) &&
        node.getStart() < write.getStart()
      ) {
        found = true
        return
      }
      ts.forEachChild(node, scan)
    }
    scan(fn)
    return found
  }

  const DISCRIMINANT = 'type'
  const isDiscriminantOf = (node: ts.Expression): boolean =>
    ts.isPropertyAccessExpression(node) && node.name.text === DISCRIMINANT

  /**
   * Whether `literal` is being matched against an action's own `type`.
   *
   * This is the narrowing §2a forced and the module docblock argues for: a
   * string that merely *equals* a tag is data, and `'set'` is three characters.
   * A string in `=== action.type`, or in `case` under `switch (action.type)`,
   * is a per-arm decision whatever it spells.
   */
  const matchesADiscriminant = (literal: ts.StringLiteral): boolean => {
    const parent = literal.parent
    if (ts.isBinaryExpression(parent)) {
      const kind = parent.operatorToken.kind
      const comparison =
        kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        kind === ts.SyntaxKind.EqualsEqualsToken ||
        kind === ts.SyntaxKind.ExclamationEqualsToken
      return comparison && isDiscriminantOf(parent.left === literal ? parent.right : parent.left)
    }
    if (ts.isCaseClause(parent) && ts.isCaseBlock(parent.parent)) {
      return isDiscriminantOf(parent.parent.parent.expression)
    }
    return false
  }

  const writes: string[] = []
  const undelegated: string[] = []
  const conditional: string[] = []
  const tagsNamed: string[] = []

  const walk = (node: ts.Node): void => {
    if (isAssignment(node) && node.left.getText() === storage) {
      writes.push(at(node))
      // A compound assignment (`+=`) is never delegation whatever is on the
      // right, so the operator is part of the test and not just the shape.
      const straight =
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        (isReduceCall(node.right) ||
          (ts.isIdentifier(node.right) && fromReduce.get(node.right.text) === true))
      if (!straight) {
        undelegated.push(`${at(node)} ${node.getText().replace(/\s+/g, ' ')}`)
      }

      // The suppression half, and it is structural rather than lexical: an arm
      // dropped before the write is a write some actions never reach, whatever
      // the condition is spelled as. The real module's single write is a plain
      // statement of `dispatch`'s body with nothing before it that can leave.
      const fn = enclosingFunction(node)
      if (fn === undefined) {
        conditional.push(`${at(node)} the write is not inside a function`)
      } else {
        const guard = guardOver(node, fn)
        if (guard !== undefined) {
          conditional.push(`${at(node)} reached only through a ${guard}`)
        } else if (canExitBefore(node, fn)) {
          conditional.push(`${at(node)} an earlier return or throw can skip it`)
        }
      }
    }
    // Value position only, and only against a discriminant: a string-literal
    // *type* (`type: 'depthView'` in a declaration) names a variant without
    // deciding anything about it, a `'set'` used as data decides nothing
    // either, and an identifier node is never the inside of a comment — which
    // is the whole reason this is a parse.
    if (
      ts.isStringLiteral(node) && !ts.isLiteralTypeNode(node.parent) &&
      tags.includes(node.text) && matchesADiscriminant(node)
    ) {
      tagsNamed.push(`${at(node)} ${node.text}`)
    }
    ts.forEachChild(node, walk)
  }
  walk(file)

  return { storage, writes, undelegated, conditional, tagsNamed }
}

/* ------------------------------------------------------ the import closure */

/**
 * A file reader, injected so the closure walk below can be run over a graph
 * whose answer is known.
 *
 * `transportdriver.ts`'s header is the precedent and states the reason: with
 * the clock and the scheduler as arguments, "a whole playback session … is
 * expressible as a sequence of values in a test". The same move buys this
 * instrument a control. Without one, a resolver that silently resolved nothing
 * would report a one-file closure with no DOM in it and look exactly like a
 * pass — §9's "a check that cannot see reports fine", of which this repo has
 * eight recorded instances.
 */
interface Files {
  /** The text at `path`, or `undefined` if there is nothing readable there. */
  read(path: string): string | undefined
}

const REAL_FILES: Files = {
  read(path) {
    // A directory throws EISDIR, which is the answer "not a module here" — so
    // the candidate loop in `resolveModule` needs no separate stat.
    try {
      return readFileSync(path, 'utf8')
    } catch {
      return undefined
    }
  },
}

/** The file a relative specifier names, under this repo's `.js`-for-`.ts` convention. */
function resolveModule(files: Files, from: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined
  const base = resolve(dirname(from), specifier)
  for (const candidate of [base.replace(/\.js$/, '.ts'), `${base}.ts`, base, `${base}/index.ts`]) {
    if (files.read(candidate) !== undefined) return candidate
  }
  return undefined
}

/**
 * The browser globals a module in the editor's *state* layer may not reach.
 *
 * `location` and `history` are here because criterion 8's second half — the
 * hash projection — is a separate task with a separate owner, and a store that
 * had already reached for `history.replaceState` would have taken that
 * decision quietly.
 */
const BROWSER_GLOBALS = ['document', 'window', 'location', 'history', 'navigator', 'localStorage']

/**
 * The ways this layer could make its own tick instead of being handed one.
 *
 * Kept apart from {@link BROWSER_GLOBALS} and reported separately, because the
 * two fail for different reasons and a merged failure could not tell "it
 * reached the DOM" from "it welded in a clock" — the same separation
 * `hashprojection.test.ts` records for its own pair.
 *
 * This is criterion 3's sensor. `transportdriver.ts` states the property being
 * protected: *"Both the clock and the scheduler are arguments. Nothing here
 * reads a clock or creates a timer, so a whole playback session … is
 * expressible as a sequence of values in a test, in plain node, with no DOM and
 * no fake-timer plugin."* The transport actions carry `nowMs`, so the moment
 * any module in this closure could read the time for itself, that sentence
 * stops being true of the store and nothing else in the suite would say so.
 *
 * `Date` and `performance` are the clocks; the schedulers are here because a
 * module that can defer can also sample the clock by differencing its own
 * callbacks. `process` is neither, and is here because `process.hrtime` is the
 * node-shaped way to do the first one and `src/core` is shared with the CLI.
 *
 * ## What this roster's weakness actually is — corrected, with the measurement
 *
 * C-2 shipped this list knowingly weak and recorded the weakness as §9's
 * **hand-written-list** shape: *"a novel clock spelling passes it, and C-2
 * could not derive the list from anything."* **A verifier measured that this is
 * not the mechanism, and the misdiagnosis sends the next reader to the wrong
 * cure.** Planted into `site/transport.ts`, in the real import closure,
 * grep-confirmed, build first:
 *
 * | plant | before | after |
 * |---|---|---|
 * | `Date.now()` — positive control | **RED** | **RED** |
 * | `globalThis.Date.now()` | 24/24 green | **RED** |
 * | `Promise.resolve().then(f)` | 24/24 green | **RED** |
 *
 * `Date` **was** on the roster and `globalThis.Date` passed anyway, because
 * prefixing a global makes it the `name` of a `PropertyAccessExpression` and
 * {@link globalsIn} deliberately skipped those — so **every listed name was
 * evadable the same way**, and lengthening the roster could not have closed any
 * of it. That suppression is narrowed at its single `globalThis` receiver
 * rather than removed; see {@link globalsIn}, which records why removing it is
 * not available.
 *
 * `Promise` is the one genuine roster gap of the three, and it is an
 * inconsistency inside this list's own stated intent rather than a derivation
 * failure: `queueMicrotask` is listed, and `Promise.resolve().then(f)` is the
 * same microtask by its other spelling. It is added on that ground alone.
 *
 * **Adding it cost a second fix, and the second fix is the more general one.**
 * `Promise` on this roster reddened the real closure at nine sites, and **all
 * nine were type annotations** — `loadImage(src): Promise<DecodedImage>` and
 * `images: Map<string, Promise<DecodedImage>>` in
 * `src/core/{canvaslike,raster,render}.ts`, the image-decode path. A type
 * schedules nothing, so {@link globalsIn} now ignores type position for every
 * name on either roster. That was a latent false positive the whole time and
 * `Promise` is simply the first entry common enough in a type to expose it.
 *
 * **This list is still not derived and still not complete**, and that is
 * recorded here as an acceptance rather than a note, because §9 forbids a note:
 * the acceptance is sensored by the controls below, which fail the day one of
 * the three plants above stops being seen. What remains invisible is bounded
 * and named — a receiver laundered through a variable (`const g = globalThis`),
 * a computed member name, and a timing source nobody has thought of. Those are
 * out of reach of any parser that is not a type checker, which is the same
 * boundary {@link globalsIn}'s declaration suppression sits on.
 */
const CLOCKS = [
  'Date',
  'performance',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
  'requestAnimationFrame',
  'queueMicrotask',
  // The other spelling of `queueMicrotask`, and the one a verifier measured
  // walking straight past this list.
  'Promise',
  'process',
]

/**
 * References to `names` in `text`, parsed and not grepped.
 *
 * A grep cannot do this job here and that is measured, not assumed: a
 * word-boundary search over this exact closure returns six hits, and **all six
 * are prose** — `site/scene.ts:14` says a scene may arrive "from
 * `location.hash`", `src/core/analysis.ts:21` discusses a measurement
 * *window*, `src/core/anim/presets.ts:393` mentions a file's *history*. An
 * identifier node is never a comment and never the inside of a string, which
 * is the same argument `src/core/testing/imports.ts` records for parsing
 * imports rather than grepping them.
 *
 * **A name the file itself declares is not a global**, and that suppression is
 * file-wide rather than scope-aware. `site/present.ts` takes a parameter named
 * `location`, so a parser that ignored declarations would accuse it; a
 * resolver that got the scopes right is a type-checker and not worth building
 * here. The cost is a false *negative* for a file that both declares and uses
 * the same name — which is why the list leads with `document` and `window`,
 * the two no module shadows, and why the control below plants a file that
 * declares `location` and still gets caught on `document`.
 *
 * ## `globalThis.X` is the global, and that was the measured hole
 *
 * The member-name suppression below is the reason {@link CLOCKS}' recorded
 * weakness was diagnosed wrongly. `globalThis.Date.now()` planted in
 * `site/transport.ts` made `Date` the `name` of a `PropertyAccessExpression`,
 * which this function skipped, and the sensor stayed green over a clock it
 * lists by name — so **every entry in either roster was evadable by prefixing
 * it**, and no amount of adding names could have helped.
 *
 * **The suppression is narrowed rather than removed, and the narrowing is the
 * whole fix.** Removing it reddens `site/present.ts` and anything else with a
 * property called `window`; keeping it whole leaves the hole. The one receiver
 * for which `X.name` *is* the global is `globalThis`, by definition of
 * `globalThis`, so that single case is unskipped — and it is also exempted
 * from the declaration filter, because a file declaring its own `Date` does not
 * make `globalThis.Date` anything other than the clock. The index spelling
 * `globalThis['Date']` is matched beside it, since a string index is not an
 * identifier and the walk would never have reached it.
 *
 * **Type position is not a reach either**, and that one is not a trade: an
 * identifier under a type node cannot schedule or sample anything. It is
 * suppressed for the same reason comments and strings are, and it is what made
 * `Promise` addable to {@link CLOCKS} — nine of the closure's `Promise`
 * references are `Promise<DecodedImage>` and none of them is a microtask.
 *
 * **What is still invisible, named rather than implied:** `const g =
 * globalThis; g.Date.now()`, a computed member name, and a module that both
 * declares and uses a listed name. The first two need a type checker to
 * resolve and the third is the stated price of the declaration suppression.
 */
function globalsIn(path: string, text: string, names: readonly string[]): readonly string[] {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true)
  const declared = new Set<string>()
  const hits: string[] = []
  // Reached through `globalThis`, so neither the member-name suppression nor
  // the declaration filter applies — these are the global whatever the file
  // calls its own bindings.
  const rooted: string[] = []
  const lineOf = (node: ts.Node): number =>
    file.getLineAndCharacterOfPosition(node.getStart()).line + 1
  const isGlobalRoot = (node: ts.Expression): boolean =>
    ts.isIdentifier(node) && node.text === 'globalThis'

  const walk = (node: ts.Node): void => {
    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isFunctionDeclaration(node) ||
        ts.isBindingElement(node) || ts.isImportSpecifier(node) || ts.isImportClause(node) ||
        ts.isClassDeclaration(node)) &&
      node.name && ts.isIdentifier(node.name)
    ) {
      declared.add(node.name.text)
    }
    if (
      ts.isElementAccessExpression(node) && isGlobalRoot(node.expression) &&
      ts.isStringLiteral(node.argumentExpression) && names.includes(node.argumentExpression.text)
    ) {
      rooted.push(`${path}:${lineOf(node)} ${node.argumentExpression.text}`)
    }
    if (ts.isIdentifier(node) && names.includes(node.text)) {
      const parent = node.parent
      // `a.window` is a property named `window`, not the global — but
      // `globalThis.window` is, and that exception is the measured fix.
      const viaGlobalThis =
        ts.isPropertyAccessExpression(parent) && parent.name === node &&
        isGlobalRoot(parent.expression)
      const isMemberName =
        // A *type* is not a reach: `Promise<DecodedImage>` schedules nothing
        // and `images: Map<string, Promise<T>>` is a cache's declared shape.
        // Measured, and it is the difference between `Promise` being usable on
        // this roster and not: the store's closure holds nine `Promise`
        // references and **all nine are type annotations** on the image-decode
        // path in `src/core/{canvaslike,raster,render}.ts`.
        ts.isTypeNode(parent) ||
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertySignature(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isPropertyDeclaration(parent) && parent.name === node) ||
        (ts.isMethodSignature(parent) && parent.name === node) ||
        (ts.isQualifiedName(parent) && parent.right === node) ||
        ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)
      if (viaGlobalThis) {
        rooted.push(`${path}:${lineOf(node)} ${node.text}`)
      } else if (!isMemberName) {
        hits.push(`${path}:${lineOf(node)} ${node.text}`)
      }
    }
    ts.forEachChild(node, walk)
  }
  walk(file)
  return [
    ...hits.filter(hit => !declared.has(hit.slice(hit.lastIndexOf(' ') + 1))),
    ...rooted,
  ]
}

interface Closure {
  /** Every file reachable from the entry by a static or dynamic specifier. */
  readonly files: readonly string[]
  /** Every browser-global reference in them, `path:line name`. */
  readonly globals: readonly string[]
  /** Every {@link CLOCKS} reference in them, `path:line name`. */
  readonly clocks: readonly string[]
  /** Every Svelte specifier in them. */
  readonly svelte: readonly string[]
}

/**
 * Walk the whole import graph from `entry`, not just `entry` itself.
 *
 * Criterion 1 says "nothing **it imports** reaches `document`", which is a
 * claim about the closure. `site/transport.test.ts:484` makes the one-file
 * version of this claim over `transport.ts`, and that is the right shape for a
 * leaf module; a store's whole purpose is to pull `controls.ts`'s graph in
 * behind it, so the one-file version would be silent about the only way this
 * criterion can actually fail.
 *
 * Specifier extraction is `src/core/testing/imports.ts`'s, deliberately: it
 * already covers static, bare side-effect, `import type`, `import('x').T`,
 * dynamic `import()` and `require()`, and a fourth hand-rolled copy in this
 * repo is the defect `transport.test.ts:91` exists to talk about.
 */
function closureFrom(entry: string, files: Files = REAL_FILES): Closure {
  const seen = new Set<string>()
  const globals: string[] = []
  const clocks: string[] = []
  const svelte: string[] = []
  const pending = [entry]
  while (pending.length > 0) {
    const path = pending.pop()
    if (path === undefined || seen.has(path)) continue
    const text = files.read(path)
    if (text === undefined) continue
    seen.add(path)
    globals.push(...globalsIn(path, text, BROWSER_GLOBALS))
    clocks.push(...globalsIn(path, text, CLOCKS))
    for (const specifier of importSpecifiers(text, ts.ScriptKind.TS)) {
      if (specifier === 'svelte' || specifier.startsWith('svelte/') || specifier.endsWith('.svelte')) {
        svelte.push(`${path} imports ${specifier}`)
      }
      const next = resolveModule(files, path, specifier)
      if (next !== undefined) pending.push(next)
    }
  }
  return {
    files: [...seen].sort(),
    globals: globals.sort(),
    clocks: clocks.sort(),
    svelte: svelte.sort(),
  }
}

/* ------------------------------------------------------------------ tests */

describe('createSceneStore', () => {
  it('hands back the state it was constructed with, by identity', () => {
    const initial = initialState(ANIM)
    expect(createSceneStore(initial).state()).toBe(initial)
  })

  it('mutates only through reduce, for every Action variant the type declares', () => {
    const kinds = Object.keys(SAMPLES)
    for (const kind of kinds) {
      for (const action of SAMPLES[kind as Action['type']]) {
        const label = `${kind}: ${JSON.stringify(action)}`
        const before = initialState(ANIM)
        const store = createSceneStore(initialState(ANIM))

        let expected: UiState | undefined
        let refusal: string | undefined
        try {
          expected = reduce(before, action)
        } catch (err) {
          refusal = err instanceof Error ? err.message : String(err)
        }

        if (refusal === undefined) {
          store.dispatch(action)
          expect(store.state(), label).toEqual(expected)
        } else {
          // An action `reduce` refuses is refused the same way and leaves the
          // state alone — the store adds no recovery policy of its own, because
          // swallowing here would make a rejected edit indistinguishable from
          // an applied one to everything downstream.
          expect(() => store.dispatch(action), label).toThrow(refusal)
          expect(store.state(), label).toEqual(before)
        }
      }
    }
    // Vacuity floor, and it is the load-bearing half: a sample table that had
    // lost its arrays would sweep nothing and pass. Named per variant.
    for (const kind of kinds) {
      expect(SAMPLES[kind as Action['type']].length, `${kind} has no samples`).toBeGreaterThan(0)
    }
  })

  it('sweeps every variant controls.ts declares, by the parser as well as the checker', () => {
    const declared = [...actionKindsDeclaredIn(readFileSync(CONTROLS, 'utf8'))].sort()
    expect(declared.length, 'no Action variants were parsed out of controls.ts').toBeGreaterThan(0)
    expect(
      Object.keys(SAMPLES).sort(),
      'the sample table and `Action` have drifted: a variant was added or renamed in ' +
      'controls.ts and the sweep above is no longer total over it',
    ).toEqual(declared)
  })

  it('writes its state only from reduce and names no Action variant, read off its own source', () => {
    // The sweep above compares answers, so it senses *divergence*. This senses
    // *duplication*, which is the case that ships green — see {@link Delegation}
    // for the measurement, and the control below for the proof it can fail.
    const found = delegationIn(STORE, SOURCE, actionKindsDeclaredIn(readFileSync(CONTROLS, 'utf8')))

    // Vacuity floor, and it is the load-bearing half exactly as it is in the
    // variant sweep: a `storage` that matched no write would report nothing
    // undelegated and pass having examined nothing at all.
    expect(found.writes.length, `no write to ${found.storage} was found, so this check swept nothing`)
      .toBeGreaterThan(0)

    expect(
      found.undelegated,
      'the store computed a state itself instead of taking `reduce`\'s answer. A second ' +
      'implementation of a reducer arm is this repo\'s signature defect — see the module header — ' +
      'and the behavioural sweep above cannot see one while it still agrees.',
    ).toEqual([])

    expect(
      found.conditional,
      'a write to the store\'s state is not on every path through its own function, so some ' +
      'actions reach it and some do not. Suppressing an arm drops a transition silently, and ' +
      'the behavioural sweep cannot see it while every arm it does reach still agrees.',
    ).toEqual([])

    expect(
      found.tagsNamed,
      'the store matched an `Action` variant against the action\'s own `type`, so it is ' +
      'deciding something per-arm. Selecting or suppressing one arm is the same defect as ' +
      're-implementing it.',
    ).toEqual([])
  })

  it('would see an agreeing second implementation of a reducer arm, which is the control', () => {
    // §6.5a's paired half, and §9's rule that a control must be able to see
    // *this* change rather than merely something: the first plant below is the
    // measured-invisible one — byte-identical behaviour, 1929 passed — so a
    // guard that only reddened on the divergent plant would be the instrument
    // that already exists.
    const tags = actionKindsDeclaredIn(readFileSync(CONTROLS, 'utf8'))
    const module = (dispatchBody: string, extra = ''): string =>
      `import { reduce } from './controls.js'\n${extra}` +
      'export function createSceneStore(initial: UiState): SceneStore {\n' +
      '  const self = { state: initial }\n' +
      '  return {\n' +
      '    state(): UiState { return self.state },\n' +
      `    dispatch(action: Action): void {\n${dispatchBody}\n    },\n` +
      '  }\n}\n'
    const of = (source: string): Delegation => delegationIn('/plant/store.ts', source, tags)

    // The negative half: the shape the real module has reports clean, so the
    // positives below are the plant and not the harness.
    const honest = of(module('      const next = reduce(self.state, action)\n      self.state = next'))
    expect(honest.storage).toBe('self.state')
    expect(honest.writes.length).toBe(1)
    expect(honest.undelegated).toEqual([])
    expect(honest.conditional).toEqual([])
    expect(honest.tagsNamed).toEqual([])

    // REASSIGNED, and this is the plant that was measured invisible: a name
    // declared from `reduce` and then overwritten from an object literal, with
    // the arm selected by a value rather than by a tag so that nothing in the
    // module spells a variant. Planted into the real `store.ts` it left build
    // 0, build:site 0, typecheck 0 and 82 files / 1955 passed / 0 skipped.
    const reassigned = of(module(
      '      let next = reduce(self.state, action)\n' +
      "      if ('value' in action && (action.value === 'composited' || action.value === 'encoded')) {\n" +
      '        next = { ...self.state, depthView: action.value }\n' +
      '      }\n' +
      '      self.state = next'))
    expect(reassigned.undelegated.length, 'a reassigned name is not a delegated name').toBe(1)
    // …and it is the first half that sees it: the write itself is
    // unconditional and no tag is spelled, so the other two are silent. Three
    // halves that fail on different things, demonstrated rather than claimed.
    expect(reassigned.conditional).toEqual([])
    expect(reassigned.tagsNamed).toEqual([])

    // AGREEING. Returns precisely what `reduce` returns for every input, which
    // is why nothing else in the repository moves.
    const agreeing = of(module(
      "      const next = action.type === 'depthView'\n" +
      '        ? { ...self.state, depthView: action.value }\n' +
      '        : reduce(self.state, action)\n' +
      '      self.state = next'))
    expect(agreeing.undelegated.length).toBe(1)
    expect(agreeing.tagsNamed).toEqual(['/plant/store.ts:7 depthView'])

    // The same duplicate moved behind a helper, which is the cheapest way to
    // satisfy a guard scoped to the literal `dispatch` body. It must not be a
    // way out, so the check is over the module and keyed on the write.
    const extracted = of(module(
      '      self.state = arm(self.state, action)',
      'function arm(state: UiState, action: Action): UiState {\n' +
      "  if (action.type === 'depthView') return { ...state, depthView: action.value }\n" +
      '  return reduce(state, action)\n}\n'))
    expect(extracted.undelegated.length).toBe(1)

    // SUPPRESSION. An arm dropped before any write happens: the first half is
    // silent here — no write is undelegated, because the delegated write is
    // simply never reached — and the other two see it. This is why all three
    // are asserted rather than any alone.
    const suppressed = of(module(
      "      if (action.type === 'scene') return\n" +
      '      self.state = reduce(self.state, action)'))
    expect(suppressed.undelegated).toEqual([])
    expect(suppressed.conditional).toEqual(['/plant/store.ts:8 an earlier return or throw can skip it'])
    expect(suppressed.tagsNamed).toEqual(['/plant/store.ts:7 scene'])

    // TAG-FREE SUPPRESSION, which is the one the tag half could never see and
    // the reason the structural half exists. Nothing here spells a variant.
    const quietlySuppressed = of(module(
      '      if (skip(action)) return\n' +
      '      self.state = reduce(self.state, action)',
      'declare function skip(action: Action): boolean\n'))
    expect(quietlySuppressed.tagsNamed).toEqual([])
    expect(quietlySuppressed.conditional.length).toBe(1)

    // And the guarded form of the same thing, where no `return` is involved at
    // all: the write is simply inside an `if`.
    const guarded = of(module('      if (ready) self.state = reduce(self.state, action)'))
    expect(guarded.undelegated).toEqual([])
    expect(guarded.conditional).toEqual(['/plant/store.ts:7 reached only through a if'])

    // Prose is not code, and nor is data. The module's real header discusses
    // `depthView` over eight lines, so a grep for the tag would be red on the
    // shipping module; and `'set'` joined the vocabulary at `24392c3`, so the
    // guard must tolerate the three commonest characters in any codebase
    // appearing as an ordinary string. Both halves of that in one plant.
    const asData = of(module(
      '      // depthView is discussed here, and in a string that is data:\n' +
      '      const label = "depthView"\n' +
      "      const mode = 'set'\n" +
      '      void label, mode\n' +
      '      self.state = reduce(self.state, action)',
    ))
    expect(asData.tagsNamed, 'a comment or a data string naming a tag must not count').toEqual([])

    // …while the same word *matched against the discriminant* still counts,
    // which is what keeps the narrowing from being a deletion. Both spellings
    // of the match, because a `switch` is the other way this is written.
    expect(of(module(
      "      if (action.type === 'set') return\n" +
      '      self.state = reduce(self.state, action)',
    )).tagsNamed).toEqual(['/plant/store.ts:7 set'])
    expect(of(module(
      '      switch (action.type) {\n' +
      "        case 'scene': return\n" +
      '        default: break\n' +
      '      }\n' +
      '      self.state = reduce(self.state, action)',
    )).tagsNamed).toEqual(['/plant/store.ts:8 scene'])

    // And the instrument refuses rather than reporting clean when the module
    // moves under it — an empty `storage` would sweep nothing and pass.
    expect(() => of('export const nothing = 1\n')).toThrow(/no longer declares `createSceneStore`/)
  })

  it('does not touch the state it was handed, so a subscriber may hold on to one', () => {
    // Frozen rather than compared: a mutation of a frozen object throws in a
    // module (ESM is strict), so this fails at the write rather than at a
    // later assertion that has to guess which field moved.
    const initial = deepFreeze(initialState(ANIM))
    const store = createSceneStore(initial)
    store.dispatch({ type: 'frame', index: 7 })
    store.dispatch({ type: 'stereo', patch: { seed: 9 } })
    expect(store.state()).not.toBe(initial)
    expect(initial.time).toBe(initialState(ANIM).time)
  })

  it('notifies every subscriber on mutation, in subscription order', () => {
    const store = createSceneStore(initialState(ANIM))
    const calls: string[] = []
    store.subscribe(state => calls.push(`a${state.time}`))
    store.subscribe(state => calls.push(`b${state.time}`))
    store.dispatch({ type: 'frame', index: 7 })
    expect(calls).toEqual([`a${7 / 12}`, `b${7 / 12}`])
  })

  it('stops calling a subscriber that unsubscribed, and unsubscribing twice is harmless', () => {
    const store = createSceneStore(initialState(ANIM))
    const calls: number[] = []
    const off = store.subscribe(state => calls.push(state.time))
    store.dispatch({ type: 'frame', index: 1 })
    off()
    off()
    store.dispatch({ type: 'frame', index: 2 })
    expect(calls).toEqual([1 / 12])
  })

  it('registers the same callback twice as two subscriptions, each independently removable', () => {
    // The unsubscriber removes the *registration* it was handed, not every
    // registration of that function — otherwise two panels that happened to
    // pass the same bound method would silently share one slot, and the second
    // to unmount would take the first one's updates with it.
    const store = createSceneStore(initialState(ANIM))
    const calls: number[] = []
    const listener = (state: UiState): void => void calls.push(state.time)
    const offFirst = store.subscribe(listener)
    store.subscribe(listener)
    store.dispatch({ type: 'frame', index: 1 })
    offFirst()
    store.dispatch({ type: 'frame', index: 2 })
    expect(calls).toEqual([1 / 12, 1 / 12, 2 / 12])
  })

  it('does not call a subscriber another subscriber removed in the same notification', () => {
    const store = createSceneStore(initialState(ANIM))
    const calls: string[] = []
    let offSecond = (): void => {}
    store.subscribe(() => {
      calls.push('first')
      offSecond()
    })
    offSecond = store.subscribe(() => calls.push('second'))
    store.dispatch({ type: 'frame', index: 1 })
    expect(calls).toEqual(['first'])
  })

  it('does not call a subscriber added during the notification it was added in', () => {
    const store = createSceneStore(initialState(ANIM))
    const calls: string[] = []
    store.subscribe(() => {
      calls.push('first')
      store.subscribe(() => calls.push('late'))
    })
    store.dispatch({ type: 'frame', index: 1 })
    expect(calls).toEqual(['first'])
    // ...and it is live for the next one, rather than dropped.
    store.dispatch({ type: 'frame', index: 2 })
    expect(calls).toEqual(['first', 'first', 'late'])
  })

  it('never hands a subscriber a state that is not the store’s current state', () => {
    // A subscriber is allowed to dispatch. If the notification closed over the
    // state its own dispatch computed, every subscriber after the re-entrant
    // one would be handed a superseded value and would render it — and the
    // projection and the coalescer that attach to this seam would both write
    // it out. The state is read at call time instead, so the argument and
    // `state()` cannot disagree.
    const store = createSceneStore(initialState(ANIM))
    const seen: UiState[] = []
    let reentered = false
    store.subscribe(() => {
      if (reentered) return
      reentered = true
      store.dispatch({ type: 'frame', index: 9 })
    })
    store.subscribe(state => void seen.push(state))
    store.dispatch({ type: 'frame', index: 1 })
    expect(seen.length).toBeGreaterThan(0)
    for (const state of seen) expect(state).toBe(store.state())
    expect(store.state().time).toBe(9 / 12)
  })

  it('keeps two stores wholly independent, so no state can be living at module level', () => {
    // The behavioural form of `transport.test.ts:493`'s source-text rule. A
    // `let` at module scope passes a grep that is written for `let ` and fails
    // this; two stores on one page is also the real requirement behind it.
    const one = createSceneStore(initialState(ANIM))
    const two = createSceneStore(initialState(ANIM))
    const twoSaw: number[] = []
    two.subscribe(state => void twoSaw.push(state.time))
    const twoBefore = two.state()

    one.dispatch({ type: 'frame', index: 7 })
    one.dispatch({ type: 'depthView', value: 'encoded' })

    expect(one.state().time).toBe(7 / 12)
    expect(two.state()).toBe(twoBefore)
    expect(two.state().depthView).toBe('composited')
    expect(twoSaw).toEqual([])
  })

  it('keeps no module-level mutable state, read off its own source', () => {
    // The source-text half, kept alongside the behavioural one above because
    // they fail on different things: a module-level `let` that happens to be
    // written before any store is constructed is invisible to the two-store
    // test and obvious here.
    expect(SOURCE).not.toMatch(/^(let|var)\s/m)
  })
})

describe('the store runs in plain node', () => {
  it('reaches no browser global and no Svelte module anywhere in its import closure', () => {
    const closure = closureFrom(STORE)
    expect(closure.globals, 'a browser global is reachable from the store').toEqual([])
    expect(closure.svelte, 'Svelte is reachable from the store').toEqual([])
    // Vacuity floor by membership rather than by count: §9 is explicit that a
    // numeric floor taken from today's measurement is a hand-written list in
    // numeric form. These four say the walk crossed from `site/` into `src/`
    // and went several levels deep, which is the way a resolver fails silently.
    for (const member of ['site/store.ts', 'site/controls.ts', 'site/transport.ts', 'src/core/types.ts']) {
      expect(closure.files.some(file => file.endsWith(member)), `${member} is not in the closure`)
        .toBe(true)
    }
  })

  it('would see a browser global planted two modules deep, which is the control', () => {
    // §6.5a's paired half, and it has to be able to see *this* change and not
    // merely something: the plant is transitive, because the one-file form of
    // this check is the thing being improved on.
    const graph: Record<string, string> = {
      '/plant/entry.ts': `import { b } from './b.js'\nexport const a = b\n`,
      '/plant/b.ts': `export const b = document.title\n`,
    }
    const files: Files = { read: path => graph[path] }

    const seen = closureFrom('/plant/entry.ts', files)
    expect(seen.files).toEqual(['/plant/b.ts', '/plant/entry.ts'])
    expect(seen.globals).toEqual(['/plant/b.ts:1 document'])

    // The negative half of the same pair: with the reference removed and
    // nothing else changed, the same walk over the same graph reports clean.
    graph['/plant/b.ts'] = `export const b = 'title'\n`
    expect(closureFrom('/plant/entry.ts', files).globals).toEqual([])

    // A file that declares its own `location` is still caught on `document`,
    // which is what keeps the declaration suppression from being a way out.
    graph['/plant/b.ts'] = `export function f(location: string) { return location + document.title }\n`
    expect(closureFrom('/plant/entry.ts', files).globals).toEqual(['/plant/b.ts:1 document'])

    // And Svelte, by specifier rather than by resolution — a `.svelte` import
    // resolves to nothing under this walker, so the ban cannot ride on the
    // closure membership that the globals check uses.
    graph['/plant/b.ts'] = `import Panel from './Panel.svelte'\nexport const b = Panel\n`
    expect(closureFrom('/plant/entry.ts', files).svelte).toEqual(['/plant/b.ts imports ./Panel.svelte'])
  })

  it('reaches no clock and no timer either, which is what keeps nowMs an argument', () => {
    // Criterion 3. The transport actions carry `nowMs`, and that is only worth
    // anything if no module behind the store can quietly read the time
    // instead: a single `Date.now()` in `controls.ts` would make a playback
    // session untestable as values while every other test in this file stayed
    // green, because they all supply the clock and would never notice one
    // being ignored.
    expect(closureFrom(STORE).clocks, 'a clock or a timer is reachable from the store').toEqual([])
  })

  it('would see a clock planted two modules deep, which is the control', () => {
    // §6.5a's paired half for the null above, and §9's rule that the control
    // must see *this* change: the plant is a clock rather than a DOM
    // reference, two modules down, because the globals walk above already
    // covers the shallow DOM case and would pass over a clock in silence.
    const graph: Record<string, string> = {
      '/plant/entry.ts': `import { b } from './b.js'\nexport const a = b\n`,
      '/plant/b.ts': `export const b = Date.now()\n`,
    }
    const files: Files = { read: path => graph[path] }
    expect(closureFrom('/plant/entry.ts', files).clocks).toEqual(['/plant/b.ts:1 Date'])
    // The two sensors stay separable: a clock is not reported as a DOM
    // reference, so a reader of either failure knows which rule was broken.
    expect(closureFrom('/plant/entry.ts', files).globals).toEqual([])

    // A scheduler, which is the other half of what `transportdriver.ts` keeps
    // injected — a module that can defer can difference its own callbacks.
    graph['/plant/b.ts'] = `export const b = (f: () => void) => setTimeout(f, 1)\n`
    expect(closureFrom('/plant/entry.ts', files).clocks).toEqual(['/plant/b.ts:1 setTimeout'])

    // The negative half: with the clock removed and nothing else changed, the
    // same walk over the same graph reports clean.
    graph['/plant/b.ts'] = `export const b = 0\n`
    expect(closureFrom('/plant/entry.ts', files).clocks).toEqual([])
  })

  it('sees the two spellings that walked past it, and still not a property of that name', () => {
    /**
     * The three plants from {@link CLOCKS}' corrected rationale, as a sensor.
     * Two of them were measured green on this exact instrument before the
     * narrowing — in `site/transport.ts`, in the real closure, with the build
     * run first and the plant grep-confirmed — so the acceptance that the
     * roster is neither derived nor complete now ships with something that
     * fails the day either stops being seen. §9: a gap ships with a sensor,
     * never with a note.
     *
     * The fourth case is the one that keeps the narrowing honest: a property
     * that merely *shares a global's name* must stay invisible, because that
     * suppression is what prevents a false positive on `site/present.ts`.
     */
    const graph: Record<string, string> = {
      '/plant/entry.ts': `import { b } from './b.js'\nexport const a = b\n`,
      '/plant/b.ts': `export const b = globalThis.Date.now()\n`,
    }
    const files: Files = { read: path => graph[path] }
    expect(closureFrom('/plant/entry.ts', files).clocks).toEqual(['/plant/b.ts:1 Date'])

    // The index spelling of the same reach.
    graph['/plant/b.ts'] = `export const b = (globalThis['Date'] as DateConstructor).now()\n`
    expect(closureFrom('/plant/entry.ts', files).clocks).toEqual(['/plant/b.ts:1 Date'])

    // …and it survives the declaration filter, which the plain-identifier path
    // does not: a file that declares its own `Date` has not stopped reaching
    // the real one through `globalThis`.
    graph['/plant/b.ts'] = `class Date {}\nexport const b = globalThis.Date.now()\nvoid Date\n`
    expect(closureFrom('/plant/entry.ts', files).clocks).toEqual(['/plant/b.ts:2 Date'])

    // The unlisted microtask scheduler, which is the one genuine roster gap of
    // the three and the reason `Promise` sits beside `queueMicrotask`.
    graph['/plant/b.ts'] = `export const b = (f: () => void) => Promise.resolve().then(f)\n`
    expect(closureFrom('/plant/entry.ts', files).clocks).toEqual(['/plant/b.ts:1 Promise'])

    // …and the type-position half of that pair, which is what the real closure
    // is full of and what the previous paragraph had to make room for. Nine
    // sites in `src/core` look exactly like this and not one of them defers.
    graph['/plant/b.ts'] =
      'export declare function load(s: string): Promise<number>\n' +
      'export declare const cache: Map<string, Promise<number>>\n'
    expect(closureFrom('/plant/entry.ts', files).clocks).toEqual([])

    // The false positive the suppression exists to prevent, still prevented:
    // an ordinary object with a property called `Date` is not a clock, and a
    // narrowing that caught this one would redden legitimate code.
    graph['/plant/b.ts'] = `export const b = { Date: 1 }.Date + ({} as { Date: number }).Date\n`
    expect(closureFrom('/plant/entry.ts', files).clocks).toEqual([])

    // And the same for the browser roster, so the narrowing is not a `Date`
    // special case: `a.window` stays silent, `globalThis.window` does not.
    graph['/plant/b.ts'] = `export const b = (a: { window: number }) => a.window\n`
    expect(closureFrom('/plant/entry.ts', files).globals).toEqual([])
    graph['/plant/b.ts'] = `export const b = globalThis.window\n`
    expect(closureFrom('/plant/entry.ts', files).globals).toEqual(['/plant/b.ts:1 window'])
  })
})

/* --------------------------------------- criterion 9: the transport primitive */

/**
 * Grids whose final inter-frame gap differs in kind, swept by the invariant
 * below rather than one scene standing in for all of them.
 *
 * C-1 pinned `seek` ≡ `snapTime` over six configurations in `transport.ts`'s
 * own tests; re-establishing it *through the store* is a different statement
 * and needs its own sweep, because the store's path to a frame now runs
 * `dispatch` → `reduce` → `seek` → `snapTime` and any one of those links could
 * add a rule. A still is in the list because it is the degenerate grid — one
 * point, every time snapping to it — and it is where an off-by-one in a clamp
 * derived from `frameTimesOf(scene).length` would show.
 */
const GRIDS: readonly Scene[] = [
  { ...ANIM },
  { ...ANIM, fps: 8 },
  { ...ANIM, fps: 25 },
  { ...ANIM, duration: 0.55, fps: 12 },
  { ...ANIM, duration: 3, fps: 30 },
  { size: [64, 32], layers: [{ type: 'text', text: 'A' }] },
]

/**
 * Times to seek to, built per scene rather than written down.
 *
 * The final inter-frame gap is the only place `snapTime` and the circular
 * `snapLoopTime` ever disagreed, so it is the only sample that can hold the
 * answer — P2's own instruction, kept. The rest of the sweep is there so that
 * "they agree" is a claim about the line and not about one point on it.
 */
function sweepOf(scene: Scene): readonly number[] {
  const times = frameTimesOf(scene)
  const last = times[times.length - 1]!
  const span = loopDuration(scene)
  const gap = span - last
  const out: number[] = [-span, -0.001, 0, last, span, span + 1]
  for (let i = 0; i <= 40; i++) out.push((i / 40) * span)
  // Dense inside the gap, where the two rules used to part company.
  for (let i = 1; i < 8; i++) out.push(last + (i / 8) * gap)
  return out
}

describe('scene time and the transport primitive, through the store', () => {
  it('plays, pauses and seeks, with the wall clock supplied per action', () => {
    // Criterion 1 as a predicate, and criterion 3's behavioural half: every
    // line below is a number this test wrote down. No clock, no timer, no DOM,
    // no fake-timer plugin — a whole playback session as values, which is the
    // property `transportdriver.ts` records and the reason the loop stayed in
    // that module rather than coming into this one.
    const store = createSceneStore(initialState(ANIM))

    // Paused, the reported time does not depend on the clock at all.
    expect(currentTime(store.state(), 0)).toBe(timeOfFrame(ANIM, 0))
    expect(currentTime(store.state(), 9_999_999)).toBe(timeOfFrame(ANIM, 0))

    store.dispatch({ type: 'play', nowMs: 1_000 })
    expect(store.state().transport.playing).toBe(true)
    // One second of scene time per second of wall time, half a second in.
    expect(currentTime(store.state(), 1_000)).toBe(timeOfFrame(ANIM, 0))
    expect(currentTime(store.state(), 1_500)).toBe(timeOfFrame(ANIM, 6))

    store.dispatch({ type: 'pause', nowMs: 1_500 })
    expect(store.state().transport.playing).toBe(false)
    // Paused means paused: the time no longer moves with the clock, and the
    // interval spent paused is structurally uncountable on resume.
    expect(currentTime(store.state(), 9_999_999)).toBe(timeOfFrame(ANIM, 6))
    store.dispatch({ type: 'play', nowMs: 50_000 })
    expect(currentTime(store.state(), 50_500)).toBe(timeOfFrame(ANIM, 12))

    // A scrub during playback stays playing — a jump, not a stop.
    store.dispatch({ type: 'seek', seconds: 0.25, nowMs: 51_000 })
    expect(store.state().transport.playing).toBe(true)
    expect(currentTime(store.state(), 51_000)).toBe(timeOfFrame(ANIM, 3))
  })

  it('holds one scene time and not two: time is the transport anchor, after every Action', () => {
    /**
     * The duplication that this criterion's own sequencing exists to avoid.
     * A-1 refused to put `TransportState` in the store and said why: *"a store
     * quietly holding both is where that disagreement would have become
     * permanent."* It holds both now, so the thing that made that refusal
     * right has to be replaced by something, and this is it — `UiState.time`
     * and `transport.anchorTime` are one number with two names, asserted over
     * the whole vocabulary rather than over the three arms that touch time.
     *
     * Swept through `SAMPLES`, which is total by the compiler, so an arm added
     * later cannot opt out of the invariant by being forgotten here.
     *
     * ## The floor counts commits, and it did not used to
     *
     * The `try`/`catch` is here so the sweep can stay total over the
     * vocabulary while tolerating the samples `reduce` legitimately refuses —
     * an out-of-range layer index, a text patch the editor rejects. That makes
     * it **the one criterion-9 sensor total over the action vocabulary, and it
     * was the one that could not tell a refusal from a crash.** A verifier made
     * `withTransport` throw on *every* transition — the most total reducer
     * failure expressible — and this test passed: it swept its samples, caught
     * every throw, and asserted the invariant on that many copies of the
     * untouched initial state, because the old floor (`examined > 0`) counted
     * **attempts**.
     *
     * So the floor counts **commits** instead — a dispatch that returned and
     * moved the state — and it is **per variant**, not a single total. A single
     * total would have survived the same mutation as long as one arm anywhere
     * still worked; per variant, every arm has to actually reach the store for
     * this sweep to mean anything, and every one of them does today. The store
     * writes a fresh object for every accepted action (`reduce` returns one per
     * arm, which the module header records), so identity change is the commit
     * signal and it needs no cooperation from the state's shape.
     */
    let examined = 0
    const committed: Record<string, number> = {}
    for (const kind of Object.keys(SAMPLES)) {
      committed[kind] = 0
      for (const action of SAMPLES[kind as Action['type']]) {
        const store = createSceneStore(initialState(ANIM))
        const before = store.state()
        try {
          store.dispatch(action)
        } catch {
          // Refused by `reduce`; the state is untouched and still has to hold.
        }
        const state = store.state()
        const label = `${kind}: ${JSON.stringify(action)}`
        expect(state.time, label).toBe(state.transport.anchorTime)
        // …and the shared number is on the grid, which is `UiState.time`'s
        // own documented contract and `anchorTime`'s as well.
        expect(frameTimesOf(state.scene), label).toContain(state.time)
        examined++
        if (state !== before) committed[kind] = (committed[kind] ?? 0) + 1
      }
    }
    // Vacuity floor, in two parts because they fail on different things: a
    // sample table that had lost its arrays sweeps nothing, and a reducer that
    // refused everything sweeps the initial state N times and calls it N.
    expect(examined, 'no action was swept').toBeGreaterThan(0)
    for (const kind of Object.keys(SAMPLES)) {
      expect(
        committed[kind],
        `${kind}: every sample was refused, so the invariant above was asserted only on states ` +
        'this sweep never changed. A reducer that threw on every transition would pass that.',
      ).toBeGreaterThan(0)
    }
  })

  it('names the same frame as snapTime for every t, and clamps at both ends', () => {
    /**
     * Criterion 4, re-established through the store rather than cited from
     * `transport.ts`. "The invariant holds" and "the invariant survives the
     * store" are different statements and only the second says this layer left
     * it alone.
     *
     * **Where the vacuity floor went, and it had to move.** The agreement half
     * is a tautology by construction — `reduce` reaches a frame by calling
     * `seek`, which calls `snapTime` — exactly the shape C-1 measured when an
     * agreeing plant left its own agreement sweep green. So the floor is the
     * **clamp** half below, which compares each answer against an index derived
     * from `frameTimesOf(scene).length` and not against its twin. That one can
     * fail: a store that wrapped instead of clamping, or re-snapped against the
     * wrong scene after an `fps` edit, reddens there and nowhere else.
     *
     * The clock-free `time` action is swept beside `seek` because it is what
     * the editor's scrubber dispatches today, and a store in which the two
     * disagreed about which frame a time names would be the original defect in
     * a new place.
     */
    for (const scene of GRIDS) {
      const times = frameTimesOf(scene)
      const label = `${times.length} frames`
      for (const t of sweepOf(scene)) {
        const want = frameIndexAt(scene, snapTime(scene, t))

        const viaSeek = createSceneStore(initialState(scene))
        viaSeek.dispatch({ type: 'seek', seconds: t, nowMs: 7_000 })
        expect(frameIndexAt(scene, currentTime(viaSeek.state(), 7_000)), `${label} seek ${t}`)
          .toBe(want)

        const viaScrub = createSceneStore(initialState(scene))
        viaScrub.dispatch({ type: 'time', seconds: t })
        expect(frameIndexAt(scene, currentTime(viaScrub.state(), 7_000)), `${label} time ${t}`)
          .toBe(want)
      }

      // The clamp, against the grid's own length. Both ends, because a fold
      // that wrapped would be right about one of them by accident.
      const past = createSceneStore(initialState(scene))
      past.dispatch({ type: 'seek', seconds: lastFrameTime(scene) + 10, nowMs: 7_000 })
      expect(frameIndexAt(scene, currentTime(past.state(), 7_000)), `${label} past the end`)
        .toBe(times.length - 1)

      const before = createSceneStore(initialState(scene))
      before.dispatch({ type: 'seek', seconds: -10, nowMs: 7_000 })
      expect(frameIndexAt(scene, currentTime(before.state(), 7_000)), `${label} below zero`).toBe(0)
    }
  })

  it('wraps on advance and clamps on seek, so looping stayed where it was', () => {
    // The third clause of the ruling: *"Playback wrap remains a separate
    // operation — looping is `repeat`, which acts on advance, not on frame
    // selection."* Both halves are asserted against **the same number**, which
    // is the only way to show they are two rules rather than one: seeking to
    // `span + 1/12` parks on the last frame, and *advancing* by `span + 1/12`
    // comes round to frame 1. A store that had folded the two would have to
    // give one answer for both.
    const span = loopDuration(ANIM)
    const over = span + 1 / 12

    const seeking = createSceneStore(initialState(ANIM))
    seeking.dispatch({ type: 'seek', seconds: over, nowMs: 0 })
    expect(currentTime(seeking.state(), 0)).toBe(lastFrameTime(ANIM))

    const playing = createSceneStore(initialState(ANIM))
    playing.dispatch({ type: 'play', nowMs: 0 })
    expect(currentTime(playing.state(), over * 1000)).toBe(timeOfFrame(ANIM, 1))
    // …and it is still going round rather than having stopped at the end.
    expect(currentTime(playing.state(), (2 * span + 2 / 12) * 1000)).toBe(timeOfFrame(ANIM, 2))
  })

  it('re-anchors the transport onto the new grid when the scene changes under it', () => {
    // `anchorTime` is documented as *"always a point of `frameTimes(scene)`"*,
    // and an `fps` edit moves the grid out from under it. This is the arm that
    // would otherwise leave the store holding a transport anchored off-grid
    // while `UiState.time` was re-snapped — two representations drifting, in
    // the one place the sequencing of this task was arranged to prevent.
    const store = createSceneStore(initialState(ANIM))
    store.dispatch({ type: 'seek', seconds: 1, nowMs: 0 })
    store.dispatch({ type: 'fps', value: 25 })
    const state = store.state()
    expect(frameTimesOf(state.scene)).toContain(state.transport.anchorTime)
    expect(state.transport.anchorTime).toBeCloseTo(1, 2)
    // The moment is preserved, not the index: frame 12 of 24 and frame 25 of
    // 75 are the same instant and different numbers.
    expect(currentTime(state, 0)).toBeCloseTo(1, 2)
  })

  it('keeps two stores on separate playheads, transport included', () => {
    // `transportdriver.ts`'s reason for its own per-driver `self`, now owed by
    // the store as well: *"two players on one page must not share a playhead."*
    const one = createSceneStore(initialState(ANIM))
    const two = createSceneStore(initialState(ANIM))
    one.dispatch({ type: 'play', nowMs: 1_000 })
    expect(one.state().transport.playing).toBe(true)
    expect(two.state().transport.playing).toBe(false)
    expect(currentTime(two.state(), 9_999)).toBe(timeOfFrame(ANIM, 0))
    expect(two.state().transport).toEqual(initialTransport(ANIM))
  })
})

/** Freeze an object and everything reachable from it by own enumerable keys. */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const key of Object.keys(value as object)) {
    deepFreeze((value as Record<string, unknown>)[key])
  }
  return value
}
