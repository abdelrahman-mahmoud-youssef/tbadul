import { randomUUID } from 'node:crypto';
import { createDatabase, platformAccounts, type DatabaseClient } from '@engagement-exchange/db';
import { providedDatabaseUrl } from '@engagement-exchange/db/testing';
import { accountId } from '@engagement-exchange/verification';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { insertVerificationAccount, uniqueHandle } from '../../testing/database.ts';
import { drizzleVerificationAccountPool } from './drizzle-verification-account-pool.ts';

const databaseUrl = providedDatabaseUrl();

describe.skipIf(databaseUrl === null)('drizzleVerificationAccountPool', () => {
  let client: DatabaseClient;

  beforeAll(() => {
    client = createDatabase(databaseUrl ?? '');
  });

  afterAll(async () => {
    await client.close();
  });

  it('answers the least assigned account first and counts each assignment by id', async () => {
    const pool = drizzleVerificationAccountPool(client.db);
    const busy = await insertVerificationAccount(client.db, uniqueHandle('busy'), 2);
    const idle = await insertVerificationAccount(client.db, uniqueHandle('idle'), 0);
    const used = await insertVerificationAccount(client.db, uniqueHandle('used'), 1);
    const ours = new Set([busy, idle, used].map((candidate) => candidate.handle.value));
    const order = async () =>
      (await pool.candidates('tiktok')).filter((candidate) => ours.has(candidate.handle.value));

    await expect(order()).resolves.toEqual([idle, used, busy]);

    for (let assigned = 0; assigned < 3; assigned++) await pool.recordAssignment(idle.accountId);

    await expect(order()).resolves.toEqual([used, busy, idle]);
  });

  it('adds an account once and lists it with its state and assignments', async () => {
    const pool = drizzleVerificationAccountPool(client.db);
    const account = {
      handle: uniqueHandle('added'),
      accountId: accountId('tiktok', randomUUID()),
    };
    const listed = async () =>
      (await pool.list('tiktok')).find(
        (entry) => entry.accountId.value === account.accountId.value,
      );

    await expect(pool.add(account, Date.now())).resolves.toBe('added');
    await expect(pool.add(account, Date.now())).resolves.toBe('present');
    await pool.recordAssignment(account.accountId);

    await expect(listed()).resolves.toEqual({ ...account, active: true, assignedCount: 1 });
    await expect(pool.candidates('tiktok')).resolves.toContainEqual(account);

    await client.db
      .update(platformAccounts)
      .set({ handle: null, handleSeenAt: null })
      .where(eq(platformAccounts.externalId, account.accountId.value));

    await expect(listed()).resolves.toEqual({
      accountId: account.accountId,
      active: true,
      assignedCount: 1,
    });
  });
});
