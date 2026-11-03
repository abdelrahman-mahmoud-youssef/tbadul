import { readFileSync } from 'node:fs';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { afterAll, describe, expect, it } from 'vitest';
import { createHttpClient } from '../http/http-client.ts';
import { ensembledataClient } from './ensembledata-client.ts';
import { usedUnitsSchema } from './ensembledata-schemas.ts';

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

const token = 'rePlay7oken9Qz4X';
const client = ensembledataClient({ http: createHttpClient({ headers: () => ({}) }), token });

const replayUsedUnits = (name: string) => {
  const { status, headers, body } = recorded(name);
  agent
    .get('https://ensembledata.com')
    .intercept({
      path: `/apis/customer/get-used-units?date=2026-11-03&token=${token}`,
      method: 'GET',
    })
    .reply(status, JSON.stringify(body), { headers });
};

const readUsedUnits = () =>
  client.read(
    '/customer/get-used-units',
    { date: '2026-11-03' },
    usedUnitsSchema,
    new AbortController().signal,
  );

describe('ensembledataClient', () => {
  it('reads the recorded used units with the schema the live test asserts on', async () => {
    replayUsedUnits('used-units.json');
    await expect(readUsedUnits()).resolves.toMatchObject({
      unitsCharged: 0,
      read: { ok: true, value: { body: { data: { tiktok: 0 } } } },
    });
  });

  it('maps the recorded 491 for an unknown token to an auth error', async () => {
    replayUsedUnits('token-not-found.json');
    await expect(readUsedUnits()).resolves.toEqual({
      unitsCharged: 0,
      read: {
        ok: false,
        error: { kind: 'auth', message: 'ensembledata 491: token not found', httpStatus: 491 },
      },
    });
  });
});
