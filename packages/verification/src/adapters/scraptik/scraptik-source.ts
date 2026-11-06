import { matchAccount } from '../../domain/account-id.ts';
import { failed } from '../../domain/answer.ts';
import type { SourceError } from '../../domain/outcome.ts';
import { err, ok } from '../../domain/result.ts';
import type { VerificationSource } from '../../ports/verification-source.ts';
import { defineSource } from '../define-source.ts';
import { perRequest, scanList, type PageRead } from '../list-scan.ts';
import { scraptikClient, type ScraptikDeps } from './scraptik-client.ts';
import type { FollowingEntry, FollowingPage } from './scraptik-schemas.ts';

const pageSize = '100';
const listHidden = 3002060;
const userNotFound = 3170;

const readsByIdsOnly: SourceError = {
  kind: 'unsupported',
  message: 'scraptik reads following lists by the performer secUid and numeric id',
};

const unknownStatus = (providerStatus: number): SourceError => ({
  kind: 'unknown_status',
  message: `scraptik status_code ${providerStatus}`,
  providerStatus,
});

const missing = (field: string): SourceError => ({
  kind: 'parse',
  message: `scraptik ${field} missing`,
});

const followingPage = (page: FollowingPage): PageRead<FollowingEntry> => {
  switch (page.status_code) {
    case 0:
      break;
    case listHidden:
      return { outcome: 'private' };
    case userNotFound:
      return { outcome: 'not_found' };
    default:
      return err(unknownStatus(page.status_code));
  }
  if (page.followings === undefined) return err(missing('followings'));
  if (page.has_more === undefined) return err(missing('has_more'));
  if (!page.has_more) return ok({ items: page.followings });
  if (page.min_time === undefined) return err(missing('min_time'));
  return ok({ items: page.followings, next: String(page.min_time) });
};

export const scraptikSource = (deps: ScraptikDeps): VerificationSource => {
  const client = scraptikClient(deps);
  return defineSource(
    { name: 'scraptik', platform: 'tiktok' },
    {
      follows: async (check, context) => {
        const performer = check.performerId;
        if (performer?.numericId === undefined) return failed(readsByIdsOnly);
        const { value: secUid, numericId: uid } = performer;
        return scanList(
          context,
          async (cursor: string | undefined) => {
            const page = await client.listFollowing(
              {
                user_id: uid,
                sec_user_id: secUid,
                count: pageSize,
                ...(cursor !== undefined && { max_time: cursor }),
              },
              context.signal,
            );
            return page.ok ? followingPage(page.value) : page;
          },
          (entry) => matchAccount(check.targetId, { value: entry.sec_uid, numericId: entry.uid }),
          perRequest(0),
        );
      },
    },
  );
};
