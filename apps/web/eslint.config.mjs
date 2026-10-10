import nextVitals from 'eslint-config-next/core-web-vitals';
import tsPlugin from '@typescript-eslint/eslint-plugin';

/** Flat config (ESLint 10). Mirrors the previous .eslintrc.json rules. */
const config = [
  ...nextVitals,
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'coverage/**', 'next-env.d.ts'],
  },
  {
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@next/next/no-img-element': 'off',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/anchor-is-valid': 'warn',
      'jsx-a11y/aria-props': 'warn',
      'jsx-a11y/aria-proptypes': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'warn',
      'jsx-a11y/label-has-associated-control': 'warn',
      // New React Compiler-oriented rules in eslint-plugin-react-hooks 7 (via eslint-config-next 16).
      // Kept as warnings so the upgrade does not change lint strictness; fix incrementally.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/static-components': 'warn',
    },
  },
  {
    files: ['app/api/**/*.ts', 'app/auth/**/*.ts', 'lib/**/*.ts', 'middleware.ts', 'scripts/**/*.{ts,mjs,js}'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    rules: { '@typescript-eslint/no-explicit-any': 'off', 'no-console': 'off' },
  },
];

export default config;
