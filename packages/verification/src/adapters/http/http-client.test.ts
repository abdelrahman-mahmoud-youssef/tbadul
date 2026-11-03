import { MockAgent, setGlobalDispatcher } from 'undici';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createHttpClient, decodeJson, failureForStatus } from './http-client.ts';
import type { Transport } from './transport.ts';

const origin = 'https://api.example.test';
const agent = new MockAgent();
agent.disableNetConnect();
setGlobalDispatcher(agent);

afterAll(async () => {
  await agent.close();
});

const client = createHttpClient({ headers: () => ({ 'x-access-key': 'name-only' }) });
const signal = () => new AbortController().signal;
const schema = z.object({ balance: z.number() });

describe('createHttpClient', () => {
  let pool: ReturnType<MockAgent['get']>;

  beforeEach(() => {
    pool = agent.get(origin);
  });

  it('returns status, headers and body text and sends the configured headers', async () => {
    pool
      .intercept({ path: '/balance', method: 'GET', headers: { 'x-access-key': 'name-only' } })
      .reply(200, '{"balance":7}', { headers: { 'content-type': 'application/json' } });
    const reply = await client.get(`${origin}/balance`, signal());
    expect(reply).toMatchObject({ ok: true, value: { status: 200, text: '{"balance":7}' } });
    if (reply.ok) expect(reply.value.headers.get('content-type')).toBe('application/json');
  });

  it('hands back non-2xx replies as data for the adapter to map', async () => {
    pool.intercept({ path: '/missing', method: 'GET' }).reply(404, 'not here');
    await expect(client.get(`${origin}/missing`, signal())).resolves.toMatchObject({
      ok: true,
      value: { status: 404, text: 'not here' },
    });
  });

  it('maps a transport failure to a network error', async () => {
    pool.intercept({ path: '/down', method: 'GET' }).replyWithError(new Error('socket hang up'));
    await expect(client.get(`${origin}/down`, signal())).resolves.toEqual({
      ok: false,
      error: { kind: 'network', message: 'TypeError: fetch failed (socket hang up)' },
    });
  });

  it('forwards the signal and rethrows an abort instead of mapping it', async () => {
    pool.intercept({ path: '/slow', method: 'GET' }).reply(200, 'late').delay(1000);
    const controller = new AbortController();
    const pending = client.get(`${origin}/slow`, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('uses the transport given instead of fetch', async () => {
    const seen: string[] = [];
    const transport: Transport = (url, init) => {
      seen.push(url, init.headers['x-access-key'] ?? '');
      return Promise.resolve(new Response('ok', { status: 200 }));
    };
    const custom = createHttpClient({ headers: () => ({ 'x-access-key': 'k' }), transport });
    await expect(custom.get('https://other.test/x', signal())).resolves.toMatchObject({
      ok: true,
      value: { status: 200, text: 'ok' },
    });
    expect(seen).toEqual(['https://other.test/x', 'k']);
  });
});

describe('decodeJson', () => {
  const reply = (text: string) => ({ status: 200, headers: new Headers(), text });

  it('parses and validates a JSON body', () => {
    expect(decodeJson(reply('{"balance":3}'), schema)).toEqual({ ok: true, value: { balance: 3 } });
  });

  it('reports a parse error for a body that is not JSON without quoting the body', () => {
    expect(decodeJson(reply('<html>secret-in-body'), schema)).toEqual({
      ok: false,
      error: { kind: 'parse', message: 'body is not JSON', httpStatus: 200 },
    });
  });

  it('reports a parse error naming the field that failed the schema', () => {
    expect(decodeJson(reply('{"balance":"x"}'), schema)).toMatchObject({
      ok: false,
      error: { kind: 'parse', message: expect.stringContaining('balance') as string },
    });
  });
});

describe('failureForStatus', () => {
  it.each([
    [429, 'rate_limited'],
    [401, 'auth'],
    [403, 'auth'],
    [500, 'http'],
    [404, 'http'],
  ])('maps %i to %s', (status, kind) => {
    expect(failureForStatus(status)).toEqual({
      kind,
      message: `http ${status}`,
      httpStatus: status,
    });
  });
});
