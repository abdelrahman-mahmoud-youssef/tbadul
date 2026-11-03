import { readFileSync } from 'node:fs';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { afterAll, describe, expect, it } from 'vitest';
import { createHttpClient } from '../http/http-client.ts';
import { lamatokClient, lamatokOrigin } from './lamatok-client.ts';
import { balanceSchema } from './lamatok-schemas.ts';

const agent = new MockAgent();
agent.disableNetConnect();
setGlobalDispatcher(agent);

afterAll(async () => {
  await agent.close();
});

interface Recorded {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

const recorded = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/recorded/${name}`, import.meta.url), 'utf8'),
  ) as Recorded;

const accessKey = 'replay-access-key';
const client = lamatokClient({ http: createHttpClient({ headers: () => ({}) }), accessKey });

const replayBalance = (name: string) => {
  const { status, headers, body } = recorded(name);
  agent
    .get(lamatokOrigin)
    .intercept({ path: '/sys/balance', method: 'GET', headers: { 'x-access-key': accessKey } })
    .reply(status, JSON.stringify(body), { headers });
};

describe('lamatokClient', () => {
  it('reads the recorded balance with the schema the live test asserts on', async () => {
    replayBalance('balance.json');
    await expect(
      client.read('/sys/balance', {}, balanceSchema, new AbortController().signal),
    ).resolves.toEqual({ ok: true, value: { found: true, body: { requests: 0 } } });
  });

  it('maps the recorded 401 for a rejected key to an auth error', async () => {
    replayBalance('unauthorized.json');
    await expect(
      client.read('/sys/balance', {}, balanceSchema, new AbortController().signal),
    ).resolves.toEqual({
      ok: false,
      error: { kind: 'auth', message: 'http 401', httpStatus: 401 },
    });
  });
});
