import { err, ok, type Result } from '@engagement-exchange/verification';
import { markCancelled, type AccountClaim } from '../domain/claim.ts';
import type { ClaimError } from '../domain/claim-error.ts';
import type { UseCaseDeps } from './deps.ts';
import { findOwnedClaim, type ClaimRef } from './owned-claim.ts';

export type CancelAccountClaim = (ref: ClaimRef) => Promise<Result<AccountClaim, ClaimError>>;

export const cancelAccountClaimWith =
  (deps: UseCaseDeps): CancelAccountClaim =>
  async (ref) => {
    const owned = await findOwnedClaim(deps.repository, ref);
    if (!owned.ok) return owned;
    const claim = owned.value;
    if (claim.state !== 'awaiting_follow') {
      return err({ kind: 'claim_not_cancellable', state: claim.state });
    }
    const cancelled = await deps.repository.save(markCancelled(claim));
    return cancelled.ok ? ok(cancelled.value) : err({ kind: cancelled.error });
  };
