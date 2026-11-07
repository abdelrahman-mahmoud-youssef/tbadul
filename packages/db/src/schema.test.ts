import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { eq, sql } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authOptions, authUserEmailIndex } from './auth-options.ts';
import { createDatabase, type Database, type DatabaseClient } from './client.ts';
import { applyMigrations, migrationsApplied } from './migrations.ts';
import {
  accountClaims,
  activeLinkIndex,
  auth_users,
  claimAttempts,
  linkedAccounts,
  openClaimIndex,
  platformAccountIdentity,
  platformAccounts,
  type Platform,
  verificationChecks,
} from './schema/index.ts';
import { providedDatabaseUrl } from './testing/index.ts';

const databaseUrl = providedDatabaseUrl();

const single = <T>(rows: readonly T[]): T => {
  const [row] = rows;
  if (row === undefined || rows.length !== 1)
    throw new Error(`expected one row, got ${rows.length}`);
  return row;
};

const failure = async (query: PromiseLike<unknown>): Promise<DatabaseError> => {
  const error: unknown = await query.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (error instanceof Error && error.cause instanceof DatabaseError) return error.cause;
  throw new Error('expected the database to refuse the query');
};

describe.skipIf(databaseUrl === null)('database schema', () => {
  let client: DatabaseClient;
  let db: Database;
  const now = new Date();

  beforeAll(() => {
    client = createDatabase(databaseUrl ?? '');
    db = client.db;
  });

  afterAll(async () => {
    await client.close();
  });

  const user = async () =>
    single(
      await db
        .insert(auth_users)
        .values({ name: 'user', email: `${randomUUID()}@example.test`, updatedAt: now })
        .returning(),
    );

  const account = (overrides: { platform?: Platform; externalId?: string; handle?: string } = {}) =>
    db
      .insert(platformAccounts)
      .values({
        platform: 'tiktok',
        externalId: randomUUID(),
        handle: 'someone',
        handleSeenAt: now,
        isPrivate: false,
        profileFetchedAt: now,
        profileSource: 'lamatok',
        ...overrides,
      })
      .returning();

  const claim = (
    userId: string,
    platformAccountId: string,
    state: 'awaiting_follow' | 'expired' = 'awaiting_follow',
  ) =>
    db
      .insert(accountClaims)
      .values({
        userId,
        platform: 'tiktok',
        platformAccountId,
        handle: 'someone',
        state,
        eligibility: { eligible: true, results: [] },
        nextVerifyAt: now,
        startedAt: now,
        expiresAt: now,
      })
      .returning();

  const link = (
    userId: string,
    platformAccountId: string,
    claimId: string,
    status: 'active' | 'revoked',
  ) =>
    db
      .insert(linkedAccounts)
      .values({
        userId,
        platform: 'tiktok',
        platformAccountId,
        claimId,
        status,
        linkedAt: now,
        ...(status === 'revoked' ? { revokedAt: now } : {}),
      })
      .returning();

  const check = () =>
    db
      .insert(verificationChecks)
      .values({
        at: now,
        checkKind: 'follows',
        platform: 'tiktok',
        source: 'lamatok',
        outcome: 'not_following',
        latencyMs: 120,
        costUnit: 'request',
        costAmount: '2',
      })
      .returning();

  const freshDatabase = async (): Promise<string> => {
    const name = `fresh_${randomUUID().replaceAll('-', '')}`;
    await db.execute(sql`create database ${sql.identifier(name)}`);
    const freshUrl = new URL(databaseUrl ?? '');
    freshUrl.pathname = `/${name}`;
    return freshUrl.toString();
  };

  it('reports migrations applied only once every migration has run', async () => {
    const freshUrl = await freshDatabase();
    const fresh = createDatabase(freshUrl);
    try {
      await expect(migrationsApplied(fresh.db)).resolves.toBe(false);
      await applyMigrations(freshUrl);
      await expect(migrationsApplied(fresh.db)).resolves.toBe(true);
      await fresh.db.execute(
        sql`delete from drizzle.__drizzle_migrations where created_at = (select max(created_at) from drizzle.__drizzle_migrations)`,
      );
      await expect(migrationsApplied(fresh.db)).resolves.toBe(false);
    } finally {
      await fresh.close();
    }
  });

  it('applies the migrations to an empty database, and again without change', async () => {
    const freshUrl = await freshDatabase();

    await applyMigrations(freshUrl);
    await applyMigrations(freshUrl);

    const fresh = createDatabase(freshUrl);
    try {
      const tables = await fresh.db.execute<{ table_name: string }>(
        sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
      );
      expect(tables.rows.map((row) => row.table_name)).toEqual([
        'account_claims',
        'auth_accounts',
        'auth_sessions',
        'auth_users',
        'auth_verifications',
        'claim_attempts',
        'linked_accounts',
        'platform_accounts',
        'verification_accounts',
        'verification_checks',
      ]);
    } finally {
      await fresh.close();
    }
  });

  it('refuses a second user whose email differs only in case', async () => {
    const email = `Case_${randomUUID()}@Example.test`;
    await client.db.insert(auth_users).values({ email, name: 'first' });

    const error = await failure(
      client.db.insert(auth_users).values({ email: email.toLowerCase(), name: 'second' }),
    );

    expect(error.constraint).toBe(authUserEmailIndex);
  });

  it('lets Better Auth create a user and find it by email in any case', async () => {
    const { internalAdapter } = await betterAuth(authOptions(client.db)).$context;
    const email = `Auth_${randomUUID()}@Example.test`;

    const created = await internalAdapter.createUser(
      { email, name: 'someone' },
      { method: 'admin' },
    );

    expect(created.email).toBe(email.toLowerCase());
    await expect(internalAdapter.findUserByEmail(email.toUpperCase())).resolves.toMatchObject({
      user: { id: created.id },
    });
  });

  it('gives a user Better Auth creates the default role, unbanned', async () => {
    const { internalAdapter } = await betterAuth(authOptions(client.db)).$context;

    const created = await internalAdapter.createUser(
      { email: `${randomUUID()}@example.test`, name: 'someone' },
      { method: 'admin' },
    );

    await expect(
      db.query.auth_users.findFirst({ where: (users, { eq }) => eq(users.id, created.id) }),
    ).resolves.toMatchObject({ role: 'user', banned: false, banReason: null, banExpires: null });
  });

  it('refuses a platform outside the platform list', async () => {
    const error = await failure(account({ platform: 'myspace' as Platform }));

    expect(error.constraint).toBe('platform_accounts_platform_check');
  });

  it('keeps one row per platform and external id', async () => {
    const externalId = randomUUID();
    await account({ externalId });

    const error = await failure(account({ externalId }));

    expect(error.constraint).toBe(platformAccountIdentity);
  });

  it('lets two accounts share a handle under a non-unique handle index', async () => {
    const handle = `shared_${randomUUID()}`;
    await account({ handle });
    await account({ handle });

    const index = await db.execute<{ unique: boolean }>(
      sql`select indisunique as unique from pg_index where indexrelid = 'platform_accounts_platform_handle_idx'::regclass`,
    );
    expect(index.rows).toEqual([{ unique: false }]);
  });

  it('stores an account before any profile or handle is known', async () => {
    const row = single(
      await db
        .insert(platformAccounts)
        .values({ platform: 'tiktok', externalId: randomUUID() })
        .returning(),
    );

    expect(row).toMatchObject({
      handle: null,
      handleSeenAt: null,
      isPrivate: null,
      profileFetchedAt: null,
      profileSource: null,
    });
  });

  it('indexes claim attempts by claim', async () => {
    const index = await db.execute<{ columns: string }>(
      sql`select pg_get_indexdef('claim_attempts_claim_idx'::regclass) as columns`,
    );

    expect(index.rows[0]?.columns).toContain('(claim_id)');
  });

  it('allows a revoked and an active link to one account, but not two active', async () => {
    const owner = await user();
    const other = await user();
    const target = single(await account());
    const ownerClaim = single(await claim(owner.id, target.id));
    const otherClaim = single(await claim(other.id, target.id));

    await link(owner.id, target.id, ownerClaim.id, 'revoked');
    await link(owner.id, target.id, ownerClaim.id, 'active');
    const error = await failure(link(other.id, target.id, otherClaim.id, 'active'));

    expect(error.constraint).toBe(activeLinkIndex);
  });

  it('allows one open claim per user and account, closed claims and other users aside', async () => {
    const claimant = await user();
    const other = await user();
    const target = single(await account());

    await claim(claimant.id, target.id, 'expired');
    await claim(claimant.id, target.id);
    await claim(other.id, target.id);
    const error = await failure(claim(claimant.id, target.id));

    expect(error.constraint).toBe(openClaimIndex);
  });

  it('refuses updates and deletes on claim attempts', async () => {
    const claimant = await user();
    const target = single(await account());
    const open = single(await claim(claimant.id, target.id));
    const attempt = single(
      await db
        .insert(claimAttempts)
        .values({ claimId: open.id, at: now, outcome: 'not_following' })
        .returning(),
    );

    const update = await failure(
      db.update(claimAttempts).set({ outcome: 'private' }).where(eq(claimAttempts.id, attempt.id)),
    );
    const removal = await failure(db.delete(claimAttempts).where(eq(claimAttempts.id, attempt.id)));

    expect(update.message).toBe('claim_attempts is append-only: UPDATE refused');
    expect(removal.message).toBe('claim_attempts is append-only: DELETE refused');
  });

  it('refuses updates and deletes on verification checks', async () => {
    const row = single(await check());

    const update = await failure(
      db
        .update(verificationChecks)
        .set({ outcome: 'verified' })
        .where(eq(verificationChecks.id, row.id)),
    );
    const removal = await failure(
      db.delete(verificationChecks).where(eq(verificationChecks.id, row.id)),
    );

    expect(update.message).toBe('verification_checks is append-only: UPDATE refused');
    expect(removal.message).toBe('verification_checks is append-only: DELETE refused');
  });

  it('defaults the ids of owned tables to version 7 uuids', async () => {
    const claimant = await user();
    const target = single(await account());
    const open = single(await claim(claimant.id, target.id));
    const logged = single(await check());

    const versions = await db.execute<{ version: number }>(
      sql`select uuid_extract_version(id) as version from (values (${target.id}::uuid), (${open.id}::uuid), (${logged.id}::uuid)) as ids(id)`,
    );

    expect(versions.rows).toEqual([{ version: 7 }, { version: 7 }, { version: 7 }]);
  });
});
