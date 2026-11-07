import { z } from 'zod';

export const isoTime = z.iso.datetime();

export const platform = z.enum(['tiktok']);
export type Platform = z.infer<typeof platform>;

export const claimState = z.enum([
  'eligibility_failed',
  'awaiting_follow',
  'verified',
  'expired',
  'rejected',
  'cancelled',
]);
export type ClaimState = z.infer<typeof claimState>;

export const ruleName = z.enum([
  'public_account',
  'following_visible',
  'min_followers',
  'min_posts',
  'recent_activity',
]);
export type RuleName = z.infer<typeof ruleName>;

export const ruleResult = z.enum(['pass', 'fail', 'inconclusive']);
export type RuleResult = z.infer<typeof ruleResult>;

export const reasonCode = z.enum([
  'account_private',
  'following_hidden',
  'following_visibility_unknown',
  'followers_below_minimum',
  'followers_unknown',
  'no_posts',
  'posts_unknown',
  'inactive',
  'activity_unknown',
]);
export type ReasonCode = z.infer<typeof reasonCode>;

export const verifyOutcome = z.enum(['verified', 'not_following', 'private', 'not_found']);
export type VerifyOutcome = z.infer<typeof verifyOutcome>;

export const failedAttemptOutcome = z.enum(['not_following', 'private', 'not_found']);
export type FailedAttemptOutcome = z.infer<typeof failedAttemptOutcome>;

export const rejectionReason = z.enum(['pool_exhausted', 'account_already_claimed']);
export type RejectionReason = z.infer<typeof rejectionReason>;

export const unavailableOutcome = z.enum(['private', 'not_found']);
export type UnavailableOutcome = z.infer<typeof unavailableOutcome>;

export const userRole = z.enum(['user', 'admin']);
export type UserRole = z.infer<typeof userRole>;

export const sourceName = z.enum(['scraper', 'lamatok', 'ensemble', 'scraptik']);
export type SourceName = z.infer<typeof sourceName>;

export const poolAddition = z.enum(['added', 'present', 'inactive']);
export type PoolAddition = z.infer<typeof poolAddition>;
