import type { ApiError } from '@engagement-exchange/contracts';

export const isTimeout = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'TimeoutError';

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
