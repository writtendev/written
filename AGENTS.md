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
```

## Workflow

`lerp.toml` is this repo's pipeline: Linear team `WRTN`, lanes provisioned
as detached git worktrees. Read it before changing how runs are queued or
what a stage is expected to produce.

Build and test commands: `go build ./...` and `go test ./...`.
