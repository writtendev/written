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
)
