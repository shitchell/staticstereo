# D-0 — narrow `dist.test.ts`'s `@napi-rs` grep

**You are an implementer.** PM: `PM-SHELL-P3b-3`. Branch `feat/p3b-store`, worktree
`/home/guy/code/git/github.com/shitchell/staticstereo`. You own that worktree for this
task.

## 0. Read first, in this order

1. **`git log -1 --format=%B 62696ae`** — an empty commit whose 243-line body is the
   durable definition of this task and seven others. **It is the authority**; your block
   is `D-0`, quoted in §2 below. If the two disagree, the commit wins — say so.
2. `/tmp/claude-1000/-home-guy-code-git-github-com-shitchell-staticstereo/8b54946b-39f3-4e41-bb67-886b9d8bd96a/scratchpad/P3B-WORKER-BOILERPLATE.md`
   — **all of it**, including the §0 "Shift 3 state" block.
3. `…/scratchpad/P3B-SURVEY-S1.md` — especially its **"Criterion 14 — measured, and the
   plan's cited instance was withdrawn"** section, which is the measured background for
   this file. S-1's measurements, taken before this phase committed.
4. From your own tree: execution plan **§2 invariants**, **§9 "Known traps" — every row,
   by heading**, **§6 the gate including §6.5a**, and §7's **"P3b rulings, 2026-10-15"**
   (ESC-9 is the ruling that created this task).

## 1. The paragraph that outranks this brief

> Your measurements outrank any assertion from your PM, **including its acceptance
> criteria** — the one artefact a PM cannot check against the code. Refuse an unsatisfiable
> criterion and prove why. If you cannot reach your PM, your final report is the channel of
> record; the mesh is unreliable, assume it.

**Escalate on conflict, not only on uncertainty.** Worker pushback on this phase is
nineteen for nineteen.

## 2. The task, as committed at `62696ae`

```
D-0 — narrow dist.test.ts's @napi-rs grep

  Serves    No numbered criterion. It is ESC-9 remediation and a hard
            prerequisite: cluster F cannot be green until it lands. P3b owns
            the file by that ruling.
  Files     site/dist.test.ts
  Why       SPIKE-1 measured the check to be a raw `text.includes` over built
            files, so it reddens on a DOC STRING in controlspec.ts containing
            "@napi-rs". Not a purity defect — the first real consumer of that
            registry turns the suite red for a comment.
  Accept    (1) A doc string or comment containing "@napi-rs" in a bundled
                module does not redden the check.
            (2) A real @napi-rs import or runtime reference reaching a browser
                bundle still does — shown with a planted needle CONFIRMED
                PRESENT IN THE BUILT ARTIFACT BY GREP BEFORE THE CHECK IS READ.
                A survey's first plant was constant-folded away by Rollup and
                the check reported green over a bundle the needle never reached.
            (3) The "I could not read or parse the artifact" path and the
                "a real regression is present" path are DISTINGUISHABLE
                ASSERTIONS with distinguishable messages. They are currently one
                assertion, which is the same defect that made four CI failures
                indistinguishable from a broken parser for nine hours.
  Refusable If clauses (1) and (2) cannot both hold — if no available instrument
            separates a doc string from a real reference in built output — then
            narrowing weakens the check and the task is an escalation, not a fix.
```

## 3. Relayed and unverified

The `Why` is **SPIKE-1's measurement**, relayed through two PMs; SPIKE-1 was a throwaway
that committed nothing, so it survives only as prose. **Reproduce it before you design
against it.** If the doc-string false positive does not actually occur, this task has no
subject and that is the finding.

Note the shape of the risk: you are being asked to make a check **less sensitive**. The
clause that protects against going too far is (2), and (2) is only admissible with a
needle **grep-confirmed present in the built artifact before the check is read**. Rollup
constant-folded a survey's first plant away and the check reported green over a bundle the
needle never reached — a paired control that silently measured nothing. A second plant was
tree-shaken; **a needle proves something about the function holding it**, so put it
somewhere that survives.

## 4. Acceptance — checkable by you before you start

The three clauses above, plus:

4. **Zero net test removals.** One removal is pre-authorised in this phase and it is
   `site/markup.test.ts`, which is not yours. Assertion counts may go up; they may not go
   down silently.
5. The narrowing is **derived**, not a hand-written exception list. §9: *a hand-written
   list of "the places that do X" goes stale silently the day a second place does X.* If
   the only instrument available is an exception list, say so and justify it rather than
   shipping it quietly.
6. Counts, four exit codes, and `0 skipped` verified **positively** by `grep -c '↓'`.

**If clauses (1) and (2) cannot both hold, stop and escalate — do not ship a weakened
check.** That is a successful outcome.

## 5. Forbidden

- `src/shared/`, `src/cli/`, `src/node/canvas.generics.test.ts`, `site/legibility.test.ts`
  — owned by the concurrent P1/P7 phase. Stop and escalate if you need one.
- `site/typecheck-gate.test.ts` — no RED is available for it; invariant 1 forbids changing
  it.
- No new `svelte-check`-spawning harness. Three exist and are >60% of summed test time.
- Do not reformat or tidy files you were not asked to change.

## 6. Operating notes

- **Build before you test, always**, and rebuild inside every mutation — a stale tree
  silently withdraws the Pages-critical assertions and still reports green. This task is
  *about* built artifacts, so this matters more here than anywhere.
- `npm run typecheck | tail` is not a check; `$?` is `tail`'s. Redirect and echo `$?`.
- **The post-merge baseline may still be unmeasured when you start.** Last recorded:
  82 files / 1948 passed / 0 skipped at `760f353`, before `main` merged three `docs/`
  files. Establish the current one and report it.
- A timeout-shaped red gets re-run alone before you report it; say that you did.
- Use the `git` wrapper on PATH. Commit your work.

## 7. Report — plan §5.3

```
WHAT CHANGED / RED / GREEN / SUITE / TYPECHECK / DEVIATIONS / UNCERTAIN
```

**Nothing `UNCERTAIN` on a non-trivial task means you have not looked.** Your report
reaches the orchestrator as well as me; write it to stand alone.
