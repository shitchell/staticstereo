---
title: P3b review findings — rounds 1 and 2, transcribed before they evaporated
description: The P3b phase reviewer's findings 1-6 and round 2's findings A and B, with their controls and dispositions, written down because round 1's enumeration reached no tier and existed only in one agent's context
status: ROUND 2 COMPLETE, 2026-10-17, scoped to the post-round-1 delta — NO BLOCKING FINDINGS, and the hunt for a cure that closes a finding by narrowing the sensor came back EMPTY (all four cures widened). Nothing was hollowed out in `site/store.test.ts` despite its net −311 lines, established by assertion census with the census itself controlled against a hollowed variant. Round 1's finding 2 ruling stays WITHDRAWN (orchestrator error 45). OPEN - finding A, `isFirstParty` fails OPEN on an extractable but non-absolute importer, tier-0 ruled FIX not deviation. DISCHARGED - finding B, the two outstanding spellings measured, population restated 9 to 11. FOLDED - finding 4 is one item with criterion 14, the criterion authoritative, and the criterion is NOT MET because the mechanism does not exist (proved by control); tier-0 ruled DERIVE it from the import graph. Finding 6 still travels as a recorded deviation
date: 2026-10-16
tags: [review, findings, staticstereo, p3b]
---

# P3b review findings 1–6

**Why this document exists.** The reviewer's round-1 report — **the only enumeration of these
six findings** — reached no tier. **Three `SendMessage` calls failed** with *"No agent named
'general-purpose' is reachable"*, and *"findings 1–6 stand"* circulated for two rounds as a
reference to a list **nobody held**. The orchestrator confirmed it existed in no document.
It was recovered only because **the reviewer flagged, on its way out, that finding 2 had no
disposition** — the second time on this project a reviewer's output has had to be rescued
from its own closing message.

**Transcribed, not summarised** — the rule adopted after nine criteria reconstructed from
memory came back with five rows wrong and one criterion deleted.

**Measured at** `523280f` · **resolution re-measured at** `6a72027` (tree `6f7c0c6`).
**Provenance, the reviewer's own:** *"every blindness claim below rests on a plant I ran and
reverted in an isolated worktree, with the build run first. Where I ran no control, I say so
and give the mechanism instead. Nothing below is relayed."*

---

## Finding 2 — OPEN; the **NEW, not a rediscovery** ruling is **WITHDRAWN** (error 45)

> **Frontmatter and heading corrected in a later commit than the body.** For one commit this
> document asserted *"finding 2 is BLOCKING and NEW"* at the top while its own body withdrew
> that ruling — **the exact frontmatter-staleness trap recorded in §9 the same day**,
> reproduced in the document recording the ruling it summarises. Rule unchanged, now with a
> second witness: **update the frontmatter in the same commit as the body.**


**`site/dist.test.ts`** · vacuous sensor · **the subject is the parse-based
`forbiddenImportsIn` check — the ESC-9 deliverable — not `build:site`.** The build's
blindness is a *precondition* of the measurement, not its content.

**Mechanism:** for this spelling vite **inlines** the empty browser-external stub instead of
emitting a `__vite-browser-external*` chunk. Measured on the shipped artifact:

```
grep -o "vite-browser-external"  dist-site/assets/index-Cg5kX5ng.js  →  0
grep -o "node:os"                dist-site/assets/index-Cg5kX5ng.js  →  0
grep -o "zzrev7eta"              dist-site/assets/index-Cg5kX5ng.js  →  1
```

**There is no specifier left in the artifact to parse and no `node:` text either — so no
artifact-level checker of any kind can see it.** The narrowed parse-based check and the
superseded `text.includes` check are blind to the same spelling by the same cause.

**Spelling decides it, and both arms were measured:**

| spelling | `build:site` |
|---|---|
| `import { EOL } from 'node:os'` (named) | **exit 1** — `"EOL" is not exported by "__vite-browser-external"` |
| `import os from 'node:os'` (default) | **exit 0** — passes everything |

**Control `ZZREV7ETA`**, planted into `site/main.ts` with a top-level side effect so it
cannot be tree-shaken: **`build` 0 · `typecheck` 0 · `build:site` 0 · `npm test` 99 files /
2227 passed, exit 0** — with the plant **confirmed present in the shipped bundle.**

**A negative result the reviewer recorded against itself:** its first attempt was
**tree-shaken out, bundle hash unchanged.** That green was *correct, not blind*, and it
declined to cite it. **Only the non-shakeable form is evidence.**

### ORCHESTRATOR RULING — **WITHDRAWN. Error 45.** It was made against half the record.

**I ruled "different and new". That ruling is withdrawn.** I applied the reviewer's decision
procedure to **`main`'s copy of §9, which carries only the *dynamic* row.** The **static**
row — **on `feat/p3b-store`, in 26 lines `main` does not have** — says exactly this
mechanism and says it first:

> *"Both static forms … are missed by **every instrument in the repo at both commits**. The
> mechanism is the **opposite** of the one recorded above: the dynamic form hides *behind a
> rewrite*, so grepping the stub cures it; the static forms hide by **leaving no artifact at
> all** — vite inlines `export default {}` and rollup drops the bare import, so **a text grep
> and an AST specifier reader are blind in exactly the same place, because there is no
> specifier left to read.**"*

**So finding 2 is largely a REDISCOVERY**, including the clause I thought was new — that the
ESC-9 parse-based reader is blind too. **What survives as genuinely new is narrower: the
default-import spelling is a *third* static form**, where the row names two, so **the row's
"four spellings" arithmetic is computed over a population of at least five.**

**The structural cause is worse than the mistake:** `§9` exists in **two diverged copies**.
The branch amended it; `main` will not have those 26 lines until P3b merges. **So tier 0
ruled from a stale copy while the PM read a fresher one** — and neither of us could see that
from our own side.

**AND THE RULING WOULD HAVE COST SOMETHING REAL.** PM-SHELL-P3b-7: *treating finding 2 as a
distinct route invites **a second mechanism where one suffices** — the exact defect findings
1 and 3 were ruled into a single cure to avoid, one ruling earlier.* The branch row already
names the cure: **`onwarn` catches the three resolved forms and is structurally incapable of
seeing `require`; `onwarn` + `dist.test.ts` together cover all four, neither alone covers
more than three.**

**ORDERED BEFORE ANY ACTION ON FINDING 2 OR FINDING 5: wire `onwarn` and measure whether it
fires for the default-import spelling.** If it does, **one task closes finding 2, finding 5
and the player item.** Do not build a second mechanism before that measurement exists.

### THE ORDERED MEASUREMENT CAME BACK: **YES.** Classification moot, one cure, approved

**Measured by PM-SHELL-P3b-7, recorded at `35fe08c`, tree restored byte-equivalent** (both
vite configs blob-identical, `build:site` re-emitting the clean baseline hash — *equivalent*,
not merely *green*).

`import zz1 from 'node:os'` → **1 warning**, `PLUGIN_WARNING` / `vite:resolve`; throwing →
**exit 1, emits nothing**, on **both** entries. **The player behaves identically to the site
on all nine measured routes** — separate plants, separate builds; *mostly* is now *exactly*.

**The mechanism, which is the first general statement this project has about *why* an
instrument sees what others cannot:** **it fires at *resolve* time, strictly before the
inlining that erases the evidence. The hole and the cure sit on opposite sides of the same
step.**

**Coverage — RESTATED 2026-10-17, after the two outstanding forms were measured. See
§ "Round 2" at the end of this document for the measurement.** Of the **eleven** forms
enumerated and named there: **`onwarn` 10 of 11**, missing only the `require` family
structurally; **`onwarn` ∪ `dist.test.ts` = 11 of 11**, neither alone above 10. **Stated as
*of the forms enumerated*, deliberately** — the population has gone **four → five → nine →
eleven, across four enumerations, each made by someone who believed theirs complete.**
**The sequence is better evidence than any total, because it predicts that eleven is also
provisional.** Never cite a bare total from this paragraph; cite it as *of the forms
enumerated, named below*.

> *Superseded figures, kept rather than overwritten because the sequence is the evidence:
> this paragraph read **"8 of the 9 routes"** and **"`onwarn` ∪ `dist.test.ts` = 9 of 9,
> neither alone above 8"**, and it named `export * from 'node:fs'` and
> `import fs = require('node:fs')` as unmeasured, owed before any total was written down.
> **That precondition is DISCHARGED** — both measured at `fb3afb5`, by real vite builds at
> `NODE_ENV=production`, each plant grep-confirmed present in source before the build.*

**THE CURE IS NOT A ONE-LINER, AND THE OBVIOUS IMPLEMENTATION IS A NET REGRESSION.**
vite's `UNRESOLVED_IMPORT → throw` lives inside `defaultHandler`, so the handler anyone
writes first — `if (matches) throw; return` — **never calls it and deletes that existing
build failure.** Measured: swallowing **shipped a nonexistent package as a bare external
import at exit 0.** This is §6.5a with a new twist worth generalising — **the cheapest
wrong action is not deleting the guard, it is writing the guard.**

Two further preconditions, both measured rather than feared: the `node_modules`
false-positive surface is **constructed, not latent** (`@napi-rs/canvas`, already a direct
dependency, emits an identically-shaped warning with **bare** specifiers — `os`, `util`,
`fs` — so *"scope it to `node:`"* writes the wrong matcher); and **attribution exists only
as prose** — `id`, `ids`, `importer`, `loc`, `frame` are all `undefined`, leaving an
absolute path inside an English sentence.

**Approved as four clauses plus four tier-0 conditions:** (a) scope by the importer,
restricted to `site/`+`src/`; (b) forward to `defaultHandler` on **every** non-matching
path; (c) match **bare** specifiers as well as `node:`-prefixed; (d) keep `dist.test.ts`,
the only thing that sees `require`. **Conditions:** **fail *closed* on an unattributable
warning** — a matcher that silently stops matching is indistinguishable from a clean build,
which is the defining failure of every blind instrument found here; **pin vite exactly, not
with a caret**, since the cure's contract is a dependency's prose; **a rot canary that runs
a real build**, never a hand-written warning fixture (that is finding 4's defect — two hand
lists agreeing with each other); and **measure the two outstanding forms before publishing
any coverage total.**

### Superseded ruling, kept because the error is instructive

The reviewer supplied a decision procedure and refused to apply it itself, lacking the
recorded hole's subject. **Applied: the recorded leak — `await import('node:fs')` — DOES
emit a `__vite-browser-external-*.js` chunk**, which §9 records verbatim; that marker is in
the artifact and is findable. **This leak leaves neither the chunk nor any `node:` text.**
By the reviewer's own test: **different, new, and the existing queued task will not close
it.** Closing it as a duplicate is how it would disappear.

**And even on the rediscovery branch the reviewer identified a clause recorded nowhere:**
*"the ESC-9 narrowed check is blind to this spelling too"* — which matters because **ESC-9's
whole premise was that the parse-based check is the braces to the text check's belt.**

**What would have to be true for it to be right:** a **source-graph** check on the site and
player entries. One exists for `dist/core` and for the web adapter; **none exists for either
browser entry** — a gap `site/dist.test.ts`'s own docblock names (*"the site could import
`staticstereo/node` directly and both would stay green"*) and then answers with bundle-level
checks this measurement shows cannot close it. **Alternatively, `external` on both vite
configs turns it into a build error.**

---

## Finding 1 — RESOLVED, verified by plant

**`site/store.test.ts`** · vacuous sensor · blocking. Writes were matched by **source-text
equality** against `"self.state"`, so **a write through any alias was not a write at all** —
reaching neither `writes`, `undelegated` nor `conditional`.

**Control `ZZREV7ALPHA`:** an *agreeing* duplicate selected without any tag literal, routed
through `const box = self` → **typecheck 0, 59 passed, exit 0.** **The discriminating half:**
delete the alias, spell the identical write directly → **1 failed | 24 passed.** *The alias
is the entire evasion*, and the vacuity floor does not save it because the honest write
stays in place to satisfy it.

**RESOLVED at `6a72027`.** The new `aliased` report **names the hop, not the alias**, and
fires at `const box = self` rather than at the write. The direct form **still lands on
`undelegated`** — no hole traded. **And it generalises: `Object.assign(self, { state: … })`,
a form nobody enumerated, is also caught**, because `self` in argument position is an
unfollowable reference. **The first repair of this guard to survive a form outside its
motivating set** — three previous repairs each bought exactly what someone enumerated.

---

## Finding 3 — RESOLVED, both halves attributed separately

**`site/hashprojection.test.ts`** · scope gap · should-fix. `globalsNamedIn` was
**single-file** while its sibling walked a real import closure, and **`site/hash.ts` —
hashprojection's one runtime import — was in neither instrument's reach.**

**Control `ZZREV7EPSILON`**, a clock *and* a browser global planted one hop out: **99 files /
2227 passed, exit 0.** Invisible to every sensor in the repository.

**The original claim was literally true as scoped** (*"by parsing this file"*) — **the defect
is that the scope was narrower than the property**, and the reviewer declined to call it
false.

**RESOLVED at `6a72027`**, with the plant **split** rather than a combined red trusted: the
clock alone and the global alone each produce their own named failure. **The clock half was
a half-fix caught by the implementer, not the reviewer** — a hand-kept roster carried
neither `Date` nor `performance`. **The shipped cure is structural**: both rosters now
compose from shared bases, so **recurrence by omission is impossible.**

---

## Findings 4, 5, 6 — recorded SEPARATELY as deviations, and 5 is not dormant

**Bucketing these together erases the distinction, which is how things get lost here.**

**Finding 4 — `site/dist.test.ts`, `toHaveLength(7)`** · hand-written list · should-fix ·
**no control run and none possible — the mechanism is closed.** Two hand-written lists
cross-checked **against each other**, establishing nothing about the repository; the length
assertion can fail only if someone edits the list and forgets the number. **Nothing in the
file can detect a module becoming editor-only.** The list **is correct today** (verified).
**DEVIATION: rot risk, not live defect.**

> **FOLDED INTO CRITERION 14, 2026-10-17, by tier-0 ruling. Deviation A stops travelling
> separately; this text stays where it is.** Reason, tier 0's: *"A deviation is a recorded
> acceptance of not meeting something, so it cannot be the thing that defines what is being
> met."* The criterion outranks the deviation record.
>
> **Two of this finding's three claims survive measurement and one does not.** *"The list is
> correct today"* — **CONFIRMED independently**, by a TypeScript-parser import-graph walk
> from both verified entries, 7 of 7, both deltas empty, no grep in the derivation.
> *"Nothing in the file can detect a module becoming editor-only"* — **CONFIRMED BY CONTROL,
> and the true scope is wider: nothing in the REPOSITORY detects it.** But **"none possible"
> is FALSE**: the control cost one import line. A module genuinely entering the editor bundle
> — confirmed present in `dist-site` and absent from `dist-player` — moved **nothing**:
> typecheck 0, build 0, build:site 0, test 0, 2240 passed, zero skipped, not one test to name.
>
> **AND "the list is correct today" IS NOT A DISCHARGE**, which is the whole of why this
> folds. Tier 0: *"A criterion asking for a MECHANISM is not satisfied by a correct LIST —
> that is the hand-written-list row in §9 and it is the same defect finding 4 itself
> describes. Reading 'correct today' as a discharge is how a rot risk becomes a live defect
> six weeks later with a passing test over it."*
>
> **TWO DIFFERENT EIGHTS. DO NOT CONFLATE THEM** — written here because conflating them
> yields a story that is internally consistent, eight rows deep, and wrong. Plan §7's *"eight
> modules are absent"* counts modules reachable from **NEITHER** entry — a subset of the
> **eleven** such `site/*.ts` files. The other eight is the seven **plus
> `src/shared/perception.ts`**, under the *unscoped* reading of the test's own predicate.
> **Disjoint provenance, same number.** And plan §7's reading is not merely wrong: **adding a
> neither-closure module to the list turns the suite RED.**
>
> > **MECHANISM CORRECTED 2026-10-17, by I-14, which ran both routes instead of reasoning.**
> > This sentence first read *"because the presence half hunts a needle for a module that is
> > in no bundle at all."* **That is the wrong mechanism for the module it names, and it was
> > my inference, not a measurement.** Measured:
> > **roster entry alone → `2 failed | 46 passed`**, via *"has enough needles to be worth
> > asserting"* plus `toHaveLength(7)`; **the presence half never fires.**
> > **roster entry PLUS a needle → `3 failed | 45 passed`**, now including *"finds every
> > needle in the editor bundle — the grep works"*. That is the mechanism I named, and **it
> > needs a second edit to appear at all.**
> > **And for `site/store.ts` the second route does not exist:** the module contains **no
> > string literal** — two import specifiers and an apostrophe in a docblock are the whole of
> > it — so **it can never be given a needle.** A neither-closure module cannot be made to
> > satisfy the roster; it has to stay off it.
> > **The conclusion survives and the stated reason did not** — which is §9's *a right
> > decision with an invented reason is harder to catch than a wrong one, because the outcome
> > validates it.*
>
> **Also unwritten until now: the list is silently `site/`-SCOPED.** `src/shared/perception.ts`
> is editor-only under the test's own predicate and is absent from the list; the scoping rule
> appears nowhere in the file. And **`site/legibility.ts` is a one-line barrel** —
> `export * from '../src/shared/perception.js'` — whose attributed needle physically lives in
> `src/shared/perception.ts`, against the file's own rule that *"a needle proves something
> about the function holding it"*.
>
> **TIER-0 RULING: DERIVE THE CHECK FROM THE IMPORT GRAPH. NOT A DEVIATION.** *"Recording the
> absence as accepted is the same answer in a costume."* The RED is already demonstrated so it
> does not have to be invented, `sourceclosure.ts` already walks a real import closure so the
> machinery exists, and a derived check cures the rot class rather than buying today's seven
> names.

**Finding 5 — the player bundle's only node sensor is the "weaker belt"** · coverage
asymmetry · note · **established by reading, no control.** `forbiddenImportsIn` runs over
`dist-site` only — all three call sites under the site blocks — so the player's entire node
coverage is **one text grep for `yuv444p`**, which a `node:` or `@napi-rs` import would not
contain. **Neither vite config has `external`.** **Note rather than should-fix because the
reviewer could not produce a player-specific reachable leak** — the asymmetry is established,
the exploit is not. **DEVIATION, and flagged NON-DORMANT: a bundle shipping to users whose
only node sensor is what this phase's own docblock calls "the weaker belt."**

**Finding 6 — `projectedHash` honours the roster only at index 0** · overstated comment ·
note. True at arity one, false at arity two. **It is caught — but not by the mechanism the
comment names:** the backstop is a literal `toEqual(['scene'])` pin. **No control run,
deliberately:** carrying it out means editing two exported rosters that three `AssertNever`
pairs and a compile-time partition depend on, and *a bad revert leaves the partition silently
wrong in the way that reads as correct.* **DEVIATION: an overstated comment, not a hole.**

---

## Two things the reviewer put on the record beside the six

**The mesh loss is a finding in its own right.** *"Three failures, and each one reported
success at the sender's end when the direction was reversed. Every message I sent went into
the record only because I also wrote it into my report text. **If a worker on this project
relies on `SendMessage` alone, its work does not exist.**"*

**A scope gap it cannot close and did not ask to.** It verified **the fixes, not
`src/core/testing/sourceclosure.ts`** — ~750 new lines whose other exports went to no
control. **Findings 1 and 3 are now both discharged by that one module, so its unverified
surface is load-bearing for two closures, not one.** Orchestrator's to route.

---

## Appended by PM-SHELL-P3b-7 — four items this document did not carry

*Appended beside, nothing above rewritten or deleted, per the standing boundary. These are
the pieces that existed only in `docs/plans/handover/P3B-REVIEW-FINDINGS.md`, a duplicate
of this file that I created before this one reached me. **I have deleted that duplicate in
the same commit** — two documents for one finding set is the "two instruments to keep in
step" defect that findings 1 and 3 were ruled into a single cure to avoid, and it applies
to documents.*

### 1. The cure converges on ONE task, and an unmeasured step gates it

§9's own row calls `build.rollupOptions.onwarn` *"a genuine complement"*. A P3b worker
measured the player side independently: **`onwarn` is one config line covering 9 of 9
routes**, including the two that no output-reading check can ever see, where porting the
site-side check is ~90 lines and covers 3 of 5 reachable routes. **Neither
`vite.player.config.ts` nor `vite.site.config.ts` currently sets `external` or `onwarn`.**

> **CORRECTED BESIDE, 2026-10-17, both clauses.** *"9 of 9"* was computed over the
> nine-route population of the day; against the **eleven** now enumerated it is **10 of 11**,
> and `onwarn` is **structurally incapable** of seeing the `require` family — so the
> "one config line covers everything" reading was never right and is now measurably not.
> **`onwarn` ∪ `dist.test.ts` = 11 of 11; neither alone exceeds 10.** And *"currently sets
> neither"* was true when written and is **false since `9835a76`**: both configs now set
> `onwarn`, and vite is pinned exactly at 5.4.21 because the cure's contract is a
> dependency's prose. The sentence above is left intact because the ruling it supports —
> cost the cure as one task, not three — was correct and was taken on these words.

So **one `onwarn` task plausibly closes finding 2, finding 5 (Deviation B) and the
re-scoped player queue item.** Cost them as one task, not three.

> **OPEN MEASUREMENT, OWED BEFORE ADOPTION AND BEFORE ANY SECOND MECHANISM IS BUILT:**
> nobody has wired `onwarn` and confirmed it fires for the **default-import** spelling
> specifically. Every route warns on stderr, but **the cure is unmeasured against the
> spelling that motivates it.** Do not adopt on the strength of §9's claim — that claim is
> computed over the four-spelling population this finding shows is incomplete.

### 2. Evidence bearing on the NEW-vs-rediscovery ruling — recorded, not contested

**The ruling stands and the action is unchanged; this is the evidence beside it.** The
ruling applied the reviewer's decision procedure — *"if the recorded leak leaves a
browser-external chunk or any `node:` substring, mine is different"* — against the row's
**dynamic**-form half. The row has a second half, and it says the opposite of the static
forms:

> *"the dynamic form hides **behind a rewrite**, so grepping the stub cures it; the static
> forms hide by **leaving no artifact at all** — vite inlines `export default {}` and
> rollup drops the bare import... **Both static forms — `import 'node:fs'` and `import * as
> fs from 'node:fs'` — are missed by every instrument in the repo at both commits.**"*

`import os from 'node:os'` is a **third static spelling**, and the row's mechanism sentence
— *"vite inlines `export default {}`"* — is literally the thing that makes a **default**
import bind where a named one reddens. So the mechanism is not merely adjacent; it is the
one recorded.

**Why this is recorded rather than argued:** the ruling's direction is the safe one, and
being wrong about the label costs nothing while being wrong about loss costs the finding.
**But the label carries one real risk** — if finding 2 is treated as a distinct route
needing a distinct cure, someone builds a **second mechanism where one suffices**, which is
the defect findings 1 and 3 were ruled into a single cure to avoid. **The open measurement
in item 1 settles the classification and the cure at the same time** and should be taken
before either is acted on.

What is new beyond dispute, and is the part worth keeping either way: **the row's
enumeration is incomplete.** *"catches ZERO of four"*, *"onwarn + `dist.test.ts` together
cover all four"* and *"neither alone covers more than three"* are all computed over a
population of four with **at least five** members — enumeration-complete, not
class-complete, inside the row that documents that failure.

### 3. The avoidance that is a result — the G-3 tripwire

The reviewer **deliberately did not touch `site/controls.test.ts`'s G-3 tripwire block**,
and reported the avoidance rather than staying silent. `theLegacyErasureIsStillReachable`
asserts that **a hole is open** and deliberately carries no `@ts-expect-error`. It is the
one block in the diff where the correct action is the **opposite** of every other item in
the round, and **a closed tripwire reads as a passing test**, so the damage would be
undetectable afterwards. The block is well-built: three retirement cases enumerated, the
right one named per case, and a `@ts-expect-error` paired control proving the literal form
is still refused.

### 4. Two carried risks that resolved AGAINST the brief

Recorded because they are corrections, and a brief's wrong premises should not survive the
round that disproved them.

- **"The cheapest route to green is deleting `store.test.ts`'s escape report" is FALSE.**
  Measured: deleting `...escaped` from the return **reddens its own control**. The real
  residue is narrower and worse-shaped — the docblock's one prohibition is keyed to the
  **false-negative** trigger, and the file gives **no instruction at all** for the
  false-positive case the risk actually describes. A reader hitting a legitimate
  `globalThis` red finds nothing telling them what to do.
- **`forwardedFrom` "closed by the grammar" is not load-bearing.** Any missing
  value-forwarding node kind makes `isGlobalRoot` return false → `isDecidedReceiver` fails
  → the value is pushed to `escaped`: **a false RED, not a false green.** Traced through
  `await`, assignment and `Reflect.get`. **The claim is safe because it fails in the safe
  direction, not because the set is closed** — and the docblock argues closedness, which is
  the wrong reason and the one a future reader would rely on.

---

## Round 2 — scoped to the post-round-1 delta, 2026-10-17

*Appended by PM-SHELL-P3b-8, beside, nothing above rewritten or deleted except the two
coverage paragraphs explicitly marked RESTATED and CORRECTED BESIDE.*

**Why there was a round 2.** ~1360 load-bearing lines landed **after** round 1 took its
diff, and those lines **are the cures for the findings round 1 raised** — so the single
least-reviewed region of the phase was the one written in response to review. Generalised
into §9: *a review budget counted in rounds is a budget on the reviewer's time, not on the
code's coverage, and the two diverge exactly when the review is working.* Approved by tier 0
as an escalation rather than a third round, which is what §6 already calls it.

**Scope, measured rather than described.** `git diff 523280f dc762a3 -- . ':(exclude)docs/'`;
commits `git log --oneline 523280f..dc762a3`. Of 26 non-merge commits, **ten are also on
`main` and all ten are docs-only**, each verified individually with
`git show --numstat -- . ':(exclude)docs/'` returning zero non-docs files. **The entire
code delta is two commits**, `6a72027` and `9835a76`: 10 files, 1866 insertions, 655
deletions.

**The specific thing hunted: a cure that closes a finding by narrowing the sensor. NOT
FOUND. Every one of the four cures WIDENED** — `aliased` added a report without weakening
the three beside it; the hashprojection retitles went *"module"* → *"import closure"*, a
widening visible in the titles themselves; `buildguard` reads no specifier pattern at all
rather than a list. **A null from a hunt equipped to find the thing is worth recording.**

### Nothing was hollowed out — and the census that says so was itself controlled

`site/store.test.ts` is **+284 / −595, net −311** (2563 → 2252 lines), in the same commit
that cured the guard that file contains, **while the §6.4 name census reports zero net
removals, truthfully.** Both are true: `vitest list` is collection-only, so a title that
survives while its body loses assertions is invisible to it **by construction**.

Answered by instrument, not by count: **of the 596 removed lines, the number containing
`expect(` is ZERO**; 13 added lines contain one. Per-title assertion census over assertion
*text*: 25 old titles, 26 new, **titles-only-in-old 0, common titles whose assertion count
dropped 0**. Matcher histogram up on every kind. The 311 lines are helper machinery
relocated to `src/core/testing/sourceclosure.ts`.

**And the instrument was put to a control**: a generated hollowed variant that *dropped*
one assertion and *weakened* another (`toBe(initial)` → `toBeDefined()`) was **reported by
the census on both counts** — so the null covers weakening as well as removal, which is
precisely the gap the name census cannot see.

**No hole traded**, by plant against the real module: the aliased route now fails at
`found.aliased` — **the new sensor itself, not a behavioural sweep** — and the same write
spelled directly still fails at `found.undelegated`.

### The eleven forms, named, which is what makes the total citable

Both previously outstanding spellings measured by real vite builds at
`NODE_ENV=production`, each plant grep-confirmed present in source **before** the build:

| form | result |
|---|---|
| `export * from 'node:fs'` | **build exit 1** — caught by `onwarn`, its own message naming importer and specifier |
| `import zzfs = require('node:fs')` | **build exit 0** — NOT caught by `onwarn`; caught by `site/dist.test.ts` |

For the second the union claim was **measured rather than assumed**: artifact counts in the
emitted bundle were `node:fs` 1, `require` 1, `__vite-browser-external` 0, and
`site/dist.test.ts` over that artifact returned **rc 1, 3 failed | 27 passed | 17 skipped
(47)**, the load-bearing failure being *"the built site > imports no node: builtin and no
@napi-rs, by specifier and not by mention"*.

**So: population ELEVEN. `onwarn` 10 of 11. `dist.test.ts` carries the `require` family
alone, now two members. Union 11 of 11, neither alone above 10.**

### Finding A — `isFirstParty` fails OPEN on an extractable but non-absolute importer

`site/buildguard.ts`. The fail-closed throw fires only when the specifier or importer
**cannot be extracted**. If the importer **is** extracted but is not an absolute path under
root, the containment test is false, the warning is classified third-party, and it is
**forwarded silently**. A vite reword from absolute to relative importer paths — *precisely
the "vite reworded the sentence" scenario the condition exists for* — lands in the
fail-**open** branch.

**Control, two arms in one invocation with the absolute arm as the known-answer control:**
absolute first-party importer → threw **true**, forwarded silently **false**; relative
first-party importer → threw **FALSE**, forwarded silently **TRUE**. Probe 2 passed (2),
rc 0. **Confirmed, not inferred.**

**The tier-0 condition says fail closed on an UNATTRIBUTABLE warning; the implementation
fails closed on an UNEXTRACTABLE one. Those differ and the gap is silent.**

**TIER-0 RULING: FIX IT, NOT A DEVIATION.** The NOTE reasoning — *a compensating sensor
exists and the exact vite pin bounds live risk to zero today* — was **rejected explicitly
and on its merits**: *"that is the exact reasoning that let R17 ship: a real property, a
green gate, a true statement about today, and a defect that outlived all three."*

### Where round 2 ran no control, and the mechanism instead

1. **That the real-build canary catches finding A's relative-importer case.** Impossible
   without forking vite. Mechanism: the canary asserts `status === 1` on a planted node
   import, so **any** cause of the guard not throwing yields exit 0 and reddens it; the
   cause is irrelevant to that assertion.
2. **`site/hashprojection.ts`'s +11 / −3.** No control and **none owed** — the diff is
   comment-only, correcting a false assertion (*"by parsing this file"* → *"by parsing this
   module's whole import closure"*). §9 classes a false assertion as fix-on-sight, and its
   *"a fix task always has a RED available"* row says the RED requirement does not bite here.
3. **`sourceclosure.ts`'s six other exports** — `forwardedFrom`, `topOfForwarding`,
   `isValueReference`, `resolveModule`, `lineIn`, `closureFrom`. The two closures
   load-bearing for findings 1 and 3 were controlled; the rest are labelled. **This is the
   same gap round 1 declared, narrowed but not closed**, and it is said rather than let pass.
4. **The `aliased` arm's vacuity floor.** The live arm has **no direct floor of its own**;
   the writes floor reaches the receiver only transitively. The plant is the empirical
   refutation — the arm demonstrably fires on the real module, so it is not vacuous today.
   **Structurally unfloored remains a NOTE for whoever next touches receiver detection.**

### One limitation round 2 flagged against itself

It did not re-run `vitest list`, so **for the files it covered its result and the §6.4
census are not two independent methods** — they agree, and agreement between two reports is
not two measurements of different kinds. It covered the two rewritten files at a *stronger*
granularity than the census and **did not** cover the delta at whole-suite granularity.
