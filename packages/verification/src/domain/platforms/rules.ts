import type { z } from 'zod';
import type { Platform } from '../platform.ts';
import { tiktok } from './tiktok.ts';

export interface PlatformRules {
  readonly handle: z.ZodType<string, string>;
  readonly contentId: z.ZodType<string, string>;
}

export const rulesFor: Readonly<Record<Platform, PlatformRules>> = { tiktok };
