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
- A consumer outside this repo, on its own release cadence.

## Exports

`ui/package.json`'s `exports` map is the entire public surface. Anything
not listed here is not importable, on purpose — see `ui/scripts/check-exports.mjs`,
which fails `make check-ts` if the map ever points at a file that doesn't
exist, lands outside `files`, or drifts from the lockfile's recorded
version.

| Specifier                     | Resolves to        | What it's for                          |
| ----------------------------- | ------------------ | -------------------------------------- |
| `@writtendev/ui`              | `./src/index.ts`   | Components — the barrel file           |
| `@writtendev/ui/tokens.css`   | `./src/tokens.css` | The design system, for a CSS `@import` |
| `@writtendev/ui/package.json` | `./package.json`   | Tooling that reads package metadata    |

`@writtendev/ui/api` → `./src/api/index.ts` is **reserved**, by name and
target, for the typed API client (WRTN-40). It is not a live entry yet —
pointing an entry at a file that doesn't exist is exactly the "export map
that lies" this gate rejects, so the slot is documented here rather than
added early; WRTN-40 adds the entry and the module together. It is a
subpath rather than folded into the root barrel because the API client
pulls in fetch plumbing and request/response types a purely
presentational consumer has no use for — a separate subpath keeps those
out of the root barrel.

There are no per-component subpaths and no wildcard keys. The component
surface is capped at three (see the review invariants above), so one
barrel answers "what does this package export" by reading one file; a
wildcard would silently reopen every file under `src/` as a public import
path, which is what the gate exists to prevent.

### Consuming this package

The consumption story has two independent halves. Getting one without the
other produces a page that looks broken in a different way each time, so
both are needed and neither substitutes for the other:

1. **`@import '@writtendev/ui/tokens.css'`** — goes through the `exports`
   map above. Pulls in the design system's CSS custom properties. This
   `@import` must come **before** any `@theme` block the consumer declares
   of its own: `tokens.css` resets `--color-*` to `initial` before
   redeclaring it, and `@theme` resets apply in source order, so a
   consumer `@theme` color declared _above_ the `@import` gets deleted by
   it — the utility silently doesn't compile, with a green build and no
   error.
2. **`@source '<path to this package's src>'`** — does **not** go through
   the `exports` map. It is a filesystem path, not a package specifier:
   it tells the consumer's Tailwind build to scan this package's source
   for class names by walking the filesystem, not by resolving `exports`.
   A bare `@source '@writtendev/ui'` or `@source '@writtendev/ui/src'`
   does **not** work in Tailwind 4 — it builds clean and generates zero
   classes, silently. An in-repo consumer should point at the workspace
   directory directly rather than through `node_modules`, as below.

The two consumers' `@source` lines differ in more than depth: the
in-repo `web/` consumer points straight at the `ui/` workspace directory,
while the outside consumer points into its own `node_modules` (where
`@writtendev/ui` is a real npm-installed directory, not a symlink):

```css
/* web/, in this repo — path relative to the CSS file */
@import 'tailwindcss';
@import '@writtendev/ui/tokens.css';
@source '../../ui/src';
```

```css
/* a consumer outside this repo, npm-installed */
@import 'tailwindcss';
@import '@writtendev/ui/tokens.css';
@source '../node_modules/@writtendev/ui/src';
```

Failure modes, so a broken page is easy to place: `@import` alone gives
tokens and no component classes; `@source` alone gives component classes
referencing tokens that do not exist.

## Versioning

SemVer, starting at `0.1.0`. `0.0.0` is npm's "unset" placeholder and
communicates nothing; `0.x` because the surface is genuinely unstable —
there are exactly two consumers today, but they're on independent release
cadences (the web client embeds in a Go binary on its own cadence; the
other consumer deploys on its own), so they can be on different revisions
of this package at the same time. That's the situation versioning exists
for.

While `0.x`:

- **Bump the minor** for anything a consumer must react to — an `exports`
  entry removed or repointed, an incompatible prop change, a token
  removed or renamed.
- **Bump the patch** for a purely additive or internal change — a new
  component behind an existing entry, a new token, a fix.
- **When**: any change touching `ui/src/**` or `ui/package.json`'s
  `exports`. Not for `ui/dev/**`, `ui/scripts/**`, or this README alone —
  those ship to nobody.
- **How**: edit `version` in `ui/package.json`, then run
  `npm install --package-lock-only` from the repo root. The lockfile
  records each workspace's version and does not update itself;
  `ui/scripts/check-exports.mjs` fails `make check-ts` if the two drift.

Whether a change _should_ have bumped the version is a review call, not
something `make check` can determine on its own — see the repository's
`AGENTS.md` `## Dispatch` → `### Review invariants`.

This is not the npm publishing pipeline — `private: true` stays, and how
this package is distributed to a consumer (vendored, workspace-linked) is
decided separately.

## Layout

- **`src/`** is what ships. It is the only directory a consumer's
  `@source` points at. Every module here must be import-time pure — no
  code that runs a side effect merely by being imported (registering a
  listener, mutating a module-level singleton, logging on load).
  `package.json`'s `sideEffects: ["**/*.css"]` tells a consumer's bundler
  that anything outside a `.css` file is safe to drop if nothing imports
  it; a component that violates this can be silently tree-shaken out of a
  consumer's production bundle on an otherwise green build, with no error
  anywhere in the chain.
- **`dev/`** is a local dev harness (entry point, root `App`, `index.css`)
  for building and previewing what's in `src/` in isolation. It ships to
  nobody. `index.html` lives here too — Vite's `root` points at `dev/` —
  because it exists only to boot the harness. That same `root` also
  confines Tailwind's automatic source detection to `dev/`, so
  `dev/index.css` adds `@source '../src'` to pull `src/` into the
  harness's own build. The harness's only page is `dev/Specimen.tsx` — see
  `## Specimen page` below.
- **`scripts/`** holds gate scripts run by `make check-ts`
  (`check-exports.mjs` — see `## Exports` above; `check-tokens.mjs` — see
  `## Specimen page` below). It ships to nobody.
- **`src/tokens.css`** is the design system: a single `@theme static`
  block of CSS custom properties for color, type, spacing, and radii.
  See `## Exports` above for how a consumer reaches it and the two-halves
  consumption pattern (`dev/index.css` does exactly that for the harness).

## Specimen page

`ui/dev/Specimen.tsx` is the dev harness's only page: the living style
guide for `tokens.css` — color swatches, the type ramp (all three
families and all seven sizes), the spacing scale, the radii. This is the
reason there is no Storybook here; Storybook stays out of scope until
there are external consumers, and until then this page is how anyone sees
what the design system currently is.

It reads from `tokens.css`, never duplicates it. Token _names_ come from a
`?raw` import of `../src/tokens.css`, parsed by `ui/dev/tokens.ts` (the
one place that parsing regex lives — both the page and the gate below
import it, so there is exactly one implementation to keep correct). Every
_value_ comes from the live cascade — `var(--name)` for what's rendered,
`getComputedStyle(document.documentElement)` for what's printed next to
it. Changing a value in `tokens.css`, or adding a token, changes the page
with no other edit; deleting one removes its row, which is the page's
compensating control for the one thing the gate below cannot check (see
its own header comment).

`ui/scripts/check-tokens.mjs` is the build-time backstop, run by
`make check-ts` right after `build:harness` produces a fresh `ui/dist`.
Independent of that build, it first checks self-consistency: a loose,
namespace-independent scan of `tokens.css`'s own source must agree
exactly with what the shared parser found, which catches a token declared
in a shape the parser can't match, in any namespace. It then cross-checks
`tokens.css` against the built stylesheet in both directions: every name
`tokens.css` declares must appear in the built `:root, :host` block, and
— the harder direction — every name the build emits inside a
`--color-*`/`--text-*`/`--radius-*` reset namespace must trace back to a
declaration the shared parser actually found, which is what catches a
design value reaching the built stylesheet from outside `tokens.css`
entirely. Neither direction subsumes the other. It hardcodes no token
names of its own; see the script's header for exactly what it does and
does not catch.

## Development

From the monorepo root:

```sh
npm run dev -w @writtendev/ui   # dev harness at http://localhost:5173 —
                                 # opens on the specimen page
make check                      # lint, format, typecheck, check the
                                 # exports map, build the harness, and
                                 # cross-check tokens.css against it —
                                 # the gate this package is held to
```

Fixing formatting locally: `npm run format` (root).

There is no `npm run check` here — `ui/` has no standalone CI; it is
checked as part of the monorepo's `make check` (see the root `AGENTS.md`).

## License

Apache 2.0. See [`../LICENSE`](../LICENSE).
