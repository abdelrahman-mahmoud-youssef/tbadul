import {
  identityKey,
  samePlatform,
  type Handle,
  type Platform,
} from '@engagement-exchange/verification';
import type { VerificationAccountPool } from '../ports/verification-account-pool.ts';

export const configVerificationAccountPool = (
  accounts: readonly Handle[],
  random: () => number = Math.random,
): VerificationAccountPool => {
  const assigned = new Map<string, number>();
  const assignedTo = (account: Handle) => assigned.get(identityKey(account)) ?? 0;
  return {
    candidates: (platform: Platform) =>
      Promise.resolve(
        accounts
          .filter((account) => samePlatform(account.platform, platform))
          .map((account) => ({ account, count: assignedTo(account), order: random() }))
          .sort((a, b) => a.count - b.count || a.order - b.order)
          .map(({ account }) => account),
      ),
    recordAssignment: (account: Handle) => {
      assigned.set(identityKey(account), assignedTo(account) + 1);
      return Promise.resolve();
    },
  };
};
