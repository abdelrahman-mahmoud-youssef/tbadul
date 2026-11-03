import { failed, type Answer } from './answer.ts';
import type { Check, CheckKind, CheckOf } from './check.ts';

const shortened = (check: Check, answer: Answer<CheckKind>): Answer<CheckKind> => {
  if (check.kind !== 'follows' || check.performerFollowingCount === undefined) return answer;
  if (answer.outcome !== 'not_following' || !('entriesRead' in answer.evidence)) return answer;
  const { entriesRead } = answer.evidence;
  return entriesRead < check.performerFollowingCount
    ? failed(
        {
          kind: 'incomplete_list',
          message: `read ${String(entriesRead)} of ${String(check.performerFollowingCount)} following entries`,
        },
        answer.cost,
      )
    : answer;
};

export const rejectShortList = <K extends CheckKind>(
  check: CheckOf<K>,
  answer: Answer<K>,
): Answer<K> => shortened(check, answer) as Answer<K>;
