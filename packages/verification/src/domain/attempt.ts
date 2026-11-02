import type { CheckKind } from './check.ts';
import type { Cost, Outcome, SourceError } from './outcome.ts';
import type { Platform } from './platform.ts';
import type { SourceName } from './source-name.ts';

export interface Attempt {
  readonly source: SourceName;
  readonly platform: Platform;
  readonly check: CheckKind;
  readonly outcome: Outcome;
  readonly error?: SourceError;
  readonly cost?: Cost;
  readonly startedAt: number;
  readonly latencyMs: number;
}
