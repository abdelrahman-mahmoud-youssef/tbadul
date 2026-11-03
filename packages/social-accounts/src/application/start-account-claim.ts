import {
  err,
  ok,
  parseHandle,
  type Platform,
  type Result,
} from '@engagement-exchange/verification';
import {
  awaitingFollow,
  eligibilityFailed,
  rejected,
  type AccountClaim,
  type ClaimDraft,
} from '../domain/claim.ts';
import type { ClaimError } from '../domain/claim-error.ts';
import { evaluateEligibility } from '../domain/eligibility.ts';
import { claimId, type UserId } from '../domain/ids.ts';
import type { UseCaseDeps } from './deps.ts';
import type { VerificationCandidate } from '../ports/verification-account-pool.ts';
import { factsFrom } from './profile-facts.ts';

export interface StartClaimInput {
  readonly userId: UserId;
  readonly platform: Platform;
  readonly account: string;
}

export type StartAccountClaim = (
  input: StartClaimInput,
) => Promise<Result<AccountClaim, ClaimError>>;

type Baseline =
  | { readonly kind: 'assigned'; readonly account: VerificationCandidate }
  | { readonly kind: 'exhausted' }
  | { readonly kind: 'unavailable' };

const pickVerificationAccount = async (
  deps: UseCaseDeps,
  draft: ClaimDraft,
  candidates: readonly VerificationCandidate[],
): Promise<Baseline> => {
  for (const candidate of candidates) {
    const verdict = await deps.verifier.verify({
      kind: 'follows',
      performer: draft.handle,
      performerId: draft.accountId,
      target: candidate.handle,
    });

    if (verdict.outcome === 'not_following') return { kind: 'assigned', account: candidate };

    if (verdict.outcome !== 'verified') return { kind: 'unavailable' };
  }
  return { kind: 'exhausted' };
};

export const startAccountClaimWith =
  (deps: UseCaseDeps): StartAccountClaim =>
  async ({ userId, platform, account }) => {
    const handle = parseHandle(platform, account);

    if (!handle.ok) return err({ kind: 'invalid_handle', reason: handle.error.reason });

    const profile = await deps.verifier.verify(
      { kind: 'profile', subject: handle.value },
      { maxAgeMs: deps.policy.eligibilityMaxAgeMs },
    );
    switch (profile.outcome) {
      case 'source_error':
      case 'not_following':
        return err({ kind: 'source_unavailable' });
      case 'private':
      case 'not_found':
        return err({ kind: 'account_unavailable', outcome: profile.outcome });
      case 'verified': {
        const { accountId } = profile.evidence;
        const owner = await deps.repository.findOwner(accountId);

        if (owner !== undefined) {
          return err({
            kind: owner === userId ? 'account_already_linked' : 'account_already_claimed',
          });
        }

        const now = deps.clock.now();
        const open = await deps.repository.findOpen(userId, accountId, now);

        if (open !== undefined) return ok(open);

        const limit = deps.policy.maxAccountsPerPlatform;

        if ((await deps.repository.countHeld(userId, platform, now)) >= limit) {
          return err({ kind: 'claim_limit_reached', limit });
        }

        const draft: ClaimDraft = {
          id: claimId(deps.ids.next()),
          userId,
          handle: handle.value,
          accountId,
          eligibility: evaluateEligibility(
            factsFrom(profile.evidence),
            now,
            deps.policy.eligibility,
          ),
          startedAt: now,
          ttlMs: deps.policy.claimTtlMs,
        };
        const claim = draft.eligibility.eligible
          ? await settleBaseline(deps, draft, platform)
          : ok(eligibilityFailed(draft));

        if (!claim.ok) return claim;

        return create(deps, claim.value, now, limit);
      }
    }
  };

const create = async (
  deps: UseCaseDeps,
  claim: AccountClaim,
  now: number,
  limit: number,
): Promise<Result<AccountClaim, ClaimError>> => {
  const created = await deps.repository.create(claim, { maxHeld: limit, now });

  if (created.ok) {
    if (claim.verificationAccountId !== undefined) {
      await deps.pool.recordAssignment(claim.verificationAccountId);
    }
    return created;
  }

  if (created.error === 'limit_reached') return err({ kind: 'claim_limit_reached', limit });

  const open = await deps.repository.findOpen(claim.userId, claim.accountId, now);
  return open === undefined ? err({ kind: 'version_conflict' }) : ok(open);
};

const settleBaseline = async (
  deps: UseCaseDeps,
  draft: ClaimDraft,
  platform: Platform,
): Promise<Result<AccountClaim, ClaimError>> => {
  const baseline = await pickVerificationAccount(deps, draft, await deps.pool.candidates(platform));
  switch (baseline.kind) {
    case 'assigned':
      return ok(awaitingFollow(draft, baseline.account.handle, baseline.account.accountId));
    case 'exhausted':
      return ok(rejected(draft, 'pool_exhausted'));
    case 'unavailable':
      return err({ kind: 'source_unavailable' });
  }
};
