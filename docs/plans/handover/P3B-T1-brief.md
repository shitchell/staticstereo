# T-1 — close `npm run typecheck`'s fail-open on Svelte warnings

**You are an implementer.** PM: `PM-SHELL-P3b-3`. Branch `feat/p3b-store`, worktree
`/home/guy/code/git/github.com/shitchell/staticstereo`. You own that worktree for this
task.

**This task changes the gate every other agent on this project measures against.** Treat
every step as load-bearing.

## 0. Read first, in this order

1. **`git log -1 --format=%B 62696ae`** — the durable definition of this task and seven
   others. **It is the authority**; your block is `T-1`, quoted in §2. If the two
   disagree, the commit wins — say so.
2. `/tmp/claude-1000/-home-guy-code-git-github-com-shitchell-staticstereo/8b54946b-39f3-4e41-bb67-886b9d8bd96a/scratchpad/P3B-WORKER-BOILERPLATE.md`
   — **all of it**, and in particular the block headed *"CI is GREEN — and the reason it
   was red is the most important thing in this file"*. That is your subject's
   neighbourhood.
3. From your own tree: execution plan **§9 "Known traps" — every row, by heading**. Four
   rows are directly about this script: *"the last `--output` wins"*, *"pinning the format
   in the root `typecheck` script is the clean fix"*, *"the suite measures the code"*, and
   *"a failing `expect` inside a child-process callback fails the test"*. Also **§2
   invariants**, **§6 including §6.5a**, and §7's **"P3b rulings, 2026-10-15"** (ESC-8
   part 3 is this task).

## 1. The paragraph that outranks this brief

> Your measurements outrank any assertion from your PM, **including its acceptance
> criteria** — the one artefact a PM cannot check against the code. Refuse an unsatisfiable
> criterion and prove why. If you cannot reach your PM, your final report is the channel of
> record; the mesh is unreliable, assume it.

**Escalate on conflict, not only on uncertainty.**

## 2. The task, as committed at `62696ae`

```
T-1 — close npm run typecheck's fail-open on Svelte warnings

  Serves    ESC-8 part 3. No numbered criterion; it is gate integrity, and it
            is what makes cluster F's warnings visible at all.
  Files     package.json (the typecheck script). Possibly a new sensor.
  Why       SPIKE-1 measured 8 x state_referenced_locally — Svelte saying the
            panel will never re-render — with the gate exiting 0.
  Accept    (1) The repo-wide Svelte warning count is MEASURED AND REPORTED
                FIRST, before any change. Closing the gate may redden existing
                code and that count is the decision input.
            (2) After the change, a planted Svelte warning makes
                `npm run typecheck` exit non-zero.
            (3) --output IS NOT TOUCHED.
  Forbidden Do not pin the format in the root typecheck script. The harnesses
            APPEND `--output machine` to the script's tokens, so a root pin
            yields a DUPLICATED flag; `mri` collects a repeated flag into an
            array, `outputFormats.includes([...])` is false, and the format
            SILENTLY REVERTS TO HUMAN — which is the nine-hour CI failure,
            restored by the change intended to prevent it.
            Do not modify site/typecheck-gate.test.ts. It was measured robust
            under all four formats svelte-check can choose, no RED is available
            for it, and invariant 1 therefore forbids changing it.
  Refusable If the measured warning count is large enough that closing the gate
            reddens code T-1 is not authorised to fix, it reports the count and
            escalates. Suppressing warnings to reach green is the one outcome
            that fails this task.
```

## 3. Clause (1) is a gate on the rest of the task, not a formality

**Measure and report the repo-wide Svelte warning count before you change anything.** It
is the decision input, and the task's own refusal condition is written against it. Report
the number, the predicate you counted under, and the breakdown by warning code — then
decide.

**Suppressing warnings to reach green is the one outcome that fails this task.** If
closing the gate reddens code you are not authorised to fix, report the count and
escalate; that is a success.

The `8 × state_referenced_locally` figure is **SPIKE-1's**, relayed through two PMs from a
throwaway spike that committed nothing — and SPIKE-1 had mounted a panel that is no longer
in the tree, so the number may have no referent at all now. Measure; do not carry it.

## 4. The trap that is specifically waiting for you

The obvious clean fix — pin the format in the root script — **would reintroduce the
nine-hour CI failure**, and this is only visible by combining two workers who never read
each other. An audit worker proposed it as the root fix, reasoning that svelte-check's
"last-wins" would become load-bearing. A fix worker had already **measured that there is
no last-wins**: the harnesses *append* `--output machine` to the script's tokens, so a root
pin yields a duplicated flag, `mri` collects it into an array,
`outputFormats.includes([...])` is false, and the format **silently reverts to human**.
Neither worker was wrong; the hazard lived in the join.

**Do not touch `--output`.** If you believe the root pin is nonetheless necessary, stop and
escalate — the harnesses would have to *replace* the token rather than append it, and that
is a change to three files nobody has authorised.

## 5. Acceptance — checkable by you before you start

1. The repo-wide Svelte warning count measured and reported **before** any change, with
   its predicate and a per-code breakdown.
2. After the change, **a planted Svelte warning makes `npm run typecheck` exit non-zero** —
   plant it, grep-confirm it present, read the exit code from `$?` after a redirect (never
   after a pipe), then revert.
3. `--output` untouched; `site/typecheck-gate.test.ts` untouched.
4. **The three existing `svelte-check` harnesses still pass.** They spawn the checker and
   parse its output; a change to the root script that breaks their token handling is the
   exact failure this task exists to prevent. Say explicitly that you checked them.
5. If you add a sensor: its **parse-failure path and its criterion-not-met path are
   distinguishable assertions with distinguishable messages**; it **strips `CLAUDECODE`**
   from any child environment; and it **`reject`s rather than `throw`s from any callback** —
   a failing `expect` inside a `child.on('close')` callback does not fail the test, it
   **hangs** it, and that single bug was the whole of a 10m45s CI run whose verdict was
   available at 8 seconds.
6. **No new `svelte-check`-spawning harness without clearing it with me first.** Three
   exist and are >60% of summed test time. If you think this task needs a fourth, stop and
   ask, and expect to be asked for a whole-suite wall-clock measurement. Green CI is 94s
   and that is the budget.
7. Zero net test removals. Counts, four exit codes, `0 skipped` verified positively by
   `grep -c '↓'`, and **whole-suite wall-clock before and after** — you are changing what
   the slowest third of the suite does.

## 6. Forbidden

- `src/shared/`, `src/cli/`, `src/node/canvas.generics.test.ts`, `site/legibility.test.ts`
  — the concurrent P1/P7 phase owns these. Stop and escalate if you need one.
- `site/typecheck-gate.test.ts`, and `--output` anywhere in the root script.
- Do not reformat or tidy files you were not asked to change.

## 7. Operating notes

- **Build before you test, always.**
- `npm run typecheck | tail` is not a check; `$?` is `tail`'s.
- **Your own measurements are taken inside the agent harness**, which is the environment
  that hid the nine-hour bug — `svelte-check` returns `machine` format when
  `CLAUDECODE === '1'` and `human-verbose` otherwise. **Run your key checks both with and
  without `CLAUDECODE` stripped** and report both. A format revert fails *open*, toward
  green, so a clean result from inside the harness is the least trustworthy kind.
- The post-merge baseline may still be unmeasured when you start. Last recorded:
  82 files / 1948 passed / 0 skipped at `760f353`.
- A timeout-shaped red gets re-run alone before you report it; say that you did.
- Use the `git` wrapper on PATH. Commit your work.

## 8. Report — plan §5.3

```
WHAT CHANGED / RED / GREEN / SUITE / TYPECHECK / DEVIATIONS / UNCERTAIN
```

Lead with the measured warning count. **Nothing `UNCERTAIN` on a non-trivial task means
you have not looked.** Your report reaches the orchestrator as well as me.
