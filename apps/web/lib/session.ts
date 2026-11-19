import { meResponse, type MeResponse } from '@engagement-exchange/contracts';
import { cache } from 'react';
import { ApiRequestError } from './api-error';
import { serverRequest } from './server-api';

export const currentSession = cache(async (): Promise<MeResponse | null> => {
  try {
    return await serverRequest(meResponse, '/me');
  } catch (error) {
    if (error instanceof ApiRequestError && error.error.code === 'unauthorized') return null;
    throw error;
  }
});
