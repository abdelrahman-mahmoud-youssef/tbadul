import { MockAgent, setGlobalDispatcher } from 'undici';
import { afterAll, describe, expect, it } from 'vitest';
import { createHttpClient } from '../../http/http-client.ts';
import { sidecarSigner } from './sidecar-signer.ts';

const sidecar = 'http://signer.test:8080';
const agent = new MockAgent();
agent.disableNetConnect();
setGlobalDispatcher(agent);

afterAll(async () => {
  await agent.close();
});

const signer = sidecarSigner(createHttpClient({ headers: () => ({}) }), sidecar);
const signal = () => new AbortController().signal;
const target = 'https://www.tiktok.com/api/user/list/?secUid=abc&scene=21';

describe('sidecarSigner', () => {
  it('turns the sidecar reply into a signed url with cookie and user agent headers', async () => {
    agent
      .get(sidecar)
      .intercept({ path: '/signature', method: 'POST' })
      .reply(200, {
        status: 'ok',
        data: {
          signed_url: `${target}&msToken=m&X-Bogus=b&X-Gnarly=g`,
          'x-bogus': 'b',
          'x-gnarly': 'g',
          cookies: 'msToken=m; ttwid=t',
          navigator: { user_agent: 'Mozilla/5.0 (Macintosh)' },
        },
      });
    await expect(signer.sign(target, signal())).resolves.toEqual({
      ok: true,
      value: {
        url: `${target}&msToken=m&X-Bogus=b&X-Gnarly=g`,
        headers: { 'user-agent': 'Mozilla/5.0 (Macintosh)', cookie: 'msToken=m; ttwid=t' },
      },
    });
  });

  it('reports an http failure when the sidecar is unhealthy', async () => {
    agent.get(sidecar).intercept({ path: '/signature', method: 'POST' }).reply(503, 'starting');
    await expect(signer.sign(target, signal())).resolves.toMatchObject({
      ok: false,
      error: { kind: 'http', httpStatus: 503 },
    });
  });

  it('reports parse when the sidecar answers with an error status', async () => {
    agent
      .get(sidecar)
      .intercept({ path: '/signature', method: 'POST' })
      .reply(200, { status: 'error', message: 'URL is required' });
    await expect(signer.sign(target, signal())).resolves.toMatchObject({
      ok: false,
      error: { kind: 'parse' },
    });
  });

  it('reports network when the sidecar is unreachable', async () => {
    agent
      .get(sidecar)
      .intercept({ path: '/signature', method: 'POST' })
      .replyWithError(new Error('connect ECONNREFUSED'));
    await expect(signer.sign(target, signal())).resolves.toMatchObject({
      ok: false,
      error: { kind: 'network' },
    });
  });
});
