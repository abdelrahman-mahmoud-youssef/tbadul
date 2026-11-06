import { describe, expect, it } from 'vitest';
import { accountId, matchAccount } from './account-id.ts';

const secUid = 'MS4wLjABAAAA-target';
const uid = '6551237489917432832';
const withBoth = accountId('tiktok', secUid, uid);
const secUidOnly = accountId('tiktok', secUid);

describe('matchAccount', () => {
  it.each([
    ['by secUid only', secUidOnly, { value: secUid }],
    ['by uid only', withBoth, { numericId: uid }],
    ['when both ids are present and consistent', withBoth, { value: secUid, numericId: uid }],
    ['by secUid when the target has no uid stored', secUidOnly, { value: secUid, numericId: uid }],
  ])('answers same %s', (_label, target, entry) => {
    expect(matchAccount(target, entry)).toBe('same');
  });

  it.each([
    ['both ids', { value: 'MS4wLjABAAAA-other', numericId: '7000000000000000001' }],
    ['the secUid', { value: 'MS4wLjABAAAA-other' }],
    ['the uid', { numericId: '7000000000000000001' }],
  ])('answers other for an entry whose %s belong to another account', (_label, entry) => {
    expect(matchAccount(withBoth, entry)).toBe('other');
  });

  it('answers conflict when one id agrees and the other does not', () => {
    expect(matchAccount(withBoth, { value: secUid, numericId: '7000000000000000001' })).toBe(
      'conflict',
    );
  });

  it.each([
    ['no id at all', withBoth, {}],
    ['only a uid against a target without one', secUidOnly, { numericId: uid }],
  ])('answers unknown for an entry with %s', (_label, target, entry) => {
    expect(matchAccount(target, entry)).toBe('unknown');
  });

  it('keeps the numeric id off the account id when it is not known', () => {
    expect(secUidOnly).toEqual({ platform: 'tiktok', value: secUid });
    expect(withBoth).toEqual({ platform: 'tiktok', value: secUid, numericId: uid });
  });
});
