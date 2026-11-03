import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { auth_users } from './auth.ts';
import { id, oneOf, timestamptz } from './columns.ts';
import { platformAccounts } from './platform-accounts.ts';
import { platforms } from './platform.ts';

export const claimStates = [
  'eligibility_failed',
  'awaiting_follow',
  'verified',
  'expired',
  'rejected',
] as const;

export const rejectionReasons = ['pool_exhausted', 'account_already_claimed'] as const;

export const attemptOutcomes = ['not_following', 'private', 'not_found'] as const;

export const openClaimIndex = 'account_claims_open_unique';

export const accountClaims = pgTable(
  'account_claims',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => auth_users.id),
    platform: text('platform', { enum: platforms }).notNull(),
    platformAccountId: uuid('platform_account_id')
      .notNull()
      .references(() => platformAccounts.id),
    handle: text('handle').notNull(),
    verificationPlatformAccountId: uuid('verification_platform_account_id').references(
      () => platformAccounts.id,
    ),
    verificationHandle: text('verification_handle'),
    state: text('state', { enum: claimStates }).notNull(),
    rejection: text('rejection', { enum: rejectionReasons }),
    eligibility: jsonb('eligibility').notNull(),
    nextVerifyAt: timestamptz('next_verify_at').notNull(),
    startedAt: timestamptz('started_at').notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
    version: integer('version').notNull().default(0),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (table) => [
    check('account_claims_platform_check', oneOf(table.platform, platforms)),
    check('account_claims_state_check', oneOf(table.state, claimStates)),
    check('account_claims_rejection_check', oneOf(table.rejection, rejectionReasons)),
    uniqueIndex(openClaimIndex)
      .on(table.userId, table.platformAccountId)
      .where(sql`${table.state} = 'awaiting_follow'`),
    index('account_claims_user_platform_idx').on(table.userId, table.platform),
  ],
);

export const claimAttempts = pgTable(
  'claim_attempts',
  {
    id: id(),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => accountClaims.id),
    at: timestamptz('at').notNull(),
    outcome: text('outcome', { enum: attemptOutcomes }).notNull(),
    source: text('source'),
    latencyMs: integer('latency_ms'),
  },
  (table) => [
    check('claim_attempts_outcome_check', oneOf(table.outcome, attemptOutcomes)),
    index('claim_attempts_claim_idx').on(table.claimId),
  ],
);
