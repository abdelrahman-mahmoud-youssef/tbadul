import { err, ok, type Result } from '@engagement-exchange/verification';
import {
  isExpired,
  markExpired,
  markRejected,
  markVerified,
  recordFailedAttempt,
  verifyWaitMs,
  type AccountClaim,
  type VerifyAttempt,
} from '../domain/claim.ts';
import type { ClaimError } from '../domain/claim-error.ts';
import type { UseCaseDeps } from './deps.ts';
import { findOwnedClaim, type ClaimRef } from './owned-claim.ts';

export type VerifyOutcome = 'verified' | 'not_following' | 'private' | 'not_found' | 'source_error';

export interface VerifyResult {
  readonly claim: AccountClaim;
  readonly outcome: VerifyOutcome;
}

export type VerifyAccountClaim = (ref: ClaimRef) => Promise<Result<VerifyResult, ClaimError>>;

export const verifyAccountClaimWith =
  (deps: UseCaseDeps): VerifyAccountClaim =>
  async (ref) => {
    const owned = await findOwnedClaim(deps.repository, ref);
    if (!owned.ok) return owned;
    const claim = owned.value;
    const { verificationAccount, verificationAccountId } = claim;
    if (
      claim.state !== 'awaiting_follow' ||
      verificationAccount === undefined ||
      verificationAccountId === undefined
    ) {
      return err({ kind: 'claim_not_verifiable', state: claim.state });
    }
    const now = deps.clock.now();
    if (isExpired(claim, now)) {
      const expired = await deps.repository.save(markExpired(claim));
      return err({ kind: expired.ok ? 'claim_expired' : expired.error });
    }
    const waitMs = verifyWaitMs(claim, now);
    if (waitMs > 0) return err({ kind: 'cooldown_active', retryAt: claim.nextVerifyAt, waitMs });

    const verdict = await deps.verifier.verify({
      kind: 'follows',
      performer: claim.handle,
      performerId: claim.accountId,
      target: verificationAccount,
      targetId: verificationAccountId,
    });
    switch (verdict.outcome) {
      case 'verified': {
        const verified = await deps.repository.verify(markVerified(claim));
        if (verified.ok) return ok({ claim: verified.value, outcome: 'verified' });
        if (verified.error === 'version_conflict') return err({ kind: 'version_conflict' });
        const refused = await deps.repository.save(markRejected(claim, 'account_already_claimed'));
        return err({ kind: refused.ok ? 'account_already_claimed' : refused.error });
      }
      case 'not_following':
      case 'private':
      case 'not_found': {
        const measured = verdict.attempts.at(-1);
        const attempt: VerifyAttempt = {
          at: now,
          outcome: verdict.outcome,
          ...(measured !== undefined && {
            source: measured.source,
            latencyMs: measured.latencyMs,
          }),
        };
        const saved = await deps.repository.save(
          recordFailedAttempt(claim, attempt, deps.policy.cooldown),
        );
        return saved.ok
          ? ok({ claim: saved.value, outcome: verdict.outcome })
          : err({ kind: saved.error });
      }
      case 'source_error':
        return ok({ claim, outcome: 'source_error' });
    }
  };
