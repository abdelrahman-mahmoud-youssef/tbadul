import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { accountClaims } from './account-claims.ts';
import { auth_users } from './auth.ts';
import { id, oneOf, timestamptz } from './columns.ts';
import { platformAccounts } from './platform-accounts.ts';
import { platforms } from './platform.ts';

export const linkStatuses = ['active', 'revoked'] as const;

export const activeLinkIndex = 'linked_accounts_active_account_unique';

export const linkedAccounts = pgTable(
  'linked_accounts',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => auth_users.id),
    platform: text('platform', { enum: platforms }).notNull(),
    platformAccountId: uuid('platform_account_id')
      .notNull()
      .references(() => platformAccounts.id),
    status: text('status', { enum: linkStatuses }).notNull(),
    linkedAt: timestamptz('linked_at').notNull(),
    revokedAt: timestamptz('revoked_at'),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => accountClaims.id),
  },
  (table) => [
    check('linked_accounts_platform_check', oneOf(table.platform, platforms)),
    check('linked_accounts_status_check', oneOf(table.status, linkStatuses)),
    uniqueIndex(activeLinkIndex)
      .on(table.platformAccountId)
      .where(sql`${table.status} = 'active'`),
    index('linked_accounts_user_idx').on(table.userId),
  ],
);
