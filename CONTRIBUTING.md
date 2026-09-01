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

One toolchain, one command:

```bash
go build ./...
go test ./...
```

CI runs these tests plus `golangci-lint` and `go test -race` on every PR.
