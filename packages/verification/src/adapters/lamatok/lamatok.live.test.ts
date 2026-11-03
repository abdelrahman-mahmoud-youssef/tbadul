import { describe, expect, it } from 'vitest';
import { createHttpClient } from '../http/http-client.ts';
import { lamatokClient } from './lamatok-client.ts';
import { balanceSchema } from './lamatok-schemas.ts';

const keyName = 'LAMATOK_ACCESS_KEY';
const accessKey = process.env[keyName] ?? '';
const configured = accessKey !== '';

console.log(`${keyName} ${configured ? 'found' : 'not found'}`);

describe.skipIf(!configured)('lamatok live', () => {
  it('reads the balance in one call', async () => {
    const client = lamatokClient({ http: createHttpClient({ headers: () => ({}) }), accessKey });
    const reply = await client.read('/sys/balance', {}, balanceSchema, AbortSignal.timeout(15_000));
    expect(reply).toMatchObject({ ok: true, value: { found: true } });
    expect(reply.ok && reply.value.found && typeof reply.value.body.requests).toBe('number');
  });
});
