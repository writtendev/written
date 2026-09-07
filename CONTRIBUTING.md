# Contributing to Written

Read [VISION.md](VISION.md) and [ARCHITECTURE.md](ARCHITECTURE.md) before
proposing or implementing anything. VISION.md is what this project is for
and what it deliberately is not; ARCHITECTURE.md is the record of settled
decisions and the reasoning behind them. If a decision you would relitigate is
already in one of those two documents, the document wins — bring new
information or drop it, but do not reopen it from scratch in a PR.

For house rules and repository layout that apply to agents and humans alike,
see [AGENTS.md](AGENTS.md).

## License

Written is licensed under Apache-2.0 (see `LICENSE`). By contributing, you
agree your contribution is provided under that license.

- **No per-file license headers:** `LICENSE` at the repository root governs
  the entire tree. Apache-2.0 does not require a header on every file to apply.
- **No `NOTICE` file for now:** Add a `NOTICE` file only when bundled
  third-party code requires one.

## The public-API constraint

Written is an unprivileged consumer of `github.com/writtendev/writ/engine`.
Any feature or data requirement must be satisfied through the engine's public
API. PRs must not introduce workarounds that access internal engine storage or
bypass public contracts.

## Developer Certificate of Origin (DCO)

Every commit must be signed off, certifying you wrote it or otherwise have
the right to submit it under the project's license (Apache-2.0).

Configure the repository's hook to sign off commits automatically:

```bash
git config core.hooksPath .githooks
```

This uses `.githooks/prepare-commit-msg` to append a `Signed-off-by` trailer
when not already present, sourced from your `user.name` and `user.email`.

Alternatively, sign off manually:

```bash
git commit -s
```

The trailer format is `Signed-off-by: Your Name <your.email@example.com>`.
The sign-off email must match the commit author's email (and for GitHub pull
requests, your GitHub account email so it survives squash merges). Use your
real name — no pseudonyms or anonymous contributions. If you forgot on your
last commit, `git commit --amend -s` fixes it. The DCO check on pull requests
enforces this on every commit.

## Build and test

Two toolchains — Go at the repository root, and an npm workspace (`ui/`,
`web/`) for the TypeScript half. Before your first `make check`:

1. `npm ci` — installs the npm workspace's dependencies. `make check-ts`
   (and `make build-ts`) guard for this and fail naming this exact command
   if `node_modules` is missing or incomplete; they do not run it for you.
2. [golangci-lint](https://golangci-lint.run) v1.64.8 on `PATH` — the exact
   version CI pins (see README's Prerequisites). `check-go`'s lint step
   asserts this version and does not install it for you either.

Then one command checks both halves:

```bash
make check
```

Run the halves separately when you only touched one: `make check-go` (test,
race, lint) or `make check-ts` (the `node_modules` guard above, a
lockfile-drift check, typecheck across the `ui`/`web` workspaces,
`eslint . --max-warnings 0` and `prettier --check` at the repo root
covering `ui/` and `web/`, and `ui`'s dev-harness build). `make build` and
`make test` remain for a plain Go build/test loop. Fix formatting with
`npm run format` (root).

CI runs `make check-go` on Go changes, `make check-ts` on `ui`/`web`
changes, and a release `build` job that always runs both — see `AGENTS.md`'s
`## Dispatch` section for the review invariant this depends on (Go and
TypeScript must stay independently testable).

## Tagging

Two independently versioned things live in this repo, tagged separately:

- `vX.Y.Z` — the Go binary (`written`).
- `ui/vX.Y.Z` — the `ui` package (`@writtendev/ui`).

This mirrors how Go itself tags submodules, so a `<module-path-prefix>/vX.Y.Z`
tag reads as familiar rather than repo-specific cleverness.

Pushing a `ui/vX.Y.Z` tag now does something: it fires
`.github/workflows/release-ui.yml`, which gates on `make check-ui-release`
(the full TypeScript check suite, plus a check that the tag, `ui/package.json`'s
`version`, and the lockfile agree) and, once that passes, publishes
`@writtendev/ui` to npm with provenance on. Pushing this tag is a
maintainer-only action: it requires both push rights on this repo and
`@writtendev/ui` publish credentials (held as the `NPM_TOKEN` repository
secret), and it should only follow a merged PR that already bumped
`ui/package.json`'s `version` per `ui/README.md`'s `## Versioning`.
