import { readFileSync } from 'node:fs';
import { MockAgent, setGlobalDispatcher, type Interceptable } from 'undici';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { accountId } from '../../domain/account-id.ts';
import { content, context, handle } from '../../testing/fixtures.ts';
import { createHttpClient } from '../http/http-client.ts';
import { ensembledataSource } from './ensembledata-source.ts';

const origin = 'https://ensembledata.com';
const agent = new MockAgent();
agent.disableNetConnect();
setGlobalDispatcher(agent);

afterAll(async () => {
  await agent.close();
});

const token = 'rePlay7oken9Qz4X';
const http = createHttpClient({ headers: () => ({}) });
const source = ensembledataSource({ http, token });

interface Fixture {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

const fixture = (kind: 'recorded' | 'synthetic', name: string) =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/${kind}/${name}`, import.meta.url), 'utf8'),
  ) as Fixture;

const recorded = (name: string) => fixture('recorded', name);
const synthetic = (name: string) => fixture('synthetic', name);

const tiktokSecUid = 'MS4wLjABAAAAv7iSuuXDJGDvJkmH_vz1qkDZYo1apxgzaxdBSeIuPiM';
const khabySecUid = 'MS4wLjABAAAAwAg0rSzO65WQfz4RzQgGv2Xdv108BgPXhRrrmNVIHQZ9PO8-flwwRtEppYTS0OjA';
const charliSecUid = 'MS4wLjABAAAA-VASjiXTh7wDDyXvjk10VFhMWUAoxr8bgfO1kAL1-9s';
const creatorsSecUid =
  'MS4wLjABAAAAXqqA-cLDC0hfQPIrS5APYNsg04zkl-socWCkqkI3UIOaEe6_Qnokg0GcWpLnMNQP';
const creatorsNextCursor = '1766078346';
const creatorsNextPageToken =
  'eyJtYXhfY3Vyc29yIjoxNzkyMDg5NzE4LCJtaW5fY3Vyc29yIjoxNzY2MDc4MzQ2LCJmaW5pc2hfaW5zZXJ0X21hZiI6dHJ1ZX0=';
const units = (amount: number) => ({ unit: 'units', amount }) as const;
const json = { 'content-type': 'application/json' };

const raw = (status: number, body: string, unitsCharged?: number) => ({
  status,
  body,
  headers: unitsCharged === undefined ? json : { ...json, units_charged: String(unitsCharged) },
});

const infoWith = (user: Record<string, unknown>): Fixture => {
  const info = recorded('info-tiktok.json');
  const body = structuredClone(info.body) as { data: { user: Record<string, unknown> } };
  body.data.user = { ...body.data.user, ...user };
  return { ...info, body };
};

describe('ensembledataSource', () => {
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
        url.searchParams.get('token') === token &&
        Object.entries(query).every(([key, value]) => url.searchParams.get(key) === value)
      );
    };

  const replay = (
    pathname: string,
    query: Record<string, string | null>,
    reply: Fixture | ReturnType<typeof raw>,
  ) =>
    pool
      .intercept({ path: pathWith(pathname, query), method: 'GET' })
      .reply(
        reply.status,
        typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body),
        { headers: reply.headers },
      );

  const info = (reply: Fixture | ReturnType<typeof raw>, username = 'tiktok') =>
    replay('/apis/tt/user/info', { username }, reply);

  const followings = (
    secUid: string,
    reply: Fixture | ReturnType<typeof raw>,
    page: Record<string, string | null> = { cursor: null, page_token: null },
  ) => replay('/apis/tt/user/followings', { id: '1', secUid, ...page }, reply);

  const likedPosts = (reply: Fixture | ReturnType<typeof raw>, cursor: string | null = null) =>
    replay('/apis/tt/user/liked-posts', { secUid: tiktokSecUid, cursor }, reply);

  const profileCheck = { kind: 'profile', subject: handle('tiktok') } as const;

  describe('profile', () => {
    it('reads the recorded profile into evidence and charges the units header', async () => {
      info(recorded('info-tiktok.json'));
      await expect(source.answer(profileCheck, context())).resolves.toEqual({
        outcome: 'verified',
        evidence: {
          accountId: accountId('tiktok', tiktokSecUid),
          bio: 'Your next discovery is waiting on TikTok.',
          isPrivate: false,
          likesVisible: false,
          followerCount: 96554353,
          followingCount: 1,
          videoCount: 1582,
          avatarUrl:
            'https://p16-common-sign.tiktokcdn-eu.com/tos-maliva-avt-0068/ba67b11de451691939223e9d978e613a~tplv-tiktokx-cropcenter-q:100:100:q70.webp',
        },
        cost: units(1),
      });
    });

    it('leaves optional evidence out when the profile does not carry it', async () => {
      info(
        raw(
          200,
          JSON.stringify({
            data: { user: { secUid: tiktokSecUid, signature: '', privateAccount: true } },
          }),
          1,
        ),
      );
      await expect(source.answer(profileCheck, context())).resolves.toEqual({
        outcome: 'verified',
        evidence: { accountId: accountId('tiktok', tiktokSecUid), bio: '', isPrivate: true },
        cost: units(1),
      });
    });

    it('answers not_found for the recorded null data of a missing user', async () => {
      info(recorded('info-missing.json'), 'zq8v1k0x9m2nope');
      await expect(
        source.answer({ kind: 'profile', subject: handle('zq8v1k0x9m2nope') }, context()),
      ).resolves.toEqual({ outcome: 'not_found', cost: units(1) });
    });

    it('maps the recorded 491 to an auth error that cost nothing', async () => {
      info(recorded('token-not-found.json'));
      await expect(source.answer(profileCheck, context())).resolves.toEqual({
        outcome: 'source_error',
        error: { kind: 'auth', message: 'ensembledata 491: token not found', httpStatus: 491 },
        cost: units(0),
      });
    });

    it.each([
      [492, { kind: 'auth', message: 'ensembledata 492: email unverified' }],
      [493, { kind: 'auth', message: 'ensembledata 493: subscription expired' }],
      [495, { kind: 'http', message: 'ensembledata 495: units depleted' }],
      [422, { kind: 'http', message: 'http 422' }],
      [429, { kind: 'rate_limited', message: 'http 429' }],
      [500, { kind: 'http', message: 'http 500' }],
      [503, { kind: 'http', message: 'http 503' }],
      [474, { kind: 'unknown_status', message: 'ensembledata http 474' }],
      [471, { kind: 'unknown_status', message: 'ensembledata http 471' }],
      [404, { kind: 'unknown_status', message: 'ensembledata http 404' }],
    ])('maps http %i to source_error', async (status, error) => {
      info(raw(status, '{"detail":"x"}'));
      await expect(source.answer(profileCheck, context())).resolves.toEqual({
        outcome: 'source_error',
        error: { ...error, httpStatus: status },
        cost: units(0),
      });
    });

    it.each([
      [472, 'private'],
      [473, 'not_found'],
    ])('maps http %i to %s', async (status, outcome) => {
      info(raw(status, '{"detail":"x"}'));
      await expect(source.answer(profileCheck, context())).resolves.toEqual({
        outcome,
        cost: units(0),
      });
    });

    it.each([
      ['a body that is not JSON', '<html>'],
      ['a JSON body of an unknown shape', '{"data":{"user":{}}}'],
      ['a body without data', '{"detail":"x"}'],
    ])('answers parse for %s and still charges the units header', async (_label, body) => {
      info(raw(200, body, 1));
      await expect(source.answer(profileCheck, context())).resolves.toMatchObject({
        outcome: 'source_error',
        error: { kind: 'parse', httpStatus: 200 },
        cost: units(1),
      });
    });

    it('answers parse for a units header that is not a count', async () => {
      info({ ...recorded('info-tiktok.json'), headers: { ...json, units_charged: 'one' } });
      await expect(source.answer(profileCheck, context())).resolves.toEqual({
        outcome: 'source_error',
        error: {
          kind: 'parse',
          message: 'ensembledata units_charged header is not a count',
          httpStatus: 200,
        },
        cost: units(0),
      });
    });

    it('answers network when the call fails before a reply', async () => {
      pool
        .intercept({ path: pathWith('/apis/tt/user/info'), method: 'GET' })
        .replyWithError(new Error('socket hang up'));
      await expect(source.answer(profileCheck, context())).resolves.toEqual({
        outcome: 'source_error',
        error: { kind: 'network', message: 'ensembledata request failed' },
        cost: units(0),
      });
    });
  });

  describe('keeps the token out of every failed answer', () => {
    const tokenUrl = `${origin}/apis/tt/user/info?username=tiktok&token=${token}`;

    it.each([
      ['the recorded 491', () => info(recorded('token-not-found.json'))],
      ['a 500 that echoes the token', () => info(raw(500, `{"detail":"${tokenUrl}"}`))],
      ['a 422 that echoes the token', () => info(raw(422, `{"detail":"${token}"}`))],
      ['a body that is not JSON', () => info(raw(200, `<html>${token}</html>`, 1))],
      ['a token at the JSON error position', () => info(raw(200, `{"data":${token}}`, 1))],
      [
        'a body of the wrong shape',
        () => info(raw(200, JSON.stringify({ data: { user: { secUid: token } } }), 1)),
      ],
      [
        'a transport error that names the url',
        () =>
          pool
            .intercept({ path: pathWith('/apis/tt/user/info'), method: 'GET' })
            .replyWithError(new Error(tokenUrl)),
      ],
      ['a request no reply matches', () => undefined],
    ])('%s', async (_label, arrange) => {
      arrange();
      const answer = await source.answer(profileCheck, context());
      expect(answer.outcome).toBe('source_error');
      expect(JSON.stringify(answer)).not.toContain(token);
    });
  });

  describe('follows', () => {
    const check = {
      kind: 'follows',
      performer: handle('khaby.lame'),
      target: handle('tiktok'),
    } as const;

    it('reads the list by the performer id without a profile call', async () => {
      followings(tiktokSecUid, recorded('followings-tiktok.json'));
      await expect(
        source.answer(
          {
            kind: 'follows',
            performer: handle('tiktok'),
            performerId: accountId('tiktok', tiktokSecUid),
            target: handle('tiktokcreators'),
          },
          context(),
        ),
      ).resolves.toEqual({
        outcome: 'verified',
        evidence: { pagesRead: 1, listExhausted: false, entriesRead: 10 },
        cost: units(2),
      });
    });

    it('resolves the secUid through the profile when the check has no id', async () => {
      info(recorded('info-khaby.json'), 'khaby.lame');
      followings(khabySecUid, recorded('followings-khaby.json'));
      await expect(source.answer(check, context())).resolves.toEqual({
        outcome: 'verified',
        evidence: { pagesRead: 1, listExhausted: false, entriesRead: 82 },
        cost: units(3),
      });
    });

    it('answers not_following when a list without next tokens lacks the target', async () => {
      followings(khabySecUid, recorded('followings-khaby.json'));
      await expect(
        source.answer(
          {
            ...check,
            performerId: accountId('tiktok', khabySecUid),
            target: handle('charlidamelio'),
          },
          context(),
        ),
      ).resolves.toEqual({
        outcome: 'not_following',
        evidence: { pagesRead: 1, listExhausted: true, entriesRead: 82 },
        cost: units(2),
      });
    });

    const creators = {
      kind: 'follows',
      performer: handle('tiktokcreators'),
      performerId: accountId('tiktok', creatorsSecUid),
      target: handle('tiktok'),
    } as const;
    const secondPage = { cursor: creatorsNextCursor, page_token: creatorsNextPageToken };

    it('follows nextCursor and nextPageToken to the second page', async () => {
      followings(creatorsSecUid, recorded('followings-tiktokcreators-page-1.json'));
      followings(creatorsSecUid, synthetic('followings-tiktokcreators-page-2.json'), secondPage);
      await expect(source.answer(creators, context())).resolves.toEqual({
        outcome: 'verified',
        evidence: { pagesRead: 2, listExhausted: false, entriesRead: 102 },
        cost: units(4),
      });
    });

    it('answers not_following when the last page ends without the target', async () => {
      followings(creatorsSecUid, recorded('followings-tiktokcreators-page-1.json'));
      followings(creatorsSecUid, synthetic('followings-tiktokcreators-page-2.json'), secondPage);
      await expect(
        source.answer({ ...creators, target: handle('khaby.lame') }, context()),
      ).resolves.toEqual({
        outcome: 'not_following',
        evidence: { pagesRead: 2, listExhausted: true, entriesRead: 102 },
        cost: units(4),
      });
    });

    it('stops at the page cap with listExhausted false', async () => {
      followings(creatorsSecUid, recorded('followings-tiktokcreators-page-1.json'));
      await expect(source.answer(creators, context({ pageCap: 1 }))).resolves.toEqual({
        outcome: 'not_following',
        evidence: { pagesRead: 1, listExhausted: false, entriesRead: 100 },
        cost: units(2),
      });
    });

    it('answers private for the recorded null data of a hidden list', async () => {
      followings(charliSecUid, recorded('followings-hidden.json'));
      await expect(
        source.answer(
          {
            kind: 'follows',
            performer: handle('charlidamelio'),
            performerId: accountId('tiktok', charliSecUid),
            target: handle('tiktok'),
          },
          context(),
        ),
      ).resolves.toEqual({ outcome: 'private', cost: units(2) });
    });

    it('answers private for a hidden list reached through the profile', async () => {
      info(recorded('info-charlidamelio.json'), 'charlidamelio');
      followings(charliSecUid, recorded('followings-hidden.json'));
      await expect(
        source.answer({ ...check, performer: handle('charlidamelio') }, context()),
      ).resolves.toEqual({ outcome: 'private', cost: units(3) });
    });

    it('answers not_found when the performer does not exist', async () => {
      info(recorded('info-missing.json'), 'khaby.lame');
      await expect(source.answer(check, context())).resolves.toEqual({
        outcome: 'not_found',
        cost: units(1),
      });
    });

    it('maps the recorded 422 for a missing id to an http error', async () => {
      followings(tiktokSecUid, recorded('followings-without-id.json'));
      await expect(
        source.answer({ ...creators, performerId: accountId('tiktok', tiktokSecUid) }, context()),
      ).resolves.toEqual({
        outcome: 'source_error',
        error: { kind: 'http', message: 'http 422', httpStatus: 422 },
        cost: units(0),
      });
    });

    it.each([
      ['only nextCursor', { nextCursor: 5 }],
      ['only nextPageToken', { nextPageToken: 'eyJ9' }],
    ])('answers parse, not not_following, for a page with %s', async (_label, next) => {
      followings(
        creatorsSecUid,
        raw(200, JSON.stringify({ data: { followings: [], total: 570, ...next } }), 2),
      );
      await expect(source.answer(creators, context())).resolves.toEqual({
        outcome: 'source_error',
        error: {
          kind: 'parse',
          message: 'ensembledata followings page carries only one of nextCursor and nextPageToken',
        },
        cost: units(2),
      });
    });

    it('answers source_error, not not_following, when a later page fails', async () => {
      followings(creatorsSecUid, recorded('followings-tiktokcreators-page-1.json'));
      followings(creatorsSecUid, raw(500, '{"detail":"Internal error."}'), secondPage);
      await expect(source.answer(creators, context())).resolves.toEqual({
        outcome: 'source_error',
        error: { kind: 'http', message: 'http 500', httpStatus: 500 },
        cost: units(2),
      });
    });

    it('forwards the caller signal and propagates an abort', async () => {
      followings(creatorsSecUid, recorded('followings-tiktokcreators-page-1.json')).delay(1000);
      const controller = new AbortController();
      const pending = source.answer(creators, context({ signal: controller.signal }));
      setTimeout(() => {
        controller.abort();
      }, 10);
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    });
  });

  describe('liked', () => {
    const check = {
      kind: 'liked',
      performer: handle('tiktok'),
      content: content('7000000000000000001'),
    } as const;
    const byId = { ...check, performerId: accountId('tiktok', tiktokSecUid) } as const;

    it('reads liked posts by the performer id without a profile call', async () => {
      likedPosts(synthetic('liked-posts-page.json'));
      await expect(source.answer(byId, context())).resolves.toEqual({
        outcome: 'verified',
        evidence: { pagesRead: 1, listExhausted: false, entriesRead: 2 },
        cost: units(1),
      });
    });

    it('resolves the secUid through the profile when likes are public', async () => {
      info(infoWith({ openFavorite: true }));
      likedPosts(synthetic('liked-posts-page.json'));
      await expect(source.answer(check, context())).resolves.toEqual({
        outcome: 'verified',
        evidence: { pagesRead: 1, listExhausted: false, entriesRead: 2 },
        cost: units(2),
      });
    });

    it('answers private from the recorded profile when likes are hidden', async () => {
      info(recorded('info-tiktok.json'));
      await expect(source.answer(check, context())).resolves.toEqual({
        outcome: 'private',
        cost: units(1),
      });
    });

    it('answers private for the recorded hidden-likes info', async () => {
      likedPosts(recorded('liked-posts-hidden.json'));
      await expect(source.answer(byId, context())).resolves.toEqual({
        outcome: 'private',
        cost: units(1),
      });
    });

    it('follows nextCursor and answers not_following at the end of the list', async () => {
      likedPosts(synthetic('liked-posts-page.json'));
      likedPosts(synthetic('liked-posts-last-page.json'), '1617308384000');
      await expect(
        source.answer({ ...byId, content: content('7000000000000000009') }, context()),
      ).resolves.toEqual({
        outcome: 'not_following',
        evidence: { pagesRead: 2, listExhausted: true, entriesRead: 3 },
        cost: units(2),
      });
    });

    it.each([
      ['an info message other than hidden likes', '{"data":{"info":"Something else."}}'],
      ['null data', '{"data":null}'],
      ['a body that is not JSON', 'not json'],
    ])('answers parse for %s', async (_label, body) => {
      likedPosts(raw(200, body, 1));
      await expect(source.answer(byId, context())).resolves.toMatchObject({
        outcome: 'source_error',
        error: { kind: 'parse' },
        cost: units(1),
      });
    });
  });
});
