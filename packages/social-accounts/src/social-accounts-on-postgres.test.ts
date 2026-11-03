import { createDatabase, type Database, type DatabaseClient } from '@engagement-exchange/db';
import { providedDatabaseUrl } from '@engagement-exchange/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzleClaimRepository } from './adapters/drizzle/drizzle-claim-repository.ts';
import { drizzleVerificationAccountPool } from './adapters/drizzle/drizzle-verification-account-pool.ts';
import { uuidIds } from './adapters/uuid-ids.ts';
import { createSocialAccounts } from './create-social-accounts.ts';
import type { AccountClaimRepository } from './ports/account-claim-repository.ts';
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
  const verifyWith = uniqueHandle('verify');

  beforeAll(async () => {
    client = createDatabase(databaseUrl ?? '');
    db = client.db;
    repository = drizzleClaimRepository(db);
    await insertVerificationAccount(db, verifyWith);
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
    const verified = await social({ follows: () => 'verified' }).verifyAccountClaim(
      started.value.id,
    );

    expect(started.value).toMatchObject({ state: 'awaiting_follow', version: 0 });
    expect(started.value.verificationAccount).toBeDefined();
    expect(verified).toMatchObject({
      ok: true,
      value: { claim: { state: 'verified', version: 1 } },
    });
    await expect(repository.findOwner(started.value.accountId)).resolves.toBe(user);
  });

  it('lets exactly one of two users verifying the same account at once own it', async () => {
    const first = await seed(repository, openClaim(await insertUser(db), verifyWith, now));
    const second = await seed(repository, {
      ...openClaim(await insertUser(db), verifyWith, now),
      accountId: first.accountId,
    });
    const { verifyAccountClaim } = social({ follows: () => 'verified' });

    const results = await Promise.all([
      verifyAccountClaim(first.id),
      verifyAccountClaim(second.id),
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
