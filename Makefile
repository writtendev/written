PKG := github.com/writtendev/written

VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
LDFLAGS = -X $(PKG)/internal/app.Version=$(VERSION)

# Kept in sync with the `golangci-lint-action` version CI installs
# (.github/workflows/ci.yml, `go` job). `lint` asserts against this so a
# stale or newer binary on a contributor's PATH fails loudly here instead of
# passing locally and disagreeing with CI.
GOLANGCI_LINT_VERSION := v1.64.8

# Explicit package roots, not `./...`. This module's Go code lives entirely
# under cmd/ and internal/ (see AGENTS.md's `## Layout`); `./...` also walks
# node_modules/, and an npm dependency can ship Go source with no go.mod of
# its own to draw a module boundary (eslint -> file-entry-cache -> flat-cache
# -> flatted, which vendors golang/pkg/flatted/flatted.go). That would make
# `go build/test/race` and `golangci-lint run` compile, run and lint
# third-party code that arrived via npm, and make the Go package set differ
# by whether `npm ci` had been run — exactly what `## Dispatch`'s
# independent-toolchains invariant forbids. Spelling out the roots keeps
# node_modules out of scope regardless of what any dependency vendors, with
# no dependency on node_modules being absent or on any npm package's
# internals.
GO_PACKAGES := ./cmd/... ./internal/...

.PHONY: build build-ts test race lint check-go check-ts check install clean check-node-modules check-go-packages

# GO_PACKAGES above is a hand-written allowlist, not a derivation, so it can
# drift silently: a first-party Go package added anywhere else (e.g. a `.go`
# file under web/ to drive a `//go:embed web/dist` — go:embed patterns can't
# contain `..`, so ARCHITECTURE decision 5's "one binary" mechanism needs
# one) would simply never be built, tested, or linted by GO_PACKAGES, while
# CI's `**/*.go` path filter still fires the `go` job that's silently
# skipping it. This fails loudly instead of letting that happen quietly:
# any `.go` file outside node_modules/ (pruned at any depth — third-party,
# see GO_PACKAGES's comment above) and outside .claude/worktrees/ (nested
# per-ticket worktrees, gitignored, not this module's own code) that also
# isn't under cmd/ or internal/ trips it. Keep the two path exclusions
# below in sync with GO_PACKAGES if that variable ever grows a third root.
check-go-packages:
	@stray="$$(find . \( -name node_modules -o -path './.claude/worktrees' \) -prune -o -type f -name '*.go' -print | grep -vE '^\./(cmd|internal)/')"; \
	if [ -n "$$stray" ]; then \
		echo "Go file(s) outside cmd/ and internal/ — not covered by GO_PACKAGES in Makefile:" >&2; \
		echo "$$stray" >&2; \
		exit 1; \
	fi

build: check-go-packages
	go build $(GO_PACKAGES)

# Fails naming the command to run instead of letting build-ts/check-ts die
# partway through with a bare "vite: command not found". Checks the actual
# binaries those targets need, not just that node_modules/ exists — a
# partial or stale install (an interrupted `npm ci`, a manifest changed
# after the last install) is the same failure as no install at all.
#
# Verifies, does not install: `make check` is a gate, not a package
# manager. Auto-running `npm ci` here would mutate node_modules on every
# invocation and could silently paper over the lockfile drift that
# check-ts's own `npm ci --dry-run` step exists to catch. Same treatment
# `lint` already gives golangci-lint above — consistency, not new policy.
check-node-modules:
	@for bin in vite tsc eslint prettier; do \
		if [ ! -x "node_modules/.bin/$$bin" ]; then \
			echo "node_modules is missing or incomplete — run 'npm ci' (see README's Prerequisites)" >&2; \
			exit 1; \
		fi; \
	done

# The TypeScript half of the release build: a static bundle `written web`
# embeds at compile time. This is a Makefile target (not a bare npm command
# in CI's YAML) so the always-on `build` job runs nothing that `make` doesn't
# also know how to run — see AGENTS.md's `## Dispatch` review invariants.
# `check-ts` also depends on it, so `make check` covers it too — see that
# target's comment.
#
# `--if-present` alone lets a missing/renamed/typo'd `build` script in `web`
# exit 0 having produced nothing — the invariant-7 defect. `ui/` deliberately
# has no `build` script (see ui/package.json's `buildless` field), so this
# can't require every workspace to declare one the way check-ts's guard
# does; instead it derives the workspace list from root `package.json`
# (like check-ts) and requires each workspace to either declare `build` or
# explicitly opt out with `"buildless": true`, so a workspace silently
# missing both — not named in any allowlist — fails loudly instead of being
# skipped.
build-ts: check-node-modules
	@node -e "const r=require('./package.json');const missing=r.workspaces.filter(w=>{let p;try{p=require('./'+w+'/package.json')}catch(e){return true}return !(p.scripts&&p.scripts.build)&&p.buildless!==true});if(missing.length){console.error('workspace(s) with no build script and no buildless:true opt-out: '+missing.join(', '));process.exit(1)}"
	npm run build --workspaces --if-present

test:
	go test $(GO_PACKAGES)

race:
	go test -race $(GO_PACKAGES)

# See GOLANGCI_LINT_VERSION above: asserts the binary on PATH matches what
# CI pins before running it, so version skew fails here instead of passing
# quietly and disagreeing with CI's `golangci-lint-action` pin.
lint:
	@v="$$(golangci-lint version 2>/dev/null | grep -oE 'v?[0-9]+\.[0-9]+\.[0-9]+' | head -1)"; \
	case "$$v" in v*) ;; *) v="v$$v" ;; esac; \
	if [ "$$v" != "$(GOLANGCI_LINT_VERSION)" ]; then \
		echo "golangci-lint $(GOLANGCI_LINT_VERSION) required (CI's pin), found $${v:-none found} on PATH" >&2; \
		exit 1; \
	fi
	golangci-lint run $(GO_PACKAGES)

# check-go and check-ts are what CI's path-filtered jobs run, so a ui/web-only
# change never pays for the Go suite and vice versa. check runs both, and is
# the one command a release build (or a change touching both halves) needs.
check-go: check-go-packages test race lint

# check-ts depends on build-ts so that `make check` actually covers what
# CI's always-on `build` job runs: without this, a change that breaks
# `vite build` (a missing entry file, a bad `rollupOptions.input`) can pass
# `make check` and only fail in CI, which is exactly the drift `## Dispatch`
# promises `make check` rules out. build-ts already needs npm/node the same
# as the rest of this target, so this does not give check-go a Node
# dependency — see `## Dispatch`'s independent-toolchains invariant.
#
# build-ts's own check-node-modules prerequisite runs first (before any of
# the steps below), so a fresh clone sees the "run npm ci" message rather
# than build-ts's own failure. `--max-warnings 0` and `format:check` are
# what make eslint/prettier warnings a hard failure instead of a quiet
# pass; `build:harness` runs `ui`'s dev harness (and its `@source '../src'`
# Tailwind wiring) through a real `tsc`+`vite` build, so it fails on
# anything that breaks that build — but not on a typo'd `@source` path by
# itself: Tailwind resolves an unmatched `@source` glob to zero classes
# rather than an error, so that specific mistake has no gate today. See
# ui/package.json's `build:harness` script and AGENTS.md's `## Dispatch`
# section.
check-ts: build-ts
	@# `npm ci` is CI's real gate (its lock-vs-manifest check), and it isn't
	@# a Makefile target — see AGENTS.md's `## Dispatch` section. `--dry-run`
	@# runs that same check without touching node_modules, so a dependency
	@# added to a workspace's package.json without a regenerated
	@# package-lock.json fails here instead of only in CI.
	npm ci --dry-run
	@node -e "const r=require('./package.json');const missing=r.workspaces.filter(w=>{try{return !require('./'+w+'/package.json').scripts.typecheck}catch(e){return true}});if(missing.length){console.error('missing typecheck script in workspace(s): '+missing.join(', '));process.exit(1)}"
	npm run typecheck --workspaces --if-present
	npm run lint
	npm run format:check
	npm run build:harness -w @writtendev/ui

check: check-go check-ts

install: ## Build and install written into Go's bin dir
	@GOBIN="$$(go env GOBIN)"; \
	if [ -z "$$GOBIN" ]; then GOBIN="$$(go env GOPATH)/bin"; fi; \
	go install -ldflags "$(LDFLAGS)" ./cmd/written; \
	printf 'installed %s to %s\n' '$(VERSION)' "$$GOBIN/written"

clean:
	go clean
