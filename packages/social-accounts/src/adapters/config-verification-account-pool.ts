import {
  identityKey,
  samePlatform,
  type AccountId,
  type Platform,
} from '@engagement-exchange/verification';
import type {
  VerificationAccountPool,
  VerificationCandidate,
} from '../ports/verification-account-pool.ts';

export const configVerificationAccountPool = (
  candidates: readonly VerificationCandidate[],
  random: () => number = Math.random,
): VerificationAccountPool => {
  const assigned = new Map<string, number>();
  const assignedTo = (account: AccountId) => assigned.get(identityKey(account)) ?? 0;
  return {
    candidates: (platform: Platform) =>
      Promise.resolve(
        candidates
          .filter((candidate) => samePlatform(candidate.handle.platform, platform))
          .map((candidate) => ({
            candidate,
            count: assignedTo(candidate.accountId),
            order: random(),
          }))
          .sort((a, b) => a.count - b.count || a.order - b.order)
          .map(({ candidate }) => candidate),
      ),
    recordAssignment: (account: AccountId) => {
      assigned.set(identityKey(account), assignedTo(account) + 1);
      return Promise.resolve();
    },
  };
};
