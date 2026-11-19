import type { z } from 'zod';
import { accountId } from '../../domain/account-id.ts';
import { failed, type Answer } from '../../domain/answer.ts';
import type { Handle } from '../../domain/handle.ts';
import type { SourceError } from '../../domain/outcome.ts';
import { err, ok, type Result } from '../../domain/result.ts';
import type { VerificationSource } from '../../ports/verification-source.ts';
import { defineSource } from '../define-source.ts';
import { decodeJson, failureForStatus, type HttpReply } from '../http/http-client.ts';
import { perRequest, requests, scanFollowing } from '../list-scan.ts';
import {
  appFollowingPage,
  appFollowingPageSchema,
  listedAccount,
  listHidden,
} from '../rapidapi/app-following-page.ts';
import {
  rapidApiClient,
  type RapidApiClient,
  type RapidApiDeps,
} from '../rapidapi/rapidapi-client.ts';
import { postsSchema, unknownUserSchema, userSchema } from './tokapi-schemas.ts';

const pageSize = '100';
const postsRead = '10';
const privateAccount = 2096;
const followingVisibility: Readonly<Record<number, boolean>> = { 1: true, 2: false };

type User = NonNullable<z.infer<typeof userSchema>['user']>;

const readsByIdOnly: SourceError = {
  kind: 'unsupported',
  message: 'tokapi reads following lists by the performer secUid',
};

const userFrom = (reply: HttpReply): Result<User, SourceError> | { outcome: 'not_found' } => {
  if (reply.status === 404 && decodeJson(reply, unknownUserSchema).ok) {
    return { outcome: 'not_found' };
  }
  if (reply.status !== 200) return err(failureForStatus(reply.status));
  const body = decodeJson(reply, userSchema);
  if (!body.ok) return body;
  const { status_code: providerStatus, user } = body.value;
  if (providerStatus !== 0) {
    return err({
      kind: 'unknown_status',
      message: `tokapi status_code ${providerStatus}`,
      providerStatus,
    });
  }
  return user === undefined ? err({ kind: 'parse', message: 'tokapi user missing' }) : ok(user);
};

const readLatestPost = async (
  client: RapidApiClient,
  uid: string,
  signal: AbortSignal,
): Promise<number | undefined> => {
  const posts = await client.get(
    `/v1/post/user/${encodeURIComponent(uid)}/posts`,
    { count: postsRead },
    postsSchema,
    signal,
  );
  if (!posts.ok || posts.value.status_code !== 0) return undefined;
  const times = (posts.value.aweme_list ?? [])
    .filter((post) => post.is_top !== 1)
    .map((post) => post.create_time * 1000);
  return times.length === 0 ? undefined : Math.max(...times);
};

const readProfile = async (
  client: RapidApiClient,
  handle: Handle,
  signal: AbortSignal,
  latestPost: boolean,
): Promise<Answer<'profile'>> => {
  const reply = await client.read('/v1/user/', { username: handle.value }, signal);
  if (!reply.ok) return failed(reply.error, requests(1));
  const read = userFrom(reply.value);
  if ('outcome' in read) return { outcome: read.outcome, cost: requests(1) };
  if (!read.ok) return failed(read.error, requests(1));
  const user = read.value;
  const isPrivate = user.secret === 1;
  const readsPosts = latestPost && !isPrivate;
  const latestPostAt = readsPosts ? await readLatestPost(client, user.uid, signal) : undefined;
  const followingVisible =
    user.privacy_setting === undefined
      ? undefined
      : followingVisibility[user.privacy_setting.following_visibility];
  const [avatar] = user.avatar_thumb?.url_list ?? [];
  return {
    outcome: 'verified',
    evidence: {
      accountId: accountId(handle.platform, user.sec_uid, user.uid),
      bio: user.signature,
      isPrivate,
      ...(followingVisible !== undefined && { followingVisible }),
      followerCount: user.follower_count,
      followingCount: user.following_count,
      videoCount: user.aweme_count,
      ...(avatar !== undefined && { avatarUrl: avatar.split('?')[0] }),
      ...(latestPostAt !== undefined && { latestPostAt }),
    },
    cost: requests(readsPosts ? 2 : 1),
  };
};

export const tokapiSource = (deps: RapidApiDeps): VerificationSource => {
  const client = rapidApiClient(deps, 'tokapi-mobile-version.p.rapidapi.com');
  const followingPage = appFollowingPage('tokapi', [listHidden, privateAccount]);
  return defineSource(
    { name: 'tokapi', platform: 'tiktok' },
    {
      profile: (check, context) =>
        readProfile(client, check.subject, context.signal, check.latestPost === true),
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
