import type { ProfileFacts } from './profile-facts.ts';

export interface EligibilityConfig {
  readonly minFollowers: number;
  readonly minPosts: number;
  readonly activeWithinDays: number;
  readonly inconclusiveBlocks: boolean;
}

export const ruleNames = [
  'public_account',
  'following_visible',
  'min_followers',
  'min_posts',
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

export interface EligibilitySignals {
  readonly accountCreatedAt?: number;
  readonly avatarUrl?: string;
}

export interface EligibilityReport {
  readonly eligible: boolean;
  readonly results: readonly RuleResult[];
  readonly signals?: EligibilitySignals;
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

export const recentActivity: EligibilityRule = (facts, now, config) => {
  if (facts.latestPostAt === undefined) return inconclusive('recent_activity', 'activity_unknown');
  return now - facts.latestPostAt <= config.activeWithinDays * dayMs
    ? pass('recent_activity')
    : fail('recent_activity', 'inactive');
};

const signalsOf = (facts: ProfileFacts): EligibilitySignals => ({
  ...(facts.createdAt !== undefined && { accountCreatedAt: facts.createdAt }),
  ...(facts.avatarUrl !== undefined && { avatarUrl: facts.avatarUrl }),
});

export const eligibilityRules: readonly EligibilityRule[] = [
  publicAccount,
  followingVisible,
  minFollowers,
  minPosts,
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
  return { eligible: !blocked, results, signals: signalsOf(facts) };
};
