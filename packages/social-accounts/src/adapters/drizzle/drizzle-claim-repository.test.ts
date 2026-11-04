import { randomUUID } from 'node:crypto';
import {
  accountClaims,
  claimAttempts,
  createDatabase,
  platformAccounts,
  type Database,
  type DatabaseClient,
} from '@engagement-exchange/db';
import { providedDatabaseUrl } from '@engagement-exchange/db/testing';
import { accountId } from '@engagement-exchange/verification';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eligibilityFailed, markVerified, recordFailedAttempt } from '../../domain/claim.ts';
import { claimId } from '../../domain/ids.ts';
import type { AccountClaimRepository } from '../../ports/account-claim-repository.ts';
import type { VerificationCandidate } from '../../ports/verification-account-pool.ts';
import {
  insertUser,
  insertVerificationAccount,
  openClaim,
  uniqueHandle,
} from '../../testing/database.ts';
import { own, seed } from '../../testing/fixtures.ts';
import { drizzleClaimRepository } from './drizzle-claim-repository.ts';

const databaseUrl = providedDatabaseUrl();
const now = Date.UTC(2026, 10, 3);
const day = 86_400_000;
const limit = { maxHeld: 5, now };
const schedule = { stepsMs: [30_000], afterwardsMs: 60_000 };

describe.skipIf(databaseUrl === null)('drizzleClaimRepository', () => {
  let client: DatabaseClient;
  let db: Database;
  let repository: AccountClaimRepository;
  let verifyWith: VerificationCandidate;

  beforeAll(async () => {
    client = createDatabase(databaseUrl ?? '');
    db = client.db;
    repository = drizzleClaimRepository(db);
    verifyWith = await insertVerificationAccount(db, uniqueHandle('verify'));
    await Promise.all(Array.from({ length: 4 }, () => db.execute(sql`select pg_sleep(0.05)`)));
  });

  afterAll(async () => {
    await client.close();
  });

  const claimOf = async (external?: string, startedAt = now) =>
    openClaim(await insertUser(db), verifyWith, startedAt, external);

  const attempt = (at: number) =>
    ({ at, outcome: 'not_following', source: 'lamatok', latencyMs: 120 }) as const;

  it('stores a claim and reads it back unchanged', async () => {
    const claim = await claimOf();
    const failed = eligibilityFailed({
      id: claimId(randomUUID()),
      userId: claim.userId,
      handle: uniqueHandle('failed'),
      accountId: accountId('tiktok', randomUUID()),
      eligibility: {
        eligible: false,
        results: [{ rule: 'public_account', result: 'fail', reason: 'account_private' }],
      },
      startedAt: now,
      ttlMs: day,
    });

    await expect(repository.create(claim, limit)).resolves.toEqual({ ok: true, value: claim });
    await seed(repository, failed);

    await expect(repository.findById(claim.id)).resolves.toEqual(claim);
    await expect(repository.findById(failed.id)).resolves.toEqual(failed);
    await expect(repository.findById(claimId(randomUUID()))).resolves.toBeUndefined();
  });

  it('links the verification account by its id, never by a row sharing its handle', async () => {
    await db.insert(platformAccounts).values({
      platform: 'tiktok',
      externalId: randomUUID(),
      handle: verifyWith.handle.value.toUpperCase(),
    });
    const claim = await seed(repository, await claimOf());
    const [stored] = await db
      .select({ externalId: platformAccounts.externalId })
      .from(accountClaims)
      .innerJoin(
        platformAccounts,
        eq(platformAccounts.id, accountClaims.verificationPlatformAccountId),
      )
      .where(eq(accountClaims.id, claim.id));

    expect(stored?.externalId).toBe(verifyWith.accountId.value);
    await expect(repository.findById(claim.id)).resolves.toMatchObject({
      verificationAccount: verifyWith.handle,
      verificationAccountId: verifyWith.accountId,
    });
  });

  it('keeps the verification handle the user was told to follow after the handle moves', async () => {
    const moved = await insertVerificationAccount(db, uniqueHandle('moved'));
    const claim = await seed(repository, openClaim(await insertUser(db), moved, now));

    await db
      .update(platformAccounts)
      .set({ handle: null, handleSeenAt: null })
      .where(eq(platformAccounts.externalId, moved.accountId.value));

    await expect(repository.findById(claim.id)).resolves.toEqual(claim);
  });

  it('stores an account it has not seen before without a profile', async () => {
    const claim = await seed(repository, await claimOf());
    const [row] = await db
      .select()
      .from(platformAccounts)
      .where(eq(platformAccounts.externalId, claim.accountId.value));

    expect(row).toMatchObject({
      handle: claim.handle.value,
      isPrivate: null,
      profileFetchedAt: null,
      profileSource: null,
    });
  });

  it('refuses a sixth account at a limit of five and takes it at a limit of six', async () => {
    const user = await insertUser(db);
    for (let held = 0; held < 5; held++) {
      await seed(repository, openClaim(user, verifyWith, now));
    }
    const sixth = openClaim(user, verifyWith, now);

    await expect(repository.create(sixth, limit)).resolves.toEqual({
      ok: false,
      error: 'limit_reached',
    });
    await expect(repository.create(sixth, { maxHeld: 6, now })).resolves.toMatchObject({
      ok: true,
    });
  });

  it('gives the last slot to exactly one of two concurrent creates', async () => {
    const user = await insertUser(db);
    for (let held = 0; held < 4; held++) {
      await seed(repository, openClaim(user, verifyWith, now));
    }

    const results = await Promise.all([
      repository.create(openClaim(user, verifyWith, now), limit),
      repository.create(openClaim(user, verifyWith, now), limit),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, error: 'limit_reached' }]);
    await expect(repository.countHeld(user, 'tiktok', now)).resolves.toBe(5);
  });

  it('answers claim_open to a concurrent create on the same account', async () => {
    const claim = await claimOf();
    const again = { ...openClaim(claim.userId, verifyWith, now), accountId: claim.accountId };

    const results = await Promise.all([
      repository.create(claim, limit),
      repository.create(again, limit),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, error: 'claim_open' }]);
  });

  it('finds the open claim of a user on an account until it expires', async () => {
    const claim = await seed(repository, await claimOf());
    const stranger = await insertUser(db);

    await expect(repository.findOpen(claim.userId, claim.accountId, now)).resolves.toEqual(claim);
    await expect(
      repository.findOpen(claim.userId, claim.accountId, claim.expiresAt),
    ).resolves.toBeUndefined();
    await expect(repository.findOpen(stranger, claim.accountId, now)).resolves.toBeUndefined();
  });

  it('stops counting an expired open claim and expires it when the account is claimed again', async () => {
    const stale = await seed(repository, await claimOf(randomUUID(), now - day));
    const again = { ...openClaim(stale.userId, verifyWith, now), accountId: stale.accountId };

    await expect(repository.countHeld(stale.userId, 'tiktok', now)).resolves.toBe(0);
    await expect(repository.create(again, limit)).resolves.toMatchObject({ ok: true });
    await expect(repository.findById(stale.id)).resolves.toMatchObject({
      state: 'expired',
      version: 1,
    });
    await expect(repository.countHeld(stale.userId, 'tiktok', now)).resolves.toBe(1);
  });

  it('saves by compare-and-set on the version', async () => {
    const loaded = await seed(repository, await claimOf());

    const first = await repository.save(recordFailedAttempt(loaded, attempt(now), schedule));
    const second = await repository.save(recordFailedAttempt(loaded, attempt(now + 1), schedule));

    expect(first).toMatchObject({ ok: true, value: { version: 1 } });
    expect(second).toEqual({ ok: false, error: 'version_conflict' });
    await expect(repository.findById(loaded.id)).resolves.toMatchObject({
      version: 1,
      attempts: [attempt(now)],
    });
  });

  it('appends attempts on save and refuses to change them', async () => {
    const claim = await seed(repository, await claimOf());
    const once = await repository.save(recordFailedAttempt(claim, attempt(now), schedule));
    if (!once.ok) throw new Error(once.error);
    await repository.save(recordFailedAttempt(once.value, attempt(now + 60_000), schedule));

    await expect(repository.findById(claim.id)).resolves.toMatchObject({
      version: 2,
      attempts: [attempt(now), attempt(now + 60_000)],
    });
    await expect(
      db.update(claimAttempts).set({ latencyMs: 1 }).where(eq(claimAttempts.claimId, claim.id)),
    ).rejects.toMatchObject({
      cause: { message: 'claim_attempts is append-only: UPDATE refused' },
    });
    await expect(
      db.delete(claimAttempts).where(eq(claimAttempts.claimId, claim.id)),
    ).rejects.toMatchObject({
      cause: { message: 'claim_attempts is append-only: DELETE refused' },
    });
  });

  it('links an account to one owner and counts the link once', async () => {
    const mine = await own(repository, await claimOf());
    const theirs = await seed(repository, {
      ...(await claimOf()),
      accountId: mine.accountId,
    });

    await expect(repository.findOwner(mine.accountId)).resolves.toBe(mine.userId);
    await expect(repository.findOwner(accountId('tiktok', randomUUID()))).resolves.toBeUndefined();
    await expect(repository.verify(markVerified(theirs))).resolves.toEqual({
      ok: false,
      error: 'account_already_claimed',
    });
    await expect(repository.findById(theirs.id)).resolves.toMatchObject({
      state: 'awaiting_follow',
      version: 0,
    });
    await expect(repository.countHeld(mine.userId, 'tiktok', mine.expiresAt)).resolves.toBe(1);
  });
});
