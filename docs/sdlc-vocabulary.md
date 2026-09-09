# The SDLC vocabulary

Writ is becoming a schema layer with no SDLC vocabulary of its own
(WRIT-184); the `review`, `comment`, `issue`, `project`, `cycle`,
`document`, `section`, `label`, `workflow-state`, and `settings` vocabulary
that used to live hard-coded in writ's spec (`spec/review-ops.md`,
`issue-ops.md`, `project-cycle.md`, `comments.md`, `documents.md`,
`label-ops.md`, `workflow-state-ops.md`, `settings-ops.md`) now lives here,
as `internal/schema/writ.schema` — a `writ` schema-source file written ships
into its users' repositories. WRIT-194 deletes the vocabulary from writ's
own spec; this document, `internal/schema/writ.schema`, and the vendored
field-rules tables under `internal/schema/testdata/fieldrules/` are what
survive that deletion.

This document has two parts. **Why the vocabulary looks like this** carries
across the design reasoning that is not re-derivable from the schema file
alone — the reasoning was expensive to reach in writ's spec, and would look
attractive to re-litigate without it. **Port audit** is a table with one row
per section of each deleted spec file, saying where that section landed: a
schema declaration, a paragraph of prose above, or an explicit "not ported,
because."

All eight spec files were read at writ's `origin/main`, commit `f54c12d`
(`WRIT-204`) through `7714159` (`WRIT-195`) — the commit `internal/schema`'s
`go.mod` pin now points at — via `git show origin/main:<path>` against the
read-only checkout at `/Users/matt/src/writtendev/writ`; nothing there was
checked out or modified.

## Why the vocabulary looks like this

### Documents: sections, multi-value registers, conflicts as data

A document is split into a container object (`document`: title, links,
labels) and a set of `section` objects, each independently ordered by a
fractional `position` and independently conflicting. A section's `body`
folds under the `multi-value` strategy: every `create` or `edit` op asserts
a version of the text; a write that causally observes an earlier write
supersedes it; the set of causally-maximal writes is kept. When that set has
one member (or several with identical text), the section is settled — an
ordinary string. When two writers edit the same section concurrently, both
versions are kept, as an array, and the fold does **not** merge them or pick
a winner. **The fold never merges text and never picks a winner.**
Presenting the conflict — inline markers, a side-by-side view, an
interactive picker — is strictly a client choice, not a format concern.
Resolving it is an ordinary edit op that causally follows both versions;
there is no merge event and no distinguished resolver, unlike git, where
whoever runs the merge decides.

This was reached after rejecting three alternatives, and each will look
attractive again to whoever revisits it, so the reasons are worth carrying
forward:

- **A sequence CRDT (Yjs, Automerge, Loro).** The right tool for live
  co-editing inside one client session, ephemeral and in-memory — and the
  wrong dependency for a durable, signed, git-native format. Its updates are
  opaque binary, which breaks the property that op payloads are canonical
  JSON that signatures and content-addressing are computed over. It would
  also make the CRDT library itself part of the conformance surface: an
  independent implementation would have to reimplement it byte-for-byte, not
  just parse a documented format. And every mature Go binding reaches the
  CRDT through a Rust core via CGO, which undoes writ's pure-Go,
  static-binary release story.
- **Three-way merge in the fold**, the way git itself merges. Tempting,
  because conflict markers are more honest than a CRDT silently interleaving
  two people's paragraphs into a sentence neither wrote — but the
  conformance cost is what kills it. A spec claiming "three-way merge" has
  to pin an exact diff algorithm, an exact merge variant, exact marker
  syntax, and a reduction for however many concurrent writers the op DAG
  produced — three-way merge only ever takes two sides and a base. That is
  plausibly a bigger spec than the rest of the vocabulary combined, for a
  feature that isn't the core product. A multi-value register gets the same
  user-visible outcome — *two people disagreed, you decide* — with nothing
  to specify beyond "keep them all."
- **Whole documents as the unit of conflict**, rather than sections. A
  conflict should be scoped to the paragraph two people both touched, not
  the whole document because someone fixed a typo in the introduction — the
  same reason git conflicts are per-hunk, not per-file. Sections also give
  comments something to anchor to, the same way comments anchor to code, so
  document review works like code review instead of needing a second
  mechanism.

### Approvals and CI statuses are ops on `review`, not standalone objects

`review` is the only collaborative object type this vocabulary declares for
code review. Approvals, CI check results, requested-reviewer assignment,
labels, and cross-reference links are all ops that fold into fields of the
one `review` object, not separate object types with their own IDs and
back-references. Comments earn a standalone object type because they carry
rich text, multi-turn threading, and anchor edits, and are the volume driver
in a review. An approval vote is a small record keyed by `(subject,
revision)`; a CI status is a small record keyed by `(revision, name)`; an
assignment or label change is a set mutation; a link is a keyed relation.
None of those needs its own object ID and back-reference to be found —
folding the single `review` object is enough to materialize all of them,
without readers walking every writer's separate approval and status chains
to reassemble one review.

### Issue shape

An issue's shape is `{title, description, state, reason, assignees, labels,
links}`. `create` carries only `title` and `description`; `state`,
`assignees`, and `labels` arrive as their own ops, so "opened and triaged in
one motion" and "opened, triaged later" share one append pipeline rather
than needing two different creation shapes. `state` references a
`workflow-state` object rather than embedding a closed enum, because the
board columns themselves are user-configurable, repo-scoped objects, not a
vocabulary-level enum. `reason` is a free string, not a closed enum,
carrying whatever external or human explanation accompanied the transition
(e.g. an imported system's `"completed"` vs `"not_planned"`) without writ
minting a vocabulary it can't enforce.

### Comment threading and anchoring

A comment is its own collaborative object, attached to any other object via
a `subject` — declared `untyped` here because no catalogue value type
expresses the two-field `{object_type, object_id}` record the source spec
gives it. Threading is a plain `create-once` `in_reply_to` field naming a
parent comment's object id; there is no mutable thread state; a general tree
falls out of the transitive closure of those edges, and clients that only
render two-level threads are choosing to flatten it, not exposing the whole
data model. Anchoring to code uses the catalogue's `anchor` value type
rather than a bespoke `object-ref`-only field, matching the anchor value
writ's own spec defines — this schema does not redefine anchors, it just
uses the value type.

### Workflow-state and section ordering via fractional indexing

Two independent things use the same mechanism, the catalogue's `position`
value type: a `workflow-state`'s column position on the board, and a
`section`'s position within its parent document. Both reject an embedded
ordered array — reordering a board column or a section would otherwise be a
sequence operation on some parent object, causing false conflicts whenever
two people reorder independently. A scalar fractional-index field on the
independently-addressable object (the state, the section) instead lets an
insertion between two neighbors compute a new key without touching either
neighbor, with the position-establishing op id breaking ties when two
concurrent inserts land on the same key.

### `review` — decisions carried across

- **`assign` and `label` are add-wins OR-sets** (`set-observed-remove`):
  concurrent addition and removal race in favor of the addition. Assignees
  are scheme-prefixed person identifiers; labels are references to `label`
  objects.
- **Requested reviewer and assignee are one list.** Unlike GitHub's separate
  `assignees`/`requested_reviewers` or Gerrit's `reviewers`/`CC`, `review`
  defines one unified `assignees` list, mirroring `issue`'s own assignment
  shape.
- **Link directionality is single-sided**, with the reverse index (e.g.
  "which reviews fix this issue") built by the projection layer, not written
  by both sides — avoiding multi-repo atomic writes and the inconsistency of
  two objects disagreeing about a link only one of them wrote.
- **`create` carries no `base`/`head`.** Every revision, including the
  first, is a `revision` op, so initial creation and force-pushes share
  exactly one append pipeline instead of two competing representations of
  "revision 1."
- **`set-status` stays `lww`, not `lattice`.** Producers must not transition
  a review out of `merged`, but that is a producer rule, not a fold
  constraint — readers still fold whatever they see, keeping the fold
  deterministic without a non-lattice join.
- **Approving a review never clears its assignment.** An assignment is a
  historical fact about who was asked to review; an approval is a fact about
  what evaluation happened. Collapsing one into the other on approval would
  erase history from an append-only log built to keep it.
- **`ci-status.revision` and `ci-status.description` get distinct targets**
  (`ci_revision`, `ci_description`) so this op's own keyed map registers
  never collide with `approval.revision`'s (writ's WRIT-198 fix, carried
  across as-is).

### `issue` — decisions carried across

- **`update` covers retitle and description edits with one op**, mirroring
  `review.update`, rather than multiplying op types for identical
  last-writer-wins semantics.
- **`set-state` stays `lww`, not `lattice`.** This is the ticket's one
  flagged judgment call, and it resolved to no promotion at all — see
  "Decision: no lattice types" below.
- **`assign` and `label` are add-wins OR-sets**, same reasoning and same
  normalization discipline as `review`.
- **`link` mirrors `approval`'s retraction idiom**: emitting `relation:
  "none"` retracts a link the same way `verdict: "none"` retracts an
  approval vote.
- **No tombstone.** Issues close; they are not deleted. There is no
  `delete` op on `issue` in this vocabulary, matching the source spec.

### `project` and `cycle` — decisions carried across

- **Membership lives on the grouping object**, not the issue: `add-issue`
  and `remove-issue` on `project`/`cycle` let "what's in this project"
  be answered by folding one object, and let an issue belong to many
  groups across independent writers with no write coordination. The
  converse query is a projection-layer concern, not a field here.
- **Membership is an add-wins OR-set**, same `set-observed-remove`
  reasoning as everywhere else additions and removals can race.
- **A cycle's two dates are written together.** `create` and `set-dates`
  both require `starts_at` and `ends_at` in the same op body, so a
  concurrent date update can never interleave into a crossed window —
  each field still folds independently via `lww`, but the producer
  contract keeps them paired at the point of writing.
- **No `set-status` op on `cycle`.** A cycle's lifecycle (`upcoming`,
  `active`, `completed`) is a pure function of wall-clock time against its
  `[starts_at, ends_at)` interval; storing a mutable status field would be
  a second, competing source of truth for the same fact.
- **No tombstones on either type**, mirroring `review`: a project's
  `canceled` status is a lifecycle state, not a deletion.
- **Deliberately no PM-tool parity**: no leads/owners, no priority or health
  fields, no nested projects, no milestones/epics, no capacity/velocity
  estimates, no manual ranking on the grouping objects themselves. Writ is
  an SDLC substrate, not an all-in-one project-management platform.

### `document` and `section` — decisions carried across

- **Document kinds are link relations, not a closed enum.** `document.link`
  declares `relation` as a plain `string`, not an `enum(...)`, so a document
  can be an implementation plan for one issue and background research for
  another without a spec change every time a new document kind appears.
  General categorization goes through `labels` instead, which — unlike
  `review`/`issue` labels — are free-form strings here, not `label`
  object-refs.
- **`section.document_id` is `create-once`.** A section's parent binding is
  immutable; it cannot be re-parented after creation.
- **`section.body` on both `create` and `edit`** asserts a version into the
  same multi-value register described above; `create` is simply the
  register's first assertion.

### `label` — decisions carried across

- **A label is its own collaborative object**, not a bare string embedded
  on every issue and review that carries it. Renaming or recoloring is one
  operation on the label object, not an `O(N)` rewrite across every
  referencing object, and it prevents accidental near-duplicate labels
  (`bug` vs `Bug`) that bare strings invite.
- **No label groups.** Mutual exclusion within a group can't be enforced in
  an append-only log with no central lock — two writers can concurrently
  apply two members of the same "group," and both operations are valid. A
  closed-off `group`/`parent_id` field is left for a future, additive
  version rather than speculatively added now.

### `workflow-state` — decisions carried across

- **A workflow state is its own collaborative object**, for the same
  fractional-indexing reason as sections: an embedded ordered array would
  make column reordering a sequence operation with no independent field to
  update.
- **`type` is a closed five-value enum** (`backlog`, `unstarted`, `started`,
  `completed`, `canceled`) precisely so clients, bots, and agents can
  understand a workspace's custom-named columns ("QA", "Shipped") without
  hard-coding proprietary names — the semantic type is what's portable, not
  the label.

### `settings` — decisions carried across

- **One singleton object**, unlike every other type here, which is why
  `settings` has no `create` op at all — only `set`. The source spec pins a
  well-known object id for the canonical settings object; that pin is a
  producer/runtime convention outside what a schema field can express (see
  the port audit's "not ported" row for it), but the *shape* of the
  configuration record — every field `set` can touch — is what's declared
  here.
- **The estimate scale is data, the T-shirt mapping is a client
  presentation rule.** `estimate_scale` is a closed enum
  (`none`, `fibonacci`, `exponential`, `linear`, `t-shirt`); an issue's
  numeric `estimate` field never changes shape when the scale does — only
  how a client renders it does.
- **Cycle cadence fields are configuration, not derived state**:
  `cycles_enabled`, `cycle_duration_weeks`, `cycle_start_day`,
  `cycle_cooldown_weeks`, and `timezone` are the parameters a client needs
  to compute future cycles' UTC intervals; they say nothing about any one
  cycle's own dates.

### Decision: no `lattice` types (carried from the ticket)

The ticket's plan flagged one open judgment call: whether `review.set-status
.status` or `issue.set-state.state` should be promoted from `lww` to
`lattice`, since both source specs describe status/state fields in terms
that can sound monotone. It was resolved, before this schema was finalized,
to promote neither. A state must be able to go backwards — an issue that
reopens, most concretely — and a `lattice` forbids that by construction (a
monotone join can only advance). `writ.schema` is a straight transcription
on every one of the 116 vendored field rules: no field's merge strategy,
value type, key, or target differs from what `field-rules.json` already
declared. `internal/schema/schema_test.go`'s `divergences` table is
consequently empty, and stays that way unless a future change earns a named
entry there.

## Port audit

One row per `##`/`###` section of each deleted spec file (as read at
`origin/main` in the writ checkout), naming where it landed: a `writ.schema`
declaration, a section of the prose above, or an explicit "not ported,
because." Deeper `####` subsections are folded into their parent row's
notes rather than given their own row, except where the ticket's own
Decision 4 calls one out as its own not-ported unit (the two GitHub
appendices and the Linear appendix below).

### `review-ops.md`

| Section | Landed as |
| --- | --- |
| Scope & Object Model | `type review` in `writ.schema`; "Approvals and CI statuses are ops on `review`" above |
| Decisions behind the vocabulary | "`review` — decisions carried across" above; op field descriptions in `writ.schema` |
| Scope boundaries | Not ported, because — cross-references to the comment, cross-repo identifier, and fold-ordering specs, none of which this file itself declares vocabulary for |
| Envelope Binding | Not ported, because — substrate-level (envelope shape, OID format), already covered by writ's own `op-envelope.md`, which WRIT-194 does not touch |
| Operation Vocabulary (intro table) | The nine `op` blocks under `type review` |
| 1. `create` | `review`'s `create 1, update 1` op (shared shape) |
| 2. `revision` | `review`'s `revision 1` op |
| Revision model and force-pushes | Not ported, because — fold-time-derived behavior (revision numbers assigned at fold time, head-OID referencing) with no corresponding field; a producer/engine concern, not a schema declaration |
| 3. `update` | `review`'s `create 1, update 1` op (shared shape) |
| 4. `set-status` | `review`'s `set-status 1` op |
| 5. `assign` | `review`'s `assign 1` op |
| 6. `approval` | `review`'s `approval 1` op |
| Authorization & Dismissal Model | Not ported, because — policy/authorization discussion; writ has no authorization model at the spec layer and this schema doesn't add one |
| 7. `ci-status` | `review`'s `ci-status 1` op |
| 8. `label` | `review`'s `label 1` op |
| 9. `link` | `review`'s `link 1` op |
| Fold Implications & Merge Strategies | `internal/schema/testdata/fieldrules/review.json` (28 rules), asserted against the compiled schema by `TestFieldRulesMatchVendoredTables` |
| Deletion and Retraction Semantics | Reflected in op field descriptions in `writ.schema` (`set-status`, `approval.verdict: "none"`, `link.relation: "none"`, `label.remove`) |
| Forward Compatibility & Unknown Fields | Not ported, because — substrate-level, covered by writ's own `forward-compatibility.md` |
| Appendix A — GitHub PR Representability (Informative), and its three mapping subsections | Not ported, because — an importer/bridge contract for GitHub, not a vocabulary declaration; written is not that bridge |

### `issue-ops.md`

| Section | Landed as |
| --- | --- |
| Scope & Object Model | `type issue` in `writ.schema`; "Issue shape" above |
| Decisions behind the vocabulary | "Issue shape" and "`issue` — decisions carried across" above |
| Scope boundaries | Not ported, because — cross-references to the comment, project/cycle, identifier, and fold specs |
| Public Issue Intake and Bot Attribution | Not ported, because — policy guidance for external intake bridges and bot attribution; no corresponding field, and written is not an intake bridge |
| Envelope Binding | Not ported, because — substrate-level, covered by writ's `op-envelope.md` |
| 1. `create` | `issue`'s `create 1, update 1` op (shared shape) |
| 2. `update` | `issue`'s `create 1, update 1` op (shared shape) |
| 3. `set-state` (incl. Unknown-State Reference Semantics) | `issue`'s `set-state 1` op; the unknown-reference tolerance is fold/producer behavior, not schema-expressible, and is noted here rather than given its own row |
| 4. `assign` | `issue`'s `assign 1` op |
| 5. `label` | `issue`'s `label 1` op |
| 6. `link` | `issue`'s `link 1` op |
| Fold Implications & Merge Strategies | `internal/schema/testdata/fieldrules/issue.json` (20 rules) |
| Concurrency and Retraction Semantics | Reflected in op field descriptions in `writ.schema` |
| Forward Compatibility & Unknown Fields | Not ported, because — substrate-level |
| Appendix A — GitHub Issue Representability (Informative) | Not ported, because — GitHub bridge/importer contract, not a vocabulary declaration |
| Appendix B — Linear Schema Mapping (Normative), all subsections | Not ported, because — an importer contract for a specific bridge (~1,570 words, marked Normative in the source); written is not that bridge |

### `project-cycle.md`

| Section | Landed as |
| --- | --- |
| Scope & Object Model | `type project` and `type cycle` in `writ.schema` |
| Decisions & Rationale — 1. Membership Direction | `add-issue`/`remove-issue` ops on `project` and `cycle`; "`project` and `cycle` — decisions carried across" above |
| Decisions & Rationale — 2. Add-Wins Concurrency for Membership | `set-observed-remove` strategy on `add-issue`/`remove-issue`'s `issue` field |
| Decisions & Rationale — 3. Reference-Form Aliasing (Producer Rule) | Not schema-expressible — a producer normalization discipline (canonical lowercase, bare-vs-qualified reference form) that fold itself doesn't enforce; noted in prose only, not a field or constraint `writ.schema` can declare |
| Decisions & Rationale — 4. Cycle Dates are UTC Instants Written Together | `cycle.create` and `cycle.set-dates` both requiring `starts_at`/`ends_at` together; "`project` and `cycle` — decisions carried across" above |
| Decisions & Rationale — 5. No Cycle Status Operation | Landed by omission — no `set-status` op on `type cycle` — plus the prose explanation above |
| Decisions & Rationale — 6. No Tombstones in v1 | Landed by omission — no `delete`/tombstone op on `project` or `cycle` — plus the prose explanation above |
| Decisions & Rationale — 7. Deliberate Omissions (No PM-Tool Parity) | Not ported, because — explicitly out-of-scope PM-tool features (leads/owners, priority/health, nested projects, milestones/epics, capacity/velocity, manual ranking); listed in "`project` and `cycle` — decisions carried across" above as a record of the omission, not a field |
| Envelope Binding | Not ported, because — substrate-level |
| Project Operation Vocabulary (table) | The five `op` blocks under `type project` |
| 1. `create` (project) | `project`'s `create 1, update 1` op |
| 2. `update` (project) | `project`'s `create 1, update 1` op |
| 3. `set-status` (project) | `project`'s `set-status 1` op |
| 4. `add-issue` (project) | `project`'s `add-issue 1, remove-issue 1` op |
| 5. `remove-issue` (project) | `project`'s `add-issue 1, remove-issue 1` op |
| Cycle Operation Vocabulary (table) | The five `op` blocks under `type cycle` |
| 1. `create` (cycle) | `cycle`'s `create 1` op |
| 2. `update` (cycle) | `cycle`'s `update 1` op |
| 3. `set-dates` (cycle) | `cycle`'s `set-dates 1` op |
| 4. `add-issue` (cycle) | `cycle`'s `add-issue 1, remove-issue 1` op |
| 5. `remove-issue` (cycle) | `cycle`'s `add-issue 1, remove-issue 1` op |
| Field Rules & Merge Strategies (Project + Cycle Field Rules) | `internal/schema/testdata/fieldrules/project.json` (8 rules), `.../cycle.json` (10 rules) |
| Deletion and Retraction Semantics | Reflected by the deliberate absence of tombstone ops (see Decision 6 row above) |
| Forward Compatibility & Unknown Fields | Not ported, because — substrate-level |
| Appendix A — External Integrations & Bridge Scope (Informative) | Not ported, because — bridge scope statement (GitHub Projects/Milestones unsynchronized), not vocabulary |

### `comments.md`

| Section | Landed as |
| --- | --- |
| Scope | `type comment` in `writ.schema`; "Comment threading and anchoring" above. The anchor format itself and re-anchoring/orphan degradation are explicitly out of this file's own scope (owned by writ's `anchors.md`), so there is nothing of them to port here beyond using the `anchor` value type |
| The collaborative object model | `type comment` object-type declaration |
| Commit-carrier rule (no mirroring) | Not ported as a schema construct — reflected by the deliberate absence of `author`/`created_at`/`timestamp` fields in `comment.create`, which are commit-carried per writ's own envelope rules, not schema fields |
| Operations (table) | The four `op` blocks under `type comment` |
| 1. `create` | `comment`'s `create 1` op |
| 2. `edit` | `comment`'s `edit 1` op |
| 3. `delete` | `comment`'s `delete 1` op |
| 4. `resolve` | `comment`'s `resolve 1` op |
| Threading model, incl. General tree structure | `create`'s `in_reply_to` field; "Comment threading and anchoring" above |
| Fold Implications & Merge Strategies | `internal/schema/testdata/fieldrules/comment.json` (8 rules) |
| Edit, Deletion, and Resolution Semantics | Reflected in op field descriptions in `writ.schema` |
| Representability vs. Authorization | Not ported, because — policy/authorization discussion; consistent with writ having no authorization model at the spec layer |
| Anchor delegation | Not ported as new vocabulary — `create.anchor` uses the catalogue's existing `anchor` value type rather than redeclaring the anchor format |
| Forward compatibility | Not ported, because — substrate-level |
| Out of scope, with forward references | Not ported — a meta-section pointing at other writ specs (ref layout, fold reduction, anchor resolution), not vocabulary of its own |
| Appendix A: GitHub review-comment shapes (informative), all subsections | Not ported, because — GitHub bridge/importer contract, not a vocabulary declaration |

### `documents.md`

| Section | Landed as |
| --- | --- |
| 1. Scope & Object Model | `type document` and `type section` in `writ.schema` |
| 1.1. Why Sections Are First-Class Collaborative Objects | "Documents: sections, multi-value registers, conflicts as data" above |
| 1.2. Section Ordering via Fractional Indexing | `section.position`; "Workflow-state and section ordering via fractional indexing" above |
| 1.3. Document Kinds via Link Relations & Labels | `document.link.relation` declared as `string`, not `enum(...)`; "`document` and `section` — decisions carried across" above |
| 1.4. At-Mentions and Comments | Not ported, because — mention parsing is a client-rendering concern with no schema field; comment attachment to documents/sections already follows from `comment.subject` being generic, not a document-specific declaration |
| 2. Envelope Binding | Not ported, because — substrate-level |
| 3.1. Document Operations (table) | The `create`, `link`, `label` op blocks (and shared `update`) under `type document` |
| `create` (document) | `document`'s `create 1, update 1` op |
| `update` (document) | `document`'s `create 1, update 1` op |
| `link` (document) | `document`'s `link 1` op |
| `label` (document) | `document`'s `label 1` op |
| 3.2. Section Operations (table) | The five `op` blocks under `type section` |
| `create` (section) | `section`'s `create 1` op |
| `edit` (section) | `section`'s `edit 1` op |
| `move` (section) | `section`'s `move 1` op |
| `update` (section) | `section`'s `update 1` op |
| `delete` (section) | `section`'s `delete 1` op |
| 4. Multi-Value Register Reduction for Section Bodies | `section.body`'s `multi-value` strategy on both `create` and `edit`; "Documents: sections, multi-value registers, conflicts as data" above |

Field rules: `internal/schema/testdata/fieldrules/document.json` (7 rules),
`.../section.json` (9 rules) — not tied to one section heading above since
the source file has no separate "Fold Implications" section of its own;
each op's fields are described inline.

### `label-ops.md`

| Section | Landed as |
| --- | --- |
| 1. Scope & Object Model | `type label` in `writ.schema` |
| 1.1. Why Labels Are Collaborative Objects | "`label` — decisions carried across" above |
| 1.2. Label Groups | Not ported, because — explicitly omitted from v1 in the source spec itself; no `group`/`parent_id` field here either, matching that omission |
| 2. Envelope Binding | Not ported, because — substrate-level |
| 3.1. `create` | `label`'s `create 1, update 1` op |
| 3.2. `update` | `label`'s `create 1, update 1` op |
| 4. Fold Semantics & Merge Strategies | `internal/schema/testdata/fieldrules/label.json` (6 rules) |
| 5. Distributed Referential Integrity: Unknown-Label References | Not schema-expressible — fold-time tolerance of unresolved label references is engine/producer behavior, not a field or constraint |

### `workflow-state-ops.md`

| Section | Landed as |
| --- | --- |
| 1. Scope & Object Model | `type workflow-state` in `writ.schema` |
| 1.1. Why States Are Collaborative Objects | "`workflow-state` — decisions carried across" above |
| 1.2. The Five Semantic Types | `type` field's `enum(backlog, unstarted, started, completed, canceled)` |
| 2. Envelope Binding | Not ported, because — substrate-level |
| 3.1. `create` | `workflow-state`'s `create 1, update 1` op |
| 3.2. `update` | `workflow-state`'s `create 1, update 1` op |
| 4. Fold Semantics & Merge Strategies | `internal/schema/testdata/fieldrules/workflow-state.json` (10 rules) |
| 5. Column Ordering & Deterministic Tiebreak | Not schema-expressible — a query/projection sort rule (`ORDER BY position, op_id`), not a field |
| 6. Distributed Referential Integrity: Unknown-State References | Not schema-expressible — fold-time tolerance of unresolved state references is engine/producer behavior |
| 7. Default Starter States | Not ported, per the ticket's Decision 4 — seed data for a fresh repository is a `written init` concern, not a schema declaration |

### `settings-ops.md`

| Section | Landed as |
| --- | --- |
| 1. Scope & Object Model | `type settings` in `writ.schema` |
| 1.1. Scoping | "`settings` — decisions carried across" above |
| 1.2. Singleton Object Identifier | Not schema-expressible — the well-known object id (`00000000000000000000000073657474`) is a producer/runtime convention, not a schema field or constraint |
| 1.3. Estimate Scale Vocabulary & T-Shirt Mapping | `estimate_scale` field's `enum(none, fibonacci, exponential, linear, t-shirt)`; "`settings` — decisions carried across" above |
| 1.4. Cycle Cadence & Boundaries | `timezone`, `cycles_enabled`, `cycle_duration_weeks`, `cycle_start_day`, `cycle_cooldown_weeks` fields |
| 1.5. Unknown Settings Key Preservation | Not schema-expressible — folding unrecognized `set` keys into `unknown_keys` is fold/engine behavior, not a declared field |
| 1.6. Fresh Repository Defaults | Not ported, per the ticket's Decision 4 — default values for a repository with zero `settings` ops are a `written init` concern, not a schema declaration |
| 2. Envelope Binding | Not ported, because — substrate-level |
| 3.1. `set` | `settings`'s `set 1` op |
| 4. Fold Semantics | `internal/schema/testdata/fieldrules/settings.json` (10 rules); "`settings` — decisions carried across" above |

## What's deliberately not ported, summarized

Every "not ported" row above falls into one of four buckets, matching the
ticket's own Decision 4:

1. **Importer/bridge contracts** — the GitHub representability appendices in
   `review-ops.md`, `issue-ops.md`, and `comments.md`, and `issue-ops.md`'s
   Appendix B (Linear Schema Mapping). These are normative mapping rules for
   a specific external system, not vocabulary declarations; written is not
   that bridge.
2. **Substrate, not vocabulary** — every file's `## Envelope Binding` and
   `## Forward Compatibility & Unknown Fields` sections. Already covered by
   writ's own `op-envelope.md` and `forward-compatibility.md`, which
   WRIT-194 does not touch.
3. **Seed data** — `workflow-state-ops.md` §7 (Default Starter States) and
   `settings-ops.md` §1.2, §1.3's t-shirt/number mapping is ported (it's a
   schema-level enum), but §1.6 (Fresh Repository Defaults) and the
   singleton object id (§1.2) are not schema-expressible. These are a
   `written init` concern — recorded here so they aren't lost, not
   discharged by this ticket.
4. **Fold/producer behavior with no corresponding field** — unknown-reference
   tolerance (issue state, labels), column sort order, settings' unknown-key
   folding, and the project/cycle reference-aliasing producer rule. None of
   these are things a `field lww` declaration can express; they're
   documented above so the reasoning isn't lost, but they live in an
   engine's or producer's implementation, not in `writ.schema`.

## Acceptance check (by hand)

Per the ticket's "How to know it worked" item 6: build `writ` at the pinned
commit, `writ init` a scratch repository outside this one, copy
`internal/schema/writ.schema` into it, and confirm `writ schema plan`
exits 0 with a plan creating one schema object binding all ten types. Run
from outside both repositories, e.g. from `$TMPDIR`:

```sh
# 1. Export writ's source at the pinned commit (7714159, WRIT-195) without
#    touching the read-only checkout — no checkout, no worktree, no commit.
git -C /path/to/writ archive 7714159 | tar -x -C /tmp/writ-src

# 2. Build the CLI into a scratch location.
(cd /tmp/writ-src && go build -o /tmp/writ-bin ./cmd/writ)

# 3. Init a scratch repository outside written and writ.
mkdir /tmp/writ-scratch-repo && cd /tmp/writ-scratch-repo
git init -q -b main .
/tmp/writ-bin init

# 4. Copy written's schema over the generated starter and plan it.
cp /path/to/written/internal/schema/writ.schema ./writ.schema
/tmp/writ-bin schema plan
```

Result, run on 2026-09-08 against writ commit `7714159ebe5a` (the exact
commit the `go.mod` pseudo-version `v0.0.0-20260907225418-7714159ebe5a`
resolves to):

```
170 op(s) to append (will create a new schema object): 1 create, 10 define-type, 43 define-op, 116 define-field
run `writ schema apply` to sign and append them
```

Exit code `0`. One `create` op (the schema object itself), ten
`define-type` ops — one per type this document lists — 43 `define-op`, and
116 `define-field`, matching `internal/schema/schema_test.go`'s own count
(see that file's comment on the ticket's "107" figure being a
per-type-breakdown-sums-to-116 arithmetic slip, not a mismatch in any
individual type's rule count).
