import { meResponse } from '@engagement-exchange/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './api-client';
import { ApiRequestError } from './api-error';

const reply = (status: number, body: unknown) => {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    Promise.resolve(Response.json(body, { status })),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
};

const me = {
  user: {
    id: '0b7f4c4e-8a51-4a39-9a43-6d3f4b0f6a11',
    email: 'performer@example.test',
    name: 'Performer',
    role: 'user',
  },
};

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses a successful response with the contract schema', async () => {
    const fetch = reply(200, me);

    await expect(apiRequest(meResponse, '/me')).resolves.toEqual(me);
    expect(fetch).toHaveBeenCalledWith('/api/me', expect.objectContaining({ method: 'GET' }));
  });

  it('sends JSON bodies to the given origin with the given headers', async () => {
    const fetch = reply(200, me);

    await apiRequest(meResponse, '/me', {
      method: 'POST',
      body: { platform: 'tiktok' },
      origin: 'http://127.0.0.1:4000',
      headers: { cookie: 'session=1' },
    });

    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4000/api/me',
      expect.objectContaining({
        method: 'POST',
        body: '{"platform":"tiktok"}',
        headers: { 'content-type': 'application/json', cookie: 'session=1' },
      }),
    );
  });

  it('reports the server time from the date header', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>(() =>
        Promise.resolve(Response.json(me, { headers: { date: 'Wed, 25 Nov 2026 15:57:24 GMT' } })),
      ),
    );
    const onServerTime = vi.fn<(serverMs: number) => void>();

    await apiRequest(meResponse, '/me', { onServerTime });

    expect(onServerTime).toHaveBeenCalledWith(Date.parse('2026-11-25T15:57:24Z'));
  });

  it('turns the error envelope into a typed error with its code and details', async () => {
    reply(429, { error: { code: 'rate_limited', details: { retryAfterSeconds: 12 } } });

    const failure = await apiRequest(meResponse, '/me').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiRequestError);
    expect(failure).toMatchObject({
      status: 429,
      error: { code: 'rate_limited', details: { retryAfterSeconds: 12 } },
    });
  });

  it('gives the request the timeout it asks for', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    reply(200, me);

    await apiRequest(meResponse, '/me', { timeoutMs: 30_000 });

    expect(timeout).toHaveBeenCalledWith(30_000);
    timeout.mockRestore();
  });

  it('refuses a success body that breaks the contract', async () => {
    reply(200, { user: { id: 'not-a-uuid' } });

    await expect(apiRequest(meResponse, '/me')).rejects.toThrow();
  });
});
