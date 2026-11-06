import { z } from 'zod';

export const followingPageSchema = z.object({
  status_code: z.number().int(),
  followings: z.array(z.object({ uid: z.string(), sec_uid: z.string() })).optional(),
  has_more: z.boolean().optional(),
  min_time: z.number().int().optional(),
});

export type FollowingPage = z.infer<typeof followingPageSchema>;
export type FollowingEntry = NonNullable<FollowingPage['followings']>[number];
