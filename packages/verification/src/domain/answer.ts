import type { CheckKind } from './check.ts';
import type { EvidenceByKind } from './evidence.ts';
import type { Cost, SourceError } from './outcome.ts';

export type Answer<K extends CheckKind> =
  | {
      readonly outcome: 'verified' | 'not_following';
      readonly evidence: EvidenceByKind[K];
      readonly cost: Cost;
    }
  | { readonly outcome: 'private' | 'not_found'; readonly cost: Cost }
  | { readonly outcome: 'source_error'; readonly error: SourceError; readonly cost?: Cost };

export const failed = <K extends CheckKind>(error: SourceError, cost?: Cost): Answer<K> =>
  cost === undefined
    ? { outcome: 'source_error', error }
    : { outcome: 'source_error', error, cost };
