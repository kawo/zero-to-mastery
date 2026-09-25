// ESLint 10 only reads flat config, so this replaces the legacy .eslintrc.cjs.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'dist-electron', 'release', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // These rules target code compiled by React Compiler, which this app doesn't use.
      // The player engine intentionally drives an imperative <audio> element and
      // dnd-kit hands out callback refs, both of which they flag.
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/sw.ts'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ['electron/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.{js,ts,cjs}'],
    languageOptions: { globals: globals.node },
  },
);
