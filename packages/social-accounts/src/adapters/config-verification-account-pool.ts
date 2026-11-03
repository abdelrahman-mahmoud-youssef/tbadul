import {
  identityKey,
  samePlatform,
  type AccountId,
  type Handle,
  type Platform,
} from '@engagement-exchange/verification';
import type {
  VerificationAccountPool,
  VerificationCandidate,
} from '../ports/verification-account-pool.ts';

const asCandidate = (account: Handle | VerificationCandidate): VerificationCandidate =>
  'handle' in account ? account : { handle: account };

export const configVerificationAccountPool = (
  accounts: readonly (Handle | VerificationCandidate)[],
  random: () => number = Math.random,
): VerificationAccountPool => {
  const candidates = accounts.map(asCandidate);
  const assigned = new Map<string, number>();
  const assignedTo = (account: AccountId | undefined) =>
    account === undefined ? 0 : (assigned.get(identityKey(account)) ?? 0);
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
