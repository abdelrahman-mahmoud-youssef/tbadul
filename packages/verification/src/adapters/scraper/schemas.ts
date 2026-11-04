import { z } from 'zod';

export const followingListSchema = z.object({
  statusCode: z.number().int(),
  userList: z.array(z.object({ user: z.object({ secUid: z.string() }) })).optional(),
  minCursor: z.coerce.string().optional(),
  hasMore: z.boolean().optional(),
});

export const likedListSchema = z.object({
  statusCode: z.number().int(),
  itemList: z.array(z.object({ id: z.string() })).optional(),
  cursor: z.coerce.string().optional(),
  hasMore: z.boolean().optional(),
});

export type FollowingList = z.infer<typeof followingListSchema>;
export type LikedList = z.infer<typeof likedListSchema>;
