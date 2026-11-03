import type { AccountId, Platform, Result } from '@engagement-exchange/verification';
import type { AccountClaim } from '../domain/claim.ts';
import type { ClaimId, UserId } from '../domain/ids.ts';

export interface ClaimLimit {
  readonly maxHeld: number;
  readonly now: number;
}

export type CreateClaimError = 'limit_reached' | 'claim_open';

export type SaveClaimError = 'version_conflict';

export type VerifyClaimError = 'version_conflict' | 'account_already_claimed';

export interface AccountClaimRepository {
  findById(id: ClaimId): Promise<AccountClaim | undefined>;
  findOpen(userId: UserId, accountId: AccountId, now: number): Promise<AccountClaim | undefined>;
  findOwner(accountId: AccountId): Promise<UserId | undefined>;
  countHeld(userId: UserId, platform: Platform, now: number): Promise<number>;
  create(claim: AccountClaim, limit: ClaimLimit): Promise<Result<AccountClaim, CreateClaimError>>;
  save(claim: AccountClaim): Promise<Result<AccountClaim, SaveClaimError>>;
  verify(claim: AccountClaim): Promise<Result<AccountClaim, VerifyClaimError>>;
}
