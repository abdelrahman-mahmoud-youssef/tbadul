import { z } from 'zod';
import type { PlatformRules } from './rules.ts';

const profileUrl = /^(?:https?:\/\/)?(?:[\w-]+\.)*tiktok\.com\/@?([^/?#]+)/i;
const videoUrl = /tiktok\.com\/(?:@[^/]+\/)?video\/(\d+)/i;
const shortLink = /(?:^|\/\/)(?:vm|vt)\.tiktok\.com\/|tiktok\.com\/t\//i;

const handleFrom = (raw: string): string =>
  (profileUrl.exec(raw)?.[1] ?? raw).replace(/^@/, '').toLowerCase();

const contentIdFrom = (raw: string, ctx: z.RefinementCtx): string => {
  if (shortLink.test(raw)) {
    ctx.addIssue({ code: 'custom', message: 'short_link_unsupported' });
    return z.NEVER;
  }
  return videoUrl.exec(raw)?.[1] ?? raw;
};

export const tiktok: PlatformRules = {
  handle: z
    .string()
    .trim()
    .transform(handleFrom)
    .pipe(
      z
        .string()
        .min(1, { error: 'empty', abort: true })
        .max(24, 'too_long')
        .regex(/^[a-z0-9_.]+$/, 'characters'),
    ),
  contentId: z
    .string()
    .trim()
    .transform(contentIdFrom)
    .pipe(z.string().regex(/^\d+$/, 'not_numeric')),
};
