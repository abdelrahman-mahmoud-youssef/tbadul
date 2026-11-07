import { verificationChecks, type Database } from '@engagement-exchange/db';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { SpendLedger } from '../../ports/spend-ledger.ts';

export const drizzleSpendLedger = (db: Database): SpendLedger => ({
  spentSince: async (source, unit, since) => {
    const [row] = await db
      .select({ spent: sql<string>`coalesce(sum(${verificationChecks.costAmount}), 0)` })
      .from(verificationChecks)
      .where(
        and(
          eq(verificationChecks.source, source),
          eq(verificationChecks.costUnit, unit),
          gte(verificationChecks.at, new Date(since)),
        ),
      );
    return Number(row?.spent ?? 0);
  },
});
