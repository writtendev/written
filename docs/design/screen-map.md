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
attention, defined against three candidate sources, not a vibe:

1. **Reviews assigned to me and not closed** — `Query.Reviews` with
   `ReviewFilter{Assignee: [me], Status: ["draft", "open"]}`. The
   `Assignee` field on `ReviewFilter` is real and queryable (`WRIT-97`
   is Done): this is not a heuristic over authorship or participation,
   it is a direct filter. `Status` carries no `"open"` convenience
   value the way `IssueFilter.State` does below — `engine/projection`
   matches it as a literal `IN` against the review status enum
   (`"draft"`, `"open"`, `"closed"`, `"merged"`, `spec/review-ops.md`
   §4 `set-status`), so "not closed" is spelled out here as the two
   non-terminal values rather than a single keyword.
2. **Issues assigned to me and not done** — `Query.Issues` with
   `IssueFilter{Assignee: [me], State: ["backlog", "unstarted",
   "started"]}`. `IssueFilter.State` does carry an `"open"`
   convenience keyword, but `query.go:486` maps it only to workflow-
   state types `unstarted`/`backlog` — it excludes `started`, so an
   in-progress assigned issue (exactly what the Issue detail
   wireframe below draws) would silently drop out of the inbox under
   the convenience form. Naming the three non-terminal workflow-state
   types directly closes that gap: each is matched case-insensitively
   against `ws.f_type`, the same column the `"open"` keyword itself
   compares against for two of the three, so this needs no separate
   `Query.WorkflowStates` round-trip — the literal type strings are
   themselves valid `State` values.
3. **Objects I author or participate in with unread activity** —
   candidate object IDs come from three sources, not two: reviews and
   issues I authored — `ReviewFilter{Author: [my email]}` /
   `IssueFilter{Author: [my email]}` — reviews and issues I'm assigned
   to (already covered by 1 and 2, but repeated here because they're
   also candidates for *unread* activity, not just for being open),
   and the subjects of comments I authored — `Query.Comments` with
   `CommentFilter{Author: [my email]}`, whose results carry the
   subject not at the top level but nested at
   `CommentResult.Comment.Subject.{ObjectType,ObjectID}`
   (`state.CommentSubject`; `SubjectType`/`SubjectID` are
   `Draft`/`DraftFilter` fields, a different type) — i.e. exactly the
   participation half of "author or participate in" that authorship
   and assignment don't cover. All three candidate sets are narrowed
   through the same `ReadState.Unread(ctx, ids...)` pass, which
   returns the unread subset of the ids passed in. Unread is not
   itself a filter on a query; it is a second pass over ids the
   candidate queries already produced. Without the comment-authored
   source, a review I only commented on — never authored, never
   assigned — could accumulate unread replies with no path to the
   inbox, which is exactly the "unread discussion threads" case
   `VISION.md` names as one of the inbox's three jobs; this source is
   what closes it, provided "my email" below is what actually gets
   passed to `Author`.

**"My email" is deliberately not the person-id.** `identity.Load(ctx,
repoDir)` (`engine/identity`) returns one `Identity` carrying two
distinct values, and sources 1–3 above depend on using the right one
for each filter. `Identity.PersonID` is the scheme-prefixed person
identifier (`email:alice@example.com`, or `writ.personId`'s value) —
this is what every `Assignee` filter compares against, because
assignee items in the engine are person-ids by construction
(`spec/identifiers.md` §Person identifiers). `Identity.Author.Email`
is the raw `user.email` writ signs every op's commit with, unrelated
in format to `PersonID` — this is what every `Author` filter above
compares against, because `Author` matches
`objects.author_email`/`author_name`, columns populated straight from
the authoring commit's identity (`materialize.go:41-42`), which
carries no scheme prefix at all. Feeding `PersonID` into an `Author`
filter — or `Author.Email` into `Assignee` — compiles, runs, and
silently returns zero rows, because the two id spaces never intersect:
a review commented on under this exact `user.email` and never
authored or assigned is real and findable, but only via `Author: [me]`
where `me` is `Identity.Author.Email`, not `Identity.PersonID`. An
earlier draft of this document fed `PersonID` into the `Author`
filters above; that is corrected here, and is why "my email" is
written out rather than reusing "me" for both. That resolution can
fail — see `## Unhappy states at this level` for what the shell does
instead of running these queries against an empty id.

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
blank list. Drawn at 120 columns, where `## The 80-column story`'s
width table says the full top bar (repo, identity, sync state,
current screen name) and a fully labeled hint bar both belong:

```text
┌ written · writ · you@example · Inbox ───────────────────────────────────────────────────────────────────── ⟳ synced ─┐
│                                                                                                                      │
│                                                    Inbox is empty.                                                   │
│                                        Nothing assigned to you, nothing unread.                                      │
│                                                                                                                      │
│                                Press g r for reviews, g I for issues, or : to search.                                │
│                                                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
  ?: help  g r: reviews  g I: issues  :: palette
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

**Decision: the sync indicator reflects `Store.SyncStatus`, and a
`Reset` never touches the stack.** The top bar's sync row exists to
answer "is this current", against the remote — not "is a local query
pending", which is a different question `Store.Watch` alone can't
answer: a clone that has never fetched has no query in flight either,
and rendering `⟳ synced` on that basis would be asserting remote
currency the shell has no basis for. `Store.SyncStatus(ctx, remote)`
(`engine/sync.go`) is the engine call that actually reports this, and
it's local and immediate — it reads the local git storer and the
projection's sync cursors, no network round-trip — returning
`Unsynced` (local ops not yet pushed) and `Diverged` (the remote
chain's tip is not an ancestor of the local one), both as of the last
successful `Store.Sync`. The shell renders `⟳ synced` when neither is
true, `⟳ N to push` when `Unsynced > 0`, and `⟳ diverged` when
`Diverged` is set, re-evaluating after every `Store.Watch` event and
after any explicit sync. This is a narrower, honest claim rather than
a stronger one: the never-fetched clone above still renders `⟳ synced`
(nothing local to push, no divergence detected against what the last
sync recorded), but that's now a true statement about local state as
of the last sync, not a guess dressed as a fact about the remote —
the engine has no immediate, local way to know more than that, and
the indicator no longer claims to.

**Which remote, and what happens with none.** `remote` is required —
`Store.SyncStatus` returns an error on an empty string — so the shell
has to resolve one before it can call this at all. It resolves the
same way `writ sync`'s own CLI does (`cmd/writ/sync.go`): a remote
named `origin` if one is configured, else the sole configured remote
if there is exactly one, else none — multiple remotes with none named
`origin` resolve to none here too, the same as zero remotes, since
this bar has no prompt to ask which one the way the CLI's flag does.
That resolution is ordinary local
git plumbing (`git remote`), not an engine call, the same way
repository discovery already reads git directly (`ARCHITECTURE.md`
decision 3). When it resolves to none, the shell does not call
`Store.SyncStatus` with a guessed or empty name — it renders an
explicit `⟳ no remote` instead. This matters because the failure mode
on the other side is silent and wrong in a specific way: `ComputeStatus`
builds its "already on the remote" stop set by walking tips reachable
from refs belonging to the named remote, and a remote with no matching
refs (because it was never fetched, or the name doesn't exist at all)
gives an empty stop set — every local op then counts as unsynced, so a
solo repo with no git remote configured would render `⟳ N to push` for
ops that were never meant to go anywhere. `⟳ no remote` is the honest
statement available instead; only a resolved, real remote name reaches
`Store.SyncStatus`.
`EventCreated`/`EventChanged` name the object that changed, so a
screen currently showing that object re-queries it — a per-screen
concern, `WRTN-19`/`20`/`21`'s to design. `EventReset` is different in
kind, not degree: per `engine/watch.go` it fires on a full rebuild, a
chain rollback, or a subscriber's event buffer overflowing, and it
carries no object id — everything the shell has queried may now be
stale, all at once. What's shell-level, and settled here: a `Reset`
does not pop, replace, or otherwise touch the screen stack. Every
pushed frame stays exactly where it was and re-queries its own data
the next time it's current (or immediately, if it's the top frame);
a frame whose object is simply gone after the reset renders that
screen's own not-found state, which is the same per-screen unhappy
path a missing object already needs, not a new shell behavior. The
stack surviving a reset unconditionally is the one thing this
document needs to guarantee for `WRTN-9`; how each screen re-reads
itself is not.

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
| 80 cols | repo, sync state (identity dropped) | highest-priority action or two, short labels, plus `?` for help |

## Navigation model

**Decision: a screen stack.** Activating a row pushes a new screen;
`esc` pops back to the previous one. One global jump — the command
palette's quick-switch commands — can jump directly to one of the
three top-level screens (Inbox, Review list, Issue list), and two
direct keys (`g i` for inbox, `g r`/`g I` for the two top-level lists,
exact bindings are `WRTN-5`'s call) do the same. The stack has exactly
one owner: the root model holds it, and "which screen is current" is
always its top frame. This is the property `WRTN-9` implements
against.

**A jump resets the stack; it does not push onto it. A jump's
destination is one of the three top-level screens — nothing else.**
The palette's quick-switch commands and `g i`/`g r`/`g I` all replace
the entire stack with a single frame at Inbox, Review list, or Issue
list, rather than stacking the destination on top of wherever you
were. This keeps the jump case bounded — repeated jumps can't grow the
stack, unlike a push would — and gives `esc` a well-defined answer
right after one.

**Decision: `esc` at a stack root is a no-op.** Whichever screen is
currently the root — Inbox on a fresh launch, or a list just jumped
to — has nothing beneath it to pop to, and `esc` there does nothing
rather than falling back to Inbox or any other screen. This has to
hold uniformly, not just for Inbox: a jump's entire purpose is to make
its destination the new root, full stop, so letting `esc` at a
jumped-to Review list or Issue list quietly return to Inbox would
smuggle a push relationship back into a model that deliberately has
none between the three top-level screens. Escape *from the palette
itself*, without picking anything, is the one exception to any of
this: that returns to wherever you opened it, unchanged, because no
jump happened.

Searching the palette for a specific review or issue and opening it is
a **different** palette action from a quick-switch, and it is not a
jump: it pushes the selected object's detail screen onto whatever
stack was already current, exactly like activating a row would. This
is what keeps `esc: back` meaningful on a detail screen reached that
way — the empty-inbox screen's "`:` to search" leads here, and it
would not make sense for the ordinary act of searching for a review
and opening it to also wipe the stack out from under you. The
palette's *jump* destinations are exactly the three top-level screens
named above — never "any screen" — precisely so that opening a
specific object through it can stay a push instead.

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
    ├─ activate a review row ──> Review detail
    │                              │
    │                              ├─ activate diff ──> Diff viewer
    │                              │
    │                              └─ esc ──> back to Inbox
    │
    └─ activate an issue row ──> Issue detail
                                   │
                                   └─ esc ──> back to Inbox

  Review list and Issue list are never reached by activating an inbox
  row, and never pushed on top of whatever's current — pushing onto
  the existing stack is only ever what activating a row does. They
  are reached exactly one way: the other two jump destinations (`g r`
  for Review list, `g I` for Issue list, exact bindings are `WRTN-5`'s
  call, or the palette's quick-switch). A jump resets the stack to a
  single frame at its destination (see the decision above), so a
  jumped-to list is itself the stack's root — the same role Inbox
  plays at launch, not a frame sitting on top of Inbox. From that
  root, activating a row pushes the same detail screen the inbox
  case above does, one level deeper, and a review detail pushes the
  diff viewer one level deeper still:

    Review list (root) ── activate a row ──> Review detail ──> Diff viewer
    Issue list  (root) ── activate a row ──> Issue detail

  esc from a pushed screen pops exactly one level — Diff viewer ->
  Review detail -> Review list, or Issue detail -> Issue list — the
  same one-level-at-a-time pop the Inbox case above shows, bottoming
  out at whichever screen is currently the root. It never pops past
  that root to Inbox or to anything else: reaching Review list or
  Issue list by a jump made it a root in its own right, with nothing
  beneath it on the stack, because the jump discarded whatever was
  there before. The root model's stack has exactly one owner, and its
  top frame is always "which screen is current."

  `esc` at whichever screen is currently the root — Inbox at launch,
  or a list just jumped to — is a no-op: there is nothing beneath a
  root to pop to (see the `esc`-at-a-root decision above), and that
  holds the same way for all three top-level screens.

  The palette's quick-switch commands, `g i`, `g r`, and `g I`, are
  jumps, not pushes: each resets the stack to a single frame at the
  destination — Inbox, Review list, or Issue list, and nothing else —
  discarding whatever was on the stack before. A jump can't grow the
  stack, and `esc` right after one is the no-op above, since there is
  nothing below the new root to pop. Escape from the palette itself,
  without picking anything, returns to wherever you opened it,
  unchanged — that's not a jump. Searching the palette for a specific
  review or issue and opening it is neither of those: it pushes the
  result's detail screen onto the current stack like any other
  activation, so `esc` still pops back to wherever the search was
  opened from.
```

## Review detail and issue detail

Both detail screens sit under the same top/bottom chrome as the inbox
— description and status first, then the object-specific content, then
its comment thread. A review detail's diff is one push further in
(`enter` on the "view diff" line), not inlined into this screen. The
id shown for each object (`RFX a1c92f0`, `ISS 9f0e2b7`) is writ's real
short form — a lowercase hex prefix of the 32-character object id,
per `spec/identifiers.md`'s "Short forms and presentation" section —
not a sequential number; writ has no field for one, and
`spec/identifiers.md` closes sequential numbering by name as a
rejected alternative. Drawn at 120 columns, same as the empty inbox
above, where the full top bar and a fully labeled hint bar are both
correct per the width table:

```text
┌ written · writ · you@example · Review detail ───────────────────────────────────────────────────────────── ⟳ synced ─┐
│ RFX a1c92f0 · fix: race in sync cursor advance                                                              assigned │
│ opened by jm · 3 days ago · status: open                                                                             │
│                                                                                                                      │
│ The sync cursor advances before the projection commit lands, so a crash between the two leaves                       │
│ state.db pointing past ops it never applied.                                                                         │
│                                                                                                                      │
│ > view diff (enter)                                                                                                  │
│                                                                                                                      │
│ Threads (2)                                                                                                          │
│  km: does this need a lock around the cursor write too?                                                              │
│  jm: yes, added in the fixup - see diff                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
  enter: view diff  c: comment  a: approve  esc: back  ?: help
```

```text
┌ written · writ · you@example · Issue detail ────────────────────────────────────────────────────────────── ⟳ synced ─┐
│ ISS 9f0e2b7 · panic on empty diff hunk                                                                      assigned │
│ opened by k · 1 week ago · state: in progress · priority: high                                                       │
│                                                                                                                      │
│ Loading a review with a zero-line hunk panics in the diff renderer instead of showing an empty                       │
│ context block.                                                                                                       │
│                                                                                                                      │
│ Labels: bug, diff-viewer                                                                                             │
│                                                                                                                      │
│ Comments (1)                                                                                                         │
│  jm: repro'd - renderer assumes hunk.Lines is non-empty                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
  c: comment  s: change state  a: assign  esc: back  ?: help
```

**The Diff viewer rests on an engine capability that does not exist
yet, stated here the same way the `Workspace` gap is stated in
`## Cross-repo`.** `api/engine.txt` has no diff or changed-files
surface at all — a `Diff`/`FileChange` type or a method that produces
one is not there. `state.Review.Revisions` gives two commit shas
(`Base`, `Head`) and nothing about what changed between them, and
`engine/resolve` is anchor resolution: `resolve.NewTree` builds a tree
from file contents the *caller* supplies, it does not read them from
anywhere. The Diff viewer screen above, and the "view diff" affordance
on the Review detail wireframe, therefore depend on a capability writ
does not expose today; the earlier version of that wireframe's
invented "3 files changed" figure has been dropped rather than left
implying otherwise. The only route to producing a diff without it is
git plumbing outside the engine's public contracts, which
`AGENTS.md`'s public-API-only invariant rules out on its own terms —
so this is not Written's gap to close by reaching past the engine.
`WRTN-20` inherits this stated plainly, the way `WRTN-30` inherits the
`Workspace` correction: a diff surface needs to be designed into
writ's public engine API first; until then, the Diff viewer is a
screen this document names and places in the navigation model, not
one it can fully ground in the engine as it stands.

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

**"Ordered by attention" means this:** since Written owns the merge,
Written also owns the sort, and it is this — unread outranks read
first (an object with unread activity, per `ReadState.Unread`, sorts
above one without, regardless of type or assignment), then
`UpdatedAt` descending within each of those two groups, using the
timestamp `ReviewResult`/`IssueResult` already carry. This is the same
ownership this section already establishes for the merge itself, not
a new engine dependency — no query does this ordering, Written's merge
step does, and it is settled here rather than left for whichever
implementation gets to it first to invent.

## Cross-repo

Issues live in a workspace repo; reviews live with the code they
review. `Store.Ref(objectID)` mints a `<repo-id>#<object-id>`
reference when the local repo has a repo-id, and `spec/identifiers.md`
permits clients to display a shortened form (`writ#a1b2c3d`) while the
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
- An unqualified reference — `Store.Ref` returns the bare object id,
  with no repo half at all, when the local repo doesn't have a
  repo-id yet (`engine/store.go`: `Ref` falls back to the bare
  `objectID` whenever `localRepoID` is empty, which it is until
  something mints one) — renders as that bare id, with no slug and no
  `#`. It behaves like a same-repo reference for activation: the
  object is local and known, it has simply not picked up a repo-id,
  so this is neither the qualified case nor the unresolvable one
  above.
- The top bar's `repo` field follows the current frame, not the
  session's start repo. `## Persistent chrome` gives that field a
  permanent row precisely to answer "where am I", and once a
  cross-repo push lands, "where am I" is the target's repository, not
  the one the session started in — showing the old repo after the
  push would misreport what's on screen. It updates on push and on
  pop, the same as any other chrome value that depends on the current
  frame.

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
   is no room for the full labeled action list, so the bottom bar
   shows only the highest-priority action or two (typically `enter`
   and `esc`), each with a short label, plus `?` for the full list as
   an overlay.
4. **Below 60 columns**, the shell renders a deliberate "terminal too
   small" message instead of attempting to lay out any screen —
   `WRTN-9` implements the threshold check; 60 is the number this
   document is choosing, since below it even a truncated single-column
   list stops being legible.

An inbox row at exactly 80 columns (display width — box-drawing
characters count as one cell each, the same as any other), after
every collapse above has applied, and budgeting the id column against
the same 7-character hex short form used above (not a sequential
number writ cannot mint):

```text
┌ written · writ ─────────────────────────────────────────────────── ⟳ synced ─┐
│ > RFX a1c92f0  fix: race in sync cursor advance                   3d  +2  jm │
│   ISS 9f0e2b7  panic on empty diff hunk                           1w       k │
│   RFX 5b7ad31  docs: identifiers short-form examples              2d  +1  jm │
│                                                                              │
│ RFX a1c92f0 · fix: race in sync cursor advance · assigned, unread            │
└──────────────────────────────────────────────────────────────────────────────┘
  enter: open  ?: help
```

The hint bar has no `esc` here on purpose: Inbox is the stack's root
in this scene, and `esc` at a root is a no-op (`## Navigation model`)
— a screen reached via a push, once it isn't the root, shows `esc` in
its place. A screen reached via a jump is always the new root by
definition (`## Navigation model`'s stack-reset rule) and never shows
`esc` right after landing.

## Unhappy states at this level

Three conditions belong to the shell itself rather than to any one
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
- **An unresolvable identity.** `identity.Load` can return an
  `Identity` with `PersonID == ""` and a non-nil `PersonIDErr` — no
  `writ.personId` configured, no usable `user.email` to fall back to,
  or a malformed value that `DerivePersonID` refuses to guess at
  (`engine/identity`). Every `Assignee` filter the inbox runs
  (`## Home is the inbox`, sources 1 and 2) would compare against that
  empty id and return nothing. `Author` (source 3) is **not always**
  broken by a `PersonIDErr` the same way, and that "always" matters
  past this section — verified at the source
  (`engine/identity/identity.go`): `loadFailed` (lines 98-100) is what
  `Load` returns on its three earliest failures — missing or invalid
  `writ.writerId`, missing `user.name`, missing `user.email` — and it
  hands back `Identity{PersonIDErr: err}` with a **zero-valued
  `Author`**, so for those three reasons `PersonIDErr != nil` coincides
  with `Author.Email == ""` too. Only past that point, once `user.email`
  has already resolved, does `DerivePersonID` run and fail
  independently of it — a good `user.email` with a malformed or
  unset `writ.personId` is the one case this section is actually
  about, where `PersonIDErr != nil` and `Author.Email` is populated and
  correct. **A caller must check `Author.Email != ""` directly before
  trusting it, not infer that from `PersonIDErr`'s presence or
  absence** — an authored-by-me query run anywhere outside this
  inbox's gate (WRTN-19's review list, say) that skips this check and
  runs `Author: [""]` would read a broken identity as "you authored
  nothing," not as "identity unusable." Here in the inbox's own gate
  the distinction is moot regardless of which of the two shapes
  applies: a broken `PersonID` also means every write this identity
  would make (assign, approve, comment as) is broken the same way, so
  the same "identity not configured" screen applies uniformly rather
  than showing an inbox that reads fine and writes nowhere. A result
  indistinguishable from a caught-up identity with nothing outstanding
  is the failure mode either way, unless the shell checks first — so
  Written checks
  `PersonIDErr` before running any inbox query and, if it's set, shows
  an explicit "identity not configured" screen naming what's missing
  and the git config to set, instead of the empty-inbox copy above.
  This is most likely to be the very first screen anyone sees, which
  is exactly why it can't be allowed to lie.

## Out of scope

Row anatomy and filter grammar (`WRTN-19`), diff layout and inline
threads (`WRTN-20`), issue grouping (`WRTN-21`), the keybinding
grammar itself (`WRTN-5` — this document names the actions navigation
needs, not the keys), palette and colors (`WRTN-6`), widget selection
(`WRTN-7`), and any Go code (`WRTN-9`).

Every specific key shown anywhere above — the hint bars, the
empty-inbox body copy, `g i`/`g r`/`g I` — is an illustrative
placeholder standing in for an action this document does name (open,
back, comment, approve, assign, change state, search, help, jump to
inbox/review-list/issue-list). None of it is a claim about a binding;
`WRTN-5` owns the actual grammar and can assign different keys to
every one of these without this document needing a rewrite. A
wireframe has to show *something* typable to be legible, which is why
the placeholders are there at all rather than left as bare
descriptions.
