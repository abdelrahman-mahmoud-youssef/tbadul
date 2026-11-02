import { failed, type Answer } from '../domain/answer.ts';
import type { Attempt } from '../domain/attempt.ts';
import { checkPlatform, type CheckKind, type CheckOf } from '../domain/check.ts';
import { samePlatform, type Platform } from '../domain/platform.ts';
import type { SourceName } from '../domain/source-name.ts';
import type { Verdict } from '../domain/verdict.ts';
import type { Clock } from '../ports/clock.ts';
import type { MeasurementSink } from '../ports/measurement-sink.ts';
import type { CallContext, VerificationSource } from '../ports/verification-source.ts';

export interface ChainDeps {
  readonly sources: readonly VerificationSource[];
  readonly clock: Clock;
  readonly measurements: MeasurementSink;
  readonly pageCap: number;
}

export interface VerifyOptions {
  readonly signal?: AbortSignal;
}

export type Verify = <K extends CheckKind>(
  check: CheckOf<K>,
  options?: VerifyOptions,
) => Promise<Verdict<K>>;

const serves = (source: VerificationSource, platform: Platform, kind: CheckKind): boolean =>
  samePlatform(source.platform, platform) && source.supports.has(kind);

const askSource = async <K extends CheckKind>(
  source: VerificationSource,
  check: CheckOf<K>,
  context: CallContext,
): Promise<Answer<K>> => {
  try {
    return await source.answer(check, context);
  } catch (error) {
    if (context.signal.aborted) throw error;
    return failed({
      kind: 'unexpected',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

const toAttempt = (
  source: VerificationSource,
  check: CheckKind,
  answer: Answer<CheckKind>,
  startedAt: number,
  finishedAt: number,
): Attempt => ({
  source: source.name,
  platform: source.platform,
  check,
  outcome: answer.outcome,
  ...(answer.outcome === 'source_error' && { error: answer.error }),
  ...(answer.cost && { cost: answer.cost }),
  startedAt,
  latencyMs: finishedAt - startedAt,
});

const settle = <K extends CheckKind>(
  check: CheckOf<K>,
  answer: Exclude<Answer<K>, { outcome: 'source_error' }>,
  source: SourceName,
  attempts: readonly Attempt[],
): Verdict<K> =>
  'evidence' in answer
    ? { outcome: answer.outcome, evidence: answer.evidence, source, check, attempts }
    : { outcome: answer.outcome, source, check, attempts };

export const verifyWith =
  (deps: ChainDeps): Verify =>
  async (check, options = {}) => {
    const platform = checkPlatform(check);
    const context: CallContext = {
      signal: options.signal ?? new AbortController().signal,
      pageCap: deps.pageCap,
    };
    const attempts: Attempt[] = [];
    for (const source of deps.sources) {
      if (!serves(source, platform, check.kind)) continue;
      const startedAt = deps.clock.now();
      const answer = await askSource(source, check, context);
      const attempt = toAttempt(source, check.kind, answer, startedAt, deps.clock.now());
      attempts.push(attempt);
      deps.measurements.record(attempt);
      if (answer.outcome !== 'source_error') return settle(check, answer, source.name, attempts);
    }
    return { outcome: 'source_error', check, attempts };
  };
