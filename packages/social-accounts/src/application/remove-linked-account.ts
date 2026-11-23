import { err, ok, type Result } from '@engagement-exchange/verification';
import { markCancelled, type AccountClaim } from '../domain/claim.ts';
import type { ClaimError } from '../domain/claim-error.ts';
import type { UseCaseDeps } from './deps.ts';
import { findOwnedClaim, type ClaimRef } from './owned-claim.ts';

export type RemoveLinkedAccount = (ref: ClaimRef) => Promise<Result<AccountClaim, ClaimError>>;

export const removeLinkedAccountWith =
  (deps: UseCaseDeps): RemoveLinkedAccount =>
  async (ref) => {
    const owned = await findOwnedClaim(deps.repository, ref);
    if (!owned.ok) return owned;
    const claim = owned.value;
    if (claim.state !== 'verified') {
      return err({ kind: 'claim_not_cancellable', state: claim.state });
    }
    const removed = await deps.repository.revoke(markCancelled(claim), deps.clock.now());
    return removed.ok ? ok(removed.value) : err({ kind: removed.error });
  };
