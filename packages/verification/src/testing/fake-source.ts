import { defineSource, type CheckHandler, type CheckHandlers } from '../adapters/define-source.ts';
import { perRequest, scanFollowing } from '../adapters/list-scan.ts';
import type { ListedAccount } from '../domain/account-id.ts';
import type { Answer } from '../domain/answer.ts';
import type { Check, CheckOf } from '../domain/check.ts';
import {
  answerAt,
  followsBatchOf,
  followsChecksOf,
  type FollowsAnswer,
} from '../domain/follows-batch.ts';
import type { Platform } from '../domain/platform.ts';
import { ok } from '../domain/result.ts';
import type { SourceName } from '../domain/source-name.ts';
import type { CallContext, FollowsAsk, VerificationSource } from '../ports/verification-source.ts';

type FollowsReply = Answer<'follows'> | FollowsAnswer;

export type FollowsHandler = (check: FollowsAsk, context: CallContext) => Promise<FollowsReply>;

export interface FakeAnswers {
  readonly profile?: Answer<'profile'> | CheckHandler<'profile'>;
  readonly follows?: FollowsReply | FollowsHandler;
  readonly liked?: Answer<'liked'> | CheckHandler<'liked'>;
}

export interface FakeSource extends VerificationSource {
  readonly calls: readonly Check[];
}

const perTarget = (check: FollowsAsk, reply: FollowsReply): FollowsAnswer =>
  'answers' in reply ? reply : { answers: check.targets.map(() => reply), listed: [] };

export const fakeSource = (
  name: SourceName,
  answers: FakeAnswers,
  platform: Platform = 'tiktok',
): FakeSource => {
  const calls: Check[] = [];
  const { profile, follows, liked } = answers;
  const profileHandler: CheckHandler<'profile'> | undefined =
    profile &&
    ((check, context) => {
      calls.push(check);
      return typeof profile === 'function' ? profile(check, context) : Promise.resolve(profile);
    });
  const followsHandler: CheckHandler<'follows'> | undefined =
    follows &&
    (async (check, context) => {
      calls.push(...followsChecksOf(check));
      return perTarget(
        check,
        typeof follows === 'function' ? await follows(check, context) : follows,
      );
    });
  const likedHandler: CheckHandler<'liked'> | undefined =
    liked &&
    ((check, context) => {
      calls.push(check);
      return typeof liked === 'function' ? liked(check, context) : Promise.resolve(liked);
    });
  const handlers: CheckHandlers = {
    ...(profileHandler && { profile: profileHandler }),
    ...(followsHandler && { follows: followsHandler }),
    ...(likedHandler && { liked: likedHandler }),
  };
  return { ...defineSource({ name, platform }, handlers), calls };
};

export const followingPages =
  (...pages: readonly (readonly ListedAccount[])[]): FollowsHandler =>
  (check, context) =>
    scanFollowing(
      context,
      (cursor: number | undefined) => {
        const page = cursor ?? 0;
        return Promise.resolve(
          ok({ items: pages[page] ?? [], ...(page + 1 < pages.length && { next: page + 1 }) }),
        );
      },
      check.targets,
      (entry) => entry,
      perRequest(0),
    );

export const askFollows = async (
  source: VerificationSource,
  check: CheckOf<'follows'>,
  context: CallContext,
): Promise<Answer<'follows'>> =>
  answerAt(await source.answer({ ...followsBatchOf(check), kind: 'follows' }, context), 0);

export const hangingUntilAborted = (_check: unknown, context: CallContext): Promise<never> =>
  new Promise((_, reject) => {
    context.signal.addEventListener('abort', () => {
      reject(new Error('aborted'));
    });
  });

export const neverSettling = (): Promise<never> => new Promise(() => undefined);
