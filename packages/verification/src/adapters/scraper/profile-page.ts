import { z } from 'zod';
import type { SourceError } from '../../domain/outcome.ts';
import { err, ok, type Result } from '../../domain/result.ts';

const scriptId = '__UNIVERSAL_DATA_FOR_REHYDRATION__';

const count = z.coerce.number().int().nonnegative();

export const userDetailSchema = z.object({
  statusCode: z.number().int(),
  userInfo: z
    .object({
      user: z.object({
        id: z.string(),
        secUid: z.string(),
        uniqueId: z.string(),
        signature: z.string(),
        privateAccount: z.boolean(),
        followingVisibility: z.number().int().optional(),
        openFavorite: z.boolean().optional(),
        createTime: z.number().int().optional(),
        avatarThumb: z.string().optional(),
      }),
      statsV2: z
        .object({ followerCount: count, followingCount: count.optional(), videoCount: count })
        .optional(),
    })
    .optional(),
});

export type UserDetail = z.infer<typeof userDetailSchema>;

const pageSchema = z.object({
  __DEFAULT_SCOPE__: z.object({ 'webapp.user-detail': userDetailSchema }),
});

export const extractUserDetail = (html: string): Result<UserDetail, SourceError> => {
  const marker = html.indexOf(`id="${scriptId}"`);
  if (marker === -1) {
    return err({ kind: 'blocked', message: 'profile page carries no rehydration data' });
  }
  const start = html.indexOf('>', marker) + 1;
  const end = html.indexOf('</script>', start);
  try {
    const parsed = pageSchema.safeParse(JSON.parse(html.slice(start, end)));
    return parsed.success
      ? ok(parsed.data.__DEFAULT_SCOPE__['webapp.user-detail'])
      : err({
          kind: 'parse',
          message: parsed.error.issues.map((i) => i.path.join('.')).join('; '),
        });
  } catch (error) {
    return err({ kind: 'parse', message: error instanceof Error ? error.message : String(error) });
  }
};
