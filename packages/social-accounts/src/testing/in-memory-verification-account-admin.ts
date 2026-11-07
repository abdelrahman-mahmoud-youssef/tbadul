import { identityKey, samePlatform } from '@engagement-exchange/verification';
import type {
  PooledAccount,
  VerificationAccountAdmin,
} from '../ports/verification-account-admin.ts';

export interface RecordingAdmin extends VerificationAccountAdmin {
  readonly seenAt: readonly number[];
}

export const inMemoryVerificationAccountAdmin = (): RecordingAdmin => {
  const pooled = new Map<string, PooledAccount>();
  const seenAt: number[] = [];
  return {
    seenAt,
    add: ({ handle, accountId }, at) => {
      seenAt.push(at);
      const key = identityKey(accountId);
      const known = pooled.get(key);
      pooled.set(key, { active: true, assignedCount: 0, ...known, accountId, handle });
      if (known === undefined) return Promise.resolve('added');
      return Promise.resolve(known.active ? 'present' : 'inactive');
    },
    list: (platform) =>
      Promise.resolve(
        [...pooled.values()].filter((entry) => samePlatform(entry.accountId.platform, platform)),
      ),
    setActive: (accountId, active) => {
      const key = identityKey(accountId);
      const known = pooled.get(key);
      if (known === undefined) return Promise.resolve(undefined);
      const updated = { ...known, active };
      pooled.set(key, updated);
      return Promise.resolve(updated);
    },
  };
};
