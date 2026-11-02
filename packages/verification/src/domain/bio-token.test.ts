import { describe, expect, it } from 'vitest';
import { bioContainsToken, parseBioToken, type BioToken } from './bio-token.ts';

describe('parseBioToken', () => {
  it('accepts a single non-blank token and trims it', () => {
    expect(parseBioToken('  EX-7f3a  ')).toEqual({ ok: true, value: 'EX-7f3a' });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['ab cd', 'whitespace'],
    ['a'.repeat(65), 'too_long'],
  ])('rejects %j with reason %s', (input, reason) => {
    expect(parseBioToken(input)).toEqual({
      ok: false,
      error: { kind: 'invalid_bio_token', input, reason },
    });
  });
});

describe('bioContainsToken', () => {
  const token = 'EX-7f3a' as BioToken;

  it.each([
    ['EX-7f3a', true],
    ['hello EX-7f3a world', true],
    ['line one\nEX-7f3a\tline two', true],
    ['xEX-7f3a', false],
    ['EX-7f3ab', false],
    ['ex-7f3a', false],
    ['hello EX-7f3a.', false],
    ['', false],
  ])('bio %j contains token: %s', (bio, expected) => {
    expect(bioContainsToken(bio, token)).toBe(expected);
  });
});
