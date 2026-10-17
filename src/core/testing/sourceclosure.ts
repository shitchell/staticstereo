/**
 * The import-closure source sensors, in one place because two of them had
 * already drifted apart.
 *
 * ## Why this module exists, measured
 *
 * `site/store.test.ts` grew a closure walk — resolve the relative specifiers,
 * parse every file it reaches, report the browser globals and the clocks — and
 * `site/hashprojection.test.ts` grew a **single-file** identifier scan for the
 * same two questions. Neither file was wrong about itself; the pair was wrong
 * about the repository. `site/hash.ts` is `hashprojection.ts`'s one runtime
 * import and it was in **neither** instrument's reach, which a verifier
 * measured by planting
 *
 * ```ts
 *   void Date.now()
 *   void (typeof location === 'undefined' ? '' : location.hash)
 * ```
 *
 * into it: `build` 0, `build:site` 0, `typecheck` 0, **99 files / 2227 passed /
 * 0 skipped, exit 0**. A clock *and* a browser global, one hop from the module
 * whose entire design rationale is injectability, invisible to every sensor in
 * the repository.
 *
 * So the cure is not a second closure walk in the second test file. It is one
 * walk, here, that both ask — the same reason `importSpecifiers` was lifted out
 * of `purity.test.ts` and `roster.ts` out of the two purity suites, and the
 * same reason those files both give: *"two copies of a fail-closed guard is two
 * places for one of them to quietly stop failing closed."*
 *
 * ## …and the escape report is shared for the same reason, not merely moved
 *
 * {@link unfollowableReferences} is the other half of the cure, and it is the
 * one that is shared rather than relocated. It answers *"is every reference to
 * this value one the walk can follow?"* for **any** root, and two guards now
 * ask it of two different roots: {@link globalsIn} asks it of `globalThis`, and
 * `site/store.test.ts`'s delegation guard asks it of the object holding the
 * store's state — where `const box = self; box.state = …` was a write no
 * source-text match could see. Both failures were the same failure, so there is
 * one mechanism and not two to keep in step.
 *
 * ## Why this directory
 *
 * `src/core/testing/**` is a `tsconfig.json` exclude, so nothing here is
 * compiled into `dist/` and `src/shared/purity.test.ts` asserts that no path
 * segment `testing` is ever emitted. `imports.ts` beside it records the other
 * half of the reason: a `.test.ts` file's top-level `describe`s register into
 * whichever suite **imports** it, so sharing an instrument *through a test
 * file* would run that file's tests a second time under the importer's name —
 * measured in this repo at 14 reported where 6 were written. A non-test module
 * is the third way, and the one that costs nothing.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as ts from 'typescript'
import { importSpecifiers } from './imports.js'

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
export interface Files {
  /** The text at `path`, or `undefined` if there is nothing readable there. */
  read(path: string): string | undefined
}

export const REAL_FILES: Files = {
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
export function resolveModule(files: Files, from: string, specifier: string): string | undefined {
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
export const BROWSER_GLOBALS = [
  'document',
  'window',
  'location',
  'history',
  'navigator',
  'localStorage',
]

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
 * the acceptance is sensored by the controls in `site/store.test.ts`, which
 * fail the day one of the three plants above stops being seen.
 *
 * ## The recorded residue was understated, and its stated reason was false
 *
 * This paragraph used to say the remainder was *"out of reach of any parser
 * that is not a type checker"*. **A verifier then measured five spellings of
 * `globalThis` walking straight past the sensor, none of which needs a type
 * checker** — `(globalThis).X`, `(globalThis as any).X`, `globalThis!.X`,
 * `globalThis.globalThis.X` and `(globalThis as any)['X']`. They are a
 * one-function parser fix and they are now caught; see {@link globalsIn}.
 *
 * **A residue whose stated reason is false is worse than an unstated one**,
 * because the reason is what the next reader uses to decide not to look. That
 * is how this gap survived a shift.
 *
 * ## …and the residue that replaced it read as exhaustive, and was not
 *
 * The table that went here listed four spellings and two reasons, and it was
 * short by at least three — `(Math.random(), globalThis).Date.now()`,
 * `(true ? globalThis : globalThis).Date.now()` and
 * `Reflect.get(globalThis, 'Date').now()`, all typecheck 0, all invisible,
 * **none needing a resolver or a type checker**. The comma operator is the
 * one that settles the argument: this instrument's own stated principle is
 * that *wrappers which cannot change the value are erased before anything
 * runs*, the comma operator's value **is** its right operand, and the
 * implementation did not cover it. The principle was right and the enumeration
 * was short, twice running — so a third enumeration was not the fix and is not
 * what shipped.
 *
 * ## What shipped instead: the complement, not a list
 *
 * {@link globalsIn} now answers its question in two halves that partition the
 * space between them, so the residue is a property of the partition rather
 * than of anyone's imagination:
 *
 *  - **Decided.** The receiver resolves to `globalThis` through the
 *    grammar's *value-forwarding* node kinds — erasure wrappers, the comma
 *    operator, `?:`, `&&`/`||`/`??`, and `globalThis`'s own self-reference —
 *    and the member is read by name or by a string literal. A hit is
 *    reported if the member is on a roster. This set is closed by the
 *    grammar: it is every node whose runtime value *is* the value of a named
 *    sub-expression, which is a finite list, not a finite sample.
 *  - **Undecided.** Every other `globalThis` reference in the file — handed
 *    to a binding, returned from a function, passed as an argument, indexed
 *    by anything that is not a string literal. These are now **reported**,
 *    not passed, and the controls pin all seven measured spellings including
 *    the four that used to be this table.
 *
 * So there is no longer a list of spellings that get through on the
 * `globalThis` path. There is a cost, and it is a false **red**: a module
 * that legitimately touches `globalThis` is reported. Measured at the time of
 * writing, the store's closure is **21 files containing zero occurrences of
 * the token**, so the cost is currently nil; the repair if one arrives is to
 * teach the walk that spelling, never to drop the report.
 *
 * ## What remains out of reach, and this list states its own boundary
 *
 * These are the ways a clock can still reach a closure unseen. Each is
 * labelled with what it would take to close it, which is separate from the
 * fact that it is open:
 *
 * | still invisible | why, and what would close it |
 * |---|---|
 * | a module that both declares and uses a listed name, off the `globalThis` path | the declaration suppression's stated price; needs scope-aware resolution, i.e. a type checker |
 * | a clock whose name is not on this roster — `Worker`, `Atomics.wait`, a vendored timer | this roster is not derived from anything and says so; the controls fail the day a listed one stops being seen, but they cannot invent an unlisted one |
 * | a clock reached through text this walk never parses — `eval`, `new Function`, a template fed to either | not a parser limit and not a resolver limit: the code does not exist as code until it runs |
 * | a clock inside a module outside the closure — any non-relative specifier | `resolveModule` resolves relative paths only, so `node_modules` is outside this instrument by construction |
 *
 * **This table is the boundary, not a sample.** If a spelling is found that
 * is none of these four and is not reported as undecided, the partition above
 * has a gap and the gap is the defect — not the omission from a list.
 */
export const CLOCKS = [
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

/* ------------------------------------------- the value-forwarding grammar */

/**
 * The sub-expressions `node`'s runtime value can be, or `undefined` if `node`
 * is not value-forwarding syntax.
 *
 * **This replaced a list of spellings, twice.** A verifier measured five
 * spellings of a `globalThis` receiver walking past a bare-identifier test —
 * `(globalThis).X`, `(globalThis as any).X`, `globalThis!.X`,
 * `globalThis.globalThis.X`, `(globalThis as any)['X']` — and then measured
 * three more past the five-node-kind test that replaced it:
 * `(Math.random(), globalThis).X`, `(true ? globalThis : globalThis).X` and
 * `Reflect.get(globalThis,'X')`. **The comma operator is the one that settles
 * it**: the principle — *wrappers that cannot change the value are erased
 * before anything runs* — covers `(x, globalThis)` exactly, because the comma
 * operator's value **is** its right operand. The principle was right and the
 * enumeration was short, for the second round running.
 *
 * So this is keyed to the grammar rather than to a sample: every node whose
 * runtime value *is* the value of a named sub-expression. That is a closed
 * set — the grammar has finitely many such productions and they are all here —
 * where "spellings someone planted" is an open one. A node kind that forwards
 * goes here; nothing goes in the callers.
 *
 * The families, and why each forwards:
 *
 *  - **Wrappers that cannot change the value.** Parentheses, `as`,
 *    `satisfies`, `<T>x` and `!` are all erased before anything runs, so the
 *    value underneath is the one that is reached. `(globalThis as any).X` is
 *    the *idiomatic* TypeScript spelling of the evasion and the one a real one
 *    would be written in — a control that put its cast around the element
 *    access instead, `(globalThis['Date'] as DateConstructor)`, leaves
 *    `globalThis` a bare identifier and so exercises the cast in the one
 *    position where it does not break the receiver test. **Vary the position,
 *    not just the presence.**
 *  - **Operators whose value is one of their operands.** The comma operator
 *    yields its right; `?:` yields one branch; `&&`, `||` and `??` yield one
 *    side. For the branching three, *every* value the expression can take must
 *    be the root — `(c ? globalThis : other)` is not, and the escape check
 *    reports it rather than letting it pass as neither.
 *
 * Plain assignment is deliberately **not** forwarding, though its value is its
 * right operand: `(g = globalThis).X` would be decided while leaving `g`
 * holding the global unseen, so it is left to {@link unfollowableReferences},
 * which reports it. A forwarding rule that creates a laundered binding buys one
 * spelling and sells a silent one.
 *
 * Optional chaining (`globalThis?.Date`) needs nothing here: it is already a
 * `PropertyAccessExpression` whose `expression` is the bare identifier.
 *
 * `Reflect.get(globalThis, 'X')` is **not** here and is not a forwarding node —
 * it is a member read spelled as a call, and the set of those (`Reflect.get`, a
 * destructure, `Object.entries`, a `with` block) is open in exactly the way
 * this function stopped enumerating. It is caught by the other half: a root in
 * an argument position is a value the walk has lost, and a lost value is
 * reported.
 *
 * **If a control reddens because a spelling was added rather than removed,
 * widen this function — do not narrow the call sites.** The cheapest way to
 * make a sensor failure go away is to put the bare-identifier test back, and
 * that is the defect, not the fix.
 */
export function forwardedFrom(node: ts.Node): readonly ts.Expression[] | undefined {
  if (
    ts.isParenthesizedExpression(node) || ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) || ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return [node.expression]
  }
  if (ts.isConditionalExpression(node)) return [node.whenTrue, node.whenFalse]
  if (ts.isBinaryExpression(node)) {
    const kind = node.operatorToken.kind
    if (kind === ts.SyntaxKind.CommaToken) return [node.right]
    if (
      kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      kind === ts.SyntaxKind.BarBarToken ||
      kind === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return [node.left, node.right]
    }
  }
  return undefined
}

/**
 * Whether `node` evaluates to `globalThis`, however it is spelled — the
 * {@link forwardedFrom} grammar plus `globalThis`'s own self-reference.
 *
 * `globalThis.globalThis` *is* `globalThis`, by the specification, and so is
 * the index spelling of it, to any depth. Recursing on the receiver covers the
 * family rather than the one rung someone thought to plant. That recursion is
 * **specific to `globalThis`** and is why this is a named root test rather than
 * {@link bindingRoot}: an ordinary binding `self` has no such guarantee, and
 * `self.self` is a property read like any other.
 */
export function isGlobalRoot(node: ts.Expression): boolean {
  const forwarded = forwardedFrom(node)
  if (forwarded !== undefined) return forwarded.every(isGlobalRoot)
  if (ts.isIdentifier(node)) return node.text === 'globalThis'
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text === 'globalThis' && isGlobalRoot(node.expression)
  }
  if (ts.isElementAccessExpression(node)) {
    return ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === 'globalThis' && isGlobalRoot(node.expression)
  }
  return false
}

/**
 * Whether `node` evaluates to the binding called `name` — the
 * {@link forwardedFrom} grammar and nothing else.
 *
 * File-wide and not scope-aware, which is the posture every instrument in this
 * module takes and the one `site/store.test.ts` records the reason for: a
 * same-named binding elsewhere can only add references, every reference has to
 * clear the decidedness test, so a collision makes the guard stricter. It can
 * produce a false red. It cannot produce a false green.
 */
export function bindingRoot(name: string): (node: ts.Expression) => boolean {
  const is = (node: ts.Expression): boolean => {
    const forwarded = forwardedFrom(node)
    if (forwarded !== undefined) return forwarded.every(is)
    return ts.isIdentifier(node) && node.text === name
  }
  return is
}

/**
 * The outermost expression whose value is `node`'s — {@link forwardedFrom}
 * walked upwards, which is the direction the escape check needs.
 */
export function topOfForwarding(node: ts.Expression): ts.Expression {
  let at: ts.Expression = node
  for (;;) {
    const parent: ts.Node | undefined = at.parent
    if (parent === undefined) return at
    const forwarded = forwardedFrom(parent)
    if (forwarded === undefined || !forwarded.includes(at)) return at
    at = parent as ts.Expression
  }
}

/** Whether `node` is the receiver of a member read this walk can name. */
export function isDecidedReceiver(node: ts.Expression): boolean {
  const parent = node.parent
  if (ts.isPropertyAccessExpression(parent)) return parent.expression === node
  if (ts.isElementAccessExpression(parent)) {
    return parent.expression === node && ts.isStringLiteral(parent.argumentExpression)
  }
  return false
}

/**
 * Whether this identifier is a *reference to a value*, not a name.
 *
 * `globalThis.globalThis` has two identifiers spelling it and only the receiver
 * is a reference; the member one is handled by the recursion in
 * {@link isGlobalRoot}. A type position references nothing at runtime.
 */
export function isValueReference(node: ts.Identifier): boolean {
  const parent = node.parent
  if (ts.isTypeNode(parent)) return false
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false
  if (ts.isQualifiedName(parent) && parent.right === node) return false
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return false
  if (
    (ts.isVariableDeclaration(parent) || ts.isParameter(parent) ||
      ts.isBindingElement(parent) || ts.isFunctionDeclaration(parent) ||
      ts.isClassDeclaration(parent) || ts.isMethodDeclaration(parent) ||
      ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) ||
      ts.isPropertyDeclaration(parent) || ts.isMethodSignature(parent)) &&
    parent.name === node
  ) {
    return false
  }
  return true
}

/**
 * Every reference to `name` in `file` whose fate this walk cannot follow.
 *
 * ## The question, and why it is one function and not two
 *
 * A source-text sensor that reasons about *what is read off a value* can only
 * be trusted as far as it can follow that value. The complement of what it can
 * decide is therefore the report — not a list of the spellings someone thought
 * of, which is the shape that was measured short three rounds running.
 *
 * **Decided** is: the reference, after {@link topOfForwarding}, still evaluates
 * to the root (`isRoot`) and is the receiver of a member read this walk can
 * name (`x.y`, `x['y']`). **Everything else is reported** — handed to a
 * binding, returned from a function, passed as an argument, indexed by anything
 * that is not a string literal.
 *
 * ## Two guards ask this, of two different roots, because they had one defect
 *
 * {@link globalsIn} asks it of `globalThis`: a module that hands `globalThis`
 * somewhere this walk cannot follow is a module whose "does it reach a clock?"
 * answer is **unknown**, and saying so is the whole of that repair.
 *
 * `site/store.test.ts`'s delegation guard asks it of the object holding the
 * store's state, and that was the second measurement. The guard matched writes
 * by source-text equality against `self.state`, so
 *
 * ```ts
 *   const box = self
 *   box.state = { ...self.state, depthView: action.value }
 * ```
 *
 * — an agreeing duplicate of a real reducer arm, planted in the real
 * `site/store.ts` — was **not a write at all** to the instrument: typecheck 0,
 * 59 passed, exit 0. Deleting the two words `const box = self` and spelling the
 * identical write `self.state = …` reddened it immediately, so the alias was
 * the entire evasion.
 *
 * **The cure is not to enumerate alias spellings.** That buys exactly one
 * spelling, and the delegation guard's own docblock records three rounds of
 * having bought exactly the forms somebody enumerated. A binding of the storage
 * receiver to a second name is a *hop this walk cannot follow*, which is the
 * question this function already answers — so it is answered here, once, for
 * both roots, rather than in two instruments that would then have to be kept in
 * step. That is the defect that produced both findings.
 *
 * ## The cost, and the direction it is allowed to be wrong in
 *
 * A false **red** on a value that legitimately escapes. That is the direction
 * these instruments are permitted to fail: a false red is a minute, and a false
 * green was a shift, twice. **If this reddens, teach the walk the hop. Do not
 * narrow it to clear the red** — every hole this family has had was a narrowing
 * that looked reasonable at the time.
 *
 * ## Its stated boundary
 *
 * `x.x` is **not** recognised as `x` for an ordinary binding (only `globalThis`
 * self-references, and {@link isGlobalRoot} carries that). So `self.self.state`
 * is treated as a read of some other object's member, exactly as
 * `self.registrations` is. It is named here rather than left for a reader to
 * discover: for the store it is unreachable — `self` has no `self` member and
 * the compiler refuses it — but the sentence is about the instrument, not about
 * today's module.
 */
export function unfollowableReferences(
  file: ts.SourceFile,
  name: string,
  isRoot: (node: ts.Expression) => boolean,
): readonly ts.Identifier[] {
  const out: ts.Identifier[] = []
  const walk = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === name && isValueReference(node)) {
      const top = topOfForwarding(node)
      if (!(isRoot(top) && isDecidedReceiver(top))) out.push(node)
    }
    ts.forEachChild(node, walk)
  }
  walk(file)
  return out
}

/** The 1-based line `node` starts on, for a `path:line …` report. */
export function lineIn(file: ts.SourceFile, node: ts.Node): number {
  return file.getLineAndCharacterOfPosition(node.getStart()).line + 1
}

/* ------------------------------------------------------- the globals sensor */

/**
 * References to `names` in `text`, parsed and not grepped.
 *
 * A grep cannot do this job here and that is measured, not assumed: a
 * word-boundary search over the store's closure returns six hits, and **all six
 * are prose** — `site/scene.ts:14` says a scene may arrive "from
 * `location.hash`", `src/core/analysis.ts:21` discusses a measurement
 * *window*, `src/core/anim/presets.ts:393` mentions a file's *history*. An
 * identifier node is never a comment and never the inside of a string, which
 * is the same argument `imports.ts` records for parsing imports rather than
 * grepping them. `site/hashprojection.ts` sharpens it further: that module's
 * docblocks discuss `location.hash` and `history.replaceState` at length,
 * because explaining what it refuses to touch is most of its rationale, so a
 * grep would force the prose to be written around the instrument.
 *
 * **A name the file itself declares is not a global**, and that suppression is
 * file-wide rather than scope-aware. `site/present.ts` takes a parameter named
 * `location`, so a parser that ignored declarations would accuse it; a
 * resolver that got the scopes right is a type-checker and not worth building
 * here. The cost is a false *negative* for a file that both declares and uses
 * the same name — which is why {@link BROWSER_GLOBALS} leads with `document`
 * and `window`, the two no module shadows, and why the controls plant a file
 * that declares `location` and still gets caught on `document`.
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
 * ## The four it could not see are now the four it says it cannot see
 *
 * That paragraph used to end with a list — a receiver laundered through a
 * variable, a receiver returned from a call, a computed member name, a
 * concatenated member name — each *"confirmed green"*, which is this repo's
 * own word for invisible. **A list of spellings that pass is a list someone
 * has to keep complete, and it was measured short by three.** It is replaced
 * by the complement: {@link unfollowableReferences} reports every `globalThis`
 * reference whose fate this walk cannot follow, so the four above now redden
 * along with every spelling nobody has thought of. {@link CLOCKS} states what
 * remains out of reach after that, and states it as a boundary rather than as
 * a sample.
 *
 * The cost is a false **red** on a legitimate `globalThis`, which is the
 * direction this instrument is allowed to be wrong in. The store's closure
 * contained zero occurrences of the token when this was written, so the cost
 * was nil on the day it shipped and will announce itself loudly if it ever is
 * not.
 *
 * **If a clock slips past this, widen {@link isGlobalRoot}, {@link
 * forwardedFrom} or the roster. Do not re-narrow any of them to make a red go
 * away** — every hole this function has had was a narrowing that looked
 * reasonable at the time.
 */
export function globalsIn(path: string, text: string, names: readonly string[]): readonly string[] {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true)
  const declared = new Set<string>()
  const hits: string[] = []
  // Reached through `globalThis`, so neither the member-name suppression nor
  // the declaration filter applies — these are the global whatever the file
  // calls its own bindings.
  const rooted: string[] = []
  const lineOf = (node: ts.Node): number => lineIn(file, node)

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

  // The complement of everything above: a reference to `globalThis` that does
  // not end in a member read this walk can name. Roster-independent on purpose
  // — a receiver this walk has lost could be read for *any* global, so the
  // report is the same for both rosters and appears in whichever one is being
  // asked about.
  const escaped = unfollowableReferences(file, 'globalThis', isGlobalRoot).map(
    node => `${path}:${lineOf(node)} globalThis escapes to somewhere this walk cannot follow`,
  )

  return [
    ...hits.filter(hit => !declared.has(hit.slice(hit.lastIndexOf(' ') + 1))),
    ...rooted,
    ...escaped,
  ]
}

/* --------------------------------------------------------- the closure walk */

/** Which names each half of {@link Closure} is asked about. */
export interface Rosters {
  /** Reported as {@link Closure.globals}. */
  readonly globals: readonly string[]
  /** Reported as {@link Closure.clocks}. */
  readonly clocks: readonly string[]
}

export const DEFAULT_ROSTERS: Rosters = { globals: BROWSER_GLOBALS, clocks: CLOCKS }

export interface Closure {
  /** Every file reachable from the entry by a static or dynamic specifier. */
  readonly files: readonly string[]
  /** Every {@link Rosters.globals} reference in them, `path:line name`. */
  readonly globals: readonly string[]
  /** Every {@link Rosters.clocks} reference in them, `path:line name`. */
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
 * **And "the right shape for a leaf module" is a claim about the module, not
 * about the file that asserts it.** `site/hashprojection.ts` reads as a leaf —
 * its only value import is `hash.ts` — and `hashprojection.test.ts` asserted
 * the one-file version on that reading. A verifier planted a clock *and* a
 * browser global in `site/hash.ts` and the whole repository stayed green: 99
 * files, 2227 passed, exit 0. The scope of the assertion was narrower than the
 * property it stood in for, which is why both callers are on this walk now.
 *
 * Specifier extraction is `imports.ts`'s, deliberately: it already covers
 * static, bare side-effect, `import type`, `import('x').T`, dynamic `import()`
 * and `require()`, and a fourth hand-rolled copy in this repo is the defect
 * `transport.test.ts:91` exists to talk about.
 *
 * `rosters` is a parameter rather than a constant for the reason
 * `hashprojection.test.ts` already recorded for its own defaulted table — *"the
 * alternative is two parsers drifting apart"*. The two callers ask about
 * overlapping but different names (`globalThis`, `setImmediate` and
 * `requestIdleCallback` matter to the projector and not to the store), and that
 * difference must not be a reason to own a second walk.
 */
export function closureFrom(
  entry: string,
  files: Files = REAL_FILES,
  rosters: Rosters = DEFAULT_ROSTERS,
): Closure {
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
    globals.push(...globalsIn(path, text, rosters.globals))
    clocks.push(...globalsIn(path, text, rosters.clocks))
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
