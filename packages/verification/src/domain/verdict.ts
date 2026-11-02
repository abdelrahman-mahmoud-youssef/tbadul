import type { Attempt } from './attempt.ts';
import type { CheckKind, CheckOf } from './check.ts';
import type { EvidenceByKind } from './evidence.ts';
import type { SourceName } from './source-name.ts';

export type Verdict<K extends CheckKind> = (
  | {
      readonly outcome: 'verified' | 'not_following';
      readonly evidence: EvidenceByKind[K];
      readonly source: SourceName;
    }
  | { readonly outcome: 'private' | 'not_found'; readonly source: SourceName }
  | { readonly outcome: 'source_error' }
) & { readonly check: CheckOf<K>; readonly attempts: readonly Attempt[] };
