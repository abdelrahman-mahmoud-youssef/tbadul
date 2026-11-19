import { z } from 'zod';
import type { ListedAccount } from '../../domain/account-id.ts';
import type { SourceError } from '../../domain/outcome.ts';
import { err, ok } from '../../domain/result.ts';
import type { PageRead } from '../list-scan.ts';

export const appFollowingPageSchema = z.object({
  status_code: z.number().int(),
  followings: z.array(z.object({ uid: z.string(), sec_uid: z.string() })).optional(),
  has_more: z.boolean().optional(),
  min_time: z.number().int().optional(),
});

type AppFollowingPage = z.infer<typeof appFollowingPageSchema>;
export type AppFollowingEntry = NonNullable<AppFollowingPage['followings']>[number];

const listHidden = 3002060;
const userNotFound = 3170;

export const listedAccount = (entry: AppFollowingEntry): ListedAccount => ({
  value: entry.sec_uid,
  numericId: entry.uid,
});

export const appFollowingPage =
  (provider: string) =>
  (page: AppFollowingPage): PageRead<AppFollowingEntry> => {
    const missing = (field: string): SourceError => ({
      kind: 'parse',
      message: `${provider} ${field} missing`,
    });
    switch (page.status_code) {
      case 0:
        break;
      case listHidden:
        return { outcome: 'private' };
      case userNotFound:
        return { outcome: 'not_found' };
      default:
        return err({
          kind: 'unknown_status',
          message: `${provider} status_code ${page.status_code}`,
          providerStatus: page.status_code,
        });
    }
    if (page.followings === undefined) return err(missing('followings'));
    if (page.has_more === undefined) return err(missing('has_more'));
    if (!page.has_more) return ok({ items: page.followings });
    if (page.min_time === undefined) return err(missing('min_time'));
    return ok({ items: page.followings, next: String(page.min_time) });
  };
