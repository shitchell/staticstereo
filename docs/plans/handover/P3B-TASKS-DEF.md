docs(p3b): the eight unwritten tasks, defined before the context holding them dies

PM-SHELL-P3b-2 adopted seven tasks in a message and wrote them into no document.
That is orchestrator error 15 committed one tier down: the names appeared in a
report, the definitions existed only in a PM's context, and the ledger that held
even the names is session-scoped and untracked. Tier 0 declined to reconstruct
them, on the strength of having tried exactly that once before — nine criteria
rebuilt from its own rulings, five rows defective and one criterion deleted
outright, with the result internally consistent and quote-diff clean. A cure for
an absence that produced a better-hidden absence.

So the definitions are here, in the durable record, where a successor can read
them without this session. Criterion 23 is added by tier 0 out of C-2's
carry-forward and is defined alongside them.

Each entry gives: the criterion it serves, the files it expects to touch, its
acceptance criterion, and what would make it refusable. The last field is not
decoration. Worker pushback on this build stands at nineteen for nineteen, five
of those against this PM's own briefs, and a PM cannot check its own acceptance
criteria against the code.

NOTHING BELOW IS APPROVED. Tier 0 has not ruled on any of it.


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

H-1 — the writable write path (criterion 22, first clause)

  Serves    Criterion 22: every CONTROLS entry is writable, not merely
            reachable. PREREQUISITE FOR CLUSTER F, because the Action union is
            the store's API and P4, P5 and P6 all build on it.
  Files     site/controls.ts (Action and reduce), site/controls.test.ts,
            possibly site/controlspec.ts.
  Why       SPIKE-1 measured 17 of 63 controls with a keyed Action and 46
            without — every layer.*.at / .depth / .name, all layer.shape.*, all
            image|gif.src|mode|mask, and all 11 preset.*. Their only write path
            is rebuilding the whole scene, which store.ts's header says the
            store must not own. Criterion 6 is MET and structurally cannot see
            this: it proves a spec is REACHABLE, not that a value is WRITABLE.
  Accept    Every CONTROLS entry has a write path through the store's Action
            union that does not require rebuilding the scene, AND the write path
            preserves field types.
  Hazard    The second half is not decoration and it is the whole risk. SPIKE-1
            measured that a computed string key ERASES THE FIELD TYPE:
            {type:'stereo', patch:{[key]: Number(raw)}} compiles clean where the
            literal form errors, so a generic renderer can write a number into a
            boolean or an enum with nothing to stop it. SPIKE-1's own code had
            the bug and compiled. A path-addressed action that reintroduces that
            hole satisfies the first clause and FAILS the criterion.
  Also      Action has 14 members after C-2 (11 + play/pause/seek). Adding
            variants reddens three instruments by design: a sample table in
            store.test.ts, a parser cross-check reading the union out of
            controls.ts, and a mapped table at hashprojection.test.ts:144.
            Classify, never suppress. A-4's duplication guard forbids
            constructing state outside reduce's answer.
  Refusable NOBODY HAS MEASURED A SOLUTION. SPIKE-1 measured the
            counter-example only. This is the highest-risk item in the phase and
            H-1 is explicitly permitted to return "this shape cannot be typed in
            TypeScript", with the options and their costs, instead of a design.
            That is a successful outcome, not a failure.

H-2 — the criterion-22 sensor (second clause)

  Serves    Criterion 22. Depends on H-1.
  Files     A test file; possibly a new harness.
  Accept    (1) A sweep DERIVED FROM CONTROL_IDS — never a hand-written list —
                asserting every entry is writable. Cite the length of the thing,
                never a total someone wrote down: a survey paragraph once gave a
                control population of 64 using two arity conventions at once,
                where the answer is 63 under one and 68 under the other, and
                pinning 64 would have produced a wrong registry that was green.
            (2) A wrong-typed write FAILS TO COMPILE, demonstrated by a plant.
            (3) A vacuity floor: the sweep is shown to redden when an entry is
                made unwritable.
  Harness   Clause (2) is the exact shape the three existing registration
            harnesses implement — plant, run svelte-check, parse — so H-2
            PROBABLY NEEDS A FOURTH, against the standing assessment that no
            P3b task does. That assessment is hereby withdrawn for H-2
            specifically. A fourth must be cleared with the PM, wall-clock
            re-measured before it lands, and it must strip CLAUDECODE from the
            child environment, pin --output machine, reject rather than throw
            from any callback, and keep its parse-failure and
            criterion-not-met paths as distinguishable assertions.
  Refusable If H-1 returns that the type-level half is not expressible, clause
            (2) has no subject and H-2 must be restated or cut.

F-0a — fund the minimal jsdom tier

  Serves    ESC-8 part 2. Unblocks cluster F's only untestable residue.
  Files     package.json, the vitest config, a new test file.
  Why       SPIKE-1 measured that no DOM tier exists (jsdom and happy-dom
            absent, mount() unrunnable by any test); that $effect is STRIPPED
            from SSR output; that render() is LAZY, so a side-effect assertion
            after it measures nothing and reports green; and that
            $state(store.state()) FORKS STATE IN THE BROWSER, breaking the
            store's identity guarantee, WHILE SSR REPORTS THE SAME ANSWER FOR
            THE CORRECT AND THE INCORRECT SPELLING. That last one is the worst
            kind: the tier does not merely miss the bug, it cannot distinguish
            the two cases.
  Accept    mount() runs in a test, and the store-identity guarantee is
            asserted: a component bound to the store writes THROUGH to the
            store rather than to a fork. The test must be shown to DISTINGUISH
            the correct spelling from the incorrect one — that is the entire
            point, and it is the thing SSR cannot do.
  Standing  A Svelte component is a thin binding and holds no logic that could
            fail a test. Everything testable lives in a plain module. This tier
            exists only for the residue that rule cannot cover.
  Refusable IF mount() CANNOT BE MADE TO RUN, THAT IS AN ESCALATION, NOT A
            WORKAROUND. Ruled explicitly. Playwright is deliberately not funded
            here; revisit for P4, where pixels are the subject.

F-0b — explicit input for vite.site.config.ts

  Serves    ESC-11. Decouples cluster F from criterion 10 rather than
            sequencing them.
  Files     vite.site.config.ts, plus a sensor.
  Why       The config has root:'site' and no explicit input, so site/index.html
            is THE ONLY PATH INTO THE BUNDLE — and it is the file teardown
            deletes. THIS EDIT BELONGS TO F, NOT G. G-3 may not delete
            site/index.html until it has landed. An ordering constraint that
            exists in no document is how a phase discovers it the hard way.
  Accept    npm run build:site exits 0 with an explicitly declared input, and a
            sensor exists for the entry being explicit — a note is not a sensor.
  UNSETTLED THE SENSOR SHAPE IS NOT RECONSTRUCTED AND I WILL NOT INVENT ONE.
            The honest test — the build still succeeds with site/index.html
            absent — cannot be run before teardown without deleting the file.
            A test asserting the config declares build.rollupOptions.input is
            checkable but weak. The worker proposes the sensor and the PM
            ratifies it; do not treat either option above as chosen.
  Refusable If an explicit input cannot be given without changing output
            filenames or asset paths, that changes WHAT GETS BUILT rather than
            how, and it is Shaun's call, not the worker's and not the PM's.

G-5 — criterion 15's second clause: the editor's URL actually coalesces

  Serves    Criterion 15, second clause. Depends on F-2 (the composition root).
  Files     The composition root, plus a test.
  Why       Criterion 15 is MET AT THE MODULE and verified there. "The editor's
            URL coalesces" is UNWITNESSED until the composition root exists, and
            THE CHOICE OF QUEUE IS CLUSTER F/G'S TO GET WRONG. Today there is
            neither a criterion nor a sensor on that side, which the standing
            "a gap ships only with a sensor" rule forbids.
  Accept    A sensor that the composition root passes a MICROTASK scheduler —
            not a macrotask, not a synchronous one — to attachHashProjection,
            and that a gesture producing N mutations in one tick produces one
            URL write through the real browser adapter.
  Hazard    A-3 measured that A FAKE SCHEDULER IS IDENTICAL FOR queueMicrotask
            AND setTimeout and therefore cannot see which queue the projector
            landed on. The sensor must bracket from both sides: nothing written
            before the first await rules out a synchronous flush, and everything
            written after it rules out any macrotask. A-3's own test does this
            at the module; G-5 does it at the root.
  Refusable Cannot start before F-2 exists. If F-2 ships without a composition
            root that owns the scheduler choice, G-5 has no subject and that is
            a finding about F-2.

G-6 — criterion 23: time and frame carry no clock (ADDED BY TIER 0)

  Serves    Criterion 23, created by tier 0 from C-2's carry-forward, because
            "no criterion covers it" was the problem and a note is not a sensor.
  Files     site/controls.ts, site/controls.test.ts, and main.ts or whatever
            composition root replaces it.
  Why       C-2 measured it and documented it at the arm. {type:'time'} and
            {type:'frame'} carry no nowMs, and C-2 could not add one without
            changing eleven action shapes that main.ts — out of its scope —
            consumes. PAUSED, which is the scrubber's real case, the behaviour
            is exact and C-2 asserts it for five wildly separated clocks.
            PLAYING, the playhead resumes advanced by the interval already
            elapsed since the old anchor, so a drag issuing many time actions
            during playback COMPOUNDS.
  Accept    During playback, N successive time or frame actions leave the
            playhead where the last one put it, not advanced by accumulated
            intervals. Asserted CLOCK-FREE, by injection, on
            transportdriver.ts's precedent: nothing reads a clock or creates a
            timer, so a whole playback session is expressible as a sequence of
            values in a test, in plain node.
  Refusable The fix is to give time and frame a nowMs, which is a main.ts edit.
            If the eleven action shapes cannot be changed before teardown
            removes main.ts, G-6 SEQUENCES AFTER G-3 rather than being
            independent — and the worker should say so rather than editing a
            file the phase is about to delete.


ORDERING AND DEPENDENCIES

  Independent, dispatchable in any order:   D-0, T-1, H-1
  H-2 after H-1.  F-0a and F-0b before F-2.  D-0 before F-2 can be green.
  T-1 before F so F's warnings are visible.  G-5 after F-2.
  G-6 after G-3 if it proves to need main.ts gone first.
  F-2 is blocked on H-1, H-2, F-0a, F-0b and D-0 — five prerequisites, and
  cluster F is the first thing in this project that renders.

VERIFICATION OWED, unassigned: A-4, C-1, C-2. V-A covered A-1, A-2 and A-3 only.

This is an empty commit. It changes no file; the message is the artifact.
