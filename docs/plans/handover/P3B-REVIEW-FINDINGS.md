# P3b — reviewer findings and their dispositions

**Status: P3b IS NOT READY TO MERGE.** Finding 2 awaits a tier-0 ruling and its cure is
unmeasured against the spelling that motivates it.

This file exists because the findings were living only in commit messages (`bbab1e1`),
and tier 0 could not locate them — *"P3b's six findings exist nowhere in the repo"*. They
did exist, in a commit message, which §1.2a permits. **In practice that was not
discoverable, and a gate-blocking artifact has to be.** A gate runner independently
flagged the same thing from the other side: a commit whose subject says a finding was
*"dispositioned"* while changing no file *"asserts bookkeeping the commit does not
contain."* Both are the same complaint. This document is the fix.

Produced by **W-REVIEW-P3b-R1**, rounds 1 and 2 — the phase's first reviewer, after seven
shifts without one. Round 2 is the last; a third is an escalation, not a round.

---

## Finding 1 — BLOCKING → **RESOLVED** (`6a72027`)

**The delegation guard was defeated by a one-line alias.** `site/store.test.ts` matched
writes by source-text equality against the storage expression, so a write through any
alias of the same object reached neither `writes`, `undelegated` nor `conditional`.

Measured with a discriminating negative control: an agreeing duplicate reducer arm routed
through `const box = self` gave **typecheck 0, 59 passed**. Deleting those two words and
spelling the identical write directly gave **`1 failed | 24 passed`**. The alias was the
entire evasion; the vacuity floor did not help, because the honest write remained in place
to satisfy it.

**Resolved, verified by plant and never by reading.** The governing sentence, which should
accompany any future repair of this guard:

> **"a fix that reads correct is what the last three also did."**

Three previous repairs each bought exactly the forms someone enumerated, and every one read
correct. This repair is **the first on that guard to survive a form outside its motivating
set** — `Object.assign(self, {state: …})`, caught because `self` in argument position is an
unfollowable reference. The discriminating control still reddens, and still on
`undelegated` rather than `aliased`, so no hole was traded.

## Finding 2 — BLOCKING → **OPEN. THIS IS THE MERGE BLOCKER.**

**A Node builtin reaches the shipped bundle and passes the entire gate.**

```
import os from 'node:os'
document.documentElement.setAttribute('data-zzrev7eta', String(os))
```

planted in `site/main.ts` with a top-level side effect so it cannot be tree-shaken:
**build 0 · typecheck 0 · build:site 0 · `npm test` 99 passed / 2227 passed, exit 0** —
four exit codes zero with the leak **present in the shipped artifact**,
`dist-site/assets/index-Cg5kX5ng.js`. Every sensor misses it because **nothing is left to
see**: vite *inlines* the module, so `grep -o "vite-browser-external"` returns 0 **and**
`grep -o "node:os"` returns 0.

Spelling decides it, both halves measured:

| form | result |
|---|---|
| `import { EOL } from 'node:os'` (named) | **build:site exit 1** — caught |
| `import os from 'node:os'` (default) | everything green — caught by nothing |

Independently reproduced on the **player** side by a second worker sharing no code: the
same default-import form reaches `dist-player` at exit 0 with the emitted chunk
**hash-identical and byte-identical in size** to the clean build.

### Disposition: same class, **unenumerated spelling**. Do not close as a duplicate.

Plan §9's row already records the *mechanism* verbatim, including the part that looks
novel — that the two sensors fail **together** rather than independently:

> *"the static forms hide by **leaving no artifact at all** — vite inlines `export default
> {}` and rollup drops the bare import, so **a text grep and an AST specifier reader are
> blind in exactly the same place, because there is no specifier left to read.** They look
> independent and are not. And it does not throw."*

That row even explains the named/default split: vite inlines `export default {}`, which is
exactly why a **default** import binds and a **named** one cannot resolve.

**But the row enumerates four spellings** — `require`, `await import`, bare static, and
namespace static. **The default-import form is a fifth and is not in the list.** So every
accounting sentence in that row — *"catches ZERO of four"*, *"onwarn + `dist.test.ts`
together cover all four"*, *"neither alone covers more than three"* — is computed over a
population of four that has **at least five** members.

**That is this phase's signature defect appearing inside the row that documents it:
enumeration-complete, not class-complete.**

### The cure converges, and one open measurement gates it

§9 names `build.rollupOptions.onwarn` *"a genuine complement"*. A separate worker measured
the player independently: **`onwarn` is one config line covering 9 of 9 routes**, including
the two that no output-reading check can ever see, where porting the site-side check is
~90 lines and covers 3 of 5 reachable routes. **Neither vite config currently sets
`external` or `onwarn`.**

**One `onwarn` task closes finding 2, finding 5 (Deviation B) and the re-scoped player
queue item. Cost them as one task, not three.**

> **OPEN MEASUREMENT, OWED BEFORE ADOPTION:** nobody has wired `onwarn` and confirmed it
> fires for the **default-import** spelling specifically. Every route warns on stderr, but
> **the cure is unmeasured against the spelling that motivates it.** Do not adopt on the
> strength of §9's claim.

## Finding 3 — SHOULD-FIX → **RESOLVED** (`6a72027`)

`site/hashprojection.ts`'s docblock claimed no browser global or timer is named, *"and
`hashprojection.test.ts` asserts both by parsing this file"* — literally true as scoped,
but `globalsNamedIn` was **single-file** where its sibling walks a real import closure.
`site/hash.ts`, hashprojection's one runtime import, was in **neither** instrument's reach.
A planted `Date.now()` and `location.hash` were invisible to every sensor in the repository.

**Resolved as one cure with finding 1**, per tier-0 ruling that repairing them separately
*"gains two more instruments to keep in step"* — which is the defect that produced both.

### The half-fix that my acceptance criterion would have accepted

> With the closure walk in place the plant **still only half-reddened**: `location` was
> caught, **`Date.now()` was not**, because `hashprojection.test.ts`'s `TIMER_GLOBALS` was
> hand-kept beside `store.test.ts`'s `CLOCKS` and carried neither `Date` nor `performance`.
> **Had the implementer stopped at the stated acceptance criterion — "the plant makes it
> RED" — it would have shipped a sensor blind to clocks that passes its own acceptance
> test.**

Both rosters are now derived from the shared ones. **Round 2 found no half-fixes
remaining:** *"Every fix was red for every reason it should be — the first round on this
phase where that sentence is true."*

## Finding 4 — SHOULD-FIX → **DEVIATION A. Open, dormant.**

**Criterion 14's remaining substance is not discharged.** `EDITOR_ONLY_MODULES` is a
literal array of seven strings, and the loops around it check two hand-written lists
against **each other**, which establishes nothing about the repository.
`toHaveLength(7)` can only fail if someone edits the list and forgets the number.
**Nothing in the file can detect a module becoming editor-only.** No control is needed —
the mechanism is closed by reading.

The plan's ruling already requires *"derive it or cross-check it against a derivation"*,
and no derivation exists. **Criterion 14 is CONFIRMED NOT MET.** The list is correct today,
verified. **Dormant:** the defect is rot-over-time and the shell has not yet added modules.

## Finding 5 — SHOULD-FIX → **DEVIATION B. Open, and NON-DORMANT.**

**The player's only node-leak sensor is a `yuv444p` text grep.** `forbiddenImportsIn`,
`unreadableImportsIn`, `parseChunks` and the browser-external stub row all exist exactly
once, over `dist-site`. The `describe.skipIf(!freshPlayer)('the built player')` block has
none of them. A `node:` builtin or `@napi-rs` import in the player graph contains no
`yuv444p`.

**Flagged non-dormant deliberately, and it must not be bucketed with A and C:** this is a
bundle that ships to users whose sole leak check is what the phase's own docblock calls
*"the weaker belt"*. Recording all three deviations in one bucket erases that distinction,
*"which is exactly how things get lost here."*

**Same cure as finding 2.**

## Finding 6 — NOTE → **DEVIATION C. Open, dormant.**

`projectedHash` returns `encodeSceneHash(state[PROJECTED_FIELDS[0]])` under a comment
claiming the roster *"is the code and not a description of it"*. True at arity one, false
at arity two: moving a field into `PROJECTED_FIELDS` leaves index 0 as `'scene'`,
typechecks, and silently drops the new field.

**It is caught — but by a hard literal pin** (`expect(PROJECTED_FIELDS).toEqual(['scene'])`)
in the test file, **not by the mechanism the comment names.** The pin works. Nothing
records that the pin is what makes `[0]` total. Cheapest of the three.

---

## Round-1 findings that resolved *against* the brief

Recorded because they are corrections, not confirmations.

- **The claim that deleting `store.test.ts`'s escape report is the cheapest route to green
  is FALSE** — measured, it reddens its own control. The real residue is narrower: the
  docblock's one prohibition is keyed to the **false-negative** trigger and the file gives
  **no instruction at all** for the false-positive case. A reader hitting a legitimate
  `globalThis` red finds nothing telling them what to do.
- **`forwardedFrom` "closed by the grammar" is not load-bearing.** Any missing
  value-forwarding node kind makes `isGlobalRoot` return false → `isDecidedReceiver` fails
  → the value is pushed to `escaped`: **a false RED, not a false green.** The claim is safe
  because it fails in the safe direction, **not because the set is closed** — and the
  docblock argues closedness, which is the wrong reason.
- **The clock-sensor docblock is correct as shipped**; it states member-name suppression on
  `PropertyAccessExpression`, not roster length.

## The avoidance that is a result

The reviewer **deliberately did not touch `site/controls.test.ts`'s G-3 tripwire block**
and said so rather than staying silent. `theLegacyErasureIsStillReachable` asserts that **a
hole is open** and deliberately carries no `@ts-expect-error`. It is the one block where
the correct action is the opposite of every other item in the round, and **a closed
tripwire reads as a passing test**, so the damage would be undetectable afterwards.

## Open, not owned by this document

The repair is verified; **the ~750-line vehicle is not.** `src/core/testing/sourceclosure.ts`'s
other exports went to no control. Routing is tier 0's.
