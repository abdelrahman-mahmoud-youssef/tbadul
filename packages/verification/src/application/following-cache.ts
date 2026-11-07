import { matchAccount, type AccountId, type ListedAccount } from '../domain/account-id.ts';
import { identityKey } from '../domain/platform-scoped.ts';
import type { Clock } from '../ports/clock.ts';

interface CachedList {
  readonly listed: readonly ListedAccount[];
  readonly readAt: number;
}

export interface FollowingCache {
  follows(performer: AccountId, target: AccountId): readonly ListedAccount[] | undefined;
  store(performer: AccountId, listed: readonly ListedAccount[]): void;
}

export const followingCache = (ttlMs: number, clock: Clock): FollowingCache => {
  const lists = new Map<string, CachedList>();
  return {
    follows: (performer, target) => {
      const cached = lists.get(identityKey(performer));
      if (cached === undefined || clock.now() - cached.readAt > ttlMs) return undefined;
      return cached.listed.some((entry) => matchAccount(target, entry) === 'same')
        ? cached.listed
        : undefined;
    },
    store: (performer, listed) => {
      const now = clock.now();
      for (const [key, cached] of lists) if (now - cached.readAt > ttlMs) lists.delete(key);
      lists.set(identityKey(performer), { listed, readAt: now });
    },
  };
};
