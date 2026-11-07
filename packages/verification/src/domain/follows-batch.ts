import type { AccountId, ListedAccount } from './account-id.ts';
import { failed, type Answer, type ListUnread } from './answer.ts';
import type { CheckOf } from './check.ts';
import type { Handle } from './handle.ts';

export interface FollowsTarget {
  readonly target: Handle;
  readonly targetId: AccountId;
}

export interface FollowsBatch {
  readonly performer: Handle;
  readonly performerId?: AccountId;
  readonly performerFollowingCount?: number;
  readonly targets: readonly FollowsTarget[];
}

export interface FollowsRead {
  readonly answers: readonly Answer<'follows'>[];
  readonly listed: readonly ListedAccount[];
}

export type FollowsAnswer = ListUnread | FollowsRead;

export const followsBatchOf = ({
  target,
  targetId,
  ...performer
}: CheckOf<'follows'>): FollowsBatch => ({
  ...performer,
  targets: [{ target, targetId }],
});

export const followsChecksOf = ({ targets, ...performer }: FollowsBatch): CheckOf<'follows'>[] =>
  targets.map((target) => ({ ...performer, ...target, kind: 'follows' }));

export const answerAt = (answer: FollowsAnswer, index: number): Answer<'follows'> =>
  'answers' in answer
    ? (answer.answers[index] ??
      failed({ kind: 'unexpected', message: 'the source gave no answer for a target' }))
    : answer;
