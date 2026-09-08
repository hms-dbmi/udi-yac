import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { projectStructurePlugin, createIndependentModules } from 'eslint-plugin-project-structure';
import { defineConfig, globalIgnores } from 'eslint/config';

/**
 * The plugin derives its project root by walking up to the first `node_modules`
 * in its own path, which under pnpm is the WORKSPACE root — not this package.
 * Both of these are resolved against that root, so without them every linted
 * path arrives as `packages/chat/src/...`, matches none of the `src/**` module
 * patterns below, and the rule silently passes every file:
 *   - pathAliases.baseUrl  makes file and alias paths package-relative again
 *   - packageRoot          is where `node_modules` actually lives, so external
 *                          imports (react, vitest, ...) are recognised as such
 */
const PACKAGE_ROOT = './packages/chat';

/**
 * Bulletproof-react-style module boundaries. Features cannot import from
 * each other's internals — only through the feature's `index.ts` barrel.
 * The `app/` layer is the composition root and is allowed to reach into
 * any feature internal (needed by UDIChatContext to wire vanilla stores).
 *
 * `{family_3}` resolves to the common path prefix of the importing file and the
 * import, but only when that prefix is at least 3 segments deep — i.e.
 * `src/features/<name>`. A same-feature import therefore matches it, while a
 * cross-feature one bottoms out at `src/features` (2 segments), resolves to
 * NO_FAMILY, and is refused. Note it must not appear in a module's `pattern`:
 * those are matched literally, so a `{family}` there matches nothing at all and
 * silently disables the rule for that module.
 */
const independentModules = createIndependentModules({
  packageRoot: PACKAGE_ROOT,
  pathAliases: {
    baseUrl: PACKAGE_ROOT,
    paths: {
      '@/*': ['./src/*'],
    },
  },
  reusableImportPatterns: {
    // Shared layers any source file is allowed to reach. `src/components/**`
    // rather than just `ui/**`: the top-level components dir IS the shared
    // component layer (MarkdownText, FieldTooltipContent), and assets are inert.
    sharedLayers: [
      'src/types/**',
      'src/lib/**',
      'src/stores/**',
      'src/components/**',
      'src/assets/**',
    ],
  },
  modules: [
    // Feature internals: own family + cross-feature barrels + shared layers.
    {
      name: 'Feature internals',
      pattern: 'src/features/*/**',
      allowImportsFrom: [
        '{family_3}/**',
        // Cross-feature: barrels only.
        'src/features/*/index.ts',
        'src/utils/**',
        // The one part of the composition root features may reach. Stores are
        // vanilla and instantiated per-provider here, so a component consumes
        // them through this context rather than importing a store module.
        'src/app/UDIChatContext.tsx',
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
