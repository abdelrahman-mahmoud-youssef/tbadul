import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { claimId } from '../domain/ids.ts';
import { openClaim } from '../testing/database.ts';
import { alice, bob, harness, poolAccounts, seed } from '../testing/fixtures.ts';
import { getAccountClaimWith } from './get-account-claim.ts';

describe('getAccountClaim', () => {
  it("answers the user's own claim", async () => {
    const h = harness();
    const claim = await seed(h.repository, openClaim(alice, poolAccounts[0], h.clock.now()));

    await expect(
      getAccountClaimWith(h.deps)({ userId: alice, claimId: claim.id }),
    ).resolves.toEqual({ ok: true, value: claim });
  });

  it("answers claim_not_found for another user's claim and an unknown id alike", async () => {
    const h = harness();
    const claim = await seed(h.repository, openClaim(alice, poolAccounts[0], h.clock.now()));
    const get = getAccountClaimWith(h.deps);

    await expect(get({ userId: bob, claimId: claim.id })).resolves.toEqual({
      ok: false,
      error: { kind: 'claim_not_found' },
    });
    await expect(get({ userId: alice, claimId: claimId(randomUUID()) })).resolves.toEqual({
      ok: false,
      error: { kind: 'claim_not_found' },
    });
  });
});
