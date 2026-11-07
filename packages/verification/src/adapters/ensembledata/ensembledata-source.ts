import type { z } from 'zod';
import { accountId, type AccountId } from '../../domain/account-id.ts';
import { failed, type Answer } from '../../domain/answer.ts';
import type { FollowsAnswer } from '../../domain/follows-batch.ts';
import type { Handle } from '../../domain/handle.ts';
import type { Cost, SourceError } from '../../domain/outcome.ts';
import { err, ok, type Result } from '../../domain/result.ts';
import type { VerificationSource } from '../../ports/verification-source.ts';
import { defineSource } from '../define-source.ts';
import { scanFollowing, scanLiked, withPerformer, type PageRead } from '../list-scan.ts';
import {
  ensembledataClient,
  type EnsembledataClient,
  type EnsembledataDeps,
  type EnsembledataRead,
} from './ensembledata-client.ts';
import {
  followingsSchema,
  likedPostsSchema,
  userInfoSchema,
  userPostsSchema,
  type Followings,
  type LikedPosts,
} from './ensembledata-schemas.ts';

const renamedPerformer: SourceError = {
  kind: 'identity_conflict',
  message: "the performer's handle now names another account than its account id",
};

interface FollowingsCursor {
  readonly cursor: string;
  readonly pageToken: string;
}

interface Meter {
  read<T>(
    path: string,
    query: Readonly<Record<string, string>>,
    schema: z.ZodType<T>,
    signal: AbortSignal,
  ): Promise<Result<EnsembledataRead<T>, SourceError>>;
  readonly cost: () => Cost;
}

const meter = (client: EnsembledataClient): Meter => {
  let unitsCharged = 0;
  return {
    read: async (path, query, schema, signal) => {
      const reply = await client.read(path, query, schema, signal);
      unitsCharged += reply.unitsCharged;
      return reply.read;
    },
    cost: () => ({ unit: 'units', amount: unitsCharged }),
  };
};

const readProfile = async (
  units: Meter,
  handle: Handle,
  signal: AbortSignal,
  latestPost = false,
): Promise<Answer<'profile'>> => {
  const reply = await units.read(
    '/tt/user/info',
    { username: handle.value },
    userInfoSchema,
    signal,
  );
  if (!reply.ok) return failed(reply.error, units.cost());
  if ('outcome' in reply.value) return { outcome: reply.value.outcome, cost: units.cost() };
  const { data } = reply.value.body;
  if (data === null) return { outcome: 'not_found', cost: units.cost() };
  const { user, stats } = data;
  const latestPostAt =
    latestPost && !user.privateAccount
      ? await readLatestPost(units, user.secUid, signal)
      : undefined;
  return {
    outcome: 'verified',
    evidence: {
      accountId: accountId(handle.platform, user.secUid, user.id),
      bio: user.signature,
      isPrivate: user.privateAccount,
      ...(user.openFavorite !== undefined && { likesVisible: user.openFavorite }),
      ...(stats && {
        followerCount: stats.followerCount,
        followingCount: stats.followingCount,
        videoCount: stats.videoCount,
      }),
      ...(user.avatarThumb !== undefined && { avatarUrl: user.avatarThumb.split('?')[0] }),
      ...(latestPostAt !== undefined && { latestPostAt }),
    },
    cost: units.cost(),
  };
};

const readLatestPost = async (
  units: Meter,
  secUid: string,
  signal: AbortSignal,
): Promise<number | undefined> => {
  const reply = await units.read(
    '/tt/user/posts-from-secuid',
    { secUid, depth: '1' },
    userPostsSchema,
    signal,
  );
  if (!reply.ok || 'outcome' in reply.value) return undefined;
  const times = reply.value.body.data
    .filter((post) => post.is_top !== 1)
    .map((post) => post.create_time * 1000);
  return times.length === 0 ? undefined : Math.max(...times);
};

const followingsPage = (
  page: Followings,
): PageRead<{ sec_uid: string; uid: string }, FollowingsCursor> => {
  if (page.data === null) return { outcome: 'private' };
  const { followings, nextCursor, nextPageToken } = page.data;
  if (nextCursor === undefined && nextPageToken === undefined) return ok({ items: followings });
  if (nextCursor === undefined || nextPageToken === undefined) {
    return err({
      kind: 'parse',
      message: 'ensembledata followings page carries only one of nextCursor and nextPageToken',
    });
  }
  return ok({ items: followings, next: { cursor: nextCursor, pageToken: nextPageToken } });
};

const likedPostsPage = (page: LikedPosts): PageRead<{ aweme_id: string }> => {
  if ('info' in page.data) return { outcome: 'private' };
  const { liked_posts, nextCursor } = page.data;
  return ok({ items: liked_posts, ...(nextCursor !== undefined && { next: nextCursor }) });
};

interface ListEndpoint<S, T, C> {
  readonly path: string;
  readonly query: (cursor: C | undefined) => Readonly<Record<string, string>>;
  readonly schema: z.ZodType<S>;
  readonly read: (page: S) => PageRead<T, C>;
}

const pageReader =
  <S, T, C>(units: Meter, signal: AbortSignal, endpoint: ListEndpoint<S, T, C>) =>
  async (cursor: C | undefined): Promise<PageRead<T, C>> => {
    const reply = await units.read(endpoint.path, endpoint.query(cursor), endpoint.schema, signal);
    if (!reply.ok) return reply;
    return 'outcome' in reply.value
      ? { outcome: reply.value.outcome }
      : endpoint.read(reply.value.body);
  };

export const ensembledataSource = (deps: EnsembledataDeps): VerificationSource => {
  const client = ensembledataClient(deps);
  return defineSource(
    { name: 'ensemble', platform: 'tiktok' },
    {
      profile: (check, context) =>
        readProfile(meter(client), check.subject, context.signal, check.latestPost === true),
      follows: (check, context) => {
        const units = meter(client);
        const { performerId, ...rest } = check;
        return withPerformer(
          performerId?.numericId === undefined ? rest : check,
          (performer) => readProfile(units, performer, context.signal),
          () => true,
          (performer: AccountId): Promise<FollowsAnswer> =>
            performerId !== undefined && performer.value !== performerId.value
              ? Promise.resolve(failed(renamedPerformer, units.cost()))
              : scanFollowing(
                  context,
                  pageReader(units, context.signal, {
                    path: '/tt/user/followings',
                    query: (cursor: FollowingsCursor | undefined) => ({
                      id: performer.numericId ?? '',
                      secUid: performer.value,
                      ...(cursor && { cursor: cursor.cursor, page_token: cursor.pageToken }),
                    }),
                    schema: followingsSchema,
                    read: followingsPage,
                  }),
                  check.targets,
                  (entry) => ({ value: entry.sec_uid, numericId: entry.uid }),
                  units.cost,
                ),
        );
      },
      liked: (check, context) => {
        const units = meter(client);
        return withPerformer(
          check,
          (performer) => readProfile(units, performer, context.signal),
          (evidence) => evidence.likesVisible !== false,
          (performer) =>
            scanLiked(
              context,
              pageReader(units, context.signal, {
                path: '/tt/user/liked-posts',
                query: (cursor: string | undefined) => ({
                  secUid: performer.value,
                  ...(cursor !== undefined && { cursor }),
                }),
                schema: likedPostsSchema,
                read: likedPostsPage,
              }),
              check.content,
              (post) => post.aweme_id,
              units.cost,
            ),
        );
      },
    },
  );
};
