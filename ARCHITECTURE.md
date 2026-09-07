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
A shared TypeScript component package (`@writtendev/ui`), npm workspace. Typechecked but not built: `web` resolves it directly from `src/` through npm workspace linking, so there is no compiled `dist/`. `ui/src/` is what ships and what a consumer's Tailwind `@source` points at; `ui/dev/` is a local dev harness for previewing `ui/src/` in isolation and ships to nobody; `ui/scripts/` holds gate scripts for `make check-ts` and ships to nobody either. `ui`'s `build:harness` script (`tsc -b && vite build`) runs as part of `make check-ts` to exercise the harness build, including its `@source '../src'` Tailwind wiring — that is a check, not a release artifact, so `ui`'s `buildless: true` keeps it out of `make build-ts`'s release path. It catches anything that breaks that build outright, but not a typo'd `@source` path on its own: Tailwind resolves an unmatched `@source` glob to zero classes rather than an error, so that specific mistake has no gate yet (see `AGENTS.md`'s `## Dispatch` section).

**Export surface and versioning (WRTN-37).** `ui/package.json` declares an explicit `exports` map — a root entry (`.` → `./src/index.ts`) for everything importable as a module, plus a named subpath (`./tokens.css`) for the one thing the root physically cannot serve, since CSS cannot be re-exported from a `.ts` barrel. No wildcard keys: a wildcard map can't be enumerated, so it can't be gated, and it would silently reopen every file under `src/` as a public import path. `ui/scripts/check-exports.mjs` runs as a `make check-ts` step and resolves every mapped specifier through Node's real resolver, asserting each target exists and lands inside `files`. It does not assert the reverse — that a path the map doesn't advertise stays blocked. That blocking is Node's own `exports` enforcement (a plain `@writtendev/ui/src/tokens.css` import fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` because `exports` is declared at all, not because this script checked it); the gate only tests the map's positive claims. The package carries a real starting version (SemVer, `0.1.0`) and is versioned independently of publishing: `private: true` stays, there is still no registry and no release workflow, but the two consumers — this repo's `web/` on a Go binary's release cadence, and a second consumer outside this repo on its own — can now diverge on which revision of this package they're built against, which is what a version number is for. See `ui/README.md` for the full export table, the `@source`-plus-`@import` consumption pattern, and the version-bump discipline.

**Specimen page (WRTN-38).** `ui/dev/Specimen.tsx` is the dev harness's only page: the living style guide for `ui/src/tokens.css`, and the reason there is no Storybook while the package has no external consumers. It renders every declared token — color swatches, the three type families, the seven-step type ramp, the spacing scale, the radii — with token *names* read from a `?raw` import of `tokens.css` (parsed by `ui/dev/tokens.ts`, the one place that regex lives) and every *value* read from the live cascade, never copied: `var(--name)` for rendering, `getComputedStyle` for the printed label. Changing a value in `tokens.css`, or adding a token, changes the page with no other edit. `ui/scripts/check-tokens.mjs` backstops this at build time: after `build:harness` produces `ui/dist`, it cross-checks `tokens.css` against that built stylesheet in both directions — every declared name must be emitted, and every name emitted in a `--color-*`/`--text-*`/`--radius-*` reset namespace must trace back to a declaration the shared parser found — using no hardcoded token list of its own. This does not close the typo'd-`@source` gap noted above: that gap is a filesystem glob silently resolving to zero classes, a different mechanism from `@theme static`'s emission into `:root, :host`, which is what this gate checks instead.

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
- **Rationale:** Both clients consume the exact same underlying engine abstractions and discovery logic, with one asymmetry — signing an approval always requires a human act at the key, regardless of which client requested it (see `VISION.md`'s local-signing statement). The TUI serves as the primary reference client; the web server (`written web`) provides a lightweight browser interface without duplicating backend plumbing.

### 5. TypeScript workspace split (`ui`, `web`)
- **Decision:** `written web` needs a browser client, and a Go binary is not where that gets built. `ui/` and `web/` are npm workspaces declared in the root `package.json`: `web/` is the Vite application shell that becomes the static bundle `written web` embeds and serves; `ui/` is the shared component package `web/` imports. They are a second, independently-testable language living in this repo, not a second copy of it — see decision 4 and `AGENTS.md`'s `## Dispatch` invariant that Go and TypeScript must each test without the other's toolchain on `PATH`.
- **Why two packages instead of one:** Splitting components (`ui/`) from the application shell (`web/`) keeps the component surface reviewable and typecheckable on its own, and gives it room to be reused by more than one client later without that reuse forcing a refactor. `web/` depends on `ui/` through npm workspace linking (resolved to `ui/src` directly, no publish step); `ui/` has no Go equivalent and no reach into `internal/` — the split exists entirely on the TypeScript side.
- **Rationale for a compiled JS toolchain instead of a Go-native UI:** `written web`'s surface is a browser page, and browsers run JavaScript. Vite is the boring, standard choice for compiling and bundling that page into the static assets the Go binary embeds at build time; nothing about it changes decision 4 — `written` still ships as one binary with no runtime Node process.
