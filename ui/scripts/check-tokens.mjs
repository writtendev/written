#!/usr/bin/env node
// Cross-checks ui/src/tokens.css against ui's own built harness stylesheet
// (ui/dist/assets/*.css, produced by build:harness) in both directions, so
// the specimen page's "reads from the cascade, never a copy" guarantee has
// a machine-checked backstop. Runs as a step of `make check-ts`, after
// `npm run build:harness -w @writtendev/ui`, so `ui/dist` is always fresh
// when this reads it.
//
// It hardcodes no token names — every name it checks comes from parsing
// tokens.css itself, via ../dev/tokens.ts (the one place that regex
// lives; see that module's header for why it is not merged into
// Specimen.tsx).
//
// What this asserts:
//   1. tokens.css contains exactly one @theme at-rule, and it is spelled
//      exactly "@theme static {" — checked against the comment-stripped
//      source (the file's own header comment discusses "@theme static"
//      and "@theme inline" in prose, and a naive check matches those
//      first).
//   2. The built stylesheet exists and has a ":root, :host" block —
//      missing ui/dist is a hard failure, never a skip.
//   3. Every name tokens.css declares appears in that block (forward
//      direction: a token dropped from @theme static, e.g. moved to a
//      plain :root block, is caught here).
//   4. Reverse direction: for each `--X-*: initial` namespace reset in
//      tokens.css, every emitted --X-* name in the built block is also
//      one tokens.css declares. Because the resets delete Tailwind's own
//      --color-*/--text-*/--radius-* defaults, anything emitted in those
//      namespaces must have come from tokens.css — so this catches a
//      token declared in a shape parseTokenNames fails to match, which
//      check 3 cannot (it never learns the name exists in the first
//      place).
//
// What this does NOT catch, stated plainly: a deleted token. Nothing here
// knows a token ought to exist without a parallel list, which is exactly
// what this ticket forbids the page (and this gate) from keeping. The
// compensating control is the specimen page itself: it renders every
// token that does exist, so a deletion is visible on sight.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseTokenNames, stripComments } from '../dev/tokens.ts'

const uiRoot = path.resolve(import.meta.dirname, '..')
const tokensPath = path.join(uiRoot, 'src', 'tokens.css')
const distAssetsDir = path.join(uiRoot, 'dist', 'assets')

const errors = []

const tokensSource = readFileSync(tokensPath, 'utf8')
const strippedTokens = stripComments(tokensSource)
const declaredNames = parseTokenNames(tokensSource)

// --- Check 1: exactly one @theme at-rule, spelled "@theme static {" -----

const atThemeRules = strippedTokens.match(/@theme\b[^{]*\{/g) ?? []

if (atThemeRules.length !== 1) {
  errors.push(
    `expected exactly one @theme at-rule in tokens.css, found ${atThemeRules.length}` +
      (atThemeRules.length > 0
        ? `: ${atThemeRules.map((r) => JSON.stringify(r.trim())).join(', ')}`
        : ''),
  )
} else if (!/^@theme\s+static\s*\{$/.test(atThemeRules[0].trim())) {
  errors.push(`expected "@theme static {", found ${JSON.stringify(atThemeRules[0].trim())}`)
}

// --- Check 2: the built stylesheet exists and has a :root, :host block --

if (!existsSync(distAssetsDir)) {
  errors.push(
    `${path.relative(uiRoot, distAssetsDir)} does not exist — run "npm run build:harness -w @writtendev/ui"`,
  )
} else {
  const cssFiles = readdirSync(distAssetsDir).filter((f) => f.endsWith('.css'))

  if (cssFiles.length === 0) {
    errors.push(`no built .css file found in ${path.relative(uiRoot, distAssetsDir)}`)
  } else {
    const builtCss = cssFiles
      .map((f) => readFileSync(path.join(distAssetsDir, f), 'utf8'))
      .join('\n')
    const rootBlockMatch = /:root\s*,\s*:host\s*\{([^}]*)\}/.exec(builtCss)

    if (!rootBlockMatch) {
      errors.push(`no ":root, :host" block found in the built stylesheet (${cssFiles.join(', ')})`)
    } else {
      const rootBlock = rootBlockMatch[1]
      // Deliberately broader than DECLARATION in ../dev/tokens.ts (which
      // this check exists to backstop): any run of characters after `--`
      // up to its colon is accepted as a name, with no restriction on the
      // character class beyond the punctuation that ends a declaration or
      // a `var(--other-name)` reference — `:`/`;`/`,`/`(`/`)`/`{`/`}` and
      // whitespace — so a name shaped in a way the parser can't match
      // (e.g. an underscore) is still visible here rather than silently
      // invisible to both. The built CSS is minified with no separating
      // whitespace, so without excluding that punctuation a `var(--x)`
      // reference earlier in the same declaration gets swallowed into the
      // next property's "name" instead of stopping at it.
      const emittedNames = new Set(
        [...rootBlock.matchAll(/(--[^\s:;,(){}]+)\s*:/g)].map((m) => m[1]),
      )

      // --- Check 3: every declared name is emitted -----------------------

      for (const name of declaredNames) {
        if (!emittedNames.has(name)) {
          errors.push(
            `"${name}" is declared in tokens.css but missing from the built ":root, :host" block`,
          )
        }
      }

      // --- Check 4 (reverse): every emitted name in a reset namespace is
      //     one tokens.css declares ------------------------------------

      const declared = new Set(declaredNames)
      const resetNamespaces = [
        ...strippedTokens.matchAll(/^[ \t]*--([a-z0-9-]+)-\*\s*:\s*initial\s*;/gim),
      ].map((m) => m[1])

      for (const namespace of resetNamespaces) {
        const prefix = `--${namespace}-`
        for (const name of emittedNames) {
          if (name.startsWith(prefix) && !declared.has(name)) {
            errors.push(
              `"${name}" is emitted in the built stylesheet's "--${namespace}-*" namespace but tokens.css's parser did not find a declaration for it`,
            )
          }
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error('ui/scripts/check-tokens.mjs failed:\n')
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

console.log(`ui/scripts/check-tokens.mjs: ${declaredNames.length} tokens OK`)
