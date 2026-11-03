import type { AccountId, Handle, Platform } from '@engagement-exchange/verification';
import { cooldownAfter, type CooldownSchedule } from './cooldown.ts';
import type { EligibilityReport } from './eligibility.ts';
import type { ClaimId, UserId } from './ids.ts';

export const claimStates = [
  'eligibility_failed',
  'awaiting_follow',
  'verified',
  'expired',
  'rejected',
] as const;

export type ClaimState = (typeof claimStates)[number];

export type FailedAttemptOutcome = 'not_following' | 'private' | 'not_found';

export interface VerifyAttempt {
  readonly at: number;
  readonly outcome: FailedAttemptOutcome;
}

export type RejectionReason = 'pool_exhausted' | 'account_already_claimed';

export interface AccountClaim {
  readonly id: ClaimId;
  readonly userId: UserId;
  readonly platform: Platform;
  readonly handle: Handle;
  readonly accountId: AccountId;
  readonly verificationAccount?: Handle;
  readonly eligibility: EligibilityReport;
  readonly state: ClaimState;
  readonly rejection?: RejectionReason;
  readonly attempts: readonly VerifyAttempt[];
  readonly nextVerifyAt: number;
  readonly startedAt: number;
  readonly expiresAt: number;
}

export interface ClaimDraft {
  readonly id: ClaimId;
  readonly userId: UserId;
  readonly handle: Handle;
  readonly accountId: AccountId;
  readonly eligibility: EligibilityReport;
  readonly startedAt: number;
  readonly ttlMs: number;
}

const base = (draft: ClaimDraft): Omit<AccountClaim, 'state'> => ({
  id: draft.id,
  userId: draft.userId,
  platform: draft.handle.platform,
  handle: draft.handle,
  accountId: draft.accountId,
  eligibility: draft.eligibility,
  attempts: [],
  nextVerifyAt: draft.startedAt,
  startedAt: draft.startedAt,
  expiresAt: draft.startedAt + draft.ttlMs,
});

export const eligibilityFailed = (draft: ClaimDraft): AccountClaim => ({
  ...base(draft),
  state: 'eligibility_failed',
});

export const rejected = (draft: ClaimDraft, rejection: RejectionReason): AccountClaim => ({
  ...base(draft),
  state: 'rejected',
  rejection,
});

export const awaitingFollow = (draft: ClaimDraft, verificationAccount: Handle): AccountClaim => ({
  ...base(draft),
  verificationAccount,
  state: 'awaiting_follow',
});

export const isExpired = (claim: AccountClaim, now: number): boolean => now >= claim.expiresAt;

export const verifyWaitMs = (claim: AccountClaim, now: number): number =>
  Math.max(0, claim.nextVerifyAt - now);

export const recordFailedAttempt = (
  claim: AccountClaim,
  outcome: FailedAttemptOutcome,
  now: number,
  schedule: CooldownSchedule,
): AccountClaim => {
  const attempts = [...claim.attempts, { at: now, outcome }];
  return { ...claim, attempts, nextVerifyAt: now + cooldownAfter(attempts.length, schedule) };
};

export const markVerified = (claim: AccountClaim): AccountClaim => ({
  ...claim,
  state: 'verified',
});

export const markExpired = (claim: AccountClaim): AccountClaim => ({ ...claim, state: 'expired' });

export const markRejected = (claim: AccountClaim, rejection: RejectionReason): AccountClaim => ({
  ...claim,
  state: 'rejected',
  rejection,
});

export const holdsAccount = (claim: AccountClaim): boolean =>
  claim.state === 'verified' || claim.state === 'awaiting_follow';
