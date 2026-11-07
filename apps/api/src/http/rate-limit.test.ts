import { errorEnvelope } from '@engagement-exchange/contracts';
import { describe, expect, it } from 'vitest';
import { call, databaseUrl, signUp, startApi, verifyClaim } from '../testing/harness.ts';

const unknownClaim = '0196f1c4-7a1e-7000-8000-000000000000';

describe.skipIf(databaseUrl === null)('rate limits', () => {
  it('limits each user per endpoint and never counts an anonymous caller', async () => {
    const test = await startApi({ RATE_LIMIT_MAX: '2', RATE_LIMIT_WINDOW_MS: '60000' });
    try {
      const limited = await signUp(test.app);
      const other = await signUp(test.app);

      const replies = [];
      for (let index = 0; index < 3; index += 1) {
        replies.push(await verifyClaim(test, limited, unknownClaim));
      }
      const start = await call(test.app, 'POST', '/api/claims', {
        cookie: limited.cookie,
        body: { platform: 'tiktok' },
      });
      const otherUser = await verifyClaim(test, other, unknownClaim);
      const anonymous = await call(test.app, 'POST', `/api/claims/${unknownClaim}/verify`);

      expect(replies.map((reply) => reply.status)).toEqual([404, 404, 429]);
      expect(errorEnvelope.parse(replies[2]?.body).error).toEqual({
        code: 'rate_limited',
        details: { retryAfterSeconds: 60 },
      });
      expect(start.status).toBe(400);
      expect(otherUser.status).toBe(404);
      expect(anonymous.status).toBe(401);
    } finally {
      await test.close();
    }
  });
});
