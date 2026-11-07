import { readFileSync } from 'node:fs';
import { MockAgent, setGlobalDispatcher, type Interceptable } from 'undici';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { accountId } from '../../domain/account-id.ts';
import { askFollows } from '../../testing/fake-source.ts';
import { content, context, handle } from '../../testing/fixtures.ts';
import { createHttpClient } from '../http/http-client.ts';
import { lamatokSource } from './lamatok-source.ts';

const origin = 'https://api.lamatok.com';
const agent = new MockAgent();
agent.disableNetConnect();
setGlobalDispatcher(agent);

afterAll(async () => {
  await agent.close();
});

const accessKey = 'replay-access-key';
const http = createHttpClient({ headers: () => ({}) });
const source = lamatokSource({ http, accessKey });

const synthetic = (name: string) =>
  readFileSync(new URL(`./fixtures/synthetic/${name}`, import.meta.url), 'utf8');

interface Recorded {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

const recorded = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/recorded/${name}`, import.meta.url), 'utf8'),
  ) as Recorded;

const performer = handle('tiktok');
const target = handle('tiktokcreators');
const tiktokSecUid = 'MS4wLjABAAAAv7iSuuXDJGDvJkmH_vz1qkDZYo1apxgzaxdBSeIuPiM';
const performerId = accountId('tiktok', tiktokSecUid);
const targetSecUid = 'MS4wLjABAAAAXqqA-cLDC0hfQPIrS5APYNsg04zkl-socWCkqkI3UIOaEe6_Qnokg0GcWpLnMNQP';
const request = (amount: number) => ({ unit: 'request', amount }) as const;
const json = { 'content-type': 'application/json' };

const publicProfileWith = (user: Record<string, unknown>) => {
  const body = JSON.parse(synthetic('profile-public.json')) as {
    userInfo: { user: Record<string, unknown> };
  };
  body.userInfo.user = { ...body.userInfo.user, ...user };
  return JSON.stringify(body);
};

const targetEntryWith = (user: Record<string, unknown>) => {
  const page = JSON.parse(synthetic('following-target-present.json')) as {
    userList: { user: Record<string, unknown> }[];
  };
  return JSON.stringify({
    ...page,
    userList: page.userList.map((entry) =>
      entry.user['secUid'] === targetSecUid ? { user: { ...entry.user, ...user } } : entry,
    ),
  });
};

describe('lamatokSource', () => {
  let pool: Interceptable;

  beforeEach(() => {
    pool = agent.get(origin);
  });

  const pathWith =
    (pathname: string, query: Record<string, string | null> = {}) =>
    (path: string) => {
      const url = new URL(path, origin);
      return (
        url.pathname === pathname &&
        Object.entries(query).every(([key, value]) => url.searchParams.get(key) === value)
      );
    };

  const replay = (
    pathname: string,
    query: Record<string, string | null>,
    status: number,
    body: string,
  ) =>
    pool
      .intercept({
        path: pathWith(pathname, query),
        method: 'GET',
        headers: { 'x-access-key': accessKey },
      })
      .reply(status, body, { headers: json });

  const replayRecorded = (pathname: string, name: string) => {
    const { status, headers, body } = recorded(name);
    return pool
      .intercept({ path: pathWith(pathname), method: 'GET' })
      .reply(status, JSON.stringify(body), { headers });
  };

  const profile = (body: string, status = 200, username = 'tiktok') =>
    replay('/v1/user/by/username', { username }, status, body);

  const followingByName = (body: string, query: Record<string, string | null> = {}) =>
    replay(
      '/v1/user/following/by/username',
      { username: 'tiktok', count: '30', ...query },
      200,
      body,
    );

  const followingById = (body: string, query: Record<string, string | null> = {}, status = 200) =>
    replay(
      '/v1/user/following/by/secUid',
      { secUid: tiktokSecUid, count: '30', ...query },
      status,
      body,
    );

  const likes = (body: string, query: Record<string, string | null> = {}, status = 200) =>
    replay(
      '/v2/user/likes/by/secUid',
      { secUid: tiktokSecUid, count: '30', ...query },
      status,
      body,
    );

  const profileCheck = { kind: 'profile', subject: performer } as const;

  describe('profile', () => {
    it('reads a public profile into evidence', async () => {
      profile(synthetic('profile-public.json'));
      await expect(source.answer(profileCheck, context())).resolves.toEqual({
        outcome: 'verified',
        evidence: {
          accountId: { platform: 'tiktok', value: tiktokSecUid },
          bio: 'Your next discovery is waiting on TikTok.',
          isPrivate: false,
          followingVisible: true,
          likesVisible: false,
          followerCount: 96530997,
          followingCount: 3,
          videoCount: 1516,
          avatarUrl:
            'https://p16-common-sign.tiktokcdn.com/tos-maliva-avt-0068/ba67b11de451691939223e9d978e613a~tplv-tiktokx-cropcenter:100:100.jpeg',
          createdAt: 1425144149000,
        },
        cost: request(1),
      });
    });

    it('reads a private profile as verified with isPrivate true', async () => {
      profile(synthetic('profile-private.json'), 200, 'tiktokcreators');
      await expect(
        source.answer({ kind: 'profile', subject: target }, context()),
      ).resolves.toMatchObject({
        outcome: 'verified',
        evidence: { isPrivate: true, followingVisible: false, likesVisible: false },
        cost: request(1),
      });
    });

    it('leaves optional evidence out when the profile does not carry it', async () => {
      profile(
        JSON.stringify({
          userInfo: { user: { secUid: tiktokSecUid, signature: '', privateAccount: false } },
        }),
      );
      await expect(source.answer(profileCheck, context())).resolves.toEqual({
        outcome: 'verified',
        evidence: { accountId: performerId, bio: '', isPrivate: false },
        cost: request(1),
      });
    });

    it('answers not_found for a 404', async () => {
      profile('{"detail":"Not found"}', 404);
      await expect(source.answer(profileCheck, context())).resolves.toEqual({
        outcome: 'not_found',
        cost: request(1),
      });
    });

    it('answers source_error for a 404 that marks the profile unavailable', async () => {
      profile('{"state":false,"exc_type":"ProfileUnavailable"}', 404);
      await expect(source.answer(profileCheck, context())).resolves.toEqual({
        outcome: 'source_error',
        error: { kind: 'http', message: 'lamatok 404: profile unavailable', httpStatus: 404 },
        cost: request(1),
      });
    });

    it('maps the recorded 402 to an http error naming insufficient funds', async () => {
      replayRecorded('/v1/user/by/username', 'insufficient-funds.json');
      await expect(source.answer(profileCheck, context())).resolves.toEqual({
        outcome: 'source_error',
        error: { kind: 'http', message: 'lamatok 402: insufficient funds', httpStatus: 402 },
        cost: request(1),
      });
    });

    it('maps the recorded 401 to an auth error', async () => {
      replayRecorded('/v1/user/by/username', 'unauthorized.json');
      await expect(source.answer(profileCheck, context())).resolves.toEqual({
        outcome: 'source_error',
        error: { kind: 'auth', message: 'http 401', httpStatus: 401 },
        cost: request(1),
      });
    });

    it.each([
      [403, 'auth'],
      [422, 'http'],
      [429, 'rate_limited'],
      [500, 'http'],
      [503, 'http'],
      [418, 'http'],
    ])('maps http %i to source_error %s', async (status, kind) => {
      profile('{"state":false}', status);
      await expect(source.answer(profileCheck, context())).resolves.toEqual({
        outcome: 'source_error',
        error: { kind, message: `http ${status}`, httpStatus: status },
        cost: request(1),
      });
    });

    it.each([
      ['a body that is not JSON', '<html>'],
      ['a JSON body of an unknown shape', '{"data":{"user":{}}}'],
    ])('answers parse for %s', async (_label, body) => {
      profile(body);
      await expect(source.answer(profileCheck, context())).resolves.toMatchObject({
        outcome: 'source_error',
        error: { kind: 'parse', httpStatus: 200 },
        cost: request(1),
      });
    });

    it('answers network when the call fails before a reply', async () => {
      pool
        .intercept({ path: pathWith('/v1/user/by/username'), method: 'GET' })
        .replyWithError(new Error('socket hang up'));
      await expect(source.answer(profileCheck, context())).resolves.toMatchObject({
        outcome: 'source_error',
        error: { kind: 'network' },
        cost: request(1),
      });
    });

    it('sends the access key in the x-access-key header and nowhere else', async () => {
      let seen: { headers: unknown; path: string } | undefined;
      pool
        .intercept({ path: pathWith('/v1/user/by/username'), method: 'GET' })
        .reply(200, (options) => {
          seen = { headers: options.headers, path: options.path };
          return synthetic('profile-public.json');
        });
      await source.answer(profileCheck, context());
      expect(seen?.headers).toMatchObject({ 'x-access-key': accessKey });
      expect(seen?.path).not.toContain(accessKey);
    });

    it('fails to match a reply that requires a different key', async () => {
      const other = lamatokSource({ http, accessKey: 'other-key' });
      profile(synthetic('profile-public.json'));
      await expect(other.answer(profileCheck, context())).resolves.toMatchObject({
        outcome: 'source_error',
        error: { kind: 'network' },
      });
      await expect(source.answer(profileCheck, context())).resolves.toMatchObject({
        outcome: 'verified',
      });
    });
  });

  describe('follows', () => {
    const check = {
      kind: 'follows',
      performer,
      target,
      targetId: accountId('tiktok', targetSecUid),
    } as const;
    const byId = { ...check, performerId } as const;

    it('answers not_following for an entry with the target handle but another account id', async () => {
      followingById(targetEntryWith({ secUid: 'MS4wLjABAAAA-another-account' }));
      await expect(askFollows(source, byId, context())).resolves.toEqual({
        outcome: 'not_following',
        evidence: { pagesRead: 1, listExhausted: true, entriesRead: 2 },
        cost: request(1),
      });
    });

    it('answers verified for an entry with a new handle but the target account id', async () => {
      followingById(targetEntryWith({ uniqueId: 'renamed.creators' }));
      await expect(askFollows(source, byId, context())).resolves.toEqual({
        outcome: 'verified',
        evidence: { pagesRead: 1, listExhausted: false, entriesRead: 2 },
        cost: request(1),
      });
    });

    it('answers parse, never a handle match, for entries without an account id', async () => {
      followingById(targetEntryWith({ secUid: undefined }));
      await expect(askFollows(source, byId, context())).resolves.toMatchObject({
        outcome: 'source_error',
        error: { kind: 'parse' },
        cost: request(1),
      });
    });

    it('reads the list by secUid when the check carries the performer id', async () => {
      followingById(synthetic('following-target-present.json'), { page_id: null });
      await expect(askFollows(source, byId, context())).resolves.toEqual({
        outcome: 'verified',
        evidence: { pagesRead: 1, listExhausted: false, entriesRead: 2 },
        cost: request(1),
      });
    });

    it('reads the list by username when the check has no performer id', async () => {
      followingByName(synthetic('following-target-present.json'), { page_id: null });
      await expect(askFollows(source, check, context())).resolves.toEqual({
        outcome: 'verified',
        evidence: { pagesRead: 1, listExhausted: false, entriesRead: 2 },
        cost: request(1),
      });
    });

    it('follows next_page_id to a later page', async () => {
      followingById(synthetic('following-absent-more.json'), { page_id: null });
      followingById(synthetic('following-target-present.json'), { page_id: '1617300091' });
      await expect(askFollows(source, byId, context({ pageCap: 3 }))).resolves.toEqual({
        outcome: 'verified',
        evidence: { pagesRead: 2, listExhausted: false, entriesRead: 4 },
        cost: request(2),
      });
    });

    it('answers not_following when the last page ends without the target', async () => {
      followingByName(synthetic('following-absent-more.json'), { page_id: null });
      followingByName(synthetic('following-last-page.json'), { page_id: '1617300091' });
      await expect(askFollows(source, check, context({ pageCap: 3 }))).resolves.toEqual({
        outcome: 'not_following',
        evidence: { pagesRead: 2, listExhausted: true, entriesRead: 3 },
        cost: request(2),
      });
    });

    it('stops at the page cap with listExhausted false', async () => {
      followingById(synthetic('following-absent-more.json'));
      await expect(askFollows(source, byId, context({ pageCap: 1 }))).resolves.toEqual({
        outcome: 'not_following',
        evidence: { pagesRead: 1, listExhausted: false, entriesRead: 2 },
        cost: request(1),
      });
    });

    it('answers private for a hidden following list', async () => {
      followingById(synthetic('following-hidden.json'));
      await expect(askFollows(source, byId, context())).resolves.toEqual({
        outcome: 'private',
        cost: request(1),
      });
    });

    it('answers not_found for a 404 on the list', async () => {
      followingById('{"detail":"Not found"}', {}, 404);
      await expect(askFollows(source, byId, context())).resolves.toEqual({
        outcome: 'not_found',
        cost: request(1),
      });
    });

    it.each([
      [
        'an unknown status code',
        '{"statusCode":12345}',
        { kind: 'unknown_status', providerStatus: 12345 },
      ],
      ['a page without userList', '{"statusCode":0,"next_page_id":null}', { kind: 'parse' }],
      ['a body without statusCode', '{"users":[],"next_page_id":null}', { kind: 'parse' }],
      [
        'a page without next_page_id',
        '{"statusCode":0,"userList":[],"hasMore":true,"minCursor":"5"}',
        { kind: 'parse', message: 'lamatok next_page_id missing' },
      ],
      ['a body that is not JSON', '<html>', { kind: 'parse' }],
    ])('answers source_error for %s', async (_label, body, error) => {
      followingById(body);
      await expect(askFollows(source, byId, context())).resolves.toMatchObject({
        outcome: 'source_error',
        error,
        cost: request(1),
      });
    });

    it('answers source_error, not not_following, when a later page fails', async () => {
      followingById(synthetic('following-absent-more.json'), { page_id: null });
      followingById('', { page_id: '1617300091' }, 500);
      await expect(askFollows(source, byId, context({ pageCap: 3 }))).resolves.toEqual({
        outcome: 'source_error',
        error: { kind: 'http', message: 'http 500', httpStatus: 500 },
        cost: request(2),
      });
    });

    it('maps the recorded 402 on a list to an http error', async () => {
      replayRecorded('/v1/user/following/by/secUid', 'insufficient-funds.json');
      await expect(askFollows(source, byId, context())).resolves.toMatchObject({
        outcome: 'source_error',
        error: { kind: 'http', httpStatus: 402 },
        cost: request(1),
      });
    });

    it('forwards the caller signal and propagates an abort', async () => {
      followingById(synthetic('following-target-present.json')).delay(1000);
      const controller = new AbortController();
      const pending = askFollows(source, byId, context({ signal: controller.signal }));
      setTimeout(() => {
        controller.abort();
      }, 10);
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    });
  });

  describe('liked', () => {
    const video = content('7000000000000000001');
    const check = { kind: 'liked', performer, content: video } as const;
    const byId = { ...check, performerId } as const;

    it('reads the likes by secUid without a profile call when the id is known', async () => {
      likes(synthetic('likes-page.json'), { cursor: null });
      await expect(source.answer(byId, context())).resolves.toEqual({
        outcome: 'verified',
        evidence: { pagesRead: 1, listExhausted: false, entriesRead: 2 },
        cost: request(1),
      });
    });

    it('resolves the secUid through the profile when the id is not known', async () => {
      profile(publicProfileWith({ openFavorite: true }));
      likes(synthetic('likes-page.json'), { cursor: null });
      await expect(source.answer(check, context())).resolves.toEqual({
        outcome: 'verified',
        evidence: { pagesRead: 1, listExhausted: false, entriesRead: 2 },
        cost: request(2),
      });
    });

    it('answers private from the profile when likes are hidden', async () => {
      profile(synthetic('profile-public.json'));
      await expect(source.answer(check, context())).resolves.toEqual({
        outcome: 'private',
        cost: request(1),
      });
    });

    it('answers not_found when the profile is not found', async () => {
      profile('{"detail":"Not found"}', 404);
      await expect(source.answer(check, context())).resolves.toEqual({
        outcome: 'not_found',
        cost: request(1),
      });
    });

    it('answers private when the likes endpoint withholds the list', async () => {
      likes(synthetic('likes-hidden.json'));
      await expect(source.answer(byId, context())).resolves.toEqual({
        outcome: 'private',
        cost: request(1),
      });
    });

    it('follows the cursor and answers not_following at the end of the list', async () => {
      likes(synthetic('likes-page.json'), { cursor: null });
      likes('{"statusCode":0,"itemList":[{"id":"7000000000000000003"}],"hasMore":false}', {
        cursor: '1790889878000',
      });
      await expect(
        source.answer({ ...byId, content: content('7000000000000000009') }, context()),
      ).resolves.toEqual({
        outcome: 'not_following',
        evidence: { pagesRead: 2, listExhausted: true, entriesRead: 3 },
        cost: request(2),
      });
    });

    it.each([
      ['a page without itemList that does not say more', '{"statusCode":0,"hasMore":false}'],
      ['a page without hasMore', '{"statusCode":0,"itemList":[],"has_more":1,"max_cursor":5}'],
      ['a page with more items but no cursor', '{"statusCode":0,"itemList":[],"hasMore":true}'],
      ['a body that is not JSON', 'not json'],
    ])('answers parse for %s', async (_label, body) => {
      likes(body);
      await expect(source.answer(byId, context())).resolves.toMatchObject({
        outcome: 'source_error',
        error: { kind: 'parse' },
        cost: request(1),
      });
    });

    it('answers unknown_status for an unknown status code', async () => {
      likes('{"statusCode":10222}');
      await expect(source.answer(byId, context())).resolves.toMatchObject({
        outcome: 'source_error',
        error: { kind: 'unknown_status', providerStatus: 10222 },
      });
    });
  });
});
