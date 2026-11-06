import { readFileSync } from 'node:fs';
import { MockAgent, setGlobalDispatcher, type Interceptable } from 'undici';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { accountId, type AccountId } from '../../domain/account-id.ts';
import { context, handle } from '../../testing/fixtures.ts';
import { createHttpClient } from '../http/http-client.ts';
import { scraptikSource } from './scraptik-source.ts';

const origin = 'https://scraptik.p.rapidapi.com';
const agent = new MockAgent();
agent.disableNetConnect();
setGlobalDispatcher(agent);

afterAll(async () => {
  await agent.close();
});

const rapidApiKey = 'replay-rapidapi-key';
const http = createHttpClient({ headers: () => ({}) });
const source = scraptikSource({ http, rapidApiKey });

interface Fixture {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

const recorded = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/recorded/${name}`, import.meta.url), 'utf8'),
  ) as Fixture;

const json = { 'content-type': 'application/json' };
const raw = (status: number, body: unknown): Fixture => ({ status, headers: json, body });
const request = (amount: number) => ({ unit: 'request', amount }) as const;

const tiktok = accountId(
  'tiktok',
  'MS4wLjABAAAAv7iSuuXDJGDvJkmH_vz1qkDZYo1apxgzaxdBSeIuPiM',
  '107955',
);
const creatorsSecUid =
  'MS4wLjABAAAAXqqA-cLDC0hfQPIrS5APYNsg04zkl-socWCkqkI3UIOaEe6_Qnokg0GcWpLnMNQP';
const creators = accountId('tiktok', creatorsSecUid, '6551237489917432832');
const creatorsSecondPage = '1766078346';

const byIds = {
  kind: 'follows',
  performer: handle('tiktok'),
  performerId: tiktok,
  target: handle('tiktokcreators'),
  targetId: creators,
} as const;

const ofCreators = {
  kind: 'follows',
  performer: handle('tiktokcreators'),
  performerId: creators,
  target: handle('account_111'),
  targetId: accountId('tiktok', 'MS4wLjABAAAA-placeholder-111', '7000000000000000111'),
} as const;

const withTargetEntry = (entry: Record<string, string>): Fixture => {
  const page = recorded('list-following-tiktok.json');
  const body = structuredClone(page.body) as { followings: Record<string, string>[] };
  body.followings = body.followings.map((listed) =>
    listed['sec_uid'] === creatorsSecUid ? { ...listed, ...entry } : listed,
  );
  return { ...page, body };
};

const tiktokPageWith = (fields: Record<string, unknown>): Fixture => {
  const page = recorded('list-following-tiktok.json');
  return { ...page, body: { ...(page.body as Record<string, unknown>), ...fields } };
};

describe('scraptikSource', () => {
  let pool: Interceptable;

  beforeEach(() => {
    pool = agent.get(origin);
  });

  const pathWith = (query: Record<string, string | null>) => (path: string) => {
    const url = new URL(path, origin);
    return (
      url.pathname === '/list-following' &&
      Object.entries(query).every(([key, value]) => url.searchParams.get(key) === value)
    );
  };

  const listFollowing = (performer: AccountId, reply: Fixture, maxTime: string | null = null) =>
    pool
      .intercept({
        path: pathWith({
          user_id: performer.numericId ?? null,
          sec_user_id: performer.value,
          count: '100',
          max_time: maxTime,
        }),
        method: 'GET',
        headers: { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': 'scraptik.p.rapidapi.com' },
      })
      .reply(reply.status, JSON.stringify(reply.body), { headers: reply.headers });

  it('answers verified when the target ids are on the recorded first page', async () => {
    listFollowing(tiktok, recorded('list-following-tiktok.json'));
    await expect(source.answer(byIds, context())).resolves.toEqual({
      outcome: 'verified',
      evidence: { pagesRead: 1, listExhausted: false, entriesRead: 11 },
      cost: request(1),
    });
  });

  it('answers not_following for an entry with the target handle but another account', async () => {
    listFollowing(
      tiktok,
      withTargetEntry({ sec_uid: 'MS4wLjABAAAA-another', uid: '7000000000000099999' }),
    );
    await expect(source.answer(byIds, context())).resolves.toEqual({
      outcome: 'not_following',
      evidence: { pagesRead: 1, listExhausted: true, entriesRead: 11 },
      cost: request(1),
    });
  });

  it('answers verified for an entry with a new handle but the target ids', async () => {
    listFollowing(tiktok, withTargetEntry({ unique_id: 'renamed.creators' }));
    await expect(source.answer(byIds, context())).resolves.toMatchObject({
      outcome: 'verified',
    });
  });

  it('answers identity_conflict when the entry secUid agrees but its uid differs', async () => {
    listFollowing(tiktok, withTargetEntry({ uid: '7000000000000099999' }));
    await expect(source.answer(byIds, context())).resolves.toMatchObject({
      outcome: 'source_error',
      error: { kind: 'identity_conflict' },
    });
  });

  it.each([
    ['without uid', { sec_uid: creatorsSecUid, unique_id: 'tiktokcreators' }],
    ['without sec_uid', { uid: '6551237489917432832', unique_id: 'tiktokcreators' }],
  ])('answers parse, never a handle match, for an entry %s', async (_label, entry) => {
    listFollowing(tiktok, tiktokPageWith({ followings: [entry] }));
    await expect(source.answer(byIds, context())).resolves.toMatchObject({
      outcome: 'source_error',
      error: { kind: 'parse', httpStatus: 200 },
      cost: request(1),
    });
  });

  it('follows min_time as max_time to the recorded second page', async () => {
    listFollowing(creators, recorded('list-following-creators-page-1.json'));
    listFollowing(creators, recorded('list-following-creators-page-2.json'), creatorsSecondPage);
    await expect(source.answer(ofCreators, context())).resolves.toEqual({
      outcome: 'verified',
      evidence: { pagesRead: 2, listExhausted: false, entriesRead: 200 },
      cost: request(2),
    });
  });

  it('stops at the page cap with listExhausted false', async () => {
    listFollowing(creators, recorded('list-following-creators-page-1.json'));
    await expect(source.answer(ofCreators, context({ pageCap: 1 }))).resolves.toEqual({
      outcome: 'not_following',
      evidence: { pagesRead: 1, listExhausted: false, entriesRead: 100 },
      cost: request(1),
    });
  });

  it('answers source_error, not not_following, when a later page fails', async () => {
    listFollowing(creators, recorded('list-following-creators-page-1.json'));
    listFollowing(creators, raw(500, { message: 'Internal error' }), creatorsSecondPage);
    await expect(source.answer(ofCreators, context())).resolves.toEqual({
      outcome: 'source_error',
      error: { kind: 'http', message: 'http 500', httpStatus: 500 },
      cost: request(2),
    });
  });

  it('answers private for the recorded hidden following list', async () => {
    listFollowing(tiktok, recorded('list-following-hidden.json'));
    await expect(source.answer(byIds, context())).resolves.toEqual({
      outcome: 'private',
      cost: request(1),
    });
  });

  it('answers not_found for the recorded missing user', async () => {
    listFollowing(tiktok, recorded('list-following-missing.json'));
    await expect(source.answer(byIds, context())).resolves.toEqual({
      outcome: 'not_found',
      cost: request(1),
    });
  });

  it('answers unknown_status for an unmapped status_code', async () => {
    listFollowing(tiktok, raw(200, { status_code: 10101, status_msg: 'something else' }));
    await expect(source.answer(byIds, context())).resolves.toEqual({
      outcome: 'source_error',
      error: {
        kind: 'unknown_status',
        message: 'scraptik status_code 10101',
        providerStatus: 10101,
      },
      cost: request(1),
    });
  });

  it.each([
    ['has_more true without min_time', { has_more: true, min_time: undefined }, 'min_time'],
    ['no followings', { followings: undefined }, 'followings'],
    ['no has_more', { has_more: undefined }, 'has_more'],
  ])('answers parse, not not_following, for a page with %s', async (_label, fields, field) => {
    listFollowing(tiktok, tiktokPageWith(fields));
    await expect(source.answer(byIds, context())).resolves.toEqual({
      outcome: 'source_error',
      error: { kind: 'parse', message: `scraptik ${field} missing` },
      cost: request(1),
    });
  });

  it('answers parse for a body that is not JSON', async () => {
    pool.intercept({ path: pathWith({}), method: 'GET' }).reply(200, '<html>', { headers: json });
    await expect(source.answer(byIds, context())).resolves.toEqual({
      outcome: 'source_error',
      error: { kind: 'parse', message: 'body is not JSON', httpStatus: 200 },
      cost: request(1),
    });
  });

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate_limited'],
    [500, 'http'],
    [404, 'http'],
  ])('maps http %i to %s', async (status, kind) => {
    listFollowing(tiktok, raw(status, { message: 'x' }));
    await expect(source.answer(byIds, context())).resolves.toEqual({
      outcome: 'source_error',
      error: { kind, message: `http ${status}`, httpStatus: status },
      cost: request(1),
    });
  });

  it('answers network when the call fails before a reply', async () => {
    pool
      .intercept({ path: pathWith({}), method: 'GET' })
      .replyWithError(new Error('socket hang up'));
    await expect(source.answer(byIds, context())).resolves.toMatchObject({
      outcome: 'source_error',
      error: { kind: 'network' },
      cost: request(1),
    });
  });

  it('sends both RapidAPI headers and both performer ids, and keeps the key out of the url', async () => {
    let seen: { headers: unknown; path: string } | undefined;
    pool.intercept({ path: pathWith({}), method: 'GET' }).reply(200, (options) => {
      seen = { headers: options.headers, path: options.path };
      return JSON.stringify(recorded('list-following-tiktok.json').body);
    });
    await source.answer(byIds, context());
    expect(seen?.headers).toMatchObject({
      'x-rapidapi-key': rapidApiKey,
      'x-rapidapi-host': 'scraptik.p.rapidapi.com',
    });
    const url = new URL(seen?.path ?? '', origin);
    expect(url.searchParams.get('user_id')).toBe('107955');
    expect(url.searchParams.get('sec_user_id')).toBe(tiktok.value);
    expect(seen?.path).not.toContain(rapidApiKey);
  });

  it.each([
    [
      'no performer id',
      {
        kind: 'follows',
        performer: byIds.performer,
        target: byIds.target,
        targetId: creators,
      } as const,
    ],
    [
      'a performer id without a numeric id',
      { ...byIds, performerId: accountId('tiktok', tiktok.value) },
    ],
  ])('answers unsupported without a call or cost for %s', async (_label, check) => {
    await expect(source.answer(check, context())).resolves.toEqual({
      outcome: 'source_error',
      error: {
        kind: 'unsupported',
        message: 'scraptik reads following lists by the performer secUid and numeric id',
      },
    });
  });

  it('supports follows only', () => {
    expect([...source.supports]).toEqual(['follows']);
  });

  it('forwards the caller signal and propagates an abort', async () => {
    listFollowing(creators, recorded('list-following-creators-page-1.json')).delay(1000);
    const controller = new AbortController();
    const pending = source.answer(ofCreators, context({ signal: controller.signal }));
    setTimeout(() => {
      controller.abort();
    }, 10);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
