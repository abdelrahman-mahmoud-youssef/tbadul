import { failed } from '../../domain/answer.ts';
import type { SourceError } from '../../domain/outcome.ts';
import type { VerificationSource } from '../../ports/verification-source.ts';
import { defineSource } from '../define-source.ts';
import { perRequest, scanFollowing } from '../list-scan.ts';
import {
  appFollowingPage,
  appFollowingPageSchema,
  listedAccount,
} from '../rapidapi/app-following-page.ts';
import { rapidApiClient, type RapidApiDeps } from '../rapidapi/rapidapi-client.ts';

const pageSize = '100';

const readsByIdsOnly: SourceError = {
  kind: 'unsupported',
  message: 'scraptik reads following lists by the performer secUid and numeric id',
};

export const scraptikSource = (deps: RapidApiDeps): VerificationSource => {
  const client = rapidApiClient(deps, 'scraptik.p.rapidapi.com');
  const followingPage = appFollowingPage('scraptik');
  return defineSource(
    { name: 'scraptik', platform: 'tiktok' },
    {
      follows: async (check, context) => {
        const performer = check.performerId;
        if (performer?.numericId === undefined) return failed(readsByIdsOnly);
        const { value: secUid, numericId: uid } = performer;
        return scanFollowing(
          context,
          async (cursor: string | undefined) => {
            const page = await client.get(
              '/list-following',
              {
                user_id: uid,
                sec_user_id: secUid,
                count: pageSize,
                ...(cursor !== undefined && { max_time: cursor }),
              },
              appFollowingPageSchema,
              context.signal,
            );
            return page.ok ? followingPage(page.value) : page;
          },
          check.targets,
          listedAccount,
          perRequest(0),
        );
      },
    },
  );
};
