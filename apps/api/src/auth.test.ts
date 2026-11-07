import { errorEnvelope, healthResponse, meResponse } from '@engagement-exchange/contracts';
import { describe, expect, it } from 'vitest';
import {
  call,
  databaseUrl,
  parsed,
  signIn,
  signUp,
  startApi,
  webOrigin,
} from './testing/harness.ts';

describe.skipIf(databaseUrl === null)('sessions', () => {
  it('signs up, signs in and answers me for each session', async () => {
    const test = await startApi();
    try {
      const user = await signUp(test.app);
      const cookie = await signIn(test.app, user.email);

      const me = await call(test.app, 'GET', '/api/me', { cookie });

      expect(cookie).not.toBe(user.cookie);
      expect(parsed(meResponse, me).user).toMatchObject({ email: user.email, role: 'user' });
    } finally {
      await test.close();
    }
  });

  it('passes a form sign-in through to Better Auth untouched', async () => {
    const test = await startApi();
    try {
      const user = await signUp(test.app);

      const signedIn = await test.app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        headers: { origin: webOrigin, 'content-type': 'application/x-www-form-urlencoded' },
        payload: new URLSearchParams({
          email: user.email,
          password: 'correct horse battery staple',
        }).toString(),
      });

      expect(signedIn.statusCode).toBe(200);
      expect(String(signedIn.headers['set-cookie'])).toContain('session_token=');
    } finally {
      await test.close();
    }
  });

  it('refuses every endpoint but health without a session', async () => {
    const test = await startApi();
    try {
      const refused = await Promise.all(
        [['GET', '/api/me']].map(([method, url]) => call(test.app, method as 'GET', url ?? '')),
      );
      const health = await call(test.app, 'GET', '/api/health');

      for (const reply of refused) {
        expect(reply.status).toBe(401);
        expect(errorEnvelope.parse(reply.body).error).toEqual({ code: 'unauthorized' });
      }
      expect(parsed(healthResponse, health)).toEqual({
        status: 'ok',
        database: 'up',
        sources: {
          configured: ['ensemble', 'scraptik'],
          leftOut: [],
          orders: {
            profile: ['ensemble'],
            follows: ['ensemble', 'scraptik'],
            liked: ['ensemble'],
          },
        },
      });
    } finally {
      await test.close();
    }
  });

  it('answers a preflight from a configured origin with credentials allowed', async () => {
    const test = await startApi();
    try {
      const preflight = await test.app.inject({
        method: 'OPTIONS',
        url: '/api/claims',
        headers: { origin: webOrigin, 'access-control-request-method': 'POST' },
      });

      expect(preflight.headers['access-control-allow-origin']).toBe(webOrigin);
      expect(preflight.headers['access-control-allow-credentials']).toBe('true');
    } finally {
      await test.close();
    }
  });

  it('logs requests without cookies or credentials', async () => {
    const lines: string[] = [];
    const test = await startApi({ LOG_LEVEL: 'info' }, { write: (line) => lines.push(line) });
    try {
      const user = await signUp(test.app);
      await call(test.app, 'GET', '/api/me', { cookie: user.cookie });

      const logged = lines.join('\n');
      expect(lines.length).toBeGreaterThan(0);
      expect(logged).not.toContain(user.cookie.split('=')[1]);
      expect(logged).not.toContain(user.email);
      expect(logged).not.toContain('correct horse');
    } finally {
      await test.close();
    }
  });
});

describe('health without a database', () => {
  it('answers degraded with 503', async () => {
    const test = await startApi({ DATABASE_URL: 'postgres://nobody:nothing@127.0.0.1:9/none' });
    try {
      const health = await call(test.app, 'GET', '/api/health');

      expect(health.status).toBe(503);
      expect(parsed(healthResponse, health)).toMatchObject({
        status: 'degraded',
        database: 'down',
      });
    } finally {
      await test.close();
    }
  });
});
