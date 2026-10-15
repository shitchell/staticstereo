/**
 * The legibility rule, which now lives in `src/shared/perception.ts`.
 *
 * This file is a re-export shim and holds no rule of its own. The move is
 * P7's: `perception.ts` is the socket the rest of the perception functions
 * plug into, and `src/shared/` is where both the CLI and the page can reach
 * them. Nothing about the rule changed in the move — no threshold, no grade
 * boundary, no verdict — and the proof was that `site/legibility.test.ts` was
 * unmodified and still imported through this file.
 *
 * **That proof has been spent, and the sentence above is kept in the past
 * tense rather than deleted so nobody re-asserts it.** P7 criterion 5 then
 * changed the verdict *string* deliberately (the budget is not a lever on
 * legibility — `perception.ts`'s `describeLegibility` carries the finding)
 * and criterion 2 widened `legibilityOf` from a bare grade to a reading, so
 * that test file is modified and can no longer witness "nothing changed". The
 * thresholds still have not moved, and what witnesses *that* is now
 * `src/shared/perception.test.ts`'s boundary tests, every one of which derives
 * its budgets from the module's own constants.
 *
 * **The shim exists because P7 must not touch `site/main.ts`.** That file is
 * the rule's one production importer and a later phase deletes it, so rewiring
 * it here would be work done to a file on its way out — and an edit to it is
 * a collision with the phase that owns it. Keeping this specifier resolving
 * costs one line.
 *
 * `export *` rather than a named list, for the reason §9 gives about
 * hand-written lists: a list goes short in silence the day the module grows an
 * export, and P7's remaining functions are exactly that day.
 * `src/shared/perception.test.ts` asserts the two surfaces are the same set
 * and the same bindings, so this line is checked rather than trusted.
 */
export * from '../src/shared/perception.js'
