import { errorEnvelope, type ApiError } from '@engagement-exchange/contracts';
import type { z } from 'zod';

const timeoutMs = 10_000;

export class ApiRequestError extends Error {
  readonly error: ApiError;
  readonly status: number;

  constructor(error: ApiError, status: number) {
    super(error.code);
    this.name = 'ApiRequestError';
    this.error = error;
    this.status = status;
  }
}

export interface ApiRequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  readonly origin?: string;
  readonly headers?: Readonly<Record<string, string>>;
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
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload: unknown = response.status === 204 ? undefined : await response.json();
  if (!response.ok) throw new ApiRequestError(errorEnvelope.parse(payload).error, response.status);
  return schema.parse(payload);
};
