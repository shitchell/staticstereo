# V-2 · P1 consumers — verifier cluster brief

You are **V-2**, a verifier cluster on phase P1 (`shared/` and `.stst`) of the staticstereo
editor rewrite. Your PM is PM-SHARED-4. You are tier 2 in a three-tier agent system.

**FIRST, read this file in full before any other command:**
`/tmp/claude-1000/-home-guy-code-git-github-com-shitchell-staticstereo/8b54946b-39f3-4e41-bb67-886b9d8bd96a/scratchpad/VERIFIER-COMMON-BRIEF.md`

It carries the paragraph that outranks this brief, your worktree setup, the five traps that
will each cost you a run, the §2 invariants, the known-open items you must not re-report,
the off-limits file list, and your report format. Everything below is *in addition* to it.

## Your worktree

`/home/guy/code/git/github.com/shitchell/staticstereo-v2`

Detached at `b3e7601`, `node_modules` copied in. One other verifier is running concurrently
and the P3b PM is live in `…/staticstereo`. **Targeted `npx vitest run <file>` for your
mutation matrix; at most one full `npm test`, at the end.**

## Your cluster: P1 criteria 4, 6, 10

Read them verbatim from the snapshot's `docs/plans/2026-10-14-editor-execution-plan.md` §7,
the P1 block. **Criterion 10 was added on 2026-10-15, after this branch was cut** — it is in
the snapshot and not in your checkout.

| Criterion | Claimed evidence |
|---|---|
| **4** container layout: `scene.json`, baked masks, original sources, manifest | `31baea5` *(the .stst container assembles, so byte-identity is a function)* + `ed87a60` *(reading a .stst is the manifest's first consumer, so it stops being decorative)* |
| **6** `stst` reads and writes `.stst`. **Subcommand names are an escalation** | `7192402` *(stst reads a .stst, and the loss it takes is removed not announced)* + `e14ca10` *(--save-project writes a .stst, as a flag and not a format)* |
| **10** the **site** reads a `.stst`, not only the CLI | `64eb049` *(the .stst reader was browser-reachable by argument, not by sensor)* |

Criteria **1, 2, 3, 5, 7, 8, 9** are **V-1's**. The split across P1 is exhaustive: 4/6/10
yours, the rest V-1's.

## Claims needing an independent measurement

1. **Criterion 6 avoided a new subcommand, and that was the escalation trigger.** `COMMANDS`
   is `['render','still','preview']` and the design names no new one, so **any new name is
   an escalation**. The shipped shape is `--save-project` as a **flag, not a format**, plus
   `.stst` dispatch on extension in `loadScene`. Verify no new subcommand was introduced and
   that the flag genuinely avoids one rather than being a subcommand in disguise.

2. **The lossy-read decision — option (iii), the loss is *removed*, not announced.**
   `loadProject` returns the whole archive, `loadScene` is its `.scene`, and `index.ts`
   carries `members` into `writeStst`, so `stst render p.stst -o out.gif --save-project
   p.stst` is claimed **lossless by construction**. The commit says explicitly that the
   render path *can* legitimately ignore members today (nothing in `src/core` consumes a
   baked mask) **but that this is not what makes it safe — the write half is.** That is the
   load-bearing distinction; check it holds, and check the round-trip is actually lossless
   rather than lossless-for-the-members-we-happen-to-test.

   One extra `check()` rule was added beyond the brief: **`--save-project` requires `.stst`**,
   because `loadScene` dispatches on extension alone, so a project under another name is a
   zip this same program hands to the YAML parser. Verify that guard exists and fires.

3. **`src/cli/` is this phase's ONLY collision surface.** The claimed surface is exactly six
   files — `args.ts`, `args.test.ts`, `index.ts`, `index.test.ts`, `scene.ts`,
   `scene.test.ts` — plus `site/project.test.ts` (new) and `src/shared/purity.test.ts`
   (+103), with `keydrift.test.ts` unmoved. **Verify that list is exact**; a seventh file
   would be a collision nobody has budgeted.

4. **Criterion 10's own test says it is NOT the browser-reachability sensor, in its own
   docblock, and that honesty is the thing to check.** Vitest runs `site/project.test.ts` in
   Node, so a `node:fs` added to the reader tomorrow leaves it green. What it claims to
   sense — and claims nothing else does — is reachability **from `site/`**: paired control,
   the reader moved out of `src/shared/` gives *"Failed to load url
   ../src/shared/containerRead.js"*, red; moved back, green. It imports the **source** path
   that `site/fonts.ts` and `site/legibility.ts` use and that Vite bundles from, **not
   `dist/`**. Verify both halves of that control, and verify the docblock's disclaimer is
   accurate rather than modest.

5. **Task 2 had NO TDD RED available and was discharged under §6.5a instead.** The site test
   passed first run — the capability already existed and **the test is the deliverable**.
   Invariant 1 says a test that passed first run is not evidence, so the substitute evidence
   is two paired controls, both halves each: reader-moved-out (import failure → restored),
   and a `byteOffset` mutation. **Your job is to check those controls are real and complete,
   not to demand a RED that cannot exist.**

6. **The `byteOffset` finding is the sharpest thing in this cluster and it is a claim about
   blindness.** Dropping `archive.byteOffset` from `zipRead.ts`'s two `DataView`s is claimed
   to leave **all 387 tests in `src/shared/` + `src/cli/` green**, with `site/project.test.ts`
   the only thing that reddens. `zipRead.ts` is correct today and **nothing pinned it**. That
   is a null-shaped claim, so §6.5a applies in full: reproduce it, and **diff the measured
   values as well as the pass/fail**.

7. **The purity guard was still blind ONE HOP OUT and `src/shared/purity.test.ts` grew +103
   lines closing it.** `tsconfig.json` excludes `src/shared/testing/**`, so a hop there is
   `shared → shared` and the target is in **no roster**. Planted `import { CHILD_ENV } from
   './testing/spawnEnv.js'` in **`containerRead.ts` itself — the `.stst` reader** — and on an
   unbuilt tree the suite was **green with `node:os` one hop down the reader's graph**.
   Claimed closed by `rosterVerdict`: *a guarded module may not reach an unguarded one*,
   with a paired control on the unbuilt tree (planted 1 failed | 12 passed; removed 13
   passed). **Criterion 8 itself is V-1's**, but this edit lives in your cluster's blast
   radius and V-1 is probing the same guard from the other side — if your measurement and
   V-1's disagree, that disagreement is the finding and the PM forwards both rather than
   adjudicating.

8. **§9's `build:site` row is incomplete, and the correction came from this cluster.** Three
   cases were measured:

   | in bundle graph | import form | `build:site` |
   |---|---|---|
   | no (`src/shared/containerRead.ts`) | named + used | **exit 0, no warning at all** |
   | yes (`site/fonts.ts`) | side-effect `import 'node:fs'` | **exit 0** + "has been externalized" |
   | yes (`site/fonts.ts`) | named + used | **exit 1** |

   The exit 1 is claimed to be **Rollup failing to resolve a named export off
   `__vite-browser-external`, which exports nothing — NOT a purity check.** The consequence
   is that `import * as fs from 'node:fs'` or a dynamic import would likely slip through, and
   `containerRead.ts` is **not in the site bundle graph at all**. Confirm the table and the
   mechanism; the namespace-import and dynamic-import cases are stated as *likely* and have
   not been measured by anyone. Measuring them would close a tier-0 amendment.

## My two predictions as your PM, labelled as my unverified reasoning

- **Criterion 4 is the thinnest-evidenced in all of P1.** Its two commits predate every
  survey this phase ran, it is the only criterion here whose evidence was never re-opened by
  a later task, and "container layout" is a four-item list that a test can satisfy
  item-by-item while saying nothing about the layout as a whole. I would look for a manifest
  assertion that checks the manifest exists rather than that a consumer can use it — the
  commit subject itself says the manifest "stops being decorative", which implies it was.
- **Criterion 6's losslessness may be lossless only over the member set the fixtures
  contain.** "Carries `members` into `writeStst`" is a statement about a field, not about
  completeness. A member kind absent from every fixture would round-trip by vacuity.

## Reminders with teeth

- **Re-establish RED individually for every commit in the table**, not once for the cluster.
- **Rebuild inside every mutation.** An implementer lost a matrix run to exactly this.
- **Diff the measured values, not the pass/fail.** Points 4, 6 and 7 above are all nulls.
- `site/project.test.ts` is a **new file in `site/`, which is not on this phase's reserved
  list** and P3b owns `site/` teardown. It collides with nothing today. Report any sign that
  has changed; do not fix it.
- **No commits.** Leave the worktree clean with an empty stash list.

Your `REFUTATIONS` section is expected to be non-empty.
