import { bulkhead, BulkheadRejectedError } from 'cockatiel';
import { failed } from '../../domain/answer.ts';
import type { CheckKind } from '../../domain/check.ts';
import type {
  CallContext,
  SourceAnswer,
  SourceCheckOf,
  VerificationSource,
} from '../../ports/verification-source.ts';

export interface ConcurrencyLimit {
  readonly limit: number;
  readonly queue: number;
}

export const withBulkhead = (
  source: VerificationSource,
  { limit, queue }: ConcurrencyLimit,
): VerificationSource => {
  const policy = bulkhead(limit, queue);
  return {
    name: source.name,
    platform: source.platform,
    supports: source.supports,
    answer: async <K extends CheckKind>(
      check: SourceCheckOf<K>,
      context: CallContext,
    ): Promise<SourceAnswer<K>> => {
      try {
        return await policy.execute(() => source.answer(check, context), context.signal);
      } catch (error) {
        if (!(error instanceof BulkheadRejectedError)) throw error;
        return failed({
          kind: 'rate_limited',
          message: `${source.name} has ${String(limit)} calls running and ${String(queue)} queued`,
        });
      }
    },
  };
};
