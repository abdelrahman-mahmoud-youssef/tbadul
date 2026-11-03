import {
  createVerifier,
  failed,
  type Answer,
  type ProfileEvidence,
} from '@engagement-exchange/verification';
import {
  content,
  fakeSource,
  handle,
  listEvidence,
  manualClock,
  profileEvidence,
  recordingSink,
  sameOrder,
  token,
} from '@engagement-exchange/verification/testing';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { followsCommand, likedCommand, ownsCommand, profileCommand } from './follows.ts';

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
      followsCommand(verifier, sink.attempts, handle(performer), handle(target)),
    liked: (performer: string, video: string) =>
      likedCommand(verifier, sink.attempts, handle(performer), content(video)),
    profile: (subject: string) => profileCommand(verifier, sink.attempts, handle(subject)),
    owns: (subject: string, bioToken: string) =>
      ownsCommand(verifier, sink.attempts, handle(subject), token(bioToken)),
  };
};

describe('followsCommand', () => {
  let log: MockInstance;

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
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
});

describe('profileCommand', () => {
  let log: MockInstance;

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints the evidence of a found profile', async () => {
    const { profile, source } = run([
      found({
        ...visible,
        likesVisible: false,
        followerCount: 10,
        followingCount: 2,
        videoCount: 5,
        createdAt: Date.UTC(2020, 0, 2),
      }),
    ]);
    await expect(profile('tiktok')).resolves.toBe(0);
    expect(source.calls.map((check) => check.kind)).toEqual(['profile']);
    expect(log.mock.calls.flat()).toEqual([
      'profile @tiktok: verified',
      `  account id ${visible.accountId.value}`,
      '  private no, following visible, likes hidden',
      '  followers 10, following 2, videos 5',
      '  created 2020-01-02T00:00:00.000Z',
      'latency 400 ms, requests 1',
    ]);
  });

  it('leaves out counts and visibility it was not given', async () => {
    const { profile } = run([found(profileEvidence('bio'))]);
    await profile('tiktok');
    expect(log.mock.calls.flat()).toEqual([
      'profile @tiktok: verified',
      `  account id ${visible.accountId.value}`,
      '  private no, following unknown, likes unknown',
      'latency 400 ms, requests 1',
    ]);
  });

  it('prints only the outcome of a missing profile with its exit code', async () => {
    const { profile } = run([{ outcome: 'not_found', cost }]);
    await expect(profile('zq8v1k0x9m2nope')).resolves.toBe(3);
    expect(log.mock.calls.flat()[0]).toBe('profile @zq8v1k0x9m2nope: not_found');
    expect(log.mock.calls).toHaveLength(2);
  });
});

describe('ownsCommand', () => {
  let log: MockInstance;

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('verifies a bio that holds the token', async () => {
    const { owns } = run([found({ ...visible, bio: 'hello ee-7f3a' })]);
    await expect(owns('tiktok', 'ee-7f3a')).resolves.toBe(0);
    expect(log.mock.calls.flat()[0]).toBe('@tiktok owns: verified');
  });

  it('answers not_following when the token is absent', async () => {
    const { owns } = run([found({ ...visible, bio: 'hello' })]);
    await expect(owns('tiktok', 'ee-7f3a')).resolves.toBe(1);
    expect(log.mock.calls.flat().slice(0, 2)).toEqual([
      '@tiktok owns: not_following',
      '  token absent from the bio',
    ]);
  });

  it('answers private for a private profile', async () => {
    const { owns } = run([{ outcome: 'private', cost }]);
    await expect(owns('tiktok', 'ee-7f3a')).resolves.toBe(2);
  });
});
