/**
 * Which sources the build compiles, asked of TypeScript rather than of `dist/`.
 *
 * Two purity suites need this answer and there must be one of it.
 * `src/shared/purity.test.ts` reached it first: until 2026-10-15 its roster
 * enumerated `dist/shared/*.js` and paired back to `src/shared/*.ts`, so a
 * module that had never been compiled appeared in no instrument at all, and
 * the whole file was green over it. The fix was to stop asking the build and
 * start asking the compiler — `parseJsonConfigFileContent` returns exactly the
 * files `tsc -p tsconfig.json` compiles, which is upstream of the build rather
 * than downstream of it, so a never-built module is guarded the moment it is
 * on disk and a fourth `exclude` glob needs no edit anywhere.
 *
 * ## Why a module, and why this directory
 *
 * `src/core/purity.test.ts` needs the same answer for `src/core/`, and the two
 * easy ways to give it to both are both wrong. Importing it from the other
 * `.test.ts` registers that file's `describe`s into the importing suite —
 * measured in this repo, eight tests ran a second time under
 * `src/svelte-free.test.ts`'s name — which is why `importSpecifiers` lives
 * beside this file rather than in `purity.test.ts` where it was written.
 * Copying it is the other, and it is worse here than it is for the four-line
 * `filesUnder`/`kindOf` helpers those files do copy: what would be duplicated
 * is not a walk but **two fail-closed guards**, and the failure mode they
 * exist to prevent is a roster that is empty because the question could not be
 * answered. Two copies of a fail-closed guard is two places for one of them to
 * quietly stop failing closed, over a tsconfig that is a single file.
 *
 * `src/core/testing/**` is a `tsconfig.json` exclude, so nothing here is
 * compiled into `dist/` and `purity.test.ts` asserts that no path segment
 * `testing` is ever emitted. That is also why a compiled module must never
 * import from here, which is the rule `src/core/purity.test.ts` uses this to
 * state.
 */
import * as ts from 'typescript'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Anchored to this file, not to cwd, so callers are invocation-independent. */
export const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..')

/**
 * `tsconfig.json`, parsed. Callers want one of two answers from it —
 * `fileNames` ("what does this compile") and `options` ("where does it put the
 * result") — and both are needed, because a roster that is right about a
 * `dist/` nobody writes is still wrong.
 */
export function tsconfig(): ts.ParsedCommandLine {
  const configPath = resolve(REPO_ROOT, 'tsconfig.json')
  const read = ts.readConfigFile(configPath, ts.sys.readFile)
  // Fail closed, both here and below. An unparseable or unresolvable config
  // must not read as "no files to guard" — a roster that is empty because the
  // question could not be answered is the fail-open shape the plan's §9 keeps
  // naming, and it would report every guarded package clean over every module
  // in it. Throwing is the point: a purity suite that cannot find out what it
  // guards has to say so, not pass.
  if (read.error) {
    throw new Error(
      `tsconfig.json did not parse: ${ts.flattenDiagnosticMessageText(read.error.messageText, ' ')}`,
    )
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, REPO_ROOT, undefined, configPath)
  if (parsed.errors.length > 0) {
    throw new Error(
      `tsconfig.json did not resolve to a file list: ` +
        parsed.errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; '),
    )
  }
  // `parseJsonConfigFileContent` absolutises `rootDir` and `outDir` against
  // the config's directory, so a caller comparing them against its own walked
  // paths compares absolute to absolute without re-resolving either.
  return parsed
}

/**
 * Every source the build compiles, absolute.
 *
 * **Not the import closure.** `exclude` trims the `include` glob's root file
 * set only; a file an included module imports is still compiled and emitted
 * even though it is absent from this list. Measured on this tree: a compiled
 * `src/core/` module importing `./testing/imports.js` leaves that specifier's
 * target out of `fileNames` and still writes `dist/core/testing/imports.js`.
 * So "absent here" means **unguarded**, not "not built" — which is exactly why
 * reaching one from a guarded module is the defect the callers assert against.
 */
export function compiledFiles(): readonly string[] {
  return tsconfig().fileNames.map(f => resolve(f))
}
