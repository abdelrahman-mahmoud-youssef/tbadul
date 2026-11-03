import type { AccountId } from '../domain/account-id.ts';
import { failed, type Answer } from '../domain/answer.ts';
import type { ProfileEvidence } from '../domain/evidence.ts';
import type { Handle } from '../domain/handle.ts';
import type { Cost, SourceError } from '../domain/outcome.ts';
import type { Result } from '../domain/result.ts';
import type { CallContext } from '../ports/verification-source.ts';

interface ListPage<T> {
  readonly items: readonly T[];
  readonly next?: string;
}

export type PageRead<T> =
  Result<ListPage<T>, SourceError> | { readonly outcome: 'private' | 'not_found' };

export const requests = (amount: number): Cost => ({ unit: 'request', amount });

export const scanList = async <T>(
  context: CallContext,
  readPage: (cursor: string | undefined) => Promise<PageRead<T>>,
  matches: (item: T) => boolean,
  costBefore: number,
): Promise<Answer<'follows'>> => {
  let cursor: string | undefined;
  for (let page = 1; page <= context.pageCap; page += 1) {
    const cost = requests(costBefore + page);
    const read = await readPage(cursor);
    if ('outcome' in read) return { outcome: read.outcome, cost };
    if (!read.ok) return failed(read.error, cost);
    if (read.value.items.some(matches)) {
      return { outcome: 'verified', evidence: { pagesRead: page, listExhausted: false }, cost };
    }
    if (read.value.next === undefined) {
      return { outcome: 'not_following', evidence: { pagesRead: page, listExhausted: true }, cost };
    }
    cursor = read.value.next;
  }
  return {
    outcome: 'not_following',
    evidence: { pagesRead: context.pageCap, listExhausted: false },
    cost: requests(costBefore + context.pageCap),
  };
};

export const withPerformer = async <K extends 'follows' | 'liked'>(
  check: { readonly performer: Handle; readonly performerId?: AccountId },
  readProfile: (performer: Handle) => Promise<Answer<'profile'>>,
  visible: (evidence: ProfileEvidence) => boolean,
  scan: (secUid: string, costBefore: number) => Promise<Answer<K>>,
): Promise<Answer<K>> => {
  if (check.performerId !== undefined) return scan(check.performerId.value, 0);

  const profile = await readProfile(check.performer);
  switch (profile.outcome) {
    case 'verified':
      if (!visible(profile.evidence)) return { outcome: 'private', cost: profile.cost };
      return scan(profile.evidence.accountId.value, profile.cost.amount);
    case 'not_following':
      return failed({ kind: 'unexpected', message: 'profile read answered not_following' });
    case 'private':
    case 'not_found':
      return { outcome: profile.outcome, cost: profile.cost };
    case 'source_error':
      return profile;
  }
};
