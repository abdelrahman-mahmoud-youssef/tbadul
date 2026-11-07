import { accountId } from '@engagement-exchange/verification';
import { handle } from '@engagement-exchange/verification/testing';
import { describe, expect, it } from 'vitest';
import { awaitingFollow, type AccountClaim } from '../domain/claim.ts';
import { claimId, type UserId } from '../domain/ids.ts';
import { eligibleProfile } from '../testing/fake-verifier.ts';
import {
  alice,
  bob,
  creator,
  harness,
  own,
  poolAccounts,
  seed,
  type Harness,
} from '../testing/fixtures.ts';
import { startAccountClaimWith } from './start-account-claim.ts';

const creatorId = accountId('tiktok', creator.value);

const claimOn = (
  h: Harness,
  user: UserId,
  id: string,
  account = creatorId,
  startedAt = h.clock.now(),
): AccountClaim =>
  awaitingFollow(
    {
      id: claimId(id),
      userId: user,
      handle: handle(account.value),
      accountId: account,
      eligibility: { eligible: true, results: [] },
      startedAt,
      ttlMs: 86_400_000,
    },
    poolAccounts[0].handle,
    poolAccounts[0].accountId,
  );

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
        verificationAccount: poolAccounts[0].handle,
        verificationAccountId: poolAccounts[0].accountId,
        eligibility: { eligible: true },
      },
    });
    expect(verifier.calls.map((c) => c.kind)).toEqual(['profile', 'follows', 'follows']);
    expect(verifier.calls[0]).toMatchObject({ kind: 'profile', latestPost: true });
    await expect(deps.repository.findById(claimId('claim-1'))).resolves.toMatchObject({
      state: 'awaiting_follow',
    });
  });

  it('skips a verification account the claimed account already follows', async () => {
    const { deps } = harness({
      follows: (_performer, target) =>
        target.value === poolAccounts[0].accountId.value ? 'verified' : 'not_following',
    });
    await expect(startAccountClaimWith(deps)(input)).resolves.toMatchObject({
      ok: true,
      value: {
        state: 'awaiting_follow',
        verificationAccount: poolAccounts[1].handle,
        verificationAccountId: poolAccounts[1].accountId,
      },
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
    await expect(deps.repository.countHeld(alice, 'tiktok', 0)).resolves.toBe(0);
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

  it('refuses at the configured limit before paying for the baseline checks', async () => {
    const h = harness({}, { maxAccountsPerPlatform: 1 });
    await seed(h.repository, claimOn(h, alice, 'held', accountId('tiktok', 'held')));
    await expect(startAccountClaimWith(h.deps)(input)).resolves.toEqual({
      ok: false,
      error: { kind: 'claim_limit_reached', limit: 1 },
    });
    expect(h.verifier.calls.map((c) => c.kind)).toEqual(['profile']);
  });

  it('returns the open claim of a user at the limit who starts it again', async () => {
    const h = harness({}, { maxAccountsPerPlatform: 1 });
    const open = await seed(h.repository, claimOn(h, alice, 'open'));
    await expect(startAccountClaimWith(h.deps)(input)).resolves.toEqual({ ok: true, value: open });
    expect(h.verifier.calls.map((c) => c.kind)).toEqual(['profile']);
  });

  it('stops counting open claims once they expire', async () => {
    const h = harness();
    const expiredAt = h.clock.now() - 86_400_000;
    for (const name of ['one', 'two', 'three', 'four', 'five']) {
      await seed(h.repository, claimOn(h, alice, name, accountId('tiktok', name), expiredAt));
    }
    await expect(startAccountClaimWith(h.deps)(input)).resolves.toMatchObject({
      ok: true,
      value: { state: 'awaiting_follow' },
    });
  });

  it('refuses a claim the repository finds over the limit after the checks', async () => {
    const h = harness();
    const start = startAccountClaimWith({
      ...h.deps,
      repository: { ...h.repository, countHeld: () => Promise.resolve(0) },
    });
    for (const name of ['one', 'two', 'three', 'four', 'five']) {
      await seed(h.repository, claimOn(h, alice, name, accountId('tiktok', name)));
    }
    await expect(start(input)).resolves.toEqual({
      ok: false,
      error: { kind: 'claim_limit_reached', limit: 5 },
    });
  });

  it('returns the open claim instead of starting a second one for the same user and account', async () => {
    const { deps, verifier } = harness({ follows: () => 'not_following' });
    const start = startAccountClaimWith(deps);
    const first = await start(input);
    const calls = verifier.calls.length;
    const second = await start({ ...input, account: '@some.creator' });
    expect(second).toEqual(first);
    expect(verifier.calls.slice(calls).map((c) => c.kind)).toEqual(['profile']);
    await expect(deps.repository.countHeld(alice, 'tiktok', 0)).resolves.toBe(1);
  });

  it('returns the open claim a concurrent start created after this one looked', async () => {
    const h = harness({ follows: () => 'not_following' });
    const concurrent = await seed(h.repository, claimOn(h, alice, 'concurrent'));
    let looked = false;
    const start = startAccountClaimWith({
      ...h.deps,
      repository: {
        ...h.repository,
        findOpen: (...args) => {
          if (looked) return h.repository.findOpen(...args);
          looked = true;
          return Promise.resolve(undefined);
        },
      },
    });
    await expect(start(input)).resolves.toEqual({ ok: true, value: concurrent });
  });

  it('starts a claim on an account another user holds an open claim on', async () => {
    const h = harness();
    await seed(h.repository, claimOn(h, bob, 'bobs'));
    await expect(startAccountClaimWith(h.deps)(input)).resolves.toMatchObject({
      ok: true,
      value: { userId: alice, state: 'awaiting_follow' },
    });
  });

  it('refuses an account another user owns through a verified link', async () => {
    const h = harness();
    await own(h.repository, claimOn(h, bob, 'bobs'));
    await expect(startAccountClaimWith(h.deps)(input)).resolves.toEqual({
      ok: false,
      error: { kind: 'account_already_claimed' },
    });
    expect(h.verifier.calls.map((c) => c.kind)).toEqual(['profile']);
  });

  it('refuses an account the same user already owns', async () => {
    const h = harness();
    await own(h.repository, claimOn(h, alice, 'mine'));
    await expect(startAccountClaimWith(h.deps)(input)).resolves.toEqual({
      ok: false,
      error: { kind: 'account_already_linked' },
    });
  });

  it('records the assignment so the next claim gets the least assigned account', async () => {
    const { deps } = harness();
    const start = startAccountClaimWith(deps);
    await expect(start(input)).resolves.toMatchObject({
      value: {
        verificationAccount: poolAccounts[0].handle,
        verificationAccountId: poolAccounts[0].accountId,
      },
    });
    await expect(start({ ...input, account: 'other.creator' })).resolves.toMatchObject({
      value: {
        verificationAccount: poolAccounts[1].handle,
        verificationAccountId: poolAccounts[1].accountId,
      },
    });
  });
});
