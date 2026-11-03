import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { id, oneOf, timestamptz } from './columns.ts';
import { platforms } from './platform.ts';

export const platformAccountIdentity = 'platform_accounts_platform_external_id_unique';

export const platformAccounts = pgTable(
  'platform_accounts',
  {
    id: id(),
    platform: text('platform', { enum: platforms }).notNull(),
    externalId: text('external_id').notNull(),
    numericId: text('numeric_id'),
    handle: text('handle'),
    handleSeenAt: timestamptz('handle_seen_at'),
    isPrivate: boolean('is_private'),
    followingVisible: boolean('following_visible'),
    likesVisible: boolean('likes_visible'),
    followerCount: integer('follower_count'),
    followingCount: integer('following_count'),
    videoCount: integer('video_count'),
    accountCreatedAt: timestamptz('account_created_at'),
    avatarUrl: text('avatar_url'),
    profileFetchedAt: timestamptz('profile_fetched_at'),
    profileSource: text('profile_source'),
    extras: jsonb('extras').notNull().default({}),
  },
  (table) => [
    check('platform_accounts_platform_check', oneOf(table.platform, platforms)),
    unique(platformAccountIdentity).on(table.platform, table.externalId),
    index('platform_accounts_platform_handle_idx').on(table.platform, sql`lower(${table.handle})`),
  ],
);
