import type { ProfileFacts } from './profile-facts.ts';

export interface EligibilityConfig {
  readonly minFollowers: number;
  readonly minPosts: number;
  readonly minAccountAgeDays: number;
  readonly activeWithinDays: number;
  readonly defaultAvatarMarkers: readonly string[];
  readonly inconclusiveBlocks: boolean;
}

export const ruleNames = [
  'public_account',
  'following_visible',
  'min_followers',
  'min_posts',
  'avatar_not_default',
  'min_account_age',
  'recent_activity',
] as const;

export type RuleName = (typeof ruleNames)[number];

export type ReasonCode =
  | 'account_private'
  | 'following_hidden'
  | 'following_visibility_unknown'
  | 'followers_below_minimum'
  | 'followers_unknown'
  | 'no_posts'
  | 'posts_unknown'
  | 'default_avatar'
  | 'avatar_unknown'
  | 'account_too_new'
  | 'account_age_unknown'
  | 'inactive'
  | 'activity_unknown';

export type RuleResult =
  | { readonly rule: RuleName; readonly result: 'pass' }
  | {
      readonly rule: RuleName;
      readonly result: 'fail' | 'inconclusive';
      readonly reason: ReasonCode;
    };

export type EligibilityRule = (
  facts: ProfileFacts,
  now: number,
  config: EligibilityConfig,
) => RuleResult;

export interface EligibilityReport {
  readonly eligible: boolean;
  readonly results: readonly RuleResult[];
}

const dayMs = 86_400_000;

const pass = (rule: RuleName): RuleResult => ({ rule, result: 'pass' });
const fail = (rule: RuleName, reason: ReasonCode): RuleResult => ({ rule, result: 'fail', reason });
const inconclusive = (rule: RuleName, reason: ReasonCode): RuleResult => ({
  rule,
  result: 'inconclusive',
  reason,
});

export const publicAccount: EligibilityRule = (facts) =>
  facts.isPrivate ? fail('public_account', 'account_private') : pass('public_account');

export const followingVisible: EligibilityRule = (facts) => {
  if (facts.followingVisible === undefined) {
    return inconclusive('following_visible', 'following_visibility_unknown');
  }
  return facts.followingVisible
    ? pass('following_visible')
    : fail('following_visible', 'following_hidden');
};

export const minFollowers: EligibilityRule = (facts, _now, config) => {
  if (facts.followerCount === undefined) return inconclusive('min_followers', 'followers_unknown');
  return facts.followerCount >= config.minFollowers
    ? pass('min_followers')
    : fail('min_followers', 'followers_below_minimum');
};

export const minPosts: EligibilityRule = (facts, _now, config) => {
  if (facts.videoCount === undefined) return inconclusive('min_posts', 'posts_unknown');
  return facts.videoCount >= config.minPosts ? pass('min_posts') : fail('min_posts', 'no_posts');
};

export const avatarNotDefault: EligibilityRule = (facts, _now, config) => {
  if (facts.avatarUrl === undefined || config.defaultAvatarMarkers.length === 0) {
    return inconclusive('avatar_not_default', 'avatar_unknown');
  }
  const url = facts.avatarUrl;
  return config.defaultAvatarMarkers.some((marker) => url.includes(marker))
    ? fail('avatar_not_default', 'default_avatar')
    : pass('avatar_not_default');
};

export const minAccountAge: EligibilityRule = (facts, now, config) => {
  if (facts.createdAt === undefined) return inconclusive('min_account_age', 'account_age_unknown');
  return now - facts.createdAt >= config.minAccountAgeDays * dayMs
    ? pass('min_account_age')
    : fail('min_account_age', 'account_too_new');
};

export const recentActivity: EligibilityRule = (facts, now, config) => {
  if (facts.latestPostAt === undefined) return inconclusive('recent_activity', 'activity_unknown');
  return now - facts.latestPostAt <= config.activeWithinDays * dayMs
    ? pass('recent_activity')
    : fail('recent_activity', 'inactive');
};

export const eligibilityRules: readonly EligibilityRule[] = [
  publicAccount,
  followingVisible,
  minFollowers,
  minPosts,
  avatarNotDefault,
  minAccountAge,
  recentActivity,
];

export const evaluateEligibility = (
  facts: ProfileFacts,
  now: number,
  config: EligibilityConfig,
  rules: readonly EligibilityRule[] = eligibilityRules,
): EligibilityReport => {
  const results = rules.map((rule) => rule(facts, now, config));
  const blocked = results.some(
    (result) =>
      result.result === 'fail' || (result.result === 'inconclusive' && config.inconclusiveBlocks),
  );
  return { eligible: !blocked, results };
};
