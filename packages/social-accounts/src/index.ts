export { configVerificationAccountPool } from './adapters/config-verification-account-pool.ts';
export { drizzleClaimRepository } from './adapters/drizzle/drizzle-claim-repository.ts';
export { drizzleVerificationAccountPool } from './adapters/drizzle/drizzle-verification-account-pool.ts';
export { fileClaimRepository } from './adapters/file-claim-repository.ts';
export { inMemoryClaimRepository } from './adapters/in-memory-claim-repository.ts';
export { uuidIds } from './adapters/uuid-ids.ts';
export type { StartAccountClaim, StartClaimInput } from './application/start-account-claim.ts';
export type {
  VerifyAccountClaim,
  VerifyOutcome,
  VerifyResult,
} from './application/verify-account-claim.ts';
export {
  createSocialAccounts,
  socialAccountsConfigSchema,
  type SocialAccounts,
  type SocialAccountsConfig,
  type SocialAccountsDeps,
} from './create-social-accounts.ts';
export {
  claimStates,
  failedAttemptOutcomes,
  rejectionReasons,
  type AccountClaim,
  type ClaimState,
  type FailedAttemptOutcome,
  type RejectionReason,
  type VerifyAttempt,
} from './domain/claim.ts';
export type { ClaimError } from './domain/claim-error.ts';
export { cooldownAfter, type CooldownSchedule } from './domain/cooldown.ts';
export {
  evaluateEligibility,
  ruleNames,
  type EligibilityConfig,
  type EligibilityReport,
  type ReasonCode,
  type RuleName,
  type RuleResult,
} from './domain/eligibility.ts';
export { claimId, userId, type ClaimId, type UserId } from './domain/ids.ts';
export type { ProfileFacts } from './domain/profile-facts.ts';
export type {
  AccountClaimRepository,
  ClaimLimit,
  CreateClaimError,
  SaveClaimError,
  VerifyClaimError,
} from './ports/account-claim-repository.ts';
export type { IdGenerator } from './ports/id-generator.ts';
export type { VerificationAccountPool } from './ports/verification-account-pool.ts';
