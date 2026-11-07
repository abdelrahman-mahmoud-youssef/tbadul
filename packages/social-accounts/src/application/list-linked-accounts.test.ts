import { describe, expect, it } from 'vitest';
import { openClaim } from '../testing/database.ts';
import { alice, bob, harness, own, poolAccounts, seed } from '../testing/fixtures.ts';
import { cancelAccountClaimWith } from './cancel-account-claim.ts';
import { listLinkedAccountsWith } from './list-linked-accounts.ts';
import { startAccountClaimWith } from './start-account-claim.ts';
import { verifyAccountClaimWith } from './verify-account-claim.ts';

describe('listLinkedAccounts', () => {
  it('lists linked accounts and unexpired open claims per platform with the slots used', async () => {
    const h = harness();
    const now = h.clock.now();
    const linked = await own(h.repository, openClaim(alice, poolAccounts[0], now - 1000));
    const open = await seed(h.repository, openClaim(alice, poolAccounts[0], now));
    await seed(h.repository, openClaim(alice, poolAccounts[0], now - 86_400_000));
    const cancelled = await seed(h.repository, openClaim(alice, poolAccounts[0], now));
    await cancelAccountClaimWith(h.deps)({ userId: alice, claimId: cancelled.id });
    await own(h.repository, openClaim(bob, poolAccounts[0], now));

    await expect(listLinkedAccountsWith(h.deps)({ userId: alice })).resolves.toEqual([
      {
        platform: 'tiktok',
        limit: 5,
        used: 2,
        accounts: [
          {
            platform: 'tiktok',
            handle: linked.handle,
            accountId: linked.accountId,
            linkedAt: linked.startedAt,
            claimId: linked.id,
          },
        ],
        openClaims: [open],
      },
    ]);
  });

  it('counts used slots by the same rule that refuses a claim at the limit', async () => {
    const h = harness({}, { maxAccountsPerPlatform: 2 });
    const now = h.clock.now();
    await own(h.repository, openClaim(alice, poolAccounts[0], now));
    await seed(h.repository, openClaim(alice, poolAccounts[0], now));

    const [tiktok] = await listLinkedAccountsWith(h.deps)({ userId: alice });
    const refused = await startAccountClaimWith(h.deps)({
      userId: alice,
      platform: 'tiktok',
      account: 'one.more',
    });

    expect(tiktok).toMatchObject({ limit: 2, used: 2 });
    expect(refused).toEqual({ ok: false, error: { kind: 'claim_limit_reached', limit: 2 } });
  });

  it('records the link time from the clock when a claim is verified', async () => {
    const h = harness({ follows: () => 'verified' });
    const claim = await seed(h.repository, openClaim(alice, poolAccounts[0], h.clock.now()));
    h.clock.advance(5000);

    await verifyAccountClaimWith(h.deps)({ userId: alice, claimId: claim.id });

    const [tiktok] = await listLinkedAccountsWith(h.deps)({ userId: alice });
    expect(tiktok?.accounts).toEqual([
      expect.objectContaining({ claimId: claim.id, linkedAt: h.clock.now() }),
    ]);
    expect(tiktok?.openClaims).toEqual([]);
  });
});
