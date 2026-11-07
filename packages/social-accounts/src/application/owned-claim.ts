import { err, ok, type Result } from '@engagement-exchange/verification';
import type { AccountClaim } from '../domain/claim.ts';
import type { ClaimError } from '../domain/claim-error.ts';
import type { ClaimId, UserId } from '../domain/ids.ts';
import type { AccountClaimRepository } from '../ports/account-claim-repository.ts';

export interface ClaimRef {
  readonly userId: UserId;
  readonly claimId: ClaimId;
}

export const findOwnedClaim = async (
  repository: AccountClaimRepository,
  { userId, claimId }: ClaimRef,
): Promise<Result<AccountClaim, ClaimError>> => {
  const claim = await repository.findById(claimId);
  return claim?.userId === userId ? ok(claim) : err({ kind: 'claim_not_found' });
};
