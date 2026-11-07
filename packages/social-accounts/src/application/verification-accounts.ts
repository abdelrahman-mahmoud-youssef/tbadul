import {
  accountId,
  err,
  ok,
  parseHandle,
  type Clock,
  type Platform,
  type Result,
  type Verifier,
} from '@engagement-exchange/verification';
import type {
  AddVerificationAccountError,
  VerificationAccountNotFound,
} from '../domain/verification-account-error.ts';
import type {
  PoolAddition,
  PooledAccount,
  VerificationAccountAdmin,
} from '../ports/verification-account-admin.ts';
import type { VerificationCandidate } from '../ports/verification-account-pool.ts';

export interface VerificationAccountDeps {
  readonly verifier: Verifier;
  readonly accounts: VerificationAccountAdmin;
  readonly clock: Clock;
}

export interface AddedVerificationAccount {
  readonly account: VerificationCandidate;
  readonly status: PoolAddition;
}

export type AddVerificationAccount = (input: {
  readonly platform: Platform;
  readonly account: string;
}) => Promise<Result<AddedVerificationAccount, AddVerificationAccountError>>;

export type ListVerificationAccounts = (input: {
  readonly platform: Platform;
}) => Promise<readonly PooledAccount[]>;

export type SetVerificationAccountActive = (input: {
  readonly platform: Platform;
  readonly accountId: string;
  readonly active: boolean;
}) => Promise<Result<PooledAccount, VerificationAccountNotFound>>;

export const addVerificationAccountWith =
  (deps: VerificationAccountDeps): AddVerificationAccount =>
  async ({ platform, account }) => {
    const handle = parseHandle(platform, account);
    if (!handle.ok) return err({ kind: 'invalid_handle', reason: handle.error.reason });
    const profile = await deps.verifier.verify({ kind: 'profile', subject: handle.value });
    if (profile.outcome !== 'verified') {
      const sourceError = profile.attempts.at(-1)?.error?.kind;
      return err({
        kind: 'profile_unavailable',
        outcome: profile.outcome,
        ...(profile.outcome === 'source_error' && sourceError !== undefined && { sourceError }),
      });
    }
    const candidate = { handle: handle.value, accountId: profile.evidence.accountId };
    return ok({ account: candidate, status: await deps.accounts.add(candidate, deps.clock.now()) });
  };

export const listVerificationAccountsWith =
  (deps: VerificationAccountDeps): ListVerificationAccounts =>
  ({ platform }) =>
    deps.accounts.list(platform);

export const setVerificationAccountActiveWith =
  (deps: VerificationAccountDeps): SetVerificationAccountActive =>
  async ({ platform, accountId: value, active }) => {
    const pooled = await deps.accounts.setActive(accountId(platform, value), active);
    return pooled === undefined ? err({ kind: 'verification_account_not_found' }) : ok(pooled);
  };
