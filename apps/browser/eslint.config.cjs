const tsParser = require('@typescript-eslint/parser');
const ts = require('@typescript-eslint/eslint-plugin');
const react = require('eslint-plugin-react');
const hooks = require('eslint-plugin-react-hooks');
const imports = require('eslint-plugin-import');
const a11y = require('eslint-plugin-jsx-a11y');
const promise = require('eslint-plugin-promise');
const jest = require('eslint-plugin-jest');

module.exports = [
  { ignores: ['node_modules/**', 'release/**', '.erb/dll/**', 'coverage/**', 'logs/**', 'pids/**', '.idea/**', '**/*.log', 'assets/**', 'demo/**', 'docs/**', '**/*.css.d.ts', '**/*.scss.d.ts', '**/*.sass.d.ts'] },
  {
    files: ['**/*.{js,jsx,cjs,ts,tsx}'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } } },
    plugins: { '@typescript-eslint': ts, react, 'react-hooks': hooks, import: imports, 'jsx-a11y': a11y, promise, jest },
    settings: { react: { version: 'detect' }, 'import/resolver': { node: {}, typescript: {} }, 'import/parsers': { '@typescript-eslint/parser': ['.ts', '.tsx'] } },
    rules: {
      ...react.configs.recommended.rules,
      ...a11y.configs.recommended.rules,
      ...promise.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/react-in-jsx-scope': 'off',
      'react/jsx-filename-extension': 'off',
      'react/prop-types': 'off',
      'react/no-array-index-key': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      'import/no-extraneous-dependencies': 'off',
      'import/extensions': 'off',
      'import/no-unresolved': 'off',
      'import/no-import-module-exports': 'off',
      'import/prefer-default-export': 'off',
    },
  },
];
