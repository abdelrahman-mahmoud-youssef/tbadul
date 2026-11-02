import { z } from 'zod';
import { withTimeout } from './adapters/resilience/with-timeout.ts';
import { verifyWith, type Verify } from './application/chain.ts';
import { verifyOwnershipWith, type VerifyOwnership } from './application/ownership.ts';
import type { Clock } from './ports/clock.ts';
import type { MeasurementSink } from './ports/measurement-sink.ts';
import type { VerificationSource } from './ports/verification-source.ts';

export const verifierConfigSchema = z.object({
  order: z
    .array(z.string().min(1))
    .min(1)
    .refine((names) => new Set(names).size === names.length, 'duplicate source names'),
  timeoutMs: z.number().int().positive(),
  pageCap: z.number().int().positive(),
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
  const { order, timeoutMs, pageCap } = verifierConfigSchema.parse(config);
  const byName = new Map(deps.sources.map((source) => [source.name, source]));
  const sources = order.map((name) => {
    const source = byName.get(name);
    if (source === undefined) throw new Error(`unknown verification source: ${name}`);
    return withTimeout(source, timeoutMs);
  });
  const verify = verifyWith({
    sources,
    clock: deps.clock ?? systemClock,
    measurements: deps.measurements ?? discardingSink,
    pageCap,
  });
  return { verify, verifyOwnership: verifyOwnershipWith(verify) };
};
