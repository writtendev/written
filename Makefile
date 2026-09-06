PKG := github.com/writtendev/written

VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
LDFLAGS = -X $(PKG)/internal/app.Version=$(VERSION)

.PHONY: build build-ts test race lint check-go check-ts check install clean

build:
	go build ./...

# The TypeScript half of the release build: a static bundle `written web`
# embeds at compile time. This is a Makefile target (not a bare npm command
# in CI's YAML) so the always-on `build` job runs nothing that `make` doesn't
# also know how to run — see AGENTS.md's `## Dispatch` review invariants.
build-ts:
	npm run build --workspaces --if-present

test:
	go test ./...

race:
	go test -race ./...

lint:
	golangci-lint run ./...

# check-go and check-ts are what CI's path-filtered jobs run, so a ui/web-only
# change never pays for the Go suite and vice versa. check runs both, and is
# the one command a release build (or a change touching both halves) needs.
check-go: test race lint

check-ts:
	@node -e "const r=require('./package.json');const missing=r.workspaces.filter(w=>{try{return !require('./'+w+'/package.json').scripts.typecheck}catch(e){return true}});if(missing.length){console.error('missing typecheck script in workspace(s): '+missing.join(', '));process.exit(1)}"
	npm run typecheck --workspaces --if-present

check: check-go check-ts

install: ## Build and install written into Go's bin dir
	@GOBIN="$$(go env GOBIN)"; \
	if [ -z "$$GOBIN" ]; then GOBIN="$$(go env GOPATH)/bin"; fi; \
	go install -ldflags "$(LDFLAGS)" ./cmd/written; \
	printf 'installed %s to %s\n' '$(VERSION)' "$$GOBIN/written"

clean:
	go clean
