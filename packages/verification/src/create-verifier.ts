import { z } from 'zod';
import { withTimeout } from './adapters/resilience/with-timeout.ts';
import { cachedVerifyWith } from './application/cached-profile.ts';
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
import type { ProfileCache } from './ports/profile-cache.ts';
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
}

export interface Verifier {
  readonly verify: Verify;
  readonly verifyFollowsBatch: VerifyFollowsBatch;
  readonly verifyOwnership: VerifyOwnership;
}

const systemClock: Clock = { now: () => Date.now() };

const discardingSink: MeasurementSink = { record: () => undefined };

export const createVerifier = (config: VerifierConfig, deps: VerifierDeps): Verifier => {
  const { order, timeoutMs, pageCap, confirmNotFollowing, cache } =
    verifierConfigSchema.parse(config);
  const byName = new Map(
    deps.sources.map((source) => [source.name, withTimeout(source, timeoutMs)]),
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
  const clock = deps.clock ?? systemClock;
  const measurements = deps.measurements ?? discardingSink;
  const chainDeps = { sources, clock, measurements, pageCap, confirmNotFollowing };
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
