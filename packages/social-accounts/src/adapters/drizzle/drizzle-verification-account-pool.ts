import { platformAccounts, verificationAccounts, type Database } from '@engagement-exchange/db';
import type { AccountId, Platform } from '@engagement-exchange/verification';
import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type {
  PooledAccount,
  VerificationAccountAdmin,
} from '../../ports/verification-account-admin.ts';
import type { VerificationAccountPool } from '../../ports/verification-account-pool.ts';
import { accountOf, accountWithHandle, handleOf, sameAccount } from './rows.ts';

const pooledAccounts = async (
  db: Database,
  platform: Platform,
  where: SQL | undefined,
): Promise<PooledAccount[]> => {
  const rows = await db
    .select({
      handle: platformAccounts.handle,
      externalId: platformAccounts.externalId,
      numericId: platformAccounts.numericId,
      active: verificationAccounts.active,
      assignedCount: verificationAccounts.assignedCount,
    })
    .from(verificationAccounts)
    .innerJoin(platformAccounts, eq(platformAccounts.id, verificationAccounts.platformAccountId))
    .where(and(eq(platformAccounts.platform, platform), where))
    .orderBy(asc(verificationAccounts.addedAt), asc(verificationAccounts.id));
  return rows.map((row) => ({
    accountId: accountOf(platform, row),
    ...(row.handle !== null && { handle: handleOf(platform, row.handle) }),
    active: row.active,
    assignedCount: row.assignedCount,
  }));
};

const pooledEntry = (db: Database, account: AccountId) =>
  inArray(
    verificationAccounts.platformAccountId,
    db.select({ id: platformAccounts.id }).from(platformAccounts).where(sameAccount(account)),
  );

export const drizzleVerificationAccountPool = (
  db: Database,
): VerificationAccountPool & VerificationAccountAdmin => ({
  candidates: async (platform) => {
    const rows = await db
      .select({
        handle: platformAccounts.handle,
        externalId: platformAccounts.externalId,
        numericId: platformAccounts.numericId,
      })
      .from(verificationAccounts)
      .innerJoin(platformAccounts, eq(platformAccounts.id, verificationAccounts.platformAccountId))
      .where(and(eq(verificationAccounts.active, true), eq(platformAccounts.platform, platform)))
      .orderBy(asc(verificationAccounts.assignedCount), sql`random()`);
    return rows.flatMap((row) =>
      row.handle === null
        ? []
        : [
            {
              handle: handleOf(platform, row.handle),
              accountId: accountOf(platform, row),
            },
          ],
    );
  },
  recordAssignment: async (account) => {
    await db
      .update(verificationAccounts)
      .set({ assignedCount: sql`${verificationAccounts.assignedCount} + 1` })
      .where(pooledEntry(db, account));
  },
  add: (account, seenAt) =>
    db.transaction(async (tx) => {
      const platformAccountId = await accountWithHandle(
        tx,
        account.accountId,
        account.handle,
        seenAt,
      );
      const inserted = await tx
        .insert(verificationAccounts)
        .values({ platformAccountId })
        .onConflictDoNothing({ target: verificationAccounts.platformAccountId })
        .returning({ id: verificationAccounts.id });
      if (inserted.length > 0) return 'added';
      const [pooled] = await tx
        .select({ active: verificationAccounts.active })
        .from(verificationAccounts)
        .where(eq(verificationAccounts.platformAccountId, platformAccountId));
      return pooled?.active === true ? 'present' : 'inactive';
    }),
  list: (platform) => pooledAccounts(db, platform, undefined),
  setActive: async (account, active) => {
    await db.update(verificationAccounts).set({ active }).where(pooledEntry(db, account));
    const [pooled] = await pooledAccounts(db, account.platform, pooledEntry(db, account));
    return pooled;
  },
});
