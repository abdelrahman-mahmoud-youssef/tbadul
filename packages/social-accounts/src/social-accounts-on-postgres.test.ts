import { randomUUID } from 'node:crypto';
import { createDatabase, type Database, type DatabaseClient } from '@engagement-exchange/db';
import { accountId } from '@engagement-exchange/verification';
import { providedDatabaseUrl } from '@engagement-exchange/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzleClaimRepository } from './adapters/drizzle/drizzle-claim-repository.ts';
import { drizzleVerificationAccountPool } from './adapters/drizzle/drizzle-verification-account-pool.ts';
import { uuidIds } from './adapters/uuid-ids.ts';
import { createSocialAccounts } from './create-social-accounts.ts';
import type { AccountClaimRepository } from './ports/account-claim-repository.ts';
import type { VerificationCandidate } from './ports/verification-account-pool.ts';
import {
  insertUser,
  insertVerificationAccount,
  openClaim,
  uniqueHandle,
} from './testing/database.ts';
import { fakeVerifier, type FakeVerifierScript } from './testing/fake-verifier.ts';
import { seed } from './testing/fixtures.ts';

const databaseUrl = providedDatabaseUrl();
const now = Date.UTC(2026, 10, 3);

describe.skipIf(databaseUrl === null)('social accounts on PostgreSQL', () => {
  let client: DatabaseClient;
  let db: Database;
  let repository: AccountClaimRepository;
  let verifyWith: VerificationCandidate;

  beforeAll(async () => {
    client = createDatabase(databaseUrl ?? '');
    db = client.db;
    repository = drizzleClaimRepository(db);
    verifyWith = await insertVerificationAccount(db, uniqueHandle('verify'));
  });

  afterAll(async () => {
    await client.close();
  });

  const social = (script: FakeVerifierScript) =>
    createSocialAccounts(
      { eligibility: {}, cooldown: {} },
      {
        verifier: fakeVerifier(script),
        repository,
        pool: drizzleVerificationAccountPool(db),
        ids: uuidIds,
        clock: { now: () => now },
      },
    );

  it('starts a claim with a pooled verification account and verifies it', async () => {
    const user = await insertUser(db);
    const account = uniqueHandle('creator');

    const started = await social({ follows: () => 'not_following' }).startAccountClaim({
      userId: user,
      platform: 'tiktok',
      account: account.value,
    });
    if (!started.ok) throw new Error(started.error.kind);
    const verified = await social({ follows: () => 'verified' }).verifyAccountClaim({
      userId: user,
      claimId: started.value.id,
    });

    expect(started.value).toMatchObject({ state: 'awaiting_follow', version: 0 });
    expect(started.value.verificationAccount).toBeDefined();
    expect(verified).toMatchObject({
      ok: true,
      value: { claim: { state: 'verified', version: 1 } },
    });
    await expect(repository.findOwner(started.value.accountId)).resolves.toBe(user);
  });

  it('cancels an open claim, frees its slot and lets the user claim the account again', async () => {
    const user = await insertUser(db);
    const account = uniqueHandle('cancelled');
    const accounts = social({ follows: () => 'not_following' });
    const start = () =>
      accounts.startAccountClaim({ userId: user, platform: 'tiktok', account: account.value });
    const started = await start();
    if (!started.ok) throw new Error(started.error.kind);

    const cancelled = await accounts.cancelAccountClaim({
      userId: user,
      claimId: started.value.id,
    });
    const again = await start();

    expect(cancelled).toMatchObject({ ok: true, value: { state: 'cancelled', version: 1 } });
    await expect(repository.findById(started.value.id)).resolves.toMatchObject({
      state: 'cancelled',
    });
    expect(again).toMatchObject({ ok: true, value: { state: 'awaiting_follow' } });
    expect(again.ok && again.value.id).not.toBe(started.value.id);
    await expect(repository.countHeld(user, 'tiktok', now)).resolves.toBe(1);
  });

  it('checks the follow against the pooled account by its secUid and numeric id', async () => {
    const pooled = {
      handle: uniqueHandle('numeric'),
      accountId: accountId('tiktok', randomUUID(), String(Date.now())),
    };
    await drizzleVerificationAccountPool(db).add(pooled, now);
    const candidate = (await drizzleVerificationAccountPool(db).candidates('tiktok')).find(
      (entry) => entry.accountId.value === pooled.accountId.value,
    );
    if (candidate === undefined) throw new Error('pooled account is not a candidate');
    const claim = await seed(repository, openClaim(await insertUser(db), candidate, now));
    const verifier = fakeVerifier({ follows: () => 'not_following' });

    await createSocialAccounts(
      { eligibility: {}, cooldown: {} },
      {
        verifier,
        repository,
        pool: drizzleVerificationAccountPool(db),
        ids: uuidIds,
        clock: { now: () => now },
      },
    ).verifyAccountClaim({ userId: claim.userId, claimId: claim.id });

    expect(candidate.accountId).toEqual(pooled.accountId);
    expect(verifier.calls).toMatchObject([{ kind: 'follows', targetId: pooled.accountId }]);
  });

  it('lets exactly one of two users verifying the same account at once own it', async () => {
    const first = await seed(repository, openClaim(await insertUser(db), verifyWith, now));
    const second = await seed(repository, {
      ...openClaim(await insertUser(db), verifyWith, now),
      accountId: first.accountId,
    });
    const { verifyAccountClaim } = social({ follows: () => 'verified' });

    const results = await Promise.all([
      verifyAccountClaim({ userId: first.userId, claimId: first.id }),
      verifyAccountClaim({ userId: second.userId, claimId: second.id }),
    ]);
    const claims = await Promise.all([first, second].map((claim) => repository.findById(claim.id)));
    const links = await db.query.linkedAccounts.findMany({
      where: (link, { inArray }) => inArray(link.claimId, [first.id, second.id]),
    });

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, error: { kind: 'account_already_claimed' } },
    ]);
    expect(claims.map((claim) => [claim?.state, claim?.rejection]).sort()).toEqual([
      ['rejected', 'account_already_claimed'],
      ['verified', undefined],
    ]);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ status: 'active' });
  });
});
