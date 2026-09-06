PKG := github.com/writtendev/written

VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
LDFLAGS = -X $(PKG)/internal/app.Version=$(VERSION)

# Kept in sync with the `golangci-lint-action` version CI installs
# (.github/workflows/ci.yml, `go` job). `lint` asserts against this so a
# stale or newer binary on a contributor's PATH fails loudly here instead of
# passing locally and disagreeing with CI.
GOLANGCI_LINT_VERSION := v1.64.8

.PHONY: build build-ts test race lint check-go check-ts check install clean

build:
	go build ./...

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
build-ts:
	@node -e "const r=require('./package.json');const missing=r.workspaces.filter(w=>{let p;try{p=require('./'+w+'/package.json')}catch(e){return true}return !(p.scripts&&p.scripts.build)&&p.buildless!==true});if(missing.length){console.error('workspace(s) with no build script and no buildless:true opt-out: '+missing.join(', '));process.exit(1)}"
	npm run build --workspaces --if-present

test:
	go test ./...

race:
	go test -race ./...

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
	golangci-lint run ./...

# check-go and check-ts are what CI's path-filtered jobs run, so a ui/web-only
# change never pays for the Go suite and vice versa. check runs both, and is
# the one command a release build (or a change touching both halves) needs.
check-go: test race lint

# check-ts depends on build-ts so that `make check` actually covers what
# CI's always-on `build` job runs: without this, a change that breaks
# `vite build` (a missing entry file, a bad `rollupOptions.input`) can pass
# `make check` and only fail in CI, which is exactly the drift `## Dispatch`
# promises `make check` rules out. build-ts already needs npm/node the same
# as the rest of this target, so this does not give check-go a Node
# dependency — see `## Dispatch`'s independent-toolchains invariant.
check-ts: build-ts
	@node -e "const r=require('./package.json');const missing=r.workspaces.filter(w=>{try{return !require('./'+w+'/package.json').scripts.typecheck}catch(e){return true}});if(missing.length){console.error('missing typecheck script in workspace(s): '+missing.join(', '));process.exit(1)}"
	@# `npm ci` is CI's real gate (its lock-vs-manifest check), and it isn't
	@# a Makefile target — see AGENTS.md's `## Dispatch` section. `--dry-run`
	@# runs that same check without touching node_modules, so a dependency
	@# added to a workspace's package.json without a regenerated
	@# package-lock.json fails here instead of only in CI.
	npm ci --dry-run
	npm run typecheck --workspaces --if-present

check: check-go check-ts

install: ## Build and install written into Go's bin dir
	@GOBIN="$$(go env GOBIN)"; \
	if [ -z "$$GOBIN" ]; then GOBIN="$$(go env GOPATH)/bin"; fi; \
	go install -ldflags "$(LDFLAGS)" ./cmd/written; \
	printf 'installed %s to %s\n' '$(VERSION)' "$$GOBIN/written"

clean:
	go clean
