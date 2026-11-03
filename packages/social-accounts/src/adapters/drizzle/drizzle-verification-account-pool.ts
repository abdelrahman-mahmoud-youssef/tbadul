import { platformAccounts, verificationAccounts, type Database } from '@engagement-exchange/db';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { VerificationAccountPool } from '../../ports/verification-account-pool.ts';
import { handleOf, sameHandle } from './rows.ts';

export const drizzleVerificationAccountPool = (db: Database): VerificationAccountPool => ({
  candidates: async (platform) => {
    const rows = await db
      .select({ handle: platformAccounts.handle })
      .from(verificationAccounts)
      .innerJoin(platformAccounts, eq(platformAccounts.id, verificationAccounts.platformAccountId))
      .where(and(eq(verificationAccounts.active, true), eq(platformAccounts.platform, platform)))
      .orderBy(asc(verificationAccounts.assignedCount), sql`random()`);
    return rows.map((row) => handleOf(platform, row.handle));
  },
  recordAssignment: async (account) => {
    await db
      .update(verificationAccounts)
      .set({ assignedCount: sql`${verificationAccounts.assignedCount} + 1` })
      .where(
        inArray(
          verificationAccounts.platformAccountId,
          db.select({ id: platformAccounts.id }).from(platformAccounts).where(sameHandle(account)),
        ),
      );
  },
});
