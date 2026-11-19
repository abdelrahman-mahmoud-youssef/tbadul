import { readFileSync } from 'node:fs';
import { MockAgent, setGlobalDispatcher, type Interceptable } from 'undici';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { accountId, type AccountId } from '../../domain/account-id.ts';
import { askFollows } from '../../testing/fake-source.ts';
import { context, handle } from '../../testing/fixtures.ts';
import { createHttpClient } from '../http/http-client.ts';
import { tokapiSource } from './tokapi-source.ts';

const host = 'tokapi-mobile-version.p.rapidapi.com';
const origin = `https://${host}`;
const agent = new MockAgent();
agent.disableNetConnect();
setGlobalDispatcher(agent);

afterAll(async () => {
  await agent.close();
});

const rapidApiKey = 'replay-rapidapi-key';
const http = createHttpClient({ headers: () => ({}) });
const source = tokapiSource({ http, rapidApiKey });

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
const khaby = accountId('tiktok', 'MS4wLjABAAAA-placeholder-khaby', '127905465618821121');
const khabySecondPage = '1624209444';

const byIds = {
  kind: 'follows',
  performer: handle('tiktok'),
  performerId: tiktok,
  target: handle('tiktokcreators'),
  targetId: creators,
} as const;

const ofKhaby = {
  kind: 'follows',
  performer: handle('khaby.lame'),
  performerId: khaby,
  target: handle('account_160'),
  targetId: accountId('tiktok', 'MS4wLjABAAAA-placeholder-160', '7000000000000000160'),
} as const;

const withTargetEntry = (entry: Record<string, string>): Fixture => {
  const page = recorded('followings-tiktok.json');
  const body = structuredClone(page.body) as { followings: Record<string, string>[] };
  body.followings = body.followings.map((listed) =>
    listed['sec_uid'] === creatorsSecUid ? { ...listed, ...entry } : listed,
  );
  return { ...page, body };
};

const tiktokPageWith = (fields: Record<string, unknown>): Fixture => {
  const page = recorded('followings-tiktok.json');
  return { ...page, body: { ...(page.body as Record<string, unknown>), ...fields } };
};

describe('tokapiSource', () => {
  let pool: Interceptable;

  beforeEach(() => {
    pool = agent.get(origin);
  });

  const pathWith =
    (performer: AccountId | undefined, query: Record<string, string | null>) => (path: string) => {
      const url = new URL(path, origin);
      return (
        (performer === undefined ||
          url.pathname === `/v1/user/${encodeURIComponent(performer.value)}/followings`) &&
        Object.entries(query).every(([key, value]) => url.searchParams.get(key) === value)
      );
    };

  const listFollowings = (performer: AccountId, reply: Fixture, offset: string | null = null) =>
    pool
      .intercept({
        path: pathWith(performer, { count: '100', offset }),
        method: 'GET',
        headers: { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': host },
      })
      .reply(reply.status, JSON.stringify(reply.body), { headers: reply.headers });

  const anyRequest = { path: pathWith(undefined, {}), method: 'GET' } as const;

  it('answers verified when the target ids are on the recorded first page', async () => {
    listFollowings(tiktok, recorded('followings-tiktok.json'));
    await expect(askFollows(source, byIds, context())).resolves.toEqual({
      outcome: 'verified',
      evidence: { pagesRead: 1, listExhausted: false, entriesRead: 11 },
      cost: request(1),
    });
  });

  it('answers not_following for an entry with the target handle but another account', async () => {
    listFollowings(
      tiktok,
      withTargetEntry({ sec_uid: 'MS4wLjABAAAA-another', uid: '7000000000000099999' }),
    );
    await expect(askFollows(source, byIds, context())).resolves.toEqual({
      outcome: 'not_following',
      evidence: { pagesRead: 1, listExhausted: true, entriesRead: 11 },
      cost: request(1),
    });
  });

  it('answers verified for an entry with a new handle but the target ids', async () => {
    listFollowings(tiktok, withTargetEntry({ unique_id: 'renamed.creators' }));
    await expect(askFollows(source, byIds, context())).resolves.toMatchObject({
      outcome: 'verified',
    });
  });

  it('answers identity_conflict when the entry secUid agrees but its uid differs', async () => {
    listFollowings(tiktok, withTargetEntry({ uid: '7000000000000099999' }));
    await expect(askFollows(source, byIds, context())).resolves.toMatchObject({
      outcome: 'source_error',
      error: { kind: 'identity_conflict' },
    });
  });

  it.each([
    ['without uid', { sec_uid: creatorsSecUid, unique_id: 'tiktokcreators' }],
    ['without sec_uid', { uid: '6551237489917432832', unique_id: 'tiktokcreators' }],
  ])('answers parse, never a handle match, for an entry %s', async (_label, entry) => {
    listFollowings(tiktok, tiktokPageWith({ followings: [entry] }));
    await expect(askFollows(source, byIds, context())).resolves.toMatchObject({
      outcome: 'source_error',
      error: { kind: 'parse', httpStatus: 200 },
      cost: request(1),
    });
  });

  it('follows min_time as offset to the recorded second page', async () => {
    listFollowings(khaby, recorded('followings-khaby-page-1.json'));
    listFollowings(khaby, recorded('followings-khaby-page-2.json'), khabySecondPage);
    await expect(askFollows(source, ofKhaby, context())).resolves.toEqual({
      outcome: 'verified',
      evidence: { pagesRead: 2, listExhausted: false, entriesRead: 82 },
      cost: request(2),
    });
  });

  it('stops at the page cap with listExhausted false', async () => {
    listFollowings(khaby, recorded('followings-khaby-page-1.json'));
    await expect(askFollows(source, ofKhaby, context({ pageCap: 1 }))).resolves.toEqual({
      outcome: 'not_following',
      evidence: { pagesRead: 1, listExhausted: false, entriesRead: 50 },
      cost: request(1),
    });
  });

  it('answers source_error, not not_following, when a later page fails', async () => {
    listFollowings(khaby, recorded('followings-khaby-page-1.json'));
    listFollowings(khaby, raw(500, { message: 'Internal error' }), khabySecondPage);
    await expect(askFollows(source, ofKhaby, context())).resolves.toEqual({
      outcome: 'source_error',
      error: { kind: 'http', message: 'http 500', httpStatus: 500 },
      cost: request(2),
    });
  });

  it('answers private for the recorded hidden following list', async () => {
    listFollowings(tiktok, recorded('followings-hidden.json'));
    await expect(askFollows(source, byIds, context())).resolves.toEqual({
      outcome: 'private',
      cost: request(1),
    });
  });

  it('answers not_found for the recorded missing user', async () => {
    listFollowings(tiktok, recorded('followings-missing.json'));
    await expect(askFollows(source, byIds, context())).resolves.toEqual({
      outcome: 'not_found',
      cost: request(1),
    });
  });

  it('answers unknown_status for an unmapped status_code', async () => {
    listFollowings(tiktok, raw(200, { status_code: 10101, status_msg: 'something else' }));
    await expect(askFollows(source, byIds, context())).resolves.toEqual({
      outcome: 'source_error',
      error: { kind: 'unknown_status', message: 'tokapi status_code 10101', providerStatus: 10101 },
      cost: request(1),
    });
  });

  it.each([
    ['has_more true without min_time', { has_more: true, min_time: undefined }, 'min_time'],
    ['no followings', { followings: undefined }, 'followings'],
    ['no has_more', { has_more: undefined }, 'has_more'],
  ])('answers parse, not not_following, for a page with %s', async (_label, fields, field) => {
    listFollowings(tiktok, tiktokPageWith(fields));
    await expect(askFollows(source, byIds, context())).resolves.toEqual({
      outcome: 'source_error',
      error: { kind: 'parse', message: `tokapi ${field} missing` },
      cost: request(1),
    });
  });

  it('answers parse for a body that is not JSON', async () => {
    pool.intercept(anyRequest).reply(200, '<html>', { headers: json });
    await expect(askFollows(source, byIds, context())).resolves.toEqual({
      outcome: 'source_error',
      error: { kind: 'parse', message: 'body is not JSON', httpStatus: 200 },
      cost: request(1),
    });
  });

  it.each([
    [403, 'auth'],
    [429, 'rate_limited'],
    [404, 'http'],
    [500, 'http'],
  ])('maps http %i to %s', async (status, kind) => {
    listFollowings(tiktok, raw(status, { message: 'x' }));
    await expect(askFollows(source, byIds, context())).resolves.toEqual({
      outcome: 'source_error',
      error: { kind, message: `http ${status}`, httpStatus: status },
      cost: request(1),
    });
  });

  it('answers network when the call fails before a reply', async () => {
    pool.intercept(anyRequest).replyWithError(new Error('socket hang up'));
    await expect(askFollows(source, byIds, context())).resolves.toMatchObject({
      outcome: 'source_error',
      error: { kind: 'network' },
      cost: request(1),
    });
  });

  it('sends both RapidAPI headers and the performer secUid in the path, and keeps the key out of the url', async () => {
    let seen: { headers: unknown; path: string } | undefined;
    pool.intercept(anyRequest).reply(200, (options) => {
      seen = { headers: options.headers, path: options.path };
      return JSON.stringify(recorded('followings-tiktok.json').body);
    });
    await askFollows(source, byIds, context());
    expect(seen?.headers).toMatchObject({ 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': host });
    expect(new URL(seen?.path ?? '', origin).pathname).toBe(`/v1/user/${tiktok.value}/followings`);
    expect(seen?.path).not.toContain(rapidApiKey);
  });

  it('reads by a performer secUid without a numeric id', async () => {
    const secUidOnly = accountId('tiktok', tiktok.value);
    listFollowings(secUidOnly, recorded('followings-tiktok.json'));
    await expect(
      askFollows(source, { ...byIds, performerId: secUidOnly }, context()),
    ).resolves.toMatchObject({ outcome: 'verified' });
  });

  it('answers unsupported without a call or cost when the performer id is unknown', async () => {
    await expect(
      askFollows(
        source,
        { kind: 'follows', performer: byIds.performer, target: byIds.target, targetId: creators },
        context(),
      ),
    ).resolves.toEqual({
      outcome: 'source_error',
      error: {
        kind: 'unsupported',
        message: 'tokapi reads following lists by the performer secUid',
      },
    });
  });

  it('answers private for the recorded following list of a private account', async () => {
    listFollowings(tiktok, recorded('followings-private-account.json'));
    await expect(askFollows(source, byIds, context())).resolves.toEqual({
      outcome: 'private',
      cost: request(1),
    });
  });

  it('supports profile and follows', () => {
    expect([...source.supports].sort()).toEqual(['follows', 'profile']);
  });

  describe('profile', () => {
    const profileCheck = { kind: 'profile', subject: handle('tiktok') } as const;
    const latest = { ...profileCheck, latestPost: true } as const;
    const tiktokPosts = '/v1/post/user/107955/posts';

    const user = (username: string, reply: Fixture) =>
      pool
        .intercept({
          path: (path: string) => {
            const url = new URL(path, origin);
            return url.pathname === '/v1/user/' && url.searchParams.get('username') === username;
          },
          method: 'GET',
          headers: { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': host },
        })
        .reply(reply.status, JSON.stringify(reply.body), { headers: reply.headers });

    const posts = (path: string, reply: Fixture) =>
      pool
        .intercept({
          path: (requested: string) => {
            const url = new URL(requested, origin);
            return url.pathname === path && url.searchParams.get('count') === '10';
          },
          method: 'GET',
        })
        .reply(reply.status, JSON.stringify(reply.body), { headers: reply.headers });

    const postsWith = (change: (list: Record<string, number>[]) => Record<string, number>[]) => {
      const page = recorded('posts-tiktok.json');
      const body = structuredClone(page.body) as { aweme_list: Record<string, number>[] };
      return { ...page, body: { ...body, aweme_list: change(body.aweme_list) } };
    };

    it('reads the recorded profile and the newest post into evidence for two requests', async () => {
      user('tiktok', recorded('user-tiktok.json'));
      posts(tiktokPosts, recorded('posts-tiktok.json'));
      await expect(source.answer(latest, context())).resolves.toEqual({
        outcome: 'verified',
        evidence: {
          accountId: tiktok,
          bio: 'Your next discovery is waiting on TikTok.',
          isPrivate: false,
          followingVisible: true,
          followerCount: 96988597,
          followingCount: 11,
          videoCount: 1613,
          avatarUrl: expect.stringMatching(/^https:\/\/[^?]+$/) as unknown,
          latestPostAt: 1794753620000,
        },
        cost: request(2),
      });
    });

    it('reads no posts and charges one request when the latest post is not asked', async () => {
      user('tiktok', recorded('user-tiktok.json'));
      const answer = await source.answer(profileCheck, context());
      expect(answer).toMatchObject({ outcome: 'verified', cost: request(1) });
      expect(answer.outcome === 'verified' && answer.evidence).not.toHaveProperty('latestPostAt');
    });

    it('takes the newest post that is not pinned', async () => {
      user('tiktok', recorded('user-tiktok.json'));
      posts(
        tiktokPosts,
        postsWith((list) =>
          list.map((post, index) => (index === 0 ? { ...post, is_top: 1 } : post)),
        ),
      );
      await expect(source.answer(latest, context())).resolves.toMatchObject({
        evidence: { latestPostAt: 1794619464000 },
      });
    });

    it.each([
      ['fails', raw(500, { message: 'x' })],
      ['has no posts', recorded('posts-private.json')],
      ['carries another status_code', raw(200, { status_code: 10101, aweme_list: null })],
    ])('keeps the profile without a post time when the posts read %s', async (_label, reply) => {
      user('tiktok', recorded('user-tiktok.json'));
      posts(tiktokPosts, reply);
      const answer = await source.answer(latest, context());
      expect(answer).toMatchObject({ outcome: 'verified', cost: request(2) });
      expect(answer.outcome === 'verified' && answer.evidence).not.toHaveProperty('latestPostAt');
    });

    it('answers followingVisible false for the recorded hidden following list', async () => {
      user('tiktok', recorded('user-following-hidden.json'));
      await expect(source.answer(profileCheck, context())).resolves.toMatchObject({
        outcome: 'verified',
        evidence: { isPrivate: false, followingVisible: false },
      });
    });

    it('answers a private account without reading its posts', async () => {
      user('tiktok', recorded('user-private.json'));
      await expect(source.answer(latest, context())).resolves.toMatchObject({
        outcome: 'verified',
        evidence: { isPrivate: true, accountId: { numericId: '7000000000000000201' } },
        cost: request(1),
      });
    });

    it('leaves following visibility out for an unmapped value', async () => {
      const page = recorded('user-tiktok.json');
      const body = structuredClone(page.body) as { user: Record<string, unknown> };
      body.user['privacy_setting'] = { following_visibility: 7 };
      user('tiktok', { ...page, body });
      const answer = await source.answer(profileCheck, context());
      expect(answer.outcome === 'verified' && answer.evidence).not.toHaveProperty(
        'followingVisible',
      );
    });

    it('answers not_found for the recorded unknown handle', async () => {
      user('zq8v1k0x9m2nope', recorded('user-missing.json'));
      await expect(
        source.answer({ kind: 'profile', subject: handle('zq8v1k0x9m2nope') }, context()),
      ).resolves.toEqual({ outcome: 'not_found', cost: request(1) });
    });

    it.each([
      [
        'a 404 with another body',
        raw(404, { message: 'Not Found' }),
        { kind: 'http', httpStatus: 404 },
      ],
      ['a 403', raw(403, { message: 'x' }), { kind: 'auth', httpStatus: 403 }],
      [
        'an unmapped status_code',
        raw(200, { status_code: 10101 }),
        { kind: 'unknown_status', providerStatus: 10101 },
      ],
      ['status 0 without a user', raw(200, { status_code: 0 }), { kind: 'parse' }],
    ])('answers source_error for %s', async (_label, reply, error) => {
      user('tiktok', reply);
      await expect(source.answer(profileCheck, context())).resolves.toMatchObject({
        outcome: 'source_error',
        error,
        cost: request(1),
      });
    });
  });

  it('forwards the caller signal and propagates an abort', async () => {
    listFollowings(khaby, recorded('followings-khaby-page-1.json')).delay(1000);
    const controller = new AbortController();
    const pending = askFollows(source, ofKhaby, context({ signal: controller.signal }));
    setTimeout(() => {
      controller.abort();
    }, 10);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
