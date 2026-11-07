import { failed, type Answer } from '../domain/answer.ts';
import type { Attempt } from '../domain/attempt.ts';
import { checkPlatform, type Check, type CheckKind, type CheckOf } from '../domain/check.ts';
import {
  answerAt,
  followsBatchOf,
  followsChecksOf,
  type FollowsBatch,
} from '../domain/follows-batch.ts';
import type { Outcome } from '../domain/outcome.ts';
import { samePlatform, type Platform } from '../domain/platform.ts';
import { rejectShortList } from '../domain/short-list.ts';
import type { SourceName } from '../domain/source-name.ts';
import type { Verdict } from '../domain/verdict.ts';
import type { FollowingCache } from './following-cache.ts';
import type { Clock } from '../ports/clock.ts';
import type { MeasurementSink } from '../ports/measurement-sink.ts';
import type {
  CallContext,
  SourceAnswer,
  SourceCheckOf,
  VerificationSource,
} from '../ports/verification-source.ts';

export type SourcesByKind = Readonly<Record<CheckKind, readonly VerificationSource[]>>;

export interface ChainDeps {
  readonly sources: SourcesByKind;
  readonly clock: Clock;
  readonly measurements: MeasurementSink;
  readonly pageCap: number;
  readonly confirmNotFollowing: boolean;
  readonly following?: FollowingCache;
}

export interface VerifyOptions {
  readonly signal?: AbortSignal;
  readonly maxAgeMs?: number;
}

export type Verify = <K extends CheckKind>(
  check: CheckOf<K>,
  options?: VerifyOptions,
) => Promise<Verdict<K>>;

export type VerifyFollowsBatch = (
  batch: FollowsBatch,
  options?: VerifyOptions,
) => Promise<readonly Verdict<'follows'>[]>;

type FollowsVerdictAt = (check: CheckOf<'follows'>, index: number) => Verdict<'follows'>;

const leastSettledFirst: readonly Outcome[] = [
  'source_error',
  'not_found',
  'private',
  'not_following',
  'verified',
];

const serves = (source: VerificationSource, platform: Platform, kind: CheckKind): boolean =>
  samePlatform(source.platform, platform) && source.supports.has(kind);

const callContext = (deps: ChainDeps, options: VerifyOptions): CallContext => ({
  signal: options.signal ?? new AbortController().signal,
  pageCap: deps.pageCap,
});

const askSource = async <K extends CheckKind>(
  source: VerificationSource,
  check: SourceCheckOf<K>,
  context: CallContext,
): Promise<SourceAnswer<K>> => {
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

const awaitsConfirmation = (
  deps: ChainDeps,
  answer: Answer<CheckKind>,
  eligible: readonly VerificationSource[],
): boolean => answer.outcome === 'not_following' && deps.confirmNotFollowing && eligible.length > 1;

const leastSettled = (answers: readonly Answer<'follows'>[]): Answer<'follows'> =>
  answers.reduce((least, answer) =>
    leastSettledFirst.indexOf(answer.outcome) < leastSettledFirst.indexOf(least.outcome)
      ? answer
      : least,
  );

const cacheSource = 'cache';

const fromCache = (
  deps: ChainDeps,
  batch: FollowsBatch,
  attempts: Attempt[],
): Map<number, (check: CheckOf<'follows'>) => Verdict<'follows'>> => {
  const settled = new Map<number, (check: CheckOf<'follows'>) => Verdict<'follows'>>();
  const { following } = deps;
  const { performerId } = batch;
  if (following === undefined || performerId === undefined) return settled;
  batch.targets.forEach(({ targetId }, index) => {
    const listed = following.follows(performerId, targetId);
    if (listed === undefined) return;
    const evidence = { pagesRead: 0, listExhausted: false, entriesRead: listed.length };
    settled.set(index, (check) => ({
      outcome: 'verified',
      evidence,
      source: cacheSource,
      check,
      attempts,
    }));
  });
  if (settled.size > 0) {
    const now = deps.clock.now();
    const attempt: Attempt = {
      source: cacheSource,
      platform: batch.performer.platform,
      check: 'follows',
      outcome: 'verified',
      startedAt: now,
      latencyMs: 0,
    };
    attempts.push(attempt);
    deps.measurements.record(attempt);
  }
  return settled;
};

const verifyFollows = async (
  deps: ChainDeps,
  batch: FollowsBatch,
  options: VerifyOptions,
): Promise<FollowsVerdictAt> => {
  const context = callContext(deps, options);
  const attempts: Attempt[] = [];
  const eligible = deps.sources.follows.filter((source) =>
    serves(source, batch.performer.platform, 'follows'),
  );
  const settled = fromCache(deps, batch, attempts);
  const awaiting = new Set<number>();
  for (const source of eligible) {
    const open = batch.targets.flatMap((target, index) =>
      settled.has(index) ? [] : [{ target, index }],
    );
    if (open.length === 0) break;
    const startedAt = deps.clock.now();
    const reply = await askSource(
      source,
      { ...batch, kind: 'follows', targets: open.map(({ target }) => target) },
      context,
    );
    if ('listed' in reply && batch.performerId !== undefined) {
      deps.following?.store(batch.performerId, reply.listed);
    }
    const answered = open.map(({ index }, position) => ({
      index,
      answer: rejectShortList(batch, answerAt(reply, position)),
    }));
    const attempt = toAttempt(
      source,
      'follows',
      leastSettled(answered.map(({ answer }) => answer)),
      startedAt,
      deps.clock.now(),
    );
    attempts.push(attempt);
    deps.measurements.record(attempt);
    for (const { index, answer } of answered) {
      if (answer.outcome === 'source_error') continue;
      if (awaitsConfirmation(deps, answer, eligible) && !awaiting.has(index)) {
        awaiting.add(index);
        continue;
      }
      settled.set(index, (check) => settle(check, answer, source.name, attempts));
    }
  }
  return (check, index) =>
    settled.get(index)?.(check) ?? { outcome: 'source_error', check, attempts };
};

export const verifyFollowsBatchWith =
  (deps: ChainDeps): VerifyFollowsBatch =>
  async (batch, options = {}) => {
    const verdictAt = await verifyFollows(deps, batch, options);
    return followsChecksOf(batch).map(verdictAt);
  };

const verifyOne = async (
  deps: ChainDeps,
  check: CheckOf<'profile' | 'liked'>,
  options: VerifyOptions,
): Promise<Verdict<'profile' | 'liked'>> => {
  const context = callContext(deps, options);
  const attempts: Attempt[] = [];
  const eligible = deps.sources[check.kind].filter((source) =>
    serves(source, checkPlatform(check), check.kind),
  );
  let awaitingConfirmation = false;
  for (const source of eligible) {
    const startedAt = deps.clock.now();
    const answer = await askSource(source, check, context);
    const attempt = toAttempt(source, check.kind, answer, startedAt, deps.clock.now());
    attempts.push(attempt);
    deps.measurements.record(attempt);
    if (answer.outcome === 'source_error') continue;
    const confirm =
      check.kind !== 'profile' &&
      awaitsConfirmation(deps, answer, eligible) &&
      !awaitingConfirmation;
    if (!confirm) return settle(check, answer, source.name, attempts);
    awaitingConfirmation = true;
  }
  return { outcome: 'source_error', check, attempts };
};

export const verifyWith = (deps: ChainDeps): Verify => {
  const verify = async (check: Check, options: VerifyOptions = {}) =>
    check.kind === 'follows'
      ? (await verifyFollows(deps, followsBatchOf(check), options))(check, 0)
      : verifyOne(deps, check, options);
  return verify as Verify;
};
