import { describe, expect, it } from 'vitest';
import { parseHandle } from './handle.ts';
import { sameIdentity } from './platform-scoped.ts';

describe('parseHandle for tiktok', () => {
  it.each([
    '@Some.User',
    'some.user',
    '  @some.user  ',
    'https://www.tiktok.com/@Some.User',
    'http://tiktok.com/@some.user/',
    'www.tiktok.com/@some.user?lang=en',
    'https://m.tiktok.com/@some.user/video/7000000000000000000',
  ])('normalizes %j to some.user', (input) => {
    expect(parseHandle('tiktok', input)).toEqual({
      ok: true,
      value: { platform: 'tiktok', value: 'some.user' },
    });
  });

  it.each([
    ['', 'empty'],
    ['@', 'empty'],
    ['a'.repeat(25), 'too_long'],
    ['some user', 'characters'],
    ['some-user', 'characters'],
    ['https://www.tiktok.com/', 'characters'],
  ])('rejects %j with reason %s', (input, reason) => {
    expect(parseHandle('tiktok', input)).toEqual({
      ok: false,
      error: { kind: 'invalid_handle', input, reason },
    });
  });
});

describe('sameIdentity on handles', () => {
  it('compares platform and normalized value', () => {
    const a = parseHandle('tiktok', '@Some.User');
    const b = parseHandle('tiktok', 'https://www.tiktok.com/@some.user');
    const c = parseHandle('tiktok', 'other.user');
    if (!a.ok || !b.ok || !c.ok) throw new Error('fixtures must parse');
    expect(sameIdentity(a.value, b.value)).toBe(true);
    expect(sameIdentity(a.value, c.value)).toBe(false);
  });
});
