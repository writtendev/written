import path from 'node:path'
import { includeIgnoreFile } from '@eslint/compat'
import js from '@eslint/js'
import { globalIgnores } from 'eslint/config'
import eslintConfigPrettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// ESLint's flat config does not read .gitignore the way Prettier does,
// so without this, anything .gitignore excludes (most notably sibling
// ticket worktrees under .claude/worktrees/) is still fair game for
// `eslint .` — silently breaking the "local gate and CI are the same
// thing" claim in AGENTS.md the moment two tickets are checked out
// side by side. Feeding .gitignore in here keeps the two ignore lists
// identical by construction instead of by hand.
const gitignorePath = path.resolve(import.meta.dirname, '.gitignore')

export default tseslint.config(
  includeIgnoreFile(gitignorePath),
  globalIgnores(['**/dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended, eslintConfigPrettier],
    // eslint-plugin-react-hooks's packaged flat configs still ship an
    // eslintrc-style `plugins: ["react-hooks"]` array, which flat config
    // rejects — register the plugin and its rules directly instead.
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: reactHooks.configs.recommended.rules,
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
  },
  {
    // react-refresh/only-export-components enforces Vite's Fast
    // Refresh constraint (every file exports only components). That's
    // a dev-harness concern, not a rule this package's shipped source
    // should have to satisfy — a library file legitimately exports a
    // helper alongside a component. Scope it to ui's dev harness only.
    files: ['ui/dev/**/*.{ts,tsx}'],
    extends: [reactRefresh.configs.vite],
  },
  {
    // Cover plain JS tooling files (eslint.config.js itself, any
    // future .mjs/.cjs script) — otherwise the ts/tsx-scoped block
    // above leaves them with zero lint rules.
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.node,
    },
  },
  {
    // Enforces the two `ui/`-scoped review invariants in AGENTS.md that
    // no other tool checks: no dynamically constructed class names (a
    // Tailwind build that scans this package as source cannot see a
    // class assembled at runtime), and no raw values (every visual value
    // must trace to a token in tokens.css). Scoped to `ui/src/**` only —
    // not `ui/dev/**`, which is a harness, and not `web/`.
    //
    // What this does NOT assert: that a class name is a *real* Tailwind
    // utility. A typo'd `bg-acccent` is a literal string, passes this
    // rule, and Tailwind drops it silently — the same documented gap as
    // a typo'd `@source` (see ui/scripts/check-exports.mjs).
    files: ['ui/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TemplateLiteral[expressions.length>0]',
          message:
            'No dynamically constructed class names: an interpolated template literal is invisible to a consumer Tailwind build scanning this package as source. Use a literal-string variant map instead.',
        },
        {
          // Deliberately over-broad: this also forbids arithmetic, not
          // just string concatenation, because both use the same `+`
          // operator and this file is three presentational components
          // with no arithmetic to protect. If a future component
          // genuinely needs `+`, relaxing this selector is a deliberate
          // edit, which is the right cost.
          selector: "BinaryExpression[operator='+']",
          message:
            "No dynamically constructed class names: string concatenation ('bg-' + variant) is invisible to a consumer Tailwind build scanning this package as source. Use a literal-string variant map instead.",
        },
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3}/]',
          message:
            'No raw values: a hardcoded hex color references nothing in tokens.css. Add or use a --color-* token instead.',
        },
        {
          selector: 'Literal[value=/\\[[0-9.]+(px|rem|em)\\]/]',
          message:
            'No raw values: an arbitrary-value utility (e.g. p-[13px]) bypasses tokens.css. Add or use a token instead.',
        },
        {
          selector: "JSXAttribute[name.name='style']",
          message:
            'No raw values: an inline style prop bypasses both tokens.css and the Tailwind scanner. Use token-backed utility classes instead.',
        },
      ],
    },
  },
)
