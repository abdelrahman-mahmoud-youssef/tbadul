import { z } from 'zod';
import { claim } from './claims.ts';
import { isoTime, platform, userRole } from './vocabulary.ts';

export const meResponse = z.object({
  user: z.object({ id: z.uuid(), email: z.email(), name: z.string(), role: userRole }),
});
export type MeResponse = z.infer<typeof meResponse>;

export const linkedAccount = z.object({ handle: z.string(), linkedAt: isoTime, claimId: z.uuid() });
export type LinkedAccount = z.infer<typeof linkedAccount>;

export const platformAccounts = z.object({
  platform,
  limit: z.number().int().positive(),
  used: z.number().int().nonnegative(),
  accounts: z.array(linkedAccount),
  openClaims: z.array(claim),
});
export type PlatformAccounts = z.infer<typeof platformAccounts>;

export const linkedAccountsResponse = z.object({ platforms: z.array(platformAccounts) });
export type LinkedAccountsResponse = z.infer<typeof linkedAccountsResponse>;
