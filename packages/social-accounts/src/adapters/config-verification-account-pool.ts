import { samePlatform, type Handle, type Platform } from '@engagement-exchange/verification';
import type { VerificationAccountPool } from '../ports/verification-account-pool.ts';

export const configVerificationAccountPool = (
  accounts: readonly Handle[],
  random: () => number = Math.random,
): VerificationAccountPool => ({
  candidates: (platform: Platform) =>
    accounts
      .filter((account) => samePlatform(account.platform, platform))
      .map((account) => ({ account, order: random() }))
      .sort((a, b) => a.order - b.order)
      .map(({ account }) => account),
});
