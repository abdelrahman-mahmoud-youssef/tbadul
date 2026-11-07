import { describe, expect, it } from 'vitest';
import { accountId } from '../../domain/account-id.ts';
import { askFollows } from '../../testing/fake-source.ts';
import { handle } from '../../testing/fixtures.ts';
import { createHttpClient } from '../http/http-client.ts';
import { scraptikSource } from './scraptik-source.ts';

const keyName = 'SCRAPTIK_RAPIDAPI_KEY';
const rapidApiKey = process.env[keyName] ?? '';
const configured = rapidApiKey !== '';

console.log(`${keyName} ${configured ? 'found' : 'not found'}`);

describe.skipIf(!configured)('scraptik live', () => {
  it('confirms that @tiktok follows @tiktokcreators by ids in one call', async () => {
    const source = scraptikSource({ http: createHttpClient({ headers: () => ({}) }), rapidApiKey });
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
