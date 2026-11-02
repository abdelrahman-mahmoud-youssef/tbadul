import type { Branded } from './brand.ts';
import type { Platform } from './platform.ts';
import type { PlatformScoped } from './platform-scoped.ts';

export type AccountId = Branded<PlatformScoped, 'AccountId'>;

export const accountId = (platform: Platform, value: string): AccountId =>
  ({ platform, value }) as AccountId;
