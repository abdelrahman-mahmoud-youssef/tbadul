import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

const layers = ['domain', 'ports', 'application', 'adapters', 'testing', 'root'];

const coreModules = {
  from: { element: { type: '*' } },
  allow: { to: { module: { origin: 'core' } } },
};

const noTestFiles = { disallow: { to: { file: { categories: 'test' } } } };

export default defineConfig(
  globalIgnores(['**/dist/', '**/.turbo/']),
  {
    files: ['**/*.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['packages/*/src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': layers.map((type) => ({
        type,
        pattern: type === 'root' ? 'src' : `src/${type}`,
      })),
      'boundaries/files': [{ pattern: '**/*.test.ts', category: 'test' }],
    },
    rules: {
      ...boundaries.configs.strict.rules,
      'boundaries/dependencies': [
        2,
        {
          default: 'disallow',
          checkAllOrigins: true,
          policies: [
            coreModules,
            {
              from: { element: { type: ['adapters', 'testing', 'root'] } },
              allow: { to: { module: { source: '@engagement-exchange/db' } } },
            },
            {
              from: { element: { type: 'adapters' } },
              allow: { to: { module: { source: 'drizzle-orm' } } },
            },
            {
              from: { element: { type: ['application', 'ports', 'adapters', 'testing', 'root'] } },
              allow: {
                to: {
                  module: {
                    source: [
                      '@engagement-exchange/verification',
                      '@engagement-exchange/verification/testing',
                    ],
                  },
                },
              },
            },
            {
              from: { element: { type: 'domain' } },
              allow: {
                to: { module: { source: '@engagement-exchange/verification' } },
                dependency: { kind: 'type' },
              },
            },
            {
              from: { element: { type: ['domain', 'adapters', 'root'] } },
              allow: { to: { module: { source: 'zod' } } },
            },
            {
              from: { element: { type: 'adapters' } },
              allow: { to: { module: { source: 'cockatiel' } } },
            },
            {
              from: { element: { type: 'ports' } },
              allow: { to: { element: { type: 'domain' } } },
            },
            {
              from: { element: { type: 'application' } },
              allow: { to: { element: { type: ['domain', 'ports'] } } },
            },
            {
              from: { element: { type: 'adapters' } },
              allow: { to: { element: { type: ['domain', 'ports'] } } },
            },
            {
              from: { element: { type: 'testing' } },
              allow: { to: { element: { type: ['domain', 'ports', 'adapters'] } } },
            },
            {
              from: { element: { type: 'root' } },
              allow: { to: { element: { type: ['domain', 'ports', 'application', 'adapters'] } } },
            },
            {
              from: { file: { categories: 'test' } },
              allow: {
                to: [
                  { element: { type: 'testing' } },
                  {
                    module: {
                      source: [
                        'vitest',
                        'fast-check',
                        'undici',
                        '@engagement-exchange/verification',
                        '@engagement-exchange/verification/testing',
                      ],
                    },
                  },
                  { module: { source: '@engagement-exchange/db', internalPath: 'testing' } },
                ],
              },
            },
            {
              from: { element: { type: 'testing' } },
              allow: { to: { element: { type: 'application' } }, dependency: { kind: 'type' } },
            },
            noTestFiles,
          ],
        },
      ],
    },
  },
  {
    files: ['packages/db/src/**/*.ts'],
    rules: {
      'boundaries/dependencies': [
        2,
        {
          default: 'disallow',
          checkAllOrigins: true,
          policies: [
            coreModules,
            {
              from: { element: { type: 'root' } },
              allow: { to: { module: { source: ['drizzle-orm', 'pg', 'better-auth', 'zod'] } } },
            },
            {
              from: { element: { type: 'testing' } },
              allow: {
                to: [
                  { element: { type: 'root' } },
                  {
                    module: { source: ['@testcontainers/postgresql', 'testcontainers', 'vitest'] },
                  },
                ],
              },
            },
            {
              from: { file: { categories: 'test' } },
              allow: {
                to: [{ element: { type: 'testing' } }, { module: { source: 'vitest' } }],
              },
            },
            noTestFiles,
          ],
        },
      ],
    },
  },
  {
    files: ['packages/contracts/src/**/*.ts'],
    rules: {
      'boundaries/dependencies': [
        2,
        {
          default: 'disallow',
          checkAllOrigins: true,
          policies: [
            {
              from: { element: { type: 'root' } },
              allow: [{ to: { element: { type: 'root' } } }, { to: { module: { source: 'zod' } } }],
            },
            {
              from: { file: { categories: 'test' } },
              allow: { to: { module: { source: 'vitest' } } },
            },
            noTestFiles,
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'testing', pattern: 'src/testing' },
        { type: 'root', pattern: 'src' },
      ],
      'boundaries/files': [{ pattern: '**/*.test.ts', category: 'test' }],
    },
    rules: {
      ...boundaries.configs.strict.rules,
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      'boundaries/dependencies': [
        2,
        {
          default: 'disallow',
          checkAllOrigins: true,
          policies: [
            coreModules,
            {
              from: { element: { type: ['root', 'testing'] } },
              allow: [
                { to: { element: { type: 'root' } } },
                {
                  to: {
                    module: {
                      source: [
                        '@engagement-exchange/contracts',
                        '@engagement-exchange/db',
                        '@engagement-exchange/social-accounts',
                        '@engagement-exchange/verification',
                        '@nestjs/common',
                        '@nestjs/core',
                        '@nestjs/platform-fastify',
                        'better-auth',
                        'fastify',
                        'zod',
                      ],
                    },
                  },
                },
              ],
            },
            {
              from: { element: { type: 'root' } },
              disallow: { to: { module: { internalPath: 'testing{,/**}' } } },
            },
            {
              from: { element: { type: 'testing' } },
              allow: { to: { module: { source: 'drizzle-orm' } } },
            },
            {
              from: { file: { categories: 'test' } },
              allow: [
                { to: { element: { type: 'testing' } } },
                { to: { module: { source: '@engagement-exchange/db', internalPath: 'testing' } } },
                { to: { module: { source: 'vitest' } } },
              ],
            },
            noTestFiles,
          ],
        },
      ],
    },
  },
);
