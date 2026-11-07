import { z } from 'zod';
import { ruleReport } from './claims.ts';
import { claimState, isoTime, unavailableOutcome } from './vocabulary.ts';

const bare = <Code extends string>(code: Code) => z.object({ code: z.literal(code) });

const detailed = <Code extends string, Details extends z.ZodRawShape>(
  code: Code,
  details: Details,
) => z.object({ code: z.literal(code), details: z.object(details) });

export const apiError = z.discriminatedUnion('code', [
  detailed('cooldown_active', { retryAt: isoTime, waitMs: z.number().int().nonnegative() }),
  detailed('eligibility_failed', { claimId: z.uuid(), results: z.array(ruleReport) }),
  detailed('limit_reached', { limit: z.number().int().positive() }),
  bare('account_owned_elsewhere'),
  bare('account_already_linked'),
  detailed('account_unavailable', { outcome: unavailableOutcome }),
  bare('pool_exhausted'),
  bare('claim_expired'),
  bare('claim_not_found'),
  detailed('claim_not_verifiable', { state: claimState }),
  detailed('claim_not_cancellable', { state: claimState }),
  detailed('invalid_handle', { reason: z.string() }),
  bare('source_unavailable'),
  bare('conflict'),
  bare('unauthorized'),
  bare('forbidden'),
  detailed('validation_failed', {
    issues: z.array(
      z.object({ path: z.array(z.union([z.string(), z.number()])), code: z.string() }),
    ),
  }),
  detailed('rate_limited', { retryAfterSeconds: z.number().int().nonnegative() }),
  bare('not_found'),
  bare('internal'),
]);
export type ApiError = z.infer<typeof apiError>;

export const errorCode = z.enum([
  'cooldown_active',
  'eligibility_failed',
  'limit_reached',
  'account_owned_elsewhere',
  'account_already_linked',
  'account_unavailable',
  'pool_exhausted',
  'claim_expired',
  'claim_not_found',
  'claim_not_verifiable',
  'claim_not_cancellable',
  'invalid_handle',
  'source_unavailable',
  'conflict',
  'unauthorized',
  'forbidden',
  'validation_failed',
  'rate_limited',
  'not_found',
  'internal',
]);
export type ErrorCode = z.infer<typeof errorCode>;

export const errorEnvelope = z.object({ error: apiError });
export type ErrorEnvelope = z.infer<typeof errorEnvelope>;
