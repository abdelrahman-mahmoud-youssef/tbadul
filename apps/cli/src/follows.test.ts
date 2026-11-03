import {
  createVerifier,
  failed,
  type Answer,
  type ProfileEvidence,
} from '@engagement-exchange/verification';
import {
  fakeSource,
  listEvidence,
  manualClock,
  profileEvidence,
  recordingSink,
  sameOrder,
} from '@engagement-exchange/verification/testing';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { followsCommand, likedCommand } from './follows.ts';

const cost = { unit: 'request', amount: 1 } as const;
const visible: ProfileEvidence = {
  ...profileEvidence('bio'),
  followingVisible: true,
  likesVisible: true,
};
const found = (evidence: ProfileEvidence = visible): Answer<'profile'> => ({
  outcome: 'verified',
  evidence,
  cost,
});
const verified: Answer<'follows'> = { outcome: 'verified', evidence: listEvidence, cost };

const run = (profiles: readonly Answer<'profile'>[], list: Answer<'follows'> = verified) => {
  const clock = manualClock();
  const sink = recordingSink();
  let index = 0;
  const source = fakeSource('scraper', {
    profile: () => {
      clock.advance(400);
      const answer = profiles[Math.min(index, profiles.length - 1)] ?? found();
      index += 1;
      return Promise.resolve(answer);
    },
    follows: () => {
      clock.advance(300);
      return Promise.resolve(list);
    },
    liked: () => {
      clock.advance(300);
      return Promise.resolve(list);
    },
  });
  const verifier = createVerifier(
    { order: sameOrder(['scraper']), timeoutMs: 1000, pageCap: 1 },
    { sources: [source], clock, measurements: sink },
  );
  return {
    source,
    follows: (performer: string, target: string) =>
      followsCommand(verifier, sink.attempts, performer, target),
    liked: (performer: string, content: string) =>
      likedCommand(verifier, sink.attempts, performer, content),
  };
};

describe('followsCommand', () => {
  let log: MockInstance;
  let error: MockInstance;

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('makes two profile checks and one list call carrying the performer id', async () => {
    const { follows, source } = run([found(), found()]);
    await expect(follows('@tiktok', 'tiktokcreators')).resolves.toBe(0);
    expect(source.calls.map((check) => check.kind)).toEqual(['profile', 'profile', 'follows']);
    expect(source.calls[2]).toMatchObject({ performerId: visible.accountId });
    expect(log.mock.calls.flat()).toEqual([
      '@tiktok follows @tiktokcreators: verified',
      'latency 1100 ms, requests 3',
    ]);
  });

  it.each([
    ['not_following', { outcome: 'not_following', evidence: listEvidence, cost }, 1],
    ['not_found', { outcome: 'not_found', cost }, 3],
    ['source_error (blocked)', failed({ kind: 'blocked', message: 'waf' }, cost), 4],
  ] as const)('prints %s from the list check with its exit code', async (outcome, list, code) => {
    const { follows } = run([found(), found()], list);
    await expect(follows('@tiktok', 'tiktokcreators')).resolves.toBe(code);
    expect(log.mock.calls.flat()[0]).toBe(`@tiktok follows @tiktokcreators: ${outcome}`);
  });

  it('passes the performer following count into the follows check', async () => {
    const { follows, source } = run([found(), found({ ...visible, followingCount: 11 })]);
    await follows('@tiktok', 'tiktokcreators');
    expect(source.calls[2]).toMatchObject({ performerFollowingCount: 11 });
  });

  it.each([
    ['a private performer', { ...visible, isPrivate: true }],
    ['a hidden following list', { ...visible, followingVisible: false }],
  ])('answers private for %s with no list call', async (_label, performer) => {
    const { follows, source } = run([found(), found(performer)]);
    await expect(follows('@charlidamelio', 'tiktok')).resolves.toBe(2);
    expect(source.calls.map((check) => check.kind)).toEqual(['profile', 'profile']);
    expect(log.mock.calls.flat()).toEqual([
      '@charlidamelio follows @tiktok: private',
      'latency 800 ms, requests 2',
    ]);
  });

  it('stops at a missing target before resolving the performer', async () => {
    const { follows, source } = run([{ outcome: 'not_found', cost }]);
    await expect(follows('tiktok', 'zq8v1k0x9m2nope')).resolves.toBe(3);
    expect(source.calls.map((check) => check.kind)).toEqual(['profile']);
    expect(log.mock.calls.flat()[0]).toBe('target @zq8v1k0x9m2nope: not_found');
  });

  it('stops at a missing performer with no list call', async () => {
    const { follows, source } = run([found(), { outcome: 'not_found', cost }]);
    await expect(follows('zq8v1k0x9m2nope', 'tiktok')).resolves.toBe(3);
    expect(source.calls.map((check) => check.kind)).toEqual(['profile', 'profile']);
    expect(log.mock.calls.flat()[0]).toBe('performer @zq8v1k0x9m2nope: not_found');
  });

  it('refuses an invalid handle with the usage exit code and calls no source', async () => {
    const { follows, source } = run([found()]);
    await expect(follows('not valid', 'tiktok')).resolves.toBe(64);
    expect(error).toHaveBeenCalledWith('invalid handle: not valid');
    expect(source.calls).toEqual([]);
  });
});

describe('likedCommand', () => {
  let log: MockInstance;

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('makes one profile check and one list call carrying the performer id', async () => {
    const { liked, source } = run([found()]);
    await expect(liked('tiktok', '7000000000000000000')).resolves.toBe(0);
    expect(source.calls.map((check) => check.kind)).toEqual(['profile', 'liked']);
    expect(source.calls[1]).toMatchObject({ performerId: visible.accountId });
    expect(log.mock.calls.flat()).toEqual([
      '@tiktok liked 7000000000000000000: verified',
      'latency 700 ms, requests 2',
    ]);
  });

  it('answers private for hidden likes with no list call', async () => {
    const { liked, source } = run([found({ ...visible, likesVisible: false })]);
    await expect(liked('tiktok', '7000000000000000000')).resolves.toBe(2);
    expect(source.calls.map((check) => check.kind)).toEqual(['profile']);
  });

  it('refuses a content id that is not one', async () => {
    const { liked, source } = run([found()]);
    await expect(liked('tiktok', 'abc')).resolves.toBe(64);
    expect(source.calls).toEqual([]);
  });
});
