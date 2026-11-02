import type { Handle, Platform } from '@engagement-exchange/verification';
import type { AccountClaim } from '../domain/claim.ts';
import type { ClaimId, UserId } from '../domain/ids.ts';

export interface AccountClaimRepository {
  findById(id: ClaimId): Promise<AccountClaim | undefined>;
  save(claim: AccountClaim): Promise<void>;
  countHeldBy(userId: UserId, platform: Platform): Promise<number>;
  findHolder(handle: Handle): Promise<AccountClaim | undefined>;
}
