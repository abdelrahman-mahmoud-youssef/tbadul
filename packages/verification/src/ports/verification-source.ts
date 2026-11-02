import type { Answer } from '../domain/answer.ts';
import type { CheckKind, CheckOf } from '../domain/check.ts';
import type { Platform } from '../domain/platform.ts';
import type { SourceName } from '../domain/source-name.ts';

export interface CallContext {
  readonly signal: AbortSignal;
  readonly pageCap: number;
}

export interface VerificationSource {
  readonly name: SourceName;
  readonly platform: Platform;
  readonly supports: ReadonlySet<CheckKind>;
  answer<K extends CheckKind>(check: CheckOf<K>, context: CallContext): Promise<Answer<K>>;
}
