import { readFileSync } from 'node:fs';
import { MockAgent, setGlobalDispatcher, type Interceptable } from 'undici';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { accountId } from '../../domain/account-id.ts';
import { err, ok } from '../../domain/result.ts';
import type { RequestSigner } from '../../ports/request-signer.ts';
import { askFollows } from '../../testing/fake-source.ts';
import { content, context, handle } from '../../testing/fixtures.ts';
import { createHttpClient } from '../http/http-client.ts';
import { scraperSource } from './scraper-source.ts';

const web = 'https://www.tiktok.com';
const agent = new MockAgent();
agent.disableNetConnect();
setGlobalDispatcher(agent);

afterAll(async () => {
  await agent.close();
});

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const signedHeaders = { 'user-agent': 'ua', cookie: 'msToken=m' };
const passThroughSigner: RequestSigner = {
  sign: (url) => Promise.resolve(ok({ url, headers: signedHeaders })),
};
const source = scraperSource({
  http: createHttpClient({ headers: () => ({}) }),
  signer: passThroughSigner,
});

const performer = handle('tiktok');
const target = handle('tiktokcreators');
const profileSecUid = 'MS4wLjABAAAAv7iSuuXDJGDvJkmH_vz1qkDZYo1apxgzaxdBSeIuPiM';
const targetSecUid = 'MS4wLjABAAAAXqqA-cLDC0hfQPIrS5APYNsg04zkl-socWCkqkI3UIOaEe6_Qnokg0GcWpLnMNQP';

const profilePage = (user: Record<string, unknown>) =>
  `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">${JSON.stringify({
    __DEFAULT_SCOPE__: {
      'webapp.user-detail': {
        statusCode: 0,
        userInfo: {
          user: {
            id: '1',
            secUid: profileSecUid,
            uniqueId: 'tiktok',
            signature: 'bio',
            privateAccount: false,
            followingVisibility: 1,
            openFavorite: true,
            ...user,
          },
        },
      },
    },
  })}</script>`;

const listPage = (page: Record<string, unknown>) =>
  JSON.stringify({ statusCode: 0, status_code: 0, status_msg: '', ...page });

const recordedListWith = (user: Record<string, unknown>) => {
  const page = JSON.parse(fixture('following-page-exhausted.json')) as {
    userList: { user: Record<string, unknown> }[];
  };
  return JSON.stringify({
    ...page,
    userList: page.userList.map((entry) => ({ user: { ...entry.user, ...user } })),
  });
};

describe('scraperSource', () => {
  let pool: Interceptable;

  beforeEach(() => {
    pool = agent.get(web);
  });

  const profile = (body: string, status = 200) =>
    pool
      .intercept({ path: '/@tiktok', method: 'GET', headers: signedHeaders })
      .reply(status, body, { headers: { 'content-type': 'text/html' } });

  const pathWith =
    (prefix: string, query: Record<string, string> = {}) =>
    (path: string) =>
      path.startsWith(prefix) &&
      Object.entries(query).every(
        ([key, value]) => new URL(path, web).searchParams.get(key) === value,
      );

  const following = (body: string, query?: Record<string, string>) =>
    pool
      .intercept({
        path: pathWith('/api/user/list/', query),
        method: 'GET',
        headers: signedHeaders,
      })
      .reply(200, body, { headers: { 'content-type': 'application/json' } });

  const liked = (body: string) =>
    pool
      .intercept({
        path: pathWith('/api/favorite/item_list/'),
        method: 'GET',
        headers: signedHeaders,
      })
      .reply(200, body, { headers: { 'content-type': 'application/json' } });

  describe('profile', () => {
    it('reads a public profile into evidence', async () => {
      profile(fixture('profile-public.html'));
      await expect(
        source.answer({ kind: 'profile', subject: performer }, context()),
      ).resolves.toEqual({
        outcome: 'verified',
        evidence: {
          accountId: { platform: 'tiktok', value: profileSecUid, numericId: '107955' },
          bio: 'Your next discovery is waiting on TikTok.',
          isPrivate: false,
          followingVisible: true,
          likesVisible: false,
          followerCount: 96530997,
          followingCount: 1,
          videoCount: 1516,
          avatarUrl:
            'https://p16-common-sign.tiktokcdn.com/tos-maliva-avt-0068/ba67b11de451691939223e9d978e613a~tplv-tiktokx-cropcenter:100:100.jpeg',
          createdAt: 1425144149000,
        },
        cost: { unit: 'request', amount: 1 },
      });
    });

    it('answers not_found for a missing profile', async () => {
      profile(fixture('profile-missing.html'));
      await expect(
        source.answer({ kind: 'profile', subject: performer }, context()),
      ).resolves.toEqual({ outcome: 'not_found', cost: { unit: 'request', amount: 1 } });
    });

    it('answers blocked for a challenge page', async () => {
      profile('<html><body>Please wait...</body></html>');
      await expect(
        source.answer({ kind: 'profile', subject: performer }, context()),
      ).resolves.toMatchObject({ outcome: 'source_error', error: { kind: 'blocked' } });
    });

    it.each([
      [404, 'not_found', undefined],
      [429, 'source_error', 'rate_limited'],
      [500, 'source_error', 'http'],
    ])('maps http %i to %s', async (status, outcome, kind) => {
      profile('', status);
      const answer = await source.answer({ kind: 'profile', subject: performer }, context());
      expect(answer.outcome).toBe(outcome);
      if (answer.outcome === 'source_error') expect(answer.error.kind).toBe(kind);
    });
  });

  describe('follows', () => {
    const check = {
      kind: 'follows',
      performer,
      target,
      targetId: accountId('tiktok', targetSecUid),
    } as const;
    const byId = { ...check, performerId: accountId('tiktok', profileSecUid) } as const;

    it('answers verified when the target is on the first page', async () => {
      profile(fixture('profile-public.html'));
      following(fixture('following-page-exhausted.json'));
      await expect(askFollows(source, check, context())).resolves.toEqual({
        outcome: 'verified',
        evidence: { pagesRead: 1, listExhausted: false, entriesRead: 1 },
        cost: { unit: 'request', amount: 2 },
      });
    });

    it('skips the profile page when the performer id is known', async () => {
      let signed = 0;
      const countingSigner: RequestSigner = {
        sign: (url) => {
          signed += 1;
          return Promise.resolve(ok({ url, headers: signedHeaders }));
        },
      };
      const direct = scraperSource({
        http: createHttpClient({ headers: () => ({}) }),
        signer: countingSigner,
      });
      following(fixture('following-page-exhausted.json'), { secUid: profileSecUid });
      await expect(askFollows(direct, byId, context())).resolves.toEqual({
        outcome: 'verified',
        evidence: { pagesRead: 1, listExhausted: false, entriesRead: 1 },
        cost: { unit: 'request', amount: 1 },
      });
      expect(signed).toBe(1);
    });

    it('answers private from the list status when the performer id is known', async () => {
      following(fixture('following-hidden.json'));
      await expect(askFollows(source, byId, context())).resolves.toEqual({
        outcome: 'private',
        cost: { unit: 'request', amount: 1 },
      });
    });

    it('answers not_following when the list ends without the target', async () => {
      profile(fixture('profile-public.html'));
      following(
        listPage({ userList: [{ user: { uniqueId: 'other', secUid: 's' } }], hasMore: false }),
      );
      await expect(askFollows(source, check, context())).resolves.toEqual({
        outcome: 'not_following',
        evidence: { pagesRead: 1, listExhausted: true, entriesRead: 1 },
        cost: { unit: 'request', amount: 2 },
      });
    });

    it('answers not_following for an entry with the target handle but another account id', async () => {
      following(recordedListWith({ secUid: 'MS4wLjABAAAA-another-account' }));
      await expect(askFollows(source, byId, context())).resolves.toEqual({
        outcome: 'not_following',
        evidence: { pagesRead: 1, listExhausted: true, entriesRead: 1 },
        cost: { unit: 'request', amount: 1 },
      });
    });

    it('answers parse, never a handle match, for entries without an account id', async () => {
      following(recordedListWith({ secUid: undefined }));
      await expect(askFollows(source, byId, context())).resolves.toMatchObject({
        outcome: 'source_error',
        error: { kind: 'parse' },
        cost: { unit: 'request', amount: 1 },
      });
    });

    it('matches by uid as well when the target carries its numeric id', async () => {
      following(recordedListWith({ uniqueId: 'renamed.creators' }));
      await expect(
        askFollows(
          source,
          { ...byId, targetId: accountId('tiktok', targetSecUid, '6551237489917432832') },
          context(),
        ),
      ).resolves.toMatchObject({ outcome: 'verified' });
    });

    it('answers identity_conflict when the entry secUid agrees but its uid differs', async () => {
      following(recordedListWith({}));
      await expect(
        askFollows(
          source,
          { ...byId, targetId: accountId('tiktok', targetSecUid, '7000000000000000001') },
          context(),
        ),
      ).resolves.toMatchObject({ outcome: 'source_error', error: { kind: 'identity_conflict' } });
    });

    it('answers verified for an entry with a new handle but the target account id', async () => {
      following(recordedListWith({ uniqueId: 'renamed.creators' }));
      await expect(askFollows(source, byId, context())).resolves.toEqual({
        outcome: 'verified',
        evidence: { pagesRead: 1, listExhausted: false, entriesRead: 1 },
        cost: { unit: 'request', amount: 1 },
      });
    });

    it('answers private from the profile when the following list is hidden', async () => {
      profile(fixture('profile-following-hidden.html'));
      await expect(askFollows(source, check, context())).resolves.toEqual({
        outcome: 'private',
        cost: { unit: 'request', amount: 1 },
      });
    });

    it('answers private when the list endpoint says the list is hidden', async () => {
      profile(fixture('profile-public.html'));
      following(fixture('following-hidden.json'));
      await expect(askFollows(source, check, context())).resolves.toEqual({
        outcome: 'private',
        cost: { unit: 'request', amount: 2 },
      });
    });

    it('follows the cursor to a later page', async () => {
      profile(fixture('profile-public.html'));
      following(listPage({ userList: [], hasMore: true, minCursor: 1447292191 }), {
        minCursor: '0',
      });
      following(fixture('following-page-exhausted.json'), { minCursor: '1447292191' });
      await expect(askFollows(source, check, context({ pageCap: 3 }))).resolves.toEqual({
        outcome: 'verified',
        evidence: { pagesRead: 2, listExhausted: false, entriesRead: 1 },
        cost: { unit: 'request', amount: 3 },
      });
    });

    it('stops at the page cap with listExhausted false', async () => {
      profile(fixture('profile-public.html'));
      following(listPage({ userList: [], hasMore: true, minCursor: 5 }));
      await expect(askFollows(source, check, context({ pageCap: 1 }))).resolves.toEqual({
        outcome: 'not_following',
        evidence: { pagesRead: 1, listExhausted: false, entriesRead: 0 },
        cost: { unit: 'request', amount: 2 },
      });
    });

    it.each([
      ['an empty body', '', 'blocked'],
      ['an unknown status code', listPage({ statusCode: 12345 }), 'unknown_status'],
      ['a body that is not JSON', '<html>', 'parse'],
    ])('answers source_error for %s', async (_label, body, kind) => {
      profile(fixture('profile-public.html'));
      following(body);
      await expect(askFollows(source, check, context())).resolves.toMatchObject({
        outcome: 'source_error',
        error: { kind },
        cost: { unit: 'request', amount: 2 },
      });
    });

    it('answers source_error when the signer fails', async () => {
      const failingSigner: RequestSigner = {
        sign: () => Promise.resolve(err({ kind: 'network', message: 'signer down' })),
      };
      const broken = scraperSource({
        http: createHttpClient({ headers: () => ({}) }),
        signer: failingSigner,
      });
      await expect(askFollows(broken, check, context())).resolves.toEqual({
        outcome: 'source_error',
        error: { kind: 'network', message: 'signer down' },
        cost: { unit: 'request', amount: 1 },
      });
    });

    it('propagates a caller abort', async () => {
      profile(fixture('profile-public.html'));
      following(listPage({ userList: [] })).delay(1000);
      const controller = new AbortController();
      const pending = askFollows(source, check, context({ signal: controller.signal }));
      setTimeout(() => {
        controller.abort();
      }, 10);
      await expect(pending).rejects.toThrow();
    });
  });

  describe('liked', () => {
    const video = content('7000000000000000001');
    const check = { kind: 'liked', performer, content: video } as const;

    it('reads the liked list by id without loading the profile page', async () => {
      let signed = 0;
      const countingSigner: RequestSigner = {
        sign: (url) => {
          signed += 1;
          return Promise.resolve(ok({ url, headers: signedHeaders }));
        },
      };
      const direct = scraperSource({
        http: createHttpClient({ headers: () => ({}) }),
        signer: countingSigner,
      });
      liked(listPage({ itemList: [{ id: '7000000000000000001' }], hasMore: false, cursor: 0 }));
      await expect(
        direct.answer({ ...check, performerId: accountId('tiktok', profileSecUid) }, context()),
      ).resolves.toEqual({
        outcome: 'verified',
        evidence: { pagesRead: 1, listExhausted: false, entriesRead: 1 },
        cost: { unit: 'request', amount: 1 },
      });
      expect(signed).toBe(1);
    });

    it('answers private from the profile when likes are hidden', async () => {
      profile(fixture('profile-public.html'));
      await expect(source.answer(check, context())).resolves.toEqual({
        outcome: 'private',
        cost: { unit: 'request', amount: 1 },
      });
    });

    it('answers private when the list endpoint returns no items for hidden likes', async () => {
      profile(profilePage({ openFavorite: true }));
      liked(fixture('liked-hidden.json'));
      await expect(source.answer(check, context())).resolves.toEqual({
        outcome: 'private',
        cost: { unit: 'request', amount: 2 },
      });
    });

    it('answers verified when the content is in the liked list', async () => {
      profile(profilePage({ openFavorite: true }));
      liked(
        listPage({
          itemList: [{ id: '1' }, { id: '7000000000000000001' }],
          hasMore: true,
          cursor: 9,
        }),
      );
      await expect(source.answer(check, context())).resolves.toEqual({
        outcome: 'verified',
        evidence: { pagesRead: 1, listExhausted: false, entriesRead: 2 },
        cost: { unit: 'request', amount: 2 },
      });
    });

    it('answers not_following when the liked list ends without the content', async () => {
      profile(profilePage({ openFavorite: true }));
      liked(listPage({ itemList: [{ id: '1' }], hasMore: false, cursor: 0 }));
      await expect(source.answer(check, context())).resolves.toEqual({
        outcome: 'not_following',
        evidence: { pagesRead: 1, listExhausted: true, entriesRead: 1 },
        cost: { unit: 'request', amount: 2 },
      });
    });
  });
});
