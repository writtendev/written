# Written — Screen Map & Information Architecture

This document settles what screens Written has, what is always on
screen, and how you move between them, before any render function gets
written. It is the fence `WRTN-9` (Bubble Tea app skeleton) implements
against, and the document `WRTN-16` (persistent chrome) and `WRTN-30`
(cross-repo navigation) defer to. Row anatomy, filter grammar, diff
layout, issue grouping, the keybinding grammar, and the visual system
are out of scope here — see `## Out of scope` at the end.

Everything below is grounded in `github.com/writtendev/writ/engine`'s
public API as of this writing, verified against the sibling `writ`
checkout, not assumed. Each design decision below cites the query,
filter, or method it depends on.

## Screen inventory

Every screen, named, with its one-sentence purpose:

- **Inbox (home).** What needs you right now, across reviews and
  issues, ordered by attention rather than by type.
- **Review list.** Every review matching the active filter, browsable
  independent of the inbox.
- **Review detail.** One review's description, status, and comment
  threads, with the diff reachable from it.
- **Diff viewer.** The unified/split diff for a review's changes, with
  inline comment threads anchored to lines.
- **Issue list.** Every issue matching the active filter, grouped per
  `WRTN-21`.
- **Issue detail.** One issue's description, status, assignees, and
  comment thread.

Plus the summoned surfaces, which never hold permanent screen space:
the command palette, the filter line, the help overlay, and the
confirmation/approval prompt.

`internal/ui/ui.go` today has a four-value `State` enum (`StateInbox`,
`StateReviewList`, `StateDiffView`, `StateIssueList`) from `WRTN-1`.
This document names the screens that enum grows into — it adds
`StateReviewDetail` and `StateIssueDetail` as destinations distinct
from their list screens, plus the summoned surfaces as overlays rather
than states. `WRTN-9` is what changes the Go; this ticket does not
touch `internal/ui/ui.go`.

## Home is the inbox

`VISION.md` already commits to the inbox framing ("An inbox-driven
workflow"). The inbox is the set of objects that need this identity's
attention, defined against three engine queries, not a vibe:

1. **Reviews assigned to me and not closed** — `Query.Reviews` with
   `ReviewFilter{Assignee: [me], Status: [open statuses]}`. The
   `Assignee` field on `ReviewFilter` is real and queryable (`WRIT-97`
   is Done): this is not a heuristic over authorship or participation,
   it is a direct filter.
2. **Issues assigned to me and not done** — `Query.Issues` with
   `IssueFilter{Assignee: [me], State: [open states]}`, the same shape
   as above.
3. **Objects I author or participate in with unread activity** —
   candidate object IDs come from querying reviews and issues I
   authored or am assigned to, then narrowed through
   `ReadState.Unread(ctx, ids...)`, which returns the unread subset of
   the ids passed in. Unread is not itself a filter on a query; it is
   a second pass over ids the first two queries already produced.

`me` resolves once per session via `identity.Load(ctx, repoDir)`
(`engine/identity`), which is the person-id every `Assignee` filter
above is compared against.

**Unassigned objects do not appear in the inbox.** An open review or
issue with no assignee is surfaced through the review list and issue
list, not the inbox — the inbox answers "what needs *me*", and an
unassigned object needs someone, not necessarily this identity. This
is a deliberate choice, not an oversight: it keeps the inbox's
definition stable as the object graph grows, at the cost of an
unassigned backlog being invisible from the home screen. Revisiting it
is a product call for later, not a gap in this pass.

**The empty inbox** — nothing assigned, nothing unread — is a fresh
repo's first screen, so it says so plainly rather than rendering a
blank list:

```text
┌ written · writ · you@example ───────────────────────── ⟳ synced ─┐
│                                                                  │
│                         Inbox is empty.                          │
│             Nothing assigned to you, nothing unread.             │
│                                                                  │
│        Press r for reviews, i for issues, or : to search.        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
  ?: help  r: reviews  i: issues  :: palette
```

## Persistent chrome

**Decision: a one-line top context bar and a bottom key hint bar, with
the main pane taking every row between them at full width.**

The top bar shows repo, identity, and sync/refresh state — the three
facts that answer "where am I and is this current" and change rarely
enough to earn a fixed row. The bottom bar shows the actions available
in the current screen, sourced from the same keybinding table `WRTN-5`
defines. Everything else — command palette, filter line, help overlay,
comment composer — is summoned: it appears on demand and gives its
space back.

**Rejected: a Crush-style permanent right sidebar.** Written's
dominant content is a diff, and a diff spends screen width better than
a sidebar does — every column a sidebar holds is a column the diff
gutter, hunk context, or an inline thread does not get. `WRTN-16`
("Persistent chrome: sidebar and status bar") was written assuming a
Crush-style sidebar, and its own text already defers auto-collapse
behavior "per the responsive rules from the screen map." This document
is that call: there is no persistent sidebar. `WRTN-16`'s scope is
therefore the top context bar and bottom hint bar described here, not
a collapsing sidebar — its implementer should read this section before
starting, and its description should be corrected to match.

What each bar shows, by width:

| Width | Top bar | Bottom bar |
| --- | --- | --- |
| 120 cols | repo, identity, sync state, current screen name | full action list with labels |
| 100 cols | repo, identity, sync state | action list, longer labels abbreviated |
| 80 cols | repo, sync state (identity dropped) | keys only, no labels, plus a `?` for help |

## Navigation model

**Decision: a screen stack.** Activating a row pushes a new screen;
`esc` pops back to the previous one. One global jump — the command
palette — can jump to any screen directly without unwinding the stack,
and two direct keys (`g i` for inbox, `g r`/`g I` for the two
top-level lists, exact bindings are `WRTN-5`'s call) reach the
top-level screens without the stack being the only way to move. The
stack has exactly one owner: the root model holds it, and "which
screen is current" is always its top frame. This is the property
`WRTN-9` implements against.

**Rejected: tabbed panes.** Tabs invite unbounded tab management (how
many can be open, how do you close one, what happens when you open a
review from an issue while three tabs are already open) and introduce
a second focus concept alongside the stack's single current screen.
Written does not need two ways to hold "where you are."

**Rejected: a fixed two-pane list/detail layout.** A permanent
list-on-left, detail-on-right split spends width the diff viewer needs
for gutters, hunk context, and inline threads, and collapses badly
below 100 columns — there is no good way to shrink a two-pane layout
that doesn't leave one pane too narrow to read. A push/pop stack gives
every screen the full width when it's current, and degrades to one
screen at a time, which is what narrow terminals need.

```text
  Inbox (home)
    │
    ├─ activate a review row ──> Review list
    │                              │
    │                              ├─ activate a row ──> Review detail
    │                              │                        │
    │                              │                        └─ activate
    │                              │                           diff ──>
    │                              │                           Diff viewer
    │                              │
    │                              └─ esc ──> back to Inbox
    │
    └─ activate an issue row ──> Issue list
                                   │
                                   ├─ activate a row ──> Issue detail
                                   │
                                   └─ esc ──> back to Inbox

  esc from any pushed screen pops exactly one level: Diff viewer ->
  Review detail -> Review list -> Inbox (same shape on the issue
  side). The root model's stack has exactly one owner, and its top
  frame is always "which screen is current."

  Command palette (:) — one global jump to any screen, at any depth,
  bypassing the stack. Escape from the palette returns to wherever
  you opened it, unchanged. g i / g r / g I jump directly to Inbox,
  Review list, or Issue list without unwinding the stack first.
```

## Review detail and issue detail

Both detail screens sit under the same top/bottom chrome as the inbox
— description and status first, then the object-specific content, then
its comment thread. A review detail's diff is one push further in
(`enter` on the "view diff" line), not inlined into this screen.

```text
┌ written · writ · you@example ─────────────────────────── ⟳ synced ─┐
│ RFX #142 · fix: race in sync cursor advance      assigned          │
│ opened by jm · 3 days ago · status: open                           │
│                                                                    │
│ The sync cursor advances before the projection commit              │
│ lands, so a crash between the two leaves state.db                  │
│ pointing past ops it never applied.                                │
│                                                                    │
│ > 3 files changed · view diff (enter)                              │
│                                                                    │
│ Threads (2)                                                        │
│  km: does this need a lock around the cursor write too?            │
│  jm: yes, added in the fixup - see diff                            │
└────────────────────────────────────────────────────────────────────┘
  enter: view diff  c: comment  a: approve  esc: back  ?: help
```

```text
┌ written · writ · you@example ─────────────────────────── ⟳ synced ─┐
│ ISS #88 · panic on empty diff hunk                assigned         │
│ opened by k · 1 week ago · state: in progress · priority: high     │
│                                                                    │
│ Loading a review with a zero-line hunk panics in the diff          │
│ renderer instead of showing an empty context block.                │
│                                                                    │
│ Labels: bug, diff-viewer                                           │
│                                                                    │
│ Comments (1)                                                       │
│  jm: repro'd - renderer assumes hunk.Lines is non-empty            │
└────────────────────────────────────────────────────────────────────┘
  c: comment  s: change state  a: assign  esc: back  ?: help
```

## Reviews and issues coexist

Reviews and issues are different object types in the same graph, and
the screen map treats them as **two peer top-level destinations that
both feed one mixed inbox**, ordered by attention rather than by type.

**Rejected: burying issues behind the review that closes them.** That
contradicts the one-graph claim in `VISION.md` — an issue is a
first-class object with its own lifecycle, not an appendage of
whichever review happens to close it, and plenty of issues have no
closing review at all.

**Rejected: a single list with a type filter, as the *only* route.** A
filter is a view, not a destination — it requires remembering to
switch it, and it makes "just show me reviews" a two-step action
instead of a direct key. The review list and issue list stay separate,
directly reachable screens; a combined, filterable view can exist
inside either or inside search without replacing them.

**Consequence for the inbox:** `Query.Objects` (`ObjectFilter`) is the
engine's one cross-type query, but `ObjectFilter` carries `Type`,
`Author`, and `Text` — **no `Assignee`**. There is no single engine
query for "reviews and issues assigned to me." The mixed inbox
described above is necessarily two filtered queries (`Query.Reviews`
and `Query.Issues`, both filtered on `Assignee`) merged and ordered in
Written, not one call into the engine. This constrains pagination too:
the inbox cannot hand `Limit`/`Offset` to a single query and get a
correctly-ordered page back — Written owns the merge, and a "page 2"
of the inbox means re-running both queries and re-merging, not
offsetting one.

## Cross-repo

Issues live in a workspace repo; reviews live with the code they
review. `Store.Ref(objectID)` mints a fully-qualified
`<repo-id>#<object-id>` reference, and `spec/identifiers.md` permits
clients to display a shortened form (`writ#a1b2c3d`) while the
canonical reference stays full. The screen map's job is to decide what
happens when one of these references appears on screen — not to design
how it gets resolved.

**Decision:**

- A qualified reference renders in its short form, repo slug and
  short object id, wherever it appears in a list row or a thread.
- Activating it pushes the referenced object's detail screen exactly
  like any other push — cross-repo is not a different navigation
  mode, it's a different resolution step ahead of the same push.
- An unresolvable reference (the target repo isn't known locally, or
  isn't cloned) renders an explicit, honest "not resolvable locally"
  state in place of the object — never a dead string, and never a
  silent blank.

**The constraint this runs into, stated plainly:** a `Store` is opened
against exactly one repository, and the engine mints `repo-id`s but
exposes no resolver from a `repo-id` back to a local clone path —
**`api/engine.txt` has no `Workspace` symbol at all**, and the only
thing "workspace" names inside writ today is repo-global settings
(`Store.Settings`). Resolving a `repo-id` to a local clone is
therefore Written's own responsibility, living in `internal/app`
beside the repository-discovery logic (`ARCHITECTURE.md` decision 3,
`WRTN-8`), not an engine capability to call into.

`WRTN-30`'s own description assumes a `store.Workspace` type with
`Info`/`Repos`/`Register`/`Resolve` methods. That type does not exist
in the engine's public API today. This document does not lean on it,
and hands the actual resolution mechanism — the registry mapping
`repo-id` to local clone — to `WRTN-30` to design, with this
correction attached so it doesn't get rediscovered there.

## The 80-column story

Below 100 columns the shell starts shedding secondary information, in
this order:

1. **Row columns drop first**, narrowest-value-per-column first:
   timestamps collapse to relative form (`3d` instead of a date),
   label chips drop to a single leading label plus a `+N` count, and
   author avatars/names shrink to initials.
2. **What moves to selected-row-only:** full title (row shows a
   truncated title with an ellipsis; the full title, full label list,
   and full timestamp appear only for the row under the cursor, in a
   one-line detail strip beneath the list).
3. **The hint bar degrades to a `?` affordance** — at 80 columns there
   is no room for a labeled action list, so the bottom bar shows only
   the highest-priority key or two (typically `enter` and `esc`) plus
   `?` for the full list as an overlay.
4. **Below 60 columns**, the shell renders a deliberate "terminal too
   small" message instead of attempting to lay out any screen —
   `WRTN-9` implements the threshold check; 60 is the number this
   document is choosing, since below it even a truncated single-column
   list stops being legible.

An inbox row at exactly 80 columns, after every collapse above has
applied:

```text
┌ written · writ ───────────────────────────────────── ⟳ synced ─┐
│ > RFX #142  fix: race in sync cursor advance        3d  +2  jm │
│   ISS #88   panic on empty diff hunk                 1w      k │
│   RFX #139  docs: identifiers short-form examples    2d  +1 jm │
│                                                                │
│ RFX #142 · fix: race in sync cursor advance · assigned, unread │
└────────────────────────────────────────────────────────────────┘
  enter: open  esc: back  ?: help
```

## Unhappy states at this level

Two conditions belong to the shell itself rather than to any one
screen (the per-screen unhappy states are `WRTN-19`, `WRTN-20`, and
`WRTN-21`'s job):

- **An object touched by a newer client than Written understands.**
  Written renders what it can recognize in the object's schema and
  shows an explicit "this object has fields written doesn't know
  about yet" notice rather than silently dropping data or crashing.
- **A repo with no writ data at all.** Opening `written` in a git
  repository that has never run `writ init` shows a one-screen
  explanation and the command to fix it, not an empty inbox that looks
  like a working, unassigned state.

## Out of scope

Row anatomy and filter grammar (`WRTN-19`), diff layout and inline
threads (`WRTN-20`), issue grouping (`WRTN-21`), the keybinding
grammar itself (`WRTN-5` — this document names the actions navigation
needs, not the keys), palette and colors (`WRTN-6`), widget selection
(`WRTN-7`), and any Go code (`WRTN-9`).
