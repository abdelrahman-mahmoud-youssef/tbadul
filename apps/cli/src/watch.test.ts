import {
  createVerifier,
  failed,
  type Answer,
  type ProfileEvidence,
} from '@engagement-exchange/verification';
import {
  fakeSource,
  handle,
  listEvidence,
  manualClock,
  profileEvidence,
  recordingSink,
  sameOrder,
} from '@engagement-exchange/verification/testing';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { watchFollows } from './watch.ts';

const cost = { unit: 'request', amount: 1 } as const;
const performer: ProfileEvidence = {
  ...profileEvidence('bio'),
  followingVisible: true,
  followingCount: 5,
};
const verified: Answer<'follows'> = { outcome: 'verified', evidence: listEvidence, cost };
const notFollowing: Answer<'follows'> = {
  outcome: 'not_following',
  evidence: { pagesRead: 1, listExhausted: true, entriesRead: 4 },
  cost,
};
const blocked = failed({ kind: 'blocked', message: 'waf' }, cost);

const watch = (
  runs: readonly Answer<'follows'>[],
  times: number | undefined,
  evidence: ProfileEvidence = performer,
) => {
  const clock = manualClock(Date.UTC(2026, 10, 3, 12));
  const sink = recordingSink();
  let index = 0;
  const source = fakeSource('scraper', {
    profile: { outcome: 'verified', evidence, cost },
    follows: () => {
      const answer = runs[Math.min(index, runs.length - 1)] ?? verified;
      index += 1;
      return Promise.resolve(answer);
    },
  });
  const verifier = createVerifier(
    { order: sameOrder(['scraper']), timeoutMs: 1000, pageCap: 1 },
    { sources: [source], clock, measurements: sink },
  );
  const sleep = vi.fn((ms: number) => {
    clock.advance(ms);
    return Promise.resolve();
  });
  const code = watchFollows(
    verifier,
    sink.attempts,
    handle('panel.performer'),
    handle('panel.target'),
    { everySeconds: 30, times },
    { sleep, clock },
  );
  return { code, sleep, source };
};

describe('watchFollows', () => {
  let log: MockInstance;

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports an unfollow after an earlier verified run and exits 1', async () => {
    const { code, sleep } = watch([verified, verified, notFollowing], undefined);
    await expect(code).resolves.toBe(1);
    expect(log.mock.calls.flat()).toEqual([
      '2026-11-03T12:00:00.000Z @panel.performer follows @panel.target: verified',
      '2026-11-03T12:00:30.000Z @panel.performer follows @panel.target: verified',
      '2026-11-03T12:01:00.000Z @panel.performer follows @panel.target: not_following',
      '@panel.performer unfollowed @panel.target',
    ]);
    expect(sleep.mock.calls).toEqual([[30_000], [30_000]]);
  });

  it('reads the list by account id without the following count resolved before the watch', async () => {
    const { code, source } = watch([verified], 2);
    await code;
    const lists = source.calls.filter((check) => check.kind === 'follows');
    expect(lists).toHaveLength(2);
    for (const check of lists) {
      expect(check).toMatchObject({ performerId: performer.accountId });
      expect(check).not.toHaveProperty('performerFollowingCount');
    }
  });

  it('stops after the given number of runs with the last outcome code', async () => {
    const { code, sleep } = watch([verified, verified, blocked], 3);
    await expect(code).resolves.toBe(4);
    expect(log.mock.calls).toHaveLength(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('does not treat a source_error run as an unfollow', async () => {
    const { code } = watch([verified, blocked, verified], 3);
    await expect(code).resolves.toBe(0);
    expect(log.mock.calls.flat()[1]).toBe(
      '2026-11-03T12:00:30.000Z @panel.performer follows @panel.target: source_error (blocked)',
    );
    expect(log.mock.calls.flat()).not.toContain('@panel.performer unfollowed @panel.target');
  });

  it('reports an unfollow after a verified run even with source errors between', async () => {
    const { code } = watch([verified, blocked, notFollowing], undefined);
    await expect(code).resolves.toBe(1);
    expect(log.mock.calls.flat().at(-1)).toBe('@panel.performer unfollowed @panel.target');
  });

  it('keeps watching a pair that was never verified', async () => {
    const { code } = watch([notFollowing, blocked, notFollowing], 3);
    await expect(code).resolves.toBe(1);
    expect(log.mock.calls).toHaveLength(3);
    expect(log.mock.calls.flat()).not.toContain('@panel.performer unfollowed @panel.target');
  });

  it('stops before any run when the following list is hidden', async () => {
    const { code, source } = watch([verified], 3, { ...performer, followingVisible: false });
    await expect(code).resolves.toBe(2);
    expect(source.calls.map((check) => check.kind)).toEqual(['profile', 'profile']);
  });
});
