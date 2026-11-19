import { describe, expect, it } from 'vitest';
import { accountId } from '../../domain/account-id.ts';
import { askFollows } from '../../testing/fake-source.ts';
import { handle } from '../../testing/fixtures.ts';
import { createHttpClient } from '../http/http-client.ts';
import { tokapiSource } from './tokapi-source.ts';

const keyNames = ['RAPIDAPI_KEY', 'SCRAPTIK_RAPIDAPI_KEY'] as const;
const keyName = keyNames.find((name) => (process.env[name] ?? '') !== '');
const rapidApiKey = keyName === undefined ? '' : (process.env[keyName] ?? '');

console.log(keyName === undefined ? `${keyNames.join(' or ')} not found` : `${keyName} found`);

describe.skipIf(keyName === undefined)('tokapi live', () => {
  it('confirms that @tiktok follows @tiktokcreators by ids in one call', async () => {
    const source = tokapiSource({ http: createHttpClient({ headers: () => ({}) }), rapidApiKey });
    const answer = await askFollows(
      source,
      {
        kind: 'follows',
        performer: handle('tiktok'),
        performerId: accountId(
          'tiktok',
          'MS4wLjABAAAAv7iSuuXDJGDvJkmH_vz1qkDZYo1apxgzaxdBSeIuPiM',
          '107955',
        ),
        target: handle('tiktokcreators'),
        targetId: accountId(
          'tiktok',
          'MS4wLjABAAAAXqqA-cLDC0hfQPIrS5APYNsg04zkl-socWCkqkI3UIOaEe6_Qnokg0GcWpLnMNQP',
          '6551237489917432832',
        ),
      },
      { signal: AbortSignal.timeout(30_000), pageCap: 1 },
    );
    expect(answer).toMatchObject({
      outcome: 'verified',
      evidence: { pagesRead: 1 },
      cost: { unit: 'request', amount: 1 },
    });
  }, 35_000);
});
