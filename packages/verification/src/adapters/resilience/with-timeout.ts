import { timeout, TimeoutStrategy } from 'cockatiel';
import { failed } from '../../domain/answer.ts';
import type { CheckKind } from '../../domain/check.ts';
import type {
  CallContext,
  SourceAnswer,
  SourceCheckOf,
  VerificationSource,
} from '../../ports/verification-source.ts';

export const withTimeout = (source: VerificationSource, timeoutMs: number): VerificationSource => {
  const policy = timeout(timeoutMs, TimeoutStrategy.Aggressive);
  return {
    name: source.name,
    platform: source.platform,
    supports: source.supports,
    answer: async <K extends CheckKind>(
      check: SourceCheckOf<K>,
      context: CallContext,
    ): Promise<SourceAnswer<K>> => {
      let inner: AbortSignal | undefined;
      try {
        return await policy.execute(({ signal }) => {
          inner = signal;
          return source.answer(check, { ...context, signal });
        }, context.signal);
      } catch (error) {
        if (inner?.aborted && !context.signal.aborted) {
          return failed({ kind: 'timeout', message: `${source.name} exceeded ${timeoutMs} ms` });
        }
        throw error;
      }
    },
  };
};
