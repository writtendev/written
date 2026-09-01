PKG := github.com/writtendev/written

# Resolve the install dir the way the go tool does: GOBIN when set, else GOPATH/bin.
GOBIN := $(shell go env GOBIN)
ifeq ($(GOBIN),)
GOBIN := $(shell go env GOPATH)/bin
endif

VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
LDFLAGS = -X $(PKG)/internal/app.Version=$(VERSION)

.PHONY: build test race install clean

build:
	go build ./...

test:
	go test ./...

race:
	go test -race ./...

install: ## Build and install written into Go's bin dir
	go install -ldflags "$(LDFLAGS)" ./cmd/written
	@printf 'installed %s to %s\n' '$(VERSION)' '$(GOBIN)/written'

clean:
	go clean
