import { z } from 'zod';

const pageToken = z.union([z.string(), z.number()]).transform(String);

export const balanceSchema = z.object({ requests: z.number() });

export const errorBodySchema = z.object({ exc_type: z.string().optional() });

export const userSchema = z.object({
  userInfo: z.object({
    user: z.object({
      secUid: z.string(),
      signature: z.string(),
      privateAccount: z.boolean(),
      followingVisibility: z.number().int().optional(),
      openFavorite: z.boolean().optional(),
      avatarThumb: z.string().optional(),
      createTime: z.number().int().optional(),
    }),
    stats: z
      .object({
        followerCount: z.number().int(),
        followingCount: z.number().int().optional(),
        videoCount: z.number().int(),
      })
      .optional(),
  }),
});

export const followingPageSchema = z.object({
  statusCode: z.number().int(),
  userList: z.array(z.object({ user: z.object({ uniqueId: z.string() }) })).optional(),
  next_page_id: pageToken.nullable().optional(),
});

export const likesPageSchema = z.object({
  statusCode: z.number().int(),
  itemList: z.array(z.object({ id: z.string() })).optional(),
  hasMore: z.boolean().optional(),
  cursor: pageToken.optional(),
});

export type FollowingPage = z.infer<typeof followingPageSchema>;
export type LikesPage = z.infer<typeof likesPageSchema>;
