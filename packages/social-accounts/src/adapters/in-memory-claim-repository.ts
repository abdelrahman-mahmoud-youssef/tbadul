import { sameIdentity, samePlatform } from '@engagement-exchange/verification';
import { holdsAccount, type AccountClaim } from '../domain/claim.ts';
import type { AccountClaimRepository } from '../ports/account-claim-repository.ts';

export const claimStore = (claims: Map<string, AccountClaim>): AccountClaimRepository => ({
  findById: (id) => Promise.resolve(claims.get(id)),
  save: (claim) => {
    claims.set(claim.id, claim);
    return Promise.resolve();
  },
  countHeldBy: (userId, platform) =>
    Promise.resolve(
      [...claims.values()].filter(
        (claim) =>
          claim.userId === userId && samePlatform(claim.platform, platform) && holdsAccount(claim),
      ).length,
    ),
  findHolder: (handle) =>
    Promise.resolve(
      [...claims.values()]
        .filter((claim) => holdsAccount(claim) && sameIdentity(claim.handle, handle))
        .sort((a, b) => (a.state === 'verified' ? -1 : 0) - (b.state === 'verified' ? -1 : 0))[0],
    ),
});

export const inMemoryClaimRepository = (): AccountClaimRepository => claimStore(new Map());
