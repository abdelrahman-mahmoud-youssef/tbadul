import { meResponse, type MeResponse } from '@engagement-exchange/contracts';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { env } from '@/env';
import { ApiRequestError, apiRequest } from './api-client';

export const currentSession = cache(async (): Promise<MeResponse | null> => {
  const cookie = (await cookies()).toString();
  try {
    return await apiRequest(meResponse, '/me', { origin: env.API_ORIGIN, headers: { cookie } });
  } catch (error) {
    if (error instanceof ApiRequestError && error.error.code === 'unauthorized') return null;
    throw error;
  }
});
