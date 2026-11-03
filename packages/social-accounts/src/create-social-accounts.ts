import type { Clock, Verifier } from '@engagement-exchange/verification';
import { z } from 'zod';
import {
  startAccountClaimWith,
  type StartAccountClaim,
} from './application/start-account-claim.ts';
import {
  verifyAccountClaimWith,
  type VerifyAccountClaim,
} from './application/verify-account-claim.ts';
import type { AccountClaimRepository } from './ports/account-claim-repository.ts';
import type { IdGenerator } from './ports/id-generator.ts';
import type { VerificationAccountPool } from './ports/verification-account-pool.ts';

const positiveInt = z.number().int().positive();

export const socialAccountsConfigSchema = z.object({
  eligibility: z.object({
    minFollowers: z.number().int().nonnegative().default(10),
    minPosts: z.number().int().nonnegative().default(1),
    minAccountAgeDays: z.number().int().nonnegative().default(30),
    activeWithinDays: positiveInt.default(90),
    defaultAvatarMarkers: z.array(z.string().min(1)).default([]),
    inconclusiveBlocks: z.boolean().default(false),
  }),
  cooldown: z.object({
    stepsMs: z.array(positiveInt).min(1).default([30_000, 60_000, 120_000, 300_000]),
    afterwardsMs: positiveInt.default(600_000),
  }),
  claimTtlMs: positiveInt.default(86_400_000),
  eligibilityMaxAgeMs: positiveInt.default(3_600_000),
  maxAccountsPerPlatform: positiveInt.default(5),
});

export type SocialAccountsConfig = z.input<typeof socialAccountsConfigSchema>;

export interface SocialAccountsDeps {
  readonly verifier: Verifier;
  readonly repository: AccountClaimRepository;
  readonly pool: VerificationAccountPool;
  readonly ids: IdGenerator;
  readonly clock?: Clock;
}

export interface SocialAccounts {
  readonly startAccountClaim: StartAccountClaim;
  readonly verifyAccountClaim: VerifyAccountClaim;
}

const systemClock: Clock = { now: () => Date.now() };

export const createSocialAccounts = (
  config: SocialAccountsConfig,
  deps: SocialAccountsDeps,
): SocialAccounts => {
  const policy = socialAccountsConfigSchema.parse(config);
  const useCaseDeps = {
    verifier: deps.verifier,
    repository: deps.repository,
    pool: deps.pool,
    ids: deps.ids,
    clock: deps.clock ?? systemClock,
    policy,
  };
  return {
    startAccountClaim: startAccountClaimWith(useCaseDeps),
    verifyAccountClaim: verifyAccountClaimWith(useCaseDeps),
  };
};
