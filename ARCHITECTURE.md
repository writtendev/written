# Written — Architecture & Technical Decisions

This document records the architectural structure, component boundaries,
and settled technical decisions for Written.

## The fence: consumer-only architecture

Written is an application and reference client, not a library or SDK.

1. **`internal/` throughout:** All application code outside of `cmd/written`
   lives strictly in `internal/`. Written exports no Go API for external
   consumers.
2. **Public engine API only:** Written interacts with Writ exclusively
   through `github.com/writtendev/writ/engine`. It has no private backdoors,
   does not touch SQLite projection files directly, and does not alter
   git objects or refspecs outside of the public engine contracts.
3. **Upstream reusability rule:** If a data structure, query helper, or
   engine utility seems broadly useful across multiple tools, it belongs
   upstream in `writ/engine`, not duplicated in Written.

## Repository layout

```
/cmd/written      — Application entrypoint: TUI runner, subcommands (`written web`), CLI flags
/internal/app     — Repository discovery, engine initialization, configuration, event streaming
/internal/ui      — Bubble Tea root models, view routers, UI widgets, keymaps, Lipgloss themes
/docs             — Design specs, navigation maps, user guides, and architecture documentation
```

### Component breakdown

#### `/cmd/written`
The CLI command entrypoint.
- Parses command-line arguments (e.g., `-C <dir>` for directory switching, `--version`, `--help`).
- Dispatches to subcommands (e.g., default interactive TUI mode vs. `written web` HTTP server).
- Sets up signal handling and graceful terminal cleanup.

#### `/internal/app`
The integration layer between the operating system, git environment, and Writ engine.
- **Discovery:** Resolves repository roots by walking up the directory tree, with full support for normal clones, bare repositories, and detached git worktrees.
- **Engine lifecycle:** Connects to `github.com/writtendev/writ/engine`, initializes read/write sessions, and manages background event streams.
- **Configuration:** Loads local and user preferences (key bindings, default views, theme selection).

#### `/internal/ui`
The terminal user interface built on Charm's Bubble Tea ecosystem.
- **Root Model & Navigation:** Coordinates top-level views (Inbox, Review List, Diff Detail, Issue List) using a structured navigation stack or pane system.
- **Components & Widgets:** Specialized Bubble Tea models for:
  - Diff rendering and syntax highlighting (with unified and split views).
  - Inline comment thread rendering and interactive thread composers.
  - Grouped and filtered issue lists with collapsible sections.
  - Persistent status bars and keybinding hint overlays.
- **Theme & Styles:** Lipgloss definitions for adaptive light/dark terminal color palettes.

#### `/docs`
Project documentation, user quickstarts, ASCII screen wireframes, and UX specifications.

## Settled technical decisions

### 1. UI Framework: Bubble Tea & Lipgloss
- **Decision:** Use `github.com/charmbracelet/bubbletea`, `github.com/charmbracelet/lipgloss`, and `github.com/charmbracelet/bubbles`.
- **Rationale:** The Elm architecture in Bubble Tea provides deterministic state transitions, clear message dispatching, excellent terminal compatibility, and great testability.

### 2. Reactive event integration
- **Decision:** Bridge `store.Watch(ctx) <-chan Event` into Bubble Tea's event loop via asynchronous commands (`tea.Cmd`).
- **Rationale:** The engine publishes events only after projection transactions commit. Forwarding these events into the Bubble Tea loop ensures UI state is always fresh without polling or manual refresh keystrokes.

### 3. Repository and worktree discovery
- **Decision:** Support running `written` from any subdirectory within a repository, automatically locating the git root and worktree configuration.
- **Rationale:** Development workflows (including automated agents and developers working in detached worktrees) launch tools from varying working directories. Written must discover its environment seamlessly.

### 4. Dual client delivery (`written` and `written web`)
- **Decision:** Ship both the reference TUI and the local HTTP server in the same Go binary.
- **Rationale:** Both clients consume the exact same underlying engine abstractions and discovery logic. The TUI serves as the primary reference client; the web server (`written web`) provides a lightweight browser interface without duplicating backend plumbing.
