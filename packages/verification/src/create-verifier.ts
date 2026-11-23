import { z } from 'zod';
import { withBudget, type BudgetReached } from './adapters/resilience/with-budget.ts';
import { withBulkhead } from './adapters/resilience/with-bulkhead.ts';
import { withTimeout } from './adapters/resilience/with-timeout.ts';
import { cachedVerifyWith } from './application/cached-profile.ts';
import { followingCache } from './application/following-cache.ts';
import {
  verifyFollowsBatchWith,
  verifyWith,
  type SourcesByKind,
  type Verify,
  type VerifyFollowsBatch,
} from './application/chain.ts';
import { verifyOwnershipWith, type VerifyOwnership } from './application/ownership.ts';
import type { Clock } from './ports/clock.ts';
import type { MeasurementSink } from './ports/measurement-sink.ts';
import { costUnits } from './domain/outcome.ts';
import type { ProfileCache } from './ports/profile-cache.ts';
import type { SpendLedger } from './ports/spend-ledger.ts';
import type { VerificationSource } from './ports/verification-source.ts';

const sourceOrder = z
  .array(z.string().min(1))
  .min(1)
  .refine((names) => new Set(names).size === names.length, 'duplicate source names');

export const verifierConfigSchema = z.object({
  order: z.object({ profile: sourceOrder, follows: sourceOrder, liked: sourceOrder }),
  timeoutMs: z.number().int().positive(),
  pageCap: z.number().int().positive(),
  confirmNotFollowing: z.boolean().default(true),
  confirmNotFound: z.boolean().default(true),
  listCacheTtlMs: z.number().int().nonnegative().default(30_000),
  budgets: z
    .record(z.string().min(1), z.object({ unit: z.enum(costUnits), daily: z.number().positive() }))
    .default({}),
  concurrency: z
    .record(
      z.string().min(1),
      z.object({
        limit: z.number().int().positive(),
        queue: z.number().int().nonnegative().default(0),
      }),
    )
    .default({}),
  cache: z
    .object({
      handleTtlMs: z.number().int().positive().default(86_400_000),
      statsTtlMs: z.number().int().positive().default(21_600_000),
    })
    .prefault({}),
});

export type VerifierConfig = z.input<typeof verifierConfigSchema>;

export interface VerifierDeps {
  readonly sources: readonly VerificationSource[];
  readonly clock?: Clock;
  readonly measurements?: MeasurementSink;
  readonly profileCache?: ProfileCache;
  readonly spendLedger?: SpendLedger;
  readonly onBudgetReached?: BudgetReached;
}

export interface Verifier {
  readonly verify: Verify;
  readonly verifyFollowsBatch: VerifyFollowsBatch;
  readonly verifyOwnership: VerifyOwnership;
}

const systemClock: Clock = { now: () => Date.now() };

const discardingSink: MeasurementSink = { record: () => undefined };

export const createVerifier = (config: VerifierConfig, deps: VerifierDeps): Verifier => {
  const {
    order,
    timeoutMs,
    pageCap,
    confirmNotFollowing,
    confirmNotFound,
    listCacheTtlMs,
    budgets,
    concurrency,
    cache,
  } = verifierConfigSchema.parse(config);
  const clock = deps.clock ?? systemClock;
  const unknown = (names: readonly string[]) =>
    names.find((name) => !deps.sources.some((source) => source.name === name));
  const unbudgeted = unknown(Object.keys(budgets));
  if (unbudgeted !== undefined) throw new Error(`budget for unknown source: ${unbudgeted}`);
  const unlimited = unknown(Object.keys(concurrency));
  if (unlimited !== undefined) throw new Error(`concurrency for unknown source: ${unlimited}`);
  const budgetDeps = {
    ...(deps.spendLedger !== undefined && { ledger: deps.spendLedger }),
    clock,
    onReached: deps.onBudgetReached ?? (() => undefined),
  };
  const byName = new Map(
    deps.sources.map((source) => {
      const timed = withTimeout(source, timeoutMs);
      const limit = concurrency[source.name];
      const limited = limit === undefined ? timed : withBulkhead(timed, limit);
      const budget = budgets[source.name];
      return [
        source.name,
        budget === undefined ? limited : withBudget(limited, budget, budgetDeps),
      ];
    }),
  );
  const resolve = (names: readonly string[]) =>
    names.map((name) => {
      const source = byName.get(name);
      if (source === undefined) throw new Error(`unknown verification source: ${name}`);
      return source;
    });
  const sources: SourcesByKind = {
    profile: resolve(order.profile),
    follows: resolve(order.follows),
    liked: resolve(order.liked),
  };
  const measurements = deps.measurements ?? discardingSink;
  const chainDeps = {
    sources,
    clock,
    measurements,
    pageCap,
    confirmNotFollowing,
    confirmNotFound,
    ...(listCacheTtlMs > 0 && { following: followingCache(listCacheTtlMs, clock) }),
  };
  const chain = verifyWith(chainDeps);
  const verify =
    deps.profileCache === undefined
      ? chain
      : cachedVerifyWith({
          verify: chain,
          cache: deps.profileCache,
          ttl: cache,
          clock,
          measurements,
        });
  return {
    verify,
    verifyFollowsBatch: verifyFollowsBatchWith(chainDeps),
    verifyOwnership: verifyOwnershipWith(chain),
  };
};
