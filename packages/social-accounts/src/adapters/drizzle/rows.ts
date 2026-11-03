import { platformAccounts, type Database } from '@engagement-exchange/db';
import type { AccountId, Handle, Platform } from '@engagement-exchange/verification';
import { and, eq } from 'drizzle-orm';
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
