import { describe, expect, it } from 'vitest';
import { accountId, type ListedAccount } from '../domain/account-id.ts';
import type { FollowsBatch } from '../domain/follows-batch.ts';
import { fakeSource, followingPages, type FollowsHandler } from '../testing/fake-source.ts';
import { handle, performer } from '../testing/fixtures.ts';
import { manualClock } from '../testing/manual-clock.ts';
import { everyKind } from '../testing/orders.ts';
import { recordingSink } from '../testing/recording-sink.ts';
import { verifyFollowsBatchWith } from './chain.ts';
import { followingCache } from './following-cache.ts';

const performerId = accountId('tiktok', 'sec-performer');
const followedId = accountId('tiktok', 'sec-followed', 'uid-followed');
const laterId = accountId('tiktok', 'sec-later', 'uid-later');
const followed = { target: handle('followed'), targetId: followedId };
const later = { target: handle('later'), targetId: laterId };
const listedOf = ({ value, numericId }: typeof followedId): ListedAccount => ({
  value,
  ...(numericId !== undefined && { numericId }),
});

const batch = (...targets: FollowsBatch['targets']): FollowsBatch => ({
  performer,
  performerId,
  targets,
});

const harness = (...lists: (readonly ListedAccount[])[]) => {
  const clock = manualClock();
  const measurements = recordingSink();
  const reads: number[] = [];
  const follows: FollowsHandler = (check, context) => {
    const list = lists[Math.min(reads.length, lists.length - 1)] ?? [];
    reads.push(check.targets.length);
    return followingPages(list)(check, context);
  };
  const verify = verifyFollowsBatchWith({
    sources: everyKind([fakeSource('live', { follows })]),
    clock,
    measurements,
    pageCap: 3,
    confirmNotFollowing: false,
    following: followingCache(30_000, clock),
  });
  return { verify, clock, reads, measurements };
};

describe('following cache', () => {
  it('answers a target found in a list read within the window without a source call', async () => {
    const { verify, clock, reads, measurements } = harness([listedOf(followedId)]);
    await verify(batch(followed));
    clock.advance(30_000);

    const [verdict] = await verify(batch(followed));

    expect(verdict).toMatchObject({ outcome: 'verified', source: 'cache' });
    expect(reads).toEqual([1]);
    expect(measurements.attempts.at(-1)).toMatchObject({ source: 'cache', outcome: 'verified' });
    expect(measurements.attempts.at(-1)?.cost).toBeUndefined();
  });

  it('reads live once the window has passed', async () => {
    const { verify, clock, reads } = harness([listedOf(followedId)]);
    await verify(batch(followed));
    clock.advance(30_001);

    const [verdict] = await verify(batch(followed));

    expect(verdict).toMatchObject({ outcome: 'verified', source: 'live' });
    expect(reads).toEqual([1, 1]);
  });

  it('never serves not_following: a follow made after the read is found live', async () => {
    const { verify, clock, reads } = harness(
      [listedOf(followedId)],
      [listedOf(followedId), listedOf(laterId)],
    );
    const [, baseline] = await verify(batch(followed, later));
    clock.advance(5_000);

    const [verdict] = await verify(batch(later));

    expect(baseline).toMatchObject({ outcome: 'not_following' });
    expect(verdict).toMatchObject({ outcome: 'verified', source: 'live' });
    expect(reads).toEqual([2, 1]);
  });

  it('asks the source only about the targets the cache does not answer', async () => {
    const { verify, reads } = harness([listedOf(followedId)]);
    await verify(batch(followed));

    const verdicts = await verify(batch(followed, later));

    expect(verdicts.map(({ outcome }) => outcome)).toEqual(['verified', 'not_following']);
    expect(reads).toEqual([1, 1]);
  });

  it('keeps no list for a batch without the performer id', async () => {
    const { verify, reads } = harness([listedOf(followedId)]);
    await verify({ performer, targets: [followed] });

    await verify({ performer, targets: [followed] });

    expect(reads).toEqual([1, 1]);
  });
});
