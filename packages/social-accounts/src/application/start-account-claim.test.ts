import { handle } from '@engagement-exchange/verification/testing';
import { describe, expect, it } from 'vitest';
import { awaitingFollow, markVerified } from '../domain/claim.ts';
import { claimId } from '../domain/ids.ts';
import { accountId } from '@engagement-exchange/verification';
import { eligibleProfile } from '../testing/fake-verifier.ts';
import { alice, bob, creator, harness, poolAccounts } from '../testing/fixtures.ts';
import { startAccountClaimWith } from './start-account-claim.ts';

const input = {
  userId: alice,
  platform: 'tiktok' as const,
  account: 'https://www.tiktok.com/@Some.Creator',
};

describe('startAccountClaim', () => {
  it('rejects an input that is not a handle', async () => {
    const { deps } = harness();
    await expect(
      startAccountClaimWith(deps)({ ...input, account: 'not a handle' }),
    ).resolves.toEqual({
      ok: false,
      error: { kind: 'invalid_handle', reason: 'characters' },
    });
  });

  it('starts an awaiting_follow claim with the first unfollowed verification account', async () => {
    const { deps, verifier } = harness({ follows: () => 'not_following' });
    const result = await startAccountClaimWith(deps)(input);
    expect(result).toMatchObject({
      ok: true,
      value: {
        id: 'claim-1',
        userId: alice,
        handle: creator,
        state: 'awaiting_follow',
        verificationAccount: poolAccounts[0],
        eligibility: { eligible: true },
      },
    });
    expect(verifier.calls.map((c) => c.kind)).toEqual(['profile', 'follows']);
    await expect(deps.repository.findById(claimId('claim-1'))).resolves.toMatchObject({
      state: 'awaiting_follow',
    });
  });

  it('skips a verification account the claimed account already follows', async () => {
    const { deps } = harness({
      follows: (_performer, target) =>
        target.value === 'verify.one' ? 'verified' : 'not_following',
    });
    await expect(startAccountClaimWith(deps)(input)).resolves.toMatchObject({
      ok: true,
      value: { state: 'awaiting_follow', verificationAccount: poolAccounts[1] },
    });
  });

  it('rejects the claim when every verification account is already followed', async () => {
    const { deps } = harness({ follows: () => 'verified' });
    await expect(startAccountClaimWith(deps)(input)).resolves.toMatchObject({
      ok: true,
      value: { state: 'rejected', rejection: 'pool_exhausted' },
    });
  });

  it('saves an eligibility_failed claim with the report when a rule fails', async () => {
    const { deps } = harness({ profile: () => ({ ...eligibleProfile(), isPrivate: true }) });
    const result = await startAccountClaimWith(deps)(input);
    expect(result).toMatchObject({
      ok: true,
      value: { state: 'eligibility_failed', eligibility: { eligible: false } },
    });
    if (result.ok) {
      expect(result.value.eligibility.results[0]).toEqual({
        rule: 'public_account',
        result: 'fail',
        reason: 'account_private',
      });
    }
  });

  it.each([
    ['not_found', { kind: 'account_unavailable', outcome: 'not_found' }],
    ['private', { kind: 'account_unavailable', outcome: 'private' }],
    ['source_error', { kind: 'source_unavailable' }],
  ] as const)('does not create a claim when the profile answers %s', async (outcome, error) => {
    const { deps, verifier } = harness({ profile: () => outcome });
    await expect(startAccountClaimWith(deps)(input)).resolves.toEqual({ ok: false, error });
    expect(verifier.calls).toHaveLength(1);
  });

  it('does not create a claim when the baseline check fails at the source', async () => {
    const { deps } = harness({ follows: () => 'source_error' });
    await expect(startAccountClaimWith(deps)(input)).resolves.toEqual({
      ok: false,
      error: { kind: 'source_unavailable' },
    });
    await expect(deps.repository.countHeldBy(alice, 'tiktok')).resolves.toBe(0);
  });

  it('refuses a sixth account on the same platform', async () => {
    const { deps } = harness();
    const start = startAccountClaimWith(deps);
    for (const name of ['one', 'two', 'three', 'four', 'five']) {
      await expect(start({ ...input, account: `creator.${name}` })).resolves.toMatchObject({
        ok: true,
      });
    }
    await expect(start({ ...input, account: 'creator.six' })).resolves.toEqual({
      ok: false,
      error: { kind: 'claim_limit_reached', limit: 5 },
    });
  });

  it('refuses an account another user already holds', async () => {
    const { deps, verifier } = harness();
    await deps.repository.save(
      markVerified(
        awaitingFollow(
          {
            id: claimId('bobs'),
            userId: bob,
            handle: creator,
            accountId: accountId('tiktok', 'x'),
            eligibility: { eligible: true, results: [] },
            startedAt: 0,
            ttlMs: 1,
          },
          handle('verify.one'),
        ),
      ),
    );
    await expect(startAccountClaimWith(deps)(input)).resolves.toEqual({
      ok: false,
      error: { kind: 'account_already_claimed' },
    });
    expect(verifier.calls).toHaveLength(0);
  });
});
