import { failed, type Answer } from './answer.ts';
import type { FollowsBatch } from './follows-batch.ts';

export const rejectShortList = (
  { performerFollowingCount }: Pick<FollowsBatch, 'performerFollowingCount'>,
  answer: Answer<'follows'>,
): Answer<'follows'> => {
  if (performerFollowingCount === undefined || answer.outcome !== 'not_following') return answer;
  const { entriesRead } = answer.evidence;
  return entriesRead < performerFollowingCount
    ? failed(
        {
          kind: 'incomplete_list',
          message: `read ${String(entriesRead)} of ${String(performerFollowingCount)} following entries`,
        },
        answer.cost,
      )
    : answer;
};
