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
});
