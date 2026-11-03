import { createDatabase, type DatabaseClient } from '@engagement-exchange/db';
import { providedDatabaseUrl } from '@engagement-exchange/db/testing';
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

  it('answers the least assigned account first and counts each assignment', async () => {
    const pool = drizzleVerificationAccountPool(client.db);
    const [busy, idle, used] = [uniqueHandle('busy'), uniqueHandle('idle'), uniqueHandle('used')];
    await insertVerificationAccount(client.db, busy, 2);
    await insertVerificationAccount(client.db, idle, 0);
    await insertVerificationAccount(client.db, used, 1);
    const ours = new Set([busy.value, idle.value, used.value]);
    const order = async () =>
      (await pool.candidates('tiktok')).filter((account) => ours.has(account.value));

    await expect(order()).resolves.toEqual([idle, used, busy]);

    for (let assigned = 0; assigned < 3; assigned++) await pool.recordAssignment(idle);

    await expect(order()).resolves.toEqual([used, busy, idle]);
  });
});
