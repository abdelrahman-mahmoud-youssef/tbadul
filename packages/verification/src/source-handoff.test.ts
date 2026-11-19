import { readFileSync } from 'node:fs';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { afterAll, describe, expect, it } from 'vitest';
import { ensembledataSource } from './adapters/ensembledata/ensembledata-source.ts';
import { createHttpClient } from './adapters/http/http-client.ts';
import { lamatokSource } from './adapters/lamatok/lamatok-source.ts';
import { scraperSource } from './adapters/scraper/scraper-source.ts';
import { scraptikSource } from './adapters/scraptik/scraptik-source.ts';
import { createVerifier } from './create-verifier.ts';
import { accountId } from './domain/account-id.ts';
import { ok } from './domain/result.ts';
import type { RequestSigner } from './ports/request-signer.ts';
import { handle } from './testing/fixtures.ts';

const lamatok = 'https://api.lamatok.com';
const ensembledata = 'https://ensembledata.com';
const web = 'https://www.tiktok.com';
const rapidapi = 'https://scraptik.p.rapidapi.com';
const agent = new MockAgent();
agent.disableNetConnect();
setGlobalDispatcher(agent);

afterAll(async () => {
  await agent.close();
});

const fixture = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const json = { 'content-type': 'application/json' };
const passThroughSigner: RequestSigner = {
  sign: (url) => Promise.resolve(ok({ url, headers: {} })),
};
const http = createHttpClient({ headers: () => ({}) });
const followedId = accountId(
  'tiktok',
  (
    JSON.parse(fixture('./adapters/scraper/fixtures/following-page-exhausted.json')) as {
      userList: { user: { secUid: string } }[];
    }
  ).userList[0]?.user.secUid ?? '',
);

describe('a lamatok profile answer feeding a scraper list read', () => {
  it('reads the following list by the account id lamatok resolved', async () => {
    const lamatokSecUid = (
      JSON.parse(fixture('./adapters/lamatok/fixtures/synthetic/profile-public.json')) as {
        userInfo: { user: { secUid: string } };
      }
    ).userInfo.user.secUid;
    agent
      .get(lamatok)
      .intercept({ path: '/v1/user/by/username?username=tiktok', method: 'GET' })
      .reply(200, fixture('./adapters/lamatok/fixtures/synthetic/profile-public.json'), {
        headers: json,
      });
    agent
      .get(web)
      .intercept({
        path: (path) =>
          path.startsWith('/api/user/list/') &&
          new URL(path, web).searchParams.get('secUid') === lamatokSecUid,
        method: 'GET',
      })
      .reply(200, fixture('./adapters/scraper/fixtures/following-page-exhausted.json'), {
        headers: json,
      });
    const verifier = createVerifier(
      {
        order: { profile: ['lamatok'], follows: ['scraper'], liked: ['scraper'] },
        timeoutMs: 1000,
        pageCap: 3,
      },
      {
        sources: [
          lamatokSource({ http, accessKey: 'replay-access-key' }),
          scraperSource({ http, signer: passThroughSigner }),
        ],
      },
    );

    const performer = handle('tiktok');
    const profile = await verifier.verify({ kind: 'profile', subject: performer });
    expect(profile).toMatchObject({ outcome: 'verified', source: 'lamatok' });
    if (profile.outcome !== 'verified') return;

    const follows = await verifier.verify({
      kind: 'follows',
      performer,
      performerId: profile.evidence.accountId,
      target: handle('tiktokcreators'),
      targetId: followedId,
    });
    expect(follows).toMatchObject({
      outcome: 'verified',
      source: 'scraper',
      evidence: { pagesRead: 1, listExhausted: false },
    });
    expect(profile.evidence.accountId).toEqual({ platform: 'tiktok', value: lamatokSecUid });
  });
});

describe('an ensembledata profile answer feeding a scraper list read', () => {
  it('reads the following list by the account id ensembledata resolved', async () => {
    const recorded = JSON.parse(
      fixture('./adapters/ensembledata/fixtures/recorded/info-tiktok.json'),
    ) as {
      headers: Record<string, string>;
      body: { data: { user: { secUid: string; id: string } } };
    };
    const ensembleSecUid = recorded.body.data.user.secUid;
    agent
      .get(ensembledata)
      .intercept({
        path: (path) => new URL(path, ensembledata).pathname === '/apis/tt/user/info',
        method: 'GET',
      })
      .reply(200, JSON.stringify(recorded.body), { headers: recorded.headers });
    agent
      .get(web)
      .intercept({
        path: (path) =>
          path.startsWith('/api/user/list/') &&
          new URL(path, web).searchParams.get('secUid') === ensembleSecUid,
        method: 'GET',
      })
      .reply(200, fixture('./adapters/scraper/fixtures/following-page-exhausted.json'), {
        headers: json,
      });
    const verifier = createVerifier(
      {
        order: { profile: ['ensemble'], follows: ['scraper'], liked: ['scraper'] },
        timeoutMs: 1000,
        pageCap: 3,
      },
      {
        sources: [
          ensembledataSource({ http, tokens: ['rePlay7oken9Qz4X'] }),
          scraperSource({ http, signer: passThroughSigner }),
        ],
      },
    );

    const performer = handle('tiktok');
    const profile = await verifier.verify({ kind: 'profile', subject: performer });
    expect(profile).toMatchObject({ outcome: 'verified', source: 'ensemble' });
    if (profile.outcome !== 'verified') return;

    const follows = await verifier.verify({
      kind: 'follows',
      performer,
      performerId: profile.evidence.accountId,
      target: handle('tiktokcreators'),
      targetId: followedId,
    });
    expect(follows).toMatchObject({
      outcome: 'verified',
      source: 'scraper',
      evidence: { pagesRead: 1, listExhausted: false },
    });
    expect(profile.evidence.accountId).toEqual({
      platform: 'tiktok',
      value: ensembleSecUid,
      numericId: recorded.body.data.user.id,
    });
  });
});

describe('scraptik confirming a scraper not_following when ensembledata fails', () => {
  const performerId = accountId(
    'tiktok',
    'MS4wLjABAAAAv7iSuuXDJGDvJkmH_vz1qkDZYo1apxgzaxdBSeIuPiM',
    '107955',
  );
  const check = {
    kind: 'follows',
    performer: handle('tiktok'),
    performerId,
    target: handle('account_001'),
    targetId: accountId('tiktok', 'MS4wLjABAAAA-placeholder-001', '7000000000000000001'),
  } as const;
  const scraptikPage = (name: string) =>
    JSON.stringify(
      (
        JSON.parse(fixture(`./adapters/scraptik/fixtures/recorded/${name}`)) as {
          body: unknown;
        }
      ).body,
    );

  const replay = (scraptikBody: string) => {
    agent
      .get(web)
      .intercept({ path: (path) => path.startsWith('/api/user/list/'), method: 'GET' })
      .reply(200, fixture('./adapters/scraper/fixtures/following-page-exhausted.json'), {
        headers: json,
      });
    agent
      .get(ensembledata)
      .intercept({
        path: (path) => new URL(path, ensembledata).pathname === '/apis/tt/user/followings',
        method: 'GET',
      })
      .reply(500, '{"detail":"Internal error."}', { headers: json });
    agent
      .get(rapidapi)
      .intercept({ path: (path) => path.startsWith('/list-following'), method: 'GET' })
      .reply(200, scraptikBody, { headers: json });
  };

  const verifier = () =>
    createVerifier(
      {
        order: {
          profile: ['ensemble'],
          follows: ['scraper', 'ensemble', 'scraptik'],
          liked: ['scraper'],
        },
        timeoutMs: 1000,
        pageCap: 3,
      },
      {
        sources: [
          scraperSource({ http, signer: passThroughSigner }),
          ensembledataSource({ http, tokens: ['rePlay7oken9Qz4X'] }),
          scraptikSource({ http, rapidApiKey: 'replay-rapidapi-key' }),
        ],
      },
    );

  it('settles verified from scraptik after ensembledata errors', async () => {
    replay(scraptikPage('list-following-tiktok.json'));

    const verdict = await verifier().verify(check);

    expect(verdict).toMatchObject({ outcome: 'verified', source: 'scraptik' });
    expect(verdict.attempts.map((attempt) => [attempt.source, attempt.outcome])).toEqual([
      ['scraper', 'not_following'],
      ['ensemble', 'source_error'],
      ['scraptik', 'verified'],
    ]);
  });

  it('settles not_following once scraptik agrees with the scraper', async () => {
    replay(JSON.stringify({ status_code: 0, followings: [], has_more: false }));

    await expect(verifier().verify(check)).resolves.toMatchObject({
      outcome: 'not_following',
      source: 'scraptik',
    });
  });
});
