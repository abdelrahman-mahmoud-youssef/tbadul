import type { Attempt } from '../domain/attempt.ts';
import type { CheckKind, CheckOf } from '../domain/check.ts';
import type { Verdict } from '../domain/verdict.ts';
import type { Clock } from '../ports/clock.ts';
import type { MeasurementSink } from '../ports/measurement-sink.ts';
import type { CachedProfile, ProfileCache } from '../ports/profile-cache.ts';
import type { Verify, VerifyOptions } from './chain.ts';

export interface ProfileCacheTtl {
  readonly handleTtlMs: number;
  readonly statsTtlMs: number;
}

export interface CachedVerifyDeps {
  readonly verify: Verify;
  readonly cache: ProfileCache;
  readonly ttl: ProfileCacheTtl;
  readonly clock: Clock;
  readonly measurements: MeasurementSink;
}

const cacheSource = 'cache';

const lookup = async (
  deps: CachedVerifyDeps,
  check: CheckOf<'profile'>,
  now: number,
): Promise<CachedProfile | undefined> => {
  if (check.subjectId !== undefined) return deps.cache.byId(check.subjectId);
  const [row, ...others] = await deps.cache.byHandle(check.subject);
  if (row?.handleSeenAt == null || others.length > 0) return undefined;
  return now - row.handleSeenAt <= deps.ttl.handleTtlMs ? row : undefined;
};

const verifyProfile = async (
  deps: CachedVerifyDeps,
  check: CheckOf<'profile'>,
  options: VerifyOptions,
): Promise<Verdict<'profile'>> => {
  const startedAt = deps.clock.now();
  const cached = await lookup(deps, check, startedAt);
  const maxAgeMs = options.maxAgeMs ?? deps.ttl.statsTtlMs;
  if (cached?.fetchedAt != null && startedAt - cached.fetchedAt <= maxAgeMs) {
    const attempt: Attempt = {
      source: cacheSource,
      platform: check.subject.platform,
      check: 'profile',
      outcome: 'verified',
      startedAt,
      latencyMs: deps.clock.now() - startedAt,
    };
    deps.measurements.record(attempt);
    return {
      outcome: 'verified',
      evidence: cached.evidence,
      source: cacheSource,
      check,
      attempts: [attempt],
    };
  }
  const verdict = await deps.verify(check, options);
  if (verdict.outcome === 'verified') {
    await deps.cache.store({
      handle: check.subject,
      evidence: verdict.evidence,
      source: verdict.source,
      fetchedAt: deps.clock.now(),
    });
  }
  return verdict;
};

export const cachedVerifyWith =
  (deps: CachedVerifyDeps): Verify =>
  <K extends CheckKind>(check: CheckOf<K>, options: VerifyOptions = {}) =>
    check.kind === 'profile'
      ? (verifyProfile(deps, check as CheckOf<'profile'>, options) as Promise<Verdict<K>>)
      : deps.verify(check, options);
