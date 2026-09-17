import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist/**', 'coverage/**', '.serverless/**', '.webpack/**']),

  // Lambda handlers and their tests, all node.
  {
    files: ['src/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.node, ...globals.vitest } },
  },

  // A leading underscore means "required by the signature, deliberately unused".
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // Stubs are shaped by hand, so `any` is the point rather than a slip.
  {
    files: ['src/**/*.test.ts', 'src/testUtils.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },

  // The handler passes the game and its players around as `any` rather than the
  // shapes types.ts already describes — 70-odd sites of real debt, not a
  // boundary. Visible as a warning until the domain model is threaded through;
  // failing the build on day one would only mean switching the rule off.
  {
    files: ['src/websockets.ts', 'src/supabaseStore.ts', 'src/types.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'warn' },
  },
])
