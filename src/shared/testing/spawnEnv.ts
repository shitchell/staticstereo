import { tmpdir } from 'node:os'

/**
 * The environment a `src/shared/` test hands to a child process — constructed,
 * never inherited.
 *
 * Excluded from the build (`tsconfig.json`), like `src/core/testing/` and
 * `gifFixtures.ts` beside it. Node-only and test-only; nothing browser-bound
 * imports it.
 *
 * ## Why this exists, which is not a hypothetical
 *
 * `main`'s CI was red for nine hours and eight commits because `svelte-check`
 * 4.7.6's `getOutputFormat()` takes an explicit `--output` first and otherwise
 * falls back to **`machine` if `process.env.CLAUDECODE === '1'`**, and
 * `human-verbose` if not. The harnesses spawned it with `{...process.env}`.
 *
 * So the suite's behaviour depended on whether it was being run from inside
 * an agent harness. Every agent on this project got one format and the CI
 * runner got the other, and **no tier of this system could have caught it by
 * running the suite**, because the blindness was in the thing all of them
 * share. (Relayed from the orchestrator via PM-SHARED-3; the `svelte-check`
 * half is not re-measured here, and the harnesses themselves are owned
 * elsewhere and fixed at `57f1e15`.)
 *
 * That is this repo's dominant failure mode — a check that cannot see reports
 * "fine" — arriving through the environment rather than through the code. The
 * generalisation is the §9 standing rule: a behaviour that is **observed**
 * rather than **pinned** holds everywhere you happen to look. An inherited
 * environment is a large, unenumerated, unversioned input to every child
 * process, and no test that uses one can state what it actually ran.
 *
 * ## The paired control (§6.5a), both halves, measured 2026-10-15
 *
 * This is **defence against an unaudited surface, not a fix for a defect that
 * was there.** None of the tools `src/shared/` spawns branches on the harness
 * variable, and that was measured rather than assumed — the mutation half is
 * `CLAUDECODE` stripped versus set, the null half is the output not moving:
 *
 * - `/usr/bin/zip -X -q out.zip mimetype ref "masks/масло — ☕𝄞.png"` produced
 *   a **byte-identical archive** (sha256 `ba9ee891309bcde7…`, 375 bytes) under
 *   six environments: inherited, `CLAUDECODE=1`, `CLAUDECODE` unset, a minimal
 *   `PATH`+`TMPDIR`, `LC_ALL=C`, `LC_ALL=C.UTF-8`, and a completely empty
 *   `env -i`. Its stdin→stdout mode likewise.
 * - `/usr/bin/unzip` agreed byte-for-byte between inherited and `env -i` for
 *   `-Z1`, `-t` and `-p` on the non-ASCII member name.
 * - `node --input-type=module --eval` likewise.
 *
 * **Locale is not load-bearing here, which is worth recording because it is
 * the thing one would expect to be.** §9 carries two `LC_ALL=C` incidents, and
 * Info-ZIP's general-purpose bit 11 (names are UTF-8) looks exactly like a
 * locale-sensitive decision. Measured, it is not: across all six environments
 * the flag came out `cp437 cp437 utf8` for the same three names every time —
 * `zip` decides per name, from the bytes. `LC_ALL` is pinned below anyway, so
 * that a future locale-sensitive path cannot drift silently; if Info-ZIP ever
 * did start gating the flag on locale, `containerRead.test.ts`'s assertion
 * that the Cyrillic member comes back under its own name goes red rather than
 * passing with a mangled name, so this fails closed.
 *
 * ## What is in it, and why each one
 *
 * Measured: **none of these is required** — every tool above ran correctly
 * under `env -i`. They are here because "it worked on this machine with
 * nothing set" is itself an observation rather than a guarantee, and three
 * named variables are cheaper to defend than an empty environment that fails
 * somewhere else. Anything not listed is absent on purpose.
 */
export const CHILD_ENV: Readonly<Record<string, string>> = {
  /**
   * Fixed, not inherited. Every spawn in `src/shared/` names an absolute
   * binary (`/usr/bin/zip`, `/usr/bin/unzip`, `process.execPath`), so this
   * resolves nothing — but a tool that did shell out would otherwise pick up
   * whatever shim sits early on a developer's `PATH`, and the test would be
   * measuring that instead.
   */
  PATH: '/usr/bin:/bin',
  /**
   * `zip` writes its temporary archive in the output directory by default, so
   * this is unused in practice. It is the one variable whose *absence* could
   * plausibly fail on a machine that is not this one — a runner with a
   * read-only or tiny default — so it is set rather than left to a default
   * nobody has checked. Taken from `os.tmpdir()` rather than hard-coded to
   * `/tmp`, which is not where every platform puts it.
   */
  TMPDIR: tmpdir(),
  /**
   * Pinned for the reason a shell pipeline gets it: it makes any
   * locale-sensitive behaviour — collation, case folding, character
   * classification — the same everywhere, instead of the same wherever anyone
   * happened to look. Measured not to change any output we consume today (see
   * above); set so that it cannot start to.
   */
  LC_ALL: 'C',
}
