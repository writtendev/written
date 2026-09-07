# Agent brief

Written is the reference terminal UI client (and later web interface) for
Writ (`github.com/writtendev/writ`). It provides a fast, keyboard-driven
interface for code reviews, discussions, issues, and workspace navigation,
powered by Writ's decentralized, git-native engine. Written in Go, Apache-2.0.

Before proposing or implementing anything, read `VISION.md` (what this is
for, what it is deliberately not, and the order the work goes in) and
`ARCHITECTURE.md` (the technical record: settled decisions and the reasoning
behind them). Those two are the fence around this project. When a proposal
conflicts with them, the proposal loses or the document is amended
deliberately — never by drift.

## This file

AGENTS.md is the only agent brief here. CLAUDE.md and GEMINI.md are
one-line `@AGENTS.md` imports, so every toolchain reads the same text and
there is nothing to keep in sync. Edit AGENTS.md; leave the two stubs alone.
Same pattern as the rest of the studio.

## House rules

- Boring, small, direct. Prefer the standard library and Charm libraries
  (`bubbletea`, `lipgloss`, `bubbles`) for terminal UI. New dependencies
  need a reason.
- Public-API-only constraint: Written consumes Writ's public Go engine
  API (`github.com/writtendev/writ/engine`) with zero private powers and no
  reach into engine internals. Written is an ordinary client.
- `internal/` throughout: Written exposes no public Go API. It is an
  application and client, not a library. If something here looks reusable
  across other tools, that is a signal it belongs in Writ's engine instead.
- Treat scope growth, speculative abstraction, and framework-building
  as bugs.
- Match the style of surrounding code.
- Responsive and local-first: All UI operations should be immediate.
  Events from Writ's engine stream (`store.Watch`) drive reactive updates
  in the Bubble Tea event loop; no screen should rely on manual refresh.
- When you file a Linear ticket, set a priority and an estimate — your
  best judgment, stated once, not discussed.

## Layout

Planned repository layout (see `ARCHITECTURE.md` for the rationale):

```
/cmd/written      — the binary: TUI by default, `written web` later
/internal/ui      — bubbletea models, widgets, theme
/internal/app     — engine wiring, config, discovery
/docs
/ui               — shared TypeScript component package (npm workspace)
/web              — embedded Vite client for `written web` (npm workspace; UI lands later)
```

`ui/` and `web/` are npm workspaces declared in the root `package.json`, so
`web` resolves `ui` locally with no publish step. They are a second,
independently-testable language in this repo, not a second copy of it: see
`## Dispatch` below for the invariant that keeps the two from needing each
other to be tested.

`ui/` itself splits into `ui/src` — what ships, and the only directory a
consumer's Tailwind `@source` points at — and `ui/dev`, a local dev harness
for previewing `ui/src` in isolation that ships to nobody. Vite's `root`
points at `ui/dev`, which confines Tailwind's automatic source detection
there too, so `ui/dev/index.css` adds `@source '../src'` explicitly to pull
`ui/src` into the harness's own build. See `ui/README.md`.

## Workflow

Build and test commands: `make build` and `make test` (Go); `make check` is
the one command that covers both languages for local development. CI runs
the same Makefile targets, split across path-filtered jobs, rather than
enumerating its own list — see `## Dispatch` below for exactly which target
each job runs.

This repo's pipeline is the four-skill dispatch flow (`dispatch`,
`implement-ticket`, `adversarial-review`, `merge-queue`) shipped by the
`studio` plugin from the `writtendev` marketplace, declared in
`.claude/settings.local.json`. That file is internal dispatch-pipeline
configuration — local, not tracked here (see `.gitignore`), and generated
by tooling that is not public. It is not needed to build, test, or
contribute to `written`; a fresh clone builds, tests, and passes `make
check` without it, and it only matters if you're running the dispatch
pipeline itself. `lerp.toml` is retired; there is no per-repo pipeline
config file to read before changing how runs are queued — that policy
lives in the dispatch skills themselves, maintained once outside this
repo and repo-generic — and the `## Dispatch` section below is this
repo's opt-in and configuration for it.

## Dispatch

The per-repo configuration the `dispatch`, `implement-ticket`,
`adversarial-review` and `merge-queue` skills read. Those skills are
maintained once, outside this repo, and are repo-generic; this section
is how this repo opts into them. A field left unfilled is not a default —
the skills are required to stop and say which one is missing rather than
guess.

- **Linear team key**: `WRTN` (ticket ids are `WRTN-<n>`).
- **Check command**: `make check` — runs the Go suite (`test`, `race`,
  `lint`) and the TypeScript gate. `check-ts` first guards that
  `node_modules` is actually installed (naming `npm ci` if not, rather than
  failing deep inside some other tool), then runs a lockfile-sync check
  equivalent to `npm ci`, typecheck across `ui`/`web`, `eslint . --max-warnings
  0` and `prettier --check` at the repo root (covering `ui/` and `web/`),
  and — via `check-ts`'s dependency on `build-ts` — the `vite build` that
  produces `web`'s embedded bundle. `ui` is `buildless: true` (see
  `## Layout`), so `build-ts` does not touch it; `check-ts` instead runs
  `ui`'s own dev-harness build as a separate, explicit step (`build:harness`)
  after `build-ts` completes — deleting that line would drop the only build
  coverage `ui/dev` has, not leave it covered by `build-ts`. That coverage
  has a known gap: `build:harness` runs the harness's Tailwind
  `@source '../src'` wiring through a real `tsc`+`vite` build, so it fails
  on anything that breaks the build, but Tailwind resolves an unmatched
  `@source` glob to zero classes rather than an error — a typo'd path still
  builds clean, so that specific mistake has no gate yet. All of this must
  pass locally before any push, by an implementer, a fixer, or a human. CI
  runs the same Makefile
  targets rather than enumerating its own list: the path-filtered `go` job
  runs `make check-go`, the path-filtered `ts` job runs `make check-ts`
  (which already covers `build-ts`), and the always-on `build` job runs
  `make build` and `make build-ts` again — redundant with `check-ts` when a
  change touches `ui`/`web`, but the only place that still exercises
  `build-ts` when a change is Go-only and the `ts` job is path-filtered out
  (see `.github/workflows/ci.yml`). The property this guarantees is
  narrower than "every command a CI job runs is a Makefile target" and more
  useful: **a tree that passes `make check` locally will pass CI.** Two
  things in `ci.yml` sit outside a Makefile target on purpose, and neither
  can produce the drift this guarantees against — see the pipeline-integrity
  invariant below for why.
- **Base branch**: `main`.
- **Worktrees**: `.claude/worktrees/` — one worktree per ticket, named for it.
- **Run manifest**: `.claude/worktrees/dispatch-manifest.md`.

Statuses are Linear's stock ones — `Todo` → `In Progress` → `In Review` →
`Done` — with two workspace labels doing the rest: `approved-to-merge` on a
ticket in `In Review` means a human has approved its merge and it is in the
merge queue; `needs-attention` means it needs a human and keeps whatever
status it already had. `Backlog` is off-limits to dispatch: promoting a
ticket to `Todo` is the only signal that it is available to work.

### Review invariants

What a reviewer of a change to this repo is adversarial about. A diff that
breaks one of these is a major finding, not a nit.

- **`written web` binds to localhost only.** It is a local surface for
  the person at the machine, not a hosted service (see `VISION.md`'s
  local-only web surface statement). Binding to any interface other than
  localhost, or making the bind address configurable to one, is a
  finding.
- **The web server never holds unattended signing authority.** It may
  create, edit, and read any op the engine supports — ordinary mutations
  reachable over HTTP are the intended design, not a violation — but no
  code path may let it produce a valid approval without a human acting at
  the key for that specific approval — the confirmation itself must be
  issued by whatever holds the key, and unforgeable by the server process,
  so a "Confirm approval" dialog the server renders and honors on its own
  does not qualify no matter what it displays (see `VISION.md`'s
  local-signing statement). The approve path hands the operator the
  command to run in their own terminal — `written approve <id>` — rather
  than signing for them; routing through a confirming agent
  (`ssh-agent -c`, a hardware key touch) is equally fine, since that still
  stops on the human's presence at the key. An approval that completes
  entirely inside the server process, with no human act at the key in the
  moment, is a finding,
  however convenient.
- **One binary, no runtime Node.** The web client is a static bundle
  produced by `vite build` at compile time and embedded into the Go
  binary; `written` never shells out to `node`, `npm`, or a bundler after
  it is built. Any runtime dependency on a Node process, or a "run the
  build step on first request" shortcut, is a finding.
- **written consumes writ's public API only.** Per `## House rules`
  above, all engine access goes through `github.com/writtendev/writ/engine`
  with zero reach into writ internals. Importing a writ-internal package,
  reading its SQLite projection file directly, or touching git plumbing
  outside the engine's public contracts is a finding.
- **Go and TypeScript stay independently testable.** `make check-go` must
  pass without `node`/`npm` on `PATH`, and `make check-ts` must pass
  without the Go toolchain; only the release build (`make build` plus the
  TypeScript build) is allowed to need both. A change that makes either
  half's tests quietly depend on the other is a finding — it is also what
  would make the CI path filters lie about what they're skipping.
- **Public repo, public history.** No secrets, tokens, or credentials in
  any commit, and no mention of private repos, unreleased commercial
  plans, or internal strategy documents in code, comments, commit
  messages, or tickets referenced from them. Anything like this is a
  finding regardless of how small.
- **The check gate can fail, and a tree that passes it passes CI.** Every
  command a CI job runs to build, lint, test, or typecheck must resolve to
  a Makefile target — a job that enumerates its own such steps directly in
  YAML with no Makefile counterpart is a finding, because it lets CI's
  coverage exceed `make check` (or its declared siblings) silently, which
  is the local gate and CI drifting apart. Two kinds of step are exempt,
  because neither can cause that drift: toolchain provisioning (installing
  `golangci-lint`, `node`, or `npm` itself — a missing or wrong-version
  toolchain fails the very next step obviously, it doesn't pass quietly)
  and the `ci` fan-in job's own pass/fail aggregation script (it only reads
  other jobs' results; it has no coverage of its own to diverge from
  `make check`). `npm ci` is not exempt on this basis — its lockfile-sync
  check is a real gate a tree can fail, so `check-ts` runs the equivalent
  check (`npm ci --dry-run`) itself. A flag or script that can report
  success by skipping work it was supposed to do — an unguarded
  `--if-present`, a target that no-ops when a tool or workspace is missing
  instead of failing — is equally a finding: a gate that cannot fail is not
  a gate. Prove either one the way a reviewer would: break the thing the
  gate is supposed to catch and confirm the command actually exits
  non-zero.

The following six, scoped to `ui/`, come from `written-ui`'s own `AGENTS.md`
and moved here verbatim with it in `WRTN-42`:

- **`ui/` ships as source, not as a compiled library.** Each consumer's
  Tailwind build scans it as its own code. Anything that assumes a build
  step here — a bundler artifact, a precompiled stylesheet, an entry point
  that only works post-build — breaks that and is a finding.
- **No dynamically constructed class names.** Every class name is a
  literal string. Template interpolation, string concatenation, or a
  lookup that assembles a class at runtime is invisible to Tailwind's
  scanner, so the styles simply will not exist in the consumer's build. A
  map from variant to a whole literal class string is fine; a map that
  builds one from fragments is not.
- **All theming goes through CSS custom properties.** Components never
  reference raw values — no hex codes, no pixel literals, no named colors
  inline in a component.
- **`tokens.css` is the single source of design values, and lives in
  `ui/src/`.** A component that needs a value it doesn't have adds a token
  there; it does not inline one locally. An inlined value is a finding even
  when it looks identical to an existing token.
- **No caller-situation flags on components.** No `isPaid`, `isAdmin`,
  `isLoggedIn`, or any other prop that encodes the caller's circumstances.
  Variation comes from composition, children, and render props. A
  component that has to know who is looking at it has the wrong shape.
- **No component beyond `Button`, `Badge`, and one text/heading primitive
  without an explicit decision.** A PR that adds a fourth component
  without a ticket that says to is a finding, however reasonable the
  component is on its own.
