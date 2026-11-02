import type { Clock, Verifier } from '@engagement-exchange/verification';
import type { CooldownSchedule } from '../domain/cooldown.ts';
import type { EligibilityConfig } from '../domain/eligibility.ts';
import type { AccountClaimRepository } from '../ports/account-claim-repository.ts';
import type { IdGenerator } from '../ports/id-generator.ts';
import type { VerificationAccountPool } from '../ports/verification-account-pool.ts';

export interface ClaimPolicy {
  readonly eligibility: EligibilityConfig;
  readonly cooldown: CooldownSchedule;
  readonly claimTtlMs: number;
  readonly maxAccountsPerPlatform: number;
}

export interface UseCaseDeps {
  readonly verifier: Verifier;
  readonly repository: AccountClaimRepository;
  readonly pool: VerificationAccountPool;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly policy: ClaimPolicy;
}
