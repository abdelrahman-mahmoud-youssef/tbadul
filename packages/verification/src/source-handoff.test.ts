import { readFileSync } from 'node:fs';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { afterAll, describe, expect, it } from 'vitest';
import { createHttpClient } from './adapters/http/http-client.ts';
import { lamatokSource } from './adapters/lamatok/lamatok-source.ts';
import { scraperSource } from './adapters/scraper/scraper-source.ts';
import { createVerifier } from './create-verifier.ts';
import { ok } from './domain/result.ts';
import type { RequestSigner } from './ports/request-signer.ts';
import { handle } from './testing/fixtures.ts';

const lamatok = 'https://api.lamatok.com';
const web = 'https://www.tiktok.com';
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
    });
    expect(follows).toMatchObject({
      outcome: 'verified',
      source: 'scraper',
      evidence: { pagesRead: 1, listExhausted: false },
    });
    expect(profile.evidence.accountId).toEqual({ platform: 'tiktok', value: lamatokSecUid });
  });
});
