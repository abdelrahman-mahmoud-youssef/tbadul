import { bioContainsToken, type BioToken } from '../domain/bio-token.ts';
import type { Handle } from '../domain/handle.ts';
import type { Verdict } from '../domain/verdict.ts';
import type { Verify, VerifyOptions } from './chain.ts';

export type VerifyOwnership = (
  subject: Handle,
  token: BioToken,
  options?: VerifyOptions,
) => Promise<Verdict<'profile'>>;

export const verifyOwnershipWith =
  (verify: Verify): VerifyOwnership =>
  async (subject, token, options) => {
    const verdict = await verify({ kind: 'profile', subject }, options);
    if (verdict.outcome !== 'verified') return verdict;
    return bioContainsToken(verdict.evidence.bio, token)
      ? verdict
      : { ...verdict, outcome: 'not_following' };
  };
