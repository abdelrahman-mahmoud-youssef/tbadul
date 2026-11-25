import { errorEnvelope } from '@engagement-exchange/contracts';
import type { z } from 'zod';
import { ApiRequestError } from './api-error';

const defaultTimeoutMs = 10_000;

export const slowCallTimeoutMs = 30_000;

export interface ApiRequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  readonly origin?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly onServerTime?: (serverMs: number) => void;
  readonly timeoutMs?: number;
}

export const apiRequest = async <T>(
  schema: z.ZodType<T>,
  path: `/${string}`,
  options: ApiRequestOptions = {},
): Promise<T> => {
  const response = await fetch(`${options.origin ?? ''}/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body !== undefined && { 'content-type': 'application/json' }),
      ...options.headers,
    },
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
    cache: 'no-store',
    signal: AbortSignal.timeout(options.timeoutMs ?? defaultTimeoutMs),
  });
  const serverTime = Date.parse(response.headers.get('date') ?? '');
  if (!Number.isNaN(serverTime)) options.onServerTime?.(serverTime);
  const payload: unknown = response.status === 204 ? undefined : await response.json();
  if (!response.ok) throw new ApiRequestError(errorEnvelope.parse(payload).error, response.status);
  return schema.parse(payload);
};
