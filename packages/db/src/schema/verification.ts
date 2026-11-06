import { boolean, check, index, integer, numeric, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { id, oneOf, timestamptz } from './columns.ts';
import { platformAccounts } from './platform-accounts.ts';
import { platforms } from './platform.ts';

export const checkKinds = ['profile', 'follows', 'liked'] as const;

export const checkOutcomes = [
  'verified',
  'not_following',
  'private',
  'not_found',
  'source_error',
] as const;

export const sourceErrorKinds = [
  'timeout',
  'network',
  'http',
  'auth',
  'rate_limited',
  'blocked',
  'parse',
  'unknown_status',
  'incomplete_list',
  'unsupported',
  'identity_conflict',
  'unexpected',
] as const;

export const costUnits = ['request', 'units', 'usd'] as const;

export const verificationAccounts = pgTable('verification_accounts', {
  id: id(),
  platformAccountId: uuid('platform_account_id')
    .notNull()
    .unique('verification_accounts_platform_account_id_unique')
    .references(() => platformAccounts.id),
  active: boolean('active').notNull().default(true),
  assignedCount: integer('assigned_count').notNull().default(0),
  addedAt: timestamptz('added_at').notNull().defaultNow(),
});

export const verificationChecks = pgTable(
  'verification_checks',
  {
    id: id(),
    at: timestamptz('at').notNull(),
    checkKind: text('check_kind', { enum: checkKinds }).notNull(),
    platform: text('platform', { enum: platforms }).notNull(),
    source: text('source').notNull(),
    outcome: text('outcome', { enum: checkOutcomes }).notNull(),
    errorKind: text('error_kind', { enum: sourceErrorKinds }),
    latencyMs: integer('latency_ms').notNull(),
    costUnit: text('cost_unit', { enum: costUnits }),
    costAmount: numeric('cost_amount'),
    subjectHash: text('subject_hash'),
    performerHash: text('performer_hash'),
    targetHash: text('target_hash'),
  },
  (table) => [
    check('verification_checks_platform_check', oneOf(table.platform, platforms)),
    check('verification_checks_check_kind_check', oneOf(table.checkKind, checkKinds)),
    check('verification_checks_outcome_check', oneOf(table.outcome, checkOutcomes)),
    check('verification_checks_error_kind_check', oneOf(table.errorKind, sourceErrorKinds)),
    check('verification_checks_cost_unit_check', oneOf(table.costUnit, costUnits)),
    index('verification_checks_at_brin').using('brin', table.at),
  ],
);
