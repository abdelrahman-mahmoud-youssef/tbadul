import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { logicalPropertiesRule } from './logical-properties.js';

const lint = (code: string) =>
  new Linter({ configType: 'flat' }).verify(
    code,
    {
      files: ['**/*.tsx'],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      rules: { 'no-restricted-syntax': logicalPropertiesRule },
    },
    'probe.tsx',
  );

describe('the logical properties rule', () => {
  it.each([
    'ml-2',
    'mr-auto',
    'pl-4',
    'pr-0.5',
    'lg:pl-8',
    '-ml-1',
    'left-0',
    'right-4',
    'text-left',
    'text-right',
    'border-l',
    'rounded-r-lg',
    'rounded-tl-md',
    'hover:md:pr-2',
  ])('refuses %s', (className) => {
    expect(lint(`<div className="flex ${className} gap-2" />`)).toHaveLength(1);
    expect(lint(`cn(\`flex ${className}\`)`)).toHaveLength(1);
  });

  it.each([
    'ms-2',
    'me-auto',
    'ps-4',
    'pe-0.5',
    'start-0',
    'end-4',
    'text-start',
    'border-s',
    'inset-x-0',
    'rounded-lg',
  ])('accepts %s', (className) => {
    expect(lint(`<div className="flex ${className} gap-2" />`)).toHaveLength(0);
  });
});
