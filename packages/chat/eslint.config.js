import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { projectStructurePlugin, createIndependentModules } from 'eslint-plugin-project-structure';
import { defineConfig, globalIgnores } from 'eslint/config';

/**
 * Bulletproof-react-style module boundaries. Features cannot import from
 * each other's internals — only through the feature's `index.ts` barrel.
 * The `app/` layer is the composition root and is allowed to reach into
 * any feature internal (needed by UDIChatContext to wire vanilla stores).
 *
 * The `{family}` token captures the folder segment at the wildcard
 * position so a feature can reference its own tree without naming itself.
 */
const independentModules = createIndependentModules({
  pathAliases: {
    baseUrl: '.',
    paths: {
      '@/*': ['./src/*'],
    },
  },
  reusableImportPatterns: {
    // Shared layers any source file is allowed to reach.
    sharedLayers: ['src/types/**', 'src/lib/**', 'src/stores/**', 'src/components/ui/**'],
  },
  modules: [
    // Feature internals: own family + cross-feature barrels + shared layers.
    {
      name: 'Feature internals',
      pattern: 'src/features/{family}/**',
      allowImportsFrom: [
        'src/features/{family}/**',
        // Cross-feature: barrels only.
        'src/features/*/index.ts',
        'src/utils/**',
        '{sharedLayers}',
      ],
      allowExternalImports: true,
    },
    // App layer: composition root — may reach into any feature internal.
    {
      name: 'App layer',
      pattern: 'src/app/**',
      allowImportsFrom: [
        'src/app/**',
        'src/features/**',
        'src/utils/**',
        'src/data/**',
        'src/**/*.css',
        '{sharedLayers}',
      ],
      allowExternalImports: true,
    },
    // UI primitives cannot depend on features or app.
    {
      name: 'UI primitives',
      pattern: 'src/components/ui/**',
      allowImportsFrom: ['src/components/ui/**', 'src/lib/**'],
      allowExternalImports: true,
    },
    // Shared utils can reach siblings, stores, types, and feature barrels only.
    {
      name: 'Shared utilities',
      pattern: 'src/utils/**',
      allowImportsFrom: ['src/utils/**', '{sharedLayers}', 'src/features/*/index.ts'],
      allowExternalImports: true,
    },
    // Shared types — leaf layer, no feature reach.
    {
      name: 'Shared types',
      pattern: 'src/types/**',
      allowImportsFrom: ['{sharedLayers}'],
      allowExternalImports: true,
    },
    // Shared lib (cn helper etc.).
    {
      name: 'Shared lib',
      pattern: 'src/lib/**',
      allowImportsFrom: ['src/lib/**'],
      allowExternalImports: true,
    },
    // Truly global stores.
    {
      name: 'Global stores',
      pattern: 'src/stores/**',
      allowImportsFrom: ['src/stores/**', 'src/types/**', 'src/lib/**'],
      allowExternalImports: true,
    },
    // Library root entry + demo data.
    {
      name: 'Library entry',
      pattern: 'src/index.ts',
      allowImportsFrom: [
        'src/index.css',
        'src/app/**',
        'src/features/*/index.ts',
        'src/features/*/**',
        'src/types/**',
      ],
      allowExternalImports: true,
    },
    {
      name: 'Demo data',
      pattern: 'src/data/**',
      allowImportsFrom: ['src/types/**', 'src/features/*/index.ts'],
      allowExternalImports: true,
    },
  ],
});

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
    // Store/context files export hooks alongside components/createX factories.
    files: [
      'src/stores/**/*.{ts,tsx}',
      'src/features/*/stores/**/*.{ts,tsx}',
      'src/app/UDIChatContext.tsx',
      'src/features/*/index.ts',
    ],
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
  {
    // Project-structure rules apply to source only.
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'project-structure': projectStructurePlugin },
    rules: {
      'project-structure/independent-modules': ['error', independentModules],
    },
  },
]);
