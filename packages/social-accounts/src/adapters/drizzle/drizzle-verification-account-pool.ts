import { platformAccounts, verificationAccounts, type Database } from '@engagement-exchange/db';
import {
  accountId,
  type AccountId,
  type Handle,
  type Platform,
} from '@engagement-exchange/verification';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type {
  VerificationAccountPool,
  VerificationCandidate,
} from '../../ports/verification-account-pool.ts';
import { accountWithHandle, handleOf, sameAccount } from './rows.ts';

export interface PooledAccount {
  readonly accountId: AccountId;
  readonly handle?: Handle;
  readonly active: boolean;
  readonly assignedCount: number;
}

export interface DrizzleVerificationAccountPool extends VerificationAccountPool {
  add(account: VerificationCandidate, seenAt: number): Promise<'added' | 'present' | 'inactive'>;
  list(platform: Platform): Promise<readonly PooledAccount[]>;
}

export const drizzleVerificationAccountPool = (db: Database): DrizzleVerificationAccountPool => ({
  candidates: async (platform) => {
    const rows = await db
      .select({ handle: platformAccounts.handle, externalId: platformAccounts.externalId })
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
              accountId: accountId(platform, row.externalId),
            },
          ],
    );
  },
  recordAssignment: async (account) => {
    await db
      .update(verificationAccounts)
      .set({ assignedCount: sql`${verificationAccounts.assignedCount} + 1` })
      .where(
        inArray(
          verificationAccounts.platformAccountId,
          db.select({ id: platformAccounts.id }).from(platformAccounts).where(sameAccount(account)),
        ),
      );
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
  list: async (platform) => {
    const rows = await db
      .select({
        handle: platformAccounts.handle,
        externalId: platformAccounts.externalId,
        active: verificationAccounts.active,
        assignedCount: verificationAccounts.assignedCount,
      })
      .from(verificationAccounts)
      .innerJoin(platformAccounts, eq(platformAccounts.id, verificationAccounts.platformAccountId))
      .where(eq(platformAccounts.platform, platform))
      .orderBy(asc(verificationAccounts.addedAt), asc(verificationAccounts.id));
    return rows.map((row) => ({
      accountId: accountId(platform, row.externalId),
      ...(row.handle !== null && { handle: handleOf(platform, row.handle) }),
      active: row.active,
      assignedCount: row.assignedCount,
    }));
  },
});
