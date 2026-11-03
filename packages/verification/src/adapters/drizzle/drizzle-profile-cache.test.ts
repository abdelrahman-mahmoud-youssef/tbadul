import { randomUUID } from 'node:crypto';
import { createDatabase, platformAccounts, type DatabaseClient } from '@engagement-exchange/db';
import { providedDatabaseUrl } from '@engagement-exchange/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountId } from '../../domain/account-id.ts';
import type { ProfileEvidence } from '../../domain/evidence.ts';
import type { ProfileCache } from '../../ports/profile-cache.ts';
import { handle } from '../../testing/fixtures.ts';
import { drizzleProfileCache } from './drizzle-profile-cache.ts';

const databaseUrl = providedDatabaseUrl();
const fetchedAt = Date.UTC(2026, 10, 3, 12);

const uniqueHandle = (prefix: string) => handle(`${prefix}_${randomUUID().slice(0, 8)}`);

const minimal = (): ProfileEvidence => ({
  accountId: accountId('tiktok', randomUUID()),
  bio: '',
  isPrivate: true,
});

const full = (): ProfileEvidence => ({
  accountId: accountId('tiktok', randomUUID()),
  bio: 'a creator',
  isPrivate: false,
  followingVisible: true,
  likesVisible: false,
  followerCount: 1200,
  followingCount: 300,
  videoCount: 40,
  avatarUrl: 'https://cdn.example/avatar.jpeg',
  createdAt: Date.UTC(2020, 0, 1),
  latestPostAt: Date.UTC(2026, 9, 1),
});

describe.skipIf(databaseUrl === null)('drizzleProfileCache', () => {
  let client: DatabaseClient;
  let cache: ProfileCache;

  beforeAll(() => {
    client = createDatabase(databaseUrl ?? '');
    cache = drizzleProfileCache(client.db);
  });

  afterAll(async () => {
    await client.close();
  });

  it.each([
    ['every field', full],
    ['only the required fields', minimal],
  ])('reads back a profile with %s unchanged', async (_name, evidenceOf) => {
    const evidence = evidenceOf();
    const subject = uniqueHandle('creator');

    await cache.store({ handle: subject, evidence, source: 'lamatok', fetchedAt });

    await expect(cache.byId(evidence.accountId)).resolves.toEqual({
      handle: subject,
      handleSeenAt: fetchedAt,
      evidence,
      fetchedAt,
    });
  });

  it('finds a profile by its handle whatever the case', async () => {
    const evidence = full();
    const subject = uniqueHandle('creator');
    await cache.store({ handle: subject, evidence, source: 'lamatok', fetchedAt });

    await expect(cache.byHandle(handle(subject.value.toUpperCase()))).resolves.toEqual([
      { handle: subject, handleSeenAt: fetchedAt, evidence, fetchedAt },
    ]);
  });

  it('overwrites the stored profile of the same account', async () => {
    const evidence = full();
    const subject = uniqueHandle('creator');
    await cache.store({ handle: subject, evidence, source: 'lamatok', fetchedAt });
    const fresher = { ...minimal(), accountId: evidence.accountId };

    await cache.store({
      handle: subject,
      evidence: fresher,
      source: 'scraper',
      fetchedAt: fetchedAt + 1,
    });

    await expect(cache.byId(evidence.accountId)).resolves.toMatchObject({
      evidence: fresher,
      fetchedAt: fetchedAt + 1,
    });
  });

  it('clears a handle from the old account when a new account id carries it', async () => {
    const subject = uniqueHandle('moved');
    const before = full();
    const after = full();
    await cache.store({ handle: subject, evidence: before, source: 'lamatok', fetchedAt });

    await cache.store({
      handle: handle(subject.value.toUpperCase()),
      evidence: after,
      source: 'lamatok',
      fetchedAt: fetchedAt + 1,
    });

    await expect(cache.byId(before.accountId)).resolves.toMatchObject({
      handle: null,
      handleSeenAt: null,
      evidence: before,
    });
    await expect(cache.byHandle(subject)).resolves.toMatchObject([{ evidence: after }]);
  });

  it('answers an account stored without a profile as never fetched', async () => {
    const subject = uniqueHandle('stub');
    const external = randomUUID();
    await client.db.insert(platformAccounts).values({
      platform: 'tiktok',
      externalId: external,
      handle: subject.value,
      handleSeenAt: new Date(fetchedAt),
    });

    await expect(cache.byId(accountId('tiktok', external))).resolves.toEqual({
      handle: subject,
      handleSeenAt: fetchedAt,
      fetchedAt: null,
    });
    await expect(cache.byId(accountId('tiktok', randomUUID()))).resolves.toBeUndefined();
  });
});
