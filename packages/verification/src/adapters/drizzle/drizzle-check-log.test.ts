import { createHmac, randomUUID } from 'node:crypto';
import { createDatabase, verificationChecks, type DatabaseClient } from '@engagement-exchange/db';
import { providedDatabaseUrl } from '@engagement-exchange/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Attempt } from '../../domain/attempt.ts';
import { content, handle } from '../../testing/fixtures.ts';
import { drizzleCheckLog } from './drizzle-check-log.ts';

const databaseUrl = providedDatabaseUrl();
const key = 'test-hmac-key';
const startedAt = Date.UTC(2026, 10, 3, 12);
const digest = (value: string) => createHmac('sha256', key).update(value).digest('hex');
const uniqueHandle = (prefix: string) => handle(`${prefix}_${randomUUID().slice(0, 8)}`);

const attempt: Attempt = {
  source: 'lamatok',
  platform: 'tiktok',
  check: 'liked',
  outcome: 'source_error',
  error: { kind: 'rate_limited', message: 'slow down', httpStatus: 429 },
  cost: { unit: 'request', amount: 2 },
  startedAt,
  latencyMs: 120,
};

describe.skipIf(databaseUrl === null)('drizzleCheckLog', () => {
  let client: DatabaseClient;

  beforeAll(() => {
    client = createDatabase(databaseUrl ?? '');
  });

  afterAll(async () => {
    await client.close();
  });

  it('stores the attempt with HMAC hashes of its subjects, never a raw handle', async () => {
    const performer = uniqueHandle('performer');
    const video = content('7000000000000000001');

    await drizzleCheckLog(client.db, key).append(attempt, { performer, target: video });

    const rows = await client.db
      .select()
      .from(verificationChecks)
      .where(eq(verificationChecks.performerHash, digest(performer.value)));
    expect(rows).toEqual([
      {
        id: expect.any(String) as unknown,
        at: new Date(startedAt),
        checkKind: 'liked',
        platform: 'tiktok',
        source: 'lamatok',
        outcome: 'source_error',
        errorKind: 'rate_limited',
        latencyMs: 120,
        costUnit: 'request',
        costAmount: '2',
        subjectHash: null,
        performerHash: digest(performer.value),
        targetHash: digest(video.value),
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain(performer.value);
  });

  it('refuses to change or remove a logged check', async () => {
    const subject = uniqueHandle('subject');
    await drizzleCheckLog(client.db, key).append(attempt, { subject });
    const logged = eq(verificationChecks.subjectHash, digest(subject.value));

    await expect(
      client.db.update(verificationChecks).set({ latencyMs: 1 }).where(logged),
    ).rejects.toMatchObject({
      cause: { message: 'verification_checks is append-only: UPDATE refused' },
    });
    await expect(client.db.delete(verificationChecks).where(logged)).rejects.toMatchObject({
      cause: { message: 'verification_checks is append-only: DELETE refused' },
    });
  });
});
