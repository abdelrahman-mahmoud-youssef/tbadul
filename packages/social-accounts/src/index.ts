export { configVerificationAccountPool } from './adapters/config-verification-account-pool.ts';
export { drizzleClaimRepository } from './adapters/drizzle/drizzle-claim-repository.ts';
export { drizzleVerificationAccountPool } from './adapters/drizzle/drizzle-verification-account-pool.ts';
export { inMemoryClaimRepository } from './adapters/in-memory-claim-repository.ts';
export { uuidIds } from './adapters/uuid-ids.ts';
export type { CancelAccountClaim } from './application/cancel-account-claim.ts';
export type { GetAccountClaim } from './application/get-account-claim.ts';
export type { ListLinkedAccounts, PlatformAccounts } from './application/list-linked-accounts.ts';
export type {
  AddedVerificationAccount,
  AddVerificationAccount,
  ListVerificationAccounts,
  SetVerificationAccountActive,
} from './application/verification-accounts.ts';
export type { ClaimRef } from './application/owned-claim.ts';
export type { StartAccountClaim, StartClaimInput } from './application/start-account-claim.ts';
export type {
  VerifyAccountClaim,
  VerifyOutcome,
  VerifyResult,
} from './application/verify-account-claim.ts';
export {
  createSocialAccounts,
  createVerificationAccounts,
  socialAccountsConfigSchema,
  type SocialAccounts,
  type SocialAccountsConfig,
  type SocialAccountsDeps,
  type VerificationAccountAdminDeps,
  type VerificationAccounts,
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
export type { LinkedAccount } from './domain/linked-account.ts';
export type { ProfileFacts } from './domain/profile-facts.ts';
export type {
  AccountClaimRepository,
  ClaimLimit,
  CreateClaimError,
  SaveClaimError,
  VerifyClaimError,
} from './ports/account-claim-repository.ts';
export type {
  AddVerificationAccountError,
  VerificationAccountNotFound,
} from './domain/verification-account-error.ts';
export type { IdGenerator } from './ports/id-generator.ts';
export type {
  PoolAddition,
  PooledAccount,
  VerificationAccountAdmin,
} from './ports/verification-account-admin.ts';
export type {
  VerificationAccountPool,
  VerificationCandidate,
} from './ports/verification-account-pool.ts';
