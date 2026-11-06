import { platformAccounts, type Database } from '@engagement-exchange/db';
import { and, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { accountId, type AccountId } from '../../domain/account-id.ts';
import type { Handle } from '../../domain/handle.ts';
import type { CachedProfile, ProfileCache } from '../../ports/profile-cache.ts';

type PlatformAccountRow = typeof platformAccounts.$inferSelect;

const extrasSchema = z.object({ bio: z.string(), latestPostAt: z.number().exactOptional() });

const present = <V, T>(value: V | null, shape: (value: V) => T): T | undefined =>
  value === null ? undefined : shape(value);

const cachedProfileOf = (row: PlatformAccountRow): CachedProfile => {
  const handle =
    row.handle === null
      ? { handle: null, handleSeenAt: null }
      : {
          handle: { platform: row.platform, value: row.handle } as Handle,
          handleSeenAt: row.handleSeenAt?.getTime() ?? null,
        };
  if (row.profileFetchedAt === null || row.isPrivate === null) {
    return { ...handle, fetchedAt: null };
  }
  return {
    ...handle,
    fetchedAt: row.profileFetchedAt.getTime(),
    evidence: {
      accountId: accountId(row.platform, row.externalId, row.numericId ?? undefined),
      ...extrasSchema.parse(row.extras),
      isPrivate: row.isPrivate,
      ...present(row.followingVisible, (followingVisible) => ({ followingVisible })),
      ...present(row.likesVisible, (likesVisible) => ({ likesVisible })),
      ...present(row.followerCount, (followerCount) => ({ followerCount })),
      ...present(row.followingCount, (followingCount) => ({ followingCount })),
      ...present(row.videoCount, (videoCount) => ({ videoCount })),
      ...present(row.avatarUrl, (avatarUrl) => ({ avatarUrl })),
      ...present(row.accountCreatedAt, (createdAt) => ({ createdAt: createdAt.getTime() })),
    },
  };
};

const carries = (handle: Handle) =>
  and(
    eq(platformAccounts.platform, handle.platform),
    sql`lower(${platformAccounts.handle}) = lower(${handle.value})`,
  );

const sameAccount = (account: AccountId) =>
  and(
    eq(platformAccounts.platform, account.platform),
    eq(platformAccounts.externalId, account.value),
  );

export const drizzleProfileCache = (db: Database): ProfileCache => ({
  byId: async (account) => {
    const [row] = await db.select().from(platformAccounts).where(sameAccount(account));
    return row === undefined ? undefined : cachedProfileOf(row);
  },
  byHandle: async (handle) =>
    (await db.select().from(platformAccounts).where(carries(handle))).map(cachedProfileOf),
  store: ({ handle, evidence, source, fetchedAt }) =>
    db.transaction(async (tx) => {
      const {
        accountId: account,
        isPrivate,
        followingVisible,
        likesVisible,
        followerCount,
        followingCount,
        videoCount,
        avatarUrl,
        createdAt,
        ...extras
      } = evidence;
      const profile = {
        ...(account.numericId !== undefined && { numericId: account.numericId }),
        handle: handle.value,
        handleSeenAt: new Date(fetchedAt),
        isPrivate,
        followingVisible: followingVisible ?? null,
        likesVisible: likesVisible ?? null,
        followerCount: followerCount ?? null,
        followingCount: followingCount ?? null,
        videoCount: videoCount ?? null,
        avatarUrl: avatarUrl ?? null,
        accountCreatedAt: createdAt === undefined ? null : new Date(createdAt),
        profileFetchedAt: new Date(fetchedAt),
        profileSource: source,
        extras,
      };
      await tx
        .update(platformAccounts)
        .set({ handle: null, handleSeenAt: null })
        .where(and(carries(handle), ne(platformAccounts.externalId, account.value)));
      await tx
        .insert(platformAccounts)
        .values({ platform: account.platform, externalId: account.value, ...profile })
        .onConflictDoUpdate({
          target: [platformAccounts.platform, platformAccounts.externalId],
          set: profile,
        });
    }),
});
