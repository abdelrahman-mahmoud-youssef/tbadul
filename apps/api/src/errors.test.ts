import { apiError } from '@engagement-exchange/contracts';
import { NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { toApiError } from './errors.ts';

describe('the error mapping', () => {
  it('answers internal for an unexpected failure', () => {
    const failure = toApiError(new Error('database exploded'));

    expect(failure.status).toBe(500);
    expect(apiError.parse(failure.body)).toEqual({ code: 'internal' });
  });

  it('maps framework exceptions by status', () => {
    expect(toApiError(new NotFoundException()).body).toEqual({ code: 'not_found' });
    expect(toApiError(new PayloadTooLargeException()).body.code).toBe('validation_failed');
  });
});
