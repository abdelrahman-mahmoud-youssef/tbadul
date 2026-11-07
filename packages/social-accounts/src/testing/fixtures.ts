import { accountId } from '@engagement-exchange/verification';
import { handle, manualClock, type ManualClock } from '@engagement-exchange/verification/testing';
import { configVerificationAccountPool } from '../adapters/config-verification-account-pool.ts';
import { inMemoryClaimRepository } from '../adapters/in-memory-claim-repository.ts';
import type { ClaimPolicy, UseCaseDeps } from '../application/deps.ts';
import { markVerified, type AccountClaim } from '../domain/claim.ts';
import { userId } from '../domain/ids.ts';
import type { AccountClaimRepository } from '../ports/account-claim-repository.ts';
import { fakeVerifier, type FakeVerifier, type FakeVerifierScript } from './fake-verifier.ts';

export const policy: ClaimPolicy = {
  eligibility: {
    minFollowers: 10,
    minPosts: 1,
    activeWithinDays: 90,
    inconclusiveBlocks: false,
  },
  cooldown: { stepsMs: [30_000, 60_000, 120_000, 300_000], afterwardsMs: 600_000 },
  claimTtlMs: 86_400_000,
  eligibilityMaxAgeMs: 3_600_000,
  maxAccountsPerPlatform: 5,
};

export const alice = userId('alice');
export const bob = userId('bob');
export const creator = handle('some.creator');
export const poolAccounts = [
  { handle: handle('verify.one'), accountId: accountId('tiktok', 'verify-one-id') },
  { handle: handle('verify.two'), accountId: accountId('tiktok', 'verify-two-id') },
] as const;

export interface Harness {
  readonly deps: UseCaseDeps;
  readonly verifier: FakeVerifier;
  readonly clock: ManualClock;
  readonly repository: AccountClaimRepository;
}

export const harness = (
  script: FakeVerifierScript = {},
  overrides: Partial<ClaimPolicy> = {},
): Harness => {
  const verifier = fakeVerifier(script);
  const clock = manualClock(Date.UTC(2026, 10, 2));
  const repository = inMemoryClaimRepository();
  let counter = 0;
  return {
    verifier,
    clock,
    repository,
    deps: {
      verifier,
      repository,
      pool: configVerificationAccountPool(poolAccounts, () => 0),
      clock,
      ids: { next: () => `claim-${String(++counter)}` },
      policy: { ...policy, ...overrides },
    },
  };
};

const value = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!result.ok) throw new Error(`fixture refused: ${JSON.stringify(result.error)}`);
  return result.value;
};

export const seed = async (
  repository: AccountClaimRepository,
  claim: AccountClaim,
): Promise<AccountClaim> =>
  value(await repository.create(claim, { maxHeld: Number.MAX_SAFE_INTEGER, now: claim.startedAt }));

export const own = async (
  repository: AccountClaimRepository,
  claim: AccountClaim,
): Promise<AccountClaim> =>
  value(await repository.verify(markVerified(await seed(repository, claim)), claim.startedAt));
