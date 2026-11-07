import { z } from 'zod';
import { accountInput } from './claims.ts';
import { isoTime, platform, poolAddition } from './vocabulary.ts';

export const pooledAccount = z.object({
  accountId: z.string(),
  handle: z.string().optional(),
  active: z.boolean(),
  assignedCount: z.number().int().nonnegative(),
});
export type PooledAccount = z.infer<typeof pooledAccount>;

export const poolResponse = z.object({
  pools: z.array(z.object({ platform, accounts: z.array(pooledAccount) })),
});
export type PoolResponse = z.infer<typeof poolResponse>;

export const addPoolAccountRequest = z.object({ platform, account: accountInput });
export type AddPoolAccountRequest = z.infer<typeof addPoolAccountRequest>;

export const addPoolAccountResponse = z.object({
  account: z.object({ accountId: z.string(), handle: z.string() }),
  status: poolAddition,
});
export type AddPoolAccountResponse = z.infer<typeof addPoolAccountResponse>;

export const poolAccountIdParam = z.string().min(1).max(512);

export const setPoolAccountActiveRequest = z.object({ platform, active: z.boolean() });
export type SetPoolAccountActiveRequest = z.infer<typeof setPoolAccountActiveRequest>;

export const poolAccountResponse = z.object({ account: pooledAccount });
export type PoolAccountResponse = z.infer<typeof poolAccountResponse>;

export const fallbacksResponse = z.object({
  counts: z.array(
    z.object({ source: z.string(), hour: isoTime, count: z.number().int().positive() }),
  ),
});
export type FallbacksResponse = z.infer<typeof fallbacksResponse>;
