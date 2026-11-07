import { accountId } from '@engagement-exchange/verification';
import { handle } from '@engagement-exchange/verification/testing';
import { describe, expect, it } from 'vitest';
import { awaitingFollow, eligibilityFailed, type AccountClaim } from '../domain/claim.ts';
import { claimId, type ClaimId } from '../domain/ids.ts';
import { fakeLatencyMs } from '../testing/fake-verifier.ts';
import { alice, bob, creator, harness, own, seed, type Harness } from '../testing/fixtures.ts';
import { verifyAccountClaimWith } from './verify-account-claim.ts';

const claimedId = accountId('tiktok', 'MS4wLjABAAAA');
const verificationId = accountId('tiktok', 'MS4wLjABAAAA-verify-one');

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
    verificationId,
  ),
  ...overrides,
});

const mine = (id: ClaimId) => ({ userId: alice, claimId: id });

describe('verifyAccountClaim', () => {
  it('answers claim_not_found for an unknown id', async () => {
    const h = harness();
    await expect(verifyAccountClaimWith(h.deps)(mine(claimId('nope')))).resolves.toEqual({
      ok: false,
      error: { kind: 'claim_not_found' },
    });
  });

  it("answers claim_not_found for another user's claim and leaves it untouched", async () => {
    const h = harness({ follows: () => 'verified' });
    const claim = await seed(h.repository, pending(h));
    h.clock.advance(86_400_000);
    await expect(
      verifyAccountClaimWith(h.deps)({ userId: bob, claimId: claim.id }),
    ).resolves.toEqual({ ok: false, error: { kind: 'claim_not_found' } });
    await expect(h.deps.repository.findById(claim.id)).resolves.toEqual(claim);
    expect(h.verifier.calls).toHaveLength(0);
  });

  it('refuses a claim that is not awaiting a follow', async () => {
    const h = harness();
    await seed(h.repository, eligibilityFailed({ ...pending(h), ttlMs: 1 }));
    await expect(verifyAccountClaimWith(h.deps)(mine(claimId('c1')))).resolves.toEqual({
      ok: false,
      error: { kind: 'claim_not_verifiable', state: 'eligibility_failed' },
    });
  });

  it('refuses an early call with the time left and calls no source', async () => {
    const h = harness();
    const claim = await seed(h.repository, pending(h, { nextVerifyAt: h.clock.now() + 25_000 }));
    await expect(verifyAccountClaimWith(h.deps)(mine(claim.id))).resolves.toEqual({
      ok: false,
      error: { kind: 'cooldown_active', retryAt: claim.nextVerifyAt, waitMs: 25_000 },
    });
    expect(h.verifier.calls).toHaveLength(0);
  });

  it('expires a claim past its expiry before anything else', async () => {
    const h = harness();
    const claim = await seed(h.repository, pending(h));
    h.clock.advance(86_400_000);
    await expect(verifyAccountClaimWith(h.deps)(mine(claim.id))).resolves.toEqual({
      ok: false,
      error: { kind: 'claim_expired' },
    });
    await expect(h.deps.repository.findById(claim.id)).resolves.toMatchObject({
      state: 'expired',
      version: 1,
    });
    expect(h.verifier.calls).toHaveLength(0);
  });

  it('records a failed attempt and escalates the cooldown on not_following', async () => {
    const h = harness({ follows: () => 'not_following' });
    const claim = await seed(h.repository, pending(h));
    const verify = verifyAccountClaimWith(h.deps);
    const waits = [30_000, 60_000, 120_000, 300_000, 600_000, 600_000];
    for (const [index, wait] of waits.entries()) {
      const result = await verify(mine(claim.id));
      expect(result).toMatchObject({ ok: true, value: { outcome: 'not_following' } });
      if (result.ok) {
        expect(result.value.claim.attempts).toHaveLength(index + 1);
        expect(result.value.claim.nextVerifyAt).toBe(h.clock.now() + wait);
      }
      await expect(verify(mine(claim.id))).resolves.toMatchObject({
        ok: false,
        error: { kind: 'cooldown_active' },
      });
      h.clock.advance(wait);
    }
  });

  it.each(['private', 'not_found'] as const)('counts %s as a failed attempt', async (outcome) => {
    const h = harness({ follows: () => outcome });
    const claim = await seed(h.repository, pending(h));
    const result = await verifyAccountClaimWith(h.deps)(mine(claim.id));
    expect(result).toMatchObject({
      ok: true,
      value: { outcome, claim: { attempts: [{ outcome }] } },
    });
  });

  it('records the source and latency of the check on a failed attempt', async () => {
    const h = harness({ follows: () => 'not_following' });
    const claim = await seed(h.repository, pending(h));
    await verifyAccountClaimWith(h.deps)(mine(claim.id));
    await expect(h.deps.repository.findById(claim.id)).resolves.toMatchObject({
      version: 1,
      attempts: [
        { at: h.clock.now(), outcome: 'not_following', source: 'fake', latencyMs: fakeLatencyMs },
      ],
    });
  });

  it('answers version_conflict when the claim changed while the check ran', async () => {
    const h = harness({ follows: () => 'not_following' });
    const claim = await seed(h.repository, pending(h));
    const verify = verifyAccountClaimWith({
      ...h.deps,
      repository: {
        ...h.repository,
        findById: async (id) => {
          const loaded = await h.repository.findById(id);
          if (loaded !== undefined) await h.repository.save(loaded);
          return loaded;
        },
      },
    });
    await expect(verify(mine(claim.id))).resolves.toEqual({
      ok: false,
      error: { kind: 'version_conflict' },
    });
  });

  it('does not count a source_error and leaves the cooldown untouched', async () => {
    const h = harness({ follows: () => 'source_error' });
    const claim = await seed(h.repository, pending(h));
    const result = await verifyAccountClaimWith(h.deps)(mine(claim.id));
    expect(result).toEqual({ ok: true, value: { claim, outcome: 'source_error' } });
    await expect(h.deps.repository.findById(claim.id)).resolves.toEqual(claim);
  });

  it('checks the follow by the stored account id with one call and no profile read', async () => {
    const h = harness({ follows: () => 'not_following' });
    const claim = await seed(h.repository, pending(h));
    await verifyAccountClaimWith(h.deps)(mine(claim.id));
    expect(h.verifier.calls).toEqual([
      {
        kind: 'follows',
        performer: creator,
        performerId: claimedId,
        target: handle('verify.one'),
        targetId: verificationId,
      },
    ]);
  });

  it('marks the claim verified on a verified follow', async () => {
    const h = harness({ follows: () => 'verified' });
    const claim = await seed(h.repository, pending(h));
    await expect(verifyAccountClaimWith(h.deps)(mine(claim.id))).resolves.toMatchObject({
      ok: true,
      value: { outcome: 'verified', claim: { state: 'verified' } },
    });
    await expect(h.deps.repository.findOwner(claimedId)).resolves.toBe(alice);
    await expect(h.deps.repository.countHeld(alice, 'tiktok', claim.expiresAt)).resolves.toBe(1);
  });

  it('rejects the claim when another user verified the same account first', async () => {
    const h = harness({ follows: () => 'verified' });
    const claim = await seed(h.repository, pending(h));
    await own(h.repository, pending(h, { id: claimId('bobs'), userId: bob }));
    await expect(verifyAccountClaimWith(h.deps)(mine(claim.id))).resolves.toEqual({
      ok: false,
      error: { kind: 'account_already_claimed' },
    });
    await expect(h.deps.repository.findById(claim.id)).resolves.toMatchObject({
      state: 'rejected',
      rejection: 'account_already_claimed',
    });
  });
});
