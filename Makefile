PKG := github.com/writtendev/written

# Resolve the install dir the way the go tool does: GOBIN when set, else GOPATH/bin.
GOBIN := $(shell go env GOBIN)
ifeq ($(GOBIN),)
GOBIN := $(shell go env GOPATH)/bin
endif

VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
LDFLAGS = -X $(PKG)/internal/app.Version=$(VERSION)

.PHONY: build test race lint check-go check-ts check install clean

build:
	go build ./...

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
	npm run typecheck --workspaces --if-present

check: check-go check-ts

install: ## Build and install written into Go's bin dir
	go install -ldflags "$(LDFLAGS)" ./cmd/written
	@printf 'installed %s to %s\n' '$(VERSION)' '$(GOBIN)/written'

clean:
	go clean
