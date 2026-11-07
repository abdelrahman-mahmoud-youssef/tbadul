import type { ApiError } from '@engagement-exchange/contracts';

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
