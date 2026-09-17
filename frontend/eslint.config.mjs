import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['build/**', 'coverage/**', 'playwright-report/**', 'test-results/**']),

  // The app itself: browser globals, React rules, and Fast Refresh's constraint
  // that a module exporting a component exports nothing else.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser, ...globals.vitest } },
  },

  // Config, build scripts and the Playwright suite run in node, not the browser.
  {
    files: ['*.{ts,mjs}', 'e2e/**/*.ts', 'scripts/**/*.{js,cjs}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.node },
  },

  // A leading underscore means "required by the signature, deliberately unused".
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // Stubs are shaped by hand, so `any` is the point rather than a slip, and the
  // mock state a vi.mock factory closes over must be `var`: vitest hoists the
  // factory above the file, and a let/const would still be in its dead zone.
  {
    files: ['**/*.test.{ts,tsx}', 'src/testUtils.tsx', 'src/setupTests.ts', 'e2e/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off', 'no-var': 'off' },
  },

  // react-hooks 7 promoted these compiler-adjacent rules to errors. App.tsx
  // drives the game through refs and effects by design, and satisfying the
  // compiler means rearchitecting it, so keep them visible without blocking.
  // (Same call as online-jenga.)
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/purity': 'warn',
    },
  },

  // A .cjs build script requires things; that is what CommonJS is.
  {
    files: ['scripts/**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
])
