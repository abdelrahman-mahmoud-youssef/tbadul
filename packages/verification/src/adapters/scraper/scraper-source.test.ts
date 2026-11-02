import { readFileSync } from 'node:fs';
import { MockAgent, setGlobalDispatcher, type Interceptable } from 'undici';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { err, ok } from '../../domain/result.ts';
import type { RequestSigner } from '../../ports/request-signer.ts';
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
          accountId: { platform: 'tiktok', value: profileSecUid },
          bio: 'Your next discovery is waiting on TikTok.',
          isPrivate: false,
          followingVisible: true,
          likesVisible: false,
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
    const check = { kind: 'follows', performer, target } as const;

    it('answers verified when the target is on the first page', async () => {
      profile(fixture('profile-public.html'));
      following(fixture('following-page-exhausted.json'));
      await expect(source.answer(check, context())).resolves.toEqual({
        outcome: 'verified',
        evidence: { pagesRead: 1, listExhausted: false },
        cost: { unit: 'request', amount: 2 },
      });
    });

    it('answers not_following when the list ends without the target', async () => {
      profile(fixture('profile-public.html'));
      following(
        listPage({ userList: [{ user: { uniqueId: 'other', secUid: 's' } }], hasMore: false }),
      );
      await expect(
        source.answer({ ...check, target: handle('khaby.lame') }, context()),
      ).resolves.toEqual({
        outcome: 'not_following',
        evidence: { pagesRead: 1, listExhausted: true },
        cost: { unit: 'request', amount: 2 },
      });
    });

    it('answers private from the profile when the following list is hidden', async () => {
      profile(fixture('profile-following-hidden.html'));
      await expect(source.answer(check, context())).resolves.toEqual({
        outcome: 'private',
        cost: { unit: 'request', amount: 1 },
      });
    });

    it('answers private when the list endpoint says the list is hidden', async () => {
      profile(fixture('profile-public.html'));
      following(fixture('following-hidden.json'));
      await expect(source.answer(check, context())).resolves.toEqual({
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
      await expect(source.answer(check, context({ pageCap: 3 }))).resolves.toEqual({
        outcome: 'verified',
        evidence: { pagesRead: 2, listExhausted: false },
        cost: { unit: 'request', amount: 3 },
      });
    });

    it('stops at the page cap with listExhausted false', async () => {
      profile(fixture('profile-public.html'));
      following(listPage({ userList: [], hasMore: true, minCursor: 5 }));
      await expect(source.answer(check, context({ pageCap: 1 }))).resolves.toEqual({
        outcome: 'not_following',
        evidence: { pagesRead: 1, listExhausted: false },
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
      await expect(source.answer(check, context())).resolves.toMatchObject({
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
      await expect(broken.answer(check, context())).resolves.toEqual({
        outcome: 'source_error',
        error: { kind: 'network', message: 'signer down' },
        cost: { unit: 'request', amount: 1 },
      });
    });

    it('propagates a caller abort', async () => {
      profile(fixture('profile-public.html'));
      following(listPage({ userList: [] })).delay(1000);
      const controller = new AbortController();
      const pending = source.answer(check, context({ signal: controller.signal }));
      setTimeout(() => {
        controller.abort();
      }, 10);
      await expect(pending).rejects.toThrow();
    });
  });

  describe('liked', () => {
    const video = content('7000000000000000001');
    const check = { kind: 'liked', performer, content: video } as const;

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
        evidence: { pagesRead: 1, listExhausted: false },
        cost: { unit: 'request', amount: 2 },
      });
    });

    it('answers not_following when the liked list ends without the content', async () => {
      profile(profilePage({ openFavorite: true }));
      liked(listPage({ itemList: [{ id: '1' }], hasMore: false, cursor: 0 }));
      await expect(source.answer(check, context())).resolves.toEqual({
        outcome: 'not_following',
        evidence: { pagesRead: 1, listExhausted: true },
        cost: { unit: 'request', amount: 2 },
      });
    });
  });
});
