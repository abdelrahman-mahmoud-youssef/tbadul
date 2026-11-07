import type { Answer } from '../domain/answer.ts';
import type { CheckKind, CheckOf } from '../domain/check.ts';
import type { FollowsAnswer, FollowsBatch } from '../domain/follows-batch.ts';
import type { Platform } from '../domain/platform.ts';
import type { SourceName } from '../domain/source-name.ts';

export interface CallContext {
  readonly signal: AbortSignal;
  readonly pageCap: number;
}

export type FollowsAsk = { readonly kind: 'follows' } & FollowsBatch;

export type SourceCheck = CheckOf<'profile'> | FollowsAsk | CheckOf<'liked'>;

export type SourceCheckOf<K extends CheckKind> = Extract<SourceCheck, { readonly kind: K }>;

interface SourceAnswers {
  readonly profile: Answer<'profile'>;
  readonly follows: FollowsAnswer;
  readonly liked: Answer<'liked'>;
}

export type SourceAnswer<K extends CheckKind> = SourceAnswers[K];

export interface VerificationSource {
  readonly name: SourceName;
  readonly platform: Platform;
  readonly supports: ReadonlySet<CheckKind>;
  answer<K extends CheckKind>(
    check: SourceCheckOf<K>,
    context: CallContext,
  ): Promise<SourceAnswer<K>>;
}
