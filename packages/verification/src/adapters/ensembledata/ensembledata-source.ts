import type { z } from 'zod';
import { accountId } from '../../domain/account-id.ts';
import { failed, type Answer } from '../../domain/answer.ts';
import type { Handle } from '../../domain/handle.ts';
import type { Cost, SourceError } from '../../domain/outcome.ts';
import { ok, type Result } from '../../domain/result.ts';
import type { VerificationSource } from '../../ports/verification-source.ts';
import { defineSource } from '../define-source.ts';
import { sameValue, scanList, withPerformer, type PageRead } from '../list-scan.ts';
import {
  ensembledataClient,
  type EnsembledataClient,
  type EnsembledataDeps,
  type EnsembledataRead,
} from './ensembledata-client.ts';
import { likedPostsSchema, userInfoSchema, type LikedPosts } from './ensembledata-schemas.ts';

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
    },
    cost: units.cost(),
  };
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
      profile: (check, context) => readProfile(meter(client), check.subject, context.signal),
      follows: () =>
        Promise.resolve(
          failed({
            kind: 'unsupported',
            message: 'ensembledata followings entries carry no account id to match the target by',
          }),
        ),
      liked: (check, context) => {
        const units = meter(client);
        return withPerformer(
          check,
          (performer) => readProfile(units, performer, context.signal),
          (evidence) => evidence.likesVisible !== false,
          (secUid) =>
            scanList(
              context,
              pageReader(units, context.signal, {
                path: '/tt/user/liked-posts',
                query: (cursor: string | undefined) => ({
                  secUid,
                  ...(cursor !== undefined && { cursor }),
                }),
                schema: likedPostsSchema,
                read: likedPostsPage,
              }),
              (post) => sameValue(post.aweme_id, check.content.value),
              units.cost,
            ),
        );
      },
    },
  );
};
