import type { Result } from '@engagement-exchange/verification';
import type { AccountClaim } from '../domain/claim.ts';
import type { ClaimError } from '../domain/claim-error.ts';
import type { UseCaseDeps } from './deps.ts';
import { findOwnedClaim, type ClaimRef } from './owned-claim.ts';

export type GetAccountClaim = (ref: ClaimRef) => Promise<Result<AccountClaim, ClaimError>>;

export const getAccountClaimWith =
  (deps: UseCaseDeps): GetAccountClaim =>
  (ref) =>
    findOwnedClaim(deps.repository, ref);
