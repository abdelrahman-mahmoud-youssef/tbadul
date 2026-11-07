import { describe, expect, expectTypeOf, it } from 'vitest';
import { apiError, errorCode, errorEnvelope, type ApiError, type ErrorCode } from './errors.ts';

describe('the error contract', () => {
  it('has one envelope shape per stable code', () => {
    expectTypeOf<ApiError['code']>().toEqualTypeOf<ErrorCode>();
    expect(apiError.options.map((option) => option.shape.code.value)).toEqual(errorCode.options);
  });

  it('accepts structured details and refuses free text in their place', () => {
    expect(
      errorEnvelope.safeParse({ error: { code: 'limit_reached', details: { limit: 5 } } }).success,
    ).toBe(true);
    expect(
      errorEnvelope.safeParse({ error: { code: 'limit_reached', details: 'too many accounts' } })
        .success,
    ).toBe(false);
  });
});
