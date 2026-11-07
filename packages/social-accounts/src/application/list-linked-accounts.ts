import { platforms, type Platform } from '@engagement-exchange/verification';
import type { AccountClaim } from '../domain/claim.ts';
import type { UserId } from '../domain/ids.ts';
import type { LinkedAccount } from '../domain/linked-account.ts';
import type { UseCaseDeps } from './deps.ts';

export interface PlatformAccounts {
  readonly platform: Platform;
  readonly limit: number;
  readonly used: number;
  readonly accounts: readonly LinkedAccount[];
  readonly openClaims: readonly AccountClaim[];
}

export type ListLinkedAccounts = (input: {
  readonly userId: UserId;
}) => Promise<readonly PlatformAccounts[]>;

export const listLinkedAccountsWith =
  (deps: UseCaseDeps): ListLinkedAccounts =>
  ({ userId }) => {
    const now = deps.clock.now();
    return Promise.all(
      platforms.map(async (platform) => ({
        platform,
        limit: deps.policy.maxAccountsPerPlatform,
        used: await deps.repository.countHeld(userId, platform, now),
        accounts: await deps.repository.listLinked(userId, platform),
        openClaims: await deps.repository.listOpen(userId, platform, now),
      })),
    );
  };
