import {
  attemptOutcomes,
  claimStates as storedClaimStates,
  platforms as storedPlatforms,
  rejectionReasons as storedRejectionReasons,
} from '@engagement-exchange/db';
import { platforms } from '@engagement-exchange/verification';
import { describe, expect, it } from 'vitest';
import { claimStates, failedAttemptOutcomes, rejectionReasons } from '../../domain/claim.ts';

const sorted = (values: readonly string[]) => [...values].sort();

describe('database check constraints', () => {
  it.each([
    ['platforms', storedPlatforms, platforms],
    ['claim states', storedClaimStates, claimStates],
    ['rejection reasons', storedRejectionReasons, rejectionReasons],
    ['attempt outcomes', attemptOutcomes, failedAttemptOutcomes],
  ])('allow exactly the %s of the domain', (_name, stored, domain) => {
    expect(sorted(stored)).toEqual(sorted(domain));
  });
});
