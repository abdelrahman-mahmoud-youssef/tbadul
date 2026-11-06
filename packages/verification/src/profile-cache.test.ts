import { describe, expect, it } from 'vitest';
import { createVerifier, type VerifierConfig } from './create-verifier.ts';
import { accountId } from './domain/account-id.ts';
import { failed, type Answer } from './domain/answer.ts';
import type { ProfileEvidence } from './domain/evidence.ts';
import type { ProfileCache } from './ports/profile-cache.ts';
import { fakeSource } from './testing/fake-source.ts';
import { handle, performer, profileEvidence, token } from './testing/fixtures.ts';
import { inMemoryProfileCache } from './testing/in-memory-profile-cache.ts';
import { manualClock } from './testing/manual-clock.ts';
import { sameOrder } from './testing/orders.ts';
import { recordingSink } from './testing/recording-sink.ts';

const hour = 3_600_000;
const cost = { unit: 'request', amount: 1 } as const;
const evidence: ProfileEvidence = { ...profileEvidence('a bio'), followerCount: 1200 };
const verified: Answer<'profile'> = { outcome: 'verified', evidence, cost };
const profile = { kind: 'profile', subject: performer } as const;
const down = () => Promise.reject(new Error('cache down'));
const config: VerifierConfig = {
  order: sameOrder(['lamatok']),
  timeoutMs: 1000,
  pageCap: 3,
  cache: { handleTtlMs: hour, statsTtlMs: 2 * hour },
};

const setup = (
  answer: Answer<'profile'> = verified,
  cache: ProfileCache = inMemoryProfileCache(),
) => {
  const source = fakeSource('lamatok', { profile: answer });
  const clock = manualClock();
  const sink = recordingSink();
  const verifier = createVerifier(config, {
    sources: [source],
    clock,
    measurements: sink,
    profileCache: cache,
  });
  return { source, clock, sink, cache, verifier };
};

describe('the profile cache in front of the chain', () => {
  it('asks the chain on a miss and answers the next check from the cache', async () => {
    const { source, clock, sink, verifier } = setup();

    const first = await verifier.verify(profile);
    const second = await verifier.verify(profile);

    const hit = {
      source: 'cache',
      platform: 'tiktok',
      check: 'profile',
      outcome: 'verified',
      startedAt: clock.now(),
      latencyMs: 0,
    };
    expect(first).toMatchObject({ source: 'lamatok', evidence });
    expect(second).toEqual({
      outcome: 'verified',
      evidence,
      source: 'cache',
      check: profile,
      attempts: [hit],
    });
    expect(source.calls).toHaveLength(1);
    expect(sink.attempts).toEqual([expect.objectContaining({ source: 'lamatok', cost }), hit]);
  });

  it('asks the chain when a latest post is wanted and the cached profile has none', async () => {
    const { source, verifier } = setup();
    await verifier.verify(profile);

    await verifier.verify({ ...profile, latestPost: true });

    expect(source.calls).toEqual([profile, { ...profile, latestPost: true }]);
  });

  it('answers a latest-post check from the cache once the cached profile carries one', async () => {
    const { source, verifier } = setup({
      ...verified,
      evidence: { ...evidence, latestPostAt: Date.UTC(2026, 10, 1) },
    });
    await verifier.verify({ ...profile, latestPost: true });

    const again = await verifier.verify({ ...profile, latestPost: true });

    expect(again).toMatchObject({ outcome: 'verified', source: 'cache' });
    expect(source.calls).toHaveLength(1);
  });

  it('asks the chain again once the stats are older than statsTtlMs', async () => {
    const { source, clock, verifier } = setup();
    await verifier.verify({ ...profile, subjectId: evidence.accountId });

    clock.advance(2 * hour);
    await verifier.verify({ ...profile, subjectId: evidence.accountId });
    clock.advance(1);
    await verifier.verify({ ...profile, subjectId: evidence.accountId });

    expect(source.calls).toHaveLength(2);
  });

  it('honours a fresher maxAgeMs for one call', async () => {
    const { source, clock, verifier } = setup();
    await verifier.verify(profile);
    clock.advance(60_000);

    await expect(verifier.verify(profile, { maxAgeMs: 1000 })).resolves.toMatchObject({
      source: 'lamatok',
    });
    expect(source.calls).toHaveLength(2);
  });

  it('stops trusting a handle after handleTtlMs while the account id still resolves', async () => {
    const { source, clock, verifier } = setup();
    await verifier.verify(profile);
    clock.advance(hour + 1);

    await expect(
      verifier.verify({ ...profile, subjectId: evidence.accountId }),
    ).resolves.toMatchObject({ source: 'cache' });
    await expect(verifier.verify(profile)).resolves.toMatchObject({ source: 'lamatok' });
    expect(source.calls).toHaveLength(2);
  });

  it('looks up by subjectId whatever handle the check names', async () => {
    const { verifier } = setup();
    await verifier.verify(profile);

    await expect(
      verifier.verify({
        kind: 'profile',
        subject: handle('renamed'),
        subjectId: evidence.accountId,
      }),
    ).resolves.toMatchObject({ source: 'cache', evidence });
  });

  it('misses when two accounts carry the handle', async () => {
    const clock = manualClock();
    const shared = { handle: performer, source: 'lamatok', fetchedAt: clock.now() };
    const { source, verifier } = setup(
      verified,
      inMemoryProfileCache([
        { ...shared, evidence },
        { ...shared, evidence: { ...evidence, accountId: accountId('tiktok', 'other') } },
      ]),
    );

    await expect(verifier.verify(profile)).resolves.toMatchObject({ source: 'lamatok' });
    expect(source.calls).toHaveLength(1);
  });

  it.each<[string, Answer<'profile'>]>([
    ['private', { outcome: 'private', cost }],
    ['not_found', { outcome: 'not_found', cost }],
    ['source_error', failed({ kind: 'timeout', message: 'slow' })],
  ])('does not cache a %s answer', async (_outcome, answer) => {
    const { source, cache, verifier } = setup(answer);

    await verifier.verify(profile);
    await verifier.verify(profile);

    expect(source.calls).toHaveLength(2);
    await expect(cache.byHandle(performer)).resolves.toEqual([]);
  });

  it('proves ownership against the chain, never a cached bio', async () => {
    const { source, verifier } = setup();
    await verifier.verify(profile);

    await verifier.verifyOwnership(performer, token('EX-7Q2M9K'));

    expect(source.calls).toHaveLength(2);
  });

  it('treats a failing cache lookup as a miss', async () => {
    const { source, verifier } = setup(verified, {
      ...inMemoryProfileCache(),
      byId: down,
      byHandle: down,
    });

    await verifier.verify(profile);
    await expect(
      verifier.verify({ ...profile, subjectId: evidence.accountId }),
    ).resolves.toMatchObject({ outcome: 'verified', source: 'lamatok', evidence });
    expect(source.calls).toHaveLength(2);
  });

  it('returns the chain verdict when storing it in the cache fails', async () => {
    const { verifier } = setup(verified, { ...inMemoryProfileCache(), store: down });

    await expect(verifier.verify(profile)).resolves.toMatchObject({
      outcome: 'verified',
      source: 'lamatok',
      evidence,
    });
  });

  it('asks the chain every time when no cache is configured', async () => {
    const source = fakeSource('lamatok', { profile: verified });
    const verifier = createVerifier(config, { sources: [source], clock: manualClock() });

    await verifier.verify(profile);
    await verifier.verify(profile);

    expect(source.calls).toHaveLength(2);
  });
});
