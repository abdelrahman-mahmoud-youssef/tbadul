import { describe, expect, it } from 'vitest';
import { accountId } from '../domain/account-id.ts';
import { failed } from '../domain/answer.ts';
import type { FollowsBatch, FollowsTarget } from '../domain/follows-batch.ts';
import { fakeSource, followingPages, type FakeAnswers } from '../testing/fake-source.ts';
import { handle, performer } from '../testing/fixtures.ts';
import { manualClock } from '../testing/manual-clock.ts';
import { everyKind } from '../testing/orders.ts';
import { recordingSink } from '../testing/recording-sink.ts';
import { verifyFollowsBatchWith } from './chain.ts';

const followed = (name: string): FollowsTarget => ({
  target: handle(name),
  targetId: accountId('tiktok', `sec-${name}`, `uid-${name}`),
});

const [first, second, third] = [followed('first'), followed('second'), followed('third')] as const;

const entry = ({ targetId }: FollowsTarget) => ({
  value: targetId.value,
  ...(targetId.numericId !== undefined && { numericId: targetId.numericId }),
});

const stranger = { value: 'sec-stranger', numericId: 'uid-stranger' };

const batch = (...targets: FollowsTarget[]): FollowsBatch => ({
  performer,
  performerId: accountId('tiktok', 'sec-performer'),
  targets,
});

const chain = (confirmNotFollowing: boolean, pageCap: number, ...sources: FakeAnswers[]) => {
  const fakes = sources.map((answers, index) => fakeSource(`s${index}`, answers));
  const measurements = recordingSink();
  const verify = verifyFollowsBatchWith({
    sources: everyKind(fakes),
    clock: manualClock(),
    measurements,
    pageCap,
    confirmNotFollowing,
  });
  return { verify, fakes, measurements };
};

describe('verifyFollowsBatch', () => {
  it('answers several targets from one list read across pages', async () => {
    const { verify, measurements } = chain(false, 3, {
      follows: followingPages([stranger, entry(first)], [entry(third)]),
    });

    const verdicts = await verify(batch(first, second, third));

    expect(verdicts.map(({ outcome }) => outcome)).toEqual([
      'verified',
      'not_following',
      'verified',
    ]);
    expect(verdicts[1]).toMatchObject({
      evidence: { pagesRead: 2, listExhausted: true, entriesRead: 3 },
    });
    expect(measurements.attempts).toHaveLength(1);
    expect(measurements.attempts[0]?.cost).toEqual({ unit: 'request', amount: 2 });
  });

  it('stops reading once every target is found', async () => {
    const { verify, measurements } = chain(false, 3, {
      follows: followingPages([entry(first), entry(second)], [stranger]),
    });

    const verdicts = await verify(batch(first, second));

    expect(verdicts.map(({ outcome }) => outcome)).toEqual(['verified', 'verified']);
    expect(measurements.attempts[0]?.cost).toEqual({ unit: 'request', amount: 1 });
  });

  it('answers not_following for unfound targets when the page cap stops the read', async () => {
    const { verify, measurements } = chain(false, 2, {
      follows: followingPages([stranger], [entry(first)], [entry(second)]),
    });

    const verdicts = await verify(batch(first, second));

    expect(verdicts[0]).toMatchObject({ outcome: 'verified' });
    expect(verdicts[1]).toMatchObject({
      outcome: 'not_following',
      evidence: { pagesRead: 2, listExhausted: false, entriesRead: 2 },
    });
    expect(measurements.attempts[0]?.cost).toEqual({ unit: 'request', amount: 2 });
  });

  it('asks a confirming source only about the targets still not_following', async () => {
    const { verify, fakes } = chain(
      true,
      3,
      { follows: followingPages([entry(first)]) },
      { follows: followingPages([entry(second)]) },
    );

    const verdicts = await verify(batch(first, second, third));

    expect(
      verdicts.map(({ outcome, ...rest }) => [outcome, 'source' in rest && rest.source]),
    ).toEqual([
      ['verified', 's0'],
      ['verified', 's1'],
      ['not_following', 's1'],
    ]);
    expect(fakes[1]?.calls.map((call) => call.kind === 'follows' && call.target)).toEqual([
      second.target,
      third.target,
    ]);
  });

  it('falls through a failed read for every target and keeps both attempts', async () => {
    const { verify } = chain(
      false,
      3,
      { follows: failed({ kind: 'timeout', message: 'slow' }) },
      { follows: followingPages([entry(second)]) },
    );

    const verdicts = await verify(batch(first, second));

    expect(verdicts.map(({ outcome }) => outcome)).toEqual(['not_following', 'verified']);
    expect(verdicts[0]?.attempts.map(({ source, outcome }) => [source, outcome])).toEqual([
      ['s0', 'source_error'],
      ['s1', 'not_following'],
    ]);
  });

  it('answers source_error for every target when no source can read the list', async () => {
    const { verify } = chain(false, 3, { follows: failed({ kind: 'blocked', message: 'no' }) });

    const verdicts = await verify(batch(first, second));

    expect(verdicts.map(({ outcome }) => outcome)).toEqual(['source_error', 'source_error']);
  });

  it('applies the shorter-list rule to each not_following target', async () => {
    const { verify } = chain(false, 3, { follows: followingPages([entry(first)]) });

    const verdicts = await verify({ ...batch(first, second), performerFollowingCount: 5 });

    expect(verdicts.map(({ outcome }) => outcome)).toEqual(['verified', 'source_error']);
    expect(verdicts[1]?.attempts[0]?.error).toMatchObject({ kind: 'incomplete_list' });
  });

  it('keeps an identity conflict on the target it concerns', async () => {
    const { verify } = chain(false, 3, {
      follows: followingPages([entry(first), { value: second.targetId.value, numericId: 'uid-x' }]),
    });

    const verdicts = await verify(batch(first, second));

    expect(verdicts.map(({ outcome }) => outcome)).toEqual(['verified', 'source_error']);
  });
});
