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
/ui               — Shared TypeScript component package, consumed by /web (npm workspace)
/web              — Embedded Vite client for `written web` (npm workspace)
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

#### `/ui`
A shared TypeScript component package (`@writtendev/ui`), npm workspace. Typechecked but not built or published: `web` resolves it directly from `src/` through npm workspace linking, so there is no compiled `dist/` and no version to publish. Contents land in `WRTN-42`; this ticket only establishes the workspace shape.

#### `/web`
The embedded browser client for `written web` (`@writtendev/web`), npm workspace, built with Vite. `vite build` produces a static bundle at compile time that the Go binary embeds; see decision 5 below and `## Dispatch`'s "one binary, no runtime Node" invariant in `AGENTS.md`.

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

### 5. TypeScript workspace split (`ui`, `web`)
- **Decision:** `written web` needs a browser client, and a Go binary is not where that gets built. `ui/` and `web/` are npm workspaces declared in the root `package.json`: `web/` is the Vite application shell that becomes the static bundle `written web` embeds and serves; `ui/` is the shared component package `web/` imports. They are a second, independently-testable language living in this repo, not a second copy of it — see decision 4 and `AGENTS.md`'s `## Dispatch` invariant that Go and TypeScript must each test without the other's toolchain on `PATH`.
- **Why two packages instead of one:** Splitting components (`ui/`) from the application shell (`web/`) keeps the component surface reviewable and typecheckable on its own, and gives it room to be reused by more than one client later without that reuse forcing a refactor. `web/` depends on `ui/` through npm workspace linking (resolved to `ui/src` directly, no publish step); `ui/` has no Go equivalent and no reach into `internal/` — the split exists entirely on the TypeScript side.
- **Rationale for a compiled JS toolchain instead of a Go-native UI:** `written web`'s surface is a browser page, and browsers run JavaScript. Vite is the boring, standard choice for compiling and bundling that page into the static assets the Go binary embeds at build time; nothing about it changes decision 4 — `written` still ships as one binary with no runtime Node process.
