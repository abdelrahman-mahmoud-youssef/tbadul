import { failed, type Answer } from '../domain/answer.ts';
import type { Cost, SourceError } from '../domain/outcome.ts';
import type { Result } from '../domain/result.ts';
import type { CallContext } from '../ports/verification-source.ts';

export interface ListPage<T> {
  readonly items: readonly T[];
  readonly next?: string;
}

export type PageRead<T> = Result<ListPage<T>, SourceError> | { readonly hidden: true };

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
    const outcome = await readPage(cursor);
    if ('hidden' in outcome) return { outcome: 'private', cost };
    if (!outcome.ok) return failed(outcome.error, cost);
    if (outcome.value.items.some(matches)) {
      return { outcome: 'verified', evidence: { pagesRead: page, listExhausted: false }, cost };
    }
    if (outcome.value.next === undefined) {
      return { outcome: 'not_following', evidence: { pagesRead: page, listExhausted: true }, cost };
    }
    cursor = outcome.value.next;
  }
  return {
    outcome: 'not_following',
    evidence: { pagesRead: context.pageCap, listExhausted: false },
    cost: requests(costBefore + context.pageCap),
  };
};
