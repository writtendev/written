# @writtendev/ui

Shared React component package for written's web client(s).

This package ships as **source, not a compiled library.** Each consumer's
build scans it like its own code. That is what makes Tailwind work as a
library: there is no pre-built stylesheet to ship, so the consumer's own
Tailwind pass generates the CSS for whatever components it actually
imports.

That one fact drives two rules for everything in this package:

1. **No dynamically constructed class names.** `text-${color}` is
   invisible to Tailwind's scanner. Every class name must appear as a
   literal string somewhere in the source, or the consumer's build will
   never generate the CSS for it.
2. **All theming through CSS custom properties.** Components reference
   variables, never raw values — no hex codes, no pixel literals, no named
   colors inline in a component.

See the repository's `AGENTS.md` `## Dispatch` → `### Review invariants`
for the full list this package is held to.

## Consumers

- `web/`, this repo's embedded browser client for `written web`, built
  with Vite and embedded in the Go binary via `go:embed`.

## Layout

- **`src/`** is what ships. It is the only directory a consumer's
  `@source` points at.
- **`dev/`** is a local dev harness (entry point, root `App`, `index.css`)
  for building and previewing what's in `src/` in isolation. It ships to
  nobody. `index.html` lives here too — Vite's `root` points at `dev/` —
  because it exists only to boot the harness. That same `root` also
  confines Tailwind's automatic source detection to `dev/`, so
  `dev/index.css` adds `@source '../src'` to pull `src/` into the
  harness's own build.
- **`src/tokens.css`** is the design system: a single `@theme static`
  block of CSS custom properties for color, type, spacing, and radii.
  `@source` only scans for class names and does not process CSS, so
  pointing a consumer's Tailwind build at this package with `@source` is
  not enough on its own — a consumer must also `@import` `tokens.css`
  into its own Tailwind entry stylesheet (`dev/index.css` does exactly
  this for the harness). That `@import` must come **before** any `@theme`
  block the consumer declares of its own: `tokens.css` resets `--color-*`
  to `initial` before redeclaring it, and `@theme` resets apply in source
  order, so a consumer `@theme` color declared _above_ the `@import` gets
  deleted by it — the utility silently doesn't compile, with a green
  build and no error.

## Development

From the monorepo root:

```sh
npm run dev -w @writtendev/ui   # dev harness at http://localhost:5173
make check                      # lint, format, typecheck, and build the
                                 # harness — the gate this package is held to
```

Fixing formatting locally: `npm run format` (root).

There is no `npm run check` here — `ui/` has no standalone CI; it is
checked as part of the monorepo's `make check` (see the root `AGENTS.md`).

## License

Apache 2.0. See [`../LICENSE`](../LICENSE).
