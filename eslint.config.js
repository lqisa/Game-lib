import js from '@eslint/js';
import globals from 'globals';
import pluginVue from 'eslint-plugin-vue';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import prettierSkipFormatting from '@vue/eslint-config-prettier/skip-formatting';

export default defineConfigWithVueTs(
  {
    /**
     * ESLint does not read .gitignore, so anything generated or checked out
     * alongside the source has to be listed here or `npx eslint .` walks into it.
     * That is what broke before: `.kilo/` holds git worktrees - full copies of this
     * repo - and their files are not in the root tsconfig, so type-aware rules threw
     * "you have used a rule which requires type information" instead of reporting
     * anything useful.
     *
     * ESLint requires "ignores" key to be the only one in this object.
     */
    ignores: [
      'dist/**',
      'out/**',
      'release/**',
      '.packaging/**',
      '.kilo/**',
      'graphify-out/**',
      'test-results/**',
      'test-data/**',
      'test_out/**',
      'covers/**',
      // shadcn-vue copies components into the repo; they are upstream-authored code
      // that is refreshed via the shadcn-vue CLI, not hand-edited here.
      'src/components/ui/**',
    ],
  },

  js.configs.recommended,

  /**
   * https://eslint.vuejs.org
   *
   * pluginVue.configs.base
   *   -> Settings and rules to enable correct ESLint parsing.
   * pluginVue.configs[ 'flat/essential']
   *   -> base, plus rules to prevent errors or unintended behavior.
   */
  pluginVue.configs['flat/essential'],

  {
    files: ['**/*.ts', '**/*.vue'],
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },
  // https://github.com/vuejs/eslint-config-typescript
  vueTsConfigs.recommendedTypeChecked,

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',

      globals: {
        ...globals.browser,
        ...globals.node, // Electron, config files, server
        process: 'readonly', // process.env.*
      },
    },

    // add your custom rules here
    rules: {
      'prefer-promise-reject-errors': 'off',

      // A leading underscore is the convention for an argument that has to exist for the
      // signature but is deliberately unused - Express only treats a handler as an error
      // handler when it declares four parameters, so `(err, req, res, _next)` is required
      // even though nothing reads `next`.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      // allow debugger during development only
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    },
  },

  prettierSkipFormatting,
);
