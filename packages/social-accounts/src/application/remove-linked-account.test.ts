import { describe, expect, it } from 'vitest';
import { openClaim } from '../testing/database.ts';
import { alice, bob, harness, own, poolAccounts, seed } from '../testing/fixtures.ts';
import { removeLinkedAccountWith } from './remove-linked-account.ts';

describe('removeLinkedAccount', () => {
  it('removes a linked account, frees its slot and its ownership', async () => {
    const h = harness();
    const claim = await own(h.repository, openClaim(alice, poolAccounts[0], h.clock.now()));
    await expect(h.repository.countHeld(alice, 'tiktok', h.clock.now())).resolves.toBe(1);

    await expect(
      removeLinkedAccountWith(h.deps)({ userId: alice, claimId: claim.id }),
    ).resolves.toMatchObject({ ok: true, value: { state: 'cancelled' } });

    await expect(h.repository.countHeld(alice, 'tiktok', h.clock.now())).resolves.toBe(0);
    await expect(h.repository.listLinked(alice, 'tiktok')).resolves.toEqual([]);
    await expect(h.repository.findOwner(claim.accountId)).resolves.toBeUndefined();
  });

  it('refuses a claim that is not linked, with its state', async () => {
    const h = harness();
    const claim = await seed(h.repository, openClaim(alice, poolAccounts[0], h.clock.now()));

    await expect(
      removeLinkedAccountWith(h.deps)({ userId: alice, claimId: claim.id }),
    ).resolves.toEqual({
      ok: false,
      error: { kind: 'claim_not_cancellable', state: 'awaiting_follow' },
    });
  });

  it("answers claim_not_found for another user's linked account and keeps it", async () => {
    const h = harness();
    const claim = await own(h.repository, openClaim(alice, poolAccounts[0], h.clock.now()));

    await expect(
      removeLinkedAccountWith(h.deps)({ userId: bob, claimId: claim.id }),
    ).resolves.toEqual({ ok: false, error: { kind: 'claim_not_found' } });
    await expect(h.repository.listLinked(alice, 'tiktok')).resolves.toHaveLength(1);
  });
});
