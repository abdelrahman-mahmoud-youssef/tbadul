import { describe, expect, it } from 'vitest';
import { configVerificationAccountPool } from './adapters/config-verification-account-pool.ts';
import { inMemoryClaimRepository } from './adapters/in-memory-claim-repository.ts';
import { createSocialAccounts, type SocialAccountsConfig } from './create-social-accounts.ts';
import { fakeVerifier } from './testing/fake-verifier.ts';
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
});
