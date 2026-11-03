import type { SourcesByKind } from '../application/chain.ts';
import type { VerificationSource } from '../ports/verification-source.ts';

export const everyKind = (sources: readonly VerificationSource[]): SourcesByKind => ({
  profile: sources,
  follows: sources,
  liked: sources,
});

export const sameOrder = (names: readonly string[]) => ({
  profile: [...names],
  follows: [...names],
  liked: [...names],
});
