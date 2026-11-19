import { describe, expect, it } from 'vitest';
import { createHttpClient } from '../http/http-client.ts';
import { ensembledataClient } from './ensembledata-client.ts';
import { usedUnitsSchema } from './ensembledata-schemas.ts';

const keyName = 'ENSEMBLEDATA_TOKEN';
const token = process.env[keyName] ?? '';
const configured = token !== '';

console.log(`${keyName} ${configured ? 'found' : 'not found'}`);

describe.skipIf(!configured)('ensembledata live', () => {
  it('reads the free used-units count in one call', async () => {
    const client = ensembledataClient({
      http: createHttpClient({ headers: () => ({}) }),
      tokens: [token],
    });
    const reply = await client.read(
      '/customer/get-used-units',
      { date: new Date().toISOString().slice(0, 10) },
      usedUnitsSchema,
      AbortSignal.timeout(15_000),
    );
    expect(reply).toMatchObject({ unitsCharged: 0, read: { ok: true } });
    expect(
      reply.read.ok && 'body' in reply.read.value && typeof reply.read.value.body.data.tiktok,
    ).toBe('number');
  });
});
