import { defineSource, type CheckHandler, type CheckHandlers } from '../adapters/define-source.ts';
import type { Answer } from '../domain/answer.ts';
import type { Check, CheckKind, CheckOf } from '../domain/check.ts';
import type { Platform } from '../domain/platform.ts';
import type { SourceName } from '../domain/source-name.ts';
import type { CallContext, VerificationSource } from '../ports/verification-source.ts';

export type FakeAnswer<K extends CheckKind> = Answer<K> | CheckHandler<K>;

export type FakeAnswers = { readonly [K in CheckKind]?: FakeAnswer<K> };

export interface FakeSource extends VerificationSource {
  readonly calls: readonly Check[];
}

export const fakeSource = (
  name: SourceName,
  answers: FakeAnswers,
  platform: Platform = 'tiktok',
): FakeSource => {
  const calls: Check[] = [];
  const recording =
    <K extends CheckKind>(answer: FakeAnswer<K>): CheckHandler<K> =>
    (check, context) => {
      calls.push(check);
      return typeof answer === 'function' ? answer(check, context) : Promise.resolve(answer);
    };
  const handlers: CheckHandlers = {
    ...(answers.profile && { profile: recording(answers.profile) }),
    ...(answers.follows && { follows: recording(answers.follows) }),
    ...(answers.liked && { liked: recording(answers.liked) }),
  };
  return { ...defineSource({ name, platform }, handlers), calls };
};

export const hangingUntilAborted = <K extends CheckKind>(
  _check: CheckOf<K>,
  context: CallContext,
): Promise<Answer<K>> =>
  new Promise((_, reject) => {
    context.signal.addEventListener('abort', () => {
      reject(new Error('aborted'));
    });
  });

export const neverSettling = <K extends CheckKind>(): Promise<Answer<K>> =>
  new Promise(() => undefined);
