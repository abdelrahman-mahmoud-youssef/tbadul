import { err, ok, type Result } from '@engagement-exchange/verification';
import {
  holdsAccount,
  isExpired,
  markExpired,
  markRejected,
  markVerified,
  recordFailedAttempt,
  verifyWaitMs,
  type AccountClaim,
} from '../domain/claim.ts';
import type { ClaimError } from '../domain/claim-error.ts';
import type { ClaimId } from '../domain/ids.ts';
import type { UseCaseDeps } from './deps.ts';

export type VerifyOutcome = 'verified' | 'not_following' | 'private' | 'not_found' | 'source_error';

export interface VerifyResult {
  readonly claim: AccountClaim;
  readonly outcome: VerifyOutcome;
}

export type VerifyAccountClaim = (id: ClaimId) => Promise<Result<VerifyResult, ClaimError>>;

export const verifyAccountClaimWith =
  (deps: UseCaseDeps): VerifyAccountClaim =>
  async (id) => {
    const claim = await deps.repository.findById(id);
    if (claim === undefined) return err({ kind: 'claim_not_found' });
    if (claim.state !== 'awaiting_follow' || claim.verificationAccount === undefined) {
      return err({ kind: 'claim_not_verifiable', state: claim.state });
    }
    const now = deps.clock.now();
    if (isExpired(claim, now)) {
      await deps.repository.save(markExpired(claim));
      return err({ kind: 'claim_expired' });
    }
    const waitMs = verifyWaitMs(claim, now);
    if (waitMs > 0) return err({ kind: 'cooldown_active', retryAt: claim.nextVerifyAt, waitMs });

    const verdict = await deps.verifier.verify({
      kind: 'follows',
      performer: claim.handle,
      performerId: claim.accountId,
      target: claim.verificationAccount,
    });
    switch (verdict.outcome) {
      case 'verified': {
        const holder = await deps.repository.findHolder(claim.handle);
        const taken =
          holder !== undefined &&
          holder.id !== claim.id &&
          holder.userId !== claim.userId &&
          holdsAccount(holder) &&
          holder.state === 'verified';
        const settled = taken
          ? markRejected(claim, 'account_already_claimed')
          : markVerified(claim);
        await deps.repository.save(settled);
        return taken
          ? err({ kind: 'account_already_claimed' })
          : ok({ claim: settled, outcome: 'verified' });
      }
      case 'not_following':
      case 'private':
      case 'not_found': {
        const settled = recordFailedAttempt(claim, verdict.outcome, now, deps.policy.cooldown);
        await deps.repository.save(settled);
        return ok({ claim: settled, outcome: verdict.outcome });
      }
      case 'source_error':
        return ok({ claim, outcome: 'source_error' });
    }
  };
