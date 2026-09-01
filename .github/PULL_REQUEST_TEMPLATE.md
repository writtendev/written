**What this changes and why**

**Checklist**

- [ ] `go build ./...` and `go test -race ./...` pass
- [ ] Strictly consumes Writ's public engine API (`github.com/writtendev/writ/engine`) with no private access
- [ ] No new exported Go APIs (`internal/` packages only)
- [ ] No new dependency without a reason stated in this description
- [ ] Commits are signed off (DCO)
