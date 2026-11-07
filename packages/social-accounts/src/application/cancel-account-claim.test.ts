import { describe, expect, it } from 'vitest';
import { eligibilityFailed, markExpired } from '../domain/claim.ts';
import { openClaim } from '../testing/database.ts';
import { alice, bob, creator, harness, own, poolAccounts, seed } from '../testing/fixtures.ts';
import { cancelAccountClaimWith } from './cancel-account-claim.ts';
import { startAccountClaimWith } from './start-account-claim.ts';

describe('cancelAccountClaim', () => {
  it('cancels an open claim, frees its slot and lets the user claim the account again', async () => {
    const h = harness();
    const start = startAccountClaimWith(h.deps);
    const started = await start({ userId: alice, platform: 'tiktok', account: creator.value });
    if (!started.ok) throw new Error(started.error.kind);

    const cancelled = await cancelAccountClaimWith(h.deps)({
      userId: alice,
      claimId: started.value.id,
    });

    expect(cancelled).toEqual({
      ok: true,
      value: { ...started.value, state: 'cancelled', version: 1 },
    });
    await expect(h.repository.countHeld(alice, 'tiktok', h.clock.now())).resolves.toBe(0);
    await expect(
      start({ userId: alice, platform: 'tiktok', account: creator.value }),
    ).resolves.toMatchObject({ ok: true, value: { state: 'awaiting_follow', version: 0 } });
  });

  it('cancels an open claim that has expired', async () => {
    const h = harness();
    const claim = await seed(h.repository, openClaim(alice, poolAccounts[0], h.clock.now()));
    h.clock.advance(claim.expiresAt - claim.startedAt);

    await expect(
      cancelAccountClaimWith(h.deps)({ userId: alice, claimId: claim.id }),
    ).resolves.toMatchObject({ ok: true, value: { state: 'cancelled' } });
  });

  it('refuses a claim in any state but awaiting_follow with its state', async () => {
    const h = harness();
    const now = h.clock.now();
    const verified = await own(h.repository, openClaim(alice, poolAccounts[0], now));
    const failed = await seed(
      h.repository,
      eligibilityFailed({ ...openClaim(alice, poolAccounts[0], now), ttlMs: 1 }),
    );
    const expired = await h.repository.save(
      markExpired(await seed(h.repository, openClaim(alice, poolAccounts[0], now))),
    );
    if (!expired.ok) throw new Error(expired.error);
    const cancel = cancelAccountClaimWith(h.deps);

    await expect(
      Promise.all(
        [verified, failed, expired.value].map((claim) =>
          cancel({ userId: alice, claimId: claim.id }),
        ),
      ),
    ).resolves.toEqual(
      ['verified', 'eligibility_failed', 'expired'].map((state) => ({
        ok: false,
        error: { kind: 'claim_not_cancellable', state },
      })),
    );
    await expect(h.repository.findById(verified.id)).resolves.toEqual(verified);
  });

  it("answers claim_not_found for another user's claim and leaves it open", async () => {
    const h = harness();
    const claim = await seed(h.repository, openClaim(alice, poolAccounts[0], h.clock.now()));

    await expect(
      cancelAccountClaimWith(h.deps)({ userId: bob, claimId: claim.id }),
    ).resolves.toEqual({ ok: false, error: { kind: 'claim_not_found' } });
    await expect(h.repository.findById(claim.id)).resolves.toEqual(claim);
  });

  it('answers version_conflict when the claim changed after it was read', async () => {
    const h = harness();
    const claim = await seed(h.repository, openClaim(alice, poolAccounts[0], h.clock.now()));
    const cancel = cancelAccountClaimWith({
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

    await expect(cancel({ userId: alice, claimId: claim.id })).resolves.toEqual({
      ok: false,
      error: { kind: 'version_conflict' },
    });
  });
});
