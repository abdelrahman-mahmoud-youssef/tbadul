import { describe, expect, it } from 'vitest';
import {
  avatarNotDefault,
  evaluateEligibility,
  followingVisible,
  minAccountAge,
  minFollowers,
  minPosts,
  publicAccount,
  recentActivity,
  type EligibilityConfig,
} from './eligibility.ts';
import type { ProfileFacts } from './profile-facts.ts';

const day = 86_400_000;
const now = Date.UTC(2026, 10, 2);
const config: EligibilityConfig = {
  minFollowers: 10,
  minPosts: 1,
  minAccountAgeDays: 30,
  activeWithinDays: 90,
  defaultAvatarMarkers: ['default-avatar'],
  inconclusiveBlocks: false,
};
const omit = (facts: ProfileFacts, key: keyof ProfileFacts): ProfileFacts =>
  Object.fromEntries(Object.entries(facts).filter(([name]) => name !== key)) as ProfileFacts;

const good: ProfileFacts = {
  isPrivate: false,
  followingVisible: true,
  followerCount: 10,
  videoCount: 1,
  avatarUrl: 'https://cdn.example/avatar/abc.jpeg',
  createdAt: now - 30 * day,
  latestPostAt: now - 90 * day,
};

describe('eligibility rules', () => {
  it.each([
    ['public_account', publicAccount, { isPrivate: true }, 'account_private'],
    ['following_visible', followingVisible, { followingVisible: false }, 'following_hidden'],
    ['min_followers', minFollowers, { followerCount: 9 }, 'followers_below_minimum'],
    ['min_posts', minPosts, { videoCount: 0 }, 'no_posts'],
    [
      'avatar_not_default',
      avatarNotDefault,
      { avatarUrl: 'https://cdn/default-avatar.png' },
      'default_avatar',
    ],
    ['min_account_age', minAccountAge, { createdAt: now - 29 * day }, 'account_too_new'],
    ['recent_activity', recentActivity, { latestPostAt: now - 91 * day }, 'inactive'],
  ] as const)('%s passes on the threshold and fails below it', (rule, evaluate, bad, reason) => {
    expect(evaluate(good, now, config)).toEqual({ rule, result: 'pass' });
    expect(evaluate({ ...good, ...bad }, now, config)).toEqual({ rule, result: 'fail', reason });
  });

  it.each([
    ['following_visible', followingVisible, 'followingVisible', 'following_visibility_unknown'],
    ['min_followers', minFollowers, 'followerCount', 'followers_unknown'],
    ['min_posts', minPosts, 'videoCount', 'posts_unknown'],
    ['avatar_not_default', avatarNotDefault, 'avatarUrl', 'avatar_unknown'],
    ['min_account_age', minAccountAge, 'createdAt', 'account_age_unknown'],
    ['recent_activity', recentActivity, 'latestPostAt', 'activity_unknown'],
  ] as const)('%s is inconclusive without the fact', (rule, evaluate, missing, reason) => {
    expect(evaluate(omit(good, missing), now, config)).toEqual({
      rule,
      result: 'inconclusive',
      reason,
    });
  });

  it('avatar rule is inconclusive when no default marker is configured', () => {
    expect(avatarNotDefault(good, now, { ...config, defaultAvatarMarkers: [] })).toEqual({
      rule: 'avatar_not_default',
      result: 'inconclusive',
      reason: 'avatar_unknown',
    });
  });
});

describe('evaluateEligibility', () => {
  it('is eligible when every rule passes', () => {
    const report = evaluateEligibility(good, now, config);
    expect(report.eligible).toBe(true);
    expect(report.results).toHaveLength(7);
  });

  it('is not eligible when one rule fails and keeps every result', () => {
    const report = evaluateEligibility({ ...good, isPrivate: true }, now, config);
    expect(report.eligible).toBe(false);
    expect(report.results[0]).toEqual({
      rule: 'public_account',
      result: 'fail',
      reason: 'account_private',
    });
  });

  it('treats inconclusive rules as the config says', () => {
    const facts = omit(good, 'latestPostAt');
    expect(evaluateEligibility(facts, now, config).eligible).toBe(true);
    expect(evaluateEligibility(facts, now, { ...config, inconclusiveBlocks: true }).eligible).toBe(
      false,
    );
  });
});
