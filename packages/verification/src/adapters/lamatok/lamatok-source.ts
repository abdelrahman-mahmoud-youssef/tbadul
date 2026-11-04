import type { z } from 'zod';
import { accountId } from '../../domain/account-id.ts';
import { failed, type Answer } from '../../domain/answer.ts';
import type { Handle } from '../../domain/handle.ts';
import type { SourceError } from '../../domain/outcome.ts';
import { err, ok } from '../../domain/result.ts';
import type { CallContext, VerificationSource } from '../../ports/verification-source.ts';
import { defineSource } from '../define-source.ts';
import { perRequest, requests, scanList, withPerformer, type PageRead } from '../list-scan.ts';
import { lamatokClient, type LamatokClient, type LamatokDeps } from './lamatok-client.ts';
import {
  followingPageSchema,
  likesPageSchema,
  userSchema,
  type FollowingPage,
  type LikesPage,
} from './lamatok-schemas.ts';

const pageSize = '30';
const listHidden = 10222;

const unknownStatus = (providerStatus: number): SourceError => ({
  kind: 'unknown_status',
  message: `lamatok statusCode ${providerStatus}`,
  providerStatus,
});

const missing = (field: string): SourceError => ({
  kind: 'parse',
  message: `lamatok ${field} missing`,
});

const readProfile = async (
  client: LamatokClient,
  handle: Handle,
  context: CallContext,
): Promise<Answer<'profile'>> => {
  const reply = await client.read(
    '/v1/user/by/username',
    { username: handle.value },
    userSchema,
    context.signal,
  );
  if (!reply.ok) return failed(reply.error, requests(1));
  if (!reply.value.found) return { outcome: 'not_found', cost: requests(1) };
  const { user, stats } = reply.value.body.userInfo;
  return {
    outcome: 'verified',
    evidence: {
      accountId: accountId(handle.platform, user.secUid),
      bio: user.signature,
      isPrivate: user.privateAccount,
      ...(user.followingVisibility !== undefined && {
        followingVisible: user.followingVisibility === 1,
      }),
      ...(user.openFavorite !== undefined && { likesVisible: user.openFavorite }),
      ...(stats && { followerCount: stats.followerCount, videoCount: stats.videoCount }),
      ...(stats?.followingCount !== undefined && { followingCount: stats.followingCount }),
      ...(user.avatarThumb !== undefined && { avatarUrl: user.avatarThumb.split('?')[0] }),
      ...(user.createTime !== undefined && { createdAt: user.createTime * 1000 }),
    },
    cost: requests(1),
  };
};

const followingPage = (page: FollowingPage): PageRead<{ user: { secUid: string } }> => {
  if (page.statusCode === listHidden) return { outcome: 'private' };
  if (page.statusCode !== 0) return err(unknownStatus(page.statusCode));
  if (page.userList === undefined) return err(missing('userList'));
  if (page.next_page_id === undefined) return err(missing('next_page_id'));
  return ok({
    items: page.userList,
    ...(page.next_page_id !== null && page.next_page_id !== '' && { next: page.next_page_id }),
  });
};

const likesPage = (page: LikesPage): PageRead<{ id: string }> => {
  if (page.statusCode !== 0) return err(unknownStatus(page.statusCode));
  if (page.itemList === undefined) {
    return page.hasMore === true ? { outcome: 'private' } : err(missing('itemList'));
  }
  if (page.hasMore === undefined) return err(missing('hasMore'));
  if (!page.hasMore) return ok({ items: page.itemList });
  if (page.cursor === undefined) return err(missing('cursor'));
  return ok({ items: page.itemList, next: page.cursor });
};

interface ListEndpoint<S, T> {
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly cursorParam: string;
  readonly schema: z.ZodType<S>;
  readonly read: (page: S) => PageRead<T>;
}

const pageReader =
  <S, T>(client: LamatokClient, signal: AbortSignal, endpoint: ListEndpoint<S, T>) =>
  async (cursor: string | undefined): Promise<PageRead<T>> => {
    const reply = await client.read(
      endpoint.path,
      {
        ...endpoint.query,
        count: pageSize,
        ...(cursor !== undefined && { [endpoint.cursorParam]: cursor }),
      },
      endpoint.schema,
      signal,
    );
    if (!reply.ok) return reply;
    return reply.value.found ? endpoint.read(reply.value.body) : { outcome: 'not_found' };
  };

export const lamatokSource = (deps: LamatokDeps): VerificationSource => {
  const client = lamatokClient(deps);
  return defineSource(
    { name: 'lamatok', platform: 'tiktok' },
    {
      profile: (check, context) => readProfile(client, check.subject, context),
      follows: (check, context) =>
        scanList(
          context,
          pageReader(client, context.signal, {
            ...(check.performerId === undefined
              ? {
                  path: '/v1/user/following/by/username',
                  query: { username: check.performer.value },
                }
              : {
                  path: '/v1/user/following/by/secUid',
                  query: { secUid: check.performerId.value },
                }),
            cursorParam: 'page_id',
            schema: followingPageSchema,
            read: followingPage,
          }),
          (entry) => entry.user.secUid === check.targetId.value,
          perRequest(0),
        ),
      liked: (check, context) =>
        withPerformer(
          check,
          (performer) => readProfile(client, performer, context),
          (evidence) => evidence.likesVisible !== false,
          (secUid, costBefore) =>
            scanList(
              context,
              pageReader(client, context.signal, {
                path: '/v2/user/likes/by/secUid',
                query: { secUid },
                cursorParam: 'cursor',
                schema: likesPageSchema,
                read: likesPage,
              }),
              (item) => item.id === check.content.value,
              perRequest(costBefore),
            ),
        ),
    },
  );
};
