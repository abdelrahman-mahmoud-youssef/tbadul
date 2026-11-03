import { identityKey, sameIdentity } from '../domain/platform-scoped.ts';
import type { Handle } from '../domain/handle.ts';
import type { CachedProfile, ProfileCache, ProfileEntry } from '../ports/profile-cache.ts';

const rowOf = (entry: ProfileEntry): CachedProfile => ({
  handle: entry.handle,
  handleSeenAt: entry.fetchedAt,
  evidence: entry.evidence,
  fetchedAt: entry.fetchedAt,
});

const carries = (row: CachedProfile, handle: Handle): boolean =>
  row.handle !== null &&
  sameIdentity(
    { platform: row.handle.platform, value: row.handle.value.toLowerCase() },
    { platform: handle.platform, value: handle.value.toLowerCase() },
  );

export const inMemoryProfileCache = (seed: readonly ProfileEntry[] = []): ProfileCache => {
  const rows = new Map(seed.map((entry) => [identityKey(entry.evidence.accountId), rowOf(entry)]));
  return {
    byId: (accountId) => Promise.resolve(rows.get(identityKey(accountId))),
    byHandle: (handle) => Promise.resolve([...rows.values()].filter((row) => carries(row, handle))),
    store: (entry) => {
      const key = identityKey(entry.evidence.accountId);
      for (const [other, row] of rows) {
        if (other !== key && carries(row, entry.handle)) {
          rows.set(other, { ...row, handle: null, handleSeenAt: null });
        }
      }
      rows.set(key, rowOf(entry));
      return Promise.resolve();
    },
  };
};
