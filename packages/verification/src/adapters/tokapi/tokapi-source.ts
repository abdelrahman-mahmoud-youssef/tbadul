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

const readsByIdOnly: SourceError = {
  kind: 'unsupported',
  message: 'tokapi reads following lists by the performer secUid',
};

export const tokapiSource = (deps: RapidApiDeps): VerificationSource => {
  const client = rapidApiClient(deps, 'tokapi-mobile-version.p.rapidapi.com');
  const followingPage = appFollowingPage('tokapi');
  return defineSource(
    { name: 'tokapi', platform: 'tiktok' },
    {
      follows: async (check, context) => {
        const performer = check.performerId;
        if (performer === undefined) return failed(readsByIdOnly);
        return scanFollowing(
          context,
          async (cursor: string | undefined) => {
            const page = await client.get(
              `/v1/user/${encodeURIComponent(performer.value)}/followings`,
              { count: pageSize, ...(cursor !== undefined && { offset: cursor }) },
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
