import { describe, expect, it } from 'vitest';
import { destinationOf } from './destination';

describe('destinationOf', () => {
  it('keeps a local path with its query', () => {
    expect(destinationOf('/accounts/link?x=1', '/accounts')).toBe('/accounts/link?x=1');
  });

  it.each([
    ['an absolute url', 'https://example.com/accounts'],
    ['a protocol-relative url', '//example.com'],
    ['a backslash host', '/\\example.com'],
    ['a relative path', 'accounts'],
    ['a repeated parameter', ['/a', '/b']],
    ['nothing', undefined],
  ])('falls back for %s', (_label, next) => {
    expect(destinationOf(next, '/accounts')).toBe('/accounts');
  });
});
