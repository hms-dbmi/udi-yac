import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Ported from Vue codebase which uses any extensively; tighten in Phase 2
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Store/context files export hooks alongside components
    files: ['src/stores/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
      // Lazy-init ref pattern for per-instance store creation is intentional
      'react-hooks/refs': 'off',
    },
  },
  {
    // shadcn/ui generated components export variant helpers alongside components
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
