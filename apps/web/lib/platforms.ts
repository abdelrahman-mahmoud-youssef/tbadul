import { platform, type Platform } from '@engagement-exchange/contracts';

export const livePlatforms: readonly Platform[] = platform.options;

export const upcomingPlatforms = ['instagram', 'youtube', 'x'] as const;

export type UpcomingPlatform = (typeof upcomingPlatforms)[number];

export type PlatformId = Platform | UpcomingPlatform;

export const platformFrom = (value: string | string[] | undefined): Platform => {
  const parsed = platform.safeParse(value);
  return parsed.success ? parsed.data : (livePlatforms[0] ?? 'tiktok');
};
