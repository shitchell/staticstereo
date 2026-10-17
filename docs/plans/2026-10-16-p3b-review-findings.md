---
title: P3b review findings — six, transcribed before they evaporated
description: The P3b phase reviewer's findings 1-6 with their controls and dispositions, written down because the enumeration reached no tier and existed only in one agent's context
status: finding 2's NEW/BLOCKING ruling is WITHDRAWN (orchestrator error 45) and its classification is now MOOT — the ordered measurement came back YES (`onwarn` fires for the default-import spelling, PM-measured at `35fe08c`), so ONE cure closes findings 2 and 5 and the player-bundle item. The cure is approved and is NOT a one-liner. Findings 4, 6 travel as separate recorded deviations
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

**Coverage: 8 of the 9 routes enumerated so far**, missing only `require` structurally;
**`onwarn` ∪ `dist.test.ts` = 9 of 9**, neither alone above 8. **Stated as *of the forms
enumerated*, deliberately** — the population has gone **four → five → nine across three
enumerations, each made by someone who believed theirs complete.** Two forms are still
unmeasured and must be before any total is written down: `export * from 'node:fs'` and
`import fs = require('node:fs')`, the second being the one that lands on `require`.

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
