import { createVerifier } from '@engagement-exchange/verification';
import {
  fakeSource,
  followingPages,
  type FollowsHandler,
} from '@engagement-exchange/verification/testing';
import { describe, expect, it } from 'vitest';
import { configVerificationAccountPool } from './adapters/config-verification-account-pool.ts';
import { inMemoryClaimRepository } from './adapters/in-memory-claim-repository.ts';
import { createSocialAccounts, type SocialAccountsConfig } from './create-social-accounts.ts';
import { eligibleProfile, fakeVerifier } from './testing/fake-verifier.ts';
import { alice, poolAccounts } from './testing/fixtures.ts';

const startWith = async (config: SocialAccountsConfig) => {
  const verifier = fakeVerifier({});
  const social = createSocialAccounts(config, {
    verifier,
    repository: inMemoryClaimRepository(),
    pool: configVerificationAccountPool(poolAccounts),
    ids: { next: () => 'claim-1' },
  });
  await social.startAccountClaim({ userId: alice, platform: 'tiktok', account: 'some.creator' });
  return verifier;
};

describe('createSocialAccounts', () => {
  it('asks the profile check for data no older than eligibilityMaxAgeMs', async () => {
    const verifier = await startWith({ eligibility: {}, cooldown: {}, eligibilityMaxAgeMs: 5000 });

    expect(verifier.calls[0]?.kind).toBe('profile');
    expect(verifier.options[0]).toEqual({ maxAgeMs: 5000 });
  });

  it('defaults eligibilityMaxAgeMs to one hour', async () => {
    const verifier = await startWith({ eligibility: {}, cooldown: {} });

    expect(verifier.options[0]).toEqual({ maxAgeMs: 3_600_000 });
  });

  it('reads the performer following list once for every pool candidate', async () => {
    const reads: number[] = [];
    const listed = followingPages([{ value: poolAccounts[0].accountId.value }]);
    const follows: FollowsHandler = (check, context) => {
      reads.push(check.targets.length);
      return listed(check, context);
    };
    const source = fakeSource('fake', {
      profile: {
        outcome: 'verified',
        evidence: eligibleProfile(),
        cost: { unit: 'request', amount: 1 },
      },
      follows,
    });
    const verifier = createVerifier(
      {
        order: { profile: ['fake'], follows: ['fake'], liked: ['fake'] },
        timeoutMs: 1000,
        pageCap: 3,
      },
      { sources: [source] },
    );
    const social = createSocialAccounts(
      { eligibility: {}, cooldown: {} },
      {
        verifier,
        repository: inMemoryClaimRepository(),
        pool: configVerificationAccountPool(poolAccounts),
        ids: { next: () => 'claim-1' },
        clock: { now: () => Date.UTC(2026, 10, 2) },
      },
    );

    const claim = await social.startAccountClaim({
      userId: alice,
      platform: 'tiktok',
      account: 'some.creator',
    });

    expect(reads).toEqual([2]);
    expect(claim).toMatchObject({
      ok: true,
      value: { state: 'awaiting_follow', verificationAccount: poolAccounts[1].handle },
    });
  });
});
