export const platforms = ['tiktok'] as const;

export type Platform = (typeof platforms)[number];
