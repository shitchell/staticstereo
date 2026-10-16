# R-1 — three sensors that cannot see what they claim to see

**You are an implementer.** PM: `PM-SHELL-P3b-3`.

## ⚠️ READ THIS FIRST — you do NOT own the primary worktree

**Another implementer (H-2) is live in
`/home/guy/code/git/github.com/shitchell/staticstereo` right now**, building the
criterion-22 `svelte-check` harness. Both of you plant into real files and revert, and two
agents doing that in one tree corrupts both. **You have been given your own isolated git
worktree. Work only there.**

Three things, all measured by a predecessor (V-BC) that did this successfully:

1. **Verify what commit your worktree was cut from. Do not trust this brief.** V-BC's was
   cut from `main`, not the phase branch, and `62696ae` was not an ancestor. It checked,
   found it, and `git reset --hard`ed onto the right commit inside its own throwaway
   branch. **The phase branch is `feat/p3b-store`; get your worktree onto its tip**, and
   confirm `69abca9` and `62696ae` are ancestors.
2. **Do NOT symlink `node_modules` from the primary worktree.**
   `node_modules/.vite/vitest/results.json` is rewritten by every `npm test`, so a symlink
   puts your writes inside a live implementer's tree. **Use `cp -al`**, then `rm -rf` the
   `.vite` cache and `cp -a` the other write-prone directories to break those hardlinks,
   and **confirm separate inodes**. Verify `package.json` and `package-lock.json` are
   unchanged in both trees afterwards. `npm ci` only if that fails and only if it provably
   touches neither.
3. **Commit to your own branch and report its name. Do not merge it yourself.** H-2 may
   touch `site/controls.test.ts`, which you also touch, so a conflict is possible and
   resolving it is the PM's call, not yours. **Report any overlap you notice.**

If you cannot get a working tree, **stop and report** — do not fall back into the primary
worktree. A worker that cannot run is a finding, not a failure.

This is **remediation of already-landed, already-verified work** — cluster A and cluster C.
V-BC verified criteria 8 and 9 and returned `MET WITH FINDINGS`. You are the findings.
Every one of the three is the same shape: **a sensor this phase shipped, and called a
sensor, is blind to a case it claims to cover.** Each was measured, not inferred.

## 0. Read first, in this order

1. `/tmp/claude-1000/-home-guy-code-git-github-com-shitchell-staticstereo/8b54946b-39f3-4e41-bb67-886b9d8bd96a/scratchpad/P3B-WORKER-BOILERPLATE.md`
   — **all of it.** Note especially the §0 block on `grep -c '↓'` being blind, and the
   note that **`npm run build` does not typecheck `site/`** — only `npm run typecheck`
   does, so a build exit code is not evidence about any file you touch here.
2. `…/scratchpad/P3B-SURVEY-S1.md` — background. S-1's measurements, taken before this
   phase committed; counts in it have moved.
3. From your own tree: execution plan **§2 invariants**, **§9 "Known traps" — every row,
   by heading**, **§6 the gate including §6.5a in full**, and §7's **"P3b rulings,
   2026-10-15"** and **"P3b, shift 2"** subsections.
4. `git log -1 --format=%B 62696ae` for the shape of what else is in flight, and
   `git show 92e8b43`, `git show 760f353` for the two commits you are hardening.

## 1. The paragraph that outranks this brief

> Your measurements outrank any assertion from your PM, **including its acceptance
> criteria** — the one artefact a PM cannot check against the code. Refuse an unsatisfiable
> criterion and prove why. If you cannot reach your PM, your final report is the channel of
> record; the mesh is unreliable, assume it.

**Escalate on conflict, not only on uncertainty.** Worker pushback on this phase is
**twenty-one for twenty-one**, and **two verifier-proposed designs in a row were corrected
by the implementers that built them.** Both of the proposals quoted below are V-BC's and
are labelled as proposals for that exact reason. **You propose; I ratify.** Do not treat
either as chosen.

## 2. Finding A1 — A-4's duplication guard has a hole, and a shipped docblock lies about it

`site/store.ts`'s contract is *"adds no second implementation of any reducer arm."* A-4
built a parsed structural guard in `site/store.test.ts` with two halves. **V-BC measured
that both halves can be evaded at once:**

- `undelegated` keys on the **declaration** of the name written to storage, so a
  **reassignment** defeats it.
- `tagsNamed` keys on a value-position tag literal, so a **tag-free selection** defeats it.

Separately each is covered. Together they are not. V-BC planted this into the real
`site/store.ts`, grep-confirmed present, both builds run first:

```ts
let next = reduce(self.state, action)
if ('value' in action && typeof action.value === 'string') {
  next = { ...self.state, depthView: action.value }   // independent arm, no tag literal
}
self.state = next
```

Result: **build 0, build:site 0, test 0 (82 files / 1948 passed / 0 skipped), typecheck 0
with the environment stripped. Entirely invisible.** That is an unambiguous second
implementation of the `depthView` arm, computed from `self.state` and `action` alone — the
exact defect the guard exists to catch.

**`site/store.test.ts:277` claims the file-wide looseness "fails closed". That is false as
written** — true for a second *declaration*, fails **open** for a reassignment. §9's
taxonomy: a stale *pointer* can wait; a false *assertion* misleads whoever trusts it.
Fix it.

**V-BC's proposal, labelled, tested but not chosen:** treat a reassignment as a binding in
`bind` — disqualify any name assigned from a non-`reduce` expression. V-BC measured it
reddening the plant and staying green on the pristine module (24/24). **That is evidence
the hole is closable. It is not the design.** Evaluate it, and say what you chose and why.

**Watch for the cost.** A-4's own UNCERTAIN 1 says `tagsNamed` is the half most likely to
need narrowing: `Action`'s tags include ordinary words (`time`, `size`, `scene`, `frame`),
so a legitimate future string literal reddens it on a non-defect. Any widening you do
inherits that pressure. A guard whose cheapest satisfying action is wrong is a guard that
will eventually be satisfied wrongly (§6.5a's tripwire paragraph).

**Already discharged, do not redo:** A-4's UNCERTAIN 4, the one-sided vacuity. V-BC
planted arm *suppression* into the **real** `site/store.ts` and the guard fired, naming
`site/store.ts:170 scene`. That gap is closed by measurement.

## 2a. `'set'` widened the surface A1's hole operates over — FIRST-CLASS, not an addendum

Ruled by tier 0 as the more important of H-1b's two carried uncertainties.

`24392c3` added `'set'` to the `Action` union. A-4's guard flags **value-position string
literals equal to any action tag**, and A-4's own UNCERTAIN 1 already said `tagsNamed` is
the half most likely to need narrowing because `Action`'s tags include ordinary words
(`time`, `size`, `scene`, `frame`). **`'set'` is far worse than any of those** — it is
three characters and one of the commonest string literals in any codebase.

H-1b grepped and confirmed `site/store.ts` holds no `'set'` literal today, so the guard is
**green on its merits right now**. That is not the issue. The issue is that **A1's hole
and this widening compound**: a guard with a measured evasion, now operating over a
literal-collision surface large enough that a future false positive invites someone to
narrow `tagsNamed` — and narrowing `tagsNamed` is exactly what would remove the only half
that sees arm *suppression*.

**Treat this as part of A1's fix, not separately.** Whatever you do to close the
reassignment hole must leave the guard able to tolerate `'set'` appearing legitimately in
`site/store.ts` without losing suppression detection. If those two cannot both hold, that
is a finding and an escalation — say so with the measurement rather than trading one for
the other silently.

## 3. Finding C2 — the one criterion-9 sensor that is total over the vocabulary cannot see

`holds one scene time and not two…` in `site/controls.test.ts` wraps `dispatch` in
`try/catch {}` so it can tolerate actions `reduce` legitimately refuses, and increments
`examined` **after** the catch.

V-BC made `withTransport` throw on **every** transition — the most total reducer failure
expressible — and **the test passed.** It sweeps 20 samples, asserts the invariant on 20
copies of the untouched initial state, and its vacuity floor (`examined > 0`) counts
**attempts rather than commits**.

Thirteen sibling tests do catch that case, so criterion 9 is not unguarded overall. But
**the one sensor that is total over the action vocabulary is the one that cannot
distinguish a refusal from a crash** — which is precisely the rule this phase imposes on
every harness that parses another tool's output, here recurring inside a plain test.

**V-BC's proposal, labelled, not chosen:** floor committed transitions separately from
attempts.

## 4. Finding C1 — the clock sensor's hole was correctly flagged and wrongly diagnosed

C-2 shipped the clock sensor knowingly weak and recorded it as §9's **hand-written-list**
shape (`Date`, `performance`, four schedulers, `process`). **V-BC measured that this is not
the mechanism**, planting into the store's real import closure (`site/transport.ts`),
grep-confirmed, build first:

| Plant, same file and function | `store.test.ts` |
|---|---|
| `Promise.resolve().then(f)` — unlisted scheduler | 24/24 **green** |
| `globalThis.Date.now()` | 24/24 **green** |
| `Date.now()` — same line, positive control | **RED**, sensor fires |

`Date` **is** on the roster. Prefixing it with `globalThis.` makes it `parent.name` of a
PropertyAccessExpression, which `globalsIn` **deliberately skips** — and that same
suppression is what prevents a false positive on `site/present.ts`'s `location`
*parameter*. So **extending the roster would not close this**, and **every listed global
is evadable the same way.**

**This one may not be fixable without reintroducing false positives, and that is an
acceptable answer.** If you measure that the suppression cannot be narrowed without
reddening legitimate code, say so with the measurement and **convert the note into a
sensor or an explicit, argued acceptance** — this phase's standing rule is that a gap ships
with a sensor, never with a note, and C-2's comment currently describes the wrong
mechanism either way. **At minimum the recorded rationale must stop saying it is a
hand-written-list problem**, because that sends the next reader to the wrong cure.

## 4a. The legacy-erasure tripwire — ruled by tier 0, and it is the item with a deadline

**Criterion 22's clause 2 is true of the `set` path and false of the `Action` union.**
H-1b measured both, in this tree:

```
{ type: 'set', control: 'stereo.cross', value: Number(raw) }    ERROR
{ type: 'set', control: anyId,          value: Number(raw) }    ERROR
{ type: 'stereo', patch: { cross: 1 } }                         ERROR
{ type: 'stereo', patch: { [key]: Number(raw) } }               COMPILES CLEAN   ← the hole
```

The legacy keyed arms survive in `Action` only because `main.ts` consumes them. **The
erasure is still reachable through them and nothing watches it.** A declared gap with no
sensor is what this phase's standing rule forbids.

**Tier 0's ruling, both halves:** (1) **tripwire the known hole now**; (2) the real
removal **sequences after G-3 deletes `main.ts`**, when the legacy arms lose their only
consumer and the tripwire retires with them.

**Build (1).** The precedent is this repo's own and is explicit: `site/views.test.ts`
depends on `site/index.html` so that teardown reddens it **by design**, with a failure
message naming the teardown. Its author's framing — *"the HTML dependency is not a cost I
tolerated, it is the deliverable; §9 says a note is not a sensor, so the note **is** the
test."* Do the same here.

**What the tripwire must do:**
- Assert that the legacy `{type:'<arm>', patch:{[key]: …}}` erasure **is currently
  reachable** — so that the day someone closes it, or the day G-3 removes the arms, the
  test reddens and names the reason.
- **Its failure message must name G-3 and the retirement**, so whoever hits it knows the
  correct action is to delete the tripwire, not to work around it. §6.5a: a guard whose
  cheapest satisfying action is wrong will eventually be satisfied wrongly.
- **Do not fix the hole.** Removing or re-expressing the legacy arms is ruled as G-3-or-later
  work and it is not yours.

**Why this is in R-1 and not H-2 — my decomposition call, and you may refute it.** H-2
builds the clause-2 harness for the `set` path and carries a real risk of refusal on
wall-clock grounds. This tripwire must land regardless of how that goes, and it is the
same idiom as your other three items: a sensor for something currently blind. If you judge
it belongs with the harness instead, say so rather than splitting your attention.

## 4b. The 17-row self-count — a hand-written-list instance

`site/controls.test.ts`'s `expect(new Set(pairs.map(…)).size).toBe(17)` is **a self-count
of a hand-written table, not a measurement of the registry.** It catches a dropped row. It
does **not** assert that exactly 17 registry controls have keyed arms — H-1b measured that
a new `Action` variant *is* caught (the sample tables and the parser cross-check redden),
but **an 18th control absorbed into an existing keyed arm would be invisible.**

§9: *a hand-written list of "the places that do X" goes stale silently the day a second
place does X — derive it from the thing that makes a site one of them.* Tier 0 has ruled
this should be **derived or cross-checked against a derivation**, the same shape as D-1's
fix for `EDITOR_ONLY_MODULES`. Note the adjacent trap: **a guard derived from the roster it
guards proves only that the derivation ran twice**, so say which side of that line your
version lands on, as H-1b did for the `CONTROL_IDS` partition.

## 5. Acceptance — checkable by you before you start

**Six items now, not three: A1 (§2), the `'set'` surface (§2a), C2 (§3), C1 (§4), the
legacy tripwire (§4a), the 17-row self-count (§4b).**

1. **Each plant above, re-derived from its description and not copied, reddens after your
   change** — grep-confirmed present in the real module before any verdict is read, with
   `npm run build` and `npm run build:site` run first.
2. **Each positive control still passes on the pristine module.** A guard that reddens the
   plant by reddening everything is not a guard.
3. **No false positives introduced.** Run the full suite and typecheck; any newly-red test
   is classified, never suppressed.
4. `site/store.test.ts:277`'s "fails closed" sentence is **true** after your change, or
   corrected to say what is actually true.
5. For C1, either the hole closes **or** you report the measurement showing it cannot, and
   the recorded rationale names the real mechanism (member-name suppression) rather than
   the wrong one.
6. **Zero net test removals.** Counts, four exit codes, and skips verified by
   **`grep -c 'skipped'`** — *not* `grep -c '↓'`, which V-BC measured blind.
7. Typecheck run **both with and without `CLAUDECODE` stripped**, and both reported. A
   format revert fails open, toward green.

**If any of these three is unsatisfiable, refuse it and prove why.** Partial delivery with
the residue named is better than a guard that looks closed and is not — that is the entire
subject of this task.

## 6. Scope and forbidden

- **Expected files:** `site/store.test.ts`, `site/controls.test.ts`, and the recorded
  rationale at the C-2 clock sensor. A-4 closed its hole with **no production edit at all**;
  if you find you need one in `site/store.ts` or `site/controls.ts`, say so explicitly and
  argue it — do not slide it in.
- **`24392c3` landed criterion 22's write path since these findings were measured** — a
  `SetAction` mapped type, `WRITABLE_CONTROL_IDS`, `applySet`, a `'set'` reducer arm, and
  ~800 lines across `controls.ts`, `controls.test.ts`, `store.test.ts` and
  `hashprojection.test.ts`. **V-BC's findings predate it.** Read `git show 24392c3 --stat`
  and `git log --oneline -8` before you start, and **if that commit changed the shape of
  anything described above, your measurement wins over this brief** — report the
  difference rather than forcing the description to fit. The `'set'` item in §2a exists
  precisely because of that commit.
- **Owned by the concurrent P1/P7 phase, stop and escalate:** `src/shared/`, `src/cli/`,
  `src/node/canvas.generics.test.ts`, `site/legibility.test.ts`.
- **`site/typecheck-gate.test.ts`** — no RED is available for it; invariant 1 forbids
  changing it.
- **No new `svelte-check`-spawning harness.** Three exist and are >60% of summed test
  time. Clear it with me first if you think you need one.
- Do not reformat or tidy files you were not asked to change.

## 7. Operating notes

- **Build before you test, always**, and **rebuild inside every mutation** — a stale tree
  silently withdraws the Pages-critical assertions and still reports green.
- **`npm run build` does not typecheck `site/`.** Measured: a planted `ReferenceError` in
  `site/controls.ts` left `tsc -p tsconfig.json` at exit 0. Only `npm run typecheck` covers
  your files.
- `npm run typecheck | tail` is not a check; `$?` is `tail`'s.
- **Baseline: 82 files / 1955 passed / 0 skipped** at `24392c3`, build 0, build:site 0,
  typecheck 0 (0 errors, 0 warnings) both with and without `CLAUDECODE` stripped. The tree
  has since merged `main` twice (docs-only). **Measure your own starting point and report
  both** — §9's *a count from the survey is still the count: not if your own phase has
  been committing.*
- A timeout-shaped red gets re-run alone before you report it; say that you did.
- Use the `git` wrapper on PATH. Commit your work. Record the three findings' resolutions
  in the commit message — **the scratchpad does not survive the session and commit messages
  are this project's durable record.**

## 8. Report — plan §5.3

```
WHAT CHANGED / RED / GREEN / SUITE / TYPECHECK / DEVIATIONS / UNCERTAIN
```

**Nothing `UNCERTAIN` on a non-trivial task means you have not looked.** Your report
reaches the orchestrator as well as me; write it to stand alone.
