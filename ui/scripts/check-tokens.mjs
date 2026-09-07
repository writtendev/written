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
//   2. Self-consistency, independent of any build: a loose scan of
//      tokens.css's own comment-stripped source — any run of
//      non-punctuation, non-whitespace characters before a colon, in ANY
//      namespace — must name exactly the same tokens as parseTokenNames
//      (../dev/tokens.ts's strict [a-z0-9-] parser) does. A token
//      declared in a shape the strict parser can't match (an underscore,
//      a unicode letter, ...) shows up in the loose scan but not in
//      parseTokenNames's output, so the disagreement is caught here even
//      though check 4 below never learns the name exists in the first
//      place. This needs no built stylesheet, so it runs unconditionally
//      and covers every namespace alike — including --font-* and
//      --spacing, which have no reset namespace for check 5 to lean on
//      (--font-* deliberately, per tokens.css's own comment, so the
//      document keeps a body font; --spacing is a single bare property
//      with no namespace to reset).
//   3. The built stylesheet exists and has a ":root, :host" block —
//      missing ui/dist is a hard failure, never a skip.
//   4. Every name tokens.css declares appears in that block (forward
//      direction: a token dropped from @theme static, e.g. moved to a
//      plain :root block, is caught here).
//   5. Reverse direction: for each `--X-*: initial` namespace reset in
//      tokens.css, every emitted --X-* name in the built block is also
//      one tokens.css declares. Because the resets delete Tailwind's own
//      --color-*/--text-*/--radius-* defaults, anything emitted in those
//      namespaces must have come from tokens.css — so this catches a
//      token that reaches the built stylesheet from outside tokens.css
//      entirely (e.g. a stray `@theme static { --color-rogue: … }` added
//      to the harness's own dev/index.css), which check 2's
//      source-vs-parser comparison cannot: that check only ever looks at
//      tokens.css's own text, so a value injected from anywhere else is
//      invisible to it by construction. Checks 2 and 5 cover different
//      directions and neither subsumes the other: 2 catches a token the
//      parser mis-shapes but tokens.css still declares; 5 catches a value
//      entering the cascade that tokens.css never declared at all.
//
// What this does NOT catch, stated plainly: a deleted token. Nothing here
// knows a token ought to exist without a parallel list, which is exactly
// what this ticket forbids the page (and this gate) from keeping. The
// compensating control is the specimen page itself: it renders every
// token that does exist, so a deletion is visible on sight. Check 2 also
// only proves the strict and loose scans agree on tokens.css's own
// source — it does not (and check 4 does, forward-direction) confirm an
// agreed-upon name actually reaches the built stylesheet. Nor does
// anything here parse CSS string escapes in a property name itself: a
// token declared as `--color-my\ token` (a legal backslash-escaped space)
// is outside both the loose scan's and parseTokenNames's character
// classes, so the two still agree — on not finding it — rather than
// disagreeing, and it slips past checks 2 and 4/5 alike. stripComments
// (../dev/tokens.ts) is string-aware for `'`/`"`-quoted values, so a
// quoted value containing a literal `/*` (a font-family list like
// `'Foo/*Bar', serif`) no longer swallows the declarations after it as
// if it opened a comment.

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

// --- Check 2 (self-consistency): a loose, namespace-independent scan of
//     tokens.css's own source agrees with parseTokenNames. Independent of
//     any build, so it runs unconditionally rather than nested under the
//     built-stylesheet check below. -------------------------------------

const declared = new Set(declaredNames)

// Same loose pattern as emittedNames below, applied to tokens.css's own
// comment-stripped source instead of the built stylesheet, so this needs
// no build output and no namespace reset to work. The `-*` filter drops
// the namespace-reset declarations themselves (`--color-*: initial`),
// matching parseTokenNames's own convention of not treating those as
// token names.
const looseSourceNames = new Set(
  [...strippedTokens.matchAll(/(--[^\s:;,(){}]+)\s*:/g)]
    .map((m) => m[1])
    .filter((name) => !name.endsWith('-*')),
)

for (const name of looseSourceNames) {
  if (!declared.has(name)) {
    errors.push(
      `"${name}" is declared in tokens.css (loose scan) but tokens.css's parser (parseTokenNames) did not recognize it — likely a name shape outside its [a-z0-9-] character class`,
    )
  }
}
for (const name of declared) {
  if (!looseSourceNames.has(name)) {
    errors.push(
      `"${name}" was parsed by parseTokenNames but the loose scan of tokens.css did not find it — parser/gate disagreement, investigate both`,
    )
  }
}

// --- Check 3: the built stylesheet exists and has a :root, :host block --

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

      // --- Check 4: every declared name is emitted ------------------------

      for (const name of declaredNames) {
        if (!emittedNames.has(name)) {
          errors.push(
            `"${name}" is declared in tokens.css but missing from the built ":root, :host" block`,
          )
        }
      }

      // --- Check 5 (reverse): every emitted name in a reset namespace is
      //     one tokens.css declares -------------------------------------

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
