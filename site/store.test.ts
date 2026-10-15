import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as ts from 'typescript'
import { createSceneStore } from './store.js'
import { initialState, reduce } from './controls.js'
import type { Action, UiState } from './controls.js'
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
  const alias = file.statements.find(
    (node): node is ts.TypeAliasDeclaration =>
      ts.isTypeAliasDeclaration(node) && node.name.text === 'Action',
  )
  if (!alias) throw new Error('controls.ts no longer declares `type Action`; this sweep is blind')
  if (!ts.isUnionTypeNode(alias.type)) {
    throw new Error('`Action` is no longer a union of object types; this sweep cannot enumerate it')
  }
  return alias.type.types.map(member => {
    if (!ts.isTypeLiteralNode(member)) {
      throw new Error(`an \`Action\` member is not an object type: ${member.getText()}`)
    }
    const tag = member.members.find(
      (property): property is ts.PropertySignature =>
        ts.isPropertySignature(property) && property.name.getText() === 'type',
    )
    const literal = tag?.type
    if (!literal || !ts.isLiteralTypeNode(literal) || !ts.isStringLiteral(literal.literal)) {
      throw new Error(`an \`Action\` member has no string-literal \`type\`: ${member.getText()}`)
    }
    return literal.literal.text
  })
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
 * References to {@link BROWSER_GLOBALS} in `text`, parsed and not grepped.
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
 */
function browserGlobalsIn(path: string, text: string): readonly string[] {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true)
  const declared = new Set<string>()
  const hits: string[] = []

  const walk = (node: ts.Node): void => {
    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isFunctionDeclaration(node) ||
        ts.isBindingElement(node) || ts.isImportSpecifier(node) || ts.isImportClause(node) ||
        ts.isClassDeclaration(node)) &&
      node.name && ts.isIdentifier(node.name)
    ) {
      declared.add(node.name.text)
    }
    if (ts.isIdentifier(node) && BROWSER_GLOBALS.includes(node.text)) {
      const parent = node.parent
      // `a.window` is a property named `window`, not the global.
      const isMemberName =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertySignature(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isPropertyDeclaration(parent) && parent.name === node) ||
        (ts.isMethodSignature(parent) && parent.name === node) ||
        (ts.isQualifiedName(parent) && parent.right === node) ||
        ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)
      if (!isMemberName) {
        const line = file.getLineAndCharacterOfPosition(node.getStart()).line + 1
        hits.push(`${path}:${line} ${node.text}`)
      }
    }
    ts.forEachChild(node, walk)
  }
  walk(file)
  return hits.filter(hit => !declared.has(hit.slice(hit.lastIndexOf(' ') + 1)))
}

interface Closure {
  /** Every file reachable from the entry by a static or dynamic specifier. */
  readonly files: readonly string[]
  /** Every browser-global reference in them, `path:line name`. */
  readonly globals: readonly string[]
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
  const svelte: string[] = []
  const pending = [entry]
  while (pending.length > 0) {
    const path = pending.pop()
    if (path === undefined || seen.has(path)) continue
    const text = files.read(path)
    if (text === undefined) continue
    seen.add(path)
    globals.push(...browserGlobalsIn(path, text))
    for (const specifier of importSpecifiers(text, ts.ScriptKind.TS)) {
      if (specifier === 'svelte' || specifier.startsWith('svelte/') || specifier.endsWith('.svelte')) {
        svelte.push(`${path} imports ${specifier}`)
      }
      const next = resolveModule(files, path, specifier)
      if (next !== undefined) pending.push(next)
    }
  }
  return { files: [...seen].sort(), globals: globals.sort(), svelte: svelte.sort() }
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
