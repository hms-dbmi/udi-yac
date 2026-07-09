import js from '@eslint/js';
import globals from 'globals';
import pluginVue from 'eslint-plugin-vue';
import vueTsEslintConfig from '@vue/eslint-config-typescript';
import prettierSkipFormatting from '@vue/eslint-config-prettier/skip-formatting';

export default [
  {
    // ESLint requires "ignores" to be the only key in this object.
    ignores: [
      'node_modules',
      'dist',
      'storybook-static',
      'index.ts',
      // Hand-written declaration file whose types import from the gitignored
      // ./dist build output. On a fresh clone (no build yet) those imports
      // resolve to "any" error types, tripping no-redundant-type-constituents.
      'ce.d.ts',
      // Has its own tsconfig (tsconfig.react.json, jsx enabled) that the
      // project service here doesn't reference; typechecked via build:react.
      'react-wrapper',
      // Plain node smoke scripts, no TS project.
      'test',
      '.storybook',
    ],
  },

  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],

  {
    files: ['**/*.ts', '**/*.vue'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports' },
      ],
    },
  },
  ...vueTsEslintConfig({
    extends: ['recommendedTypeChecked'],
  }),

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'prefer-promise-reject-errors': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  prettierSkipFormatting,
];
