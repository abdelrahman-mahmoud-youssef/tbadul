import type { AccountId, Handle, Platform } from '@engagement-exchange/verification';
import type { VerificationCandidate } from './verification-account-pool.ts';

export interface PooledAccount {
  readonly accountId: AccountId;
  readonly handle?: Handle;
  readonly active: boolean;
  readonly assignedCount: number;
}

export type PoolAddition = 'added' | 'present' | 'inactive';

export interface VerificationAccountAdmin {
  add(account: VerificationCandidate, seenAt: number): Promise<PoolAddition>;
  list(platform: Platform): Promise<readonly PooledAccount[]>;
  setActive(account: AccountId, active: boolean): Promise<PooledAccount | undefined>;
}
