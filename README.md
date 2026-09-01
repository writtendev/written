# written

The reference terminal user interface (TUI) client for [Writ](https://github.com/writtendev/writ).

Written delivers a fast, keyboard-first workflow for code reviews, inline
discussions, and issue management in the terminal, operating directly against
your local git repository with zero network latency.

## Key Features

- **Terminal-Native Code Review:** Browse reviews, explore unified/split diffs,
  and participate in inline comment threads without leaving the terminal.
- **Local-First & Reactive:** Single-digit millisecond UI responses powered by
  Writ's append-only git operation logs and real-time event streaming.
- **Inbox-Driven:** Focus on what needs your attention now — pending review
  requests, unread threads, and assigned tasks.
- **Strict Public API Consumer:** Written consumes Writ's engine as an ordinary
  client with no private privileges or proprietary formats.

## Documentation

- [Product Vision & Strategy](VISION.md) — What Written is, what it is not, and the sequence of work.
- [Architecture & Settled Decisions](ARCHITECTURE.md) — Internal layout, technical decisions, and component boundaries.
- [Contributing Guide](CONTRIBUTING.md) — Development workflow, DCO requirements, and guidelines.
- [Agent Brief](AGENTS.md) — Instructions for AI coding assistants and automation agents.

## Quickstart

### Prerequisites

- Go 1.25+
- Git 2.40+

### Building from Source

```bash
git clone https://github.com/writtendev/written.git
cd written
make build
```

Run tests:

```bash
make test
```

Install locally:

```bash
make install
```

## License

[Apache-2.0](LICENSE)
