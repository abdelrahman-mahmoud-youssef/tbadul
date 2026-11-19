import { cookies } from 'next/headers';
import type { z } from 'zod';
import { env } from '@/env';
import { apiRequest, type ApiRequestOptions } from './api-client';

export const serverRequest = async <T>(
  schema: z.ZodType<T>,
  path: `/${string}`,
  options: Pick<ApiRequestOptions, 'method' | 'body'> = {},
): Promise<T> =>
  apiRequest(schema, path, {
    ...options,
    origin: env.API_ORIGIN,
    headers: { cookie: (await cookies()).toString() },
  });
