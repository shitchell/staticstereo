# P3b survey (S-1) — measurements, for every worker in this phase

**Provenance:** every line here is **S-1's measurement**, taken 2026-10-15 at `c4f4b7f`,
not your PM's. Your PM has not read the source and cannot check any of it. Where S-1
labelled something inference, it is labelled here too. **If you measure something that
contradicts this file, your measurement wins — say so in your report.**

A count in here may have moved: the phase is committing. §9 — *"a count from the survey is
still the count: not if your own phase has been committing."*

---

## Baseline

typecheck 0 · build 0 · build:site 0 · test 0 · **80 files / 1881 passed / 0 skipped** /
43.1s. 0 skipped verified by grepping the log for `↓`/`skipped`, so no freshness gate
skipped silently. `node_modules` is current (`npm ls --depth=0` clean; `package.json`'s
newer mtime is a touch — `git diff HEAD` on it is empty).

**Three harnesses spawn `svelte-check`**, derived by two agreeing instruments (a subprocess
census and the timing rank): `site/typecheck-gate.test.ts` (19.8s), `site/fitregistration.test.ts`
(22.5s), `site/bindingregistration.test.ts` (41.0s) = **60.3% of summed test time**.
`site/dist.test.ts` also spawns, but `bash` for a zip probe, not `svelte-check`.
**Whether a fourth harness fits is UNMEASURED** — S-1 did not plant one, and
`bindingregistration.test.ts:734` records a prior timeout over a 446-file surface.

Use the **default** reporter for timings. `--reporter=json` under-reported a
`beforeAll`-heavy file by 1500× (27ms vs 41,531ms). It is still correct for counts.

---

## The state of play: what exists, what does not

**Does not exist anywhere in the tree:** a store, a history/undo mechanism, a visibility
set. Censuses: `createStore|writable(|readable(|signal(|$state|subscribe(` → zero hits in
production code; `undo|redo|history|mark` → only `history.replaceState`, `Operation.mark`,
and a keybinding vacancy; `visib` → every production hit is prose *declining* the field.

**P3a shipped eight registry modules that nothing imports** — `controlspec.ts` (1128),
`views.ts` (892), `keybindings.ts` (837), `operations.ts` (747), `shadings.ts` (655),
`widgets.ts` (565), `layout.ts` (416), `panels.ts` (410). They are reachable from neither
entry point. Until the shell wires them, every registration test tests a module no
consumer reaches.

**Live editor state today** is nine module-level `let` bindings at `site/main.ts:144-170`
(`ui`, `cache`, `state`, `diagRow`, `bandX0`, `bandX1`, `playing`, `lastWrittenHash`,
`presenting`), plus the pure `UiState`/`Action`/`reduce` trio in `site/controls.ts` (361
lines, DOM-free, well tested).

**`site/main.ts` (1346 lines) is imported by nothing.** It is reachable only from
`site/index.html:404`'s script tag. **It therefore has no unit tests at all** — its only
sensors are `markup.test.ts` and `keybindings.test.ts` grepping its raw source text.

---

## Hash: the complete read and write sets

Derived by a TypeScript-AST walk over every non-`node_modules` `.ts`/`.js`, collecting
`location`/`history` identifiers, imports resolving to `./hash`, and references to
`encodeSceneHash`/`parseSceneHash`/`HASH_VERSION`. Blind to dynamic property access,
string-literal spellings, `.svelte`, and HTML-inline script — the last two closed by hand
(the five `.svelte` files are fixtures; both HTML files carry only a `<script src>` tag).

**Writes — three, all in one file:** `main.ts:685` (`history.replaceState` in `syncHash()`),
`main.ts:465` (`replaceState` in `syncPresentParam()`, carrying the hash through verbatim).
There is no third `history.*` reference in the repo.

**Reads:** `main.ts:681` (write guard), `:691` (`parseSceneHash` in `loadFromHash()`),
`:1315` (`hashchange` listener), `:464` (composing the present URL), `:1308`
(`clipboard.writeText(location.href)`), `player.ts:361` (read-only, handed to `playerPlan`).
`present.ts:131-132` is a **false positive** — `location` there is a parameter name.

**`site/hash.ts` (155 lines) touches no DOM.** Pure codec. Six importers.

**Design §3.4's "the two are parallel and can disagree" — measured true, but not by drift.**
`syncHash()` is called on all four mutation paths. What makes it true is structural:
1. The coupling is **a convention at four call sites, not a projection** — a fifth path
   that forgets `syncHash()` desynchronises silently, and **no test asserts that
   `state.scene` and `location.hash` agree**, because no test imports `main.ts`.
2. **An unrenderable scene reaches the hash**: `dispatch` calls `syncHash()` *before*
   `paint()` discovers `sceneError`, so the URL can carry a scene the page is refusing to
   render. *(S-1: traced, not executed.)*
3. `syncHash()`'s early return at `:681` does not update `lastWrittenHash`, so the
   `hashchange` guard at `:1315` can hold a stale value. *(S-1: traced, not executed.)*

**Two things are out of the hash deliberately, and both carry recorded rationale.**
`main.ts:148-154` on diagnostics selection: *"A view concern, not scene state, so it stays
out of the hash — a shared link carries the picture, not where someone last pointed the
ruler."* `main.ts:160-168` on presentation mode: *"A **view** flag and nothing more: it is
not in the scene, not in the hash, not in `UiState`, and it changes no pixel the renderer
produces."* **The hash projection is partial and the partition is already decided.**

`main.ts:683-684` records why `replaceState` and not `pushState`: *"a slider drag would
otherwise fill the history stack with hundreds of entries and make Back useless."*
Mark-based undo removes that argument's premise — if you revisit it, write **beside** the
comment, never inside it.

**The injection precedent is `site/transportdriver.ts`**, whose own header says: *"**Both
the clock and the scheduler are arguments.** Nothing here reads a clock or creates a timer,
so a whole playback session … is expressible as a sequence of values in a test, in plain
node, with no DOM and no fake-timer plugin."* A hash projector taking
`{read(), write(hash), schedule(fn)}` is testable with a counting `write` and a synchronous
`schedule`.

A **second** coalescing precedent exists in the file being torn down: `main.ts:604-623`'s
`render()` keeps "one in-flight plus at most one queued" over a promise chain. That is
promise-chain coalescing of *renders*, not microtask batching of *writes*. **Whether a
microtask projector interacts badly with that chain is UNMEASURED.**

---

## Transport (criterion 9)

`site/transport.ts` (274) is a pure state machine; `site/transportdriver.ts` (172) owns the
loop with `now`/`schedule`/`cancel`/`onFrame`/`scene` all injected. Exports of
`transport.ts`: `TransportState`, `frameTimesOf`, `lastFrameTime`, `frameIndexAt`,
`timeOfFrame`, `loopDuration`, `snapTime`, `snapLoopTime`, `initialTransport`, `timeAt`,
`play`, `pause`, `seek`, `toggle`.

**Importable from the editor with no player DOM, and guarded:** `transport.test.ts:484-505`
asserts over the raw source that `transport.ts` contains no `Date.now(`, `performance.`,
`setTimeout(`, `setInterval(`, `requestAnimationFrame(`, `document`, `window`,
`addEventListener`, no module-level `let`/`var`, and no import of any editor module.
`site/controls.ts:2` already imports from it.

`transportdriver.ts:17-22` states the seam: *"That module is a pure state machine over
values and nothing else, which is the property that lets P3 lift it into the editor store
wholesale; this one owns a loop and a pending handle, and a store wants the machine without
the loop."*

**The hazard:** `UiState.time` and `TransportState.anchorTime` are two representations of
scene time, and they snap by **different rules** — `controls.ts` uses `snapTime` (linear),
the transport uses `snapLoopTime` (circular). They cannot both survive.

### The `seek` ruling — settled 2026-10-15, after S-1 found the conflict

`transport.ts:266` uses `snapLoopTime`, so **`seek` wraps today**. `transport.ts:217-254`
says in writing that nothing pins it, no test samples the final inter-frame gap, and the
choice is P3's. The handover's "`seek` clamps" was **the orchestrator's inference formatted
as an inheritance** — now orchestrator error 22 and a new §9 row.

**Ruled, and it is neither shape originally offered.** P2 measured the two functions
*disagreeing*: on a 2s/12fps scene, `seek(…, 1.99)` anchors frame 0 while
`snapTime(…, 1.99)` gives 1.9167, agreeing again at 1.95. Two functions that both answer
*"which frame is at time t"* must not disagree for any t.

> **The invariant to pin is: ∀t, `seek` and `snapTime` select the same frame.**
> Both clamp. An editor scrubber dragged past the end parks at the end.
> **Playback wrap stays separate** — looping is `repeat`, which acts on advance, not on
> frame selection.

This is assert-on-structure, not a value pin.

---

## Layout and visibility (criterion 11)

`layout.ts` exports `SlotId`, `SLOTS`, `CENTRE_SLOT`, `SlotFlow`, `SLOT_INFO`,
`DefaultPanelId`, `LayoutConfig<P extends string>`, `DEFAULT_LAYOUT`, `panelsIn`,
`mountedPanels`, `duplicatePanelIds`, `slotInfo`, `REFUSED_PLACEMENTS`.
`LayoutConfig` is **generic in the panel-id type**, which `:218-224` calls *"the single most
load-bearing decision in this module"*, precisely so a narrower second layout is cheap.

**A real second layout already exists**: `layout.test.ts:60`'s `SIMPLE_LAYOUT`, over a
narrower vocabulary with an empty bottom slot. Its docblock: *"what P3a owes is a *shape* a
second instance can be built in, and the only honest proof of that is building one."*

**Design §11's compile-error claim — verified by planting.** Setting `DEFAULT_LAYOUT`'s
right slot to an unregistered panel gives typecheck exit **1**, 5 errors across 3 files:
`layout.ts:266` and `:275` (as claimed), plus `layout.test.ts:369`, `reachability.test.ts:130`
and `:300`. **Design §11's "plus three more files" is wrong** — three more *errors*, two
more *files*. Also `:266` is an artefact of which slot was planted in; **`:275` is the
stable half.**

**Three modules decline the visibility field in prose, quoting §11** — `layout.ts:38-47`
(*"What is deliberately NOT in `LayoutConfig`. Visibility… two things, and folding the
second into the first is how the registry stops being complete"*), `controlspec.ts:68-77`
(*"There is no visibility field, no mode field and no filter here… this is the one the
temptation is actually about"*), `keybindings.ts:37-39`, `panels.ts:34-41`.

**The one mistake available here, and it is cheap to make.** The consumer is
`controlspec.ts:1118`'s `unmountedControls(layout, specs = CONTROL_SPECS)`. Criterion 6's
test (`reachability.test.ts:185-192`) runs it over the **full, defaulted** registry, with a
vacuity floor at `:192`. **If a visibility set is passed as the `specs` argument, criterion
6's sweep silently narrows to the visible subset and goes green over a smaller
population** — the exact "a check that cannot see reports fine" shape. The visibility set
must be a **third value**, consulted by whatever renders.

---

## Criterion 14 — measured, and the plan's cited instance was withdrawn

Two addresses, both resolving, neither stale: `dist.test.ts:1382` is the
`EDITOR_ONLY_MODULES` **declaration**; `:1430` is the `toHaveLength(7)` **assertion**.

**An AST module-graph walk from both entries** (following static imports, resolving
`./x.js → ./x.ts`, **excluding type-only imports**) gives main=38 files, player=39, and
editor-only = `controls.ts`, `depthmap.ts`, `diagnostics.ts`, `examples.ts`,
`legibility.ts`, `main.ts`, `stageguide.ts`. **That is `EDITOR_ONLY_MODULES` exactly —
7 of 7, zero absent, zero spurious.** The list is *correct today*.

**The "eight" are a different set**: the eight P3a registry modules, reachable from
**neither** entry. Planting them in the list **reddens the suite** (the presence half of
the control catches a needle that is in no bundle). Confirmed by two plants.

**The check has teeth — measured.** A real leak planted in `player.ts`, needle confirmed in
`dist-player/` by grep, produced: *"(custom track)" reached the player bundle, so
site/controls.ts is in it.*

**The caveat that became a §9 row.** S-1's *first* plant was **constant-folded away by
Rollup**; nothing reached the bundle and the test reported **34/34 green**. A worker would
have recorded "no teeth". **Confirm the planted needle is present in the built artifact by
grep before reading the check's verdict.** Separately, a second import's needle was
tree-shaken — a needle proves something about the *function* holding it.

**What remains for this criterion:** the list is hand-written and **will rot** as the shell
adds modules — derive it or cross-check it against a derivation; and the needles must be
**extended to the shell's own modules with the presence half re-run** once teardown lands.
`dist.test.ts:1311-1326` already says exactly this, and warns that *"a renamed output
directory or an inlined entry would make every needle absent from both sides and turn the
absence half green for the worst possible reason."*

**No unasserted `report()`/`[measured]` lines in `dist.test.ts`** — so its §6.5a control
needs only a pass/fail diff, not a value diff. (The repo's ~126 such lines are elsewhere.)

Candidate derivations S-1 found, with failure modes — **options, not a recommendation**:
import-graph diff (reproduces today's 7 exactly; needs a resolver in the test; blind to
dynamic `import(variable)`; makes the list definitionally correct, so the vacuity floor must
move to needle coverage) · bundle diff (needs sourcemaps or a manifest; **neither config
emits one today**) · directory convention (`site/editor/**`; costs a file move; true by
construction so nothing can be caught) · keep the hand list **plus a derived cross-check**
(two sources of truth, but drift is caught — cheapest thing that closes the rot).

---

## Criterion 16 — P2 already built the instrument

`site/playerchrome.ts:445` exports `flowViolations(root: ChromeNode): FlowViolation[]` over
a declarative tree (`role`, `tag`, `flow: 'flow'|'absolute'|'fixed'`, `pointerEvents`,
`children`), with violation kinds `'above-canvas' | 'transport-placement' | 'absent'`.
`playerchrome.test.ts:421-520` already exercises it with a **full control set**: positive
(in-flow toolbar above the canvas ⇒ `'above-canvas'`), negative (**the same node**
`absolute` or `fixed` ⇒ `[]`, so it is about flow and not document order), nesting (a strip
above the canvas's *branch* also violates), and vacuity (an empty wrapper ⇒
`['absent','absent']`, not a pass). **No DOM, plain values.**

Reusing it makes `playerchrome.ts` shared rather than player-only. That breaks no needle.
`playerchrome.ts:553` anticipates it: *"P3 lifts this into the editor shell…"*.

**The layout half already ships its declaration.** `layout.ts:103` `CENTRE_SLOT`;
`layout.ts:119` `SlotFlow = 'beside' | 'after'` — **there is no `'before'` member and that
absence is the mechanism**: *"Adding a `'before'` member is therefore the cheapest possible
way to describe a layout that cannot be built."* `layout.ts:377` `REFUSED_PLACEMENTS.top`.
`layout.test.ts:271-284` asserts `'before'` is absent and says: *"That becomes criterion 16
in P3b; **this is not the enforcement of it, it is the declaration it will be enforced
against.**"*

**The layout half alone is a check that cannot see the bug.** `SlotFlow` constrains
**slots**; §8.3's actual hazard is a control *inside* the centre slot, above the canvas —
intra-slot, which `SlotFlow` cannot see. `flowViolations` can.

§9's headless row is about reproducing the *original* bug (fractional viewport, zero-width
scrollbars, integer-snapped `scrollWidth`). That was a diagnosis problem, already solved.
**Criterion 16 does not need a browser.**

---

## Teardown (criterion 10)

### `site/main.ts`, 1346 lines, by its own section banners

Line counts and boundaries are **measured off the file's banners**; the port/rewrite/delete
labels are **S-1's inference** — no document assigns them.

| Lines | § | Contents | S-1's label |
|---:|---|---|---|
| 1–64 | imports | 15 statements | delete |
| 65–139 | elements | `el<T>(id)`, `collectElements()`, 53 `getElementById` | delete |
| 140–199 | state | 9 module-level `let`; `showError`, `stereoOf`, `describeError` | rewrite into store (`stereoOf` is 2 pure lines — port) |
| 200–224 | display | `drawStereo` + 2 RGBA scratch buffers | rewrite against player |
| 225–391 | display scale | `applyDisplayScale`, `watchDpr`, dpr `MediaQueryList`; **carries the §8.3 reasoning at `:297-300`, `:346-353`** | rewrite against player (`playerplan.ts` + `scale.ts` own the arithmetic) |
| 392–416 | hint | `flashHint`, `HINT_SECONDS` | delete |
| 417–480 | presentation | `setPresenting`, `syncPresentParam`, `leavePresenting` | rewrite against player (`present.ts` is the pure half, survives) |
| 482–520 | overlays | `drawStageGuide`, `drawDepth` | port (thin wrappers; both subjects survive) |
| 522–600 | diagnostics | `updateDiagnostics`, `updateLegibility` | port (P4 owns the destination) |
| 602–676 | render | `render()` coalescing, `fontReady`, `paint()` | rewrite into store |
| 677–704 | hash sync | `syncHash`, `loadFromHash` | rewrite into store — criteria 8+15's subject |
| 705–729 | actions | `dispatch`, `setScene` | rewrite into store — **`dispatch` is criterion 7's mark boundary** |
| 730–907 | controls | `middleRow`…`syncTextControls`; **`WEIGHTS` at `:789` is a roster pinned by `markup.test.ts:90`** | delete — superseded by `CONTROLS` + `widgets.ts`; check `WEIGHTS` is derivable first |
| 908–933 | export | `download`, `withBusy` | port |
| 934–956 | playback | `sleep`, `playLoop` | delete — superseded by `transportdriver.ts` |
| 957–1319 | **wire** | every `addEventListener`; **27% of the file** | delete — Svelte replaces it wholesale |
| 1320–1346 | boot | `boot()` + top-level try/catch | rewrite — becomes the composition root |

**S-1 did not read lines ~960–1290 in full** (it sampled the middle of `wire()`). If
something structurally surprising hides there, the survey would have missed it.

### Everything coupled to `index.html` / `main.ts` / `styles.css`

`site/index.html` is 406 lines, 19,509 bytes, 53 `id=` attributes.

| Site | Coupling | Was it in the plan's list? |
|---|---|---|
| `vite.site.config.ts:42` | `root: 'site'`, **no explicit input**, so the entry is `site/index.html`. **`build:site` fails without it.** | no |
| `site/views.test.ts:125` | `MARKUP = 'site/index.html'`, parses `#depth-view` | **no — deliberate tripwire** |
| `site/keybindings.test.ts:62-63` | `SHELL = 'site/main.ts'`, `MARKUP = 'site/index.html'`; `:492-503` reads every recorded roster by path | **no — second deliberate tripwire** |
| `site/views.ts:436` | **production data** — `DEPTH_SOURCE_PROVENANCE.rosters` | no |
| `site/keybindings.ts:666,669` | **production data** — `CHROME_BINDING_PROVENANCE.rosters` | no |
| `src/node/canvas.vendored.test.ts:166` | `readFileSync('site/index.html')` in an 8-path list, **with a hand-written `report(…, 8)` beside it that becomes false**. Throws ENOENT. **Ruled P3b's.** | no |
| `site/fonts.test.ts:56` | reads `site/styles.css` (723 lines) | no |
| `site/markup.test.ts:37` | reads all three | yes — the pre-authorised removal |
| `site/dist.test.ts:1337,1383` | `'site/main.ts'` in needles and the module list | via criterion 14 |
| `site/transport.test.ts:35`, `transportdriver.test.ts:56` | `'main'` in **two more copies** of the editor-module list | no |

**The tripwires are deliberate and self-documenting.** `views.test.ts:44-51`: *"P3b deletes
`site/index.html`; when it does, the `#depth-view` parse throws by name… §9 is blunt that
'a recorded note is a sensor — it is not.' So the note **is** this test. Whoever does the
teardown removes the deleted file from `DEPTH_SOURCE_PROVENANCE.rosters` and keeps the one
that survives."* The failure message at `:191` names the teardown.
`keybindings.test.ts:495` says the same of itself.

### The seven named test files — six subjects survive untouched

`controls.test.ts` (383), `present.test.ts` (177), `scale.test.ts` (1972),
`diagnostics.test.ts` (226), `depthmap.test.ts` (68), `stageguide.test.ts` (87) all test
modules that teardown **orphans but does not delete** — `present.ts` and `scale.ts` are in
fact **shared** (both entries import them). **Net removals required beyond
`markup.test.ts`: zero.**

**What dies with `markup.test.ts` and is pinned nowhere else — three things:**
1. **`markup.test.ts:395-418`, the editor-side §8.3 centring rule** — that `main.ts` writes
   `canvasWrap.style.marginLeft/marginTop` from `fit.offsetX/Y` and clears them, rather
   than trusting `margin: auto`. Its own comment: *"Deleting either of these two lines
   restores it and leaves every other test in the repo green."* It records **109,910 of
   6,300,000 device pixels wrong** at 3825×2160 / dpr 1.5. The player has its own version
   at `player.ts:506-507`; **the editor's successor has none.** This is criterion 16's real
   content.
2. **`:332-344`** — presentation-mode hiding uses `display:none`, never
   `visibility`/`opacity`, for focusability reasons.
3. **`:420-430`** — no CSS scaling of the canvas when presenting (no `object-fit`, no
   `%`/`vw`/`vh` width or height on any `.presenting` rule).

Design §12 authorises rewriting against the **player**, which covers (2) and (3) by
analogy but **not (1)**, because (1) is about the editor's own canvas.

**Also dying:** `main.ts:346-353`'s comment honouring §8.3's *"the sensitivity is to the
exact sub-pixel and is not something to tune"* — *"What is deliberately NOT here: a
sub-pixel nudge of the canvas's origin."* **Its sensor must survive the file.**

---

## Duplication inside P3b's surface

1. **The editor-module list exists three times, each with its own `toHaveLength(7)`:**
   `dist.test.ts:1382` (`EDITOR_ONLY_MODULES`, spelled `'site/main.ts'`),
   `transport.test.ts:35` and `transportdriver.test.ts:56` (both `EDITOR_MODULES`, spelled
   `'main'`). The two `EDITOR_MODULES` copies **know** they are copies and assert identity
   (`transport.test.ts:91-157` reads the sibling's source and regex-extracts the block).
   **`EDITOR_ONLY_MODULES` is tied to neither, and nothing asserts the three agree.**
   Teardown changes this list in three files, one of them unguarded.
2. **`DepthView` (`controls.ts:29`) and `DepthSource` (`views.ts:300`) are the same union
   under two names.** `views.ts:294-297` records the collision deliberately and renames on
   its own side. **Nothing ties them.** The store must hold one, and picking either orphans
   the other's `AssertNever` pair or its reducer action.
3. Panel ids are declared three times but **are** tied by an `AssertNever` — guarded, fine.

---

## S-1's UNCERTAIN list — inherited unresolved

1. Whether a fourth `svelte-check` harness fits. **Unmeasured.**
2. *(resolved — the `seek` ruling, see above)*
3. Design §11's "plus three more files" — S-1 measured one plant variant; a bad **slot**
   name rather than a bad **panel** name might reach more files. Untested.
4. The `main.ts` disposition labels are inference, not measurement.
5. S-1 did not read `main.ts` lines ~960–1290 in full.
6. `site/styles.css` (723 lines) was not analysed, only its three readers found.
7. The AST instruments are blind to `.svelte`; S-1 judged the five fixtures safe — that is
   a judgement, not a measurement.
8. Whether a microtask projector interacts badly with `render()`'s promise chain.
9. S-1 rebuilt `dist/`, `dist-site/` and `dist-player/`. **Contents should be identical;
   mtimes are not.**
