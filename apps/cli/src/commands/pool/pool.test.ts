import { describe, expect, it } from 'vitest';
import { missingPool, verificationPool } from './pool.ts';

describe('verificationPool', () => {
  it('uses the flags instead of the environment when flags are given', () => {
    expect(verificationPool(['@verify.one', 'verify.two'], ['env.account'])).toEqual({
      ok: true,
      value: [
        { platform: 'tiktok', value: 'verify.one' },
        { platform: 'tiktok', value: 'verify.two' },
      ],
    });
  });

  it('falls back to the environment when no flag is given', () => {
    expect(verificationPool([], ['env.account'])).toEqual({
      ok: true,
      value: [{ platform: 'tiktok', value: 'env.account' }],
    });
  });

  it('explains how to supply an account when neither is given', () => {
    expect(verificationPool([], [])).toEqual({ ok: false, error: missingPool });
  });

  it('names an invalid account', () => {
    expect(verificationPool(['not valid'], [])).toEqual({
      ok: false,
      error: 'invalid verification account not valid: characters',
    });
  });
});
