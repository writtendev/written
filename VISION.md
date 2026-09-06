# Written — Product Vision & Strategy

_Name: "Written" (the natural companion and reference client for Writ)._

## The thesis in one paragraph

Code review and issue tracking should feel as fast, tactile, and seamless
as editing code in your favorite terminal editor. Where modern web review
tools insert network roundtrips, browser tabs, context switching, and
disconnected discussions, **Written** brings the entire SDLC interaction
loop straight into the terminal. Built on top of **Writ**
(`github.com/writtendev/writ`), Written operates directly against the local
git repository, offering instant rendering, inline comment threads in diffs,
grouped issue management, and real-time reactive updates — fully functional
offline and synchronized via standard git remotes.

## The reference client and the public-API constraint

Written is the reference client for Writ. Its mission is to deliver a
best-in-class terminal user interface (TUI) and prove that Writ's engine
is complete, ergonomic, and capable of supporting high-polish applications.

To fulfill this mission credibly, Written enforces a strict architectural
fence:

**Written consumes Writ's public Go engine API with zero private powers.**

- Written has no reach into Writ's internal packages, private structures, or
  undocumented storage conventions.
- Written interacts with SDLC data exclusively through
  `github.com/writtendev/writ/engine` (and the public query / store interfaces).
- Written does not bypass the engine to inspect or manipulate git objects,
  refspecs, or SQLite projection databases directly.
- If a feature in Written requires functionality not currently supported by
  the engine's public API, that functionality must be designed and exposed
  in Writ first.

By holding strictly to the public API, Written guarantees that any third-party
client, editor plugin, or external integration has the exact same capabilities
and performance characteristics as the official reference client.

## What Written is and what it is not

### What Written is

1. **The reference TUI client for Writ.** A keyboard-first terminal application
   built with Go and Charm's Bubble Tea ecosystem (`bubbletea`, `lipgloss`,
   `bubbles`).
2. **An inbox-driven workflow.** A tool that answers "what needs my attention
   now?" — review requests, unread discussion threads, assigned tasks — rather
   than presenting an undifferentiated database.
3. **An inline diff & review workspace.** Rich diff navigation with collapsible
   context, syntax highlighting, and inline comment threads rendered directly
   between diff lines.
4. **Local-first and reactive.** Zero network latency on interactions. Engine
   event streams (`store.Watch`) map directly into the Bubble Tea message loop
   so screens update immediately on background fetches or local mutations.
5. **A future web interface (`written web`).** A lightweight local HTTP server
   exposing the exact same engine capabilities in a browser, sharing the same
   binary and data model.

### What Written is not

1. **Not a Go library or framework.** Written exposes no public Go packages.
   Its packages are strictly `internal/`. If code within Written looks
   reusable, it belongs in Writ's engine or a generic UI component library.
2. **Not a git hosting service or forge.** Written does not manage servers,
   user accounts, or remote hosting; git remotes remain the single sync point.
3. **Not a replacement for git CLI.** Written complements git by focusing on
   the conversational and project layer (reviews, threads, issues, cycles)
   while respecting existing git workflows.
4. **Not a bespoke storage format.** Written stores nothing in proprietary
   files or local config databases; all state resides in git refs managed by
   Writ.

## The web surface is local, and signing stays with the operator

`written web` — the local web interface named above under *What Written
is* — is a local surface for the person at the machine, not a hosted
service: it binds to localhost only, and its bind address is not
configurable — no flag, environment variable, or config file changes what
interface it listens on. Through it, the browser reaches the same engine
the TUI does — opening an issue, commenting, editing, changing status are
signed, append-only entries attributed to whoever performed them, and the
web server writes them exactly as the TUI would.

Approving is where this stops. An approval's entire value is that it is
evidence a specific human approved something, checkable offline by someone
who does not trust the machine it came from — and that property only
holds while producing one requires a deliberate act by a human at the key,
for that specific approval, with the confirmation itself coming from
whatever holds the key and unforgeable by the web server process — a
confirmation dialog the server renders and honors on its own is not that,
however it's worded. So `written web` never holds unattended
signing authority: no code path may let it produce a valid approval on its
own, without a human acting at the key in the moment. It may hand back the
command for the operator to run in their own terminal, or route the
request through a confirming agent — `ssh-agent -c`, a hardware key touch
— since that still requires the human to be present at the key; what it
may never do is complete an approval by itself, unattended.

## Performance and user experience principles

- **Instantaneous navigation:** Switching views, filtering lists, folding diff
  hunks, and expanding threads must happen in single-digit milliseconds.
- **Keyboard-first ergonomics:** Full support for standard navigation keys
  (both Vim keys `j/k/h/l` and arrow keys) with intuitive modal boundaries
  for text input.
- **Resilient repo discovery:** Run `written` from any subdirectory, bare
  repository, or detached worktree, and it automatically resolves the
  enclosing git repository and workspace context.
- **No manual refresh:** The UI reflects state changes reactively via event
  streams; users never need to press a "refresh" key to see new comments or
  reviews.

## Sequencing

1. **Foundations & Skeleton (WRTN-1):** Repository layout, agent guides,
   CI/CD pipeline, and workspace resolution.
2. **Design Language & Information Architecture (WRTN-2, WRTN-5):** Screen
   map, persistent chrome, navigation model, and keybinding grammar.
3. **Engine Integration & Liveness (WRTN-4, WRTN-8, WRTN-14):** Connecting
   to `github.com/writtendev/writ/engine` and wiring `store.Watch` to Bubble Tea.
4. **Diff & Review Experience (WRTN-20, WRTN-25):** Unified/split diff viewer,
   syntax highlighting, and inline comment threads.
5. **Issues & Workspace Navigation (WRTN-21, WRTN-26):** Issue listing,
   collapsible grouping, and cross-repository references.
6. **Web Companion (WRTN-33):** `written web` HTTP server serving the same
   engine over standard `net/http`.
