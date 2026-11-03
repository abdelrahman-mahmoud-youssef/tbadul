import { randomUUID } from 'node:crypto';
import { createDatabase, platformAccounts, type DatabaseClient } from '@engagement-exchange/db';
import { providedDatabaseUrl } from '@engagement-exchange/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzleProfileCache } from './adapters/drizzle/drizzle-profile-cache.ts';
import { createVerifier } from './create-verifier.ts';
import { accountId } from './domain/account-id.ts';
import type { ProfileEvidence } from './domain/evidence.ts';
import { fakeSource } from './testing/fake-source.ts';
import { handle, profileEvidence } from './testing/fixtures.ts';
import { manualClock } from './testing/manual-clock.ts';
import { sameOrder } from './testing/orders.ts';
import { recordingSink } from './testing/recording-sink.ts';

const databaseUrl = providedDatabaseUrl();
const hour = 3_600_000;

describe.skipIf(databaseUrl === null)('the profile cache on PostgreSQL', () => {
  let client: DatabaseClient;

  beforeAll(() => {
    client = createDatabase(databaseUrl ?? '');
  });

  afterAll(async () => {
    await client.close();
  });

  const setup = (evidence: ProfileEvidence) => {
    const source = fakeSource('lamatok', {
      profile: { outcome: 'verified', evidence, cost: { unit: 'request', amount: 1 } },
    });
    const clock = manualClock(Date.UTC(2026, 10, 3));
    const sink = recordingSink();
    const cache = drizzleProfileCache(client.db);
    const verifier = createVerifier(
      {
        order: sameOrder(['lamatok']),
        timeoutMs: 1000,
        pageCap: 3,
        cache: { handleTtlMs: 24 * hour, statsTtlMs: 6 * hour },
      },
      { sources: [source], clock, measurements: sink, profileCache: cache },
    );
    return { clock, sink, cache, verifier };
  };

  const fresh = () => ({
    subject: handle(`creator_${randomUUID().slice(0, 8)}`),
    evidence: { ...profileEvidence('a bio'), accountId: accountId('tiktok', randomUUID()) },
  });

  it('pays once for a profile until its stats expire', async () => {
    const { subject, evidence } = fresh();
    const { clock, sink, verifier } = setup(evidence);
    const check = { kind: 'profile', subject } as const;

    await expect(verifier.verify(check)).resolves.toMatchObject({ source: 'lamatok' });
    await expect(verifier.verify(check)).resolves.toMatchObject({ source: 'cache', evidence });
    clock.advance(6 * hour + 1);
    await expect(verifier.verify(check)).resolves.toMatchObject({ source: 'lamatok' });

    expect(sink.attempts.map((attempt) => attempt.source)).toEqual(['lamatok', 'cache', 'lamatok']);
  });

  it('asks the chain for an account stored before its profile and then caches it', async () => {
    const { subject, evidence } = fresh();
    const { clock, sink, cache, verifier } = setup(evidence);
    await client.db.insert(platformAccounts).values({
      platform: 'tiktok',
      externalId: evidence.accountId.value,
      handle: subject.value,
      handleSeenAt: new Date(clock.now()),
    });

    await expect(verifier.verify({ kind: 'profile', subject })).resolves.toMatchObject({
      source: 'lamatok',
    });

    expect(sink.attempts.map((attempt) => attempt.source)).toEqual(['lamatok']);
    await expect(cache.byId(evidence.accountId)).resolves.toEqual({
      handle: subject,
      handleSeenAt: clock.now(),
      evidence,
      fetchedAt: clock.now(),
    });
  });
});
