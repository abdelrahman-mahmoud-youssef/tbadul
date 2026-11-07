import type { AccountId, Handle, Platform } from '@engagement-exchange/verification';
import type { ClaimId } from './ids.ts';

export interface LinkedAccount {
  readonly platform: Platform;
  readonly handle: Handle;
  readonly accountId: AccountId;
  readonly linkedAt: number;
  readonly claimId: ClaimId;
}
