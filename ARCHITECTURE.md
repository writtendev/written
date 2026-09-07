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
A shared TypeScript component package (`@writtendev/ui`), npm workspace. Typechecked but not built: `web` resolves it directly from `src/` through npm workspace linking, so there is no compiled `dist/`. As of WRTN-44, the package is also published to npm as source: a `ui/vX.Y.Z` tag ships the `src/` tree verbatim into a versioned tarball — still no compiled `dist/`, npm is the transport, not a build step. `ui/src/` is what ships and what a consumer's Tailwind `@source` points at; `ui/dev/` is a local dev harness for previewing `ui/src/` in isolation and ships to nobody; `ui/scripts/` ships to nobody either, though as of WRTN-44 it no longer holds only `make check-ts` gate scripts — `check-release-tag.mjs` is a release-time gate that `make check-ui-release` runs instead, deliberately kept out of `check-ts` (see the Publishing paragraph below). `ui`'s `build:harness` script (`tsc -b && vite build`) runs as part of `make check-ts` to exercise the harness build, including its `@source '../src'` Tailwind wiring — that is a check, not a release artifact, so `ui`'s `buildless: true` keeps it out of `make build-ts`'s release path. It catches anything that breaks that build outright, but not a typo'd `@source` path on its own: Tailwind resolves an unmatched `@source` glob to zero classes rather than an error, so that specific mistake has no gate yet (see `AGENTS.md`'s `## Dispatch` section).

**Export surface and versioning (WRTN-37).** `ui/package.json` declares an explicit `exports` map — a root entry (`.` → `./src/index.ts`) for everything importable as a module, plus a named subpath (`./tokens.css`) for the one thing the root physically cannot serve, since CSS cannot be re-exported from a `.ts` barrel. No wildcard keys: a wildcard map can't be enumerated, so it can't be gated, and it would silently reopen every file under `src/` as a public import path. `ui/scripts/check-exports.mjs` runs as a `make check-ts` step and resolves every mapped specifier through Node's real resolver, asserting each target exists and lands inside `files`. It does not assert the reverse — that a path the map doesn't advertise stays blocked. That blocking is Node's own `exports` enforcement (a plain `@writtendev/ui/src/tokens.css` import fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` because `exports` is declared at all, not because this script checked it); the gate only tests the map's positive claims. The package carries a real starting version (SemVer, `0.1.0`) and is versioned independently of publishing: the two consumers — this repo's `web/` on a Go binary's release cadence, and a second consumer outside this repo on its own — can diverge on which revision of this package they're built against, which is what a version number is for. See `ui/README.md` for the full export table, the `@source`-plus-`@import` consumption pattern, and the version-bump discipline.

**Publishing (WRTN-44).** `@writtendev/ui` publishes to npm as a versioned source package, on a `ui/vX.Y.Z` tag push. This is a distribution convenience, not a product commitment: the code is already public (this repo is Apache-2.0 on a public remote), so the registry only exists so a second repo can name a version and get the files — it is not a bid for external adopters and carries no support promise. Consequently there is still no build step and no `dist`: the published tarball is `ui/src/` verbatim, `files: ["src"]` plus a root `LICENSE` (npm packs a root `LICENSE` regardless of `files`), exactly as a consumer already gets it via workspace linking today. `.github/workflows/release-ui.yml` runs on the tag push, gates on `make check-ui-release` (the full `check-ts` suite plus a tag-matches-manifest-and-lockfile check), and publishes with npm provenance on (`publishConfig.provenance: true`), so a published tarball is traceable back to the exact commit it was built from. The workflow also runs a `git merge-base --is-ancestor` check before installing anything, intended to stop a tag pushed from a commit never merged to `main`. That check is advisory, not a security control: GitHub evaluates the workflow definition *from the tagged commit itself*, so a commit that deletes or edits the check runs without it — it only catches an accidental stray tag, not a deliberate one. The actual control is out-of-tree repository configuration this PR does not and cannot add: a GitHub tag ruleset restricting who can create `refs/tags/ui/v*`, and/or a protected Environment gating this job's access to `NPM_TOKEN` with required reviewers. Neither exists yet — **this is an outstanding human step**, not something the in-workflow guard substitutes for. Minting the publish token and owning the `@writtendev` npm scope are human-only steps, but once the token is stored as the `NPM_TOKEN` repository secret, it is held by the repository, not by any one person: every collaborator with push (tag-create) rights can cause a publish without holding an npm credential of their own, so push rights are the effective gate on who can release until the ruleset/Environment above is in place. **Follow-up: trusted publishing (OIDC).** The better end state is no long-lived npm token at all, via npm's OIDC trusted publishing. Not done here because it needs npm CLI ≥ 11.5.1, which would mean an `npm install -g npm@latest` step diverging from the `.nvmrc` Node 22.18 pin, plus one-time configuration on npmjs.com. Worth revisiting once the pin moves or the tradeoff is reconsidered.

**Specimen page (WRTN-38).** `ui/dev/Specimen.tsx` is the dev harness's only page: the living style guide for `ui/src/tokens.css`, and the reason there is no Storybook while the package has no external consumers. It renders every declared token — color swatches, the three type families, the seven-step type ramp, the spacing scale, the radii — with token *names* read from a `?raw` import of `tokens.css` (parsed by `ui/dev/tokens.ts`, the one place that regex lives) and every *value* read from the live cascade, never copied: `var(--name)` for rendering, `getComputedStyle` for the printed label. Changing a value in `tokens.css`, or adding a token, changes the page with no other edit. `ui/scripts/check-tokens.mjs` backstops this at build time. Independent of any build, it scans `tokens.css`'s own comment-stripped source with a loose, namespace-agnostic pattern and requires that to agree exactly with what the shared parser found, catching a token declared in a shape the parser can't match, in any namespace. Then, after `build:harness` produces `ui/dist`, it cross-checks `tokens.css` against that built stylesheet in both directions — every declared name must be emitted, and every name emitted in a `--color-*`/`--text-*`/`--radius-*` reset namespace must trace back to a declaration the shared parser found, which is what catches a design value reaching the built stylesheet from outside `tokens.css` entirely (the namespace-reset check and the source/parser self-consistency check cover different directions; neither subsumes the other) — using no hardcoded token list of its own. This does not close the typo'd-`@source` gap noted above: that gap is a filesystem glob silently resolving to zero classes, a different mechanism from `@theme static`'s emission into `:root, :host`, which is what this gate checks instead.

**First components (WRTN-39).** `Button`, `Badge`, and one text/heading primitive (`Text`) are native elements plus literal variant-class maps — no Radix (none of the three has behaviour or ARIA wiring worth not writing), and no `cva`/`clsx`/`tailwind-merge` (a `keyof typeof variantClasses` union gives the same variant type safety with no dependency, and a local three-line `cn` join helper is enough at three components with two axes each). See `ui/README.md`'s `## Components` section for the full reasoning and the `eslint.config.js` gate that keeps every class name a literal string.

#### `/web`
The embedded browser client for `written web` (`@writtendev/web`), npm workspace, built with Vite. `vite build` produces a static bundle at compile time that the Go binary embeds; see decision 5 below and `## Dispatch`'s "one binary, no runtime Node" invariant in `AGENTS.md`.

## Settled technical decisions

### 1. UI Framework: Bubble Tea & Lipgloss, and the wider Charm survey
- **Decision:** Use `bubbletea`, `lipgloss`, and `bubbles`, on the v2 line.
- **Rationale:** The Elm architecture in Bubble Tea provides deterministic state transitions, clear message dispatching, excellent terminal compatibility, and great testability.

**Bubble Tea version line: v2.** The v2 line is a shipped stable release
(10 published `v2.0.x` releases, not a beta — the proxy lists 20 versions
total, but 10 of those are pre-release `-alpha`/`-beta`/`-rc` tags), and
lipgloss/v2 and bubbles/v2 already require it, so the choice is really "v1
or v2 for everything, made once."
Migrating the Elm-architecture runtime later, after screens are built
against it, is the expensive direction to move; starting on v2 avoids that
migration entirely. WRTN-9 (Bubble Tea app skeleton) is the first ticket
that actually imports it.

**Module-path note.** Charm's v2 line has migrated its canonical module
path to `charm.land/*`. `github.com/charmbracelet/bubbletea/v2` still
resolves on the proxy, but the module's own `go.mod` declares `module
charm.land/bubbletea/v2`, so `charm.land/...` is the path to import. The
migration is partial, not universal: `fang`, `harmonica`, and `x/ansi`
still declare `github.com/charmbracelet/...` as their module path even
though `charm.land/fang` etc. also resolve on the proxy — importing those
three under a `charm.land` path would be a module-path mismatch, not an
equivalent alias.

**The full survey and verdict.** Evaluated against the house rule that new
dependencies need a reason and that scope growth and framework-building
are bugs, at Crush-level polish as the bar. Versions were resolved against
the live module proxy (`go list -m -versions <path>`) and each declared
module path confirmed against the module's own `go.mod`
(`go mod download -json <path>@<version>`, then `grep '^module '` in the
resulting `Dir`) on 2026-09-07, at implementation time — not copied
forward from an earlier planning pass.

| Library | Verdict | Path and version | Reason |
| -- | -- | -- | -- |
| bubbletea | adopt, **v2** | `charm.land/bubbletea/v2` v2.0.9 | The runtime; non-negotiable. v2 is a shipped stable line, not a beta, and migrating off v1 later is the expensive move, so start on v2. |
| lipgloss | adopt, **v2** | `charm.land/lipgloss/v2` v2.0.6 | Styling and layout; also what `bubbles/v2` itself requires, so the v2 line is forced by the bubbletea choice regardless. |
| bubbles | adopt, **v2** | `charm.land/bubbles/v2` v2.2.1 | Stock `viewport`/`textarea`/`textinput`/`list`/`table`/`spinner`/`key`/`help`/`paginator`. WRTN-7 (widget inventory) decides which are used stock vs. wrapped. |
| glamour | adopt, **v2** | `charm.land/glamour/v2` v2.0.1 | Review descriptions, issue bodies, and comments are all markdown; hand-rolling a renderer is exactly the framework-building the house rules forbid. Cost to record: it declares `go 1.25.8`, so the repo's `go` directive rises to at least that the moment it enters `go.mod`. |
| chroma | adopt | `github.com/alecthomas/chroma/v2` v2.27.0 | Syntax highlighting in the diff viewer. glamour/v2 already pulls it transitively (at v2.14.0, confirmed in glamour's own `go.mod`), so adopting it directly is a promotion to direct dependency, not a new tree. |
| huh | defer | `charm.land/huh/v2` v2.0.3 | It owns focus and key handling, and Written has its own focus model and keybinding grammar coming in WRTN-2/WRTN-5. Deferred to whichever ticket builds the review-open flow, rather than adopted speculatively now. |
| harmonica | reject (for now) | `github.com/charmbracelet/harmonica` v0.2.0 | Motion is not load-bearing anywhere in the current screen map, and this is a two-release, long-quiet module. Revisit only when a specific transition needs it. |
| x/ansi | defer as a direct dependency | `github.com/charmbracelet/x/ansi` v0.11.8 | Already in the tree transitively via bubbletea/lipgloss, so it costs nothing today. Promote to a direct import the first time width is measured ourselves (an emoji or CJK comment), rather than pre-adopting. |
| fang | reject | `github.com/charmbracelet/fang` v1.0.0 | `cmd/written/main.go` registers five flags (`-C`, `-version`, `-v`, `-help`, `-h`, covering three distinct settings) on stdlib `flag` and that works; fang pulls `spf13/cobra` plus `muesli/mango-cobra` for CLI framing Written does not need. Same call writ made. |

**`go.mod` is not touched by this decision.** Nothing in the tree imports
any of the adopted libraries yet, so running `go get` for all five now
would land them marked `// indirect` (nothing imports them) alongside
roughly two dozen further transitive `// indirect` lines — the opposite of
"reflects the adopted set and nothing else" — and the very next `go mod
tidy` would delete the entire `require` block again, shrinking `go.mod`
back to three lines. What it would not undo is the `go` directive: `go
get` raises it from `1.25.0` to `1.25.8` on account of glamour/v2's own
floor, and `go mod tidy` never lowers a `go` directive once raised
(reproduced end to end in a scratch module — `tidy` strips the `require`
block but leaves `go 1.25.8` behind). The one cost of a premature `go get`
that actually persists is exactly the one `tidy` cannot clean up, against
a `README.md` that promises "Go 1.25+" — a better argument for deferring
than a clean revert would have been. So this table, not `go.mod`, is the
durable record of the decision: each
library enters `go.mod` at first import, pinned at the version recorded
here — bubbletea, lipgloss, and bubbles in WRTN-9; glamour and chroma when
the markdown renderer and diff viewer land.

**The build-ourselves list.** What nothing in the Charm ecosystem or
adjacent terminal libraries covers, so Written builds it directly. This
list is the input to WRTN-7 (widget inventory):

- **The diff viewer** — unified and/or split, syntax highlighted, gutter
  room for thread markers, expandable context. Already known to be on
  this list; nothing in the ecosystem does diff-with-inline-threads.
- **Inline comment threads rendered inside the diff** — rows between diff
  lines that expand, collapse, and stay anchored as the viewport scrolls.
- **The comment composer** — a `textarea` that knows about drafts,
  markdown preview, and submit-versus-cancel.
- **Command palette with fuzzy matching** — left unresolved rather than
  pre-decided, since nothing stock may be close enough; WRTN-7 owns that
  call.

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
