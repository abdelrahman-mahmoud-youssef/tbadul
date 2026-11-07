import { randomUUID } from 'node:crypto';
import { createDatabase, type DatabaseClient } from '@engagement-exchange/db';
import { providedDatabaseUrl } from '@engagement-exchange/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Attempt } from '../../domain/attempt.ts';
import type { Cost } from '../../domain/outcome.ts';
import { drizzleCheckLog } from './drizzle-check-log.ts';
import { drizzleSpendLedger } from './drizzle-spend-ledger.ts';

const databaseUrl = providedDatabaseUrl();
const dayStart = Date.UTC(2026, 10, 7);

const attempt = (source: string, startedAt: number, cost?: Cost): Attempt => ({
  source,
  platform: 'tiktok',
  check: 'follows',
  outcome: 'verified',
  ...(cost !== undefined && { cost }),
  startedAt,
  latencyMs: 100,
});

describe.skipIf(databaseUrl === null)('drizzleSpendLedger', () => {
  let client: DatabaseClient;

  beforeAll(() => {
    client = createDatabase(databaseUrl ?? '');
  });

  afterAll(async () => {
    await client.close();
  });

  it('sums the recorded cost of one source in one unit since a time', async () => {
    const source = `budget-${randomUUID().slice(0, 8)}`;
    const log = drizzleCheckLog(client.db, 'test-hmac-key');
    await log.append(attempt(source, dayStart - 1, { unit: 'units', amount: 7 }), {});
    await log.append(attempt(source, dayStart, { unit: 'units', amount: 2 }), {});
    await log.append(attempt(source, dayStart + 60_000, { unit: 'units', amount: 3 }), {});
    await log.append(attempt(source, dayStart + 60_000, { unit: 'request', amount: 5 }), {});
    await log.append(attempt(source, dayStart + 60_000), {});
    await log.append(attempt('other', dayStart + 60_000, { unit: 'units', amount: 11 }), {});

    const ledger = drizzleSpendLedger(client.db);

    await expect(ledger.spentSince(source, 'units', dayStart)).resolves.toBe(5);
    await expect(ledger.spentSince(source, 'request', dayStart)).resolves.toBe(5);
    await expect(ledger.spentSince(`${source}-none`, 'units', dayStart)).resolves.toBe(0);
  });
});
