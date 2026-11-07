import type { CheckKind } from './check.ts';
import type { EvidenceByKind } from './evidence.ts';
import type { Cost, SourceError } from './outcome.ts';

export interface SourceFailure {
  readonly outcome: 'source_error';
  readonly error: SourceError;
  readonly cost?: Cost;
}

export type Answer<K extends CheckKind> =
  | {
      readonly outcome: 'verified' | 'not_following';
      readonly evidence: EvidenceByKind[K];
      readonly cost: Cost;
    }
  | { readonly outcome: 'private' | 'not_found'; readonly cost: Cost }
  | SourceFailure;

export type ListUnread = Exclude<
  Answer<CheckKind>,
  { readonly outcome: 'verified' | 'not_following' }
>;

export const failed = (error: SourceError, cost?: Cost): SourceFailure =>
  cost === undefined
    ? { outcome: 'source_error', error }
    : { outcome: 'source_error', error, cost };
