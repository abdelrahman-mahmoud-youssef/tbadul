import { accountId } from '@engagement-exchange/verification';
import { handle } from '@engagement-exchange/verification/testing';
import { describe, expect, it } from 'vitest';
import {
  awaitingFollow,
  eligibilityFailed,
  holdsAccount,
  isExpired,
  markExpired,
  markVerified,
  recordFailedAttempt,
  rejected,
  verifyWaitMs,
  type ClaimDraft,
} from './claim.ts';
import { cooldownAfter } from './cooldown.ts';
import { claimId, userId } from './ids.ts';

const schedule = { stepsMs: [30_000, 60_000, 120_000, 300_000], afterwardsMs: 600_000 };
const startedAt = Date.UTC(2026, 10, 2);
const account = accountId('tiktok', 'MS4wLjABAAAA');
const draft: ClaimDraft = {
  id: claimId('c1'),
  userId: userId('alice'),
  handle: handle('some.creator'),
  accountId: account,
  eligibility: { eligible: true, results: [] },
  startedAt,
  ttlMs: 86_400_000,
};

describe('cooldownAfter', () => {
  it.each([
    [1, 30_000],
    [2, 60_000],
    [3, 120_000],
    [4, 300_000],
    [5, 600_000],
    [9, 600_000],
  ])('attempt %i waits %i ms', (attempts, wait) => {
    expect(cooldownAfter(attempts, schedule)).toBe(wait);
  });
});

describe('claim transitions', () => {
  it('starts awaiting_follow with the assigned account, no attempts, an expiry and version 0', () => {
    const claim = awaitingFollow(draft, handle('verify.one'));
    expect(claim).toMatchObject({
      state: 'awaiting_follow',
      accountId: account,
      verificationAccount: handle('verify.one'),
      attempts: [],
      nextVerifyAt: startedAt,
      expiresAt: startedAt + 86_400_000,
      version: 0,
    });
    expect(holdsAccount(claim, startedAt)).toBe(true);
  });

  it('holds the account while awaiting a follow only until the claim expires', () => {
    const claim = awaitingFollow(draft, handle('verify.one'));
    expect(holdsAccount(claim, claim.expiresAt - 1)).toBe(true);
    expect(holdsAccount(claim, claim.expiresAt)).toBe(false);
  });

  it('records a failed attempt and pushes the next verify time along the schedule', () => {
    let claim = awaitingFollow(draft, handle('verify.one'));
    const now = startedAt + 1000;
    const attempt = { at: now, outcome: 'not_following', source: 'fake', latencyMs: 12 } as const;
    claim = recordFailedAttempt(claim, attempt, schedule);
    expect(claim.attempts).toEqual([attempt]);
    expect(claim.nextVerifyAt).toBe(now + 30_000);
    expect(verifyWaitMs(claim, now + 10_000)).toBe(20_000);
    expect(verifyWaitMs(claim, now + 30_000)).toBe(0);
    claim = recordFailedAttempt(claim, { at: now + 30_000, outcome: 'private' }, schedule);
    expect(claim.nextVerifyAt).toBe(now + 30_000 + 60_000);
  });

  it('expires at the expiry time and no earlier', () => {
    const claim = awaitingFollow(draft, handle('verify.one'));
    expect(isExpired(claim, claim.expiresAt - 1)).toBe(false);
    expect(isExpired(claim, claim.expiresAt)).toBe(true);
    expect(markExpired(claim).state).toBe('expired');
  });

  it('marks verified and keeps holding the account past the expiry', () => {
    const claim = markVerified(awaitingFollow(draft, handle('verify.one')));
    expect(claim.state).toBe('verified');
    expect(holdsAccount(claim, claim.expiresAt + 1)).toBe(true);
  });

  it.each([
    ['eligibility_failed', eligibilityFailed(draft)],
    ['rejected', rejected(draft, 'pool_exhausted')],
  ])('%s does not hold the account', (_state, claim) => {
    expect(holdsAccount(claim, startedAt)).toBe(false);
  });
});
