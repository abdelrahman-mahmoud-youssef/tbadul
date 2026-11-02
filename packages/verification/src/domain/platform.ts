export const platforms = ['tiktok'] as const;

export type Platform = (typeof platforms)[number];

export const samePlatform = (a: Platform, b: Platform): boolean => Object.is(a, b);
