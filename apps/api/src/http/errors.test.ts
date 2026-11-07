import { apiError } from '@engagement-exchange/contracts';
import type { ClaimError } from '@engagement-exchange/social-accounts';
import { NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { claimFailure, toApiError } from './errors.ts';

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

  it('maps every claim error to a contract error', () => {
    const errors: ClaimError[] = [
      { kind: 'invalid_handle', reason: 'characters' },
      { kind: 'claim_limit_reached', limit: 5 },
      { kind: 'account_already_claimed' },
      { kind: 'account_already_linked' },
      { kind: 'version_conflict' },
      { kind: 'claim_not_found' },
      { kind: 'claim_not_verifiable', state: 'verified' },
      { kind: 'claim_not_cancellable', state: 'expired' },
      { kind: 'claim_expired' },
      { kind: 'cooldown_active', retryAt: 0, waitMs: 1 },
      { kind: 'account_unavailable', outcome: 'private' },
      { kind: 'source_unavailable' },
    ];

    expect(errors.map((error) => apiError.parse(claimFailure(error).body).code)).toEqual([
      'invalid_handle',
      'limit_reached',
      'account_owned_elsewhere',
      'account_already_linked',
      'conflict',
      'claim_not_found',
      'claim_not_verifiable',
      'claim_not_cancellable',
      'claim_expired',
      'cooldown_active',
      'account_unavailable',
      'source_unavailable',
    ]);
  });
});
