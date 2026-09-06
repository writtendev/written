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
/ui               — shared TypeScript component package (npm workspace; contents land in WRTN-42)
/web              — embedded Vite client for `written web` (npm workspace; UI lands later)
```

`ui/` and `web/` are npm workspaces declared in the root `package.json`, so
`web` resolves `ui` locally with no publish step. They are a second,
independently-testable language in this repo, not a second copy of it: see
`## Dispatch` below for the invariant that keeps the two from needing each
other to be tested.

## Workflow

Build and test commands: `make build` and `make test` (Go); `make check` is
the one command that covers both languages for local development. CI runs
the same Makefile targets, split across path-filtered jobs, rather than
enumerating its own list — see `## Dispatch` below for exactly which target
each job runs.

This repo's pipeline is the four-skill dispatch flow (`dispatch`,
`implement-ticket`, `adversarial-review`, `merge-queue`) shipped by the
`studio` plugin from the `writtendev` marketplace, declared in
`.claude/settings.local.json`. That file is local — created by
`bin/wire-repo` in the `studio` repo, not tracked here (see `.gitignore`) —
so a fresh clone runs `bin/wire-repo` to get it before dispatch will work.
`lerp.toml` is retired; there is no per-repo
pipeline config file to read before changing how runs are queued — that
policy lives in the skills themselves (see `studio`'s own repo) and the
`## Dispatch` section below is this repo's opt-in and configuration for it.

## Dispatch

The per-repo configuration the `dispatch`, `implement-ticket`,
`adversarial-review` and `merge-queue` skills read. Those skills are
maintained once in the parent studio repo and are repo-generic; this section
is how this repo opts into them. A field left unfilled is not a default —
the skills are required to stop and say which one is missing rather than
guess.

- **Linear team key**: `WRTN` (ticket ids are `WRTN-<n>`).
- **Check command**: `make check` — runs the Go suite (`test`, `race`,
  `lint`) and the TypeScript gate (`ui`, `web` typecheck) and must pass
  locally before any push, by an implementer, a fixer, or a human. CI runs
  the same Makefile targets rather than enumerating its own list: the
  path-filtered `go` job runs `make check-go`, the path-filtered `ts` job
  runs `make check-ts`, and the always-on `build` job runs `make build` and
  `make build-ts` (see `.github/workflows/ci.yml`). Every command a CI job
  runs exists as a Makefile target, so the local gate and CI cannot drift —
  a job that started enumerating its own steps in YAML instead would be a
  violation of the pipeline-integrity invariant below.
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

- **The self-hosted web server has no write authority.** Every HTTP route
  `written web` exposes is read-only, or at most hands back a command for
  the user to run themselves (git remains the only way state changes). A
  route that accepts a mutation — a comment, a merge, a ref update, a
  config write — reachable over HTTP is a finding regardless of auth.
- **Signing is local, never server-side.** No code path lets the web
  server hold, load, derive, or make a network call to reach a signing
  key. A signing key or credential anywhere in `internal/app`'s HTTP
  wiring, or in `web/`, is a finding even if it is never exercised.
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
- **The check gate can fail, and CI runs nothing it doesn't.** Every
  command a CI job invokes must resolve to a Makefile target — a job that
  enumerates its own build/lint/test steps directly in YAML with no
  Makefile counterpart is a finding, because it lets CI's coverage exceed
  `make check` (or its declared siblings) silently, which is the local
  gate and CI drifting apart. A flag or script that can report success by
  skipping work it was supposed to do — an unguarded `--if-present`, a
  target that no-ops when a tool or workspace is missing instead of
  failing — is equally a finding: a gate that cannot fail is not a gate.
  Prove either one the way a reviewer would: break the thing the gate is
  supposed to catch and confirm the command actually exits non-zero.
