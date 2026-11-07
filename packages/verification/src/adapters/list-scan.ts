import {
  matchAccount,
  type AccountId,
  type AccountMatch,
  type ListedAccount,
} from '../domain/account-id.ts';
import { failed, type Answer, type ListUnread } from '../domain/answer.ts';
import type { ContentId } from '../domain/content-id.ts';
import type { ProfileEvidence } from '../domain/evidence.ts';
import type { FollowsRead, FollowsTarget } from '../domain/follows-batch.ts';
import type { Handle } from '../domain/handle.ts';
import type { Cost, SourceError } from '../domain/outcome.ts';
import type { Result } from '../domain/result.ts';
import type { CallContext } from '../ports/verification-source.ts';

interface ListPage<T, C> {
  readonly items: readonly T[];
  readonly next?: C;
}

export type PageRead<T, C = string> =
  Result<ListPage<T, C>, SourceError> | { readonly outcome: 'private' | 'not_found' };

type ListAnswer = Answer<'follows'>;

interface ListScan<T> {
  readonly items: readonly T[];
  readonly answerAt: (index: number) => ListAnswer;
}

export const requests = (amount: number): Cost => ({ unit: 'request', amount });

export const perRequest =
  (costBefore: number) =>
  (pagesRead: number): Cost =>
    requests(costBefore + pagesRead);

const unmatchable: Record<'conflict' | 'unknown', SourceError> = {
  conflict: {
    kind: 'identity_conflict',
    message: 'a list entry agrees with the target on one id and differs on another',
  },
  unknown: {
    kind: 'unsupported',
    message: 'a list entry carries no id the target is known by',
  },
};

const settlePage = (matches: readonly AccountMatch[]): AccountMatch => {
  if (matches.includes('same')) return 'same';
  if (matches.includes('conflict')) return 'conflict';
  if (matches.includes('unknown')) return 'unknown';
  return 'other';
};

const scanList = async <T, W, C>(
  context: CallContext,
  readPage: (cursor: C | undefined) => Promise<PageRead<T, C>>,
  wanted: readonly W[],
  match: (item: T, wanted: W) => AccountMatch,
  costOf: (pagesRead: number) => Cost,
): Promise<ListScan<T>> => {
  const items: T[] = [];
  const resolved = new Map<number, (cost: Cost) => ListAnswer>();
  const scanned = (pagesRead: number, rest: (cost: Cost) => ListAnswer): ListScan<T> => ({
    items,
    answerAt: (index) => (resolved.get(index) ?? rest)(costOf(pagesRead)),
  });
  const stopped =
    (pagesRead: number, listExhausted: boolean) =>
    (cost: Cost): ListAnswer => ({
      outcome: 'not_following',
      evidence: { pagesRead, listExhausted, entriesRead: items.length },
      cost,
    });
  let cursor: C | undefined;
  for (let page = 1; page <= context.pageCap; page += 1) {
    const read = await readPage(cursor);
    if ('outcome' in read) return scanned(page, (cost) => ({ outcome: read.outcome, cost }));
    if (!read.ok) return scanned(page, (cost) => failed(read.error, cost));
    items.push(...read.value.items);
    const entriesRead = items.length;
    wanted.forEach((sought, index) => {
      if (resolved.has(index)) return;
      const settled = settlePage(read.value.items.map((item) => match(item, sought)));
      if (settled === 'same') {
        const evidence = { pagesRead: page, listExhausted: false, entriesRead };
        resolved.set(index, (cost) => ({ outcome: 'verified', evidence, cost }));
      } else if (settled !== 'other') {
        resolved.set(index, (cost) => failed(unmatchable[settled], cost));
      }
    });
    if (resolved.size === wanted.length) return scanned(page, stopped(page, false));
    if (read.value.next === undefined) return scanned(page, stopped(page, true));
    cursor = read.value.next;
  }
  return scanned(context.pageCap, stopped(context.pageCap, false));
};

export const scanFollowing = async <T, C = string>(
  context: CallContext,
  readPage: (cursor: C | undefined) => Promise<PageRead<T, C>>,
  targets: readonly FollowsTarget[],
  toListed: (item: T) => ListedAccount,
  costOf: (pagesRead: number) => Cost,
): Promise<FollowsRead> => {
  const scan = await scanList(
    context,
    readPage,
    targets,
    (item, { targetId }) => matchAccount(targetId, toListed(item)),
    costOf,
  );
  return {
    answers: targets.map((_, index) => scan.answerAt(index)),
    listed: scan.items.map(toListed),
  };
};

export const scanLiked = async <T, C = string>(
  context: CallContext,
  readPage: (cursor: C | undefined) => Promise<PageRead<T, C>>,
  content: ContentId,
  idOf: (item: T) => string,
  costOf: (pagesRead: number) => Cost,
): Promise<Answer<'liked'>> => {
  const scan = await scanList(
    context,
    readPage,
    [content],
    (item, sought) => (idOf(item) === sought.value ? 'same' : 'other'),
    costOf,
  );
  return scan.answerAt(0);
};

export const withPerformer = async <R>(
  check: { readonly performer: Handle; readonly performerId?: AccountId },
  readProfile: (performer: Handle) => Promise<Answer<'profile'>>,
  visible: (evidence: ProfileEvidence) => boolean,
  scan: (performer: AccountId, costBefore: number) => Promise<R>,
): Promise<R | ListUnread> => {
  if (check.performerId !== undefined) return scan(check.performerId, 0);

  const profile = await readProfile(check.performer);
  switch (profile.outcome) {
    case 'verified':
      if (!visible(profile.evidence)) return { outcome: 'private', cost: profile.cost };
      return scan(profile.evidence.accountId, profile.cost.amount);
    case 'not_following':
      return failed({ kind: 'unexpected', message: 'profile read answered not_following' });
    case 'private':
    case 'not_found':
      return { outcome: profile.outcome, cost: profile.cost };
    case 'source_error':
      return profile;
  }
};
