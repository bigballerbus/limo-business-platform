import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';

/**
 * Flat ESLint config.
 *
 * The headline rule is the `src/lib/domain` boundary: business logic must stay
 * pure — no framework, no database, no integrations, no I/O — so it remains
 * unit-testable without a network, a database or React. This is enforced here,
 * not by convention.
 */
export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'src/payload-types.ts',
      'src/migrations/**',
      'src/app/(payload)/admin/importMap.js',
      'next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  // ── The domain boundary ──────────────────────────────────────────────────
  // Pure business logic. May import only other domain modules and pure
  // utilities (e.g. zod). Anything with a runtime dependency is forbidden.
  {
    files: ['src/lib/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'next',
                'next/*',
                'react',
                'react-dom',
                'react/*',
                'payload',
                '@payloadcms/*',
                'drizzle-orm',
                'drizzle-orm/*',
                '@/app/*',
                '@/components/*',
                '@/collections/*',
                '@/inngest/*',
                '@/lib/db/*',
                '@/lib/integrations/*',
                '@/lib/events/*',
              ],
              message:
                'src/lib/domain must stay pure: no framework, database, integrations or I/O. Move impure code to the calling layer and pass plain data in.',
            },
            {
              group: [
                'fs',
                'node:fs',
                'node:fs/*',
                'net',
                'node:net',
                'http',
                'node:http',
                'https',
                'node:https',
                'child_process',
                'node:child_process',
              ],
              message:
                'src/lib/domain must not perform I/O. Keep it deterministic and side-effect free.',
            },
          ],
        },
      ],
    },
  },
  // Config, tests and tooling run in Node and may use console / devDeps freely.
  {
    files: ['**/*.config.{js,mjs,ts}', 'tests/**/*.{ts,tsx}', 'scripts/**/*.{ts,mjs}'],
    rules: {
      'no-console': 'off',
    },
  },
  prettier,
);
