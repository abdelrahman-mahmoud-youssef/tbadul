import { accountId } from '@engagement-exchange/verification';
import { handle } from '@engagement-exchange/verification/testing';
import { describe, expect, it } from 'vitest';
import {
  awaitingFollow,
  eligibilityFailed,
  markVerified,
  type AccountClaim,
} from '../domain/claim.ts';
import { claimId } from '../domain/ids.ts';
import { alice, bob, creator, harness, type Harness } from '../testing/fixtures.ts';
import { verifyAccountClaimWith } from './verify-account-claim.ts';

const claimedId = accountId('tiktok', 'MS4wLjABAAAA');

const pending = (h: Harness, overrides: Partial<AccountClaim> = {}): AccountClaim => ({
  ...awaitingFollow(
    {
      id: claimId('c1'),
      userId: alice,
      handle: creator,
      accountId: claimedId,
      eligibility: { eligible: true, results: [] },
      startedAt: h.clock.now(),
      ttlMs: 86_400_000,
    },
    handle('verify.one'),
  ),
  ...overrides,
});

describe('verifyAccountClaim', () => {
  it('answers claim_not_found for an unknown id', async () => {
    const h = harness();
    await expect(verifyAccountClaimWith(h.deps)(claimId('nope'))).resolves.toEqual({
      ok: false,
      error: { kind: 'claim_not_found' },
    });
  });

  it('refuses a claim that is not awaiting a follow', async () => {
    const h = harness();
    await h.deps.repository.save(eligibilityFailed({ ...pending(h), ttlMs: 1 }));
    await expect(verifyAccountClaimWith(h.deps)(claimId('c1'))).resolves.toEqual({
      ok: false,
      error: { kind: 'claim_not_verifiable', state: 'eligibility_failed' },
    });
  });

  it('refuses an early call with the time left and calls no source', async () => {
    const h = harness();
    const claim = pending(h, { nextVerifyAt: h.clock.now() + 25_000 });
    await h.deps.repository.save(claim);
    await expect(verifyAccountClaimWith(h.deps)(claim.id)).resolves.toEqual({
      ok: false,
      error: { kind: 'cooldown_active', retryAt: claim.nextVerifyAt, waitMs: 25_000 },
    });
    expect(h.verifier.calls).toHaveLength(0);
  });

  it('expires a claim past its expiry before anything else', async () => {
    const h = harness();
    const claim = pending(h);
    await h.deps.repository.save(claim);
    h.clock.advance(86_400_000);
    await expect(verifyAccountClaimWith(h.deps)(claim.id)).resolves.toEqual({
      ok: false,
      error: { kind: 'claim_expired' },
    });
    await expect(h.deps.repository.findById(claim.id)).resolves.toMatchObject({ state: 'expired' });
    expect(h.verifier.calls).toHaveLength(0);
  });

  it('records a failed attempt and escalates the cooldown on not_following', async () => {
    const h = harness({ follows: () => 'not_following' });
    const claim = pending(h);
    await h.deps.repository.save(claim);
    const verify = verifyAccountClaimWith(h.deps);
    const waits = [30_000, 60_000, 120_000, 300_000, 600_000, 600_000];
    for (const [index, wait] of waits.entries()) {
      const result = await verify(claim.id);
      expect(result).toMatchObject({ ok: true, value: { outcome: 'not_following' } });
      if (result.ok) {
        expect(result.value.claim.attempts).toHaveLength(index + 1);
        expect(result.value.claim.nextVerifyAt).toBe(h.clock.now() + wait);
      }
      await expect(verify(claim.id)).resolves.toMatchObject({
        ok: false,
        error: { kind: 'cooldown_active' },
      });
      h.clock.advance(wait);
    }
  });

  it.each(['private', 'not_found'] as const)('counts %s as a failed attempt', async (outcome) => {
    const h = harness({ follows: () => outcome });
    const claim = pending(h);
    await h.deps.repository.save(claim);
    const result = await verifyAccountClaimWith(h.deps)(claim.id);
    expect(result).toMatchObject({
      ok: true,
      value: { outcome, claim: { attempts: [{ outcome }] } },
    });
  });

  it('does not count a source_error and leaves the cooldown untouched', async () => {
    const h = harness({ follows: () => 'source_error' });
    const claim = pending(h);
    await h.deps.repository.save(claim);
    const result = await verifyAccountClaimWith(h.deps)(claim.id);
    expect(result).toEqual({ ok: true, value: { claim, outcome: 'source_error' } });
    await expect(h.deps.repository.findById(claim.id)).resolves.toEqual(claim);
  });

  it('checks the follow by the stored account id with one call and no profile read', async () => {
    const h = harness({ follows: () => 'not_following' });
    const claim = pending(h);
    await h.deps.repository.save(claim);
    await verifyAccountClaimWith(h.deps)(claim.id);
    expect(h.verifier.calls).toEqual([
      {
        kind: 'follows',
        performer: creator,
        performerId: claimedId,
        target: handle('verify.one'),
      },
    ]);
  });

  it('marks the claim verified on a verified follow', async () => {
    const h = harness({ follows: () => 'verified' });
    const claim = pending(h);
    await h.deps.repository.save(claim);
    await expect(verifyAccountClaimWith(h.deps)(claim.id)).resolves.toMatchObject({
      ok: true,
      value: { outcome: 'verified', claim: { state: 'verified' } },
    });
    await expect(h.deps.repository.countHeldBy(alice, 'tiktok')).resolves.toBe(1);
  });

  it('rejects the claim when another user verified the same account first', async () => {
    const h = harness({ follows: () => 'verified' });
    const claim = pending(h);
    await h.deps.repository.save(claim);
    await h.deps.repository.save(markVerified(pending(h, { id: claimId('bobs'), userId: bob })));
    await expect(verifyAccountClaimWith(h.deps)(claim.id)).resolves.toEqual({
      ok: false,
      error: { kind: 'account_already_claimed' },
    });
    await expect(h.deps.repository.findById(claim.id)).resolves.toMatchObject({
      state: 'rejected',
      rejection: 'account_already_claimed',
    });
  });
});
