import { platformAccounts } from '@engagement-exchange/db';
import type { Handle, Platform } from '@engagement-exchange/verification';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

export const handleOf = (platform: Platform, value: string): Handle =>
  ({ platform, value }) as Handle;

export const sameHandle = (handle: Handle) =>
  and(
    eq(platformAccounts.platform, handle.platform),
    sql`lower(${platformAccounts.handle}) = lower(${handle.value})`,
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
