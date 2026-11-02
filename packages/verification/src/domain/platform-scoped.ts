import type { Platform } from './platform.ts';

export interface PlatformScoped {
  readonly platform: Platform;
  readonly value: string;
}

export const identityKey = (scoped: PlatformScoped): string => `${scoped.platform}:${scoped.value}`;

export const sameIdentity = (a: PlatformScoped, b: PlatformScoped): boolean =>
  identityKey(a) === identityKey(b);
