import { createHmac, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, verificationAccounts, type DatabaseClient } from '@engagement-exchange/db';
import { providedDatabaseUrl } from '@engagement-exchange/db/testing';
import { accountId } from '@engagement-exchange/verification';
import {
  fakeSource,
  listEvidence,
  type FakeSource,
} from '@engagement-exchange/verification/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { inMemory, missingSchema, poolFlagWithDatabase, run, type CliDeps } from './cli.ts';
import { invalidClaimId } from './command.ts';
import { emptyPool } from './pool.ts';
import { invalidUser, unknownUser } from './users.ts';

const databaseUrl = providedDatabaseUrl();
const key = 'cli-key-for-tests';
const cost = { unit: 'request', amount: 1 } as const;
const day = 86_400_000;

const countingSource = (): FakeSource =>
  fakeSource('scraper', {
    profile: (check) =>
      Promise.resolve({
        outcome: 'verified',
        evidence: {
          accountId: accountId('tiktok', `id-${check.subject.value}`),
          bio: '',
          isPrivate: false,
          followingVisible: true,
          likesVisible: true,
          followerCount: 1200,
          followingCount: 10,
          videoCount: 40,
          createdAt: Date.UTC(2020, 0, 1),
          latestPostAt: Date.now() - day,
        },
        cost,
      }),
    follows: { outcome: 'not_following', evidence: listEvidence, cost },
  });

const unique = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

const profileRequests = (source: FakeSource) =>
  source.calls.filter((check) => check.kind === 'profile').length;

let directory: string;

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'cli-'));
});

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

const cli = async (
  argv: string[],
  env: Record<string, string>,
  source: FakeSource = countingSource(),
  deps: Partial<CliDeps> = {},
) => {
  const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    const code = await run(argv, {
      env: {
        VERIFICATION_SOURCE_ORDER: 'scraper',
        MEASUREMENT_HMAC_KEY: key,
        MEASUREMENT_LOG_FILE: join(directory, 'measurements.jsonl'),
        ...env,
      },
      sources: () => new Map([['scraper', source]]),
      ...deps,
    });
    const lines = (calls: unknown[][]) => calls.map((call) => call.join(' '));
    return { code, out: lines(out.mock.calls), err: lines(errors.mock.calls) };
  } finally {
    out.mockRestore();
    errors.mockRestore();
  }
};

describe('the CLI without a database', () => {
  it('runs link start in memory and says nothing persists', async () => {
    const result = await cli(
      ['link', 'start', 'some.creator', '--verification-account', 'verify.one'],
      {},
    );

    expect(result.code).toBe(0);
    expect(result.err).toContain(inMemory);
    expect(result.out).toContainEqual(
      expect.stringMatching(/^follow @verify\.one from @some\.creator, then run link verify /),
    );
  });

  it.each([
    ['user', 'add', 'someone@example.test'],
    ['pool', 'add', 'verify.one'],
    ['pool', 'list'],
  ])('refuses %s %s without DATABASE_URL', async (...argv) => {
    const result = await cli(argv, {});

    expect(result.code).toBe(64);
    expect(result.err).toEqual([`${argv[0]} ${argv[1]} needs DATABASE_URL`]);
  });

  it('refuses a claim id that is not a uuid before anything runs', async () => {
    const source = countingSource();
    const result = await cli(['link', 'verify', "1'; drop table account_claims"], {}, source);

    expect(result.code).toBe(64);
    expect(result.err).toEqual([invalidClaimId]);
    expect(source.calls).toEqual([]);
  });

  it('counts every profile attempt as a cache miss', async () => {
    const result = await cli(['profile', 'some.creator'], {});

    expect(result.out.at(-1)).toBe('profile cache hits 0, misses 1');
  });
});

describe.skipIf(databaseUrl === null)('the CLI on PostgreSQL', () => {
  const url = databaseUrl ?? '';
  const onDatabase = { DATABASE_URL: url };
  let client: DatabaseClient;

  beforeAll(() => {
    client = createDatabase(url);
  });

  afterAll(async () => {
    await client.close();
  });

  const addUser = async (): Promise<string> => {
    const result = await cli(['user', 'add', `${unique('user')}@example.test`], onDatabase);
    const id = /^user (\S+):/.exec(result.out[0] ?? '')?.[1];
    if (id === undefined) throw new Error(result.err.join('; '));
    return id;
  };

  it('prints one line and exits 64 when the migrations have not been applied', async () => {
    const name = `empty_${randomUUID().replaceAll('-', '')}`;
    await client.db.execute(`create database ${name}`);
    const empty = new URL(url);
    empty.pathname = `/${name}`;
    const source = countingSource();

    const result = await cli(
      ['pool', 'add', 'verify.one'],
      { DATABASE_URL: empty.toString() },
      source,
    );

    expect(result).toEqual({ code: 64, out: [], err: [missingSchema] });
    expect(source.calls).toEqual([]);
  });

  it('adds a user once and prints its id', async () => {
    const email = `${unique('Operator')}@Example.test`;

    const first = await cli(['user', 'add', email, '--name', 'Operator'], onDatabase);
    const again = await cli(['user', 'add', email.toLowerCase()], onDatabase);

    const id = /^user (\S+):/.exec(first.out[0] ?? '')?.[1] ?? '';
    expect(first.code).toBe(0);
    await expect(
      client.db.query.auth_users.findFirst({ where: (users, { eq }) => eq(users.id, id) }),
    ).resolves.toMatchObject({ email: email.toLowerCase(), name: 'Operator' });
    expect(again).toMatchObject({ code: 1, err: ['a user with this email already exists'] });
  });

  it('adds a verification account through the profile check and lists it', async () => {
    const handle = unique('verify');

    const added = await cli(['pool', 'add', `@${handle}`], onDatabase);
    const again = await cli(['pool', 'add', handle], onDatabase);
    const listed = await cli(['pool', 'list'], onDatabase);

    expect(added).toMatchObject({ code: 0 });
    expect(added.out).toEqual([
      `@${handle} added to the verification pool`,
      'profile cache hits 0, misses 1',
    ]);
    expect(again.out).toEqual([
      `@${handle} is already in the verification pool`,
      'profile cache hits 1, misses 0',
    ]);
    expect(listed.out).toContain(`@${handle}  active  assigned 0`);
  });

  it('refuses link start for a user id that is not a uuid or names no user', async () => {
    const source = countingSource();

    const local = await cli(['link', 'start', 'some.creator'], onDatabase, source);
    const stranger = await cli(
      ['link', 'start', 'some.creator'],
      { ...onDatabase, CLI_USER_ID: randomUUID() },
      source,
    );

    expect(local).toMatchObject({ code: 64, err: [invalidUser] });
    expect(stranger).toMatchObject({ code: 64, err: [unknownUser] });
    expect(source.calls).toEqual([]);
  });

  it('takes the pool from the database, never from the flag', async () => {
    const user = await addUser();

    const result = await cli(
      ['link', 'start', 'some.creator', '--verification-account', 'verify.one'],
      { ...onDatabase, CLI_USER_ID: user },
    );

    expect(result).toMatchObject({ code: 64, err: [poolFlagWithDatabase] });
  });

  it('refuses a link verify on an unknown uuid as not found', async () => {
    const result = await cli(['link', 'verify', randomUUID()], onDatabase);

    expect(result).toMatchObject({ code: 1, err: ['claim not found'] });
  });

  it('answers a repeated profile from the cache and logs both attempts by hash', async () => {
    const handle = unique('creator');
    const source = countingSource();

    const first = await cli(['profile', handle], onDatabase, source);
    const second = await cli(['profile', handle], onDatabase, source);

    expect(first.out.at(-1)).toBe('profile cache hits 0, misses 1');
    expect(second.out.at(-1)).toBe('profile cache hits 1, misses 0');
    expect(profileRequests(source)).toBe(1);
    const digest = createHmac('sha256', key).update(handle).digest('hex');
    await expect(
      client.db.query.verificationChecks.findMany({
        columns: { source: true, performerHash: true, targetHash: true },
        where: (checks, { eq }) => eq(checks.subjectHash, digest),
        orderBy: (checks, { asc }) => asc(checks.at),
      }),
    ).resolves.toEqual([
      { source: 'scraper', performerHash: null, targetHash: null },
      { source: 'cache', performerHash: null, targetHash: null },
    ]);
  });

  it('says so when the pool is empty', async () => {
    const user = await addUser();
    await client.db.update(verificationAccounts).set({ active: false });
    try {
      const result = await cli(['link', 'start', 'some.creator'], {
        ...onDatabase,
        CLI_USER_ID: user,
      });

      expect(result).toMatchObject({ code: 64, err: [emptyPool] });
    } finally {
      await client.db.update(verificationAccounts).set({ active: true });
    }
  });
});
