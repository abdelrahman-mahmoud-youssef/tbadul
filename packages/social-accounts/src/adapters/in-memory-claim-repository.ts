import {
  err,
  ok,
  sameIdentity,
  samePlatform,
  type AccountId,
} from '@engagement-exchange/verification';
import { holdsAccount, isExpired, markExpired, type AccountClaim } from '../domain/claim.ts';
import type { UserId } from '../domain/ids.ts';
import type { LinkedAccount } from '../domain/linked-account.ts';
import type { AccountClaimRepository } from '../ports/account-claim-repository.ts';

const openOn = (claim: AccountClaim, userId: UserId, accountId: AccountId): boolean =>
  claim.state === 'awaiting_follow' &&
  claim.userId === userId &&
  sameIdentity(claim.accountId, accountId);

export const inMemoryClaimRepository = (): AccountClaimRepository => {
  const claims = new Map<string, AccountClaim>();
  const links: LinkedAccount[] = [];
  const all = () => [...claims.values()];
  const current = (claim: AccountClaim) => claims.get(claim.id)?.version === claim.version;
  const store = (claim: AccountClaim) => {
    const stored = { ...claim, version: claim.version + 1 };
    claims.set(claim.id, stored);
    return stored;
  };
  return {
    findById: (id) => Promise.resolve(claims.get(id)),
    findOpen: (userId, accountId, now) =>
      Promise.resolve(
        all().find((claim) => openOn(claim, userId, accountId) && !isExpired(claim, now)),
      ),
    findOwner: (accountId) =>
      Promise.resolve(
        all().find(
          (claim) => claim.state === 'verified' && sameIdentity(claim.accountId, accountId),
        )?.userId,
      ),
    countHeld: (userId, platform, now) =>
      Promise.resolve(
        all().filter(
          (claim) =>
            claim.userId === userId &&
            samePlatform(claim.platform, platform) &&
            holdsAccount(claim, now),
        ).length,
      ),
    listLinked: (userId, platform) =>
      Promise.resolve(
        links
          .filter(
            (link) =>
              claims.get(link.claimId)?.userId === userId && samePlatform(link.platform, platform),
          )
          .sort((a, b) => a.linkedAt - b.linkedAt),
      ),
    listOpen: (userId, platform, now) =>
      Promise.resolve(
        all()
          .filter(
            (claim) =>
              claim.userId === userId &&
              samePlatform(claim.platform, platform) &&
              claim.state === 'awaiting_follow' &&
              !isExpired(claim, now),
          )
          .sort((a, b) => a.startedAt - b.startedAt),
      ),
    create: (claim, { maxHeld, now }) => {
      const held = all().filter(
        (other) =>
          other.userId === claim.userId &&
          samePlatform(other.platform, claim.platform) &&
          holdsAccount(other, now),
      ).length;
      if (held >= maxHeld) return Promise.resolve(err('limit_reached'));
      const open = all().filter((other) => openOn(other, claim.userId, claim.accountId));
      for (const stale of open.filter((other) => isExpired(other, now))) store(markExpired(stale));
      if (claim.state === 'awaiting_follow' && open.some((other) => !isExpired(other, now))) {
        return Promise.resolve(err('claim_open'));
      }
      claims.set(claim.id, claim);
      return Promise.resolve(ok(claim));
    },
    save: (claim) =>
      Promise.resolve(current(claim) ? ok(store(claim)) : err('version_conflict' as const)),
    verify: (claim, linkedAt) => {
      if (!current(claim)) return Promise.resolve(err('version_conflict'));
      const owned = all().some(
        (other) =>
          other.id !== claim.id &&
          other.state === 'verified' &&
          sameIdentity(other.accountId, claim.accountId),
      );
      if (owned) return Promise.resolve(err('account_already_claimed'));
      links.push({
        platform: claim.platform,
        handle: claim.handle,
        accountId: claim.accountId,
        linkedAt,
        claimId: claim.id,
      });
      return Promise.resolve(ok(store(claim)));
    },
  };
};
