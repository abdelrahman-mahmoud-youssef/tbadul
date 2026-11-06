import { z } from 'zod';

const cursor = z.union([z.string(), z.number()]).transform(String);

const absentWhenNull = <T>(value: T | null | undefined): T | undefined => value ?? undefined;

export const unitsChargedSchema = z.coerce.number().int().nonnegative();

export const usedUnitsSchema = z.object({ data: z.object({ tiktok: z.number() }) });

export const userInfoSchema = z.object({
  data: z
    .object({
      user: z.object({
        id: z.string(),
        secUid: z.string(),
        signature: z.string(),
        privateAccount: z.boolean(),
        openFavorite: z.boolean().optional(),
        avatarThumb: z.string().optional(),
      }),
      stats: z
        .object({
          followerCount: z.number().int(),
          followingCount: z.number().int(),
          videoCount: z.number().int(),
        })
        .optional(),
    })
    .nullable(),
});

export const followingsSchema = z.object({
  data: z
    .object({
      followings: z.array(z.object({ sec_uid: z.string(), uid: z.string() })),
      nextCursor: cursor.nullish().transform(absentWhenNull),
      nextPageToken: z.string().nullish().transform(absentWhenNull),
    })
    .nullable(),
});

export const likedPostsSchema = z.object({
  data: z.union([
    z.object({
      liked_posts: z.array(z.object({ aweme_id: z.string() })),
      nextCursor: cursor.nullish().transform(absentWhenNull),
    }),
    z.object({ info: z.literal('Liked posts not public.') }),
  ]),
});

export type Followings = z.infer<typeof followingsSchema>;
export type LikedPosts = z.infer<typeof likedPostsSchema>;
