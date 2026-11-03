import { z } from 'zod';
import { withTimeout } from './adapters/resilience/with-timeout.ts';
import { verifyWith, type SourcesByKind, type Verify } from './application/chain.ts';
import { verifyOwnershipWith, type VerifyOwnership } from './application/ownership.ts';
import type { Clock } from './ports/clock.ts';
import type { MeasurementSink } from './ports/measurement-sink.ts';
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
});

export type VerifierConfig = z.input<typeof verifierConfigSchema>;

export interface VerifierDeps {
  readonly sources: readonly VerificationSource[];
  readonly clock?: Clock;
  readonly measurements?: MeasurementSink;
}

export interface Verifier {
  readonly verify: Verify;
  readonly verifyOwnership: VerifyOwnership;
}

const systemClock: Clock = { now: () => Date.now() };

const discardingSink: MeasurementSink = { record: () => undefined };

export const createVerifier = (config: VerifierConfig, deps: VerifierDeps): Verifier => {
  const { order, timeoutMs, pageCap, confirmNotFollowing } = verifierConfigSchema.parse(config);
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
  const verify = verifyWith({
    sources,
    clock: deps.clock ?? systemClock,
    measurements: deps.measurements ?? discardingSink,
    pageCap,
    confirmNotFollowing,
  });
  return { verify, verifyOwnership: verifyOwnershipWith(verify) };
};
