import { z } from 'zod';

export const userSchema = z.object({
  status_code: z.number().int(),
  user: z
    .object({
      uid: z.string(),
      sec_uid: z.string(),
      signature: z.string(),
      secret: z.number().int(),
      privacy_setting: z.object({ following_visibility: z.number().int() }).optional(),
      follower_count: z.number().int(),
      following_count: z.number().int(),
      aweme_count: z.number().int(),
      avatar_thumb: z.object({ url_list: z.array(z.string()) }).optional(),
    })
    .optional(),
});

export const unknownUserSchema = z.object({ error: z.literal('Uniq ID is invalid') });

export const postsSchema = z.object({
  status_code: z.number().int(),
  aweme_list: z
    .array(z.object({ create_time: z.number().int(), is_top: z.number().int().optional() }))
    .nullable(),
});
