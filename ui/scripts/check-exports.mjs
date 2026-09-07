#!/usr/bin/env node
// Verifies ui/package.json's `exports` map is not a lie: every entry
// resolves through Node's *real* module resolver — not a re-implementation
// of it — to a file that exists and lands inside `files`, and that the
// lockfile's recorded version for this workspace matches package.json's
// `version`. Runs as a step of `make check-ts`, before `build:harness`
// (ui's own harness build), so a broken map reports there as a map error
// rather than a Vite resolve failure. That ordering guarantee is scoped to
// `build:harness`: `check-ts` depends on `build-ts`, which already runs
// web's `vite build` before this script does — so once web/ imports
// `@writtendev/ui`, a broken map can surface there first, as a Vite
// resolve failure instead. Either way this gate still fails closed; only
// which error a contributor sees first changes. See the Makefile's
// `check-ts` comment for the full ordering.
//
// What this does NOT assert (see AGENTS.md's `## Dispatch` section and
// WRTN-37's ticket plan for the full reasoning):
//   - Completeness. Nothing here knows a consumer wanted an entry that
//     isn't in the map — a missing entry is a loud build failure the first
//     time something imports it, and that is the mitigation.
//   - A typo'd `@source` path in a consumer's Tailwind config. Unrelated
//     mechanism: `@source` is a filesystem glob, not an `exports` lookup,
//     and Tailwind resolves an unmatched glob to zero classes rather than
//     an error. Pre-existing gap, out of scope here.
//   - Whether a version bump *should* have happened. That is the seventh
//     `ui/`-scoped review invariant in AGENTS.md, checked by a reviewer,
//     not by this script. This gate only checks that a bump, once made in
//     package.json, was carried into the lockfile.

import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

// Rooted at import.meta.dirname, not process.cwd(): this script must give
// the same answer whether it's invoked by `make` from the repo root or by
// `npm run -w @writtendev/ui` from ui/ — a cwd-relative root breaks the
// latter.
const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const uiRoot = path.join(repoRoot, 'ui')

const uiPkg = JSON.parse(readFileSync(path.join(uiRoot, 'package.json'), 'utf8'))

const errors = []

const exportsMap = uiPkg.exports
if (!exportsMap || typeof exportsMap !== 'object' || Array.isArray(exportsMap)) {
  errors.push('ui/package.json has no "exports" field')
} else {
  const filesField = Array.isArray(uiPkg.files) ? uiPkg.files : []
  const filesDirs = filesField.map((f) => path.resolve(uiRoot, f))
  const pkgJsonPath = path.resolve(uiRoot, 'package.json')

  // createRequire, rooted at the repo's own package.json, so `exports`
  // conditions are honoured by Node itself rather than re-implemented
  // here — a workspace symlink in node_modules resolves this the same way
  // a real consumer's bundler would.
  const require = createRequire(path.join(repoRoot, 'package.json'))

  for (const key of Object.keys(exportsMap)) {
    if (key.includes('*')) {
      // A wildcard map cannot be enumerated, so it cannot be gated by (3)
      // and (4) below — it would silently re-open the hazard this gate
      // exists to close.
      errors.push(`"exports" key "${key}" is a wildcard, which is not allowed`)
      continue
    }

    const target = exportsMap[key]
    if (typeof target !== 'string') {
      errors.push(`"exports" key "${key}" is not a plain string target, which is not supported`)
      continue
    }

    // The specifier a consumer actually writes: `.` is the bare package
    // name, everything else is the package name plus the subpath.
    const specifier = key === '.' ? uiPkg.name : `${uiPkg.name}/${key.slice(2)}`

    let resolved
    try {
      resolved = require.resolve(specifier)
    } catch (err) {
      errors.push(`"${key}": ${specifier} does not resolve (${err.code ?? err.message})`)
      continue
    }

    if (!existsSync(resolved)) {
      errors.push(`"${key}": ${specifier} resolved to ${resolved}, which does not exist`)
      continue
    }

    const insideFiles =
      resolved === pkgJsonPath ||
      filesDirs.some((dir) => resolved === dir || resolved.startsWith(dir + path.sep))

    if (!insideFiles) {
      const rel = path.relative(uiRoot, resolved)
      errors.push(`target ${rel} is outside "files" (${filesField.join(', ')})`)
    }
  }
}

// The lockfile half of the versioning discipline (AGENTS.md's seventh
// `ui/`-scoped review invariant): `npm ci --dry-run` does not catch a
// workspace version bumped without regenerating the lock, so this is the
// only gate covering it.
const lock = JSON.parse(readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'))
const lockedVersion = lock.packages?.ui?.version

if (lockedVersion !== uiPkg.version) {
  errors.push(
    `package-lock.json records ui@${lockedVersion ?? '(missing)'}, ui/package.json says ${uiPkg.version} — run "npm install --package-lock-only"`,
  )
}

if (errors.length > 0) {
  console.error('ui/scripts/check-exports.mjs failed:\n')
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

console.log('ui/scripts/check-exports.mjs: exports map OK')
