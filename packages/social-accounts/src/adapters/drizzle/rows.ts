import { platformAccounts, type Database } from '@engagement-exchange/db';
import type { AccountId, Handle, Platform } from '@engagement-exchange/verification';
import { and, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';

export const handleOf = (platform: Platform, value: string): Handle =>
  ({ platform, value }) as Handle;

export const sameAccount = (account: AccountId) =>
  and(
    eq(platformAccounts.platform, account.platform),
    eq(platformAccounts.externalId, account.value),
  );

export const single = <T>(rows: readonly T[]): T => {
  const [row] = rows;
  if (row === undefined || rows.length !== 1) {
    throw new Error(`expected one row, got ${rows.length}`);
  }
  return row;
};

export const violates = (error: unknown, constraint: string): boolean =>
  z
    .object({ cause: z.object({ code: z.literal('23505'), constraint: z.literal(constraint) }) })
    .safeParse(error).success;

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type Executor = Database | Transaction;

export const accountWithHandle = async (
  db: Transaction,
  account: AccountId,
  handle: Handle,
  seenAt: number,
): Promise<string> => {
  const seen = { handle: handle.value, handleSeenAt: new Date(seenAt) };
  await db
    .update(platformAccounts)
    .set({ handle: null, handleSeenAt: null })
    .where(
      and(
        eq(platformAccounts.platform, handle.platform),
        sql`lower(${platformAccounts.handle}) = lower(${handle.value})`,
        ne(platformAccounts.externalId, account.value),
      ),
    );
  const rows = await db
    .insert(platformAccounts)
    .values({ platform: account.platform, externalId: account.value, ...seen })
    .onConflictDoUpdate({
      target: [platformAccounts.platform, platformAccounts.externalId],
      set: seen,
    })
    .returning({ id: platformAccounts.id });
  return single(rows).id;
};

export const platformAccountOf = async (
  db: Executor,
  account: AccountId,
  handle: Handle | undefined,
  seenAt: number,
): Promise<string> => {
  await db
    .insert(platformAccounts)
    .values({
      platform: account.platform,
      externalId: account.value,
      ...(handle !== undefined && { handle: handle.value, handleSeenAt: new Date(seenAt) }),
    })
    .onConflictDoNothing({ target: [platformAccounts.platform, platformAccounts.externalId] });
  const rows = await db
    .select({ id: platformAccounts.id })
    .from(platformAccounts)
    .where(sameAccount(account));
  return single(rows).id;
};
