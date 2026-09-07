#!/usr/bin/env node
// Verifies a `ui/vX.Y.Z` release tag actually matches the tree it's tagging,
// before `release-ui.yml` runs `npm publish` against it. Takes the tag from
// process.argv[2] or $RELEASE_TAG (the Makefile passes it as `TAG=`, which
// becomes the first positional arg to this script). Asserts:
//   - the tag has the shape `ui/vX.Y.Z` (plain semver only — see below);
//   - `X.Y.Z` equals ui/package.json's `version`;
//   - package-lock.json's `packages.ui.version` equals it too — belt and
//     braces with check-exports.mjs, which already checks manifest-vs-lock
//     drift on every `make check-ts` run; this script re-checks it here
//     because it is the one that actually runs at publish time, and a tag
//     pushed well after the merge that bumped the version could in
//     principle be publishing against a lockfile that has since drifted
//     again (e.g. a hand-edit that skipped `npm install --package-lock-only`).
//
// What this does NOT assert (see AGENTS.md's `## Dispatch` section and
// WRTN-44's ticket plan for the full reasoning):
//   - That the version is unpublished. npm's own `EPUBLISHCONFLICT` is that
//     gate, and it fails loudly on `npm publish` itself — duplicating it
//     here would just be a slower, less authoritative copy of npm's check.
//   - That a version bump *should* have happened for the changes in this
//     release. That is the seventh `ui/`-scoped review invariant in
//     AGENTS.md, a human call made at review time, not something a script
//     can determine from the tree alone.
//
// Deliberately rejects prerelease and build-metadata tags (`ui/v0.3.0-rc.1`,
// `ui/v0.3.0+abc`), not just malformed ones: release-ui.yml's `npm publish`
// step passes no `--tag`, so npm would publish any accepted version straight
// to the `latest` dist-tag — a prerelease published that way would install
// for every downstream consumer as if it were the release. CONTRIBUTING.md's
// `## Tagging` documents exactly one shape, `ui/vX.Y.Z`, so this only
// accepts what's documented rather than growing `--tag` handling this
// ticket didn't ask for.

import { readFileSync } from 'node:fs'
import path from 'node:path'

// Rooted at import.meta.dirname, not process.cwd(): this script must give
// the same answer regardless of the directory `make` or `node` was invoked
// from.
const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const uiRoot = path.join(repoRoot, 'ui')

const tag = process.argv[2] || process.env.RELEASE_TAG || ''

const errors = []

const tagMatch = /^ui\/v(\d+\.\d+\.\d+)$/.exec(tag)

if (!tagMatch) {
  errors.push(
    `tag "${tag}" does not match the required shape "ui/vX.Y.Z" (e.g. "ui/v0.2.0"); ` +
      `prerelease and build-metadata suffixes are rejected because npm publish is given no --tag`,
  )
} else {
  const tagVersion = tagMatch[1]

  const uiPkg = JSON.parse(readFileSync(path.join(uiRoot, 'package.json'), 'utf8'))
  if (uiPkg.version !== tagVersion) {
    errors.push(
      `tag "${tag}" names version ${tagVersion}, but ui/package.json's version is ${uiPkg.version}`,
    )
  }

  const lock = JSON.parse(readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'))
  const lockedVersion = lock.packages?.ui?.version
  if (lockedVersion !== tagVersion) {
    errors.push(
      `tag "${tag}" names version ${tagVersion}, but package-lock.json records ui@${lockedVersion ?? '(missing)'}`,
    )
  }
}

if (errors.length > 0) {
  console.error('ui/scripts/check-release-tag.mjs failed:\n')
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

console.log(`ui/scripts/check-release-tag.mjs: tag "${tag}" matches package.json and the lockfile`)
